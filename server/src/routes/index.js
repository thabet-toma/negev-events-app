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

const router = express.Router();

// Credential endpoints get a much tighter budget than the rest of the API.
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات كثيرة جداً — يرجى المحاولة بعد قليل' }
});

router.use(['/auth/login', '/auth/register', '/admin/login'], authLimiter);

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

module.exports = router;
