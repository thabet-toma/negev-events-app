'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const adminScope = require('./adminScope.service');
const townsService = require('./towns.service');
const { absoluteMediaUrl, withAbsoluteMedia } = require('../utils/mediaUrl');
const { PROVIDER_REVIEW_REPORT_THRESHOLD } = require('../constants');

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

function parseAttributes(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

async function attributesForCategories(categoryIds) {
  if (!categoryIds.length) return {};
  const placeholders = categoryIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT id, category_id, attr_key, label, attr_type, unit, sample_value, position, is_required
       FROM service_category_attributes
      WHERE category_id IN (${placeholders})
      ORDER BY position ASC, id ASC`,
    categoryIds
  );
  const map = {};
  for (const row of rows) {
    (map[row.category_id] || (map[row.category_id] = [])).push({
      id: row.id,
      category_id: row.category_id,
      attr_key: row.attr_key,
      label: row.label,
      attr_type: row.attr_type,
      unit: row.unit,
      sample_value: row.sample_value,
      position: Number(row.position),
      is_required: Boolean(row.is_required)
    });
  }
  return map;
}

async function saveCategoryAttributes(connection, categoryId, attributes) {
  if (!Array.isArray(attributes)) return;
  await connection.execute('DELETE FROM service_category_attributes WHERE category_id = ?', [categoryId]);
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (!attr || !attr.label) continue;
    const attrKey = (attr.attr_key || `attr_${i + 1}`).trim();
    await connection.execute(
      `INSERT INTO service_category_attributes
         (category_id, attr_key, label, attr_type, unit, sample_value, position, is_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        categoryId,
        attrKey,
        String(attr.label).trim(),
        ['number', 'text', 'boolean'].includes(attr.attr_type) ? attr.attr_type : 'text',
        attr.unit ? String(attr.unit).trim() : null,
        attr.sample_value ? String(attr.sample_value).trim() : null,
        Number.isInteger(attr.position) ? attr.position : i + 1,
        attr.is_required ? 1 : 0
      ]
    );
  }
}

// ======================================================================
// Service categories — super_admin runtime data (story 34), same shape as
// occasion types: no deploy, no migration, just rows.
// ======================================================================

async function listActiveCategories() {
  const rows = await db.query(
    'SELECT id, name, icon, color, position FROM service_categories WHERE is_active = 1 ORDER BY position ASC, name ASC'
  );
  const catIds = rows.map(r => r.id);
  const attrMap = await attributesForCategories(catIds);
  return rows.map(row => ({
    ...row,
    position: Number(row.position),
    attributes: attrMap[row.id] || []
  }));
}

async function listAllCategoriesForAdmin() {
  const rows = await db.query(
    `SELECT sc.*, COUNT(sp.id) AS providers_count
       FROM service_categories sc
       LEFT JOIN service_providers sp ON sp.category_id = sc.id
      GROUP BY sc.id
      ORDER BY sc.position ASC, sc.name ASC`
  );
  const catIds = rows.map(r => r.id);
  const attrMap = await attributesForCategories(catIds);
  return rows.map(row => ({
    ...shapeCategory(row),
    providers_count: Number(row.providers_count),
    attributes: attrMap[row.id] || []
  }));
}

async function findCategoryByIdForAdmin(id) {
  const row = await db.queryOne('SELECT * FROM service_categories WHERE id = ?', [id]);
  if (!row) return null;
  const attrMap = await attributesForCategories([id]);
  return {
    ...shapeCategory(row),
    attributes: attrMap[id] || []
  };
}

