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
const shareCard = require('../services/shareCard.service');
const logger = require('../utils/logger');
const { parseId } = require('../middleware/validate');
const { absoluteMediaUrl } = require('../utils/mediaUrl');
const { PALETTES, toneOf, safeHexColour, resolvePosterUrl } = require('../utils/shareTheme');
const { buildMarkParts, partsToSvgPaths } = require('../utils/brandMark');

const router = express.Router();

// helmet's CSP is globally disabled (server/src/app.js — the UI loads posters,
// audio and map tiles from third-party CDNs), so this one HTML-emitting route
// sets its own: no scripts, no external stylesheets, images from anywhere
// (posters can be admin-supplied external URLs). `font-src 'self'` is a
// deliberate, narrow widening (product-owner decision) so this page can load
// its own Cairo woff2 files below — still no script-src, no external origin.
const SHARE_CSP = "default-src 'none'; img-src *; style-src 'unsafe-inline'; font-src 'self'";

// The two platform fallback PNGs (server/scripts/build-share-fallbacks.js)
// and the two Cairo weights this page's own @font-face declares (converted
// from server/src/assets/fonts/*.ttf — see the OFL.txt copied alongside them
// here, same licence obligation shareCard.service.js discharges for the TTFs)
// — read once at startup, a handful of KB each, never changing at runtime,
// so there is no reason to hit the filesystem on every request.
const ASSET_DIR = path.join(__dirname, '..', 'assets', 'share');
const ASSETS = {
  'festive.png': fs.readFileSync(path.join(ASSET_DIR, 'festive.png')),
  'solemn.png': fs.readFileSync(path.join(ASSET_DIR, 'solemn.png')),
  'Cairo-Regular.woff2': fs.readFileSync(path.join(ASSET_DIR, 'Cairo-Regular.woff2')),
  'Cairo-Bold.woff2': fs.readFileSync(path.join(ASSET_DIR, 'Cairo-Bold.woff2'))
};
const ASSET_CONTENT_TYPES = {
  'festive.png': 'image/png',
  'solemn.png': 'image/png',
  'Cairo-Regular.woff2': 'font/woff2',
  'Cairo-Bold.woff2': 'font/woff2'
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
 * `#rrggbb` (or `#rgb`) + an 0–1 alpha → a CSS `rgba(...)` string — the same
 * conversion shareCard.service.js's own `withAlpha` performs for canvas
 * fills, needed again here for style-attribute strings since that module
 * exports no shared utility. Only ever called with a palette's own hardcoded
 * hex (never a database value), so no allow-list check is needed here —
 * `safeHexColour` above still guards the one colour on this page that does
 * come from the database (the occasion type chip).
 */
function withAlphaCss(hex, alpha) {
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The brand mark, inline in the document rather than an `<img>` — literal
 * markup is part of the page, not a fetch, so it never collides with
 * `default-src 'none'` the way a reference to `web/icons/…` would (`web/` is
 * a separate deployable, a different origin this CSP cannot open). Built
 * from the same `buildMarkParts` geometry every other rendering of the mark
 * reads from (server/src/utils/brandMark.js) — never redrawn by hand here.
 * The 'icon' detail level is the one already used at small sizes elsewhere
 * (shareCard.service.js's own footer mark). Any `groundD` cut-outs are
 * painted the palette's own card colour rather than composited transparent,
 * since this SVG always sits directly on a `.card`-coloured surface here.
 */
const MARK_PATHS = partsToSvgPaths(buildMarkParts('icon'));
function inlineMarkSvg(palette) {
  const groundPath = MARK_PATHS.groundD ? `\n  <path d="${MARK_PATHS.groundD}" fill="${palette.card}"/>` : '';
  return `<svg class="mark-svg" viewBox="0 0 100 100" width="34" height="34" role="img" aria-label="${escapeHtml(palette.wordmark)}">
  <path d="${MARK_PATHS.markD}" fill="${palette.accent}"/>${groundPath}
</svg>`;
}

/**
 * Three small monoline glyphs, hand-authored primitives (no icon font, no
 * emoji — emoji is what shareCard.service.js's own chip explicitly avoids,
 * for the same reason: no font coverage to rely on). `currentColor` so each
 * inherits `.glyph`'s own colour rather than hardcoding one twice.
 */
const REASON_ICONS = {
  bell: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a5 5 0 0 0-5 5v3.5c0 1-.4 2-1.2 2.7L4 16h16l-1.8-1.8c-.8-.7-1.2-1.7-1.2-2.7V8a5 5 0 0 0-5-5Z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-9-9c-1.3-3 1-6 4-6 2 0 3.5 1.3 5 3 1.5-1.7 3-3 5-3 3 0 5.3 3 4 6-2 4.5-9 9-9 9Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
};

/**
 * What the platform gives someone who installs — never anything about the
 * one event this link is for, so the no-date/no-venue/no-phone rule above is
 * untouched by this strip (product-owner decision: three reasons under the
 * call to action, since the page's real problem was never saying what the
 * app IS).
 */
const REASONS = [
  { icon: REASON_ICONS.bell, text: 'كل مناسبة في بلدك، قبل ما توصلك الأخبار' },
  { icon: REASON_ICONS.heart, text: 'تهنئتك أو تعزيتك توصل للعائلة مباشرة' },
  { icon: REASON_ICONS.lock, text: 'دفتر نقوطك الخاص، ما يشوفه غيرك' }
];

function reasonsStrip() {
  return `<ul class="reasons">
${REASONS.map(r => `<li class="reason"><span class="glyph">${r.icon}</span><span>${escapeHtml(r.text)}</span></li>`).join('\n')}
</ul>`;
}

/**
 * Two buttons, always both shown — no platform sniffing, no `<script>` to do
 * it with anyway. The primary is unchanged (the existing download route,
 * still recording `app_download_clicked`); the secondary is the honest
 * answer for an iPhone visitor who would otherwise be handed an APK their
 * device cannot open: the site itself, installable from the browser.
 */
function actionButtons({ downloadUrl, siteRootUrl }) {
  return `<div class="actions">
<a class="cta" href="${escapeHtml(downloadUrl)}">حمّل التطبيق</a>
<a class="cta-secondary" href="${escapeHtml(siteRootUrl)}">افتح في المتصفّح</a>
</div>`;
}

/**
 * What the preview actually says. The event's own `title` is free text people
 * fill with anything — on real rows it is often just the town name — so the
 * occasion type leads instead: it is the one word that tells someone what they
 * were sent. Falls back to the title only for a legacy row with no type.
 *
 * Still no date, no venue, no phone in any text this file emits — the preview
 * copy, the meta tags, the page body. Those live in the app, and that friction
 * is the point of this page. What the generated card shows is a separate
 * question and a separate decision: the poster is drawn sharp there, so
 * anything a family printed on their own invitation is visible in it (see
 * shareCard.service.js). This file's own restraint is unchanged either way.
 */
function buildHeadline(event) {
  const names = event.honorees.map(h => h.name).filter(Boolean).join(' و ');
  const type = event.occasion_type_name;
  if (type && names) return `${type} ${names}`;
  return type || names || event.title;
}

function buildDescription(event) {
  const palette = PALETTES[toneOf(event)];
  const clan = event.family_clan;
  return clan
    ? `عائلة ${clan} — التفاصيل في تطبيق ${palette.wordmark}`
    : `التفاصيل في تطبيق ${palette.wordmark}`;
}

function pageStyle(palette) {
  return `
  @font-face {
    font-family: "Cairo Share"; font-weight: 400; font-style: normal; font-display: swap;
    src: url("/e/assets/Cairo-Regular.woff2") format("woff2");
  }
  @font-face {
    font-family: "Cairo Share"; font-weight: 700; font-style: normal; font-display: swap;
    src: url("/e/assets/Cairo-Bold.woff2") format("woff2");
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: ${palette.bg}; color: ${palette.ink};
    font-family: "Cairo Share", "Segoe UI", Tahoma, Arial, sans-serif; padding: 20px;
    background-image: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05), transparent 60%);
  }
  .card {
    width: 100%; max-width: 440px; background: ${palette.card}; border-radius: 22px;
    overflow: hidden; text-align: center;
    /* Same two-tone frame convention as the generated card's own drawFrame
       (shareCard.service.js): an outer accent border plus an inset
       "companion rule" a few pixels in, so the frame drawn inside the image
       and the frame around it read as one idea in the same screenshot. */
    border: 1px solid ${withAlphaCss(palette.accent, 0.55)};
    box-shadow: 0 18px 50px rgba(0,0,0,0.45), inset 0 0 0 5px ${withAlphaCss(palette.accent, 0.22)};
  }
  .top-mark { padding: 18px 0 2px; display: flex; justify-content: center; }
  .mark-svg { display: block; }
  .frame { position: relative; }
  /* Square, matching the generated card this <img> actually loads — a 4/5 box
     cropped the card's own text band off the bottom of the page. */
  .poster { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; background: #2b3038; }
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
  .actions { display: flex; flex-direction: column; gap: 10px; }
  .cta {
    display: block; background: ${palette.accent}; color: ${palette.btnInk};
    text-decoration: none; font-size: 17px; font-weight: 700;
    padding: 14px 20px; border-radius: 14px;
  }
  /* The honest answer for a visitor whose device the primary button cannot
     serve (an iPhone handed an APK) — the site itself, installable from the
     browser it is already open in. Always shown next to the primary, never
     chosen by sniffing the visitor's platform — this page runs no script,
     so there is nothing to sniff with anyway. */
  .cta-secondary {
    display: block; background: transparent; color: ${palette.ink};
    text-decoration: none; font-size: 15px; font-weight: 600;
    padding: 12px 20px; border-radius: 14px;
    border: 1px solid ${withAlphaCss(palette.faint, 0.4)};
  }
  .reasons {
    list-style: none; margin: 20px 0 0; padding: 0;
    display: flex; flex-direction: column; gap: 10px; text-align: start;
  }
  .reason { display: flex; align-items: center; gap: 10px; font-size: 13px; color: ${palette.faint}; line-height: 1.4; }
  .reason .glyph {
    flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: ${withAlphaCss(palette.accent, 0.14)}; color: ${palette.accent};
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
 * og:image:width/height are declared again as of the generated card
 * (shareCard.service.js) — they were pulled out earlier because they were
 * pinned at 1200x630 while og:image pointed straight at the event's own
 * poster, and a real production poster is a portrait phone screenshot (a
 * live one measures 1080x2340): a declared aspect four times off the actual
 * image, which is why the preview arrived with no picture at all — the
 * crawler lays the card out from those numbers and drops or hair-slices an
 * image that contradicts them. Declared dimensions are a rendering hint, not
 * an obligation; wrong, they are worse than absent.
 *
 * og:image now points at `/e/:id/card.jpg` instead, a 1200×1200 JPEG the
 * server renders itself — so the declared size is no longer a guess about
 * someone else's upload, it is the exact size of a file this route just
 * asked to be produced. `imageDimensions` is null only when rendering that
 * card failed and the page fell back to the raw poster URL (see the handler
 * below) — that is the one case where the size is unknown again, and the
 * tags are omitted for exactly the same reason as before.
 */
function renderEventPage(event, { pageUrl, imageUrl, imageDimensions, downloadUrl, siteRootUrl }) {
  const palette = PALETTES[toneOf(event)];
  const headline = buildHeadline(event);
  const description = buildDescription(event);
  const names = event.honorees.map(h => h.name).filter(Boolean).join(' و ') || event.title;
  const typeName = event.occasion_type_name;
  const typeColour = safeHexColour(event.occasion_type_colour, palette.accent);
  const icon = event.occasion_type_icon;

  // The type chip and the veil dress a *bare poster*, and the generated card
  // already carries its own type chip and name band — overlaying a second one
  // on top of it just prints the type twice. `imageDimensions` is null in
  // exactly one case (see the handler below): the card failed to render and
  // this page fell back to the raw poster. That is the case the overlay is
  // for, so it is the case that gets it.
  const overlay = !imageDimensions;
  const chip = overlay && typeName
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
${imageDimensions ? `<meta property="og:image:width" content="${imageDimensions.width}">
<meta property="og:image:height" content="${imageDimensions.height}">` : ''}
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${palette.wordmark}">
<meta property="og:locale" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<style>${pageStyle(palette)}</style>
</head>
<body>
<main class="card">
<div class="top-mark">${inlineMarkSvg(palette)}</div>
<div class="frame">
<img class="poster" src="${escapeHtml(imageUrl)}" alt="">
${overlay ? '<div class="veil"></div>' : ''}
${event.is_expired ? '<span class="expired">انتهت</span>' : ''}
${chip}
</div>
<div class="body">
<h1 class="names">${escapeHtml(names)}</h1>
${event.family_clan ? `<p class="clan">${escapeHtml(event.family_clan)}</p>` : ''}
<hr class="rule">
<p class="lead">التفاصيل الكاملة في التطبيق</p>
${actionButtons({ downloadUrl, siteRootUrl })}
${reasonsStrip()}
<p class="mark">${palette.wordmark}</p>
</div>
</main>
</body>
</html>`;
}

/**
 * Byte-identical for "does not exist", "not approved yet", and "not a valid
 * id" — the response must not let anyone distinguish those (issue #44). No
 * per-request data goes into this template (there is no event to draw one
 * from), so that stays true by construction even with the redesigned shell
 * below: same mark, same two buttons, same reasons, every time.
 */
function renderNotFoundPage() {
  const palette = PALETTES.festive;
  const downloadUrl = absoluteMediaUrl(config.app.apkUrl) || config.publicUrl;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>المناسبة غير موجودة</title>
<style>${pageStyle(palette)}</style>
</head>
<body>
<main class="card not-found">
<div class="top-mark">${inlineMarkSvg(palette)}</div>
<div class="body">
<h1>هذه المناسبة غير متاحة</h1>
<p>قد تكون قد حُذفت، أو لم تُعتمد بعد.</p>
${actionButtons({ downloadUrl, siteRootUrl: config.publicUrl })}
${reasonsStrip()}
<p class="mark">${palette.wordmark}</p>
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
    .set('Content-Type', ASSET_CONTENT_TYPES[req.params.file])
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
  const downloadUrl = `${pageUrl}/download`;

  // Rendering (or, after the first view since the last edit, just reading
  // the cache — see shareCard.service.js) happens here so the card exists by
  // the time a crawler follows og:image, not on that request's own critical
  // path. A render failure must never 500 this page: fall back to the plain
  // poster URL exactly as before this feature existed, and — since we no
  // longer know that image's real shape — omit the width/height hint too.
  let imageUrl = `${pageUrl}/card.jpg`;
  let imageDimensions = { width: shareCard.WIDTH, height: shareCard.HEIGHT };
  try {
    await shareCard.getOrRenderCard(event);
  } catch (err) {
    logger.error(`[share] card render failed for event ${event.id}: ${err.message}`);
    imageUrl = resolvePosterUrl(event);
    imageDimensions = null;
  }

  res
    .status(200)
    .set('Content-Security-Policy', SHARE_CSP)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(renderEventPage(event, { pageUrl, imageUrl, imageDimensions, downloadUrl, siteRootUrl: config.publicUrl }));
}));

/**
 * The card itself — a 1200×1200 JPEG generated by shareCard.service.js (see
 * that file for why it exists and how it is cached). Same not-found handling
 * as the page above: a missing/pending/malformed id gets a plain 404, no
 * body worth crafting for an image response. A render failure here (distinct
 * from the pre-render above — this path is hit directly by a crawler
 * fetching og:image, not just by a page view) redirects to the plain poster
 * URL instead of 500ing, same fallback as the page uses.
 */
router.get('/:id/card.jpg', asyncHandler(async (req, res) => {
  const eventId = shareEventIdOrNull(req.params.id);
  const event = eventId ? await events.getShareEvent(eventId) : null;
  if (!event) {
    res.status(404).end();
    return;
  }

  try {
    const buffer = await shareCard.getOrRenderCard(event);
    res
      .status(200)
      .set('Content-Type', 'image/jpeg')
      .set('Cache-Control', 'public, max-age=31536000, immutable')
      .send(buffer);
  } catch (err) {
    logger.error(`[share] card render failed for event ${event.id}: ${err.message}`);
    res.redirect(302, resolvePosterUrl(event));
  }
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
