'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const events = require('../services/events.service');
const realtime = require('../realtime');
const { eventMedia } = require('../middleware/upload');
const { optionalAuthenticate, ADMIN_ROLES } = require('../middleware/auth');
const {
  cleanString, requireFields, requireDate, optionalDate, parseCoordinate, parseId
} = require('../middleware/validate');
const { TOWNS, REACTION_TYPES } = require('../constants');

const router = express.Router();

// --- Public reads -------------------------------------------------

router.get('/events', asyncHandler(async (req, res) => {
  const town = cleanString(req.query.town, 100);
  const search = cleanString(req.query.search, 100);
  const date = optionalDate(req.query.date);

  const list = await events.listPublicEvents({ town, search, date });
  res.json({ success: true, events: list });
}));

router.get('/stories', asyncHandler(async (req, res) => {
  res.json({ success: true, stories: await events.listStories() });
}));

router.get('/map/events', asyncHandler(async (req, res) => {
  res.json({ success: true, points: await events.listMapPoints() });
}));

router.get('/towns', asyncHandler(async (req, res) => {
  res.json({ success: true, towns: ['الكل', ...TOWNS], stats: await events.townStats() });
}));

router.get('/events/:id', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  res.json({ success: true, event: await events.getEventDetails(eventId) });
}));

// --- Event submission ---------------------------------------------

router.post('/events', optionalAuthenticate, eventMedia, asyncHandler(async (req, res) => {
  requireFields(req.body, ['groom_name', 'town', 'event_date', 'location_name']);

  const town = cleanString(req.body.town, 100);
  if (!TOWNS.includes(town)) {
    throw ApiError.badRequest('البلدة المختارة غير معروفة');
  }

  const posterFile = req.files?.poster?.[0];
  const audioFile = req.files?.audio?.[0];

  const payload = {
    title: cleanString(req.body.title, 255),
    groom_name: cleanString(req.body.groom_name, 150),
    family_clan: cleanString(req.body.family_clan, 150),
    town,
    location_name: cleanString(req.body.location_name, 1000),
    latitude: parseCoordinate(req.body.latitude, 90),
    longitude: parseCoordinate(req.body.longitude, 180),
    event_date: requireDate(req.body.event_date, 'تاريخ المناسبة'),
    youth_party_date: optionalDate(req.body.youth_party_date),
    dinner_time: cleanString(req.body.dinner_time, 100),
    poster_url: posterFile ? `/uploads/${posterFile.filename}` : cleanString(req.body.custom_poster_url, 2000),
    audio_url: audioFile ? `/uploads/${audioFile.filename}` : null,
    audio_title: cleanString(req.body.audio_title, 200),
    host_phone: cleanString(req.body.host_phone, 30)
  };

  // Admins publish straight away; public submissions go to the moderation queue.
  const isAdmin = Boolean(req.user && ADMIN_ROLES.includes(req.user.role));
  const created = await events.createEvent(payload, {
    autoApprove: isAdmin,
    createdBy: req.user?.id ?? null
  });

  realtime.emit('admin_new_pending_event', created);
  if (created.status === 'approved') {
    realtime.emit('new_event_created', created);
  }

  res.status(201).json({
    success: true,
    message: created.status === 'approved'
      ? 'تم نشر المناسبة فوراً بنجاح!'
      : 'تم استلام طلب المناسبة بنجاح! سيتم مراجعته واعتماده من قبل الإدارة خلال دقائق.',
    eventId: created.id,
    status: created.status
  });
}));

// --- Date collision check -----------------------------------------

router.post('/check-collision', asyncHandler(async (req, res) => {
  const date = requireDate(req.body.date, 'التاريخ');
  const town = cleanString(req.body.town, 100);

  const conflicts = await events.findCollisions({ date, town });
  res.json({
    success: true,
    hasCollision: conflicts.length > 0,
    count: conflicts.length,
    conflicts
  });
}));

// --- Reactions & congratulations ----------------------------------

router.post('/events/:id/react', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const reactionType = cleanString(req.body.reaction_type, 30);

  if (!REACTION_TYPES.includes(reactionType)) {
    throw ApiError.badRequest('نوع التفاعل غير صالح');
  }

  await events.addReaction(eventId, reactionType, cleanString(req.body.user_identifier, 100));
  realtime.emit(`event_reaction_${eventId}`, { eventId, reaction_type: reactionType });

  res.json({ success: true });
}));

router.post('/events/:id/congratulate', asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  requireFields(req.body, ['sender_name', 'message']);

  const comment = await events.addCongratulation(eventId, {
    sender_name: cleanString(req.body.sender_name, 120),
    badge_title: cleanString(req.body.badge_title, 80),
    message: cleanString(req.body.message, 2000),
    sticker_url: cleanString(req.body.sticker_url, 2000)
  });

  realtime.emit(`new_congratulation_${eventId}`, comment);
  res.status(201).json({ success: true, comment });
}));

module.exports = router;
