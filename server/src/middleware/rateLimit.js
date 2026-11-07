'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');
const { authenticatedUserId } = require('../utils/rateLimitIdentity');

/**
 * دلو IP مجهول واحد تشترك فيه /api وبوابة الضيف، لا نسخة لكل راوتر.
 * onAnonymousRateLimitExceeded في res.locals يعلن بوابة مجهولة حتى مع رمز صالح،
 * ويخصّص ردّ التجاوز لذلك الطلب وحده؛ /api يبقى على التجاوز الموثَّق بـJSON.
 */
const anonymousLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.ip || 'unknown',
  skip: (req, res) => !res.locals.onAnonymousRateLimitExceeded && authenticatedUserId(req) !== null,
  message: { success: false, message: 'عدد الطلبات تجاوز الحد المسموح — يرجى المحاولة لاحقاً' },
  handler: (req, res, next, options) => {
    if (res.locals.onAnonymousRateLimitExceeded) {
      res.locals.onAnonymousRateLimitExceeded();
      return;
    }
    res.status(options.statusCode).send(options.message);
  }
});

module.exports = { anonymousLimiter };
