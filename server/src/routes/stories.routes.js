'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const stories = require('../services/stories.service');
const storyStudio = require('../services/storyStudio.service');
const { authenticate, optionalAuthenticate, requireSuperAdmin } = require('../middleware/auth');
const { cleanString, parseId, optionalDateTime, parseHttpUrl } = require('../middleware/validate');
const { STORY_LINK_PLATFORMS } = require('../constants');

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
// super_admin only (spec rule: stories rise to the structural/super_admin
// tier, not town-scoped moderation) — guarded on this router too, so a
// weaker guard registered elsewhere (e.g. admin.routes.js's requireAdmin)
// can never end up protecting these paths instead.

router.use('/admin/stories', requireSuperAdmin);

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

/**
 * `target_url` reaches `href`, `window.open` and Flutter's `launchUrl`.
 * Every client already refuses non-http schemes except the mobile launcher
 * (which accepts any URI), so the scheme is enforced here — the one place
 * all three clients pass through. Empty clears the link; absent leaves it.
 */
function optionalTargetUrl(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return parseHttpUrl(value, 'رابط الوجهة');
}

/** A closed list, same as occasion tones and broadcast tones — never free text. */
function optionalLinkPlatform(value) {
  if (value === undefined) return undefined;
  const platform = cleanString(value, 20);
  if (!platform) return null;
  if (!STORY_LINK_PLATFORMS.includes(platform)) {
    throw ApiError.badRequest('منصة الرابط غير معروفة');
  }
  return platform;
}

/**
 * The studio's two-step handshake: preview draws the exact card the publish
 * call will upload, so the admin approves the picture they will see rather
 * than a text description of it. Both steps are super_admin only through the
 * router guard above, and both accept the same free-text fields.
 */
function studioPayload(body) {
  const url = cleanString(body.url, 2000);
  if (!url) throw ApiError.badRequest('رابط الفيديو مطلوب');
  return {
    url,
    title: cleanString(body.title, 200),
    subtitle: cleanString(body.subtitle, 150),
    cta_label: cleanString(body.cta_label, 40),
    clan: cleanString(body.clan, 150),
    town: cleanString(body.town, 100),
    is_ad: Boolean(body.is_ad),
    advertiser_name: cleanString(body.advertiser_name, 150),
    event_id: parseOptionalEventId(body.event_id),
    slide_duration_seconds: body.slide_duration_seconds === undefined
      ? undefined
      : parseId(body.slide_duration_seconds, 'مدة الشريحة')
  };
}

router.post('/admin/stories/studio/preview', asyncHandler(async (req, res) => {
  res.json({ success: true, ...await storyStudio.previewCampaign(studioPayload(req.body || {})) });
}));

router.post('/admin/stories/studio', asyncHandler(async (req, res) => {
  const input = studioPayload(req.body || {});
  if (input.is_ad && !input.advertiser_name) {
    throw ApiError.badRequest('اسم المعلن مطلوب لأي قصة إعلانية');
  }
  const { story, info } = await storyStudio.publishCampaign(req.user, input, {
    expiresAt: resolveExpiry(req.body || {})
  });
  res.status(201).json({ success: true, story, info, message: 'تم إنشاء قصة التسويق' });
}));

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
    target_url: optionalTargetUrl(req.body.target_url),
    link_platform: optionalLinkPlatform(req.body.link_platform),
    cta_label: cleanString(req.body.cta_label, 40),
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
  if (body.target_url !== undefined) payload.target_url = optionalTargetUrl(body.target_url);
  if (body.link_platform !== undefined) payload.link_platform = optionalLinkPlatform(body.link_platform);
  if (body.cta_label !== undefined) payload.cta_label = cleanString(body.cta_label, 40);
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
