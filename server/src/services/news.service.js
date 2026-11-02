'use strict';

/**
 * «آخر خبر» — أخبار المحافظة من منصة كترا الإخبارية (وجهة «خدماتنا» في الويب).
 *
 * كل منطق هذا الوجه هنا: النداء الخارجي، تطبيع كل عنصر، والكاش. لا `req`/`res`
 * ولا SQL — لا جدول أخبار عندنا، المصدر هو الطرف الآخر وحده.
 *
 * **الوصول إلى المصدر من بيئة وقت التشغيل لا من `config` وحدها، وعمداً:**
 * اختبارات الخادم تشغّل خادماً وهمياً على منفذ عشوائي لا يُعرف إلا بعد الإقلاع،
 * فقراءة `config` مرة واحدة كانت ستُجمّد العنوان الخطأ قبل أن يوجد الخادم.
 * `KATRA_NEWS_CACHE_TTL_MS=0` في الاختبار يطلب «كل طلب يذهب إلى المصدر» مع
 * بقاء النسخة القديمة للخدمة عند سقوطه.
 *
 * الفشل هادئ: بلا كاش يرمي `ApiError.badGateway` (502 برسالة عربية)، وبكاش
 * يُخدَم آخر ردّ ناجح حتى ساعة — تعطّلُ مصدر أخبار لا يجوز أن يُفرغ الشاشة
 * كلها. أي ردّ لا يشبه العقد (نصّ HTML، `ok: false`، عناصر بلا معرّف…) يُعامَل
 * كفشل، لا كقائمة فارغة.
 */

const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const {
  NEWS_AREA_BY_REGION_NAME,
  NEWS_AREA_GENERAL,
  NEWS_PAGE_DEFAULT,
  NEWS_PAGE_MAX
} = require('../constants');

/** رسالة المسارين الوحيدة عند فشل المصدر بلا كاش — عربية، ولا تفاصيل داخلية. */
const NEWS_UNAVAILABLE_MESSAGE = 'تعذّر جلب الأخبار من منصة كترا الآن';

/**
 * كم يبقى الردّ الناجح صالحاً **بعد** انتهاء صلاحيته العادية: آخر نسخة تُخدَم
 * عند تعطّل المصدر حتى ساعة، فلا يومان من أخبار بائتة.
 */
const STALE_MAX_AGE_MS = 60 * 60 * 1000;

/** سقف عدد الصفحات المحفوظة — مفاتيحها `area|limit|offset` ومنها ما لا يعود يُطلب. */
const CACHE_MAX_ENTRIES = 120;

/** `Map` بمفتاح `area|limit|offset` وقيمة `{ items, hasMore, fetchedAt }`. */
const cache = new Map();

/** عنوان المصدر بلا شرطة أخيرة — من البيئة عند كل استدعاء (انظر تعليق الملف). */
function baseUrl() {
  const raw = process.env.KATRA_NEWS_BASE_URL || config.katraNewsBaseUrl || '';
  return String(raw).trim().replace(/\/+$/, '');
}

/** إعداد كاش بالملي ثانية؛ `0` = كل طلب يمرّ إلى المصدر، مع الاحتفاظ للنسخة القديمة. */
function cacheTtlMs() {
  const raw = process.env.KATRA_NEWS_CACHE_TTL_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : config.katraNewsCacheTtlMs;
}

/** مهلة النداء الخارجي — قيمة صالحة دائماً، فلا معلّق بلا نهاية. */
function timeoutMs() {
  const raw = Number.parseInt(process.env.KATRA_NEWS_TIMEOUT_MS, 10);
  return Number.isInteger(raw) && raw > 0 ? raw : config.katraNewsTimeoutMs;
}

/**
 * مفتاح المنطقة من اسم المحافظة: اسم المحافظة نفسه هو المفتاح المخزَّن في
 * كل جدول لدينا (ADR-0007)، فالخريطة اسمية. اسم غير معروف — محافظة جديدة لم
 * تُضف بعد — يسقط إلى الوجه العام.
 */
function areaForRegionName(regionName) {
  if (!regionName) return NEWS_AREA_GENERAL;
  return NEWS_AREA_BY_REGION_NAME[String(regionName).trim()] || NEWS_AREA_GENERAL;
}

/** نصّ منظَّف أو `null` — القيم التي لا نعرف شكلها لا تعبر كما هي. */
function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** رابط مطلق http(s) أو `null` — لا `javascript:` ولا مسار نسبي يصل زرّاً في الصفحة. */
function cleanHttpUrl(value) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** `published_at` بصيغة ISO 8601، أو `null` إن كانت غير قابلة للقراءة تاريخاً. */
function cleanIsoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * قسم الخبر كائناً `{ id, name }` أو `null`. المصدر قد يرسله كائناً أو نصاً
 * مفرداً؛ الاسم وحده يكفي للعرض، والمعرّف يبقى `null` إن غاب.
 */
function cleanCategory(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const name = cleanText(String(value));
    return name ? { id: null, name } : null;
  }
  if (typeof value !== 'object') return null;
  const name = cleanText(value.name);
  if (!name) return null;
  const id = Number.parseInt(value.id, 10);
  return { id: Number.isInteger(id) && id > 0 ? id : null, name };
}

/**
 * عنصر واحد بالعقد العام — أو `null` لما لا يصلح خبراً (بلا معرّف أو بلا
 * عنوان). يُسقَط صامتاً بدل أن يُسقط القائمة كلها: خبر واحد مشوّه عند الطرف
 * الآخر لا يجوز أن يمنع خمسين سليماً من الظهور.
 */
function normaliseItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number.parseInt(raw.id, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  const title = cleanText(raw.title);
  if (!title) return null;

  return {
    id,
    title,
    excerpt: cleanText(raw.excerpt),
    image: cleanHttpUrl(raw.image),
    url: cleanHttpUrl(raw.url),
    published_at: cleanIsoDate(raw.published_at),
    // المصدر قد يرسلها منطقية أو 0/1؛ أي شكل آخر «ليست عاجلة».
    is_breaking: raw.is_breaking === true || raw.is_breaking === 1 || raw.is_breaking === '1',
    category: cleanCategory(raw.category)
  };
}

/** تفصيل الخبر: الحقول العامة + الكاتب والنصّ الكامل. */
function normaliseItemDetail(raw) {
  const item = normaliseItem(raw);
  if (!item) return null;
  return {
    ...item,
    author_name: cleanText(raw.author_name),
    body_text: cleanText(raw.body_text)
  };
}

/** عنوان النداء الخارجي — `areas` دائماً، و`area` للمنطقة المحدَّدة وحدها. */
function sourceUrl({ area, limit, offset, id }) {
  const url = new URL(`${baseUrl()}/api/news.php`);
  if (id !== undefined) {
    url.searchParams.set('id', String(id));
    return url;
  }
  url.searchParams.set('areas', area);
  if (area !== NEWS_AREA_GENERAL) url.searchParams.set('area', area);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  return url;
}

/**
 * نداء واحد إلى منصة كترا. يعيد جسم الردّ بعد التأكد أنه `{ ok: true }`؛
 * كل خروج عن ذلك — شبكة، مهلة، 5xx، HTML — يرمي، والقرار (كاش قديم أو 502)
 * لمن يستدعيه.
 */
async function fetchSource(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs())
  });
  if (!res.ok) throw new Error(`news source responded ${res.status}`);

  let payload;
  try {
    payload = await res.json();
  } catch {
    // صفحة HTML أو جسم فارغ: الطرف الآخر لم ينشر الواجهة المتوقّعة بعد.
    throw new Error('news source returned a non-JSON body');
  }
  if (!payload || typeof payload !== 'object' || payload.ok !== true) {
    throw new Error('news source returned an unexpected body');
  }
  return payload;
}

/** يسجّل سبب السقوط بلا كشف رابط أو محتوى — للمشغّل وحده. */
function logSourceFailure(reason, details = {}) {
  logger.warn('news.source_failed', { reason, ...details });
}

/** يضيف صفحة إلى الكاش ويقصّ ما زاد، الأقدم أولاً. */
function rememberPage(key, page) {
  cache.set(key, page);
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) cache.delete(oldestKey);
}

/**
 * قائمة أخبار المحافظة — الشكل المنشور في `GET /api/news` بلا `success`
 * ولا حقول المحافظة (تضيفها طبقة المسار، فهي تعرف من صاحب الطلب).
 *
 * @param {object} params
 * @param {string|null} params.regionName اسم محافظة الزائر كما في `towns.service`
 * @param {number} params.limit  سقف صلب `NEWS_PAGE_MAX`
 * @param {number} params.offset
 * @param {boolean} params.general `true` يجبر الوجه العام مهما كانت المحافظة
 * @returns {Promise<{ area: string, general: boolean, items: object[], has_more: boolean }>}
 */
async function listNews({ regionName = null, limit = NEWS_PAGE_DEFAULT, offset = 0, general = false } = {}) {
  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || NEWS_PAGE_DEFAULT, 1),
    NEWS_PAGE_MAX
  );
  const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
  const area = general ? NEWS_AREA_GENERAL : areaForRegionName(regionName);

  const key = `${area}|${safeLimit}|${safeOffset}`;
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < cacheTtlMs()) {
    return {
      area,
      general: area === NEWS_AREA_GENERAL,
      items: cached.items,
      has_more: cached.hasMore
    };
  }

  try {
    const payload = await fetchSource(sourceUrl({ area, limit: safeLimit, offset: safeOffset }));
    const rows = Array.isArray(payload.items) ? payload.items : [];
    const items = rows.map(normaliseItem).filter(Boolean);
    const page = { items, hasMore: payload.has_more === true, fetchedAt: now };
    rememberPage(key, page);

    return { area, general: area === NEWS_AREA_GENERAL, items, has_more: page.hasMore };
  } catch (err) {
    logSourceFailure(err.message, { area, limit: safeLimit, offset: safeOffset });

    // نسخة قديمة (أو جديدة انتهت صلاحيتها) هي ما يُخدَم عند السقوط — حتى ساعة.
    if (cached && now - cached.fetchedAt <= STALE_MAX_AGE_MS) {
      return {
        area,
        general: area === NEWS_AREA_GENERAL,
        items: cached.items,
        has_more: cached.hasMore
      };
    }
    throw ApiError.badGateway(NEWS_UNAVAILABLE_MESSAGE);
  }
}

/**
 * خبر واحد بمعرّفه — نفس حقول القائمة زائد `author_name` و`body_text`.
 * غير موجود / غير منشور عند المصدر ← `null`، ومسار الويب يترجمه إلى 404 عربي.
 * فشل المصدر هنا 502 دائماً: لا كاش للتفصيل (مفتاح الكاش للقوائم وحدها).
 */
async function newsItem(id) {
  const numericId = Number.parseInt(id, 10);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;

  try {
    const payload = await fetchSource(sourceUrl({ id: numericId }));
    return normaliseItemDetail(payload.item);
  } catch (err) {
    logSourceFailure(err.message, { id: numericId });
    throw ApiError.badGateway(NEWS_UNAVAILABLE_MESSAGE);
  }
}

/** تفريغ الكاش — تحتاجه الاختبارات وحدها، لا مسار عمومي. */
function clearCache() {
  cache.clear();
}

module.exports = {
  listNews,
  newsItem,
  clearCache
};
