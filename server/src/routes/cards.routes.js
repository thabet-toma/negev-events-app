'use strict';

/**
 * مسارات ستوديو بطاقة الدعوة (المواصفة #156، المرحلة ٣ — تذكرة #180).
 *
 *   GET    /api/card-templates                 عام: القوالب والمقاسات والخطوط
 *   GET    /api/events/:id/cards               بطاقات المناسبة (المالك أو الإدارة)
 *   POST   /api/events/:id/cards/preview       PNG مصغّر بلا تخزين (حدّ أشدّ)
 *   POST   /api/events/:id/cards               يرسم ويخزّن ويجعلها أساسية
 *   PATCH  /api/events/:id/cards/:cardId       تعيين أساسية
 *   DELETE /api/events/:id/cards/:cardId       حذف وتحرير الصورة
 *
 * **المسار يتحقق والخدمة تستعلم:** لا SQL هنا؛ كل صفٍّ يقرأه أو يكتبه
 * `eventCards.service.js`، وكل رسم في `cardStudio.service.js`. وما تفعله هذه
 * الطبقة: التحقّق من الاختيارات (قالب/خط/لون/مقاس)، وحمل الملف المؤقّت من
 * multer، وتحويل الصلاحية إلى 404.
 *
 * **الحدّ:** دلوان منفصلان لكل مستخدم فوق الحدّ العام (كما في
 * `albums.routes.js:23-31`) — المعاينة الأشدّ لأنها ترسم PNG في كل طلب،
 * والكتابة الأخفّ. المفتاح `authenticatedUserId` (يتطلب أن يسبق
 * `authenticate` الدلوان) فلا يُحسَب مستخدم على IP مشترك.
 *
 * **الصلاحية:** `assertCanManageEvent` نفسها — مستوردةً من `events.routes.js`
 * لا منسوخة. ولا دورة `require`: `events.routes.js` لا يعرف هذا الملف.
 */
const express = require('express');
const fsp = require('fs/promises');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { absoluteMediaUrl } = require('../utils/mediaUrl');
const { authenticatedUserId } = require('../utils/rateLimitIdentity');
const { authenticate } = require('../middleware/auth');
const { cardPhotoMedia } = require('../middleware/upload');
const { cleanString, parseId } = require('../middleware/validate');
const cardStudio = require('../services/cardStudio.service');
const eventCards = require('../services/eventCards.service');
const events = require('../services/events.service');
const cloudinary = require('../services/cloudinary.service');
const shareCard = require('../services/shareCard.service');
const { assertCanManageEvent } = require('./events.routes');

const router = express.Router();

/**
 * دلو واحد لكل مستخدم. الرسالة عربية كما في كل رسائل المستودع، والـ429 هو ما
 * تترجمه الواجهة إلى «حاول بعد قليل».
 */
function cardLimiter(max, message) {
  return rateLimit({
    windowMs: config.rateLimit.cardWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => `card:${authenticatedUserId(req)}`,
    message: { success: false, message }
  });
}

const previewLimiter = cardLimiter(
  config.rateLimit.cardPreviewMax,
  'عدد طلبات المعاينة تجاوز الحد المسموح — حاول بعد قليل'
);
const writeLimiter = cardLimiter(
  config.rateLimit.cardWriteMax,
  'عدد طلبات الحفظ تجاوز الحد المسموح — حاول بعد قليل'
);

/**
 * الملكية أو الإدارة بمنطق `assertCanManageEvent` نفسه، **والرفض هنا 404 لا
 * 403**: بطاقة المناسبة جزء من بياناتها الخاصة، والصفحة لا تؤكّد وجود مناسبة
 * لمن لا يملكها — نفس قاعدة `adminScope.service.js`. الترجمة هنا وحدها كي لا
 * تتكرّر الدالة ولا يتغيّر سلوك المسارات الأخرى التي تستعملها (403 كما هي).
 */
async function assertCanManageCardEvent(req, event) {
  try {
    await assertCanManageEvent(req, event);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) throw ApiError.notFound('المناسبة غير موجودة');
    throw err;
  }
}

