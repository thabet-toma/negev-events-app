'use strict';

const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  charset: config.db.charset,
  timezone: 'Z',
  dateStrings: ['DATE'],
  namedPlaceholders: false,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

/** mysql2 rejects `undefined` bind values; normalise them to SQL NULL. */
function normalise(params) {
  return params.map(value => (value === undefined ? null : value));
}

/** Run a query and return the rows. */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, normalise(params));
  return rows;
}

/** Run a query and return the first row (or null). */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run an INSERT/UPDATE/DELETE and return { insertId, affectedRows }. */
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, normalise(params));
  return { insertId: result.insertId, affectedRows: result.affectedRows };
}

/** Run a set of statements inside a single transaction. */
async function transaction(handler) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Wait for MySQL to accept connections. Containers start faster than the
 * database inside them, so the app retries instead of crash-looping.
 */
async function waitForConnection({ retries = 15, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      logger.info(`MySQL connection established (${config.db.host}:${config.db.port}/${config.db.database})`);
      return;
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Cannot connect to MySQL after ${retries} attempts: ${err.message}`);
      }
      logger.warn(`MySQL not ready (attempt ${attempt}/${retries}): ${err.code || err.message}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, queryOne, execute, transaction, waitForConnection, close };
