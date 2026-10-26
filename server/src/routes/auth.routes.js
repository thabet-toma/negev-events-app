'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const auth = require('../services/auth.service');
const analytics = require('../services/analytics.service');
const { authenticate } = require('../middleware/auth');
const { avatarMedia } = require('../middleware/upload');
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
  // `token` is present only for plain users (see auth.renewToken) — a client
  // stores it when it is there and keeps its current one otherwise.
  const token = auth.renewToken(user);
  res.json({ success: true, user, ...(token ? { token } : {}) });
}));

/**
 * "My account" edits: the analytics opt-out switch (issue #44, privacy layer
 * part 2), and — since T-03 — the two self-reported profile facts, name and
 * town. A request carrying neither profile field is the original opt-out
 * branch, unchanged down to its two messages. `phone_number` is read nowhere
 * here on purpose: it is the sign-in identifier, so changing it needs the
 * current PIN and has its own route below.
 */
router.patch('/auth/me', authenticate, asyncHandler(async (req, res) => {
  const body = req.body || {};

  if (body.full_name === undefined && body.clan_town === undefined) {
    if (typeof body.analytics_opt_out !== 'boolean') {
      throw ApiError.badRequest('قيمة analytics_opt_out يجب أن تكون true أو false');
    }

    const user = await auth.setAnalyticsOptOut(req.user.id, body.analytics_opt_out);
    res.json({
      success: true,
      user,
      message: body.analytics_opt_out ? 'تم إيقاف التحليلات السلوكية' : 'تم تفعيل التحليلات السلوكية'
    });
    return;
  }

  let fullName;
  if (body.full_name !== undefined) {
    fullName = cleanString(body.full_name, 120);
    if (!fullName) throw ApiError.badRequest('الاسم لا يكون فارغاً');
  }

  let clanTown;
  if (body.clan_town !== undefined) {
    clanTown = cleanString(body.clan_town, 100);
    if (!clanTown) throw ApiError.badRequest('البلدة لا تكون فارغة');
  }

  let user = await auth.updateProfile(req.user.id, { fullName, clanTown });
  // The opt-out switch may ride along on the same request; the answer still
  // reports the profile change the user actually asked for.
  if (typeof body.analytics_opt_out === 'boolean') {
    user = await auth.setAnalyticsOptOut(req.user.id, body.analytics_opt_out);
  }

  res.json({ success: true, user, message: 'تم تحديث بيانات حسابك' });
}));

/**
 * The signed-in user's own profile photo (T-03). The multipart field is
 * `image`, exactly as every other image upload here — and multer plus
 * verifyMedia have already refused anything that is not a real image by the
 * time this handler runs.
 */
router.post('/auth/me/avatar', authenticate, avatarMedia, asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('اختر صورة شخصية أولاً');

  const user = await auth.updateAvatar(req.user.id, req.file);
  res.json({ success: true, user, message: 'تم تحديث صورتك الشخصية' });
}));

/**
 * Changing the sign-in number itself (T-03). Unlike the profile fields this
 * requires the current PIN: the number IS the login identifier, so a stolen
 * token alone must not decide where the account moves. The answer carries a
 * token signed with the new number, so the caller is not signed out by its
 * own change.
 */
router.patch('/auth/me/phone', authenticate, asyncHandler(async (req, res) => {
  requireFields(req.body, ['phone_number', 'pin_code']);

  const phone_number = normalisePhone(req.body.phone_number);
  if (!isValidPhone(phone_number)) {
    throw ApiError.badRequest('رقم الهاتف غير صالح');
  }

  const result = await auth.changePhoneNumber(
    req.user.id,
    phone_number,
    cleanString(req.body.pin_code, 20)
  );

  res.json({
    success: true,
    ...result,
    message: 'تم تحديث رقم هاتفك — استخدمه في الدخول القادم'
  });
}));

/**
 * Self-service account deletion (Google Play's account-deletion policy).
 * DELETE rather than POST so the destructive intent survives any intermediary,
 * and the body carries the one thing a stolen token cannot supply: the PIN.
 * No response shape beyond a fixed Arabic message — there is nothing left to
 * show, and the client signs out locally.
 */
router.delete('/account', authenticate, asyncHandler(async (req, res) => {
  const pin_code = cleanString(req.body && req.body.pin_code, 10);
  if (!pin_code) throw ApiError.badRequest('رمز الدخول مطلوب');

  await auth.deleteAccount(req.user.id, pin_code);
  res.json({ success: true, message: 'تم حذف حسابك وبياناتك الشخصية' });
}));

module.exports = router;
