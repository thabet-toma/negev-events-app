'use strict';

/**
 * Two server-rendered, HTML-emitting routers — real HTML, not JSON, mounted
 * at the app root rather than under `/api` because social crawlers (WhatsApp,
 * Facebook) do not execute JavaScript, so a client-only fix can never produce
 * an Open Graph preview: see docs/adr/0006-server-renders-the-share-page.md,
 * which amends the letter (not the justification) of ADR-0001 (`server/`
 * serves JSON only).
 *
 * `eventRouter` (mounted at `/e` by app.js) — `GET /e/:id`, the shareable
 * event page (issue #44).
 *
 * `liveRouter` (mounted at `/live` by app.js) — the live stream page, whatever
 * platform hosts the stream: `GET /live` the branded page (with the day's
 * episode, its poll read-only, and yesterday's result), `GET /live/card.jpg`
 * its marketing cover, `GET /live/go` and `GET /live/download` the two
 * click-through redirects, and `GET /live/embed` — a bare full-viewport page
 * wrapping the YouTube player, which the app's WebView loads so YouTube sees
 * our origin as the Referer (plan26-9 §3.1). Same carve-out as `eventRouter`,
 * not a second one: a visitor handed a link in WhatsApp always lands on our
 * own branded page first, never a bare third-party thumbnail.
 *
 * No template engine, no `views/` directory: the HTML lives inline in this
 * file, and every user-controlled value is escaped through `escapeHtml`
 * before interpolation — the single most important rule in this file, since
 * this is the first route in the codebase that ever emitted HTML at all.
 *
 * All SQL lives in `events.service.getShareEvent`,
 * `settings.service.getLiveChannel` and `liveHub.service.getHub` — this file
 * contains none.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const events = require('../services/events.service');
const settings = require('../services/settings.service');
const liveHub = require('../services/liveHub.service');
const analytics = require('../services/analytics.service');
const shareCard = require('../services/shareCard.service');
const logger = require('../utils/logger');
const { parseId } = require('../middleware/validate');
const { absoluteMediaUrl } = require('../utils/mediaUrl');
const { PALETTES, LIVE_RED, toneOf, safeHexColour, resolvePosterUrl } = require('../utils/shareTheme');
const { buildMarkParts, partsToSvgPaths } = require('../utils/brandMark');

const eventRouter = express.Router();
const liveRouter = express.Router();

// helmet's CSP is globally disabled (server/src/app.js — the UI loads posters,
// audio and map tiles from third-party CDNs), so this one HTML-emitting route
// sets its own: no scripts, no external stylesheets, images from anywhere
// (posters can be admin-supplied external URLs). `font-src 'self'` is a
// deliberate, narrow widening (product-owner decision) so this page can load
// its own Cairo woff2 files below — still no script-src, no external origin.
const SHARE_CSP = "default-src 'none'; img-src *; style-src 'unsafe-inline'; font-src 'self'";

// `/live/embed` only (plan26-9 §3.1): still no script of our own — the one
// thing it opens is a frame onto YouTube's two player origins.
const EMBED_CSP = "default-src 'none'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; style-src 'unsafe-inline'";

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
eventRouter.get('/assets/:file', (req, res) => {
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

eventRouter.get('/:id', asyncHandler(async (req, res) => {
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
eventRouter.get('/:id/card.jpg', asyncHandler(async (req, res) => {
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
eventRouter.get('/:id/download', asyncHandler(async (req, res) => {
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

// ---------------------------------------------------------------------------
// liveRouter — GET /live, /live/card.jpg, /live/go, /live/download, /live/embed
// ---------------------------------------------------------------------------

// The headline shown (and drawn on the cover) whenever there is no active
// live to lead with — a saved channel link with nothing currently happening,
// or a live whose `until` has already passed. Fixed text, never the stale
// title of an ended live: settings.service.getLiveChannel already computes
// `active` for exactly this reason (see that file's own doc comment). Names
// no platform: the stream may be on YouTube today and elsewhere tomorrow.
const LIVE_CHANNEL_HEADLINE = 'بث أعراسنا المباشر';

/**
 * The rules the live page needs and the event page does not, kept out of
 * the shared `pageStyle` so every `/e/:id` response stops shipping classes
 * it can never use. The red is `LIVE_RED` from utils/shareTheme, the same
 * value the generated cover's own pill uses — one source, so the page and
 * the image it links to can never drift apart in colour.
 */
