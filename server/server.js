'use strict';

/**
 * Entry point — منصة مناسبات النقب
 *
 * Boot order: wait for MySQL → apply schema → seed once → start HTTP + realtime.
 */

const http = require('http');

const config = require('./src/config');
const logger = require('./src/utils/logger');
const db = require('./src/db/pool');
const migrate = require('./src/db/migrate');
const seed = require('./src/db/seed');
const createApp = require('./src/app');
const realtime = require('./src/realtime');
const analytics = require('./src/services/analytics.service');

const RUN_MIGRATIONS = process.env.RUN_MIGRATIONS !== 'false';
const RUN_SEED = process.env.RUN_SEED !== 'false';
// smoke.test.js boots the app via createApp() directly and never runs this
// file, so this guard is belt-and-suspenders rather than what actually keeps
// `npm test` timer-free — but it follows the same opt-out shape as
// RUN_MIGRATIONS/RUN_SEED above, and gives ops an explicit way to disable the
// background fold (e.g. running it from cron/analytics-retention.js instead).
const RUN_ANALYTICS_RETENTION = process.env.RUN_ANALYTICS_RETENTION !== 'false';
const ANALYTICS_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function start() {
  await db.waitForConnection();

  if (RUN_MIGRATIONS) await migrate();
  if (RUN_SEED) await seed();

  const app = createApp();
  const server = http.createServer(app);
  realtime.init(server);

  if (RUN_ANALYTICS_RETENTION) {
    const runFold = () => {
      analytics.foldOldEvents()
        .then(({ folded, deleted }) => {
          if (folded || deleted) {
            logger.info(`[analytics] retention fold: ${folded} group(s) folded, ${deleted} row(s) deleted`);
          }
        })
        .catch(err => logger.error('[analytics] retention fold failed:', err.message));
    };
    setInterval(runFold, ANALYTICS_RETENTION_INTERVAL_MS).unref();
  }

  server.listen(config.port, config.host, () => {
    logger.info('====================================================');
    logger.info('🌟 خادم منصة مناسبات النقب — جاهز للعمل');
    logger.info(`🔌 الـAPI:              http://localhost:${config.port}/api`);
    logger.info(`❤️  فحص الصحة:          http://localhost:${config.port}/health`);
    logger.info(`🖼️  الوسائط:            ${config.publicUrl}/uploads`);
    logger.info('🖥️  الواجهة تُشغَّل بشكل منفصل من مجلد ../web');
    logger.info(`⚙️  البيئة: ${config.env} | قاعدة البيانات: ${config.db.host}:${config.db.port}/${config.db.database}`);
    logger.info('====================================================');
  });

  const shutdown = signal => {
    logger.info(`${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
    // Do not hang forever on lingering sockets.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => {
  logger.error('Startup failed:', err.message);
  process.exit(1);
});
