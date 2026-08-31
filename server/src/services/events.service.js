'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const occasionTypes = require('./occasionTypes.service');
const { REACTION_TYPES, TOWN_COORDINATES, CONGRATULATION_REPORT_THRESHOLD } = require('../constants');
const { withAbsoluteMedia } = require('../utils/mediaUrl');
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
  'id', 'title', 'groom_name', 'family_clan', 'occasion_type_id', 'town', 'location_name',
  'latitude', 'longitude', 'event_date', 'event_end_date', 'youth_party_date', 'dinner_time',
  'poster_url', 'audio_url', 'audio_title', 'host_phone', 'views_count'
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
  town, date, search, occasionTypeId = null, legacyOnly = false, archive = false,
  page = 1, limit = DEFAULT_PAGE_SIZE
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
  // parameterization rule as every other value in this query.
  const rows = await db.query(
    `SELECT ${LIST_COLUMNS} FROM events WHERE ${whereClause} ORDER BY ${orderClause} LIMIT ? OFFSET ?`,
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

  return {
    events,
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

  return {
    ...withRelations,
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
  checkTownMismatch,
  createEvent,
  getEventForEdit,
  updateEvent,
  classifyAmendment,
  listAmendments,
  listMyEvents,
  findCollisions,
  addReaction,
  addCongratulation,
  listCongratulationsForModeration,
  moderateCongratulation,
  deleteCongratulation,
  reportCongratulation,
  townStats
};
