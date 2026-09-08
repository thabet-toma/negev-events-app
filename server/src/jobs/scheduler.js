'use strict';

// A scheduled JOB, not a service — it lives here rather than in
// server/src/services/ precisely so that its `realtime.emit` calls (below)
// read as what they are, not as a service breaking CLAUDE.md's «realtime.emit
// يُستدعى من طبقة المسارات بعد نجاح الخدمة — لا بثّ من داخل الخدمات». This
// file has no HTTP route to hang an emit off; it IS its own route layer —
// the one place that both calls notifications.service.js and knows a write
// actually landed — and its location says so instead of relying on a comment
// to argue it.

const db = require('../db/pool');
const logger = require('../utils/logger');
const realtime = require('../realtime');
const notifications = require('../services/notifications.service');
const { getZonedParts, zonedTimeToUtc, RUN_HOUR } = require('../utils/jerusalemTime');

const DAY_MS = 24 * 60 * 60 * 1000;

let armedTimer = null;

/** Arabic digits, for the generic "N days" fallback below. */
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
function toArabicNumeral(n) {
  return String(n).split('').map(d => ARABIC_DIGITS[Number(d)]).join('');
}

/**
 * Countdown wording for every non-zero offset in
 * `notifications.COUNTDOWN_OFFSETS` — built FROM that list, not a second,
 * hand-kept literal, so adding an offset there can never leave this map
 * silently missing an entry and reading «باقي undefined على…» to a user
 * (issue #85 review, FIX 6 — one list, one source). 7 and 1 keep their
 * idiomatic Arabic phrasing; any other offset falls back to a plain
 * "N أيام" built from the same digit.
 */
const OFFSET_PHRASES = Object.fromEntries(
  notifications.COUNTDOWN_OFFSETS.filter(offset => offset > 0).map(offset => {
    if (offset === 7) return [offset, 'أسبوع'];
    if (offset === 1) return [offset, 'يوم واحد'];
    return [offset, `${toArabicNumeral(offset)} أيام`];
  })
);

/** The countdown's own wording — never a literal date (story 4's own text: «باقي ٣ أيام على عرس آل فلان», never «الجمعة ٢٥»). */
function countdownBody(offsetDays, eventTitle) {
  if (offsetDays === 0) return `اليوم موعد "${eventTitle}"`;
  return `باقي ${OFFSET_PHRASES[offsetDays]} على "${eventTitle}"`;
}

/**
 * Every approved event whose occasion type still has its countdown on
 * (`notify_countdown = 1` — never true for a `solemn` type, story 4) and
 * whose date is exactly 7, 5, 3, 1 or 0 days out today, notifies every
 * "ذكّرني" follower — the event's own creator included, if they follow it
 * too, but exempt from the daily cap (story 11 — exempt means never counted
 * either, see notifications.service.js#countScheduledToday). `event_soon`'s
 * own dedupe key (`event_soon_<event_id>_<offsetDays>`) is what makes
 * running this pass twice on the same day write the exact same rows, not
 * new ones.
 */
async function runCountdownPass() {
  const offsetPlaceholders = notifications.COUNTDOWN_OFFSETS.map(() => '?').join(', ');
  const candidateEvents = await db.query(
    `SELECT e.id, e.title, e.created_by, DATEDIFF(e.event_date, CURDATE()) AS days_left
       FROM events e
       JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE e.status = 'approved' AND ot.notify_countdown = 1
        AND DATEDIFF(e.event_date, CURDATE()) IN (${offsetPlaceholders})
      ORDER BY e.id ASC`,
    notifications.COUNTDOWN_OFFSETS
  );
  if (!candidateEvents.length) return;

  const eventIds = candidateEvents.map(event => event.id);
  const placeholders = eventIds.map(() => '?').join(', ');
  const followerRows = await db.query(
    `SELECT event_id, user_id FROM event_reminders WHERE event_id IN (${placeholders}) ORDER BY id ASC`,
    eventIds
  );

  const followersByEvent = new Map();
  for (const row of followerRows) {
    if (!followersByEvent.has(row.event_id)) followersByEvent.set(row.event_id, []);
    followersByEvent.get(row.event_id).push(row.user_id);
  }

  for (const event of candidateEvents) {
    const offsetDays = Number(event.days_left);
    const followers = followersByEvent.get(event.id) || [];
    for (const userId of followers) {
      const result = await notifications.createScheduled({
        userId,
        eventId: event.id,
        type: notifications.TYPES.EVENT_SOON,
        title: 'تذكير بمناسبة قادمة',
        body: countdownBody(offsetDays, event.title),
        dedupeKey: `event_soon_${event.id}_${offsetDays}`,
        exempt: event.created_by === userId
      });
      if (result.inserted) {
        realtime.emit(`new_notification_${userId}`, { id: result.id });
      }
    }
  }
}

