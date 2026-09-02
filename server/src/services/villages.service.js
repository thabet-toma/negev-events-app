'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');

/**
 * `latitude`/`longitude` come back from mysql2 as strings (DECIMAL columns) —
 * every response shapes them as numbers, the same way `TOWN_COORDINATES`
 * values already are, so a client never has to parse them itself.
 */
function shapeVillage(row) {
  if (!row) return row;
  return {
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    position: Number(row.position),
    is_active: Boolean(row.is_active)
  };
}

/**
 * Active villages, ordered for display. This is the function a sibling's
 * `GET /api/towns` calls to fill its new `villages` key — the contract is
 * `{ id, name, latitude, longitude, position }`, no `is_active` (every row
 * here is already active by definition).
 */
async function listActive() {
  const rows = await db.query(
    `SELECT id, name, latitude, longitude, position
       FROM villages
      WHERE is_active = 1
      ORDER BY position ASC, name ASC`
  );
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    position: Number(row.position)
  }));
}

/** One active village, or null when it does not exist or is disabled. */
async function findActiveById(id) {
  const row = await db.queryOne(
    'SELECT * FROM villages WHERE id = ? AND is_active = 1',
    [id]
  );
  return row ? shapeVillage(row) : null;
}

/** Every village (active and disabled), with its attached-event count, for the super_admin panel. */
async function listAllForAdmin() {
  const rows = await db.query(
    `SELECT v.*, COUNT(e.id) AS events_count
       FROM villages v
       LEFT JOIN events e ON e.village_id = v.id
      GROUP BY v.id
      ORDER BY v.position ASC, v.name ASC`
  );
  return rows.map(row => ({ ...shapeVillage(row), events_count: Number(row.events_count) }));
}

/** Creates a village. Coordinates are already validated (range + presence) by the route layer. */
async function createVillage(data) {
  const existing = await db.queryOne('SELECT id FROM villages WHERE name = ?', [data.name]);
  if (existing) throw ApiError.conflict('توجد قرية بهذا الاسم مسبقاً');

  const { insertId } = await db.execute(
    `INSERT INTO villages (name, latitude, longitude, position, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [data.name, data.latitude, data.longitude, data.position ?? 0, data.is_active !== false ? 1 : 0]
  );
  return findByIdForAdmin(insertId);
}

async function findByIdForAdmin(id) {
  const row = await db.queryOne('SELECT * FROM villages WHERE id = ?', [id]);
  return row ? shapeVillage(row) : null;
}

/** Partial update — only columns present in `data` are written. */
async function updateVillage(id, data) {
  const existing = await db.queryOne('SELECT id FROM villages WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('القرية غير موجودة');

  if (data.name !== undefined) {
    const duplicate = await db.queryOne('SELECT id FROM villages WHERE name = ? AND id <> ?', [data.name, id]);
    if (duplicate) throw ApiError.conflict('توجد قرية بهذا الاسم مسبقاً');
  }

  const columns = ['name', 'latitude', 'longitude', 'position', 'is_active'];
  const assignments = [];
  const params = [];
  for (const column of columns) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(column === 'is_active' ? (data[column] ? 1 : 0) : data[column]);
  }

  if (assignments.length) {
    params.push(id);
    await db.execute(`UPDATE villages SET ${assignments.join(', ')} WHERE id = ?`, params);
  }

  return findByIdForAdmin(id);
}

/**
 * A village with no events attached is deleted outright. A village that has
 * at least one event cannot be deleted — `events.village_id` is `ON DELETE
 * RESTRICT` — so it is disabled instead, and the caller is told why (mirrors
 * `occasionTypes.service.deleteType`, and story 33's own wording).
 */
async function deleteVillage(id) {
  const existing = await db.queryOne('SELECT id FROM villages WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('القرية غير موجودة');

  const { total } = await db.queryOne('SELECT COUNT(*) AS total FROM events WHERE village_id = ?', [id]);
  if (Number(total) === 0) {
    await db.execute('DELETE FROM villages WHERE id = ?', [id]);
    return { deleted: true, disabled: false };
  }

  // Deactivating is the outcome the super_admin actually asked for when the
  // village still holds events (#33) — so this succeeds and says what it did,
  // rather than throwing a conflict after having already written. An error
  // response that mutated state is a trap for whoever reads the log later.
  await db.execute('UPDATE villages SET is_active = 0 WHERE id = ?', [id]);
  return { deleted: false, disabled: true };
}

module.exports = {
  listActive,
  findActiveById,
  listAllForAdmin,
  createVillage,
  updateVillage,
  deleteVillage
};
