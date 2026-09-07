'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');

/**
 * The closed set of ticker lifetimes an admin picks from a button (issue #85,
 * story 25). `none` is «بلا شريط» (story 26): the row is written with
 * `expires_at = NULL`, which per `broadcasts.expires_at`'s own schema comment
 * means "no ticker at all", not "never expires" — it only ever shows up in
 * the notification centre. A free `expires_at` is also accepted for the
 * rarer date a preset doesn't fit — see `validateExpiresAt`.
 */
const BROADCAST_DURATIONS = [
  { key: 'hour', label: 'ساعة', hours: 1 },
  { key: 'day', label: 'يوم', hours: 24 },
  { key: '3_days', label: '٣ أيام', hours: 24 * 3 },
  { key: 'week', label: 'أسبوع', hours: 24 * 7 },
  { key: 'none', label: 'بلا شريط', hours: null }
];

/** 'info' | 'urgent' | 'solemn' (story 27) — chosen by the sender, never inferred from the message text. */
const BROADCAST_TONES = ['info', 'urgent', 'solemn'];

/**
 * Ceiling on how far in the future an explicit `expires_at` may sit. The
 * preset buttons above cap out at a week; this only guards the rarer
 * admin-typed date beyond that. 30 days mirrors `stories.service.js`'s own
 * 'month' preset — this codebase's existing definition of "long-lived but
 * still temporary" — comfortably past any real ticker banner while still
 * refusing one that would, in effect, never come down.
 */
const MAX_BROADCAST_EXPIRY_DAYS = 30;

/** Resolves a `duration` key to the TIMESTAMP it expires at, or `null` for `'none'`. */
function durationToExpiresAt(durationKey) {
  const preset = BROADCAST_DURATIONS.find(p => p.key === durationKey);
  if (!preset) throw ApiError.badRequest('مدّة الشريط غير معروفة');
  return preset.hours === null ? null : new Date(Date.now() + preset.hours * 60 * 60 * 1000);
}

/** Rejects a past `expires_at` and caps how far in the future one may sit; `null` (quiet broadcast) passes through untouched. */
function validateExpiresAt(expiresAt) {
  if (expiresAt === null) return null;

  const now = Date.now();
  if (expiresAt.getTime() <= now) {
    throw ApiError.badRequest('موعد انتهاء الشريط يجب أن يكون في المستقبل');
  }
  if (expiresAt.getTime() - now > MAX_BROADCAST_EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
    throw ApiError.badRequest(`موعد انتهاء الشريط بعيد جداً — الحد الأقصى ${MAX_BROADCAST_EXPIRY_DAYS} يوماً`);
  }
  return expiresAt;
}

/**
 * Writes one broadcast row per entry in `scopeTowns` (`[null]` for a global,
 * everyone-reaching broadcast) inside a single transaction — a town admin
 * covering three towns produces three rows together or none at all. Runs on
 * the raw mysql2 connection `db.transaction` hands the callback, which skips
 * `pool.js`'s `normalise()` and throws on an `undefined` bind, so every one
 * of the six bound values below is coerced to `null` explicitly with `?? null`
 * rather than relying on that helper — including `title`/`message`/`tone`,
 * which the route always fills before calling this, but this function makes
 * no assumption about that and coerces them anyway.
 */
