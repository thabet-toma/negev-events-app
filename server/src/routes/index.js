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
const broadcastsRoutes = require('./broadcasts.routes');
const statsRoutes = require('./stats.routes');
const storiesRoutes = require('./stories.routes');
const villagesRoutes = require('./villages.routes');
const townsRoutes = require('./towns.routes');
const servicesRoutes = require('./services.routes');
const analyticsRoutes = require('./analytics.routes');
const privacyRoutes = require('./privacy.routes');
const settingsRoutes = require('./settings.routes');
const liveRoutes = require('./live.routes');
const albumsRoutes = require('./albums.routes');
const archivePhotosRoutes = require('./archivePhotos.routes');
const peopleRoutes = require('./people.routes');
const newsRoutes = require('./news.routes');
const prayerRoutes = require('./prayer.routes');
const cardsRoutes = require('./cards.routes');

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
router.use(broadcastsRoutes);
router.use(statsRoutes);
router.use(storiesRoutes);
router.use(villagesRoutes);
router.use(townsRoutes);
router.use(servicesRoutes);
router.use(analyticsRoutes);
router.use(privacyRoutes);
router.use(settingsRoutes);
router.use(liveRoutes);
router.use(albumsRoutes);
router.use(archivePhotosRoutes);
router.use(peopleRoutes);
router.use(newsRoutes);
// مواقيت الصلاة (M3): `GET /prayer-times` عام، وتُحسب من إحداثيات بلدة أو
// محافظة الطلب — بلا طرف خارجي ولا SQL خارج `towns.service.js`.
router.use(prayerRoutes);
// ستوديو بطاقة الدعوة (#180): `GET /card-templates` عام، والبقية
// `GET/POST/PATCH/DELETE /events/:id/cards…` بعد `authenticate` وحراسة الملكية
// داخل الراوتر نفسه. يُركَّب بعد `eventRoutes` ولا يتعارض معه: مساراته كلها
// أعمق من `/events/:id` بجزء واحد على الأقل.
router.use(cardsRoutes);

module.exports = router;
