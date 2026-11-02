'use strict';

/**
 * «آخر خبر» — قارئ أخبار المحافظة من منصة كترا الإخبارية (تذكرة وجهة «خدماتنا»).
 *
 * مساران عامّان بلا مصادقة: القائمة والتفصيل. `optionalAuthenticate` ليس
 * مصادقة بل ما يجعل `regionIdForRequest` ترى محافظة **حساب** القارئ حين لا
 * ترويسة `X-Region` — نفس عقد `/api/services/providers` حرفياً. لا رمز يُرفق
 * من الويب أصلاً (`apiFetch` بلا `auth`).
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const news = require('../services/news.service');
const townsService = require('../services/towns.service');
const { optionalAuthenticate } = require('../middleware/auth');
const { regionIdForRequest } = require('../middleware/region');
const { cleanString, parseId, parseLimit, parseFlag } = require('../middleware/validate');
const { NEWS_PAGE_DEFAULT, NEWS_PAGE_MAX } = require('../constants');

const router = express.Router();

/**
 * الإزاحة تقبل الصفر — وهي أوّل صفحة، والقيمة التي ترسلها الواجهة صراحةً.
 * `parseId` يرفض الأصفار لأنها معرّفات لا إزاحات، فيُترجَم الصفر هنا إلى
 * «بلا إزاحة»، وكل قيمة أخرى تمرّ عبر `parseId` نفسها برسالتها العربية
 * (سالب أو نصّ ← 400). لا فحص رقمي ثانٍ هنا.
 */
function parseOffset(value) {
  const raw = cleanString(value, 12);
  if (raw === null || raw === '0') return 0;
  return parseId(raw, 'الإزاحة');
}

/** محافظة الطلب اسماً — تُبنى بها خريطة منطقة المصدر وتُعرض في هيدر الشاشة. */
async function regionForRequest(req) {
  const regionId = await regionIdForRequest(req);
  const region = regionId === null ? null : await townsService.findRegionById(regionId);
  return { regionId, regionName: region ? region.name : null };
}

router.get('/news', optionalAuthenticate, asyncHandler(async (req, res) => {
  const { regionId, regionName } = await regionForRequest(req);
  const payload = await news.listNews({
    regionName,
    limit: parseLimit(req.query.limit, NEWS_PAGE_DEFAULT, NEWS_PAGE_MAX),
    offset: parseOffset(req.query.offset),
    general: parseFlag(req.query.general)
  });

  res.json({
    success: true,
    region_id: regionId,
    region_name: regionName,
    area: payload.area,
    general: payload.general,
    items: payload.items,
    has_more: payload.has_more
  });
}));

router.get('/news/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف الخبر');
  const item = await news.newsItem(id);
  // خبر مخفيّ أو محذوف عند المصدر يصل هنا `null` — لا نُفصح عن أكثر من ذلك.
  if (!item) throw ApiError.notFound('الخبر غير موجود');
  res.json({ success: true, item });
}));

module.exports = router;
