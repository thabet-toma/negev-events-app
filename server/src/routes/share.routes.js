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
const analytics = require('../services/analytics.service');
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

/**
 * poster_url → occasion type's default_poster_url → platform fallback by tone.
 * The first two arrive already absolute from the service layer, where media
 * conversion belongs (ADR-0002); only the fallback constant is converted here,
 * because it never passed through a query at all.
 */
function resolvePosterUrl(event) {
  if (event.poster_url) return event.poster_url;
  if (event.occasion_type_poster_url) return event.occasion_type_poster_url;
  const tone = OCCASION_TONES.includes(event.occasion_type_tone) ? event.occasion_type_tone : 'festive';
  return absoluteMediaUrl(SHARE_FALLBACK_POSTERS[tone]);
}

/**
 * A CSS colour from the database is still database content, and it lands in a
 * style="" attribute on our own domain. img-src is open on this page, so a
 * crafted value could smuggle a background-image request out — hence a strict
 * hex allow-list rather than escaping. Anything else falls back to the tone's
 * own accent, which is never user-controlled.
 */
function safeHexColour(value, fallback) {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '')) ? value : fallback;
}

function toneOf(event) {
  return OCCASION_TONES.includes(event.occasion_type_tone) ? event.occasion_type_tone : 'festive';
}

/**
 * Two palettes, chosen by the type's own `tone` and never by its name. A عزاء
 * must not arrive dressed in wedding gold, and a super admin renaming a type
 * must not change how it looks.
 */
const PALETTES = {
  festive: { bg: '#141821', card: '#1e232e', ink: '#f6f2ea', faint: '#a9b0bd', accent: '#d8ab5c', btnInk: '#141821' },
  solemn: { bg: '#14181a', card: '#1c2124', ink: '#eef1f0', faint: '#a3adaa', accent: '#8fa8a0', btnInk: '#14181a' }
};

/**
 * What the preview actually says. The event's own `title` is free text people
 * fill with anything — on real rows it is often just the town name — so the
 * occasion type leads instead: it is the one word that tells someone what they
 * were sent. Falls back to the title only for a legacy row with no type.
 *
 * Still no date, no venue, no phone, in the preview or on the page: those live
 * in the app, and that friction is the whole point of this page existing.
 */
function buildHeadline(event) {
  const names = event.honorees.map(h => h.name).filter(Boolean).join(' و ');
  const type = event.occasion_type_name;
  if (type && names) return `${type} ${names}`;
  return type || names || event.title;
}

function buildDescription(event) {
  const clan = event.family_clan;
  return clan
    ? `عائلة ${clan} — التفاصيل في تطبيق مناسبات النقب`
    : 'التفاصيل في تطبيق مناسبات النقب';
}

function pageStyle(palette) {
  return `
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: ${palette.bg}; color: ${palette.ink};
    font-family: "Segoe UI", Tahoma, Arial, sans-serif; padding: 20px;
    background-image: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05), transparent 60%);
  }
  .card {
    width: 100%; max-width: 440px; background: ${palette.card}; border-radius: 22px;
    overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,0.45);
    border: 1px solid rgba(255,255,255,0.06); text-align: center;
  }
  .frame { position: relative; }
  .poster { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; background: #2b3038; }
  .veil {
    position: absolute; inset: 0;
    background: linear-gradient(to top, ${palette.card} 2%, rgba(0,0,0,0.35) 32%, transparent 62%);
  }
  .chip {
    position: absolute; inset-inline-start: 50%; transform: translateX(50%);
    bottom: 16px; display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 18px; border-radius: 999px; font-size: 15px; font-weight: 700;
    backdrop-filter: blur(6px); white-space: nowrap;
  }
  .chip .ico { font-size: 17px; line-height: 1; }
  .expired {
    position: absolute; top: 14px; inset-inline-end: 14px;
    background: rgba(20,24,33,0.82); color: ${palette.faint};
    border: 1px solid rgba(255,255,255,0.14);
    font-size: 13px; padding: 5px 14px; border-radius: 999px;
  }
  .body { padding: 20px 22px 26px; }
  .names { font-size: 25px; font-weight: 700; margin: 0; line-height: 1.5; }
  .clan { font-size: 15px; color: ${palette.faint}; margin: 7px 0 0; }
  .rule {
    width: 46px; height: 2px; margin: 18px auto 16px; border: 0; border-radius: 2px;
    background: ${palette.accent}; opacity: 0.75;
  }
  .lead { font-size: 14px; color: ${palette.faint}; margin: 0 0 16px; line-height: 1.7; }
  .cta {
    display: block; background: ${palette.accent}; color: ${palette.btnInk};
    text-decoration: none; font-size: 17px; font-weight: 700;
    padding: 14px 20px; border-radius: 14px;
  }
  .mark {
    font-size: 12px; color: ${palette.faint}; opacity: 0.75;
    margin: 14px 0 0; letter-spacing: 0.3px;
  }
  .not-found { max-width: 380px; }
  .not-found .body { padding: 44px 26px; }
  .not-found h1 { font-size: 19px; margin: 0; font-weight: 700; }
  .not-found p { font-size: 14px; color: ${palette.faint}; margin: 10px 0 0; }
`;
}

