'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const albums = require('../services/albums.service');
const { requireAdmin } = require('../middleware/auth');
const { parseId, cleanString } = require('../middleware/validate');

const router = express.Router();

/**
 * The ADR-0008 endpoints, kept exactly where an already-shipped admin page
 * calls them. They now address the event's default album (albums.service.js,
 * ADR-0009); the new album studio uses /api/admin/albums/:id/... instead.
 * `requireAdmin` plus the service's own town scope replaces the old
 * super_admin-only guard: a town admin may add photos to a wedding in their
 * own town, and gets the same 404 outside it. `max_photos` stays in the
 * response but is null — the owner removed the cap, and the old modal is
 * patched to read it as "no limit" rather than a number.
 */

/** A positive pixel size Cloudinary reported, or null — cosmetic only (layout hints). */
function parseDimension(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
}

router.get('/admin/events/:id/photos', requireAdmin, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const album = await albums.ensureDefaultAlbum(req.user, eventId);
  const list = await albums.listPhotosForAdmin(req.user, album.id, { page: 1, limit: 1000 });
  res.json({ success: true, photos: list.photos, max_photos: null, album });
}));

router.post('/admin/events/:id/photos/signature', requireAdmin, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const album = await albums.ensureDefaultAlbum(req.user, eventId);
  const uploads = await albums.signPhotoUploads(req.user, album.id, 1);
  res.json({ success: true, upload: uploads[0] });
}));

router.post('/admin/events/:id/photos', requireAdmin, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const album = await albums.ensureDefaultAlbum(req.user, eventId);
  const body = req.body || {};
  const photo = await albums.registerPhoto(
    req.user,
    album.id,
    { public_id: body.public_id, version: body.version, signature: body.signature },
    { width: parseDimension(body.width), height: parseDimension(body.height) },
    cleanString(body.caption, 200)
  );
  res.status(201).json({ success: true, photo, message: 'تمت إضافة الصورة إلى الألبوم' });
}));

router.delete('/admin/events/:id/photos/:photoId', requireAdmin, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const photoId = parseId(req.params.photoId, 'معرّف الصورة');
  await albums.deletePhotoFromEvent(req.user, eventId, photoId);
  res.json({ success: true, message: 'تم حذف الصورة من الألبوم' });
}));

module.exports = router;
