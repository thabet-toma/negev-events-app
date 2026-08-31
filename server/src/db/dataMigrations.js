'use strict';

/**
 * Explicit data/schema migrations that schema.sql cannot express — it only
 * ever runs CREATE TABLE IF NOT EXISTS, so ALTERs and one-off UPDATEs live
 * here instead. Applied in order, once, after schema.sql, by migrate.js.
 *
 * Every step's run() must be safe to execute on every `npm run db:migrate`,
 * including against a database that already has the change applied. Add new
 * steps by appending to `steps` — never edit or remove a past one.
 */

const logger = require('../utils/logger');
const { TOWN_COORDINATES, REACTION_TYPES, OCCASION_FIELDS, DEFAULT_POSTER } = require('../constants');

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function indexExists(connection, table, indexName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows[0].cnt > 0;
}

async function constraintExists(connection, table, constraintName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [table, constraintName]
  );
  return rows[0].cnt > 0;
}

async function tableExists(connection, table) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

/**
 * Builds the full occasion_type_fields row set for a seed type from
 * OCCASION_FIELDS (so position/order and default labels stay in one place),
 * applying only the per-type overrides that differ from the sensible
 * default (visible, not required unless core).
 */
function buildSeedFields(overrides) {
  return OCCASION_FIELDS.map((field, index) => {
    const override = overrides[field.key] || {};
    return {
      field_key: field.key,
      label: override.label || field.label,
      is_visible: 'is_visible' in override ? override.is_visible : 1,
      is_required: 'is_required' in override ? override.is_required : (field.core ? 1 : 0),
      position: index + 1
    };
  });
}

// Colours come from the design system, not from a generic palette: the type
// colour is what makes the occasion readable before a letter of it is —
// mourning slate for عزا, a celebration gold for عرس, and the sky family
// for the rest. Every one clears 4.5:1 against white text, since that is
// exactly where these are used (badges, chips, card accents).
// The five occasion types the platform ships with. Only used by this
// migration step (data, not logic) — nothing outside db/ may branch on a
// type's name like this.
const OCCASION_TYPE_SEEDS = [
  {
    name: 'عرس',
    legacy_client_supported: 1,
    default_poster_url: DEFAULT_POSTER,
    icon: '💍',
    color: '#8f6a20',
    position: 1,
    creates_collision: 1,
    warns_others: 1,
    premoderate_messages: 0,
    show_congratulations_count: 1,
    show_followers_count: 1,
    show_views_count: 1,
    congratulations_label: 'تبريكات',
    default_badge_title: 'مبارك الفرح',
    reactions: REACTION_TYPES,
    fields: buildSeedFields({
      honorees: { label: 'العريس/العروس' },
      secondary_location_name: { is_visible: 0 },
      event_end_date: { is_visible: 0 }
    })
  },
  {
    name: 'عزا',
    legacy_client_supported: 0,
    default_poster_url: null,
    icon: '🕊️',
    color: '#475569',
    position: 2,
    creates_collision: 0,
    warns_others: 1,
    premoderate_messages: 1,
    show_congratulations_count: 1,
    show_followers_count: 0,
    show_views_count: 0,
    congratulations_label: 'تعازي',
    default_badge_title: null,
    reactions: [],
    fields: buildSeedFields({
      honorees: { label: 'المتوفَّى' },
      event_end_date: { is_visible: 1, is_required: 1 },
      secondary_location_name: { is_visible: 1, label: 'مكان إضافي (مثل بيت عزاء النساء)' },
      youth_party_date: { is_visible: 0 },
      dinner_time: { is_visible: 0 },
      audio_url: { is_visible: 0 },
      audio_title: { is_visible: 0 },
      poster_url: { is_visible: 1, is_required: 0 }
    })
  },
  {
    name: 'خطوبة',
    legacy_client_supported: 0,
    default_poster_url: DEFAULT_POSTER,
    icon: '💐',
    color: '#0369a1',
    position: 3,
    creates_collision: 1,
    warns_others: 1,
    premoderate_messages: 0,
    show_congratulations_count: 1,
    show_followers_count: 1,
    show_views_count: 1,
    congratulations_label: 'تبريكات',
    default_badge_title: 'مبارك الخطوبة',
    reactions: REACTION_TYPES,
    fields: buildSeedFields({
      honorees: { label: 'العريس/العروس' },
      secondary_location_name: { is_visible: 0 },
      event_end_date: { is_visible: 0 },
      youth_party_date: { is_visible: 0 }
    })
  },
  {
    name: 'نجاح',
    legacy_client_supported: 0,
    default_poster_url: DEFAULT_POSTER,
    icon: '🎓',
    color: '#0e7490',
    position: 4,
    creates_collision: 0,
    warns_others: 1,
    premoderate_messages: 0,
    show_congratulations_count: 1,
    show_followers_count: 1,
    show_views_count: 1,
    congratulations_label: 'تبريكات',
    default_badge_title: 'مبارك النجاح',
    reactions: REACTION_TYPES,
    fields: buildSeedFields({
      honorees: { label: 'الناجح' },
      secondary_location_name: { is_visible: 0 },
      event_end_date: { is_visible: 0 },
      youth_party_date: { is_visible: 0 }
    })
  },
  {
    name: 'حج وعمرة',
    legacy_client_supported: 0,
    default_poster_url: DEFAULT_POSTER,
    icon: '🕋',
    color: '#155e75',
    position: 5,
    creates_collision: 0,
    warns_others: 1,
    premoderate_messages: 0,
    show_congratulations_count: 1,
    show_followers_count: 1,
    show_views_count: 1,
    congratulations_label: 'تبريكات',
    default_badge_title: 'حج مبرور وذنب مغفور',
    reactions: REACTION_TYPES,
    fields: buildSeedFields({
      honorees: { label: 'الحاج/المعتمر' },
      event_date: { label: 'تاريخ الاستقبال' },
      secondary_location_name: { is_visible: 0 },
      event_end_date: { is_visible: 0 },
      youth_party_date: { is_visible: 0 }
    })
  }
];

