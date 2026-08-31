'use strict';

const express = require('express');
const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const { absoluteMediaUrl } = require('../utils/mediaUrl');

const router = express.Router();

/**
 * إعلان نسخة تطبيق الموبايل.
 *
 * التطبيق يستعلم عن هذا المسار عند الإقلاع ويقارن بنسخته المثبَّتة. المقارنة
 * تجري في العميل — الخادم يعلن الحقائق فقط ولا يعرف نسخة المتصل.
 *
 * `update_required` يعني: النسخ الأقدم من `min_version` لم تعد مدعومة (تغيّر
 * كاسر في الـAPI مثلاً)، فيمنعها التطبيق من المتابعة.
 */
router.get('/app/version', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    latest_version: config.app.latestVersion,
    min_version: config.app.minVersion,
    // يُقبل مسار نسبي (/downloads/app.apk) فيُحوَّل إلى مطلق كبقية الوسائط.
    apk_url: absoluteMediaUrl(config.app.apkUrl),
    release_notes: config.app.releaseNotes
  });
}));

module.exports = router;