async function sendBroadcast({ title, message, sentBy, expiresAt, tone, scopeTowns }) {
  return db.transaction(async connection => {
    const rows = [];
    for (const scopeTown of scopeTowns) {
      const [result] = await connection.execute(
        `INSERT INTO broadcasts (title, message, sent_by, expires_at, tone, scope_town)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [title ?? null, message ?? null, sentBy ?? null, expiresAt ?? null, tone ?? null, scopeTown ?? null]
      );
      rows.push({
        id: result.insertId,
        title: title ?? null,
        message: message ?? null,
        sent_by: sentBy ?? null,
        expires_at: expiresAt ?? null,
        tone: tone ?? null,
        scope_town: scopeTown ?? null
      });
    }
    return rows;
  });
}

/**
 * The `WHERE` fragment (with its bound params) scoping `broadcasts b` to what
 * `userId` may see: a global broadcast (`scope_town IS NULL`) always applies,
 * plus the caller's own town's broadcasts when signed in (`userId` given).
 *
 * `users.clan_town` is the only thing tying a user to a town, and the tie is
 * far weaker than "nullable and self-reported" alone suggests:
 *   - `auth.service.js`'s `register()` defaults a blank `clan_town` to
 *     `'النقب'` (server/src/services/auth.service.js:39) — a value that is
 *     not, and was never meant to be, one of the eight real `TOWNS`.
 *   - The registration field itself is free text, and its own placeholder
 *     teaches users to type a clan alongside the town — `web/index.html:570`
 *     ("مثال: رهط - آل فلان") — which never equals the bare town string
 *     `"رهط"` a broadcast's `scope_town` is written as.
 * The practical result: a town-scoped broadcast reaches almost nobody today,
 * not just users who genuinely left the field blank. This is a known,
 * separately-raised product decision (no prefix/fuzzy matching or town
 * guessing belongs here — CLAUDE.md: "البلدة يجب أن تكون من TOWNS — لا
 * تخمين") and is deliberately NOT worked around in this function.
 */
async function scopeClauseForUser(userId) {
  if (!userId) return { clause: 'b.scope_town IS NULL', params: [] };

  const row = await db.queryOne('SELECT clan_town FROM users WHERE id = ?', [userId]);
  const clanTown = row ? row.clan_town : null;
  if (!clanTown) return { clause: 'b.scope_town IS NULL', params: [] };

  return { clause: '(b.scope_town IS NULL OR b.scope_town = ?)', params: [clanTown] };
}

/**
 * The shared SELECT both `listLive` and `listForCenter` build on — same
 * columns, same `LEFT JOIN broadcast_views`, same scope clause — differing
 * only in the extra predicate the caller appends (liveness, for the ticker).
 */
async function queryBroadcastsForUser(userId, extraClause = '') {
  const { clause, params } = await scopeClauseForUser(userId);

  const rows = await db.query(
    `SELECT b.id, b.title, b.message, b.tone, b.expires_at, b.scope_town, b.created_at,
            COALESCE(bv.dismissed, 0) AS dismissed
       FROM broadcasts b
       LEFT JOIN broadcast_views bv ON bv.broadcast_id = b.id AND bv.user_id = ?
      WHERE ${clause}${extraClause}
      ORDER BY b.created_at DESC`,
    [userId ?? null, ...params]
  );
  return rows.map(row => ({ ...row, dismissed: Boolean(row.dismissed) }));
}

/**
 * The live ticker read (issue #85, story 28) — global broadcasts for
 * everyone, plus the caller's own town's broadcasts when signed in,
 * excluding expired ones and ones this user dismissed. A quiet «بلا شريط»
 * broadcast (`expires_at IS NULL`) never appears here — it only ever lives in
 * `listForCenter`. Compared against `UTC_TIMESTAMP()`, not `NOW()`: the pool
 * is configured with `timezone: 'Z'` (db/pool.js), so a bound `expires_at`
 * always serialises as its UTC wall-clock, while `NOW()` follows the MySQL
 * session/server timezone — same reasoning as `stories.service.js`.
 *
 * Takes the optional `user` object the route actually has (`req.user`, unset
 * for an anonymous visitor) — unlike `listForCenter`/`dismiss`, which only
 * ever run for a signed-in caller and so take a plain `userId`.
 */
async function listLive(user) {
  return queryBroadcastsForUser(
    user ? user.id : null,
    ' AND b.expires_at IS NOT NULL AND b.expires_at > UTC_TIMESTAMP() AND COALESCE(bv.dismissed, 0) = 0'
  );
}

/**
 * Every broadcast that applies to `userId` for the notification centre
 * (issue #85, story 30) — expired and quiet ones included, since expiry only
 * ends the ticker, never the record. `notifications.service.js` merges this
 * with the user's own notification rows; it only ever has a `userId`, never
 * a full user object, so that's all this takes.
 */
async function listForCenter(userId) {
  return queryBroadcastsForUser(userId);
}

/**
 * Upserts `userId`'s own `broadcast_views` row with `dismissed = 1` (story
 * 29) — idempotent, and a no-op the second time. A broadcast outside this
 * user's scope (never seen by them in the first place) is 404, same "never
 * confirm what the caller doesn't own" rule as `adminScope.assertEventInScope`.
 *
 * `broadcast_views.dismissed` also doubles as this row's "read" state in the
 * merged notification centre (`notifications.service.js`) — the only
 * acknowledgement action a broadcast has at all, ticker or centre, is this
 * one idempotent upsert, so reusing it (rather than `seen_at`, which nothing
 * else ever sets either) is what lets a user reach a zero badge even for a
 * quiet or already-expired broadcast they never saw in a ticker.
 */
async function dismiss(userId, broadcastId) {
  const { clause, params } = await scopeClauseForUser(userId);
  const broadcast = await db.queryOne(
    `SELECT b.id FROM broadcasts b WHERE b.id = ? AND ${clause}`,
    [broadcastId, ...params]
  );
  if (!broadcast) throw ApiError.notFound('التعميم غير موجود');

  await db.execute(
    `INSERT INTO broadcast_views (broadcast_id, user_id, dismissed)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE dismissed = 1`,
    [broadcastId, userId]
  );
}

module.exports = {
  BROADCAST_DURATIONS,
  BROADCAST_TONES,
  MAX_BROADCAST_EXPIRY_DAYS,
  durationToExpiresAt,
  validateExpiresAt,
  sendBroadcast,
  listLive,
  listForCenter,
  dismiss
};
