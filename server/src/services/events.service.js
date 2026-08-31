'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const occasionTypes = require('./occasionTypes.service');
const { REACTION_TYPES, TOWN_COORDINATES } = require('../constants');
const { withAbsoluteMedia } = require('../utils/mediaUrl');

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

/** Groups honorees by event id, ordered by position: { [eventId]: [{ name, role, position }] }. */
async function honoreesForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, name, role, position FROM event_honorees
      WHERE event_id IN (${placeholders})
      ORDER BY event_id ASC, position ASC`,
    eventIds
  );

  const map = {};
  for (const row of rows) {
    (map[row.event_id] || (map[row.event_id] = [])).push({ name: row.name, role: row.role, position: row.position });
  }
  return map;
}

/** Attaches honorees and occasion-type info to a list of raw event rows (media already made absolute). */
async function attachHonoreesAndTypes(rows) {
  if (!rows.length) return [];

  const [honoreeMap, typeMap] = await Promise.all([
    honoreesForEvents(rows.map(row => row.id)),
    occasionTypes.getTypesByIds(rows.map(row => row.occasion_type_id))
  ]);

  return rows.map(row => ({
    ...row,
    honorees: honoreeMap[row.id] || [],
    occasion_type: row.occasion_type_id ? (typeMap[row.occasion_type_id] || null) : null
  }));
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
    // The EXISTS subquery (not a JOIN) is deliberate: a JOIN against the 1..N
    // event_honorees table would return one row per matching honoree, i.e.
    // the same event several times over.
    conditions.push(
      `(groom_name LIKE ? ESCAPE '\\\\' OR family_clan LIKE ? ESCAPE '\\\\'
        OR title LIKE ? ESCAPE '\\\\' OR location_name LIKE ? ESCAPE '\\\\'
        OR town LIKE ? ESCAPE '\\\\'
        OR EXISTS (
             SELECT 1 FROM event_honorees eh
              WHERE eh.event_id = events.id AND eh.name LIKE ? ESCAPE '\\\\'
           ))`
    );
    const term = `%${escapeLike(search)}%`;
    params.push(term, term, term, term, term, term);
  }

  const rows = await db.query(
    `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY event_date ASC, id ASC`,
    params
  );

  const reactionMap = await reactionsForEvents(rows.map(e => e.id));
  const withRelations = await attachHonoreesAndTypes(rows.map(withAbsoluteMedia));
  return withRelations.map(event => ({
    ...event,
    reactions: reactionMap[event.id] || EMPTY_REACTIONS()
  }));
}

/** A single event with its reactions and congratulations. View count is bumped. */
async function getEventDetails(eventId) {
  const event = await db.queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  await db.execute('UPDATE events SET views_count = views_count + 1 WHERE id = ?', [eventId]);

  const [congratulations, reactionRows, [withRelations]] = await Promise.all([
    db.query('SELECT * FROM congratulations WHERE event_id = ? ORDER BY created_at DESC', [eventId]),
    db.query(
      'SELECT reaction_type, COUNT(*) AS count FROM reactions WHERE event_id = ? GROUP BY reaction_type',
      [eventId]
    ),
    attachHonoreesAndTypes([withAbsoluteMedia(event)])
  ]);

  const reactions = EMPTY_REACTIONS();
  for (const row of reactionRows) reactions[row.reaction_type] = Number(row.count);

  return {
    ...withRelations,
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
    ...withAbsoluteMedia(row),
    waze_url: `https://waze.com/ul?ll=${row.latitude},${row.longitude}&navigate=yes`
  }));
}

async function listStories() {
  const rows = await db.query('SELECT * FROM stories ORDER BY is_live DESC, id ASC');
  // The UI reads `isLive`; keep `is_live` too so API consumers see the raw column.
  return rows.map(row => ({ ...withAbsoluteMedia(row), isLive: Boolean(row.is_live) }));
}

/**
 * Builds the default title when the publisher leaves it blank. Derived from
 * the occasion type's own name and its honorees' names — never a hardcoded
 * "زفاف/فرح" string — so a funeral never inherits wedding wording (#11).
 */
function buildDefaultTitle(occasionTypeName, honorees, familyClan, town) {
  const names = honorees.map(h => h.name).join(' و ');
  const place = familyClan || town;
  const prefix = occasionTypeName ? `${occasionTypeName} ` : '';
  return `${prefix}${names}${place ? ` — ${place}` : ''}`.trim();
}

/**
 * Creates an event plus its honorees in one transaction — either both rows
 * exist or neither does, so a published card is never missing the names it
 * exists to display. `groom_name` (kept for every old client that still
 * reads it) is derived from the first honoree by `position`, written in the
 * same transaction rather than a follow-up job. Admins publish immediately;
 * everyone else lands in the moderation queue.
 */
