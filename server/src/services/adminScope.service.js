'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const { TOWNS } = require('../constants');

// A caller-supplied SQL alias is interpolated directly into query text — the
// one deliberate exception to "never concatenate SQL" in this project. It is
// safe only because every caller passes a hard-coded literal, never a value
// that came from a request; this pattern guards that literal so a future
// caller can never smuggle a value through it by mistake.
const ALIAS_PATTERN = /^[a-z_][a-z0-9_]*$/i;

function assertValidAlias(alias) {
  if (typeof alias !== 'string' || !ALIAS_PATTERN.test(alias)) {
    throw ApiError.badRequest('اسم مستعار غير صالح للاستعلام');
  }
}

/**
 * Towns a user may administer. `super_admin` implicitly owns every town in
 * the system (not just the ones with rows in `admin_towns`, which is a
 * plain-`admin` concept); a scoped `admin` owns exactly its `admin_towns`
 * rows; anyone else (including a signed-in regular user) owns none.
 */
async function listTownsFor(user) {
  if (!user) return [];
  if (user.role === 'super_admin') return [...TOWNS];
  if (user.role !== 'admin') return [];

  const rows = await db.query('SELECT town FROM admin_towns WHERE user_id = ?', [user.id]);
  return rows.map(row => row.town);
}

/** Whether `user` may act as an admin for `town` specifically. */
async function isAdminForTown(user, town) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role !== 'admin') return false;

  const row = await db.queryOne(
    'SELECT id FROM admin_towns WHERE user_id = ? AND town = ?',
    [user.id, town]
  );
  return Boolean(row);
}

/**
 * A `WHERE`-clause fragment (with its bound params) that scopes any query
 * touching `${alias}.town` to what `user` may administer — the same pattern
 * `nokoot.service.js` uses for `WHERE user_id = ?`, just for towns instead of
 * a single owner. `super_admin` gets no restriction at all (`''`). A scoped
 * `admin` with zero `admin_towns` rows gets `AND 1 = 0` — fails closed rather
 * than silently falling through to "no restriction".
 */
async function townScopeClause(user, alias = 'e') {
  assertValidAlias(alias);

  if (user && user.role === 'super_admin') return { clause: '', params: [] };

  const towns = await listTownsFor(user);
  if (!towns.length) return { clause: ' AND 1 = 0', params: [] };

  const placeholders = towns.map(() => '?').join(', ');
  return { clause: ` AND ${alias}.town IN (${placeholders})`, params: towns };
}

/**
 * Loads one event, throwing the same 404 whether it does not exist at all or
 * exists outside `user`'s towns — a 403 would confirm existence to someone
 * who cannot see it, which is exactly what rule 3 of the admin-scoping spec
 * forbids. This is the single place that check happens; every per-id admin
 * route calls this before touching the event.
 */
async function assertEventInScope(user, eventId) {
  const { clause, params } = await townScopeClause(user, 'e');
  const event = await db.queryOne(
    `SELECT e.* FROM events e WHERE e.id = ?${clause}`,
    [eventId, ...params]
  );
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');
  return event;
}

module.exports = {
  listTownsFor,
  isAdminForTown,
  townScopeClause,
  assertEventInScope
};
