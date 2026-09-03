'use strict';

/**
 * Generates the `og:image` shown by the shareable event page (`GET /e/:id`,
 * server/src/routes/share.routes.js) — a 1200×630 card the server draws
 * itself, instead of handing crawlers the event's own poster.
 *
 * Why this exists at all: a real production poster is a 1080×2340 portrait
 * phone screenshot. WhatsApp/Facebook lay a summary_large_image card out at
 * roughly 1.91:1, so a portrait poster either gets dropped or hair-sliced —
 * "the image doesn't show" was the exact bug report. Worse, a wedding poster
 * has the date and venue printed on it, and the whole point of the share page
 * is to withhold those until someone installs the app — passing the poster
 * through leaked exactly what the page exists to hide. So: the background is
 * the poster, but cover-cropped to this card's own aspect ratio and heavily
 * blurred + darkened until it reads as colour and mood, not as a legible
 * document. That blur is the mechanism that keeps the details hidden, not
 * decoration on top of some other privacy control.
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
const HEIGHT = 630;

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
  return path.join(CACHE_DIR, `${key}.png`);
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
        .filter(name => name.startsWith(prefix) && name !== `${currentKey}.png`)
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
 * Draws `img` cover-cropped to fill the whole canvas, blurred heavily. Drawn
 * slightly larger than the canvas and offset negative so the blur's own edge
 * falloff lands outside the visible frame, not as a visible soft border.
 */
