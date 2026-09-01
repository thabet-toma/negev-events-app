'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const { withAbsoluteMedia } = require('../utils/mediaUrl');

/**
 * The four ready-made expiry lengths the admin panel offers (#20 step 8,
 * decision ٤) — a free `expires_at` datetime is also accepted, this list is
 * only ever a shortcut. "24 hours" is a market convention, not a technical
 * one, so it is data here, never hardcoded anywhere else.
 */
const EXPIRY_PRESETS = [
  { key: 'day', label: 'يوم', hours: 24 },
  { key: '3_days', label: '٣ أيام', hours: 24 * 3 },
  { key: 'week', label: 'أسبوع', hours: 24 * 7 },
  { key: 'month', label: 'شهر', hours: 24 * 30 }
];

/** Resolves a preset key to the DATETIME it expires at, counted from now. */
function presetToExpiresAt(presetKey) {
  const preset = EXPIRY_PRESETS.find(p => p.key === presetKey);
  if (!preset) throw ApiError.badRequest('مدة الانتهاء غير معروفة');
  return new Date(Date.now() + preset.hours * 60 * 60 * 1000);
}

/** Today's date as YYYY-MM-DD, in the same UTC the pool is configured for (timezone: 'Z'). */
function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function shapeStory(row) {
  return { ...withAbsoluteMedia(row), isLive: Boolean(row.is_live), is_ad: Boolean(row.is_ad) };
}

/**
 * Active stories only — an expired one drops out of the strip via the query
 * itself, not client-side filtering. Compared against UTC_TIMESTAMP(), not
 * NOW(): the pool is configured with `timezone: 'Z'`, so a JS Date bound as
 * `expires_at` is always serialised as its UTC wall-clock, but NOW() follows
 * the MySQL session/server timezone — which is not guaranteed to be UTC. Two
 * different clocks compared against each other would silently misjudge
 * "expired" whenever the server's timezone isn't UTC.
 */
async function listPublicStories() {
  const rows = await db.query(
    `SELECT * FROM stories WHERE expires_at IS NULL OR expires_at > UTC_TIMESTAMP()
      ORDER BY is_live DESC, id ASC`
  );
  return rows.map(shapeStory);
}

async function getStoryOrThrow(storyId) {
  const story = await db.queryOne('SELECT * FROM stories WHERE id = ?', [storyId]);
  if (!story) throw ApiError.notFound('القصة غير موجودة');
  return story;
}

/**
 * Records one view. "Once per person per story per day" is enforced by the
 * UNIQUE key on story_views (story_id, viewer_key, viewed_on) — a second call
 * today for the same identity is a silent no-op, the same
 * insert-then-catch-duplicate pattern as event_reminders, not a pre-check
 * that a race could slip past.
 */
