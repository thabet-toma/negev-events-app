'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const albums = require('../services/albums.service');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const {
  cleanString,
  parseId,
  parsePage,
  parseLimit,
  parseFlag
} = require('../middleware/validate');
const { PHOTO_REPORT_REASONS, ALBUM_UPLOAD_BATCH_MAX } = require('../constants');

const router = express.Router();

// A signed-in user may tag themselves or report a photo; neither is a hot
// path, and both write a row. Same budget shape as the stories' write limiter.
const photoWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'عدد الطلبات تجاوز الحد المسموح — يرجى المحاولة لاحقاً' }
});

function optionalId(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return parseId(value, label);
}

/** A positive pixel size Cloudinary reported, or null — cosmetic only, never trusted for layout maths. */
function parseDimension(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 20000 ? parsed : null;
}

// --- Public -----------------------------------------------------------

router.get('/albums', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    ...await albums.listPublicAlbums({
      search: cleanString(req.query.search, 100),
      eventId: optionalId(req.query.event_id, 'معرّف المناسبة'),
      page: parsePage(req.query.page),
      limit: parseLimit(req.query.limit, 24, 60)
    })
  });
}));

router.get('/albums/:id', asyncHandler(async (req, res) => {
  const albumId = parseId(req.params.id, 'معرّف الألبوم');
  res.json({
    success: true,
    ...await albums.getPublicAlbum(albumId, {
      page: parsePage(req.query.page),
      limit: parseLimit(req.query.limit, 24, 60),
      search: cleanString(req.query.search, 100)
    })
  });
}));

router.get('/photos', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    ...await albums.listPublicPhotos({
      search: cleanString(req.query.search, 100),
      albumId: optionalId(req.query.album_id, 'معرّف الألبوم'),
      person: cleanString(req.query.person, 150),
      page: parsePage(req.query.page),
      limit: parseLimit(req.query.limit, 24, 60)
    })
  });
}));

router.get('/photos/:id', asyncHandler(async (req, res) => {
  const photoId = parseId(req.params.id, 'معرّف الصورة');
  res.json({ success: true, ...await albums.getPublicPhoto(photoId) });
}));

/**
 * One box, three groups: albums, photos, people. An empty q is not a 400 —
 * it is "nothing typed yet", which the UI renders as an empty result rather
 * than an error it has to special-case.
 */
router.get('/search', asyncHandler(async (req, res) => {
  const query = cleanString(req.query.q, 100);
  if (!query) {
    res.json({ success: true, query: '', albums: [], photos: [], people: [] });
    return;
  }
  res.json({ success: true, query, ...await albums.searchPublic(query) });
}));

// --- Signed-in user ---------------------------------------------------

router.get('/my-photos', authenticate, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    ...await albums.listMyPhotos(req.user, {
      page: parsePage(req.query.page),
      limit: parseLimit(req.query.limit, 24, 60)
    })
  });
}));

router.post('/photos/:id/tags', authenticate, photoWriteLimiter, asyncHandler(async (req, res) => {
  const photoId = parseId(req.params.id, 'معرّف الصورة');
  const result = await albums.requestTag(req.user, photoId);
  res.status(201).json({
    success: true,
    ...result,
    message: 'تم إرسال طلبك — يظهر اسمك بعد موافقة الإدارة'
  });
}));

router.delete('/photos/:id/tags/me', authenticate, asyncHandler(async (req, res) => {
  const photoId = parseId(req.params.id, 'معرّف الصورة');
  await albums.withdrawTag(req.user, photoId);
  res.json({ success: true, message: 'تم سحب وسمك من الصورة' });
}));

router.post('/photos/:id/reports', authenticate, photoWriteLimiter, asyncHandler(async (req, res) => {
  const photoId = parseId(req.params.id, 'معرّف الصورة');
  const reason = cleanString(req.body && req.body.reason, 30);
  if (!PHOTO_REPORT_REASONS.includes(reason)) {
    throw ApiError.badRequest('سبب الإبلاغ غير معروف');
  }
  const result = await albums.reportPhoto(req.user, photoId, {
    reason,
    note: cleanString(req.body && req.body.note, 300)
  });
  res.status(201).json({
    success: true,
    ...result,
    message: 'تم استلام بلاغك — ستراجعه الإدارة'
  });
}));

