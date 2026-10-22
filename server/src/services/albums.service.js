'use strict';

const db = require('../db/pool');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const cloudinary = require('./cloudinary.service');
const adminScope = require('./adminScope.service');
const facebook = require('./facebook.service');
const people = require('./people.service');
const { nameKey, searchVariants } = require('../utils/arabicName');
const { fetchImageBuffer } = require('../utils/remoteImage');
const {
  PHOTO_IMPORT_HOSTS,
  PHOTO_IMPORT_MAX_BYTES,
  PHOTO_REPORT_HIDE_THRESHOLD
} = require('../constants');

/**
 * «ألبومات الأعراس» (ADR-0009) — the album is a row of its own, every photo
 * is a row of its own, and every tagged person is a row of its own. This
 * service owns every query for the domain; albums.routes.js only validates
 * and archivePhotos.routes.js is a compatibility face onto the default album.
 *
 * Two visibility rules live in SQL and nowhere else:
 *  - an album is public only when the event is approved, has ENDED, its type
 *    still carries `archive_gallery`, and the album is published. The ended
 *    span is events.service.js's EVENT_SPAN_END_SQL_E, required lazily
 *    because events.service.js requires this module at load time.
 *  - a photo is public only when its own status is approved. Hiding a type's
 *    gallery or an album hides the photos without deleting one.
 *
 * There is deliberately NO album photo cap (owner decision, 2026-10). The
 * only guard is on one request: ALBUM_UPLOAD_BATCH_MAX signatures per call,
 * and PHOTO_IMPORT_MAX_BYTES for a fetched remote image.
 */

function eventSpanEndSql() {
  return require('./events.service').EVENT_SPAN_END_SQL_E;
}

function escapeLike(term) {
  return require('./events.service').escapeLike(term);
}

function folderForAlbum(albumId) {
  return cloudinary.folderFor('albums', `album-${albumId}`);
}

/** The one stored URL shape the gallery writes; the 600px twin is a string swap, not a second upload. */
function thumbFromImageUrl(url) {
  if (typeof url !== 'string') return url;
  return url.replace('/image/upload/f_auto,q_auto,c_limit,w_1600/', '/image/upload/f_auto,q_auto,c_limit,w_600/');
}

/** A caption is never trusted to be short or unique; its key is what search matches. */
function normaliseCaption(caption) {
  const cleaned = typeof caption === 'string' ? caption.trim().slice(0, 200) : '';
  return cleaned ? { caption: cleaned, captionKey: nameKey(cleaned) } : { caption: null, captionKey: null };
}

function pagination(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/**
 * بوابات **المناسبة** وحدها: معتمدة، نوعها يسمح بالأرشيف، وامتدادها انتهى.
 * تُستعمل حيث لا ألبوم بعد — صفحة الشخص وعدّ مناسباته — لأن الألبوم يُنشأ
 * كسولاً عند أول فتح للوحة، وصاحبُ عرسٍ لم يُفتح ألبومه بعد يجب أن يُوجَد.
 */
function publicEventConditions() {
  return [
    "e.status = 'approved'",
    'ot.archive_gallery = 1',
    `${eventSpanEndSql()} < CURDATE()`
  ];
}

function publicAlbumConditions() {
  return [
    ...publicEventConditions(),
    'al.is_published = 1'
  ];
}

const PUBLIC_PHOTO_EXISTS = "EXISTS (SELECT 1 FROM event_photos pub WHERE pub.album_id = al.id AND pub.status = 'approved')";

/**
 * Variants of the typed term, not a SQL fold: the stored name keeps whatever
 * spelling its owner wrote, and a LIKE list of real spellings is both
 * index-friendly enough at this scale and free of concatenated SQL. Captions
 * and tags already carry `*_key` (nameKey), so those two match on one term.
 */
function albumSearch(search) {
  const variants = searchVariants(search);
  if (!variants.length) return { clause: '', params: [] };

  const groups = variants.map(() => `(
    al.title LIKE ? ESCAPE '\\\\'
    OR e.title LIKE ? ESCAPE '\\\\'
    OR e.groom_name LIKE ? ESCAPE '\\\\'
    OR e.family_clan LIKE ? ESCAPE '\\\\'
    OR e.town LIKE ? ESCAPE '\\\\'
    OR al.description LIKE ? ESCAPE '\\\\'
    OR EXISTS (SELECT 1 FROM event_honorees eh WHERE eh.event_id = e.id AND eh.name LIKE ? ESCAPE '\\\\')
  )`);
  const params = variants.flatMap(variant => Array(7).fill(`%${escapeLike(variant)}%`));
  const key = `%${escapeLike(nameKey(search))}%`;

  return {
    clause: `(${groups.join(' OR ')} OR EXISTS (
      SELECT 1 FROM event_photos sp
        LEFT JOIN photo_tags st ON st.photo_id = sp.id AND st.status = 'approved'
       WHERE sp.album_id = al.id AND sp.status = 'approved'
         AND (sp.caption_key LIKE ? OR st.name_key LIKE ?)
    ))`,
    params: [...params, key, key]
  };
}

function photoSearch(search) {
  const variants = searchVariants(search);
  if (!variants.length) return { clause: '', params: [] };

  const groups = variants.map(() => `(
    e.title LIKE ? ESCAPE '\\\\'
    OR e.groom_name LIKE ? ESCAPE '\\\\'
    OR e.family_clan LIKE ? ESCAPE '\\\\'
    OR e.town LIKE ? ESCAPE '\\\\'
    OR al.title LIKE ? ESCAPE '\\\\'
    OR EXISTS (SELECT 1 FROM event_honorees eh WHERE eh.event_id = e.id AND eh.name LIKE ? ESCAPE '\\\\')
  )`);
  const params = variants.flatMap(variant => Array(6).fill(`%${escapeLike(variant)}%`));
  const key = `%${escapeLike(nameKey(search))}%`;

  return {
    clause: `(${groups.join(' OR ')} OR p.caption_key LIKE ? OR EXISTS (
      SELECT 1 FROM photo_tags st
       WHERE st.photo_id = p.id AND st.status = 'approved' AND st.name_key LIKE ?
    ))`,
    params: [...params, key, key]
  };
}

function publicPhotoShape(row, tags = []) {
  return {
    id: row.id,
    album_id: row.album_id,
    image_url: row.image_url,
    thumb_url: thumbFromImageUrl(row.image_url),
    width: row.width,
    height: row.height,
    caption: row.caption,
    position: row.position,
    is_cover: Boolean(row.is_cover),
    // صفحة الصورة على الخادم — تُبنى هنا مع بقية شكلها، فلا يركّبها عميل
    // بنفسه ويختلف عن الخادم حين يتغيّر النطاق (تذكرة #103).
    share_url: `${config.publicUrl}/p/${row.id}`,
    created_at: row.created_at,
    tags: tags.map(tag => ({ name: tag.name })),
    album: { id: row.album_id, title: row.album_title || null },
    event: {
      id: row.event_id,
      title: row.event_title || null,
      town: row.town || null,
      event_date: row.event_date || null,
      occasion_type_name: row.occasion_type_name || null
    }
  };
}

function adminPhotoShape(row, tags = []) {
  return {
    ...publicPhotoShape(row, tags.filter(tag => tag.status === 'approved')),
    status: row.status,
    source: row.source,
    source_url: row.source_url,
    tags: tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      status: tag.status,
      user_id: tag.user_id,
      moderated_at: tag.moderated_at
    }))
  };
}

