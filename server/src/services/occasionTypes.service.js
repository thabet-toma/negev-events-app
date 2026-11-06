'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');

const BOOLEAN_COLUMNS = [
  'is_active', 'creates_collision', 'warns_others', 'premoderate_messages',
  'show_congratulations_count', 'show_followers_count', 'show_views_count',
  'legacy_client_supported', 'archive_gallery', 'rsvp_enabled', 'show_rsvp_count'
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

/**
 * The pre-written messages of a batch of types (تذكرة #170): «بارك»/«عزّي»
 * opens a «اختر رسالة» sheet filled from here, so the copy lives in the
 * database — one place for every client — never as a constant in the code.
 *
 * `activeOnly` is the public read's rule («النشِط وحده»): a message the
 * super_admin switched off must not reach a client. The admin read passes
 * everything, otherwise a switched-off message would vanish from the panel
 * and could never be switched back on.
 *
 * Each entry is `{ id, body }` — the position is the order this query already
 * applies, and the public caller needs nothing but the text.
 */
async function attachMessages(types, { activeOnly = false } = {}) {
  if (!types.length) return types;

  const ids = types.map(type => type.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT id, occasion_type_id, body, position, is_active
       FROM occasion_type_messages
      WHERE occasion_type_id IN (${placeholders}) ${activeOnly ? 'AND is_active = 1' : ''}
      ORDER BY position ASC, id ASC`,
    ids
  );

  const byType = {};
  for (const row of rows) {
    (byType[row.occasion_type_id] || (byType[row.occasion_type_id] = [])).push(row);
  }

  return types.map(type => ({
    ...type,
    messages: (byType[type.id] || []).map(row => (activeOnly
      ? { id: row.id, body: row.body }
      : { id: row.id, body: row.body, position: row.position, is_active: Boolean(row.is_active) }))
  }));
}

/** Active occasion types, ordered for display, with their visible fields and reactions. */
async function listPublicTypes() {
  const types = await db.query('SELECT * FROM occasion_types WHERE is_active = 1 ORDER BY position ASC, id ASC');
  const withRelations = await attachFieldsAndReactions(types, { visibleFieldsOnly: true });
  return attachMessages(withRelations, { activeOnly: true });
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

/**
 * The one occasion type a client with no `X-App-Version` header understands
 * — every pre-#20 client was built around a single, wedding-shaped occasion,
 * before occasion types existed at all. Derived from `position` (the type
 * placed first among active types), never from `name`, so renaming or
 * relabeling عرس never breaks this — only reordering it would (#20 step 4).
 */
async function getLegacyTypeIds() {
  const rows = await db.query(
    'SELECT id FROM occasion_types WHERE is_active = 1 AND legacy_client_supported = 1'
  );
  return rows.map(row => row.id);
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
  const withMessages = await attachMessages(withRelations);
  return withMessages.map(type => ({ ...type, events_count: Number(type.events_count) }));
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
          show_views_count, congratulations_label, default_badge_title, tone, archive_gallery,
          rsvp_enabled, show_rsvp_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name, data.icon, data.color, data.position, data.is_active ? 1 : 0,
        data.creates_collision ? 1 : 0, data.warns_others ? 1 : 0, data.premoderate_messages ? 1 : 0,
        data.show_congratulations_count ? 1 : 0, data.show_followers_count ? 1 : 0,
        data.show_views_count ? 1 : 0, data.congratulations_label, data.default_badge_title || null,
        data.tone, data.archive_gallery ? 1 : 0,
        data.rsvp_enabled ? 1 : 0, data.show_rsvp_count ? 1 : 0
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
    'show_views_count', 'congratulations_label', 'default_badge_title',
    'default_poster_url', 'legacy_client_supported', 'tone', 'archive_gallery',
    'rsvp_enabled', 'show_rsvp_count'
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

// --- الرسائل الجاهزة (تذكرة #170) -------------------------------------
//
// The one place that writes `occasion_type_messages`. The route layer owns
// validation and the name of the error; this layer owns the SQL. The type is
// checked first so a message under a missing type is a 404, never a stray row.

/** Every message of one type — active and switched off — for its admin editor. */
async function listMessagesForType(typeId) {
  const type = await db.queryOne('SELECT id FROM occasion_types WHERE id = ?', [typeId]);
  if (!type) throw ApiError.notFound('نوع المناسبة غير موجود');

  const rows = await db.query(
    `SELECT id, body, position, is_active FROM occasion_type_messages
      WHERE occasion_type_id = ?
      ORDER BY position ASC, id ASC`,
    [typeId]
  );
  return rows.map(row => ({ ...row, is_active: Boolean(row.is_active) }));
}

/** Adds one message at the end of its type's list unless a position is given. */
async function createMessage(typeId, { body, position, isActive }) {
  const type = await db.queryOne('SELECT id FROM occasion_types WHERE id = ?', [typeId]);
  if (!type) throw ApiError.notFound('نوع المناسبة غير موجود');

  let resolvedPosition = position;
  if (resolvedPosition === undefined || resolvedPosition === null) {
    // خلف آخر رسالة دائماً: رسالة جديدة تكتبها الإدارة تُقرأ في مكانها الطبيعي
    // بدل أن تظهر فوق رسائل النوع المزروعة بترتيب صفرٍ متساوٍ.
    const last = await db.queryOne(
      'SELECT COALESCE(MAX(position), 0) AS last FROM occasion_type_messages WHERE occasion_type_id = ?',
      [typeId]
    );
    resolvedPosition = Number(last.last) + 1;
  }

  const [result] = await db.execute(
    `INSERT INTO occasion_type_messages (occasion_type_id, body, position, is_active)
     VALUES (?, ?, ?, ?)`,
    [typeId, body, resolvedPosition, isActive === false ? 0 : 1]
  );

  const row = await db.queryOne(
    'SELECT id, body, position, is_active FROM occasion_type_messages WHERE id = ?',
    [result.insertId]
  );
  return { ...row, is_active: Boolean(row.is_active) };
}

/**
 * Partial update: only the keys the caller sent are written, so switching a
 * message off never rewrites its text. A message id that belongs to another
 * type is a 404 — the WHERE clause carries the type, so a wrong id cannot
 * reach another type's rows.
 */
async function updateMessage(typeId, messageId, { body, position, isActive }) {
  const existing = await db.queryOne(
    'SELECT id FROM occasion_type_messages WHERE id = ? AND occasion_type_id = ?',
    [messageId, typeId]
  );
  if (!existing) throw ApiError.notFound('الرسالة الجاهزة غير موجودة');

  const assignments = [];
  const params = [];
  if (body !== undefined) { assignments.push('body = ?'); params.push(body); }
  if (position !== undefined) { assignments.push('position = ?'); params.push(position); }
  if (isActive !== undefined) { assignments.push('is_active = ?'); params.push(isActive ? 1 : 0); }

  if (assignments.length) {
    params.push(messageId, typeId);
    await db.execute(
      `UPDATE occasion_type_messages SET ${assignments.join(', ')} WHERE id = ? AND occasion_type_id = ?`,
      params
    );
  }

  const row = await db.queryOne(
    'SELECT id, body, position, is_active FROM occasion_type_messages WHERE id = ?',
    [messageId]
  );
  return { ...row, is_active: Boolean(row.is_active) };
}

module.exports = {
  listPublicTypes,
  getTypeById,
  getTypesByIds,
  getLegacyTypeIds,
  listAllTypesForAdmin,
  createType,
  updateType,
  deleteType,
  listMessagesForType,
  createMessage,
  updateMessage
};
