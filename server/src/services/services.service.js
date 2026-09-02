'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const adminScope = require('./adminScope.service');
const { absoluteMediaUrl } = require('../utils/mediaUrl');
const { TOWNS } = require('../constants');

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

function safeLimit(limit) {
  return Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}
function safePage(page) {
  return Math.max(Number.parseInt(page, 10) || 1, 1);
}

function shapeCategory(row) {
  if (!row) return row;
  return { ...row, position: Number(row.position), is_active: Boolean(row.is_active) };
}

// ======================================================================
// Service categories — super_admin runtime data (story 34), same shape as
// occasion types: no deploy, no migration, just rows.
// ======================================================================

async function listActiveCategories() {
  const rows = await db.query(
    'SELECT id, name, icon, color, position FROM service_categories WHERE is_active = 1 ORDER BY position ASC, name ASC'
  );
  return rows.map(row => ({ ...row, position: Number(row.position) }));
}

async function listAllCategoriesForAdmin() {
  const rows = await db.query(
    `SELECT sc.*, COUNT(sp.id) AS providers_count
       FROM service_categories sc
       LEFT JOIN service_providers sp ON sp.category_id = sc.id
      GROUP BY sc.id
      ORDER BY sc.position ASC, sc.name ASC`
  );
  return rows.map(row => ({ ...shapeCategory(row), providers_count: Number(row.providers_count) }));
}

async function findCategoryByIdForAdmin(id) {
  const row = await db.queryOne('SELECT * FROM service_categories WHERE id = ?', [id]);
  return row ? shapeCategory(row) : null;
}

async function createCategory(data) {
  const existing = await db.queryOne('SELECT id FROM service_categories WHERE name = ?', [data.name]);
  if (existing) throw ApiError.conflict('توجد فئة خدمة بهذا الاسم مسبقاً');

  const { insertId } = await db.execute(
    `INSERT INTO service_categories (name, icon, color, position, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [data.name, data.icon, data.color, data.position ?? 0, data.is_active !== false ? 1 : 0]
  );
  return findCategoryByIdForAdmin(insertId);
}

async function updateCategory(id, data) {
  const existing = await db.queryOne('SELECT id FROM service_categories WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('فئة الخدمة غير موجودة');

  if (data.name !== undefined) {
    const duplicate = await db.queryOne('SELECT id FROM service_categories WHERE name = ? AND id <> ?', [data.name, id]);
    if (duplicate) throw ApiError.conflict('توجد فئة خدمة بهذا الاسم مسبقاً');
  }

  const columns = ['name', 'icon', 'color', 'position', 'is_active'];
  const assignments = [];
  const params = [];
  for (const column of columns) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(column === 'is_active' ? (data[column] ? 1 : 0) : data[column]);
  }

  if (assignments.length) {
    params.push(id);
    await db.execute(`UPDATE service_categories SET ${assignments.join(', ')} WHERE id = ?`, params);
  }

  return findCategoryByIdForAdmin(id);
}

/**
 * A category with no providers is deleted outright. A category still used by
 * at least one provider cannot be deleted — `service_providers.category_id`
 * is `ON DELETE RESTRICT` — so it is disabled instead (same treatment as
 * `villages.service.deleteVillage` and `occasionTypes.service.deleteType`).
 */
async function deleteCategory(id) {
  const existing = await db.queryOne('SELECT id FROM service_categories WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('فئة الخدمة غير موجودة');

  const { total } = await db.queryOne('SELECT COUNT(*) AS total FROM service_providers WHERE category_id = ?', [id]);
  if (Number(total) === 0) {
    await db.execute('DELETE FROM service_categories WHERE id = ?', [id]);
    return { deleted: true, disabled: false };
  }

  // Same contract as villages.service.deleteVillage: deactivating IS the
  // outcome asked for when the category still holds providers, so this
  // succeeds and reports what it did instead of throwing after having
  // already written. An error response that mutated state misleads whoever
  // reads the log later.
  await db.execute('UPDATE service_categories SET is_active = 0 WHERE id = ?', [id]);
  return { deleted: false, disabled: true };
}

// ======================================================================
// Public directory — no auth, browsable (story 18).
// ======================================================================

async function townsForProviders(providerIds) {
  if (!providerIds.length) return {};
  const placeholders = providerIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT provider_id, town FROM service_provider_towns WHERE provider_id IN (${placeholders}) ORDER BY town ASC`,
    providerIds
  );
  const map = {};
  for (const row of rows) {
    (map[row.provider_id] || (map[row.provider_id] = [])).push(row.town);
  }
  return map;
}

/**
 * A page of active providers. Deliberately does NOT select `phone` — this is
 * enforcement rule 6: the number must never reach a list response, not even
 * as a hidden field, so it cannot leak by a client rendering it by mistake.
 * It only ever comes back from `getPublicProviderById`.
 */
