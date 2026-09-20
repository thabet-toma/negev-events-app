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
 *
 * `renderLiveCover`/`getOrRenderLiveCover` near the bottom generate the same
 * kind of image for a different page, `GET /live` — the TikTok channel/live
 * cover. Same 1200×1200 square and the same reason (WhatsApp bubble
 * proportions), but a marketing card rather than an information panel: there
 * is no row and no poster, only a topic string and an active flag.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const config = require('../config');
const logger = require('../utils/logger');
const { uploadsDir } = require('../middleware/upload');
const { PALETTES, LIVE_RED, toneOf, safeHexColour, resolvePosterUrl } = require('../utils/shareTheme');
const { buildMarkParts, markScale, paintParts } = require('../utils/brandMark');

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

// Bumped whenever renderCard's own drawing changes (layout, colours, fonts,
// anything pixel-visible) — folded into the cache key below so a design
// change invalidates every cached card by itself. Without this, editing the
// design changes no event's `updated_at`, so every existing event keeps
// serving its old card after a deploy and the redesign looks like it never
// shipped.
const CARD_DESIGN_VERSION = 2;

function cacheKey(event) {
  const updatedAtMs = event.updated_at ? new Date(event.updated_at).getTime() : 0;
  return `${event.id}-${updatedAtMs}-v${CARD_DESIGN_VERSION}`;
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${key}.jpg`);
}

// Same reasoning as CARD_DESIGN_VERSION above, kept separate because the live
// cover's own layout (renderLiveCover) changes on its own schedule, unrelated
// to the event card's.
const LIVE_CARD_DESIGN_VERSION = 2;

/**
 * The live cover has no row and no `updated_at` to key its cache on — the
 * only two things that ever change what it draws are the topic text and the
 * active flag, so the key is derived from those directly (a short hash of the
 * text, since a topic can contain slashes, quotes or anything else a human
 * types, none of which belongs in a filename). Changing the topic — or a live
 * ending — produces a different key and therefore a fresh render; the same
 * topic and state always reuse the same file.
 */
function liveCacheKey(title, active) {
  const hash = crypto.createHash('sha1').update(String(title)).digest('hex').slice(0, 16);
  return `live-${hash}-${active ? 'on' : 'off'}-v${LIVE_CARD_DESIGN_VERSION}`;
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

/**
 * Picks the largest of a few candidate sizes at which `text` wraps to at most
 * `maxLines` lines WITHOUT truncation, falling back to a smaller size and
 * finally, at the floor size, to `wrapLines`' own ellipsis — only once even
 * that size cannot fit. A single fixed hero size either overflows on a long
 * topic or looks needlessly small on a short one; this measures the actual
 * text first. `Number.MAX_SAFE_INTEGER` as the line cap passed to `wrapLines`
 * below is how "how many lines would this actually take" is asked without
 * triggering its own truncation.
 *
 * Sizes are walked largest-to-smallest and a step is taken only while it
 * strictly REDUCES the line count — verified by rendering, this is what stops
 * a short phrase like "قناة أعراسنا على تيك توك" from wrapping its last word
 * onto an orphan line at the largest size while still keeping a genuinely
 * long topic at its largest 3-line size instead of shrinking it for no gain
 * (a smaller size that still needs the same number of lines is strictly
 * worse: same wrap, smaller text).
 */
function fitHeroText(ctx, text, maxWidth, maxLines) {
  const candidateSizes = [104, 92, 80, 68, 56];
  let chosen = null;
  for (const size of candidateSizes) {
    ctx.font = `700 ${size}px "${BOLD_FAMILY}"`;
    const lines = wrapLines(ctx, text, maxWidth, Number.MAX_SAFE_INTEGER);
    if (lines.length > maxLines) {
      if (chosen) break; // a larger size already fit within the cap — stop shrinking
      continue; // even this size overflows — keep trying smaller ones
    }
    if (chosen && lines.length >= chosen.lines.length) break; // shrinking further buys nothing
    chosen = { fontSize: size, lines };
  }
  if (chosen) return chosen;

  const floor = candidateSizes[candidateSizes.length - 1];
  ctx.font = `700 ${floor}px "${BOLD_FAMILY}"`;
  return { fontSize: floor, lines: wrapLines(ctx, text, maxWidth, maxLines) };
}

/**
 * Draws the brand mark directly into a `size`×`size` box at (`boxX`, `boxY`),
 * from the same `buildMarkParts('icon')` geometry and `paintParts` colours
 * every other rendering of the mark reads from (server/src/utils/brandMark.js)
 * — no PNG asset to keep in sync. Painted on its own transparent canvas first,
 * with the white gaps between the interlocked rings cut out rather than
 * painted: cutting straight on the card would punch holes through its
 * background, and painting them white would draw a white blob on a dark card.
 */
function drawBrandMark(ctx, boxX, boxY, size) {
  const layer = createCanvas(size, size);
  const layerCtx = layer.getContext('2d');
  const scale = markScale(false);

  layerCtx.translate(size / 2, size / 2);
  layerCtx.scale(scale, scale);
  layerCtx.translate(-size / 2, -size / 2);
  paintParts(layerCtx, buildMarkParts('icon'), size / 100, size, { cutGround: true });

  ctx.drawImage(layer, boxX, boxY);
}

// The badge height is fixed, and lives outside drawLiveBadge because the
// layout has to measure the whole block before it draws the first element.
const LIVE_BADGE_HEIGHT = 62;

/** The loudest small element on the live cover — solid red pill, white bold label, centred. */
function drawLiveBadge(ctx, centreX, top) {
  const label = 'مباشر الآن';
  ctx.font = `700 34px "${BOLD_FAMILY}"`;
  const textWidth = ctx.measureText(label).width;
  const paddingX = 40;
  const height = LIVE_BADGE_HEIGHT;
  const width = textWidth + paddingX * 2;

  ctx.save();
  ctx.fillStyle = LIVE_RED;
  ctx.beginPath();
  ctx.roundRect(centreX - width / 2, top, width, height, height / 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, centreX, top + height / 2 + 2);
  ctx.restore();

  return top + height;
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
//
// ٣٢٠ لا ٢٦٨: كانت ٢٦٨ قبل انضمام العلامة إلى سطر الترويج أسفل الشريط. صار
// لسطر الترويج ارتفاع حقيقي (العلامة ٤٤px‏) يصطدم بالإطار المزخرِف أسفل
// البطاقة (‏drawFrame‏) لو بقي الشريط بارتفاعه القديم — قِيس فعلياً برسم بطاقة
// وفحص بكسلاتها، لا بالحساب وحده. الزيادة أُخذت من الخبطة (‏hero‏) لا من مكان
// آخر، فتبقى نسبة «الصورة أولاً» قائمة، والملصق نفسه يبقى كاملاً وحاداً كما هو.
const BAND_HEIGHT = 320;
const HERO_HEIGHT = HEIGHT - BAND_HEIGHT;

// إطار الزينة حول البطاقة كلها (drawFrame) — هامش عند حافة القماش نفسها.
const FRAME_INSET = 22;
const FRAME_GAP = 9;

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
 *
 * `typeColour` is computed once by the caller (`renderCard`) and reused for
 * the gradient rule under the hero too — one colour, two places, never
 * computed twice from the same raw `occasion_type_colour`.
 */
function drawChip(ctx, event, palette, centreX, centreY, typeColour) {
  const typeName = event.occasion_type_name;
  if (!typeName) return;

  const height = 52;

  ctx.font = `600 27px "${BOLD_FAMILY}"`;
  const width = ctx.measureText(typeName).width + 52;

  // وهج نصف قطري خافت جداً خلف الشريحة، بلون النوع نفسه — يربطها بالشريط بدل
  // أن تطفو منفصلة عنه. ألفا ٠٫١٠ عند المركز، صفر عند الحافة.
  const glowRadius = 140;
  const glow = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, glowRadius);
  glow.addColorStop(0, withAlpha(typeColour, 0.1));
  glow.addColorStop(1, withAlpha(typeColour, 0));
  ctx.save();
  ctx.fillStyle = glow;
  ctx.fillRect(centreX - glowRadius, centreY - glowRadius, glowRadius * 2, glowRadius * 2);
  ctx.restore();

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
 * إطار مزدوج حول البطاقة كلها، بلونين من اللوحة نفسها لا لون مخترَع: خط رئيسي
 * ٣px، فجوة ٩px، خط مرافق ١px داخله، وأربع علامات زوايا قصيرة — اصطلاح
 * الدعوة المطبوعة. يُرسم أخيراً وفوق كل شيء، وموضعه هامش عند حافة القماش نفسها
 * (‏MARGIN‏ يبقى كما هو — هذا هامش القماش، لا هامش المحتوى الداخلي).
 *
 * لكنه ليس معزولاً عن التخطيط كما بدا أول الأمر: سطر الترويج أسفل الشريط صار
 * يحمل ارتفاعاً حقيقياً (علامة ٤٤px‏) يقع تحته مباشرة، فـ`BAND_HEIGHT` أعلاه
 * كُبِّر خصيصاً ليُبعد ذلك السطر عن الرُتبتين هنا بمسافة آمنة — رُصد التصادم
 * الأول برسم بطاقة فعلية وفحص بكسلاتها، لا بالحساب وحده.
 *
 * الطابع الحزين لا يفقد الإطار — يخفت ألفاه فقط. بطاقة بلا إطار إطلاقاً تُقرأ
 * إهمالاً لا وقاراً.
 */
function drawFrame(ctx, palette, tone) {
  const alpha = tone === 'solemn' ? 0.4 : 0.85;
  const outer = withAlpha(palette.accent, alpha);
  const inner = withAlpha(palette.accent, alpha * 0.6);

  ctx.save();
  ctx.strokeStyle = outer;
  ctx.lineWidth = 3;
  ctx.strokeRect(FRAME_INSET, FRAME_INSET, WIDTH - FRAME_INSET * 2, HEIGHT - FRAME_INSET * 2);

  const innerInset = FRAME_INSET + FRAME_GAP;
  ctx.strokeStyle = inner;
  ctx.lineWidth = 1;
  ctx.strokeRect(innerInset, innerInset, WIDTH - innerInset * 2, HEIGHT - innerInset * 2);

  const markLen = 26;
  ctx.strokeStyle = outer;
  ctx.lineWidth = 2;
  [
    [FRAME_INSET, FRAME_INSET, 1, 1],
    [WIDTH - FRAME_INSET, FRAME_INSET, -1, 1],
    [FRAME_INSET, HEIGHT - FRAME_INSET, 1, -1],
    [WIDTH - FRAME_INSET, HEIGHT - FRAME_INSET, -1, -1]
  ].forEach(([x, y, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * markLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * markLen, y);
    ctx.stroke();
  });
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
  const tone = toneOf(event);
  const palette = PALETTES[tone];
  // مصدر اللون الإضافي الفعلي: لون النوع نفسه (بيانات وقت تشغيل يديرها
  // الأدمن)، لا لوحة ثالثة مخترَعة — عرس وخطوبة يفترقان هنا بلا أي كود جديد.
  // مرفوع الإضاءة أولاً لأن الألوان المزروعة اختيرت لواجهة فاتحة وتختفي على
  // هذه البطاقة الداكنة بلا ذلك (انظر readableOnDark).
  const typeColour = readableOnDark(safeHexColour(event.occasion_type_colour, palette.accent));
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
  // With a poster it is a strip under it, ruled off in a gradient from the
  // occasion type's own colour into the palette's accent. Without one there
  // is nothing to divide, so the same block simply centres.
  const bandTop = poster ? HERO_HEIGHT : Math.round((HEIGHT - BAND_HEIGHT) / 2);
  ctx.fillStyle = withAlpha(palette.accent, 0.55);
  if (poster) {
    // نفس اصطلاح التدرّج الذي يبنيه فرع «بلا ملصق» أدناه للبطاقة كلها، هنا
    // مقصوراً على ارتفاع الشريط فقط: بين لوني اللوحة الداكنين نفسيهما.
    const bandWash = ctx.createLinearGradient(0, bandTop, 0, bandTop + BAND_HEIGHT);
    bandWash.addColorStop(0, palette.card);
    bandWash.addColorStop(1, palette.bg);
    ctx.fillStyle = bandWash;
    ctx.fillRect(0, bandTop, WIDTH, BAND_HEIGHT);

    const ruleGradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
    ruleGradient.addColorStop(0, typeColour);
    ruleGradient.addColorStop(1, palette.accent);
    ctx.fillStyle = ruleGradient;
    ctx.fillRect(0, bandTop, WIDTH, 3);
  } else {
    // Nothing to divide, so the rule becomes a short centred mark above the
    // type — the one place the palette's own accent shows on a poster-less
    // card, and what the tone test samples.
    ctx.fillRect(WIDTH / 2 - 60, bandTop - 12, 120, 4);
  }

  const centreX = WIDTH / 2;
  drawChip(ctx, event, palette, centreX, bandTop + 56, typeColour);

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
  // who sees this in a group chat knows where the details live. The mark and
  // the text are centred together as one group: the mark on the leading
  // (right) edge of this RTL layout, the text trailing from it.
  const brandFont = `600 24px "${BOLD_FAMILY}"`;
  const brandText = `${palette.wordmark} · التفاصيل في التطبيق`;
  ctx.font = brandFont;
  const brandTextWidth = ctx.measureText(brandText).width;
  const markSize = 44;
  const markGap = 14;
  // ‎HEIGHT - 80‎ لا ‎- 40‎: ‎- 40‎ كان يضع أسفل العلامة (‏٤٤px‎ ارتفاعها) داخل
  // الإطار المزخرِف أسفل البطاقة (‏drawFrame‏) مباشرة — راجع التعليق أعلى
  // BAND_HEIGHT.
  const rowY = HEIGHT - 80;
  const groupRight = centreX + (markSize + markGap + brandTextWidth) / 2;
  const markX = groupRight - markSize;

  drawBrandMark(ctx, markX, rowY - markSize / 2, markSize);

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = brandFont;
  ctx.fillStyle = withAlpha(palette.accent, 0.95);
  ctx.fillText(brandText, markX - markGap, rowY + 2);
  ctx.restore();

  drawFrame(ctx, palette, tone);

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

/**
 * Renders the marketing cover for `GET /live` (server/src/routes/share.routes.js)
 * — the og:image the owner pastes into WhatsApp for the TikTok channel/live.
 * Unlike renderCard, this is not an information panel about one row: no
 * poster to frame, nothing pulled from a database column beyond the topic
 * text and the active flag `share.routes.js` already derived from
 * settings.service.getLiveChannel(). Composition, top to bottom: the
 * brand mark ('icon', without the word — step 5 writes it once, as text),
 * the "مباشر الآن" pill when a live is actually active, the topic itself as
 * the hero — sized to fit rather than fixed (`fitHeroText`) — a one-line
 * teaser, and the wordmark at the very bottom.
 */
async function renderLiveCover({ title, active }) {
  const palette = PALETTES.festive;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const centreX = WIDTH / 2;

  // Same "nothing to frame, so wash the whole square" treatment renderCard
  // uses for a poster-less event — a plain typographic card, not a picture
  // that failed to load.
  const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  wash.addColorStop(0, palette.card);
  wash.addColorStop(1, palette.bg);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // MEASURE FIRST, THEN DRAW. The hero is sized to its own text, so how tall
  // this card's content actually is only becomes known after fitHeroText has
  // run — and a fixed top margin with a variable-height block underneath left
  // the whole bottom half of a short-topic card empty, which on a marketing
  // image reads as a mistake rather than as space. The block is measured,
  // then centred in the band above the wordmark.
  const heroMaxWidth = WIDTH - MARGIN * 2;
  const { fontSize: heroSize, lines: heroLines } = fitHeroText(ctx, title, heroMaxWidth, 3);
  const lineHeight = Math.round(heroSize * 1.22);

  const markSize = 250;
  const GAP_AFTER_MARK = 52;
  const GAP_AFTER_BADGE = 50;
  const GAP_BEFORE_TEASER = 44;
  const TEASER_HEIGHT = 34;
  // The wordmark's own strip at the foot of the card, excluded from the band
  // the block is centred in so the two can never crowd each other.
  const WORDMARK_ZONE = 150;

  const badgeBlock = active ? LIVE_BADGE_HEIGHT + GAP_AFTER_BADGE : 0;
  const blockHeight = markSize + GAP_AFTER_MARK + badgeBlock
    + heroLines.length * lineHeight + GAP_BEFORE_TEASER + TEASER_HEIGHT;

  // Never above MARGIN, however tall the block grows: a three-line hero at the
  // largest size must clip nothing off the top.
  const band = HEIGHT - WORDMARK_ZONE - MARGIN;
  let cursorY = MARGIN + Math.max(0, (band - blockHeight) / 2);

  // 1. the brand mark — the 'icon' layer, WITHOUT the "اعراسنا" word beneath
  // it. CLAUDE.md's rule for the two layers is exactly this case: 'full' is
  // for app icons, 'icon' for a badge sitting beside the app name written as
  // text — and step 5 below writes that name. Drawing 'full' here put the
  // word on the card twice, and the upper copy is coloured for the white
  // ground the mark was approved on, so on this dark card it all but vanished.
  drawBrandMark(ctx, centreX - markSize / 2, cursorY, markSize);
  cursorY += markSize + GAP_AFTER_MARK;

  // 2. the "مباشر الآن" pill — only when a live is actually active; a stale
  // badge on an ended live would misrepresent it (renderLiveCover is called
  // with `active: false` for exactly that case — see share.routes.js).
  if (active) {
    cursorY = drawLiveBadge(ctx, centreX, cursorY) + GAP_AFTER_BADGE;
  }

  // 3. the topic — the hero, the largest type on the card.
  const heroTop = cursorY + lineHeight / 2;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.ink;
  ctx.font = `700 ${heroSize}px "${BOLD_FAMILY}"`;
  heroLines.forEach((line, i) => {
    ctx.fillText(line, centreX, heroTop + i * lineHeight);
  });
  ctx.restore();
  cursorY += heroLines.length * lineHeight;

  // 4. one short teaser line beneath the hero.
  const teaser = active
    ? 'البث مباشر الآن على تيك توك — ادخل وشاهد'
    : 'تابعونا على تيك توك لمشاهدة أحدث المقاطع';
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `28px "${REGULAR_FAMILY}"`;
  ctx.fillStyle = palette.faint;
  ctx.fillText(teaser, centreX, cursorY + GAP_BEFORE_TEASER + TEASER_HEIGHT / 2);
  ctx.restore();

  // 5. the wordmark, bottom — same string PALETTES.festive already carries,
  // never a second hardcoded copy of "أعراسنا", and the ONLY place it appears
  // on this card (see step 1).
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 30px "${BOLD_FAMILY}"`;
  ctx.fillStyle = withAlpha(palette.accent, 0.95);
  ctx.fillText(palette.wordmark, centreX, HEIGHT - 78);
  ctx.restore();

  return canvas.toBuffer('image/jpeg', 88);
}

/**
 * Render-once-reuse entry point for the live cover, same shape as
 * getOrRenderCard above but keyed on (topic text, active flag) instead of an
 * event row — see liveCacheKey. No stale-file eviction: unlike an event's
 * cache (one id, one current file at a time), a live cover's key is content
 * hashed, so a changed topic simply adds a new file rather than orphaning an
 * old one tied to an id that still exists.
 */
async function getOrRenderLiveCover({ title, active }) {
  const key = liveCacheKey(title, active);
  const file = cachePath(key);

  try {
    return await fsp.readFile(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const buffer = await renderLiveCover({ title, active });
  await fsp.writeFile(file, buffer);
  return buffer;
}

module.exports = {
  WIDTH,
  HEIGHT,
  CACHE_DIR,
  renderCard,
  getOrRenderCard,
  renderLiveCover,
  getOrRenderLiveCover
};