function drawBlurredCover(ctx, img) {
  const PAD = 60;
  const targetW = WIDTH + PAD * 2;
  const targetH = HEIGHT + PAD * 2;
  const targetRatio = targetW / targetH;
  const srcRatio = img.width / img.height;

  let sx;
  let sy;
  let sw;
  let sh;
  if (srcRatio > targetRatio) {
    sh = img.height;
    sw = sh * targetRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / targetRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.save();
  ctx.filter = 'blur(32px)';
  ctx.drawImage(img, sx, sy, sw, sh, -PAD, -PAD, targetW, targetH);
  ctx.restore();
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

const MARGIN = 64;

const CENTER_X = WIDTH / 2;

/**
 * A thin inset rule around the whole card. It is the cheapest thing that makes
 * a flat 1200x630 read as a *card* rather than a cropped photo — which is what
 * the product owner asked for after seeing the first version.
 */
function drawFrame(ctx, palette) {
  const inset = 26;
  ctx.save();
  ctx.strokeStyle = withAlpha(palette.accent, 0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(inset, inset, WIDTH - inset * 2, HEIGHT - inset * 2, 20);
  ctx.stroke();
  ctx.restore();
}

/**
 * The occasion-type chip, horizontally centred at `topY`. Centred rather than
 * corner-pinned because everything on this card is one centred column: the
 * first cut hugged the right edge and left half the card empty, which read as
 * a mistake rather than a design.
 *
 * Name only, no icon glyph: the type icons are emoji, and the only font this
 * process registers is Cairo, which has no emoji coverage — an icon here
 * renders as a tofu box. Alpine has even less to fall back on.
 */
function drawChip(ctx, event, palette, topY) {
  const typeName = event.occasion_type_name;
  if (!typeName) return 0;

  const typeColour = safeHexColour(event.occasion_type_colour, palette.accent);
  const paddingX = 26;
  const chipHeight = 54;

  ctx.font = `600 26px "${BOLD_FAMILY}"`;
  const chipWidth = ctx.measureText(typeName).width + paddingX * 2;
  const chipX = CENTER_X - chipWidth / 2;

  ctx.save();
  ctx.fillStyle = withAlpha(typeColour, 0.22);
  ctx.strokeStyle = withAlpha(typeColour, 0.55);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(chipX, topY, chipWidth, chipHeight, chipHeight / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = typeColour;
  ctx.fillText(typeName, CENTER_X, topY + chipHeight / 2 + 2);
  ctx.restore();

  return chipHeight;
}

/** Small pill in the top corner marking an expired event, mirroring the share page's own «انتهت» badge. */
function drawExpiredBadge(ctx, palette) {
  const label = 'انتهت';
  ctx.font = `600 20px "${BOLD_FAMILY}"`;
  const paddingX = 18;
  const height = 40;
  const width = ctx.measureText(label).width + paddingX * 2;
  const x = MARGIN;
  const y = 56;

  ctx.save();
  ctx.fillStyle = withAlpha(palette.bg, 0.78);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
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
 * Renders one event's card to a PNG buffer. No caching, no filesystem
 * bookkeeping — `getOrRenderCard` below owns that; this is pure drawing.
 *
 * The whole card is one centred column — chip, names, rule, clan — measured
 * first and then placed, so it sits optically centred whatever the name
 * lengths are. Nothing is pinned to an edge except the expiry pill and the
 * wordmark.
 */
async function renderCard(event) {
  const palette = PALETTES[toneOf(event)];
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Base fill, in case the background image never loads at all.
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const posterUrl = resolvePosterUrl(event);
  const posterBuffer = await loadPosterBuffer(posterUrl);
  if (posterBuffer) {
    try {
      const img = await loadImage(posterBuffer);
      drawBlurredCover(ctx, img);
    } catch (err) {
      logger.warn(`[shareCard] failed to decode background image for event ${event.id}: ${err.message}`);
    }
  }

  // Darkening veil — this, together with the blur above, is what keeps a
  // poster's printed date/venue illegible, not merely muted.
  ctx.fillStyle = withAlpha(palette.bg, 0.58);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A soft vignette pulls the eye to the centred text and stops a busy poster
  // from competing with it at the edges.
  const vignette = ctx.createRadialGradient(CENTER_X, HEIGHT / 2, HEIGHT * 0.18, CENTER_X, HEIGHT / 2, WIDTH * 0.62);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, withAlpha(palette.bg, 0.55));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawFrame(ctx, palette);
  if (event.is_expired) drawExpiredBadge(ctx, palette);

  // Same fallback share.routes.js's buildHeadline/names use, and the same
  // `String(... ?? '')` guard escapeHtml relies on there — a legacy row with
  // no honoree rows at all must still produce a valid card, not throw out of
  // wrapLines on an undefined title.
  const names = String(event.honorees.map(h => h.name).filter(Boolean).join(' و ') || event.title || '');

  // --- measure the column before drawing any of it ---
  const hasChip = Boolean(event.occasion_type_name);
  const chipHeight = hasChip ? 54 : 0;
  const gapAfterChip = hasChip ? 38 : 0;

  ctx.font = `700 62px "${BOLD_FAMILY}"`;
  const nameLines = wrapLines(ctx, names, WIDTH - MARGIN * 2 - 40, 2);
  const nameLineHeight = 78;
  const namesHeight = nameLines.length * nameLineHeight;

  const hasClan = Boolean(event.family_clan);
  const ruleGap = 30;
  const ruleHeight = 2;
  const gapAfterRule = 28;
  const clanHeight = hasClan ? 34 : 0;
  const tailHeight = hasClan ? ruleGap + ruleHeight + gapAfterRule + clanHeight : 0;

  const blockHeight = chipHeight + gapAfterChip + namesHeight + tailHeight;
  // Nudged a little above true centre: the wordmark sits at the bottom, and a
  // block centred on the geometric middle reads as low next to it.
  let y = Math.max(MARGIN, (HEIGHT - blockHeight) / 2 - 18);

  if (hasChip) {
    drawChip(ctx, event, palette, y);
    y += chipHeight + gapAfterChip;
  }

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.ink;
  ctx.font = `700 62px "${BOLD_FAMILY}"`;
  for (const line of nameLines) {
    ctx.fillText(line, CENTER_X, y + nameLineHeight / 2);
    y += nameLineHeight;
  }
  ctx.restore();

  if (hasClan) {
    y += ruleGap;
    ctx.save();
    ctx.fillStyle = withAlpha(palette.accent, 0.75);
    ctx.beginPath();
    ctx.roundRect(CENTER_X - 46, y, 92, ruleHeight, 1);
    ctx.fill();
    ctx.restore();
    y += ruleHeight + gapAfterRule;

    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `30px "${REGULAR_FAMILY}"`;
    ctx.fillStyle = palette.faint;
    const clanLines = wrapLines(ctx, event.family_clan, WIDTH - MARGIN * 2 - 40, 1);
    if (clanLines[0]) ctx.fillText(clanLines[0], CENTER_X, y + clanHeight / 2);
    ctx.restore();
  }

  // Wordmark, bottom-centre, always last so nothing else can overlap it.
  ctx.save();
  ctx.font = `600 23px "${BOLD_FAMILY}"`;
  ctx.fillStyle = withAlpha(palette.ink, 0.72);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('مناسبات النقب', CENTER_X, HEIGHT - 58);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

/**
 * Render-once-reuse entry point: returns the cached PNG buffer for this
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
