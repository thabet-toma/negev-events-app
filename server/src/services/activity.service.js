'use strict';

const db = require('../db/pool');
const logger = require('../utils/logger');
const { describeChanges } = require('./notifications.service');

/**
 * سجل النشاط — «فلان أضاف/عدّل/اعتمد/رفض/حذف مناسبة كذا» لتبويب «التتبّع
 * والتحليلات» (سوبر أدمن وحده، عبر analytics.routes.js). منفصل عن
 * `analytics_events` عمداً: ذاك بلا معرّف مناسبة بقرار خصوصية (#44) لأنه
 * يتتبّع التصفّح؛ هذا يسجّل أفعال النشر والإدارة نفسها، وهي بطبيعتها عن
 * مناسبة بعينها وفاعل بعينه.
 */
const ACTIONS = [
  'event_created',
  'event_edited',
  'event_approved',
  'event_rejected',
  'event_deleted',
  'event_owner_changed',
  'village_promoted'
];

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

/**
 * يسجّل فعلاً واحداً مع لقطة عنوان المناسبة وبلدتها ونوعها وقت الفعل —
 * تُقرأ من الصف نفسه، فسطر الحذف يُكتب قبل الحذف. لا يرمي أبداً: السجل
 * شاهد على الفعل لا شرط له، ففشله يُسجَّل في السجل التقني ويمضي الطلب.
 */
async function record({ actorId = null, action, eventId, details = null }) {
  try {
    await db.execute(
      `INSERT INTO activity_log (actor_user_id, action, event_id, event_title, event_town, occasion_type_name, details)
       SELECT ?, ?, e.id, e.title, e.town, ot.name, ?
         FROM events e
         LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
        WHERE e.id = ?`,
      [actorId, action, details ? String(details).slice(0, 500) : null, eventId]
    );
  } catch (err) {
    logger.error(`[activity] failed to record ${action} for event ${eventId}:`, err.message);
  }
}

/**
 * الأحدث أولاً، مع اسم الفاعل ورقمه ودوره، وهل ما زالت المناسبة موجودة
 * (`event_exists`) كي لا تعرض الواجهة زرّ «افتح» لمناسبة محذوفة. سطر
 * التعديل يحمل أسماء الحقول في `details` ونصّها المقروء في `summary`
 * («تغيّر المكان والتاريخ»)، بنفس عبارات إشعار المتابعين.
 */
async function list({ action = null, page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const where = action ? 'WHERE a.action = ?' : '';
  const params = action ? [action] : [];

  const { total } = await db.queryOne(`SELECT COUNT(*) AS total FROM activity_log a ${where}`, params);
  const rows = await db.query(
    `SELECT a.id, a.action, a.event_id, a.event_title, a.event_town, a.occasion_type_name, a.details, a.created_at,
            e.status AS event_status, (e.id IS NOT NULL) AS event_exists,
            u.id AS actor_id, u.full_name AS actor_name, u.phone_number AS actor_phone, u.role AS actor_role
       FROM activity_log a
       LEFT JOIN events e ON e.id = a.event_id
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    activity: rows.map(row => ({
      ...row,
      event_exists: Boolean(Number(row.event_exists)),
      summary: row.action === 'event_edited' && row.details ? describeChanges(row.details.split(',')) : null
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / safeLimit)
    }
  };
}

module.exports = { ACTIONS, record, list };
