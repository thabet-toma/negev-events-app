'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { ANALYTICS_EVENT_KEYS, COUNT_ONLY_ANALYTICS_EVENTS } = require('../constants');

/**
 * 90 days identified, then folded into anonymous daily counters (foldOldEvents
 * below) and the identified rows deleted for good. This number is not just
 * housekeeping: under Israeli Privacy Protection Law Amendment 13 the
 * retention period IS the boundary of "necessary for the purpose"
 * (purpose-as-ceiling) — keeping an identified behavioural row longer than
 * the analysis it was collected for actually needs is itself a violation,
 * independent of how well it is secured. The same number is also one of the
 * criteria the law uses to decide whether a controller must appoint a Data
 * Protection Officer, so a shorter window helps on both fronts at once.
 */
const RETENTION_DAYS = 90;

/**
 * Records one analytics event. This is the ONLY place analytics_events is
 * ever written (project rule: all SQL for a feature lives in its service),
 * and it is the structural enforcement point for the governing rule ("we
 * record what a person DID, never what they READ"):
 *
 *   - an event_name outside the closed list (constants.js) is rejected
 *     outright, so a caller can never write an event this platform has not
 *     explicitly decided to collect;
 *   - a count-only event_name NEVER carries identity — user_id and device_id
 *     are forced to NULL here regardless of what the caller passed in, so a
 *     bug upstream (a route that forgets to strip them) can never leak an
 *     identified "this person opened this content" row.
 */
async function record({
  eventName,
  userId = null,
  deviceId = null,
  platform,
  appVersion = null,
  contentTown = null
} = {}) {
  if (!ANALYTICS_EVENT_KEYS.includes(eventName)) {
    throw ApiError.badRequest(`اسم الحدث "${eventName}" غير معروف`);
  }

  const isCountOnly = COUNT_ONLY_ANALYTICS_EVENTS.includes(eventName);
  const finalUserId = isCountOnly ? null : (userId ?? null);
  const finalDeviceId = isCountOnly ? null : (deviceId ?? null);

  // Opt-out is honoured HERE, at the write — not only at the route (issue
  // #44, privacy layer part 2). A signed-in user who has refused behavioural
  // analytics gets NO row at all for an identified event, not an anonymised
  // one: writing a row with user_id stripped would still describe what they
  // did, just without a name attached, which is not what "refuse analytics"
  // promises. Count-only events carry no identity by construction (finalUserId
  // is already null above) and are unaffected — there is no one's row here to
  // opt out of.
  if (!isCountOnly && finalUserId) {
    const user = await db.queryOne('SELECT analytics_opt_out FROM users WHERE id = ?', [finalUserId]);
    if (user && user.analytics_opt_out) {
      return { id: null, skipped: true };
    }
  }

  const { insertId } = await db.execute(
    `INSERT INTO analytics_events (event_name, user_id, device_id, platform, app_version, content_town)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [eventName, finalUserId, finalDeviceId, platform, appVersion ?? null, contentTown ?? null]
  );
  return { id: insertId, skipped: false };
}

/**
 * The route-layer wrapper every SERVER-emitted event (login, register,
 * share_page_viewed, app_download_clicked) must call instead of `record`
 * directly: a failed analytics write must never break the request it
 * accompanies, so this swallows and logs instead of throwing. The
 * client-facing `POST /api/analytics/events` endpoint calls `record`
 * directly — a bad request there (an unknown event_name) must reach the
 * caller as a real 400, not be swallowed.
 */
async function recordSafely(data) {
  try {
    await record(data);
  } catch (err) {
    logger.error(`[analytics] failed to record "${data && data.eventName}" (swallowed):`, err.message);
  }
}

/**
 * Folds every analytics_events row older than the retention window into
 * analytics_daily_counters — grouped by day/event_name/platform/content_town
 * — then deletes the folded source rows. One transaction: a crash midway
 * never leaves counters incremented without their source rows removed
 * (which would double-count on the next run), or the reverse.
 *
 * The window is measured with NOW(), not UTC_TIMESTAMP(): created_at is a
 * TIMESTAMP filled by CURRENT_TIMESTAMP, which reads in the session timezone,
 * and comparing it against a UTC clock would slide the whole retention
 * boundary by the server offset.
 *
 * Idempotent: a second run finds nothing left to fold — the rows a first run
 * already handled are gone — so it changes nothing and returns { folded: 0,
 * deleted: 0 }.
 */
async function foldOldEvents() {
  return db.transaction(async connection => {
    const [groups] = await connection.execute(
      `SELECT DATE(created_at) AS day, event_name, platform,
              COALESCE(content_town, '') AS content_town, COUNT(*) AS cnt
         FROM analytics_events
        WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(created_at), event_name, platform, COALESCE(content_town, '')`,
      [RETENTION_DAYS]
    );

    for (const group of groups) {
      await connection.execute(
        `INSERT INTO analytics_daily_counters (day, event_name, platform, content_town, count)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE count = count + VALUES(count)`,
        [group.day, group.event_name, group.platform, group.content_town, group.cnt]
      );
    }

    const [result] = await connection.execute(
      `DELETE FROM analytics_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [RETENTION_DAYS]
    );

    return { folded: groups.length, deleted: result.affectedRows };
  });
}

