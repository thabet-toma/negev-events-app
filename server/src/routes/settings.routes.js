'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const settings = require('../services/settings.service');
const { requireSuperAdmin } = require('../middleware/auth');
const { cleanString } = require('../middleware/validate');

const router = express.Router();

// أرقام جوال إسرائيلية فقط (05X-XXXXXXX)، محلياً بصفر بادئ أو دولياً بصيغة
// 972/+972 — وهذا فعلياً ما يقبله رابط واتساب wa.me. يُخزَّن دائماً بصيغة
// دولية بلا علامة + (مثال: 972501234567) كي لا تُضطر أي واجهة لتطبيع الرقم
// بنفسها قبل بناء رابط wa.me/<الرقم>.
const WHATSAPP_NUMBER_PATTERN = /^(?:\+?972|0)5\d{8}$/;

/**
 * `null` (an explicit clear — empty string, whitespace-only, or JSON `null`)
 * is a valid result, distinct from the key being absent from the request
 * body entirely (handled one layer up, before this function is ever called):
 * a saved number can otherwise never be removed once set, and a wrong number
 * is worse than none.
 */
function parseWhatsappNumber(raw) {
  const cleaned = cleanString(raw, 20);
  if (!cleaned) return null;

  const digitsOnly = cleaned.replace(/[\s-]/g, '');
  if (!WHATSAPP_NUMBER_PATTERN.test(digitsOnly)) {
    throw ApiError.badRequest('رقم واتساب غير صالح — أدخل رقم جوال إسرائيلي مثل 0501234567 أو 972501234567، أو أرسل قيمة فارغة لحذف الرقم المحفوظ');
  }

  const nationalPart = digitsOnly.replace(/^\+?972/, '').replace(/^0/, '');
  return `972${nationalPart}`;
}

// كل قيمة قابلة للحفظ تمرّ بمُحقِّقها الخاص — إضافة مفتاح جديد لاحقاً تعني
// إضافته هنا وفي SETTING_KEYS معاً، لا تخفيف هذا التحقق.
const VALIDATORS = {
  [settings.SETTING_KEYS.SUPPORT_WHATSAPP_NUMBER]: parseWhatsappNumber
};

// Guarded on this router itself — a `router.use('/admin', ...)` registered in
// another file (e.g. admin.routes.js's requireAdmin) does not protect these
// paths just because they share the `/admin` prefix (same warning as
// occasionTypes.routes.js and villages.routes.js).
router.use('/admin/settings', requireSuperAdmin);

router.get('/admin/settings', asyncHandler(async (req, res) => {
  res.json({ success: true, settings: await settings.getAllForAdmin() });
}));

router.put('/admin/settings', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const keys = Object.keys(body);
  if (!keys.length) throw ApiError.badRequest('لا توجد إعدادات للحفظ');

  const updates = {};
  for (const key of keys) {
    settings.assertWhitelisted(key);
    updates[key] = VALIDATORS[key](body[key]);
  }

  await settings.setSettings(updates, req.user.id);

  res.json({ success: true, settings: await settings.getAllForAdmin(), message: 'تم حفظ الإعدادات بنجاح' });
}));

router.get('/settings/public', asyncHandler(async (req, res) => {
  res.json({ success: true, settings: await settings.getPublicSettings() });
}));

module.exports = router;
