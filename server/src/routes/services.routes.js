'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const services = require('../services/services.service');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { serviceMedia } = require('../middleware/upload');
const { cleanString, requireFields, parseId, parseAmount, isValidPhone } = require('../middleware/validate');
const { TOWNS } = require('../constants');

const router = express.Router();

/** Parses a submitted `towns` array — non-empty, deduplicated; membership/containment checked by the service layer. */
function parseTowns(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    throw ApiError.badRequest('يجب تحديد بلدة واحدة على الأقل يخدمها المزوّد');
  }
  const towns = [...new Set(raw.map(town => cleanString(town, 100)).filter(Boolean))];
  if (!towns.length) {
    throw ApiError.badRequest('يجب تحديد بلدة واحدة على الأقل يخدمها المزوّد');
  }
  return towns;
}

/** Parses a `consent_at` timestamp. Required on create — enforcement rule 7. */
function requireConsentAt(value) {
  if (value === undefined || value === null || value === '') {
    throw ApiError.badRequest('تاريخ تسجيل إذن المزوّد (consent_at) مطلوب');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest('تاريخ تسجيل إذن المزوّد (consent_at) غير صالح');
  }
  return parsed;
}

// --- Public directory (no auth — story 18) ----------------------------

router.get('/services/categories', asyncHandler(async (req, res) => {
  res.json({ success: true, categories: await services.listActiveCategories() });
}));

router.get('/services/providers', asyncHandler(async (req, res) => {
  const { providers, pagination } = await services.listPublicProviders({
    categoryId: req.query.category_id ? parseId(req.query.category_id, 'معرّف الفئة') : null,
    town: cleanString(req.query.town, 100),
    page: req.query.page,
    limit: req.query.limit
  });
  res.json({ success: true, providers, pagination });
}));

router.get('/services/providers/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  res.json({ success: true, provider: await services.getPublicProviderById(id) });
}));

// --- User submissions (authenticated) --------------------------------

router.post('/services/providers', authenticate, serviceMedia, asyncHandler(async (req, res) => {
  const body = req.body || {};
  requireFields(body, ['name', 'phone', 'category_id']);

  const phone = cleanString(body.phone, 30);
  if (!isValidPhone(phone)) throw ApiError.badRequest('رقم الهاتف غير صالح');

  let towns = [];
  if (typeof body.towns === 'string') {
    try {
      towns = JSON.parse(body.towns);
    } catch {
      towns = body.towns.split(',').map(s => s.trim()).filter(Boolean);
    }
  } else if (Array.isArray(body.towns)) {
    towns = body.towns;
  }
  towns = parseTowns(towns);

  for (const town of towns) {
    if (!TOWNS.includes(town)) throw ApiError.badRequest(`البلدة "${town}" غير معروفة`);
  }

  const imageFile = req.files?.image?.[0] || req.file;
  const imageUrl = imageFile ? `/uploads/${imageFile.filename}` : cleanString(body.image_url, 500);

  let price = null;
  if (body.price !== undefined && body.price !== null && String(body.price).trim() !== '') {
    price = parseAmount(body.price);
  }

  const providerId = await services.createProvider({
    category_id: parseId(body.category_id, 'الفئة'),
    name: cleanString(body.name, 150),
    phone,
    description: cleanString(body.description, 2000),
    image_url: imageUrl,
    price,
    status: 'pending',
    is_active: true,
    consent_at: new Date(),
    consent_by: req.user.id,
    consent_channel: 'app_submission',
    created_by: req.user.id,
    towns
  });

  res.status(201).json({
    success: true,
    providerId,
    message: 'تم إرسال عرض الخدمة بنجاح وهو قيد مراجعة الإدارة'
  });
}));

router.get('/services/my-services', authenticate, asyncHandler(async (req, res) => {
  const list = await services.listMyServices(req.user.id);
  res.json({ success: true, services: list });
}));

// --- Admin: service providers — `admin` role, scoped to their towns ---
// Guarded on this router itself, same warning as occasionTypes.routes.js:
// a `router.use('/admin', requireAdmin)` registered elsewhere does not
// protect these paths just because they share the `/admin` prefix.

router.use('/admin/service-providers', requireAdmin);

router.get('/admin/service-providers', asyncHandler(async (req, res) => {
  const { providers, pagination } = await services.listProvidersForAdmin(req.user, {
    categoryId: req.query.category_id ? parseId(req.query.category_id, 'معرّف الفئة') : null,
    page: req.query.page,
    limit: req.query.limit
  });
  res.json({ success: true, providers, pagination });
}));

router.get('/admin/service-providers/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  res.json({ success: true, provider: await services.getProviderForAdmin(req.user, id) });
}));

