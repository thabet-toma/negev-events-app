'use strict';

/**
 * `event_cards` — بطاقات الدعوة المحفوظة (المواصفة #156، المرحلة ٣ — تذكرة
 * #180). هذه الطبقة هي التي تقرأ الجدول وتكتبه، **باستثناء واحد**: الدالة
 * المشتركة `releaseReplacedImage` في `events.service.js` تقرأ
 * `event_cards.image_url` سطراً واحداً عند تحرير صورة بطاقة محذوفة، لأن سؤال
 * «هل ما زال صفٌّ يستعمل هذا الملف؟» واحد على كل جداول الوسائط. وهي التي:
 *
 *   1. تقرأ صفّ المناسبة الذي ترسمه البطاقة (أسماء، نوع، عائلة، تاريخ، وقت،
 *      مكان، برنامج الأيام، وملصقها) — القارئ الآخر للجدول هو `og:image` في
 *      `share.routes.js` عبر `primaryCardForEvent`.
 *   2. تكتب الصفّ بعد أن يرسمه `cardStudio.service.js` ويرفعه `storeCardImage`.
 *   3. تحرس **بطاقة أساسية واحدة على الأكثر** لكل مناسبة: كل كتابة تُصفّر
 *      البقية في المعاملة نفسها. هذا قيد كود لا قيد قاعدة (MySQL 8 لا تعرف
 *      فهرسة فريدة جزئية)، فنقطته الواحدة هنا وحدها.
 *
 * **حذف البطاقة الأساسية لا يُرقّي غيرها.** `deleteCard` يحذف الصفّ ويترك
 * المناسبة بلا بطاقة أساسية، فيعود `og:image` إلى البطاقة التي يولّدها
 * الخادم (`shareCard.service.js`) — وهو نصّ معيار القبول: «حذفها يعيد البطاقة
 * المولَّدة». الترقية الآلية كانت ستُخفي الحذف عن صاحب المناسبة: يظنّ أنه أعاد
 * الصفحة إلى بطاقة الخادم فيجد بطاقة أخرى حلّت محلّها.
 *
 * لا `req`/`res` هنا، وكل استعلام بمعاملات `?`.
 */

const path = require('path');
const fsp = require('fs/promises');
const crypto = require('crypto');

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { absoluteMediaUrl, withAbsoluteMedia } = require('../utils/mediaUrl');
const { uploadsDir } = require('../middleware/upload');
const events = require('./events.service');
const cloudinary = require('./cloudinary.service');

/** أعمدة الصفّ التي تخرج للعميل — لا `SELECT *` في واجهة عامة. */
const CARD_COLUMNS = `id, event_id, template_key, font_key, color, size, photo_url, image_url,
                      is_primary, created_by, created_at`;

/**
 * المجلد على Cloudinary الذي تُرفع فيه الصورة المولَّدة. مشتقّ من المقاس،
 * والبادئة `negev-events/event-cards/` هي ما يعرف به `forwardedPublicId`
 * (cloudinary.service.js) أن هذا الملف لنا فيقدر على حذفه عند الحذف/الاستبدال.
 */
const CARD_FOLDER = 'event-cards';

function publicCard(row) {
  if (!row) return null;
  // الوسائط تخرج مطلقة دائماً (ADR-0002) — الرابط النسبي يعمل بالصدفة في الويب
  // ويكسر أي عميل آخر.
  const absolute = withAbsoluteMedia(row);
  return { ...absolute, is_primary: Boolean(row.is_primary) };
}

/**
 * صفّ المناسبة كما تحتاجه البطاقة، أو 404. يشمل `created_by` و`town` لأن
 * `assertCanManageEvent` تقيس بهما الصلاحية، و`occasion_type_tone` لأن النبرة
 * تحكم أي القوالب تُعرض.
 *
 * `poster_url` يبقى كما هو مخزَّناً (نسبياً في `/uploads/` أو مطلقاً على
 * Cloudinary): الرسم يمرّره بـ`absoluteMediaUrl` عند القراءة، وما يُحفظ في
 * `event_cards.photo_url` هو نفس القيمة المخزَّنة لا نسخة مطلقة منها.
 */
async function getCardEvent(eventId) {
  const row = await db.queryOne(
    `SELECT events.id, events.title, events.family_clan, events.town, events.location_name,
            events.event_date, events.event_end_date, events.dinner_time, events.poster_url,
            events.created_by,
            occasion_types.name AS occasion_type_name,
            occasion_types.tone AS occasion_type_tone,
            occasion_types.color AS occasion_type_colour,
            (${events.EVENT_SPAN_END_SQL_EVENTS} < CURDATE()) AS is_expired
       FROM events
       LEFT JOIN occasion_types ON occasion_types.id = events.occasion_type_id
      WHERE events.id = ?`,
    [eventId]
  );
  if (!row) throw ApiError.notFound('المناسبة غير موجودة');

  const [honoreeMap, dayMap] = await Promise.all([
    events.honoreesForEvents([eventId]),
    // «برنامج المناسبة» من الدالة القائمة نفسها (تذكرة #176) — لا استعلام ثانٍ
    // يعيد ترتيب الأيام بقاعدة أخرى.
    events.eventDaysForEvents([eventId])
  ]);

  return {
    ...row,
    is_expired: Boolean(row.is_expired),
    honorees: honoreeMap[eventId] || [],
    program_days: dayMap[eventId] || [],
    tone: row.occasion_type_tone === 'solemn' ? 'solemn' : 'festive'
  };
}

