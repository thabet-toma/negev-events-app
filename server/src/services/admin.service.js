'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const { withAbsoluteMedia } = require('../utils/mediaUrl');

/** Headline counters for the admin dashboard, in a single round trip each. */
async function stats() {
  const [eventRow, userRow, congratsRow] = await Promise.all([
    db.queryOne(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'pending')  AS pending,
         SUM(status = 'approved') AS approved,
         SUM(status = 'rejected') AS rejected,
         COALESCE(SUM(views_count), 0) AS views
       FROM events`
    ),
    db.queryOne('SELECT COUNT(*) AS total FROM users'),
    db.queryOne('SELECT COUNT(*) AS total FROM congratulations')
  ]);

  return {
    totalEvents: Number(eventRow.total),
    pendingEvents: Number(eventRow.pending || 0),
    approvedEvents: Number(eventRow.approved || 0),
    rejectedEvents: Number(eventRow.rejected || 0),
    totalUsers: Number(userRow.total),
    totalCongrats: Number(congratsRow.total),
    totalViews: Number(eventRow.views)
  };
}

async function listEvents(status) {
  const rows = status
    ? await db.query('SELECT * FROM events WHERE status = ? ORDER BY created_at DESC', [status])
    : await db.query('SELECT * FROM events ORDER BY created_at DESC');
  return rows.map(withAbsoluteMedia);
}

async function updateEventStatus(eventId, status) {
  const { affectedRows } = await db.execute('UPDATE events SET status = ? WHERE id = ?', [status, eventId]);
  if (!affectedRows) throw ApiError.notFound('المناسبة غير موجودة');
  return withAbsoluteMedia(await db.queryOne('SELECT * FROM events WHERE id = ?', [eventId]));
}

/** Deleting an event cascades to its reactions and congratulations. */
async function deleteEvent(eventId) {
  const { affectedRows } = await db.execute('DELETE FROM events WHERE id = ?', [eventId]);
  if (!affectedRows) throw ApiError.notFound('المناسبة غير موجودة');
}

/**
 * Reassigns an orphaned or disputed event to another user. No automatic
 * kinship proof exists in this domain and none is attempted — this is
 * always a deliberate human decision by an admin, never inferred.
 */
async function transferEventOwnership(eventId, newOwnerId) {
  const owner = await db.queryOne('SELECT id FROM users WHERE id = ?', [newOwnerId]);
  if (!owner) throw ApiError.notFound('المستخدم غير موجود');

  const { affectedRows } = await db.execute('UPDATE events SET created_by = ? WHERE id = ?', [newOwnerId, eventId]);
  if (!affectedRows) throw ApiError.notFound('المناسبة غير موجودة');

  return withAbsoluteMedia(await db.queryOne('SELECT * FROM events WHERE id = ?', [eventId]));
}

async function listComments() {
  return db.query(
    `SELECT c.*, e.title AS event_title
       FROM congratulations c
       LEFT JOIN events e ON e.id = c.event_id
      ORDER BY c.created_at DESC`
  );
}

async function deleteComment(commentId) {
  const { affectedRows } = await db.execute('DELETE FROM congratulations WHERE id = ?', [commentId]);
  if (!affectedRows) throw ApiError.notFound('التعليق غير موجود');
}

async function listUsers() {
  return db.query(
    `SELECT id, phone_number, full_name, clan_town, role, created_at
       FROM users
      ORDER BY created_at DESC`
  );
}

async function recordBroadcast({ title, message, sentBy }) {
  const { insertId } = await db.execute(
    'INSERT INTO broadcasts (title, message, sent_by) VALUES (?, ?, ?)',
    [title, message, sentBy]
  );
  return insertId;
}

module.exports = {
  stats,
  listEvents,
  updateEventStatus,
  deleteEvent,
  transferEventOwnership,
  listComments,
  deleteComment,
  listUsers,
  recordBroadcast
};
