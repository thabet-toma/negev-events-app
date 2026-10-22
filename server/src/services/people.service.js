'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { nameKey, comparePersonNames } = require('../utils/arabicName');

/**
 * «الشخص» كائنٌ هويّته الاسم (ADR-0011، تذكرة #105).
 *
 * هذا الملف يملك إنشاء الشخص وربطه (`resolveByName`)، وقائمة اللوحة
 * (`listForAdmin`) ودمج شخصين (`mergeTwo`). ولا يملك قراءة صفحة الشخص العامة:
 * بوابات الظهور وأشكال الصور في `albums.service.js` وحدها، فلا يستورد هذا
 * الملف منها شيئاً — ولا تنشأ دورة استيراد بين الاثنين.
 *
 * كل كتابة اسم — تسجيل حساب، وسم صورة، صاحب مناسبة — تمرّ من `resolveByName`
 * ولا تُنشئ صفّاً بنفسها. و`name_key` فريد، فاسمان يتطابقان بعد توحيد الإملاء
 * شخصٌ واحد بقرار المالك؛ واسمان لشخص واحد يحتاجان دمجاً يدوياً (#107).
 */

/** `events.service.js` يملك هروب `LIKE`؛ يُستدعى كسولاً لأنه يستورد هذا الملف. */
function escapeLike(term) {
  return require('./events.service').escapeLike(term);
}

/** سقف مرشّحي الاقتراح لكل شخص — القائمة نفسها ٥٠، فلا تتحوّل القراءة إلى مسح كامل. */
const SIMILAR_CANDIDATE_LIMIT = 20;

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
 * المرشّحون المشابهون لشخص واحد، قراءةً فقط (تذكرة #107): نفس الكلمة الأولى
 * فقط — لا مسح كامل — ثم يرشّحهم `comparePersonNames`. `singleToken` يُسقَط
 * لأن مطابقة كلمة واحدة أضعف من أن تُقترح. الترتيب من الاستعلام (الاسم ثم
 * المعرّف) ثابت، والحدّ أعلاه `SIMILAR_CANDIDATE_LIMIT`.
 */
async function similarFor(person) {
  const firstToken = String(person.name_key || '').split(' ')[0];
  if (!firstToken) return [];

  const rows = await db.query(
    `SELECT p.id, p.name,
            (SELECT COUNT(DISTINCT t.photo_id) FROM photo_tags t
              WHERE t.person_id = p.id AND t.status = 'approved') AS photos_count
       FROM people p
      WHERE p.id <> ?
        AND SUBSTRING_INDEX(p.name_key, ' ', 1) = ?
      ORDER BY p.name ASC, p.id ASC
      LIMIT ?`,
    [person.id, firstToken, SIMILAR_CANDIDATE_LIMIT]
  );

  return rows
    .filter(row => {
      const match = comparePersonNames(person.name, row.name);
      return match && !match.singleToken;
    })
    .map(row => ({
      id: row.id,
      name: row.name,
      photos_count: Number(row.photos_count)
    }));
}

/**
 * قائمة الأشخاص للوحة (تذكرة #107) — بحثٌ بالاسم وأعداد ما يرتبط بهم، وبلا
 * بوابات ظهور: السوبر أدمن يرى ما لا يراه الزائر كي يستطيع الدمج. `photos_count`
 * صور معتمدة فريدة لا صفوف وسوم، و`similar` اقتراحات قراءة فقط.
 */
async function listForAdmin(search = null, limit = 50) {
  const term = String(search || '').trim();
  const like = term ? `%${escapeLike(nameKey(term))}%` : null;
  const rows = await db.query(
    `SELECT p.id, p.name, p.name_key,
            (SELECT COUNT(DISTINCT t.photo_id) FROM photo_tags t
              WHERE t.person_id = p.id AND t.status = 'approved') AS photos_count,
            (SELECT COUNT(*) FROM event_honorees h WHERE h.person_id = p.id) AS honorees_count,
            (SELECT COUNT(*) FROM users u WHERE u.person_id = p.id) AS users_count
       FROM people p
      ${like ? 'WHERE p.name_key LIKE ?' : ''}
      ORDER BY p.name ASC
      LIMIT ?`,
    like ? [like, limit] : [limit]
  );

  const people = rows.map(row => ({
    id: row.id,
    name: row.name,
    name_key: row.name_key,
    photos_count: Number(row.photos_count),
    honorees_count: Number(row.honorees_count),
    users_count: Number(row.users_count),
    similar: []
  }));

  for (const person of people) {
    person.similar = await similarFor(person);
  }
  return people;
}

/**
 * دمج شخصين (تذكرة #107): ينتقل كل ما يشير إلى `from` إلى `into` في معاملة
 * واحدة، ثم يُحذف صفّ `from`. إعادة التسمية **دمجٌ لا تحرير نصّ** (ADR-0011)،
 * لأن الصفّ نفسه هو الهوية. ويُكتب سجلّ `people_merges` بعد نجاح الحذف وداخل
 * المعاملة نفسها، فلا يبقى أثرٌ لدمجٍ تراجع.
 */
async function mergeTwo(fromId, intoId, actorId = null) {
  if (fromId === intoId) throw ApiError.badRequest('لا يمكن دمج شخص بنفسه');

  return db.transaction(async connection => {
    // قفل الصفّين: دمجان متزامنان على الاسم نفسه كانا يتركان صفاً محذوفاً
    // وصفاً آخر يشير إليه. والاسمان يُقرآن هنا ليكون السجلّ لقطةً تبقى بعد
    // الحذف، ولتوحيد إملاء الوسوم والمناسبات على اسم الباقي.
    const [rows] = await connection.execute(
      'SELECT id, name, name_key FROM people WHERE id IN (?, ?) FOR UPDATE',
      [fromId, intoId]
    );
    if (rows.length !== 2) throw ApiError.notFound('أحد الشخصين غير موجود');

    const from = rows.find(row => row.id === fromId);
    const into = rows.find(row => row.id === intoId);

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

    // توحيد الإملاء بعد نقل `person_id`: بحث `GET /api/photos?person=` يفلتر
    // بـ`photo_tags.name_key`، فبقاء «راني» على وسمٍ صار تحت «راني أبو سالم»
    // يُخفي صور الدمج عن بحث الاسم الباقي. `users.full_name` لا يُلمس — اسم
    // الحساب لصاحبه، ولا مسار لإعادة تسميته.
    await connection.execute(
      'UPDATE photo_tags SET name = ?, name_key = ? WHERE person_id = ?',
      [into.name, into.name_key, intoId]
    );
    await connection.execute(
      'UPDATE event_honorees SET name = ? WHERE person_id = ?',
      [into.name, intoId]
    );

    await connection.execute('DELETE FROM people WHERE id = ?', [fromId]);

    const movedSummary =
      `${users.affectedRows} حساب · ${tags.affectedRows} وسم · ${honorees.affectedRows} مناسبة`;
    await connection.execute(
      `INSERT INTO people_merges (actor_id, from_id, from_name, into_id, into_name, moved)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, fromId, from.name, intoId, into.name, movedSummary]
    );

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