/** بطاقات المناسبة: الأساسية أولاً ثم الأحدث. */
async function listCards(eventId) {
  const rows = await db.query(
    `SELECT ${CARD_COLUMNS} FROM event_cards
      WHERE event_id = ?
      ORDER BY is_primary DESC, created_at DESC, id DESC`,
    [eventId]
  );
  return rows.map(publicCard);
}

/**
 * البطاقة الأساسية إن وُجدت — يقرأها `og:image` في صفحة المشاركة وحدها.
 * تُعاد `image_url` مطلقةً ومقاسها (`size`) كي يعرف الزاحف أبعاد الصورة
 * المعلنة بدقّة.
 */
async function primaryCardForEvent(eventId) {
  const row = await db.queryOne(
    `SELECT image_url, size FROM event_cards WHERE event_id = ? AND is_primary = 1 LIMIT 1`,
    [eventId]
  );
  if (!row) return null;
  return { image_url: absoluteMediaUrl(row.image_url), size: row.size };
}

/**
 * يخزّن بايتات PNG رسمها الخادم نفسه، ويعيد ما يُكتب في `image_url`.
 *
 * على Cloudinary حين تكون مفاتيحه مضبوطة، وإلا — أو عند فشل الرفع — على قرص
 * `/uploads/` كما يفعل بقية المستودع: **بطاقة لا تُحفظ لأن خدمة صور خارجية
 * متعطّلة عطلٌ أسوأ من رابط نسبي**. الحفظ المحلي لا يُفشل الطلب أبداً.
 */
async function storeCardImage(buffer, sizeKey) {
  if (cloudinary.isConfigured()) {
    try {
      const uploaded = await cloudinary.uploadBuffer(buffer, cloudinary.folderFor(CARD_FOLDER, sizeKey), { format: 'png' });
      return { url: uploaded.url, publicId: uploaded.public_id, storage: 'cloudinary' };
    } catch (err) {
      logger.warn(`[eventCards] cloudinary upload failed, keeping the card on disk: ${err.message}`);
    }
  }
  const filename = `card-${sizeKey}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.png`;
  await fsp.writeFile(path.join(uploadsDir, filename), buffer);
  return { url: `/uploads/${filename}`, publicId: null, storage: 'uploads' };
}

/**
 * إدراج بطاقة وجعلها الأساسية في معاملة واحدة: تصفير الأساسية على كل بطاقات
 * المناسبة ثم الإدراج بـ`is_primary = 1`. الترتيب مقصود — الإدراج آخراً كي لا
 * يمسح التصفير الصفَّ الجديد نفسه لو انعكس.
 */
async function createCard({ eventId, templateKey, fontKey, color, size, photoUrl, imageUrl, createdBy }) {
  const cardId = await db.transaction(async connection => {
    await connection.execute('UPDATE event_cards SET is_primary = 0 WHERE event_id = ?', [eventId]);
    const [result] = await connection.execute(
      `INSERT INTO event_cards
         (event_id, template_key, font_key, color, size, photo_url, image_url, is_primary, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [eventId, templateKey, fontKey, color, size, photoUrl, imageUrl, createdBy]
    );
    return result.insertId;
  });

  return publicCard(await db.queryOne(`SELECT ${CARD_COLUMNS} FROM event_cards WHERE id = ?`, [cardId]));
}

/**
 * تعيين بطاقة أساسية: تصفير بطاقات المناسبة كلها ثم رفع المطلوبة. الصفّ يُقرأ
 * **داخل** المعاملة بقيد `event_id = ?` كي لا تُرقّى بطاقة مناسبة أخرى بتمرير
 * معرّفها، والغياب 404 لا 403 (لا يُؤكَّد وجود بطاقة لمن لا يملك مناسبتها).
 */
async function setPrimaryCard(eventId, cardId) {
  return db.transaction(async connection => {
    const [rows] = await connection.execute(
      `SELECT ${CARD_COLUMNS} FROM event_cards WHERE id = ? AND event_id = ? FOR UPDATE`,
      [cardId, eventId]
    );
    if (!rows.length) throw ApiError.notFound('البطاقة غير موجودة');

    await connection.execute('UPDATE event_cards SET is_primary = 0 WHERE event_id = ?', [eventId]);
    await connection.execute('UPDATE event_cards SET is_primary = 1 WHERE id = ?', [cardId]);

    return publicCard({ ...rows[0], is_primary: 1 });
  });
}

/**
 * حذف بطاقة وإعادة صفّها المحذوف (كي يُحرَّر ملفّه عبر
 * `events.releaseReplacedImage` بعد نجاح الحذف). الصفّ لا يُرقّي غيره — راجع
 * تعليق الملف.
 */
async function deleteCard(eventId, cardId) {
  const row = await db.queryOne(
    'SELECT id, image_url, is_primary FROM event_cards WHERE id = ? AND event_id = ?',
    [cardId, eventId]
  );
  if (!row) throw ApiError.notFound('البطاقة غير موجودة');

  await db.execute('DELETE FROM event_cards WHERE id = ? AND event_id = ?', [cardId, eventId]);
  return row;
}

module.exports = {
  CARD_COLUMNS,
  CARD_FOLDER,
  getCardEvent,
  listCards,
  primaryCardForEvent,
  storeCardImage,
  createCard,
  setPrimaryCard,
  deleteCard
};