// Coordinates as they were stored before the fix below. Kept here (not in
// constants.js, which now only holds the corrected values) purely as the
// "old value" side of the migration's WHERE clause.
const OLD_TOWN_COORDINATES = {
  'رهط': { lat: 31.3925, lng: 34.7554 },
  'اللقية': { lat: 31.3260, lng: 34.8720 },
  'تل السبع': { lat: 31.2483, lng: 34.8431 },
  'حورة': { lat: 31.2858, lng: 34.9312 },
  'شقيب السلام': { lat: 31.2062, lng: 34.8210 },
  'عرعرة النقب': { lat: 31.1890, lng: 35.0120 },
  'كسيفة': { lat: 31.2980, lng: 35.0310 },
  'القرى والتجمعات': { lat: 31.2600, lng: 34.8800 }
};

const steps = [
  {
    name: 'fix-town-coordinates-2026-08',
    async run(connection) {
      let totalAffected = 0;

      for (const [town, oldCoords] of Object.entries(OLD_TOWN_COORDINATES)) {
        // 'القرى والتجمعات' has no entry in the corrected map on purpose —
        // rows still carrying its old placeholder pin lose the pin instead.
        const newCoords = TOWN_COORDINATES[town] || null;

        const [result] = await connection.execute(
          `UPDATE events SET latitude = ?, longitude = ?
            WHERE town = ? AND latitude = ? AND longitude = ?`,
          [
            newCoords ? newCoords.lat : null,
            newCoords ? newCoords.lng : null,
            town,
            oldCoords.lat,
            oldCoords.lng
          ]
        );
        totalAffected += result.affectedRows;
      }

      logger.info(`[migrations] fix-town-coordinates-2026-08: ${totalAffected} row(s) updated.`);
    }
  },
  {
    name: 'add-occasion-type-columns-to-events-2026-08',
    async run(connection) {
      if (!(await columnExists(connection, 'events', 'occasion_type_id'))) {
        await connection.execute(
          'ALTER TABLE events ADD COLUMN occasion_type_id INT UNSIGNED DEFAULT NULL AFTER family_clan'
        );
      }
      if (!(await columnExists(connection, 'events', 'secondary_location_name'))) {
        await connection.execute(
          'ALTER TABLE events ADD COLUMN secondary_location_name TEXT DEFAULT NULL AFTER location_name'
        );
      }
      if (!(await columnExists(connection, 'events', 'event_end_date'))) {
        await connection.execute(
          'ALTER TABLE events ADD COLUMN event_end_date DATE DEFAULT NULL AFTER event_date'
        );
      }
      if (!(await indexExists(connection, 'events', 'idx_events_occasion_type'))) {
        await connection.execute('ALTER TABLE events ADD INDEX idx_events_occasion_type (occasion_type_id)');
      }
      if (!(await constraintExists(connection, 'events', 'fk_events_occasion_type'))) {
        await connection.execute(
          `ALTER TABLE events ADD CONSTRAINT fk_events_occasion_type
             FOREIGN KEY (occasion_type_id) REFERENCES occasion_types(id) ON DELETE RESTRICT`
        );
      }
      logger.info('[migrations] add-occasion-type-columns-to-events-2026-08: ensured columns, index and FK.');
    }
  },
  {
    name: 'seed-occasion-types-2026-08',
    async run(connection) {
      let created = 0;

      for (const seed of OCCASION_TYPE_SEEDS) {
        const [existingRows] = await connection.execute(
          'SELECT id FROM occasion_types WHERE name = ?',
          [seed.name]
        );
        // Never touch a type that already exists — an admin may have edited
        // it on purpose, and re-running the migration must not clobber that.
        if (existingRows.length) continue;

        const [result] = await connection.execute(
          `INSERT INTO occasion_types
             (name, icon, color, position, is_active, creates_collision, warns_others,
              premoderate_messages, show_congratulations_count, show_followers_count,
              show_views_count, congratulations_label, default_badge_title, default_poster_url,
              legacy_client_supported)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            seed.name, seed.icon, seed.color, seed.position,
            seed.creates_collision, seed.warns_others, seed.premoderate_messages,
            seed.show_congratulations_count, seed.show_followers_count, seed.show_views_count,
            seed.congratulations_label, seed.default_badge_title, seed.default_poster_url,
            seed.legacy_client_supported
          ]
        );
        const typeId = result.insertId;

        for (const field of seed.fields) {
          await connection.execute(
            `INSERT INTO occasion_type_fields (occasion_type_id, field_key, label, is_visible, is_required, position)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [typeId, field.field_key, field.label, field.is_visible, field.is_required, field.position]
          );
        }

        for (const reactionType of seed.reactions) {
          await connection.execute(
            'INSERT INTO occasion_type_reactions (occasion_type_id, reaction_type) VALUES (?, ?)',
            [typeId, reactionType]
          );
        }

        created += 1;
      }

      logger.info(`[migrations] seed-occasion-types-2026-08: ${created} type(s) created.`);
    }
  },
  {
    // A stock wedding photo on a death notice is the same harm as a wedding
    // word on one, so the default image belongs to the occasion type, not to
    // the platform. Adding the column and completing the seed happen together
    // here: the backfill is the column's own arrival, so it runs exactly once
    // and a later admin who deliberately clears a poster is never overruled.
    name: 'add-occasion-type-default-poster-2026-08',
    async run(connection) {
      if (await columnExists(connection, 'occasion_types', 'default_poster_url')) {
        logger.info('[migrations] add-occasion-type-default-poster-2026-08: already present.');
        return;
      }

      await connection.query('ALTER TABLE occasion_types ADD COLUMN default_poster_url TEXT DEFAULT NULL');

      let filled = 0;
      for (const seed of OCCASION_TYPE_SEEDS) {
        if (!seed.default_poster_url) continue;
        const [result] = await connection.execute(
          'UPDATE occasion_types SET default_poster_url = ? WHERE name = ? AND default_poster_url IS NULL',
          [seed.default_poster_url, seed.name]
        );
        filled += result.affectedRows;
      }
      logger.info(`[migrations] add-occasion-type-default-poster-2026-08: column added, ${filled} seeded type(s) filled.`);
    }
  },
  {
    name: 'backfill-events-occasion-type-2026-08',
    async run(connection) {
      // Every row that predates occasion types is a wedding — no exceptions,
      // no guessing. New rows always carry an explicit type going forward.
      const [weddingRows] = await connection.execute(
        "SELECT id FROM occasion_types WHERE name = 'عرس' LIMIT 1"
      );
      if (!weddingRows.length) {
        logger.warn('[migrations] backfill-events-occasion-type-2026-08: عرس type missing — skipped.');
        return;
      }

      const [result] = await connection.execute(
        'UPDATE events SET occasion_type_id = ? WHERE occasion_type_id IS NULL',
        [weddingRows[0].id]
      );
      logger.info(`[migrations] backfill-events-occasion-type-2026-08: ${result.affectedRows} row(s) backfilled.`);
    }
  },
  {
    name: 'backfill-event-honorees-2026-08',
    async run(connection) {
      const [result] = await connection.execute(
        `INSERT INTO event_honorees (event_id, name, role, position)
         SELECT e.id, e.groom_name, 'العريس/العروس', 0
           FROM events e
          WHERE NOT EXISTS (SELECT 1 FROM event_honorees eh WHERE eh.event_id = e.id)`
      );
      logger.info(`[migrations] backfill-event-honorees-2026-08: ${result.affectedRows} row(s) backfilled.`);
    }
  },
  {
    // Which occasion types a published APK can render is a fact about that
    // APK, not about display order. Deriving it from `position` — which a
    // super_admin reorders on purpose — meant that moving عزا to the top
    // would silently start feeding funerals to every phone that renders them
    // as "زفاف العريس", the exact harm this filter exists to prevent. So it
    // gets its own column, defaulting to 0: a newly created type is by
    // definition not understood by an already-published client, which is
    // precisely what the panel's standing notice tells the admin.
    name: 'add-occasion-type-legacy-support-flag-2026-08',
    async run(connection) {
      if (await columnExists(connection, 'occasion_types', 'legacy_client_supported')) {
        logger.info('[migrations] add-occasion-type-legacy-support-flag-2026-08: already present.');
        return;
      }

      await connection.query(
        'ALTER TABLE occasion_types ADD COLUMN legacy_client_supported TINYINT(1) NOT NULL DEFAULT 0'
      );

      let marked = 0;
      for (const seed of OCCASION_TYPE_SEEDS) {
        if (!seed.legacy_client_supported) continue;
        const [result] = await connection.execute(
          'UPDATE occasion_types SET legacy_client_supported = 1 WHERE name = ?',
          [seed.name]
        );
        marked += result.affectedRows;
      }
      logger.info(`[migrations] add-occasion-type-legacy-support-flag-2026-08: column added, ${marked} type(s) marked.`);
    }
  },
  {
    // schema.sql already carries this table's CREATE TABLE IF NOT EXISTS, so
    // on a fresh install this step always no-ops — kept anyway as the guarded
    // step every other schema addition in this file gets, and as the one
    // place that documents when the table arrived for an existing database.
    name: 'create-event-amendments-table-2026-08',
    async run(connection) {
      if (await tableExists(connection, 'event_amendments')) {
        logger.info('[migrations] create-event-amendments-table-2026-08: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE event_amendments (
          id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
          event_id       INT UNSIGNED NOT NULL,
          field          VARCHAR(60)  NOT NULL,
          old_value      TEXT         DEFAULT NULL,
          new_value      TEXT         DEFAULT NULL,
          changed_by     INT UNSIGNED DEFAULT NULL,
          classification ENUM('critical','cosmetic') NOT NULL,
          status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
          created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_event_amendments_event (event_id),
          KEY idx_event_amendments_status (status),
          CONSTRAINT fk_event_amendments_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
          CONSTRAINT fk_event_amendments_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-event-amendments-table-2026-08: table created.');
    }
  }
];

module.exports = steps;