function publicAlbumShape(row) {
  return {
    id: row.id,
    event_id: row.event_id,
    title: row.title,
    description: row.description,
    is_published: Boolean(row.is_published),
    photo_count: Number(row.photo_count || 0),
    cover_url: row.cover_image_url || null,
    cover_thumb_url: thumbFromImageUrl(row.cover_image_url),
    // The shareable page the server renders at GET /a/:id. Built here, next to
    // the rest of the album's public shape, so no client assembles the URL and
    // drifts the day PUBLIC_URL changes (ADR-0006, issue #100).
    share_url: `${config.publicUrl}/a/${row.id}`,
    created_at: row.created_at,
    event: {
      id: row.event_id,
      title: row.event_title || null,
      town: row.town || null,
      event_date: row.event_date || null,
      occasion_type_name: row.occasion_type_name || null
    }
  };
}

async function tagsForPhotos(photoIds, { approvedOnly = true } = {}) {
  if (!photoIds.length) return new Map();
  const placeholders = photoIds.map(() => '?').join(', ');
  const statusClause = approvedOnly ? " AND status = 'approved'" : '';
  const rows = await db.query(
    `SELECT id, photo_id, user_id, name, status, moderated_at
       FROM photo_tags
      WHERE photo_id IN (${placeholders})${statusClause}
      ORDER BY id ASC`,
    photoIds
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.photo_id)) map.set(row.photo_id, []);
    map.get(row.photo_id).push(row);
  }
  return map;
}

// --- Public reads -----------------------------------------------------

async function listPublicAlbums({ search = null, eventId = null, page = 1, limit = 24 } = {}) {
  const conditions = publicAlbumConditions();
  const params = [];
  if (eventId !== null) {
    conditions.push('al.event_id = ?');
    params.push(eventId);
  }
  const searchPart = search ? albumSearch(search) : null;
  if (searchPart && searchPart.clause) {
    conditions.push(searchPart.clause);
    params.push(...searchPart.params);
  }
  conditions.push(PUBLIC_PHOTO_EXISTS);
  const where = conditions.join(' AND ');

  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total
       FROM event_albums al
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE ${where}`,
    params
  );

  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT al.id, al.event_id, al.title, al.description, al.is_published, al.created_at,
            e.title AS event_title, e.town, e.event_date,
            ot.name AS occasion_type_name,
            (SELECT COUNT(*) FROM event_photos p WHERE p.album_id = al.id AND p.status = 'approved') AS photo_count,
            (SELECT p.image_url FROM event_photos p
              WHERE p.album_id = al.id AND p.status = 'approved'
              ORDER BY p.is_cover DESC, p.position ASC, p.id ASC LIMIT 1) AS cover_image_url
       FROM event_albums al
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE ${where}
      ORDER BY e.event_date DESC, al.id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    albums: rows.map(publicAlbumShape),
    pagination: pagination(page, limit, Number(countRow.total))
  };
}

async function getPublicAlbum(albumId, { page = 1, limit = 24, search = null } = {}) {
  const conditions = publicAlbumConditions();
  conditions.push(PUBLIC_PHOTO_EXISTS);
  const albumRow = await db.queryOne(
    `SELECT al.id, al.event_id, al.title, al.description, al.is_published, al.created_at,
            e.title AS event_title, e.town, e.event_date,
            ot.name AS occasion_type_name,
            (SELECT COUNT(*) FROM event_photos p WHERE p.album_id = al.id AND p.status = 'approved') AS photo_count,
            (SELECT p.image_url FROM event_photos p
              WHERE p.album_id = al.id AND p.status = 'approved'
              ORDER BY p.is_cover DESC, p.position ASC, p.id ASC LIMIT 1) AS cover_image_url
       FROM event_albums al
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE al.id = ? AND ${conditions.join(' AND ')}`,
    [albumId]
  );
  if (!albumRow) throw ApiError.notFound('الألبوم غير موجود');

  const photos = await listPublicPhotos({ albumId, page, limit, search });
  return { album: publicAlbumShape(albumRow), photos: photos.photos, pagination: photos.pagination };
}

async function listPublicPhotos({ search = null, albumId = null, person = null, personId = null, mineUserId = null, page = 1, limit = 24 } = {}) {
  const conditions = [...publicAlbumConditions(), "p.status = 'approved'"];
  const params = [];

  if (albumId !== null) {
    conditions.push('p.album_id = ?');
    params.push(albumId);
  }
  if (personId !== null) {
    // بالمعرّف لا بالاسم: صفحة الشخص تجمع صوره من هويّته (ADR-0011)، فلا
    // تفرّقها صيغة إملائية ولا تخلطها بأسماء تشبهها.
    conditions.push(`EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.status = 'approved' AND pt.person_id = ?)`);
    params.push(personId);
  }
  if (person) {
    conditions.push(`EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.status = 'approved' AND pt.name_key = ?)`);
    params.push(nameKey(person));
  }
  if (mineUserId !== null) {
    conditions.push(`EXISTS (SELECT 1 FROM photo_tags mine WHERE mine.photo_id = p.id AND mine.status = 'approved' AND mine.user_id = ?)`);
    params.push(mineUserId);
  }
  if (search) {
    const searchPart = photoSearch(search);
    if (searchPart.clause) {
      conditions.push(searchPart.clause);
      params.push(...searchPart.params);
    }
  }

  const where = conditions.join(' AND ');
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total
       FROM event_photos p
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE ${where}`,
    params
  );

  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT p.*, al.title AS album_title, al.event_id AS event_id,
            e.title AS event_title, e.town, e.event_date,
            ot.name AS occasion_type_name
       FROM event_photos p
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE ${where}
      ORDER BY e.event_date DESC, p.is_cover DESC, p.position ASC, p.id ASC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const tags = await tagsForPhotos(rows.map(row => row.id));
  return {
    photos: rows.map(row => publicPhotoShape(row, tags.get(row.id) || [])),
    pagination: pagination(page, limit, Number(countRow.total))
  };
}