async function createCategory(data) {
  const existing = await db.queryOne('SELECT id FROM service_categories WHERE name = ?', [data.name]);
  if (existing) throw ApiError.conflict('توجد فئة خدمة بهذا الاسم مسبقاً');

  let insertId;
  await db.transaction(async connection => {
    const [result] = await connection.execute(
      `INSERT INTO service_categories (name, icon, color, position, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [data.name, data.icon, data.color, data.position ?? 0, data.is_active !== false ? 1 : 0]
    );
    insertId = result.insertId;

    if (data.attributes) {
      await saveCategoryAttributes(connection, insertId, data.attributes);
    }
  });

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

  await db.transaction(async connection => {
    if (assignments.length) {
      params.push(id);
      await connection.execute(`UPDATE service_categories SET ${assignments.join(', ')} WHERE id = ?`, params);
    }
    if (data.attributes !== undefined) {
      await saveCategoryAttributes(connection, id, data.attributes);
    }
  });

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
 * أعمدة بطاقة المزوّد العامة — واحدة للقائمة و«المزوّدين المشابهين» (تذكرة
 * #184)، فلا شكلان لبطاقة واحدة. **ولا `phone` بينها**: الرقم لا يدخل استعلام
 * قائمة أصلاً، و`has_phone` وحده محسوباً في SQL.
 */
const PROVIDER_CARD_SELECT = `sp.id, sp.name, sp.category_id, sc.name AS category_name,
        sc.icon AS category_icon, sc.color AS category_color, sp.image_url, sp.price, sp.price_type,
        sp.price_estimate_desc, sp.attributes, sp.is_verified, sp.is_featured,
        sp.views_count,
        (SELECT COUNT(*) FROM provider_favorites pf WHERE pf.provider_id = sp.id) AS favorites_count,
        (sp.phone IS NOT NULL AND sp.phone <> '') AS has_phone`;

/**
 * مفاتيح المزوّدين التي حفظها هذا المستخدم من بين صفوف معروفة — استعلام واحد
 * لكل صفحة لا استعلام لكل بطاقة. `userId === null` (زائر) تعني «لا شيء محفوظ»
 * بلا استعلام أصلاً.
 */
async function favoriteProviderIds(userId, providerIds) {
  if (!userId || !providerIds.length) return new Set();
  const placeholders = providerIds.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT provider_id FROM provider_favorites
      WHERE user_id = ? AND provider_id IN (${placeholders})`,
    [userId, ...providerIds]
  );
  return new Set(rows.map(row => row.provider_id));
}

/**
 * متوسط التقييم وعدده لصفوف صفحة كاملة — **استعلام واحد لكل قائمة لا استعلام
 * لكل بطاقة**، على نمط `favoriteProviderIds` نفسه (تذكرة #186). على `visible`
 * وحدها: المقيَّد بحالة `hidden` بعد البلاغات لا يدخل المتوسط ولا العدد، لا
 * يُحسب ثم يُطرح. و`ROUND` في SQL كي يصل الرقم الذي تعرضه الواجهات من مصدر
 * واحد (4.5 لا 4.4999).
 */
async function providerRatings(providerIds) {
  if (!providerIds.length) return new Map();
  const placeholders = providerIds.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT provider_id, ROUND(AVG(rating), 1) AS rating_avg, COUNT(*) AS rating_count
       FROM provider_reviews
      WHERE status = 'visible' AND provider_id IN (${placeholders})
      GROUP BY provider_id`,
    providerIds
  );
  return new Map(rows.map(row => [row.provider_id, {
    rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
    rating_count: Number(row.rating_count) || 0
  }]));
}

/** متوسط تقييم مزوّد واحد وعدده — يُستدعى بعد كل كتابة كي يعود الرقم الجديد. */
async function providerRatingSummary(providerId) {
  const row = await db.queryOne(
    `SELECT ROUND(AVG(rating), 1) AS rating_avg, COUNT(*) AS rating_count
       FROM provider_reviews
      WHERE provider_id = ? AND status = 'visible'`,
    [providerId]
  );
  return {
    rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
    rating_count: Number(row.rating_count) || 0
  };
}

/**
 * توزيع النجوم لمزوّد واحد: `{ 1: n, 2: n, 3: n, 4: n, 5: n }` بكل المفاتيح
 * حاضرة — الصفر يعني «لا تقييم بهذه النجوم»، لا مفتاحاً غائباً. (في JSON
 * تخرج المفاتيح نصّية، والعميلان يقرآنها بالأرقام نفسها.)
 */
async function providerRatingDistribution(providerId) {
  const rows = await db.query(
    `SELECT rating, COUNT(*) AS total
       FROM provider_reviews
      WHERE provider_id = ? AND status = 'visible'
      GROUP BY rating`,
    [providerId]
  );
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) distribution[Number(row.rating)] = Number(row.total) || 0;
  return distribution;
}

/**
 * صفّ بطاقة عامّة واحد: نفس مفاتيحه من القائمة ومن `similar` (تذكرة #184).
 * وعدّادا المشاهدة والمفضّلة (تذكرة #185) جزء من البطاقة نفسها: `views_count`
 * من عمود المزوّد، و`favorites_count` محسوب من `provider_favorites` في
 * الاستعلام — لا عمود مرآة. `is_favorite` تعني «هذا المستخدم حفظه»؛ وهي
 * `false` للزائر ولكل مزوّد لم يُحفظ، فلا مفتاح يغيب معناه.
 *
 * و`rating_avg`/`rating_count` (تذكرة #186) يصلان من `providerRatings` —
 * استعلام واحد لكل صفحة — على `visible` وحدها. مزوّد بلا تقييمات: `null` و`0`
 * صراحةً، لا `undefined` ولا مفتاح غائب.
 */
function shapeProviderCard(row, towns, { isFavorite = false, rating = null } = {}) {
  return withAbsoluteMedia({
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    category_name: row.category_name,
    category_icon: row.category_icon,
    category_color: row.category_color,
    has_phone: Boolean(row.has_phone),
    image_url: row.image_url,
    price: row.price ?? null,
    price_type: row.price_type || 'estimated',
    price_estimate_desc: row.price_estimate_desc ?? null,
    attributes: parseAttributes(row.attributes),
    is_verified: Boolean(row.is_verified),
    is_featured: Boolean(row.is_featured),
    views_count: Number(row.views_count) || 0,
    favorites_count: Number(row.favorites_count) || 0,
    rating_avg: rating && rating.rating_avg !== null ? Number(rating.rating_avg) : null,
    rating_count: rating ? Number(rating.rating_count) || 0 : 0,
    is_favorite: Boolean(isFavorite),
    towns: towns || []
  });
}

/**
 * `hours` كما يخزّنه الأدمن: مصفوفة 0..6 من `{ day, closed?, from?, to? }`.
 * MySQL يعيد عمود `JSON` محلَّلاً، وقاعدة قائمة قد تحمل نصّاً — والحالتان
 * تُقرآن شكلاً واحداً. ولا تخمين هنا: ما ليس مصفوفة يُعاد `null`، والتحقّق
 * الصارم في طبقة المسار (تذكرة #184).
 */
function parseHours(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const OFFER_PUBLIC_ORDER = `ORDER BY (ends_at IS NULL) ASC, ends_at ASC, created_at DESC, id DESC`;


/**
 * A page of active providers. Deliberately does NOT select `phone` — this is
 * enforcement rule 6: the number must never reach a list response, not even
 * as a hidden field, so it cannot leak by a client rendering it by mistake.
 * It only ever comes back from `getPublicProviderById`. The phone is optional,
 * so each row carries `has_phone` (computed in SQL, never the number itself)
 * for clients deciding whether to offer a contact button.
 *
 * و`regionId` (تذكرة #122) شرط المحافظة: مزوّد يخدم بلدة واحدة على الأقل من
 * محافظتها يظهر. `service_provider_towns` تحمل **أسماء بلدات** دائماً —
 * `assertTownsWithinScope` ومسار الإرسال يتحقّقان من `knownTownNames()` /
 * `activeNames()` وهما بلدات `towns` وحدها، فلا يُسنَد مزوّد لاسم محافظة —
 * فلا فرع لاسم محافظة هنا. `null` = بلا تقييد، فتبقى اللوحة وصفحة المزوّد
 * بلا تغيير.
 *
 * و`userId` (تذكرة #185) للمسجَّل وحده: يضيف `is_favorite` لكل صفّ من
 * `provider_favorites`؛ والزائر يحصل على `false` لا على غياب المفتاح.
 */
async function listPublicProviders({ categoryId, town, search, page = 1, limit = DEFAULT_PAGE_SIZE, regionId = null, userId = null } = {}) {
  const limitVal = safeLimit(limit);
  const pageVal = safePage(page);

  const conditions = ["sp.is_active = 1", "sp.status = 'approved'"];
  const params = [];

  if (categoryId) {
    conditions.push('sp.category_id = ?');
    params.push(categoryId);
  }
  if (regionId !== null && regionId !== undefined) {
    conditions.push(
      'EXISTS (SELECT 1 FROM service_provider_towns spt JOIN towns t ON t.name = spt.town WHERE spt.provider_id = sp.id AND t.region_id = ?)'
    );
    params.push(regionId);
  }
  if (town) {
    conditions.push(
      'EXISTS (SELECT 1 FROM service_provider_towns spt WHERE spt.provider_id = sp.id AND spt.town = ?)'
    );
    params.push(town);
  }
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push('(sp.name LIKE ? OR sp.description LIKE ? OR sc.name LIKE ? OR sp.price_estimate_desc LIKE ?)');
    params.push(term, term, term, term);
  }

  const whereClause = conditions.join(' AND ');

  const { total } = await db.queryOne(
    `SELECT COUNT(*) AS total
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE ${whereClause}`,
    params
  );

  const offset = (pageVal - 1) * limitVal;
  const rows = await db.query(
    `SELECT ${PROVIDER_CARD_SELECT}
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE ${whereClause}
      ORDER BY sp.is_featured DESC, sp.name ASC
      LIMIT ? OFFSET ?`,
    [...params, limitVal, offset]
  );

  const providerIds = rows.map(row => row.id);
  const [townsMap, favoriteIds, ratings] = await Promise.all([
    townsForProviders(providerIds),
    favoriteProviderIds(userId, providerIds),
    providerRatings(providerIds)
  ]);
  const providers = rows.map(row => shapeProviderCard(row, townsMap[row.id] || [], {
    isFavorite: favoriteIds.has(row.id),
    rating: ratings.get(row.id) || null
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

// ======================================================================
// صفحة المزوّد الغنية (تذكرة #184): المعرض والعروض والمنتجات والمشابهون
// ======================================================================

/** معرض المزوّد بترتيب الموضع ثم المعرّف — للعامة وللّوحة من نفس الاستعلام. */
async function providerPhotos(providerId) {
  const rows = await db.query(
    `SELECT id, image_url, caption, position, created_at
       FROM service_provider_photos
      WHERE provider_id = ?
      ORDER BY position ASC, id ASC`,
    [providerId]
  );
  return rows.map(row => withAbsoluteMedia({
    id: row.id,
    image_url: row.image_url,
    caption: row.caption ?? null,
    position: Number(row.position)
  }));
}

/**
 * عروض المزوّد. **العام** يرى النشِط غير المنتهي وحده (`is_active = 1 AND
 * (ends_at IS NULL OR ends_at >= NOW())`)، الأقرب انتهاءً أولاً ثم الأحدث —
 * والمنتهي والمطفأ لا يخرجان أصلاً لا أنهما يُخفيان في العميل. واللوحة ترى
 * الكلّ لتُديرها.
 */
async function providerOffers(providerId, { publicOnly = false } = {}) {
  const conditions = ['provider_id = ?'];
  if (publicOnly) conditions.push('is_active = 1', '(ends_at IS NULL OR ends_at >= NOW())');
  const order = publicOnly ? OFFER_PUBLIC_ORDER : 'ORDER BY is_active DESC, created_at DESC, id DESC';

  const rows = await db.query(
    `SELECT id, title, description, price,
            DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i') AS ends_at,
            is_active, created_at
       FROM service_provider_offers
      WHERE ${conditions.join(' AND ')}
      ${order}`,
    [providerId]
  );
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    ends_at: row.ends_at ?? null,
    is_active: Boolean(row.is_active)
  }));
}

/** منتجات المزوّد بترتيب الموضع ثم المعرّف. */
async function providerProducts(providerId) {
  const rows = await db.query(
    `SELECT id, name, description, price, image_url, position
       FROM service_provider_products
      WHERE provider_id = ?
      ORDER BY position ASC, id ASC`,
    [providerId]
  );
  return rows.map(row => withAbsoluteMedia({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    image_url: row.image_url,
    position: Number(row.position)
  }));
}

/**
 * حتى ستة «مزوّدون مشابهون» (تذكرة #184): نفس الفئة، ونفس محافظة المزوّد عبر
 * بلداته في `service_provider_towns` ← `towns.region_id`، معتمدون ونشِطون،
 * وليس المزوّد نفسه. الترتيب «مميّز» ثم `rating_avg` ثم الأحدث ثم الأكبر
 * معرّفاً (تذكرة #186): المميّز أولاً، وقبله لا شيء، وبعد المميّز يرجّح
 * التقييم — وبلا تقييمات يُعامل صفراً فيترتّب بالأحدث. الشكل شكل بطاقة
 * القائمة نفسها وبلا رقم فيها.
 */
async function similarProviders(row, { userId = null } = {}) {
  const towns = (await townsForProviders([row.id]))[row.id] || [];
  if (!towns.length) return [];

  const placeholders = towns.map(() => '?').join(', ');
  const regions = await db.query(
    `SELECT DISTINCT region_id FROM towns WHERE name IN (${placeholders}) AND region_id IS NOT NULL`,
    towns
  );
  const regionIds = regions.map(region => region.region_id);
  if (!regionIds.length) return [];

  const regionPlaceholders = regionIds.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT ${PROVIDER_CARD_SELECT}
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
       LEFT JOIN (
         SELECT provider_id, AVG(rating) AS rating_avg
           FROM provider_reviews
          WHERE status = 'visible'
          GROUP BY provider_id
       ) rv ON rv.provider_id = sp.id
      WHERE sp.id <> ?
        AND sp.category_id = ?
        AND sp.is_active = 1
        AND sp.status = 'approved'
        AND EXISTS (SELECT 1 FROM service_provider_towns spt
                      JOIN towns t ON t.name = spt.town
                     WHERE spt.provider_id = sp.id AND t.region_id IN (${regionPlaceholders}))
      ORDER BY sp.is_featured DESC, COALESCE(rv.rating_avg, 0) DESC, sp.created_at DESC, sp.id DESC
      LIMIT 6`,
    [row.id, row.category_id, ...regionIds]
  );

  const providerIds = rows.map(candidate => candidate.id);
  const [townsMap, favoriteIds, ratings] = await Promise.all([
    townsForProviders(providerIds),
    favoriteProviderIds(userId, providerIds),
    providerRatings(providerIds)
  ]);
  return rows.map(candidate => shapeProviderCard(candidate, townsMap[candidate.id] || [], {
    isFavorite: favoriteIds.has(candidate.id),
    rating: ratings.get(candidate.id) || null
  }));
}

/** رقم دولي لرابط واتساب: أرقام وحدها، `0…` ⇒ `972…`، و`972…` كما هو، وغيرهما `null`. */
function normaliseWhatsappNumber(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (digits.startsWith('972')) return digits;
  return null;
}

/**
 * رابط واتساب لمزوّد معتمد — **الرقم يخرج داخل هذا الرابط وحده ولا يُعاد
 * منفصلاً في أي مفتاح**. الرسالة تُبنى هنا في الخادم (تذكر «أعراسنا» وتسمّي
 * الفئة)، فلا يبنيها عميل ولا يجمعها بنفسه. لا رقم أو رقم لا يصلح ← 404.
 */
async function publicProviderWhatsapp(id) {
  const row = await db.queryOne(
    `SELECT sp.id, sp.name, sp.phone, sc.name AS category_name
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE sp.id = ? AND sp.is_active = 1 AND sp.status = 'approved'`,
    [id]
  );
  if (!row) throw ApiError.notFound('مزوّد الخدمة غير موجود');

  const number = normaliseWhatsappNumber(row.phone);
  if (!number) throw ApiError.notFound('لا يوجد رقم تواصل مسجَّل لهذا المزوّد');

  const message = `مرحباً ${row.name}، وجدتكم في منصة «أعراسنا» وأرغب بالاستفسار عن خدمات ${row.category_name} لمناسبتي.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * One active provider, including `phone` — only reached by opening the provider
 * explicitly (story 17).
 *
 * **أين يظهر الرقم وأين لا (تذكرة #184):** لا يدخل استعلام القائمة ولا بطاقات
 * `similar` (`has_phone` وحدهما)، ولا يُعاد منفصلاً مع رابط واتساب — الرقم هناك
 * داخل `url` وحده. ويبقى في صفحة المزوّد المفردة، كما قرّر ADR-0016، لأن
 * `consent_at`/`consent_channel` هما حارسه ولا معنى لهما بلا هذا الموضع.
 */
async function getPublicProviderById(id, { userId = null } = {}) {
  const row = await db.queryOne(
    `SELECT sp.id, sp.name, sp.category_id, sc.name AS category_name, sc.icon AS category_icon, sc.color AS category_color,
            sp.phone, sp.description, sp.image_url, sp.price, sp.price_type, sp.price_estimate_desc, sp.attributes,
            sp.logo_url, sp.cover_url, sp.hours, sp.is_verified, sp.is_featured, sp.views_count,
            (SELECT COUNT(*) FROM provider_favorites pf WHERE pf.provider_id = sp.id) AS favorites_count,
            (sp.phone IS NOT NULL AND sp.phone <> '') AS has_phone
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE sp.id = ? AND sp.is_active = 1 AND sp.status = 'approved'`,
    [id]
  );
  if (!row) throw ApiError.notFound('مزوّد الخدمة غير موجود');

  const [townsMap, gallery, offers, products, similar, rating, ratingDistribution, myReview] = await Promise.all([
    townsForProviders([id]),
    providerPhotos(id),
    providerOffers(id, { publicOnly: true }),
    providerProducts(id),
    similarProviders(row, { userId }),
    providerRatingSummary(id),
    providerRatingDistribution(id),
    myProviderReview(id, userId)
  ]);

  // «هل حفظه هذا المستخدم؟» تُقرأ من الجدول لا من عمودٍ في الصفّ، و`userId`
  // غائب للزائر فتعود `false` بلا استعلام إضافي.
  const favoriteIds = await favoriteProviderIds(userId, [id]);

  return withAbsoluteMedia({
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    category_name: row.category_name,
    category_icon: row.category_icon,
    category_color: row.category_color,
    phone: row.phone ?? null,
    has_phone: Boolean(row.has_phone),
    description: row.description,
    image_url: row.image_url,
    logo_url: row.logo_url,
    cover_url: row.cover_url,
    hours: parseHours(row.hours),
    is_verified: Boolean(row.is_verified),
    is_featured: Boolean(row.is_featured),
    views_count: Number(row.views_count) || 0,
    favorites_count: Number(row.favorites_count) || 0,
    // المتوسط والعدد والتوزيع (تذكرة #186) — على `visible` وحدها، والزائر
    // يستلمها كما يستلم المسجَّل: التقييمات عامة بطبيعتها.
    rating_avg: rating.rating_avg,
    rating_count: rating.rating_count,
    rating_distribution: ratingDistribution,
    // تقييم صاحب الطلب وحده (لا تقييمات الآخرين): يصل من `optionalAuthenticate`
    // كي تعرف الواجهة أتعرض «حذف تقييمي» أم «اكتب تقييمك»، والزائر يستلم null.
    my_review: myReview,
    is_favorite: favoriteIds.has(id),
    price: row.price ?? null,
    price_type: row.price_type || 'estimated',
    price_estimate_desc: row.price_estimate_desc ?? null,
    attributes: parseAttributes(row.attributes),
    towns: townsMap[id] || [],
    gallery,
    offers,
    products,
    similar
  });
}

// ======================================================================
// مشاهدات المزوّد ومفضّلته (تذكرة #185)
// ======================================================================

/**
 * بوّابة المزوّد العام الوحيدة لهذا القسم: موجود ومعتمد ونشِط، وإلا 404
 * كسائر القراءات العامة. تعيد صفّ العدّاد ليكون ردّ «لم تُحسب» صادقاً.
 */
async function assertPublicProvider(id) {
  const row = await db.queryOne(
    "SELECT id, views_count FROM service_providers WHERE id = ? AND is_active = 1 AND status = 'approved'",
    [id]
  );
  if (!row) throw ApiError.notFound('مزوّد الخدمة غير موجود');
  return row;
}

/**
 * تسجيل مشاهدة صفحة مزوّد — **بلا IP في أي عمود أو مفتاح**.
 *
 * المفتاح: `u:<user_id>` للمسجَّل، أو `v:<visitor_id>` لزائر يرسل معرّفاً
 * عشوائياً ولّده جهازه (التحقّق من شكله في طبقة المسار). بلا مفتاح لا تُحسب،
 * والردّ 200 بـ`counted: false` لا خطأ.
 *
 * صفّ واحد لكل (مزوّد، مفتاح، `CURDATE()`): `INSERT IGNORE` على المفتاح الفريد
 * يتجاهل التكرار، و`views_count` يزيد **مع الصفّ الجديد وحده**، والاثنان في
 * معاملة واحدة. اليوم من الخادم لا من العميل، فلا ساعة جهاز تزوّر العدّاد.
 */
async function recordProviderView(id, { userId = null, visitorId = null } = {}) {
  const provider = await assertPublicProvider(id);
  const visitorKey = userId ? `u:${userId}` : (visitorId ? `v:${visitorId}` : null);

  if (!visitorKey) {
    return { counted: false, views_count: Number(provider.views_count) || 0 };
  }

  return db.transaction(async connection => {
    const [inserted] = await connection.execute(
      `INSERT IGNORE INTO service_provider_views (provider_id, visitor_key, view_date)
       VALUES (?, ?, CURDATE())`,
      [id, visitorKey]
    );
    const counted = inserted.affectedRows > 0;

    if (counted) {
      await connection.execute(
        'UPDATE service_providers SET views_count = views_count + 1 WHERE id = ?',
        [id]
      );
    }

    const [[row]] = await connection.execute(
      'SELECT views_count FROM service_providers WHERE id = ?',
      [id]
    );
    return { counted, views_count: Number(row.views_count) || 0 };
  });
}

/** عدّاد المفضّلة من الجدول نفسه — لا عمود مرآة يُكتب ويُنسى. */
async function providerFavoritesCount(connection, providerId) {
  const [[row]] = await connection.execute(
    'SELECT COUNT(*) AS total FROM provider_favorites WHERE provider_id = ?',
    [providerId]
  );
  return Number(row.total) || 0;
}

/**
 * حفظ مزوّد في مفضّلة المستخدم — idempotent: `INSERT IGNORE` ثم العدّاد،
 * فنداءان متتاليان يعيدان العدد نفسه ولا يضاعفانه. الحكم على الصفّ من
 * `provider_favorites` وحدها، فلا يرى مستخدم مفضّلة غيره.
 */
async function addProviderFavorite(id, userId) {
  await assertPublicProvider(id);
  return db.transaction(async connection => {
    await connection.execute(
      'INSERT IGNORE INTO provider_favorites (provider_id, user_id) VALUES (?, ?)',
      [id, userId]
    );
    return {
      is_favorite: true,
      favorites_count: await providerFavoritesCount(connection, id)
    };
  });
}

/** إلغاء الحفظ — idempotent أيضاً: حذف صفّ غير موجود لا خطأ، والعدّاد يتبع الجدول. */
async function removeProviderFavorite(id, userId) {
  await assertPublicProvider(id);
  return db.transaction(async connection => {
    await connection.execute(
      'DELETE FROM provider_favorites WHERE provider_id = ? AND user_id = ?',
      [id, userId]
    );
    return {
      is_favorite: false,
      favorites_count: await providerFavoritesCount(connection, id)
    };
  });
}

/**
 * «مزوّدون محفوظون» في «قائمتي»: صفوف هذا المستخدم وحدها (`pf.user_id = ?`)،
 * المعتمد النشِط وحده، أحدث حفظ أولاً، بشكل بطاقة القائمة نفسه وبلا رقم —
 * `PROVIDER_CARD_SELECT` لا ينتقي `phone` أصلاً.
 */
async function listFavoriteProviders(userId) {
  const rows = await db.query(
    `SELECT ${PROVIDER_CARD_SELECT}
       FROM provider_favorites f
       JOIN service_providers sp ON sp.id = f.provider_id
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE f.user_id = ? AND sp.is_active = 1 AND sp.status = 'approved'
      ORDER BY f.created_at DESC, f.id DESC`,
    [userId]
  );

  const providerIds = rows.map(row => row.id);
  const [townsMap, ratings] = await Promise.all([
    townsForProviders(providerIds),
    providerRatings(providerIds)
  ]);
  return rows.map(row => shapeProviderCard(row, townsMap[row.id] || [], {
    isFavorite: true,
    rating: ratings.get(row.id) || null
  }));
}

// ======================================================================
// تقييمات المزوّد (تذكرة #186)
// ======================================================================
// كل SQL هنا وحده. `rating` يُتحقَّق منه في الخدمة لا في المسار (المسار ينقل
// الرقم كما وصل)، و`confirm_phone` إقرار صاحبه أنه رقم شخصي (ADR-0014) —
// يُنشَر التقييم فوراً بلا طابور مراجعة مسبق، والإبلاغ وحده يخفيه بعد العتبة.

const REVIEW_BODY_MAX = 1000;

/**
 * شكل تقييم واحد كما يخرج للعميل: الاسم من `users.full_name` لا من نصّ يرسله
 * العميل، **ولا رقم هاتف ولا `user_id`** — التمييز الوحيد «تقييمي/غير تقييمي»
 * في `is_mine`/`can_delete`. والزائر يستلم `false` لا مفتاحاً غائباً.
 */
function shapeReviewRow(row, userId) {
  const isMine = userId != null && Number(row.user_id) === Number(userId);
  return {
    id: row.id,
    rating: Number(row.rating),
    body: row.body ?? null,
    user_name: row.user_name,
    // `status` يخرج أيضاً في القائمة (`visible` وحدها هناك)، والأهم في ردّ
    // الكتابة: صاحب تقييم أخفَته البلاغات يرى أن تعديله لم يُعِد نشره.
    status: row.status || 'visible',
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    is_mine: isMine,
    can_delete: isMine
  };
}

/**
 * تقييم صاحب الطلب وحده للمزوّد — يُلحق بصفحة المزوّد العامة (المسار
 * `optionalAuthenticate`)، فيعرف المسجَّل أيعرض «حذف تقييمي» أم «اكتب تقييمك».
 * التقييم المخفي بعد بلاغات يصل بحالته أيضاً: صاحبه يعرف أنه لم يُحذف.
 */
async function myProviderReview(providerId, userId) {
  if (!userId) return null;
  const row = await db.queryOne(
    `SELECT id, rating, body, status, created_at, updated_at
       FROM provider_reviews
      WHERE provider_id = ? AND user_id = ?`,
    [providerId, userId]
  );
  if (!row) return null;
  return {
    id: row.id,
    rating: Number(row.rating),
    body: row.body ?? null,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null
  };
}

/**
 * نشر تقييم أو تعديله — **upsert على `(provider_id, user_id)`**: المفتاح الفريد
 * هو ما يجعل التقييم الثاني يعدّل الأول ولا يضيف صفّاً ثانياً. ولا `status` في
 * جملة التحديث عمداً: تعديل صاحبه لتقييم أخفَته البلاغات لا يُحييه من جديد،
 * وإلا صار التعديل باباً خلفياً على قرار الإخفاء.
 *
 * والبوّابة ثلاثة شروط بالترتيب: مزوّد عام معتمد نشِط (وإلا 404)، و`rating`
 * عدد صحيح 1..5 (وإلا 400)، و`confirmPhone === true` حصراً (وإلا 400) —
 * و`phone_confirmed_at` يكتبه الخادم `NOW()` ولا يقبل تاريخاً من العميل.
 */
async function upsertProviderReview(userId, providerId, { rating, body, confirmPhone } = {}) {
  await assertPublicProvider(providerId);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw ApiError.badRequest('التقييم يجب أن يكون عدداً صحيحاً من نجمة إلى خمس نجوم');
  }
  if (confirmPhone !== true) {
    throw ApiError.badRequest('أكّد أن رقمك الشخصي صحيح قبل نشر التقييم');
  }

  const text = typeof body === 'string' && body.trim() ? body.trim().slice(0, REVIEW_BODY_MAX) : null;

  await db.execute(
    `INSERT INTO provider_reviews (provider_id, user_id, rating, body, phone_confirmed_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), body = VALUES(body),
       phone_confirmed_at = VALUES(phone_confirmed_at), updated_at = NOW()`,
    [providerId, userId, rating, text]
  );

  const row = await db.queryOne(
    `SELECT r.id, r.user_id, r.rating, r.body, r.status, r.created_at, r.updated_at,
            u.full_name AS user_name
       FROM provider_reviews r
       JOIN users u ON u.id = r.user_id
      WHERE r.provider_id = ? AND r.user_id = ?`,
    [providerId, userId]
  );
  return {
    review: shapeReviewRow(row, userId),
    ...(await providerRatingSummary(providerId)),
    rating_distribution: await providerRatingDistribution(providerId)
  };
}

/**
 * حذف تقييم صاحبه وحده (`WHERE provider_id = ? AND user_id = ?`) — والحذف
 * المتكرّر بلا خطأ (idempotent)، فلا نافذة خطأ على من ضغط مرتين.
 *
 * **وبلا بوّابة `assertPublicProvider` عمداً:** سحب المرء كلامه حقٌّ لا يسقط
 * لأن المزوّد عُطِّل أو أُعيد إلى الطابور؛ البوّابة هنا كانت تُبقي تقييماً
 * يحمل `full_name` صاحبه بلا طريق لحذفه. وحذف مزوّد غير معروف يعيد
 * `deleted: false` لا 404 — الوجه الآخر لكون العملية idempotent.
 */
async function deleteProviderReview(userId, providerId) {
  const { affectedRows } = await db.execute(
    'DELETE FROM provider_reviews WHERE provider_id = ? AND user_id = ?',
    [providerId, userId]
  );
  // لا ملخّص حين لا صفّ حُذف: كان الملخّص يُحسب لأي معرّف مزوّد ولو كان معلّقاً
  // أو غير موجود، فيصير الردّ نافذة على متوسّطات ما لا يعرضه أي مسار عام.
  if (!affectedRows) return { deleted: false };
  return {
    deleted: true,
    ...(await providerRatingSummary(providerId)),
    rating_distribution: await providerRatingDistribution(providerId)
  };
}

/**
 * صفحة تقييمات المزوّد: `visible` وحدها، الأحدث أولاً، والاسم من الحساب.
 * الترقيم بـ`safePage`/`safeLimit` القائمتين — لا سقف يكتبه العميل.
 */
async function listProviderReviews(providerId, { page = 1, limit = DEFAULT_PAGE_SIZE, userId = null } = {}) {
  await assertPublicProvider(providerId);
  const pageVal = safePage(page);
  const limitVal = safeLimit(limit);

  const { total } = await db.queryOne(
    "SELECT COUNT(*) AS total FROM provider_reviews WHERE provider_id = ? AND status = 'visible'",
    [providerId]
  );
  const rows = await db.query(
    `SELECT r.id, r.user_id, r.rating, r.body, r.status, r.created_at, r.updated_at,
            u.full_name AS user_name
       FROM provider_reviews r
       JOIN users u ON u.id = r.user_id
      WHERE r.provider_id = ? AND r.status = 'visible'
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [providerId, limitVal, (pageVal - 1) * limitVal]
  );

  return {
    reviews: rows.map(row => shapeReviewRow(row, userId)),
    pagination: {
      page: pageVal,
      limit: limitVal,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limitVal)
    }
  };
}

