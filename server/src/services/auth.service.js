'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db/pool');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { signToken, ADMIN_ROLES } = require('../middleware/auth');
const people = require('./people.service');

function publicUser(user) {
  return {
    id: user.id,
    phone_number: user.phone_number,
    full_name: user.full_name,
    clan_town: user.clan_town,
    role: user.role,
    // Exposed so a client can render the opt-out switch (issue #44, privacy
    // layer part 2). register()'s literal user object has no such property —
    // Boolean(undefined) === false, which matches the column's real DEFAULT 0.
    analytics_opt_out: Boolean(user.analytics_opt_out)
  };
}

function issueToken(user) {
  const ttl = ADMIN_ROLES.includes(user.role) ? config.jwt.adminTokenTtl : config.jwt.userTokenTtl;
  return signToken(
    { id: user.id, phone_number: user.phone_number, full_name: user.full_name, role: user.role },
    ttl
  );
}

async function register({ phone_number, full_name, pin_code, clan_town }) {
  const existing = await db.queryOne('SELECT id FROM users WHERE phone_number = ?', [phone_number]);
  if (existing) throw ApiError.conflict('رقم الهاتف مسجل مسبقاً');

  const hashedPin = bcrypt.hashSync(pin_code, config.bcryptRounds);
  // الحساب شخصٌ أيضاً (ADR-0011): اسمه يُحلّ إلى صفّ `people` عند التسجيل، لا
  // عند أوّل بحث، فمن سجّل باسمه يظهر باسمه لا باسمٍ لم يُكتب بعد.
  const personId = await people.resolveByName(full_name);
  const { insertId } = await db.execute(
    `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role, person_id)
     VALUES (?, ?, ?, ?, 'user', ?)`,
    [phone_number, full_name, hashedPin, clan_town || 'النقب', personId]
  );

  const user = { id: insertId, phone_number, full_name, clan_town: clan_town || 'النقب', role: 'user' };
  return { token: issueToken(user), user: publicUser(user) };
}

async function login({ phone_number, pin_code }) {
  const user = await db.queryOne('SELECT * FROM users WHERE phone_number = ?', [phone_number]);
  // Same message for unknown phone and wrong PIN — do not leak which accounts exist.
  if (!user || !bcrypt.compareSync(pin_code, user.pin_code)) {
    throw ApiError.unauthorized('رقم الهاتف أو رمز PIN غير صحيح');
  }

  return { token: issueToken(user), user: publicUser(user) };
}

/** Admin sign-in: same credential check, plus a role gate. */
async function adminLogin({ phone_number, pin_code }) {
  const phone = phone_number || config.admin.phone;
  const user = await db.queryOne('SELECT * FROM users WHERE phone_number = ?', [phone]);

  if (!user || !bcrypt.compareSync(pin_code, user.pin_code)) {
    throw ApiError.unauthorized('بيانات الدخول غير صحيحة');
  }

  if (!ADMIN_ROLES.includes(user.role)) {
    throw ApiError.forbidden('هذا الحساب لا يملك صلاحيات الإدارة');
  }

  return { token: issueToken(user), user: publicUser(user) };
}

async function findById(id) {
  const user = await db.queryOne(
    'SELECT id, phone_number, full_name, clan_town, role, created_at, analytics_opt_out FROM users WHERE id = ?',
    [id]
  );
  if (!user) return null;
  return { ...user, analytics_opt_out: Boolean(user.analytics_opt_out) };
}

/**
 * Sets the opt-out switch (issue #44, privacy layer part 2) — a switch, never
 * a condition of use: nothing else in the app reads or gates on this value
 * except analytics.service.record(), which honours it at the write.
 */
async function setAnalyticsOptOut(userId, optOut) {
  await db.execute('UPDATE users SET analytics_opt_out = ? WHERE id = ?', [optOut ? 1 : 0, userId]);
  const user = await findById(userId);
  if (!user) throw ApiError.notFound('المستخدم غير موجود');
  return user;
}

/**
 * A fresh token for a plain user, so an active account never reaches the end
 * of its TTL — clients call GET /auth/me on every app open. Admin roles get
 * null: their short TTL is the protection on the admin panel, and sliding it
 * on activity would erase it. Takes the row just read from the database, so a
 * role change since the old token was signed is honoured here.
 */
function renewToken(user) {
  if (ADMIN_ROLES.includes(user.role)) return null;
  return issueToken(user);
}

/**
 * Self-service account deletion — the path Google Play's account-deletion
 * policy asks for. Re-authentication is the account's own PIN (the same bcrypt
 * hash login checks), so a stolen token alone cannot erase an account.
 *
 * Deleting the `users` row IS the erasure: every personal child row
 * (reminders, notifications, nokoot, push subscriptions, photo tags and
 * reports, analytics_events) carries `ON DELETE CASCADE`, while content meant
 * to be public (events, albums/photos, congratulations) carries
 * `ON DELETE SET NULL` and stays online with no owner name — see schema.sql.
 * The delete runs inside an explicit transaction even though it is one
 * statement, so the intent is written down rather than inferred.
 *
 * Known limit: the JWT is never revoked. `authenticate` verifies the signature
 * only and reads no user row, so a token issued before the deletion stays
 * cryptographically valid until it expires — every endpoint that looks the
 * user up now answers 404, but nothing can invalidate the string itself.
 */
async function deleteAccount(userId, pinCode) {
  const user = await db.queryOne('SELECT id, pin_code FROM users WHERE id = ?', [userId]);
  if (!user) throw ApiError.notFound('الحساب غير موجود');

  if (!bcrypt.compareSync(pinCode, user.pin_code)) {
    throw ApiError.unauthorized('رمز الدخول غير صحيح');
  }

  await db.transaction(async connection => {
    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
  });

  // Audit line carrying no personal data — the id alone, no phone, no name.
  logger.info('account.delete', { userId });
  return { deleted: true };
}

/**
 * The same deletion performed by a super_admin from the panel: no PIN (the
 * admin is not the account holder) and the actor is recorded instead.
 *
 * An open erasure request is closed inside the same transaction, BEFORE the
 * delete — `fk_privacy_requests_user` is ON DELETE CASCADE, so the request row
 * goes with the user and closing it afterwards would find nothing at all.
 */
async function deleteAccountAsAdmin(userId, adminId) {
  await db.transaction(async connection => {
    const [rows] = await connection.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (!rows.length) throw ApiError.notFound('المستخدم غير موجود');

    await connection.execute(
      `UPDATE privacy_requests
          SET status = 'completed', handled_at = NOW(), handled_by = ?
        WHERE user_id = ? AND request_type = 'erasure' AND status = 'pending'`,
      [adminId, userId]
    );

    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
  });

  logger.info('account.delete', { userId, by: adminId });
  return { deleted: true };
}

module.exports = {
  register,
  login,
  adminLogin,
  findById,
  publicUser,
  setAnalyticsOptOut,
  renewToken,
  deleteAccount,
  deleteAccountAsAdmin
};
