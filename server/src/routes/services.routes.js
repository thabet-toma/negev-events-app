'use strict';

const express = require('express');
const fsp = require('fs/promises');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const services = require('../services/services.service');
const events = require('../services/events.service');
const activity = require('../services/activity.service');
const { authenticate, optionalAuthenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { regionIdForRequest } = require('../middleware/region');
const { serviceMedia } = require('../middleware/upload');
const cloudinary = require('../services/cloudinary.service');
const { cleanString, requireFields, parseId, parseAmount, isValidPhone } = require('../middleware/validate');
const townsService = require('../services/towns.service');

const router = express.Router();

/**
 * شكل معرّف الزائر (تذكرة #185): 16..64 حرفاً من `[A-Za-z0-9_-]` يولّده
 * العميل عشوائياً. ما لا يطابق يُعتبر غائباً — لا 400 ولا مفتاح مشوّه يُخزَّن.
 */
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Parses a submitted `towns` array — non-empty, deduplicated; membership/containment checked by the service layer. */
function parseTowns(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(list) || !list.length) {
    throw ApiError.badRequest('يجب تحديد بلدة واحدة على الأقل يخدمها المزوّد');
  }
  const towns = [...new Set(list.map(town => cleanString(town, 100)).filter(Boolean))];
  if (!towns.length) {
    throw ApiError.badRequest('يجب تحديد بلدة واحدة على الأقل يخدمها المزوّد');
  }
  return towns;
}

/**
 * A provider's phone is optional: absent or blank → `null` (stored as NULL),
 * otherwise it must be a valid number exactly as before.
 */
function parseOptionalPhone(raw) {
  const phone = cleanString(raw, 30);
  if (phone === null) return null;
  if (!isValidPhone(phone)) throw ApiError.badRequest('رقم الهاتف غير صالح');
  return phone;
}

function parsePriceType(value) {
  if (!value) return 'estimated';
  const clean = String(value).trim();
  return ['estimated', 'fixed', 'starting_at', 'contact'].includes(clean) ? clean : 'estimated';
}

function parseProviderAttributes(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ======================================================================
// صفحة المزوّد الغنية (تذكرة #184) — تحقّق صارم هنا، ولا تخمين في الخدمة.
// ======================================================================

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * ساعات العمل: مصفوفة 0..6 من `{ day, closed?, from?, to? }`. `day` رقم صحيح
 * بين 0 و6 بلا تكرار، و`from`/`to` نصّ `HH:MM` لكل يوم مفتوح. قيمة فراغ
 * (`''` أو `null` أو `[]`) تمسح الساعات كلها. أي شكل آخر 400 برسالة عربية —
 * لا تصحيح ولا إكمال، لأن الشكل المخزَّن هو ما تعرضه الواجهات حرفياً.
 */
function parseHours(raw) {
  if (raw === null || raw === '') return null;

  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      throw ApiError.badRequest('صيغة ساعات العمل غير صالحة');
    }
  }
  if (!Array.isArray(list) || list.length > 7) {
    throw ApiError.badRequest('ساعات العمل مصفوفة من سبعة أيام على الأكثر');
  }

  const seen = new Set();
  const days = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw ApiError.badRequest('صيغة ساعات العمل غير صالحة');
    }
    const day = Number(item.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw ApiError.badRequest('يوم ساعات العمل يجب أن يكون رقماً بين 0 و6');
    }
    if (seen.has(day)) throw ApiError.badRequest('يوم مكرّر في ساعات العمل');
    seen.add(day);

    const closed = item.closed === true || item.closed === 'true' || item.closed === 1 || item.closed === '1';
    if (closed) {
      days.push({ day, closed: true });
      continue;
    }
    const from = typeof item.from === 'string' ? item.from.trim() : '';
    const to = typeof item.to === 'string' ? item.to.trim() : '';
    if (!TIME_OF_DAY.test(from) || !TIME_OF_DAY.test(to)) {
      throw ApiError.badRequest('وقت ساعات العمل يجب أن يكون بصيغة HH:MM');
    }
    days.push({ day, closed: false, from, to });
  }

  return days.length ? days.sort((left, right) => left.day - right.day) : null;
}

/**
 * تاريخ انتهاء العرض: `YYYY-MM-DD` أو `YYYY-MM-DD HH:MM` (أو بصيغة
 * `datetime-local`). تاريخ بلا وقت يعني نهاية يومه — لا يُترك NULL بالخطأ.
 * والفراغ يمسح التاريخ.
 */
