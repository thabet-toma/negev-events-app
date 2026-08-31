'use strict';

const { Server } = require('socket.io');
const config = require('../config');
const logger = require('../utils/logger');

let io = null;

/** Attaches the realtime hub to an HTTP server. */
function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.origins.includes('*') ? '*' : config.cors.origins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE']
    }
  });

  io.on('connection', socket => {
    logger.debug(`Realtime client connected: ${socket.id}`);
    socket.on('disconnect', () => logger.debug(`Realtime client disconnected: ${socket.id}`));
  });

  return io;
}

/** Broadcasts an event to every connected client; a no-op before init(). */
function emit(channel, payload) {
  if (!io) return;
  io.emit(channel, payload);
}

module.exports = { init, emit, get instance() { return io; } };
