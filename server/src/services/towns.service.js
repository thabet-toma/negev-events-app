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

/**
 * Active regions (محافظات) in display order, each with the names of its own
 * active towns: `{ id, name, latitude, longitude, map_zoom, position, towns }`.
 * A region's name is itself a valid place for an event whose town is not
 * known — its centre only opens a map, it is never written as a pin.
 */
async function listActiveRegions() {
  const [regions, towns] = await Promise.all([
    db.query(
      `SELECT id, name, latitude, longitude, map_zoom, position
         FROM regions
        WHERE is_active = 1
        ORDER BY position ASC, id ASC`
    ),
    listActive()
  ]);
  return regions.map(region => ({
    id: region.id,
    name: region.name,
    latitude: Number(region.latitude),
    longitude: Number(region.longitude),
    map_zoom: Number(region.map_zoom),
    position: Number(region.position),
    towns: towns.filter(town => town.region_id === region.id).map(town => town.name)
  }));
}

/** Names of every active region, in display order. */
async function activeRegionNames() {
  return (await listActiveRegions()).map(region => region.name);
}

/** Whether `name` is a region's name (active or not) — i.e. a region-level place, never a town. */
async function isRegionName(name) {
  if (!name) return false;
  const rows = await db.query('SELECT name FROM regions');
  return rows.some(row => row.name === name);
}

/**
 * Whether `name` may be written as an event's town on publish/edit: an
 * active town, or an active region's own name ("النقب — بلا بلدة محدّدة").
 */
async function isActivePlace(name) {
  if (!name) return false;
  const [towns, regions] = await Promise.all([activeNames(), activeRegionNames()]);
  return towns.includes(name) || regions.includes(name);
}

/**
 * Names of every town row, active or disabled. Assignment lists (an admin's
 * towns, a provider's towns) are saved as a full set, so a town disabled
 * after it was assigned must not make re-saving the unchanged set fail.
 */
async function knownTownNames() {
  const rows = await db.query('SELECT name FROM towns');
  return rows.map(row => row.name);
}

/** `knownTownNames` plus every region's own name — what an admin's scope may hold. */
async function knownPlaceNames() {
  const [towns, regions] = await Promise.all([
    knownTownNames(),
    db.query('SELECT name FROM regions')
  ]);
  return [...towns, ...regions.map(row => row.name)];
}

/**
 * The region a place with no known town falls back to — the first active
 * region. With a single region (today: النقب) this is unambiguous; it is the
 * one call to revisit when a second region goes live.
 */
async function defaultRegionName() {
  const [first] = await activeRegionNames();
  return first || null;
}

module.exports = {
  listActive,
  activeNames,
  coordinatesByName,
  isActiveTown,
  listActiveRegions,
  activeRegionNames,
  isRegionName,
  isActivePlace,
  knownTownNames,
  knownPlaceNames,
  defaultRegionName
};
