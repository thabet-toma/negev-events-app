'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const occasionTypes = require('./occasionTypes.service');
const { REACTION_TYPES, TOWN_COORDINATES, CONGRATULATION_REPORT_THRESHOLD } = require('../constants');
const { withAbsoluteMedia, absoluteMediaUrl } = require('../utils/mediaUrl');
const { haversineDistanceKm } = require('../utils/geo');

const EMPTY_REACTIONS = () => REACTION_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});

/** Default and hard-ceiling page sizes for `GET /api/events` (#20 step 4, decision ب). */
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

/**
 * Columns the public list actually needs — a card's fields plus whatever the
 * relations/filtering steps below need (`occasion_type_id`, `event_end_date`).
 * `secondary_location_name`, `created_by`, `updated_at` and `status` are
 * dropped: no client displays them from this endpoint. `GET /api/events/:id`
 * is unaffected and still returns every column (#20 step 4, decision هـ).
 */
const LIST_COLUMNS = [
  'events.id', 'events.title', 'events.groom_name', 'events.family_clan', 'events.occasion_type_id',
  'events.town', 'events.village_id', 'events.location_name',
  'events.latitude', 'events.longitude', 'events.event_date', 'events.event_end_date', 'events.youth_party_date',
  'events.dinner_time', 'events.poster_url', 'events.audio_url', 'events.audio_title',
  'events.artist_name', 'events.artist_image_url', 'events.host_phone', 'events.views_count'
].join(', ');

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

/**
 * Groups congratulation count + newest one by event id, in a single query:
 * { [eventId]: { congratulations_count, latest_congratulation: { sender_name, message, created_at } } }.
 * One window-function pass over `congratulations` (COUNT as a partition
 * aggregate, ROW_NUMBER to pick the newest row per event) instead of a JOIN
 * that would multiply event rows by their congratulation count (#20 step 4,
 * decision د).
 */
async function congratulationsForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, sender_name, message, created_at, cnt
       FROM (
         SELECT event_id, sender_name, message, created_at,
                ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at DESC, id DESC) AS rn,
                COUNT(*) OVER (PARTITION BY event_id) AS cnt
           FROM congratulations
          WHERE event_id IN (${placeholders}) AND status = 'approved'
       ) ranked
      WHERE rn = 1`,
    eventIds
  );

  const map = {};
  for (const row of rows) {
    map[row.event_id] = {
      congratulations_count: Number(row.cnt),
      latest_congratulation: { sender_name: row.sender_name, message: row.message, created_at: row.created_at }
    };
  }
  return map;
}

/** Groups follower counts by event id: { [eventId]: count }. */
async function followersCountsForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, COUNT(*) AS count FROM event_reminders
      WHERE event_id IN (${placeholders})
      GROUP BY event_id`,
    eventIds
  );

  const map = {};
  for (const row of rows) map[row.event_id] = Number(row.count);
  return map;
}

