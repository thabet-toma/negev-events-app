'use strict';

const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { fetchImageBuffer, isAllowedHost } = require('../utils/remoteImage');
const { STORY_THUMB_HOSTS } = require('../constants');
const { PALETTES } = require('../utils/shareTheme');
const cloudinary = require('./cloudinary.service');
const stories = require('./stories.service');
// Loading shareCard registers Cairo with @napi-rs/canvas; drawBrandMark is the
// one copy of the mark's geometry, shared rather than re-drawn here.
const { drawBrandMark } = require('./shareCard.service');

const WIDTH = 1080;
const HEIGHT = 1920;
const OEMBED_TIMEOUT_MS = 8000;
const THUMB_MAX_BYTES = 8 * 1024 * 1024;

const PLATFORM_LABELS = {
  youtube: 'يوتيوب',
  tiktok: 'تيك توك',
  facebook: 'فيسبوك',
  instagram: 'إنستغرام',
  website: 'فيديو'
};

/**
 * The marketing story studio. It is deliberately a thin layer over three
 * existing pieces: `stories` owns the row, `cloudinary` owns the bytes, and
 * `shareCard` owns the Cairo font and the brand mark. Nothing here writes
 * SQL, and nothing here is a second story model.
 *
 * What it refuses to do is as important as what it does: it does not download
 * or re-upload a YouTube/TikTok video, does not post to a social network, and
 * does not trust an oEmbed thumbnail URL until it is https and its host is on
 * the CDN allowlist. A failure to fetch a thumbnail is not a failure to
 * publish — the card falls back to the brand background.
 */

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw ApiError.badRequest('رابط الفيديو غير صالح');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw ApiError.badRequest('رابط الفيديو يجب أن يبدأ بـ http:// أو https://');
  }
  return url;
}

function youtubeId(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] || null;
  }
  if (!host.endsWith('youtube.com')) return null;
  const fromQuery = url.searchParams.get('v');
  if (fromQuery) return fromQuery;
  const parts = url.pathname.split('/').filter(Boolean);
  if (['shorts', 'live', 'embed'].includes(parts[0])) return parts[1] || null;
  return null;
}

/**
 * Turns any pasted link into a known platform, a canonical URL the viewer can
 * open, and (for YouTube) an id whose thumbnail always exists. Facebook and
 * Instagram are accepted as links but have no tokenless oEmbed; the studio
 * still draws a text card for them rather than pretending it has a poster.
 */
function normaliseVideoLink(raw) {
  const url = safeUrl(raw);
  const host = url.hostname.toLowerCase();
  const ytId = youtubeId(url);
  if (ytId) {
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(ytId)) throw ApiError.badRequest('معرّف فيديو يوتيوب غير صالح');
    return {
      platform: 'youtube',
      video_id: ytId,
      canonical_url: `https://www.youtube.com/watch?v=${ytId}`,
      thumbnail_url: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
    };
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    return {
      platform: 'tiktok',
      video_id: null,
      canonical_url: `${url.origin}${url.pathname}`,
      thumbnail_url: null
    };
  }
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch') {
    return { platform: 'facebook', video_id: null, canonical_url: url.toString(), thumbnail_url: null };
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    return { platform: 'instagram', video_id: null, canonical_url: url.toString(), thumbnail_url: null };
  }
  return { platform: 'website', video_id: null, canonical_url: url.toString(), thumbnail_url: null };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      logger.warn(`[story-studio] oEmbed answered ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.warn(`[story-studio] oEmbed failed: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichWithOEmbed(link) {
  if (link.platform === 'youtube') {
    const data = await fetchJson(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(link.canonical_url)}&format=json`
    );
    if (!data) return link;
    return {
      ...link,
      title: cleanText(data.title, 200) || null,
      author_name: cleanText(data.author_name, 150) || null,
      thumbnail_url: safeThumbnail(data.thumbnail_url) || link.thumbnail_url
    };
  }
  if (link.platform === 'tiktok') {
    const data = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link.canonical_url)}`);
    if (!data) return link;
    return {
      ...link,
      title: cleanText(data.title, 200) || null,
      author_name: cleanText(data.author_name, 150) || null,
      thumbnail_url: safeThumbnail(data.thumbnail_url) || null
    };
  }
  return link;
}