/**
 * يقرأ اختيارات التصميم من الجسم ويتحقّق منها كلها قبل أي رسم أو كتابة:
 * القالب معروفٌ **ونبرته تطابق نبرة المناسبة**، والخط عائلة مسجَّلة يسمح بها
 * القالب، واللون من لوحة القالب، والمقاس أحد الأربعة.
 *
 * النبرة هي بوابة العزاء: `event.tone` من `occasion_types.tone`، ومناسبة
 * العزاء لا تقبل إلا `tone = 'solemn'` (والعكس مقصور كذلك — التعليل في
 * cardStudio.service.js).
 */
function parseCardChoice(body, event) {
  const templateKey = cleanString(body.template_key, 40);
  const template = cardStudio.templateByKey(templateKey);
  if (!template) throw ApiError.badRequest('اختر قالباً للبطاقة من القائمة');

  const allowedForTone = cardStudio.templatesForTone(event.tone);
  if (!allowedForTone.some(candidate => candidate.key === template.key)) {
    throw ApiError.badRequest(event.tone === 'solemn'
      ? 'مناسبة العزاء لا ترسم إلا بقوالب العزاء الهادئة'
      : 'هذا القالب مخصّص لمناسبات العزاء ولا يصلح لهذه المناسبة');
  }

  const sizeKey = cleanString(body.size, 20);
  const size = cardStudio.sizeByKey(sizeKey);
  if (!size) throw ApiError.badRequest('اختر مقاساً للبطاقة: ستوري أو عمودي أو مربّع أو A4');

  const availableFontKeys = cardStudio.availableFonts().map(font => font.key);
  const usableFonts = template.fonts.filter(key => availableFontKeys.includes(key));
  const fontKey = cleanString(body.font_key, 40) || usableFonts[0] || null;
  if (!fontKey || !usableFonts.includes(fontKey)) {
    throw ApiError.badRequest('الخط المختار غير متاح لهذا القالب — اختر خطاً من قائمة الستوديو');
  }

  // اللون **مطلوب** كالقالب والمقاس: `cleanString` يعيد `null` للغائب والفراغ،
  // ونداء `.toLowerCase()` على null كان يرمي TypeError فيردّ 500 — بينما العقد
  // (README) 400 عربية. الحارس قبل الاستدعاء، لا بعده.
  const requestedColor = cleanString(body.color, 20);
  if (!requestedColor) throw ApiError.badRequest('اختر لوناً من لوحة القالب');
  const color = template.colors.find(option => option.value.toLowerCase() === requestedColor.toLowerCase());
  if (!color) throw ApiError.badRequest('اللون المختار غير متاح لهذا القالب — اختر لوناً من لوحة القالب');

  const photoSource = cleanString(body.photo_source, 20);
  if (photoSource !== null && !['event', 'upload', 'none'].includes(photoSource)) {
    throw ApiError.badRequest('مصدر الصورة غير معروف: اختر صورة المناسبة أو ارفع صورة أو بلا صورة');
  }

  return { template, size, fontKey, color: color.value, photoSource };
}

/**
 * بايتات الصورة التي تُرسم على البطاقة، والقيمة التي تُحفظ في `photo_url`.
 * المصدران المسمّيان وحدهما — ملصق المناسبة المخزَّن، أو الملف الذي رفعه
 * صاحبها الآن. لا يُقبل رابط من الجسم إطلاقاً: قراءة رابط يرسله العميل تجلب
 * من أي عنوان (SSRF)، والبطاقة لا تحتاجه.
 */
async function loadCardPhoto(req, event, photoSource) {
  const wantUpload = photoSource === 'upload';
  const wantEventPoster = photoSource === 'event' || (photoSource === null && !req.file && Boolean(event.poster_url));

  if (wantUpload || (photoSource === null && req.file)) {
    if (!req.file) throw ApiError.badRequest('ارفع الصورة المختارة أولاً');
    // تُقرأ قبل أي تمرير إلى التخزين: `storeUploadedImage` يحذف الملف المحلي
    // بعد نجاح الرفع، فالقراءة بعده تفشل.
    return { buffer: await fsp.readFile(req.file.path), storedUrl: null, file: req.file };
  }

  if (wantEventPoster && event.poster_url) {
    const absolute = absoluteMediaUrl(event.poster_url);
    const buffer = await shareCard.loadPosterBuffer(cloudinary.jpegVariant(absolute));
    return { buffer, storedUrl: event.poster_url, file: null };
  }

  return { buffer: null, storedUrl: null, file: null };
}

// --- Public catalog ---------------------------------------------------

