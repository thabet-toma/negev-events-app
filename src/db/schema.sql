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

CREATE TABLE IF NOT EXISTS events (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title            VARCHAR(255) NOT NULL,
  groom_name       VARCHAR(150) NOT NULL,
  family_clan      VARCHAR(150) NOT NULL,
  town             VARCHAR(100) NOT NULL,
  location_name    TEXT         NOT NULL,
  latitude         DECIMAL(10,7) DEFAULT NULL,
  longitude        DECIMAL(10,7) DEFAULT NULL,
  event_date       DATE         NOT NULL,
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
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS congratulations (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id    INT UNSIGNED NOT NULL,
  sender_name VARCHAR(120) NOT NULL,
  badge_title VARCHAR(80)  NOT NULL DEFAULT 'مبارك الفرح',
  message     TEXT         NOT NULL,
  sticker_url TEXT,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_congrats_event (event_id),
  CONSTRAINT fk_congrats_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
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