function parseOfferEndsAt(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const text = String(raw).trim().replace('T', ' ');
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ ](\d{2}:\d{2}))?$/);
  if (!match) throw ApiError.badRequest('تاريخ انتهاء العرض غير صالح');
  return `${match[1]} ${match[2] || '23:59'}:00`;
}

function parseOptionalPrice(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  return parseAmount(raw);
}

/** حقول العرض: `title` إلزامي في الإنشاء، و`PATCH` يمسّ ما أُرسل وحده. */
function parseOfferFields(body, { partial }) {
  const payload = {};
  if (body.title !== undefined) {
    const title = cleanString(body.title, 160);
    if (!title) throw ApiError.badRequest('عنوان العرض مطلوب');
    payload.title = title;
  } else if (!partial) {
    throw ApiError.badRequest('عنوان العرض مطلوب');
  }
  if (body.description !== undefined) payload.description = cleanString(body.description, 500);
  if (body.price !== undefined) payload.price = parseOptionalPrice(body.price);
  if (body.ends_at !== undefined) payload.ends_at = parseOfferEndsAt(body.ends_at);
  if (body.is_active !== undefined) {
    payload.is_active = body.is_active === true || body.is_active === 'true' || body.is_active === 1 || body.is_active === '1';
  }
  return payload;
}

/** حقول المنتج: `name` إلزامي في الإنشاء. */
function parseProductFields(body, { partial }) {
  const payload = {};
  if (body.name !== undefined) {
    const name = cleanString(body.name, 160);
    if (!name) throw ApiError.badRequest('اسم المنتج مطلوب');
    payload.name = name;
  } else if (!partial) {
    throw ApiError.badRequest('اسم المنتج مطلوب');
  }
  if (body.description !== undefined) payload.description = cleanString(body.description, 500);
  if (body.price !== undefined) payload.price = parseOptionalPrice(body.price);
  if (body.image_url !== undefined) payload.image_url = cleanString(body.image_url, 500);
  if (body.position !== undefined) {
    const position = Number.parseInt(body.position, 10);
    payload.position = Number.isInteger(position) ? position : 0;
  }
  return payload;
}

/** حقل ملف واحد من طلب `serviceMedia` (يأتي `fields` لا `single`). */
function uploadedServiceFile(req, field) {
  return (req.files && req.files[field] && req.files[field][0]) || (field === 'image' ? req.file : null) || null;
}

/**
 * كل ملفات الطلب التي كتبها multer. **تُحذف في `finally`** فور انتهاء الطلب —
 * ولو رُفض بعد التحقّق أو بعد فحص النطاق — إلا ما صار هو رابط الصفّ نفسه
 * (`/uploads/…` حين تغيب مفاتيح Cloudinary أو يفشل رفعها).
 */
function serviceUploads(req) {
  return ['image', 'logo', 'cover', 'photo']
    .map(field => uploadedServiceFile(req, field))
    .filter(Boolean);
}

/** يرفع الملف إلى Cloudinary أو يحفظه محلياً، ويسجّل ما بقي منه رابطَ الصفّ. */
async function storeServiceImage(file, kept) {
  const url = await cloudinary.storeUploadedImage(file, 'services');
  if (url === `/uploads/${file.filename}`) kept.add(file.filename);
  return url;
}

async function discardServiceUploads(files, kept) {
  await Promise.all(
    files
      .filter(file => !kept.has(file.filename))
      .map(file => fsp.unlink(file.path).catch(() => {}))
  );
}

// --- Public directory (no auth — story 18) ----------------------------

router.get('/services/categories', asyncHandler(async (req, res) => {
  res.json({ success: true, categories: await services.listActiveCategories() });
}));

/**
 * دليل الخدمات سطح اكتشاف: مزوّدون يخدمون بلدة واحدة على الأقل من محافظة
 * الطلب (تذكرة #122)، و`optionalAuthenticate` كي يرى المسجَّل محافظة حسابه بلا
 * ترويسة كما في `/api/events`. **والمزوّد المفرد** أدناه لا يتقيّد — صفحة
 * المزوّد تُفتح بالمعرّف من أي محافظة.
 *
 * و`req.user` (تذكرة #185) يمرّر `userId` إلى الخدمة فتحمل كل بطاقة
 * `is_favorite` لهذا المستخدم؛ والزائر يحصل على `false`، فلا مفتاح غائب.
 */
