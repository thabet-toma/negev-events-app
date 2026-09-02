'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const events = require('../services/events.service');
const occasionTypes = require('../services/occasionTypes.service');
const villages = require('../services/villages.service');
const { isAdminForTown } = require('../services/adminScope.service');
const realtime = require('../realtime');
const { eventMedia } = require('../middleware/upload');
const { authenticate, optionalAuthenticate, ADMIN_ROLES } = require('../middleware/auth');
const {
  cleanString, requireDate, optionalDate, parseCoordinate, parseId, parseHonorees, MAX_HONOREES
} = require('../middleware/validate');
const { TOWNS, VILLAGES_TOWN, TOWN_COORDINATES, REACTION_TYPES } = require('../constants');

const router = express.Router();

// --- Public reads -------------------------------------------------

/**
 * No `X-App-Version` header at all → a pre-#20 client. Its presence, not its
 * value, is what matters: the platform only needs to know whether the caller
 * declared itself, not compare versions (that comparison is ADR-0004's, and
 * stays client-side) (#20 step 4, decision و).
 */
function isLegacyClient(req) {
  return !req.get('X-App-Version');
}

// `optionalAuthenticate`: an anonymous caller sees the list unchanged, but a
// logged-in one also gets `is_reminded` on every card, so the client knows
// which button state ("ذكّرني" on/off) to render without a second request.
router.get('/events', optionalAuthenticate, asyncHandler(async (req, res) => {
  const town = cleanString(req.query.town, 100);
  const search = cleanString(req.query.search, 100);
  const date = optionalDate(req.query.date);
  const occasionTypeId = req.query.occasion_type_id === undefined || req.query.occasion_type_id === null || req.query.occasion_type_id === ''
    ? null
    : parseId(req.query.occasion_type_id, 'نوع المناسبة');
  const villageId = req.query.village_id === undefined || req.query.village_id === null || req.query.village_id === ''
    ? null
    : parseId(req.query.village_id, 'القرية');
  const archive = req.query.archive === '1' || req.query.archive === 'true';
  const legacyOnly = isLegacyClient(req);

  const [result, announcements] = await Promise.all([
    events.listPublicEvents({
      town, search, date, occasionTypeId, villageId, archive, legacyOnly,
      page: req.query.page,
      limit: req.query.limit,
      userId: req.user ? req.user.id : null
    }),
    events.listLiveAnnouncements({ legacyOnly })
  ]);
  res.json({ success: true, ...result, announcements });
}));

router.get('/map/events', asyncHandler(async (req, res) => {
  res.json({ success: true, points: await events.listMapPoints({ legacyOnly: isLegacyClient(req) }) });
}));

/**
 * `town_coordinates` lives on this same endpoint (not a new one) — the map
 * picker already calls `GET /api/towns` to fill the town dropdown, so it
 * opens on the right centre from that one response instead of a second
 * round trip or a copy of `TOWN_COORDINATES` hardcoded into the web bundle
 * (#20 step 6, decision ١). 'القرى والتجمعات' has no key here on purpose —
 * it is a catch-all bucket, not a place a map can centre on.
 */
router.get('/towns', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    towns: ['الكل', ...TOWNS],
    town_coordinates: TOWN_COORDINATES,
    villages: await villages.listActive(),
    stats: await events.townStats()
  });
}));

