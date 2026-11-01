'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
// Spelling-insensitive key (never stored), so «عرعره» cannot be added next to «عرعرة».
const { nameKey } = require('../utils/arabicName');
const { VILLAGES_TOWN } = require('../constants');

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

/**
 * قراءة الاكتشاف لمنتقي المناطق (تذكرة #127) — **مفتاحان** لا قائمة واحدة:
 * `{ regions, soon }`.
 *
 * - `regions`: المحافظات **النشطة وحدها**، بالشكل الذي كانت عليه قبل هذه
 *   التذكرة (`id, name, latitude, longitude, map_zoom, position, towns`) زائد
 *   `is_active: true` والعدّادين. **لا تُضاف الموقوفة إلى هذه القائمة أبداً:**
 *   كل APK منشور قبل #127 يبني منتقي بلدة النشر من `regions` بلا فحص حالة،
 *   فوجود موقوفة فيها يجعله يعرضها مكاناً صالحاً ثم يأخذ 400 «البلدة المختارة
 *   غير معروفة» عند النشر — وكل عميل منشور يرسل `X-App-Version`، فلا يمكن
 *   التفريق بينه وبين الجديد على الخادم. القراءة الجديدة صنفٌ ثانٍ للموقوفة.
 * - `soon`: الموقوفة بمعرّفها واسمها **فقط** — منتقي الاكتشاف يرسمها «قريباً»
 *   بلا اختيار. بلا إحداثيات ولا أعداد عمداً: ليست مكان نشر، ولا تُوسَّط عليها
 *   خريطة، ولا رقم لها يُعرَض.
 *
 * - `towns_count` عدد **البلدات النشطة** في المحافظة وحدها: بلدة موقوفة لا
 *   تظهر في أي منتقٍ، فعدّها يعد بأماكن لا وجود لها في الاكتشاف.
 * - `events_count` عدد المناسبات **المعتمدة** (`status = 'approved'`) على
 *   `events.region_id`. الرقم يظهر للجمهور في ورقة التوسّع، فعدّ المعلَّق
 *   والمرفوض يجعله أوسع من المعروض فعلاً في التغذية — والصدق هنا مقدَّم على
 *   مطابقة عدّاد اللوحة الداخلي.
 * - `towns` و`position` يبقيان كما كانا: `towns` أسماء البلدات النشطة في
 *   المحافظة (اسم المحافظة وبلداتها أماكنُ نشر صالحة، ومنتقيات النشر وخريطة
 *   النشر تقرآنها)، و`position` ترتيب العرض.
 *
 * لماذا لا `listActiveRegions` هنا: تلك تُغذّي منطق النشر والتحقّق والبثّ ولا
 * تحمل عدّاداً؛ وهذه **قراءة اكتشاف** بالعدّادين، ولا يُستعمل ناتجها للتحقق من
 * مكان نشر أبداً.
 */