/**
 * Total count per event_name — folded daily counters plus whatever has not
 * aged into the fold yet, summed together. For the super-admin dashboard
 * (out of scope for this change, per the #44 brief) — deliberately NOT wired
 * to any route here. Kept minimal on purpose.
 */
async function countsByEventName() {
  const rows = await db.query(
    `SELECT event_name, SUM(cnt) AS total FROM (
       SELECT event_name, COUNT(*) AS cnt FROM analytics_events GROUP BY event_name
       UNION ALL
       SELECT event_name, SUM(count) AS cnt FROM analytics_daily_counters GROUP BY event_name
     ) combined
     GROUP BY event_name
     ORDER BY total DESC`
  );
  return rows.map(row => ({ event_name: row.event_name, total: Number(row.total) }));
}

/**
 * Default and hard-ceiling page sizes for `listForUser` below — the exact
 * same numbers, and the exact same clamp shape, as `listPublicEvents` in
 * events.service.js (DEFAULT_PAGE_SIZE/MAX_PAGE_SIZE). This endpoint does not
 * invent a second pagination idiom next to the one this project already has.
 */
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

/**
 * One user's own recorded analytics rows — issue #44 user story 45 ("كصاحب
 * منتج، أريد أن أفتح مستخدماً بعينه وأرى ما فعله بالتطبيق، كما طلبتُ
 * صراحةً"), which shipped with no implementation at all until now. It is
 * also, as of this function, the ONLY way a super_admin can actually FULFIL
 * a §13 access request sitting in the queue at `GET/PATCH
 * /api/admin/privacy-requests` — before this existed that queue could be
 * closed, but the request behind it could not actually be answered.
 *
 * Deliberately returns only event_name, platform, app_version, content_town
 * and created_at — nothing else:
 *   - no `id` (the row's own primary key) and no `device_id` — story 45 asked
 *     to open a specific USER and see what they did, not to hand back a row
 *     identifier or an unregistered device's fingerprint;
 *   - and, structurally, no event/occasion id of any kind. Issue #44
 *     deliberately narrowed this exact story: "مع هوية: ... بلا هوية (عدّ
 *     فقط): أي حدث يقول أيّ مناسبة بعينها فُتحت." `analytics_events` has no
 *     such column to begin with (schema.sql), this query does not JOIN to
 *     `events`, and content_town + created_at are deliberately NOT combined
 *     to reconstruct which occasion was involved. This function is the
 *     enforcement point for that narrowing, the same way `record()` above is
 *     the enforcement point for the count-only rule at the write.
 *
 * Paged with the exact idiom `listPublicEvents` (events.service.js) already
 * uses for `GET /api/events` — safe-clamped page/limit, LIMIT/OFFSET as bound
 * parameters, `{ page, limit, total, totalPages }` — not a second idiom
 * invented here.
 */
