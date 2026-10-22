'use strict';

const ApiError = require('./ApiError');

/**
 * Fetching an image the admin pasted a URL for (Facebook's CDN, today).
 *
 * This is the one place the server fetches a URL a human typed, so it is
 * deliberately narrow: https only, a host suffix from a hard-coded allowlist,
 * no redirects at all, a byte ceiling enforced while streaming, and the
 * first bytes must be a real image. The allowlist is what makes the SSRF
 * question moot — there is no path from here to 127.0.0.1, a LAN address, or
 * a cloud metadata endpoint, because the host is rejected before `fetch` is
 * ever called. Facebook is also why a *post* URL is not accepted: a post's
 * photos are not exposed by any public API (oEmbed returns embed HTML only),
 * but the individual image address from the browser is fetchable.
 */

const IMAGE_TIMEOUT_MS = 15000;

function isAllowedHost(hostname, hosts) {
  return hosts.some(host => hostname === host || hostname.endsWith(`.${host}`));
}

/** A clean, absolute https URL on an allowed host — throws an Arabic 400 otherwise. */
function assertAllowedImageUrl(raw, hosts, label = 'رابط الصورة') {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw ApiError.badRequest(`${label} غير صالح`);
  }
  if (url.protocol !== 'https:') {
    throw ApiError.badRequest(`${label} يجب أن يبدأ بـ https://`);
  }
  if (!isAllowedHost(url.hostname.toLowerCase(), hosts)) {
    throw ApiError.badRequest('هذا الرابط ليس رابط صورة مباشراً من فيسبوك — انسخ رابط الصورة نفسه (Copy image address) أو ارفع الملف');
  }
  return url.toString();
}

/** A real image's magic bytes, not the Content-Type header alone. */
function looksLikeImage(buffer) {
  if (!buffer || buffer.length < 12) return false;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return true;
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return true;

  const ftyp = buffer.slice(4, 8).toString('ascii');
  const brand = buffer.slice(8, 12).toString('ascii');
  if (ftyp === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif'].includes(brand)) return true;

  return false;
}

/**
 * Downloads one image into memory, refusing anything that is not an allowed
 * image or exceeds `maxBytes`. The ceiling is enforced chunk by chunk, not
 * from a Content-Length a server can lie about.
 */
async function fetchImageBuffer(rawUrl, { hosts, maxBytes, timeoutMs = IMAGE_TIMEOUT_MS }) {
  const url = assertAllowedImageUrl(rawUrl, hosts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'image/*' }
    });

    if (!res.ok) {
      throw ApiError.badRequest(`تعذّر جلب الصورة (${res.status}) — تأكّد أن الرابط ما زال يعمل`);
    }
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      throw ApiError.badRequest('الرابط لا يشير إلى صورة — انسخ رابط الصورة نفسه أو ارفع الملف');
    }
    const declaredLength = Number(res.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) {
      throw ApiError.badRequest('حجم الصورة يتجاوز الحدّ المسموح');
    }
    if (!res.body) throw ApiError.badRequest('تعذّر قراءة الصورة من الرابط');

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw ApiError.badRequest('حجم الصورة يتجاوز الحدّ المسموح');
      }
      chunks.push(Buffer.from(value));
    }

    const buffer = Buffer.concat(chunks);
    if (!looksLikeImage(buffer)) {
      throw ApiError.badRequest('الملف الذي وصل ليس صورة صالحة');
    }
    return { buffer, contentType };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') {
      throw ApiError.badRequest('انتهت مهلة جلب الصورة — حاول مرة أخرى');
    }
    throw ApiError.badRequest('تعذّر جلب الصورة من الرابط — تأكّد من الاتصال وحاول مرة أخرى');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { assertAllowedImageUrl, fetchImageBuffer, looksLikeImage, isAllowedHost };
