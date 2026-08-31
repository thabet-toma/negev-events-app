'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');

const BOOLEAN_COLUMNS = [
  'is_active', 'creates_collision', 'warns_others', 'premoderate_messages',
  'show_congratulations_count', 'show_followers_count', 'show_views_count'
];

function castBooleans(type) {
  const out = { ...type };
  for (const column of BOOLEAN_COLUMNS) {
    if (column in out) out[column] = Boolean(out[column]);
  }
  return out;
}

/** Attaches each type's field rows and reaction list in two batched queries. */
async function attachFieldsAndReactions(types, { visibleFieldsOnly = false } = {}) {
  if (!types.length) return [];

  const ids = types.map(type => type.id);
  const placeholders = ids.map(() => '?').join(',');

  const [fieldRows, reactionRows] = await Promise.all([
    db.query(
      `SELECT * FROM occasion_type_fields
        WHERE occasion_type_id IN (${placeholders}) ${visibleFieldsOnly ? 'AND is_visible = 1' : ''}
        ORDER BY position ASC, id ASC`,
      ids
    ),
    db.query(
      `SELECT * FROM occasion_type_reactions WHERE occasion_type_id IN (${placeholders}) ORDER BY id ASC`,
      ids
    )
  ]);

  const fieldsByType = {};
  for (const row of fieldRows) {
    (fieldsByType[row.occasion_type_id] || (fieldsByType[row.occasion_type_id] = [])).push({
      field_key: row.field_key,
      label: row.label,
      is_visible: Boolean(row.is_visible),
      is_required: Boolean(row.is_required),
      position: row.position
    });
  }

  const reactionsByType = {};
  for (const row of reactionRows) {
    (reactionsByType[row.occasion_type_id] || (reactionsByType[row.occasion_type_id] = [])).push(row.reaction_type);
  }

  return types.map(type => ({
    ...castBooleans(type),
    fields: fieldsByType[type.id] || [],
    reactions: reactionsByType[type.id] || []
  }));
}

/** Active occasion types, ordered for display, with their visible fields and reactions. */
async function listPublicTypes() {
  const types = await db.query('SELECT * FROM occasion_types WHERE is_active = 1 ORDER BY position ASC, id ASC');
  return attachFieldsAndReactions(types, { visibleFieldsOnly: true });
}

/**
 * A single type with its visible fields and reactions, or null. Used by the
 * event-publish flow to confirm the chosen type exists/is active and to
 * drive per-type required-field checks — never by branching on `name`.
 */
async function getTypeById(id) {
  const type = await db.queryOne('SELECT * FROM occasion_types WHERE id = ?', [id]);
  if (!type) return null;
  const [withRelations] = await attachFieldsAndReactions([type], { visibleFieldsOnly: true });
  return withRelations;
}

/** Batched id -> type-with-fields lookup, for attaching a type to a list of events. */
async function getTypesByIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) return {};

  const placeholders = uniqueIds.map(() => '?').join(',');
  const types = await db.query(`SELECT * FROM occasion_types WHERE id IN (${placeholders})`, uniqueIds);
  const withRelations = await attachFieldsAndReactions(types, { visibleFieldsOnly: true });

  const map = {};
  for (const type of withRelations) map[type.id] = type;
  return map;
}

/** Every occasion type (active and disabled), with its published-event count, for the admin panel. */
async function listAllTypesForAdmin() {
  const types = await db.query(
    `SELECT ot.*, COUNT(e.id) AS events_count
       FROM occasion_types ot
       LEFT JOIN events e ON e.occasion_type_id = ot.id
      GROUP BY ot.id
      ORDER BY ot.position ASC, ot.id ASC`
  );
  const withRelations = await attachFieldsAndReactions(types);
  return withRelations.map(type => ({ ...type, events_count: Number(type.events_count) }));
}

/**
 * Creates an occasion type plus its field and reaction rows in one
 * transaction. `data.fields` and `data.reactions` are assumed already
 * validated by the route layer (field_key membership, core-field presence,
 * reaction_type membership) — this function only owns the SQL.
 */