router.get('/services/providers', optionalAuthenticate, asyncHandler(async (req, res) => {
  const regionId = await regionIdForRequest(req);
  const { providers, pagination } = await services.listPublicProviders({
    categoryId: req.query.category_id ? parseId(req.query.category_id, 'معرّف الفئة') : null,
    town: cleanString(req.query.town, 100),
    search: cleanString(req.query.search, 100),
    regionId,
    userId: req.user ? req.user.id : null,
    page: req.query.page,
    limit: req.query.limit
  });
  res.json({ success: true, providers, pagination });
}));

/**
 * تسجيل مشاهدة صفحة مزوّد — عامّ بـ`optionalAuthenticate`، **وبلا `req.ip`
 * إطلاقاً**: المفتاح معرّف الحساب للمسجَّل أو ترويسة `X-Visitor-Id` العشوائية
 * للزائر، ولا يُشتقّ من عنوان شبكة ولا يُخزَّن عنوان. بلا مفتاح تُردّ 200
 * بالعدّاد كما هو و`counted: false` — لا خطأ على من لم يرسل معرّفاً.
 */
router.post('/services/providers/:id/view', optionalAuthenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const rawVisitorId = req.get('X-Visitor-Id');
  const visitorId = typeof rawVisitorId === 'string' && VISITOR_ID_PATTERN.test(rawVisitorId.trim())
    ? rawVisitorId.trim()
    : null;

  const result = await services.recordProviderView(id, {
    userId: req.user ? req.user.id : null,
    visitorId
  });
  res.json({ success: true, counted: result.counted, views_count: result.views_count });
}));

/** «مزوّدون محفوظون» لصاحب الحساب وحده — لا محفوظات غيره، والحكم في الخدمة. */
router.get('/services/favorites', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, providers: await services.listFavoriteProviders(req.user.id) });
}));

/** حفظ مزوّد — idempotent، والعدّاد من الخادم. */
router.put('/services/providers/:id/favorite', authenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const result = await services.addProviderFavorite(id, req.user.id);
  res.json({ success: true, is_favorite: result.is_favorite, favorites_count: result.favorites_count });
}));

/** إلغاء الحفظ — idempotent كذلك، والعدّاد من الخادم. */
router.delete('/services/providers/:id/favorite', authenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const result = await services.removeProviderFavorite(id, req.user.id);
  res.json({ success: true, is_favorite: result.is_favorite, favorites_count: result.favorites_count });
}));

router.get('/services/providers/:id', optionalAuthenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  res.json({
    success: true,
    provider: await services.getPublicProviderById(id, { userId: req.user ? req.user.id : null })
  });
}));

/**
 * رابط واتساب المزوّد (تذكرة #184): عامّ كمسار التفصيل نفسه. الرقم لا يخرج في
 * أي مفتاح من الاستجابة — يظهر داخل `url` وحده، والرسالة العربية تُبنى في
 * الخدمة لا في العميل. بلا رقم أو لمزوّد غير معتمد/غير موجود ← 404.
 */
router.get('/services/providers/:id/whatsapp', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  res.json({ success: true, url: await services.publicProviderWhatsapp(id) });
}));

// --- تقييمات المزوّد (تذكرة #186) ------------------------------------
// `rating` يمرّ رقماً كما وصل والخدمة تحكمه (عدد صحيح 1..5)، و`confirm_phone`
// يحوّله المسار إلى منطقي حصراً كما في `albums.routes.js` — فلا `"true"` نصّاً.

/** نشر تقييم أو تعديله — upsert صاحبه، ويُنشَر فوراً بلا مراجعة مسبقة. */
router.put('/services/providers/:id/review', authenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const body = req.body || {};
  const rawRating = body.rating;
  // النصّ الرقمي يُقبل (`"4"` من نموذج HTML)، وغير الرقم يمرّ كما هو فيرفضه
  // فحص `Number.isInteger` في الخدمة — `true` مثلاً ليس نجمة.
  const rating = typeof rawRating === 'string' && rawRating.trim() !== ''
    ? Number(rawRating)
    : rawRating;

  const result = await services.upsertProviderReview(req.user.id, id, {
    rating,
    body: cleanString(body.body, 1000),
    confirmPhone: body.confirm_phone === true
  });

  res.json({
    success: true,
    review: result.review,
    rating_avg: result.rating_avg,
    rating_count: result.rating_count,
    rating_distribution: result.rating_distribution,
    message: 'تم حفظ تقييمك — شكراً لك'
  });
}));

/** حذف تقييم صاحبه وحده — والحذف المتكرّر بلا خطأ (idempotent). */
router.delete('/services/providers/:id/review', authenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const result = await services.deleteProviderReview(req.user.id, id);

  res.json({
    success: true,
    deleted: result.deleted,
    rating_avg: result.rating_avg,
    rating_count: result.rating_count,
    rating_distribution: result.rating_distribution,
    message: result.deleted ? 'حُذف تقييمك' : 'لا تقييم لك على هذا المزوّد'
  });
}));