async function listPublicProviders({ categoryId, town, page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const limitVal = safeLimit(limit);
  const pageVal = safePage(page);

  const conditions = ['sp.is_active = 1'];
  const params = [];

  if (categoryId) {
    conditions.push('sp.category_id = ?');
    params.push(categoryId);
  }
  if (town) {
    conditions.push(
      'EXISTS (SELECT 1 FROM service_provider_towns spt WHERE spt.provider_id = sp.id AND spt.town = ?)'
    );
    params.push(town);
  }

  const whereClause = conditions.join(' AND ');

  const { total } = await db.queryOne(
    `SELECT COUNT(*) AS total FROM service_providers sp WHERE ${whereClause}`,
    params
  );

  const offset = (pageVal - 1) * limitVal;
  const rows = await db.query(
    `SELECT sp.id, sp.name, sp.category_id, sc.name AS category_name, sp.image_url
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE ${whereClause}
      ORDER BY sp.name ASC
      LIMIT ? OFFSET ?`,
    [...params, limitVal, offset]
  );

  const townsMap = await townsForProviders(rows.map(row => row.id));
  const providers = rows.map(row => ({
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    category_name: row.category_name,
    image_url: absoluteMediaUrl(row.image_url),
    towns: townsMap[row.id] || []
  }));

  return {
    providers,
    pagination: {
      page: pageVal,
      limit: limitVal,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limitVal)
    }
  };
}

/** One active provider, including `phone` — only reached by opening the provider explicitly (story 17). */
async function getPublicProviderById(id) {
  const row = await db.queryOne(
    `SELECT sp.id, sp.name, sp.category_id, sc.name AS category_name, sp.phone,
            sp.description, sp.image_url
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE sp.id = ? AND sp.is_active = 1`,
    [id]
  );
  if (!row) throw ApiError.notFound('مزوّد الخدمة غير موجود');

  const townsMap = await townsForProviders([id]);
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    category_name: row.category_name,
    phone: row.phone,
    description: row.description,
    image_url: absoluteMediaUrl(row.image_url),
    towns: townsMap[id] || []
  };
}

// ======================================================================
// Admin: service providers — `admin` role, scoped to their own towns
// (stories 28-29). Scoped INSIDE the SQL (an `EXISTS` against
// service_provider_towns), never by filtering an already-fetched array.
// ======================================================================

/** Every town in `towns` must belong to `TOWNS`, and to `user`'s own towns unless `user` is super_admin. */
async function assertTownsWithinScope(user, towns) {
  for (const town of towns) {
    if (!TOWNS.includes(town)) throw ApiError.badRequest(`البلدة "${town}" غير معروفة`);
  }
  if (user.role === 'super_admin') return;

  const allowed = await adminScope.listTownsFor(user);
  const outOfScope = towns.filter(town => !allowed.includes(town));
  if (outOfScope.length) {
    throw ApiError.forbidden(`لا تملك صلاحية إدارة مزوّدين في: ${outOfScope.join('، ')}`);
  }
}

/**
 * A `WHERE`-clause fragment scoping a `service_providers sp` query to what
 * `user` may administer, same "fail closed" shape as
 * `adminScope.service.townScopeClause`: `super_admin` gets no restriction,
 * a scoped `admin` gets an `EXISTS` against its own towns, and an admin with
 * zero assigned towns gets `AND 1 = 0`.
 */
async function providerScopeClause(user) {
  if (user.role === 'super_admin') return { clause: '', params: [] };

  const towns = await adminScope.listTownsFor(user);
  if (!towns.length) return { clause: ' AND 1 = 0', params: [] };

  const placeholders = towns.map(() => '?').join(', ');
  return {
    clause: ` AND EXISTS (SELECT 1 FROM service_provider_towns spt WHERE spt.provider_id = sp.id AND spt.town IN (${placeholders}))`,
    params: towns
  };
}

async function shapeAdminProvider(row) {
  const townsMap = await townsForProviders([row.id]);
  return {
    ...row,
    is_active: Boolean(row.is_active),
    image_url: absoluteMediaUrl(row.image_url),
    towns: townsMap[row.id] || []
  };
}

