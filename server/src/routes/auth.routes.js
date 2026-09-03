'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const auth = require('../services/auth.service');
const analytics = require('../services/analytics.service');
const { authenticate } = require('../middleware/auth');
const { cleanString, requireFields, isValidPhone } = require('../middleware/validate');

const router = express.Router();

function normalisePhone(value) {
  return cleanString(String(value || '').replace(/[\s-]/g, ''), 20);
}

/**
 * The only device-type signal this endpoint has, without touching web/ or
 * mobile/ to add a dedicated header: web/api.js already sends the literal
 * string 'web' as X-App-Version, while the Flutter app sends its real
 * version string (or omits the header entirely on a pre-#20 build) — so
 * anything other than exactly 'web' is this platform's one other client.
 */
function clientSignal(req) {
  const header = cleanString(req.get('X-App-Version'), 20);
  if (!header || header === 'web') return { platform: header ? 'web' : 'android', appVersion: null };
  return { platform: 'android', appVersion: header };
}

router.post('/auth/register', asyncHandler(async (req, res) => {
  requireFields(req.body, ['phone_number', 'full_name', 'pin_code']);

  const phone_number = normalisePhone(req.body.phone_number);
  if (!isValidPhone(phone_number)) {
    throw ApiError.badRequest('رقم الهاتف غير صالح');
  }

  const pin_code = cleanString(req.body.pin_code, 20);
  if (pin_code.length < 4) {
    throw ApiError.badRequest('رمز PIN يجب أن يكون 4 خانات على الأقل');
  }

  const result = await auth.register({
    phone_number,
    full_name: cleanString(req.body.full_name, 120),
    pin_code,
    clan_town: cleanString(req.body.clan_town, 100)
  });

  const signal = clientSignal(req);
  await analytics.recordSafely({
    eventName: 'register',
    userId: result.user.id,
    platform: signal.platform,
    appVersion: signal.appVersion
  });

  res.status(201).json({ success: true, ...result });
}));

router.post('/auth/login', asyncHandler(async (req, res) => {
  requireFields(req.body, ['phone_number', 'pin_code']);

  const result = await auth.login({
    phone_number: normalisePhone(req.body.phone_number),
    pin_code: cleanString(req.body.pin_code, 20)
  });

  const signal = clientSignal(req);
  await analytics.recordSafely({
    eventName: 'login',
    userId: result.user.id,
    platform: signal.platform,
    appVersion: signal.appVersion
  });

  res.json({ success: true, ...result });
}));

router.get('/auth/me', authenticate, asyncHandler(async (req, res) => {
  const user = await auth.findById(req.user.id);
  if (!user) throw ApiError.notFound('المستخدم غير موجود');
  res.json({ success: true, user });
}));

/**
 * The one setting this layer adds to "my account" — the analytics opt-out
 * switch (issue #44, privacy layer part 2). Reuses this same route shape
 * rather than inventing a dedicated privacy-settings convention: a client
 * reads the current value from GET /auth/me and flips it here.
 */
router.patch('/auth/me', authenticate, asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (typeof body.analytics_opt_out !== 'boolean') {
    throw ApiError.badRequest('قيمة analytics_opt_out يجب أن تكون true أو false');
  }

  const user = await auth.setAnalyticsOptOut(req.user.id, body.analytics_opt_out);
  res.json({
    success: true,
    user,
    message: body.analytics_opt_out ? 'تم إيقاف التحليلات السلوكية' : 'تم تفعيل التحليلات السلوكية'
  });
}));

module.exports = router;
