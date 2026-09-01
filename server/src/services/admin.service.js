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

/**
 * Publishes one public announcement for a critical date amendment that just
 * got approved (#20 step 7 — an announcement is never created for anything
 * else: no cosmetic edit, no town/location amendment, only event_date and
 * event_end_date). Turns off `is_current` on any prior live announcement for
 * the same event first — the newest replaces the old one in display, but
 * neither row is ever deleted. Then notifies whoever earned it: every
 * "ذكّرني" follower plus the event's owner, minus whoever made the edit
 * themself (nobody is notified of their own action). Everything here runs on
 * the same `connection` as the status update, so an announcement or
 * notification is never left half-written.
 */
async function publishDateAnnouncement(connection, eventId, amendment) {
  await connection.execute(
    "UPDATE event_announcements SET is_current = 0 WHERE event_id = ? AND is_current = 1",
    [eventId]
  );
  await connection.execute(
    `INSERT INTO event_announcements (event_id, amendment_id, old_value, new_value, is_current)
     VALUES (?, ?, ?, ?, 1)`,
    [eventId, amendment.id, amendment.old_value, amendment.new_value]
  );

  const [eventRows] = await connection.execute('SELECT id, title, created_by FROM events WHERE id = ?', [eventId]);
  const event = eventRows[0];

  const [recipientRows] = await connection.execute(
    `SELECT DISTINCT user_id FROM (
        SELECT user_id FROM event_reminders WHERE event_id = ?
        UNION
        SELECT created_by AS user_id FROM events WHERE id = ? AND created_by IS NOT NULL
     ) recipients`,
    [eventId, eventId]
  );

  const label = amendment.field === 'event_end_date' ? 'تاريخ انتهاء' : 'تاريخ';
  // One title serves both audiences — the followers and the owner. "تتابعها"
  // reads wrong to the owner, whose own occasion this is.
  const title = 'تغيّر موعد المناسبة';
  const body = `تغيّر ${label} "${event.title}" من ${amendment.old_value || 'غير محدَّد'} إلى ${amendment.new_value || 'غير محدَّد'}`;

  const notifications = [];
  for (const recipient of recipientRows) {
    // Nobody is notified of an edit they made themself.
    if (recipient.user_id === amendment.changed_by) continue;

    const [insertResult] = await connection.execute(
      `INSERT INTO notifications (user_id, event_id, type, title, body)
       VALUES (?, ?, 'event_date_changed', ?, ?)`,
      [recipient.user_id, eventId, title, body]
    );
    notifications.push({
      id: insertResult.insertId,
      user_id: recipient.user_id,
      event_id: eventId,
      type: 'event_date_changed',
      title,
      body,
      is_read: false
    });
  }

  return notifications;
}

/**
 * Approving or rejecting also settles this event's pending amendment rows —
 * otherwise the log keeps saying "بانتظار المراجعة" for a decision that was
 * already made, and the audit trail lies. An approval that resolves a
 * pending event_date/event_end_date amendment also publishes the public
 * announcement and notifies its audience — all writes share one transaction.
 */
async function updateEventStatus(eventId, status) {
  const { event, notifications } = await db.transaction(async connection => {
    const [result] = await connection.execute('UPDATE events SET status = ? WHERE id = ?', [status, eventId]);
    if (!result.affectedRows) throw ApiError.notFound('المناسبة غير موجودة');

    let notifications = [];

    if (status === 'approved' || status === 'rejected') {
      const [pendingRows] = await connection.execute(
        "SELECT * FROM event_amendments WHERE event_id = ? AND status = 'pending' ORDER BY created_at ASC, id ASC",
        [eventId]
      );

      await connection.execute(
        "UPDATE event_amendments SET status = ? WHERE event_id = ? AND status = 'pending'",
        [status, eventId]
      );

      if (status === 'approved') {
        const dateAmendments = pendingRows.filter(row => row.field === 'event_date' || row.field === 'event_end_date');
        for (const amendment of dateAmendments) {
          const published = await publishDateAnnouncement(connection, eventId, amendment);
          notifications = notifications.concat(published);
        }
      }
    }

    const [rows] = await connection.execute('SELECT * FROM events WHERE id = ?', [eventId]);
    return { event: rows[0], notifications };
  });

  return { event: withAbsoluteMedia(event), notifications };
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
