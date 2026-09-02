'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const admin = require('../services/admin.service');
const adminScope = require('../services/adminScope.service');
const events = require('../services/events.service');
const auth = require('../services/auth.service');
const realtime = require('../realtime');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { cleanString, requireFields, parseId } = require('../middleware/validate');
const { EVENT_STATUSES, TOWNS } = require('../constants');

const router = express.Router();

router.post('/admin/login', asyncHandler(async (req, res) => {
  requireFields(req.body, ['pin_code']);

  const result = await auth.adminLogin({
    phone_number: cleanString(req.body.phone_number, 20),
    pin_code: cleanString(req.body.pin_code, 20)
  });

  res.json({ success: true, ...result });
}));

// Everything below requires an admin token.
router.use('/admin', requireAdmin);

/**
 * Who am I and what do I administer. The panel needs this to say «تدير: رهط ·
 * اللقية» and to offer a town picker holding exactly the caller's towns —
 * neither of which can be inferred from the scoped lists, because a town that
 * was assigned but has no events yet would simply be missing from them. That
 * inference would fail worst for a brand-new admin, who is exactly the person
 * an empty panel confuses (#36).
 */
router.get('/admin/me', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    role: req.user.role,
    towns: await adminScope.listTownsFor(req.user)
  });
}));

router.get('/admin/stats', asyncHandler(async (req, res) => {
  res.json({ success: true, stats: await admin.stats(req.user) });
}));

router.get('/admin/events', asyncHandler(async (req, res) => {
  const status = cleanString(req.query.status, 20);
  if (status && !EVENT_STATUSES.includes(status)) {
    throw ApiError.badRequest('حالة غير صالحة');
  }
  res.json({ success: true, events: await admin.listEvents(status, req.user) });
}));

router.patch('/admin/events/:id/status', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const status = cleanString(req.body.status, 20);

  if (!EVENT_STATUSES.includes(status)) {
    throw ApiError.badRequest('حالة غير صالحة');
  }

  // 404s before touching anything else if this event doesn't exist or sits
  // outside req.user's towns — a 403 here would confirm to an out-of-scope
  // admin that the event exists at all (spec rule 3).
  await adminScope.assertEventInScope(req.user, eventId);

  const { event, notifications } = await admin.updateEventStatus(eventId, status);
  if (status === 'approved') {
    realtime.emit('new_event_created', {
      id: event.id,
      title: event.title,
      groom_name: event.groom_name,
      town: event.town,
      event_date: event.event_date
    });
  }

  // One channel per recipient — only whoever is connected right now ever
  // sees this; everyone else only has the notifications row until FCM (#19).
  for (const notification of notifications) {
    realtime.emit(`new_notification_${notification.user_id}`, notification);
  }

  const label = { approved: 'معتمدة ومنشورة', rejected: 'مرفوضة', pending: 'بانتظار المراجعة' }[status];
  res.json({ success: true, message: `تم تحديث حالة المناسبة إلى (${label})`, event });
}));

router.get('/admin/events/:id/amendments', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  await adminScope.assertEventInScope(req.user, eventId);
  res.json({ success: true, amendments: await events.listAmendments(eventId) });
}));

router.delete('/admin/events/:id', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  await adminScope.assertEventInScope(req.user, eventId);
  await admin.deleteEvent(eventId);
  res.json({ success: true, message: 'تم حذف المناسبة بالكامل' });
}));

router.patch('/admin/events/:id/owner', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const newOwnerId = parseId(req.body.user_id, 'معرّف المستخدم الجديد');

  await adminScope.assertEventInScope(req.user, eventId);

  const event = await admin.transferEventOwnership(eventId, newOwnerId);
  res.json({ success: true, message: 'تم نقل ملكية المناسبة بنجاح', event });
}));

router.get('/admin/comments', asyncHandler(async (req, res) => {
  res.json({ success: true, comments: await admin.listComments(req.user) });
}));

// DELETE /admin/comments/:id is intentionally gone — it hard-deleted a row
// and bypassed the moderation system (`status='hidden'` + `moderated_by`)
// #20 step 5 already built. The replacement is a town-admin-aware widening
// of `PATCH /api/events/:id/congratulations/:cid`, owned by a sibling agent.

router.get('/admin/users', requireSuperAdmin, asyncHandler(async (req, res) => {
  res.json({ success: true, users: await admin.listUsers() });
}));

router.post('/admin/broadcast', requireSuperAdmin, asyncHandler(async (req, res) => {
  requireFields(req.body, ['message']);

  const title = cleanString(req.body.title, 200) || '📢 تنبيه عام من إدارة مناسبات النقب';
  const message = cleanString(req.body.message, 2000);

  await admin.recordBroadcast({ title, message, sentBy: req.user.id });
  realtime.emit('system_broadcast', {
    title,
    message,
    time: new Date().toLocaleTimeString('ar-EG'),
    created_at: new Date().toISOString()
  });

  res.json({ success: true, message: 'تم بث الإشعار لجميع المستخدمين بنجاح' });
}));

// --- Admin ↔ town assignment — super_admin only, guarded on this router too
// so a weaker guard (like this file's own `requireAdmin` above) can never end
// up protecting these paths instead (same reasoning as occasionTypes.routes.js). --
router.use('/admin/admins', requireSuperAdmin);

router.get('/admin/admins', asyncHandler(async (req, res) => {
  res.json({ success: true, admins: await admin.listAdminsWithTowns() });
}));

router.put('/admin/admins/:id/towns', asyncHandler(async (req, res) => {
  const adminId = parseId(req.params.id, 'معرّف الأدمن');

  if (!Array.isArray(req.body.towns)) {
    throw ApiError.badRequest('قائمة البلدات غير صالحة');
  }

  const towns = [...new Set(req.body.towns.map(town => cleanString(town, 100)))];
  for (const town of towns) {
    if (!town || !TOWNS.includes(town)) {
      throw ApiError.badRequest(`بلدة غير معروفة: ${town || ''}`);
    }
  }

  const savedTowns = await admin.setAdminTowns(adminId, towns);
  res.json({ success: true, towns: savedTowns, message: 'تم تحديث بلدات الأدمن بنجاح' });
}));

module.exports = router;