async function getPublicPhoto(photoId) {
  const row = await db.queryOne(
    `SELECT p.*, al.title AS album_title, al.event_id AS event_id,
            e.title AS event_title, e.town, e.event_date,
            ot.name AS occasion_type_name
       FROM event_photos p
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE p.id = ? AND p.status = 'approved' AND ${publicAlbumConditions().join(' AND ')}`,
    [photoId]
  );
  if (!row) throw ApiError.notFound('الصورة غير موجودة');

  const tags = await tagsForPhotos([row.id]);
  return {
    photo: publicPhotoShape(row, tags.get(row.id) || [])
  };
}

async function searchPeople(search, limit = 12) {
  if (!nameKey(search)) return [];
  const key = `%${escapeLike(nameKey(search))}%`;
  const gates = publicAlbumConditions().join(' AND ');

  // من `people` لا من تجميع نصوص الوسوم (ADR-0011): فحسابٌ سجّل يظهر باسمه،
  // وصاحب المناسبة يظهر ولو لم يُوسم، والاسم الواحد لا يتفرّق على صيغ إملائية.
  // وشرط الظهور (D15): لا يُعاد إلّا من له صورة ظاهرة أو مناسبة ظاهرة هو
  // صاحبها — الحساب سجلّ هوية، لا دفتر أعضاء. والاستعلامات الفرعية تستعير
  // أسماء الجداول نفسها (`al`, `e`, `ot`) في نطاقها الخاص، فلا تتضارب.
  const rows = await db.query(
    `SELECT p.id, p.name, p.name_key,
            (SELECT COUNT(DISTINCT t.photo_id)
               FROM photo_tags t
               JOIN event_photos ph ON ph.id = t.photo_id AND ph.status = 'approved'
               JOIN event_albums al ON al.id = ph.album_id
               JOIN events e ON e.id = al.event_id
               LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
              WHERE t.person_id = p.id AND t.status = 'approved' AND ${gates}) AS photos_count,
            (SELECT COUNT(DISTINCT e.id)
               FROM event_honorees h
               JOIN events e ON e.id = h.event_id
               LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
              WHERE h.person_id = p.id AND ${publicEventConditions().join(' AND ')}) AS albums_count
       FROM people p
      WHERE p.name_key LIKE ?
      HAVING photos_count > 0 OR albums_count > 0
      ORDER BY (photos_count + albums_count) DESC, p.name ASC
      LIMIT ?`,
    [key, limit]
  );
  if (!rows.length) return [];

  const ids = rows.map(row => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  const samples = await db.query(
    `SELECT t.person_id, ph.image_url
       FROM photo_tags t
       JOIN event_photos ph ON ph.id = t.photo_id AND ph.status = 'approved'
       JOIN event_albums al ON al.id = ph.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE t.status = 'approved' AND t.person_id IN (${placeholders}) AND ${gates}
      ORDER BY ph.id ASC`,
    ids
  );
  const firstPhoto = new Map();
  for (const sample of samples) {
    if (!firstPhoto.has(sample.person_id)) firstPhoto.set(sample.person_id, sample.image_url);
  }

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    name_key: row.name_key,
    photos_count: Number(row.photos_count),
    albums_count: Number(row.albums_count),
    sample_url: firstPhoto.get(row.id) || null,
    sample_thumb_url: thumbFromImageUrl(firstPhoto.get(row.id))
  }));
}

/**
 * صفحة الشخص (ADR-0011، تذكرة #105): صوره الموسومة بها، ومناسباته التي هو
 * صاحبها وألبوماتها. البوابات الخمس هي نفسها، والاختبار على `person_id` لا
 * على الاسم — فالإملاء لا يفرّق بين شخصين ولا يجمع شخصين.
 *
 * `albums_count` عدُّ **مناسباته الظاهرة** لا ألبوماته: صاحبُ عرسٍ لم يُنشأ
 * ألبومه بعد (الألبوم يُنشأ عند أول فتح للوحة) يجب أن يظهر ويُوجَد، وإلّا صار
 * الظهور معلَّقاً على خطوة إدارية لاحقة.
 */
