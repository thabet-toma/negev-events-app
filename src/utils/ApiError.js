'use strict';

/** An error carrying an HTTP status code and a user-facing Arabic message. */
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message = 'طلب غير صالح', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'مطلوب تسجيل الدخول') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'لا تملك الصلاحية لهذا الإجراء') {
    return new ApiError(403, message);
  }

  static notFound(message = 'العنصر غير موجود') {
    return new ApiError(404, message);
  }

  static conflict(message = 'العنصر موجود مسبقاً') {
    return new ApiError(409, message);
  }
}

module.exports = ApiError;
