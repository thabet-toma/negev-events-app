'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');

const eventRoutes = require('./events.routes');
const authRoutes = require('./auth.routes');
const nokootRoutes = require('./nokoot.routes');
const adminRoutes = require('./admin.routes');
const aiRoutes = require('./ai.routes');
const appRoutes = require('./app.routes');
const occasionTypesRoutes = require('./occasionTypes.routes');
const notificationsRoutes = require('./notifications.routes');
const storiesRoutes = require('./stories.routes');
const villagesRoutes = require('./villages.routes');
const servicesRoutes = require('./services.routes');
const analyticsRoutes = require('./analytics.routes');

const router = express.Router();

// Credential endpoints get a much tighter budget than the rest of the API.
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات كثيرة جداً — يرجى المحاولة بعد قليل' }
});

// POST /api/analytics/events needs no login and does nothing costly per
// request, which is exactly what makes it the cheapest route in the API to
// spam — its own tighter budget, separate from both the global limiter and
// authLimiter above.
const analyticsLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.analyticsMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات كثيرة جداً — يرجى المحاولة بعد قليل' }
});

router.use(['/auth/login', '/auth/register', '/admin/login'], authLimiter);
router.use(['/analytics/events'], analyticsLimiter);

router.use(eventRoutes);
router.use(authRoutes);
router.use(nokootRoutes);
router.use(adminRoutes);
router.use(aiRoutes);
router.use(appRoutes);
router.use(occasionTypesRoutes);
router.use(notificationsRoutes);
router.use(storiesRoutes);
router.use(villagesRoutes);
router.use(servicesRoutes);
router.use(analyticsRoutes);

module.exports = router;