// `optionalAuthenticate`: an anonymous caller still gets the event (public
// read, unchanged), but a logged-in one also sees their own pending
// congratulation tagged, never anyone else's (#20 step 5, decision 4).
router.get('/events/:id', optionalAuthenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const event = await events.getEventDetails(eventId, {
    legacyOnly: isLegacyClient(req),
    userId: req.user ? req.user.id : null
  });
  res.json({ success: true, event });
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
function buildOptionalFieldFormatters(req, posterFile, audioFile, artistImageFile) {
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
    host_phone: () => cleanString(req.body.host_phone, 30),
    artist_name: () => cleanString(req.body.artist_name, 150),
    // Same pattern as poster_url: an uploaded file wins, otherwise an
    // externally-hosted URL the publisher typed in — never a placeholder
    // when both are absent (#9, #11 — the field must vanish, not blank out).
    artist_image_url: () => (artistImageFile ? `/uploads/${artistImageFile.filename}` : cleanString(req.body.custom_artist_image_url, 2000))
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
    throw ApiError.badRequest(`قيمة ${labelOf('town', 'البلدة')} غير صالحة`);
  }

  // Integrity rule enforced here, not by the schema: `village_id` may only be
  // set under the villages catch-all, and a NEW publish under it must name
  // one (existing pre-villages rows stay NULL forever — never guessed).
  let villageId = req.body.village_id === undefined || req.body.village_id === null || req.body.village_id === ''
    ? null
    : parseId(req.body.village_id, 'القرية');
  if (villageId !== null && town !== VILLAGES_TOWN) {
    throw ApiError.badRequest('لا يمكن اختيار قرية إلا ضمن بند "القرى والتجمعات"');
  }
  if (town === VILLAGES_TOWN && villageId === null) {
    throw ApiError.badRequest('يرجى اختيار القرية');
  }
  let village = null;
  if (villageId !== null) {
    village = await villages.findActiveById(villageId);
    if (!village) throw ApiError.badRequest('القرية المختارة غير معروفة أو غير نشِطة');
  }

  const eventDate = requireDate(req.body.event_date, labelOf('event_date', 'تاريخ المناسبة'));

  const posterFile = req.files?.poster?.[0];
  const audioFile = req.files?.audio?.[0];
  const artistImageFile = req.files?.artist_image?.[0];

  const latitude = parseCoordinate(req.body.latitude, 90, 'خط العرض');
  const longitude = parseCoordinate(req.body.longitude, 180, 'خط الطول');
  // Computed on the values as submitted, before createEvent falls back to the
  // town's own centre for a missing pin — that fallback obviously agrees with
  // the chosen town, so it would never have anything to warn about anyway.
  const locationWarning = events.checkTownMismatch(town, latitude, longitude);

  const payload = {
    occasion_type_id: occasionTypeId,
    occasionTypeName: type.name,
    default_poster_url: type.default_poster_url,
    honorees,
    town,
    village_id: villageId,
    villageCoords: village ? { lat: village.latitude, lng: village.longitude } : null,
    event_date: eventDate,
    latitude,
    longitude
  };

  const formatters = buildOptionalFieldFormatters(req, posterFile, audioFile, artistImageFile);
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
  // rejected an anonymous request). An admin publishing in one of their own
  // towns still publishes straight away; outside their towns — or with no
  // towns assigned at all — the publish lands in the moderation queue like
  // anyone else's, never rejected (services-directory spec, story 25).
  const created = await events.createEvent(payload, {
    autoApprove: await isAdminForTown(req.user, town),
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
    status: created.status,
    location_warning: locationWarning
  });
}));

// --- Event edit (owner or admin) -----------------------------------

/**
 * Owner, super_admin, or an admin scoped to this event's town — governs
 * editing an event, reading/moderating its congratulations, and reading its
 * amendment log. `isAdminForTown` already resolves a super_admin to true
 * regardless of town, so a single call covers both admin tiers.
 */
async function assertCanManageEvent(req, existing) {
  if (existing.created_by !== null && existing.created_by === req.user.id) return;

  if (ADMIN_ROLES.includes(req.user.role) && await isAdminForTown(req.user, existing.town)) {
    return;
  }

  if (existing.created_by === null) {
    throw ApiError.forbidden('هذه المناسبة غير مرتبطة بأي حساب — الوصول إليها متاح للإدارة فقط حتى يطالب بها صاحبها');
  }
  throw ApiError.forbidden('لا تملك صلاحية الوصول إلى هذه المناسبة');
}

/** Arabic warning naming the conflicting event and its date — shared by the standalone check and the post-edit recheck. */
function buildCollisionMessage(conflict) {
  return `تعارض محتمل مع مناسبة "${conflict.title}" بتاريخ ${conflict.event_date}${conflict.town ? ` في ${conflict.town}` : ''}`;
}

