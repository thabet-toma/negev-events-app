'use strict';

/**
 * The daily app discussion beside the live (plan26-9 §3.3–§3.5): one episode
 * per Asia/Jerusalem day, each with an optional 2..4-option poll that is
 * open ONLY on its own day, one vote per account. Every query for the
 * feature lives here; live.routes.js only validates and shapes the request.
 *
 * "Today" is always `jerusalemDateString()` passed as a `?` parameter —
 * never CURDATE(), which reads the MySQL session zone (UTC in this pool).
 */

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { jerusalemDateString } = require('../utils/jerusalemTime');

const ADMIN_LIST_DAYS = 60;

const EPISODE_COLUMNS = 'id, episode_date, topic, episode_question, poll_question, poll_options, created_at, updated_at';

/**
 * The pool returns DATE columns as strings (`dateStrings: ['DATE']`), but a
 * raw connection or a future pool change could hand back a Date — normalised
 * here so every response carries exactly `YYYY-MM-DD`.
 */
function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** mysql2 parses JSON columns already; a string is tolerated in case a driver setting changes. */
function parseOptions(value) {
  if (value === null || value === undefined) return null;
  const options = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(options) && options.length ? options : null;
}

function hasPoll(row) {
  return Boolean(row.poll_question && parseOptions(row.poll_options));
}

async function countVotes(episodeId) {
  const rows = await db.query(
    'SELECT option_index, COUNT(*) AS votes FROM live_poll_votes WHERE episode_id = ? GROUP BY option_index',
    [episodeId]
  );
  const byIndex = {};
  for (const row of rows) byIndex[row.option_index] = Number(row.votes);
  return byIndex;
}

/** `{ results: [{ index, label, votes, percentage }], total_votes }` for one episode's poll. */
async function buildResults(episodeId, options) {
  const byIndex = await countVotes(episodeId);
  const total = options.reduce((sum, _label, index) => sum + (byIndex[index] || 0), 0);
  const results = options.map((label, index) => {
    const votes = byIndex[index] || 0;
    return { index, label, votes, percentage: total ? Math.round((votes * 100) / total) : 0 };
  });
  return { results, total_votes: total };
}

async function findMyVote(episodeId, userId) {
  if (!userId) return null;
  const row = await db.queryOne(
    'SELECT option_index FROM live_poll_votes WHERE episode_id = ? AND user_id = ?',
    [episodeId, userId]
  );
  return row ? row.option_index : null;
}

/**
 * Today's poll as the requester may see it: results only once they have
 * voted (the plan's "النسب بعد التصويت" rule), so an anonymous visitor or a
 * signed-in non-voter gets the question and options alone.
 */
async function buildTodayPoll(row, userId) {
  if (!hasPoll(row)) return null;
  const options = parseOptions(row.poll_options);
  const myVote = await findMyVote(row.id, userId);
  const poll = { question: row.poll_question, options, my_vote: myVote };
  if (myVote !== null) Object.assign(poll, await buildResults(row.id, options));
  return poll;
}

/**
 * `today` and `previous` for GET /api/live/hub. `previous` is the most
 * recent earlier day that actually had a poll, always with its results —
 * a closed poll has nothing left to protect by hiding them.
 */
async function getHub(userId) {
  const today = jerusalemDateString();

  const todayRow = await db.queryOne(
    `SELECT ${EPISODE_COLUMNS} FROM live_episodes WHERE episode_date = ?`,
    [today]
  );

  const previousRow = await db.queryOne(
    `SELECT ${EPISODE_COLUMNS} FROM live_episodes
      WHERE episode_date < ? AND poll_question IS NOT NULL AND poll_options IS NOT NULL
      ORDER BY episode_date DESC LIMIT 1`,
    [today]
  );

  let todayOut = null;
  if (todayRow) {
    todayOut = {
      id: todayRow.id,
      date: toDateString(todayRow.episode_date),
      topic: todayRow.topic,
      episode_question: todayRow.episode_question,
      poll: await buildTodayPoll(todayRow, userId)
    };
  }

  let previousOut = null;
  if (previousRow && hasPoll(previousRow)) {
    const options = parseOptions(previousRow.poll_options);
    previousOut = {
      date: toDateString(previousRow.episode_date),
      poll_question: previousRow.poll_question,
      options,
      ...await buildResults(previousRow.id, options)
    };
  }

  return { today: todayOut, previous: previousOut };
}

/**
 * One vote. The "one per account" rule is the UNIQUE key's, not a
 * read-then-insert check here — two concurrent requests would both pass a
 * pre-check, but only one INSERT can win the key.
 */
