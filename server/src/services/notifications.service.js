'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const broadcasts = require('./broadcasts.service');
const { runInstantForDate } = require('../utils/jerusalemTime');

/**
 * A user's own notification feed merged with the broadcasts that apply to
 * them (issue #85, story 30), one list sorted newest first — built here in
 * the service layer, never in the route or a client. Nothing is ever fanned
 * out per-user (see broadcasts.service.js), which is also what makes a user
 * who registered after a broadcast went out still see it here.
 *
 * A broadcast entry is shaped so no client can confuse it with a personal
 * one — this matters because `notifications.id` and `broadcasts.id` are two
 * independent AUTO_INCREMENT counters that overlap, so an entry that carried
 * a bare `id` could send a client's "mark read" action at the WRONG table's
 * row of that same number:
 *   - `broadcast_id`, never `id` — a client cannot accidentally reuse it as
 *     a `notifications.id` (and this shape carries no `id` field at all).
 *   - `is_read`, on every entry of both kinds, so existing badge-counting
 *     logic (`!n.is_read`) needs no per-type branch. For a broadcast this is
 *     `broadcast_views.dismissed` (see broadcasts.service.js#dismiss for
 *     why that column, not `seen_at`, is the one reused as "read") — which
 *     is also what lets a user reach a zero badge for an EXPIRED broadcast
 *     they never saw in any ticker: opening it in the centre is the only
 *     "read" action it has, and that action is `PATCH
 *     /api/broadcasts/:id/dismiss`, not `PATCH /api/notifications/:id/read`.
 */