router.patch('/events/:id', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const existing = await events.getEventForEdit(eventId);
  await assertCanManageEvent(req, existing);

  const body = req.body || {};
  const changes = {};

  if (body.title !== undefined) changes.title = cleanString(body.title, 255) || existing.title;
  if (body.family_clan !== undefined) changes.family_clan = cleanString(body.family_clan, 150) || existing.family_clan;
  if (body.town !== undefined) {
    const town = cleanString(body.town, 100);
    if (!town || !TOWNS.includes(town)) throw ApiError.badRequest('البلدة المختارة غير معروفة');
    changes.town = town;
    // Leaving the villages catch-all invalidates any village already on the
    // row — clear it here unless this same edit sets a new one below.
    if (town !== VILLAGES_TOWN && body.village_id === undefined) {
      changes.village_id = null;
    }
  }
  if (body.location_name !== undefined) {
    changes.location_name = cleanString(body.location_name, 1000) || existing.location_name;
  }
  if (body.secondary_location_name !== undefined) {
    changes.secondary_location_name = cleanString(body.secondary_location_name, 1000);
  }
  if (body.latitude !== undefined) changes.latitude = parseCoordinate(body.latitude, 90, 'خط العرض');
  if (body.longitude !== undefined) changes.longitude = parseCoordinate(body.longitude, 180, 'خط الطول');
  if (body.event_date !== undefined) changes.event_date = requireDate(body.event_date, 'تاريخ المناسبة');
  if (body.event_end_date !== undefined) changes.event_end_date = optionalDate(body.event_end_date);
  if (body.youth_party_date !== undefined) changes.youth_party_date = optionalDate(body.youth_party_date);
  if (body.dinner_time !== undefined) changes.dinner_time = cleanString(body.dinner_time, 100) || existing.dinner_time;
  if (body.poster_url !== undefined) changes.poster_url = cleanString(body.poster_url, 2000) || existing.poster_url;
  if (body.audio_url !== undefined) changes.audio_url = cleanString(body.audio_url, 2000);
  if (body.audio_title !== undefined) changes.audio_title = cleanString(body.audio_title, 200);
  if (body.host_phone !== undefined) changes.host_phone = cleanString(body.host_phone, 30);
  if (body.artist_name !== undefined) changes.artist_name = cleanString(body.artist_name, 150);
  if (body.artist_image_url !== undefined) changes.artist_image_url = cleanString(body.artist_image_url, 2000);

  if (body.village_id !== undefined) {
    const villageId = body.village_id === null || body.village_id === '' ? null : parseId(body.village_id, 'القرية');
    const finalTown = changes.town !== undefined ? changes.town : existing.town;
    if (villageId !== null && finalTown !== VILLAGES_TOWN) {
      throw ApiError.badRequest('لا يمكن اختيار قرية إلا ضمن بند "القرى والتجمعات"');
    }
    if (villageId !== null) {
      const village = await villages.findActiveById(villageId);
      if (!village) throw ApiError.badRequest('القرية المختارة غير معروفة أو غير نشِطة');
      // A village is a place, so moving the event to one moves its pin —
      // the same derivation createEvent does. Without this the row keeps the
      // old village's coordinates and Waze sends guests to the wrong place,
      // which is the exact failure villages exist to fix. An explicit map
      // pick in this same request still wins, as it does on create.
      if (body.latitude === undefined) changes.latitude = village.latitude;
      if (body.longitude === undefined) changes.longitude = village.longitude;
    }
    changes.village_id = villageId;
  }

  let honorees = null;
  if (body.honorees !== undefined) {
    honorees = parseHonorees(body.honorees, { max: MAX_HONOREES });
    if (!honorees.length) throw ApiError.badRequest('يجب إدخال اسم واحد على الأقل لأصحاب المناسبة');
  }

  if (!Object.keys(changes).length && honorees === null) {
    throw ApiError.badRequest('لم يتم إرسال أي تعديل');
  }

  // Same check as on publish, run on the values this edit actually lands on
  // — the field(s) that didn't change fall back to what's already on the row
  // — but only when the edit touches location at all, so an edit that never
  // mentions latitude/longitude/town never has anything new to warn about.
  let locationWarning = null;
  if (body.latitude !== undefined || body.longitude !== undefined || body.town !== undefined) {
    const finalTown = changes.town !== undefined ? changes.town : existing.town;
    const finalLatitude = changes.latitude !== undefined ? changes.latitude : existing.latitude;
    const finalLongitude = changes.longitude !== undefined ? changes.longitude : existing.longitude;
    locationWarning = events.checkTownMismatch(finalTown, finalLatitude, finalLongitude);
  }

  const result = await events.updateEvent(eventId, existing, { changes, honorees, changedBy: req.user.id });

  let message = result.amendment === 'critical'
    ? 'تم حفظ التعديل، ولأنه يمسّ تاريخ أو مكان المناسبة أُعيدت إلى قائمة المراجعة حتى تُعتمد مجدداً'
    : 'تم حفظ التعديل، والمناسبة تبقى منشورة كما هي';

  if (result.collision?.hasCollision) {
    message += ` — تنبيه: ${buildCollisionMessage(result.collision.conflicts[0])}`;
  }

  res.json({
    success: true,
    message,
    amendment: result.amendment,
    status: result.status,
    collision: result.collision,
    location_warning: locationWarning
  });
}));