/** تقييمات المزوّد — عامة ومرقّمة، و`optionalAuthenticate` كي تعرف `is_mine`. */
router.get('/services/providers/:id/reviews', optionalAuthenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const { reviews, pagination } = await services.listProviderReviews(id, {
    page: req.query.page,
    limit: req.query.limit,
    userId: req.user ? req.user.id : null
  });
  res.json({ success: true, reviews, pagination });
}));

/** بلاغ عن تقييم — صفّ واحد لكل مستخدم، والثالث يُخفيه. */
router.post('/services/providers/:id/reviews/:rid/report', authenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const reviewId = parseId(req.params.rid, 'معرّف التقييم');
  const result = await services.reportProviderReview(req.user.id, id, reviewId);

  res.json({
    success: true,
    reports_count: result.reports_count,
    status: result.status,
    message: 'تم إبلاغ الإدارة عن التقييم'
  });
}));

/**
 * ردّ الحساب المربوط على تقييم (تذكرة #187، ADR-0016 §2-3).
 *
 * **المسار على التقييم وحده لا على المزوّد** (`/services/reviews/:rid/reply`):
 * الحساب يعرف رقم التقييم لا رقم المزوّد، والمزوّد يُشتقّ من الصفّ. والصلاحية
 * شرطٌ داخل استعلام الخدمة نفسه (`sp.linked_user_id = ?`)، فلا يمرّ الحكم عبر
 * هذا الباب ولا يُفلتر شيء بعد الجلب. **و404 لا 403** لحسابٍ آخر — لا يُكشف
 * وجود تقييم لا يملكه. ونصّ الردّ إلزامي غير فارغ بسقف 1000 (400 عربية).
 */
router.put('/services/reviews/:rid/reply', authenticate, asyncHandler(async (req, res) => {
  const reviewId = parseId(req.params.rid, 'معرّف التقييم');
  const body = req.body || {};
  const review = await services.replyToProviderReview(req.user.id, reviewId, body.reply_body);

  res.json({
    success: true,
    review,
    message: 'تم حفظ ردّك على التقييم'
  });
}));

// --- User submissions (authenticated) --------------------------------

router.post('/services/providers', authenticate, serviceMedia, asyncHandler(async (req, res) => {
  const body = req.body || {};
  requireFields(body, ['name', 'category_id']);

  const phone = parseOptionalPhone(body.phone);

  const towns = parseTowns(body.towns);

  const knownTowns = await townsService.activeNames();
  for (const town of towns) {
    if (!knownTowns.includes(town)) throw ApiError.badRequest(`البلدة "${town}" غير معروفة`);
  }

  const imageFile = req.files?.image?.[0] || req.file;
  const imageUrl = imageFile ? `/uploads/${imageFile.filename}` : cleanString(body.image_url, 500);

  let price = null;
  if (body.price !== undefined && body.price !== null && String(body.price).trim() !== '') {
    price = parseAmount(body.price);
  }

  const priceType = parsePriceType(body.price_type);
  const priceEstimateDesc = cleanString(body.price_estimate_desc, 255);
  const attributes = parseProviderAttributes(body.attributes);
  const categoryId = parseId(body.category_id, 'الفئة');

  const providerId = await services.createProvider({
    category_id: categoryId,
    name: cleanString(body.name, 150),
    phone,
    description: cleanString(body.description, 2000),
    image_url: imageFile ? await cloudinary.storeUploadedImage(imageFile, 'services') : imageUrl,
    price,
    price_type: priceType,
    price_estimate_desc: priceEstimateDesc,
    attributes,
    status: 'pending',
    is_active: true,
    consent_at: new Date(),
    consent_by: req.user.id,
    consent_channel: 'app_submission',
    created_by: req.user.id,
    towns
  });

  res.status(201).json({
    success: true,
    providerId,
    message: 'تم إرسال عرض الخدمة بنجاح وهو قيد مراجعة الإدارة'
  });
}));

router.get('/services/my-services', authenticate, asyncHandler(async (req, res) => {
  const list = await services.listMyServices(req.user.id);
  res.json({ success: true, services: list });
}));