async function getPublicPerson(personId, { page = 1, limit = 48 } = {}) {
  const person = await db.queryOne('SELECT id, name, name_key FROM people WHERE id = ?', [personId]);
  if (!person) throw ApiError.notFound('الشخص غير موجود');

  const photos = await listPublicPhotos({ personId, page, limit });
  const albums = await db.query(
    `SELECT al.id, al.event_id, al.title, al.description, al.is_published, al.created_at,
            e.title AS event_title, e.town, e.event_date,
            ot.name AS occasion_type_name,
            (SELECT COUNT(*) FROM event_photos p WHERE p.album_id = al.id AND p.status = 'approved') AS photo_count,
            (SELECT p.image_url FROM event_photos p
              WHERE p.album_id = al.id AND p.status = 'approved'
              ORDER BY p.is_cover DESC, p.position ASC, p.id ASC LIMIT 1) AS cover_image_url
       FROM event_honorees h
       JOIN events e ON e.id = h.event_id
       JOIN event_albums al ON al.event_id = e.id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE h.person_id = ? AND ${publicAlbumConditions().join(' AND ')} AND ${PUBLIC_PHOTO_EXISTS}
      ORDER BY e.event_date DESC`,
    [personId]
  );

  const occasions = await db.query(
    `SELECT DISTINCT e.id, e.title, e.town, e.event_date, ot.name AS occasion_type_name
       FROM event_honorees h
       JOIN events e ON e.id = h.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE h.person_id = ? AND ${publicEventConditions().join(' AND ')}
      ORDER BY e.event_date DESC`,
    [personId]
  );

  // لا شيء ظاهر ⇒ الشخص غير موجود، بنفس الردّ الذي يردّه لمن يعدّ المعرّفات.
  if (!photos.pagination.total && !occasions.length) throw ApiError.notFound('الشخص غير موجود');

  return {
    person: {
      id: person.id,
      name: person.name,
      name_key: person.name_key,
      photos_count: photos.pagination.total,
      albums_count: occasions.length,
      photos: photos.photos,
      albums: albums.map(publicAlbumShape),
      // مناسباته الظاهرة حتى لو لم يُنشأ ألبومها بعد — كي لا تُعرض صفحة فيها
      // اسمٌ ورقمان ولا شيء تحتهما.
      events: occasions.map(row => ({
        id: row.id,
        title: row.title || null,
        town: row.town || null,
        event_date: row.event_date || null,
        occasion_type_name: row.occasion_type_name || null
      })),
      pagination: photos.pagination
    }
  };
}

/**
 * The `archive_photos` field `GET /api/events/:id` has carried since
 * ADR-0008. It now means "the event's default album", in the old shape plus
 * the additive caption/thumb fields; the new album UI reads
 * /api/albums/:id instead. Everything the old clients ignore is additive.
 */
async function listDefaultAlbumPhotosForEvent(eventId) {
  const album = await db.queryOne(
    'SELECT id FROM event_albums WHERE event_id = ? ORDER BY id ASC LIMIT 1',
    [eventId]
  );
  if (!album) return [];
  const result = await listPublicPhotos({ albumId: album.id, page: 1, limit: 1000 });
  return result.photos.map(photo => ({
    id: photo.id,
    image_url: photo.image_url,
    thumb_url: photo.thumb_url,
    width: photo.width,
    height: photo.height,
    caption: photo.caption,
    tags: photo.tags,
    created_at: photo.created_at
  }));
}

async function searchPublic(search, page = 1, limit = 24) {
  const [albums, photos, people] = await Promise.all([
    listPublicAlbums({ search, page: 1, limit: 12 }),
    listPublicPhotos({ search, page: 1, limit: 12 }),
    searchPeople(search, 12)
  ]);
  return { albums: albums.albums, photos: photos.photos, people };
}

// --- Admin: albums ----------------------------------------------------

async function assertEventAllowsGallery(eventId) {
  const row = await db.queryOne(
    `SELECT e.id, e.status, ot.archive_gallery
       FROM events e
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE e.id = ?`,
    [eventId]
  );
  if (!row) throw ApiError.notFound('المناسبة غير موجودة');
  if (!Number(row.archive_gallery)) {
    throw ApiError.badRequest('نوع هذه المناسبة لا يحمل ألبوم صور — فعّله من أنواع المناسبات');
  }
  return row;
}

async function defaultAlbumTitle(eventId, connection = null) {
  const sql = `SELECT COALESCE(ot.name, 'عرس') AS type_name,
                      COALESCE(
                        (SELECT h.name FROM event_honorees h WHERE h.event_id = e.id ORDER BY h.position ASC, h.id ASC LIMIT 1),
                        e.groom_name
                      ) AS lead_name,
                      e.town
                 FROM events e
                 LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
                WHERE e.id = ?`;
  let row;
  if (connection) {
    const [rows] = await connection.execute(sql, [eventId]);
    row = rows[0];
  } else {
    row = await db.queryOne(sql, [eventId]);
  }
  if (!row) throw ApiError.notFound('المناسبة غير موجودة');
  return `${row.type_name} ${row.lead_name} — ${row.town}`.slice(0, 200);
}

async function ensureDefaultAlbum(user, eventId) {
  const event = await adminScope.assertEventInScope(user, eventId);
  await assertEventAllowsGallery(eventId);

  return db.transaction(async connection => {
    await connection.execute('SELECT id FROM events WHERE id = ? FOR UPDATE', [eventId]);
    const [existing] = await connection.execute(
      'SELECT * FROM event_albums WHERE event_id = ? ORDER BY id ASC LIMIT 1',
      [eventId]
    );
    if (existing.length) return existing[0];

    const title = await defaultAlbumTitle(eventId, connection);
    const [result] = await connection.execute(
      'INSERT INTO event_albums (event_id, title, created_by) VALUES (?, ?, ?)',
      [eventId, title, user.id]
    );
    logger.info('album.create', { eventId, albumId: result.insertId, by: user.id });
    const [created] = await connection.execute('SELECT * FROM event_albums WHERE id = ?', [result.insertId]);
    return created[0];
  });
}

