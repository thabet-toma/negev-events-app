'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function emit(level, stream, args) {
  if (LEVELS[level] > currentLevel) return;
  const timestamp = new Date().toISOString();
  stream(`[${timestamp}] [${level.toUpperCase()}]`, ...args);
}

module.exports = {
  error: (...args) => emit('error', console.error, args),
  warn: (...args) => emit('warn', console.warn, args),
  info: (...args) => emit('info', console.log, args),
  debug: (...args) => emit('debug', console.log, args)
};