/**
 * «مزوّدي» في «حسابي» (تذكرة #187، ADR-0016 §3): مزوّدو هذا الحساب المربوط
 * وحدهم، ببطاقة القائمة نفسها (`shapeProviderCard`) وبلا رقم. حساب بلا ربط
 * يستلم مصفوفة فارغة لا 404 — فالقسم يختفي كاملاً في العميل، ولا يقال لمن لا
 * مزوّد له إنّ هناك قسماً لم يُفتح.
 */
router.get('/services/my-providers', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, providers: await services.listLinkedProviders(req.user.id) });
}));

// --- Admin: service providers — `admin` role, scoped to their towns ---
// Guarded on this router itself, same warning as occasionTypes.routes.js:
// a `router.use('/admin', requireAdmin)` registered elsewhere does not
// protect these paths just because they share the `/admin` prefix.

router.use('/admin/service-providers', requireAdmin);
// حارس منفصل للبادئة الجديدة: `router.use` على بادئة لا يحمي بادئة أخرى
// تشترك معها في `/admin` — نفس تحذير `occasionTypes.routes.js`.
router.use('/admin/provider-reviews', requireAdmin);

router.get('/admin/service-providers', asyncHandler(async (req, res) => {
  const { providers, pagination } = await services.listProvidersForAdmin(req.user, {
    categoryId: req.query.category_id ? parseId(req.query.category_id, 'معرّف الفئة') : null,
    page: req.query.page,
    limit: req.query.limit
  });
  res.json({ success: true, providers, pagination });
}));

router.get('/admin/service-providers/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  res.json({ success: true, provider: await services.getProviderForAdmin(req.user, id) });
}));

router.post('/admin/service-providers', serviceMedia, asyncHandler(async (req, res) => {
  const body = req.body || {};
  requireFields(body, ['name']);

  const phone = parseOptionalPhone(body.phone);

  const towns = parseTowns(body.towns);
  // Containment test: an admin may only assign towns within its own scope;
  // super_admin may assign any known town (a disabled one included, so re-saving an old provider never fails). Rejects the whole request —
  // never a silent trim.
  await services.assertTownsWithinScope(req.user, towns);

  const imageFile = req.files?.image?.[0] || req.file;
  const imageUrl = imageFile ? `/uploads/${imageFile.filename}` : cleanString(body.image_url, 500);

  let price = null;
  if (body.price !== undefined && body.price !== null && String(body.price).trim() !== '') {
    price = parseAmount(body.price);
  }

  const priceType = parsePriceType(body.price_type);
  const priceEstimateDesc = cleanString(body.price_estimate_desc, 255);
  const attributes = parseProviderAttributes(body.attributes);
  const categoryId = parseId(body.category_id, 'الفئة');

  const providerId = await services.createProvider({
    category_id: categoryId,
    name: cleanString(body.name, 150),
    phone,
    description: cleanString(body.description, 2000),
    image_url: imageFile ? await cloudinary.storeUploadedImage(imageFile, 'services') : imageUrl,
    price,
    price_type: priceType,
    price_estimate_desc: priceEstimateDesc,
    attributes,
    status: 'approved',
    is_active: body.is_active !== false && body.is_active !== 'false',
    // Rule 7 still holds — no provider without a consent record — but the
    // record is the admin's own act of adding it (owner decision: no date or
    // channel form fields), the same way an app submission records itself.
    consent_at: new Date(),
    consent_by: req.user.id,
    consent_channel: 'admin_entry',
    created_by: req.user.id,
    towns
  });

  res.status(201).json({ success: true, providerId, message: 'تمت إضافة مزوّد الخدمة بنجاح' });
}));

/**
 * تعديل مزوّد. يقبل معه — تذكرة #184 — شعاراً وغلافاً (`logo`/`cover`) وساعات
 * العمل وشارتَي «موثّق»/«مميّز». **الملفات داخل `try/finally`**: أي رفض بعد
 * أن كتب multer ملفاً (403 للأعلام، 400 للساعات، 404 للنطاق) يحذف المؤقّت،
 * وما بقي منه هو رابط الصفّ وحده لا يُحذف. وتعذّر Cloudinary لا يُسقط الطلب —
 * يعود الملف إلى `/uploads/` كما كان.
 */
