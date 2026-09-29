'use strict';

const db = require('../db/pool');

/**
 * The runtime source of towns (and, above them, regions) — replacing the
 * TOWNS / TOWN_COORDINATES constants. Deliberately uncached: the table holds
 * a handful of rows, a query is cheaper than a stale in-process copy after a
 * super_admin adds or disables a town, and there is no invalidation to get
 * wrong if the server ever runs as more than one process.
 *
 * Every other table stores a town by its NAME, so the name is what callers
 * validate against — exactly as `TOWNS.includes(name)` did before.
 */

/** DECIMAL columns come back from mysql2 as strings; the villages catch-all has none. */
function toCoordinate(value) {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * Active towns in display order: `{ id, region_id, name, latitude, longitude, position }`,
 * coordinates as numbers (or null for the villages catch-all).
 */
async function listActive() {
  const rows = await db.query(
    `SELECT t.id, t.region_id, t.name, t.latitude, t.longitude, t.position
       FROM towns t
       JOIN regions r ON r.id = t.region_id
      WHERE t.is_active = 1 AND r.is_active = 1
      ORDER BY r.position ASC, r.id ASC, t.position ASC, t.id ASC`
  );
  return rows.map(row => ({
    id: row.id,
    region_id: row.region_id,
    name: row.name,
    latitude: toCoordinate(row.latitude),
    longitude: toCoordinate(row.longitude),
    position: Number(row.position)
  }));
}

/** Names of every active town, in display order. */
async function activeNames() {
  return (await listActive()).map(town => town.name);
}

/**
 * `{ name: { lat, lng } }` for every active town that has a centre — the
 * exact shape TOWN_COORDINATES had, so `GET /api/towns` and the map
 * fallback keep their contract. The villages catch-all has no entry.
 */
async function coordinatesByName() {
  const coordinates = {};
  for (const town of await listActive()) {
    if (town.latitude !== null && town.longitude !== null) {
      coordinates[town.name] = { lat: town.latitude, lng: town.longitude };
    }
  }
  return coordinates;
}

/**
 * Whether `name` is an active town. Compared in JS, not with `WHERE name = ?`,
 * so matching stays byte-exact like `TOWNS.includes` — the column's
 * utf8mb4_unicode_ci collation would otherwise let a spelling variant through
 * and store it on the event as-is.
 */
async function isActiveTown(name) {
  if (!name) return false;
  return (await activeNames()).includes(name);
}

module.exports = {
  listActive,
  activeNames,
  coordinatesByName,
  isActiveTown
};
