'use strict';

/**
 * `GET /e/:id` — the shareable event page (issue #44). Real, server-rendered
 * HTML, mounted at the app root (`/e/...`, not `/api/...`) because social
 * crawlers (WhatsApp, Facebook) do not execute JavaScript and the SPA in
 * `web/` can never produce an Open Graph preview on its own — see
 * docs/adr/0006-server-renders-the-share-page.md, which amends the letter
 * (not the justification) of ADR-0001 (`server/` serves JSON only).
 *
 * No template engine, no `views/` directory: the HTML lives inline in this
 * file, and every user-controlled value is escaped through `escapeHtml`
 * before interpolation — the single most important rule in this file, since
 * this is the first route in the codebase that ever emits HTML at all.
 *
 * All SQL lives in `events.service.getShareEvent` — this file contains none.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const events = require('../services/events.service');
const { parseId } = require('../middleware/validate');
const { absoluteMediaUrl } = require('../utils/mediaUrl');
const { OCCASION_TONES, SHARE_FALLBACK_POSTERS } = require('../constants');

const router = express.Router();

// helmet's CSP is globally disabled (server/src/app.js — the UI loads posters,
// audio and map tiles from third-party CDNs), so this one HTML-emitting route
// sets its own: no scripts, no external stylesheets, images from anywhere
// (posters can be admin-supplied external URLs).
const SHARE_CSP = "default-src 'none'; img-src *; style-src 'unsafe-inline'";

// The two platform fallback PNGs (server/scripts/build-share-fallbacks.js),
// read once at startup — they're a handful of KB each and never change at
// runtime, so there is no reason to hit the filesystem on every request.
const ASSET_DIR = path.join(__dirname, '..', 'assets', 'share');
const ASSETS = {
  'festive.png': fs.readFileSync(path.join(ASSET_DIR, 'festive.png')),
  'solemn.png': fs.readFileSync(path.join(ASSET_DIR, 'solemn.png'))
};

/**
 * Safe in both an HTML text node and a double-quoted attribute value
 * (`content="…"`) — every interpolation into the templates below goes
 * through this, without exception. An event titled
 * `<img src=x onerror=alert(1)>"` must render as literal text and must not
 * break out of `content="…"` on the og:title tag.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** poster_url → occasion type's default_poster_url → platform fallback by tone. */
function resolvePosterUrl(event) {
  if (event.poster_url) return absoluteMediaUrl(event.poster_url);
  if (event.occasion_type_poster_url) return absoluteMediaUrl(event.occasion_type_poster_url);
  const tone = OCCASION_TONES.includes(event.occasion_type_tone) ? event.occasion_type_tone : 'festive';
  return absoluteMediaUrl(SHARE_FALLBACK_POSTERS[tone]);
}

/** No date, no venue, no phone — deliberately: those live in the app. */
function buildDescription(event) {
  const names = event.honorees.map(h => h.name).filter(Boolean).join(' و ');
  if (names && event.family_clan) return `${names} — ${event.family_clan}`;
  return names || event.occasion_type_name || event.title;
}

const PAGE_STYLE = `
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #1c1f26; color: #f4f1ec; font-family: Tahoma, Arial, sans-serif;
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 480px; background: #262a33; border-radius: 18px; overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35); text-align: center;
  }
  .poster { width: 100%; height: 360px; object-fit: cover; display: block; background: #3f4552; }
  .body { padding: 24px 20px 28px; }
  .expired-badge {
    display: inline-block; background: #7a2e2e; color: #fbe4e4; font-size: 14px;
    padding: 4px 14px; border-radius: 999px; margin-bottom: 12px;
  }
  .honorees { font-size: 22px; margin: 0 0 20px; line-height: 1.6; }
  .download-btn {
    display: inline-block; background: #caa057; color: #1c1f26; text-decoration: none;
    font-size: 17px; font-weight: bold; padding: 12px 32px; border-radius: 999px;
  }
  .not-found { max-width: 420px; }
  .not-found .body { padding: 40px 24px; }
  .not-found h1 { font-size: 20px; margin: 0; }
`;

function renderEventPage(event, { pageUrl, imageUrl, downloadUrl }) {
  const title = event.title;
  const description = buildDescription(event);
  const honoreesText = event.honorees.map(h => h.name).filter(Boolean).join(' و ') || title;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<style>${PAGE_STYLE}</style>
</head>
<body>
<main class="card">
<img class="poster" src="${escapeHtml(imageUrl)}" alt="">
<div class="body">
${event.is_expired ? '<span class="expired-badge">انتهت</span><br>' : ''}
<h1 class="honorees">${escapeHtml(honoreesText)}</h1>
<a class="download-btn" href="${escapeHtml(downloadUrl)}">حمّل التطبيق</a>
</div>
</main>
</body>
</html>`;
}

/**
 * Byte-identical for "does not exist", "not approved yet", and "not a valid
 * id" — the response must not let anyone distinguish those (issue #44).
 */
function renderNotFoundPage() {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>المناسبة غير موجودة</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main class="card not-found">
<div class="body">
<h1>هذه المناسبة غير متاحة</h1>
</div>
</main>
</body>
</html>`;
}

function sendNotFound(res) {
  res
    .status(404)
    .set('Content-Security-Policy', SHARE_CSP)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(renderNotFoundPage());
}

// `/assets/<file>` is two path segments, `/:id` matches exactly one, so the
// two routes can never collide regardless of registration order — registered
// first anyway, for a reader's sake.
router.get('/assets/:file', (req, res) => {
  const buffer = ASSETS[req.params.file];
  if (!buffer) {
    res.status(404).end();
    return;
  }
  res
    .status(200)
    .set('Content-Type', 'image/png')
    .set('Cache-Control', 'public, max-age=31536000, immutable')
    .send(buffer);
});

router.get('/:id', asyncHandler(async (req, res) => {
  // A non-numeric id must 404 with the exact same body as "not approved" or
  // "does not exist" — so a parse failure here is swallowed into the same
  // not-found path instead of being allowed to reach the JSON error handler
  // (which would both look different and leak "this id is malformed").
  let eventId = null;
  try {
    eventId = parseId(req.params.id, 'معرّف المناسبة');
  } catch (err) {
    eventId = null;
  }

  const event = eventId ? await events.getShareEvent(eventId) : null;
  if (!event) {
    sendNotFound(res);
    return;
  }

  const pageUrl = `${config.publicUrl}/e/${event.id}`;
  const imageUrl = resolvePosterUrl(event);
  const apkUrl = absoluteMediaUrl(config.app.apkUrl);
  const downloadUrl = apkUrl || config.publicUrl;

  res
    .status(200)
    .set('Content-Security-Policy', SHARE_CSP)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(renderEventPage(event, { pageUrl, imageUrl, downloadUrl }));
}));

module.exports = router;
