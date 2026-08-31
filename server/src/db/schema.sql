-- ==========================================================
-- Negev Events Platform — MySQL 8 schema
-- Charset: utf8mb4 (full Arabic + emoji support)
-- ==========================================================

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone_number  VARCHAR(20)  NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  pin_code      VARCHAR(255) NOT NULL,
  clan_town     VARCHAR(100) DEFAULT NULL,
  role          ENUM('user','admin','super_admin') NOT NULL DEFAULT 'user',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone_number),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Occasion types are runtime data, not an ENUM: a super_admin adds one from
-- the admin panel with no deploy and no migration. occasion_type_fields and
-- occasion_type_reactions cap what an admin controls per type — the field_key
-- values are only ever drawn from OCCASION_FIELDS in src/constants.js.
CREATE TABLE IF NOT EXISTS occasion_types (
  id                          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                        VARCHAR(60)  NOT NULL,
  icon                        VARCHAR(60)  NOT NULL,
  color                       VARCHAR(20)  NOT NULL,
  position                    INT          NOT NULL DEFAULT 0,
  is_active                   TINYINT(1)   NOT NULL DEFAULT 1,
  creates_collision           TINYINT(1)   NOT NULL DEFAULT 0,
  warns_others                TINYINT(1)   NOT NULL DEFAULT 0,
  premoderate_messages        TINYINT(1)   NOT NULL DEFAULT 0,
  show_congratulations_count  TINYINT(1)   NOT NULL DEFAULT 1,
  show_followers_count        TINYINT(1)   NOT NULL DEFAULT 1,
  show_views_count            TINYINT(1)   NOT NULL DEFAULT 1,
  congratulations_label       VARCHAR(40)  NOT NULL DEFAULT 'تبريكات',
  default_badge_title         VARCHAR(80)  DEFAULT NULL,
  default_poster_url          TEXT         DEFAULT NULL,
  legacy_client_supported     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at                  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_occasion_types_name (name),
  KEY idx_occasion_types_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS occasion_type_fields (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  occasion_type_id  INT UNSIGNED NOT NULL,
  field_key         VARCHAR(60)  NOT NULL,
  label             VARCHAR(80)  NOT NULL,
  is_visible        TINYINT(1)   NOT NULL DEFAULT 1,
  is_required       TINYINT(1)   NOT NULL DEFAULT 0,
  position           INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_occasion_type_fields (occasion_type_id, field_key),
  CONSTRAINT fk_occasion_type_fields_type FOREIGN KEY (occasion_type_id) REFERENCES occasion_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS occasion_type_reactions (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  occasion_type_id  INT UNSIGNED NOT NULL,
  reaction_type     ENUM('coffee','horse','fireworks','rose','hand') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_occasion_type_reactions (occasion_type_id, reaction_type),
  CONSTRAINT fk_occasion_type_reactions_type FOREIGN KEY (occasion_type_id) REFERENCES occasion_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title            VARCHAR(255) NOT NULL,
  groom_name       VARCHAR(150) NOT NULL,
  family_clan      VARCHAR(150) NOT NULL,
  occasion_type_id INT UNSIGNED DEFAULT NULL,
  town             VARCHAR(100) NOT NULL,
  location_name    TEXT         NOT NULL,
  secondary_location_name TEXT  DEFAULT NULL,
  latitude         DECIMAL(10,7) DEFAULT NULL,
  longitude        DECIMAL(10,7) DEFAULT NULL,
  event_date       DATE         NOT NULL,
  event_end_date   DATE         DEFAULT NULL,
  youth_party_date DATE         DEFAULT NULL,
  dinner_time      VARCHAR(100) NOT NULL DEFAULT 'الساعة 8:00 مساءً',
  poster_url       TEXT,
  audio_url        TEXT,
  audio_title      VARCHAR(200) DEFAULT NULL,
  host_phone       VARCHAR(30)  DEFAULT NULL,
  status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  views_count      INT UNSIGNED NOT NULL DEFAULT 0,
  created_by       INT UNSIGNED DEFAULT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_date (event_date),
  KEY idx_events_town (town),
  KEY idx_events_status (status),
  KEY idx_events_status_date (status, event_date),
  KEY idx_events_groom (groom_name),
  KEY idx_events_clan (family_clan),
  KEY idx_events_occasion_type (occasion_type_id),
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_events_occasion_type FOREIGN KEY (occasion_type_id) REFERENCES occasion_types(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Honorees are a 1..N relation so search can match every name on an event
-- (e.g. the fifth pilgrim on a حج wedge, not just whichever name lived on
-- events.groom_name before this table existed).
CREATE TABLE IF NOT EXISTS event_honorees (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id   INT UNSIGNED NOT NULL,
  name       VARCHAR(150) NOT NULL,
  role       VARCHAR(60)  DEFAULT NULL,
  position   INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_event_honorees_event (event_id),
  KEY idx_event_honorees_name (name),
  CONSTRAINT fk_event_honorees_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per changed field, not per edit: an admin reads "التاريخ تغيّر من
-- X إلى Y", not a compressed diff blob. Values are stored as text so the log
-- stays readable after the row underneath changes again. Also the substrate
-- a later public "amendment announcement" feature reuses without a rewrite
-- (#20 step 4) — this step only owns the internal audit read.
CREATE TABLE IF NOT EXISTS event_amendments (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "ذكّرني" is a follow, never an RSVP: no attendance is implied and no "لن
-- أحضر" exists anywhere in this domain. UNIQUE (user_id, event_id) is what
-- makes toggling the button on twice a no-op instead of a duplicate row.
CREATE TABLE IF NOT EXISTS event_reminders (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  event_id   INT UNSIGNED NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_reminders (user_id, event_id),
  KEY idx_event_reminders_event (event_id),
  CONSTRAINT fk_event_reminders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_reminders_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The public trace of a critical date amendment, written only once an admin
-- approves it — never before. is_current = 1 marks the one announcement shown
-- per event; publishing a newer one flips the older row's flag off, but
-- neither row is ever deleted, so the table stays a full audit trail (#20
-- step 7).
CREATE TABLE IF NOT EXISTS event_announcements (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per person notified: a follower or the event's owner, never the
-- person who made the edit themself. delivered_at stays NULL until FCM
-- delivery lands (#19 — see README) — this table only ever records who
-- earned a notification and when, not whether a device actually received it.
CREATE TABLE IF NOT EXISTS notifications (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nokoot_ledger (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED  NOT NULL,
  recipient_name VARCHAR(150)  NOT NULL,
  clan_town      VARCHAR(100)  DEFAULT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  currency       VARCHAR(10)   NOT NULL DEFAULT 'ILS',
  occasion_type  VARCHAR(50)   NOT NULL DEFAULT 'عرس',
  event_date     DATE          NOT NULL,
  notes          TEXT,
  is_settled     TINYINT(1)    NOT NULL DEFAULT 0,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nokoot_user (user_id),
  KEY idx_nokoot_user_date (user_id, event_date),
  CONSTRAINT fk_nokoot_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reactions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id        INT UNSIGNED NOT NULL,
  reaction_type   ENUM('coffee','horse','fireworks','rose','hand') NOT NULL,
  user_identifier VARCHAR(100) DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reactions_event (event_id),
  KEY idx_reactions_event_type (event_id, reaction_type),
  CONSTRAINT fk_reactions_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- status defaults to 'approved' so a fresh install (and the pre-#20 step 5
-- rows an ALTER backfills) never goes silent; only a type with
-- premoderate_messages on (عزا) ever inserts 'pending'. user_id is the
-- accountability #20 step 5 exists for — NULL only for rows written before
-- congratulating required a login.
CREATE TABLE IF NOT EXISTS congratulations (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id      INT UNSIGNED NOT NULL,
  sender_name   VARCHAR(120) NOT NULL,
  badge_title   VARCHAR(80)  NOT NULL DEFAULT 'مبارك الفرح',
  message       TEXT         NOT NULL,
  sticker_url   TEXT,
  status        ENUM('pending','approved','hidden') NOT NULL DEFAULT 'approved',
  user_id       INT UNSIGNED DEFAULT NULL,
  reports_count INT UNSIGNED NOT NULL DEFAULT 0,
  moderated_by  INT UNSIGNED DEFAULT NULL,
  moderated_at  TIMESTAMP    NULL DEFAULT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_congrats_event (event_id),
  KEY idx_congrats_status (status),
  CONSTRAINT fk_congrats_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_congrats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_congrats_moderator FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per (congratulation, reporter) — the UNIQUE key is what stops one
-- person reporting the same message ten times to force it into hiding alone.
CREATE TABLE IF NOT EXISTS congratulation_reports (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  congratulation_id INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_congrats_reports (congratulation_id, user_id),
  KEY idx_congrats_reports_congrats (congratulation_id),
  CONSTRAINT fk_congrats_reports_congrats FOREIGN KEY (congratulation_id) REFERENCES congratulations(id) ON DELETE CASCADE,
  CONSTRAINT fk_congrats_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title      VARCHAR(200) NOT NULL,
  clan       VARCHAR(150) DEFAULT NULL,
  town       VARCHAR(100) DEFAULT NULL,
  image      TEXT,
  is_live    TINYINT(1)   NOT NULL DEFAULT 0,
  event_id   INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stories_live (is_live),
  CONSTRAINT fk_stories_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcasts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title      VARCHAR(200) NOT NULL,
  message    TEXT         NOT NULL,
  sent_by    INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_broadcasts_created (created_at),
  CONSTRAINT fk_broadcasts_sender FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
