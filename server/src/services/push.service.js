'use strict';

const webpush = require('web-push');
const db = require('../db/pool');
const config = require('../config');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

/**
 * Web Push delivery (issue #85, batch 4) — the only file that touches
 * `push_subscriptions` and the only one that calls `web-push`. The VAPID pair
 * is generated once by the owner and never rotated (see .env.example); this
 * module's whole job is to keep the platform fully functional when the pair
 * simply isn't there yet, which is the state it boots in today.
 *
 * Read as a function, not a boolean cached at require-time, purely so
 * smoke.test.js can exercise both the configured and unconfigured paths in
 * one process by toggling `config.push.*` around a single test — this never
 * matters in production, where the pair is set once before boot and never
 * changes.
 *
 * `web-push`'s own VAPID details are set ONLY ONCE, below, and ONLY when
 * `isVapidConfigured()` is already true at require-time — not "regardless".
 * That means a process that boots with no keys and then has `config.push.*`
 * populated afterwards (real life: never, since a real deploy sets real keys
 * before boot and never changes them — but exactly the state
 * smoke.test.js's `enableFakeVapidForTest()` creates) ends up with
 * `isVapidConfigured()` reporting true while `web-push` itself still holds
 * no VAPID details at all. That mismatch is harmless ONLY because nothing in
 * this codebase calls `webpush.sendNotification` in that state today — the
 * moment a caller does, `web-push` throws its own "no VAPID details set"
 * error before ever reaching the network. Re-deriving `isVapidConfigured()`
 * on every call is still correct for `subscribe`/`getPublicKey`/`sendToUser`'s
 * own gate; it is only `webpush.setVapidDetails` itself that stays a
 * require-time, call-once operation, matching the "generated once, never
 * rotated" rule this whole module exists to honour.
 */
function isVapidConfigured() {
  return Boolean(config.push.publicKey && config.push.privateKey && config.push.subject);
}

if (isVapidConfigured()) {
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
} else {
  // Logged once here at require-time, not on every send/subscribe attempt.
  logger.warn('[push] VAPID keys not configured — web push delivery is disabled. Notifications are still written normally; only device delivery is skipped.');
}

/** The PUBLIC VAPID key a browser needs to create a subscription. Public by design — the private key never leaves config/push.service.js. */
function getPublicKey() {
  return isVapidConfigured() ? config.push.publicKey : null;
}

/**
 * Stores or refreshes one device's subscription, keyed `(user_id, endpoint)`
 * — one row per device, not per user. Re-subscribing the same device
 * overwrites its keys instead of erroring or duplicating.
 */
async function subscribe(userId, { endpoint, p256dh, auth }) {
  if (!isVapidConfigured()) {
    throw ApiError.badRequest('الإشعارات الفورية غير مفعّلة على الخادم حالياً');
  }
  await db.execute(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [userId, endpoint, p256dh, auth]
  );
}

