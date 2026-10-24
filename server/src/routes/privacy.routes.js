'use strict';

/**
 * Privacy notice, self-service analytics erasure, and the access/erasure
 * request queue (issue #44, privacy layer). All SQL lives in
 * privacy.service.js — this file only validates, shapes, and guards.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const privacy = require('../services/privacy.service');
const { getPrivacyNotice } = require('../privacyNotice');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { cleanString, parseId } = require('../middleware/validate');
const { PRIVACY_REQUEST_TYPES, PRIVACY_REQUEST_DEADLINE_DAYS } = require('../constants');

const router = express.Router();

/**
 * The public deletion-request path accepts a phone number with no token at
 * all, so it is the one unauthenticated route in the API where a caller could
 * probe which numbers are registered. Its budget is far tighter than the
 * global one: no real person needs more than one request, and five per hour
 * per IP still absorbs a duplicate submission.
 */
const deletionRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات كثيرة جداً — يرجى المحاولة بعد قليل' }
});

/** Public — served from the server so web/ and mobile/ show the same text. */
router.get('/privacy/notice', asyncHandler(async (req, res) => {
  res.json({ success: true, notice: getPrivacyNotice() });
}));

/**
 * "Erasure is one query" — self-service, immediate, and scoped to the
 * caller's own rows only (the token proves who is asking; nothing in the
 * body can name a different user).
 */
router.post('/privacy/analytics-erasure', authenticate, asyncHandler(async (req, res) => {
  const result = await privacy.eraseAnalyticsForUser(req.user.id);
  res.json({ success: true, message: 'تم حذف بيانات التحليلات السلوكية الخاصة بك', ...result });
}));

/**
 * Access has no self-service fulfilment in this version — a super_admin
 * fulfils it by hand — so this only queues the request and states the
 * deadline. Erasure may also be filed here for a documented, handled-by
 * record, separate from the immediate button above.
 */
router.post('/privacy/requests', authenticate, asyncHandler(async (req, res) => {
  const requestType = cleanString(req.body && req.body.request_type, 20);
  if (!requestType || !PRIVACY_REQUEST_TYPES.includes(requestType)) {
    throw ApiError.badRequest('نوع الطلب غير معروف');
  }

  const request = await privacy.createRequest(req.user.id, requestType);
  res.status(201).json({
    success: true,
    request,
    message: `تم استلام طلبك — سيتم الرد خلال ${PRIVACY_REQUEST_DEADLINE_DAYS} يوماً`
  });
}));

/**
 * The no-app path Google Play's account-deletion policy asks for: a public
 * page files the request with nothing but the number the account was opened
 * with. No token, so nothing here may confirm whether that number exists —
 * the response is byte-identical for a registered number, a duplicate, and a
 * stranger, and only the admin queue ever learns which one happened.
 */
router.post('/privacy/deletion-request', deletionRequestLimiter, asyncHandler(async (req, res) => {
  const raw = cleanString(req.body && req.body.phone_number, 20);
  // Arabic-Indic and Persian digits are folded to ASCII before the shape check,
  // so the same number typed on an Arabic keyboard still passes.
  const digits = privacy.toAsciiDigits(raw);
  if (!raw || !/^[0-9+\s-]{7,20}$/.test(digits)) {
    throw ApiError.badRequest('رقم الهاتف غير صالح — أدخل رقماً صحيحاً مثل 0500000000');
  }

  // The internal outcome (matched / duplicate / unknown) is deliberately
  // discarded: any difference in this reply would make the route a way to test
  // which numbers have accounts.
  await privacy.fileDeletionRequest(raw);

  res.json({
    success: true,
    message: `وصلنا طلبك — إن كان هذا الرقم مسجّلاً عندنا فسيُحذف حسابه خلال ${PRIVACY_REQUEST_DEADLINE_DAYS} يوماً وسنتواصل معك على واتساب.`
  });
}));

// Super-admin only, guarded on this router itself — a weaker guard elsewhere
// on the `/admin` prefix (admin.routes.js's requireAdmin) does not protect
// these paths just because they share the prefix, same reasoning as
// villages.routes.js and occasionTypes.routes.js. Never a town admin: an
// access/erasure request cannot be meaningfully scoped to one town.
router.use('/admin/privacy-requests', requireSuperAdmin);

router.get('/admin/privacy-requests', asyncHandler(async (req, res) => {
  const status = cleanString(req.query.status, 20);
  res.json({ success: true, requests: await privacy.listRequests(status) });
}));

router.patch('/admin/privacy-requests/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف الطلب');
  const request = await privacy.closeRequest(id, req.user.id);
  res.json({ success: true, request, message: 'تم إغلاق الطلب' });
}));

module.exports = router;
