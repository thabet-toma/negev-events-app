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
const db = require('./db/pool');
const { notFound, errorHandler } = require('./middleware/error');
const { uploadsDir } = require('./middleware/upload');

// مجلد التوزيع يُنشأ عند الإقلاع حتى لا يفشل express.static على تنصيب جديد.
const downloadsDir = path.join(__dirname, '..', 'downloads');
fs.mkdirSync(downloadsDir, { recursive: true });

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
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));

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

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
