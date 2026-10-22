'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { nameKey } = require('../utils/arabicName');

/**
 * «الشخص» كائنٌ هويّته الاسم (ADR-0011، تذكرة #105).
 *
 * هذا الملف يملك **إنشاء** الشخص وربطه، لا قراءة صفحاته: بوابات الظهور وأشكال
 * الصور في `albums.service.js` وحدها، فلا يستورد هذا الملف منها شيئاً — ولا
 * تنشأ دورة استيراد بين الاثنين.
 *
 * كل كتابة اسم — تسجيل حساب، وسم صورة، صاحب مناسبة — تمرّ من `resolveByName`
 * ولا تُنشئ صفّاً بنفسها. و`name_key` فريد، فاسمان يتطابقان بعد توحيد الإملاء
 * شخصٌ واحد بقرار المالك؛ واسمان لشخص واحد يحتاجان دمجاً يدوياً (#107).
 */

async function selectId(connection, key) {
  if (connection) {
    const [rows] = await connection.execute('SELECT id FROM people WHERE name_key = ?', [key]);
    return rows.length ? rows[0].id : null;
  }
  const row = await db.queryOne('SELECT id FROM people WHERE name_key = ?', [key]);
  return row ? row.id : null;
}

async function insertPerson(connection, name, key) {
  // `ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)` يجعل الإدراج ذرّياً: إن
  // كان الصفّ موجوداً يعيد `insertId` معرّفَه هو، فلا سباق يُفشل الكتابة ولا
  // اعتماد على رؤية صفٍّ أنشأه طلبٌ آخر داخل لقطة معاملة (REPEATABLE READ).
  const sql =
    'INSERT INTO people (name, name_key) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)';
  if (connection) {
    const [result] = await connection.execute(sql, [name, key]);
    return result.insertId;
  }
  const result = await db.execute(sql, [name, key]);
  return result.insertId;
}

/**
 * معرّف الشخص لهذا الاسم، ويُنشأ إن غاب. `null` لاسم فارغ — لا صفّ بلا اسم.
 * يقبل اتصال معاملة (‏`db.transaction`) كي يقع إنشاء الشخص داخل المعاملة نفسها
 * التي تكتب الوسم أو المناسبة، فلا يبقى شخصٌ بلا صفّ يستعمله إن تراجعت.
 */
async function resolveByName(name, connection = null) {
  const clean = String(name || '').trim().slice(0, 150);
  const key = nameKey(clean);
  if (!key) return null;

  const existing = await selectId(connection, key);
  if (existing) return existing;

  return insertPerson(connection, clean, key);
}

/**
 * قائمة الأشخاص للوحة (تذكرة #107) — بحثٌ بالاسم وأعداد ما يرتبط بهم، وبلا
 * بوابات ظهور: السوبر أدمن يرى ما لا يراه الزائر كي يستطيع الدمج.
 */
async function listForAdmin(search = null, limit = 50) {
  const term = String(search || '').trim();
  const like = term ? `%${nameKey(term)}%` : null;
  const rows = await db.query(
    `SELECT p.id, p.name, p.name_key,
            (SELECT COUNT(*) FROM photo_tags t WHERE t.person_id = p.id) AS tags_count,
            (SELECT COUNT(*) FROM event_honorees h WHERE h.person_id = p.id) AS honorees_count,
            (SELECT COUNT(*) FROM users u WHERE u.person_id = p.id) AS users_count
       FROM people p
      ${like ? 'WHERE p.name_key LIKE ?' : ''}
      ORDER BY p.name ASC
      LIMIT ?`,
    like ? [like, limit] : [limit]
  );
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    name_key: row.name_key,
    tags_count: Number(row.tags_count),
    honorees_count: Number(row.honorees_count),
    users_count: Number(row.users_count)
  }));
}

/**
 * دمج شخصين (تذكرة #107): ينتقل كل ما يشير إلى `from` إلى `into` في معاملة
 * واحدة، ثم يُحذف صفّ `from`. إعادة التسمية **دمجٌ لا تحرير نصّ** (ADR-0011)،
 * لأن الصفّ نفسه هو الهوية.
 */
async function mergeTwo(fromId, intoId) {
  if (fromId === intoId) throw ApiError.badRequest('لا يمكن دمج شخص بنفسه');

  return db.transaction(async connection => {
    // قفل الصفّين: دمجان متزامنان على الاسم نفسه كانا يتركان صفاً محذوفاً
    // وصفاً آخر يشير إليه.
    const [rows] = await connection.execute(
      'SELECT id FROM people WHERE id IN (?, ?) FOR UPDATE',
      [fromId, intoId]
    );
    if (rows.length !== 2) throw ApiError.notFound('أحد الشخصين غير موجود');

    const [users] = await connection.execute(
      'UPDATE users SET person_id = ? WHERE person_id = ?',
      [intoId, fromId]
    );
    const [tags] = await connection.execute(
      'UPDATE photo_tags SET person_id = ? WHERE person_id = ?',
      [intoId, fromId]
    );
    const [honorees] = await connection.execute(
      'UPDATE event_honorees SET person_id = ? WHERE person_id = ?',
      [intoId, fromId]
    );
    await connection.execute('DELETE FROM people WHERE id = ?', [fromId]);

    logger.info('people.merge', {
      from: fromId,
      into: intoId,
      users: users.affectedRows,
      tags: tags.affectedRows,
      honorees: honorees.affectedRows
    });

    return {
      merged_into: intoId,
      removed: fromId,
      moved: {
        users: users.affectedRows,
        tags: tags.affectedRows,
        honorees: honorees.affectedRows
      }
    };
  });
}

module.exports = { resolveByName, listForAdmin, mergeTwo };
