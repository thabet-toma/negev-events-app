'use strict';

/**
 * Generates the `og:image` shown by the shareable event page (`GET /e/:id`,
 * server/src/routes/share.routes.js) — a 1200×1200 card the server draws
 * itself, instead of handing crawlers the event's own poster.
 *
 * Why not just hand crawlers the poster itself: real ones are portrait (a live
 * one measures 1080×2340), and a crawler laying out a link preview drops or
 * hair-slices an image that does not fit the shape it expects — "the image
 * doesn't show" was the literal bug report. Drawing our own card fixes the
 * shape, and gives the type and the names somewhere to live.
 *
 * The shape and the proportions are the product owner's: square, because a
 * square preview occupies far more of a WhatsApp bubble than a 1.91:1 strip
 * does, and mostly poster — "mostly picture, a little for the occasion type,
 * the name, and promoting the site".
 *
 * And the poster is drawn *sharp*. An earlier cut blurred it, because a
 * wedding poster has the date and venue printed on it and the share page was
 * built to withhold those until someone installs the app. That trade was put
 * to the product owner explicitly — a legible poster gives the details away in
 * the preview, and there is no middle setting (measured: at blur(8px) the
 * Arabic on a live poster was still readable) — and the call was to show the
 * picture: "let the image show". So the withholding that remains is in the
 * *text*: `share.routes.js` still prints no date, venue or phone anywhere on
 * the page or in the meta tags. Whatever the family chose to print on their
 * own invitation travels with it.
 *
 * No SQL lives here — `events.service.getShareEvent` already has everything
 * this needs (including `updated_at`, the cache key below), and this module
 * takes that row as a plain object, never a request/response.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const config = require('../config');
const logger = require('../utils/logger');
const { uploadsDir } = require('../middleware/upload');
const { PALETTES, toneOf, safeHexColour, resolvePosterUrl } = require('../utils/shareTheme');

const WIDTH = 1200;
const HEIGHT = 1200;

// Alpine (the production image, server/Dockerfile) ships no fonts and no
// fontconfig at all — GlobalFonts starts out with nothing to fall back to,
// so registering from an explicit path is required, not an optimisation.
// The two weights live in server/src/assets/fonts/, copied from
// mobile/assets/fonts/ (server/ must not read from mobile/ at runtime — the
// three deployables never reach into each other). OFL.txt sits alongside
// them: the licence obliges its text to travel with the font wherever it is
// distributed, same discharge mobile/lib/main.dart uses for the APK.
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const REGULAR_FAMILY = 'Cairo Card';
const BOLD_FAMILY = 'Cairo Card Bold';
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Cairo-Regular.ttf'), REGULAR_FAMILY);
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Cairo-Bold.ttf'), BOLD_FAMILY);

// The occasion type's `icon` is a bare emoji (occasion_types.icon, seeded
// with values like 💍/🕊️/🎓). Verified by rendering a sample: with only Cairo
// registered (Arabic script only, no colour-emoji table) the glyph comes
// back as a tofu box, on this dev machine and — with even less font coverage
// available — on the Alpine target too. A visibly broken glyph is worse than
// no glyph, so the chip below draws the type's name only, never the icon.
const SHARE_ASSET_DIR = path.join(__dirname, '..', 'assets', 'share');
const SHARE_ASSETS = {
  'festive.png': fs.readFileSync(path.join(SHARE_ASSET_DIR, 'festive.png')),
  'solemn.png': fs.readFileSync(path.join(SHARE_ASSET_DIR, 'solemn.png'))
};

// Rendered once per (event id, updated_at) pair and reused after that — a
// 1-core production box must not re-render a card on every crawler hit.
// Created at boot by server/src/app.js, the same way it creates downloadsDir:
// the container runs as the unprivileged `node` user, so the directory has
// to be created by that same process to be owned by it.
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache', 'share-cards');

function cacheKey(event) {
  const updatedAtMs = event.updated_at ? new Date(event.updated_at).getTime() : 0;
  return `${event.id}-${updatedAtMs}`;
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${key}.jpg`);
}

/**
 * Removes any cached card for this event id that is *not* the current key —
 * a stale file from before the last edit. Best-effort: a leftover file here
 * is disk usage, not a correctness bug (the current key is what gets served),
 * so a failure to clean up is logged and swallowed rather than allowed to
 * fail the render it is tidying up after.
 */
