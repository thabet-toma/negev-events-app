'use strict';

/**
 * Idempotent seeder: bootstrap super-admin, demo events, live stories.
 * Existing rows are never overwritten.
 *
 *   npm run db:seed
 */

const bcrypt = require('bcryptjs');
const db = require('./pool');
const config = require('../config');
const logger = require('../utils/logger');
const { TOWN_COORDINATES } = require('../constants');

const DEMO_EVENTS = [
  {
    title: 'زفاف الشاب الخلوق عيسى أبو معمر',
    groom_name: 'عيسى نايف أبو معمر',
    family_clan: 'عشيرة أبو معمر',
    town: 'رهط',
    location_name: 'ديوان آل أبو معمر - رهط الحي 17 بالقرب من الدوار الرئيسي',
    event_date: '2026-09-04',
    youth_party_date: '2026-09-03',
    dinner_time: 'الساعة 7:30 مساءً',
    poster_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80',
    audio_url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
    audio_title: 'شيلة الفرح والترحيب بضيوف آل أبو معمر',
    host_phone: '0501234567'
  },
  {
    title: 'أفراح آل الأطرش - زفاف العريس طارق',
    groom_name: 'طارق سالم الأطرش',
    family_clan: 'عائلة الأطرش',
    town: 'حورة',
    location_name: 'صالة وميدان السلام - حورة مدخل 2 بجانب الملعب البلدي',
    event_date: '2026-09-11',
    youth_party_date: '2026-09-10',
    dinner_time: 'الساعة 8:00 مساءً',
    poster_url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&auto=format&fit=crop&q=80',
    audio_url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
    audio_title: 'قصيدة فخر وترحيب بالنشامى والحضور',
    host_phone: '0529876543'
  },
  {
    title: 'زفاف العريس محمود أبو سبيتان',
    groom_name: 'محمود خليل أبو سبيتان',
    family_clan: 'عشيرة أبو سبيتان',
    town: 'تل السبع',
    location_name: 'ديوان آل أبو سبيتان - تل السبع الحي الغربي',
    event_date: '2026-09-18',
    youth_party_date: '2026-09-17',
    dinner_time: 'الساعة 7:00 مساءً',
    poster_url: 'https://images.unsplash.com/photo-1544078751-58fee2d8a03b?w=800&auto=format&fit=crop&q=80',
    audio_url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
    audio_title: 'سامر ودحة الفرح لآل أبو سبيتان',
    host_phone: '0543210987'
  },
  {
    title: 'أفراح آل القريناوي - زفاف العريس إبراهيم',
    groom_name: 'إبراهيم سامي القريناوي',
    family_clan: 'عائلة القريناوي',
    town: 'رهط',
    location_name: 'قاعة وميدان النور - رهط المنطقة الجنوبية',
    event_date: '2026-09-25',
    youth_party_date: '2026-09-24',
    dinner_time: 'الساعة 8:30 مساءً',
    poster_url: 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=800&auto=format&fit=crop&q=80',
    audio_url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
    audio_title: 'شيلة ترحيبية خاصة بالضيوف الكرام',
    host_phone: '0507654321'
  },
  {
    title: 'زفاف العريس سلمان أبو عصا',
    groom_name: 'سلمان جمعة أبو عصا',
    family_clan: 'عشيرة أبو عصا',
    town: 'شقيب السلام',
    location_name: 'ديوان أبو عصا - شقيب السلام بالقرب من المركز الجماهيري',
    event_date: '2026-10-02',
    youth_party_date: '2026-10-01',
    dinner_time: 'الساعة 7:30 مساءً',
    poster_url: 'https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=800&auto=format&fit=crop&q=80',
    audio_url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
    audio_title: 'أهزوجة ترحيب وفرح',
    host_phone: '0535551234'
  }
];

