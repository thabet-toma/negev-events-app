'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db/pool');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const { signToken, ADMIN_ROLES } = require('../middleware/auth');

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
  const { insertId } = await db.execute(
    `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role)
     VALUES (?, ?, ?, ?, 'user')`,
    [phone_number, full_name, hashedPin, clan_town || 'النقب']
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

module.exports = { register, login, adminLogin, findById, publicUser, setAnalyticsOptOut };
