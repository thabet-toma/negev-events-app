'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const townsService = require('./towns.service');

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
  if (user.role === 'super_admin') return townsService.activeNames();
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
 * Resolves the audience a broadcast from `user` should be written to, for BOTH
 * roles (issue #85, story 23/24; issue #128) — the sole module that decides it
 * (CLAUDE.md: «نطاق الأدمن المحلي داخل الاستعلام لا في الراوتر»), same as
 * `assertEventInScope` for a single event. The route layer only shapes the raw
 * request body and hands over `req.user` + `req.body.towns`.
 *
 * A `super_admin` names nothing by default: one `[null]` row, the platform-wide
 * broadcast, exactly as before. When it DOES name a governorate (or a town),
 * the audience narrows to that governorate's active towns — see
 * `resolvePlatformBroadcastTowns` below.
 *
 * A town-scoped `admin`: `requestedTowns` empty defaults to every town `user`
 * owns; naming even one town outside that ownership is 404, never 403 — the
 * same "never confirm what the caller doesn't own" rule `assertEventInScope`
 * already follows. An admin owning zero towns is refused outright before any
 * town list is even considered (story 24).
 *
 * A governorate's own name is a broadcast target too: it expands HERE — and
 * only here — into that governorate's active towns, then meets the admin's own
 * scope, so an admin holding two towns of a governorate reaches those two and
 * nobody else, and one holding none of its towns gets the very same 404 a
 * foreign town name gets (never 403).
 *
 * A name the admin owns verbatim wins before that expansion: `admin_towns` may
 * hold a governorate's own name (a region-level scope), and such an admin keeps
 * broadcasting exactly as before instead of being narrowed to towns they never
 * held. Expansion is additive; it replaces nothing.
 */
async function resolveBroadcastTowns(user, requestedTowns) {
  if (user && user.role === 'super_admin') return resolvePlatformBroadcastTowns(requestedTowns);

  const ownTowns = await listTownsFor(user);
  if (!ownTowns.length) {
    throw ApiError.badRequest('لا تملك أي بلدة مُسنَدة، فلا يمكنك بثّ تعميم لأحد');
  }
  if (!requestedTowns.length) return ownTowns;

  const regionsByName = new Map(
    (await townsService.listActiveRegions()).map(region => [region.name, region])
  );

  /** One row per town, in the order the caller named them — never a repeat. */
  const resolved = [];
  const add = town => { if (!resolved.includes(town)) resolved.push(town); };
  for (const requested of requestedTowns) {
    if (ownTowns.includes(requested)) {
      add(requested);
      continue;
    }
    const region = regionsByName.get(requested);
    if (!region) {
      throw ApiError.notFound('بلدة غير موجودة ضمن نطاقك');
    }
    const ownInRegion = region.towns.filter(town => ownTowns.includes(town));
    if (!ownInRegion.length) {
      throw ApiError.notFound('بلدة غير موجودة ضمن نطاقك');
    }
    ownInRegion.forEach(add);
  }
  return resolved;
}

/**
 * The `super_admin`'s broadcast audience (issue #128): `[null]` — one
 * platform-wide row — unless the request names a place, in which case a town
 * stays itself and a governorate becomes its active towns, one row per town
 * (`scope_town` never holds a governorate's own name: readers scope on real
 * town names, and a user's `clan_town` is a town name). Naming nothing keeps
 * the old global behaviour byte for byte.
 *
 * An unknown place is 404, the same refusal a town admin gets for a town
 * outside its scope, and a name set that expands to no active town at all is a
 * 400 rather than a silent "broadcast to nobody" (zero rows, success):
 * `sendBroadcast` writes one row per entry, so an empty audience must never
 * reach it.
 */
async function resolvePlatformBroadcastTowns(requestedTowns) {
  if (!requestedTowns.length) return [null];

  const [activeTowns, regions] = await Promise.all([
    townsService.activeNames(),
    townsService.listActiveRegions()
  ]);
  const regionsByName = new Map(regions.map(region => [region.name, region]));

  /** One row per town, in the order the caller named them — never a repeat. */
  const resolved = [];
  const add = town => { if (!resolved.includes(town)) resolved.push(town); };
  for (const requested of requestedTowns) {
    if (activeTowns.includes(requested)) {
      add(requested);
      continue;
    }
    const region = regionsByName.get(requested);
    if (!region) {
      throw ApiError.notFound('بلدة أو محافظة غير معروفة');
    }
    region.towns.forEach(add);
  }
  if (!resolved.length) {
    throw ApiError.badRequest('لا بلدات نشطة في المحافظة المختارة بعد، فلا يمكن البثّ إليها');
  }
  return resolved;
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

/**
 * Scope for anything that hangs off an album. An album used to reach a town
 * only through its event; an honoree album has no event, so its own `town`
 * is the scope — same town list, same `AND 1 = 0` fail-closed, same 404 rule.
 * `townScopeClause` stays what it is: it scopes an `events.town`, which a
 * no-event album does not have, so this parallel form is added instead of
 * loosening it (2026-10).
 */
async function albumScopeClause(user, { eventAlias = 'e', albumAlias = 'al' } = {}) {
  assertValidAlias(eventAlias);
  assertValidAlias(albumAlias);

  if (user && user.role === 'super_admin') return { clause: '', params: [] };

  const towns = await listTownsFor(user);
  if (!towns.length) return { clause: ' AND 1 = 0', params: [] };

  const placeholders = towns.map(() => '?').join(', ');
  return {
    clause: ` AND (${eventAlias}.town IN (${placeholders}) OR (${albumAlias}.event_id IS NULL AND ${albumAlias}.town IN (${placeholders})))`,
    params: [...towns, ...towns]
  };
}

/**
 * One album, only if its event is inside `user`'s towns — or, for an album
 * with no event, its own town is — the same 404 for "missing" and "outside
 * your scope", so existence is never confirmed to an admin who cannot see
 * it. Every album route calls this before a write; the album's own queries
 * never trust a client-supplied event id.
 */
async function assertAlbumInScope(user, albumId) {
  const { clause, params } = await albumScopeClause(user, { eventAlias: 'e', albumAlias: 'a' });
  const album = await db.queryOne(
    `SELECT a.* FROM event_albums a LEFT JOIN events e ON e.id = a.event_id WHERE a.id = ?${clause}`,
    [albumId, ...params]
  );
  if (!album) throw ApiError.notFound('الألبوم غير موجود');
  return album;
}

/** One photo, scoped through its album exactly as assertAlbumInScope. */
async function assertPhotoInScope(user, photoId) {
  const { clause, params } = await albumScopeClause(user, { eventAlias: 'e', albumAlias: 'a' });
  const photo = await db.queryOne(
    `SELECT p.*, a.event_id
       FROM event_photos p
       JOIN event_albums a ON a.id = p.album_id
       LEFT JOIN events e ON e.id = a.event_id
      WHERE p.id = ?${clause}`,
    [photoId, ...params]
  );
  if (!photo) throw ApiError.notFound('الصورة غير موجودة');
  return photo;
}

module.exports = {
  listTownsFor,
  isAdminForTown,
  townScopeClause,
  albumScopeClause,
  resolveBroadcastTowns,
  assertEventInScope,
  assertAlbumInScope,
  assertPhotoInScope
};
