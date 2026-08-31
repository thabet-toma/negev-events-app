'use strict';

/**
 * Import the wedding invitations published on https://munasabatna.com/weddings/
 * into the events table.
 *
 * Every field below was read off the invitation poster itself (the cards are
 * images, so there is no machine-readable source). Anything the card does not
 * state is left null / 'غير محدد' rather than guessed — those rows are inserted
 * as `pending` so an admin completes them before they go public.
 *
 * Two modes:
 *
 *   # 1. local database (uses .env DB_* settings)
 *   node scripts/import-munasabatna.js
 *
 *   # 2. a deployed server, over its admin API
 *   ADMIN_TOKEN=<token> node scripts/import-munasabatna.js --api https://munasbat.ktra-pro.tech
 *
 * Get the token by logging into that server's /admin.html, then running
 * `localStorage.getItem('adminToken')` in the browser console.
 *
 * Safe to re-run in both modes: an event with the same groom_name + event_date
 * is skipped.
 *
 * Note: the POST /api/events route rejects any town outside constants.TOWNS,
 * so in API mode the two events whose poster states no town are skipped. Give
 * them a town with --town-<key>=<town> to publish them too, e.g.
 *   --town-zayadna="رهط" --town-athman="تل السبع"
 */

const db = require('../src/db/pool');
const logger = require('../src/utils/logger');
const { TOWN_COORDINATES, TOWNS } = require('../src/constants');

const UNKNOWN = 'غير محدد';
const SOURCE = 'https://munasabatna.com/weddings/';

const EVENTS = [
  {
    // أفراح آل الكتناني — يتشرف السيد محمد الكتناني (أبو يوسف) وعنهم يوسف الكتناني
    key: 'kattanani',
    title: 'أفراح آل الكتناني — زفاف العريس مجدي',
    groom_name: 'مجدي الكتناني',
    family_clan: 'عائلة الكتناني',
    town: 'رهط',
    location_name: 'قاعة السعادة — رهط (الرجال والنساء في قاعة السعادة)',
    event_date: '2025-10-11', // السبت 11.10.2025
    youth_party_date: null,
    dinner_time: 'الساعة 8:00 مساءً',
    poster_url: 'https://munasabatna.com/wp-content/uploads/2025/09/7Wedding-Invitation11.10.jpeg',
    host_phone: null,
    status: 'approved'
  },
  {
    // أفراح آل الزيادنة — يتشرف السيد عبدالعزيز الزيادنة (أبو معتز) — نجلاه معتز وعلي
    // عشاء افتتاح بيت الفرح 12.10.2025 · حفل الشباب 15.10.2025 (حميد أبو الليل)
    // قعدة بدوية 16.10.2025 (محيسن وعمر أبو عجاج) · دحية: سالم الأعسم
    key: 'zayadna',
    title: 'أفراح آل الزيادنة — زفاف العريسين معتز وعلي',
    groom_name: 'معتز وعلي الزيادنة',
    family_clan: 'عائلة الزيادنة',
    town: UNKNOWN, // البطاقة لا تذكر البلدة
    location_name: UNKNOWN,
    event_date: '2025-10-17', // الجمعة 17.10.2025
    youth_party_date: '2025-10-15', // حفل الشباب مع الفنان حميد أبو الليل
    dinner_time: 'وجبة العشاء قبل آذان المغرب',
    poster_url: 'https://munasabatna.com/wp-content/uploads/2025/09/2Wedding-Invitation17.10.jpeg',
    host_phone: null,
    status: 'pending' // البلدة والموقع ناقصان
  },
  {
    // دعوة — يتشرف السيد نايف (أبو خالد) الأعسم
    key: 'athman',
    title: 'أفراح آل الأعسم — زفاف العريس عثمان',
    groom_name: 'عثمان الأعسم',
    family_clan: 'عائلة الأعسم',
    town: UNKNOWN, // البطاقة لا تذكر البلدة
    location_name: UNKNOWN,
    event_date: '2025-10-24', // الجمعة 24.10.2025
    youth_party_date: null,
    dinner_time: 'الساعة 8:00 مساءً',
    poster_url: 'https://munasabatna.com/wp-content/uploads/2025/09/10Wedding-Invitation24.10.jpeg',
    host_phone: null,
    status: 'pending' // البلدة والموقع ناقصان
  },
  {
    // افراح آل الحبانين — يتشرف السيد عطيه الحبانين أبو كمال
    // عشاء البيوت وسهرة دحية 30.10.2025 مع معين الأعسم ويوسف الصرايعه
    key: 'habanin',
    title: 'أفراح آل الحبانين — زفاف العريس هيثم',
    groom_name: 'هيثم الحبانين',
    family_clan: 'عائلة الحبانين',
    town: 'رهط',
    location_name: 'رهط — مدخل حارة 14',
    event_date: '2025-11-01', // السبت 1.11.2025
    youth_party_date: '2025-10-30', // عشاء البيوت يليه سهرة على أنغام الدحية
    dinner_time: 'قبل صلاة المغرب',
    poster_url: 'https://munasabatna.com/wp-content/uploads/2025/10/1.11.25-Wedding-invitation1.jpeg',
    host_phone: null,
    status: 'approved'
  },
  {
    // دعوة — يتشرف السيد موسى الأعسم (أبو أحمد)
    key: 'yaseen',
    title: 'أفراح آل الأعسم — زفاف العريس ياسين',
    groom_name: 'ياسين الأعسم',
    family_clan: 'عائلة الأعسم',
    town: 'تل السبع',
    location_name: 'تل السبع — حارة 16',
    event_date: '2025-11-07', // الجمعة 07.11.2025
    youth_party_date: null,
    dinner_time: 'الساعة 8:00 مساءً',
    poster_url: 'https://munasabatna.com/wp-content/uploads/2025/09/12Wedding-Invitation7.11.jpeg',
    host_phone: null,
    status: 'approved'
  }
];

async function run() {
  let imported = 0;
  let skipped = 0;

  for (const event of EVENTS) {
    const existing = await db.queryOne(
      'SELECT id FROM events WHERE groom_name = ? AND event_date = ?',
      [event.groom_name, event.event_date]
    );

    if (existing) {
      logger.info(`Skipped (already present #${existing.id}): ${event.title}`);
      skipped += 1;
      continue;
    }

    const coords = TOWN_COORDINATES[event.town] || {};

    const { insertId } = await db.execute(
      `INSERT INTO events
         (title, groom_name, family_clan, town, location_name, latitude, longitude,
          event_date, youth_party_date, dinner_time, poster_url, host_phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.title, event.groom_name, event.family_clan, event.town, event.location_name,
        coords.lat ?? null, coords.lng ?? null, event.event_date, event.youth_party_date,
        event.dinner_time, event.poster_url, event.host_phone, event.status
      ]
    );

    logger.info(`Imported #${insertId} (${event.status}): ${event.title}`);
    imported += 1;
  }

  logger.info(`Done — ${imported} imported, ${skipped} already present. Source: ${SOURCE}`);
  await db.close();
}

run().catch(err => {
  logger.error(err.message);
  process.exit(1);
});