async function createType(data) {
  const existing = await db.queryOne('SELECT id FROM occasion_types WHERE name = ?', [data.name]);
  if (existing) throw ApiError.conflict('يوجد نوع مناسبة بهذا الاسم مسبقاً');

  return db.transaction(async connection => {
    const [result] = await connection.execute(
      `INSERT INTO occasion_types
         (name, icon, color, position, is_active, creates_collision, warns_others,
          premoderate_messages, show_congratulations_count, show_followers_count,
          show_views_count, congratulations_label, default_badge_title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name, data.icon, data.color, data.position, data.is_active ? 1 : 0,
        data.creates_collision ? 1 : 0, data.warns_others ? 1 : 0, data.premoderate_messages ? 1 : 0,
        data.show_congratulations_count ? 1 : 0, data.show_followers_count ? 1 : 0,
        data.show_views_count ? 1 : 0, data.congratulations_label, data.default_badge_title || null
      ]
    );
    const typeId = result.insertId;

    for (const field of data.fields) {
      await connection.execute(
        `INSERT INTO occasion_type_fields (occasion_type_id, field_key, label, is_visible, is_required, position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [typeId, field.field_key, field.label, field.is_visible ? 1 : 0, field.is_required ? 1 : 0, field.position]
      );
    }

    for (const reactionType of data.reactions) {
      await connection.execute(
        'INSERT INTO occasion_type_reactions (occasion_type_id, reaction_type) VALUES (?, ?)',
        [typeId, reactionType]
      );
    }

    return typeId;
  });
}

/**
 * Partial update. Only columns present in `data` are written; `data.fields`
 * / `data.reactions`, when present, fully replace the existing rows for that
 * type (already validated by the route layer, same rule as createType).
 */
async function updateType(id, data) {
  const existing = await db.queryOne('SELECT id FROM occasion_types WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('نوع المناسبة غير موجود');

  if (data.name !== undefined) {
    const duplicate = await db.queryOne('SELECT id FROM occasion_types WHERE name = ? AND id <> ?', [data.name, id]);
    if (duplicate) throw ApiError.conflict('يوجد نوع مناسبة بهذا الاسم مسبقاً');
  }

  const columns = [
    'name', 'icon', 'color', 'position', 'is_active', 'creates_collision', 'warns_others',
    'premoderate_messages', 'show_congratulations_count', 'show_followers_count',
    'show_views_count', 'congratulations_label', 'default_badge_title'
  ];

  await db.transaction(async connection => {
    const assignments = [];
    const params = [];
    for (const column of columns) {
      if (data[column] === undefined) continue;
      assignments.push(`${column} = ?`);
      params.push(BOOLEAN_COLUMNS.includes(column) ? (data[column] ? 1 : 0) : data[column]);
    }

    if (assignments.length) {
      params.push(id);
      await connection.execute(`UPDATE occasion_types SET ${assignments.join(', ')} WHERE id = ?`, params);
    }

    if (data.fields) {
      await connection.execute('DELETE FROM occasion_type_fields WHERE occasion_type_id = ?', [id]);
      for (const field of data.fields) {
        await connection.execute(
          `INSERT INTO occasion_type_fields (occasion_type_id, field_key, label, is_visible, is_required, position)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, field.field_key, field.label, field.is_visible ? 1 : 0, field.is_required ? 1 : 0, field.position]
        );
      }
    }

    if (data.reactions) {
      await connection.execute('DELETE FROM occasion_type_reactions WHERE occasion_type_id = ?', [id]);
      for (const reactionType of data.reactions) {
        await connection.execute(
          'INSERT INTO occasion_type_reactions (occasion_type_id, reaction_type) VALUES (?, ?)',
          [id, reactionType]
        );
      }
    }
  });

  const [type] = await attachFieldsAndReactions([await db.queryOne('SELECT * FROM occasion_types WHERE id = ?', [id])]);
  return type;
}

/**
 * A type with no events is deleted outright. A type with at least one event
 * cannot be deleted — real published occasions must not disappear — so it is
 * disabled (is_active = 0) instead, and the caller is told why.
 */
async function deleteType(id) {
  const existing = await db.queryOne('SELECT id FROM occasion_types WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('نوع المناسبة غير موجود');

  const { total } = await db.queryOne('SELECT COUNT(*) AS total FROM events WHERE occasion_type_id = ?', [id]);
  if (Number(total) === 0) {
    await db.execute('DELETE FROM occasion_types WHERE id = ?', [id]);
    return { deleted: true, disabled: false };
  }

  await db.execute('UPDATE occasion_types SET is_active = 0 WHERE id = ?', [id]);
  throw ApiError.conflict('لا يمكن حذف هذا النوع لوجود مناسبات مرتبطة به — تم تعطيله بدلاً من حذفه');
}

module.exports = {
  listPublicTypes,
  getTypeById,
  getTypesByIds,
  listAllTypesForAdmin,
  createType,
  updateType,
  deleteType
};
