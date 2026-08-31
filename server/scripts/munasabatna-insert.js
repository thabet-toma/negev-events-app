'use strict';

/**
 * Step 2 of the daily munasabatna sync.
 *
 * Reads a JSON array of events on stdin (the fields an agent extracted from the
 * invitation posters) and inserts them into the events table.
 *
 *   node scripts/munasabatna-scan.js --download        # find + download new posters
 *   ...agent reads each poster and writes events.json...
 *   node scripts/munasabatna-insert.js < events.json
 *
 * Rules enforced here so a mistake upstream cannot corrupt the table:
 *   - poster_url is required and must be unique — it is the dedup key.
 *   - a town outside constants.TOWNS is stored as 'غير محدد' and the row is
 *     forced to `pending`, so an admin completes it before it goes public.
 *   - latitude/longitude come from TOWN_COORDINATES, never from the input.
 */

const db = require('../src/db/pool');
const { TOWNS, TOWN_COORDINATES } = require('../src/constants');

const UNKNOWN = 'غير محدد';
const REQUIRED = ['groom_name', 'event_date', 'poster_url'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function normalise(raw, index) {
  for (const field of REQUIRED) {
    if (!raw[field]) throw new Error(`event[${index}]: missing "${field}"`);
  }
  if (!DATE_RE.test(raw.event_date)) {
    throw new Error(`event[${index}]: event_date must be YYYY-MM-DD, got "${raw.event_date}"`);
  }
  if (raw.youth_party_date && !DATE_RE.test(raw.youth_party_date)) {
    throw new Error(`event[${index}]: youth_party_date must be YYYY-MM-DD`);
  }

  const townIsKnown = TOWNS.includes(raw.town);
  const town = townIsKnown ? raw.town : UNKNOWN;
  const coords = TOWN_COORDINATES[town] || {};

  return {
    title: raw.title || `أفراح ${raw.family_clan || ''} — زفاف العريس ${raw.groom_name}`.trim(),
    groom_name: raw.groom_name,
    family_clan: raw.family_clan || '',
    town,
    location_name: raw.location_name || UNKNOWN,
    latitude: coords.lat ?? null,
    longitude: coords.lng ?? null,
    event_date: raw.event_date,
    youth_party_date: raw.youth_party_date || null,
    dinner_time: raw.dinner_time || 'الساعة 8:00 مساءً',
    poster_url: raw.poster_url,
    host_phone: raw.host_phone || null,
    // Only a row with a real town and a real location is safe to publish.
    status: townIsKnown && raw.location_name && raw.location_name !== UNKNOWN ? 'approved' : 'pending'
  };
}

async function run() {
  const input = await readStdin();
  if (!input.trim()) throw new Error('no JSON on stdin');

  const parsed = JSON.parse(input);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const events = list.map(normalise);

  let imported = 0;
  let skipped = 0;

  for (const event of events) {
    const existing = await db.queryOne(
      'SELECT id FROM events WHERE poster_url = ? OR (groom_name = ? AND event_date = ?)',
      [event.poster_url, event.groom_name, event.event_date]
    );

    if (existing) {
      console.log(`skipped (already present #${existing.id}): ${event.title}`);
      skipped += 1;
      continue;
    }

    const { insertId } = await db.execute(
      `INSERT INTO events
         (title, groom_name, family_clan, town, location_name, latitude, longitude,
          event_date, youth_party_date, dinner_time, poster_url, host_phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.title, event.groom_name, event.family_clan, event.town, event.location_name,
        event.latitude, event.longitude, event.event_date, event.youth_party_date,
        event.dinner_time, event.poster_url, event.host_phone, event.status
      ]
    );

    console.log(`imported #${insertId} (${event.status}): ${event.title}`);
    imported += 1;
  }

  const pending = events.filter(e => e.status === 'pending').length;
  console.log(`done — ${imported} imported (${pending} need an admin to fill in the town), ${skipped} already present`);

  await db.close();
}

run().catch(err => {
  console.error(`insert failed: ${err.message}`);
  process.exit(1);
});
