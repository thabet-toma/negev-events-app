'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const towns = require('../services/towns.service');
const { requireSuperAdmin } = require('../middleware/auth');
const { cleanString, parseId, requireCoordinate } = require('../middleware/validate');

const router = express.Router();

const MAX_LAT = 90;
const MAX_LNG = 180;
const MIN_MAP_ZOOM = 5;
const MAX_MAP_ZOOM = 16;

// Guarded on this router itself — a `router.use('/admin', ...)` registered in
// another file (e.g. admin.routes.js's requireAdmin) does not protect these
// paths just because they share the `/admin` prefix (same warning as
// villages.routes.js). Towns and regions are platform geography: never a
// town admin's call.
router.use(['/admin/towns', '/admin/regions'], requireSuperAdmin);

function parseName(value, label) {
  const name = cleanString(value, 100);
  if (!name) throw ApiError.badRequest(`اسم ${label} مطلوب`);
  return name;
}

function parsePosition(value) {
  return Number.isInteger(value) ? value : 0;
}

/** مستوى تقريب الخريطة — الحدّ نفسه في الإنشاء والتعديل. */
function parseMapZoom(value) {
  const zoom = Number(value);
  if (!Number.isInteger(zoom) || zoom < MIN_MAP_ZOOM || zoom > MAX_MAP_ZOOM) {
    throw ApiError.badRequest(`مستوى تقريب الخريطة يجب أن يكون بين ${MIN_MAP_ZOOM} و${MAX_MAP_ZOOM}`);
  }
  return zoom;
}

router.get('/admin/towns', asyncHandler(async (req, res) => {
  res.json({ success: true, regions: await towns.listForAdmin() });
}));

router.post('/admin/towns', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const payload = {
    region_id: parseId(body.region_id, 'المحافظة'),
    name: parseName(body.name, 'البلدة'),
    latitude: requireCoordinate(body.latitude, MAX_LAT, 'خط العرض'),
    longitude: requireCoordinate(body.longitude, MAX_LNG, 'خط الطول'),
    position: body.position === undefined ? undefined : parsePosition(body.position),
    is_active: body.is_active !== false
  };
  const town = await towns.createTown(payload, { actorId: req.user.id });
  res.status(201).json({ success: true, town, message: 'تمت إضافة البلدة بنجاح' });
}));

// Registered before `/:id` only for readability — PUT and PATCH never collide.
router.put('/admin/towns/order', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const regionId = parseId(body.region_id, 'المحافظة');
  if (!Array.isArray(body.town_ids) || !body.town_ids.length) {
    throw ApiError.badRequest('قائمة ترتيب البلدات مطلوبة');
  }
  const townIds = body.town_ids.map(id => parseId(id, 'معرّف البلدة'));
  if (new Set(townIds).size !== townIds.length) {
    throw ApiError.badRequest('ترتيب البلدات يجب أن يشمل كل بلدات المحافظة مرّة واحدة لكل بلدة');
  }
  const regions = await towns.reorderTowns(regionId, townIds, { actorId: req.user.id });
  res.json({ success: true, regions, message: 'تم حفظ ترتيب البلدات' });
}));

router.patch('/admin/towns/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف البلدة');
  const body = req.body || {};
  const payload = {};
  if (body.name !== undefined) payload.name = parseName(body.name, 'البلدة');
  if (body.region_id !== undefined) payload.region_id = parseId(body.region_id, 'المحافظة');
  if (body.latitude !== undefined) payload.latitude = requireCoordinate(body.latitude, MAX_LAT, 'خط العرض');
  if (body.longitude !== undefined) payload.longitude = requireCoordinate(body.longitude, MAX_LNG, 'خط الطول');
  if (body.position !== undefined) payload.position = parsePosition(body.position);
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  const town = await towns.updateTown(id, payload, { actorId: req.user.id });
  res.json({ success: true, town, message: 'تم تحديث البلدة بنجاح' });
}));

router.delete('/admin/towns/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف البلدة');
  const result = await towns.deleteTown(id, { actorId: req.user.id });
  const message = result.deleted
    ? 'تم حذف البلدة بنجاح'
    : 'البلدة مستعملة في مناسبات أو صلاحيات قائمة فلا تُحذف — تم تعطيلها بدلاً من ذلك فلن تظهر للناشرين، ومناسباتها تبقى كما هي';
  res.json({ success: true, message, ...result });
}));

/**
 * إنشاء محافظة (تذكرة #128): كانت اللوحة تعرف تعديل محافظة قائمة فقط، فإدخال
 * محافظة جديدة كان يقتضي مهاجرة يدوية. الحارس هو `requireSuperAdmin` نفسه أعلاه،
 * والإحداثيات والتكبير يُتحقَّق منهما هنا كما في `PATCH` تماماً.
 */
router.post('/admin/regions', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const payload = {
    name: parseName(body.name, 'المحافظة'),
    latitude: requireCoordinate(body.latitude, MAX_LAT, 'خط العرض'),
    longitude: requireCoordinate(body.longitude, MAX_LNG, 'خط الطول'),
    map_zoom: body.map_zoom === undefined ? undefined : parseMapZoom(body.map_zoom),
    position: body.position === undefined ? undefined : parsePosition(body.position),
    is_active: body.is_active !== false
  };
  const region = await towns.createRegion(payload, { actorId: req.user.id });
  res.status(201).json({ success: true, region, message: 'تمت إضافة المحافظة بنجاح' });
}));

router.patch('/admin/regions/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف المحافظة');
  const body = req.body || {};
  const payload = {};
  if (body.name !== undefined) payload.name = parseName(body.name, 'المحافظة');
  if (body.latitude !== undefined) payload.latitude = requireCoordinate(body.latitude, MAX_LAT, 'خط العرض');
  if (body.longitude !== undefined) payload.longitude = requireCoordinate(body.longitude, MAX_LNG, 'خط الطول');
  if (body.map_zoom !== undefined) payload.map_zoom = parseMapZoom(body.map_zoom);
  if (!Object.keys(payload).length) throw ApiError.badRequest('لم يتم إرسال أي تعديل');

  const region = await towns.updateRegion(id, payload, { actorId: req.user.id });
  res.json({ success: true, region, message: 'تم تحديث المحافظة بنجاح' });
}));

module.exports = router;