async function listForUser(userId) {
  const [personal, broadcastRows] = await Promise.all([
    db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC', [userId]),
    broadcasts.listForCenter(userId)
  ]);

  const broadcastEntries = broadcastRows.map(row => ({
    broadcast_id: row.id,
    type: 'broadcast',
    title: row.title,
    body: row.message,
    tone: row.tone,
    expires_at: row.expires_at,
    scope_town: row.scope_town,
    is_read: row.dismissed,
    created_at: row.created_at
  }));

  return [...personal, ...broadcastEntries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/** Marks one notification read — `WHERE id = ? AND user_id = ?` so a user can never touch anyone else's. */
async function markRead(notificationId, userId) {
  const { affectedRows } = await db.execute(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [notificationId, userId]
  );
  if (!affectedRows) throw ApiError.notFound('الإشعار غير موجود');
}

/** Deletes one notification — `WHERE id = ? AND user_id = ?` */
async function deleteNotification(notificationId, userId) {
  await db.execute(
    'DELETE FROM notifications WHERE id = ? AND user_id = ?',
    [notificationId, userId]
  );
}

/** Clears all personal notifications and dismisses broadcasts for the user */
async function clearAll(userId) {
  await db.execute('DELETE FROM notifications WHERE user_id = ?', [userId]);
  const rows = await broadcasts.listForCenter(userId);
  for (const b of rows) {
    if (!b.dismissed) {
      await broadcasts.dismiss(userId, b.id);
    }
  }
}

/**
 * The full catalogue of notification `type` strings this codebase writes,
 * and the dedupe_key shape each one uses (issue #85, batch 3) — the one
 * place both are documented, so a new producer has one function
 * (`create`/`createScheduled` below) and one table to check instead of
 * grepping for string literals.
 *
 *   type                 | dedupe_key                        | daily cap?
 *   ---------------------|------------------------------------|-----------
 *   event_soon           | event_soon_<event_id>_<offsetDays>  | yes
 *   moderation_digest    | moderation_digest_<YYYY-MM-DD>      | yes
 *   event_date_changed   | null (always a fresh row)           | no
 *   event_venue_changed  | null (always a fresh row)           | no
 *   event_approved       | null (always a fresh row)           | no
 *   event_rejected       | null (always a fresh row)           | no
 *
 * Only a NON-exempt `event_soon` row ever competes for DAILY_SCHEDULED_CAP
 * (story 10) — every admin-triggered kind above is written the moment its
 * event happens and is never throttled, and `moderation_digest` is always
 * written `exempt: true` (it is inherently about the publisher's own
 * content): a date/venue change, a publish decision, or anything about the
 * user's own event is «ما لا يجوز أن يفوتني» (story 11), so none of them are
 * ever offered to the cap check, and — just as importantly — none of them
 * are ever COUNTED by it either. See `countScheduledToday`: exempt is "not
 * counted", not merely "not blocked".
 */
const TYPES = {
  EVENT_SOON: 'event_soon',
  MODERATION_DIGEST: 'moderation_digest',
  EVENT_DATE_CHANGED: 'event_date_changed',
  EVENT_VENUE_CHANGED: 'event_venue_changed',
  EVENT_APPROVED: 'event_approved',
  EVENT_REJECTED: 'event_rejected'
};

/** Story 10: at most this many *scheduled* notifications reach one user per day. */
const DAILY_SCHEDULED_CAP = 3;

/** The countdown offsets, in days before an event (stories 1-3). Shared by the scheduler and by `scheduleForUser` so both compute the exact same set — a client is never told a fire time the scheduler itself would not also produce. */
const COUNTDOWN_OFFSETS = [7, 5, 3, 1, 0];

/**
 * The one INSERT every notification producer in this codebase goes through
 * (issue #85, batch 3). `dedupeKey` null always writes a fresh row — the
 * UNIQUE key on (user_id, dedupe_key) never fires on NULL, since MySQL
 * treats every NULL in a unique index as distinct from every other NULL. A
 * non-null `dedupeKey` makes this INSERT-OR-SKIP: writing the exact same
 * (userId, dedupeKey) twice writes ONE row, silently — the database itself
 * enforces this atomically (`ON DUPLICATE KEY UPDATE`), never a "check then
 * insert" race, which is what makes the scheduler safe to run twice. This
 * atomicity is THIS FUNCTION's own guarantee only — `createScheduled` below
 * layers a separate, genuinely non-atomic check (the daily cap) on top of
 * it; see its own comment for why that one is fine to leave as a race.
 *
 * Runs on a raw mysql2 `connection` when a caller passes one, so it can join
 * an already-open transaction (e.g. the amendment-approval path in
 * admin.service.js) — a plain `db.execute` otherwise. Only the two OPTIONAL
 * fields (`eventId`, `dedupeKey`) are coerced with `?? null`: a raw
 * connection skips pool.js's own `normalise()` and mysql2 throws on
 * `undefined`, and these two are the only ones a caller may legitimately
 * omit. `userId`/`type`/`title`/`body` are required by every caller in this
 * codebase and are never coerced — an omitted one is a caller bug that
 * should surface as mysql2's own clear error, not be silently swallowed into
 * a `NULL` write against a `NOT NULL` column.
 */
async function create({ userId, eventId = null, type, title, body, dedupeKey = null }, connection = null) {
  const sql = `INSERT INTO notifications (user_id, event_id, type, title, body, dedupe_key)
               VALUES (?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE id = id`;
  const params = [userId, eventId ?? null, type, title, body, dedupeKey ?? null];

  let insertId;
  let affectedRows;
  if (connection) {
    const [result] = await connection.execute(sql, params);
    insertId = result.insertId;
    affectedRows = result.affectedRows;
  } else {
    const result = await db.execute(sql, params);
    insertId = result.insertId;
    affectedRows = result.affectedRows;
  }

  // affectedRows === 1 on a genuine new insert; 0 on a no-op ON DUPLICATE KEY
  // hit (MySQL never counts a self-assignment `id = id` as a change) — this
  // is how a caller tells "I actually just created something worth telling a
  // connected client about" apart from "this already existed, stay quiet".
  return { id: insertId, inserted: affectedRows === 1, userId, eventId, type };
}

/**
 * How many of `userId`'s `event_soon` notifications about SOMEONE ELSE'S
 * event already exist today — the daily cap's own counter (story 10).
 *
 * "Exempt" (story 11) means NOT COUNTED, not merely "not blocked" — a
 * countdown about the user's own event is written with `exempt: true` in
 * `createScheduled`, but that write still lands in `notifications` like any
 * other `event_soon` row, so a naive `COUNT(*) ... type = 'event_soon'`
 * would still count it and silently spend the very budget it was supposed
 * to be excused from. The `LEFT JOIN` + `created_by <> n.user_id` below is
 * what excludes it AT COUNT TIME, using the same "is this the user's own
 * event" fact `runCountdownPass` used to decide `exempt` in the first place
 * — one source of truth (the event's `created_by`), read twice.
 *
 * `moderation_digest` needs no such join: it carries no `event_id` at all
 * and is always written `exempt: true` (see `createScheduled`), so it is
 * simply never counted here — there is no non-exempt digest to count.
 */
async function countScheduledToday(userId) {
  const row = await db.queryOne(
    `SELECT COUNT(*) AS total
       FROM notifications n
       LEFT JOIN events e ON e.id = n.event_id
      WHERE n.user_id = ? AND n.type = ?
        AND (e.created_by IS NULL OR e.created_by <> n.user_id)
        AND DATE(n.created_at) = CURDATE()`,
    [userId, TYPES.EVENT_SOON]
  );
  return Number(row.total);
}

/**
 * The scheduler's own entry point into `create` — every scheduled
 * notification (event_soon, moderation_digest) goes through here instead of
 * `create` directly, so the daily cap is enforced in exactly one place.
 * `exempt: true` bypasses the cap check outright (story 11): the write still
 * goes through the same dedupe-safe `create`, it just never competes for —
 * and, per `countScheduledToday` above, never consumes — the budget. A
 * capped, non-exempt call never touches the database at all — `inserted:
 * false`, no row, nothing to emit.
 *
 * The read-then-write here (`countScheduledToday` then `create`) is a real
 * check-then-insert, unlike `create`'s own dedupe-key atomicity — two
 * concurrent calls for the same user could both read a count under the cap
 * and both insert, landing one row over budget. Left as is on purpose: this
 * process is the only writer of `event_soon`/`moderation_digest` rows (the
 * scheduler runs inside this single `app` process, per issue #85's own
 * architecture), and the cap itself is an advisory notification-fatigue
 * limit, not a security or billing boundary — an occasional one-over is not
 * worth a `SELECT ... FOR UPDATE` on every candidate.
 */
async function createScheduled({ userId, eventId = null, type, title, body, dedupeKey, exempt = false }) {
  if (!exempt) {
    const alreadySent = await countScheduledToday(userId);
    if (alreadySent >= DAILY_SCHEDULED_CAP) {
      return { id: null, inserted: false, userId, eventId, type, capped: true };
    }
  }
  return create({ userId, eventId, type, title, body, dedupeKey });
}

/** Subtracts `days` from a `YYYY-MM-DD` string, in UTC — a DATE column's own calendar arithmetic, no timezone involved since it never carries a time of day. */
function subtractDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * For every event `userId` follows whose occasion type still has its
 * countdown on, the fire INSTANTS still ahead of today — computed here, once,
 * so no client (today's web centre, tomorrow's mobile alarms) re-derives the
 * offsets, or the 09:00 Asia/Jerusalem hour itself, and drifts from the
 * scheduler's own idea of either (`GET /api/reminders/schedule`). `fires_on`
 * is a full ISO instant (`runInstantForDate`, the same zone-aware conversion
 * the scheduled job itself uses), not a bare `YYYY-MM-DD` — a mobile alarm
 * reading a date alone would have to invent the hour, which is exactly the
 * drift «تحسبها الخادم» exists to prevent. An event whose type has
 * `notify_countdown = 0` is absent from the result entirely — there is
 * nothing to schedule for it (story 4) — and an event with no offset left to
 * fire (it already happened, or every offset already passed) is dropped
 * rather than returned empty.
 */
async function scheduleForUser(userId) {
  const rows = await db.query(
    `SELECT e.id, e.title, e.event_date, DATEDIFF(e.event_date, CURDATE()) AS days_left
       FROM event_reminders r
       JOIN events e ON e.id = r.event_id
       JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE r.user_id = ? AND ot.notify_countdown = 1
      ORDER BY e.event_date ASC, e.id ASC`,
    [userId]
  );

  return rows
    .map(row => {
      const daysLeft = Number(row.days_left);
      const offsets = COUNTDOWN_OFFSETS
        .filter(offset => offset <= daysLeft)
        .map(offset => ({
          days_before: offset,
          fires_on: runInstantForDate(subtractDays(row.event_date, offset)).toISOString()
        }));
      return { event_id: row.id, title: row.title, event_date: row.event_date, offsets };
    })
    .filter(entry => entry.offsets.length > 0);
}

module.exports = {
  listForUser,
  markRead,
  deleteNotification,
  clearAll,
  TYPES,
  DAILY_SCHEDULED_CAP,
  COUNTDOWN_OFFSETS,
  create,
  createScheduled,
  scheduleForUser
};
