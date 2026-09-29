'use strict';

/**
 * «أرشيف الأعراس» (ADR-0008): photos a super_admin adds to an event that has
 * ENDED and whose occasion type carries `archive_gallery`. The file itself
 * is on Cloudinary (cloudinary.service.js signs and verifies it); the
 * `event_photos` row is what the product shows. Every query for the feature
 * is here; archivePhotos.routes.js only validates.
 *
 * "Ended" is the same rule GET /api/events?archive=1 already uses —
 * `COALESCE(event_end_date, event_date) < CURDATE()` — so an event is in the
 * archive list exactly when it can carry photos, never one day apart.
 */

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const cloudinary = require('./cloudinary.service');

// Enough for a wedding's highlights; a hard ceiling so one event can never
// turn into an unbounded page for every visitor who opens it.
const MAX_PHOTOS_PER_EVENT = 60;

const PHOTO_COLUMNS = 'p.id, p.image_url, p.width, p.height, p.created_at';

function folderForEvent(eventId) {
  return cloudinary.folderFor('archive', `event-${eventId}`);
}

/**
 * The event, and whether it may carry photos right now. 404 for a missing
 * event; a clear Arabic 400 for the two ways an existing one is not
 * eligible, so the admin knows which it is.
 */
async function assertArchivable(eventId) {
  const row = await db.queryOne(
    `SELECT e.id, COALESCE(e.event_end_date, e.event_date) < CURDATE() AS ended, ot.archive_gallery
       FROM events e
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE e.id = ?`,
    [eventId]
  );
  if (!row) throw ApiError.notFound('المناسبة غير موجودة');
  if (!Number(row.ended)) throw ApiError.badRequest('صور الأرشيف تُضاف بعد انتهاء المناسبة فقط');
  if (!Number(row.archive_gallery)) throw ApiError.badRequest('نوع هذه المناسبة لا يحمل أرشيف صور — فعّله من أنواع المناسبات');
}

async function countPhotos(eventId) {
  const row = await db.queryOne('SELECT COUNT(*) AS cnt FROM event_photos WHERE event_id = ?', [eventId]);
  return Number(row.cnt);
}

async function assertRoomFor(eventId) {
  if (await countPhotos(eventId) >= MAX_PHOTOS_PER_EVENT) {
    throw ApiError.badRequest(`وصل أرشيف هذه المناسبة إلى الحدّ الأقصى (${MAX_PHOTOS_PER_EVENT} صورة)`);
  }
}

function toPhoto(row) {
  return {
    id: row.id,
    image_url: row.image_url,
    width: row.width,
    height: row.height,
    created_at: row.created_at
  };
}

/** Every photo of one event, oldest first — the admin's view, eligible or not. */
async function listForAdmin(eventId) {
  const rows = await db.query(
    `SELECT ${PHOTO_COLUMNS} FROM event_photos p WHERE p.event_id = ? ORDER BY p.id ASC`,
    [eventId]
  );
  return rows.map(toPhoto);
}

/**
 * The public gallery: only for an approved, ended event whose type still
 * has the archive on — checked in the SQL itself, so switching a type's
 * archive off hides its photos everywhere at once without deleting them.
 */
async function listPublic(eventId) {
  const rows = await db.query(
    `SELECT ${PHOTO_COLUMNS}
       FROM event_photos p
       JOIN events e ON e.id = p.event_id
       JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE p.event_id = ?
        AND e.status = 'approved'
        AND COALESCE(e.event_end_date, e.event_date) < CURDATE()
        AND ot.archive_gallery = 1
      ORDER BY p.id ASC`,
    [eventId]
  );
  return rows.map(toPhoto);
}

/** A signed, single-use upload slot inside this event's own folder. */
async function signUpload(eventId) {
  await assertArchivable(eventId);
  await assertRoomFor(eventId);
  return cloudinary.signUpload(folderForEvent(eventId));
}

/**
 * Registers one uploaded photo. The Cloudinary response signature is
 * verified against this event's folder before anything is written, so a
 * caller can neither register an image the server never signed for nor one
 * signed for another event.
 */
async function addPhoto(eventId, upload, { width, height }, uploadedBy) {
  await assertArchivable(eventId);
  const verified = cloudinary.verifyUpload(folderForEvent(eventId), upload);
  await assertRoomFor(eventId);

  let insertId;
  try {
    const result = await db.execute(
      `INSERT INTO event_photos (event_id, public_id, image_url, width, height, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventId, verified.public_id, cloudinary.deliveryUrl(verified), width, height, uploadedBy]
    );
    insertId = result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw ApiError.conflict('هذه الصورة مضافة مسبقاً');
    throw err;
  }

  logger.info('archive.photo.add', { eventId, photoId: insertId, uploadedBy });
  const row = await db.queryOne(`SELECT ${PHOTO_COLUMNS} FROM event_photos p WHERE p.id = ?`, [insertId]);
  return toPhoto(row);
}

/** Deletes the row, then (best-effort) the file on Cloudinary. */
async function deletePhoto(eventId, photoId) {
  const row = await db.queryOne(
    'SELECT public_id FROM event_photos WHERE id = ? AND event_id = ?',
    [photoId, eventId]
  );
  if (!row) throw ApiError.notFound('الصورة غير موجودة');

  await db.execute('DELETE FROM event_photos WHERE id = ? AND event_id = ?', [photoId, eventId]);
  logger.info('archive.photo.delete', { eventId, photoId });
  await cloudinary.destroy(row.public_id);
}

module.exports = {
  MAX_PHOTOS_PER_EVENT,
  listForAdmin,
  listPublic,
  signUpload,
  addPhoto,
  deletePhoto
};
