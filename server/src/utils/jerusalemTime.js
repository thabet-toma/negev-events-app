'use strict';

/**
 * Asia/Jerusalem wall-clock <-> UTC conversion, shared by the scheduled job
 * (server/src/jobs/scheduler.js) and by `GET /api/reminders/schedule`
 * (notifications.service.js#scheduleForUser) so both agree on the exact
 * instant a countdown actually fires — 09:00 local, DST included — without
 * either re-deriving it (issue #85: «تحسبها الخادم» — لا يعيد أي عميل
 * اشتقاق الفواصل بنفسه).
 */

const ZONE = 'Asia/Jerusalem';
const RUN_HOUR = 9;

/** Reads `date`'s wall-clock parts as seen in `ZONE` — DST-safe because it re-resolves the offset via `Intl` on every call rather than caching one. */
function getZonedParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = {};
  for (const { type, value } of formatter.formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  // Some locales render midnight as hour '24' rather than '00'.
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

/**
 * Converts a wall-clock date/time AS SEEN IN `ZONE` to the UTC instant it
 * actually is — the inverse of `getZonedParts`. Node ships no timezone
 * database of its own to convert with directly, so this is the standard
 * guess-and-correct trick: treat the wall-clock as if it were already UTC,
 * see what LOCAL time that guess actually reads as, and shift the guess by
 * however far that reading is from the FIXED target — never from the
 * guess's own last position, which never converges to zero (it keeps
 * reading back the same offset every time) and silently drifts by a
 * multiple of the zone's offset. Converges in one or two iterations for any
 * zone whose offset does not itself change within the shift — true here,
 * since Asia/Jerusalem's DST transitions do not land at 09:00.
 */
function zonedTimeToUtc(year, month, day, hour, minute, second) {
  const targetAsUtcNumber = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetAsUtcNumber;
  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(new Date(guess));
    const guessedLocalAsUtcNumber = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const diff = guessedLocalAsUtcNumber - targetAsUtcNumber;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/** The UTC instant of 09:00 Asia/Jerusalem on the given `YYYY-MM-DD` date string — the one fire time every countdown offset resolves to. */
function runInstantForDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return zonedTimeToUtc(year, month, day, RUN_HOUR, 0, 0);
}

module.exports = { ZONE, RUN_HOUR, getZonedParts, zonedTimeToUtc, runInstantForDate };