/** Which of these events the given user has an active "ذكّرني" on — empty for an anonymous caller. */
async function remindedEventIdsForUser(userId, eventIds) {
  if (!userId || !eventIds.length) return new Set();

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id FROM event_reminders WHERE user_id = ? AND event_id IN (${placeholders})`,
    [userId, ...eventIds]
  );
  return new Set(rows.map(row => row.event_id));
}

/**
 * Attaches `is_reminded` (always) and `followers_count` (only when the
 * event's occasion type has `show_followers_count` on — absent entirely
 * otherwise, never zero, since a hidden count must not be inferable from a
 * suspicious zero) to a list of events already carrying `occasion_type`.
 */
async function attachReminderState(events, userId) {
  if (!events.length) return events;

  const eventIds = events.map(event => event.id);
  const [followersMap, remindedSet] = await Promise.all([
    followersCountsForEvents(eventIds),
    remindedEventIdsForUser(userId, eventIds)
  ]);

  return events.map(event => {
    const shaped = { ...event, is_reminded: remindedSet.has(event.id) };
    if (event.occasion_type?.show_followers_count !== false) {
      shaped.followers_count = followersMap[event.id] || 0;
    }
    return shaped;
  });
}

/** Toggles a "ذكّرني" on — a follow, not an RSVP. Re-pressing an active reminder is a silent no-op (UNIQUE key). */
async function setReminder(eventId, userId) {
  const event = await db.queryOne('SELECT id FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  try {
    await db.execute('INSERT INTO event_reminders (user_id, event_id) VALUES (?, ?)', [userId, eventId]);
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  }
}

async function removeReminder(eventId, userId) {
  await db.execute('DELETE FROM event_reminders WHERE user_id = ? AND event_id = ?', [userId, eventId]);
}

/** Every event this user is following, newest reminder first. */
async function listMyReminders(userId) {
  const rows = await db.query(
    `SELECT e.* FROM event_reminders r
       JOIN events e ON e.id = r.event_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC`,
    [userId]
  );
  const withRelations = await attachHonoreesAndTypes(rows.map(withAbsoluteMedia));
  return attachReminderState(withRelations, userId);
}

/**
 * Live date-change announcements (#20 step 7): the current one per event,
 * still relevant (its event hasn't finished), shaped as a card pointing back
 * at the original event. `legacyOnly` applies the same occasion-type filter
 * as the list/map/detail endpoints — an announcement about a type an old
 * client cannot render must not leak through this door either.
 */
async function listLiveAnnouncements({ legacyOnly = false } = {}) {
  const conditions = [
    'a.is_current = 1', "e.status = 'approved'",
    'COALESCE(e.event_end_date, e.event_date) >= CURDATE()'
  ];
  const params = [];

  if (legacyOnly) {
    const legacyTypeIds = await occasionTypes.getLegacyTypeIds();
    if (!legacyTypeIds.length) return [];
    conditions.push(`e.occasion_type_id IN (${legacyTypeIds.map(() => '?').join(',')})`);
    params.push(...legacyTypeIds);
  }

  const rows = await db.query(
    `SELECT a.id, a.event_id, a.old_value, a.new_value, a.published_at,
            e.title, e.groom_name, e.town, e.event_date, e.event_end_date,
            e.occasion_type_id, e.poster_url
       FROM event_announcements a
       JOIN events e ON e.id = a.event_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.published_at DESC`,
    params
  );

  return rows.map(row => {
    const media = withAbsoluteMedia(row);
    return {
      id: row.id,
      event_id: row.event_id,
      old_value: row.old_value,
      new_value: row.new_value,
      published_at: row.published_at,
      event: {
        id: row.event_id,
        title: row.title,
        groom_name: row.groom_name,
        town: row.town,
        event_date: row.event_date,
        event_end_date: row.event_end_date,
        occasion_type_id: row.occasion_type_id,
        poster_url: media.poster_url
      }
    };
  });
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

/**
 * Approved events, optionally filtered by town, date, occasion type and
 * free-text search — paginated, upcoming-first (or archived-first when
 * `archive` is set), with per-card congratulation stats attached.
 *
 * `archive`: false (default) shows only what has not finished yet —
 * `COALESCE(event_end_date, event_date) >= CURDATE()`, so a multi-day عزا
 * that started yesterday still shows today. `archive: true` flips to what
 * already ended, newest-ended first, reached only on explicit request so it
 * never crowds out what's upcoming (#20 step 4, decision أ).
 *
 * `legacyOnly` forces the result to the occasion types a client with no
 * `X-App-Version` header understands, overriding any `occasionTypeId` filter
 * — that filter is a tab a legacy client's UI cannot even render (#20 step 4,
 * decision و).
 */
async function listPublicEvents({
  town, date, search, occasionTypeId = null, villageId = null, legacyOnly = false, archive = false,
  page = 1, limit = DEFAULT_PAGE_SIZE, userId = null
} = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);

  const conditions = ["status = 'approved'"];
  const params = [];

  conditions.push(archive
    ? 'COALESCE(event_end_date, event_date) < CURDATE()'
    : 'COALESCE(event_end_date, event_date) >= CURDATE()');

  if (legacyOnly) {
    // A client that does not announce itself only ever sees the types a
    // published build knows how to render. None marked means none sent —
    // silence beats a funeral drawn as a wedding.
    const legacyTypeIds = await occasionTypes.getLegacyTypeIds();
    if (!legacyTypeIds.length) {
      return { events: [], pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 } };
    }
    conditions.push(`occasion_type_id IN (${legacyTypeIds.map(() => '?').join(',')})`);
    params.push(...legacyTypeIds);
  } else if (occasionTypeId) {
    conditions.push('occasion_type_id = ?');
    params.push(occasionTypeId);
  }

  if (town && town !== 'الكل') {
    conditions.push('town = ?');
    params.push(town);
  }

  if (villageId) {
    conditions.push('events.village_id = ?');
    params.push(villageId);
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

  const whereClause = conditions.join(' AND ');

  const { total } = await db.queryOne(`SELECT COUNT(*) AS total FROM events WHERE ${whereClause}`, params);

  const offset = (safePage - 1) * safeLimit;
  const orderClause = archive ? 'event_date DESC, id DESC' : 'event_date ASC, id ASC';

  // LIMIT/OFFSET as bound parameters, not string-concatenated — same
  // parameterization rule as every other value in this query. `village_name`
  // is joined in, never stored on `events` itself — a village is a place
  // `village_id` merely points at.
  const rows = await db.query(
    `SELECT ${LIST_COLUMNS}, villages.name AS village_name
       FROM events
       LEFT JOIN villages ON villages.id = events.village_id
      WHERE ${whereClause} ORDER BY ${orderClause} LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  const eventIds = rows.map(e => e.id);
  const [reactionMap, congratsMap, withRelations] = await Promise.all([
    reactionsForEvents(eventIds),
    congratulationsForEvents(eventIds),
    attachHonoreesAndTypes(rows.map(withAbsoluteMedia))
  ]);

  const events = withRelations.map(event => {
    const shaped = { ...event, reactions: reactionMap[event.id] || EMPTY_REACTIONS() };

    // Hidden by type flag, not by name — the counter/preview never appears
    // for an occasion type whose admin turned it off (#20 step 4, decision د).
    if (event.occasion_type?.show_congratulations_count !== false) {
      const congrats = congratsMap[event.id] || { congratulations_count: 0, latest_congratulation: null };
      shaped.congratulations_count = congrats.congratulations_count;
      shaped.latest_congratulation = congrats.latest_congratulation;
    }
    return shaped;
  });

  const withReminderState = await attachReminderState(events, userId);

  return {
    events: withReminderState,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / safeLimit)
    }
  };
}

