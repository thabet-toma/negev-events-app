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

const RUN_MIGRATIONS = process.env.RUN_MIGRATIONS !== 'false';
const RUN_SEED = process.env.RUN_SEED !== 'false';

async function start() {
  await db.waitForConnection();

  if (RUN_MIGRATIONS) await migrate();
  if (RUN_SEED) await seed();

  const app = createApp();
  const server = http.createServer(app);
  realtime.init(server);

  server.listen(config.port, config.host, () => {
    logger.info('====================================================');
    logger.info('🌟 منصة وتطبيق مناسبات النقب — جاهزة للعمل');
    logger.info(`📱 الواجهة الرئيسية:   http://localhost:${config.port}`);
    logger.info(`👑 لوحة التحكم:        http://localhost:${config.port}/admin.html`);
    logger.info(`❤️  فحص الصحة:          http://localhost:${config.port}/health`);
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
