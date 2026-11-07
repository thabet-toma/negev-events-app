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

const router = express.Router();

/**
 * `{ success, regions: [{ region_id, name, upcoming_count }], total, updated_at }`.
 *
 * **العقد مُهيَّأ للتمديد:** تذكرة الأسعار تُلحق حقل `prices` بالجسم نفسه في
 * هذه القراءة (`GET /api/stats/ticker`)، ولا يتغيّر أي حقل قائم معه — ولا
 * عميل اليوم يعرف `prices` فيتجاهله بأمان. أي تعديل هنا يجب أن يبقى إضافةً
 * بهذا المعنى: لا إعادة تسمية لـ`regions` ولا لـ`total` ولا لـ`updated_at`،
 * ولا تحويل العدد إلى نصّ.
 */
router.get('/stats/ticker', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await stats.ticker()) });
}));

module.exports = router;