/** Removes one device's subscription. Idempotent — unsubscribing an endpoint that is already gone (or never existed) is not an error. */
async function unsubscribe(userId, endpoint) {
  await db.execute('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, endpoint]);
}

/**
 * The pruning decision, isolated as a small pure function so it can be tested
 * without a network call. 404/410 mean the push service itself says this
 * endpoint is gone — drop it. Everything else (429 rate-limited, 413 our own
 * payload is too large, 5xx, or no status at all) must keep the row: a
 * subscription dropped on a transient error is a user who silently stops
 * receiving notifications forever.
 */
function shouldDropSubscription(statusCode) {
  return statusCode === 404 || statusCode === 410;
}

/**
 * The longest we are willing to hold ONE delivery open for a single 429 retry
 * (spec: «429 يُعاد») — a few seconds, chosen to catch a push service's own
 * short-lived throttle window without ever looking like a hang to whatever
 * kicked delivery off. A `Retry-After` inside this ceiling gets exactly one
 * retry; one beyond it (or an absent header entirely) is simply left for
 * whenever the next real notification happens to reach this device — never a
 * held-open connection, and never a second retry either way.
 */
const RETRY_CEILING_MS = 5000;

/** Parses a `Retry-After` header (RFC 7231: either delay-seconds or an HTTP-date) into milliseconds, or `null` when absent or unparsable. */
function parseRetryAfterMs(err) {
  const headers = err && err.headers;
  const header = headers && (headers['retry-after'] || headers['Retry-After']);
  if (!header) return null;
  if (/^\d+$/.test(String(header).trim())) return Number(header) * 1000;
  const asDate = Date.parse(header);
  return Number.isNaN(asDate) ? null : Math.max(asDate - Date.now(), 0);
}

/**
 * Delivers to exactly one subscription, with AT MOST one retry — only on 429,
 * only when `Retry-After` fits inside `RETRY_CEILING_MS`. Never throws: every
 * branch either succeeds, retries once, or falls through to "keep the row,
 * do nothing further" — the same guarantee `sendToUser` promises its own
 * callers, just at the per-device level.
 */
async function deliverToSubscription(sub, payload, isRetry = false) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    );
  } catch (err) {
    const statusCode = err && err.statusCode;

    if (statusCode === 413) {
      logger.error(`[push] 413 payload too large for subscription ${sub.id} — this is a server bug, not a dead subscription; keeping the row`);
      return;
    }

    if (statusCode === 429 && !isRetry) {
      const delay = parseRetryAfterMs(err);
      if (delay !== null && delay <= RETRY_CEILING_MS) {
        await new Promise(resolve => setTimeout(resolve, delay).unref());
        await deliverToSubscription(sub, payload, true);
        return;
      }
      // No usable Retry-After, or it asks for longer than we hold this open
      // for — keep the row for whenever the next real notification arrives.
      return;
    }

    if (shouldDropSubscription(statusCode)) {
      await db.execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
    }
    // A second 429, a 5xx, or a network error with no status at all: keep
    // the row, do nothing further.
  }
}

/** Fetches `userId`'s subscriptions and fans the payload out to all of them. The awaitable core `sendToUser` fires without waiting for — see its own comment for why that split exists. */
async function deliverToUser(userId, { title, body, notificationId = null, eventId = null }) {
  const subscriptions = await db.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );
  if (!subscriptions.length) return;

  const payload = JSON.stringify({ title, body, notification_id: notificationId, event_id: eventId });
  await Promise.all(subscriptions.map(sub => deliverToSubscription(sub, payload)));
}

/**
 * Fans a notification out to every device `userId` has subscribed from.
 * Called only for a notification that was actually INSERTED (never for one a
 * dedupe key suppressed) — see `realtime/announce.js`, the one caller of
 * this function.
 *
 * Deliberately fire-and-forget: `deliverToUser` is started but never
 * `await`ed here, so a caller that awaits `sendToUser` (an HTTP route, or
 * the scheduler's own pass) only ever waits for delivery to be KICKED OFF,
 * never for it to FINISH — a bounded 429 retry can add up to
 * `RETRY_CEILING_MS` of real delivery time, and none of that may become
 * caller-visible latency. The `.catch` below is the last-resort net for an
 * error `deliverToUser`/`deliverToSubscription` didn't already handle (e.g.
 * the subscriptions query itself failing) — it is what turns "an unawaited
 * promise rejected" into a log line instead of an unhandled rejection; it is
 * not how the normal per-device failure paths are handled, since those are
 * already resolved inside `deliverToSubscription` itself. A missing VAPID
 * pair short-circuits before any of this: a notification row that was
 * written must stay written even if delivery never starts at all.
 */
async function sendToUser(userId, payload) {
  if (!isVapidConfigured()) return;
  deliverToUser(userId, payload).catch(err => logger.error('[push] sendToUser failed:', err.message));
}

/** Fans a notification out to all active push subscriptions across all users. */
async function deliverToAll({ title, body, notificationId = null, eventId = null }) {
  const subscriptions = await db.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions'
  );
  if (!subscriptions.length) return;

  const payload = JSON.stringify({ title, body, notification_id: notificationId, event_id: eventId });
  await Promise.all(subscriptions.map(sub => deliverToSubscription(sub, payload)));
}

/** Fans a notification out to all active subscribers asynchronously. */
async function sendToAllUsers(payload) {
  if (!isVapidConfigured()) return;
  deliverToAll(payload).catch(err => logger.error('[push] sendToAllUsers failed:', err.message));
}


module.exports = {
  getPublicKey,
  subscribe,
  unsubscribe,
  sendToUser,
  deliverToUser,
  sendToAllUsers,
  deliverToAll,
  shouldDropSubscription
};