async function createEvent(data, { autoApprove = false, createdBy = null } = {}) {
  const coords = TOWN_COORDINATES[data.town] || {};
  const latitude = data.latitude ?? coords.lat ?? null;
  const longitude = data.longitude ?? coords.lng ?? null;
  const status = autoApprove ? 'approved' : 'pending';

  // A field the route silently dropped (hidden for this occasion type) is
  // simply absent from `data` — `undefined`, not `null`. The raw connection
  // used inside a transaction skips pool.js's normalise(), and mysql2 rejects
  // an `undefined` bind value outright, so every optional column is coerced
  // to `null` right here.
  const secondaryLocationName = data.secondary_location_name ?? null;
  const eventEndDate = data.event_end_date ?? null;
  const youthPartyDate = data.youth_party_date ?? null;
  const audioUrl = data.audio_url ?? null;
  const hostPhone = data.host_phone ?? null;

  return db.transaction(async connection => {
    const groomName = data.honorees[0].name;
    const familyClan = data.family_clan || `آل ${groomName.split(' ').slice(-1)[0]}`;
    const title = data.title || buildDefaultTitle(data.occasionTypeName, data.honorees, familyClan, data.town);
    // audio_title only ever defaults when there is actually an audio clip to
    // name — otherwise every event, funerals included, would silently pick
    // up a "شيلة الفرح" (wedding song) label it never asked for.
    const audioTitle = audioUrl ? (data.audio_title || 'مقطع صوتي مرفق') : null;

    const [result] = await connection.execute(
      `INSERT INTO events
         (title, groom_name, family_clan, occasion_type_id, town, location_name, secondary_location_name,
          latitude, longitude, event_date, event_end_date, youth_party_date, dinner_time, poster_url,
          audio_url, audio_title, host_phone, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        groomName,
        familyClan,
        data.occasion_type_id,
        data.town,
        // No column default exists for this NOT NULL text column; an
        // occasion type may leave it optional, so a blank submission still
        // needs a safe placeholder instead of a raw SQL NULL violation.
        data.location_name || 'سيُحدَّد لاحقاً',
        secondaryLocationName,
        latitude,
        longitude,
        data.event_date,
        eventEndDate,
        youthPartyDate,
        data.dinner_time || 'الساعة 8:00 مساءً',
        // The default image belongs to the occasion type: a celebration type
        // carries one, عزا carries none, and neither is decided here by name.
        data.poster_url || data.default_poster_url || null,
        audioUrl,
        audioTitle,
        hostPhone,
        status,
        createdBy
      ]
    );
    const eventId = result.insertId;

    let position = 0;
    for (const honoree of data.honorees) {
      await connection.execute(
        'INSERT INTO event_honorees (event_id, name, role, position) VALUES (?, ?, ?, ?)',
        [eventId, honoree.name, honoree.role, position]
      );
      position += 1;
    }

    return { id: eventId, title, status, groom_name: groomName, town: data.town, event_date: data.event_date };
  });
}

/** Columns an amendment to this event that touches the map/schedule the public relies on forces re-review. */
const CRITICAL_AMENDMENT_FIELDS = ['event_date', 'event_end_date', 'town', 'location_name', 'latitude', 'longitude'];

/**
 * Classifies a set of changed column names as 'critical' (event returns to
 * `pending`) or 'cosmetic' (stays `approved`). Kept as one small, reusable,
 * DB-free function so the amendment-log step planned next can call it
 * without duplicating the rule.
 */
function classifyAmendment(changedColumns) {
  return changedColumns.some(column => CRITICAL_AMENDMENT_FIELDS.includes(column)) ? 'critical' : 'cosmetic';
}

/** Fetches an event row for an ownership check / edit diff, or throws 404. */
async function getEventForEdit(eventId) {
  const event = await db.queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');
  return event;
}

/**
 * Applies a partial edit. `changes` holds only the columns the route already
 * cleaned and confirmed differ from `existing`; `honorees`, when present,
 * fully replaces event_honorees and re-derives groom_name — in the same
 * transaction as the event row update, same invariant as createEvent. A
 * critical column change drops an approved event back to pending; honoree
 * spelling edits are always cosmetic, per the domain's own classification.
 */
async function updateEvent(eventId, existing, { changes = {}, honorees = null } = {}) {
  // Only columns whose value actually differs count towards the
  // classification — a form resubmitting today's already-approved date
  // must not bounce the event back into moderation for no reason.
  const changedColumns = Object.keys(changes).filter(
    column => String(existing[column] ?? '') !== String(changes[column] ?? '')
  );
  const amendment = classifyAmendment(changedColumns);
  const nextStatus = amendment === 'critical' && existing.status === 'approved' ? 'pending' : existing.status;

  await db.transaction(async connection => {
    const assignments = [];
    const params = [];
    for (const [column, value] of Object.entries(changes)) {
      assignments.push(`${column} = ?`);
      params.push(value);
    }
    if (nextStatus !== existing.status) {
      assignments.push('status = ?');
      params.push(nextStatus);
    }

    if (honorees !== null) {
      await connection.execute('DELETE FROM event_honorees WHERE event_id = ?', [eventId]);
      let position = 0;
      for (const honoree of honorees) {
        await connection.execute(
          'INSERT INTO event_honorees (event_id, name, role, position) VALUES (?, ?, ?, ?)',
          [eventId, honoree.name, honoree.role, position]
        );
        position += 1;
      }
      assignments.push('groom_name = ?');
      params.push(honorees[0].name);
    }

    if (assignments.length) {
      params.push(eventId);
      await connection.execute(`UPDATE events SET ${assignments.join(', ')} WHERE id = ?`, params);
    }
  });

  return { amendment, status: nextStatus };
}

/** Everything a given user has published, any status — the "my events" screen ownership implies. */
async function listMyEvents(userId) {
  const rows = await db.query('SELECT * FROM events WHERE created_by = ? ORDER BY created_at DESC', [userId]);
  return attachHonoreesAndTypes(rows.map(withAbsoluteMedia));
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
  getEventForEdit,
  updateEvent,
  classifyAmendment,
  listMyEvents,
  findCollisions,
  addReaction,
  addCongratulation,
  townStats
};