async function listDiscoveryRegions() {
  const [regions, towns] = await Promise.all([
    db.query(
      `SELECT r.id, r.name, r.is_active, r.latitude, r.longitude, r.map_zoom, r.position,
              (SELECT COUNT(*) FROM towns t WHERE t.region_id = r.id AND t.is_active = 1) AS towns_count,
              (SELECT COUNT(*) FROM events e WHERE e.region_id = r.id AND e.status = 'approved') AS events_count
         FROM regions r
        ORDER BY r.position ASC, r.id ASC`
    ),
    db.query(
      `SELECT region_id, name
         FROM towns
        WHERE is_active = 1
        ORDER BY position ASC, id ASC`
    )
  ]);
  const active = [];
  const soon = [];
  for (const region of regions) {
    if (!region.is_active) {
      soon.push({ id: region.id, name: region.name });
      continue;
    }
    active.push({
      id: region.id,
      name: region.name,
      is_active: true,
      latitude: toCoordinate(region.latitude),
      longitude: toCoordinate(region.longitude),
      map_zoom: Number(region.map_zoom),
      towns_count: Number(region.towns_count),
      events_count: Number(region.events_count),
      position: Number(region.position),
      towns: towns.filter(town => town.region_id === region.id).map(town => town.name)
    });
  }
  return { regions: active, soon };
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

/**
 * معرّف المحافظة الافتراضية (تذكرة #120): أول محافظة نشطة بترتيب العرض، أو
 * `null` إن لم توجد محافظة نشطة أصلاً. هذه هي محافظة أي مناسبة أو قرية لا
 * يحمل مكانها محافظة معروفة — وبها يبقى عميل 1.21.3 المنشور (ينشر تحت بند
 * «القرى والتجمعات» بلا محافظة) يعمل بلا أي تغيير في سلوكه.
 */
async function defaultRegionId() {
  const row = await db.queryOne(
    'SELECT id FROM regions WHERE is_active = 1 ORDER BY position ASC, id ASC LIMIT 1'
  );
  return row ? row.id : null;
}

/** هل هذا معرّف محافظة **نشطة**؟ — التحقق الذي تطلبه المحافظة المرسلة صراحةً. */
async function isActiveRegionId(regionId) {
  if (!Number.isInteger(regionId)) return false;
  return (await listActiveRegions()).some(region => region.id === regionId);
}

/**
 * صفّ محافظة بمعرّفها كما هو في القاعدة (تذكرة #121)، أو `null` إن لم يجده.
 * يقرأ `is_active` أيضاً لأن قارئ المحافظة في طبقة المسار يفرّق بين حالتين لا
 * يجوز خلطهما: محافظة **مجهولة** (400 عربي) ومحافظة **موقوفة** (الافتراضية +
 * سطر في السجل). `listActiveRegions` لا تصلح لذلك: تُخفي الموقوفة فتصير
 * المجهولة والموقوفة شيئاً واحداً.
 */
async function findRegionById(id) {
  if (!Number.isInteger(id)) return null;
  return db.queryOne('SELECT id, name, is_active FROM regions WHERE id = ?', [id]);
}

/**
 * محافظة اسم مكان (تذكرة #120): اسم بلدة نشطة ← محافظة بلدتها، واسم محافظة
 * نشطة ← معرّفها، وأي اسم آخر ← `null`. المقارنة حرفية في JS كما في
 * `isActiveTown`، لا `WHERE name = ?`: تهيئة العمود utf8mb4_unicode_ci تجعل
 * الصيغة الإملائية الأخرى تطابق في SQL، والاسم هو المفتاح المخزَّن في كل جدول
 * آخر (ADR-0007).
 */
async function findRegionIdForPlace(name) {
  if (!name) return null;
  const [towns, regions] = await Promise.all([listActive(), listActiveRegions()]);
  const town = towns.find(row => row.name === name);
  if (town) return town.region_id;
  const region = regions.find(row => row.name === name);
  return region ? region.id : null;
}

/**
 * القاعدة الوحيدة لحساب محافظة المناسبة (تذكرة #120) — تُستدعى من كل كتابة
 * لصفّ مناسبة: النشر، التعديل، البذرة، المستورِد، وسكربتات الاستيراد.
 *
 * - `regionId` صريحة ← هي، بعد التحقق أنها محافظة نشطة.
 * - بلدة حقيقية ← محافظتها. اسم محافظة ← هي.
 * - القرية المختارة ← محافظة القرية (`villageRegionId`). كانت الدالة لا ترى
 *   القرية، فتغيير `village_id` وحده تحت البند الجامع يعود إلى المحافظة
 *   الافتراضية — أي أن مناسبة طولكرمية تُغيَّر قريتها تصير نقبية.
 * - البند الجامع («القرى والتجمعات») ليس مكاناً: صفّه في `towns` يحمل محافظةً
 *   للعرض فقط، فلا تُشتقّ منها. تُؤخذ `regionId` المرسلة، وإلا محافظة القرية
 *   (`villageRegionId`، التعديل وحده يمرّرها)، وإلا `fallbackRegionId`
 *   (محافظة المناسبة الحالية في التعديل)، وإلا الافتراضية — وهذا ما يُبقي عميل
 *   1.21.3 المنشور، الذي ينشر تحت البند بلا محافظة، على سلوكه اليوم حرفياً.
 *   والنشر الجديد لا يمرّر محافظة القرية عمداً: قرار مقفول أن نشر البند الجامع
 *   بلا `region_id` يأخذ الافتراضية، فأي قرية يختارها عميل قديم لا تغيّره.
 * - اسم غير معروف ← `regionId` إن أُرسلت، وإلا `fallbackRegionId`، وإلا
 *   الافتراضية. لا خطأ هنا: طبقة المسار تتحقق من البلدة أصلاً (`isActivePlace`)،
 *   فالوصول إلى هنا باسم مجهول يعني قراءة صفّ قديم لا نشراً جديداً.
 *
 * وكل `regionId` تُرسَل صريحة تُتحقَّق **مرّة واحدة** في أوّل الدالة، أيّاً كان
 * الفرع الذي سيُحسب منه بعدها: معرّف محافظة غير موجود أو معطَّل كان يصل إلى
 * عمود المفتاح الأجنبي فيسقط بخطأ SQL (500) بدل رفض عربي مفهوم (400).
 *
 * يعيد معرّف المحافظة (number).
 */
async function resolveRegionForEventPlace({
  town,
  regionId = null,
  villageRegionId = null,
  fallbackRegionId = null
}) {
  const hasRegion = regionId !== null && regionId !== undefined;
  const hasVillageRegion = villageRegionId !== null && villageRegionId !== undefined;
  const hasFallback = fallbackRegionId !== null && fallbackRegionId !== undefined;

  if (hasRegion && !(await isActiveRegionId(regionId))) {
    throw ApiError.badRequest('المحافظة المختارة غير معروفة أو غير نشطة');
  }

  if (town === VILLAGES_TOWN) {
    if (hasRegion) return regionId;
    if (hasVillageRegion) return villageRegionId;
    return hasFallback ? fallbackRegionId : requireDefaultRegionId();
  }

  const placeRegionId = await findRegionIdForPlace(town);
  if (placeRegionId) return placeRegionId;
  if (hasRegion) return regionId;
  return hasFallback ? fallbackRegionId : requireDefaultRegionId();
}

/** `defaultRegionId()` أو رفض عربي واضح — عمود `events.region_id` لا يقبل NULL. */
async function requireDefaultRegionId() {
  const id = await defaultRegionId();
  if (id === null) {
    throw ApiError.badRequest('لا توجد محافظة نشطة في المنصة — تعذّر تحديد محافظة المكان');
  }
  return id;
}

// ======================================================================
// super_admin management (TWN-3). Names are the key every other table
// stores, so the rules below exist to keep a stored name meaningful:
// no duplicates by spelling variant, no renaming a name already in use,
// and the villages catch-all — hardcoded in every published APK — is fixed.
// ======================================================================

/** Reserved: 'الكل' is the "no filter" sentinel on every `?town=` list. */
const RESERVED_PLACE_NAMES = ['الكل'];

function shapeAdminTown(row) {
  return {
    id: row.id,
    region_id: row.region_id,
    name: row.name,
    latitude: toCoordinate(row.latitude),
    longitude: toCoordinate(row.longitude),
    position: Number(row.position),
    is_active: Boolean(row.is_active),
    events_count: Number(row.events_count || 0),
    // The catch-all's exact name is hardcoded in the server and every APK.
    locked: row.name === VILLAGES_TOWN
  };
}

/**
 * How many rows anywhere store `name` as a town — events, admin scopes,
 * provider towns, broadcasts and stories. A name with any reference cannot
 * be renamed (every one of those rows, and every published APK filtering on
 * it, would silently stop matching) and cannot be deleted, only disabled.
 * Snapshots (activity_log.event_town, analytics) are history, not references.
 */
async function countReferences(name) {
  const row = await db.queryOne(
    `SELECT
       (SELECT COUNT(*) FROM events WHERE town = ?)
     + (SELECT COUNT(*) FROM admin_towns WHERE town = ?)
     + (SELECT COUNT(*) FROM service_provider_towns WHERE town = ?)
     + (SELECT COUNT(*) FROM broadcasts WHERE scope_town = ?)
     + (SELECT COUNT(*) FROM stories WHERE town = ?) AS total`,
    [name, name, name, name, name]
  );
  return Number(row.total);
}

/** Throws 400 for a reserved name, and 409 unless `name` is free across towns and regions. */
async function assertNameAvailable(name, { exceptTownId = null, exceptRegionId = null } = {}) {
  const key = nameKey(name);
  if (RESERVED_PLACE_NAMES.some(reserved => nameKey(reserved) === key)) {
    throw ApiError.badRequest(`الاسم "${name}" محجوز ولا يصلح اسماً لمكان`);
  }
  const [towns, regions] = await Promise.all([
    db.query('SELECT id, name FROM towns'),
    db.query('SELECT id, name FROM regions')
  ]);
  const townClash = towns.find(town => town.id !== exceptTownId && nameKey(town.name) === key);
  if (townClash) throw ApiError.conflict(`توجد بلدة بهذا الاسم مسبقاً: "${townClash.name}"`);
  const regionClash = regions.find(region => region.id !== exceptRegionId && nameKey(region.name) === key);
  if (regionClash) throw ApiError.conflict(`"${regionClash.name}" اسم محافظة — لا يصلح اسماً لبلدة`);
}

async function findRegionOrFail(regionId) {
  const region = await db.queryOne('SELECT * FROM regions WHERE id = ?', [regionId]);
  if (!region) throw ApiError.badRequest('المحافظة المختارة غير موجودة');
  return region;
}

async function findTownRow(id) {
  const row = await db.queryOne(
    `SELECT t.*, (SELECT COUNT(*) FROM events e WHERE e.town = t.name) AS events_count
       FROM towns t WHERE t.id = ?`,
    [id]
  );
  if (!row) throw ApiError.notFound('البلدة غير موجودة');
  return row;
}

/**
 * Every region (active or not) with every town under it (active or not),
 * each town's event count, and the number of events (any status — the same set
 * the admin list shows under «الكل») filed under the
 * region itself — the "بلا بلدة محدّدة" queue an admin resolves.
 */
async function listForAdmin() {
  const [regions, towns] = await Promise.all([
    db.query(
      `SELECT r.*,
              (SELECT COUNT(*) FROM events e WHERE e.town = r.name) AS unplaced_events
         FROM regions r
        ORDER BY r.position ASC, r.id ASC`
    ),
    db.query(
      `SELECT t.*, COUNT(e.id) AS events_count
         FROM towns t
         LEFT JOIN events e ON e.town = t.name
        GROUP BY t.id
        ORDER BY t.position ASC, t.id ASC`
    )
  ]);
  return regions.map(region => ({
    id: region.id,
    name: region.name,
    latitude: Number(region.latitude),
    longitude: Number(region.longitude),
    map_zoom: Number(region.map_zoom),
    position: Number(region.position),
    is_active: Boolean(region.is_active),
    unplaced_events: Number(region.unplaced_events),
    towns: towns.filter(town => town.region_id === region.id).map(shapeAdminTown)
  }));
}

/** Creates a town at the end of its region unless a position is given. Coordinates are validated by the route. */
async function createTown(data, { actorId = null } = {}) {
  await findRegionOrFail(data.region_id);
  await assertNameAvailable(data.name);

  let position = data.position;
  if (position === undefined || position === null) {
    const row = await db.queryOne('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM towns WHERE region_id = ?', [data.region_id]);
    position = Number(row.next);
  }
  const { insertId } = await db.execute(
    `INSERT INTO towns (region_id, name, latitude, longitude, position, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.region_id, data.name, data.latitude, data.longitude, position, data.is_active === false ? 0 : 1]
  );
  logger.info('towns.create', { townId: insertId, regionId: data.region_id, actorId });
  return shapeAdminTown(await findTownRow(insertId));
}

/**
 * إنشاء محافظة جديدة (تذكرة #128) — على نمط `createTown` نفسه، وبلا مسار آخر:
 * الاسم هو ما يُخزَّن في كل جدول آخر (`events.region_id` معرّف، لكن اسم المحافظة
 * نفسه بلدة صالحة للمناسبة)، فـ`assertNameAvailable` يرفض أي اسم مكرّر داخل
 * البلدات أو المحافظات (409). الإحداثيات والتكبير يتحقق منهما الراوتر كما في
 * `PATCH /admin/regions/:id`، و`map_zoom` يأخذ افتراضي العمود (9) إن لم يُرسل.
 */
async function createRegion(data, { actorId = null } = {}) {
  await assertNameAvailable(data.name);

  let position = data.position;
  if (position === undefined || position === null) {
    const row = await db.queryOne('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM regions');
    position = Number(row.next);
  }
  const { insertId } = await db.execute(
    `INSERT INTO regions (name, latitude, longitude, map_zoom, position, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.name, data.latitude, data.longitude, data.map_zoom ?? 9, position, data.is_active === false ? 0 : 1]
  );
  logger.info('regions.create', { regionId: insertId, actorId });
  return (await listForAdmin()).find(region => region.id === insertId);
}

/**
 * نقل بلدة بين محافظتين (تذكرة #120): لا يبقى صفّ مناسبتها — ولا قرية مرتبطة
 * بمناسباتها — على المحافظة القديمة. تُستدعى داخل معاملة `updateTown` نفسها
 * التي تحدّث صفّ البلدة، فلا تُقرأ بلدة في محافظة ومناسباتها في أخرى لحظةً ما.
 *
 * البند الجامع حالة خاصة: كل قرى المنصّة تحته، فتُحدَّث كل صفوف `villages`،
 * لا القرى المرتبطة بمناسباته وحدها. الفرع أدناه **دفاعي فقط**: `updateTown`
 * يقفل تغيير محافظة البند الجامع اليوم (`locked`)، فلا يصل إليه طلب فعلي؛
 * فتحُه يقتضي إقرار نقل كل قرى المنصّة معه، لا إسقاط هذا الفرع.
 * الجداول الملموسة: `events` و`villages` فقط.
 */
async function moveTownRegion(connection, { townName, regionId, isCatchAll = false }) {
  await connection.execute(
    'UPDATE events SET region_id = ? WHERE town = ?',
    [regionId, townName]
  );

  if (isCatchAll) {
    await connection.execute('UPDATE villages SET region_id = ?', [regionId]);
  } else {
    await connection.execute(
      `UPDATE villages v
         JOIN events e ON e.village_id = v.id
          SET v.region_id = ?
        WHERE e.town = ?`,
      [regionId, townName]
    );
  }
}

/**
 * Partial update. The villages catch-all may only be reordered; any other
 * town may be renamed only while nothing stores its name yet (a typo fixed
 * right after adding it) — once used, the answer is a new town plus
 * disabling the old one, never a rename that orphans every row behind it.
 */
async function updateTown(id, data, { actorId = null } = {}) {
  const existing = await findTownRow(id);
  const locked = existing.name === VILLAGES_TOWN;
  const renaming = data.name !== undefined && data.name !== existing.name;

  if (locked && (renaming || data.is_active === false || data.latitude !== undefined
      || data.longitude !== undefined || data.region_id !== undefined)) {
    throw ApiError.badRequest(`بند "${VILLAGES_TOWN}" ثابت في كل نسخ التطبيق — يمكن تغيير ترتيبه فقط`);
  }
  if (renaming) {
    await assertNameAvailable(data.name, { exceptTownId: id });
    if (await countReferences(existing.name) > 0) {
      throw ApiError.conflict('لا يمكن تغيير اسم بلدة مستعملة في مناسبات أو صلاحيات قائمة — أضف البلدة بالاسم الصحيح ثم عطّل القديمة');
    }
  }
  if (data.region_id !== undefined) await findRegionOrFail(data.region_id);

  const columns = ['region_id', 'name', 'latitude', 'longitude', 'position', 'is_active'];
  const assignments = [];
  const params = [];
  for (const column of columns) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(column === 'is_active' ? (data[column] ? 1 : 0) : data[column]);
  }
  // نقلٌ فعلي بين محافظتين — لا مجرّد إعادة إرسال المحافظة نفسها — هو ما
  // يستدعي تحديث مناسبات البلدة وقُراها.
  const regionChanged = data.region_id !== undefined && data.region_id !== existing.region_id;

  if (assignments.length) {
    params.push(id);
    if (regionChanged) {
      await db.transaction(async connection => {
        await connection.execute(`UPDATE towns SET ${assignments.join(', ')} WHERE id = ?`, params);
        await moveTownRegion(connection, { townName: existing.name, regionId: data.region_id, isCatchAll: locked });
      });
    } else {
      await db.execute(`UPDATE towns SET ${assignments.join(', ')} WHERE id = ?`, params);
    }
    logger.info('towns.update', {
      townId: id,
      fields: Object.keys(data).filter(key => data[key] !== undefined),
      regionMoved: regionChanged,
      actorId
    });
  }
  return shapeAdminTown(await findTownRow(id));
}

