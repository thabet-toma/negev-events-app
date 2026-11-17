'use strict';

/**
 * مواقيت الصلاة (M3) — مسار عام واحد: `GET /api/prayer-times`.
 *
 * **الحساب على خادمنا من إحداثيات البلدة، بلا طرف خارجي** (قرار المالك)، فالعقد
 * هنا عقدُ قراءة: المكان واليوم يدخلان، وستّ مداخل وقتٍ (الشروق ليس صلاة) وصلاةٌ
 * قادمة يخرجان. الحساب كله في `prayerTimes.service.js` (بلا SQL)، والإحداثيات في
 * `towns.service.placeCoordinates`، وهذا الملف يتحقق من المدخلات ويشكّل الردّ
 * فقط.
 *
 * `optionalAuthenticate` ليس مصادقة بل ما يجعل `regionForRequest` ترى محافظة
 * **حساب** القارئ حين لا يرسل ترويسة `X-Region` — نفس عقد `/api/news` حرفياً،
 * والمسار عام بلا رمز.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const towns = require('../services/towns.service');
const prayerTimes = require('../services/prayerTimes.service');
const { optionalAuthenticate } = require('../middleware/auth');
const { regionForRequest } = require('../middleware/region');
const { cleanString, isRealDate } = require('../middleware/validate');

const router = express.Router();

/**
 * `?date=YYYY-MM-DD` — أو اليوم في القدس حين يغيب.
 *
 * **ولا يُقصّ الطول قبل الفحص** (بخلاف `cleanString(value, 10)`): القصّ يجعل
 * `2026-06-21xyz` يمرّ منقوصاً إلى يومٍ لم يطلبه أحد — نفس سبب `requireMonth`
 * في `validate.js`. و`isRealDate` لا `isValidDate` وحدها: ٣٠ شباط بصيغةٍ صحيحة
 * يُدوّره `new Date` إلى ٢ آذار، فطلبُ مواقيت يومٍ لا وجود له يُرفض 400 ولا
 * يعود مواقيت يوم آخر بصمت.
 */
function resolveDate(value) {
  const raw = cleanString(value);
  if (raw === null) return prayerTimes.todayInJerusalem();
  if (!isRealDate(raw)) throw ApiError.badRequest('التاريخ غير صالح');
  return raw;
}

/**
 * مكان الطلب وإحداثياته:
 *
 * - `?town=` بلدة نشطة أو محافظة نشطة (`placeCoordinates`) — وإلا 400 عربي.
 * - بلا `?town=` محافظة الطلب نفسها (`regionForRequest`: ترويسة `X-Region`، أو
 *   محافظة الحساب، أو الافتراضية) ومركزها.
 *
 * تنصيبٌ بلا محافظة نشطة أصلاً لا مكان له: الرسالة نفسها، لا 500 ولا إحداثية
 * مخترعة.
 */
async function resolvePlace(req) {
  const name = cleanString(req.query.town, 100);
  if (name !== null) {
    const place = await towns.placeCoordinates(name);
    if (!place) throw ApiError.badRequest('البلدة غير معروفة');
    return place;
  }

  const { regionName } = await regionForRequest(req);
  const place = regionName === null ? null : await towns.placeCoordinates(regionName);
  if (!place) throw ApiError.badRequest('البلدة غير معروفة');
  return place;
}

router.get('/prayer-times', optionalAuthenticate, asyncHandler(async (req, res) => {
  const date = resolveDate(req.query.date);
  const place = await resolvePlace(req);
  const payload = prayerTimes.computePrayerTimes({
    latitude: place.latitude,
    longitude: place.longitude,
    date
  });

  res.json({
    success: true,
    place: { name: place.name, kind: place.kind },
    date: payload.date,
    timezone: prayerTimes.TIME_ZONE,
    method: prayerTimes.METHOD,
    times: payload.times,
    next: payload.next
  });
}));

module.exports = router;