function liveOnlyStyle(palette) {
  return `
  .live-badge {
    display: inline-block; margin: 0 0 14px; padding: 7px 18px; border-radius: 999px;
    background: ${LIVE_RED}; color: #ffffff; font-size: 14px; font-weight: 700;
  }
  .episode { text-align: start; margin: 0 0 18px; }
  .episode-label { font-size: 12px; color: ${palette.accent}; font-weight: 700; margin: 0 0 4px; }
  .episode-text { font-size: 16px; margin: 0 0 12px; line-height: 1.6; }
  .poll {
    text-align: start; margin: 0 0 18px; padding: 14px 16px; border-radius: 14px;
    background: ${withAlphaCss(palette.accent, 0.08)};
    border: 1px solid ${withAlphaCss(palette.accent, 0.25)};
  }
  .poll-question { font-size: 15px; font-weight: 700; margin: 0 0 10px; line-height: 1.6; }
  .poll-options { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .poll-option {
    font-size: 14px; padding: 8px 12px; border-radius: 10px;
    border: 1px solid ${withAlphaCss(palette.faint, 0.35)};
  }
  .poll-row { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; }
  .poll-bar { height: 8px; border-radius: 4px; margin: 4px 0 0; background: ${withAlphaCss(palette.faint, 0.2)}; overflow: hidden; }
  .poll-bar-fill { height: 100%; border-radius: 4px; background: ${palette.accent}; }
  .poll-total { font-size: 12px; color: ${palette.faint}; margin: 10px 0 0; }
  .cta-whatsapp {
    display: block; background: #25d366; color: #0b1f12;
    text-decoration: none; font-size: 15px; font-weight: 700;
    padding: 12px 20px; border-radius: 14px;
  }`;
}

/**
 * Everything the three live routes derive from the settings, in one place.
 * Each of them used to recompute `isLive`, the headline it implies, and the
 * redirect target separately — three copies of one rule, and the page could
 * have ended up showing a badge the cover disagreed with. `hasSomewhereToGo`
 * is the 404 condition: not "is a live on" but "is there anything at all to
 * send a visitor to", which a saved channel link satisfies on its own.
 */
function resolveLiveState(channel) {
  const isLive = Boolean(channel.live && channel.live.active);
  return {
    hasSomewhereToGo: Boolean(channel.profile_url || channel.live),
    isLive,
    headline: isLive ? channel.live.title : LIVE_CHANNEL_HEADLINE,
    target: isLive ? channel.live.url : channel.profile_url
  };
}
/**
 * Same primary/secondary convention as `actionButtons` above (`.cta` /
 * `.cta-secondary`, same CSS), plus a third: sharing the page itself on
 * WhatsApp (plan26-9 §2). The discussion's vote happens in the app, never on
 * this page (no script, and no account here to vote with), so the secondary
 * sends the visitor to the app download. The WhatsApp link is a plain
 * `api.whatsapp.com/send?text=` URL — the text is URI-encoded first, then the
 * whole href HTML-escaped like every other attribute in this file.
 */
function liveActionButtons({ goUrl, downloadUrl, whatsappUrl }) {
  return `<div class="actions">
<a class="cta" href="${escapeHtml(goUrl)}">ادخل البث</a>
<a class="cta-secondary" href="${escapeHtml(downloadUrl)}">شارك بالنقاش في التطبيق</a>
<a class="cta-whatsapp" href="${escapeHtml(whatsappUrl)}">مشاركة واتساب</a>
</div>`;
}

/** A 0–100 integer for a style attribute — never whatever else a row might hold. */
function clampPercent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * Today's episode as liveHub.getHub(null) returns it — topic, episode
 * question, and the poll's question with its options as a plain read-only
 * list. `getHub(null)` never carries today's results (they are shown only to
 * someone who has voted), and this page has no voter, so none are drawn.
 * Each part is omitted when empty; the whole block is '' when there is no
 * episode today.
 */
function liveEpisodeBlock(today) {
  if (!today) return '';
  const parts = [];
  if (today.topic) {
    parts.push(`<p class="episode-label">موضوع اليوم</p>
<p class="episode-text">${escapeHtml(today.topic)}</p>`);
  }
  if (today.episode_question) {
    parts.push(`<p class="episode-label">سؤال الحلقة</p>
<p class="episode-text">${escapeHtml(today.episode_question)}</p>`);
  }
  const episode = parts.length ? `<section class="episode">
${parts.join('\n')}
</section>` : '';

  const poll = today.poll ? `<section class="poll">
<p class="episode-label">نقاش اليوم في التطبيق</p>
<p class="poll-question">${escapeHtml(today.poll.question)}</p>
<ul class="poll-options">
${today.poll.options.map(option => `<li class="poll-option">${escapeHtml(option)}</li>`).join('\n')}
</ul>
</section>` : '';

  return `${episode}${poll}`;
}

/**
 * Yesterday's result — the most recent earlier day that had a poll, as
 * `getHub` defines `previous` — with its final percentages as bars. The bars
 * are plain divs with an inline width: no script, no image, nothing the CSP
 * has to open.
 */
