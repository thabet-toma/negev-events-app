'use strict';

const realtime = require('./index');
const push = require('../services/push.service');

/**
 * The one shape every "a personal notification row was just created" caller
 * uses to tell the world about it (issue #85 review, FIX 4) — the realtime
 * ping AND the Web Push fan-out, always together, always this one field
 * shape: `{ id, user_id, title, body, event_id }`. Before this existed, the
 * same two calls were hand-copied at three call sites (the admin status
 * route, and the scheduler's two passes), each re-keying the same
 * notification under its own local names — a fourth caller would have meant
 * a fourth copy.
 *
 * Lives beside `realtime/index.js`, not in `services/`, on purpose:
 * announcing IS the coordination step CLAUDE.md keeps out of a service —
 * `realtime.emit` fires from the route/job layer, after a service's write
 * already succeeded, never from inside the service itself. Batch 3 moved
 * the scheduler's own daily pass out of `services/` for exactly this reason
 * (it emits, so it isn't a service); this file is the same argument applied
 * to the two-line announce sequence itself, so it can be shared instead of
 * copied. It does no persistence and no business logic of its own — it is
 * purely "tell the socket, tell the device" for a row a caller already
 * wrote.
 *
 * `event_id` defaults to `null` — `moderation_digest` carries no event.
 * `push.sendToUser` never blocks the caller and never throws (see its own
 * comment); this function inherits both guarantees by construction.
 */
function announceNotification({ id, user_id: userId, title, body, event_id: eventId = null }) {
  realtime.emit(`new_notification_${userId}`, { id });
  push.sendToUser(userId, { title, body, notificationId: id, eventId });
}

function announceGlobalNotification({ title, body, event_id: eventId = null }) {
  realtime.emit('system_notification', { title, body, event_id: eventId });
  push.sendToAllUsers({ title, body, eventId });
}

module.exports = { announceNotification, announceGlobalNotification };

