'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const occasionTypes = require('../services/occasionTypes.service');
const { requireSuperAdmin } = require('../middleware/auth');
const { cleanString, requireFields, parseId } = require('../middleware/validate');
const { REACTION_TYPES, OCCASION_FIELD_KEYS, CORE_OCCASION_FIELDS, OCCASION_TONES } = require('../constants');

const router = express.Router();

// Shown by the admin panel next to the type list — the copy lives here, once,
// instead of being re-typed in every client.
const UNPUBLISHED_TYPE_NOTICE =
  'هذا النوع لن يظهر في نسخ التطبيق المنشورة حالياً. يظهر بعد إصدار نسخة تدعمه.';

/** النغمة من مفردات الكود وحدها — الأدمن يختار منها ولا يخترع واحدة. */
function parseTone(value) {
  const tone = cleanString(value, 20) || 'festive';
  if (!OCCASION_TONES.includes(tone)) {
    throw ApiError.badRequest('نغمة نوع المناسبة غير معروفة');
  }
  return tone;
}

/** Validates and normalises a submitted field-config array. Route-layer: no DB access. */
function parseFields(rawFields) {
  if (!Array.isArray(rawFields) || !rawFields.length) {
    throw ApiError.badRequest('يجب تحديد حقول نوع المناسبة');
  }

  const seenKeys = new Set();
  const fields = rawFields.map((field, index) => {
    const fieldKey = cleanString(field.field_key, 60);
    if (!OCCASION_FIELD_KEYS.includes(fieldKey)) {
      throw ApiError.badRequest(`الحقل "${field.field_key}" غير معروف`);
    }
    if (seenKeys.has(fieldKey)) {
      throw ApiError.badRequest(`الحقل "${fieldKey}" مكرر في قائمة الحقول`);
    }
    seenKeys.add(fieldKey);

    const isVisible = Boolean(field.is_visible);
    const isRequired = Boolean(field.is_required);
    if (isRequired && !isVisible) {
      throw ApiError.badRequest(`لا يمكن إخفاء الحقل "${fieldKey}" وهو موسوم كإجباري`);
    }

    return {
      field_key: fieldKey,
      label: cleanString(field.label, 80) || fieldKey,
      is_visible: isVisible,
      is_required: isRequired,
      position: Number.isInteger(field.position) ? field.position : index + 1
    };
  });

  for (const coreKey of CORE_OCCASION_FIELDS) {
    const field = fields.find(f => f.field_key === coreKey);
    if (!field || !field.is_visible) {
      throw ApiError.badRequest('لا يمكن حفظ نوع مناسبة بلا أصحاب المناسبة والبلدة وتاريخ المناسبة ظاهرة');
    }
  }

  return fields;
}

/** Validates a submitted reaction-type array. An empty list is valid (e.g. عزا). */
function parseReactions(rawReactions) {
  if (!Array.isArray(rawReactions)) {
    throw ApiError.badRequest('قائمة التفاعلات غير صالحة');
  }
  for (const reactionType of rawReactions) {
    if (!REACTION_TYPES.includes(reactionType)) {
      throw ApiError.badRequest(`نوع التفاعل "${reactionType}" غير معروف`);
    }
  }
  return [...new Set(rawReactions)];
}

// --- Public read -----------------------------------------------------

router.get('/occasion-types', asyncHandler(async (req, res) => {
  res.json({ success: true, types: await occasionTypes.listPublicTypes() });
}));

// --- Admin management — super_admin only, guarded on this router too so a
// weaker guard registered elsewhere (e.g. admin.routes.js's requireAdmin)
// can never end up protecting these paths instead. --------------------

router.use('/admin/occasion-types', requireSuperAdmin);

router.get('/admin/occasion-types', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    types: await occasionTypes.listAllTypesForAdmin(),
    notice: UNPUBLISHED_TYPE_NOTICE
  });
}));

router.post('/admin/occasion-types', asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'icon', 'color']);

  const payload = {
    name: cleanString(req.body.name, 60),
    icon: cleanString(req.body.icon, 60),
    color: cleanString(req.body.color, 20),
    position: Number.isInteger(req.body.position) ? req.body.position : 0,
    is_active: req.body.is_active !== false,
    creates_collision: Boolean(req.body.creates_collision),
    warns_others: Boolean(req.body.warns_others),
    premoderate_messages: Boolean(req.body.premoderate_messages),
    show_congratulations_count: req.body.show_congratulations_count !== false,
    show_followers_count: req.body.show_followers_count !== false,
    show_views_count: req.body.show_views_count !== false,
    // Defaults to false on purpose: a type created today cannot be rendered
    // by a build already on people's phones. It is flipped when a build
    // that understands it ships — which is what the standing notice says.
    legacy_client_supported: Boolean(req.body.legacy_client_supported),
    tone: parseTone(req.body.tone),
    congratulations_label: cleanString(req.body.congratulations_label, 40) || 'تبريكات',
    default_badge_title: cleanString(req.body.default_badge_title, 80),
    fields: parseFields(req.body.fields),
    reactions: parseReactions(req.body.reactions || [])
  };

  const typeId = await occasionTypes.createType(payload);
  res.status(201).json({ success: true, typeId, message: 'تم إنشاء نوع المناسبة بنجاح' });
}));

router.patch('/admin/occasion-types/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف نوع المناسبة');
  const body = req.body || {};
  const payload = {};

  if (body.name !== undefined) payload.name = cleanString(body.name, 60);
  if (body.icon !== undefined) payload.icon = cleanString(body.icon, 60);
  if (body.color !== undefined) payload.color = cleanString(body.color, 20);
  if (body.position !== undefined) payload.position = Number.isInteger(body.position) ? body.position : 0;
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);
  if (body.creates_collision !== undefined) payload.creates_collision = Boolean(body.creates_collision);
  if (body.warns_others !== undefined) payload.warns_others = Boolean(body.warns_others);
  if (body.premoderate_messages !== undefined) payload.premoderate_messages = Boolean(body.premoderate_messages);
  if (body.show_congratulations_count !== undefined) {
    payload.show_congratulations_count = Boolean(body.show_congratulations_count);
  }
  if (body.show_followers_count !== undefined) payload.show_followers_count = Boolean(body.show_followers_count);
  if (body.show_views_count !== undefined) payload.show_views_count = Boolean(body.show_views_count);
  if (body.legacy_client_supported !== undefined) {
    payload.legacy_client_supported = Boolean(body.legacy_client_supported);
  }
  if (body.tone !== undefined) payload.tone = parseTone(body.tone);
  if (body.congratulations_label !== undefined) payload.congratulations_label = cleanString(body.congratulations_label, 40);
  if (body.default_badge_title !== undefined) payload.default_badge_title = cleanString(body.default_badge_title, 80);
  if (body.fields !== undefined) payload.fields = parseFields(body.fields);
  if (body.reactions !== undefined) payload.reactions = parseReactions(body.reactions);

  const type = await occasionTypes.updateType(id, payload);
  res.json({ success: true, type, message: 'تم تحديث نوع المناسبة بنجاح' });
}));

router.delete('/admin/occasion-types/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف نوع المناسبة');
  const result = await occasionTypes.deleteType(id);
  res.json({ success: true, message: 'تم حذف نوع المناسبة بنجاح', ...result });
}));

module.exports = router;