function livePreviousBlock(previous) {
  if (!previous) return '';
  const rows = previous.results.map(r => {
    const pct = clampPercent(r.percentage);
    return `<li>
<div class="poll-row"><span>${escapeHtml(r.label)}</span><span>${pct}%</span></div>
<div class="poll-bar"><div class="poll-bar-fill" style="width:${pct}%"></div></div>
</li>`;
  }).join('\n');
  return `<section class="poll">
<p class="episode-label">نتيجة نقاش الأمس</p>
<p class="poll-question">${escapeHtml(previous.poll_question)}</p>
<ul class="poll-options">
${rows}
</ul>
<p class="poll-total">عدد المشاركين: ${Number(previous.total_votes) || 0}</p>
</section>`;
}

/**
 * `isLive` drives two things at once: the badge and the headline text — kept
 * as one boolean computed once by the handler (`channel.live &&
 * channel.live.active`) rather than re-derived here, so the page can never
 * show the badge for one state while the headline describes another.
 * `imageUrl`/`imageDimensions` are both null together, exactly like the event
 * page's own `imageDimensions === null` case: the cover failed to render, so
 * neither the `<img>` nor the `og:image`/width/height tags are emitted —
 * there is nothing here to fall back to (no raw poster; this is a generated
 * marketing image with no other source).
 */
function renderLivePage({ isLive, headline, description, imageUrl, imageDimensions, pageUrl, goUrl, downloadUrl, whatsappUrl, hub }) {
  const palette = PALETTES.festive;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(headline)}</title>
<meta property="og:title" content="${escapeHtml(headline)}">
<meta property="og:description" content="${escapeHtml(description)}">
${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:width" content="${imageDimensions.width}">
<meta property="og:image:height" content="${imageDimensions.height}">` : ''}
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${palette.wordmark}">
<meta property="og:locale" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<style>${pageStyle(palette)}${liveOnlyStyle(palette)}</style>
</head>
<body>
<main class="card">
<div class="top-mark">${inlineMarkSvg(palette)}</div>
${imageUrl ? `<div class="frame">
<img class="poster" src="${escapeHtml(imageUrl)}" alt="">
</div>` : ''}
<div class="body">
${isLive ? '<span class="live-badge">مباشر الآن</span>' : ''}
<h1 class="names">${escapeHtml(headline)}</h1>
<hr class="rule">
<p class="lead">${escapeHtml(description)}</p>
${liveEpisodeBlock(hub.today)}
${livePreviousBlock(hub.previous)}
${liveActionButtons({ goUrl, downloadUrl, whatsappUrl })}
${reasonsStrip()}
<p class="mark">${palette.wordmark}</p>
</div>
</main>
</body>
</html>`;
}

/**
 * The branded page a shared `/live` link actually opens: nobody following it
 * lands on a bare third-party thumbnail, they land here first — the live's
 * title, today's episode and its poll (read-only; voting is in the app), and
 * yesterday's result. 404s (via `sendNotFound`, the same body every other
 * not-found case on this file uses) only when there is truly nothing to send
 * anyone to — no saved channel link and no live — never merely because a
 * live is not active right now: a saved channel-only link still has
 * somewhere real to go.
 */
liveRouter.get('/', asyncHandler(async (req, res) => {
  const { hasSomewhereToGo, isLive, headline } = resolveLiveState(await settings.getLiveChannel());
  if (!hasSomewhereToGo) {
    sendNotFound(res);
    return;
  }

  const description = isLive
    ? 'البث مباشر الآن — ادخل وشاهد قبل ما ينتهي'
    : 'بث مباشر ونقاش يومي من أعراسنا — تابعنا وشارك برأيك';

  // Same no-<script> reasoning as share_page_viewed on the event page above
  // (CSP below is default-src 'none') — recorded server-side, in the handler,
  // because a client-side beacon is simply impossible on this page. The
  // event name keeps its original `tiktok_` spelling on purpose: it is a
  // stored analytics key, and renaming it would split one series in two.
  await analytics.recordSafely({ eventName: 'tiktok_page_viewed', platform: 'web' });

  // `null`: this page has no signed-in reader, so today's poll comes back
  // without results — exactly the anonymous view of GET /api/live/hub.
  const hub = await liveHub.getHub(null);

  const pageUrl = `${config.publicUrl}/live`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${headline}\n${pageUrl}`)}`;

  let imageUrl = `${pageUrl}/card.jpg`;
  let imageDimensions = { width: shareCard.WIDTH, height: shareCard.HEIGHT };
  // The buffer is deliberately discarded: this call is here to make the file
  // exist (or to prove it cannot) before a crawler follows og:image, exactly
  // as the event page pre-renders its own card. The bytes are served by the
  // /card.jpg route below, not from here.
  try {
    await shareCard.getOrRenderLiveCover({ title: headline, active: isLive });
  } catch (err) {
    logger.error(`[share] live cover render failed: ${err.message}`);
    imageUrl = null;
    imageDimensions = null;
  }

  res
    .status(200)
    .set('Content-Security-Policy', SHARE_CSP)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(renderLivePage({
      isLive,
      headline,
      description,
      imageUrl,
      imageDimensions,
      pageUrl,
      goUrl: `${pageUrl}/go`,
      downloadUrl: `${pageUrl}/download`,
      whatsappUrl,
      hub
    }));
}));

