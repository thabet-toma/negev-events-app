'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const broadcasts = require('./broadcasts.service');

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

module.exports = { listForUser, markRead };