/** An oEmbed thumbnail is only followed if it is https on a known CDN. */
function safeThumbnail(raw) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw));
    if (url.protocol !== 'https:') return null;
    if (!isAllowedHost(url.hostname.toLowerCase(), STORY_THUMB_HOSTS)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchThumbnail(link) {
  if (!link.thumbnail_url) return null;
  try {
    const { buffer } = await fetchImageBuffer(link.thumbnail_url, {
      hosts: STORY_THUMB_HOSTS,
      maxBytes: THUMB_MAX_BYTES
    });
    return buffer;
  } catch (err) {
    logger.warn(`[story-studio] thumbnail skipped: ${err.message}`);
    return null;
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth) {
      let cut = last;
      while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
      lines[maxLines - 1] = `${cut}…`;
    }
  }
  return lines;
}

/**
 * Draws the 1080×1920 card. The cover is a real thumbnail when one was
 * fetched, and a brand gradient when it was not; text always sits on the
 * dark lower half so Arabic stays legible over a bright photo.
 */
async function renderStoryPoster(link, { title, subtitle, ctaLabel } = {}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, '#0b1a2a');
  background.addColorStop(0.55, '#12354d');
  background.addColorStop(1, '#08131f');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const thumbnail = await fetchThumbnail(link);
  let cover = null;
  if (thumbnail) {
    try {
      cover = await loadImage(thumbnail);
    } catch {
      cover = null;
    }
  }

  if (cover) {
    const scale = Math.max(WIDTH / cover.width, HEIGHT / cover.height);
    const drawWidth = cover.width * scale;
    const drawHeight = cover.height * scale;
    ctx.drawImage(cover, (WIDTH - drawWidth) / 2, (HEIGHT - drawHeight) / 2, drawWidth, drawHeight);
  } else {
    // Decorative arcs only when there is no photo — never competing with a
    // real wedding/video image.
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(WIDTH - 120, 280, 180 + i * 90, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  const shade = ctx.createLinearGradient(0, HEIGHT * 0.34, 0, HEIGHT);
  shade.addColorStop(0, 'rgba(8, 19, 31, 0)');
  shade.addColorStop(0.5, 'rgba(8, 19, 31, 0.82)');
  shade.addColorStop(1, 'rgba(8, 19, 31, 0.98)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const topShade = ctx.createLinearGradient(0, 0, 0, 360);
  topShade.addColorStop(0, 'rgba(8, 19, 31, 0.86)');
  topShade.addColorStop(1, 'rgba(8, 19, 31, 0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, WIDTH, 380);

  // Brand row, top-right (RTL reading starts there).
  const wordmark = (PALETTES.festive && PALETTES.festive.wordmark) || 'اعراسنا';
  drawBrandMark(ctx, WIDTH - 72 - 96, 64, 96);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 44px "Cairo Card Bold"';
  ctx.fillText(wordmark, WIDTH - 188, 128);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '400 24px "Cairo Card"';
  ctx.fillText('مناسبات النقب', WIDTH - 188, 164);

  // Platform badge, top-left.
  const badge = PLATFORM_LABELS[link.platform] || PLATFORM_LABELS.website;
  ctx.font = '700 28px "Cairo Card Bold"';
  const badgeWidth = ctx.measureText(badge).width + 46;
  roundedRect(ctx, 64, 76, badgeWidth, 58, 29);
  ctx.fillStyle = 'rgba(212, 175, 55, 0.94)';
  ctx.fill();
  ctx.fillStyle = '#08131f';
  ctx.textAlign = 'center';
  ctx.fillText(badge, 64 + badgeWidth / 2, 115);

  const heading = cleanText(title, 200) || cleanText(link.title, 200) || 'شاهد الفيديو';
  const sub = cleanText(subtitle, 150) || cleanText(link.author_name, 150) || 'فيديو ترويجي من أعراسنا';

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 68px "Cairo Card Bold"';
  const titleLines = wrapLines(ctx, heading, WIDTH - 160, 4);
  let cursorY = 1160;
  for (const line of titleLines) {
    ctx.fillText(line, WIDTH - 80, cursorY);
    cursorY += 88;
  }

  ctx.fillStyle = 'rgba(226, 238, 245, 0.82)';
  ctx.font = '400 38px "Cairo Card"';
  const subtitleLines = wrapLines(ctx, sub, WIDTH - 180, 2);
  for (const line of subtitleLines) {
    ctx.fillText(line, WIDTH - 80, cursorY + 18);
    cursorY += 54;
  }

  // CTA pill.
  const cta = cleanText(ctaLabel, 40) || 'شاهد الفيديو';
  ctx.font = '700 40px "Cairo Card Bold"';
  const ctaWidth = Math.min(WIDTH - 160, ctx.measureText(cta).width + 150);
  const ctaX = (WIDTH - ctaWidth) / 2;
  const ctaY = 1658;
  roundedRect(ctx, ctaX, ctaY, ctaWidth, 108, 54);
  ctx.fillStyle = '#d4af37';
  ctx.fill();

  // Play triangle on the right of the text (RTL): the pill reads "شاهد… ▶".
  ctx.fillStyle = '#08131f';
  ctx.beginPath();
  const playX = ctaX + ctaWidth - 42;
  const playY = ctaY + 54;
  ctx.moveTo(playX, playY - 15);
  ctx.lineTo(playX + 24, playY);
  ctx.lineTo(playX, playY + 15);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'right';
  ctx.font = '700 40px "Cairo Card Bold"';
  ctx.fillText(cta, ctaX + ctaWidth - 76, ctaY + 68);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
  ctx.font = '400 28px "Cairo Card"';
  ctx.fillText('اعراسنا · مناسبات النقب', WIDTH / 2, HEIGHT - 58);

  return canvas.toBuffer('image/jpeg', 90);
}

function publicLink(link) {
  return {
    platform: link.platform,
    canonical_url: link.canonical_url,
    title: link.title || null,
    author_name: link.author_name || null,
    thumbnail_url: link.thumbnail_url || null,
    platform_label: PLATFORM_LABELS[link.platform] || PLATFORM_LABELS.website
  };
}

async function buildCampaignInfo(rawUrl) {
  const link = await enrichWithOEmbed(normaliseVideoLink(rawUrl));
  return link;
}

async function previewCampaign(input) {
  const link = await buildCampaignInfo(input.url);
  const buffer = await renderStoryPoster(link, input);
  return {
    info: publicLink(link),
    preview: `data:image/jpeg;base64,${buffer.toString('base64')}`
  };
}

/**
 * One call that goes from a pasted link to a published story: draw, upload,
 * insert, then record the public_id. If the insert fails the just-uploaded
 * asset is destroyed, so a rejected campaign leaves no orphan on Cloudinary.
 */
async function publishCampaign(user, input, { expiresAt } = {}) {
  const link = await buildCampaignInfo(input.url);
  const buffer = await renderStoryPoster(link, input);
  const uploaded = await cloudinary.uploadBuffer(buffer, cloudinary.folderFor('stories', 'posters'), {
    format: 'jpg'
  });

  let story;
  try {
    story = await stories.createStory({
      title: cleanText(input.title, 200) || link.title || 'شاهد الفيديو',
      clan: cleanText(input.clan, 150) || null,
      town: cleanText(input.town, 100) || null,
      image: uploaded.url,
      is_live: false,
      event_id: input.event_id || null,
      expires_at: expiresAt,
      advertiser_name: cleanText(input.advertiser_name, 150) || null,
      is_ad: Boolean(input.is_ad),
      target_url: link.canonical_url,
      link_platform: link.platform,
      cta_label: cleanText(input.cta_label, 40) || 'شاهد الفيديو',
      slide_duration_seconds: input.slide_duration_seconds || 7
    });
    await stories.attachPoster(story.id, uploaded.public_id, 'generated');
    story.poster_public_id = uploaded.public_id;
    story.poster_source = 'generated';
  } catch (err) {
    await cloudinary.destroy(uploaded.public_id);
    throw err;
  }

  logger.info('story.studio.publish', { storyId: story.id, platform: link.platform, by: user.id });
  return { story, info: publicLink(link) };
}

module.exports = {
  normaliseVideoLink,
  buildCampaignInfo,
  renderStoryPoster,
  previewCampaign,
  publishCampaign,
  PLATFORM_LABELS
};