/** Providers serving at least one of `user`'s towns — fail-closed for a scopeless admin. */
async function listProvidersForAdmin(user, { categoryId, page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const limitVal = safeLimit(limit);
  const pageVal = safePage(page);

  const { clause: scopeClause, params: scopeParams } = await providerScopeClause(user);
  const conditions = ['1 = 1'];
  const params = [];
  if (categoryId) {
    conditions.push('sp.category_id = ?');
    params.push(categoryId);
  }

  const whereClause = conditions.join(' AND ') + scopeClause;
  const allParams = [...params, ...scopeParams];

  const { total } = await db.queryOne(
    `SELECT COUNT(*) AS total FROM service_providers sp WHERE ${whereClause}`,
    allParams
  );

  const offset = (pageVal - 1) * limitVal;
  const rows = await db.query(
    `SELECT sp.*, sc.name AS category_name
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE ${whereClause}
      ORDER BY sp.name ASC
      LIMIT ? OFFSET ?`,
    [...allParams, limitVal, offset]
  );

  const townsMap = await townsForProviders(rows.map(row => row.id));
  const providers = rows.map(row => ({
    ...row,
    is_active: Boolean(row.is_active),
    image_url: absoluteMediaUrl(row.image_url),
    towns: townsMap[row.id] || []
  }));

  return {
    providers,
    pagination: {
      page: pageVal,
      limit: limitVal,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limitVal)
    }
  };
}

/** Scoped single-provider lookup. 404 (not 403) when it exists but is out of scope — a 403 would confirm it exists. */
async function getProviderForAdmin(user, id) {
  const { clause: scopeClause, params: scopeParams } = await providerScopeClause(user);
  const row = await db.queryOne(
    `SELECT sp.*, sc.name AS category_name
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE sp.id = ?${scopeClause}`,
    [id, ...scopeParams]
  );
  if (!row) throw ApiError.notFound('مزوّد الخدمة غير موجود');
  return shapeAdminProvider(row);
}

/**
 * Creates a provider plus its town rows in one transaction.
 * `data.towns` is assumed already validated by the route layer (rule 7:
 * consent_at/consent_channel presence) and by `assertTownsWithinScope`
 * (containment). Optional columns are coerced to `null` explicitly — the raw
 * connection's `execute` inside `db.transaction` does not normalise
 * `undefined` to `null` the way `pool.js`'s own helpers do.
 */
async function createProvider(data) {
  const category = await db.queryOne('SELECT id FROM service_categories WHERE id = ?', [data.category_id]);
  if (!category) throw ApiError.badRequest('فئة الخدمة غير موجودة');

  return db.transaction(async connection => {
    const [result] = await connection.execute(
      `INSERT INTO service_providers
         (category_id, name, phone, description, image_url, is_active,
          consent_at, consent_by, consent_channel, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.category_id, data.name, data.phone,
        data.description ?? null, data.image_url ?? null,
        data.is_active !== false ? 1 : 0,
        data.consent_at, data.consent_by ?? null, data.consent_channel,
        data.created_by ?? null
      ]
    );
    const providerId = result.insertId;

    for (const town of data.towns) {
      await connection.execute(
        'INSERT INTO service_provider_towns (provider_id, town) VALUES (?, ?)',
        [providerId, town]
      );
    }

    return providerId;
  });
}

/**
 * Partial update. Only columns present in `data` are written; `data.towns`,
 * when present, fully replaces the existing rows (already validated by the
 * route layer — same rule as `createProvider`). `consent_at`/`consent_by`/
 * `consent_channel` are deliberately not editable here: they are the
 * audit trail of the original recorded permission, not a form field.
 */
async function updateProvider(id, data) {
  const columns = ['category_id', 'name', 'phone', 'description', 'image_url', 'is_active'];

  await db.transaction(async connection => {
    const assignments = [];
    const params = [];
    for (const column of columns) {
      if (data[column] === undefined) continue;
      assignments.push(`${column} = ?`);
      params.push(column === 'is_active' ? (data[column] ? 1 : 0) : (data[column] ?? null));
    }

    if (assignments.length) {
      params.push(id);
      await connection.execute(`UPDATE service_providers SET ${assignments.join(', ')} WHERE id = ?`, params);
    }

    if (data.towns) {
      await connection.execute('DELETE FROM service_provider_towns WHERE provider_id = ?', [id]);
      for (const town of data.towns) {
        await connection.execute(
          'INSERT INTO service_provider_towns (provider_id, town) VALUES (?, ?)',
          [id, town]
        );
      }
    }
  });
}

async function deleteProvider(id) {
  const { affectedRows } = await db.execute('DELETE FROM service_providers WHERE id = ?', [id]);
  if (!affectedRows) throw ApiError.notFound('مزوّد الخدمة غير موجود');
}

module.exports = {
  listActiveCategories,
  listAllCategoriesForAdmin,
  findCategoryByIdForAdmin,
  createCategory,
  updateCategory,
  deleteCategory,

  listPublicProviders,
  getPublicProviderById,

  assertTownsWithinScope,
  listProvidersForAdmin,
  getProviderForAdmin,
  createProvider,
  updateProvider,
  deleteProvider
};