/**
 * بلاغ واحد لكل مستخدم: المفتاح الفريد في `provider_review_reports` هو ما
 * يمنع مبلِّغاً واحداً من رفع العدّاد وحده (`INSERT IGNORE` لا خطأ على التكرار).
 * والعدّ يُقرأ من الجدول نفسه لا من عمود مرآة — على نمط تبريكات #20 وبلاغات
 * صور ADR-0009، لكن **بالعدد الكامل** لا بشرط `status = 'open'`: لا عمود حالة
 * في هذا الجدول، والحذف المتكرّر للصفّ نفسه لا يحدث.
 * عند `PROVIDER_REVIEW_REPORT_THRESHOLD` يصير `status = 'hidden'` فيخرج من
 * القائمة ومن المتوسط والعدد معاً.
 */
async function reportProviderReview(userId, providerId, reviewId) {
  await assertPublicProvider(providerId);

  return db.transaction(async connection => {
    const [rows] = await connection.execute(
      'SELECT id, status FROM provider_reviews WHERE id = ? AND provider_id = ?',
      [reviewId, providerId]
    );
    if (!rows.length || rows[0].status !== 'visible') throw ApiError.notFound('التقييم غير موجود');

    await connection.execute(
      'INSERT IGNORE INTO provider_review_reports (review_id, user_id) VALUES (?, ?)',
      [reviewId, userId]
    );

    const [[countRow]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM provider_review_reports WHERE review_id = ?',
      [reviewId]
    );
    const reportsCount = Number(countRow.total) || 0;

    let status = rows[0].status;
    if (reportsCount >= PROVIDER_REVIEW_REPORT_THRESHOLD) {
      await connection.execute("UPDATE provider_reviews SET status = 'hidden' WHERE id = ?", [reviewId]);
      status = 'hidden';
    }

    return { reports_count: reportsCount, status };
  });
}