// --- "My events" (owner only) ---------------------------------------

router.get('/my-events', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, events: await events.listMyEvents(req.user.id) });
}));

// --- "ذكّرني" (follow, not RSVP — no attendance, no "لن أحضر") -----

router.post('/events/:id/remind', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  await events.setReminder(eventId, req.user.id);
  res.json({ success: true, message: 'تم تفعيل التذكير' });
}));

router.delete('/events/:id/remind', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  await events.removeReminder(eventId, req.user.id);
  res.json({ success: true, message: 'تم إلغاء التذكير' });
}));

router.get('/my-reminders', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, events: await events.listMyReminders(req.user.id) });
}));

// --- Amendment log (owner or admin) ---------------------------------

router.get('/events/:id/amendments', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const existing = await events.getEventForEdit(eventId);
  await assertCanManageEvent(req, existing);

  res.json({ success: true, amendments: await events.listAmendments(eventId) });
}));

// --- Date collision check -----------------------------------------

router.post('/check-collision', asyncHandler(async (req, res) => {
  const date = requireDate(req.body.date, 'التاريخ');
  const town = cleanString(req.body.town, 100);
  const endDate = optionalDate(req.body.event_end_date);
  const occasionTypeId = req.body.occasion_type_id === undefined || req.body.occasion_type_id === null || req.body.occasion_type_id === ''
    ? null
    : parseId(req.body.occasion_type_id, 'نوع المناسبة');

  const conflicts = await events.findCollisions({ date, endDate, town, occasionTypeId });
  res.json({
    success: true,
    hasCollision: conflicts.length > 0,
    count: conflicts.length,
    conflicts,
    message: conflicts.length ? buildCollisionMessage(conflicts[0]) : null
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

// Ten congratulations per user per ten minutes — generous for a genuine
// well-wisher, tight enough to blunt a repeat offender who used to just
// resubmit after a delete. Keyed by the authenticated user, not the IP,
// since accountability (not address) is the point of requiring a login here
// (#20 step 5, decision ١).
const congratulateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `congratulate:${req.user.id}`,
  message: { success: false, message: 'عدد التبريكات تجاوز الحد المسموح — يرجى المحاولة لاحقاً' }
});

/**
 * Requires a login (#20 step 5, decision ١): accountability, the ability to
 * block a repeat offender, and a per-person rate limit all need an identity
 * a delete-and-resubmit can't shed. `sender_name` is derived from the account
 * — never the request body — for the same reason; an admin may override it
 * (useful when relaying a message on someone's behalf), everyone else cannot.
 */
router.post('/events/:id/congratulate', authenticate, congratulateLimiter, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const message = cleanString(req.body.message, 2000);
  if (!message) throw ApiError.badRequest('نص التبريكة مطلوب');

  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const senderNameOverride = isAdmin ? cleanString(req.body.sender_name, 120) : null;

  const comment = await events.addCongratulation(eventId, {
    userId: req.user.id,
    senderName: senderNameOverride || req.user.full_name,
    badgeTitleOverride: cleanString(req.body.badge_title, 80),
    message,
    stickerUrl: cleanString(req.body.sticker_url, 2000)
  });

  // A pending تعزية is the harm itself if it broadcasts — only an approved
  // one reaches every connected client (#20 step 5, decision ٢).
  if (comment.status === 'approved') {
    realtime.emit(`new_congratulation_${eventId}`, comment);
  }

  res.status(201).json({ success: true, comment });
}));

const CONGRATULATION_STATUSES = ['pending', 'approved', 'hidden'];

/** Owner/admin moderation queue for one event's congratulations, optionally filtered by `?status=`. */
router.get('/events/:id/congratulations', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const existing = await events.getEventForEdit(eventId);
  await assertCanManageEvent(req, existing);

  const status = cleanString(req.query.status, 20);
  if (status && !CONGRATULATION_STATUSES.includes(status)) {
    throw ApiError.badRequest('حالة غير صالحة');
  }

  res.json({ success: true, comments: await events.listCongratulationsForModeration(eventId, status) });
}));