/**
 * The cover itself — see shareCard.service.js's `renderLiveCover` for why it
 * looks the way it does. 404 (empty body, no crafted page) when there is
 * nothing to draw at all, same as the event card route.
 */
liveRouter.get('/card.jpg', asyncHandler(async (req, res) => {
  const { hasSomewhereToGo, isLive, headline: title } = resolveLiveState(await settings.getLiveChannel());
  if (!hasSomewhereToGo) {
    res.status(404).end();
    return;
  }


  try {
    const buffer = await shareCard.getOrRenderLiveCover({ title, active: isLive });
    res
      .status(200)
      .set('Content-Type', 'image/jpeg')
      // NOT immutable, unlike the event card: that card's cache key is tied
      // to a row's own updated_at, so a stale file only ever exists for a row
      // that was actually edited. This cover's key is the topic text and the
      // active flag (shareCard.service.js) — a super_admin can change either
      // at any moment with no request of their own hitting this route, so a
      // crawler or browser has to be allowed to notice within minutes, not a
      // year.
      .set('Cache-Control', 'public, max-age=300')
      .send(buffer);
  } catch (err) {
    logger.error(`[share] live cover render failed: ${err.message}`);
    res.status(404).end();
  }
}));

/**
 * The primary CTA's actual destination — recorded, then handed onward to the
 * live's own link (or the channel's, when no live is active). The target
 * comes ONLY from settings.service.getLiveChannel(), never
 * from a query parameter: there is no `?url=` this route reads, so it cannot
 * be turned into an open redirect no matter what a caller appends to the
 * link. Analytics is recorded before the target is known to exist, mirroring
 * `/:id/download` above (which records for a non-existent event too) —
 * "someone followed the click-through link" is the fact being counted, not
 * "and it worked".
 */
liveRouter.get('/go', asyncHandler(async (req, res) => {
  const { target } = resolveLiveState(await settings.getLiveChannel());

  // Historical key name kept for the same reason as tiktok_page_viewed above.
  await analytics.recordSafely({ eventName: 'tiktok_click_through', platform: 'web' });

  if (!target) {
    sendNotFound(res);
    return;
  }

  res.redirect(302, target);
}));

/**
 * Same body as `/:id/download` above, minus the event lookup — this page
 * carries no event, so `contentTown` is always null rather than sometimes
 * absent.
 */
liveRouter.get('/download', asyncHandler(async (req, res) => {
  await analytics.recordSafely({ eventName: 'app_download_clicked', platform: 'web', contentTown: null });

  const apkUrl = absoluteMediaUrl(config.app.apkUrl);
  res.redirect(302, apkUrl || config.publicUrl);
}));

/**
 * The YouTube player, alone, filling the viewport — what the app's WebView
 * loads for the live (plan26-9 §3.1). YouTube refuses an embed that arrives
 * with no Referer (error 153), and a WebView loading the player directly
 * sends none; loaded from here, the iframe's `referrerpolicy` hands YouTube
 * our own origin. The src is `embed_url` exactly as settings.service's
 * `toEmbedUrl` rebuilt it from a validated video/channel id — never a raw
 * setting — and it is escaped like every other attribute in this file. 404
 * (empty body: nothing here is meant to be seen by a person) whenever there
 * is no embeddable link, which includes every non-YouTube stream.
 *
 * Its own CSP, not SHARE_CSP: the one thing this page does is frame YouTube.
 * helmet's global Referrer-Policy (`no-referrer`) is overridden here too —
 * the iframe attribute already governs its own request, but the header says
 * the same thing so neither can be read as contradicting the other.
 */
liveRouter.get('/embed', asyncHandler(async (req, res) => {
  const { embed_url: embedUrl } = await settings.getLiveChannel();
  if (!embedUrl) {
    res.status(404).set('Cache-Control', 'no-store').end();
    return;
  }

  res
    .status(200)
    .set('Content-Security-Policy', EMBED_CSP)
    .set('Referrer-Policy', 'strict-origin-when-cross-origin')
    .set('Cache-Control', 'no-store')
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(LIVE_CHANNEL_HEADLINE)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
</style>
</head>
<body>
<iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(LIVE_CHANNEL_HEADLINE)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
</body>
</html>`);
}));

module.exports = { eventRouter, liveRouter };
