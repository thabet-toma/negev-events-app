'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/ApiError');

const ADMIN_ROLES = ['admin', 'super_admin'];

function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/** Rejects the request unless it carries a valid JWT. */
function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized('مطلوب تسجيل الدخول'));

  try {
    req.user = jwt.verify(token, config.jwt.secret);
    return next();
  } catch (err) {
    return next(ApiError.forbidden('الجلسة منتهية أو غير صالحة'));
  }
}

/** Attaches req.user when a valid token is present, but never rejects. */
function optionalAuthenticate(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      req.user = undefined;
    }
  }
  return next();
}

/** Requires an authenticated user holding an admin role. */
function requireAdmin(req, res, next) {
  authenticate(req, res, err => {
    if (err) return next(err);
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return next(ApiError.forbidden('صلاحيات الإدارة مطلوبة'));
    }
    return next();
  });
}

function signToken(payload, expiresIn) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn });
}

module.exports = { authenticate, optionalAuthenticate, requireAdmin, signToken, ADMIN_ROLES };
