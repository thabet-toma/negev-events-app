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
const { TOWNS, TOWN_COORDINATES, REACTION_TYPES, OCCASION_FIELDS, DEFAULT_POSTER } = require('../constants');

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
    tone: 'festive',
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
    tone: 'solemn',
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
    tone: 'festive',
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
    tone: 'festive',
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
    tone: 'festive',
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
              legacy_client_supported, tone)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            seed.name, seed.icon, seed.color, seed.position,
            seed.creates_collision, seed.warns_others, seed.premoderate_messages,
            seed.show_congratulations_count, seed.show_followers_count, seed.show_views_count,
            seed.congratulations_label, seed.default_badge_title, seed.default_poster_url,
            seed.legacy_client_supported, seed.tone
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
    // النغمة عرضٌ لا منطق، لكنها كانت تُستنتج في الواجهة من تسمية التبريكات —
    // فإعادةُ تسميةٍ من اللوحة كانت تقلب بطاقة النعي إلى بطاقة فرح بصمت.
    name: 'add-occasion-type-tone-2026-08',
    async run(connection) {
      if (await columnExists(connection, 'occasion_types', 'tone')) {
        logger.info('[migrations] add-occasion-type-tone-2026-08: already present.');
        return;
      }

      await connection.query(
        "ALTER TABLE occasion_types ADD COLUMN tone VARCHAR(20) NOT NULL DEFAULT 'festive'"
      );

      let marked = 0;
      for (const seed of OCCASION_TYPE_SEEDS) {
        if (seed.tone === 'festive') continue;
        const [result] = await connection.execute(
          'UPDATE occasion_types SET tone = ? WHERE name = ?',
          [seed.tone, seed.name]
        );
        marked += result.affectedRows;
      }
      logger.info(`[migrations] add-occasion-type-tone-2026-08: column added, ${marked} type(s) marked solemn.`);
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
  },
  {
    // Additive only, per #20 step 5: sender_name/badge_title/message are
    // untouched — an already-published APK still reads them. status defaults
    // to 'approved' so every existing row stays visible; only a fresh insert
    // on a premoderated type ever lands on 'pending'.
    name: 'add-congratulation-moderation-columns-2026-08',
    async run(connection) {
      if (!(await columnExists(connection, 'congratulations', 'status'))) {
        await connection.query(
          "ALTER TABLE congratulations ADD COLUMN status ENUM('pending','approved','hidden') NOT NULL DEFAULT 'approved' AFTER sticker_url"
        );
      }
      if (!(await columnExists(connection, 'congratulations', 'user_id'))) {
        await connection.query(
          'ALTER TABLE congratulations ADD COLUMN user_id INT UNSIGNED DEFAULT NULL AFTER status'
        );
      }
      if (!(await columnExists(connection, 'congratulations', 'reports_count'))) {
        await connection.query(
          'ALTER TABLE congratulations ADD COLUMN reports_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER user_id'
        );
      }
      if (!(await columnExists(connection, 'congratulations', 'moderated_by'))) {
        await connection.query(
          'ALTER TABLE congratulations ADD COLUMN moderated_by INT UNSIGNED DEFAULT NULL AFTER reports_count'
        );
      }
      if (!(await columnExists(connection, 'congratulations', 'moderated_at'))) {
        await connection.query(
          'ALTER TABLE congratulations ADD COLUMN moderated_at TIMESTAMP NULL DEFAULT NULL AFTER moderated_by'
        );
      }
      if (!(await indexExists(connection, 'congratulations', 'idx_congrats_status'))) {
        await connection.query('ALTER TABLE congratulations ADD INDEX idx_congrats_status (status)');
      }
      if (!(await constraintExists(connection, 'congratulations', 'fk_congrats_user'))) {
        await connection.query(
          `ALTER TABLE congratulations ADD CONSTRAINT fk_congrats_user
             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`
        );
      }
      if (!(await constraintExists(connection, 'congratulations', 'fk_congrats_moderator'))) {
        await connection.query(
          `ALTER TABLE congratulations ADD CONSTRAINT fk_congrats_moderator
             FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL`
        );
      }
      logger.info('[migrations] add-congratulation-moderation-columns-2026-08: ensured columns, index and FKs.');
    }
  },
  {
    // schema.sql already carries this table's CREATE TABLE IF NOT EXISTS, so
    // on a fresh install this step always no-ops — same guarded pattern as
    // create-event-amendments-table-2026-08 above.
    name: 'create-congratulation-reports-table-2026-08',
    async run(connection) {
      if (await tableExists(connection, 'congratulation_reports')) {
        logger.info('[migrations] create-congratulation-reports-table-2026-08: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE congratulation_reports (
          id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
          congratulation_id INT UNSIGNED NOT NULL,
          user_id           INT UNSIGNED NOT NULL,
          created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_congrats_reports (congratulation_id, user_id),
          KEY idx_congrats_reports_congrats (congratulation_id),
          CONSTRAINT fk_congrats_reports_congrats FOREIGN KEY (congratulation_id) REFERENCES congratulations(id) ON DELETE CASCADE,
          CONSTRAINT fk_congrats_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-congratulation-reports-table-2026-08: table created.');
    }
  },
  {
    // schema.sql already carries this table's CREATE TABLE IF NOT EXISTS, so
    // on a fresh install this step always no-ops — same guarded pattern as
    // every table addition above.
    name: 'create-event-reminders-table-2026-08',
    async run(connection) {
      if (await tableExists(connection, 'event_reminders')) {
        logger.info('[migrations] create-event-reminders-table-2026-08: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE event_reminders (
          id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id    INT UNSIGNED NOT NULL,
          event_id   INT UNSIGNED NOT NULL,
          created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_event_reminders (user_id, event_id),
          KEY idx_event_reminders_event (event_id),
          CONSTRAINT fk_event_reminders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_event_reminders_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-event-reminders-table-2026-08: table created.');
    }
  },
  {
    name: 'create-event-announcements-table-2026-08',
    async run(connection) {
      if (await tableExists(connection, 'event_announcements')) {
        logger.info('[migrations] create-event-announcements-table-2026-08: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE event_announcements (
          id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
          event_id     INT UNSIGNED NOT NULL,
          amendment_id INT UNSIGNED DEFAULT NULL,
          old_value    TEXT         DEFAULT NULL,
          new_value    TEXT         DEFAULT NULL,
          published_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          is_current   TINYINT(1)   NOT NULL DEFAULT 1,
          PRIMARY KEY (id),
          KEY idx_event_announcements_event (event_id),
          KEY idx_event_announcements_current (event_id, is_current),
          CONSTRAINT fk_event_announcements_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
          CONSTRAINT fk_event_announcements_amendment FOREIGN KEY (amendment_id) REFERENCES event_amendments(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-event-announcements-table-2026-08: table created.');
    }
  },
  {
    name: 'create-notifications-table-2026-08',
    async run(connection) {
      if (await tableExists(connection, 'notifications')) {
        logger.info('[migrations] create-notifications-table-2026-08: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE notifications (
          id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id      INT UNSIGNED NOT NULL,
          event_id     INT UNSIGNED DEFAULT NULL,
          type         VARCHAR(40)  NOT NULL,
          title        VARCHAR(200) NOT NULL,
          body         TEXT         NOT NULL,
          is_read      TINYINT(1)   NOT NULL DEFAULT 0,
          created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          delivered_at TIMESTAMP    NULL DEFAULT NULL,
          PRIMARY KEY (id),
          KEY idx_notifications_user (user_id),
          KEY idx_notifications_user_read (user_id, is_read),
          CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_notifications_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-notifications-table-2026-08: table created.');
    }
  },
  {
    // Additive only (#20 step 8): title/clan/town/image/is_live/event_id are
    // untouched, so an already-published client reading GET /api/stories
    // keeps working unmodified.
    name: 'add-story-ad-columns-2026-08',
    async run(connection) {
      if (!(await columnExists(connection, 'stories', 'expires_at'))) {
        await connection.query('ALTER TABLE stories ADD COLUMN expires_at DATETIME DEFAULT NULL');
      }
      if (!(await columnExists(connection, 'stories', 'advertiser_name'))) {
        await connection.query('ALTER TABLE stories ADD COLUMN advertiser_name VARCHAR(150) DEFAULT NULL');
      }
      if (!(await columnExists(connection, 'stories', 'is_ad'))) {
        await connection.query('ALTER TABLE stories ADD COLUMN is_ad TINYINT(1) NOT NULL DEFAULT 0');
      }
      if (!(await columnExists(connection, 'stories', 'target_url'))) {
        await connection.query('ALTER TABLE stories ADD COLUMN target_url TEXT DEFAULT NULL');
      }
      if (!(await columnExists(connection, 'stories', 'slide_duration_seconds'))) {
        await connection.query('ALTER TABLE stories ADD COLUMN slide_duration_seconds INT UNSIGNED NOT NULL DEFAULT 5');
      }
      if (!(await indexExists(connection, 'stories', 'idx_stories_expires'))) {
        await connection.query('ALTER TABLE stories ADD INDEX idx_stories_expires (expires_at)');
      }
      logger.info('[migrations] add-story-ad-columns-2026-08: ensured columns and index.');
    }
  },
  {
    // schema.sql already carries this table's CREATE TABLE IF NOT EXISTS, so
    // on a fresh install this step always no-ops — same guarded pattern as
    // every table addition above. See schema.sql for why viewer_key (a
    // STORED generated column) is what the UNIQUE key is built on, not a
    // raw (user_id, device_id) pair.
    name: 'create-story-views-table-2026-08',
    async run(connection) {
      if (await tableExists(connection, 'story_views')) {
        logger.info('[migrations] create-story-views-table-2026-08: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE story_views (
          id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
          story_id    INT UNSIGNED NOT NULL,
          user_id     INT UNSIGNED DEFAULT NULL,
          device_id   VARCHAR(100) DEFAULT NULL,
          viewer_town VARCHAR(100) DEFAULT NULL,
          viewed_on   DATE         NOT NULL,
          viewer_key  VARCHAR(140) GENERATED ALWAYS AS (COALESCE(CONCAT('u:', user_id), CONCAT('d:', device_id))) STORED,
          created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_story_views_identity (story_id, viewer_key, viewed_on),
          KEY idx_story_views_story (story_id),
          CONSTRAINT fk_story_views_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-story-views-table-2026-08: table created.');
    }
  },
  {
    name: 'create-story-clicks-table-2026-08',
    async run(connection) {
      if (await tableExists(connection, 'story_clicks')) {
        logger.info('[migrations] create-story-clicks-table-2026-08: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE story_clicks (
          id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
          story_id   INT UNSIGNED NOT NULL,
          user_id    INT UNSIGNED DEFAULT NULL,
          device_id  VARCHAR(100) DEFAULT NULL,
          created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_story_clicks_story (story_id),
          CONSTRAINT fk_story_clicks_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
          CONSTRAINT fk_story_clicks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-story-clicks-table-2026-08: table created.');
    }
  },
  {
    name: 'create-story-reports-table-2026-08',
    async run(connection) {
      if (await tableExists(connection, 'story_reports')) {
        logger.info('[migrations] create-story-reports-table-2026-08: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE story_reports (
          id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
          story_id   INT UNSIGNED NOT NULL,
          user_id    INT UNSIGNED NOT NULL,
          created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_story_reports (story_id, user_id),
          KEY idx_story_reports_story (story_id),
          CONSTRAINT fk_story_reports_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
          CONSTRAINT fk_story_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-story-reports-table-2026-08: table created.');
    }
  },
  {
    // admin_towns is deliberately separate from users.clan_town — that
    // column is a self-reported profile fact, so making it a permission
    // would turn editing one's own profile into a privilege escalation
    // (services-directory spec, decision #22). Seeding must fire exactly
    // once, the first time this table has no rows at all — NOT gated on
    // "did this step's own CREATE TABLE just run", because schema.sql also
    // carries `CREATE TABLE IF NOT EXISTS admin_towns` (every table added in
    // this change does, per the project's schema.sql-for-fresh-installs +
    // dataMigrations-for-upgrades convention) and migrate.js always applies
    // schema.sql before this file's steps — so by the time this step runs,
    // tableExists() is already true even on the very first migration that
    // ever introduces the table, and a gate on table creation would silently
    // skip seeding forever. Gating on row count instead seeds an existing
    // admin with exactly what they own today on the one run that matters,
    // and never re-seeds afterward once rows exist.
    name: 'create-admin-towns-2026-09',
    async run(connection) {
      if (!(await tableExists(connection, 'admin_towns'))) {
        await connection.query(`
          CREATE TABLE admin_towns (
            id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id INT UNSIGNED NOT NULL,
            town    VARCHAR(100) NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_admin_towns (user_id, town),
            CONSTRAINT fk_admin_towns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      }

      const [[{ cnt }]] = await connection.execute('SELECT COUNT(*) AS cnt FROM admin_towns');
      if (cnt > 0) {
        logger.info(`[migrations] create-admin-towns-2026-09: already present with ${cnt} row(s) — no seeding.`);
        return;
      }

      const [adminRows] = await connection.execute(
        "SELECT id FROM users WHERE role IN ('admin', 'super_admin')"
      );

      let seeded = 0;
      if (adminRows.length) {
        const placeholders = [];
        const values = [];
        for (const admin of adminRows) {
          for (const town of TOWNS) {
            placeholders.push('(?, ?)');
            values.push(admin.id, town);
          }
        }
        const [result] = await connection.execute(
          `INSERT IGNORE INTO admin_towns (user_id, town) VALUES ${placeholders.join(', ')}`,
          values
        );
        seeded = result.affectedRows;
      }

      logger.info(`[migrations] create-admin-towns-2026-09: table ensured, ${seeded} row(s) seeded for ${adminRows.length} existing admin(s).`);
    }
  },
  {
    // The village is a real place, unlike the catch-all bucket it sits
    // under: no rows are seeded here — villages are product-owner data, and
    // a village without real coordinates would reproduce the pin bug the
    // catch-all town has today (services-directory spec, decision #23).
    name: 'create-villages-2026-09',
    async run(connection) {
      if (await tableExists(connection, 'villages')) {
        logger.info('[migrations] create-villages-2026-09: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE villages (
          id        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
          name      VARCHAR(100)  NOT NULL,
          latitude  DECIMAL(10,7) NOT NULL,
          longitude DECIMAL(10,7) NOT NULL,
          position  INT           NOT NULL DEFAULT 0,
          is_active TINYINT(1)    NOT NULL DEFAULT 1,
          PRIMARY KEY (id),
          UNIQUE KEY uq_villages_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      logger.info('[migrations] create-villages-2026-09: table created, no villages seeded.');
    }
  },
  {
    // Existing rows stay NULL — no automatic derivation of which village an
    // already-published event belongs to (services-directory spec, decision
    // #23, mirroring the no-guessing rule #13 already set for town pins).
    name: 'add-events-village-id-2026-09',
    async run(connection) {
      if (!(await columnExists(connection, 'events', 'village_id'))) {
        await connection.execute(
          'ALTER TABLE events ADD COLUMN village_id INT UNSIGNED NULL AFTER town'
        );
      }
      if (!(await indexExists(connection, 'events', 'idx_events_village'))) {
        await connection.execute('ALTER TABLE events ADD INDEX idx_events_village (village_id)');
      }
      if (!(await constraintExists(connection, 'events', 'fk_events_village'))) {
        await connection.execute(
          `ALTER TABLE events ADD CONSTRAINT fk_events_village
             FOREIGN KEY (village_id) REFERENCES villages(id) ON DELETE RESTRICT`
        );
      }
      logger.info('[migrations] add-events-village-id-2026-09: ensured column, index and FK. Existing rows stay NULL.');
    }
  },
  {
    // The artist is a field of the occasion type, not a code branch: two
    // extra OCCASION_FIELDS keys, visible on عرس/خطوبة and hidden elsewhere
    // through occasion_type_fields — the same mechanism every other field
    // already uses, no special-casing. Guarded on both the ALTER (columnExists)
    // and the insert (an explicit per-type/per-key existence check, plus
    // INSERT IGNORE against the table's own unique key) so a re-run inserts
    // nothing.
    name: 'add-events-artist-fields-2026-09',
    async run(connection) {
      if (!(await columnExists(connection, 'events', 'artist_name'))) {
        await connection.execute(
          'ALTER TABLE events ADD COLUMN artist_name VARCHAR(150) NULL AFTER audio_title'
        );
      }
      if (!(await columnExists(connection, 'events', 'artist_image_url'))) {
        await connection.execute(
          'ALTER TABLE events ADD COLUMN artist_image_url TEXT NULL AFTER artist_name'
        );
      }

      const artistFields = OCCASION_FIELDS.filter(
        field => field.key === 'artist_name' || field.key === 'artist_image_url'
      );

      const [typeRows] = await connection.execute('SELECT id, name FROM occasion_types');

      let inserted = 0;
      for (const type of typeRows) {
        const [existingRows] = await connection.execute(
          'SELECT field_key FROM occasion_type_fields WHERE occasion_type_id = ? AND field_key IN (?, ?)',
          [type.id, 'artist_name', 'artist_image_url']
        );
        const existingKeys = new Set(existingRows.map(row => row.field_key));

        const [maxPosRows] = await connection.execute(
          'SELECT COALESCE(MAX(position), 0) AS maxPos FROM occasion_type_fields WHERE occasion_type_id = ?',
          [type.id]
        );
        let nextPosition = maxPosRows[0].maxPos + 1;

        const isVisible = (type.name === 'عرس' || type.name === 'خطوبة') ? 1 : 0;

        for (const field of artistFields) {
          if (existingKeys.has(field.key)) continue;
          await connection.execute(
            `INSERT IGNORE INTO occasion_type_fields (occasion_type_id, field_key, label, is_visible, is_required, position)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [type.id, field.key, field.label, isVisible, 0, nextPosition]
          );
          nextPosition += 1;
          inserted += 1;
        }
      }

      logger.info(`[migrations] add-events-artist-fields-2026-09: ensured columns; ${inserted} occasion_type_fields row(s) inserted across ${typeRows.length} type(s).`);
    }
  },
  {
    // The three service-directory tables, in dependency order. No categories
    // seeded here — a super_admin adds them from the admin panel, same as
    // occasion types (services-directory spec).
    name: 'create-service-directory-2026-09',
    async run(connection) {
      if (!(await tableExists(connection, 'service_categories'))) {
        await connection.query(`
          CREATE TABLE service_categories (
            id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
            name      VARCHAR(60)  NOT NULL,
            icon      VARCHAR(60)  NOT NULL,
            color     VARCHAR(20)  NOT NULL,
            position  INT          NOT NULL DEFAULT 0,
            is_active TINYINT(1)   NOT NULL DEFAULT 1,
            PRIMARY KEY (id),
            UNIQUE KEY uq_service_categories_name (name)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      }

      if (!(await tableExists(connection, 'service_providers'))) {
        await connection.query(`
          CREATE TABLE service_providers (
            id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
            category_id     INT UNSIGNED NOT NULL,
            name            VARCHAR(150) NOT NULL,
            phone           VARCHAR(30)  NOT NULL,
            description     TEXT         DEFAULT NULL,
            image_url       TEXT         DEFAULT NULL,
            is_active       TINYINT(1)   NOT NULL DEFAULT 1,
            consent_at      TIMESTAMP    NOT NULL,
            consent_by      INT UNSIGNED DEFAULT NULL,
            consent_channel VARCHAR(20)  NOT NULL,
            created_by      INT UNSIGNED DEFAULT NULL,
            created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_service_providers_category (category_id),
            CONSTRAINT fk_service_providers_category FOREIGN KEY (category_id)
              REFERENCES service_categories(id) ON DELETE RESTRICT,
            CONSTRAINT fk_service_providers_consent_by FOREIGN KEY (consent_by)
              REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT fk_service_providers_creator FOREIGN KEY (created_by)
              REFERENCES users(id) ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      }

      if (!(await tableExists(connection, 'service_provider_towns'))) {
        await connection.query(`
          CREATE TABLE service_provider_towns (
            id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
            provider_id INT UNSIGNED NOT NULL,
            town        VARCHAR(100) NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_service_provider_towns (provider_id, town),
            CONSTRAINT fk_spt_provider FOREIGN KEY (provider_id)
              REFERENCES service_providers(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      }

      logger.info('[migrations] create-service-directory-2026-09: ensured service_categories, service_providers, service_provider_towns. No categories seeded.');
    }
  },
  {
    // The two behavioural-analytics tables (issue #44), in dependency order.
    // See schema.sql for why analytics_events.user_id carries a real
    // ON DELETE CASCADE FK (unlike story_views.user_id) and why
    // analytics_daily_counters.content_town is NOT NULL DEFAULT '' rather
    // than NULL.
    name: 'create-analytics-events-2026-09',
    async run(connection) {
      if (!(await tableExists(connection, 'analytics_events'))) {
        await connection.query(`
          CREATE TABLE analytics_events (
            id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
            event_name   VARCHAR(60)  NOT NULL,
            user_id      INT UNSIGNED DEFAULT NULL,
            device_id    VARCHAR(100) DEFAULT NULL,
            platform     VARCHAR(20)  NOT NULL,
            app_version  VARCHAR(20)  DEFAULT NULL,
            content_town VARCHAR(100) DEFAULT NULL,
            viewer_key   VARCHAR(140) GENERATED ALWAYS AS (COALESCE(CONCAT('u:', user_id), CONCAT('d:', device_id))) VIRTUAL,
            created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_analytics_events_created (created_at),
            KEY idx_analytics_events_name (event_name),
            KEY idx_analytics_events_viewer (viewer_key),
            CONSTRAINT fk_analytics_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      }

      if (!(await tableExists(connection, 'analytics_daily_counters'))) {
        await connection.query(`
          CREATE TABLE analytics_daily_counters (
            id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
            day          DATE         NOT NULL,
            event_name   VARCHAR(60)  NOT NULL,
            platform     VARCHAR(20)  NOT NULL,
            content_town VARCHAR(100) NOT NULL DEFAULT '',
            count        INT UNSIGNED NOT NULL DEFAULT 0,
            created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_analytics_daily_counters (day, event_name, platform, content_town)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      }

      logger.info('[migrations] create-analytics-events-2026-09: ensured analytics_events, analytics_daily_counters.');
    }
  },
  {
    // The opt-out switch (issue #44, privacy layer part 2). Default 0 so
    // every existing user stays opted in — the same "unaffected until they
    // act" posture every other additive column in this file takes.
    name: 'add-users-analytics-opt-out-2026-09',
    async run(connection) {
      if (await columnExists(connection, 'users', 'analytics_opt_out')) {
        logger.info('[migrations] add-users-analytics-opt-out-2026-09: already present.');
        return;
      }

      await connection.query(
        'ALTER TABLE users ADD COLUMN analytics_opt_out TINYINT(1) NOT NULL DEFAULT 0'
      );
      logger.info('[migrations] add-users-analytics-opt-out-2026-09: column added.');
    }
  },
  {
    // The access/erasure request queue (issue #44, privacy layer part 3).
    // schema.sql already carries this table's CREATE TABLE IF NOT EXISTS, so
    // on a fresh install this step always no-ops — same guarded pattern as
    // every table addition above.
    name: 'create-privacy-requests-2026-09',
    async run(connection) {
      if (await tableExists(connection, 'privacy_requests')) {
        logger.info('[migrations] create-privacy-requests-2026-09: already present.');
        return;
      }

      await connection.query(`
        CREATE TABLE privacy_requests (
          id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id      INT UNSIGNED NOT NULL,
          request_type ENUM('access','erasure') NOT NULL,
          status       ENUM('pending','completed') NOT NULL DEFAULT 'pending',
          created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          handled_at   TIMESTAMP    NULL DEFAULT NULL,
          handled_by   INT UNSIGNED DEFAULT NULL,
          PRIMARY KEY (id),
          KEY idx_privacy_requests_status (status),
          KEY idx_privacy_requests_user (user_id),
          CONSTRAINT fk_privacy_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_privacy_requests_handler FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      logger.info('[migrations] create-privacy-requests-2026-09: table created.');
    }
  }
];

module.exports = steps;
