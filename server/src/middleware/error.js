'use strict';

const multer = require('multer');
const config = require('../config');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

/** 404 handler for unmatched /api routes. */
function notFound(req, res, next) {
  next(ApiError.notFound('المسار المطلوب غير موجود'));
}

/** Maps known error shapes onto clean JSON responses. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'حدث خطأ غير متوقع في الخادم';

  if (err instanceof multer.MulterError) {
    status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `حجم الملف كبير جداً (الحد الأقصى ${config.uploads.maxFileSizeMb} ميجابايت)`;
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      // The old text ('خطأ في رفع الملف') named nothing, so a user whose photo
      // was simply an unsupported format had no way to know that — or what to
      // convert it to. This is the most common upload failure by far.
      message = 'نوع الملف غير مدعوم — الصور المقبولة JPG أو PNG أو WEBP أو GIF، والصوت MP3 أو WAV أو OGG أو M4A. صور آيفون بصيغة HEIC تحتاج تحويلاً إلى JPG';
    } else {
      message = 'خطأ في رفع الملف';
    }
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'هذا السجل مسجل مسبقاً';
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    status = 400;
    message = 'العنصر المرتبط غير موجود';
  } else if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    status = 503;
    message = 'قاعدة البيانات غير متاحة حالياً';
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} →`, err.stack || err.message);
    if (config.isProduction) message = 'حدث خطأ غير متوقع في الخادم';
  }

  res.status(status).json({
    success: false,
    message,
    ...(err.details ? { details: err.details } : {})
  });
}

module.exports = { notFound, errorHandler };
