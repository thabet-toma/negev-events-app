'use strict';

/**
 * «أسعار الذهب والعملات» — خدمة أسعار السوق لحاسبتَي وجهة «خدماتنا» (تذكرة #189).
 *
 * مصدران خارجيان وحدهما، بلا SQL ولا جدول ولا خطوة ترحيل: العملات من
 * Frankfurter (`v2/rates`) والذهب من gold-api (`XAU`). النداء والتطبيع والكاش
 * كلهم هنا، ولا `req`/`res` — على نمط `news.service.js` حرفياً.
 *
 * **الوصول إلى المصدرين من البيئة عند كل استدعاء، لا من `config` وحدها، وعمداً:**
 * نفس سبب `news.service.js` — اختبارات الخادم تشغّل خادماً وهمياً على منفذ
 * عشوائي لا يُعرف إلا بعد الإقلاع، فقراءة `config` مرة واحدة كانت ستُجمّد
 * العنوان الخطأ قبل أن يوجد الخادم. و`PRICES_CACHE_TTL_MS=0` في الاختبار يطلب
 * «كل طلب يذهب إلى المصدر» مع بقاء النسخة القديمة تُخدَم عند سقوطه.
 *
 * **الاتجاه:** Frankfurter يعطي عدد وحدات العملة الأجنبية لكل شيكل واحد
 * (`base=ILS`)، فالشيكل لكل وحدة = `1 / rate`. والذهب `price` دولاراً للأونصة
 * (٣١٫١٠٣٤٧٦٨ غراماً)، فغرام ٢٤ = `XAU × (1 / rates.USD) ÷ 31.1034768`،
 * و٢١ = ‎×0.875‎، و١٨ = ‎×0.75‎.
 *
 * **الكاش ساعة واحدة (`60 * 60 * 1000`):** السعران لا يتحرّكان كل ثانية، وكل
 * طلب يمرّ إلى طرفين خارجيين يجعل بطأهما عطلاً لنا. الطلب الثاني خلال الساعة لا
 * ينادي المصدر إطلاقاً. وفشل المصدر بعد نجاح يعيد آخر نسخة بـ`stale: true` —
 * ومعها `source_time` و`fx_date` من المصدر نفسه فيعرف العميل تاريخها. وفشل بلا
 * نسخة سابقة يرمي 503 برسالة عربية (لا 500 ولا رسالة إنجليزية): الخلل في وسيط
 * خارجي لا في طلب الزائر.
 */

const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');

const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** رسالة `/api/prices` الوحيدة عند فشل المصدرين بلا نسخة محفوظة — عربية بلا تفاصيل داخلية. */
const PRICES_UNAVAILABLE_MESSAGE = 'تعذّر جلب أسعار الذهب والعملات الآن';

/** صلاحية الكاش: ساعة، كما نصّت التذكرة — لا مؤقّت دوري، الطلب التالي يجدّد. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** مهلة الطرفين معاً — قيمة صالحة دائماً، فلا طلب معلّق بلا نهاية. */
const DEFAULT_TIMEOUT_MS = 5000;

/** أونصة الذهب التجارية بالغرام — تعريف ثابت لا قياس. */
const GRAMS_PER_TROY_OUNCE = 31.1034768;

/**
 * العملات الست في الردّ، بهذا الترتيب، وأسماء عربية ثابتة هنا: قائمة العرض
 * جزء من عقد الردّ لا بيانات وقت تشغيل (لا جدول عملات في القاعدة أصلاً).
 */
const CURRENCIES = [
  { code: 'USD', name_ar: 'دولار أمريكي' },
  { code: 'EUR', name_ar: 'يورو' },
  { code: 'GBP', name_ar: 'جنيه إسترليني' },
  { code: 'JOD', name_ar: 'دينار أردني' },
  { code: 'EGP', name_ar: 'جنيه مصري' },
  { code: 'TRY', name_ar: 'ليرة تركية' }
];

/** العيارات الثلاثة ومعامل كل واحد من سعر غرام ٢٤ — كما في التذكرة. */
const KARAT_FACTORS = [
  { key: 'k24', factor: 1 },
  { key: 'k21', factor: 0.875 },
  { key: 'k18', factor: 0.75 }
];

/** آخر نسخة ناجحة: `{ payload, fetchedAt }` — `null` قبل أول نجاح أو بعد تفريغ. */
let cache = null;

/** عنوان مصدر العملات من البيئة عند كل استدعاء (انظر تعليق الملف). */
function fxEndpoint() {
  const raw = process.env.PRICES_FX_URL || config.prices.fxUrl || '';
  return String(raw).trim();
}

/** عنوان مصدر الذهب من البيئة عند كل استدعاء. */
function goldEndpoint() {
  const raw = process.env.PRICES_GOLD_URL || config.prices.goldUrl || '';
  return String(raw).trim();
}

