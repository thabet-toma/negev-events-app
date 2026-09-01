'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');

/** A user's own notification feed, newest first — scoped in the query itself, same rule as the nokoot ledger. */
async function listForUser(userId) {
  return db.query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC',
    [userId]
  );
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