/**
 * A single event with its reactions and congratulations. View count is
 * bumped. `legacyOnly` (no `X-App-Version` header) 404s an occasion type the
 * caller cannot render, instead of handing it data it would mislabel — the
 * same wedding-only understanding `listPublicEvents`/`listMapPoints` apply
 * (#20 step 4, decision و).
 *
 * Congratulations returned here are every `approved` row plus, when `userId`
 * is set, that same caller's own still-`pending` rows — the sender sees
 * their own submission tagged as pending, nobody else does (#20 step 5,
 * decision 4). A pending/hidden row belonging to someone else, and the full
 * moderation queue, are what `GET /events/:id/congratulations` is for.
 */
async function getEventDetails(eventId, { legacyOnly = false, userId = null } = {}) {
  const event = await db.queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  if (legacyOnly) {
    const legacyTypeIds = await occasionTypes.getLegacyTypeIds();
    if (!legacyTypeIds.includes(event.occasion_type_id)) {
      throw ApiError.notFound('هذه المناسبة تحتاج نسخة أحدث من التطبيق');
    }
  }

  await db.execute('UPDATE events SET views_count = views_count + 1 WHERE id = ?', [eventId]);

  const [congratulations, reactionRows, [withRelations]] = await Promise.all([
    db.query(
      `SELECT * FROM congratulations
        WHERE event_id = ? AND (status = 'approved' OR (user_id = ? AND status = 'pending'))
        ORDER BY created_at DESC`,
      [eventId, userId]
    ),
    db.query(
      'SELECT reaction_type, COUNT(*) AS count FROM reactions WHERE event_id = ? GROUP BY reaction_type',
      [eventId]
    ),
    attachHonoreesAndTypes([withAbsoluteMedia(event)])
  ]);

  const reactions = EMPTY_REACTIONS();
  for (const row of reactionRows) reactions[row.reaction_type] = Number(row.count);

  const [withReminderState] = await attachReminderState([withRelations], userId);

  return {
    ...withReminderState,
    views_count: event.views_count + 1,
    reactions,
    congratulations: congratulations.map(withAbsoluteMedia)
  };
}