/** إعداد كاش بالملي ثانية؛ `0` = كل طلب يمرّ إلى المصدر، مع الاحتفاظ للنسخة القديمة. */
function cacheTtlMs() {
  const parsed = Number.parseInt(process.env.PRICES_CACHE_TTL_MS, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : config.prices.cacheTtlMs;
}

/** مهلة النداء الخارجي — قيمة صالحة دائماً. */
function timeoutMs() {
  const parsed = Number.parseInt(process.env.PRICES_TIMEOUT_MS, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : config.prices.timeoutMs;
}

/** عنوان مصدر العملات كاملاً: `base=ILS` وقائمة العملات الست — لا معامل يُقبل من العميل. */
function fxSourceUrl() {
  const url = new URL(fxEndpoint());
  url.searchParams.set('base', 'ILS');
  url.searchParams.set('quotes', CURRENCIES.map(currency => currency.code).join(','));
  return url;
}

/** رقم موجب محدود أو `null` — قيمة لا نعرف شكلها لا تعبر كصفر. */
function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** تقريب إلى عدد منازل عشرية بلا انزياح الفاصلة العائمة. */
function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** `YYYY-MM-DD` كما يرسله المصدر، أو `null` إن لم يكن تاريخاً مقروءاً. */
function cleanDay(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/** لحظة ISO 8601 UTC كما يرسلها المصدر، أو `null` إن لم تُقرأ تاريخاً. */
function cleanTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * تطبيع ردّ Frankfurter: `[{ date, base, quote, rate }, …]`. كل عملة مطلوبة لا
 * يعود لها سعر تعني عقداً ناقصاً — فشلٌ لا قائمة ناقصة، لأن الحاسبة التي
 * تعرض خمس عملات وتصمت عن السادسة تكذب على المستخدم.
 */
function normaliseCurrencyRates(payload) {
  if (!Array.isArray(payload) || !payload.length) {
    throw new Error('fx source returned an unexpected body');
  }

  const rates = new Map();
  let fxDate = null;
  for (const row of payload) {
    if (!row || typeof row !== 'object') continue;
    const quote = typeof row.quote === 'string' ? row.quote.trim().toUpperCase() : '';
    const rate = positiveNumber(row.rate);
    if (!quote || rate === null) continue;
    rates.set(quote, rate);
    if (!fxDate) fxDate = cleanDay(row.date);
  }

  const currencies = [];
  for (const currency of CURRENCIES) {
    const rate = rates.get(currency.code);
    if (rate === undefined) {
      throw new Error(`fx source did not quote ${currency.code}`);
    }
    currencies.push({
      code: currency.code,
      name_ar: currency.name_ar,
      ils_per_unit: roundTo(1 / rate, 4)
    });
  }

  const usdRate = rates.get('USD');
  if (!fxDate || usdRate === undefined) {
    throw new Error('fx source returned an unexpected body');
  }
  return { currencies, fxDate, ilsPerUsd: 1 / usdRate };
}

/**
 * تطبيع ردّ gold-api: `{ price, updatedAt, … }` — `price` دولاراً للأونصة.
 * العيارات الثلاثة تُشتقّ من سعر ٢٤ **غير المقرَّب** ثم تُقرَّب مرّة واحدة،
 * فلا تقريبٌ مرّتين يتراكم في الفرق بين العيارات.
 */
function normaliseGoldPrice(payload, ilsPerUsd) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('gold source returned an unexpected body');
  }
  const ouncesUsd = positiveNumber(payload.price);
  if (ouncesUsd === null) {
    throw new Error('gold source returned an unexpected body');
  }

  const gram24 = (ouncesUsd * ilsPerUsd) / GRAMS_PER_TROY_OUNCE;
  const gold = { currency: 'ILS' };
  for (const karat of KARAT_FACTORS) {
    gold[karat.key] = roundTo(gram24 * karat.factor, 2);
  }
  // تاريخ المصدر نفسه (لا لحظة جلبنا له) — العميل يعرضه ليحكم على قدمه.
  gold.source_time = cleanTimestamp(payload.updatedAt);
  return gold;
}

/**
 * محلّل عناوين يفرض IPv4، **مقصوراً على النداء الخارجي الذي يُمرَّر إليه** — لا
 * monkey-patching على `dns.lookup` العام ولا تثبيت عنوان IP (عنوان المصدر يتغيّر).
 *
 * السبب: حاوية الإنتاج Alpine/musl. مضيف `api.gold-api.com` يجيب سجل A وحده
 * ويردّ NXDOMAIN على AAAA، فتُسقط musl نتيجة getaddrinfo كلها حين يُطلب
 * الاثنان، بينما `dns.lookup(host, { family: 4 })` ينجح. `fetch` لا يسمح
 * بتمرير عائلة الحل، و`http(s).get` يسمح بخيار `lookup` هذا.
 *
 * خيارات `net` تُمرَّر كما هي (ومنها `all` في مسار autoSelectFamily) إلا
 * `family` فتُثبَّت 4، فلا يُطلب IPv6 في هذا النداء إطلاقاً.
 */
function lookupIPv4(hostname, options, callback) {
  dns.lookup(hostname, { ...options, family: 4 }, callback);
}

/** أقصى تحويلات يتبعها النداء الواحد — سلوك `fetch` نفسه، بسقف أضيق يمنع الحلقة. */
const MAX_REDIRECTS = 3;

/**
 * نداء واحد إلى مصدر خارجي. أي خروج عن العقد — شبكة، مهلة، 5xx، نصّ غير JSON،
 * جسم بلا `price`/`rates` — يرمي، والقرار (آخر نسخة أو 503) لمن يستدعيه.
 *
 * يُبنى على `http(s).get` لا `fetch` لسببين: تمرير `lookup` أعلاه، وإبقاء اتباع
 * التحويلات الذي كان `fetch` يفعله. والتحقّق من الشهادة يبقى على اسم المضيف
 * الحقيقي — لا اتصال بـIP خام ولا `rejectUnauthorized`. والوحدة تُختار
 * بالبروتوكول لأن اختبارات الخادم تشير إلى خادمها الوهمي بعنوان `http://127.0.0.1`.
 */
async function fetchJson(url) {
  // إشارة واحدة للنداء كلّه: التحويلات لا تجدّد المهلة ولا تطيلها.
  return requestJson(new URL(url), AbortSignal.timeout(timeoutMs()), MAX_REDIRECTS);
}

/**
 * طلب GET واحد داخل `fetchJson`: يتبع `3xx` حتى `redirectsLeft`، ثم يفكّ جسم
 * الردّ JSON. المهلة إشارة النداء الأصلي وحدها، فلا يضاعف التحويلُ السقفَ الزمني.
 */
function requestJson(endpoint, signal, redirectsLeft) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const succeed = payload => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const transport = endpoint.protocol === 'http:' ? http : https;
    const request = transport.get(endpoint, {
      headers: { Accept: 'application/json' },
      signal,
      lookup: lookupIPv4
    }, response => {
      // مستمعا الخطأ قبل أي شيء: جسم يُقطع بعد الرفض لا يرمي حدثاً بلا مستمع.
      response.on('error', fail);
      response.on('aborted', () => fail(new Error('prices source request aborted')));

      const status = response.statusCode;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
        response.resume();
        let next;
        try {
          next = new URL(location, endpoint);
        } catch {
          fail(new Error(`prices source responded ${status}`));
          return;
        }
        requestJson(next, signal, redirectsLeft - 1).then(succeed, fail);
        return;
      }

      if (!(status >= 200 && status < 300)) {
        response.resume();
        fail(new Error(`prices source responded ${status}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          fail(new Error('prices source returned a non-JSON body'));
          return;
        }
        succeed(payload);
      });
    });

    request.on('error', fail);
  });
}

/** يسجّل سبب السقوط بلا كشف رابط أو محتوى — للمشغّل وحده. */
function logSourceFailure(reason) {
  logger.warn('prices.source_failed', { reason });
}

/**
 * الشكل المنشور في `GET /api/prices` (وتُضاف إليه `success` في طبقة المسار).
 * النداءان بالتوازي: مصدران مستقلان، ولا سبب لانتظار أحدهما الآخر.
 *
 * @returns {Promise<{ gold: object, currencies: object[], fx_date: string, stale: boolean }>}
 */
async function getPrices() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < cacheTtlMs()) {
    return cache.payload;
  }

  try {
    const [fxPayload, goldPayload] = await Promise.all([
      fetchJson(fxSourceUrl()),
      fetchJson(goldEndpoint())
    ]);
    const fx = normaliseCurrencyRates(fxPayload);
    const gold = normaliseGoldPrice(goldPayload, fx.ilsPerUsd);
    const payload = {
      gold,
      currencies: fx.currencies,
      fx_date: fx.fxDate,
      stale: false
    };
    cache = { payload, fetchedAt: now };
    return payload;
  } catch (err) {
    logSourceFailure(err.message);

    // آخر نسخة ناجحة تُخدَم عند السقوط، بـ`stale: true` وتاريخ المصدر نفسه
    // داخلها — فالسطر يقول «هذه ليست أسعار اللحظة» بصدق.
    if (cache) return { ...cache.payload, stale: true };

    throw ApiError.serviceUnavailable(PRICES_UNAVAILABLE_MESSAGE);
  }
}

/**
 * تفريغ الكاش — للاختبارات وحدها (كما `news.service.clearCache`): لا مسار
 * عمومي يفعل هذا، ولا سبب إنتاجي له. الاختبار يحتاجه ليبدأ من «بلا نسخة»
 * ويثبت ردّ الفشل الأول، ولاحقاً أن النجاح هو ما يملأه.
 */
function clearCache() {
  cache = null;
}

module.exports = {
  getPrices,
  clearCache,
  PRICES_UNAVAILABLE_MESSAGE
};
