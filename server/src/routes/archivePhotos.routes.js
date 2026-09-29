'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const archivePhotos = require('../services/archivePhotos.service');
const { requireSuperAdmin } = require('../middleware/auth');
const { parseId } = require('../middleware/validate');

const router = express.Router();

/** A positive pixel size Cloudinary reported, or null — cosmetic only (layout hints), never trusted for anything else. */
function parseDimension(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
}

// «أرشيف الأعراس» (ADR-0008) — super_admin only, guarded on each route of
// this router itself: admin.routes.js's `requireAdmin` does not protect
// these paths just because they share the `/admin` prefix, and it would let
// a town admin through anyway.

router.get('/admin/events/:id/photos', requireSuperAdmin, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  res.json({
    success: true,
    photos: await archivePhotos.listForAdmin(eventId),
    max_photos: archivePhotos.MAX_PHOTOS_PER_EVENT
  });
}));

router.post('/admin/events/:id/photos/signature', requireSuperAdmin, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  res.json({ success: true, upload: await archivePhotos.signUpload(eventId) });
}));

router.post('/admin/events/:id/photos', requireSuperAdmin, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const body = req.body || {};
  const photo = await archivePhotos.addPhoto(
    eventId,
    { public_id: body.public_id, version: body.version, signature: body.signature },
    { width: parseDimension(body.width), height: parseDimension(body.height) },
    req.user.id
  );
  res.status(201).json({ success: true, photo, message: 'تمت إضافة الصورة إلى الأرشيف' });
}));

router.delete('/admin/events/:id/photos/:photoId', requireSuperAdmin, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const photoId = parseId(req.params.photoId, 'معرّف الصورة');
  await archivePhotos.deletePhoto(eventId, photoId);
  res.json({ success: true, message: 'تم حذف الصورة من الأرشيف' });
}));

module.exports = router;