/**
 * Approved, upcoming events that carry coordinates, shaped for the map view.
 * Same upcoming cutoff and legacy-client type filter as `listPublicEvents`
 * (#20 step 4, decisions أ and و).
 */
async function listMapPoints({ legacyOnly = false } = {}) {
  const conditions = [
    "status = 'approved'", 'latitude IS NOT NULL', 'longitude IS NOT NULL',
    'COALESCE(event_end_date, event_date) >= CURDATE()'
  ];
  const params = [];

  if (legacyOnly) {
    const legacyTypeIds = await occasionTypes.getLegacyTypeIds();
    if (!legacyTypeIds.length) return [];
    conditions.push(`occasion_type_id IN (${legacyTypeIds.map(() => '?').join(',')})`);
    params.push(...legacyTypeIds);
  }

  const rows = await db.query(
    `SELECT id, title, groom_name, town, event_date, location_name, poster_url, latitude, longitude
       FROM events
      WHERE ${conditions.join(' AND ')}
      ORDER BY event_date ASC`,
    params
  );

  return rows.map(row => ({
    ...withAbsoluteMedia(row),
    waze_url: `https://waze.com/ul?ll=${row.latitude},${row.longitude}&navigate=yes`
  }));
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

/** The Negev town whose centre sits closest to a coordinate pair — 'القرى والتجمعات' has none, so it can never win. */
function nearestTownTo(latitude, longitude) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const [town, coords] of Object.entries(TOWN_COORDINATES)) {
    const distance = haversineDistanceKm({ lat: latitude, lng: longitude }, coords);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = town;
    }
  }
  return nearest;
}

/**
 * Soft mismatch check (#20 step 6, decision ٦), run on publish and on edit.
 * A wedding hall commonly sits outside its own town's boundary, and the town
 * is a social identity as much as a place — so a pin nearer another town's
 * centre only ever warns; it never rejects the submission or rewrites the
 * town the publisher chose. Returns `null` when there is nothing to warn
 * about (no explicit coordinate, or it agrees with the chosen town).
 */
