'use strict';

const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { absoluteMediaUrl } = require('../utils/mediaUrl');

// A code-owned whitelist: no key outside this list is ever read or written
// through this service, whatever else ends up in app_settings by other means
// (issue #85). Adding a setting later means adding its key here — never
// loosening the check itself.
const SETTING_KEYS = {
  SUPPORT_WHATSAPP_NUMBER: 'support_whatsapp_number',
  // Stored relative (`/uploads/<file>`) like every other media column, and
  // only ever written by the upload route — never as free text through PUT.
  DEFAULT_EVENT_AUDIO_URL: 'default_event_audio_url',
  // The permanent TikTok channel link, and the three fields that describe
  // "there is a live right now" — see getLiveChannel below for how they
  // combine. None of the four is in PUBLIC_KEYS, but that does NOT make them
  // private: three of their values are derived and served unauthenticated by
  // getLiveChannel below, through GET /api/live. PUBLIC_KEYS guards the raw
  // settings route only — this feature has its own shaped public surface.
  TIKTOK_PROFILE_URL: 'tiktok_profile_url',
  TIKTOK_LIVE_TITLE: 'tiktok_live_title',
  TIKTOK_LIVE_UNTIL: 'tiktok_live_until',
  TIKTOK_LIVE_URL: 'tiktok_live_url'
};

const WHITELISTED_KEYS = Object.values(SETTING_KEYS);

// The only keys GET /api/settings/public may ever expose, kept as their own
// list separate from WHITELISTED_KEYS so a future admin-only setting never
// leaks through the public route just because it joined the general whitelist.
const PUBLIC_KEYS = [SETTING_KEYS.SUPPORT_WHATSAPP_NUMBER, SETTING_KEYS.DEFAULT_EVENT_AUDIO_URL];

// Settings holding a stored-relative media path, made absolute on the way out
// for the same reason withAbsoluteMedia exists (CLAUDE.md, «الوسائط»).
const MEDIA_KEYS = [SETTING_KEYS.DEFAULT_EVENT_AUDIO_URL];

// The single source of truth for the whitelist rule — the route layer calls
// this directly (instead of re-checking `WHITELISTED_KEYS.includes(key)`
// itself) so the rule and its message exist in exactly one place.
function assertWhitelisted(key) {
  if (!WHITELISTED_KEYS.includes(key)) {
    throw ApiError.badRequest('إعداد غير معروف');
  }
}

