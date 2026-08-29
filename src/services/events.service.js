'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const { REACTION_TYPES, TOWN_COORDINATES, DEFAULT_POSTER } = require('../constants');

const EMPTY_REACTIONS = () => REACTION_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});

/** Escapes LIKE wildcards so a user search term stays a literal substring. */
function escapeLike(term) {
  return term.replace(/[\\%_]/g, char => `\\${char}`);
}

/** Groups reaction counts by event id: { [eventId]: { coffee: 3, ... } }. */
async function reactionsForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, reaction_type, COUNT(*) AS count
       FROM reactions
      WHERE event_id IN (${placeholders})
      GROUP BY event_id, reaction_type`,
    eventIds
  );

  const map = {};
  for (const row of rows) {
    if (!map[row.event_id]) map[row.event_id] = EMPTY_REACTIONS();
    map[row.event_id][row.reaction_type] = Number(row.count);
  }
  return map;
}

/** Approved events, optionally filtered by town, date and free-text search. */
async function listPublicEvents({ town, date, search } = {}) {
  const conditions = ["status = 'approved'"];
  const params = [];

  if (town && town !== 'الكل') {
    conditions.push('town = ?');
    params.push(town);
  }

  if (date) {
    conditions.push('event_date = ?');
    params.push(date);
  }

  if (search) {
    conditions.push(
      `(groom_name LIKE ? ESCAPE '\\\\' OR family_clan LIKE ? ESCAPE '\\\\'
        OR title LIKE ? ESCAPE '\\\\' OR location_name LIKE ? ESCAPE '\\\\'
        OR town LIKE ? ESCAPE '\\\\')`
    );
    const term = `%${escapeLike(search)}%`;
    params.push(term, term, term, term, term);
  }

  const events = await db.query(
    `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY event_date ASC, id ASC`,
    params
  );

  const reactionMap = await reactionsForEvents(events.map(e => e.id));
  return events.map(event => ({
    ...event,
    reactions: reactionMap[event.id] || EMPTY_REACTIONS()
  }));
}

/** A single event with its reactions and congratulations. View count is bumped. */
async function getEventDetails(eventId) {
  const event = await db.queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  await db.execute('UPDATE events SET views_count = views_count + 1 WHERE id = ?', [eventId]);

  const [congratulations, reactionRows] = await Promise.all([
    db.query('SELECT * FROM congratulations WHERE event_id = ? ORDER BY created_at DESC', [eventId]),
    db.query(
      'SELECT reaction_type, COUNT(*) AS count FROM reactions WHERE event_id = ? GROUP BY reaction_type',
      [eventId]
    )
  ]);

  const reactions = EMPTY_REACTIONS();
  for (const row of reactionRows) reactions[row.reaction_type] = Number(row.count);

  return {
    ...event,
    views_count: event.views_count + 1,
    reactions,
    congratulations
  };
}

/** Approved events that carry coordinates, shaped for the map view. */
async function listMapPoints() {
  const rows = await db.query(
    `SELECT id, title, groom_name, town, event_date, location_name, poster_url, latitude, longitude
       FROM events
      WHERE status = 'approved' AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY event_date ASC`
  );

  return rows.map(row => ({
    ...row,
    waze_url: `https://waze.com/ul?ll=${row.latitude},${row.longitude}&navigate=yes`
  }));
}

async function listStories() {
  const rows = await db.query('SELECT * FROM stories ORDER BY is_live DESC, id ASC');
  // The UI reads `isLive`; keep `is_live` too so API consumers see the raw column.
  return rows.map(row => ({ ...row, isLive: Boolean(row.is_live) }));
}

/**
 * Creates an event. Admins publish immediately; everyone else lands in the
 * moderation queue.
 */
async function createEvent(data, { autoApprove = false, createdBy = null } = {}) {
  const coords = TOWN_COORDINATES[data.town] || {};
  const latitude = data.latitude ?? coords.lat ?? null;
  const longitude = data.longitude ?? coords.lng ?? null;

  const status = autoApprove ? 'approved' : 'pending';
  const title = data.title || `زفاف العريس ${data.groom_name} (${data.family_clan || data.town})`;
  const familyClan = data.family_clan || `آل ${data.groom_name.split(' ').slice(-1)[0]}`;

  const { insertId } = await db.execute(
    `INSERT INTO events
       (title, groom_name, family_clan, town, location_name, latitude, longitude,
        event_date, youth_party_date, dinner_time, poster_url, audio_url, audio_title,
        host_phone, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      data.groom_name,
      familyClan,
      data.town,
      data.location_name,
      latitude,
      longitude,
      data.event_date,
      data.youth_party_date,
      data.dinner_time || 'الساعة 8:00 مساءً',
      data.poster_url || DEFAULT_POSTER,
      data.audio_url,
      data.audio_title || 'شيلة الفرح',
      data.host_phone,
      status,
      createdBy
    ]
  );

  return { id: insertId, title, status, groom_name: data.groom_name, town: data.town, event_date: data.event_date };
}

/** Events already booked on a given date (optionally within one town). */
async function findCollisions({ date, town }) {
  const conditions = ["event_date = ?", "status <> 'rejected'"];
  const params = [date];

  if (town && town !== 'الكل') {
    conditions.push('town = ?');
    params.push(town);
  }

  return db.query(
    `SELECT id, title, groom_name, family_clan, town, location_name, event_date, dinner_time
       FROM events
      WHERE ${conditions.join(' AND ')}
      ORDER BY town ASC`,
    params
  );
}

async function addReaction(eventId, reactionType, userIdentifier) {
  const event = await db.queryOne('SELECT id FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  await db.execute(
    'INSERT INTO reactions (event_id, reaction_type, user_identifier) VALUES (?, ?, ?)',
    [eventId, reactionType, userIdentifier || 'guest']
  );
}

async function addCongratulation(eventId, { sender_name, badge_title, message, sticker_url }) {
  const event = await db.queryOne('SELECT id FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  const badge = badge_title || 'صديق العريس';
  const { insertId } = await db.execute(
    `INSERT INTO congratulations (event_id, sender_name, badge_title, message, sticker_url)
     VALUES (?, ?, ?, ?, ?)`,
    [eventId, sender_name, badge, message, sticker_url]
  );

  return {
    id: insertId,
    event_id: eventId,
    sender_name,
    badge_title: badge,
    message,
    sticker_url: sticker_url || null,
    created_at: new Date().toISOString()
  };
}

/** Per-town counts of approved events, for the filter chips. */
async function townStats() {
  return db.query(
    `SELECT town, COUNT(*) AS events_count
       FROM events
      WHERE status = 'approved'
      GROUP BY town
      ORDER BY events_count DESC`
  );
}

module.exports = {
  listPublicEvents,
  getEventDetails,
  listMapPoints,
  listStories,
  createEvent,
  findCollisions,
  addReaction,
  addCongratulation,
  townStats
};
