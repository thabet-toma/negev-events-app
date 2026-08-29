'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const nokoot = require('../services/nokoot.service');
const { authenticate } = require('../middleware/auth');
const {
  cleanString, requireFields, requireDate, parseAmount, parseId
} = require('../middleware/validate');

const router = express.Router();

// The nokoot ledger is private: every route is scoped to the signed-in user.
router.use('/nokoot', authenticate);

router.get('/nokoot', asyncHandler(async (req, res) => {
  const ledger = await nokoot.listForUser(req.user.id);
  res.json({ success: true, ...ledger });
}));

router.post('/nokoot', asyncHandler(async (req, res) => {
  requireFields(req.body, ['recipient_name', 'amount', 'event_date']);

  const recordId = await nokoot.create(req.user.id, {
    recipient_name: cleanString(req.body.recipient_name, 150),
    clan_town: cleanString(req.body.clan_town, 100),
    amount: parseAmount(req.body.amount),
    currency: cleanString(req.body.currency, 10),
    occasion_type: cleanString(req.body.occasion_type, 50),
    event_date: requireDate(req.body.event_date, 'تاريخ المناسبة'),
    notes: cleanString(req.body.notes, 2000)
  });

  res.status(201).json({ success: true, message: 'تم حفظ قيد النقوط في السجل بنجاح', recordId });
}));

router.delete('/nokoot/:id', asyncHandler(async (req, res) => {
  const recordId = parseId(req.params.id, 'معرّف القيد');
  await nokoot.remove(req.user.id, recordId);
  res.json({ success: true, message: 'تم حذف القيد' });
}));

module.exports = router;
