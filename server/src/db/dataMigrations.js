'use strict';

/**
 * Explicit data/schema migrations that schema.sql cannot express — it only
 * ever runs CREATE TABLE IF NOT EXISTS, so ALTERs and one-off UPDATEs live
 * here instead. Applied in order, once, after schema.sql, by migrate.js.
 *
 * Every step's run() must be safe to execute on every `npm run db:migrate`,
 * including against a database that already has the change applied. Add new
 * steps by appending to `steps` — never edit or remove a past one.
 */

const logger = require('../utils/logger');
const { TOWN_COORDINATES } = require('../constants');

// Coordinates as they were stored before the fix below. Kept here (not in
// constants.js, which now only holds the corrected values) purely as the
// "old value" side of the migration's WHERE clause.
const OLD_TOWN_COORDINATES = {
  'رهط': { lat: 31.3925, lng: 34.7554 },
  'اللقية': { lat: 31.3260, lng: 34.8720 },
  'تل السبع': { lat: 31.2483, lng: 34.8431 },
  'حورة': { lat: 31.2858, lng: 34.9312 },
  'شقيب السلام': { lat: 31.2062, lng: 34.8210 },
  'عرعرة النقب': { lat: 31.1890, lng: 35.0120 },
  'كسيفة': { lat: 31.2980, lng: 35.0310 },
  'القرى والتجمعات': { lat: 31.2600, lng: 34.8800 }
};

const steps = [
  {
    name: 'fix-town-coordinates-2026-08',
    async run(connection) {
      let totalAffected = 0;

      for (const [town, oldCoords] of Object.entries(OLD_TOWN_COORDINATES)) {
        // 'القرى والتجمعات' has no entry in the corrected map on purpose —
        // rows still carrying its old placeholder pin lose the pin instead.
        const newCoords = TOWN_COORDINATES[town] || null;

        const [result] = await connection.execute(
          `UPDATE events SET latitude = ?, longitude = ?
            WHERE town = ? AND latitude = ? AND longitude = ?`,
          [
            newCoords ? newCoords.lat : null,
            newCoords ? newCoords.lng : null,
            town,
            oldCoords.lat,
            oldCoords.lng
          ]
        );
        totalAffected += result.affectedRows;
      }

      logger.info(`[migrations] fix-town-coordinates-2026-08: ${totalAffected} row(s) updated.`);
    }
  }
];

module.exports = steps;
