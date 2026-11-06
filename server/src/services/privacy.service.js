'use strict';

/**
 * Erasure and access requests (issue #44, privacy layer part 3). The request
 * domain's SQL lives here, per the project rule — routes only validate and
 * shape the request. One deliberate exception: the scheduled erasure's
 * eligibility re-check is a locking read inside the account-deletion
 * transaction in auth.service.js, because it must be atomic with the DELETE
 * and the deletion path may not be copied into a second service.
 */

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const auth = require('./auth.service');
const { PRIVACY_REQUEST_TYPES, PRIVACY_REQUEST_DEADLINE_DAYS } = require('../constants');

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
 *
 * `source` is set by the CALLER, never by a request body: 'account' is only
 * passed by the authenticated route, which builds the requester from
 * `req.user`, and it is what allows the scheduled job to execute an overdue
 * erasure. The default is 'public' on purpose — a caller that forgets cannot
 * accidentally create an automatically deletable request.
 */
async function createRequest(userId, requestType, source = 'public') {
  if (!PRIVACY_REQUEST_TYPES.includes(requestType)) {
    throw ApiError.badRequest('نوع الطلب غير معروف');
  }
  if (source !== 'account' && source !== 'public') {
    throw ApiError.badRequest('مصدر الطلب غير معروف');
  }

  const { insertId } = await db.execute(
    'INSERT INTO privacy_requests (user_id, request_type, source) VALUES (?, ?, ?)',
    [userId, requestType, source]
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

/**
 * Marks a request handled — closes it and records who closed it and when.
 *
 * The UPDATE carries `status = 'pending'` rather than trusting an earlier
 * SELECT: a close racing the scheduled erasure's transaction must either win
 * outright (the job's locked eligibility read then sees 'completed' and
 * deletes nobody) or lose to the delete (this UPDATE affects zero rows and the
 * row is gone). Closing an already-completed request returns the existing row
 * unchanged — only the pending→completed transition records a handler; a
 * truly missing row is 404.
 */
async function closeRequest(id, handledBy) {
  await db.execute(
    `UPDATE privacy_requests
        SET status = 'completed', handled_at = NOW(), handled_by = ?
      WHERE id = ? AND status = 'pending'`,
    [handledBy, id]
  );
  const request = await db.queryOne('SELECT * FROM privacy_requests WHERE id = ?', [id]);
  if (!request) throw ApiError.notFound('الطلب غير موجود');
  return request;
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
 *
 * This path does NOT prove that the caller controls the number, so the request
 * it queues is always `source = 'public'` and the scheduled job can never
 * execute it. A human reviews it first; an authenticated account holder has
 * the separate `POST /api/privacy/requests` path, whose row is `'account'`.
 * An older public row never blocks that path and is never upgraded by it.
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

  await createRequest(user.id, 'erasure', 'public');
  return { matched: true, duplicate: false };
}

/**
 * The scheduled deletion job's candidate list (issue #164): every erasure
 * request that has outlived the deadline stated to the person who filed it —
 * the same `PRIVACY_REQUEST_DEADLINE_DAYS` the public confirmation and the
 * admin queue quote. Nothing else can enter it: an `access` request is
 * fulfilled by a human, a request still inside its deadline stays untouched,
 * and a closed one stays closed. The deadline itself is computed here, in SQL,
 * so the job that calls this carries no query of its own.
 *
 * `source = 'account'` is the second gate and the one that matters for safety:
 * a request filed from the public phone form was never proof that its filer
 * controls the account, so it stays for human review and can never appear
 * here — even when it is old enough to have passed the deadline.
 */
async function listDueErasureRequests() {
  return db.query(
    `SELECT pr.id, pr.user_id
       FROM privacy_requests pr
       JOIN users u ON u.id = pr.user_id
      WHERE pr.request_type = 'erasure'
        AND pr.source = 'account'
        AND pr.status = 'pending'
        AND pr.created_at <= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY pr.id ASC`,
    [PRIVACY_REQUEST_DEADLINE_DAYS]
  );
}

/**
 * Executes one due erasure request by deleting the account through the
 * existing admin-fulfilment path — account deletion (cascade, avatar release,
 * transaction) is never duplicated here. `handled_by` is left NULL because the
 * actor is this job, not a person; the request row itself then goes with the
 * user through `fk_privacy_requests_user ON DELETE CASCADE`, exactly as it
 * does when a super_admin deletes the account from the panel.
 *
 * The `user_id` read here only addresses that existing path. It is NOT the
 * eligibility check: `auth.deleteAccountAsAdmin` re-proves type, source,
 * status and deadline under a row lock inside its own deletion transaction, so
 * a request closed (or rewritten) between this read and that transaction
 * cannot delete anyone. A direct call with a fresh request's id therefore
 * returns `{ executed: false }`, not a deletion.
 */
async function executeErasureRequest(requestId) {
  const request = await db.queryOne(
    'SELECT user_id FROM privacy_requests WHERE id = ?',
    [requestId]
  );
  if (!request) return { executed: false };

  const result = await auth.deleteAccountAsAdmin(request.user_id, null, {
    erasureRequestId: requestId
  });
  return result.deleted
    ? { executed: true, userId: request.user_id }
    : { executed: false };
}

module.exports = {
  eraseAnalyticsForUser,
  createRequest,
  listRequests,
  closeRequest,
  fileDeletionRequest,
  listDueErasureRequests,
  executeErasureRequest,
  toAsciiDigits,
  normalisePhoneNumber
};
