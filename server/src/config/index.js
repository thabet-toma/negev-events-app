'use strict';

require('dotenv').config();

const path = require('path');

function required(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function stripTrailingSlash(value) {
  let out = value;
  while (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

// In production a weak/default JWT secret is a hard failure, not a warning.
const jwtSecret = isProduction
  ? required('JWT_SECRET')
  : process.env.JWT_SECRET || 'negev-events-development-secret-do-not-use-in-production';

const config = {
  env,
  isProduction,
  port: toInt(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',

  // The absolute origin this API is reachable at. Stored media paths are
  // relative (/uploads/...), which only resolves for a client served from the
  // same origin — every other client (web on its own host, Flutter, native)
  // needs them absolute. Set PUBLIC_URL in production.
  publicUrl: stripTrailingSlash(process.env.PUBLIC_URL || `http://localhost:${toInt(process.env.PORT, 3000)}`),

  jwt: {
    secret: jwtSecret,
    userTokenTtl: process.env.JWT_USER_TTL || '90d',
    adminTokenTtl: process.env.JWT_ADMIN_TTL || '12h'
  },

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'negev_events',
    connectionLimit: toInt(process.env.DB_POOL_SIZE, 10),
    charset: 'utf8mb4'
  },

  admin: {
    // Bootstrap super-admin, created by the seeder if no admin exists yet.
    phone: process.env.ADMIN_PHONE || '0500000000',
    pin: process.env.ADMIN_PIN || '9999',
    name: process.env.ADMIN_NAME || 'مدير عام المنصة'
  },

  uploads: {
    dir: process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'),
    maxFileSizeMb: toInt(process.env.UPLOAD_MAX_MB, 30)
  },

  // إعلان نسخة تطبيق الموبايل. التطبيق يستعلم عنها عند الإقلاع ويعرض تنبيه
  // تحديث. تُضبط عند كل إصدار جديد — لا تتطلب تعديل كود.
  app: {
    latestVersion: process.env.APP_LATEST_VERSION || null,
    // أقل نسخة مسموح بها؛ ما دونها يُلزَم المستخدم بالتحديث قبل المتابعة.
    minVersion: process.env.APP_MIN_VERSION || null,
    // مسار نسبي (/downloads/...) يُحوَّل إلى مطلق، أو رابط خارجي كما هو.
    apkUrl: process.env.APP_APK_URL || null,
    releaseNotes: process.env.APP_RELEASE_NOTES || ''
  },

  cors: {
    // Comma-separated list, or "*" for any origin.
    origins: (process.env.CORS_ORIGINS || '*').split(',').map(o => o.trim()).filter(Boolean)
  },

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: toInt(process.env.RATE_LIMIT_MAX, 600),
    // Separate per-USER budget for authenticated requests, so one admin's bulk
    // album upload can neither starve nor be starved by others behind one IP.
    userMax: toInt(process.env.RATE_LIMIT_USER_MAX, 3000),
    authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 20),
    // Tighter than the global API budget above: this is a fire-and-forget
    // beacon endpoint (POST /api/analytics/events) with no login required,
    // so it is the cheapest route in the API to spam.
    analyticsMax: toInt(process.env.RATE_LIMIT_ANALYTICS_MAX, 60),
    // ستوديو بطاقة الدعوة (#180) — دلوان **منفصلان** فوق الحدّ العام، كما في
    // `albums.routes.js`: المعاينة ترسم PNG على الخادم لكل ضغطة زرّ فهي الأشدّ،
    // والكتابة تُرفع صورتها إلى التخزين فهي الأخفّ. المفتاح لكل مستخدم (لا لكل
    // IP) بالهوية نفسها التي تقرؤها `authenticate` في الراوتر.
    cardPreviewMax: toInt(process.env.CARD_PREVIEW_RATE_MAX, 20),
    cardWriteMax: toInt(process.env.CARD_WRITE_RATE_MAX, 40),
    cardWindowMs: toInt(process.env.CARD_RATE_WINDOW_MS, 15 * 60 * 1000)
  },

  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 10),

  // Web Push (issue #85). The pair is generated ONCE and never rotated — see
  // .env.example. Absent by default: push.service.js must keep the platform
  // fully functional (notification rows still written) with all three null.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    privateKey: process.env.VAPID_PRIVATE_KEY || null,
    subject: process.env.VAPID_SUBJECT || null
  },

  // Cloudinary (ADR-0008) — where archive photos and episode share images
  // live. Absent by default: the platform runs normally, and the two upload
  // buttons answer with a clear Arabic message instead (cloudinary.service.js).
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || null,
    apiKey: process.env.CLOUDINARY_API_KEY || null,
    apiSecret: process.env.CLOUDINARY_API_SECRET || null
  },

  // منصة كترا الإخبارية (وجهة «خدماتنا» ← «آخر خبر») — مصدر خارجي وحده. بلا
  // هذا الإعداد يعمل كل شيء آخر كما هو، ومسارا `/api/news` يردّان 502 عربياً
  // حين يتعذّر الوصول إليه. الخدمة تقرأ البيئة عند كل استدعاء أيضاً، انظر
  // news.service.js — الأمثلة على ذلك منذ اختبارات الخادم الوهمي.
  katraNewsBaseUrl: stripTrailingSlash(process.env.KATRA_NEWS_BASE_URL || 'https://radio.ktra-pro.tech'),
  // قائمة واحدة تُخدَّم من الذاكرة خمس دقائق: الأخبار لا تتحرّك كل ثانية، وكل
  // طلب يمرّ إلى طرف ثالث يجعل مصدره البطيء عطلاً لنا.
  katraNewsCacheTtlMs: toInt(process.env.KATRA_NEWS_CACHE_TTL_MS, 300000),
  katraNewsTimeoutMs: toInt(process.env.KATRA_NEWS_TIMEOUT_MS, 5000),

  // أسعار الذهب والعملات (وجهة «خدماتنا» ← الحاسبتان، تذكرة #189) — مصدران
  // خارجيان وحدهما، بلا جدول عندنا. بلا هذين العنوانين يعمل كل شيء آخر كما هو،
  // ومسار `/api/prices` يردّ 503 عربياً حين يتعذّر الوصول إليهما (والشريط يبقى
  // بلا أسعار). الخدمة تقرأ البيئة عند كل استدعاء أيضاً، انظر
  // prices.service.js — كما في katraNewsBaseUrl أعلاه.
  prices: {
    fxUrl: process.env.PRICES_FX_URL || 'https://api.frankfurter.dev/v2/rates',
    goldUrl: process.env.PRICES_GOLD_URL || 'https://api.gold-api.com/price/XAU',
    // ساعة كاملة: سعران لا يتحرّكان كل ثانية، وكل طلب يمرّ إلى طرفين خارجيين
    // يجعل بطأهما عطلاً لنا.
    cacheTtlMs: toInt(process.env.PRICES_CACHE_TTL_MS, 60 * 60 * 1000),
    timeoutMs: toInt(process.env.PRICES_TIMEOUT_MS, 5000)
  },

  // Facebook Page Integration (auto-publishing approved events)
  facebook: {
    pageId: process.env.FACEBOOK_PAGE_ID || null,
    accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null,
    // An optional second Page. A Page access token is scoped to exactly one
    // Page (GET /me/accounts is rejected for it), so the second Page needs its
    // own id and its own token — they cannot be derived or reused.
    secondPageId: process.env.FACEBOOK_PAGE_ID_2 || null,
    secondAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN_2 || null,
    // True when at least one token exists, so a single-page install behaves as
    // it always has; `pages` below is what actually holds the usable pairs.
    autoPublish: process.env.FACEBOOK_AUTO_PUBLISH !== 'false'
      && Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN_2)
  }
};

// Every Page a post may go to, primary first. A pair counts only when BOTH
// halves are set: a token without an id (or an id without a token) is unusable.
config.facebook.pages = [
  { pageId: config.facebook.pageId, accessToken: config.facebook.accessToken },
  { pageId: config.facebook.secondPageId, accessToken: config.facebook.secondAccessToken }
].filter(page => Boolean(page.pageId && page.accessToken));

if (isProduction && config.admin.pin === '9999') {
  console.warn('[config] ⚠️  ADMIN_PIN is still the default value — change it before going live.');
}

module.exports = config;