async function listAlbumsForAdmin(user, eventId) {
  await adminScope.assertEventInScope(user, eventId);
  const rows = await db.query(
    `SELECT al.*, e.title AS event_title, e.town, e.event_date, ot.name AS occasion_type_name,
            (SELECT COUNT(*) FROM event_photos p WHERE p.album_id = al.id) AS photo_count,
            (SELECT p.image_url FROM event_photos p
              WHERE p.album_id = al.id AND p.status = 'approved'
              ORDER BY p.is_cover DESC, p.position ASC, p.id ASC LIMIT 1) AS cover_image_url
       FROM event_albums al
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE al.event_id = ?
      ORDER BY al.id ASC`,
    [eventId]
  );
  return rows.map(publicAlbumShape);
}

async function createAlbum(user, eventId, { title, description }) {
  await adminScope.assertEventInScope(user, eventId);
  await assertEventAllowsGallery(eventId);
  if (!title) throw ApiError.badRequest('عنوان الألبوم مطلوب');
  const result = await db.execute(
    'INSERT INTO event_albums (event_id, title, description, created_by) VALUES (?, ?, ?, ?)',
    [eventId, title, description || null, user.id]
  );
  logger.info('album.create', { eventId, albumId: result.insertId, by: user.id });
  const albums = await listAlbumsForAdmin(user, eventId);
  return albums.find(album => Number(album.id) === Number(result.insertId)) || null;
}

const ALBUM_UPDATABLE = ['title', 'description', 'is_published'];

async function updateAlbum(user, albumId, data) {
  await adminScope.assertAlbumInScope(user, albumId);
  const assignments = [];
  const params = [];
  for (const column of ALBUM_UPDATABLE) {
    if (data[column] === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(column === 'is_published' ? (data[column] ? 1 : 0) : data[column]);
  }
  if (!assignments.length) throw ApiError.badRequest('لم يتم إرسال أي تعديل');
  params.push(albumId);
  await db.execute(`UPDATE event_albums SET ${assignments.join(', ')} WHERE id = ?`, params);
  return listAlbumsForAdmin(user, (await adminScope.assertAlbumInScope(user, albumId)).event_id)
    .then(albums => albums.find(album => Number(album.id) === Number(albumId)) || null);
}

async function deleteAlbum(user, albumId) {
  await adminScope.assertAlbumInScope(user, albumId);
  const photos = await db.transaction(async connection => {
    const [rows] = await connection.execute('SELECT public_id FROM event_photos WHERE album_id = ?', [albumId]);
    await connection.execute('DELETE FROM event_photos WHERE album_id = ?', [albumId]);
    await connection.execute('DELETE FROM event_albums WHERE id = ?', [albumId]);
    return rows;
  });
  for (const photo of photos) await cloudinary.destroy(photo.public_id);
  logger.info('album.delete', { albumId, photos: photos.length, by: user.id });
}

// --- Admin: photos ----------------------------------------------------

async function listPhotosForAdmin(user, albumId, { page = 1, limit = 60 } = {}) {
  const album = await adminScope.assertAlbumInScope(user, albumId);
  const countRow = await db.queryOne('SELECT COUNT(*) AS total FROM event_photos WHERE album_id = ?', [albumId]);
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT p.*, al.title AS album_title, al.event_id AS event_id,
            e.title AS event_title, e.town, e.event_date, ot.name AS occasion_type_name
       FROM event_photos p
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE p.album_id = ?
      ORDER BY p.is_cover DESC, p.position ASC, p.id ASC
      LIMIT ? OFFSET ?`,
    [albumId, limit, offset]
  );
  const tags = await tagsForPhotos(rows.map(row => row.id), { approvedOnly: false });
  return {
    album,
    photos: rows.map(row => adminPhotoShape(row, tags.get(row.id) || [])),
    pagination: pagination(page, limit, Number(countRow.total))
  };
}

async function signPhotoUploads(user, albumId, count) {
  const album = await adminScope.assertAlbumInScope(user, albumId);
  await assertEventAllowsGallery(album.event_id);
  return cloudinary.signBatch(folderForAlbum(albumId), count);
}

async function insertPhotoRow(connection, { eventId, albumId, publicId, imageUrl, width, height, caption, source, sourceUrl, uploadedBy }) {
  const [[meta]] = await connection.execute(
    'SELECT COUNT(*) AS cnt, COALESCE(MAX(position), -1) + 1 AS nextPos FROM event_photos WHERE album_id = ?',
    [albumId]
  );
  const named = normaliseCaption(caption);
  const [result] = await connection.execute(
    `INSERT INTO event_photos
       (event_id, album_id, public_id, image_url, width, height, caption, caption_key,
        position, status, is_cover, source, source_url, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
    [
      eventId, albumId, publicId, imageUrl, width, height, named.caption, named.captionKey,
      Number(meta.nextPos), Number(meta.cnt) === 0 ? 1 : 0, source, sourceUrl, uploadedBy
    ]
  );
  return result.insertId;
}

async function photoByIdForAdmin(photoId) {
  const row = await db.queryOne(
    `SELECT p.*, al.title AS album_title, al.event_id AS event_id,
            e.title AS event_title, e.town, e.event_date, ot.name AS occasion_type_name
       FROM event_photos p
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE p.id = ?`,
    [photoId]
  );
  if (!row) throw ApiError.notFound('الصورة غير موجودة');
  const tags = await tagsForPhotos([row.id], { approvedOnly: false });
  return adminPhotoShape(row, tags.get(row.id) || []);
}

async function registerPhoto(user, albumId, upload, { width, height }, caption) {
  const album = await adminScope.assertAlbumInScope(user, albumId);
  await assertEventAllowsGallery(album.event_id);

  const verified = cloudinary.verifyUpload(folderForAlbum(albumId), upload);
  const existing = await db.queryOne('SELECT * FROM event_photos WHERE public_id = ?', [verified.public_id]);
  if (existing) {
    if (Number(existing.album_id) === Number(albumId)) return photoByIdForAdmin(existing.id);
    throw ApiError.conflict('هذه الصورة مضافة إلى ألبوم آخر');
  }

  let insertId;
  try {
    insertId = await db.transaction(connection => insertPhotoRow(connection, {
      eventId: album.event_id,
      albumId,
      publicId: verified.public_id,
      imageUrl: cloudinary.deliveryUrl(verified),
      width,
      height,
      caption,
      source: 'upload',
      sourceUrl: null,
      uploadedBy: user.id
    }));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const raced = await db.queryOne('SELECT * FROM event_photos WHERE public_id = ?', [verified.public_id]);
      if (raced && Number(raced.album_id) === Number(albumId)) return photoByIdForAdmin(raced.id);
      throw ApiError.conflict('هذه الصورة مضافة مسبقاً');
    }
    await cloudinary.destroy(verified.public_id);
    throw err;
  }

  logger.info('album.photo.add', { albumId, photoId: insertId, by: user.id });
  return photoByIdForAdmin(insertId);
}

