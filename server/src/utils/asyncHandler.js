'use strict';

/** Wraps an async route handler so rejected promises reach the error middleware. */
module.exports = function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
};
