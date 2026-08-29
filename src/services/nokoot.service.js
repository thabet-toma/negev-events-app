'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');

/** A user's private nokoot ledger, with totals and a per-town breakdown. */
async function listForUser(userId) {
  const records = await db.query(
    'SELECT * FROM nokoot_ledger WHERE user_id = ? ORDER BY event_date DESC, id DESC',
    [userId]
  );

  const normalised = records.map(record => ({ ...record, amount: Number(record.amount) }));
  const totalAmount = normalised.reduce((sum, record) => sum + record.amount, 0);
  const count = normalised.length;

  const townBreakdown = {};
  for (const record of normalised) {
    const town = record.clan_town || 'أخرى';
    townBreakdown[town] = (townBreakdown[town] || 0) + record.amount;
  }

  return {
    totalAmount: Math.round(totalAmount * 100) / 100,
    count,
    records: normalised,
    analytics: {
      townBreakdown,
      averageNokoot: count > 0 ? Math.round(totalAmount / count) : 0
    }
  };
}

async function create(userId, data) {
  const { insertId } = await db.execute(
    `INSERT INTO nokoot_ledger
       (user_id, recipient_name, clan_town, amount, currency, occasion_type, event_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.recipient_name,
      data.clan_town,
      data.amount,
      data.currency || 'ILS',
      data.occasion_type || 'عرس',
      data.event_date,
      data.notes
    ]
  );
  return insertId;
}

/** Deletion is scoped to the owning user — one ledger can never touch another. */
async function remove(userId, recordId) {
  const { affectedRows } = await db.execute(
    'DELETE FROM nokoot_ledger WHERE id = ? AND user_id = ?',
    [recordId, userId]
  );
  if (!affectedRows) throw ApiError.notFound('القيد غير موجود');
}

module.exports = { listForUser, create, remove };