const PHOTO_UPDATABLE = ['caption', 'status', 'position', 'album_id'];

async function updatePhoto(user, photoId, data) {
  const photo = await adminScope.assertPhotoInScope(user, photoId);
  const assignments = [];
  const params = [];

  for (const column of PHOTO_UPDATABLE) {
    if (data[column] === undefined) continue;
    if (column === 'caption') {
      const named = normaliseCaption(data.caption);
      assignments.push('caption = ?', 'caption_key = ?');
      params.push(named.caption, named.captionKey);
    } else if (column === 'status') {
      if (!['approved', 'hidden'].includes(data.status)) throw ApiError.badRequest('حالة الصورة غير معروفة');
      assignments.push('status = ?');
      params.push(data.status);
    } else if (column === 'position') {
      const position = Number.parseInt(data.position, 10);
      if (!Number.isInteger(position) || position < 0) throw ApiError.badRequest('ترتيب الصورة غير صالح');
      assignments.push('position = ?');
      params.push(position);
    } else if (column === 'album_id') {
      const albumId = Number.parseInt(data.album_id, 10);
      const target = await db.queryOne(
        'SELECT id FROM event_albums WHERE id = ? AND event_id = ?',
        [albumId, photo.event_id]
      );
      if (!target) throw ApiError.badRequest('الألبوم الهدف لا ينتمي إلى المناسبة نفسها');
      assignments.push('album_id = ?');
      params.push(albumId);
    }
  }

  const coverRequested = data.is_cover !== undefined ? Boolean(data.is_cover) : null;
  if (!assignments.length && coverRequested === null) {
    throw ApiError.badRequest('لم يتم إرسال أي تعديل');
  }

  const targetAlbumId = data.album_id !== undefined ? Number(data.album_id) : Number(photo.album_id);
  const moved = targetAlbumId !== Number(photo.album_id);
  const oldWasCover = Boolean(photo.is_cover);

  await db.transaction(async connection => {
    if (coverRequested === true) {
      await connection.execute('UPDATE event_photos SET is_cover = 0 WHERE album_id = ?', [targetAlbumId]);
    }
    if (assignments.length) {
      params.push(photoId);
      await connection.execute(`UPDATE event_photos SET ${assignments.join(', ')} WHERE id = ?`, params);
    }
    if (coverRequested === true) {
      await connection.execute('UPDATE event_photos SET is_cover = 1 WHERE id = ?', [photoId]);
    } else if (coverRequested === false) {
      await connection.execute('UPDATE event_photos SET is_cover = 0 WHERE id = ?', [photoId]);
    }
    if (moved && oldWasCover) {
      const [next] = await connection.execute(
        'SELECT id FROM event_photos WHERE album_id = ? ORDER BY position ASC, id ASC LIMIT 1',
        [Number(photo.album_id)]
      );
      if (next.length) {
        await connection.execute('UPDATE event_photos SET is_cover = 1 WHERE id = ?', [next[0].id]);
      }
    }
  });

  return photoByIdForAdmin(photoId);
}

async function deletePhoto(user, photoId) {
  const photo = await adminScope.assertPhotoInScope(user, photoId);
  await db.transaction(async connection => {
    await connection.execute('DELETE FROM event_photos WHERE id = ?', [photoId]);
    if (Number(photo.is_cover)) {
      const [next] = await connection.execute(
        'SELECT id FROM event_photos WHERE album_id = ? ORDER BY position ASC, id ASC LIMIT 1',
        [photo.album_id]
      );
      if (next.length) {
        await connection.execute('UPDATE event_photos SET is_cover = 1 WHERE id = ?', [next[0].id]);
      }
    }
  });
  await cloudinary.destroy(photo.public_id);
  logger.info('album.photo.delete', { photoId, albumId: photo.album_id, by: user.id });
}

/** The legacy `DELETE /api/admin/events/:id/photos/:photoId` path: the photo must belong to that event. */
async function deletePhotoFromEvent(user, eventId, photoId) {
  const photo = await adminScope.assertPhotoInScope(user, photoId);
  if (Number(photo.event_id) !== Number(eventId)) throw ApiError.notFound('الصورة غير موجودة');
  return deletePhoto(user, photoId);
}

/** A signed CDN URL is a capability and expires; only origin+path is kept as provenance. */
function sanitiseSourceUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

async function importRemoteIntoAlbum(user, albumId, { url, caption, source }) {
  const album = await adminScope.assertAlbumInScope(user, albumId);
  await assertEventAllowsGallery(album.event_id);

  const sourceUrl = sanitiseSourceUrl(url);
  if (sourceUrl) {
    const duplicate = await db.queryOne(
      'SELECT id FROM event_photos WHERE album_id = ? AND source_url = ?',
      [albumId, sourceUrl]
    );
    if (duplicate) return { photo: await photoByIdForAdmin(duplicate.id), duplicate: true };
  }

  const { buffer } = await fetchImageBuffer(url, {
    hosts: PHOTO_IMPORT_HOSTS,
    maxBytes: PHOTO_IMPORT_MAX_BYTES
  });
  const uploaded = await cloudinary.uploadBuffer(buffer, folderForAlbum(albumId), {
    format: buffer[0] === 0x89 ? 'png' : 'jpg'
  });

  let insertId;
  try {
    insertId = await db.transaction(connection => insertPhotoRow(connection, {
      eventId: album.event_id,
      albumId,
      publicId: uploaded.public_id,
      imageUrl: uploaded.url,
      width: null,
      height: null,
      caption,
      source,
      sourceUrl,
      uploadedBy: user.id
    }));
  } catch (err) {
    await cloudinary.destroy(uploaded.public_id);
    throw err;
  }

  logger.info('album.photo.import', { albumId, photoId: insertId, source, by: user.id });
  return { photo: await photoByIdForAdmin(insertId), duplicate: false };
}