async function readKeys(keys) {
  if (!keys.length) return {};
  const placeholders = keys.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (${placeholders})`,
    keys
  );
  const byKey = {};
  for (const row of rows) byKey[row.setting_key] = row.setting_value;

  const settings = {};
  for (const key of keys) {
    const value = key in byKey ? byKey[key] : null;
    settings[key] = MEDIA_KEYS.includes(key) ? absoluteMediaUrl(value) : value;
  }
  return settings;
}

/** Every whitelisted setting, for the admin panel. An unset key comes back as null. */
async function getAllForAdmin() {
  return readKeys(WHITELISTED_KEYS);
}

/** The PUBLIC_KEYS only, for the public unauthenticated route. */
async function getPublicSettings() {
  return readKeys(PUBLIC_KEYS);
}

/**
 * Derives the public "is there a TikTok live right now" state from the four
 * whitelisted keys. `live` is null unless both a title and an end time are
 * set, and its `active` flag is computed here — once, on the server — by
 * comparing `until` against the current time, so a forgotten flag can never
 * leave a stale "live now" state visible: it simply expires on its own.
 *
 * The `url` guard below is NOT redundant with assertLiveConsistency, which
 * rejects the same state on write. That check reads the current settings in
 * the route and writes in a separate transaction, so two concurrent PUTs —
 * one clearing the live url, one clearing the profile url — can each see the
 * other still set and both commit, leaving a titled live with nowhere to go.
 * That write-side check is therefore an admin-facing guard against saving a
 * state that does nothing; THIS read-side guard is the integrity one, and it
 * cannot race because it derives the answer at read time. The race stays
 * harmless precisely because this guard exists: the result is `live: null`,
 * never a broken link handed to a visitor.
 */
async function getLiveChannel() {
  const raw = await readKeys([
    SETTING_KEYS.TIKTOK_PROFILE_URL,
    SETTING_KEYS.TIKTOK_LIVE_TITLE,
    SETTING_KEYS.TIKTOK_LIVE_UNTIL,
    SETTING_KEYS.TIKTOK_LIVE_URL
  ]);

  const profileUrl = raw[SETTING_KEYS.TIKTOK_PROFILE_URL];
  const title = raw[SETTING_KEYS.TIKTOK_LIVE_TITLE];
  const until = raw[SETTING_KEYS.TIKTOK_LIVE_UNTIL];
  const liveUrl = raw[SETTING_KEYS.TIKTOK_LIVE_URL];

  let live = null;
  if (title && until) {
    const url = liveUrl || profileUrl;
    if (url) {
      live = { title, until, url, active: new Date(until) > new Date() };
    }
  }

  return { profile_url: profileUrl, live };
}

/**
 * An admin-facing guard against a half-configured live being saved silently:
 * without an end time (or the reverse) is meaningless, and a fully-timed
 * live with nowhere to send anyone (no live URL and no profile URL to fall
 * back to) would produce no visible result and no error — a dead end the
 * admin has no way to diagnose. `next` is the FULL post-merge settings
 * object (current values with the request's updates applied), not just the
 * keys being changed, so clearing one half of an already-saved pair is
 * caught too.
 */
function assertLiveConsistency(next) {
  const title = next[SETTING_KEYS.TIKTOK_LIVE_TITLE];
  const until = next[SETTING_KEYS.TIKTOK_LIVE_UNTIL];

  if (title && !until) {
    throw ApiError.badRequest('حدّد موعد انتهاء البث المباشر، أو امسح عنوانه');
  }
  if (until && !title) {
    throw ApiError.badRequest('حدّد عنوان البث المباشر، أو امسح موعد انتهائه');
  }
  if (title && until && !next[SETTING_KEYS.TIKTOK_LIVE_URL] && !next[SETTING_KEYS.TIKTOK_PROFILE_URL]) {
    throw ApiError.badRequest('لا يمكن تفعيل البث المباشر بلا رابط — أضف رابط البث أو رابط الحساب الدائم');
  }
}

/**
 * Writes every key in `updates` ({ key: value | null }) in one transaction —
 * a multi-key PUT must not be able to half-apply. `value` is assumed already
 * validated by the route layer; `null` clears a setting back to unset
 * (renders as `null` from both getAllForAdmin and getPublicSettings), while a
 * key simply absent from `updates` is untouched, same distinction the route
 * layer already keeps. `connection.execute` inside `db.transaction` bypasses
 * pool.js's `normalise()` and mysql2 throws on an `undefined` bind, so every
 * value is coerced to `null` here rather than trusted to already be one.
 */
async function setSettings(updates, updatedBy) {
  const entries = Object.entries(updates);
  if (!entries.length) return;
  for (const [key] of entries) assertWhitelisted(key);

  await db.transaction(async connection => {
    for (const [key, value] of entries) {
      await connection.execute(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
           VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [key, value === undefined ? null : value, updatedBy === undefined ? null : updatedBy]
      );
    }
  });

  // Logged only after the transaction actually commits — see
  // admin.service.js's promoteToAdmin/demoteToUser for the same pattern. No
  // value (a phone number is PII) — only who changed which keys.
  logger.info('settings.update', { updatedBy, keys: entries.map(([key]) => key) });
}

module.exports = {
  SETTING_KEYS,
  WHITELISTED_KEYS,
  assertWhitelisted,
  getAllForAdmin,
  getPublicSettings,
  getLiveChannel,
  assertLiveConsistency,
  setSettings
};
