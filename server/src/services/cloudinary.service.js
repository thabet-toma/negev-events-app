'use strict';

/**
 * Cloudinary, by its plain REST API — no SDK (ADR-0008). Four jobs only:
 *
 *   1. sign an upload the admin's browser then sends to Cloudinary directly,
 *      so the image never passes through this server's disk or bandwidth;
 *   2. verify the signature Cloudinary returned for that upload before a row
 *      is written, so no caller can register an image this server never
 *      signed for (the API secret is the only thing that can produce it);
 *   3. delete an image whose row was deleted (best-effort);
 *   4. forward an image a client already sent HERE (poster, artist image,
 *      service image) — the path every client, published APKs included,
 *      already takes — so none of them has to change.
 *
 * The public_id is chosen HERE, inside a folder derived from what is being
 * uploaded (an episode, an archived event) — never by the client — and is
 * part of what gets signed, so an upload cannot land anywhere else. Nothing
 * here touches the database; the services that own the rows call in.
 */

const crypto = require('crypto');
const fsp = require('fs/promises');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const ROOT_FOLDER = 'negev-events';
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,heic';
// Only what a name we generated ourselves can contain — checked again on the
// way back in, since the value then comes from the client.
const PUBLIC_ID_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)+$/;
const REQUEST_TIMEOUT_MS = 8000;
// A whole poster goes up in one request, so it gets longer than a destroy.
const UPLOAD_TIMEOUT_MS = 30000;

function isConfigured() {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  return Boolean(cloudName && apiKey && apiSecret);
}

/** Every signed operation starts here, so a missing key is one clear Arabic message, never a crash. */
function assertConfigured() {
  if (!isConfigured()) {
    throw ApiError.badRequest('رفع الصور غير مفعَّل بعد — أضف مفاتيح Cloudinary إلى إعدادات الخادم');
  }
}

/**
 * Cloudinary's signing rule: every signed parameter as `name=value`, sorted
 * by name, joined with `&`, the API secret appended with no separator, then
 * hashed. SHA-256 on the way out — Cloudinary accepts it on every account,
 * including one restricted to SHA-256 only.
 */
function sign(params, algorithm = 'sha256') {
  const serialised = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash(algorithm).update(serialised + config.cloudinary.apiSecret).digest('hex');
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** `negev-events/<...segments>` — the one place a folder name is built. */
function folderFor(...segments) {
  return [ROOT_FOLDER, ...segments].join('/');
}

/**
 * Everything the browser needs to POST one image straight to Cloudinary.
 * The random tail makes every upload a new public_id (nothing is ever
 * overwritten), and the whole id is inside `folder`.
 */
function signUpload(folder) {
  assertConfigured();
  const publicId = `${folder}/${crypto.randomBytes(9).toString('hex')}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { allowed_formats: ALLOWED_FORMATS, public_id: publicId, timestamp };
  return {
    upload_url: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/upload`,
    api_key: config.cloudinary.apiKey,
    public_id: publicId,
    timestamp,
    allowed_formats: ALLOWED_FORMATS,
    signature: sign(params)
  };
}

/**
 * Checks what the browser relays back from Cloudinary's upload response:
 * the public_id must sit inside `folder` and be a shape we generate, and the
 * response signature — Cloudinary's hash of public_id + version with our
 * secret — must match. Cloudinary signs that response with the account's
 * configured digest, SHA-1 unless the account was switched, so both are
 * tried. Returns the verified `{ public_id, version }`.
 */
function verifyUpload(folder, { public_id: publicId, version, signature } = {}) {
  assertConfigured();
  const id = typeof publicId === 'string' ? publicId : '';
  const ver = String(version ?? '');
  if (!PUBLIC_ID_PATTERN.test(id) || !id.startsWith(`${folder}/`) || !/^\d{1,12}$/.test(ver)) {
    throw ApiError.badRequest('الصورة المرفوعة غير صالحة — أعد رفعها');
  }
  const given = String(signature || '');
  const params = { public_id: id, version: ver };
  if (!safeEqualHex(given, sign(params, 'sha1')) && !safeEqualHex(given, sign(params, 'sha256'))) {
    throw ApiError.badRequest('تعذّر التحقق من الصورة المرفوعة — أعد رفعها');
  }
  return { public_id: id, version: ver };
}

/**
 * The stored, public URL of a verified image: Cloudinary picks the format
 * and quality per device, and nothing wider than 1600px is ever sent — a
 * phone photo straight off the camera is several times that.
 */
function deliveryUrl({ public_id: publicId, version }) {
  return `https://res.cloudinary.com/${config.cloudinary.cloudName}/image/upload/f_auto,q_auto,c_limit,w_1600/v${version}/${publicId}`;
}

/**
 * The same stored image as a JPEG, for this server's own card renderer
 * (shareCard.service.js): `f_auto` answers a non-browser client with
 * whatever format Cloudinary picks, and the canvas decoder should not have
 * to guess. Any other URL comes back unchanged.
 */
function jpegVariant(url) {
  return typeof url === 'string' ? url.replace('/image/upload/f_auto,', '/image/upload/f_jpg,') : url;
}

/**
 * Removes one image from Cloudinary after its row is gone. Best-effort: the
 * row is what the product shows, so a failure here is an orphaned file in
 * the account, logged for whoever tidies it — never an error to the admin.
 */
async function destroy(publicId) {
  if (!publicId || !isConfigured()) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: config.cloudinary.apiKey,
    signature: sign({ public_id: publicId, timestamp })
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/destroy`, {
      method: 'POST',
      body,
      signal: controller.signal
    });
    if (!res.ok) logger.warn(`[cloudinary] destroy ${publicId} answered ${res.status}`);
  } catch (err) {
    logger.warn(`[cloudinary] destroy ${publicId} failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends an image multer already wrote to disk (and verifyMedia already
 * sniffed) on to Cloudinary under `negev-events/<...segments>/`, and returns
 * the URL to store — the local copy is then removed. Without keys, or on any
 * failure, returns the `/uploads/<file>` path exactly as before and keeps the
 * file: the owner's call is that a publish never fails because Cloudinary did.
 */
async function storeUploadedImage(file, ...segments) {
  const localPath = `/uploads/${file.filename}`;
  if (!isConfigured()) return localPath;

  const publicId = `${folderFor(...segments)}/${crypto.randomBytes(9).toString('hex')}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append('file', new Blob([await fsp.readFile(file.path)], { type: file.mimetype }), file.filename);
    form.append('api_key', config.cloudinary.apiKey);
    form.append('public_id', publicId);
    form.append('timestamp', String(timestamp));
    form.append('signature', sign({ public_id: publicId, timestamp }));

    const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/upload`, {
      method: 'POST',
      body: form,
      signal: controller.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.public_id !== publicId || !data.version) {
      logger.warn(`[cloudinary] upload to ${publicId} answered ${res.status} — kept on local disk`);
      return localPath;
    }
    await fsp.unlink(file.path).catch(() => {});
    logger.info('cloudinary.upload', { publicId });
    return deliveryUrl({ public_id: publicId, version: data.version });
  } catch (err) {
    logger.warn(`[cloudinary] upload to ${publicId} failed: ${err.message} — kept on local disk`);
    return localPath;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  isConfigured,
  folderFor,
  signUpload,
  verifyUpload,
  deliveryUrl,
  jpegVariant,
  destroy,
  storeUploadedImage
};