async function evictStale(event, currentKey) {
  try {
    const prefix = `${event.id}-`;
    const entries = await fsp.readdir(CACHE_DIR);
    await Promise.all(
      entries
        .filter(name => name.startsWith(prefix) && name !== `${currentKey}.jpg`)
        .map(name => fsp.unlink(path.join(CACHE_DIR, name)).catch(() => {}))
    );
  } catch (err) {
    logger.warn(`[shareCard] failed to evict stale cache entries for event ${event.id}: ${err.message}`);
  }
}

const UPLOADS_PREFIX = `${config.publicUrl}/uploads/`;
const SHARE_ASSETS_PREFIX = `${config.publicUrl}/e/assets/`;

/**
 * Loads the bytes for whatever `resolvePosterUrl` returned. Local media
 * (an uploaded poster, or one of our own fallback PNGs) is read straight off
 * disk — it is this same process's own filesystem, so there is no reason to
 * round-trip it through HTTP. Anything else (an admin-supplied external
 * poster URL) is fetched, with a timeout, since it is somebody else's server.
 * Returns null on any failure — a background image is optional; the caller
 * falls back to a flat palette panel rather than failing the whole card.
 */
async function loadPosterBuffer(url) {
  if (!url) return null;
  try {
    if (url.startsWith(UPLOADS_PREFIX)) {
      const filename = path.basename(url.slice(UPLOADS_PREFIX.length).split('?')[0]);
      return await fsp.readFile(path.join(uploadsDir, filename));
    }
    if (url.startsWith(SHARE_ASSETS_PREFIX)) {
      const filename = url.slice(SHARE_ASSETS_PREFIX.length);
      return SHARE_ASSETS[filename] || null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn(`[shareCard] failed to load background from ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Wraps `text` to at most `maxLines` lines of width `maxWidth` under the
 * context's current font, ellipsising the last line if there is more text
 * than fits. `ctx.textAlign`/`direction` are irrelevant to wrapping itself
 * (measureText works on the raw string either way) — only drawing each
 * returned line needs them set.
 */
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    const attempt = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(attempt).width > maxWidth) {
      if (lines.length === maxLines - 1) break; // this line is the last one allowed — stop consuming words
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
    i += 1;
  }
  const overflowed = i < words.length;
  if (current) lines.push(current);

  if (overflowed && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** `#rrggbb` (or `#rgb`) + an 0–1 alpha → an `rgba(...)` string. */
function withAlpha(hex, alpha) {
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const MARGIN = 56;

// The card is mostly the poster, with a thin band under it — that proportion
// is the product owner's own call, after two rounds in which the poster was
// first wallpaper and then a side panel: "mostly picture, a little for the
// occasion type, the name, and promoting the site".
const BAND_HEIGHT = 268;
const HERO_HEIGHT = HEIGHT - BAND_HEIGHT;

/**
 * Lightens a colour until it is legible as text on this card's dark palette.
 *
 * `occasion_types.color` is admin-chosen for the app's own light-background
 * UI: the seeded wedding colour is `#8f6a20`, a dark brown that all but
 * vanished on the first card. Rather than overriding the admin's choice with a
 * hardcoded one — the colour is meaningful, it is how people recognise the
 * type — the hue is kept and only the luminance is raised.
 */
function readableOnDark(hex) {
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance >= 0.55) return full;
  const towardsWhite = (0.62 - luminance) / (1 - luminance);
  const mix = channel => Math.round(channel + (255 - channel) * towardsWhite);
  return `#${[mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Draws the poster across the hero area: the whole poster, contained so it is
 * never cropped and never blurred, over a blurred cover-crop of itself that
 * fills whatever the containing leaves over. A wedding poster is portrait and this area is not,
 * so those side bars are unavoidable — filling them with the poster's own
 * colours is what stops them reading as empty gutters.
 */
function drawHero(ctx, img, palette) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, HERO_HEIGHT);
  ctx.clip();

  const areaRatio = WIDTH / HERO_HEIGHT;
  const sourceRatio = img.width / img.height;

  // Fill: the poster again, cover-cropped and blurred, purely to carry its
  // colours into whatever space containing the real one leaves over. Drawn
  // proud of the area so the blur's own edge falloff is clipped away.
  const bleed = 70;
  let cw;
  let ch;
  if (sourceRatio > areaRatio) {
    ch = HERO_HEIGHT + bleed * 2;
    cw = ch * sourceRatio;
  } else {
    cw = WIDTH + bleed * 2;
    ch = cw / sourceRatio;
  }
  ctx.save();
  ctx.filter = 'blur(44px)';
  ctx.drawImage(img, (WIDTH - cw) / 2, (HERO_HEIGHT - ch) / 2, cw, ch);
  ctx.restore();
  ctx.fillStyle = withAlpha(palette.bg, 0.45);
  ctx.fillRect(0, 0, WIDTH, HERO_HEIGHT);

  // The poster itself, whole.
  const inset = 34;
  const maxW = WIDTH - inset * 2;
  const maxH = HERO_HEIGHT - inset * 2;
  let height = maxH;
  let width = height * sourceRatio;
  if (width > maxW) {
    width = maxW;
    height = width / sourceRatio;
  }
  const x = (WIDTH - width) / 2;
  const y = (HERO_HEIGHT - height) / 2;
  const radius = 16;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 38;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = palette.card;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.restore();

  // Sharp, and drawn exactly inside the frame — see the note at the top of
  // this file for why there is no blur here any more.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.drawImage(img, x, y, width, height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, width - 2, height - 2, radius);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * The occasion-type chip, centred at `centreX`. Name only, no icon glyph: the
 * type icons are emoji (occasion_types.icon holds values like the ring and the
 * dove), and the only font this process registers is Cairo, which has no emoji
 * coverage — verified by rendering a sample, the glyph comes back as a tofu
 * box here and, with even less font coverage available, on Alpine too.
 */
function drawChip(ctx, event, palette, centreX, centreY) {
  const typeName = event.occasion_type_name;
  if (!typeName) return;

  const typeColour = readableOnDark(safeHexColour(event.occasion_type_colour, palette.accent));
  const height = 52;

  ctx.font = `600 27px "${BOLD_FAMILY}"`;
  const width = ctx.measureText(typeName).width + 52;

  ctx.save();
  ctx.fillStyle = withAlpha(typeColour, 0.18);
  ctx.strokeStyle = withAlpha(typeColour, 0.62);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(centreX - width / 2, centreY - height / 2, width, height, height / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = typeColour;
  ctx.fillText(typeName, centreX, centreY + 2);
  ctx.restore();
}

/** Small pill marking an expired event, mirroring the share page's own badge. */
function drawExpiredBadge(ctx, palette) {
  const label = 'انتهت';
  ctx.font = `600 21px "${BOLD_FAMILY}"`;
  const height = 40;
  const width = ctx.measureText(label).width + 36;
  const x = MARGIN;
  const y = MARGIN;

  ctx.save();
  ctx.fillStyle = withAlpha(palette.bg, 0.85);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.faint;
  ctx.fillText(label, x + width / 2, y + height / 2 + 1);
  ctx.restore();
}

/**
 * Renders one event's card to a JPEG buffer. No caching, no filesystem
 * bookkeeping — `getOrRenderCard` below owns that; this is pure drawing.
 *
 * JPEG, not PNG, and that is a functional choice rather than a preference:
 * WhatsApp drops a preview image over roughly 600 KB, and this card is now
 * almost entirely photograph — the same square rendered as PNG measured just
 * over 1 MB, i.e. no preview at all, which is the exact bug this whole feature
 * exists to fix.
 */
async function renderCard(event) {
  const palette = PALETTES[toneOf(event)];
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const posterUrl = resolvePosterUrl(event);
  // `resolvePosterUrl` falls back to one of our own platform PNGs when the
  // event has no poster. Those were drawn for the share *page*, which needs
  // something in its <img>; framing one here would present our own placeholder
  // as if it were the family's invitation. The wash below is the honest
  // version of "there is no poster".
  const isOwnFallback = Boolean(posterUrl) && posterUrl.startsWith(SHARE_ASSETS_PREFIX);
  const posterBuffer = isOwnFallback ? null : await loadPosterBuffer(posterUrl);
  let poster = null;
  if (posterBuffer) {
    try {
      poster = await loadImage(posterBuffer);
    } catch (err) {
      logger.warn(`[shareCard] failed to decode background image for event ${event.id}: ${err.message}`);
    }
  }

  if (poster) {
    drawHero(ctx, poster, palette);
  } else {
    // No poster at all — the type has no default one and the event carries
    // none. Washing only the hero area would leave three quarters of the card
    // an empty rectangle above the text; instead the wash takes the whole
    // square and the text sits in the middle of it, which reads as a plain
    // typographic card rather than a picture that failed to load.
    const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    wash.addColorStop(0, palette.card);
    wash.addColorStop(1, palette.bg);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  if (event.is_expired) drawExpiredBadge(ctx, palette);

  // --- the band: type, name, and the site's own line, nothing else ---
  // With a poster it is a strip under it, ruled off in the palette's accent.
  // Without one there is nothing to divide, so the same block simply centres.
  const bandTop = poster ? HERO_HEIGHT : Math.round((HEIGHT - BAND_HEIGHT) / 2);
  ctx.fillStyle = withAlpha(palette.accent, 0.55);
  if (poster) {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, bandTop, WIDTH, BAND_HEIGHT);
    ctx.fillStyle = withAlpha(palette.accent, 0.55);
    ctx.fillRect(0, bandTop, WIDTH, 3);
  } else {
    // Nothing to divide, so the rule becomes a short centred mark above the
    // type — the one place the palette's own accent shows on a poster-less
    // card, and what the tone test samples.
    ctx.fillRect(WIDTH / 2 - 60, bandTop - 12, 120, 4);
  }

  const centreX = WIDTH / 2;
  drawChip(ctx, event, palette, centreX, bandTop + 56);

  // Same fallback share.routes.js's buildHeadline uses, and the same
  // `String(... ?? '')` guard escapeHtml relies on there — a legacy row with no
  // honoree rows at all must still produce a valid card, not throw out of
  // wrapLines on an undefined title.
  const names = String(event.honorees.map(h => h.name).filter(Boolean).join(' و ') || event.title || '');

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.ink;
  ctx.font = `700 50px "${BOLD_FAMILY}"`;
  const nameLines = wrapLines(ctx, names, WIDTH - MARGIN * 2, 1);
  if (nameLines[0]) ctx.fillText(nameLines[0], centreX, bandTop + 134);
  ctx.restore();

  if (event.family_clan) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `27px "${REGULAR_FAMILY}"`;
    ctx.fillStyle = palette.faint;
    const clanLines = wrapLines(ctx, `عائلة ${event.family_clan}`, WIDTH - MARGIN * 2, 1);
    if (clanLines[0]) ctx.fillText(clanLines[0], centreX, bandTop + 186);
    ctx.restore();
  }

  // The site's line — the only promotion on the card, and the reason a person
  // who sees this in a group chat knows where the details live.
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 24px "${BOLD_FAMILY}"`;
  ctx.fillStyle = withAlpha(palette.accent, 0.95);
  ctx.fillText('مناسبات النقب · التفاصيل في التطبيق', centreX, HEIGHT - 40);
  ctx.restore();

  return canvas.toBuffer('image/jpeg', 88);
}

/**
 * Render-once-reuse entry point: returns the cached JPEG buffer for this
 * exact (event id, updated_at) pair, rendering and writing it to disk first
 * if this is the first request since the event was last created/edited.
 * `updated_at` changing is what invalidates a card — an edited event gets a
 * different cache key automatically, no explicit invalidation call needed.
 */
async function getOrRenderCard(event) {
  const key = cacheKey(event);
  const file = cachePath(key);

  try {
    return await fsp.readFile(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const buffer = await renderCard(event);
  await fsp.writeFile(file, buffer);
  await evictStale(event, key);
  return buffer;
}

module.exports = { WIDTH, HEIGHT, CACHE_DIR, renderCard, getOrRenderCard };
