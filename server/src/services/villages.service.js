'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const townsService = require('./towns.service');
const { VILLAGES_TOWN } = require('../constants');

/**
 * `latitude`/`longitude` come back from mysql2 as strings (DECIMAL columns) —
 * every response shapes them as numbers, the same way `town_coordinates`
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

/**
 * One active village by its exact name, or null. Lets a publisher who typed
 * "قريتي غير موجودة" for a village that does exist be linked to it silently
 * instead of queuing a duplicate request for the super_admin.
 */
async function findActiveByName(name) {
  const row = await db.queryOne(
    'SELECT * FROM villages WHERE name = ? AND is_active = 1',
    [name]
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

/**
 * محافظة القرية (تذكرة #120): القاعدة نفسها التي تحكم محافظة المناسبة —
 * محافظة صريحة (بعد التحقق أنها **نشطة**)، وإلا المحافظة الافتراضية. تُفوَّض
 * إلى `townsService.resolveRegionForEventPlace` بدل تكرار منطق البند الجامع
 * والافتراضية هنا، فتبقى القاعدة ورسالة الرفض في مكان واحد. عمود
 * `villages.region_id` NOT NULL، فهذه الدالة وحدها هي ما يجعل طلب لوحة بلا
 * `region_id` ينجح كما ينجح اليوم.
 */
async function resolveVillageRegionId(regionId) {
  return townsService.resolveRegionForEventPlace({ town: VILLAGES_TOWN, regionId: regionId ?? null });
}

/**
 * محافظة قرية بمعرّفها، أو `null` إن لم تكن القرية موجودة. تسمح لطبقة
 * المناسبات بأن تعرف محافظة القرية المختارة **قبل** أي كتابة، فلا تعود مناسبة
 * تحت البند الجامع إلى المحافظة الافتراضية عند تغيير قريتها وحدها (تذكرة
 * #120).
 */
async function regionIdById(villageId) {
  if (villageId === null || villageId === undefined) return null;
  const row = await db.queryOne('SELECT region_id FROM villages WHERE id = ?', [villageId]);
  return row ? row.region_id : null;
}

/** Creates a village. Coordinates are already validated (range + presence) by the route layer. */
async function createVillage(data) {
  const existing = await db.queryOne('SELECT id FROM villages WHERE name = ?', [data.name]);
  if (existing) throw ApiError.conflict('توجد قرية بهذا الاسم مسبقاً');

  // المحافظة تُحلّ قبل الكتابة (تذكرة #120): طلب اللوحة الحالي لا يعرف
  // `region_id` فيأخذ المحافظة الافتراضية — فلا تتغيّر واجهة اللوحة ولا يُرفض
  // طلب قديم بسبب عمود NOT NULL جديد.
  const regionId = await resolveVillageRegionId(data.region_id);

  const { insertId } = await db.execute(
    `INSERT INTO villages (region_id, name, latitude, longitude, position, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [regionId, data.name, data.latitude, data.longitude, data.position ?? 0, data.is_active !== false ? 1 : 0]
  );
  return findByIdForAdmin(insertId);
}

async function findByIdForAdmin(id) {
  const row = await db.queryOne('SELECT * FROM villages WHERE id = ?', [id]);
  return row ? shapeVillage(row) : null;
}

/** Partial update — only columns present in `data` are written. */
async function updateVillage(id, data) {
  const existing = await db.queryOne('SELECT id, region_id FROM villages WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('القرية غير موجودة');

  if (data.name !== undefined) {
    const duplicate = await db.queryOne('SELECT id FROM villages WHERE name = ? AND id <> ?', [data.name, id]);
    if (duplicate) throw ApiError.conflict('توجد قرية بهذا الاسم مسبقاً');
  }

  // «تعديل يقبل region_id بنفس التحقق»: محافظة نشطة فقط. غياب الحقل يعني
  // «اترك المحافظة كما هي»، فطلب التعديل القديم يبقى يعمل كما كان.
  if (data.region_id !== undefined) await resolveVillageRegionId(data.region_id);

  const columns = ['region_id', 'name', 'latitude', 'longitude', 'position', 'is_active'];
  const assignments = [];
  const params = [];
  for (const column of columns) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(column === 'is_active' ? (data[column] ? 1 : 0) : data[column]);
  }

  // نقلٌ فعلي بين محافظتين — لا مجرّد إعادة إرسال المحافظة نفسها. مناسبات
  // القرية تتبعها في المعاملة نفسها، كما تتبع مناسبات البلدة بلدتها في
  // `updateTown`: فلا يبقى الصفّ على محافظة ومناسبته على أخرى لحظةً ما.
  const regionChanged = data.region_id !== undefined && data.region_id !== existing.region_id;

  if (assignments.length) {
    params.push(id);
    await db.transaction(async connection => {
      await connection.execute(`UPDATE villages SET ${assignments.join(', ')} WHERE id = ?`, params);
      if (regionChanged) {
        await connection.execute('UPDATE events SET region_id = ? WHERE village_id = ?', [data.region_id, id]);
      }
    });
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

/**
 * Promotes an event's typed "قريتي غير موجودة" name into a real village and
 * links every catch-all event that requested that same name (plus the event
 * itself) — one transaction, so a village never exists half-linked.
 *
 * `name` defaults to the event's own `requested_village_name`; a different
 * `name` is the super_admin correcting the spelling, and events that asked
 * for either spelling are linked. An existing village with that name (active
 * or disabled) is reused and re-activated rather than duplicated; only a new
 * one needs coordinates, which default to the event's own pin. Linked events
 * keep their own coordinates — each publisher chose that pin.
 *
 * The raw `connection.execute` inside `db.transaction` skips pool.js's
 * normalise(), so every bind value here is coerced to `null` explicitly.
 */
async function promoteRequestedVillage(eventId, { name = null, latitude = null, longitude = null } = {}) {
  const result = await db.transaction(async connection => {
    const [eventRows] = await connection.execute(
      'SELECT id, town, requested_village_name, latitude, longitude, region_id FROM events WHERE id = ?',
      [eventId]
    );
    const event = eventRows[0];
    if (!event) throw ApiError.notFound('المناسبة غير موجودة');
    if (event.town !== VILLAGES_TOWN) {
      throw ApiError.badRequest('لا يمكن اعتماد قرية إلا لمناسبة ضمن بند "القرى والتجمعات"');
    }

    const requestedName = event.requested_village_name ?? null;
    const villageName = name ?? requestedName;
    if (!villageName) {
      throw ApiError.badRequest('هذه المناسبة لا تحمل اسم قرية مطلوباً — أرسل اسم القرية');
    }

    const [villageRows] = await connection.execute('SELECT * FROM villages WHERE name = ?', [villageName]);
    const existingVillage = villageRows[0];
    // أسماء القرى فريدة عالمياً: قرية بالاسم نفسه في محافظة أخرى ليست القرية
    // المقصودة، وربط مناسبة من محافظة ثانية بها يترك الصفّ والمناسبة على
    // محافظتين. يُرفض قبل أي كتابة — تغيير الاسم أو تصحيح المحافظة قرار بشري.
    if (existingVillage && existingVillage.region_id !== event.region_id) {
      throw ApiError.badRequest('توجد قرية بهذا الاسم في محافظة أخرى — غيّر الاسم أو صحّح المحافظة');
    }

    let villageId;
    if (existingVillage) {
      villageId = existingVillage.id;
      // القرية في محافظة المناسبة نفسها (حرس أعلاه): إعادة التنشيط تربطها
      // كالمعتاد، ولا تُنقل محافظتها من هنا.
      if (!existingVillage.is_active) {
        await connection.execute('UPDATE villages SET is_active = 1 WHERE id = ?', [villageId]);
      }
    } else {
      const villageLatitude = latitude ?? event.latitude ?? null;
      const villageLongitude = longitude ?? event.longitude ?? null;
      if (villageLatitude === null || villageLongitude === null) {
        throw ApiError.badRequest('إحداثيات القرية مطلوبة — المناسبة بلا موقع على الخريطة؛ حدّده من «تعديل» ثم اعتمد القرية');
      }
      const [insert] = await connection.execute(
        // قرية جديدة تُولد على محافظة المناسبة نفسها (تذكرة #120): تُقرأ من
        // صفّ المناسبة داخل هذه المعاملة، لا تُشتقّ من جدول البلدات.
        `INSERT INTO villages (region_id, name, latitude, longitude, position, is_active)
         VALUES (?, ?, ?, ?, 0, 1)`,
        [event.region_id, villageName, villageLatitude, villageLongitude]
      );
      villageId = insert.insertId;
    }

    // ربط المناسبات مقيَّد بمحافظة المناسبة: اسم القرية وحده لا يكفي لأن الاسم
    // نفسه قد يخصّ قرية في محافظة أخرى، والربط عبر المحافظات هو ما كان يُنسب
    // فيه حدث طولكرمي إلى قرية نقبية تحمل الاسم ذاته.
    const [update] = await connection.execute(
      `UPDATE events
          SET village_id = ?, requested_village_name = NULL
        WHERE town = ?
          AND region_id = ?
          AND (id = ? OR requested_village_name IN (?, ?))`,
      [villageId, VILLAGES_TOWN, event.region_id, eventId, requestedName ?? villageName, villageName]
    );

    const [linkedVillageRows] = await connection.execute('SELECT * FROM villages WHERE id = ?', [villageId]);
    return { village: shapeVillage(linkedVillageRows[0]), linked_events: update.affectedRows };
  });

  logger.info('villages.promote', { eventId, villageId: result.village.id, linked: result.linked_events });
  return result;
}

module.exports = {
  listActive,
  findActiveById,
  findActiveByName,
  regionIdById,
  promoteRequestedVillage,
  listAllForAdmin,
  createVillage,
  updateVillage,
  deleteVillage
};