/**
 * حذف تقييم إدارياً — **النطاق داخل الاستعلام** عبر `providerScopeClause`
 * القائمة (بلدات المزوّد)، وخارج النطاق أو غير الموجود ← 404 لا 403، فلا
 * يتأكّد وجود تقييم لأدمن لا يراه.
 */
async function deleteProviderReviewAsAdmin(user, reviewId) {
  const { clause: scopeClause, params: scopeParams } = await providerScopeClause(user);
  // الحذف نفسه هو المحصور — لا قراءة ثم حذف بمعرّف مجرَّد: بين الجملتين قد
  // تتغيّر بلدات المزوّد أو نطاق الأدمن، فيُحذف صفّ لم يعد يراه.
  const { affectedRows } = await db.execute(
    `DELETE r
       FROM provider_reviews r
       JOIN service_providers sp ON sp.id = r.provider_id
      WHERE r.id = ?${scopeClause}`,
    [reviewId, ...scopeParams]
  );
  if (!affectedRows) throw ApiError.notFound('التقييم غير موجود');
}

// ======================================================================
// Admin: service providers — `admin` role, scoped to their own towns
// (stories 28-29). Scoped INSIDE the SQL (an `EXISTS` against
// service_provider_towns), never by filtering an already-fetched array.
// ======================================================================