router.patch('/admin/service-providers/:id', serviceMedia, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const uploads = serviceUploads(req);
  const kept = new Set();

  try {
    // Confirms the provider exists AND is in scope before writing anything —
    // out-of-scope is a 404, never a 403 (a 403 would confirm the row exists
    // to an admin who cannot see it).
    const existing = await services.getProviderForAdmin(req.user, id);

    const body = req.body || {};
    const payload = {};

    if (body.category_id !== undefined) payload.category_id = parseId(body.category_id, 'الفئة');
    if (body.name !== undefined) {
      const name = cleanString(body.name, 150);
      if (!name) throw ApiError.badRequest('اسم مزوّد الخدمة مطلوب');
      payload.name = name;
    }
    // An empty string clears the number; an absent key leaves it untouched.
    if (body.phone !== undefined) payload.phone = parseOptionalPhone(body.phone);
    if (body.description !== undefined) payload.description = cleanString(body.description, 2000);

    const imageFile = uploadedServiceFile(req, 'image');
    if (imageFile) {
      payload.image_url = `/uploads/${imageFile.filename}`;
    } else if (body.image_url !== undefined) {
      payload.image_url = cleanString(body.image_url, 500);
    }

    if (body.price !== undefined) {
      payload.price = (body.price === null || String(body.price).trim() === '') ? null : parseAmount(body.price);
    }
    if (body.price_type !== undefined) payload.price_type = parsePriceType(body.price_type);
    if (body.price_estimate_desc !== undefined) payload.price_estimate_desc = cleanString(body.price_estimate_desc, 255);
    if (body.attributes !== undefined) payload.attributes = parseProviderAttributes(body.attributes);
    if (body.is_active !== undefined) {
      payload.is_active = body.is_active === 'true' || body.is_active === true || body.is_active === 1;
    }

    if (body.hours !== undefined) payload.hours = parseHours(body.hours);

    // الشارتان صلاحية لا نطاق: وجود أيٍّ منهما من أدمن غير سوبر يُرفض 403 في
    // الخدمة (`updateProvider`) — لا هنا — فلا يمرّ الحكم عبر هذا الباب وحده.
    if (body.is_verified !== undefined) {
      payload.is_verified = body.is_verified === 'true' || body.is_verified === true || body.is_verified === 1 || body.is_verified === '1';
    }
    if (body.is_featured !== undefined) {
      payload.is_featured = body.is_featured === 'true' || body.is_featured === true || body.is_featured === 1 || body.is_featured === '1';
    }

    if (body.towns !== undefined) {
      const towns = parseTowns(body.towns);
      await services.assertTownsWithinScope(req.user, towns);
      payload.towns = towns;
    }

    // قبل أي رفع: الطلب المحكوم عليه بالرفض لا يُنتج ملفاً على Cloudinary ولا
    // في `/uploads/`. والصورة تُرفع بعده فقط، والحكم نفسه يُعاد في الخدمة.
    services.assertProviderFlagsAllowed(req.user, payload);

    const logoFile = uploadedServiceFile(req, 'logo');
    if (logoFile) payload.logo_url = await storeServiceImage(logoFile, kept);
    else if (body.logo_url !== undefined) payload.logo_url = cleanString(body.logo_url, 500);

    const coverFile = uploadedServiceFile(req, 'cover');
    if (coverFile) payload.cover_url = await storeServiceImage(coverFile, kept);
    else if (body.cover_url !== undefined) payload.cover_url = cleanString(body.cover_url, 500);

    if (imageFile) payload.image_url = await storeServiceImage(imageFile, kept);

    await services.updateProvider(id, payload, req.user);
    if (payload.image_url !== undefined) await events.releaseReplacedImage(existing.image_url, payload.image_url);
    if (payload.logo_url !== undefined) await events.releaseReplacedImage(existing.logo_url, payload.logo_url);
    if (payload.cover_url !== undefined) await events.releaseReplacedImage(existing.cover_url, payload.cover_url);

    res.json({
      success: true,
      provider: await services.getProviderForAdmin(req.user, id),
      message: 'تم تحديث مزوّد الخدمة بنجاح'
    });
  } finally {
    await discardServiceUploads(uploads, kept);
  }
}));

router.patch('/admin/service-providers/:id/status', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  await services.getProviderForAdmin(req.user, id);

  const status = cleanString(req.body.status, 20);
  const rejectionReason = cleanString(req.body.rejection_reason, 500);

  await services.updateProviderStatus(id, { status, rejectionReason });
  res.json({ success: true, message: 'تم تحديث حالة مزوّد الخدمة بنجاح' });
}));

router.delete('/admin/service-providers/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  await services.getProviderForAdmin(req.user, id);
  await services.deleteProvider(id);
  res.json({ success: true, message: 'تم حذف مزوّد الخدمة بنجاح' });
}));

