'use strict';

const db = require('../db/pool');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { withAbsoluteMedia } = require('../utils/mediaUrl');

const GRAPH_VERSION = 'v20.0';
const GRAPH_TIMEOUT_MS = 8000;

/**
 * One Graph API GET. The page token is required for reading a Page's own
 * albums (`pages_read_engagement` + `pages_show_list`); the existing token is
 * already used for publishing, so whether it can read is a fact to verify,
 * not an assumption. Errors are logged in English and surfaced in Arabic —
 * never echo Facebook's message to the admin, and never log the token or the
 * full URL.
 */
async function graphGet(pathname) {
  const { pageId, accessToken } = config.facebook || {};
  if (!pageId || !accessToken) {
    throw ApiError.badRequest('صفحة فيسبوك غير مفعّلة — أضف FACEBOOK_PAGE_ID وFACEBOOK_PAGE_ACCESS_TOKEN إلى إعدادات الخادم');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);
  const separator = pathname.includes('?') ? '&' : '?';
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pathname}${separator}access_token=${encodeURIComponent(accessToken)}`,
      { signal: controller.signal }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.error) {
      logger.warn(`[facebook] graph ${pathname.split('?')[0]} answered ${res.status}${data && data.error && data.error.code ? ` (code ${data.error.code})` : ''}`);
      throw ApiError.badRequest('تعذّر قراءة صفحة فيسبوك — تحقّق من صلاحية التوكن (pages_read_engagement) وحاول مرة أخرى');
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') {
      throw ApiError.badRequest('انتهت مهلة الاتصال بفيسبوك — حاول مرة أخرى');
    }
    throw ApiError.badRequest('تعذّر الاتصال بفيسبوك — تحقّق من الشبكة وحاول مرة أخرى');
  } finally {
    clearTimeout(timer);
  }
}

/** The page's own albums, newest first — only albums a human can import. */
async function listPageAlbums() {
  const { pageId } = config.facebook || {};
  const data = await graphGet(
    `${encodeURIComponent(pageId)}/albums?fields=id,name,count,cover_photo{images}&limit=50`
  );
  return (data.data || []).map(album => ({
    id: String(album.id),
    name: album.name || 'ألبوم فيسبوك',
    count: Number(album.count) || 0,
    cover_url: album.cover_photo && Array.isArray(album.cover_photo.images) && album.cover_photo.images.length
      ? album.cover_photo.images[0].source
      : null
  }));
}

/**
 * Up to 100 photos of one Page album, each with its largest downloadable
 * rendition. `images[0]` is the largest in Graph's ordering; the importer
 * re-checks the host and size before fetching it.
 */
async function listAlbumPhotos(albumId) {
  const data = await graphGet(
    `${encodeURIComponent(albumId)}/photos?fields=id,images,alt_text,created_time&limit=100`
  );
  return (data.data || [])
    .map(photo => {
      const image = Array.isArray(photo.images) && photo.images.length ? photo.images[0] : null;
      return {
        id: String(photo.id),
        source_url: image ? image.source : null,
        width: image ? Number(image.width) || null : null,
        height: image ? Number(image.height) || null : null,
        caption: photo.alt_text || null,
        created_time: photo.created_time || null
      };
    })
    .filter(photo => photo.source_url);
}

/**
 * Builds marketing copy for the Facebook post.
 */
function formatEventCaption(event, honorees = []) {
  const occasionType = event.occasion_type_name || 'مناسبة';
  const honoreeNames = honorees.map(h => h.name).filter(Boolean).join(' و ');
  const title = honoreeNames ? `${occasionType}: ${honoreeNames}` : (event.title || occasionType);
  const clan = event.family_clan ? `عائلة ${event.family_clan}` : '';

  const dateParts = event.event_date ? String(event.event_date).split('T')[0] : '';
  const locationParts = [event.town, event.location_name].filter(Boolean).join(' — ');

  const pageUrl = `${config.publicUrl}/e/${event.id}`;
  const downloadUrl = `${config.publicUrl}/downloads/negev-events.apk`;

  const lines = [
    `🎉 مناسبة جديدة على منصة وتطبيق "أعراسنا" في ${event.town || 'النقب'}! 🎉`,
    '',
    `✨ ${title}`,
    clan ? `👥 ${clan}` : '',
    dateParts ? `📅 التاريخ: ${dateParts}` : '',
    locationParts ? `📍 المكان: ${locationParts}` : '',
    event.dinner_time ? `🍽️ موعد العشاء: ${event.dinner_time}` : '',
    '',
    '📲 لمشاهدة كافة تفاصيل المناسبة، موقع القاعة على الخريطة، وتقديم التهاني والتبريكات:',
    `🔗 تفضلوا بالدخول عبر الرابط: ${pageUrl}`,
    '',
    '📥 حمّل تطبيق "أعراسنا" لمتابعة مناسبات النقب أولاً بأول:',
    `🔗 ${downloadUrl}`,
    '',
    `#مناسبات_النقب #أعراسنا #${String(event.town || 'النقب').replace(/\s+/g, '_')}`
  ].filter(line => line !== null && line !== undefined);

  return lines.join('\n');
}