/**
 * One notification per publisher carrying the COUNT of messages awaiting
 * their review (story 9) — never one per message. Only occasion types with
 * `premoderate_messages` on ever produce a `pending` congratulation in the
 * first place (عزا today), so this is naturally scoped to that queue.
 * Always `exempt: true` — this is inherently about the publisher's OWN
 * content (story 11's «ما يخصّ مناسبتي أنا»), so it must never be blocked
 * by, nor consume, the daily cap (issue #85 review, FIX 3).
 * `moderation_digest_<today>` as the dedupe key means a second run the same
 * day changes nothing — the count for the day is whatever this pass first
 * saw it as.
 */
async function runModerationDigestPass() {
  const rows = await db.query(
    `SELECT e.created_by AS user_id, COUNT(*) AS pending_count
       FROM congratulations c
       JOIN events e ON e.id = c.event_id
       JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE c.status = 'pending' AND e.created_by IS NOT NULL AND ot.premoderate_messages = 1
      GROUP BY e.created_by`
  );
  if (!rows.length) return;

  const { today } = await db.queryOne("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");

  for (const row of rows) {
    const count = Number(row.pending_count);
    const result = await notifications.createScheduled({
      userId: row.user_id,
      eventId: null,
      type: notifications.TYPES.MODERATION_DIGEST,
      title: 'رسائل بانتظار مراجعتك',
      body: `لديك ${count} رسالة تنتظر مراجعتك`,
      dedupeKey: `moderation_digest_${today}`,
      exempt: true
    });
    if (result.inserted) {
      realtime.emit(`new_notification_${row.user_id}`, { id: result.id });
    }
  }
}

/**
 * The scheduler's whole daily job body (issue #85) — countdown then digest,
 * order-free and safe to run twice, since every row either pass writes
 * carries a dedupe key. Exported directly so a test can run one pass
 * deterministically instead of waiting for a timer (tests must never sleep).
 */
async function runDailyPass() {
  await runCountdownPass();
  await runModerationDigestPass();
}

/** Milliseconds from `now` until the next 09:00 Asia/Jerusalem — today's if it hasn't happened yet, tomorrow's otherwise. DST-safe: re-resolves the zone's offset via `getZonedParts`/`zonedTimeToUtc` on every call rather than caching one. */
function millisecondsUntilNextRun(now = new Date()) {
  const zonedNow = getZonedParts(now);
  let target = zonedTimeToUtc(zonedNow.year, zonedNow.month, zonedNow.day, RUN_HOUR, 0, 0);
  if (target.getTime() <= now.getTime()) {
    const tomorrowGuess = new Date(target.getTime() + DAY_MS);
    const tomorrowParts = getZonedParts(tomorrowGuess);
    target = zonedTimeToUtc(tomorrowParts.year, tomorrowParts.month, tomorrowParts.day, RUN_HOUR, 0, 0);
  }
  return Math.max(target.getTime() - now.getTime(), 0);
}

/**
 * Arms exactly one `setTimeout` for the next run, and re-arms itself the
 * same way after every run completes — never a fixed-length `setInterval`.
 * That distinction is the whole fix (issue #85 review, FIX 5): Asia/Jerusalem
 * observes DST, so a job that fires correctly once at 09:00 and then just
 * waits a flat 24 hours forever after drifts to 08:00 or 10:00 local the
 * moment the clocks change — `setInterval(fn, DAY_MS)` cannot self-correct,
 * because it never asks what time it actually is again. Calling
 * `millisecondsUntilNextRun()` fresh on every cycle is what keeps every
 * single run, not just the first, landing on 09:00 local.
 */
function armNextRun() {
  const delay = millisecondsUntilNextRun();
  armedTimer = setTimeout(() => {
    runDailyPass().catch(err => logger.error('[scheduler] daily pass failed:', err.message));
    armNextRun();
  }, delay);
  armedTimer.unref();
}

/**
 * Starts the daily job inside this process (issue #85's own architectural
 * decision: no scheduling dependency, no cron). The timer is `unref()`d so
 * it never keeps the process alive on its own — Node exits once nothing else
 * is pending — which is also what keeps `npm test` timer-free: the test
 * suite boots the app via `createApp()` directly (server.js is never
 * required), so this function is never called during a test run at all.
 * Calling `start()` a second time is a no-op rather than arming a second
 * timer alongside the first.
 */
function start() {
  if (armedTimer) return;
  armNextRun();
}

/** Clears the currently-armed timer, if any — the explicit counterpart to `start()`, called from server.js's own graceful-shutdown handler and by tests that exercise the pair. */
function stop() {
  if (armedTimer) {
    clearTimeout(armedTimer);
    armedTimer = null;
  }
}

module.exports = { start, stop, runDailyPass, millisecondsUntilNextRun };
