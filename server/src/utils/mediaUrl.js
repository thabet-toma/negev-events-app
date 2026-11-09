'use strict';

const config = require('../config');

/**
 * Media columns are stored relative (`/uploads/<file>`), which only resolves
 * for a client served from this same origin. Every other consumer — the web UI
 * on its own host, a Flutter app, any native client — needs them absolute.
 *
 * Values that are already absolute (an admin-supplied external poster) and
 * empty values pass through untouched, so nothing gets double-prefixed.
 */
function absoluteMediaUrl(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (!value.startsWith('/')) return value;
  return config.publicUrl + value;
}

// `image_url` (event_cards, service_providers) and `photo_url` (event_cards,
// تذكرة #180) are stored exactly as storage returned them — Cloudinary
// absolute, or `/uploads/…` — and every one of them leaves the server absolute
// for the same reason as `poster_url` (ADR-0002). A row that carries no such
// column is untouched: the loop only converts keys that exist.
const MEDIA_FIELDS = ['poster_url', 'audio_url', 'image', 'sticker_url', 'artist_image_url', 'image_url', 'photo_url'];

/** Returns a copy of the row with its media columns made absolute. */
function withAbsoluteMedia(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const field of MEDIA_FIELDS) {
    if (field in out) out[field] = absoluteMediaUrl(out[field]);
  }
  return out;
}

module.exports = { absoluteMediaUrl, withAbsoluteMedia, MEDIA_FIELDS };
