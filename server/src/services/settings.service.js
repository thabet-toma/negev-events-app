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
  DEFAULT_EVENT_AUDIO_URL: 'default_event_audio_url'
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
  setSettings
};