async function listForUser(userId, { page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const { total } = await db.queryOne(
    'SELECT COUNT(*) AS total FROM analytics_events WHERE user_id = ?',
    [userId]
  );

  const rows = await db.query(
    `SELECT event_name, platform, app_version, content_town, created_at
       FROM analytics_events
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [userId, safeLimit, offset]
  );

  return {
    events: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / safeLimit)
    }
  };
}

/**
 * Aggregates high-level analytics for the super-admin activity dashboard:
 * - Views (total vs unique viewers, breakdown)
 * - Shares (total vs unique sharers)
 * - Clicks & interactions (total vs unique clickers, breakdown)
 * - Platforms (web vs mobile)
 * - Audience (total active devices, unregistered vs registered)
 */
async function getAnalyticsOverview({ period = 'all' } = {}) {
  let periodClause = '';
  if (period === 'today') {
    periodClause = ' AND created_at >= CURDATE()';
  } else if (period === '7d') {
    periodClause = ' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
  } else if (period === '30d') {
    periodClause = ' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
  }

  const row = await db.queryOne(
    `SELECT
       COALESCE(SUM(event_name IN ('app_opened', 'event_viewed', 'share_page_viewed')), 0) AS total_views,
       COALESCE(COUNT(DISTINCT CASE WHEN event_name IN ('app_opened', 'event_viewed', 'share_page_viewed') AND viewer_key IS NOT NULL THEN viewer_key END), 0) AS unique_viewers,
       COALESCE(SUM(event_name = 'app_opened'), 0) AS views_app_opened,
       COALESCE(SUM(event_name = 'event_viewed'), 0) AS views_event_viewed,
       COALESCE(SUM(event_name = 'share_page_viewed'), 0) AS views_share_page,

       COALESCE(SUM(event_name = 'share_clicked'), 0) AS total_shares,
       COALESCE(COUNT(DISTINCT CASE WHEN event_name = 'share_clicked' AND viewer_key IS NOT NULL THEN viewer_key END), 0) AS unique_sharers,

       COALESCE(SUM(event_name IN ('location_clicked', 'contact_clicked', 'reminder_clicked', 'app_download_clicked')), 0) AS total_clicks,
       COALESCE(COUNT(DISTINCT CASE WHEN event_name IN ('location_clicked', 'contact_clicked', 'reminder_clicked', 'app_download_clicked') AND viewer_key IS NOT NULL THEN viewer_key END), 0) AS unique_clickers,
       COALESCE(SUM(event_name = 'location_clicked'), 0) AS clicks_location,
       COALESCE(SUM(event_name = 'contact_clicked'), 0) AS clicks_contact,
       COALESCE(SUM(event_name = 'reminder_clicked'), 0) AS clicks_reminder,
       COALESCE(SUM(event_name = 'app_download_clicked'), 0) AS clicks_download,

       COALESCE(SUM(platform = 'web'), 0) AS web_events,
       COALESCE(COUNT(DISTINCT CASE WHEN platform = 'web' AND viewer_key IS NOT NULL THEN viewer_key END), 0) AS web_unique_viewers,

       COALESCE(SUM(platform IN ('android', 'mobile')), 0) AS mobile_events,
       COALESCE(COUNT(DISTINCT CASE WHEN platform IN ('android', 'mobile') AND viewer_key IS NOT NULL THEN viewer_key END), 0) AS mobile_unique_viewers,

       COALESCE(COUNT(DISTINCT viewer_key), 0) AS total_active_devices,
       COALESCE(COUNT(DISTINCT CASE WHEN user_id IS NULL AND device_id IS NOT NULL THEN device_id END), 0) AS unregistered_devices,
       COALESCE(COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END), 0) AS registered_users
     FROM analytics_events
     WHERE 1 = 1 ${periodClause}`
  );

  let foldedViews = 0;
  let foldedShares = 0;
  let foldedClicks = 0;
  let foldedWeb = 0;
  let foldedMobile = 0;

  if (period === 'all') {
    const foldedRows = await db.query(
      `SELECT event_name, platform, SUM(count) AS cnt FROM analytics_daily_counters GROUP BY event_name, platform`
    );
    for (const f of foldedRows) {
      const cnt = Number(f.cnt) || 0;
      if (['app_opened', 'event_viewed', 'share_page_viewed'].includes(f.event_name)) {
        foldedViews += cnt;
      } else if (f.event_name === 'share_clicked') {
        foldedShares += cnt;
      } else if (['location_clicked', 'contact_clicked', 'reminder_clicked', 'app_download_clicked'].includes(f.event_name)) {
        foldedClicks += cnt;
      }
      if (f.platform === 'web') foldedWeb += cnt;
      else if (['android', 'mobile'].includes(f.platform)) foldedMobile += cnt;
    }
  }

  return {
    period,
    views: {
      total: Number(row.total_views) + foldedViews,
      unique: Number(row.unique_viewers),
      breakdown: {
        app_opened: Number(row.views_app_opened),
        event_viewed: Number(row.views_event_viewed),
        share_page_viewed: Number(row.views_share_page)
      }
    },
    shares: {
      total: Number(row.total_shares) + foldedShares,
      unique: Number(row.unique_sharers)
    },
    clicks: {
      total: Number(row.total_clicks) + foldedClicks,
      unique: Number(row.unique_clickers),
      breakdown: {
        location: Number(row.clicks_location),
        contact: Number(row.clicks_contact),
        reminder: Number(row.clicks_reminder),
        download: Number(row.clicks_download)
      }
    },
    platforms: {
      web: {
        total_events: Number(row.web_events) + foldedWeb,
        unique_viewers: Number(row.web_unique_viewers)
      },
      mobile: {
        total_events: Number(row.mobile_events) + foldedMobile,
        unique_viewers: Number(row.mobile_unique_viewers)
      }
    },
    audience: {
      total_active_devices: Number(row.total_active_devices),
      unregistered_devices: Number(row.unregistered_devices),
      registered_users: Number(row.registered_users)
    }
  };
}

/**
 * Lists active devices/tokens for super admin, distinguishing anonymous
 * visitors from registered users.
 */
async function listActiveDevices({ page = 1, limit = DEFAULT_PAGE_SIZE, type = 'all', search = null } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  let whereClause = 'WHERE ae.device_id IS NOT NULL';
  const params = [];

  if (type === 'anonymous') {
    whereClause += ' AND ae.user_id IS NULL';
  } else if (type === 'registered') {
    whereClause += ' AND ae.user_id IS NOT NULL';
  }

  if (search) {
    whereClause += ' AND (ae.device_id LIKE ? OR u.full_name LIKE ? OR u.phone_number LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const totalRow = await db.queryOne(
    `SELECT COUNT(DISTINCT ae.device_id) AS total
       FROM analytics_events ae
       LEFT JOIN users u ON u.id = ae.user_id
       ${whereClause}`,
    params
  );
  const total = Number(totalRow.total);

  const rows = await db.query(
    `SELECT
       ae.device_id,
       MAX(ae.user_id) AS user_id,
       MAX(u.full_name) AS user_name,
       MAX(u.phone_number) AS user_phone,
       MAX(ae.platform) AS platform,
       MAX(ae.app_version) AS app_version,
       MAX(ae.created_at) AS last_seen,
       MIN(ae.created_at) AS first_seen,
       COUNT(*) AS total_events,
       COALESCE(SUM(ae.event_name IN ('app_opened', 'event_viewed', 'share_page_viewed')), 0) AS views_count,
       COALESCE(SUM(ae.event_name = 'share_clicked'), 0) AS shares_count,
       COALESCE(SUM(ae.event_name IN ('location_clicked', 'contact_clicked', 'reminder_clicked', 'app_download_clicked')), 0) AS clicks_count
     FROM analytics_events ae
     LEFT JOIN users u ON u.id = ae.user_id
     ${whereClause}
     GROUP BY ae.device_id
     ORDER BY last_seen DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    devices: rows.map(r => ({
      device_id: r.device_id,
      is_anonymous: !r.user_id,
      user: r.user_id ? { id: r.user_id, full_name: r.user_name, phone_number: r.user_phone } : null,
      platform: r.platform,
      app_version: r.app_version,
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      total_events: Number(r.total_events),
      views_count: Number(r.views_count),
      shares_count: Number(r.shares_count),
      clicks_count: Number(r.clicks_count)
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit)
    }
  };
}

/**
 * Returns paginated events for a specific device_id / token (anonymous or registered).
 */
async function listForDevice(deviceId, { page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const { total } = await db.queryOne(
    'SELECT COUNT(*) AS total FROM analytics_events WHERE device_id = ?',
    [deviceId]
  );

  const rows = await db.query(
    `SELECT event_name, platform, app_version, content_town, created_at
       FROM analytics_events
      WHERE device_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [deviceId, safeLimit, offset]
  );

  const linkedUser = await db.queryOne(
    `SELECT u.id, u.full_name, u.phone_number
       FROM analytics_events ae
       JOIN users u ON u.id = ae.user_id
      WHERE ae.device_id = ?
      LIMIT 1`,
    [deviceId]
  );

  return {
    device_id: deviceId,
    is_anonymous: !linkedUser,
    user: linkedUser || null,
    events: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / safeLimit)
    }
  };
}

module.exports = {
  RETENTION_DAYS,
  record,
  recordSafely,
  foldOldEvents,
  countsByEventName,
  listForUser,
  getAnalyticsOverview,
  listActiveDevices,
  listForDevice
};
