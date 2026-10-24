'use strict';

/**
 * Erasure and access requests (issue #44, privacy layer part 3). All SQL for
 * this domain lives here, per the project rule — routes only validate and
 * shape the request.
 */

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const { PRIVACY_REQUEST_TYPES } = require('../constants');

/**
 * Deletes every analytics_events row this user owns, without touching their
 * account or anything else about them. "Erasure is one query" — the account-
 * deletion cascade (fk_analytics_events_user ON DELETE CASCADE, see
 * schema.sql) already erases the same rows when the account itself goes;
 * this is that same erasure made available on demand, for someone who wants
 * their behavioural history gone without leaving the platform.
 */
async function eraseAnalyticsForUser(userId) {
  const { affectedRows } = await db.execute('DELETE FROM analytics_events WHERE user_id = ?', [userId]);
  return { deleted: affectedRows };
}

/**
 * Queues a formal privacy request. Access requests have no self-service
 * fulfilment path in this version — a super_admin fulfils them by hand — so
 * this is the record of "someone asked", not the fulfilment itself.
 */
async function createRequest(userId, requestType) {
  if (!PRIVACY_REQUEST_TYPES.includes(requestType)) {
    throw ApiError.badRequest('نوع الطلب غير معروف');
  }

  const { insertId } = await db.execute(
    'INSERT INTO privacy_requests (user_id, request_type) VALUES (?, ?)',
    [userId, requestType]
  );
  return db.queryOne('SELECT * FROM privacy_requests WHERE id = ?', [insertId]);
}

/**
 * The super_admin queue listing — every request, newest first, optionally
 * filtered by status. Joins the requester's name/phone so a human can act on
 * the request without a dedicated screen (out of scope for this layer).
 */
async function listRequests(status) {
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE pr.status = ?';
    params.push(status);
  }

  return db.query(
    `SELECT pr.*, u.full_name AS user_full_name, u.phone_number AS user_phone
       FROM privacy_requests pr
       JOIN users u ON u.id = pr.user_id
       ${where}
      ORDER BY pr.created_at DESC`,
    params
  );
}

/** Marks a request handled — closes it and records who closed it and when. */
async function closeRequest(id, handledBy) {
  const existing = await db.queryOne('SELECT id FROM privacy_requests WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('الطلب غير موجود');

  await db.execute(
    `UPDATE privacy_requests SET status = 'completed', handled_at = NOW(), handled_by = ? WHERE id = ?`,
    [handledBy, id]
  );
  return db.queryOne('SELECT * FROM privacy_requests WHERE id = ?', [id]);
}

/**
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits are what an Arabic keyboard can
 * produce instead of ASCII digits — same number, different code points, so a
 * lookup that compares them literally finds nothing.
 */
function toAsciiDigits(value) {
  return String(value || '')
    .replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, ch => String(ch.charCodeAt(0) - 0x06F0));
}

/**
 * Reduces the number a person typed into the public form to the compact ASCII
 * form `users.phone_number` is stored in: ASCII digits only, no spaces, dashes
 * or `+`. Pure and parameter-free on purpose — the route reads `toAsciiDigits`
 * for its own shape check, and the lookup below normalises the stored column
 * the same way inside SQL.
 */
function normalisePhoneNumber(value) {
  return toAsciiDigits(value).replace(/[\s-]/g, '').replace(/\+/g, '');
}

/**
 * A deletion request filed from the public page — no app, no login, just the
 * number someone signed up with. Deliberately returns the internal outcome to
 * its caller; the route throws it away and answers identically every time, so
 * a stranger cannot enumerate registered numbers by comparing two replies.
 *
 * "No user" ends here with no second query, and an account that already has an
 * open erasure request is never queued twice — a duplicate only slows the
 * queue down.
 */
async function fileDeletionRequest(phoneNumber) {
  const normalised = normalisePhoneNumber(phoneNumber);
  if (!normalised) return { matched: false };

  // Compared normalised rather than assumed already clean (older imports may
  // have stored whatever was typed), and the value still travels as a bound
  // parameter — REPLACE only normalises the column side, it never builds SQL.
  const user = await db.queryOne(
    `SELECT id FROM users
      WHERE REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '+', '') = ?
      LIMIT 1`,
    [normalised]
  );
  if (!user) return { matched: false };

  const open = await db.queryOne(
    `SELECT id FROM privacy_requests
      WHERE user_id = ? AND request_type = 'erasure' AND status = 'pending'
      LIMIT 1`,
    [user.id]
  );
  if (open) return { matched: true, duplicate: true };

  await createRequest(user.id, 'erasure');
  return { matched: true, duplicate: false };
}

module.exports = {
  eraseAnalyticsForUser,
  createRequest,
  listRequests,
  closeRequest,
  fileDeletionRequest,
  toAsciiDigits,
  normalisePhoneNumber
};