// --- Admin ------------------------------------------------------------
// Each prefix is guarded here, on this router: admin.routes.js's guard does
// not cover a different router just because both share /admin.
router.use([
  '/admin/albums',
  '/admin/events/:id/albums',
  '/admin/photos',
  '/admin/photo-tags',
  '/admin/photo-reports',
  '/admin/facebook'
], requireAdmin);

router.get('/admin/events/:id/albums', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const album = await albums.ensureDefaultAlbum(req.user, eventId);
  res.json({ success: true, album, albums: await albums.listAlbumsForAdmin(req.user, eventId) });
}));

router.post('/admin/events/:id/albums', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const album = await albums.createAlbum(req.user, eventId, {
    title: cleanString(req.body && req.body.title, 200),
    description: cleanString(req.body && req.body.description, 2000)
  });
  res.status(201).json({ success: true, album, message: 'تم إنشاء الألبوم' });
}));

router.patch('/admin/albums/:id', asyncHandler(async (req, res) => {
  const albumId = parseId(req.params.id, 'معرّف الألبوم');
  const body = req.body || {};
  const payload = {};
  if (body.title !== undefined) {
    const title = cleanString(body.title, 200);
    if (!title) throw ApiError.badRequest('عنوان الألبوم مطلوب');
    payload.title = title;
  }
  if (body.description !== undefined) payload.description = cleanString(body.description, 2000);
  if (body.is_published !== undefined) payload.is_published = parseFlag(body.is_published);
  const album = await albums.updateAlbum(req.user, albumId, payload);
  res.json({ success: true, album, message: 'تم تحديث الألبوم' });
}));

router.delete('/admin/albums/:id', requireSuperAdmin, asyncHandler(async (req, res) => {
  const albumId = parseId(req.params.id, 'معرّف الألبوم');
  await albums.deleteAlbum(req.user, albumId);
  res.json({ success: true, message: 'تم حذف الألبوم وصوره' });
}));

router.get('/admin/albums/:id/photos', asyncHandler(async (req, res) => {
  const albumId = parseId(req.params.id, 'معرّف الألبوم');
  res.json({
    success: true,
    ...await albums.listPhotosForAdmin(req.user, albumId, {
      page: parsePage(req.query.page),
      limit: parseLimit(req.query.limit, 60, 100)
    })
  });
}));

router.post('/admin/albums/:id/photos/signatures', asyncHandler(async (req, res) => {
  const albumId = parseId(req.params.id, 'معرّف الألبوم');
  const count = parseLimit(req.body && req.body.count, 1, ALBUM_UPLOAD_BATCH_MAX);
  res.json({ success: true, uploads: await albums.signPhotoUploads(req.user, albumId, count) });
}));

router.post('/admin/albums/:id/photos', asyncHandler(async (req, res) => {
  const albumId = parseId(req.params.id, 'معرّف الألبوم');
  const body = req.body || {};
  const photo = await albums.registerPhoto(
    req.user,
    albumId,
    { public_id: body.public_id, version: body.version, signature: body.signature },
    { width: parseDimension(body.width), height: parseDimension(body.height) },
    cleanString(body.caption, 200)
  );
  res.status(201).json({ success: true, photo, message: 'تمت إضافة الصورة' });
}));

router.post('/admin/albums/:id/photos/import-url', asyncHandler(async (req, res) => {
  const albumId = parseId(req.params.id, 'معرّف الألبوم');
  const url = cleanString(req.body && req.body.url, 2000);
  if (!url) throw ApiError.badRequest('رابط الصورة مطلوب');
  const result = await albums.importPhotoFromUrl(req.user, albumId, {
    url,
    caption: cleanString(req.body && req.body.caption, 200)
  });
  res.status(201).json({
    success: true,
    ...result,
    message: result.duplicate ? 'هذه الصورة مستوردة مسبقاً' : 'تم استيراد الصورة'
  });
}));

