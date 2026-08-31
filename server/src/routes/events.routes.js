'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const events = require('../services/events.service');
const occasionTypes = require('../services/occasionTypes.service');
const realtime = require('../realtime');
const { eventMedia } = require('../middleware/upload');
const { authenticate, ADMIN_ROLES } = require('../middleware/auth');
const {
  cleanString, requireFields, requireDate, optionalDate, parseCoordinate, parseId, parseHonorees, MAX_HONOREES
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

/**
 * Formatters for every field an occasion type may show/hide, beyond the
 * three structural ones (occasion_type_id, honorees, town, event_date)
 * handled directly above. A field absent from `fieldsByKey` is hidden for
 * this type, so its submitted value — if any — is dropped silently instead
 * of being stored or rejected: an old client sending e.g. `youth_party_date`
 * on a عزا must not have its whole request break over it.
 */
function buildOptionalFieldFormatters(req, posterFile, audioFile) {
  return {
    title: () => cleanString(req.body.title, 255),
    family_clan: () => cleanString(req.body.family_clan, 150),
    location_name: () => cleanString(req.body.location_name, 1000),
    secondary_location_name: () => cleanString(req.body.secondary_location_name, 1000),
    event_end_date: () => optionalDate(req.body.event_end_date),
    youth_party_date: () => optionalDate(req.body.youth_party_date),
    dinner_time: () => cleanString(req.body.dinner_time, 100),
    poster_url: () => (posterFile ? `/uploads/${posterFile.filename}` : cleanString(req.body.custom_poster_url, 2000)),
    audio_url: () => (audioFile ? `/uploads/${audioFile.filename}` : null),
    audio_title: () => cleanString(req.body.audio_title, 200),
    host_phone: () => cleanString(req.body.host_phone, 30)
  };
}

router.post('/events', authenticate, eventMedia, asyncHandler(async (req, res) => {
  const occasionTypeId = parseId(req.body.occasion_type_id, 'نوع المناسبة');
  const type = await occasionTypes.getTypeById(occasionTypeId);
  if (!type || !type.is_active) {
    throw ApiError.badRequest('نوع المناسبة غير معروف أو غير نشِط');
  }

  const fieldsByKey = {};
  for (const field of type.fields) fieldsByKey[field.field_key] = field;
  const labelOf = (key, fallback) => fieldsByKey[key]?.label || fallback;

  // Structural fields: always required regardless of is_required — either a
  // NOT NULL column (town, event_date) or the row groom_name is derived from
  // (honorees) — but the message uses this type's own label for the field.
  const honorees = parseHonorees(req.body.honorees, { max: MAX_HONOREES });
  if (!honorees.length) {
    throw ApiError.badRequest(`${labelOf('honorees', 'أصحاب المناسبة')} مطلوب`);
  }

  const town = cleanString(req.body.town, 100);
  if (!town || !TOWNS.includes(town)) {
    throw ApiError.badRequest(`${labelOf('town', 'البلدة')} غير صالحة`);
  }

  const eventDate = requireDate(req.body.event_date, labelOf('event_date', 'تاريخ المناسبة'));

  const posterFile = req.files?.poster?.[0];
  const audioFile = req.files?.audio?.[0];

  const payload = {
    occasion_type_id: occasionTypeId,
    occasionTypeName: type.name,
    default_poster_url: type.default_poster_url,
    honorees,
    town,
    event_date: eventDate,
    latitude: parseCoordinate(req.body.latitude, 90),
    longitude: parseCoordinate(req.body.longitude, 180)
  };

  const formatters = buildOptionalFieldFormatters(req, posterFile, audioFile);
  for (const [key, formatter] of Object.entries(formatters)) {
    const field = fieldsByKey[key];
    if (!field) continue; // hidden for this occasion type — ignore any submitted value

    const value = formatter();
    if (field.is_required && (value === null || value === undefined)) {
      throw ApiError.badRequest(`${field.label} مطلوب`);
    }
    payload[key] = value;
  }

  // Ownership is built from the publish itself (authenticate above already
  // rejected an anonymous request). Admins still publish straight away;
  // everyone else lands in the moderation queue — unchanged behaviour.
  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const created = await events.createEvent(payload, {
    autoApprove: isAdmin,
    createdBy: req.user.id
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

// --- Event edit (owner or admin) -----------------------------------

router.patch('/events/:id', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const existing = await events.getEventForEdit(eventId);

  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  if (existing.created_by === null) {
    if (!isAdmin) {
      throw ApiError.forbidden('هذه المناسبة غير مرتبطة بأي حساب — التعديل عليها متاح للإدارة فقط حتى يطالب بها صاحبها');
    }
  } else if (existing.created_by !== req.user.id && !isAdmin) {
    throw ApiError.forbidden('لا تملك صلاحية تعديل هذه المناسبة');
  }

  const body = req.body || {};
  const changes = {};

  if (body.title !== undefined) changes.title = cleanString(body.title, 255) || existing.title;
  if (body.family_clan !== undefined) changes.family_clan = cleanString(body.family_clan, 150) || existing.family_clan;
  if (body.town !== undefined) {
    const town = cleanString(body.town, 100);
    if (!town || !TOWNS.includes(town)) throw ApiError.badRequest('البلدة المختارة غير معروفة');
    changes.town = town;
  }
  if (body.location_name !== undefined) {
    changes.location_name = cleanString(body.location_name, 1000) || existing.location_name;
  }
  if (body.secondary_location_name !== undefined) {
    changes.secondary_location_name = cleanString(body.secondary_location_name, 1000);
  }
  if (body.latitude !== undefined) changes.latitude = parseCoordinate(body.latitude, 90);
  if (body.longitude !== undefined) changes.longitude = parseCoordinate(body.longitude, 180);
  if (body.event_date !== undefined) changes.event_date = requireDate(body.event_date, 'تاريخ المناسبة');
  if (body.event_end_date !== undefined) changes.event_end_date = optionalDate(body.event_end_date);
  if (body.youth_party_date !== undefined) changes.youth_party_date = optionalDate(body.youth_party_date);
  if (body.dinner_time !== undefined) changes.dinner_time = cleanString(body.dinner_time, 100) || existing.dinner_time;
  if (body.poster_url !== undefined) changes.poster_url = cleanString(body.poster_url, 2000) || existing.poster_url;
  if (body.audio_url !== undefined) changes.audio_url = cleanString(body.audio_url, 2000);
  if (body.audio_title !== undefined) changes.audio_title = cleanString(body.audio_title, 200);
  if (body.host_phone !== undefined) changes.host_phone = cleanString(body.host_phone, 30);

  let honorees = null;
  if (body.honorees !== undefined) {
    honorees = parseHonorees(body.honorees, { max: MAX_HONOREES });
    if (!honorees.length) throw ApiError.badRequest('يجب إدخال اسم واحد على الأقل لأصحاب المناسبة');
  }

  if (!Object.keys(changes).length && honorees === null) {
    throw ApiError.badRequest('لم يتم إرسال أي تعديل');
  }

  const result = await events.updateEvent(eventId, existing, { changes, honorees });

  const message = result.amendment === 'critical'
    ? 'تم حفظ التعديل، ولأنه يمسّ تاريخ أو مكان المناسبة أُعيدت إلى قائمة المراجعة حتى تُعتمد مجدداً'
    : 'تم حفظ التعديل، والمناسبة تبقى منشورة كما هي';

  res.json({ success: true, message, amendment: result.amendment, status: result.status });
}));

// --- "My events" (owner only) ---------------------------------------

router.get('/my-events', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, events: await events.listMyEvents(req.user.id) });
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
