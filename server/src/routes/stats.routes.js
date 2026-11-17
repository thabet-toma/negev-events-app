'use strict';

/**
 * شريط الإحصائيات في الرئيسية (تذكرة #172).
 *
 * مسار عام واحد بلا مصادقة إلزامية: الشريط أول ما يراه زائر لم يسجّل دخوله،
 * فربطه بحساب كان سيُخفيه عمّن يهمّه. والحساب كلّه في `stats.service.js` — لا
 * SQL هنا (CLAUDE.md: المسار يتحقق، الخدمة تستعلم).
 *
 * `optionalAuthenticate` في الأعلى لا يحجب زائراً: الأعداد (`regions`،
 * `total`) لا تخصّ صاحبها، لكن `latest_news` إقليمية كما `GET /api/news` —
 * فبلا هذا الوسيط كان المسجَّل بلا ترويسة `X-Region` يرى أخبار المحافظة
 * الافتراضية في الشريط وأخبار محافظة حسابه في الشاشة نفسها. والمجهول يبقى
 * مجهولاً: لا رمز لم يُرسَل فلا شيء يتغيّر.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const stats = require('../services/stats.service');
const prices = require('../services/prices.service');
const news = require('../services/news.service');
const { optionalAuthenticate } = require('../middleware/auth');
const { regionForRequest } = require('../middleware/region');

const router = express.Router();

/**
 * أحدث خبر في محافظة هذا الطلب — بالحلّ نفسه الذي يستعمله `GET /api/news`
 * (`regionForRequest` المشتركة: ترويسة `X-Region`، أو محافظة الحساب، أو
 * الافتراضية)، ثم `listNews` بعنصر واحد فقط.
 *
 * **ولا يُسقط الفشل الشريط:** مصدر الأخبار طرفٌ خارجي، فتعطّله أو خلوّ وجهه من
 * عنصر — أو محافظة لا تُحلّ أصلاً — يعيد `null` وحده، كما يفعل `prices` فوقه.
 * ويُعاد الحقلان بالشكل الذي يعيده `GET /api/news` نفسه: `id` و`title` كما
 * هما، و`published_at` تاريخ ISO أو `null`.
 */
async function latestNewsForRequest(req) {
  try {
    const { regionName } = await regionForRequest(req);
    const { items } = await news.listNews({ regionName, limit: 1 });
    const item = items[0];
    if (!item) return null;
    return { id: item.id, title: item.title, published_at: item.published_at };
  } catch {
    return null;
  }
}

/**
 * `{ success, regions: [{ region_id, name, upcoming_count }], total, updated_at,
 * prices, latest_news }`.
 *
 * **العقد مُهيَّأ للتمديد:** تذكرة الأسعار (#189) ألحقت حقل `prices` بالجسم
 * نفسه، وتذكرة الرئيسية الجديدة ألحقت `latest_news` — ولا يتغيّر أي حقل قائم
 * معهما، ولا عميل اليوم يعرف `latest_news` فيتجاهله بأمان. أي تعديل هنا يجب أن
 * يبقى إضافةً بهذا المعنى: لا إعادة تسمية لـ`regions` ولا لـ`total` ولا
 * لـ`updated_at`، ولا تحويل العدد إلى نصّ.
 *
 * **ولا الأسعار ولا الأخبار تُسقط الشريط:** تعطّل مصدرهما الخارجي — أو غياب
 * نسخة محفوظة عند الأسعار — يُخرج الحقل وحده `null` مع بقاء الشريط كما هو، لأن
 * عدّ المناسبات لا علاقة له بسعر الذهب ولا بعنوان خبر. والنداءات الثلاثة
 * بالتوازي فلا يُضيف المصدر البطيء ثانيةً إلى قراءة القاعدة.
 */
router.get('/stats/ticker', optionalAuthenticate, asyncHandler(async (req, res) => {
  const [ticker, priceSnapshot, latestNews] = await Promise.all([
    stats.ticker(),
    prices.getPrices().catch(() => null),
    latestNewsForRequest(req)
  ]);
  res.json({ success: true, ...ticker, prices: priceSnapshot, latest_news: latestNews });
}));

module.exports = router;