router.post('/admin/service-providers', asyncHandler(async (req, res) => {
  const body = req.body || {};
  requireFields(body, ['name', 'phone']);

  const phone = cleanString(body.phone, 30);
  if (!isValidPhone(phone)) throw ApiError.badRequest('رقم الهاتف غير صالح');

  // Enforcement rule 7: a provider cannot be created without consent_at and
  // consent_channel — validated here, in the route layer, not the service.
  const consentAt = requireConsentAt(body.consent_at);
  const consentChannel = cleanString(body.consent_channel, 20);
  if (!consentChannel) throw ApiError.badRequest('طريقة تسجيل الإذن (consent_channel) مطلوبة');

  const towns = parseTowns(body.towns);
  // Containment test: an admin may only assign towns within its own scope;
  // super_admin may assign any town in TOWNS. Rejects the whole request —
  // never a silent trim.
  await services.assertTownsWithinScope(req.user, towns);

  let price = null;
  if (body.price !== undefined && body.price !== null && String(body.price).trim() !== '') {
    price = parseAmount(body.price);
  }

  const providerId = await services.createProvider({
    category_id: parseId(body.category_id, 'الفئة'),
    name: cleanString(body.name, 150),
    phone,
    description: cleanString(body.description, 2000),
    image_url: cleanString(body.image_url, 500),
    price,
    status: 'approved',
    is_active: body.is_active !== false,
    consent_at: consentAt,
    consent_by: req.user.id,
    consent_channel: consentChannel,
    created_by: req.user.id,
    towns
  });

  res.status(201).json({ success: true, providerId, message: 'تمت إضافة مزوّد الخدمة بنجاح' });
}));

router.patch('/admin/service-providers/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  // Confirms the provider exists AND is in scope before writing anything —
  // out-of-scope is a 404, never a 403 (a 403 would confirm the row exists
  // to an admin who cannot see it).
  await services.getProviderForAdmin(req.user, id);

  const body = req.body || {};
  const payload = {};

  if (body.category_id !== undefined) payload.category_id = parseId(body.category_id, 'الفئة');
  if (body.name !== undefined) {
    const name = cleanString(body.name, 150);
    if (!name) throw ApiError.badRequest('اسم مزوّد الخدمة مطلوب');
    payload.name = name;
  }
  if (body.phone !== undefined) {
    const phone = cleanString(body.phone, 30);
    if (!isValidPhone(phone)) throw ApiError.badRequest('رقم الهاتف غير صالح');
    payload.phone = phone;
  }
  if (body.description !== undefined) payload.description = cleanString(body.description, 2000);
  if (body.image_url !== undefined) payload.image_url = cleanString(body.image_url, 500);
  if (body.price !== undefined) {
    payload.price = (body.price === null || String(body.price).trim() === '') ? null : parseAmount(body.price);
  }
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  if (body.towns !== undefined) {
    const towns = parseTowns(body.towns);
    await services.assertTownsWithinScope(req.user, towns);
    payload.towns = towns;
  }

  await services.updateProvider(id, payload);
  res.json({ success: true, provider: await services.getProviderForAdmin(req.user, id), message: 'تم تحديث مزوّد الخدمة بنجاح' });
}));

router.patch('/admin/service-providers/:id/status', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  await services.getProviderForAdmin(req.user, id);

  const status = cleanString(req.body.status, 20);
  const rejectionReason = cleanString(req.body.rejection_reason, 500);

  await services.updateProviderStatus(id, { status, rejectionReason });
  res.json({ success: true, message: 'تم تحديث حالة مزوّد الخدمة بنجاح' });
}));

router.delete('/admin/service-providers/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  await services.getProviderForAdmin(req.user, id);
  await services.deleteProvider(id);
  res.json({ success: true, message: 'تم حذف مزوّد الخدمة بنجاح' });
}));

// --- Super-admin: service categories (story 34) ------------------------

router.use('/admin/service-categories', requireSuperAdmin);

router.get('/admin/service-categories', asyncHandler(async (req, res) => {
  res.json({ success: true, categories: await services.listAllCategoriesForAdmin() });
}));

router.post('/admin/service-categories', asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'icon', 'color']);

  const category = await services.createCategory({
    name: cleanString(req.body.name, 60),
    icon: cleanString(req.body.icon, 60),
    color: cleanString(req.body.color, 20),
    position: Number.isInteger(req.body.position) ? req.body.position : 0,
    is_active: req.body.is_active !== false
  });

  res.status(201).json({ success: true, category, message: 'تمت إضافة فئة الخدمة بنجاح' });
}));

router.patch('/admin/service-categories/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف فئة الخدمة');
  const body = req.body || {};
  const payload = {};

  if (body.name !== undefined) payload.name = cleanString(body.name, 60);
  if (body.icon !== undefined) payload.icon = cleanString(body.icon, 60);
  if (body.color !== undefined) payload.color = cleanString(body.color, 20);
  if (body.position !== undefined) payload.position = Number.isInteger(body.position) ? body.position : 0;
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

  const category = await services.updateCategory(id, payload);
  res.json({ success: true, category, message: 'تم تحديث فئة الخدمة بنجاح' });
}));

router.delete('/admin/service-categories/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف فئة الخدمة');
  const result = await services.deleteCategory(id);
  const message = result.deleted
    ? 'تم حذف فئة الخدمة بنجاح'
    : 'لا يمكن حذف فئة لها مزوّدون مرتبطون — تم تعطيلها بدلاً من ذلك فلن تظهر في الدليل';
  res.json({ success: true, message, ...result });
}));

module.exports = router;