/**
 * An unreferenced town is deleted outright; a referenced one is disabled
 * instead (it leaves every picker, its events keep their name) and the
 * caller is told which happened — same contract as villages.deleteVillage.
 */
async function deleteTown(id, { actorId = null } = {}) {
  const existing = await findTownRow(id);
  if (existing.name === VILLAGES_TOWN) {
    throw ApiError.badRequest(`بند "${VILLAGES_TOWN}" ثابت في كل نسخ التطبيق ولا يُحذف`);
  }
  if (await countReferences(existing.name) === 0) {
    await db.execute('DELETE FROM towns WHERE id = ?', [id]);
    logger.info('towns.delete', { townId: id, actorId });
    return { deleted: true, disabled: false };
  }
  await db.execute('UPDATE towns SET is_active = 0 WHERE id = ?', [id]);
  logger.info('towns.disable', { townId: id, actorId });
  return { deleted: false, disabled: true };
}

/**
 * Rewrites the display order of one region's towns in one transaction.
 * `townIds` must be exactly that region's towns (active and disabled) — a
 * partial or foreign list is refused rather than half-applied.
 */
async function reorderTowns(regionId, townIds, { actorId = null } = {}) {
  await findRegionOrFail(regionId);
  const rows = await db.query('SELECT id FROM towns WHERE region_id = ?', [regionId]);
  const current = rows.map(row => row.id).sort((a, b) => a - b);
  const requested = [...townIds].sort((a, b) => a - b);
  if (current.length !== requested.length || current.some((townId, index) => townId !== requested[index])) {
    throw ApiError.badRequest('ترتيب البلدات يجب أن يشمل كل بلدات المحافظة مرّة واحدة لكل بلدة');
  }
  await db.transaction(async connection => {
    for (const [index, townId] of townIds.entries()) {
      await connection.execute('UPDATE towns SET position = ? WHERE id = ?', [index, townId]);
    }
  });
  logger.info('towns.reorder', { regionId, count: townIds.length, actorId });
  return listForAdmin();
}

