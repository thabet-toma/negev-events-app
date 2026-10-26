'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { extractToken } = require('../middleware/auth');

/**
 * The account id behind this request's bearer token, or null.
 *
 * Keys the per-user rate-limit bucket: a signed-in caller must be counted
 * against their own account rather than a shared IP, so one admin uploading a
 * large album cannot spend anyone else's allowance. Never throws — a missing,
 * malformed or expired token is simply anonymous — and it is memoized on the
 * request because both limiters ask, and a null answer must be cached too.
 */
function authenticatedUserId(req) {
  if (Object.prototype.hasOwnProperty.call(req, '_rateLimitUserId')) {
    return req._rateLimitUserId;
  }

  // `authenticate` may already have verified and decoded the token for a route.
  let payload = req.user || null;
  if (!payload) {
    const token = extractToken(req);
    if (token) {
      try {
        payload = jwt.verify(token, config.jwt.secret);
      } catch (err) {
        payload = null;
      }
    }
  }

  const id = payload ? Number(payload.id) : NaN;
  req._rateLimitUserId = Number.isInteger(id) && id > 0 ? id : null;
  return req._rateLimitUserId;
}

module.exports = { authenticatedUserId };
