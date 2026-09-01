'use strict';

/**
 * Creates the database (if missing), applies src/db/schema.sql, then runs
 * the explicit steps in dataMigrations.js (ALTERs/UPDATEs schema.sql cannot
 * express). Safe to run repeatedly — every schema.sql statement is CREATE
 * TABLE IF NOT EXISTS, and every data-migration step is idempotent on its own.
 *
 *   npm run db:migrate
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger');
const dataMigrations = require('./dataMigrations');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/** Split a SQL file into statements, ignoring comment-only lines. */
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

async function migrate() {
  const { host, port, user, password, database } = config.db;

  // Connect without a database selected so we can create it.
  const bootstrap = await mysql.createConnection({ host, port, user, password, charset: 'utf8mb4' });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrap.end();
  logger.info(`Database "${database}" is present.`);

  const connection = await mysql.createConnection({ host, port, user, password, database, charset: 'utf8mb4' });
  const statements = splitStatements(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  for (const statement of statements) {
    await connection.query(statement);
  }
  logger.info(`Schema applied — ${statements.length} statement(s) executed.`);

  for (const step of dataMigrations) {
    await step.run(connection);
  }

  await connection.end();
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(err => {
      logger.error('Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = migrate;
