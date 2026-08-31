'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const notifications = require('../services/notifications.service');
const { authenticate } = require('../middleware/auth');
const { parseId } = require('../middleware/validate');

const router = express.Router();

// This is the in-page notification centre for the web client (#20 step 7) —
// delivery to a device (FCM) is out of scope here and blocked on #19.

router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, notifications: await notifications.listForUser(req.user.id) });
}));

router.patch('/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
  const notificationId = parseId(req.params.id, 'معرّف الإشعار');
  await notifications.markRead(notificationId, req.user.id);
  res.json({ success: true });
}));

module.exports = router;
