'use strict';

/**
 * One-off migration from the old JSON file store (database/negev_events_data.json)
 * into MySQL. Old ids are remapped to the new auto-increment ids, so foreign keys
 * stay consistent. Safe to re-run: rows that already exist are skipped.
 *
 *   npm run db:import-legacy [-- path/to/negev_events_data.json]
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/db/pool');
const logger = require('../src/utils/logger');
const { TOWN_COORDINATES, REACTION_TYPES } = require('../src/constants');

const DEFAULT_PATH = path.join(__dirname, '..', 'database', 'negev_events_data.json');

function toDate(value) {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function toTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
}

async function importUsers(users) {
  const idMap = new Map();
  let imported = 0;

  for (const user of users) {
    const existing = await db.queryOne('SELECT id FROM users WHERE phone_number = ?', [user.phone_number]);
    if (existing) {
      idMap.set(user.id, existing.id);
      continue;
    }

    const role = ['user', 'admin', 'super_admin'].includes(user.role) ? user.role : 'user';
    const { insertId } = await db.execute(
      `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role, created_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [user.phone_number, user.full_name, user.pin_code, user.clan_town, role, toTimestamp(user.created_at)]
    );
    idMap.set(user.id, insertId);
    imported += 1;
  }

  logger.info(`Users: ${imported} imported, ${users.length - imported} already present.`);
  return idMap;
}

async function importEvents(events, userIdMap) {
  const idMap = new Map();
  let imported = 0;

  for (const event of events) {
    const eventDate = toDate(event.event_date);
    if (!event.groom_name || !event.town || !eventDate) {
      logger.warn(`Skipping malformed event id=${event.id}`);
      continue;
    }

    const duplicate = await db.queryOne(
      'SELECT id FROM events WHERE groom_name = ? AND event_date = ? AND town = ?',
      [event.groom_name, eventDate, event.town]
    );
    if (duplicate) {
      idMap.set(event.id, duplicate.id);
      continue;
    }

    const coords = TOWN_COORDINATES[event.town] || {};
    const status = ['pending', 'approved', 'rejected'].includes(event.status) ? event.status : 'approved';

    const { insertId } = await db.execute(
      `INSERT INTO events
         (title, groom_name, family_clan, town, location_name, latitude, longitude,
          event_date, youth_party_date, dinner_time, poster_url, audio_url, audio_title,
          host_phone, status, views_count, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        event.title || `زفاف العريس ${event.groom_name}`,
        event.groom_name,
        event.family_clan || event.town,
        event.town,
        event.location_name || event.town,
        event.latitude ?? coords.lat ?? null,
        event.longitude ?? coords.lng ?? null,
        eventDate,
        toDate(event.youth_party_date),
        event.dinner_time || 'الساعة 8:00 مساءً',
        event.poster_url || null,
        event.audio_url || null,
        event.audio_title || null,
        event.host_phone || null,
        status,
        Number(event.views_count) || 0,
        userIdMap.get(event.created_by) ?? null,
        toTimestamp(event.created_at)
      ]
    );
    idMap.set(event.id, insertId);
    imported += 1;
  }

  logger.info(`Events: ${imported} imported, ${events.length - imported} skipped/duplicate.`);
  return idMap;
}

async function importReactions(reactions, eventIdMap) {
  let imported = 0;
  for (const reaction of reactions) {
    const eventId = eventIdMap.get(reaction.event_id);
    if (!eventId || !REACTION_TYPES.includes(reaction.reaction_type)) continue;

    await db.execute(
      `INSERT INTO reactions (event_id, reaction_type, user_identifier, created_at)
       VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [eventId, reaction.reaction_type, reaction.user_identifier || 'legacy', toTimestamp(reaction.created_at)]
    );
    imported += 1;
  }
  logger.info(`Reactions: ${imported} imported.`);
}

async function importCongratulations(congratulations, eventIdMap) {
  let imported = 0;
  for (const item of congratulations) {
    const eventId = eventIdMap.get(item.event_id);
    if (!eventId || !item.sender_name || !item.message) continue;

    await db.execute(
      `INSERT INTO congratulations (event_id, sender_name, badge_title, message, sticker_url, created_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [eventId, item.sender_name, item.badge_title || 'مبارك الفرح', item.message, item.sticker_url || null, toTimestamp(item.created_at)]
    );
    imported += 1;
  }
  logger.info(`Congratulations: ${imported} imported.`);
}

async function importNokoot(records, userIdMap) {
  let imported = 0;
  for (const record of records) {
    const userId = userIdMap.get(record.user_id);
    const eventDate = toDate(record.event_date);
    if (!userId || !record.recipient_name || !eventDate) continue;

    await db.execute(
      `INSERT INTO nokoot_ledger
         (user_id, recipient_name, clan_town, amount, currency, occasion_type, event_date, notes, is_settled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        userId,
        record.recipient_name,
        record.clan_town || null,
        Number(record.amount) || 0,
        record.currency || 'ILS',
        record.occasion_type || 'عرس',
        eventDate,
        record.notes || null,
        record.is_settled ? 1 : 0,
        toTimestamp(record.created_at)
      ]
    );
    imported += 1;
  }
  logger.info(`Nokoot ledger: ${imported} imported.`);
}

async function importStories(stories, eventIdMap) {
  const { total } = await db.queryOne('SELECT COUNT(*) AS total FROM stories');
  if (total > 0) {
    logger.info('Stories already present — skipped.');
    return;
  }

  for (const story of stories) {
    await db.execute(
      'INSERT INTO stories (title, clan, town, image, is_live, event_id) VALUES (?, ?, ?, ?, ?, ?)',
      [story.title, story.clan || null, story.town || null, story.image || null, story.isLive ? 1 : 0, eventIdMap.get(story.event_id) ?? null]
    );
  }
  logger.info(`Stories: ${stories.length} imported.`);
}

async function run() {
  const filePath = process.argv[2] || DEFAULT_PATH;

  if (!fs.existsSync(filePath)) {
    logger.warn(`No legacy data file at ${filePath} — nothing to import.`);
    return;
  }

  const legacy = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  logger.info(`Importing legacy data from ${filePath}`);

  await db.waitForConnection();

  const userIdMap = await importUsers(legacy.users || []);
  const eventIdMap = await importEvents(legacy.events || [], userIdMap);
  await importReactions(legacy.reactions || [], eventIdMap);
  await importCongratulations(legacy.congratulations || [], eventIdMap);
  await importNokoot(legacy.nokoot_ledger || [], userIdMap);
  await importStories(legacy.stories || [], eventIdMap);

  logger.info('Legacy import complete.');
}

if (require.main === module) {
  run()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async err => {
      logger.error('Legacy import failed:', err.message);
      await db.close().catch(() => {});
      process.exit(1);
    });
}

module.exports = run;
