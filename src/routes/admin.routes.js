'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const admin = require('../services/admin.service');
const auth = require('../services/auth.service');
const realtime = require('../realtime');
const { requireAdmin } = require('../middleware/auth');
const { cleanString, requireFields, parseId } = require('../middleware/validate');
const { EVENT_STATUSES } = require('../constants');

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

router.get('/admin/stats', asyncHandler(async (req, res) => {
  res.json({ success: true, stats: await admin.stats() });
}));

router.get('/admin/events', asyncHandler(async (req, res) => {
  const status = cleanString(req.query.status, 20);
  if (status && !EVENT_STATUSES.includes(status)) {
    throw ApiError.badRequest('حالة غير صالحة');
  }
  res.json({ success: true, events: await admin.listEvents(status) });
}));

router.patch('/admin/events/:id/status', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const status = cleanString(req.body.status, 20);

  if (!EVENT_STATUSES.includes(status)) {
    throw ApiError.badRequest('حالة غير صالحة');
  }

  const event = await admin.updateEventStatus(eventId, status);
  if (status === 'approved') {
    realtime.emit('new_event_created', {
      id: event.id,
      title: event.title,
      groom_name: event.groom_name,
      town: event.town,
      event_date: event.event_date
    });
  }

  const label = { approved: 'معتمدة ومنشورة', rejected: 'مرفوضة', pending: 'بانتظار المراجعة' }[status];
  res.json({ success: true, message: `تم تحديث حالة المناسبة إلى (${label})`, event });
}));

router.delete('/admin/events/:id', asyncHandler(async (req, res) => {
  await admin.deleteEvent(parseId(req.params.id, 'معرّف المناسبة'));
  res.json({ success: true, message: 'تم حذف المناسبة بالكامل' });
}));

router.get('/admin/comments', asyncHandler(async (req, res) => {
  res.json({ success: true, comments: await admin.listComments() });
}));

router.delete('/admin/comments/:id', asyncHandler(async (req, res) => {
  await admin.deleteComment(parseId(req.params.id, 'معرّف التعليق'));
  res.json({ success: true, message: 'تم حذف التعليق بنجاح' });
}));

router.get('/admin/users', asyncHandler(async (req, res) => {
  res.json({ success: true, users: await admin.listUsers() });
}));

router.post('/admin/broadcast', asyncHandler(async (req, res) => {
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

module.exports = router;