/**
 * Every town in `towns` must be a town row (active or disabled — a provider's
 * set is re-saved whole, and a town disabled since must not break that), and
 * one of `user`'s own towns unless `user` is super_admin.
 */
async function assertTownsWithinScope(user, towns) {
  const knownTowns = await townsService.knownTownNames();
  for (const town of towns) {
    if (!knownTowns.includes(town)) throw ApiError.badRequest(`البلدة "${town}" غير معروفة`);
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

/**
 * شكل صفّ المزوّد في اللوحة: الأعلام منطقية، و`hours` مصفوفة، وكل وسيط مطلق —
 * والمجموعات الثلاث تُلحق في التفصيل وحده (`getProviderForAdmin`)، لا في قائمة
 * الصفحة (تذكرة #184).
 */
async function shapeAdminProvider(row) {
  const townsMap = await townsForProviders([row.id]);
  return withAbsoluteMedia({
    ...row,
    is_active: Boolean(row.is_active),
    is_verified: Boolean(row.is_verified),
    is_featured: Boolean(row.is_featured),
    hours: parseHours(row.hours),
    attributes: parseAttributes(row.attributes),
    towns: townsMap[row.id] || []
  });
}

/** Providers serving at least one of `user`'s towns — fail-closed for a scopeless admin. */
async function listProvidersForAdmin(user, { categoryId, status, page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const limitVal = safeLimit(limit);
  const pageVal = safePage(page);

  const { clause: scopeClause, params: scopeParams } = await providerScopeClause(user);
  const conditions = ['1 = 1'];
  const params = [];
  if (categoryId) {
    conditions.push('sp.category_id = ?');
    params.push(categoryId);
  }
  if (status) {
    conditions.push('sp.status = ?');
    params.push(status);
  }

  const whereClause = conditions.join(' AND ') + scopeClause;
  const allParams = [...params, ...scopeParams];

  const { total } = await db.queryOne(
    `SELECT COUNT(*) AS total FROM service_providers sp WHERE ${whereClause}`,
    allParams
  );

  const offset = (pageVal - 1) * limitVal;
  const rows = await db.query(
    `SELECT sp.*, sc.name AS category_name, sc.icon AS category_icon, sc.color AS category_color
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE ${whereClause}
      ORDER BY sp.name ASC
      LIMIT ? OFFSET ?`,
    [...allParams, limitVal, offset]
  );

  const townsMap = await townsForProviders(rows.map(row => row.id));
  const providers = rows.map(row => withAbsoluteMedia({
    ...row,
    is_active: Boolean(row.is_active),
    is_verified: Boolean(row.is_verified),
    is_featured: Boolean(row.is_featured),
    hours: parseHours(row.hours),
    attributes: parseAttributes(row.attributes),
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

/**
 * Scoped single-provider lookup. 404 (not 403) when it exists but is out of
 * scope — a 403 would confirm it exists.
 *
 * ويحمل المجموعات الثلاث كي يملأ نموذج اللوحة معرضَ المزوّد وعروضه ومنتجاته
 * بلا ثلاثة نداءات إضافية (تذكرة #184)، وكلها هنا — بما فيها العروض المطفأة
 * والمنتهية — لأن اللوحة تُديرها لا تعرضها.
 */
async function getProviderForAdmin(user, id) {
  const { clause: scopeClause, params: scopeParams } = await providerScopeClause(user);
  const row = await db.queryOne(
    `SELECT sp.*, sc.name AS category_name, sc.icon AS category_icon, sc.color AS category_color
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE sp.id = ?${scopeClause}`,
    [id, ...scopeParams]
  );
  if (!row) throw ApiError.notFound('مزوّد الخدمة غير موجود');

  const [provider, gallery, offers, products] = await Promise.all([
    shapeAdminProvider(row),
    providerPhotos(id),
    providerOffers(id),
    providerProducts(id)
  ]);
  return { ...provider, gallery, offers, products };
}

/**
 * Creates a provider plus its town rows in one transaction.
 * `data.towns` is assumed already validated by the route layer (rule 7:
 * the route records consent_at/consent_channel itself) and by `assertTownsWithinScope`
 * (containment). Optional columns are coerced to `null` explicitly — the raw
 * connection's `execute` inside `db.transaction` does not normalise
 * `undefined` to `null` the way `pool.js`'s own helpers do.
 */
async function createProvider(data) {
  const category = await db.queryOne('SELECT id FROM service_categories WHERE id = ?', [data.category_id]);
  if (!category) throw ApiError.badRequest('فئة الخدمة غير موجودة');

  const attrJson = data.attributes ? JSON.stringify(data.attributes) : null;
  const priceType = ['estimated', 'fixed', 'starting_at', 'contact'].includes(data.price_type)
    ? data.price_type
    : 'estimated';

  return db.transaction(async connection => {
    const [result] = await connection.execute(
      `INSERT INTO service_providers
         (category_id, name, phone, description, image_url, price, price_type, price_estimate_desc, attributes,
          status, rejection_reason, is_active, consent_at, consent_by, consent_channel, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.category_id, data.name, data.phone ?? null,
        data.description ?? null, data.image_url ?? null,
        data.price !== undefined ? data.price : null,
        priceType,
        data.price_estimate_desc ?? null,
        attrJson,
        data.status ?? 'approved',
        data.rejection_reason ?? null,
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
 * «موثّق» و«مميّز» صلاحية لا نطاق (تذكرة #184): إرسال أيٍّ منهما من أدمن غير
 * سوبر أدمن يُرفض 403. الحكم هنا في الخدمة وحدها، ويستدعيه المسار قبل رفع
 * الملفات أيضاً كي لا يُرفع صورة لطلبٍ محكوم عليه بالرفض، ويستدعيه
 * `updateProvider` مرة أخرى فلا يمرّ الحكم عبر بابٍ واحد يُنسى لاحقاً.
 */
function assertProviderFlagsAllowed(user, data) {
  if (data.is_verified === undefined && data.is_featured === undefined) return;
  if (!user || user.role !== 'super_admin') {
    throw ApiError.forbidden('شارتا «موثّق» و«مميّز» يضعهما السوبر أدمن وحده');
  }
}

/**
 * Partial update. Only columns present in `data` are written; `data.towns`,
 * when present, fully replaces the existing rows (already validated by the
 * route layer — same rule as `createProvider`). `consent_at`/`consent_by`/
 * `consent_channel` are deliberately not editable here: they are the
 * audit trail of the original recorded permission, not a form field.
 */
async function updateProvider(id, data, user) {
  assertProviderFlagsAllowed(user, data);

  const columns = [
    'category_id', 'name', 'phone', 'description', 'image_url',
    'price', 'price_type', 'price_estimate_desc', 'attributes',
    'status', 'rejection_reason', 'is_active',
    'logo_url', 'cover_url', 'hours', 'is_verified', 'is_featured'
  ];
  const booleanColumns = ['is_active', 'is_verified', 'is_featured'];

  await db.transaction(async connection => {
    const assignments = [];
    const params = [];
    for (const column of columns) {
      if (data[column] === undefined) continue;
      assignments.push(`${column} = ?`);
      if (booleanColumns.includes(column)) {
        params.push(data[column] ? 1 : 0);
      } else if (column === 'attributes' || column === 'hours') {
        params.push(data[column] ? JSON.stringify(data[column]) : null);
      } else {
        params.push(data[column] ?? null);
      }
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

// --- معرض المزوّد وعروضه ومنتجاته (تذكرة #184) -----------------------
// كل دالّة هنا تفترض أن نطاق البلدات تحقّق في المسار عبر
// `getProviderForAdmin` (404 لا 403 خارج النطاق)، وأن المدخلات تحقّقت هي
// أيضاً؛ ولا SQL خارج هذا الملف.

async function addProviderPhoto(providerId, { image_url, caption, position }) {
  const { total } = await db.queryOne(
    'SELECT COUNT(*) AS total FROM service_provider_photos WHERE provider_id = ?',
    [providerId]
  );
  const positionValue = Number.isInteger(position) ? position : Number(total);
  const { insertId } = await db.execute(
    `INSERT INTO service_provider_photos (provider_id, image_url, caption, position)
     VALUES (?, ?, ?, ?)`,
    [providerId, image_url, caption ?? null, positionValue]
  );
  return { id: insertId, image_url, caption: caption ?? null, position: positionValue };
}

/** يحذف صورة من المعرض ويعيد صفّها — كي يحرّر المسار صورتها من Cloudinary. */
async function deleteProviderPhoto(providerId, photoId) {
  const row = await db.queryOne(
    'SELECT id, image_url FROM service_provider_photos WHERE id = ? AND provider_id = ?',
    [photoId, providerId]
  );
  if (!row) throw ApiError.notFound('صورة المعرض غير موجودة');
  await db.execute('DELETE FROM service_provider_photos WHERE id = ? AND provider_id = ?', [photoId, providerId]);
  return row;
}

async function findOfferForProvider(providerId, offerId) {
  const row = await db.queryOne(
    'SELECT id FROM service_provider_offers WHERE id = ? AND provider_id = ?',
    [offerId, providerId]
  );
  if (!row) throw ApiError.notFound('العرض غير موجود');
  return row;
}

async function createProviderOffer(providerId, data) {
  const { insertId } = await db.execute(
    `INSERT INTO service_provider_offers (provider_id, title, description, price, ends_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      providerId, data.title, data.description ?? null,
      data.price ?? null, data.ends_at ?? null,
      data.is_active === false ? 0 : 1
    ]
  );
  return insertId;
}

async function updateProviderOffer(providerId, offerId, data) {
  await findOfferForProvider(providerId, offerId);
  const columns = ['title', 'description', 'price', 'ends_at', 'is_active'];
  const assignments = [];
  const params = [];
  for (const column of columns) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(column === 'is_active' ? (data[column] ? 1 : 0) : (data[column] ?? null));
  }
  if (assignments.length) {
    params.push(offerId, providerId);
    await db.execute(
      `UPDATE service_provider_offers SET ${assignments.join(', ')} WHERE id = ? AND provider_id = ?`,
      params
    );
  }
}

async function deleteProviderOffer(providerId, offerId) {
  await findOfferForProvider(providerId, offerId);
  await db.execute('DELETE FROM service_provider_offers WHERE id = ? AND provider_id = ?', [offerId, providerId]);
}

async function findProductForProvider(providerId, productId) {
  const row = await db.queryOne(
    'SELECT id FROM service_provider_products WHERE id = ? AND provider_id = ?',
    [productId, providerId]
  );
  if (!row) throw ApiError.notFound('المنتج غير موجود');
  return row;
}

async function createProviderProduct(providerId, data) {
  const { total } = await db.queryOne(
    'SELECT COUNT(*) AS total FROM service_provider_products WHERE provider_id = ?',
    [providerId]
  );
  const positionValue = Number.isInteger(data.position) ? data.position : Number(total);
  const { insertId } = await db.execute(
    `INSERT INTO service_provider_products (provider_id, name, description, price, image_url, position)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      providerId, data.name, data.description ?? null,
      data.price ?? null, data.image_url ?? null, positionValue
    ]
  );
  return insertId;
}

async function updateProviderProduct(providerId, productId, data) {
  await findProductForProvider(providerId, productId);
  const columns = ['name', 'description', 'price', 'image_url', 'position'];
  const assignments = [];
  const params = [];
  for (const column of columns) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(data[column] ?? null);
  }
  if (assignments.length) {
    params.push(productId, providerId);
    await db.execute(
      `UPDATE service_provider_products SET ${assignments.join(', ')} WHERE id = ? AND provider_id = ?`,
      params
    );
  }
}

async function deleteProviderProduct(providerId, productId) {
  await findProductForProvider(providerId, productId);
  const row = await db.queryOne(
    'SELECT image_url FROM service_provider_products WHERE id = ? AND provider_id = ?',
    [productId, providerId]
  );
  await db.execute('DELETE FROM service_provider_products WHERE id = ? AND provider_id = ?', [productId, providerId]);
  return row;
}

async function updateProviderStatus(id, { status, rejectionReason }) {
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw ApiError.badRequest('حالة مزوّد الخدمة غير صالحة');
  }
  const existing = await db.queryOne('SELECT id FROM service_providers WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('مزوّد الخدمة غير موجود');

  await db.execute(
    'UPDATE service_providers SET status = ?, rejection_reason = ? WHERE id = ?',
    [status, status === 'rejected' ? (rejectionReason ?? null) : null, id]
  );
}

async function listMyServices(userId) {
  const rows = await db.query(
    `SELECT sp.id, sp.name, sp.category_id, sc.name AS category_name, sc.icon AS category_icon, sc.color AS category_color,
            sp.phone, sp.description, sp.image_url, sp.price, sp.price_type, sp.price_estimate_desc, sp.attributes,
            sp.status, sp.rejection_reason, sp.is_active, sp.created_at
       FROM service_providers sp
       JOIN service_categories sc ON sc.id = sp.category_id
      WHERE sp.created_by = ?
      ORDER BY sp.created_at DESC`,
    [userId]
  );
  const townsMap = await townsForProviders(rows.map(r => r.id));
  return rows.map(r => ({
    ...r,
    price: r.price !== null && r.price !== undefined ? Number(r.price) : null,
    price_type: r.price_type || 'estimated',
    price_estimate_desc: r.price_estimate_desc || null,
    attributes: parseAttributes(r.attributes),
    is_active: Boolean(r.is_active),
    image_url: absoluteMediaUrl(r.image_url),
    towns: townsMap[r.id] || []
  }));
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
  publicProviderWhatsapp,
  listMyServices,
  recordProviderView,
  addProviderFavorite,
  removeProviderFavorite,
  listFavoriteProviders,

  upsertProviderReview,
  deleteProviderReview,
  listProviderReviews,
  reportProviderReview,
  deleteProviderReviewAsAdmin,

  assertTownsWithinScope,
  assertProviderFlagsAllowed,
  listProvidersForAdmin,
  getProviderForAdmin,
  createProvider,
  updateProvider,
  updateProviderStatus,
  deleteProvider,

  addProviderPhoto,
  deleteProviderPhoto,
  createProviderOffer,
  updateProviderOffer,
  deleteProviderOffer,
  createProviderProduct,
  updateProviderProduct,
  deleteProviderProduct
};
