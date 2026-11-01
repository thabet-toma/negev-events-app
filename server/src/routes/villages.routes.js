'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const villages = require('../services/villages.service');
const activity = require('../services/activity.service');
const { requireSuperAdmin } = require('../middleware/auth');
const { cleanString, parseId, optionalId, requireCoordinate } = require('../middleware/validate');

const router = express.Router();

const MAX_LAT = 90;
const MAX_LNG = 180;

// Guarded on this router itself — a `router.use('/admin', ...)` registered in
// another file (e.g. admin.routes.js's requireAdmin) does not protect these
// paths just because they share the `/admin` prefix (same warning as
// occasionTypes.routes.js).
router.use('/admin/villages', requireSuperAdmin);
// Same reason, for the one villages path that lives under `/admin/events` —
// admin.routes.js's requireAdmin lets a plain admin through, this does not.
router.use('/admin/events/:id/promote-village', requireSuperAdmin);

router.get('/admin/villages', asyncHandler(async (req, res) => {
  res.json({ success: true, villages: await villages.listAllForAdmin() });
}));

router.post('/admin/villages', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const name = cleanString(body.name, 100);
  if (!name) throw ApiError.badRequest('اسم القرية مطلوب');

  const payload = {
    name,
    latitude: requireCoordinate(body.latitude, MAX_LAT, 'خط العرض'),
    longitude: requireCoordinate(body.longitude, MAX_LNG, 'خط الطول'),
    position: Number.isInteger(body.position) ? body.position : 0,
    is_active: body.is_active !== false
  };

  // محافظة القرية اختيارية هنا (تذكرة #120) — قرار مقصود، لا سهو (تذكرة #128):
  //
  // الإلزام مفروض في **اللوحة** وحدها (`#vilRegionId` مطلوب، ويُرسَل region_id في
  // كل إنشاء وتعديل). أما الخادم فيتسامح مع غيابه لأن اللوحة ملفات ثابتة منشورة
  // على استضافة مستقلة: نسخة قديمة منها — شُحنت قبل #128 — تنادي هذا المسار بلا
  // `region_id`، وردّها 400 يكسر إضافة القرى عند من لم يُحدَّث متصفّحه بعد، بلا
  // أن يكسب شيئاً: المحافظة الافتراضية تبقى صحيحة لكل قرية اليوم. ورفع هذا
  // التسامح (جعله 400) لا يجوز إلا بعد أن يصبح من المؤكَّد أن لا لوحة منشورة
  // تنادي المسار بدونه.
  //
  // الغائب و`null` و`''` سواء: كلها «لم تُرسل»، كما في مسارات المناسبات.
  const regionId = optionalId(body.region_id, 'المحافظة');
  if (regionId !== null) payload.region_id = regionId;

  const village = await villages.createVillage(payload);
  res.status(201).json({ success: true, village, message: 'تمت إضافة القرية بنجاح' });
}));

router.patch('/admin/villages/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف القرية');
  const body = req.body || {};
  const payload = {};

  if (body.name !== undefined) {
    const name = cleanString(body.name, 100);
    if (!name) throw ApiError.badRequest('اسم القرية مطلوب');
    payload.name = name;
  }
  if (body.latitude !== undefined) payload.latitude = requireCoordinate(body.latitude, MAX_LAT, 'خط العرض');
  if (body.longitude !== undefined) payload.longitude = requireCoordinate(body.longitude, MAX_LNG, 'خط الطول');
  if (body.position !== undefined) payload.position = Number.isInteger(body.position) ? body.position : 0;
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);
  // محافظة اختيارية (تذكرة #120) — خدمة القرى تتحقق أنها محافظة نشطة. الغائب
  // و`null` و`''` سواء: «لم تُرسل»، فتبقى المحافظة الحالية كما هي. ونفس التسامح
  // المقصود المشروح في POST أعلاه: الإلزام في اللوحة، وحماية اللوحة المنشورة هنا.
  const regionId = optionalId(body.region_id, 'المحافظة');
  if (regionId !== null) payload.region_id = regionId;

  const village = await villages.updateVillage(id, payload);
  res.json({ success: true, village, message: 'تم تحديث القرية بنجاح' });
}));

router.delete('/admin/villages/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف القرية');
  const result = await villages.deleteVillage(id);
  const message = result.deleted
    ? 'تم حذف القرية بنجاح'
    : 'لا يمكن حذف قرية لها مناسبات مرتبطة — تم تعطيلها بدلاً من ذلك فلن تظهر للناشرين';
  res.json({ success: true, message, ...result });
}));

/**
 * "قريتي غير موجودة": turns an event's typed village name into a real
 * village and links every catch-all event that asked for the same name.
 * Every body field is optional — the name defaults to the event's own
 * `requested_village_name`, the coordinates to the event's own pin.
 */
router.post('/admin/events/:id/promote-village', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const body = req.body || {};
  const options = { name: cleanString(body.name, 100) };
  if (body.latitude !== undefined) options.latitude = requireCoordinate(body.latitude, MAX_LAT, 'خط العرض');
  if (body.longitude !== undefined) options.longitude = requireCoordinate(body.longitude, MAX_LNG, 'خط الطول');

  const result = await villages.promoteRequestedVillage(eventId, options);
  await activity.record({ actorId: req.user.id, action: 'village_promoted', eventId, details: result.village && result.village.name });
  res.json({
    success: true,
    ...result,
    message: `تم اعتماد القرية وربط ${result.linked_events} مناسبة`
  });
}));

module.exports = router;