/**
 * كتالوج الستوديو: ١٢ قالباً (أو ما يطابق `?tone=`)، والمقاسات الأربعة
 * بأبعادها وأبعاد معاينتها، والخطوط **المسجَّلة فعلاً**. عام بلا رمز: العميل
 * يعرضه قبل تسجيل الدخول، ولا شيء فيه يخصّ مناسبة.
 */
router.get('/card-templates', asyncHandler(async (req, res) => {
  const tone = req.query.tone === 'solemn' ? 'solemn' : (req.query.tone === 'festive' ? 'festive' : null);
  res.json({ success: true, ...cardStudio.catalog({ tone }) });
}));

// --- Owner / admin ----------------------------------------------------

/** بطاقات المناسبة كما هي محفوظة، الأساسية أولاً. */
router.get('/events/:id/cards', authenticate, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const event = await eventCards.getCardEvent(eventId);
  await assertCanManageCardEvent(req, event);
  res.json({ success: true, cards: await eventCards.listCards(eventId) });
}));

/**
 * معاينة حقيقية: PNG مرسوم بالمقاس المصغّر الصحيح، **بلا تخزين** — لا صفّ ولا
 * ملف على القرص ولا رفع إلى Cloudinary.
 *
 * **كل ما بعد multer داخل `try/finally` واحد** (تذكرة #180، مراجعة): التحقق من
 * المعرّف والملكية والاختيارات يجري قبل الرسم، وأي رفض فيه (404 ملكية، 400 قالب
 * أو لون أو مقاس) كان يترك ملف multer المؤقّت في `/uploads/`. الآن كل خروج
 * (نجاح، رفض، استثناء) يمرّ بـ`finally` فيُحذف الملف. ولا `catch` هنا: `finally`
 * لا يبتلع الاستثناء ولا يغيّر رمز الاستجابة — `ApiError` تخرج كما كُتبت إلى
 * معالج الأخطاء.
 */
router.post(
  '/events/:id/cards/preview',
  authenticate,
  previewLimiter,
  cardPhotoMedia,
  asyncHandler(async (req, res) => {
    try {
      const eventId = parseId(req.params.id, 'معرّف المناسبة');
      const event = await eventCards.getCardEvent(eventId);
      await assertCanManageCardEvent(req, event);
      const choice = parseCardChoice(req.body || {}, event);

      const photo = await loadCardPhoto(req, event, choice.photoSource);
      const buffer = await cardStudio.renderCard({
        templateKey: choice.template.key,
        sizeKey: choice.size.key,
        fontKey: choice.fontKey,
        color: choice.color,
        event,
        photo: photo.buffer,
        preview: true
      });
      res
        .status(200)
        .set('Content-Type', 'image/png')
        .set('Cache-Control', 'no-store')
        .send(buffer);
    } finally {
      if (req.file) await fsp.unlink(req.file.path).catch(() => {});
    }
  })
);

/**
 * الحفظ: يرسم بالمقاس الكامل، يخزّن الصورة (Cloudinary أو `/uploads/`)، ثم
 * يكتب الصفّ **أساسياً**. وإن فشلت الكتابة بعد الرفع تُحذف الصورة المرفوعة كي
 * لا يبقى ملف يتيم — نفس نهج `storyStudio.service.publishCampaign`.
 *
 * **ملف multer المؤقّت:** يبقى فقط حين يصير هو `photo_url` نفسه — أي حين يعيد
 * `storeUploadedImage` الرابط المحلي (بلا مفاتيح Cloudinary أو عند فشل الرفع)،
 * وهي الحالة التي يكون الملف فيها بيانات الصفّ لا مؤقّتاً. وما عدا ذلك (رفع إلى
 * Cloudinary، أو `photo_source` غير `upload`، أو رفض قبل الكتابة، أو فشل
 * الكتابة) يُحذف في `finally`. وكل ما بعد multer داخل `try/finally` واحد، فلا
 * يبقى ملف عند 400/404/استثناء؛ و`finally` لا يبتلع الخطأ ولا يغيّر الاستجابة.
 */
