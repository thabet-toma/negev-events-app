'use strict';

/**
 * Runs the analytics retention fold once: every `analytics_events` row older
 * than the retention window (analytics.service.RETENTION_DAYS) is grouped
 * into `analytics_daily_counters` and the identified source rows are
 * deleted. Safe to run any number of times — a run that finds nothing past
 * the window changes nothing (see analytics.service.foldOldEvents).
 *
 * In production this also runs automatically once a day from server.js; this
 * script exists for a manual/cron-triggered run and for ops visibility.
 *
 *   node scripts/analytics-retention.js
 */

const db = require('../src/db/pool');
const analytics = require('../src/services/analytics.service');

async function run() {
  await db.waitForConnection();

  const { folded, deleted } = await analytics.foldOldEvents();
  console.log(
    `analytics retention: ${folded} group(s) folded into analytics_daily_counters, ${deleted} identified row(s) deleted (retention window: ${analytics.RETENTION_DAYS} day(s))`
  );

  await db.close();
}

run().catch(err => {
  console.error(`analytics retention failed: ${err.message}`);
  process.exit(1);
});