async function importPhotoFromUrl(user, albumId, { url, caption }) {
  const result = await importRemoteIntoAlbum(user, albumId, { url, caption, source: 'facebook_url' });
  return result;
}

async function listFacebookPageAlbums(user) {
  if (user.role !== 'super_admin') throw ApiError.forbidden('استيراد ألبومات صفحة فيسبوك متاح للسوبر أدمن فقط');
  return facebook.listPageAlbums();
}

async function importFacebookPageAlbum(user, albumId, { facebookAlbumId, photoIds }) {
  if (user.role !== 'super_admin') throw ApiError.forbidden('استيراد ألبومات صفحة فيسبوك متاح للسوبر أدمن فقط');
  await adminScope.assertAlbumInScope(user, albumId);
  if (!Array.isArray(photoIds) || !photoIds.length) throw ApiError.badRequest('اختر صورة واحدة على الأقل');
  if (photoIds.length > 10) throw ApiError.badRequest('يمكن استيراد ١٠ صور في الطلب الواحد');

  const photos = await facebook.listAlbumPhotos(facebookAlbumId);
  const wanted = new Set(photoIds.map(String));
  const selected = photos.filter(photo => wanted.has(photo.id)).slice(0, 10);
  if (!selected.length) throw ApiError.badRequest('لم يتم العثور على الصور المختارة في ألبوم فيسبوك');

  const imported = [];
  const failed = [];
  for (const item of selected) {
    try {
      const result = await importRemoteIntoAlbum(user, albumId, {
        url: item.source_url,
        caption: item.caption,
        source: 'facebook_page'
      });
      imported.push(result.photo);
    } catch (err) {
      failed.push({ id: item.id, message: err.message || 'تعذّر استيراد الصورة' });
    }
  }
  return { imported, failed };
}

// --- Tags -------------------------------------------------------------

async function assertPhotoVisible(photoId) {
  const row = await db.queryOne(
    `SELECT p.id
       FROM event_photos p
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE p.id = ? AND p.status = 'approved' AND ${publicAlbumConditions().join(' AND ')}`,
    [photoId]
  );
  if (!row) throw ApiError.notFound('الصورة غير موجودة');
  return row;
}

