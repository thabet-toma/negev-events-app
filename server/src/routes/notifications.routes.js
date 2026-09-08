'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const notifications = require('../services/notifications.service');
const push = require('../services/push.service');
const { authenticate } = require('../middleware/auth');
const { parseId, cleanString } = require('../middleware/validate');

const router = express.Router();

// This is the in-page notification centre for the web client (#20 step 7).
// Device delivery for the web/PWA is Web Push (issue #85, batch 4, below);
// the mobile APK path is still blocked on #19.

router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, notifications: await notifications.listForUser(req.user.id) });
}));

router.patch('/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
  const notificationId = parseId(req.params.id, 'معرّف الإشعار');
  await notifications.markRead(notificationId, req.user.id);
  res.json({ success: true });
}));

// The remaining countdown fire times for every event this user follows
// (issue #85, batch 3) — computed on the server so no client re-derives the
// offsets and drifts from what the scheduler itself will actually send.
router.get('/reminders/schedule', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, schedule: await notifications.scheduleForUser(req.user.id) });
}));

// The PUBLIC VAPID key a browser needs before it can create a subscription at
// all (issue #85, story 16-18). Public by design — never the private key.
router.get('/notifications/vapid-public-key', asyncHandler(async (req, res) => {
  res.json({ success: true, public_key: push.getPublicKey() });
}));

// Matches push_subscriptions.endpoint VARCHAR(500) — an over-length value
// must be REJECTED here, never silently shortened by cleanString's own
// slice(0, maxLength) (issue #85 review, FIX 1). A truncated capability URL
// still inserts cleanly and `subscribe` still answers success; every future
// push then hits a URL that never existed, gets a 404, and
// shouldDropSubscription reads that as "gone" and deletes the row — leaving
// a user who believes push is on, was never told otherwise, and has no way
// to recover.
const MAX_ENDPOINT_LENGTH = 500;

/**
 * Validates a raw `endpoint` string: present, no longer than the column that
 * stores it, and an absolute `https:` URL — a capability URL that is not
 * even a URL is not worth storing at all. Throws the same Arabic message
 * `parseSubscriptionBody` already used, rather than returning `null` for a
 * caller to re-decide how to fail.
 */
function parseEndpoint(rawEndpoint) {
  const endpoint = typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '';
  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw ApiError.badRequest('بيانات الاشتراك غير صالحة');
  }
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw ApiError.badRequest('بيانات الاشتراك غير صالحة');
  }
  if (parsed.protocol !== 'https:') {
    throw ApiError.badRequest('بيانات الاشتراك غير صالحة');
  }
  return endpoint;
}

/** Pulls `{ endpoint, p256dh, auth }` out of a browser PushSubscription.toJSON() body (`{ endpoint, keys: { p256dh, auth } }`), rejecting a malformed shape before it ever reaches push.service.js. */
function parseSubscriptionBody(body) {
  const endpoint = parseEndpoint(body.endpoint);
  const keys = body.keys || {};
  const p256dh = cleanString(keys.p256dh, 255);
  const auth = cleanString(keys.auth, 255);
  if (!p256dh || !auth) {
    throw ApiError.badRequest('بيانات الاشتراك غير صالحة');
  }
  return { endpoint, p256dh, auth };
}

router.post('/notifications/subscribe', authenticate, asyncHandler(async (req, res) => {
  const subscription = parseSubscriptionBody(req.body || {});
  await push.subscribe(req.user.id, subscription);
  res.json({ success: true });
}));

router.delete('/notifications/subscribe', authenticate, asyncHandler(async (req, res) => {
  const endpoint = parseEndpoint((req.body || {}).endpoint);
  await push.unsubscribe(req.user.id, endpoint);
  res.json({ success: true });
}));

module.exports = router;