/**
 * Posts an event to the configured Facebook Page.
 */
async function publishEvent(eventOrId) {
  const { pageId, accessToken, autoPublish } = config.facebook || {};
  if (!autoPublish || !accessToken || !pageId) {
    logger.debug('[facebook] Auto-publish skipped: missing credentials or disabled');
    return null;
  }

  const eventId = typeof eventOrId === 'object' ? eventOrId.id : eventOrId;
  if (!eventId) return null;

  const row = await db.queryOne(
    `SELECT e.*, ot.name AS occasion_type_name
       FROM events e
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE e.id = ?`,
    [eventId]
  );
  if (!row) {
    logger.warn(`[facebook] Event ${eventId} not found for auto-publishing`);
    return null;
  }

  const event = withAbsoluteMedia(row);
  const honorees = await db.query(
    'SELECT name, role, position FROM event_honorees WHERE event_id = ? ORDER BY position ASC, id ASC',
    [eventId]
  );

  const caption = formatEventCaption(event, honorees);
  const pageUrl = `${config.publicUrl}/e/${event.id}`;
  const cardUrl = `${config.publicUrl}/e/${event.id}/card.jpg`;
  const imageUrl = event.poster_url || cardUrl;

  logger.info(`[facebook] Publishing event ${eventId} ("${event.title}") to page ${pageId}...`);

  try {
    // Try publishing as a photo with caption first
    if (imageUrl) {
      const photoApiUrl = `https://graph.facebook.com/v20.0/${pageId}/photos`;
      const body = new URLSearchParams({
        url: imageUrl,
        caption,
        access_token: accessToken
      });

      const res = await fetch(photoApiUrl, { method: 'POST', body });
      const data = await res.json();

      if (data.id || data.post_id) {
        logger.info(`[facebook] Event ${eventId} published successfully as photo! Post ID: ${data.post_id || data.id}`);
        return { success: true, postId: data.post_id || data.id };
      }

      logger.warn(`[facebook] Photo post failed (${JSON.stringify(data)}), falling back to feed post...`);
    }

    // Fallback: publish as a link post to feed
    const feedApiUrl = `https://graph.facebook.com/v20.0/${pageId}/feed`;
    const feedBody = new URLSearchParams({
      message: caption,
      link: pageUrl,
      access_token: accessToken
    });

    const feedRes = await fetch(feedApiUrl, { method: 'POST', body: feedBody });
    const feedData = await feedRes.json();

    if (feedData.id) {
      logger.info(`[facebook] Event ${eventId} published successfully to feed! Post ID: ${feedData.id}`);
      return { success: true, postId: feedData.id };
    }

    logger.error(`[facebook] Failed to publish event ${eventId} to Facebook feed: ${JSON.stringify(feedData)}`);
    return { success: false, error: feedData };
  } catch (err) {
    logger.error(`[facebook] Network/API error while publishing event ${eventId}: ${err.message}`);
    throw err;
  }
}

/**
 * Non-blocking safe publisher: never throws or disrupts the caller.
 */
function publishEventSafely(eventOrId) {
  Promise.resolve()
    .then(() => publishEvent(eventOrId))
    .catch(err => {
      logger.error(`[facebook] publishEventSafely caught error: ${err.message}`);
    });
}

/**
 * Publishes a custom post or announcement.
 */
async function publishCustomPost({ message, link, imageUrl }) {
  const { pageId, accessToken } = config.facebook || {};
  if (!accessToken || !pageId) {
    throw new Error('Facebook credentials not configured');
  }

  if (imageUrl) {
    const url = `https://graph.facebook.com/v20.0/${pageId}/photos`;
    const params = new URLSearchParams({
      url: imageUrl,
      caption: message,
      access_token: accessToken
    });
    const res = await fetch(url, { method: 'POST', body: params });
    return res.json();
  }

  const url = `https://graph.facebook.com/v20.0/${pageId}/feed`;
  const params = new URLSearchParams({
    message,
    access_token: accessToken
  });
  if (link) params.set('link', link);

  const res = await fetch(url, { method: 'POST', body: params });
  return res.json();
}

module.exports = {
  publishEvent,
  publishEventSafely,
  publishCustomPost,
  formatEventCaption,
  listPageAlbums,
  listAlbumPhotos
};