async function vote(episodeId, userId, optionIndex) {
  const row = await db.queryOne(`SELECT ${EPISODE_COLUMNS} FROM live_episodes WHERE id = ?`, [episodeId]);
  if (!row) throw ApiError.notFound('الحلقة غير موجودة');

  if (toDateString(row.episode_date) !== jerusalemDateString() || !hasPoll(row)) {
    throw ApiError.badRequest('هذا النقاش مغلق');
  }

  const options = parseOptions(row.poll_options);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
    throw ApiError.badRequest('الخيار المختار غير صالح');
  }

  try {
    await db.execute(
      'INSERT INTO live_poll_votes (episode_id, user_id, option_index) VALUES (?, ?, ?)',
      [episodeId, userId, optionIndex]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw ApiError.conflict('صوّتَّ مسبقاً في نقاش اليوم');
    // A still-valid token whose account was deleted meanwhile.
    if (err.code === 'ER_NO_REFERENCED_ROW_2') throw ApiError.unauthorized('انتهت جلستك، يرجى تسجيل الدخول من جديد');
    throw err;
  }

  logger.info('live.vote', { episodeId, optionIndex });

  return {
    question: row.poll_question,
    options,
    my_vote: optionIndex,
    ...await buildResults(episodeId, options)
  };
}

function toAdminEpisode(row, voteCount) {
  return {
    id: row.id,
    date: toDateString(row.episode_date),
    topic: row.topic,
    episode_question: row.episode_question,
    poll_question: row.poll_question,
    poll_options: parseOptions(row.poll_options),
    vote_count: Number(voteCount) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/** The last ADMIN_LIST_DAYS Jerusalem days (and anything planned ahead), newest first. */
async function listEpisodesForAdmin() {
  const cutoff = jerusalemDateString(new Date(Date.now() - ADMIN_LIST_DAYS * 24 * 60 * 60 * 1000));
  const rows = await db.query(
    `SELECT e.id, e.episode_date, e.topic, e.episode_question, e.poll_question, e.poll_options,
            e.created_at, e.updated_at,
            (SELECT COUNT(*) FROM live_poll_votes v WHERE v.episode_id = e.id) AS vote_count
       FROM live_episodes e
      WHERE e.episode_date >= ?
      ORDER BY e.episode_date DESC`,
    [cutoff]
  );
  return rows.map(row => toAdminEpisode(row, row.vote_count));
}

function sameOptions(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

/**
 * Creates or replaces the episode for `date` (a full replace — every field
 * absent from `fields` is cleared). Once anyone has voted, the options are
 * frozen: changing them would silently re-label votes already cast. The
 * episode row is locked FOR UPDATE, and a vote's FK check needs a shared
 * lock on that same row, so no vote can land between the count and the write.
 */
async function saveEpisode(date, fields, updatedBy) {
  const { topic, episode_question: episodeQuestion, poll_question: pollQuestion, poll_options: pollOptions } = fields;
  const optionsJson = pollOptions ? JSON.stringify(pollOptions) : null;

  const episodeId = await db.transaction(async connection => {
    const [existingRows] = await connection.execute(
      'SELECT id, poll_options FROM live_episodes WHERE episode_date = ? FOR UPDATE',
      [date]
    );
    const existing = existingRows[0];

    if (existing) {
      const [[{ cnt }]] = await connection.execute(
        'SELECT COUNT(*) AS cnt FROM live_poll_votes WHERE episode_id = ?',
        [existing.id]
      );
      if (Number(cnt) > 0 && !sameOptions(parseOptions(existing.poll_options), pollOptions)) {
        throw ApiError.conflict('لا يمكن تغيير خيارات الاستفتاء بعد أن صوّت الناس — عدّل باقي الحقول فقط');
      }
      await connection.execute(
        `UPDATE live_episodes
            SET topic = ?, episode_question = ?, poll_question = ?, poll_options = ?
          WHERE id = ?`,
        [topic ?? null, episodeQuestion ?? null, pollQuestion ?? null, optionsJson, existing.id]
      );
      return existing.id;
    }

    try {
      const [result] = await connection.execute(
        `INSERT INTO live_episodes (episode_date, topic, episode_question, poll_question, poll_options, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [date, topic ?? null, episodeQuestion ?? null, pollQuestion ?? null, optionsJson, updatedBy ?? null]
      );
      return result.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw ApiError.conflict('حُفظت حلقة لهذا اليوم للتو — أعد المحاولة');
      throw err;
    }
  });

  logger.info('live.episode.save', { updatedBy, date });

  const row = await db.queryOne(
    `SELECT ${EPISODE_COLUMNS},
            (SELECT COUNT(*) FROM live_poll_votes v WHERE v.episode_id = live_episodes.id) AS vote_count
       FROM live_episodes WHERE id = ?`,
    [episodeId]
  );
  return toAdminEpisode(row, row.vote_count);
}

/** Deletes an episode; its votes go with it (ON DELETE CASCADE). */
async function deleteEpisode(id) {
  const { affectedRows } = await db.execute('DELETE FROM live_episodes WHERE id = ?', [id]);
  if (!affectedRows) throw ApiError.notFound('الحلقة غير موجودة');
}

module.exports = {
  getHub,
  vote,
  listEpisodesForAdmin,
  saveEpisode,
  deleteEpisode
};