function checkTownMismatch(town, latitude, longitude) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return null;
  }
  const nearest = nearestTownTo(latitude, longitude);
  if (!nearest || nearest === town) return null;
  return {
    nearest_town: nearest,
    message: `المكان الذي حدّدته على الخريطة أقرب إلى بلدة "${nearest}" منه إلى "${town}" — تم الحفظ بالبلدة التي اخترتها كما هي`
  };
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
  // `TOWN_COORDINATES` has no entry for the villages catch-all — `data.villageCoords`
  // (the chosen village's own lat/lng, looked up by the route) fills that gap
  // the exact same way a real town's centre does, so a village event gets a
  // correct pin on every published client with no query-time logic at all.
  const coords = TOWN_COORDINATES[data.town] || data.villageCoords || {};
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
  const villageId = data.village_id ?? null;
  const artistName = data.artist_name ?? null;
  const artistImageUrl = data.artist_image_url ?? null;

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
         (title, groom_name, family_clan, occasion_type_id, town, village_id, location_name, secondary_location_name,
          latitude, longitude, event_date, event_end_date, youth_party_date, dinner_time, poster_url,
          audio_url, audio_title, artist_name, artist_image_url, host_phone, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        groomName,
        familyClan,
        data.occasion_type_id,
        data.town,
        villageId,
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
        artistName,
        artistImageUrl,
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
const CRITICAL_AMENDMENT_FIELDS = ['event_date', 'event_end_date', 'town', 'village_id', 'location_name', 'latitude', 'longitude'];

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
 *
 * Every column that actually changed also gets an event_amendments row, in
 * the same transaction as the event write — either both exist or neither
 * does, so the log is never read as complete when it silently isn't. Each
 * row is classified on its own field (`classifyAmendment([column])`, the
 * same function reused rather than a second rule) so a cosmetic field
 * travelling alongside a critical one in one request is still logged
 * `approved` immediately — it never went through review either.
 */
async function updateEvent(eventId, existing, { changes = {}, honorees = null, changedBy = null } = {}) {
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

    for (const column of changedColumns) {
      const fieldClassification = classifyAmendment([column]);
      const rowStatus = fieldClassification === 'critical' ? 'pending' : 'approved';
      const oldValue = existing[column];
      const newValue = changes[column];
      await connection.execute(
        `INSERT INTO event_amendments (event_id, field, old_value, new_value, changed_by, classification, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          column,
          oldValue === null || oldValue === undefined ? null : String(oldValue),
          newValue === null || newValue === undefined ? null : String(newValue),
          changedBy,
          fieldClassification,
          rowStatus
        ]
      );
    }
  });

  // A critical edit that moves the date or the town has to be re-checked on
  // the values it lands on, not the ones it was created with — otherwise the
  // collision check stays frozen at publish time (#20 step 3, decision 5).
  let collision = null;
  if (amendment === 'critical' && ('event_date' in changes || 'town' in changes)) {
    const checkDate = 'event_date' in changes ? changes.event_date : existing.event_date;
    const checkEndDate = 'event_end_date' in changes ? changes.event_end_date : existing.event_end_date;
    const checkTown = 'town' in changes ? changes.town : existing.town;
    const conflicts = await findCollisions({
      date: checkDate,
      endDate: checkEndDate,
      town: checkTown,
      occasionTypeId: existing.occasion_type_id,
      excludeEventId: eventId
    });
    collision = { hasCollision: conflicts.length > 0, count: conflicts.length, conflicts };
  }

  return { amendment, status: nextStatus, collision };
}

/** Every logged change to this event, newest first, with the name of who made it. */
async function listAmendments(eventId) {
  return db.query(
    `SELECT a.id, a.event_id, a.field, a.old_value, a.new_value, a.classification, a.status, a.created_at,
            u.full_name AS changed_by_name
       FROM event_amendments a
       LEFT JOIN users u ON u.id = a.changed_by
      WHERE a.event_id = ?
      ORDER BY a.created_at DESC, a.id DESC`,
    [eventId]
  );
}

/** Everything a given user has published, any status — the "my events" screen ownership implies. */
async function listMyEvents(userId) {
  const rows = await db.query('SELECT * FROM events WHERE created_by = ? ORDER BY created_at DESC', [userId]);
  return attachHonoreesAndTypes(rows.map(withAbsoluteMedia));
}

/**
 * Events whose date range overlaps the given range (optionally within one
 * town) — an end-less event is a one-day range, via COALESCE(event_end_date,
 * event_date) on both sides of the intersection test, so a wedding landing
 * on day two of a four-day عزا is still caught (#20 step 3, decision 4/9).
 *
 * Direction is read off the occasion types themselves, never off a type's
 * name: `occasionTypeId` (the event asking) must have `creates_collision`
 * or the check is skipped outright — a عزا asking never gets a warning,
 * because a death is never rescheduled around another death. Every match
 * returned must have `warns_others` — a عزا never checks, but it always
 * counts as a conflict when something else (typically a عرس) checks against
 * it. A caller with no `occasionTypeId` (the pre-#20 request shape) gets the
 * old, type-blind behaviour untouched — any non-rejected overlap counts.
 */
async function findCollisions({ date, endDate = null, town = null, occasionTypeId = null, excludeEventId = null }) {
  if (occasionTypeId) {
    const type = await occasionTypes.getTypeById(occasionTypeId);
    if (!type || !type.creates_collision) return [];
  }

  const rangeEnd = endDate || date;
  const conditions = ["e.status <> 'rejected'", 'e.event_date <= ?', 'COALESCE(e.event_end_date, e.event_date) >= ?'];
  const params = [rangeEnd, date];

  if (town && town !== 'الكل') {
    conditions.push('e.town = ?');
    params.push(town);
  }
  if (excludeEventId) {
    conditions.push('e.id <> ?');
    params.push(excludeEventId);
  }
  if (occasionTypeId) {
    conditions.push('ot.warns_others = 1');
  }

  return db.query(
    `SELECT e.id, e.title, e.groom_name, e.family_clan, e.town, e.location_name,
            e.event_date, e.event_end_date, e.dinner_time
       FROM events e
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.town ASC, e.event_date ASC`,
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

/**
 * Writes a congratulation/تعزية. Status is decided by the occasion type's own
 * `premoderate_messages` flag, never by name — عزا carries it today, nothing
 * else does (#20 step 5, decision ٢). The badge falls back to the type's own
 * `default_badge_title`, and to an empty string (never a festive placeholder
 * like the old hardcoded 'صديق العريس') when the type has none — `badge_title`
 * stays NOT NULL in the schema on purpose (an already-published APK reads
 * it), so "no badge" is an empty string, not NULL (#20 step 5, decision ٨).
 */
async function addCongratulation(eventId, { userId, senderName, badgeTitleOverride, message, stickerUrl }) {
  const event = await db.queryOne('SELECT id, occasion_type_id FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  const type = event.occasion_type_id ? await occasionTypes.getTypeById(event.occasion_type_id) : null;
  const status = type?.premoderate_messages ? 'pending' : 'approved';
  const badge = badgeTitleOverride || type?.default_badge_title || '';

  const { insertId } = await db.execute(
    `INSERT INTO congratulations (event_id, sender_name, badge_title, message, sticker_url, user_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eventId, senderName, badge, message, stickerUrl, userId, status]
  );

  return {
    id: insertId,
    event_id: eventId,
    sender_name: senderName,
    badge_title: badge,
    message,
    sticker_url: stickerUrl || null,
    status,
    user_id: userId,
    reports_count: 0,
    created_at: new Date().toISOString()
  };
}

/** Every congratulation on an event, optionally filtered by status — the owner/admin moderation queue. */
async function listCongratulationsForModeration(eventId, status = null) {
  const rows = status
    ? await db.query(
      'SELECT * FROM congratulations WHERE event_id = ? AND status = ? ORDER BY created_at DESC',
      [eventId, status]
    )
    : await db.query('SELECT * FROM congratulations WHERE event_id = ? ORDER BY created_at DESC', [eventId]);
  return rows.map(withAbsoluteMedia);
}

/** Fetches a single congratulation scoped to its event, or null — used to check who last moderated it before an owner is allowed to lift a hide. */
async function getCongratulationById(eventId, congratulationId) {
  return db.queryOne('SELECT * FROM congratulations WHERE id = ? AND event_id = ?', [congratulationId, eventId]);
}

/**
 * A human review decision — approve or reject — always recorded with who and
 * when. There is no 'rejected' status in this domain (only pending/approved/
 * hidden), so 'reject' lands on 'hidden': not shown to anyone, same outcome
 * as an auto-hide from reports, but this one was a deliberate human call.
 */
async function moderateCongratulation(eventId, congratulationId, { action, moderatedBy }) {
  const nextStatus = action === 'approve' ? 'approved' : 'hidden';
  const { affectedRows } = await db.execute(
    `UPDATE congratulations SET status = ?, moderated_by = ?, moderated_at = NOW()
      WHERE id = ? AND event_id = ?`,
    [nextStatus, moderatedBy, congratulationId, eventId]
  );
  if (!affectedRows) throw ApiError.notFound('التعليق غير موجود');

  return db.queryOne('SELECT * FROM congratulations WHERE id = ?', [congratulationId]);
}

/** The owner or admin deletes a congratulation on their own event — an ownership right, in every occasion type. */
async function deleteCongratulation(eventId, congratulationId) {
  const { affectedRows } = await db.execute(
    'DELETE FROM congratulations WHERE id = ? AND event_id = ?',
    [congratulationId, eventId]
  );
  if (!affectedRows) throw ApiError.notFound('التعليق غير موجود');
}

/**
 * Records one report (the UNIQUE key on congratulation_reports rejects a
 * second report from the same person outright) and, past the threshold,
 * auto-hides the message — but only one nobody has reviewed yet. A message a
 * human already approved on purpose (`moderated_by` set) is left alone:
 * reports are a substitute for review, not a veto over a review that already
 * happened, otherwise a pile-on could silence something a human already
 * judged fine (#20 step 5, decision ٩).
 */
async function reportCongratulation(eventId, congratulationId, userId) {
  return db.transaction(async connection => {
    const [rows] = await connection.execute(
      'SELECT id, status, moderated_by FROM congratulations WHERE id = ? AND event_id = ?',
      [congratulationId, eventId]
    );
    if (!rows.length) throw ApiError.notFound('التعليق غير موجود');

    try {
      await connection.execute(
        'INSERT INTO congratulation_reports (congratulation_id, user_id) VALUES (?, ?)',
        [congratulationId, userId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw ApiError.conflict('لقد أبلغت عن هذه الرسالة مسبقاً');
      throw err;
    }

    await connection.execute(
      'UPDATE congratulations SET reports_count = reports_count + 1 WHERE id = ?',
      [congratulationId]
    );

    const [updatedRows] = await connection.execute(
      'SELECT reports_count, status, moderated_by FROM congratulations WHERE id = ?',
      [congratulationId]
    );
    const updated = updatedRows[0];

    let status = updated.status;
    if (updated.reports_count >= CONGRATULATION_REPORT_THRESHOLD && status === 'approved' && updated.moderated_by === null) {
      await connection.execute("UPDATE congratulations SET status = 'hidden' WHERE id = ?", [congratulationId]);
      status = 'hidden';
    }

    return { reports_count: updated.reports_count, status };
  });
}

/**
 * The one row the shareable event page (`GET /e/:id`) needs — nothing else,
 * since that page deliberately shows only a poster, the honoree names and a
 * download button (server/src/routes/share.routes.js). Returns `null` for a
 * non-`approved` status or a non-existent id alike: the route must not be
 * able to tell those two apart from this function's result, any more than
 * from its own response. `is_expired` reuses the exact
 * `COALESCE(event_end_date, event_date) < CURDATE()` idiom every other
 * upcoming/archive query in this file uses, computed in SQL rather than by a
 * second, JS-side copy of the same rule.
 *
 * `updated_at` is selected for one more reason beyond display: it is the
 * cache key `shareCard.service.js` renders the OG card under, so an edited
 * event gets a new card automatically — no explicit cache-invalidation call
 * anywhere else in the codebase.
 */
async function getShareEvent(eventId) {
  const row = await db.queryOne(
    `SELECT events.id, events.title, events.family_clan, events.poster_url, events.town,
            events.updated_at,
            occasion_types.name AS occasion_type_name,
            occasion_types.tone AS occasion_type_tone,
            occasion_types.icon AS occasion_type_icon,
            occasion_types.color AS occasion_type_colour,
            occasion_types.default_poster_url AS occasion_type_poster_url,
            (COALESCE(events.event_end_date, events.event_date) < CURDATE()) AS is_expired
       FROM events
       LEFT JOIN occasion_types ON occasion_types.id = events.occasion_type_id
      WHERE events.id = ? AND events.status = 'approved'`,
    [eventId]
  );
  if (!row) return null;

  const honoreeMap = await honoreesForEvents([eventId]);
  // Media leaves this layer absolute, like every other query here (ADR-0002).
  // withAbsoluteMedia covers the row's own poster_url; the occasion type's
  // default poster is a joined column, not one of MEDIA_FIELDS, so it is
  // converted explicitly rather than by widening that list — the list
  // describes an event row's own media, and this column belongs to another
  // table entirely. The route does no URL work beyond the fallback constant.
  const absolute = withAbsoluteMedia(row);
  return {
    ...absolute,
    occasion_type_poster_url: absoluteMediaUrl(absolute.occasion_type_poster_url),
    is_expired: Boolean(row.is_expired),
    honorees: honoreeMap[eventId] || []
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
  checkTownMismatch,
  createEvent,
  getEventForEdit,
  updateEvent,
  classifyAmendment,
  listAmendments,
  listMyEvents,
  findCollisions,
  setReminder,
  removeReminder,
  listMyReminders,
  listLiveAnnouncements,
  addReaction,
  addCongratulation,
  listCongratulationsForModeration,
  getCongratulationById,
  moderateCongratulation,
  deleteCongratulation,
  reportCongratulation,
  townStats,
  getShareEvent
};
