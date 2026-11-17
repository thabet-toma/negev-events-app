'use strict';

const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { parseId } = require('./validate');
const townsService = require('../services/towns.service');
const auth = require('../services/auth.service');

/**
 * محافظة الطلب في مسارات الاكتشاف (تذكرة #121) — مكانها طبقة المسار وحدها:
 * الخدمات لا ترى `req`/`res`، ولا تعرف من أين جاء المعرّف، وهي تُستدعى بلا
 * محافظة من كل مسار داخلي فتظل بلا تقييد.
 *
 * الترتيب:
 * 1. ترويسة `X-Region`: تُحلَّل بـ`parseId` (خطأها العربي 400 يُمرَّر كما هو)،
 *    ثم تُطابَق بصفّ محافظة. معرّف لا وجود له ← 400 عربي: طلب محافظةً مجهولة
 *    خطأٌ يستحق أن يُقال، لا أن يُبتلع إلى الافتراضية. أما محافظة **موقوفة**
 *    فتُعامل كأنها لم تُطلب: الافتراضية وسطرٌ في السجل — إيقاف محافظة لا يجوز
 *    أن يُسقط تغذية عميل لا يعرف أنه يجب أن يعيد الاختيار.
 * 2. بلا ترويسة وقارئ مسجَّل (`optionalAuthenticate`): محافظة حسابه، وإن كانت
 *    `NULL` («لم أختر بعد») فالافتراضية. **والموقوفة هنا كالموقوفة في الترويسة
 *    تماماً** (الافتراضية + سطر في السجل): حساب اختار محافظة وهي نشطة ثم
 *    أُوقفت لا يجوز أن يظل يرى صفوفها، والقاعدة في عقد العميل كله لا في مسار
 *    الترويسة وحده. والسطر يحمل `source` كي يُقرأ: `'header'` أو `'account'`.
 * 3. غير ذلك: `defaultRegionId()` — أول محافظة نشطة، أي النقب اليوم، وهو ما
 *    تراه النسخة المنشورة التي لا ترسل الترويسة أصلاً.
 *
 * تعيد معرّف محافظة صالحاً دائماً (أو `null` إن لم توجد محافظة نشطة أصلاً،
 * كما تفعل `defaultRegionId` نفسها — وهي حالة تنصيب بلا بذرة).
 *
 * **و«كل المحافظات» استثناء مفهومي لا محافظة أخرى (تذكرة #161):** طلب يحمل
 * العلَم `allRegions` (`all_regions=1` في الاستعلام) ليس طلب محافظة أصلاً، فلا
 * ينطبق عليه شيء من الترتيب أعلاه: تعود `null` فوراً قبل قراءة الترويسة وقبل
 * قراءة الحساب، فتُقرأ صفوف كل المحافظات بلا تقييد. وترويسة `X-Region` المصاحبة
 * له تُهمَل عمداً ولا تُتحقَّق — لا معنى لـ400 على محافظة مجهولة في طلب لا يطلب
 * محافظة، ولا لردٍّ يعود إلى الافتراضية وهو طلب صريح لكل الصفوف. أما الافتراضي
 * بلا العلَم فلم يتغيّر حرفاً.
 */
async function regionIdForRequest(req, { allRegions = false } = {}) {
  if (allRegions) return null;

  const header = req.get('X-Region');
  // ترويسة فارغة ليست إعلاناً بمحافظة: الأشكال الثلاثة للفراغ (`undefined`،
  // `null`، نص أبيض) تعني «لم تُرسَل» في `optionalId` أيضاً، فلا تُحوَّل إلى 400.
  if (header !== undefined && String(header).trim() !== '') {
    const requestedId = parseId(header, 'المنطقة');
    const region = await townsService.findRegionById(requestedId);
    if (!region) {
      throw ApiError.badRequest('المنطقة المطلوبة غير معروفة');
    }
    return activeRegionOrFallback(region, 'header');
  }

  if (req.user) {
    const accountRegionId = await auth.findRegionIdById(req.user.id);
    if (accountRegionId !== null) {
      const region = await townsService.findRegionById(accountRegionId);
      // `null` هنا معناه معرّف معلّق، وهو ما يمنعه المفتاح الأجنبي
      // (`ON DELETE SET NULL`)؛ يُعامَل احتياطاً كـ«لم أختر» فيقع على الافتراضية.
      if (region) return activeRegionOrFallback(region, 'account');
    }
  }

  return townsService.defaultRegionId();
}

/**
 * المحافظة النشطة كما هي، وإلا الافتراضية مع سطر في السجل. الموضع الوحيد الذي
 * يُترجَم فيه «موقوفة» — فلا يبقى فرع (ترويسة أو حساب) بلا الفحص نفسه.
 */
async function activeRegionOrFallback(region, source) {
  if (region.is_active) return region.id;
  logger.warn('region.inactive', { regionId: region.id, source });
  return townsService.defaultRegionId();
}

/**
 * المحافظة اسماً ورقماً معاً — القاعدة المشتركة لكل وجه يعرض اسم محافظة
 * الطلب أو يمرّره إلى مصدر يعرف المحافظات **بالاسم** لا بالمعرّف.
 *
 * مكانها هنا لا في راوتر واحد: `GET /api/news` يعرضها في هيدر شاشته، و
 * `GET /api/stats/ticker` يشتقّ منها أخبار الشريط، والاثنان يجب أن يحلّا
 * المحافظة نفسها للطلب نفسه (ترويسة `X-Region`، أو محافظة الحساب، أو
 * الافتراضية) — فنسخةٌ ثانية في أي مسار كانت ستفرق عنهما عند أول تغيير.
 * `regionName: null` حين لا محافظة نشطة أصلاً (تنصيب بلا بذرة).
 */
async function regionForRequest(req) {
  const regionId = await regionIdForRequest(req);
  const region = regionId === null ? null : await townsService.findRegionById(regionId);
  return { regionId, regionName: region ? region.name : null };
}

module.exports = { regionIdForRequest, regionForRequest };
