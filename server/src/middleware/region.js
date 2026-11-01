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
 */
async function regionIdForRequest(req) {
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

module.exports = { regionIdForRequest };