const DEMO_STORIES = [
  {
    title: 'دحة الليلة في رهط',
    clan: 'آل أبو معمر',
    town: 'رهط',
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=500&auto=format&fit=crop&q=80',
    is_live: 1
  },
  {
    title: 'سهرة الشباب - حورة',
    clan: 'عائلة الأطرش',
    town: 'حورة',
    image: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=500&auto=format&fit=crop&q=80',
    is_live: 1
  },
  {
    title: 'سامر تل السبع',
    clan: 'آل أبو سبيتان',
    town: 'تل السبع',
    image: 'https://images.unsplash.com/photo-1544078751-58fee2d8a03b?w=500&auto=format&fit=crop&q=80',
    is_live: 0
  },
  {
    title: 'أفراح شقيب السلام',
    clan: 'آل أبو عصا',
    town: 'شقيب السلام',
    image: 'https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=500&auto=format&fit=crop&q=80',
    is_live: 0
  }
];

async function seedSuperAdmin() {
  const existing = await db.queryOne(
    `SELECT id FROM users WHERE phone_number = ? OR role = 'super_admin' LIMIT 1`,
    [config.admin.phone]
  );

  if (existing) {
    logger.info('Super admin already exists — skipped.');
    return;
  }

  const hashedPin = bcrypt.hashSync(config.admin.pin, config.bcryptRounds);
  await db.execute(
    `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role)
     VALUES (?, ?, ?, ?, 'super_admin')`,
    [config.admin.phone, config.admin.name, hashedPin, 'إدارة النقب']
  );
  logger.info(`Super admin created — phone ${config.admin.phone}`);
}

async function seedEvents() {
  const { total } = await db.queryOne('SELECT COUNT(*) AS total FROM events');
  if (total > 0) {
    logger.info(`Events table already holds ${total} row(s) — skipped.`);
    return;
  }

  for (const event of DEMO_EVENTS) {
    // No fallback to another town's coordinates: a town missing from
    // TOWN_COORDINATES (e.g. 'القرى والتجمعات') gets no pin, not a wrong one.
    const coords = TOWN_COORDINATES[event.town] || {};
    const { insertId } = await db.execute(
      `INSERT INTO events
         (title, groom_name, family_clan, town, location_name, latitude, longitude,
          event_date, youth_party_date, dinner_time, poster_url, audio_url, audio_title,
          host_phone, status, views_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 245)`,
      [
        event.title, event.groom_name, event.family_clan, event.town, event.location_name,
        coords.lat ?? null, coords.lng ?? null, event.event_date, event.youth_party_date, event.dinner_time,
        event.poster_url, event.audio_url, event.audio_title, event.host_phone
      ]
    );

    for (const type of ['coffee', 'coffee', 'horse', 'fireworks', 'rose']) {
      await db.execute(
        `INSERT INTO reactions (event_id, reaction_type, user_identifier) VALUES (?, ?, 'seed')`,
        [insertId, type]
      );
    }
  }
  logger.info(`Seeded ${DEMO_EVENTS.length} demo events.`);
}

async function seedStories() {
  const { total } = await db.queryOne('SELECT COUNT(*) AS total FROM stories');
  if (total > 0) {
    logger.info(`Stories table already holds ${total} row(s) — skipped.`);
    return;
  }

  for (const story of DEMO_STORIES) {
    await db.execute(
      'INSERT INTO stories (title, clan, town, image, is_live) VALUES (?, ?, ?, ?, ?)',
      [story.title, story.clan, story.town, story.image, story.is_live]
    );
  }
  logger.info(`Seeded ${DEMO_STORIES.length} stories.`);
}

async function seed() {
  await db.waitForConnection();
  await seedSuperAdmin();
  await seedEvents();
  await seedStories();
  logger.info('Seeding complete.');
}

if (require.main === module) {
  seed()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async err => {
      logger.error('Seeding failed:', err.message);
      await db.close().catch(() => {});
      process.exit(1);
    });
}

module.exports = seed;