/** Owner or admin approves/rejects a pending (or previously hidden) congratulation — same ownership rule as editing the event. */
router.patch('/events/:id/congratulations/:cid', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const congratulationId = parseId(req.params.cid, 'معرّف التبريكة');
  const existing = await events.getEventForEdit(eventId);
  await assertCanManageEvent(req, existing);

  const action = cleanString(req.body.action, 20);
  if (!['approve', 'reject'].includes(action)) {
    throw ApiError.badRequest('إجراء غير صالح — approve أو reject فقط');
  }

  // The owner may not undo a block an admin placed (#38): if this message is
  // currently hidden by someone other than the owner, lifting it back to
  // approved requires being that same admin's scope (or a super_admin) —
  // assertCanManageEvent above already let the owner through on ownership
  // alone, so the extra check happens only here, only for 'approve'. Hiding
  // (action 'reject') is untouched — the owner's own right to hide a message
  // on their page (#37) never needed this gate.
  if (action === 'approve') {
    const congratulation = await events.getCongratulationById(eventId, congratulationId);
    if (!congratulation) throw ApiError.notFound('التعليق غير موجود');

    const blockedByOther = congratulation.status === 'hidden'
      && congratulation.moderated_by !== null
      && congratulation.moderated_by !== existing.created_by;

    if (blockedByOther) {
      const isAdminInScope = ADMIN_ROLES.includes(req.user.role) && await isAdminForTown(req.user, existing.town);
      if (!isAdminInScope) {
        throw ApiError.forbidden('لا يمكنك رفع حجب وضعه أحد المشرفين على هذه الرسالة');
      }
    }
  }

  const comment = await events.moderateCongratulation(eventId, congratulationId, { action, moderatedBy: req.user.id });

  if (action === 'approve') {
    realtime.emit(`new_congratulation_${eventId}`, comment);
  }

  res.json({ success: true, comment });
}));

/** Owner or admin deletes a congratulation on their own event — an ownership right, in every occasion type, not an admin-only power (#20 step 5, decision ٥). */
router.delete('/events/:id/congratulations/:cid', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const congratulationId = parseId(req.params.cid, 'معرّف التبريكة');
  const existing = await events.getEventForEdit(eventId);
  await assertCanManageEvent(req, existing);

  await events.deleteCongratulation(eventId, congratulationId);
  res.json({ success: true, message: 'تم حذف التبريكة بنجاح' });
}));

/** Any logged-in user may report a congratulation once; past the threshold it auto-hides pending human review. */
router.post('/events/:id/congratulations/:cid/report', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const congratulationId = parseId(req.params.cid, 'معرّف التبريكة');

  const result = await events.reportCongratulation(eventId, congratulationId, req.user.id);
  res.json({ success: true, ...result });
}));

module.exports = router;