router.post(
  '/events/:id/cards',
  authenticate,
  writeLimiter,
  cardPhotoMedia,
  asyncHandler(async (req, res) => {
    let keepUploadedFile = false;
    try {
      const eventId = parseId(req.params.id, 'معرّف المناسبة');
      const event = await eventCards.getCardEvent(eventId);
      await assertCanManageCardEvent(req, event);
      const choice = parseCardChoice(req.body || {}, event);

      const photo = await loadCardPhoto(req, event, choice.photoSource);
      let photoUrl = photo.storedUrl;
      if (photo.file) {
        // تُقرأ البايتات أعلاه، والملف نفسه يمرّ إلى التخزين: يحذفه
        // `storeUploadedImage` بعد نجاح الرفع، ويبقيه للرابط النسبي إن فشل.
        photoUrl = await cloudinary.storeUploadedImage(photo.file, eventCards.CARD_FOLDER, 'photos');
      }

      const buffer = await cardStudio.renderCard({
        templateKey: choice.template.key,
        sizeKey: choice.size.key,
        fontKey: choice.fontKey,
        color: choice.color,
        event,
        photo: photo.buffer,
        preview: false
      });

      const stored = await eventCards.storeCardImage(buffer, choice.size.key);
      let card;
      try {
        card = await eventCards.createCard({
          eventId,
          templateKey: choice.template.key,
          fontKey: choice.fontKey,
          color: choice.color,
          size: choice.size.key,
          photoUrl,
          imageUrl: stored.url,
          createdBy: req.user.id
        });
      } catch (err) {
        if (stored.publicId) await cloudinary.destroy(stored.publicId);
        throw err;
      }

      // الصفّ كُتب فعلاً: إن كان `photo_url` هو ملف multer المحلي نفسه فهو
      // بيانات البطاقة (مسار التخزين البديل) ولا يجوز حذفه. فشلُ الكتابة لا
      // يصل إلى هنا، فيبقى العلَم false ويُحذف الملف في `finally`.
      if (photo.file && photoUrl === `/uploads/${photo.file.filename}`) keepUploadedFile = true;

      logger.info('eventCards.created', { eventId, cardId: card.id, size: choice.size.key, storage: stored.storage });
      res.status(201).json({
        success: true,
        message: 'حُفظت البطاقة وجُعلت البطاقة الأساسية للمناسبة',
        card
      });
    } finally {
      // كل خروج لا يكون فيه ملف multer هو `photo_url` يُحذف مؤقّته؛ ويشمل ذلك
      // 400/404 قبل الرسم، و`photo_source = none` مع ملف لم يختره العميل، وفشل
      // الكتابة بعد الرفع. و`storeUploadedImage` يحذفه بنفسه بعد نجاح Cloudinary
      // فيصير الحذف هنا no-op (`catch` على unlink فقط، لا على الخطأ الأصلي).
      if (req.file && !keepUploadedFile) {
        await fsp.unlink(req.file.path).catch(() => {});
      }
    }
  })
);

/** تعيين بطاقة أساسية — بطاقة واحدة على الأكثر. */
router.patch('/events/:id/cards/:cardId', authenticate, writeLimiter, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const cardId = parseId(req.params.cardId, 'معرّف البطاقة');
  const event = await eventCards.getCardEvent(eventId);
  await assertCanManageCardEvent(req, event);

  const card = await eventCards.setPrimaryCard(eventId, cardId);
  res.json({ success: true, message: 'صارت هذه البطاقة الأساسية للمناسبة', card });
}));

/**
 * حذف البطاقة وتحرير صورتها: الصفّ يُحذف أولاً، ثم يُنادى
 * `events.releaseReplacedImage` — ومنطقها لا يحذف ملفاً ما دام صفٌّ آخر
 * يحمله. وحذف الأساسية يترك المناسبة بلا أساسية، فيعود `og:image` إلى بطاقة
 * الخادم المولَّدة (معيار القبول).
 */
router.delete('/events/:id/cards/:cardId', authenticate, writeLimiter, asyncHandler(async (req, res) => {
  const eventId = parseId(req.params.id, 'معرّف المناسبة');
  const cardId = parseId(req.params.cardId, 'معرّف البطاقة');
  const event = await eventCards.getCardEvent(eventId);
  await assertCanManageCardEvent(req, event);

  const deleted = await eventCards.deleteCard(eventId, cardId);
  await events.releaseReplacedImage(deleted.image_url, null);

  res.json({ success: true, message: 'حُذفت البطاقة', was_primary: Boolean(deleted.is_primary) });
}));

module.exports = router;