/**
 * ربط مزوّد بحساب مستخدم أو فكّه (تذكرة #187، ADR-0016 §1).
 *
 * خلف `requireAdmin` القائم للبادئة أعلاه، **والسوبر أدمن وحده يمرّر**: غيره
 * يُردّ 404 من داخل هذا المعالِج — لا `requireSuperAdmin` — على نمط
 * `PATCH /admin/users/:id/role` في `admin.routes.js`، فلا يتأكّد وجود المزوّد
 * لمن لا يملك الربط. والخدمة تفرضه أيضاً فلا يمرّ الحكم عبر بابٍ واحد.
 *
 * الجسم `{ user_id: <رقم> | null }`: `null` يفكّ الربط (وكذلك `''` من نموذج
 * HTML، فالشكلان يعنيان «بلا حساب» في العميلين)، وغياب المفتاح 400 لا فكٌّ
 * صامت. والحدث يُسجَّل في `activity_log` طرفيه — والفكّ يسجّل الحساب الذي
 * فُكّ لا `null`، فالسجل يقول ما جرى فعلاً.
 */
router.patch('/admin/service-providers/:id/link', asyncHandler(async (req, res) => {
  if (req.user.role !== 'super_admin') {
    throw ApiError.notFound('مزوّد الخدمة غير موجود');
  }

  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const body = req.body || {};
  if (!('user_id' in body)) {
    throw ApiError.badRequest('معرّف الحساب مطلوب — أرسل رقم الحساب أو null لفكّ الربط');
  }

  const raw = body.user_id;
  const userId = (raw === null || raw === undefined || raw === '') ? null : parseId(raw, 'معرّف الحساب');
  const result = await services.linkProviderAccount(req.user, id, userId);

  await activity.record({
    actorId: req.user.id,
    action: userId === null ? 'provider_account_unlinked' : 'provider_account_linked',
    details: {
      provider_id: id,
      user_id: userId === null ? result.previous_user_id : userId
    }
  });

  res.json({
    success: true,
    provider: result.provider,
    message: userId === null
      ? 'تم فكّ ربط مزوّد الخدمة بالحساب'
      : 'تم ربط مزوّد الخدمة بالحساب — صار صاحبه يردّ على تقييماته'
  });
}));

// --- معرض المزوّد وعروضه ومنتجاته (تذكرة #184) -----------------------
// كل مسار هنا يبدأ بـ`getProviderForAdmin`: أدمن خارج بلدات المزوّد يُردّ 404
// على كل مسار إداري جديد (وليس 403، فلا يتأكّد وجود صفّ لا يراه)، والحكم
// داخل الخدمة لا في الراوتر. والملفات تخرج عبر `withAbsoluteMedia` من
// الخدمة نفسها.

router.post('/admin/service-providers/:id/photos', serviceMedia, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const uploads = serviceUploads(req);
  const kept = new Set();

  try {
    await services.getProviderForAdmin(req.user, id);

    // صورة واحدة في الطلب — `photo` هو الحقل المقصود، و`image` مقبول للتوافق
    // مع ما يرسله العميل القديم (حقل الرفع الوحيد في `serviceMedia` قبله).
    const file = uploadedServiceFile(req, 'photo') || uploadedServiceFile(req, 'image');
    if (!file) throw ApiError.badRequest('اختر صورة لإضافتها إلى المعرض');

    const caption = cleanString((req.body || {}).caption, 200);
    const imageUrl = await storeServiceImage(file, kept);
    const photo = await services.addProviderPhoto(id, { image_url: imageUrl, caption });

    res.status(201).json({
      success: true,
      photo,
      provider: await services.getProviderForAdmin(req.user, id),
      message: 'تمت إضافة الصورة إلى المعرض'
    });
  } finally {
    await discardServiceUploads(uploads, kept);
  }
}));

router.delete('/admin/service-providers/:id/photos/:photoId', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const photoId = parseId(req.params.photoId, 'معرّف الصورة');
  await services.getProviderForAdmin(req.user, id);

  const deleted = await services.deleteProviderPhoto(id, photoId);
  await events.releaseReplacedImage(deleted.image_url, null);
  res.json({ success: true, message: 'تم حذف الصورة من المعرض' });
}));

router.post('/admin/service-providers/:id/offers', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  await services.getProviderForAdmin(req.user, id);

  const payload = parseOfferFields(req.body || {}, { partial: false });
  const offerId = await services.createProviderOffer(id, payload);

  res.status(201).json({
    success: true,
    offerId,
    provider: await services.getProviderForAdmin(req.user, id),
    message: 'تمت إضافة العرض بنجاح'
  });
}));