/**
 * Edits a region's name, map centre or zoom. Its name is stored on every
 * event filed under it (and possibly in admin scopes), so — like a town —
 * it cannot be renamed while in use. Activation is not editable here: taking
 * the only region offline would empty every town picker at once.
 */
async function updateRegion(id, data, { actorId = null } = {}) {
  const existing = await findRegionOrFail(id);
  const renaming = data.name !== undefined && data.name !== existing.name;
  if (renaming) {
    await assertNameAvailable(data.name, { exceptRegionId: id });
    if (await countReferences(existing.name) > 0) {
      throw ApiError.conflict('لا يمكن تغيير اسم محافظة مستعملة في مناسبات أو صلاحيات قائمة');
    }
  }
  const columns = ['name', 'latitude', 'longitude', 'map_zoom'];
  const assignments = [];
  const params = [];
  for (const column of columns) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(data[column]);
  }
  if (assignments.length) {
    params.push(id);
    await db.execute(`UPDATE regions SET ${assignments.join(', ')} WHERE id = ?`, params);
    logger.info('regions.update', { regionId: id, fields: Object.keys(data).filter(key => data[key] !== undefined), actorId });
  }
  return (await listForAdmin()).find(region => region.id === id);
}

module.exports = {
  listActive,
  activeNames,
  coordinatesByName,
  isActiveTown,
  listActiveRegions,
  listDiscoveryRegions,
  activeRegionNames,
  isRegionName,
  isActivePlace,
  knownTownNames,
  knownPlaceNames,
  defaultRegionName,
  defaultRegionId,
  findRegionById,
  isActiveRegionId,
  findRegionIdForPlace,
  resolveRegionForEventPlace,
  nameKey,
  listForAdmin,
  createTown,
  updateTown,
  deleteTown,
  reorderTowns,
  createRegion,
  updateRegion
};
