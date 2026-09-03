'use strict';

/**
 * `POST /api/analytics/events` — the single client-facing analytics
 * endpoint (issue #44). It must work both signed-in and anonymous
 * (`optionalAuthenticate`, never `authenticate`), because most of what it
 * records — a share tap, a failed upload — happens before or without a
 * login.
 *
 * user_id comes from the verified token ONLY, never from the request body:
 * a caller sending someone else's id in the body must never be able to
 * attribute an event to them. All SQL and the closed-list/count-only
 * enforcement live in analytics.service.js — this file only validates and
 * shapes the request.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const analytics = require('../services/analytics.service');
const { optionalAuthenticate, requireSuperAdmin } = require('../middleware/auth');
const { cleanString } = require('../middleware/validate');
const { TOWNS } = require('../constants');

const router = express.Router();

router.post('/analytics/events', optionalAuthenticate, asyncHandler(async (req, res) => {
  const body = req.body || {};

  const eventName = cleanString(body.event_name, 60);
  if (!eventName) throw ApiError.badRequest('اسم الحدث مطلوب');

  const platform = cleanString(body.platform, 20);
  if (!platform) throw ApiError.badRequest('المنصة مطلوبة');

  const contentTown = cleanString(body.content_town, 100);
  if (contentTown && !TOWNS.includes(contentTown)) {
    throw ApiError.badRequest('بلدة المحتوى غير معروفة');
  }

  // record() itself re-validates event_name against the closed list and
  // strips identity for a count-only name — this route does not duplicate
  // that logic, it only ever forwards what the token proves.
  await analytics.record({
    eventName,
    userId: req.user ? req.user.id : null,
    deviceId: cleanString(body.device_id, 100),
    platform,
    appVersion: cleanString(body.app_version, 20),
    contentTown
  });

  res.status(201).json({ success: true });
}));

/**
 * Super-admin-only reading of the analytics service's unwired
 * countsByEventName() (issue #44, privacy layer part 5). Guarded on this
 * router itself — a weaker guard elsewhere on the `/admin` prefix
 * (admin.routes.js's requireAdmin) does not protect this path just because
 * it shares the prefix, same reasoning as villages.routes.js and
 * occasionTypes.routes.js. This project's settled reasoning: anything that
 * cannot be meaningfully scoped to a single town — like an app-wide event
 * count — rises to the super admin, never a town admin. A reading
 * dashboard/UI is explicitly out of scope; this is the one JSON endpoint.
 */
router.use('/admin/analytics', requireSuperAdmin);

router.get('/admin/analytics/counts', asyncHandler(async (req, res) => {
  res.json({ success: true, counts: await analytics.countsByEventName() });
}));

module.exports = router;