router.patch('/admin/photos/:id', asyncHandler(async (req, res) => {
  const photoId = parseId(req.params.id, 'معرّف الصورة');
  const body = req.body || {};
  const payload = {};
  if (body.caption !== undefined) payload.caption = cleanString(body.caption, 200);
  if (body.status !== undefined) payload.status = cleanString(body.status, 20);
  if (body.position !== undefined) payload.position = body.position;
  if (body.album_id !== undefined) payload.album_id = parseId(body.album_id, 'معرّف الألبوم');
  if (body.is_cover !== undefined) payload.is_cover = parseFlag(body.is_cover);
  const photo = await albums.updatePhoto(req.user, photoId, payload);
  res.json({ success: true, photo, message: 'تم تحديث الصورة' });
}));

router.delete('/admin/photos/:id', asyncHandler(async (req, res) => {
  const photoId = parseId(req.params.id, 'معرّف الصورة');
  await albums.deletePhoto(req.user, photoId);
  res.json({ success: true, message: 'تم حذف الصورة' });
}));

router.get('/admin/photo-tags', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    tags: await albums.listTagsForAdmin(req.user, { status: cleanString(req.query.status, 20) })
  });
}));

router.patch('/admin/photo-tags/:id', asyncHandler(async (req, res) => {
  const tagId = parseId(req.params.id, 'معرّف الوسم');
  const status = cleanString(req.body && req.body.status, 20);
  const tag = await albums.moderateTag(req.user, tagId, status);
  res.json({ success: true, tag, message: status === 'approved' ? 'تم اعتماد الوسم' : 'تم رفض الوسم' });
}));

router.post('/admin/photos/:id/tags', asyncHandler(async (req, res) => {
  const photoId = parseId(req.params.id, 'معرّف الصورة');
  const name = cleanString(req.body && req.body.name, 150);
  if (!name) throw ApiError.badRequest('اسم الشخص مطلوب');
  res.status(201).json({ success: true, tag: await albums.addAdminTag(req.user, photoId, name), message: 'تمت إضافة الاسم' });
}));

router.delete('/admin/photo-tags/:id', asyncHandler(async (req, res) => {
  const tagId = parseId(req.params.id, 'معرّف الوسم');
  await albums.deleteTag(req.user, tagId);
  res.json({ success: true, message: 'تم حذف الوسم' });
}));

router.get('/admin/photo-reports', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    reports: await albums.listReportsForAdmin(req.user, {
      status: cleanString(req.query.status, 20) || 'open'
    })
  });
}));

router.patch('/admin/photo-reports/:id', asyncHandler(async (req, res) => {
  const reportId = parseId(req.params.id, 'معرّف البلاغ');
  const status = cleanString(req.body && req.body.status, 20);
  const report = await albums.resolveReport(req.user, reportId, status);
  res.json({ success: true, report, message: 'تم تحديث البلاغ' });
}));

// Facebook Page albums are platform-wide (our page, not a town's), so the
// list and the import are super_admin only even though the router's own
// guard already accepted a town admin.
router.get('/admin/facebook/page-albums', requireSuperAdmin, asyncHandler(async (req, res) => {
  res.json({ success: true, albums: await albums.listFacebookPageAlbums(req.user) });
}));

router.post('/admin/albums/:id/import-facebook', requireSuperAdmin, asyncHandler(async (req, res) => {
  const albumId = parseId(req.params.id, 'معرّف الألبوم');
  const body = req.body || {};
  const facebookAlbumId = cleanString(body.facebook_album_id, 100);
  if (!facebookAlbumId) throw ApiError.badRequest('معرّف ألبوم فيسبوك مطلوب');
  const photoIds = Array.isArray(body.photo_ids) ? body.photo_ids.map(id => String(id)) : [];
  const result = await albums.importFacebookPageAlbum(req.user, albumId, { facebookAlbumId, photoIds });
  res.json({
    success: true,
    ...result,
    message: `تم استيراد ${result.imported.length} صورة${result.failed.length ? ` وفشل ${result.failed.length}` : ''}`
  });
}));

module.exports = router;