/**
 * No og:image:width/height is emitted, deliberately. They were pinned at
 * 1200x630 while the real posters on production are portrait phone
 * screenshots (a live one measures 1080x2340) — a declared aspect four times
 * off the actual image, which is why the preview arrived with no picture at
 * all: the crawler lays the card out from those numbers and drops or
 * hair-slices an image that contradicts them. Declared dimensions are a
 * rendering hint, not an obligation; absent, the crawler measures the image
 * itself and is never lied to. Put them back only when we serve an image
 * whose size we actually know.
 */
function renderEventPage(event, { pageUrl, imageUrl, downloadUrl }) {
  const palette = PALETTES[toneOf(event)];
  const headline = buildHeadline(event);
  const description = buildDescription(event);
  const names = event.honorees.map(h => h.name).filter(Boolean).join(' و ') || event.title;
  const typeName = event.occasion_type_name;
  const typeColour = safeHexColour(event.occasion_type_colour, palette.accent);
  const icon = event.occasion_type_icon;

  // The type chip is the fix for what this page got wrong first time round:
  // the preview led with the free-text title, often just the town on real rows,
  // so nothing on the card said whether it was a wedding or a funeral.
  const chip = typeName
    ? `<span class="chip" style="background:${escapeHtml(typeColour)}26;color:${escapeHtml(typeColour)};border:1px solid ${escapeHtml(typeColour)}59;">${icon ? `<span class="ico">${escapeHtml(icon)}</span>` : ''}${escapeHtml(typeName)}</span>`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(headline)}</title>
<meta property="og:title" content="${escapeHtml(headline)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="مناسبات النقب">
<meta property="og:locale" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<style>${pageStyle(palette)}</style>
</head>
<body>
<main class="card">
<div class="frame">
<img class="poster" src="${escapeHtml(imageUrl)}" alt="">
<div class="veil"></div>
${event.is_expired ? '<span class="expired">انتهت</span>' : ''}
${chip}
</div>
<div class="body">
<h1 class="names">${escapeHtml(names)}</h1>
${event.family_clan ? `<p class="clan">${escapeHtml(event.family_clan)}</p>` : ''}
<hr class="rule">
<p class="lead">التفاصيل الكاملة في التطبيق</p>
<a class="cta" href="${escapeHtml(downloadUrl)}">حمّل التطبيق</a>
<p class="mark">مناسبات النقب</p>
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
<style>${pageStyle(PALETTES.festive)}</style>
</head>
<body>
<main class="card not-found">
<div class="body">
<h1>هذه المناسبة غير متاحة</h1>
<p>قد تكون قد حُذفت، أو لم تُعتمد بعد.</p>
<p class="mark">مناسبات النقب</p>
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

/**
 * A non-numeric id must 404 with the exact same body as "not approved" or
 * "does not exist", so a parse failure is folded into the same not-found path
 * instead of reaching the JSON error handler — which would both look different
 * and leak "this id is malformed". Both routes below share it.
 */
function shareEventIdOrNull(raw) {
  try {
    return parseId(raw, 'معرّف المناسبة');
  } catch (err) {
    return null;
  }
}

router.get('/:id', asyncHandler(async (req, res) => {
  const eventId = shareEventIdOrNull(req.params.id);

  const event = eventId ? await events.getShareEvent(eventId) : null;
  if (!event) {
    sendNotFound(res);
    return;
  }

  // Count-only, on purpose (issue #44 — the governing rule: record what a
  // person DID, never what they READ): this page has zero <script> tags
  // (CSP below is default-src 'none'), so a client-side beacon is impossible
  // here by design — recording the view has to happen in this handler, and
  // analytics.service.js strips any identity regardless since
  // share_page_viewed is a count-only event name.
  await analytics.recordSafely({
    eventName: 'share_page_viewed',
    platform: 'web',
    contentTown: event.town
  });

  const pageUrl = `${config.publicUrl}/e/${event.id}`;
  const imageUrl = resolvePosterUrl(event);
  const downloadUrl = `${pageUrl}/download`;

  res
    .status(200)
    .set('Content-Security-Policy', SHARE_CSP)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(renderEventPage(event, { pageUrl, imageUrl, downloadUrl }));
}));

/**
 * The download button on the share page points here instead of straight at
 * the APK, so the click can be recorded server-side (same no-JS constraint
 * as share_page_viewed above) before handing the visitor on. The redirect
 * target is exactly what the button used to link to directly — this route
 * adds one hop, not a different destination.
 */
router.get('/:id/download', asyncHandler(async (req, res) => {
  const eventId = shareEventIdOrNull(req.params.id);

  // The redirect must never depend on the lookup succeeding — a stale or
  // malformed link still has to hand the visitor the app. content_town is
  // simply absent when there is no matching approved event to attribute it to.
  const event = eventId ? await events.getShareEvent(eventId) : null;

  await analytics.recordSafely({
    eventName: 'app_download_clicked',
    platform: 'web',
    contentTown: event ? event.town : null
  });

  const apkUrl = absoluteMediaUrl(config.app.apkUrl);
  const downloadTarget = apkUrl || config.publicUrl;
  res.redirect(302, downloadTarget);
}));

module.exports = router;
