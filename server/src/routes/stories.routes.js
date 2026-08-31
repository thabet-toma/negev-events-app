'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const stories = require('../services/stories.service');
const { authenticate, optionalAuthenticate, requireAdmin } = require('../middleware/auth');
const { cleanString, parseId, optionalDateTime } = require('../middleware/validate');

const router = express.Router();

// Public and anonymous, and each call writes a row — same reasoning as
// congratulateLimiter, keyed by IP (via express-rate-limit's default
// keyGenerator) since there is no login to key on for an anonymous viewer.
const storyWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'عدد الطلبات تجاوز الحد المسموح — يرجى المحاولة لاحقاً' }
});

// --- Public reads/writes --------------------------------------------

router.get('/stories', asyncHandler(async (req, res) => {
  res.json({ success: true, stories: await stories.listPublicStories() });
}));

/**
 * The 2-second "watched" threshold this endpoint exists to enforce is
 * measured by the viewer's device, not the server — so this call is the
 * client reporting "this slide was watched", and the once-per-person-per-day
 * rule is what keeps that self-report honest (#20 step 8, decision ٥).
 */
router.post('/stories/:id/view', optionalAuthenticate, storyWriteLimiter, asyncHandler(async (req, res) => {
  const storyId = parseId(req.params.id, 'معرّف القصة');
  const deviceId = cleanString(req.body.device_id, 100);
  const userId = req.user ? req.user.id : null;

  if (!userId && !deviceId) {
    throw ApiError.badRequest('معرّف الجهاز مطلوب لتسجيل مشاهدة بلا حساب');
  }

  await stories.recordView(storyId, { userId, deviceId });
  res.json({ success: true });
}));

router.post('/stories/:id/click', optionalAuthenticate, storyWriteLimiter, asyncHandler(async (req, res) => {
  const storyId = parseId(req.params.id, 'معرّف القصة');
  const deviceId = cleanString(req.body.device_id, 100);
  const userId = req.user ? req.user.id : null;

  await stories.recordClick(storyId, { userId, deviceId });
  res.json({ success: true });
}));

router.post('/stories/:id/report', authenticate, asyncHandler(async (req, res) => {
  const storyId = parseId(req.params.id, 'معرّف القصة');
  await stories.reportStory(storyId, req.user.id);
  res.json({ success: true, message: 'تم استلام بلاغك' });
}));

// --- Admin -----------------------------------------------------------

router.use('/admin/stories', requireAdmin);

/** `expiry_preset` (one of stories.EXPIRY_PRESETS) wins over a raw `expires_at` when both are sent. */
function resolveExpiry(body) {
  const preset = cleanString(body.expiry_preset, 20);
  if (preset) return stories.presetToExpiresAt(preset);
  if (body.expires_at !== undefined) return optionalDateTime(body.expires_at, 'تاريخ الانتهاء');
  return undefined;
}

function parseOptionalEventId(value) {
  if (value === undefined || value === null || value === '') return null;
  return parseId(value, 'معرّف المناسبة');
}

router.get('/admin/stories', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    stories: await stories.listAllStoriesForAdmin(),
    expiry_presets: stories.EXPIRY_PRESETS
  });
}));

router.post('/admin/stories', asyncHandler(async (req, res) => {
  const title = cleanString(req.body.title, 200);
  if (!title) throw ApiError.badRequest('عنوان القصة مطلوب');

  const isAd = Boolean(req.body.is_ad);
  const advertiserName = cleanString(req.body.advertiser_name, 150);
  if (isAd && !advertiserName) {
    throw ApiError.badRequest('اسم المعلن مطلوب لأي قصة إعلانية');
  }

  const story = await stories.createStory({
    title,
    clan: cleanString(req.body.clan, 150),
    town: cleanString(req.body.town, 100),
    image: cleanString(req.body.image, 2000),
    is_live: Boolean(req.body.is_live),
    event_id: parseOptionalEventId(req.body.event_id),
    expires_at: resolveExpiry(req.body),
    advertiser_name: advertiserName,
    is_ad: isAd,
    target_url: cleanString(req.body.target_url, 2000),
    slide_duration_seconds: req.body.slide_duration_seconds === undefined
      ? undefined
      : parseId(req.body.slide_duration_seconds, 'مدة الشريحة')
  });

  res.status(201).json({ success: true, story, message: 'تم إنشاء القصة بنجاح' });
}));

router.patch('/admin/stories/:id', asyncHandler(async (req, res) => {
  const storyId = parseId(req.params.id, 'معرّف القصة');
  const body = req.body || {};
  const payload = {};

  if (body.title !== undefined) {
    const title = cleanString(body.title, 200);
    if (!title) throw ApiError.badRequest('عنوان القصة مطلوب');
    payload.title = title;
  }
  if (body.clan !== undefined) payload.clan = cleanString(body.clan, 150);
  if (body.town !== undefined) payload.town = cleanString(body.town, 100);
  if (body.image !== undefined) payload.image = cleanString(body.image, 2000);
  if (body.is_live !== undefined) payload.is_live = Boolean(body.is_live);
  if (body.event_id !== undefined) payload.event_id = parseOptionalEventId(body.event_id);
  if (body.is_ad !== undefined) payload.is_ad = Boolean(body.is_ad);
  if (body.advertiser_name !== undefined) payload.advertiser_name = cleanString(body.advertiser_name, 150);
  if (body.target_url !== undefined) payload.target_url = cleanString(body.target_url, 2000);
  if (body.slide_duration_seconds !== undefined) {
    payload.slide_duration_seconds = parseId(body.slide_duration_seconds, 'مدة الشريحة');
  }
  if (body.expiry_preset !== undefined || body.expires_at !== undefined) {
    payload.expires_at = resolveExpiry(body);
  }

  const story = await stories.updateStory(storyId, payload);
  res.json({ success: true, story, message: 'تم تحديث القصة بنجاح' });
}));

router.delete('/admin/stories/:id', asyncHandler(async (req, res) => {
  await stories.deleteStory(parseId(req.params.id, 'معرّف القصة'));
  res.json({ success: true, message: 'تم حذف القصة بنجاح' });
}));

router.get('/admin/stories/:id/metrics', asyncHandler(async (req, res) => {
  const storyId = parseId(req.params.id, 'معرّف القصة');
  res.json({ success: true, metrics: await stories.getStoryMetrics(storyId) });
}));

module.exports = router;
