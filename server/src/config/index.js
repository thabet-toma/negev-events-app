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
    authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 20)
  },

  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 10)
};

if (isProduction && config.admin.pin === '9999') {
  console.warn('[config] ⚠️  ADMIN_PIN is still the default value — change it before going live.');
}

module.exports = config;