router.patch('/admin/service-providers/:id/offers/:offerId', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const offerId = parseId(req.params.offerId, 'معرّف العرض');
  await services.getProviderForAdmin(req.user, id);

  const payload = parseOfferFields(req.body || {}, { partial: true });
  await services.updateProviderOffer(id, offerId, payload);

  res.json({
    success: true,
    provider: await services.getProviderForAdmin(req.user, id),
    message: 'تم تحديث العرض بنجاح'
  });
}));

router.delete('/admin/service-providers/:id/offers/:offerId', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const offerId = parseId(req.params.offerId, 'معرّف العرض');
  await services.getProviderForAdmin(req.user, id);

  await services.deleteProviderOffer(id, offerId);
  res.json({ success: true, message: 'تم حذف العرض بنجاح' });
}));

router.post('/admin/service-providers/:id/products', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  await services.getProviderForAdmin(req.user, id);

  const payload = parseProductFields(req.body || {}, { partial: false });
  const productId = await services.createProviderProduct(id, payload);

  res.status(201).json({
    success: true,
    productId,
    provider: await services.getProviderForAdmin(req.user, id),
    message: 'تمت إضافة المنتج بنجاح'
  });
}));

router.patch('/admin/service-providers/:id/products/:productId', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const productId = parseId(req.params.productId, 'معرّف المنتج');
  await services.getProviderForAdmin(req.user, id);

  const payload = parseProductFields(req.body || {}, { partial: true });
  await services.updateProviderProduct(id, productId, payload);

  res.json({
    success: true,
    provider: await services.getProviderForAdmin(req.user, id),
    message: 'تم تحديث المنتج بنجاح'
  });
}));

router.delete('/admin/service-providers/:id/products/:productId', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف مزوّد الخدمة');
  const productId = parseId(req.params.productId, 'معرّف المنتج');
  await services.getProviderForAdmin(req.user, id);

  const deleted = await services.deleteProviderProduct(id, productId);
  if (deleted && deleted.image_url) await events.releaseReplacedImage(deleted.image_url, null);
  res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
}));

/**
 * حذف تقييم من اللوحة (تذكرة #186) — النطاق **داخل الخدمة** عبر
 * `providerScopeClause`: أدمن خارج بلدات المزوّد أو تقييم غير موجود ← 404 لا
 * 403، فلا يتأكّد وجود صفّ لا يراه.
 */
router.delete('/admin/provider-reviews/:rid', asyncHandler(async (req, res) => {
  const reviewId = parseId(req.params.rid, 'معرّف التقييم');
  await services.deleteProviderReviewAsAdmin(req.user, reviewId);
  res.json({ success: true, message: 'تم حذف التقييم بنجاح' });
}));

// --- Super-admin: service categories (story 34) ------------------------

router.use('/admin/service-categories', requireSuperAdmin);

router.get('/admin/service-categories', asyncHandler(async (req, res) => {
  res.json({ success: true, categories: await services.listAllCategoriesForAdmin() });
}));

router.post('/admin/service-categories', asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'icon', 'color']);

  const category = await services.createCategory({
    name: cleanString(req.body.name, 60),
    icon: cleanString(req.body.icon, 60),
    color: cleanString(req.body.color, 20),
    position: Number.isInteger(req.body.position) ? req.body.position : 0,
    is_active: req.body.is_active !== false,
    attributes: Array.isArray(req.body.attributes) ? req.body.attributes : undefined
  });

  res.status(201).json({ success: true, category, message: 'تمت إضافة فئة الخدمة بنجاح' });
}));

router.patch('/admin/service-categories/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف فئة الخدمة');
  const body = req.body || {};
  const payload = {};

  if (body.name !== undefined) payload.name = cleanString(body.name, 60);
  if (body.icon !== undefined) payload.icon = cleanString(body.icon, 60);
  if (body.color !== undefined) payload.color = cleanString(body.color, 20);
  if (body.position !== undefined) payload.position = Number.isInteger(body.position) ? body.position : 0;
  if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);
  if (body.attributes !== undefined && Array.isArray(body.attributes)) payload.attributes = body.attributes;

  const category = await services.updateCategory(id, payload);
  res.json({ success: true, category, message: 'تم تحديث فئة الخدمة بنجاح' });
}));

router.delete('/admin/service-categories/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'معرّف فئة الخدمة');
  const result = await services.deleteCategory(id);
  const message = result.deleted
    ? 'تم حذف فئة الخدمة بنجاح'
    : 'لا يمكن حذف فئة لها مزوّدون مرتبطون — تم تعطيلها بدلاً من ذلك فلن تظهر في الدليل';
  res.json({ success: true, message, ...result });
}));

module.exports = router;
