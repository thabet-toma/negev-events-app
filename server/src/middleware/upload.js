'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

const uploadsDir = config.uploads.dir;
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a'
]);

// Dart's package:http defaults every MultipartFile to application/octet-stream
// and never infers one from the filename, so the Flutter app has always sent
// its poster/audio/artist image under that type — and this filter used to
// reject all three with LIMIT_UNEXPECTED_FILE, i.e. "خطأ في رفع الملف" on any
// upload from a phone. Letting the generic type through here is not a hole:
// nothing is trusted until verifyMedia() below reads the bytes themselves.
const GENERIC_MIME = 'application/octet-stream';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Never trust the client filename — keep only a sanitised extension.
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `${file.fieldname}-${unique}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype) && file.mimetype !== GENERIC_MIME) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploads.maxFileSizeMb * 1024 * 1024, files: 3 }
});

/** What each event field is actually allowed to hold, whatever the client claims. */
const FIELD_KIND = { poster: 'image', artist_image: 'image', audio: 'audio' };

/**
 * The real type, read from the file's own leading bytes. Returns null for
 * anything not on the allow-list — a renamed .exe or an HTML page included.
 */
function sniff(buf) {
  const head4 = buf.slice(0, 4).toString('latin1');
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head4 === 'GIF8') return 'image/gif';
  if (head4 === 'RIFF' && buf.length >= 12) {
    const kind = buf.slice(8, 12).toString('latin1');
    if (kind === 'WEBP') return 'image/webp';
    if (kind === 'WAVE') return 'audio/wav';
  }
  if (head4 === 'OggS') return 'audio/ogg';
  if (buf.slice(0, 3).toString('latin1') === 'ID3') return 'audio/mpeg';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg'; // MPEG frame sync
  if (buf.length >= 12 && buf.slice(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4';
  return null;
}

function listFiles(req) {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return req.file ? [req.file] : [];
}

/**
 * Runs after multer has written the files: confirms each one really is what
 * its field expects, and rewrites `mimetype` to the truth. A poster that is
 * not an image — or an audio track that is — is rejected and every file from
 * the request is removed, so a refused submission leaves nothing behind.
 */
async function verifyMedia(req, res, next) {
  const files = listFiles(req);
  if (!files.length) return next();

  try {
    for (const file of files) {
      const expected = FIELD_KIND[file.fieldname];
      let actual = null;

      const handle = await fsp.open(file.path, 'r');
      try {
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(16), 0, 16, 0);
        actual = sniff(buffer.slice(0, bytesRead));
      } finally {
        await handle.close();
      }

      if (!actual || (expected && actual.split('/')[0] !== expected)) {
        await Promise.all(files.map((f) => fsp.unlink(f.path).catch(() => {})));
        return next(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      }

      file.mimetype = actual;
    }
    return next();
  } catch (err) {
    await Promise.all(files.map((f) => fsp.unlink(f.path).catch(() => {})));
    return next(err);
  }
}

/** Accepts an optional poster image, an optional audio track, and an optional artist image. */
const eventMedia = [
  upload.fields([
    { name: 'poster', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
    { name: 'artist_image', maxCount: 1 }
  ]),
  verifyMedia
];

module.exports = { upload, eventMedia, verifyMedia, uploadsDir };
