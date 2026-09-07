'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const broadcasts = require('../services/broadcasts.service');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { parseId } = require('../middleware/validate');

const router = express.Router();

/**
 * The live ticker read (issue #85, story 28). Not named in the spec's own
 * API table — the merged `GET /api/notifications` is behind `authenticate`,
 * so without this an anonymous visitor opening the site would see no ticker
 * at all, silently narrowing "عند فتح الصفحة" to "after logging in".
 * Deliberate deviation, `optionalAuthenticate`: global broadcasts for
 * everyone, plus the caller's own town's broadcasts when signed in.
 *
 * ⚠️ An anonymous visitor can see this ticker but can never dismiss a
 * broadcast on it — `PATCH /broadcasts/:id/dismiss` below requires a
 * `user_id` to key `broadcast_views` on, and this project is stateless JWT
 * with no cookies, so there is no anonymous identity to key a row on
 * instead. Do not invent one here. Story 29 ("لا يعود بعد إعادة التحميل")
 * still needs to hold for an anonymous visitor — the fix belongs client-side
 * (batch 5: remember a dismissed broadcast id locally, e.g. localStorage,
 * for a visitor with no token), not as a new server-side identity.
 */
router.get('/broadcasts/live', optionalAuthenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, broadcasts: await broadcasts.listLive(req.user) });
}));

router.patch('/broadcasts/:id/dismiss', authenticate, asyncHandler(async (req, res) => {
  const broadcastId = parseId(req.params.id, 'معرّف التعميم');
  await broadcasts.dismiss(req.user.id, broadcastId);
  res.json({ success: true });
}));

module.exports = router;
