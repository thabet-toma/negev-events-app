'use strict';

/**
 * «الأشخاص» في اللوحة (تذكرة #107، ADR-0011).
 *
 * حارسُ هذا الراوتر `requireSuperAdmin` حصراً — لا `requireAdmin` — لأن الدمج
 * يعبر البلاد ويغيّر هوية اسم، و`adminScope` لا يملك مفهوماً لـ«شخص» بل لبلدة.
 * وهو حارسٌ على هذا الراوتر وحده: كل راوتر يحمل حارسه، وحارسُ `admin.routes.js`
 * لا يحمي راوتراً آخر يشارك بادئة `/admin` — البادئة نفسها ليست حارساً.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const people = require('../services/people.service');
const { requireSuperAdmin } = require('../middleware/auth');
const { cleanString, parseId } = require('../middleware/validate');

const router = express.Router();

router.use('/admin/people', requireSuperAdmin);

router.get('/admin/people', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    people: await people.listForAdmin(cleanString(req.query.q, 100), 50)
  });
}));

/**
 * `POST /admin/people/:id/merge` — `:id` هو الباقي، و`from_id` هو المندمج
 * والمحذوف. و`into_id` في الجسم مقبول أيضاً كما تنصّ التذكرة.
 */
router.post('/admin/people/:id/merge', asyncHandler(async (req, res) => {
  const intoId = parseId(req.params.id, 'معرّف الشخص الباقي');
  const body = req.body || {};
  if (body.into_id !== undefined && parseId(body.into_id, 'معرّف الشخص الباقي') !== intoId) {
    res.status(400).json({ success: false, message: 'معرّف الشخص الباقي غير متوافق بين المسار والجسم' });
    return;
  }
  const fromId = parseId(body.from_id, 'معرّف الشخص المدموج');
  const result = await people.mergeTwo(fromId, intoId, req.user.id);
  res.json({
    success: true,
    ...result,
    message: 'تم الدمج — صار الاسم واحداً، وكل صوره ومناسبه تحته'
  });
}));

module.exports = router;
