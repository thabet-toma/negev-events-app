'use strict';

/**
 * شريط الإحصائيات في الرئيسية (تذكرة #172).
 *
 * مسار عام واحد بلا مصادقة: الشريط أول ما يراه زائر لم يسجّل دخوله، فربطه
 * بحساب كان سيُخفيه عمّن يهمّه. والحساب كلّه في `stats.service.js` — لا SQL
 * هنا (CLAUDE.md: المسار يتحقق، الخدمة تستعلم).
 *
 * لا `optionalAuthenticate` هنا: لا شيء في هذا الرقم يخصّ صاحبه — لا محافظة
 * الحساب ولا غيرها، فالمحافظات كلها معروضة لكل قارئ.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const stats = require('../services/stats.service');
const prices = require('../services/prices.service');

const router = express.Router();

/**
 * `{ success, regions: [{ region_id, name, upcoming_count }], total, updated_at, prices }`.
 *
 * **العقد مُهيَّأ للتمديد:** تذكرة الأسعار (#189) تُلحق حقل `prices` بالجسم نفسه
 * في هذه القراءة، ولا يتغيّر أي حقل قائم معه — ولا عميل اليوم يعرف `prices`
 * فيتجاهله بأمان. أي تعديل هنا يجب أن يبقى إضافةً بهذا المعنى: لا إعادة تسمية
 * لـ`regions` ولا لـ`total` ولا لـ`updated_at`، ولا تحويل العدد إلى نصّ.
 *
 * **والأسعار لا تُسقط الشريط:** تعطّل مصدرها الخارجي — أو غياب نسخة محفوظة
 * عنده — يُخرج `prices: null` مع بقاء الشريط كما هو، لأن عدّ المناسبات لا
 * علاقة له بسعر الذهب. والنداءان بالتوازي فلا يُضيف المصدر البطيء ثانيةً إلى
 * قراءة القاعدة.
 */
router.get('/stats/ticker', asyncHandler(async (req, res) => {
  const [ticker, priceSnapshot] = await Promise.all([
    stats.ticker(),
    prices.getPrices().catch(() => null)
  ]);
  res.json({ success: true, ...ticker, prices: priceSnapshot });
}));

module.exports = router;
