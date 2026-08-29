'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const auth = require('../services/auth.service');
const { authenticate } = require('../middleware/auth');
const { cleanString, requireFields, isValidPhone } = require('../middleware/validate');

const router = express.Router();

function normalisePhone(value) {
  return cleanString(String(value || '').replace(/[\s-]/g, ''), 20);
}

router.post('/auth/register', asyncHandler(async (req, res) => {
  requireFields(req.body, ['phone_number', 'full_name', 'pin_code']);

  const phone_number = normalisePhone(req.body.phone_number);
  if (!isValidPhone(phone_number)) {
    throw ApiError.badRequest('رقم الهاتف غير صالح');
  }

  const pin_code = cleanString(req.body.pin_code, 20);
  if (pin_code.length < 4) {
    throw ApiError.badRequest('رمز PIN يجب أن يكون 4 خانات على الأقل');
  }

  const result = await auth.register({
    phone_number,
    full_name: cleanString(req.body.full_name, 120),
    pin_code,
    clan_town: cleanString(req.body.clan_town, 100)
  });

  res.status(201).json({ success: true, ...result });
}));

router.post('/auth/login', asyncHandler(async (req, res) => {
  requireFields(req.body, ['phone_number', 'pin_code']);

  const result = await auth.login({
    phone_number: normalisePhone(req.body.phone_number),
    pin_code: cleanString(req.body.pin_code, 20)
  });

  res.json({ success: true, ...result });
}));

router.get('/auth/me', authenticate, asyncHandler(async (req, res) => {
  const user = await auth.findById(req.user.id);
  if (!user) throw ApiError.notFound('المستخدم غير موجود');
  res.json({ success: true, user });
}));

module.exports = router;