async function recordView(storyId, { userId = null, deviceId = null }) {
  await getStoryOrThrow(storyId);

  // A registered viewer's town is theirs on file — never guessed, never
  // taken from an anonymous request's currently-selected filter, which
  // reflects browsing intent, not identity (#20 step 8, decision ٦).
  let viewerTown = null;
  if (userId) {
    const user = await db.queryOne('SELECT clan_town FROM users WHERE id = ?', [userId]);
    viewerTown = user ? user.clan_town : null;
  }

  try {
    await db.execute(
      `INSERT INTO story_views (story_id, user_id, device_id, viewer_town, viewed_on)
       VALUES (?, ?, ?, ?, ?)`,
      [storyId, userId, userId ? null : deviceId, viewerTown, todayDateString()]
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  }
}

/** Clicks are never deduplicated — every tap-through is a real advertiser event. */
async function recordClick(storyId, { userId = null, deviceId = null }) {
  await getStoryOrThrow(storyId);
  await db.execute(
    'INSERT INTO story_clicks (story_id, user_id, device_id) VALUES (?, ?, ?)',
    [storyId, userId, userId ? null : deviceId]
  );
}

/** One report per (story, user) — the UNIQUE key rejects a repeat outright. */
async function reportStory(storyId, userId) {
  await getStoryOrThrow(storyId);
  try {
    await db.execute('INSERT INTO story_reports (story_id, user_id) VALUES (?, ?)', [storyId, userId]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw ApiError.conflict('لقد أبلغت عن هذه القصة مسبقاً');
    throw err;
  }
}

/** Every story — live, expired, ad or not — newest first, for the admin panel. */
async function listAllStoriesForAdmin() {
  const rows = await db.query('SELECT * FROM stories ORDER BY id DESC');
  return rows.map(shapeStory);
}

/**
 * The second layer of ad separation (#20 step 8, decision ٣) isn't optional:
 * an ad story with no advertiser name is rejected outright, on both create
 * and update — `isAd`/`advertiserName` are the values the row will actually
 * land on, not just what this one request happened to send.
 */
function assertAdInvariant({ isAd, advertiserName }) {
  if (isAd && !advertiserName) {
    throw ApiError.badRequest('اسم المعلن مطلوب لأي قصة إعلانية');
  }
}

async function assertEventExists(eventId) {
  if (eventId === null || eventId === undefined) return;
  const event = await db.queryOne('SELECT id FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة المرتبطة غير موجودة');
}

async function getAdminStoryById(id) {
  return shapeStory(await db.queryOne('SELECT * FROM stories WHERE id = ?', [id]));
}

async function createStory(data) {
  assertAdInvariant({ isAd: data.is_ad, advertiserName: data.advertiser_name });
  await assertEventExists(data.event_id);

  const { insertId } = await db.execute(
    `INSERT INTO stories
       (title, clan, town, image, is_live, event_id, expires_at, advertiser_name, is_ad, target_url, slide_duration_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title, data.clan, data.town, data.image, data.is_live ? 1 : 0, data.event_id,
      data.expires_at, data.advertiser_name, data.is_ad ? 1 : 0, data.target_url,
      data.slide_duration_seconds || 5
    ]
  );
  return getAdminStoryById(insertId);
}

const UPDATABLE_COLUMNS = [
  'title', 'clan', 'town', 'image', 'is_live', 'event_id',
  'expires_at', 'advertiser_name', 'is_ad', 'target_url', 'slide_duration_seconds'
];
const BOOLEAN_COLUMNS = ['is_live', 'is_ad'];

/** Partial update — only columns present in `data` are written. */
async function updateStory(id, data) {
  const existing = await db.queryOne('SELECT * FROM stories WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('القصة غير موجودة');

  const nextIsAd = data.is_ad !== undefined ? Boolean(data.is_ad) : Boolean(existing.is_ad);
  const nextAdvertiserName = data.advertiser_name !== undefined ? data.advertiser_name : existing.advertiser_name;
  assertAdInvariant({ isAd: nextIsAd, advertiserName: nextAdvertiserName });

  if (data.event_id !== undefined) await assertEventExists(data.event_id);

  const assignments = [];
  const params = [];
  for (const column of UPDATABLE_COLUMNS) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(BOOLEAN_COLUMNS.includes(column) ? (data[column] ? 1 : 0) : data[column]);
  }
  if (!assignments.length) throw ApiError.badRequest('لم يتم إرسال أي تعديل');

  params.push(id);
  await db.execute(`UPDATE stories SET ${assignments.join(', ')} WHERE id = ?`, params);

  return getAdminStoryById(id);
}

async function deleteStory(id) {
  const { affectedRows } = await db.execute('DELETE FROM stories WHERE id = ?', [id]);
  if (!affectedRows) throw ApiError.notFound('القصة غير موجودة');
}

/**
 * Views · distinct viewers · clicks · per-town breakdown — and nothing an
 * auction would need. No CPM, no eCPM, no frequency: there is no auction
 * here, and those numbers would only confuse a local merchant (#20 step 8,
 * decision ٦).
 */
async function getStoryMetrics(id) {
  await getStoryOrThrow(id);

  const [viewsRow, clicksRow, townRows] = await Promise.all([
    db.queryOne(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT viewer_key) AS distinct_viewers
         FROM story_views WHERE story_id = ?`,
      [id]
    ),
    db.queryOne('SELECT COUNT(*) AS clicks FROM story_clicks WHERE story_id = ?', [id]),
    db.query(
      `SELECT COALESCE(viewer_town, 'غير معروفة') AS town, COUNT(*) AS views
         FROM story_views WHERE story_id = ?
        GROUP BY COALESCE(viewer_town, 'غير معروفة')
        ORDER BY views DESC`,
      [id]
    )
  ]);

  return {
    views: Number(viewsRow.views),
    distinct_viewers: Number(viewsRow.distinct_viewers),
    clicks: Number(clicksRow.clicks),
    town_breakdown: townRows.map(row => ({ town: row.town, views: Number(row.views) }))
  };
}

module.exports = {
  EXPIRY_PRESETS,
  presetToExpiresAt,
  listPublicStories,
  recordView,
  recordClick,
  reportStory,
  listAllStoriesForAdmin,
  createStory,
  updateStory,
  deleteStory,
  getStoryMetrics
};
