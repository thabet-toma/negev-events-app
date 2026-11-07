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
const { announceNotification, announceNewEvent } = require('../realtime/announce');
const events = require('../services/events.service');
const notifications = require('../services/notifications.service');
const privacy = require('../services/privacy.service');
const { getZonedParts, zonedTimeToUtc, RUN_HOUR } = require('../utils/jerusalemTime');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * إيقاع النشر المجدول المستقل (تصحيح جولة #167): دقيقة واحدة. `publish_at`
 * يأتي من `<input type="datetime-local">` بدقّة الدقيقة، فدورة كل دقيقة تعني
 * أن المناسبة تظهر ويصل إشعارها في دقيقة موعدها لا في الجولة اليومية التالية
 * عند 09:00 — موعدُ نشرٍ في 09:01 كان ينتظر يوماً كاملاً قبل هذا.
 */
const PUBLISH_TICK_MS = 60 * 1000;

let armedTimer = null;
/** مؤقّت إيقاع النشر المستقل عن الجولة اليومية (تذكرة #167). */
let publishTimer = null;
/** جيل سلسلة مؤقّت النشر؛ `stop()` يبطل دورة كانت لا تزال تنتظر دفعتها. */
let publishTimerGeneration = 0;
/** حارس تشغيل واحد للدفعة: الجولة اليومية والإيقاع لا يدخلانها معاً. */
let publishPassRunning = false;

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
 * (issue #85 review, FIX 6 — one list, one source). 2 keeps its dual form
 * «يومين»; any other offset falls back to a plain "N أيام" built from the
 * same digit.
 */
const OFFSET_PHRASES = Object.fromEntries(
  notifications.COUNTDOWN_OFFSETS.filter(offset => offset > 0).map(offset => {
    if (offset === 2) return [offset, 'يومين'];
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
 * whose date is exactly one of `COUNTDOWN_OFFSETS` (8, 6, 4, 2, 0) days out today, notifies every
 * un-muted "ذكّرني" follower — the event's own creator included, if they
 * follow it too, but exempt from the daily cap (story 11 — exempt means never
 * counted either, see notifications.service.js#countScheduledToday). Muted
 * rows (`notify = 0`) are excluded: such a follow stays on «قائمتي» but is
 * never notified. `event_soon`'s own dedupe key
 * (`event_soon_<event_id>_<offsetDays>`) is what makes
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
    `SELECT event_id, user_id FROM event_reminders
      WHERE event_id IN (${placeholders}) AND notify = 1 ORDER BY id ASC`,
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
        announceNotification({
          id: result.id,
          user_id: userId,
          title: 'تذكير بمناسبة قادمة',
          body: countdownBody(offsetDays, event.title),
          event_id: event.id
        });
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
    const title = 'رسائل بانتظار مراجعتك';
    const body = `لديك ${count} رسالة تنتظر مراجعتك`;
    const result = await notifications.createScheduled({
      userId: row.user_id,
      eventId: null,
      type: notifications.TYPES.MODERATION_DIGEST,
      title,
      body,
      dedupeKey: `moderation_digest_${today}`,
      exempt: true
    });
    if (result.inserted) {
      announceNotification({ id: result.id, user_id: row.user_id, title, body });
    }
  }
}

/**
 * «قوّي مناسبتك» الثاني والأخير: لناشر وصله الأول قبل يومين وما زالت مناسبته
 * ينقصها ما يعرضه نوعها (`createEventNudge` يعيد الفحص نفسه ولا يكتب شيئاً
 * إن اكتملت). مفتاح `event_nudge_<id>_2` يجعل التكرار بلا أثر.
 */
async function runNudgePass() {
  for (const eventId of await notifications.listEventsDueSecondNudge()) {
    const nudge = await notifications.createEventNudge(eventId, 2);
    if (nudge) announceNotification(nudge);
  }
}

/**
 * The erasure requests past their deadline (issue #164) — the one job that
 * deletes accounts with no human in the loop. THIS PASS contributes no SQL of
 * its own: the candidate query lives in privacy.service.js
 * (`listDueErasureRequests`), and the older passes above keep the queries they
 * already had. That query returns only verified (`source = 'account'`),
 * pending erasures past the stated deadline; a request still inside its
 * deadline, a public phone-only request, an access request and a closed one
 * are never returned. `executeErasureRequest` then re-proves the same facts under a lock
 * inside the deletion transaction, so a request closed after listing deletes
 * nobody. One failing request is logged and the rest of the queue still runs —
 * a single broken row must not hold every other person's overdue erasure
 * forever.
 */
async function runPrivacyErasurePass() {
  const due = await privacy.listDueErasureRequests();
  for (const request of due) {
    try {
      await privacy.executeErasureRequest(request.id);
    } catch (err) {
      logger.error('[scheduler] erasure request failed:', err.message);
    }
  }
}

/**
 * النشر المجدول (تذكرة #167) — كل مناسبة معتمدة بلغ `publish_at` ولم تُعلَن
 * بعد يُعلَن عنها الآن: صفوف «مناسبة جديدة» مرة واحدة، وإشارة لحظية واحدة،
 * ودفع واحد. وهي نفس مادة الإعلان التي يكتبها المسارَان (النشر الفوري
 * والاعتماد)، فلا يفترق شكل ما يصل الناس.
 *
 * **الإعلان وحجزه في معاملة واحدة** (تصحيح جولة #167): `notifications.notifyNewEvent`
 * يحجز الصفّ (`announced_at IS NULL` ذرّياً) ويكتب صفوف الإشعارات في المعاملة
 * نفسها، فلا يبقى صفٌّ معلَّم «أُعلن» بلا إعلان: فشل الكتابة يتراجع بالحجز معه،
 * ويبقى الصفّ في `listDueScheduledPublish` فتُعيده الدورة التالية. و`null`
 * تعني «بالرابط فقط» أو «حجزه تشغيل آخر» — فلا بثّ ولا دفع.
 *
 * **وإيقاعه مستقلّ عن الجولة اليومية**: `start()` يسلّح مؤقّتين — الجولة
 * اليومية عند 09:00 (`armNextRun`) وإيقاع النشر كل `PUBLISH_TICK_MS`
 * (`armNextPublishTick`)، فموعد 09:01 لا ينتظر الجولة التالية. والجولة اليومية
 * تبقى تستدعيه أوّلاً كمسحة زائدة، لا كإيقاع وحيد.
 */
async function runScheduledPublishPass() {
  // دفعة واحدة في الوقت نفسه: الجولة اليومية قد تصادف إيقاع النشر، والحجز
  // الذرّي يمنع التكرار أصلاً — هذا يوفّر دورة مكرّرة لا تُنتج شيئاً.
  if (publishPassRunning) return;
  publishPassRunning = true;
  try {
    for (const event of await events.listDueScheduledPublish()) {
      try {
        const announcement = await notifications.notifyNewEvent(event);
        // «بالرابط فقط» تعيد `null` فلا إشارة ولا دفع — كما في المسارين، وكذلك
        // صفّ حجزه تشغيل آخر في اللحظة نفسها.
        if (!announcement) continue;
        realtime.emit('new_event_created', {
          id: event.id,
          title: event.title,
          groom_name: event.groom_name,
          town: event.town,
          event_date: event.event_date
        });
        announceNewEvent(announcement);
      } catch (err) {
        // فشل مناسبة واحدة لا يُسقط بقية الدفعة: صفّها لم يُعلَّم (المعاملة
        // تراجعت) فتعود المحاولة في الإيقاع التالي، ولا يُفقد إعلانها.
        logger.error(`[scheduler] scheduled publish failed for event ${event.id}:`, err.message);
      }
    }
  } finally {
    publishPassRunning = false;
  }
}

/**
 * The scheduler's whole daily job body (issue #85) — scheduled publishing first
 * (a row that just went public may be due for today's countdown too), then
 * countdown, digest, then the second nudge and the overdue erasures (issue
 * #164), order-free beyond that and safe to run twice, since every notification
 * row either pass writes carries a dedupe key, an executed erasure request
 * ceases to exist, and the scheduled publish pass claims its own rows.
 * Exported directly so a test can run one pass deterministically instead of
 * waiting for a timer (tests must never sleep).
 *
 * The publish call here is a redundant sweep, not the publish rhythm: since
 * #167 the publish pass has its own minute timer (`armNextPublishTick`), and
 * this one only guarantees the 09:00 pass sees a row that went public exactly
 * at 09:00 before the countdown reads the day.
 */
async function runDailyPass() {
  await runScheduledPublishPass();
  await runCountdownPass();
  await runModerationDigestPass();
  await runNudgePass();
  await runPrivacyErasurePass();
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
 * Arms the publish rhythm's own timer (تصحيح جولة #167) — separate from
 * `armNextRun` so a publish moment never waits for the 09:00 pass. Re-armed
 * after every completed pass rather than `setInterval`, so two passes can
 * never overlap; the interval is fixed because `publish_at` is minute-precise
 * and a minute means the same thing on both sides of a DST boundary. `unref()`
 * like the daily timer: this never keeps the process alive on its own.
 *
 * `generation` belongs to one `start()` lifetime. A pass can finish after
 * `stop()` cleared its timer; without the comparison its `.finally()` would
 * re-arm that stopped lifetime, and a later `start()` would then have two
 * publish chains.
 */
function armNextPublishTick(generation) {
  if (generation !== publishTimerGeneration) return;
  publishTimer = setTimeout(() => {
    if (generation !== publishTimerGeneration) return;
    return runScheduledPublishPass()
      .catch(err => logger.error('[scheduler] scheduled publish tick failed:', err.message))
      .finally(() => armNextPublishTick(generation));
  }, PUBLISH_TICK_MS);
  publishTimer.unref();
}

/**
 * Starts the scheduled jobs inside this process (issue #85's own architectural
 * decision: no scheduling dependency, no cron): the daily pass and, since
 * #167, the independent publish rhythm. Both timers are `unref()`d so they
 * never keep the process alive on their own — Node exits once nothing else
 * is pending — which is also what keeps `npm test` timer-free: the test
 * suite boots the app via `createApp()` directly (server.js is never
 * required), so this function is never called during a test run at all.
 * Calling `start()` a second time is a no-op rather than arming a second
 * timer alongside the first.
 */
function start() {
  if (armedTimer) return;
  const publishGeneration = ++publishTimerGeneration;
  armNextRun();
  armNextPublishTick(publishGeneration);
}

/** Clears the currently-armed timers, if any — the explicit counterpart to `start()`, called from server.js's own graceful-shutdown handler and by tests that exercise the pair. */
function stop() {
  // Invalidates an in-flight pass as well as clearing a handle that has not fired yet.
  publishTimerGeneration += 1;
  if (armedTimer) {
    clearTimeout(armedTimer);
    armedTimer = null;
  }
  if (publishTimer) {
    clearTimeout(publishTimer);
    publishTimer = null;
  }
}

module.exports = {
  start, stop, runDailyPass, runPrivacyErasurePass, runScheduledPublishPass,
  millisecondsUntilNextRun, PUBLISH_TICK_MS
};
