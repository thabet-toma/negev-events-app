'use strict';

const db = require('../db/pool');
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
  if (connection) {
    const [result] = await connection.execute(
      'INSERT INTO people (name, name_key) VALUES (?, ?)',
      [name, key]
    );
    return result.insertId;
  }
  const result = await db.execute('INSERT INTO people (name, name_key) VALUES (?, ?)', [name, key]);
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

  try {
    return await insertPerson(connection, clean, key);
  } catch (err) {
    // سباق بين طلبين لنفس الاسم: الصفّ صار موجوداً، فخذه بدل أن تفشل الكتابة.
    if (err.code === 'ER_DUP_ENTRY') {
      const raced = await selectId(connection, key);
      if (raced) return raced;
    }
    throw err;
  }
}

module.exports = { resolveByName };