async function requestTag(user, photoId) {
  await assertPhotoVisible(photoId);
  const account = await db.queryOne('SELECT full_name FROM users WHERE id = ?', [user.id]);
  if (!account) throw ApiError.unauthorized();

  const name = String(account.full_name || '').trim().slice(0, 150);
  if (!name) throw ApiError.badRequest('اسم حسابك فارغ — أكمل ملفك أولاً');

  try {
    const personId = await people.resolveByName(name);
    await db.execute(
      `INSERT INTO photo_tags (photo_id, user_id, name, name_key, person_id, status, requested_by)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [photoId, user.id, name, nameKey(name), personId, user.id]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const existing = await db.queryOne(
        'SELECT status FROM photo_tags WHERE photo_id = ? AND user_id = ?',
        [photoId, user.id]
      );
      if (existing && existing.status === 'rejected') {
        throw ApiError.conflict('تم رفض طلبك سابقاً على هذه الصورة — راجع الإدارة');
      }
      throw ApiError.conflict('طلبك مسجَّل مسبقاً على هذه الصورة');
    }
    throw err;
  }

  logger.info('photo.tag.request', { photoId, userId: user.id });
  return { status: 'pending' };
}

async function withdrawTag(user, photoId) {
  const result = await db.execute(
    'DELETE FROM photo_tags WHERE photo_id = ? AND user_id = ?',
    [photoId, user.id]
  );
  if (!result.affectedRows) throw ApiError.notFound('لا يوجد وسم لك على هذه الصورة');
  logger.info('photo.tag.withdraw', { photoId, userId: user.id });
}

async function listMyPhotos(user, { page = 1, limit = 24 } = {}) {
  return listPublicPhotos({ mineUserId: user.id, page, limit });
}

async function addAdminTag(user, photoId, name) {
  await adminScope.assertPhotoInScope(user, photoId);
  if (!name) throw ApiError.badRequest('اسم الشخص مطلوب');
  const result = await db.execute(
    `INSERT INTO photo_tags (photo_id, user_id, name, name_key, person_id, status, requested_by, moderated_by, moderated_at)
     VALUES (?, NULL, ?, ?, ?, 'approved', ?, ?, NOW())`,
    [photoId, name, nameKey(name), await people.resolveByName(name), user.id, user.id]
  );
  logger.info('photo.tag.add', { photoId, tagId: result.insertId, by: user.id });
  return { id: result.insertId, name, status: 'approved' };
}

async function listTagsForAdmin(user, { status = null, limit = 50 } = {}) {
  const scoped = await adminScope.townScopeClause(user, 'e');
  const conditions = ['1 = 1'];
  const params = [];
  if (status) {
    if (!['pending', 'approved', 'rejected'].includes(status)) throw ApiError.badRequest('حالة الوسم غير معروفة');
    conditions.push('t.status = ?');
    params.push(status);
  }
  params.push(...scoped.params);
  const rows = await db.query(
    `SELECT t.*, p.image_url, p.caption, al.title AS album_title,
            e.title AS event_title, e.town, u.full_name AS requester_name
       FROM photo_tags t
       JOIN event_photos p ON p.id = t.photo_id
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN users u ON u.id = t.requested_by
      WHERE ${conditions.join(' AND ')}${scoped.clause}
      ORDER BY t.created_at ASC, t.id ASC
      LIMIT ?`,
    [...params, limit]
  );
  return rows.map(row => ({
    id: row.id,
    photo_id: row.photo_id,
    name: row.name,
    status: row.status,
    requested_by: row.requested_by,
    requester_name: row.requester_name,
    moderated_by: row.moderated_by,
    moderated_at: row.moderated_at,
    created_at: row.created_at,
    photo: {
      id: row.photo_id,
      image_url: row.image_url,
      thumb_url: thumbFromImageUrl(row.image_url),
      caption: row.caption,
      album_title: row.album_title,
      event_title: row.event_title,
      town: row.town
    }
  }));
}

async function scopedTag(user, tagId) {
  const { clause, params } = await adminScope.townScopeClause(user, 'e');
  const row = await db.queryOne(
    `SELECT t.* FROM photo_tags t
       JOIN event_photos p ON p.id = t.photo_id
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
      WHERE t.id = ?${clause}`,
    [tagId, ...params]
  );
  if (!row) throw ApiError.notFound('الوسم غير موجود');
  return row;
}

async function moderateTag(user, tagId, status) {
  if (!['approved', 'rejected'].includes(status)) throw ApiError.badRequest('حالة الوسم غير معروفة');
  await scopedTag(user, tagId);
  await db.execute(
    'UPDATE photo_tags SET status = ?, moderated_by = ?, moderated_at = NOW() WHERE id = ?',
    [status, user.id, tagId]
  );
  logger.info('photo.tag.moderate', { tagId, status, by: user.id });
  return { id: tagId, status };
}

async function deleteTag(user, tagId) {
  await scopedTag(user, tagId);
  await db.execute('DELETE FROM photo_tags WHERE id = ?', [tagId]);
  logger.info('photo.tag.delete', { tagId, by: user.id });
}

// --- Reports ----------------------------------------------------------

async function reportPhoto(user, photoId, { reason, note }) {
  await assertPhotoVisible(photoId);
  let hidden = false;
  try {
    hidden = await db.transaction(async connection => {
      await connection.execute(
        'INSERT INTO photo_reports (photo_id, user_id, reason, note) VALUES (?, ?, ?, ?)',
        [photoId, user.id, reason, note || null]
      );
      const [[counts]] = await connection.execute(
        "SELECT COUNT(*) AS cnt FROM photo_reports WHERE photo_id = ? AND status = 'open'",
        [photoId]
      );
      if (Number(counts.cnt) >= PHOTO_REPORT_HIDE_THRESHOLD) {
        const [result] = await connection.execute(
          "UPDATE event_photos SET status = 'hidden' WHERE id = ? AND status = 'approved'",
          [photoId]
        );
        return result.affectedRows > 0;
      }
      return false;
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw ApiError.conflict('أبلغت عن هذه الصورة مسبقاً');
    throw err;
  }
  logger.info('photo.report', { photoId, reason, by: user.id, hidden });
  return { hidden };
}

async function listReportsForAdmin(user, { status = 'open', limit = 50 } = {}) {
  if (!['open', 'resolved', 'dismissed'].includes(status)) throw ApiError.badRequest('حالة البلاغ غير معروفة');
  const { clause, params } = await adminScope.townScopeClause(user, 'e');
  const rows = await db.query(
    `SELECT r.*, p.image_url, p.caption, p.status AS photo_status,
            al.title AS album_title, e.title AS event_title, e.town,
            u.full_name AS reporter_name
       FROM photo_reports r
       JOIN event_photos p ON p.id = r.photo_id
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
       LEFT JOIN users u ON u.id = r.user_id
      WHERE r.status = ?${clause}
      ORDER BY r.created_at ASC, r.id ASC
      LIMIT ?`,
    [status, ...params, limit]
  );
  return rows.map(row => ({
    id: row.id,
    photo_id: row.photo_id,
    reason: row.reason,
    note: row.note,
    status: row.status,
    reporter_name: row.reporter_name,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    photo: {
      id: row.photo_id,
      image_url: row.image_url,
      thumb_url: thumbFromImageUrl(row.image_url),
      caption: row.caption,
      status: row.photo_status,
      album_title: row.album_title,
      event_title: row.event_title,
      town: row.town
    }
  }));
}

async function resolveReport(user, reportId, status) {
  if (!['resolved', 'dismissed'].includes(status)) throw ApiError.badRequest('حالة البلاغ غير معروفة');
  const { clause, params } = await adminScope.townScopeClause(user, 'e');
  const row = await db.queryOne(
    `SELECT r.id FROM photo_reports r
       JOIN event_photos p ON p.id = r.photo_id
       JOIN event_albums al ON al.id = p.album_id
       JOIN events e ON e.id = al.event_id
      WHERE r.id = ?${clause}`,
    [reportId, ...params]
  );
  if (!row) throw ApiError.notFound('البلاغ غير موجود');
  await db.execute(
    'UPDATE photo_reports SET status = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?',
    [status, user.id, reportId]
  );
  logger.info('photo.report.resolve', { reportId, status, by: user.id });
  return { id: reportId, status };
}

module.exports = {  // public
  listPublicAlbums,
  getPublicAlbum,
  listPublicPhotos,
  getPublicPhoto,
  getPublicPerson,
  searchPublic,
  searchPeople,
  listDefaultAlbumPhotosForEvent,
  // admin albums/photos
  ensureDefaultAlbum,
  listAlbumsForAdmin,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  listPhotosForAdmin,
  signPhotoUploads,
  registerPhoto,
  updatePhoto,
  deletePhoto,
  deletePhotoFromEvent,
  importPhotoFromUrl,
  listFacebookPageAlbums,
  importFacebookPageAlbum,
  // tags
  requestTag,
  withdrawTag,
  listMyPhotos,
  addAdminTag,
  listTagsForAdmin,
  moderateTag,
  deleteTag,
  // reports
  reportPhoto,
  listReportsForAdmin,
  resolveReport
};
