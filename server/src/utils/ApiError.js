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

  static conflict(message = 'العنصر موجود مسبقاً', details) {
    return new ApiError(409, message, details);
  }

  /**
   * طرف ثالث (منصة كترا الإخبارية اليوم) لم يجب بما يصلح: الخلل في وسيط لا
   * في طلب العميل، فلا 400 ولا 500 — 502 تقول ذلك بعينه.
   */
  static badGateway(message = 'تعذّر الوصول إلى الخدمة الخارجية الآن') {
    return new ApiError(502, message);
  }

  /**
   * خدمة خارجية لم تُجب بما يصلح **وليس لها نسخة محفوظة تُخدَم** (أسعار الذهب
   * والعملات اليوم، تذكرة #189): 503 لا 500 — الخلل في وسيط خارجي لا في طلب
   * العميل، والخدمة نفسها قائمة. تختلف عن 502 أعلاه في المعنى لا في الشكل.
   */
  static serviceUnavailable(message = 'الخدمة غير متاحة الآن — حاول بعد قليل') {
    return new ApiError(503, message);
  }
}

module.exports = ApiError;
