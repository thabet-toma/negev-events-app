'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const routes = require('./routes');
const shareRoutes = require('./routes/share.routes');
const shareCard = require('./services/shareCard.service');
const db = require('./db/pool');
const { notFound, errorHandler } = require('./middleware/error');
const { uploadsDir } = require('./middleware/upload');

// مجلد التوزيع يُنشأ عند الإقلاع حتى لا يفشل express.static على تنصيب جديد.
const downloadsDir = path.join(__dirname, '..', 'downloads');
fs.mkdirSync(downloadsDir, { recursive: true });

// Same reasoning as downloadsDir above: the container runs as the
// unprivileged `node` user (server/Dockerfile), so the OG-card cache
// directory has to be created by this same process at boot to be owned by
// it — created here rather than only inside shareCard.service.js so the
// dependency on "this directory exists and is writable" is visible where
// every other writable directory this app owns is declared.
fs.mkdirSync(shareCard.CACHE_DIR, { recursive: true });

function createApp() {
  const app = express();

  // Behind Nginx/Traefik on the production host, so client IPs arrive via headers.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    // The UI loads posters, audio and map tiles from third-party CDNs.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors({
    origin: config.cors.origins.includes('*') ? true : config.cors.origins,
    credentials: true
  }));

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  // 'combined' logs :remote-addr and the User-Agent — neither has a stated
  // debugging purpose here, and under a purpose-as-ceiling privacy rule
  // (Israeli Privacy Protection Law Amendment 13) an unjustified field is a
  // liability, not a convenience. This custom format keeps only what is
  // actually used for debugging — method, url, status, response time,
  // content length — and this one line is what removes the client IP from
  // both the privacy notice's obligations and the access log itself.
  const PRODUCTION_LOG_FORMAT = ':method :url :status :res[content-length] - :response-time ms';
  app.use(morgan(config.isProduction ? PRODUCTION_LOG_FORMAT : 'dev'));

  app.use('/api', rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'عدد الطلبات تجاوز الحد المسموح — يرجى المحاولة لاحقاً' }
  }));

  // Health probe for the container orchestrator / uptime monitor.
  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', database: 'up', uptime: Math.round(process.uptime()) });
    } catch (err) {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.use('/api', routes);

  // Root gives a machine-readable identity instead of a web page: the UI is a
  // separate deliverable (see ../web) and any number of clients share this API.
  app.get('/', (req, res) => {
    res.json({ name: 'negev-events-api', status: 'ok', api: '/api', health: '/health' });
  });

  // ملفات التوزيع (APK) — يخدمها الخادم نفسه ليقصد التطبيق رابطاً واحداً.
  app.use('/downloads', express.static(downloadsDir, {
    maxAge: '5m',
    setHeaders: res => res.setHeader('X-Content-Type-Options', 'nosniff')
  }));

  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '7d',
    // Uploaded files are served as attachments-in-place, never executed.
    setHeaders: res => res.setHeader('X-Content-Type-Options', 'nosniff')
  }));

  // الصفحة القابلة للمشاركة (issue #44) — HTML حقيقي لعارضات الشبكات
  // الاجتماعية التي لا تُشغّل JavaScript، فلا تلتقط شيئاً من واجهة الـSPA.
  // على جذر التطبيق (`/e/...`) لا تحت `/api` — راجع
  // docs/adr/0006-server-renders-the-share-page.md.
  app.use('/e', shareRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
