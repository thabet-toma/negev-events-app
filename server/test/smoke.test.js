'use strict';

/**
 * End-to-end smoke test against a running MySQL instance.
 * Boots the app on an ephemeral port, exercises the public, user and admin
 * flows, then cleans up after itself.
 *
 *   npm test
 */

const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const fsp = require('fs/promises');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const config = require('../src/config');
const db = require('../src/db/pool');
const migrate = require('../src/db/migrate');
const seed = require('../src/db/seed');
const createApp = require('../src/app');
const { signToken } = require('../src/middleware/auth');
const { OCCASION_FIELD_KEYS, CONGRATULATION_REPORT_THRESHOLD, TOWNS, ANALYTICS_EVENT_KEYS, ANALYTICS_EVENTS } = require('../src/constants');
const { absoluteMediaUrl } = require('../src/utils/mediaUrl');
const analyticsService = require('../src/services/analytics.service');
const adminService = require('../src/services/admin.service');
const scheduler = require('../src/jobs/scheduler');
const notificationsService = require('../src/services/notifications.service');
const pushService = require('../src/services/push.service');
const webpush = require('web-push');
const { runInstantForDate } = require('../src/utils/jerusalemTime');
const logger = require('../src/utils/logger');
const shareCard = require('../src/services/shareCard.service');
const { PALETTES } = require('../src/utils/shareTheme');

let baseUrl = '';
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

/**
 * `legacy: true` omits `X-App-Version` entirely, simulating a pre-#20 client
 * (#20 step 4, decision و). Every other call gets one by default so the rest
 * of this suite keeps seeing every occasion type, matching its pre-#20
 * behaviour.
 */
/**
 * Posts a real multipart/form-data publish, the way both clients actually do
 * it. The JSON `api()` helper below cannot exercise multer at all, which is
 * why file upload went unverified until an artist image was added to the form
 * and the whole path had to be trusted by reading. `fields` uses the same
 * `honorees[0][name]` bracket notation web/app.js sends.
 */
async function apiUpload(path, { fields = {}, files = [], token, method = 'POST' } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const file of files) {
    form.append(file.field, new Blob([file.buffer], file.type ? { type: file.type } : {}), file.name);
  }

  const headers = { 'X-App-Version': '2.0.0' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: form });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** A 1×1 PNG — the smallest byte sequence that is genuinely an image. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function api(method, path, { body, token, legacy = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!legacy) headers['X-App-Version'] = '2.0.0';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/**
 * This suite WRITES to whatever database it is pointed at: it applies the
 * schema, seeds, and creates users and events. Running it against production
 * would pollute real data, so refuse unless explicitly overridden.
 */
function assertNotProduction() {
  if (!config.isProduction || process.env.ALLOW_TESTS_ON_PRODUCTION === 'true') {
    return;
  }

  const target = `${config.db.host}:${config.db.port}/${config.db.database}`;
  console.error('');
  console.error('✖ رُفض التشغيل: NODE_ENV=production.');
  console.error(`  هذا الاختبار يكتب في ${target} (migrate + seed + صفوف تجريبية).`);
  console.error('  شغّله على قاعدة تطوير أو حاوية مؤقتة.');
  console.error('  للتجاوز عن قصد: ALLOW_TESTS_ON_PRODUCTION=true');
  console.error('');
  process.exit(1);
}

async function run() {
  assertNotProduction();

  await db.waitForConnection();
  await migrate();
  await seed();

  const server = http.createServer(createApp());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`\nSmoke tests against ${baseUrl}\n`);

  // Seeded by dataMigrations.js before this suite even boots the app.
  const weddingType = await db.queryOne("SELECT id FROM occasion_types WHERE name = 'عرس'");
  const funeralType = await db.queryOne("SELECT id FROM occasion_types WHERE name = 'عزا'");

  /** A minimal, valid عرس publish body — one honoree, no token attached by the caller. */
  function weddingEventBody(overrides = {}) {
    return {
      occasion_type_id: weddingType.id,
      honorees: [{ name: 'أحمد الاختبار', role: 'العريس' }],
      town: 'حورة',
      location_name: 'ديوان الاختبار',
      event_date: '2026-12-31',
      ...overrides
    };
  }

  const phone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  let userToken = '';
  let adminToken = '';
  let nokootId = 0;
  // Phone numbers of every throwaway user created for the congratulations
  // section below — collected here and deleted in one pass at the end.
  const congratsCleanupPhones = [];

  /** Registers a fresh regular user and returns { phone, token, full_name, id }. */
  async function registerTestUser(fullName) {
    const userPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { body } = await api('POST', '/api/auth/register', {
      body: { phone_number: userPhone, full_name: fullName, pin_code: '1234' }
    });
    congratsCleanupPhones.push(userPhone);
    return { phone: userPhone, token: body.token, full_name: fullName, id: body.user.id };
  }

  console.log('Public API');
  await test('GET /health reports the database is up', async () => {
    const { status, body } = await api('GET', '/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.database, 'up');
  });

  await test('GET /api/events returns approved events with reaction counts', async () => {
    const { status, body } = await api('GET', '/api/events');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.events) && body.events.length > 0, 'expected at least one event');
    assert.ok(body.events[0].reactions, 'expected a reactions object');
  });

  await test('GET /api/events?town= filters by town', async () => {
    const { body } = await api('GET', `/api/events?town=${encodeURIComponent('رهط')}`);
    assert.ok(body.events.every(e => e.town === 'رهط'));
  });

  await test('GET /api/events?search= matches Arabic text', async () => {
    const { body } = await api('GET', `/api/events?search=${encodeURIComponent('أبو معمر')}`);
    assert.ok(body.events.length > 0, 'expected an Arabic search hit');
  });

  await test('GET /api/stories exposes isLive', async () => {
    const { body } = await api('GET', '/api/stories');
    assert.ok(body.stories.length > 0);
    assert.strictEqual(typeof body.stories[0].isLive, 'boolean');
  });

  await test('GET /api/map/events returns Waze links', async () => {
    const { body } = await api('GET', '/api/map/events');
    assert.ok(body.points.length > 0);
    assert.ok(body.points[0].waze_url.startsWith('https://waze.com/ul?'));
  });

  await test('GET /api/towns lists towns and per-town stats', async () => {
    const { body } = await api('GET', '/api/towns');
    assert.ok(body.towns.includes('الكل'));
    assert.ok(Array.isArray(body.stats));
  });

  await test('GET /api/towns carries a map centre for every real town, and none for القرى والتجمعات (#20 step 6)', async () => {
    const { body } = await api('GET', '/api/towns');
    for (const town of body.towns) {
      if (town === 'الكل' || town === 'القرى والتجمعات') continue;
      const coords = body.town_coordinates[town];
      assert.ok(coords, `expected map coordinates for ${town}`);
      assert.strictEqual(typeof coords.lat, 'number');
      assert.strictEqual(typeof coords.lng, 'number');
    }
    assert.strictEqual(body.town_coordinates['القرى والتجمعات'], undefined);
  });

  await test('GET /api/app/version announces the mobile release', async () => {
    const { body } = await api('GET', '/api/app/version');
    assert.strictEqual(body.success, true);
    // الحقول تُعلَن دائماً حتى لو لم تُضبط، فلا يحتاج التطبيق حالة خاصة.
    assert.ok('latest_version' in body);
    assert.ok('min_version' in body);
    assert.ok('apk_url' in body);
  });

  await test('POST /api/check-collision detects a booked date', async () => {
    const { body: list } = await api('GET', '/api/events');
    const { body } = await api('POST', '/api/check-collision', { body: { date: list.events[0].event_date } });
    assert.strictEqual(body.hasCollision, true);
  });

  await test('POST /api/check-collision rejects a malformed date', async () => {
    const { status } = await api('POST', '/api/check-collision', { body: { date: 'not-a-date' } });
    assert.strictEqual(status, 400);
  });

  console.log('\nAuth');
  await test('POST /api/auth/register creates an account', async () => {
    const { status, body } = await api('POST', '/api/auth/register', {
      body: { phone_number: phone, full_name: 'مستخدم اختبار', pin_code: '4321', clan_town: 'رهط' }
    });
    assert.strictEqual(status, 201);
    assert.ok(body.token);
    userToken = body.token;
  });

  await test('POST /api/auth/register rejects a duplicate phone', async () => {
    const { status } = await api('POST', '/api/auth/register', {
      body: { phone_number: phone, full_name: 'مكرر', pin_code: '4321' }
    });
    assert.strictEqual(status, 409);
  });

  await test('POST /api/auth/login rejects a wrong PIN', async () => {
    const { status } = await api('POST', '/api/auth/login', {
      body: { phone_number: phone, pin_code: '0000' }
    });
    assert.strictEqual(status, 401);
  });

  await test('POST /api/auth/login succeeds with the right PIN', async () => {
    const { status, body } = await api('POST', '/api/auth/login', {
      body: { phone_number: phone, pin_code: '4321' }
    });
    assert.strictEqual(status, 200);
    assert.ok(body.token);
  });

  await test('The register and login calls above each wrote a server-side analytics row for this user (issue #44) — no extra requests needed, just reading what already happened', async () => {
    const user = await db.queryOne('SELECT id FROM users WHERE phone_number = ?', [phone]);
    const registerRow = await db.queryOne(
      "SELECT * FROM analytics_events WHERE event_name = 'register' AND user_id = ?", [user.id]
    );
    const loginRow = await db.queryOne(
      "SELECT * FROM analytics_events WHERE event_name = 'login' AND user_id = ?", [user.id]
    );
    assert.ok(registerRow, 'expected a "register" analytics row for the account created above');
    assert.ok(loginRow, 'expected a "login" analytics row for the login above');
    // The test client's api() helper sends X-App-Version: 2.0.0 (a real
    // version string, not the literal 'web' marker web/api.js sends) — the
    // route layer's clientSignal() reads that as the mobile client.
    assert.strictEqual(registerRow.platform, 'android');
    assert.strictEqual(registerRow.app_version, '2.0.0');
    assert.strictEqual(loginRow.platform, 'android');
  });

  console.log('\nNokoot ledger (private)');
  await test('GET /api/nokoot without a token is rejected', async () => {
    const { status } = await api('GET', '/api/nokoot');
    assert.strictEqual(status, 401);
  });

  await test('POST /api/nokoot stores a ledger entry', async () => {
    const { status, body } = await api('POST', '/api/nokoot', {
      token: userToken,
      body: { recipient_name: 'سالم أبو ربيعة', clan_town: 'رهط', amount: 500, event_date: '2026-09-04' }
    });
    assert.strictEqual(status, 201);
    nokootId = body.recordId;
  });

  await test('GET /api/nokoot returns totals and analytics', async () => {
    const { body } = await api('GET', '/api/nokoot', { token: userToken });
    assert.ok(body.totalAmount >= 500);
    assert.ok(body.analytics.townBreakdown['رهط'] >= 500);
  });

  await test('DELETE /api/nokoot/:id removes the entry', async () => {
    const { status } = await api('DELETE', `/api/nokoot/${nokootId}`, { token: userToken });
    assert.strictEqual(status, 200);
  });

  console.log('\nAdmin');
  await test('POST /api/admin/login rejects a wrong PIN', async () => {
    const { status } = await api('POST', '/api/admin/login', {
      body: { phone_number: config.admin.phone, pin_code: 'wrong-pin' }
    });
    assert.strictEqual(status, 401);
  });

  await test('POST /api/admin/login rejects a non-admin account', async () => {
    const { status } = await api('POST', '/api/admin/login', {
      body: { phone_number: phone, pin_code: '4321' }
    });
    assert.strictEqual(status, 403);
  });

  await test('POST /api/admin/login succeeds for the super admin', async () => {
    const { status, body } = await api('POST', '/api/admin/login', {
      body: { phone_number: config.admin.phone, pin_code: config.admin.pin }
    });
    assert.strictEqual(status, 200);
    adminToken = body.token;
  });

  await test('GET /api/admin/stats is closed to a normal user', async () => {
    const { status } = await api('GET', '/api/admin/stats', { token: userToken });
    assert.strictEqual(status, 403);
  });

  await test('GET /api/admin/stats returns counters for an admin', async () => {
    const { status, body } = await api('GET', '/api/admin/stats', { token: adminToken });
    assert.strictEqual(status, 200);
    assert.ok(body.stats.totalEvents > 0);
  });

  await test('POST /api/admin/broadcast is accepted', async () => {
    const { status } = await api('POST', '/api/admin/broadcast', {
      token: adminToken,
      body: { message: 'اختبار بث' }
    });
    assert.strictEqual(status, 200);
  });

  console.log('\nOccasion types (public read)');

  await test('GET /api/occasion-types returns the five seeded types ordered by position, عرس first', async () => {
    const { status, body } = await api('GET', '/api/occasion-types');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.types.length, 5);
    assert.strictEqual(body.types[0].name, 'عرس');
    const positions = body.types.map(t => t.position);
    assert.deepStrictEqual(positions, [...positions].sort((a, b) => a - b));
  });

  await test('عزا carries zero reactions while عرس carries all five', async () => {
    const { body } = await api('GET', '/api/occasion-types');
    const wedding = body.types.find(t => t.name === 'عرس');
    const funeral = body.types.find(t => t.name === 'عزا');
    assert.strictEqual(funeral.reactions.length, 0);
    assert.strictEqual(wedding.reactions.length, 5);
  });

  console.log('\nOccasion types (admin)');

  // config.admin's seeded account is super_admin (see seed.js), so adminToken
  // from the Admin section above already carries that role.
  const superAdminToken = adminToken;
  let plainAdminToken = '';
  const plainAdminPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;

  /** A minimal, valid field config covering every master field key. */
  function buildFieldSet(overrides = {}) {
    return OCCASION_FIELD_KEYS.map((key, index) => ({
      field_key: key,
      label: key,
      is_visible: overrides[key]?.is_visible ?? true,
      is_required: overrides[key]?.is_required ?? ['honorees', 'town', 'event_date'].includes(key),
      position: index + 1
    }));
  }

  await test('Seed a plain admin directly via the DB (no API creates that role)', async () => {
    const hashedPin = bcrypt.hashSync('1234', config.bcryptRounds);
    await db.execute(
      `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'admin')`,
      [plainAdminPhone, 'مشرف عادي', hashedPin, 'رهط']
    );
    const { status, body } = await api('POST', '/api/admin/login', {
      body: { phone_number: plainAdminPhone, pin_code: '1234' }
    });
    assert.strictEqual(status, 200);
    plainAdminToken = body.token;
  });

  await test('A plain admin is rejected (403) on all four occasion-type admin routes', async () => {
    const getAll = await api('GET', '/api/admin/occasion-types', { token: plainAdminToken });
    assert.strictEqual(getAll.status, 403);
    const create = await api('POST', '/api/admin/occasion-types', { token: plainAdminToken, body: {} });
    assert.strictEqual(create.status, 403);
    const patch = await api('PATCH', '/api/admin/occasion-types/1', { token: plainAdminToken, body: {} });
    assert.strictEqual(patch.status, 403);
    const del = await api('DELETE', '/api/admin/occasion-types/1', { token: plainAdminToken });
    assert.strictEqual(del.status, 403);
  });

  await test('A super_admin passes GET /api/admin/occasion-types and gets the unpublished-type notice', async () => {
    const { status, body } = await api('GET', '/api/admin/occasion-types', { token: superAdminToken });
    assert.strictEqual(status, 200);
    assert.ok(body.types.length >= 5);
    assert.ok(body.notice.includes('لن يظهر'));
  });

  let createdTypeId = 0;
  await test('Creating a type from the admin panel appears immediately in the public list — no deploy, no migration', async () => {
    const { status, body } = await api('POST', '/api/admin/occasion-types', {
      token: superAdminToken,
      body: {
        name: `نوع اختبار ${Date.now()}`,
        icon: '✨',
        color: '#123456',
        fields: buildFieldSet(),
        reactions: ['coffee']
      }
    });
    assert.strictEqual(status, 201);
    createdTypeId = body.typeId;

    const { body: publicList } = await api('GET', '/api/occasion-types');
    assert.ok(publicList.types.some(t => t.id === createdTypeId));
  });

  await test('Creating a type without honorees/town/event_date visible is rejected', async () => {
    const fields = buildFieldSet().filter(f => f.field_key !== 'honorees');
    const { status, body } = await api('POST', '/api/admin/occasion-types', {
      token: superAdminToken,
      body: { name: `نوع ناقص ${Date.now()}`, icon: '❌', color: '#000000', fields, reactions: [] }
    });
    assert.strictEqual(status, 400);
    assert.ok(body.message.includes('أصحاب المناسبة'));
  });

  await test('Creating a type with a field_key outside the master set is rejected', async () => {
    const fields = [
      ...buildFieldSet(),
      { field_key: 'made_up_field', label: 'مخترع', is_visible: true, is_required: false, position: 99 }
    ];
    const { status } = await api('POST', '/api/admin/occasion-types', {
      token: superAdminToken,
      body: { name: `نوع مخترع ${Date.now()}`, icon: '❌', color: '#000000', fields, reactions: [] }
    });
    assert.strictEqual(status, 400);
  });

  await test('A type with an event attached cannot be deleted — refused and disabled instead', async () => {
    const { body: created } = await api('POST', '/api/admin/occasion-types', {
      token: superAdminToken,
      body: {
        name: `نوع محذوف ${Date.now()}`,
        icon: '🧪',
        color: '#abcdef',
        fields: buildFieldSet(),
        reactions: []
      }
    });
    const typeId = created.typeId;

    const { insertId: eventId } = await db.execute(
      `INSERT INTO events (title, groom_name, family_clan, occasion_type_id, town, location_name, event_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')`,
      ['اختبار الحذف', 'صاحب المناسبة', 'عائلة الاختبار', typeId, 'رهط', 'مكان الاختبار', '2027-02-01']
    );

    const del = await api('DELETE', `/api/admin/occasion-types/${typeId}`, { token: superAdminToken });
    assert.strictEqual(del.status, 409);

    const row = await db.queryOne('SELECT is_active FROM occasion_types WHERE id = ?', [typeId]);
    assert.strictEqual(Number(row.is_active), 0);

    // Clean up: dropping the event lets a second delete attempt succeed for real.
    await db.execute('DELETE FROM events WHERE id = ?', [eventId]);
    const del2 = await api('DELETE', `/api/admin/occasion-types/${typeId}`, { token: superAdminToken });
    assert.strictEqual(del2.status, 200);
    assert.strictEqual(del2.body.deleted, true);
  });

  await test('A type with no events is deleted outright', async () => {
    const del = await api('DELETE', `/api/admin/occasion-types/${createdTypeId}`, { token: superAdminToken });
    assert.strictEqual(del.status, 200);
    assert.strictEqual(del.body.deleted, true);
  });

  await test('Hiding a field on عرس hides it from the type config but does not touch existing event data', async () => {
    const { body: adminList } = await api('GET', '/api/admin/occasion-types', { token: superAdminToken });
    const wedding = adminList.types.find(t => t.name === 'عرس');
    const before = wedding.fields.find(f => f.field_key === 'dinner_time');
    assert.strictEqual(before.is_visible, true);

    const { body: publicEvents } = await api('GET', '/api/events');
    const sampleEvent = publicEvents.events.find(e => e.dinner_time);
    assert.ok(sampleEvent, 'expected a seeded event with a dinner_time value');
    const originalDinnerTime = sampleEvent.dinner_time;

    const hiddenFields = wedding.fields.map(f =>
      f.field_key === 'dinner_time' ? { ...f, is_visible: false, is_required: false } : f
    );
    await api('PATCH', `/api/admin/occasion-types/${wedding.id}`, {
      token: superAdminToken,
      body: { fields: hiddenFields }
    });

    const row = await db.queryOne('SELECT dinner_time FROM events WHERE id = ?', [sampleEvent.id]);
    assert.strictEqual(row.dinner_time, originalDinnerTime);

    const { body: afterList } = await api('GET', '/api/occasion-types');
    const weddingAfter = afterList.types.find(t => t.name === 'عرس');
    assert.ok(!weddingAfter.fields.some(f => f.field_key === 'dinner_time'));

    // Restore visibility so later runs/tests don't inherit a mutated seed type.
    await api('PATCH', `/api/admin/occasion-types/${wedding.id}`, {
      token: superAdminToken,
      body: { fields: wedding.fields }
    });

    const row2 = await db.queryOne('SELECT dinner_time FROM events WHERE id = ?', [sampleEvent.id]);
    assert.strictEqual(row2.dinner_time, originalDinnerTime);
  });

  console.log('\nOccasion type migration backfill');

  await test('A legacy-shaped event row is backfilled to عرس with one event_honorees row', async () => {
    // The legacy shape is created here rather than sampled from the list: the
    // first row in the public list is whatever sorts earliest, which stopped
    // being a wedding the moment any other occasion type existed.
    const { insertId } = await db.execute(
      `INSERT INTO events (title, groom_name, family_clan, town, location_name, event_date, status, occasion_type_id)
       VALUES (?, ?, ?, ?, ?, ?, 'approved', NULL)`,
      ['مناسبة قديمة', 'عريس ما قبل الأنواع', 'آل فلان', 'رهط', 'الديوان', '2027-04-04']
    );

    await migrate();

    const row = await db.queryOne('SELECT occasion_type_id FROM events WHERE id = ?', [insertId]);
    const wedding = await db.queryOne("SELECT id FROM occasion_types WHERE name = 'عرس'");
    assert.strictEqual(row.occasion_type_id, wedding.id);

    const honorees = await db.query('SELECT * FROM event_honorees WHERE event_id = ?', [insertId]);
    assert.strictEqual(honorees.length, 1);
    assert.strictEqual(honorees[0].name, 'عريس ما قبل الأنواع');

    await db.execute('DELETE FROM events WHERE id = ?', [insertId]);
  });

  await test('Running the migration twice does not duplicate occasion types or honorees', async () => {
    const beforeHonorees = await db.queryOne('SELECT COUNT(*) AS total FROM event_honorees');
    const beforeTypes = await db.queryOne('SELECT COUNT(*) AS total FROM occasion_types');
    await migrate();
    const afterHonorees = await db.queryOne('SELECT COUNT(*) AS total FROM event_honorees');
    const afterTypes = await db.queryOne('SELECT COUNT(*) AS total FROM occasion_types');
    assert.strictEqual(Number(beforeHonorees.total), Number(afterHonorees.total));
    assert.strictEqual(Number(beforeTypes.total), Number(afterTypes.total));
  });

  console.log('\nOccasion-aware publishing');

  await test('A default poster belongs to the occasion type: عرس gets one, عزا gets none', async () => {
    const types = (await api('GET', '/api/occasion-types')).body.types;

    const posterFor = async typeName => {
      const type = types.find(t => t.name === typeName);
      const { body } = await api('POST', '/api/events', {
        token: adminToken,
        body: {
          occasion_type_id: type.id,
          honorees: [{ name: 'صاحب المناسبة' }],
          town: 'رهط',
          location_name: 'الديوان',
          event_date: '2027-05-01',
          event_end_date: '2027-05-04'
        }
      });
      const detail = (await api('GET', `/api/events/${body.eventId}`)).body.event;
      await api('DELETE', `/api/admin/events/${body.eventId}`, { token: adminToken });
      return detail.poster_url;
    };

    assert.ok(await posterFor('عرس'), 'عرس falls back to its own type default poster');
    assert.strictEqual(await posterFor('عزا'), null, 'عزا must never be handed a stock image');
  });

  let honoreeSearchEventId = 0;
  await test('Publishing with five honorees, then searching by the fifth name, returns the event exactly once', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [
          { name: 'حاج فريد الاختبار الأول' },
          { name: 'حاج فريد الاختبار الثاني' },
          { name: 'حاج فريد الاختبار الثالث' },
          { name: 'حاج فريد الاختبار الرابع' },
          { name: 'فاطمة الاختبار الخامسة' }
        ]
      })
    });
    assert.strictEqual(status, 201);
    honoreeSearchEventId = body.eventId;

    const { body: search } = await api('GET', `/api/events?search=${encodeURIComponent('فاطمة الاختبار الخامسة')}`);
    const matches = search.events.filter(e => e.id === honoreeSearchEventId);
    assert.strictEqual(matches.length, 1, 'expected exactly one match, not one row per honoree');
  });

  await test('groom_name is filled with the first honoree by position, written in the same transaction', async () => {
    const { body } = await api('GET', `/api/events/${honoreeSearchEventId}`);
    assert.strictEqual(body.event.groom_name, 'حاج فريد الاختبار الأول');
    assert.strictEqual(body.event.honorees.length, 5);
    assert.strictEqual(body.event.honorees[0].position, 0);
  });

  await test('A wedding without a second honoree (bride) is accepted — the second name is optional', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس بلا عروس', role: 'العريس' }] })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.status, 'approved');
    await api('DELETE', `/api/admin/events/${body.eventId}`, { token: adminToken });
  });

  await test('A funeral (عزا) without event_end_date is rejected with an Arabic message', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى الاختبار' }],
        town: 'حورة',
        location_name: 'ديوان الاختبار',
        event_date: '2026-12-31'
      }
    });
    assert.strictEqual(status, 400);
    assert.ok(body.message.includes('مطلوب'));
  });

  await test('The rejection message names the field by its label in this type — المتوفَّى, not العريس', async () => {
    const { body } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [], // missing the one required field this test is about
        town: 'حورة',
        location_name: 'ديوان الاختبار',
        event_date: '2026-12-31',
        event_end_date: '2027-01-02'
      }
    });
    assert.ok(body.message.includes('المتوفَّى'), `expected the عزا-specific label, got: ${body.message}`);
  });

  await test('A wedding (عرس) without event_end_date is accepted — only عزا requires it', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس بلا نهاية' }] })
    });
    assert.strictEqual(status, 201);
    await api('DELETE', `/api/admin/events/${body.eventId}`, { token: adminToken });
  });

  let funeralEventId = 0;
  await test('A field hidden for this type (youth_party_date on عزا) is silently ignored, not rejected', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى الحقل المخفي' }],
        town: 'حورة',
        location_name: 'ديوان الاختبار',
        event_date: '2026-12-31',
        event_end_date: '2027-01-02',
        youth_party_date: '2026-12-25' // not a field on عزا — must be dropped, not rejected
      }
    });
    assert.strictEqual(status, 201);
    funeralEventId = body.eventId;

    const row = await db.queryOne('SELECT youth_party_date FROM events WHERE id = ?', [funeralEventId]);
    assert.strictEqual(row.youth_party_date, null);
  });

  await test('The default title generated for a funeral contains no festive wording', async () => {
    const { body } = await api('GET', `/api/events/${funeralEventId}`);
    const festiveWords = ['فرح', 'زفاف', 'مبارك'];
    assert.ok(
      festiveWords.every(word => !body.event.title.includes(word)),
      `unexpected festive word in funeral title: ${body.event.title}`
    );
  });

  console.log('\nUpcoming list, pagination, congratulations, legacy filtering (#20 step 4)');

  let pastEventId = 0;
  await test('An event whose date has passed is absent from the list and present in the archive', async () => {
    const { body: created } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس منتهٍ' }], town: 'كسيفة', event_date: '2020-01-15' })
    });
    pastEventId = created.eventId;

    const { body: list } = await api('GET', '/api/events?limit=100');
    assert.ok(!list.events.some(e => e.id === pastEventId), 'a past event must not appear in the upcoming list');

    const { body: archiveList } = await api('GET', '/api/events?archive=1&limit=100');
    assert.ok(archiveList.events.some(e => e.id === pastEventId), 'a past event must appear in the archive');
  });

  let spanningFuneralId = 0;
  await test('A عزا that started yesterday and spans today is still shown — COALESCE(event_end_date, event_date), not event_date alone', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { body: created } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى ما زال العزاء قائماً' }],
        town: 'كسيفة',
        location_name: 'ديوان الاختبار',
        event_date: yesterday,
        event_end_date: inTwoDays
      }
    });
    spanningFuneralId = created.eventId;

    const { body: list } = await api('GET', `/api/events?limit=100&occasion_type_id=${funeralType.id}`);
    assert.ok(list.events.some(e => e.id === spanningFuneralId), 'expected the spanning funeral to still be listed today');
  });

  await test('Default page size is 30, and the hard ceiling on ?limit= is enforced', async () => {
    const { body: defaultList } = await api('GET', '/api/events');
    assert.strictEqual(defaultList.pagination.limit, 30);

    const { body: cappedList } = await api('GET', '/api/events?limit=99999');
    assert.ok(cappedList.pagination.limit < 99999, `expected a hard ceiling, got limit=${cappedList.pagination.limit}`);
  });

  await test('?page= returns a different page than page 1', async () => {
    const { body: page1 } = await api('GET', '/api/events?limit=2&page=1');
    const { body: page2 } = await api('GET', '/api/events?limit=2&page=2');
    assert.strictEqual(page1.events.length, 2);
    assert.notDeepStrictEqual(page1.events.map(e => e.id), page2.events.map(e => e.id));
  });

  await test('?occasion_type_id= filters on the server, not the client', async () => {
    const { body } = await api('GET', `/api/events?limit=100&occasion_type_id=${funeralType.id}`);
    assert.ok(body.events.length > 0, 'expected at least the funerals set up above');
    assert.ok(body.events.every(e => e.occasion_type.id === funeralType.id));
  });

  await test('congratulations_count is always present (zero when there are none), and latest_congratulation is null', async () => {
    const { body } = await api('GET', `/api/events?limit=100&occasion_type_id=${funeralType.id}`);
    const event = body.events.find(e => e.id === spanningFuneralId);
    assert.strictEqual(event.congratulations_count, 0);
    assert.strictEqual(event.latest_congratulation, null);
  });

  // Behaviour change (#20 step 5): congratulating now requires a login, and
  // عزا premoderates — these three land pending, not approved, until a human
  // (owner or admin) reviews each one; congratulations_count only ever
  // counts approved rows. sender_name is derived from the account, so the
  // spoofed name each request sends in the body is dropped.
  let funeralCongratIds = [];
  await test('Three تعازي on a عزا (which premoderates) are created pending, with sender_name taken from the account', async () => {
    const extraUserA = await registerTestUser('مهنّئ إضافي الأول');
    const extraUserB = await registerTestUser('مهنّئ إضافي الثاني');
    const senders = [{ token: userToken }, extraUserA, extraUserB];

    funeralCongratIds = [];
    for (const sender of senders) {
      const { status, body } = await api('POST', `/api/events/${spanningFuneralId}/congratulate`, {
        token: sender.token,
        body: { sender_name: 'اسم منتحَل', message: 'تعازينا' }
      });
      assert.strictEqual(status, 201);
      assert.strictEqual(body.comment.status, 'pending');
      assert.notStrictEqual(body.comment.sender_name, 'اسم منتحَل', 'sender_name must come from the account, not the body');
      funeralCongratIds.push(body.comment.id);
    }

    const { body } = await api('GET', `/api/events?limit=100&occasion_type_id=${funeralType.id}`);
    const event = body.events.find(e => e.id === spanningFuneralId);
    assert.strictEqual(event.congratulations_count, 0, 'a pending تعزية must not count until approved');
  });

  await test('The admin approves all three; only then does the count/preview reflect them, without duplicating the row', async () => {
    for (const id of funeralCongratIds) {
      const { status, body } = await api('PATCH', `/api/events/${spanningFuneralId}/congratulations/${id}`, {
        token: adminToken,
        body: { action: 'approve' }
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(body.comment.status, 'approved');
    }

    const { body } = await api('GET', `/api/events?limit=100&occasion_type_id=${funeralType.id}`);
    const matches = body.events.filter(e => e.id === spanningFuneralId);
    assert.strictEqual(matches.length, 1, 'the event must not repeat once per congratulation');
    assert.strictEqual(matches[0].congratulations_count, 3);
  });

  await test('The congratulations counter/preview disappear from the card when show_congratulations_count is off, and return when it is back on', async () => {
    const { body: adminList } = await api('GET', '/api/admin/occasion-types', { token: superAdminToken });
    const funeralAdmin = adminList.types.find(t => t.id === funeralType.id);
    assert.strictEqual(funeralAdmin.show_congratulations_count, true);

    await api('PATCH', `/api/admin/occasion-types/${funeralType.id}`, {
      token: superAdminToken,
      body: { show_congratulations_count: false }
    });

    const { body: hiddenList } = await api('GET', `/api/events?limit=100&occasion_type_id=${funeralType.id}`);
    const hiddenEvent = hiddenList.events.find(e => e.id === spanningFuneralId);
    assert.ok(!('congratulations_count' in hiddenEvent), 'expected the counter to be dropped entirely, not just zeroed');
    assert.ok(!('latest_congratulation' in hiddenEvent));

    await api('PATCH', `/api/admin/occasion-types/${funeralType.id}`, {
      token: superAdminToken,
      body: { show_congratulations_count: true }
    });

    const { body: restoredList } = await api('GET', `/api/events?limit=100&occasion_type_id=${funeralType.id}`);
    const restoredEvent = restoredList.events.find(e => e.id === spanningFuneralId);
    assert.strictEqual(restoredEvent.congratulations_count, 3);
  });

  await test('A request with no X-App-Version header only sees weddings from GET /api/events', async () => {
    const { body } = await api('GET', '/api/events?limit=100', { legacy: true });
    assert.ok(body.events.length > 0, 'expected at least the seeded weddings');
    assert.ok(body.events.every(e => e.occasion_type.id === weddingType.id));
  });

  await test('A request with no X-App-Version header only sees weddings from GET /api/map/events', async () => {
    const { body: legacyPoints } = await api('GET', '/api/map/events', { legacy: true });
    const { body: modernFunerals } = await api('GET', `/api/events?limit=100&occasion_type_id=${funeralType.id}`);
    const funeralIds = new Set(modernFunerals.events.map(e => e.id));
    assert.ok(!legacyPoints.points.some(p => funeralIds.has(p.id)), 'a funeral pin leaked to a legacy client');
  });

  await test('Reordering the type tabs does not change what a legacy client receives', async () => {
    const types = (await api('GET', '/api/occasion-types')).body.types;
    const funeral = types.find(t => t.name === 'عزا');
    const wedding = types.find(t => t.name === 'عرس');

    // A super_admin reordering tabs is a display choice, and must never
    // decide which occasions reach a build that cannot render them.
    await api('PATCH', `/api/admin/occasion-types/${funeral.id}`, {
      token: superAdminToken, body: { position: 0 }
    });
    try {
      const { body } = await api('GET', '/api/events?limit=100', { legacy: true });
      const nonWedding = body.events.filter(e => e.occasion_type && e.occasion_type.id !== wedding.id);
      assert.strictEqual(nonWedding.length, 0, 'reordering leaked a type a legacy client cannot render');
    } finally {
      await api('PATCH', `/api/admin/occasion-types/${funeral.id}`, {
        token: superAdminToken, body: { position: 2 }
      });
    }
  });

  await test('An occasion type carries an explicit tone, and a renamed label never changes it', async () => {
    const types = (await api('GET', '/api/occasion-types')).body.types;
    const funeral = types.find(t => t.name === 'عزا');
    const wedding = types.find(t => t.name === 'عرس');

    assert.strictEqual(funeral.tone, 'solemn');
    assert.strictEqual(wedding.tone, 'festive');

    // The quiet mourning card used to be inferred from this very label, so
    // renaming it silently turned a death notice into a festive card.
    await api('PATCH', `/api/admin/occasion-types/${funeral.id}`, {
      token: superAdminToken, body: { congratulations_label: 'تعزية' }
    });
    try {
      const after = (await api('GET', '/api/occasion-types')).body.types.find(t => t.id === funeral.id);
      assert.strictEqual(after.congratulations_label, 'تعزية');
      assert.strictEqual(after.tone, 'solemn', 'tone must not follow the label');
    } finally {
      await api('PATCH', `/api/admin/occasion-types/${funeral.id}`, {
        token: superAdminToken, body: { congratulations_label: 'تعازي' }
      });
    }
  });

  await test('An unknown tone is rejected with an Arabic message', async () => {
    const { status, body } = await api('POST', '/api/admin/occasion-types', {
      token: superAdminToken,
      body: {
        name: 'نغمة مجهولة', icon: '❓', color: '#0e7490', tone: 'chaotic',
        fields: [
          { field_key: 'honorees', label: 'صاحب المناسبة', is_visible: true, is_required: true },
          { field_key: 'town', label: 'البلدة', is_visible: true, is_required: true },
          { field_key: 'event_date', label: 'التاريخ', is_visible: true, is_required: true }
        ],
        reactions: []
      }
    });
    assert.strictEqual(status, 400);
    assert.ok(/نغمة/.test(body.message), body.message);
  });


  await test('A type created from the panel is not sent to already-published clients', async () => {
    const { body: created } = await api('POST', '/api/admin/occasion-types', {
      token: superAdminToken,
      body: {
        name: 'ختان', icon: '🎈', color: '#0e7490', position: 90,
        fields: [
          { field_key: 'honorees', label: 'صاحب المناسبة', is_visible: true, is_required: true },
          { field_key: 'town', label: 'البلدة', is_visible: true, is_required: true },
          { field_key: 'event_date', label: 'التاريخ', is_visible: true, is_required: true }
        ],
        reactions: []
      }
    });

    const admin = (await api('GET', '/api/admin/occasion-types', { token: superAdminToken })).body.types;
    const fresh = admin.find(t => t.id === created.typeId);
    assert.strictEqual(fresh.legacy_client_supported, false, 'a new type must default to unsupported');

    await api('DELETE', `/api/admin/occasion-types/${created.typeId}`, { token: superAdminToken });
  });

  await test('A request with a modern X-App-Version header sees every occasion type', async () => {
    const { body } = await api('GET', '/api/events?limit=100');
    assert.ok(body.events.some(e => e.occasion_type.id === weddingType.id));
    assert.ok(body.events.some(e => e.occasion_type.id === funeralType.id));
  });

  await test('A legacy client requesting the details of an unsupported occasion type gets 404 with the fixed Arabic message', async () => {
    const { status, body } = await api('GET', `/api/events/${spanningFuneralId}`, { legacy: true });
    assert.strictEqual(status, 404);
    assert.strictEqual(body.message, 'هذه المناسبة تحتاج نسخة أحدث من التطبيق');
  });

  await test('A modern client requesting the same event passes through', async () => {
    const { status } = await api('GET', `/api/events/${spanningFuneralId}`);
    assert.strictEqual(status, 200);
  });

  await test('Explicit list columns still include every field a legacy client reads: groom_name, title, family_clan, dinner_time', async () => {
    const { body } = await api('GET', '/api/events?limit=1');
    const event = body.events[0];
    for (const field of ['groom_name', 'title', 'family_clan', 'dinner_time']) {
      assert.ok(field in event, `expected "${field}" on the list row`);
    }
  });

  await db.execute('DELETE FROM events WHERE id IN (?, ?)', [pastEventId, spanningFuneralId]);

  console.log('\nEditing (ownership + amendment classification)');

  let userEventId = 0;
  await test('Set up: a logged-in user publishes an event (used for the edit-permission tests below)', async () => {
    const { body } = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس ملكية الاختبار' }] })
    });
    userEventId = body.eventId;
  });

  await test('The owner can edit their own event', async () => {
    const { status, body } = await api('PATCH', `/api/events/${userEventId}`, {
      token: userToken,
      body: { title: 'عنوان محدَّث من صاحب المناسبة' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'cosmetic');
  });

  await test('A non-owner is rejected with 403', async () => {
    const otherPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { body: registered } = await api('POST', '/api/auth/register', {
      body: { phone_number: otherPhone, full_name: 'مستخدم آخر', pin_code: '1111' }
    });
    const { status } = await api('PATCH', `/api/events/${userEventId}`, {
      token: registered.token,
      body: { title: 'محاولة تعديل غير مصرَّح بها' }
    });
    assert.strictEqual(status, 403);
    await db.execute('DELETE FROM users WHERE phone_number = ?', [otherPhone]);
  });

  await test('An admin can edit any event, including one it does not own', async () => {
    const { status, body } = await api('PATCH', `/api/events/${userEventId}`, {
      token: adminToken,
      body: { family_clan: 'آل الاختبار المعدَّل' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'cosmetic');
  });

  await test('An orphaned event (created_by IS NULL) can only be edited by an admin', async () => {
    const seeded = await db.queryOne('SELECT id, title FROM events WHERE created_by IS NULL LIMIT 1');
    assert.ok(seeded, 'expected at least one legacy orphaned event from the seed');

    const rejected = await api('PATCH', `/api/events/${seeded.id}`, {
      token: userToken,
      body: { title: 'محاولة تعديل مناسبة يتيمة' }
    });
    assert.strictEqual(rejected.status, 403);

    const accepted = await api('PATCH', `/api/events/${seeded.id}`, {
      token: adminToken,
      body: { title: seeded.title }
    });
    assert.strictEqual(accepted.status, 200);
  });

  await test('A cosmetic edit (title) keeps an approved event approved', async () => {
    await api('PATCH', `/api/admin/events/${userEventId}/status`, { token: adminToken, body: { status: 'approved' } });
    const { status, body } = await api('PATCH', `/api/events/${userEventId}`, {
      token: userToken,
      body: { title: 'عنوان تجميلي آخر' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'cosmetic');
    assert.strictEqual(body.status, 'approved');
  });

  await test('A critical edit (event_date) sends an approved event back to pending', async () => {
    const { status, body } = await api('PATCH', `/api/events/${userEventId}`, {
      token: userToken,
      body: { event_date: '2027-03-01' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'critical');
    assert.strictEqual(body.status, 'pending');
  });

  await test('A critical edit (location_name) sends an approved event back to pending', async () => {
    await api('PATCH', `/api/admin/events/${userEventId}/status`, { token: adminToken, body: { status: 'approved' } });
    const { status, body } = await api('PATCH', `/api/events/${userEventId}`, {
      token: userToken,
      body: { location_name: 'ديوان الاختبار المعدَّل' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'critical');
    assert.strictEqual(body.status, 'pending');
  });

  await test('GET /api/my-events returns what this user published, across all statuses', async () => {
    const { status, body } = await api('GET', '/api/my-events', { token: userToken });
    assert.strictEqual(status, 200);
    assert.ok(body.events.some(e => e.id === userEventId));
  });

  await test('Ownership transfer works for an admin, and is rejected for anyone else', async () => {
    const adminUser = await db.queryOne('SELECT id FROM users WHERE phone_number = ?', [config.admin.phone]);

    const rejected = await api('PATCH', `/api/admin/events/${userEventId}/owner`, {
      token: userToken,
      body: { user_id: adminUser.id }
    });
    assert.strictEqual(rejected.status, 403);

    const accepted = await api('PATCH', `/api/admin/events/${userEventId}/owner`, {
      token: adminToken,
      body: { user_id: adminUser.id }
    });
    assert.strictEqual(accepted.status, 200);
    assert.strictEqual(accepted.body.event.created_by, adminUser.id);
  });

  // Clean up every event created for this section.
  await db.execute('DELETE FROM events WHERE id IN (?, ?, ?)', [honoreeSearchEventId, funeralEventId, userEventId]);

  console.log('\nAmendment log');

  let logEventId = 0;
  await test('Set up: user publishes and admin approves a wedding for amendment-log tests', async () => {
    const { body: created } = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس سجل التعديلات' }], town: 'رهط', event_date: '2027-06-01' })
    });
    logEventId = created.eventId;
    const approve = await api('PATCH', `/api/admin/events/${logEventId}/status`, {
      token: adminToken,
      body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);
  });

  await test('A cosmetic edit is logged and the event stays approved', async () => {
    const { status, body } = await api('PATCH', `/api/events/${logEventId}`, {
      token: userToken,
      body: { title: 'عنوان سجل تجميلي' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'cosmetic');
    assert.strictEqual(body.status, 'approved');

    const rows = await db.query("SELECT * FROM event_amendments WHERE event_id = ? AND field = 'title'", [logEventId]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].classification, 'cosmetic');
    assert.strictEqual(rows[0].status, 'approved');
    assert.strictEqual(rows[0].new_value, 'عنوان سجل تجميلي');
  });

  await test('A critical edit produces a pending amendment row and sends the event back to pending', async () => {
    const { status, body } = await api('PATCH', `/api/events/${logEventId}`, {
      token: userToken,
      body: { event_date: '2027-06-25' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'critical');
    assert.strictEqual(body.status, 'pending');

    const rows = await db.query("SELECT * FROM event_amendments WHERE event_id = ? AND field = 'event_date'", [logEventId]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].classification, 'critical');
    assert.strictEqual(rows[0].status, 'pending');
  });

  await test('Editing two fields in one request produces two amendment rows', async () => {
    const before = await db.queryOne('SELECT COUNT(*) AS total FROM event_amendments WHERE event_id = ?', [logEventId]);
    const { status } = await api('PATCH', `/api/events/${logEventId}`, {
      token: userToken,
      body: { title: 'عنوان مزدوج', family_clan: 'عائلة مزدوجة' }
    });
    assert.strictEqual(status, 200);
    const after = await db.queryOne('SELECT COUNT(*) AS total FROM event_amendments WHERE event_id = ?', [logEventId]);
    assert.strictEqual(Number(after.total) - Number(before.total), 2);
  });

  await test('Resubmitting the same value produces no new amendment row and no status change', async () => {
    const current = await db.queryOne('SELECT title, status FROM events WHERE id = ?', [logEventId]);
    const before = await db.queryOne('SELECT COUNT(*) AS total FROM event_amendments WHERE event_id = ?', [logEventId]);
    const { status, body } = await api('PATCH', `/api/events/${logEventId}`, {
      token: userToken,
      body: { title: current.title }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, current.status);
    const after = await db.queryOne('SELECT COUNT(*) AS total FROM event_amendments WHERE event_id = ?', [logEventId]);
    assert.strictEqual(Number(after.total), Number(before.total));
  });

  await test('Approving the event resolves every pending amendment row', async () => {
    const pendingBefore = await db.queryOne(
      "SELECT COUNT(*) AS total FROM event_amendments WHERE event_id = ? AND status = 'pending'", [logEventId]
    );
    assert.ok(Number(pendingBefore.total) > 0, 'expected at least one pending row before approval');

    const approve = await api('PATCH', `/api/admin/events/${logEventId}/status`, {
      token: adminToken,
      body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const pendingAfter = await db.queryOne(
      "SELECT COUNT(*) AS total FROM event_amendments WHERE event_id = ? AND status = 'pending'", [logEventId]
    );
    assert.strictEqual(Number(pendingAfter.total), 0);
  });

  await test('An admin reads the amendment log', async () => {
    const { status, body } = await api('GET', `/api/admin/events/${logEventId}/amendments`, { token: adminToken });
    assert.strictEqual(status, 200);
    assert.ok(body.amendments.length >= 4);
  });

  await test('The owner reads their own event amendment log', async () => {
    const { status, body } = await api('GET', `/api/events/${logEventId}/amendments`, { token: userToken });
    assert.strictEqual(status, 200);
    assert.ok(body.amendments.length >= 4);
  });

  await test('A non-owner is rejected from reading the amendment log', async () => {
    const otherPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { body: registered } = await api('POST', '/api/auth/register', {
      body: { phone_number: otherPhone, full_name: 'قارئ غير مصرَّح', pin_code: '2222' }
    });
    const { status } = await api('GET', `/api/events/${logEventId}/amendments`, { token: registered.token });
    assert.strictEqual(status, 403);
    await db.execute('DELETE FROM users WHERE phone_number = ?', [otherPhone]);
  });

  await test('The public cannot read the amendment log at all', async () => {
    const { status } = await api('GET', `/api/events/${logEventId}/amendments`);
    assert.strictEqual(status, 401);
  });

  await db.execute('DELETE FROM events WHERE id = ?', [logEventId]);

  console.log('\nCollision detection (range + directional flags)');

  const collisionTown = 'شقيب السلام';
  let funeralA = 0;
  let funeralB = 0;
  let longFuneralId = 0;
  let recheckEventId = 0;

  await test('Set up: two funerals published in the same town on the same day', async () => {
    const f1 = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى أ' }],
        town: collisionTown,
        location_name: 'ديوان الاختبار',
        event_date: '2027-07-01',
        event_end_date: '2027-07-02'
      }
    });
    funeralA = f1.body.eventId;

    const f2 = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى ب' }],
        town: collisionTown,
        location_name: 'ديوان الاختبار',
        event_date: '2027-07-01',
        event_end_date: '2027-07-01'
      }
    });
    funeralB = f2.body.eventId;
  });

  await test('عزا checking against an overlapping عزا in the same town produces no warning (funerals never collision-check)', async () => {
    const { status, body } = await api('POST', '/api/check-collision', {
      body: {
        date: '2027-07-01',
        event_end_date: '2027-07-02',
        town: collisionTown,
        occasion_type_id: funeralType.id
      }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.hasCollision, false);
  });

  await test('Checking a عرس against an existing عزا in the same town warns of a collision', async () => {
    const { status, body } = await api('POST', '/api/check-collision', {
      body: { date: '2027-07-01', town: collisionTown, occasion_type_id: weddingType.id }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.hasCollision, true);
    assert.ok(body.conflicts.some(c => c.id === funeralA || c.id === funeralB));
    assert.ok(body.message.includes('تعارض'));
  });

  await test('Set up: a funeral spanning four days', async () => {
    const { body } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى الأربعة أيام' }],
        town: collisionTown,
        location_name: 'ديوان الاختبار',
        event_date: '2027-08-01',
        event_end_date: '2027-08-04'
      }
    });
    longFuneralId = body.eventId;
  });

  await test('A عرس on day two of a four-day عزا is detected — range intersection, not date equality', async () => {
    const { body } = await api('POST', '/api/check-collision', {
      body: { date: '2027-08-02', town: collisionTown, occasion_type_id: weddingType.id }
    });
    assert.strictEqual(body.hasCollision, true);
    assert.ok(body.conflicts.some(c => c.id === longFuneralId));
  });

  await test('A عرس does not collide with a عرس in a different town on the same day', async () => {
    const created = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس بلدة الاختبار' }], town: 'اللقية', event_date: '2028-02-20' })
    });
    const eventId = created.body.eventId;

    const { body } = await api('POST', '/api/check-collision', {
      body: { date: '2028-02-20', town: 'تل السبع', occasion_type_id: weddingType.id }
    });
    assert.strictEqual(body.hasCollision, false);

    await api('DELETE', `/api/admin/events/${eventId}`, { token: adminToken });
  });

  await test('Set up: a wedding published on a free day', async () => {
    const created = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس إعادة الفحص' }], town: collisionTown, event_date: '2027-10-01' })
    });
    recheckEventId = created.body.eventId;
    const approve = await api('PATCH', `/api/admin/events/${recheckEventId}/status`, {
      token: adminToken,
      body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);
  });

  await test('Changing the date to a day now booked by a عزا produces a fresh collision warning not seen at creation', async () => {
    const { status, body } = await api('PATCH', `/api/events/${recheckEventId}`, {
      token: userToken,
      body: { event_date: '2027-08-02' } // inside the four-day funeral window set up above
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'critical');
    assert.ok(body.collision, 'expected a collision object in the response');
    assert.strictEqual(body.collision.hasCollision, true);
    assert.ok(body.collision.conflicts.some(c => c.id === longFuneralId));
  });

  await test('The legacy check-collision shape (date + town only, no occasion_type_id) still works', async () => {
    const { status, body } = await api('POST', '/api/check-collision', {
      body: { date: '2027-07-01', town: collisionTown }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.hasCollision, true);
  });

  await db.execute('DELETE FROM events WHERE id IN (?, ?, ?, ?)', [funeralA, funeralB, longFuneralId, recheckEventId]);

  console.log('\nCoordinate migration');
  const insertWithCoords = async (town, lat, lng, eventDate) => {
    const { insertId } = await db.execute(
      `INSERT INTO events
         (title, groom_name, family_clan, town, location_name, latitude, longitude, event_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
      ['اختبار الترحيل', 'عريس الترحيل', 'عائلة الترحيل', town, 'ديوان الاختبار', lat, lng, eventDate]
    );
    return insertId;
  };

  await test('Migration moves a row still carrying the old placeholder coordinates', async () => {
    const insertId = await insertWithCoords('كسيفة', 31.2980, 35.0310, '2027-01-01');
    await migrate();
    const row = await db.queryOne('SELECT latitude, longitude FROM events WHERE id = ?', [insertId]);
    assert.strictEqual(Number(row.latitude), 31.245249);
    assert.strictEqual(Number(row.longitude), 35.095151);
    await db.execute('DELETE FROM events WHERE id = ?', [insertId]);
  });

  await test('Migration does not touch a row with a human-chosen coordinate', async () => {
    const insertId = await insertWithCoords('كسيفة', 31.25, 35.1, '2027-01-02');
    await migrate();
    const row = await db.queryOne('SELECT latitude, longitude FROM events WHERE id = ?', [insertId]);
    assert.strictEqual(Number(row.latitude), 31.25);
    assert.strictEqual(Number(row.longitude), 35.1);
    await db.execute('DELETE FROM events WHERE id = ?', [insertId]);
  });

  await test("Migration drops the pin for a 'القرى والتجمعات' row carrying the old placeholder", async () => {
    const insertId = await insertWithCoords('القرى والتجمعات', 31.2600, 34.8800, '2027-01-05');
    await migrate();
    const row = await db.queryOne('SELECT latitude, longitude FROM events WHERE id = ?', [insertId]);
    assert.strictEqual(row.latitude, null);
    assert.strictEqual(row.longitude, null);
    await db.execute('DELETE FROM events WHERE id = ?', [insertId]);
  });

  await test('Running the migration twice is safe and converges to the same result', async () => {
    const insertId = await insertWithCoords('كسيفة', 31.2980, 35.0310, '2027-01-03');
    await migrate();
    const first = await db.queryOne('SELECT latitude, longitude FROM events WHERE id = ?', [insertId]);
    await migrate();
    const second = await db.queryOne('SELECT latitude, longitude FROM events WHERE id = ?', [insertId]);
    assert.strictEqual(Number(first.latitude), Number(second.latitude));
    assert.strictEqual(Number(first.longitude), Number(second.longitude));
    assert.strictEqual(Number(second.latitude), 31.245249);
    await db.execute('DELETE FROM events WHERE id = ?', [insertId]);
  });

  // Behaviour change (services-directory spec): publishing under the
  // catch-all town used to be accepted with no pin at all. It now REQUIRES a
  // village_id — the three tests below replace the old single test with the
  // new truth: a village-less publish under the catch-all is rejected (case
  // 9), a still-existing legacy row with a NULL village_id (which no publish
  // path can produce any more, so it is created directly here) keeps its
  // no-pin behaviour, and a fresh village-backed publish gets a real pin
  // (case 11).
  await test("Publishing under 'القرى والتجمعات' with no village_id is rejected (case 9)", async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس بلا قرية' }],
        town: 'القرى والتجمعات',
        event_date: '2027-01-04'
      })
    });
    assert.strictEqual(status, 400);
    assert.ok(/القرية/.test(body.message || ''), `expected a village-related Arabic message, got: ${body.message}`);
  });

  await test("A legacy row under 'القرى والتجمعات' with a NULL village_id — inserted directly, since no publish path can produce one any more — still gets no pin", async () => {
    const { insertId } = await db.execute(
      `INSERT INTO events (title, groom_name, family_clan, occasion_type_id, town, village_id, location_name, event_date, status)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'approved')`,
      ['مناسبة قرية قديمة', 'عريس قديم بلا قرية', 'عائلة الاختبار', weddingType.id, 'القرى والتجمعات', 'ديوان الاختبار', '2027-01-05']
    );
    const row = await db.queryOne('SELECT latitude, longitude, village_id FROM events WHERE id = ?', [insertId]);
    assert.strictEqual(row.village_id, null);
    assert.strictEqual(row.latitude, null);
    assert.strictEqual(row.longitude, null);
    await db.execute('DELETE FROM events WHERE id = ?', [insertId]);
  });

  let villageFixtureId = 0;
  await test("An event published in a village inherits that village's coordinates and gets a real pin (case 11)", async () => {
    const villageCreate = await api('POST', '/api/admin/villages', {
      token: superAdminToken,
      body: { name: `قرية الاختبار ${Date.now()}`, latitude: 31.11, longitude: 34.91 }
    });
    assert.strictEqual(villageCreate.status, 201);
    villageFixtureId = villageCreate.body.village.id;

    const { status, body: created } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس القرية' }],
        town: 'القرى والتجمعات',
        village_id: villageFixtureId,
        event_date: '2027-01-06'
      })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(created.status, 'approved');

    const { body } = await api('GET', `/api/events/${created.eventId}`);
    assert.strictEqual(Number(body.event.latitude), 31.11);
    assert.strictEqual(Number(body.event.longitude), 34.91);

    await api('DELETE', `/api/admin/events/${created.eventId}`, { token: adminToken });
    // villageFixtureId itself is left in place — case 10 further down reuses
    // it, then deletes it once it's no longer needed.
  });

  // Publishing into a village derives the pin; EDITING into a different one
  // must move it too, or the row keeps coordinates that point at the village
  // it is no longer in — the exact wrong-pin failure villages exist to fix.
  await test('Editing an event to a different village moves its pin as well as its village', async () => {
    const first = await api('POST', '/api/admin/villages', {
      token: superAdminToken,
      body: { name: `قرية الانتقال أ ${Date.now()}`, latitude: 31.21, longitude: 34.81 }
    });
    const second = await api('POST', '/api/admin/villages', {
      token: superAdminToken,
      body: { name: `قرية الانتقال ب ${Date.now()}`, latitude: 31.42, longitude: 34.62 }
    });
    assert.strictEqual(first.status, 201);
    assert.strictEqual(second.status, 201);

    const { body: created } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس ينتقل بين قريتين' }],
        town: 'القرى والتجمعات',
        village_id: first.body.village.id,
        event_date: '2027-01-07'
      })
    });
    const before = await api('GET', `/api/events/${created.eventId}`);
    assert.strictEqual(Number(before.body.event.latitude), 31.21);

    const patched = await api('PATCH', `/api/events/${created.eventId}`, {
      token: adminToken,
      body: { village_id: second.body.village.id }
    });
    assert.strictEqual(patched.status, 200);

    const after = await api('GET', `/api/events/${created.eventId}`);
    assert.strictEqual(Number(after.body.event.latitude), 31.42);
    assert.strictEqual(Number(after.body.event.longitude), 34.62);

    await api('DELETE', `/api/admin/events/${created.eventId}`, { token: adminToken });
    await api('DELETE', `/api/admin/villages/${first.body.village.id}`, { token: superAdminToken });
    await api('DELETE', `/api/admin/villages/${second.body.village.id}`, { token: superAdminToken });
  });


  console.log('\nFile upload: the multipart path both clients actually use');

  function uploadFields(overrides = {}) {
    return {
      occasion_type_id: String(weddingType.id),
      'honorees[0][name]': 'عريس الرفع',
      town: 'حورة',
      location_name: 'ديوان الاختبار',
      event_date: '2027-07-01',
      ...overrides
    };
  }

  await test('A poster uploads and comes back as an absolute URL, not a relative one', async () => {
    const { status, body } = await apiUpload('/api/events', {
      token: adminToken,
      fields: uploadFields(),
      files: [{ field: 'poster', buffer: TINY_PNG, type: 'image/png', name: 'p.png' }]
    });
    assert.strictEqual(status, 201);

    const { body: fetched } = await api('GET', `/api/events/${body.eventId}`);
    assert.ok(/^https?:\/\//.test(fetched.event.poster_url), `poster_url must be absolute, got: ${fetched.event.poster_url}`);
    await api('DELETE', `/api/admin/events/${body.eventId}`, { token: adminToken });
  });

  await test('PATCH replaces a poster from an uploaded file, not only from a URL', async () => {
    const created = await apiUpload('/api/events', {
      token: adminToken,
      fields: uploadFields({ 'honorees[0][name]': 'عريس تبديل الملصق' }),
      files: [{ field: 'poster', buffer: TINY_PNG, type: 'image/png', name: 'first.png' }]
    });
    assert.strictEqual(created.status, 201);

    const before = await api('GET', `/api/events/${created.body.eventId}`);
    const originalPoster = before.body.event.poster_url;

    const patched = await apiUpload(`/api/events/${created.body.eventId}`, {
      method: 'PATCH',
      token: adminToken,
      files: [{ field: 'poster', buffer: TINY_PNG, type: 'image/png', name: 'second.png' }]
    });
    assert.strictEqual(patched.status, 200, `expected the multipart PATCH to succeed, got ${patched.status}: ${patched.body.message}`);

    const after = await api('GET', `/api/events/${created.body.eventId}`);
    assert.ok(
      after.body.event.poster_url && after.body.event.poster_url !== originalPoster,
      `the uploaded file must replace the poster — before: ${originalPoster}, after: ${after.body.event.poster_url}`
    );
    assert.ok(/^https?:\/\//.test(after.body.event.poster_url), 'and it must still come back absolute');

    await api('DELETE', `/api/admin/events/${created.body.eventId}`, { token: adminToken });
  });

  await test('A JSON PATCH still works now that the route carries multer — the old path must not regress', async () => {
    const created = await apiUpload('/api/events', {
      token: adminToken,
      fields: uploadFields({ 'honorees[0][name]': 'عريس التعديل النصّي' })
    });
    assert.strictEqual(created.status, 201);

    const { status, body } = await api('PATCH', `/api/events/${created.body.eventId}`, {
      token: adminToken,
      body: { title: 'عنوان بعد التعديل' }
    });
    assert.strictEqual(status, 200, `a JSON PATCH must still be accepted, got ${status}: ${body.message}`);

    const after = await api('GET', `/api/events/${created.body.eventId}`);
    assert.strictEqual(after.body.event.title, 'عنوان بعد التعديل');

    await api('DELETE', `/api/admin/events/${created.body.eventId}`, { token: adminToken });
  });

  await test('A poster and an artist image upload together — three file fields are now allowed, not two', async () => {
    const { status, body } = await apiUpload('/api/events', {
      token: adminToken,
      fields: uploadFields({ artist_name: 'فنان الاختبار' }),
      files: [
        { field: 'poster', buffer: TINY_PNG, type: 'image/png', name: 'p.png' },
        { field: 'artist_image', buffer: TINY_PNG, type: 'image/png', name: 'a.png' }
      ]
    });
    assert.strictEqual(status, 201);

    const { body: fetched } = await api('GET', `/api/events/${body.eventId}`);
    assert.strictEqual(fetched.event.artist_name, 'فنان الاختبار');
    assert.ok(/^https?:\/\//.test(fetched.event.artist_image_url), 'artist_image_url must be absolute too');
    await api('DELETE', `/api/admin/events/${body.eventId}`, { token: adminToken });
  });

  await test('A file whose type is not on the allowlist is rejected with a message that names what IS accepted', async () => {
    const { status, body } = await apiUpload('/api/events', {
      token: adminToken,
      fields: uploadFields(),
      files: [{ field: 'poster', buffer: TINY_PNG, type: 'image/heic', name: 'photo.heic' }]
    });
    assert.strictEqual(status, 400);
    assert.ok(/JPG/.test(body.message || ''), `the rejection must name the accepted formats, got: ${body.message}`);
  });

  await test('A file sent under an unknown field name is rejected rather than silently stored', async () => {
    const { status } = await apiUpload('/api/events', {
      token: adminToken,
      fields: uploadFields(),
      files: [{ field: 'image', buffer: TINY_PNG, type: 'image/png', name: 'x.png' }]
    });
    assert.strictEqual(status, 400);
  });

  console.log('\nMap picker: server-side town mismatch warning + coordinate validation (#20 step 6)');

  await test('A pin inside the chosen town gets no location_warning on publish', async () => {
    const { body: created } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس داخل بلدته' }],
        town: 'حورة',
        latitude: 31.298567,
        longitude: 34.926782,
        event_date: '2027-02-01'
      })
    });
    assert.strictEqual(created.status, 'approved');
    assert.strictEqual(created.location_warning, null);
    await api('DELETE', `/api/admin/events/${created.eventId}`, { token: adminToken });
  });

  let mismatchEventId = 0;
  await test('A pin nearer another town gets a location_warning, but publishes with the chosen town untouched (no rejection, no auto-correction)', async () => {
    const { status, body: created } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس بعيد عن بلدته' }],
        town: 'حورة',
        // Exactly عرعرة النقب's own centre — unmistakably nearer to it than to حورة.
        latitude: 31.157671,
        longitude: 35.013021,
        event_date: '2027-02-02'
      })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(created.status, 'approved');
    assert.ok(created.location_warning, 'expected a location_warning');
    assert.strictEqual(created.location_warning.nearest_town, 'عرعرة النقب');

    const { body } = await api('GET', `/api/events/${created.eventId}`);
    assert.strictEqual(body.event.town, 'حورة', 'the chosen town must not be auto-corrected');
    mismatchEventId = created.eventId;
  });

  await test('The same mismatch is re-detected on an edit that moves the pin further from the chosen town', async () => {
    const { status, body } = await api('PATCH', `/api/events/${mismatchEventId}`, {
      token: adminToken,
      body: { latitude: 31.157671, longitude: 35.013021 }
    });
    assert.strictEqual(status, 200);
    assert.ok(body.location_warning, 'expected a location_warning on edit');
    assert.strictEqual(body.location_warning.nearest_town, 'عرعرة النقب');
  });

  await test('An edit that does not touch latitude/longitude/town carries no location_warning', async () => {
    const { status, body } = await api('PATCH', `/api/events/${mismatchEventId}`, {
      token: adminToken,
      body: { dinner_time: 'الساعة 9:00 مساءً' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.location_warning, null);
    await api('DELETE', `/api/admin/events/${mismatchEventId}`, { token: adminToken });
  });

  await test('An explicit but out-of-range latitude is rejected with an Arabic message', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'إحداثية غير صالحة' }], latitude: 999, event_date: '2027-02-03' })
    });
    assert.strictEqual(status, 400);
    assert.ok(/[؀-ۿ]/.test(body.message || ''), 'expected an Arabic error message');
  });

  await test('An explicit, non-numeric longitude is rejected the same way', async () => {
    const { status } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'خط طول غير رقمي' }], longitude: 'abc', event_date: '2027-02-04' })
    });
    assert.strictEqual(status, 400);
  });

  await test('Publishing with no coordinates at all is still accepted, falling back to the town centre as before', async () => {
    const { status, body: created } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس بلا إحداثيات صريحة' }], town: 'حورة', event_date: '2027-02-05' })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(created.location_warning, null);
    const { body } = await api('GET', `/api/events/${created.eventId}`);
    assert.strictEqual(Number(body.event.latitude), 31.298567);
    assert.strictEqual(Number(body.event.longitude), 34.926782);
    await api('DELETE', `/api/admin/events/${created.eventId}`, { token: adminToken });
  });

  await test('A relative sticker URL comes back absolute, like every other media column', async () => {
    const wedding = (await api('GET', '/api/occasion-types')).body.types.find(t => t.name === 'عرس');
    const { body: made } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: wedding.id,
        honorees: [{ name: 'عريس الملصقات' }],
        town: 'رهط', location_name: 'الديوان', event_date: '2027-07-07'
      }
    });

    await api('POST', `/api/events/${made.eventId}/congratulate`, {
      token: adminToken,
      body: { message: 'مبروك', sticker_url: '/uploads/sticker-test.png' }
    });

    const { body } = await api('GET', `/api/events/${made.eventId}`);
    const sticker = body.event.congratulations[0].sticker_url;
    assert.ok(sticker.startsWith('http'), `sticker stayed relative: ${sticker}`);

    await api('DELETE', `/api/admin/events/${made.eventId}`, { token: adminToken });
  });

  console.log('\nModeration flow');

  // Behaviour change: publishing used to be public (no token) and always
  // landed in the moderation queue. It now requires authentication —
  // ownership is built from the publish itself — so an anonymous submission
  // is rejected outright instead of queued.
  await test('POST /api/events without a token is rejected (publishing now requires an account)', async () => {
    const { status } = await api('POST', '/api/events', { body: weddingEventBody() });
    assert.strictEqual(status, 401);
  });

  let createdEventId = 0;
  await test('A logged-in (non-admin) submission lands in the pending queue', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس الاختبار' }] })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.status, 'pending');
    createdEventId = body.eventId;
  });

  await test('A pending event is hidden from the public list', async () => {
    const { body } = await api('GET', '/api/events');
    assert.ok(!body.events.some(e => e.id === createdEventId));
  });

  await test('An admin submission publishes immediately', async () => {
    const { body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس الإدارة' }],
        town: 'كسيفة',
        location_name: 'ديوان الإدارة',
        event_date: '2026-12-30'
      })
    });
    assert.strictEqual(body.status, 'approved');
    await api('DELETE', `/api/admin/events/${body.eventId}`, { token: adminToken });
  });

  await test('An unknown town is rejected', async () => {
    const { status } = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ town: 'مدينة وهمية' })
    });
    assert.strictEqual(status, 400);
  });

  await test('PATCH /api/admin/events/:id/status approves the event', async () => {
    const { status } = await api('PATCH', `/api/admin/events/${createdEventId}/status`, {
      token: adminToken,
      body: { status: 'approved' }
    });
    assert.strictEqual(status, 200);
    const { body } = await api('GET', '/api/events');
    assert.ok(body.events.some(e => e.id === createdEventId), 'approved event should be public');
  });

  await test('Reactions and congratulations attach to the event', async () => {
    await api('POST', `/api/events/${createdEventId}/react`, { body: { reaction_type: 'coffee' } });
    // Behaviour change (#20 step 5): congratulating now requires a login.
    await api('POST', `/api/events/${createdEventId}/congratulate`, {
      token: userToken,
      body: { message: 'مبروك' }
    });
    const { body } = await api('GET', `/api/events/${createdEventId}`);
    assert.strictEqual(body.event.reactions.coffee, 1);
    assert.strictEqual(body.event.congratulations.length, 1);
  });

  await test('An invalid reaction type is rejected', async () => {
    const { status } = await api('POST', `/api/events/${createdEventId}/react`, {
      body: { reaction_type: 'rocket' }
    });
    assert.strictEqual(status, 400);
  });

  await test('DELETE /api/admin/events/:id cascades to child rows', async () => {
    const { status } = await api('DELETE', `/api/admin/events/${createdEventId}`, { token: adminToken });
    assert.strictEqual(status, 200);
    const orphans = await db.query('SELECT COUNT(*) AS total FROM congratulations WHERE event_id = ?', [createdEventId]);
    assert.strictEqual(Number(orphans[0].total), 0);
  });

  await test('An unknown API route returns 404 JSON', async () => {
    const { status, body } = await api('GET', '/api/does-not-exist');
    assert.strictEqual(status, 404);
    assert.strictEqual(body.success, false);
  });

  console.log('\nCongratulations: accountability, premoderation, owner review, reporting (#20 step 5)');

  const { body: anyList } = await api('GET', '/api/events?limit=1');
  const anyEventId = anyList.events[0].id;

  await test('POST /api/events/:id/congratulate without a token is rejected', async () => {
    const { status } = await api('POST', `/api/events/${anyEventId}/congratulate`, {
      body: { message: 'مبروك' }
    });
    assert.strictEqual(status, 401);
  });

  let cOwner = null;
  let cFuneralEventId = 0;
  await test('Set up: a regular (non-admin) user publishes a عزا, the admin approves the event itself', async () => {
    cOwner = await registerTestUser('صاحب مناسبة مراجعة التبريكات');

    const created = await api('POST', '/api/events', {
      token: cOwner.token,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى مراجعة التبريكات' }],
        town: 'رهط',
        location_name: 'ديوان الاختبار',
        event_date: '2027-11-01',
        event_end_date: '2027-11-04'
      }
    });
    cFuneralEventId = created.body.eventId;

    const approved = await api('PATCH', `/api/admin/events/${cFuneralEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approved.status, 200);
  });

  let cWellWisher = null;
  let cPendingId = 0;
  await test('A تعزية on this عزا is created pending, with no injected festive badge, sender_name from the account', async () => {
    cWellWisher = await registerTestUser('مهنّئ مراجعة التبريكات');

    const { status, body } = await api('POST', `/api/events/${cFuneralEventId}/congratulate`, {
      token: cWellWisher.token,
      body: { sender_name: 'اسم منتحَل', message: 'تعازينا الحارة' }
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.comment.status, 'pending');
    assert.strictEqual(body.comment.sender_name, cWellWisher.full_name, 'sender_name must come from the account, not the body');
    assert.strictEqual(body.comment.badge_title, '', 'no festive badge (مبارك الفرح / صديق العريس) may be injected on a عزا');
    cPendingId = body.comment.id;
  });

  await test('The public (no token) does not see the pending تعزية', async () => {
    const { body } = await api('GET', `/api/events/${cFuneralEventId}`);
    assert.ok(!body.event.congratulations.some(c => c.id === cPendingId));
  });

  await test('The sender sees their own pending تعزية; a different logged-in visitor does not', async () => {
    const senderView = await api('GET', `/api/events/${cFuneralEventId}`, { token: cWellWisher.token });
    assert.ok(senderView.body.event.congratulations.some(c => c.id === cPendingId));

    const otherView = await api('GET', `/api/events/${cFuneralEventId}`, { token: userToken });
    assert.ok(!otherView.body.event.congratulations.some(c => c.id === cPendingId));
  });

  await test('A non-owner, non-admin is rejected (403) from approving, deleting, or reading the moderation queue', async () => {
    const approveAttempt = await api('PATCH', `/api/events/${cFuneralEventId}/congratulations/${cPendingId}`, {
      token: userToken, body: { action: 'approve' }
    });
    assert.strictEqual(approveAttempt.status, 403);

    const deleteAttempt = await api('DELETE', `/api/events/${cFuneralEventId}/congratulations/${cPendingId}`, {
      token: userToken
    });
    assert.strictEqual(deleteAttempt.status, 403);

    const readAttempt = await api('GET', `/api/events/${cFuneralEventId}/congratulations`, { token: userToken });
    assert.strictEqual(readAttempt.status, 403);
  });

  await test('GET .../congratulations rejects an unknown ?status= filter', async () => {
    const { status } = await api('GET', `/api/events/${cFuneralEventId}/congratulations?status=bogus`, { token: cOwner.token });
    assert.strictEqual(status, 400);
  });

  await test('The owner approves the pending تعزية — no admin involved — and it is now publicly visible', async () => {
    const { status, body } = await api('PATCH', `/api/events/${cFuneralEventId}/congratulations/${cPendingId}`, {
      token: cOwner.token, body: { action: 'approve' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.comment.status, 'approved');

    const publicView = await api('GET', `/api/events/${cFuneralEventId}`);
    assert.ok(publicView.body.event.congratulations.some(c => c.id === cPendingId));
  });

  await test('A second تعزية is approved by an admin instead of the owner', async () => {
    const posted = await api('POST', `/api/events/${cFuneralEventId}/congratulate`, {
      token: userToken, body: { message: 'رحمه الله وأسكنه فسيح جناته' }
    });
    assert.strictEqual(posted.body.comment.status, 'pending');

    const { status, body } = await api('PATCH', `/api/events/${cFuneralEventId}/congratulations/${posted.body.comment.id}`, {
      token: adminToken, body: { action: 'approve' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.comment.status, 'approved');
  });

  await test('The owner can also reject a pending تعزية — it becomes hidden, not shown publicly', async () => {
    const posted = await api('POST', `/api/events/${cFuneralEventId}/congratulate`, {
      token: userToken, body: { message: 'رسالة سيتم رفضها' }
    });
    const rejectId = posted.body.comment.id;

    const { status, body } = await api('PATCH', `/api/events/${cFuneralEventId}/congratulations/${rejectId}`, {
      token: cOwner.token, body: { action: 'reject' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.comment.status, 'hidden');

    const publicView = await api('GET', `/api/events/${cFuneralEventId}`);
    assert.ok(!publicView.body.event.congratulations.some(c => c.id === rejectId));
  });

  let cWeddingEventId = 0;
  let cWeddingCongratId = 0;
  await test('The same owner also publishes an approved عرس — ownership is not type-bound', async () => {
    const created = await api('POST', '/api/events', {
      token: cOwner.token,
      body: weddingEventBody({ honorees: [{ name: 'عريس مراجعة التبريكات' }], town: 'رهط', event_date: '2027-11-05' })
    });
    cWeddingEventId = created.body.eventId;

    const approved = await api('PATCH', `/api/admin/events/${cWeddingEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approved.status, 200);
  });

  await test('A congratulation on this عرس publishes immediately — no premoderation outside عزا', async () => {
    const { status, body } = await api('POST', `/api/events/${cWeddingEventId}/congratulate`, {
      token: userToken, body: { message: 'ألف مبروك' }
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.comment.status, 'approved');
    cWeddingCongratId = body.comment.id;

    const publicView = await api('GET', `/api/events/${cWeddingEventId}`);
    assert.ok(publicView.body.event.congratulations.some(c => c.id === cWeddingCongratId));
  });

  await test('The owner (a non-admin) deletes it — an ownership right, not an admin-only power, even in a type that never premoderates', async () => {
    const { status } = await api('DELETE', `/api/events/${cWeddingEventId}/congratulations/${cWeddingCongratId}`, {
      token: cOwner.token
    });
    assert.strictEqual(status, 200);

    const publicView = await api('GET', `/api/events/${cWeddingEventId}`);
    assert.ok(!publicView.body.event.congratulations.some(c => c.id === cWeddingCongratId));
  });

  console.log('\nCongratulations: reporting');

  let cReportEventId = 0;
  let cReportCongratId = 0;
  await test('Set up: a fresh, never-reviewed (auto-approved) congratulation to report', async () => {
    const created = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس اختبار الإبلاغ' }], town: 'رهط', event_date: '2027-11-06' })
    });
    cReportEventId = created.body.eventId;

    const posted = await api('POST', `/api/events/${cReportEventId}/congratulate`, {
      token: userToken, body: { message: 'رسالة سيتم الإبلاغ عنها' }
    });
    assert.strictEqual(posted.body.comment.status, 'approved');
    cReportCongratId = posted.body.comment.id;
  });

  const cReporters = [];
  await test(`Set up: ${CONGRATULATION_REPORT_THRESHOLD} distinct reporter accounts`, async () => {
    for (let i = 0; i < CONGRATULATION_REPORT_THRESHOLD; i += 1) {
      cReporters.push(await registerTestUser(`مبلّغ ${i + 1}`));
    }
  });

  await test('Reports under the threshold do not hide the message', async () => {
    for (let i = 0; i < CONGRATULATION_REPORT_THRESHOLD - 1; i += 1) {
      const { status, body } = await api(
        'POST', `/api/events/${cReportEventId}/congratulations/${cReportCongratId}/report`,
        { token: cReporters[i].token }
      );
      assert.strictEqual(status, 200);
      assert.strictEqual(body.status, 'approved');
    }

    const publicView = await api('GET', `/api/events/${cReportEventId}`);
    assert.ok(publicView.body.event.congratulations.some(c => c.id === cReportCongratId), 'still visible below the threshold');
  });

  await test('The same person reporting twice is rejected (409) and does not double the count', async () => {
    const { status } = await api(
      'POST', `/api/events/${cReportEventId}/congratulations/${cReportCongratId}/report`,
      { token: cReporters[0].token }
    );
    assert.strictEqual(status, 409);
  });

  await test('The report that crosses the threshold auto-hides the message', async () => {
    const last = cReporters[CONGRATULATION_REPORT_THRESHOLD - 1];
    const { status, body } = await api(
      'POST', `/api/events/${cReportEventId}/congratulations/${cReportCongratId}/report`,
      { token: last.token }
    );
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'hidden');

    const publicView = await api('GET', `/api/events/${cReportEventId}`);
    assert.ok(!publicView.body.event.congratulations.some(c => c.id === cReportCongratId), 'hidden once past the threshold');
  });

  // Behaviour change (services-directory spec): DELETE /api/admin/comments/:id
  // hard-deleted a row and bypassed the moderation system (status='hidden' +
  // moderated_by) built in #20 step 5. The route is gone outright — replaced
  // by the town-admin-aware PATCH .../congratulations/:cid (action: 'reject')
  // exercised in the "Comments: a town-scoped admin's hide..." section below
  // (case 19).
  await test('DELETE /api/admin/comments/:id is gone (case 19) — the hard-delete route was removed, the row is not', async () => {
    const { status, body } = await api('DELETE', `/api/admin/comments/${cReportCongratId}`, { token: adminToken });
    assert.strictEqual(status, 404);
    assert.strictEqual(body.success, false);
    const row = await db.queryOne('SELECT id FROM congratulations WHERE id = ?', [cReportCongratId]);
    assert.ok(row, 'the comment must still exist — only the hard-delete route is gone');
  });

  await db.execute(
    'DELETE FROM events WHERE id IN (?, ?, ?)',
    [cFuneralEventId, cWeddingEventId, cReportEventId]
  );
  for (const p of congratsCleanupPhones) {
    await db.execute('DELETE FROM users WHERE phone_number = ?', [p]);
  }

  console.log('\nذكّرني، إعلانات تعديل التاريخ، وسجلّ الإشعارات (#20 خطوة 7)');

  let reminderOwner = null;
  let reminderFollower = null;
  let reminderOther = null;
  let reminderOwnerApprovedBefore = 0;
  let reminderOwnerApprovedAfter = 0;
  let reminderEventId = 0;

  await test('Set up: an owner publishes an approved wedding for the reminder/announcement/notification tests', async () => {
    reminderOwner = await registerTestUser('مالك مناسبة التذكير');
    reminderFollower = await registerTestUser('متابع مناسبة التذكير');
    reminderOther = await registerTestUser('مستخدم بلا علاقة بالتذكير');

    const created = await api('POST', '/api/events', {
      token: reminderOwner.token,
      body: weddingEventBody({ honorees: [{ name: 'عريس التذكير' }], town: 'رهط', event_date: '2027-09-01' })
    });
    reminderEventId = created.body.eventId;

    const approve = await api('PATCH', `/api/admin/events/${reminderEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);
  });

  await test('POST/DELETE .../remind toggles "ذكّرني", and re-pressing an active reminder does not duplicate the row', async () => {
    const first = await api('POST', `/api/events/${reminderEventId}/remind`, { token: reminderFollower.token });
    assert.strictEqual(first.status, 200);
    const again = await api('POST', `/api/events/${reminderEventId}/remind`, { token: reminderFollower.token });
    assert.strictEqual(again.status, 200);

    const rows = await db.query(
      'SELECT * FROM event_reminders WHERE event_id = ? AND user_id = ?', [reminderEventId, reminderFollower.id]
    );
    assert.strictEqual(rows.length, 1, 'a repeated remind must not duplicate the row');

    const removed = await api('DELETE', `/api/events/${reminderEventId}/remind`, { token: reminderFollower.token });
    assert.strictEqual(removed.status, 200);
    const afterDelete = await db.query(
      'SELECT * FROM event_reminders WHERE event_id = ? AND user_id = ?', [reminderEventId, reminderFollower.id]
    );
    assert.strictEqual(afterDelete.length, 0);

    // Leave the reminder active for the tests below.
    await api('POST', `/api/events/${reminderEventId}/remind`, { token: reminderFollower.token });
  });

  await test('followers_count shows on a عرس event and disappears when show_followers_count is off — by the flag, not the type name', async () => {
    const before = await api('GET', `/api/events/${reminderEventId}`);
    assert.ok('followers_count' in before.body.event, 'expected followers_count on عرس');

    await api('PATCH', `/api/admin/occasion-types/${weddingType.id}`, {
      token: superAdminToken, body: { show_followers_count: false }
    });
    const hidden = await api('GET', `/api/events/${reminderEventId}`);
    assert.ok(!('followers_count' in hidden.body.event), 'expected the counter dropped entirely, not zeroed');

    await api('PATCH', `/api/admin/occasion-types/${weddingType.id}`, {
      token: superAdminToken, body: { show_followers_count: true }
    });
    const restored = await api('GET', `/api/events/${reminderEventId}`);
    assert.ok('followers_count' in restored.body.event);
  });

  await test('عزا is seeded with show_followers_count off, so it never carries followers_count — one death is never compared to another', async () => {
    const { body: types } = await api('GET', '/api/admin/occasion-types', { token: superAdminToken });
    const funeralAdmin = types.types.find(t => t.id === funeralType.id);
    assert.strictEqual(funeralAdmin.show_followers_count, false);

    const created = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى اختبار المتابعين' }],
        town: 'رهط',
        location_name: 'ديوان الاختبار',
        event_date: '2027-09-30',
        event_end_date: '2027-10-01'
      }
    });
    assert.strictEqual(created.body.status, 'approved');

    const { body } = await api('GET', `/api/events/${created.body.eventId}`);
    assert.ok(!('followers_count' in body.event));

    await api('DELETE', `/api/admin/events/${created.body.eventId}`, { token: adminToken });
  });

  await test('is_reminded is true for the following user, false for a stranger, and false/absent for a guest', async () => {
    const followerView = await api('GET', `/api/events/${reminderEventId}`, { token: reminderFollower.token });
    assert.strictEqual(followerView.body.event.is_reminded, true);

    const strangerView = await api('GET', `/api/events/${reminderEventId}`, { token: reminderOther.token });
    assert.strictEqual(strangerView.body.event.is_reminded, false);

    const guestView = await api('GET', `/api/events/${reminderEventId}`);
    assert.ok(guestView.body.event.is_reminded === false || guestView.body.event.is_reminded === undefined);
  });

  await test('GET /api/my-reminders returns what this user is following', async () => {
    const { status, body } = await api('GET', '/api/my-reminders', { token: reminderFollower.token });
    assert.strictEqual(status, 200);
    assert.ok(body.events.some(e => e.id === reminderEventId));
  });

  await test('Set up: the owner also reminds their own event — tests self-exclusion even when editor is both owner and follower', async () => {
    const res = await api('POST', `/api/events/${reminderEventId}/remind`, { token: reminderOwner.token });
    assert.strictEqual(res.status, 200);
  });

  await test('A critical event_date edit produces no live announcement until an admin approves it', async () => {
    const edit = await api('PATCH', `/api/events/${reminderEventId}`, {
      token: reminderOwner.token, body: { event_date: '2027-09-15' }
    });
    assert.strictEqual(edit.status, 200);
    assert.strictEqual(edit.body.amendment, 'critical');
    assert.strictEqual(edit.body.status, 'pending');

    const { body } = await api('GET', '/api/events?limit=1');
    assert.ok(!body.announcements.some(a => a.event_id === reminderEventId), 'no announcement before approval');
  });

  await test('Approving that edit publishes the announcement, naming the old and new date', async () => {
    const beforeApproved = await db.queryOne(
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_approved'",
      [reminderOwner.id, reminderEventId]
    );

    const approve = await api('PATCH', `/api/admin/events/${reminderEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const afterApproved = await db.queryOne(
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_approved'",
      [reminderOwner.id, reminderEventId]
    );
    reminderOwnerApprovedBefore = Number(beforeApproved.total);
    reminderOwnerApprovedAfter = Number(afterApproved.total);

    const { body } = await api('GET', '/api/events?limit=1');
    const announcement = body.announcements.find(a => a.event_id === reminderEventId);
    assert.ok(announcement, 'expected a live announcement after approval');
    assert.strictEqual(announcement.old_value, '2027-09-01');
    assert.strictEqual(announcement.new_value, '2027-09-15');
    assert.strictEqual(announcement.event.id, reminderEventId);
  });

  await test('The follower is notified; the owner who edited it themself is not, even though they also follow it', async () => {
    const followerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_date_changed'",
      [reminderFollower.id, reminderEventId]
    );
    assert.strictEqual(followerNotifs.length, 1);
    assert.ok(followerNotifs[0].body.includes('2027-09-15'));

    const ownerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_date_changed'",
      [reminderOwner.id, reminderEventId]
    );
    assert.strictEqual(ownerNotifs.length, 0, 'the person who made the edit must never be notified of it');

    // What the owner DOES receive from this same approval, so the claim
    // above reads as "excluded from their own edit specifically", not
    // "excluded from everything about this approval" (issue #85 review,
    // FIX 8a). A delta, not an absolute count — this event has already been
    // approved once before (in the setup step above), so it already carries
    // an earlier event_approved row for the owner.
    assert.strictEqual(
      reminderOwnerApprovedAfter - reminderOwnerApprovedBefore, 1,
      'the owner is still told their event was approved — just not that they themself changed its date'
    );

    const strangerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_date_changed'",
      [reminderOther.id, reminderEventId]
    );
    assert.strictEqual(strangerNotifs.length, 0);
  });

  await test('A second critical date edit — this time by an admin, not the owner — supersedes the first announcement; both rows stay in the table', async () => {
    const edit = await api('PATCH', `/api/events/${reminderEventId}`, {
      token: adminToken, body: { event_date: '2027-09-20' }
    });
    assert.strictEqual(edit.status, 200);
    assert.strictEqual(edit.body.amendment, 'critical');

    const approve = await api('PATCH', `/api/admin/events/${reminderEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const rows = await db.query(
      'SELECT * FROM event_announcements WHERE event_id = ? ORDER BY id ASC', [reminderEventId]
    );
    assert.strictEqual(rows.length, 2, 'expected both announcement rows to remain for audit');
    assert.strictEqual(Number(rows[0].is_current), 0, 'the older announcement must no longer be current');
    assert.strictEqual(Number(rows[1].is_current), 1);

    const { body } = await api('GET', '/api/events?limit=1');
    const matches = body.announcements.filter(a => a.event_id === reminderEventId);
    assert.strictEqual(matches.length, 1, 'only the current announcement is shown, not both');
    assert.strictEqual(matches[0].new_value, '2027-09-20');
  });

  await test('This time both the follower and the owner (neither of them the editor) are notified', async () => {
    const followerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_date_changed'",
      [reminderFollower.id, reminderEventId]
    );
    assert.strictEqual(followerNotifs.length, 2, 'one from each of the two approved date edits');

    const ownerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_date_changed'",
      [reminderOwner.id, reminderEventId]
    );
    assert.strictEqual(ownerNotifs.length, 1, 'the owner is notified this time — the edit was not their own');
  });

  await test('GET /api/notifications returns only this user\'s own rows, and PATCH marks one read', async () => {
    const { status, body } = await api('GET', '/api/notifications', { token: reminderFollower.token });
    assert.strictEqual(status, 200);
    assert.ok(body.notifications.length >= 2);
    // A merged broadcast entry (issue #85, story 30) is never fanned out to a
    // user row, so it structurally carries no `user_id` at all — asserted on
    // that absence itself, not on trusting `type`, so a personal notification
    // that somehow got mislabelled would still fail this (review round 2, FIX 2).
    const broadcastEntries = body.notifications.filter(n => n.type === 'broadcast');
    const personalEntries = body.notifications.filter(n => n.type !== 'broadcast');
    assert.ok(broadcastEntries.every(n => !('user_id' in n)), 'a broadcast entry must carry no user_id at all');
    assert.ok(personalEntries.every(n => n.user_id === reminderFollower.id), "every personal notification must belong to the caller");

    const unread = personalEntries.find(n => !n.is_read);
    assert.ok(unread, 'expected at least one unread personal notification');
    const marked = await api('PATCH', `/api/notifications/${unread.id}/read`, { token: reminderFollower.token });
    assert.strictEqual(marked.status, 200);

    const { body: after } = await api('GET', '/api/notifications', { token: reminderFollower.token });
    assert.ok(after.notifications.find(n => n.type !== 'broadcast' && n.id === unread.id).is_read, 'expected the notification marked read');
  });

  await test('A user cannot read or mark-read another user\'s notification — secrecy at the query itself', async () => {
    const followerNotifs = await db.query('SELECT id FROM notifications WHERE user_id = ? LIMIT 1', [reminderFollower.id]);
    const notifId = followerNotifs[0].id;

    const { status } = await api('PATCH', `/api/notifications/${notifId}/read`, { token: reminderOther.token });
    assert.strictEqual(status, 404, "marking someone else's notification must be indistinguishable from it not existing");

    const strangerList = await api('GET', '/api/notifications', { token: reminderOther.token });
    assert.ok(!strangerList.body.notifications.some(n => n.id === notifId));
  });

  await test('A cosmetic edit produces no announcement and no notification', async () => {
    const beforeAnnouncements = await db.queryOne('SELECT COUNT(*) AS total FROM event_announcements WHERE event_id = ?', [reminderEventId]);
    const beforeNotifs = await db.queryOne('SELECT COUNT(*) AS total FROM notifications WHERE event_id = ?', [reminderEventId]);

    const edit = await api('PATCH', `/api/events/${reminderEventId}`, {
      token: adminToken, body: { title: 'عنوان تجميلي لمناسبة التذكير' }
    });
    assert.strictEqual(edit.status, 200);
    assert.strictEqual(edit.body.amendment, 'cosmetic');

    const afterAnnouncements = await db.queryOne('SELECT COUNT(*) AS total FROM event_announcements WHERE event_id = ?', [reminderEventId]);
    const afterNotifs = await db.queryOne('SELECT COUNT(*) AS total FROM notifications WHERE event_id = ?', [reminderEventId]);
    assert.strictEqual(Number(afterAnnouncements.total), Number(beforeAnnouncements.total));
    assert.strictEqual(Number(afterNotifs.total), Number(beforeNotifs.total));
  });

  await test('A critical edit that is NOT a date change (location) is approved normally, never publishes a date announcement, but does notify as a venue change (issue #85, story 6)', async () => {
    const edit = await api('PATCH', `/api/events/${reminderEventId}`, {
      token: adminToken, body: { location_name: 'قاعة جديدة لاختبار التذكير' }
    });
    assert.strictEqual(edit.status, 200);
    assert.strictEqual(edit.body.amendment, 'critical');
    assert.strictEqual(edit.body.status, 'pending');

    const beforeAnnouncements = await db.queryOne('SELECT COUNT(*) AS total FROM event_announcements WHERE event_id = ?', [reminderEventId]);

    const approve = await api('PATCH', `/api/admin/events/${reminderEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const afterAnnouncements = await db.queryOne('SELECT COUNT(*) AS total FROM event_announcements WHERE event_id = ?', [reminderEventId]);
    assert.strictEqual(Number(afterAnnouncements.total), Number(beforeAnnouncements.total), 'a location amendment must never publish a date announcement');

    // The admin made this edit, not the follower or the owner — both of them
    // (neither the editor) are notified, same audience shape as a date change.
    const followerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_venue_changed'",
      [reminderFollower.id, reminderEventId]
    );
    assert.strictEqual(followerNotifs.length, 1);

    const ownerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_venue_changed'",
      [reminderOwner.id, reminderEventId]
    );
    assert.strictEqual(ownerNotifs.length, 1);

    // ...and nobody else (issue #85 review, FIX 8b — restoring the "and
    // nobody else" guarantee the earlier before/after total count used to
    // give, now that the total itself legitimately grows on this path).
    const strangerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_venue_changed'",
      [reminderOther.id, reminderEventId]
    );
    assert.strictEqual(strangerNotifs.length, 0);
  });

  let legacyAnnouncementEventId = 0;
  await test('An announcement about an occasion type a legacy client cannot render never reaches it', async () => {
    const created = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى إعلان قديم' }],
        town: 'رهط',
        location_name: 'ديوان الاختبار',
        event_date: '2027-10-01',
        event_end_date: '2027-10-03'
      }
    });
    legacyAnnouncementEventId = created.body.eventId;
    assert.strictEqual(created.body.status, 'approved');

    const edit = await api('PATCH', `/api/events/${legacyAnnouncementEventId}`, {
      token: adminToken, body: { event_date: '2027-10-05' }
    });
    assert.strictEqual(edit.body.amendment, 'critical');

    const approve = await api('PATCH', `/api/admin/events/${legacyAnnouncementEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const legacyView = await api('GET', '/api/events?limit=100', { legacy: true });
    assert.ok(!legacyView.body.announcements.some(a => a.event_id === legacyAnnouncementEventId));

    const modernView = await api('GET', '/api/events?limit=100');
    assert.ok(modernView.body.announcements.some(a => a.event_id === legacyAnnouncementEventId));

    await api('DELETE', `/api/admin/events/${legacyAnnouncementEventId}`, { token: adminToken });
  });

  await test("views_count stays a bare counter — repeated views by different identities never write a per-viewer row, and no such table exists", async () => {
    const firstView = await api('GET', `/api/events/${reminderEventId}`, { token: reminderFollower.token });
    const secondView = await api('GET', `/api/events/${reminderEventId}`, { token: reminderOther.token });
    assert.strictEqual(
      secondView.body.event.views_count, firstView.body.event.views_count + 1,
      'each request increments the bare counter regardless of who is viewing'
    );

    const userIdColumns = await db.query(
      `SELECT TABLE_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'user_id'`
    );
    const eventIdColumns = await db.query(
      `SELECT TABLE_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'event_id'`
    );
    // The invariant this assertion guards is specifically about *events* —
    // a per-user view table for a different domain (story_views for stories,
    // broadcast_views for broadcasts, issue #85) does not violate it. Checked
    // by requiring BOTH a user_id column AND an event_id column, rather than
    // hardcoding an ever-growing list of table-name exceptions.
    const tablesWithEventId = new Set(eventIdColumns.map(c => c.TABLE_NAME));
    const eventViewTables = userIdColumns
      .map(c => c.TABLE_NAME)
      .filter(name => /view/i.test(name) && tablesWithEventId.has(name));
    assert.strictEqual(eventViewTables.length, 0, 'expected no per-user "views" table for events anywhere in the schema');
  });

  await test('The live announcement disappears once its event\'s (new) date has passed', async () => {
    await db.execute('UPDATE events SET event_date = ? WHERE id = ?', ['2020-01-01', reminderEventId]);
    const { body } = await api('GET', '/api/events?limit=1');
    assert.ok(!body.announcements.some(a => a.event_id === reminderEventId));
  });

  await db.execute('DELETE FROM events WHERE id = ?', [reminderEventId]);
  for (const u of [reminderOwner, reminderFollower, reminderOther]) {
    await db.execute('DELETE FROM users WHERE phone_number = ?', [u.phone]);
  }

  console.log('\nNotifications — creation, scheduler, daily cap, reminders schedule (issue #85 batch 3)');

  /** Adds `days` (may be negative) to a `YYYY-MM-DD` string, in UTC — plain calendar arithmetic, no time-of-day involved. */
  function addDaysToDate(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // Read from the DB itself, not from Node's own clock — DATEDIFF(event_date,
  // CURDATE()) inside the scheduler is what actually decides an offset, so
  // every date this section builds is relative to the same CURDATE() the
  // scheduler will see, never to a possibly different local wall clock.
  const { today: schedulerToday } = await db.queryOne("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");

  // Inserted straight into the DB and signed locally, not through
  // /api/auth/register — same reasoning as the story-viewer setup earlier in
  // this file: the suite's shared authLimiter budget (20 requests/window
  // across register+login+admin/login) is already spent by this point.
  async function createDirectUser(fullName) {
    const phoneNumber = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { insertId } = await db.execute(
      `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'user')`,
      [phoneNumber, fullName, 'x', 'رهط']
    );
    return {
      id: insertId,
      phone: phoneNumber,
      token: signToken({ id: insertId, phone_number: phoneNumber, full_name: fullName, role: 'user' }, '1h')
    };
  }

  let soonFollower = null;
  let soonWeddingEventId = 0;
  let soonFuneralEventId = 0;

  await test('Set up: a followed wedding 3 days away, and a followed funeral 3 days away (notify_countdown off)', async () => {
    soonFollower = await createDirectUser('متابع مناسبات العدّاد');

    const wedding = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس العدّاد' }], town: 'رهط',
        event_date: addDaysToDate(schedulerToday, 3)
      })
    });
    soonWeddingEventId = wedding.body.eventId;
    assert.strictEqual(wedding.body.status, 'approved');

    const funeral = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى اختبار العدّاد' }],
        town: 'رهط',
        location_name: 'ديوان الاختبار',
        event_date: addDaysToDate(schedulerToday, 3),
        event_end_date: addDaysToDate(schedulerToday, 4)
      }
    });
    soonFuneralEventId = funeral.body.eventId;
    assert.strictEqual(funeral.body.status, 'approved');

    await api('POST', `/api/events/${soonWeddingEventId}/remind`, { token: soonFollower.token });
    await api('POST', `/api/events/${soonFuneralEventId}/remind`, { token: soonFollower.token });
  });

  await test('A follower of an event 3 days away gets exactly one event_soon row', async () => {
    await scheduler.runDailyPass();

    const rows = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_soon'",
      [soonFollower.id, soonWeddingEventId]
    );
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].dedupe_key, `event_soon_${soonWeddingEventId}_3`);
  });

  await test('The countdown body never names a date', async () => {
    const row = await db.queryOne(
      "SELECT body FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_soon'",
      [soonFollower.id, soonWeddingEventId]
    );
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(row.body), `expected no literal date inside "${row.body}"`);
    assert.ok(row.body.includes('٣ أيام'), 'expected a relative day-count phrase instead');
  });

  await test('An occasion type with notify_countdown = 0 produces NO countdown row, for any offset', async () => {
    const rows = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_soon'",
      [soonFollower.id, soonFuneralEventId]
    );
    assert.strictEqual(rows.length, 0, 'a solemn occasion type must never produce a countdown notification');
  });

  await test('Running the scheduler pass twice for the same day produces ONE row, not two', async () => {
    await scheduler.runDailyPass();
    const rows = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_soon'",
      [soonFollower.id, soonWeddingEventId]
    );
    assert.strictEqual(rows.length, 1, 'a second same-day run must not duplicate the deduped row');
  });

  await db.execute('DELETE FROM events WHERE id IN (?, ?)', [soonWeddingEventId, soonFuneralEventId]);
  await db.execute('DELETE FROM users WHERE phone_number = ?', [soonFollower.phone]);

  let venueOwner = null;
  let venueFollower = null;
  let venueOther = null;
  let venueEventId = 0;

  await test('Set up: an owner publishes an approved wedding for the venue-change notification test', async () => {
    venueOwner = await createDirectUser('مالك مناسبة المكان');
    venueFollower = await createDirectUser('متابع مناسبة المكان');
    venueOther = await createDirectUser('مستخدم بلا علاقة بالمكان');

    const created = await api('POST', '/api/events', {
      token: venueOwner.token,
      body: weddingEventBody({
        honorees: [{ name: 'عريس اختبار المكان' }], town: 'رهط',
        event_date: addDaysToDate(schedulerToday, 60)
      })
    });
    venueEventId = created.body.eventId;

    const approve = await api('PATCH', `/api/admin/events/${venueEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    await api('POST', `/api/events/${venueEventId}/remind`, { token: venueFollower.token });
  });

  await test('A venue change notifies followers; the user who made the change is not notified', async () => {
    const edit = await api('PATCH', `/api/events/${venueEventId}`, {
      token: venueOwner.token, body: { location_name: 'قاعة جديدة تماماً لاختبار التغيير' }
    });
    assert.strictEqual(edit.status, 200);
    assert.strictEqual(edit.body.amendment, 'critical');
    assert.strictEqual(edit.body.status, 'pending');

    const beforeApproved = await db.queryOne(
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_approved'",
      [venueOwner.id, venueEventId]
    );

    const approve = await api('PATCH', `/api/admin/events/${venueEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const afterApproved = await db.queryOne(
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_approved'",
      [venueOwner.id, venueEventId]
    );

    const followerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_venue_changed'",
      [venueFollower.id, venueEventId]
    );
    assert.strictEqual(followerNotifs.length, 1);
    assert.strictEqual(followerNotifs[0].dedupe_key, null, 'a venue-changed notification is never deduped — it is not scheduler-produced');

    const ownerNotifs = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_venue_changed'",
      [venueOwner.id, venueEventId]
    );
    assert.strictEqual(ownerNotifs.length, 0, 'the person who made the edit must never be notified of it');

    // What the owner DOES receive from this same approval (issue #85 review,
    // FIX 8a). A delta, not an absolute count — this event was already
    // approved once in the setup step above.
    assert.strictEqual(
      Number(afterApproved.total) - Number(beforeApproved.total), 1,
      'the owner is still told their event was approved — just not that they themself changed its venue'
    );

    const otherNotifs = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? AND event_id = ?', [venueOther.id, venueEventId]
    );
    assert.strictEqual(otherNotifs.length, 0);
  });

  await db.execute('DELETE FROM events WHERE id = ?', [venueEventId]);
  for (const u of [venueOwner, venueFollower, venueOther]) {
    await db.execute('DELETE FROM users WHERE phone_number = ?', [u.phone]);
  }

  let approvalPublisher = null;
  let approvalEventId = 0;
  let rejectionPublisher = null;
  let rejectionEventId = 0;

  await test('Approval notifies the publisher', async () => {
    approvalPublisher = await createDirectUser('ناشر مناسبة الاعتماد');
    const created = await api('POST', '/api/events', {
      token: approvalPublisher.token,
      body: weddingEventBody({
        honorees: [{ name: 'عريس اختبار الاعتماد' }], event_date: addDaysToDate(schedulerToday, 90)
      })
    });
    approvalEventId = created.body.eventId;
    assert.strictEqual(created.body.status, 'pending');

    const approve = await api('PATCH', `/api/admin/events/${approvalEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const rows = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_approved'",
      [approvalPublisher.id, approvalEventId]
    );
    assert.strictEqual(rows.length, 1);
  });

  await test('Rejection notifies the publisher and carries the reason', async () => {
    rejectionPublisher = await createDirectUser('ناشر مناسبة الرفض');
    const created = await api('POST', '/api/events', {
      token: rejectionPublisher.token,
      body: weddingEventBody({
        honorees: [{ name: 'عريس اختبار الرفض' }], event_date: addDaysToDate(schedulerToday, 91)
      })
    });
    rejectionEventId = created.body.eventId;

    const reject = await api('PATCH', `/api/admin/events/${rejectionEventId}/status`, {
      token: adminToken, body: { status: 'rejected', reason: 'الصورة غير واضحة' }
    });
    assert.strictEqual(reject.status, 200);

    const rows = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_rejected'",
      [rejectionPublisher.id, rejectionEventId]
    );
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].body.includes('الصورة غير واضحة'), 'expected the rejection reason inside the notification body');
  });

  await db.execute('DELETE FROM events WHERE id IN (?, ?)', [approvalEventId, rejectionEventId]);
  for (const u of [approvalPublisher, rejectionPublisher]) {
    await db.execute('DELETE FROM users WHERE phone_number = ?', [u.phone]);
  }

  let digestPublisher = null;
  let digestWellWisherA = null;
  let digestWellWisherB = null;
  let digestFuneralEventId = 0;

  await test('Set up: a publisher owns a funeral with two pending تعازي awaiting review', async () => {
    digestPublisher = await createDirectUser('ناشر مناسبة الملخّص');
    digestWellWisherA = await createDirectUser('معزٍّ أول لاختبار الملخّص');
    digestWellWisherB = await createDirectUser('معزٍّ ثانٍ لاختبار الملخّص');

    const created = await api('POST', '/api/events', {
      token: digestPublisher.token,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى اختبار الملخّص' }],
        town: 'رهط',
        location_name: 'ديوان الاختبار',
        event_date: addDaysToDate(schedulerToday, 2),
        event_end_date: addDaysToDate(schedulerToday, 3)
      }
    });
    digestFuneralEventId = created.body.eventId;
    assert.strictEqual(created.body.status, 'pending');

    const approve = await api('PATCH', `/api/admin/events/${digestFuneralEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    for (const wellWisher of [digestWellWisherA, digestWellWisherB]) {
      const posted = await api('POST', `/api/events/${digestFuneralEventId}/congratulate`, {
        token: wellWisher.token, body: { message: 'تعازينا الحارّة' }
      });
      assert.strictEqual(posted.status, 201);
      assert.strictEqual(posted.body.comment.status, 'pending');
    }
  });

  await test('The moderation digest is ONE row carrying a count, not one row per message', async () => {
    await scheduler.runDailyPass();

    const rows = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND type = 'moderation_digest'",
      [digestPublisher.id]
    );
    assert.strictEqual(rows.length, 1, 'expected exactly one digest row regardless of pending message count');
    assert.ok(rows[0].body.includes('2'), 'expected the pending count inside the digest body');
    assert.strictEqual(rows[0].dedupe_key, `moderation_digest_${schedulerToday}`);
  });

  await db.execute('DELETE FROM events WHERE id = ?', [digestFuneralEventId]);
  for (const u of [digestPublisher, digestWellWisherA, digestWellWisherB]) {
    await db.execute('DELETE FROM users WHERE phone_number = ?', [u.phone]);
  }

  let capUser = null;
  let capEventA = 0;
  let capEventB = 0;
  let capEventC = 0;
  let capEventD = 0;
  let capOwnEventE = 0;
  let capVenueEventF = 0;

  await test('Set up: capUser follows four unrelated events at four countdown offsets, and owns+follows a fifth at 0 days', async () => {
    capUser = await createDirectUser('مستخدم اختبار السقف اليومي');

    async function createFollowedWedding(offsetDays) {
      const created = await api('POST', '/api/events', {
        token: adminToken,
        body: weddingEventBody({
          honorees: [{ name: `عريس سقف ${offsetDays}` }], town: 'رهط',
          event_date: addDaysToDate(schedulerToday, offsetDays)
        })
      });
      assert.strictEqual(created.body.status, 'approved');
      await api('POST', `/api/events/${created.body.eventId}/remind`, { token: capUser.token });
      return created.body.eventId;
    }

    // Created in this exact order — the scheduler processes candidate events
    // by ascending id, so A/B/C are guaranteed to be considered before D.
    capEventA = await createFollowedWedding(7);
    capEventB = await createFollowedWedding(5);
    capEventC = await createFollowedWedding(3);
    capEventD = await createFollowedWedding(1);

    const own = await api('POST', '/api/events', {
      token: capUser.token,
      body: weddingEventBody({
        honorees: [{ name: 'عريس السقف نفسه' }], town: 'رهط',
        event_date: addDaysToDate(schedulerToday, 0)
      })
    });
    capOwnEventE = own.body.eventId;
    const approveOwn = await api('PATCH', `/api/admin/events/${capOwnEventE}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approveOwn.status, 200);
    await api('POST', `/api/events/${capOwnEventE}/remind`, { token: capUser.token });

    const venueSource = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس سقف المكان' }], town: 'رهط',
        event_date: addDaysToDate(schedulerToday, 45)
      })
    });
    capVenueEventF = venueSource.body.eventId;
    await api('POST', `/api/events/${capVenueEventF}/remind`, { token: capUser.token });
  });

  await test('The daily cap holds at three scheduled notifications, but an own-event one still arrives once the cap is spent', async () => {
    await scheduler.runDailyPass();

    const rows = await db.query(
      "SELECT event_id FROM notifications WHERE user_id = ? AND type = 'event_soon' ORDER BY id ASC",
      [capUser.id]
    );
    assert.strictEqual(
      rows.length, notificationsService.DAILY_SCHEDULED_CAP + 1,
      'expected exactly DAILY_SCHEDULED_CAP capped rows plus the one exempt own-event row'
    );

    const notifiedEventIds = rows.map(r => r.event_id);
    assert.ok(notifiedEventIds.includes(capEventA));
    assert.ok(notifiedEventIds.includes(capEventB));
    assert.ok(notifiedEventIds.includes(capEventC));
    assert.ok(!notifiedEventIds.includes(capEventD), 'the fourth non-exempt event must be capped out');
    assert.ok(notifiedEventIds.includes(capOwnEventE), 'an own-event notification must arrive even once the cap is spent');
  });

  await test('A venue change still arrives for this same user even though the daily cap is already spent', async () => {
    const edit = await api('PATCH', `/api/events/${capVenueEventF}`, {
      token: adminToken, body: { location_name: 'قاعة جديدة لاختبار سقف المكان' }
    });
    assert.strictEqual(edit.body.amendment, 'critical');

    const approve = await api('PATCH', `/api/admin/events/${capVenueEventF}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const rows = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND event_id = ? AND type = 'event_venue_changed'",
      [capUser.id, capVenueEventF]
    );
    assert.strictEqual(rows.length, 1, 'a venue change must never be swallowed by the scheduled-notification cap');
  });

  await db.execute(
    'DELETE FROM events WHERE id IN (?, ?, ?, ?, ?, ?)',
    [capEventA, capEventB, capEventC, capEventD, capOwnEventE, capVenueEventF]
  );
  await db.execute('DELETE FROM users WHERE phone_number = ?', [capUser.phone]);

  let capExemptUser = null;
  let capExemptOwnA = 0;
  let capExemptOwnB = 0;
  let capExemptOwnC = 0;
  let capExemptForeignD = 0;

  await test('Exempt (own-event) event_soon rows must not be COUNTED by the cap — three of them must never block a fourth, unrelated one (issue #85 review, FIX 2)', async () => {
    capExemptUser = await createDirectUser('مستخدم اختبار احتساب الاستثناء');

    async function createOwnFollowedWedding(offsetDays) {
      const created = await api('POST', '/api/events', {
        token: capExemptUser.token,
        body: weddingEventBody({
          honorees: [{ name: `عريس استثناء ${offsetDays}` }], town: 'رهط',
          event_date: addDaysToDate(schedulerToday, offsetDays)
        })
      });
      const approve = await api('PATCH', `/api/admin/events/${created.body.eventId}/status`, {
        token: adminToken, body: { status: 'approved' }
      });
      assert.strictEqual(approve.status, 200);
      await api('POST', `/api/events/${created.body.eventId}/remind`, { token: capExemptUser.token });
      return created.body.eventId;
    }

    // Three events capExemptUser OWNS and follows — every one of them is
    // `exempt: true` and must never consume the daily budget. Created (and
    // therefore processed, ascending id) BEFORE the fourth, unrelated one.
    capExemptOwnA = await createOwnFollowedWedding(7);
    capExemptOwnB = await createOwnFollowedWedding(5);
    capExemptOwnC = await createOwnFollowedWedding(3);

    // A fourth event capExemptUser only FOLLOWS (not exempt) — under the old,
    // broken accounting this would already see a count of 3 from the exempt
    // writes above and be capped out even though none of them should have
    // spent anything.
    const foreign = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس استثناء غير مملوك' }], town: 'رهط',
        event_date: addDaysToDate(schedulerToday, 1)
      })
    });
    capExemptForeignD = foreign.body.eventId;
    await api('POST', `/api/events/${capExemptForeignD}/remind`, { token: capExemptUser.token });

    await scheduler.runDailyPass();

    const rows = await db.query(
      "SELECT event_id FROM notifications WHERE user_id = ? AND type = 'event_soon'",
      [capExemptUser.id]
    );
    const notifiedEventIds = rows.map(r => r.event_id);
    assert.ok(notifiedEventIds.includes(capExemptOwnA), 'expected the first exempt own-event row');
    assert.ok(notifiedEventIds.includes(capExemptOwnB), 'expected the second exempt own-event row');
    assert.ok(notifiedEventIds.includes(capExemptOwnC), 'expected the third exempt own-event row');
    assert.ok(
      notifiedEventIds.includes(capExemptForeignD),
      'the three exempt own-event rows above must not have consumed the cap — this unrelated, non-exempt fourth row must still arrive'
    );
  });

  await db.execute(
    'DELETE FROM events WHERE id IN (?, ?, ?, ?)',
    [capExemptOwnA, capExemptOwnB, capExemptOwnC, capExemptForeignD]
  );
  await db.execute('DELETE FROM users WHERE phone_number = ?', [capExemptUser.phone]);

  console.log('\nScheduler re-arm across DST (issue #85 review, FIX 5)');

  await test('start() re-arms itself with a fresh, zone-aware setTimeout every cycle — never a fixed-length setInterval', async () => {
    const originalSetTimeout = global.setTimeout;
    const originalSetInterval = global.setInterval;
    const capturedDelays = [];
    let capturedCallback = null;
    let intervalCalls = 0;

    global.setTimeout = (fn, delay) => {
      capturedDelays.push(delay);
      capturedCallback = fn;
      return { unref() {} };
    };
    global.setInterval = () => {
      intervalCalls += 1;
      return { unref() {} };
    };

    try {
      scheduler.stop();
      scheduler.start();
      assert.strictEqual(capturedDelays.length, 1, 'expected exactly one setTimeout armed by start()');

      // Simulate the first run firing — a real, idempotent scheduler pass —
      // and inspect what gets armed for the cycle AFTER it.
      await capturedCallback();

      assert.strictEqual(
        intervalCalls, 0,
        'the scheduler must never fall back to a fixed-length setInterval — that is exactly what drifts off 09:00 across a DST boundary'
      );
      assert.strictEqual(capturedDelays.length, 2, 'expected a second setTimeout armed after the first run fired');

      const freshDelay = scheduler.millisecondsUntilNextRun();
      assert.ok(
        Math.abs(capturedDelays[1] - freshDelay) < 5000,
        `expected the re-armed delay (${capturedDelays[1]}) to match a fresh millisecondsUntilNextRun() call (${freshDelay}), not a stale fixed step`
      );
    } finally {
      global.setTimeout = originalSetTimeout;
      global.setInterval = originalSetInterval;
      scheduler.stop();
    }
  });

  await test('The next run lands on 09:00 Asia/Jerusalem wall-clock across the next real DST boundary, not merely 24h later', async () => {
    function offsetMinutesAt(date) {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const parts = {};
      for (const { type, value } of fmt.formatToParts(date)) if (type !== 'literal') parts[type] = Number(value);
      if (parts.hour === 24) parts.hour = 0;
      const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
      return Math.round((asUtc - date.getTime()) / 60000);
    }

    function localHourAt(date) {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour12: false, hour: '2-digit' });
      const hour = Number(fmt.format(date));
      return hour === 24 ? 0 : hour;
    }

    // Scan forward day by day from today for the next real Asia/Jerusalem
    // DST transition — no hardcoded date, so this test stays correct
    // whenever it actually runs.
    let cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    let prevOffset = offsetMinutesAt(cursor);
    let dayBefore = null;
    for (let i = 0; i < 400 && !dayBefore; i += 1) {
      const next = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      const offset = offsetMinutesAt(next);
      if (offset !== prevOffset) {
        dayBefore = cursor;
      } else {
        cursor = next;
      }
      prevOffset = offset;
    }
    assert.ok(dayBefore, 'expected an Asia/Jerusalem DST transition within the next year');

    const runOnDayBefore = dayBefore.getTime() + scheduler.millisecondsUntilNextRun(dayBefore);
    const fixedIntervalNextRun = runOnDayBefore + 24 * 60 * 60 * 1000;
    const recomputedNextRun = runOnDayBefore + scheduler.millisecondsUntilNextRun(new Date(runOnDayBefore));

    assert.strictEqual(localHourAt(new Date(runOnDayBefore)), 9, 'sanity: the run before the transition must land on 09:00 local');
    assert.strictEqual(
      localHourAt(new Date(recomputedNextRun)), 9,
      'recomputing via millisecondsUntilNextRun must keep landing on 09:00 local across the DST boundary'
    );
    assert.notStrictEqual(
      localHourAt(new Date(fixedIntervalNextRun)), 9,
      'a flat 24h step from before the boundary must NOT land on 09:00 — this is exactly why start() must recompute, not assume a fixed day length'
    );
  });

  let scheduleUser = null;
  let scheduleFollowedEventId = 0;
  let scheduleUnfollowedEventId = 0;

  await test('GET /api/reminders/schedule returns the remaining offsets for a followed event and nothing for an unfollowed one', async () => {
    scheduleUser = await createDirectUser('مستخدم اختبار جدول التذكير');

    const followed = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس جدول التذكير' }], town: 'رهط',
        event_date: addDaysToDate(schedulerToday, 10)
      })
    });
    scheduleFollowedEventId = followed.body.eventId;
    await api('POST', `/api/events/${scheduleFollowedEventId}/remind`, { token: scheduleUser.token });

    const unfollowed = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس غير متابَع لجدول التذكير' }], town: 'رهط',
        event_date: addDaysToDate(schedulerToday, 10)
      })
    });
    scheduleUnfollowedEventId = unfollowed.body.eventId;

    const { status, body } = await api('GET', '/api/reminders/schedule', { token: scheduleUser.token });
    assert.strictEqual(status, 200);

    const followedEntry = body.schedule.find(e => e.event_id === scheduleFollowedEventId);
    assert.ok(followedEntry, 'expected the followed event in the schedule');
    assert.deepStrictEqual(
      followedEntry.offsets.map(o => o.days_before),
      [7, 5, 3, 1, 0],
      'an event 10 days away should still carry every countdown offset'
    );
    // fires_on is a full instant (09:00 Asia/Jerusalem), not a bare date
    // (issue #85 review, FIX 10) — a mobile alarm must never have to invent
    // the hour itself.
    assert.strictEqual(
      followedEntry.offsets.find(o => o.days_before === 3).fires_on,
      runInstantForDate(addDaysToDate(schedulerToday, 7)).toISOString()
    );

    assert.ok(!body.schedule.some(e => e.event_id === scheduleUnfollowedEventId), 'an unfollowed event must not appear');
  });

  await db.execute('DELETE FROM events WHERE id IN (?, ?)', [scheduleFollowedEventId, scheduleUnfollowedEventId]);
  await db.execute('DELETE FROM users WHERE phone_number = ?', [scheduleUser.phone]);

  console.log('\nWeb Push subscriptions (issue #85 batch 4)');

  await test('shouldDropSubscription: pure decision, no network — drops only on 404/410, keeps on 429/413/5xx/success', () => {
    assert.strictEqual(pushService.shouldDropSubscription(404), true, '404 must drop');
    assert.strictEqual(pushService.shouldDropSubscription(410), true, '410 must drop');
    assert.strictEqual(pushService.shouldDropSubscription(429), false, '429 (rate limited) must keep');
    assert.strictEqual(pushService.shouldDropSubscription(413), false, '413 (our own payload bug) must keep');
    assert.strictEqual(pushService.shouldDropSubscription(500), false, '5xx must keep');
    assert.strictEqual(pushService.shouldDropSubscription(201), false, 'a success code must keep');
    assert.strictEqual(pushService.shouldDropSubscription(undefined), false, 'no status at all (network error) must keep');
  });

  await test('GET /api/notifications/vapid-public-key returns null with no VAPID keys configured, and never carries a private key', async () => {
    const { status, body } = await api('GET', '/api/notifications/vapid-public-key');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.public_key, null);
    const raw = JSON.stringify(body);
    assert.ok(!/private/i.test(raw), `response must never mention a private key: ${raw}`);
  });

  await test('POST /api/notifications/subscribe is refused with an Arabic message (not a 500) when no VAPID keys are configured, and writes no row', async () => {
    const user = await createDirectUser('مستخدم اختبار الاشتراك بلا مفاتيح');
    const { status, body } = await api('POST', '/api/notifications/subscribe', {
      token: user.token,
      body: { endpoint: 'https://push.example.com/no-keys-configured', keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }
    });
    assert.strictEqual(status, 400);
    assert.ok(/[؀-ۿ]/.test(body.message || ''), `expected an Arabic error message, got: ${JSON.stringify(body)}`);
    const rows = await db.query('SELECT id FROM push_subscriptions WHERE user_id = ?', [user.id]);
    assert.strictEqual(rows.length, 0, 'a refused subscribe attempt must not write a row');
    await db.execute('DELETE FROM users WHERE id = ?', [user.id]);
  });

  await test('A notification row is still written normally with no VAPID keys configured (push failure never blocks persistence)', async () => {
    const author = await createDirectUser('ناشر بلا مفاتيح دفع');
    const created = await api('POST', '/api/events', { token: author.token, body: weddingEventBody({ honorees: [{ name: 'عريس بلا دفع' }], town: 'رهط' }) });
    const eventId = created.body.eventId;
    await api('PATCH', `/api/admin/events/${eventId}/status`, { token: adminToken, body: { status: 'approved' } });

    const rows = await db.query("SELECT * FROM notifications WHERE user_id = ? AND type = 'event_approved'", [author.id]);
    assert.strictEqual(rows.length, 1, 'the notification row must exist regardless of push delivery being unavailable');

    await db.execute('DELETE FROM events WHERE id = ?', [eventId]);
    await db.execute('DELETE FROM users WHERE id = ?', [author.id]);
  });

  /**
   * Everything below needs a configured VAPID pair to exercise the
   * subscribe/unsubscribe HTTP path at all — the whole rest of this suite
   * runs with none configured (issue #85's own required degraded-state
   * coverage, exercised above), so this fake pair is set directly on the
   * shared `config` object for the lifetime of this one block only, and
   * restored immediately after. It is never written to any file, never a
   * real key (web-push is never actually asked to encrypt or send anything
   * in this block — only push.service.js's own storage functions run, which
   * touch no network), and it is not the "generate a real VAPID pair" this
   * batch's action-safety rules forbid.
   */
  const originalPushConfig = { ...config.push };
  function enableFakeVapidForTest() {
    Object.assign(config.push, { publicKey: 'fake-test-public-key', privateKey: 'fake-test-private-key', subject: 'mailto:test@example.com' });
  }
  function restoreVapidConfig() {
    Object.assign(config.push, originalPushConfig);
  }

  let pushUserA = null;
  let pushUserB = null;

  await test('Set up two users for push subscription storage/isolation tests', async () => {
    pushUserA = await createDirectUser('مستخدم اشتراك دفع أ');
    pushUserB = await createDirectUser('مستخدم اشتراك دفع ب');
  });

  await test('Subscribing stores exactly one row per device; re-subscribing the same device is idempotent, not a duplicate; the endpoint never appears in the response', async () => {
    enableFakeVapidForTest();
    try {
      const endpoint = 'https://push.example.com/device-a-first-subscribe';
      const body = { endpoint, keys: { p256dh: 'p256dh-value-a', auth: 'auth-value-a' } };

      const first = await api('POST', '/api/notifications/subscribe', { token: pushUserA.token, body });
      assert.strictEqual(first.status, 200);
      assert.ok(!JSON.stringify(first.body).includes(endpoint), 'the endpoint must never appear in the subscribe response');

      const second = await api('POST', '/api/notifications/subscribe', { token: pushUserA.token, body });
      assert.strictEqual(second.status, 200);
      assert.ok(!JSON.stringify(second.body).includes(endpoint), 'the endpoint must never appear in a re-subscribe response either');

      const rows = await db.query('SELECT * FROM push_subscriptions WHERE user_id = ?', [pushUserA.id]);
      assert.strictEqual(rows.length, 1, 're-subscribing the exact same device must leave exactly one row');
      assert.strictEqual(rows[0].endpoint, endpoint);
    } finally {
      restoreVapidConfig();
    }
  });

  await test('A malformed subscription body is rejected with 400 in Arabic before ever reaching storage', async () => {
    enableFakeVapidForTest();
    try {
      const { status, body } = await api('POST', '/api/notifications/subscribe', {
        token: pushUserA.token,
        body: { endpoint: '', keys: {} }
      });
      assert.strictEqual(status, 400);
      assert.ok(/[؀-ۿ]/.test(body.message || ''));
    } finally {
      restoreVapidConfig();
    }
  });

  await test('An over-length endpoint is rejected with 400, never silently truncated and stored (issue #85 review, FIX 1)', async () => {
    enableFakeVapidForTest();
    try {
      const overLongEndpoint = `https://push.example.com/${'x'.repeat(500)}`;
      assert.ok(overLongEndpoint.length > 500, 'sanity: the fixture must actually exceed the push_subscriptions.endpoint column length');

      // Counted before/after, not asserted as an absolute 0 — pushUserA may
      // already carry a row from an earlier test in this section (it does),
      // so the only thing this test may claim is "this specific rejected
      // attempt wrote nothing", not "this user owns no rows at all".
      const before = await db.query('SELECT id FROM push_subscriptions WHERE user_id = ?', [pushUserA.id]);

      const { status, body } = await api('POST', '/api/notifications/subscribe', {
        token: pushUserA.token,
        body: { endpoint: overLongEndpoint, keys: { p256dh: 'p256dh-value-long', auth: 'auth-value-long' } }
      });
      assert.strictEqual(status, 400, 'an over-length endpoint must be rejected outright, never silently shortened and stored');
      assert.ok(/[؀-ۿ]/.test(body.message || ''));

      const after = await db.query('SELECT id FROM push_subscriptions WHERE user_id = ?', [pushUserA.id]);
      assert.strictEqual(after.length, before.length, 'no truncated row must ever be written for a rejected endpoint');
    } finally {
      restoreVapidConfig();
    }
  });

  await test('A non-URL, and a non-https, endpoint are both rejected with 400 — a capability URL that is not even a URL is not worth storing', async () => {
    enableFakeVapidForTest();
    try {
      const notAUrl = await api('POST', '/api/notifications/subscribe', {
        token: pushUserA.token,
        body: { endpoint: 'not-a-url-at-all', keys: { p256dh: 'p', auth: 'a' } }
      });
      assert.strictEqual(notAUrl.status, 400);

      const notHttps = await api('POST', '/api/notifications/subscribe', {
        token: pushUserA.token,
        body: { endpoint: 'http://push.example.com/insecure', keys: { p256dh: 'p', auth: 'a' } }
      });
      assert.strictEqual(notHttps.status, 400, 'an http: (non-https) endpoint must be rejected');
    } finally {
      restoreVapidConfig();
    }
  });

  await test('DELETE /api/notifications/subscribe also rejects an over-length endpoint with 400 (shares the same validation)', async () => {
    const overLongEndpoint = `https://push.example.com/${'y'.repeat(500)}`;
    const { status } = await api('DELETE', '/api/notifications/subscribe', {
      token: pushUserA.token,
      body: { endpoint: overLongEndpoint }
    });
    assert.strictEqual(status, 400);
  });

  await test('A user cannot see or remove another user\'s subscription, and unsubscribing an already-gone endpoint is not an error', async () => {
    enableFakeVapidForTest();
    try {
      const endpoint = 'https://push.example.com/device-a-second-subscribe';
      const subscribeRes = await api('POST', '/api/notifications/subscribe', {
        token: pushUserA.token, body: { endpoint, keys: { p256dh: 'p256dh-value-a2', auth: 'auth-value-a2' } }
      });
      assert.strictEqual(subscribeRes.status, 200);

      const crossDelete = await api('DELETE', '/api/notifications/subscribe', { token: pushUserB.token, body: { endpoint } });
      assert.strictEqual(crossDelete.status, 200, 'unsubscribe is always a no-op success, even naming a row that is not this caller\'s');
      assert.ok(!JSON.stringify(crossDelete.body).includes(endpoint));
      const stillThere = await db.queryOne('SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [pushUserA.id, endpoint]);
      assert.ok(stillThere, 'user B must never be able to remove user A\'s subscription by naming its endpoint');

      const ownDelete = await api('DELETE', '/api/notifications/subscribe', { token: pushUserA.token, body: { endpoint } });
      assert.strictEqual(ownDelete.status, 200);
      const gone = await db.queryOne('SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [pushUserA.id, endpoint]);
      assert.strictEqual(gone, null);

      const again = await api('DELETE', '/api/notifications/subscribe', { token: pushUserA.token, body: { endpoint } });
      assert.strictEqual(again.status, 200, 'unsubscribing an endpoint that is already gone must not be an error');
    } finally {
      restoreVapidConfig();
    }
  });

  await test('A 429 with a short Retry-After triggers exactly one retry, and sendToUser itself returns without waiting for it (issue #85 review, FIX 2) — no real network call', async () => {
    enableFakeVapidForTest();
    const retryUser = await createDirectUser('مستخدم اختبار إعادة محاولة 429');
    const endpoint = 'https://push.example.com/retry-device';
    const originalSendNotification = webpush.sendNotification;
    try {
      await db.execute(
        'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        [retryUser.id, endpoint, 'p256dh-retry', 'auth-retry']
      );

      let callCount = 0;
      webpush.sendNotification = async () => {
        callCount += 1;
        if (callCount === 1) {
          const err = new Error('rate limited');
          err.statusCode = 429;
          err.headers = { 'retry-after': '0' }; // 0 seconds — well inside RETRY_CEILING_MS
          throw err;
        }
        return { statusCode: 201 };
      };

      const startedAt = Date.now();
      await pushService.sendToUser(retryUser.id, { title: 'عنوان', body: 'نص' });
      assert.ok(Date.now() - startedAt < 200, 'sendToUser must return almost immediately — a bounded retry must never become caller-visible latency');
      assert.strictEqual(callCount, 0, 'sanity: sendToUser is fire-and-forget, so no delivery attempt has actually run synchronously yet');

      // The retry runs in the background on a real (very short) timer — wait
      // for it, rather than asserting anything about timing beyond "fast".
      await new Promise(resolve => setTimeout(resolve, 150));

      assert.strictEqual(callCount, 2, 'expected exactly one retry after the 429 — the first attempt plus one, not zero and not more');

      const stillThere = await db.queryOne('SELECT id FROM push_subscriptions WHERE user_id = ?', [retryUser.id]);
      assert.ok(stillThere, 'the subscription must survive a 429, retried or not — 429 never drops a row');
    } finally {
      webpush.sendNotification = originalSendNotification;
      restoreVapidConfig();
      await db.execute('DELETE FROM push_subscriptions WHERE user_id = ?', [retryUser.id]);
      await db.execute('DELETE FROM users WHERE id = ?', [retryUser.id]);
    }
  });

  await test('A 429 whose Retry-After exceeds the retry ceiling is NOT retried, and still keeps the row', async () => {
    const noRetryUser = await createDirectUser('مستخدم 429 بلا إعادة محاولة');
    const endpoint = 'https://push.example.com/no-retry-device';
    const originalSendNotification = webpush.sendNotification;
    try {
      await db.execute(
        'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        [noRetryUser.id, endpoint, 'p256dh-no-retry', 'auth-no-retry']
      );

      let callCount = 0;
      webpush.sendNotification = async () => {
        callCount += 1;
        const err = new Error('rate limited');
        err.statusCode = 429;
        err.headers = { 'retry-after': '3600' }; // an hour — far beyond the retry ceiling
        throw err;
      };

      // deliverToUser is the awaitable core sendToUser fires without waiting
      // for (see push.service.js) — calling it directly here lets this test
      // assert on completion without depending on a background timer.
      await pushService.deliverToUser(noRetryUser.id, { title: 'عنوان', body: 'نص' });
      assert.strictEqual(callCount, 1, 'a Retry-After beyond the ceiling must not be retried at all');

      const stillThere = await db.queryOne('SELECT id FROM push_subscriptions WHERE user_id = ?', [noRetryUser.id]);
      assert.ok(stillThere, 'the subscription must still be kept — 429 never drops the row, retried or not');
    } finally {
      webpush.sendNotification = originalSendNotification;
      await db.execute('DELETE FROM push_subscriptions WHERE user_id = ?', [noRetryUser.id]);
      await db.execute('DELETE FROM users WHERE id = ?', [noRetryUser.id]);
    }
  });

  await test('Deleting a user deletes their push subscriptions (story 21, FK ON DELETE CASCADE)', async () => {
    const cascadeUser = await createDirectUser('مستخدم اختبار حذف الاشتراكات');
    await db.execute(
      'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
      [cascadeUser.id, 'https://push.example.com/cascade-device', 'p256dh-cascade', 'auth-cascade']
    );
    const before = await db.queryOne('SELECT id FROM push_subscriptions WHERE user_id = ?', [cascadeUser.id]);
    assert.ok(before, 'sanity: the subscription row must exist before the user is deleted');

    await db.execute('DELETE FROM users WHERE id = ?', [cascadeUser.id]);

    const after = await db.queryOne('SELECT id FROM push_subscriptions WHERE user_id = ?', [cascadeUser.id]);
    assert.strictEqual(after, null, 'deleting the user must cascade-delete their push subscriptions');
  });

  // Guarded, not a bare `[pushUserA.id, pushUserB.id]` (issue #85 review, FIX
  // 6): if the "Set up two users" test above ever fails, test()'s own
  // try/catch already reports that failure and moves on — but this line sits
  // OUTSIDE any test() wrapper, so an unguarded `.id` on a still-null
  // pushUserA/pushUserB would throw synchronously here, uncaught, and take
  // down every remaining test in the suite instead of just the one that
  // actually failed.
  if (pushUserA && pushUserB) {
    await db.execute('DELETE FROM users WHERE id IN (?, ?)', [pushUserA.id, pushUserB.id]);
  }

  console.log('\nStories — ad separation, honest views, town breakdown (#20 step 8)');

  let activeStoryId = 0;
  await test('Admin creates a plain (non-ad) story', async () => {
    const { status, body } = await api('POST', '/api/admin/stories', {
      token: adminToken,
      body: { title: 'قصة اختبار عادية', town: 'رهط', image: '/uploads/story-test.jpg' }
    });
    assert.strictEqual(status, 201);
    activeStoryId = body.story.id;
    assert.strictEqual(body.story.is_ad, false);
    assert.ok(body.story.image.startsWith('http'), 'expected an absolute image URL');
  });

  await test('A regular user is rejected (403) from every /api/admin/stories route', async () => {
    const list = await api('GET', '/api/admin/stories', { token: userToken });
    assert.strictEqual(list.status, 403);
    const create = await api('POST', '/api/admin/stories', { token: userToken, body: { title: 'محاولة' } });
    assert.strictEqual(create.status, 403);
    const patch = await api('PATCH', `/api/admin/stories/${activeStoryId}`, { token: userToken, body: { title: 'محاولة' } });
    assert.strictEqual(patch.status, 403);
    const del = await api('DELETE', `/api/admin/stories/${activeStoryId}`, { token: userToken });
    assert.strictEqual(del.status, 403);
    const metrics = await api('GET', `/api/admin/stories/${activeStoryId}/metrics`, { token: userToken });
    assert.strictEqual(metrics.status, 403);
  });

  await test('An ad story with no advertiser_name is rejected with an Arabic message', async () => {
    const { status, body } = await api('POST', '/api/admin/stories', {
      token: adminToken,
      body: { title: 'قصة إعلانية ناقصة', is_ad: true }
    });
    assert.strictEqual(status, 400);
    assert.ok(body.message.includes('المعلن'));
  });

  let adStoryId = 0;
  await test('An ad story with advertiser_name is accepted and carries the ad fields', async () => {
    const { status, body } = await api('POST', '/api/admin/stories', {
      token: adminToken,
      body: { title: 'إعلان مطعم محلي', is_ad: true, advertiser_name: 'مطعم الاختبار', target_url: 'https://example.com' }
    });
    assert.strictEqual(status, 201);
    adStoryId = body.story.id;
    assert.strictEqual(body.story.is_ad, true);
    assert.strictEqual(body.story.advertiser_name, 'مطعم الاختبار');
    assert.strictEqual(body.story.slide_duration_seconds, 5);
  });

  await test('Turning an existing story into an ad without an advertiser_name is rejected the same way on PATCH', async () => {
    const { status, body } = await api('PATCH', `/api/admin/stories/${activeStoryId}`, {
      token: adminToken,
      body: { is_ad: true }
    });
    assert.strictEqual(status, 400);
    assert.ok(body.message.includes('المعلن'));
  });

  await test('The four ready-made expiry presets come from the server', async () => {
    const { body } = await api('GET', '/api/admin/stories', { token: adminToken });
    const keys = body.expiry_presets.map(p => p.key);
    assert.deepStrictEqual(keys, ['day', '3_days', 'week', 'month']);
  });

  let expiredStoryId = 0;
  let neverExpiresStoryId = 0;
  await test('An expired story is excluded from GET /api/stories; a not-yet-expired one and a never-expiring one both remain', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const expired = await api('POST', '/api/admin/stories', {
      token: adminToken, body: { title: 'قصة منتهية', expires_at: past }
    });
    expiredStoryId = expired.body.story.id;

    const futureCreated = await api('POST', '/api/admin/stories', {
      token: adminToken, body: { title: 'قصة لم تنتهِ بعد', expires_at: future }
    });
    const futureStoryId = futureCreated.body.story.id;

    const neverExpires = await api('POST', '/api/admin/stories', {
      token: adminToken, body: { title: 'قصة بلا انتهاء' }
    });
    neverExpiresStoryId = neverExpires.body.story.id;

    const { body: publicList } = await api('GET', '/api/stories');
    const ids = publicList.stories.map(s => s.id);
    assert.ok(!ids.includes(expiredStoryId), 'an expired story must not appear on the strip');
    assert.ok(ids.includes(futureStoryId), 'a story that has not expired yet must still appear');
    assert.ok(ids.includes(neverExpiresStoryId), 'a story with no expiry must still appear');

    await api('DELETE', `/api/admin/stories/${futureStoryId}`, { token: adminToken });
  });

  await test('An invalid expires_at is rejected instead of silently becoming null', async () => {
    const { status, body } = await api('POST', '/api/admin/stories', {
      token: adminToken, body: { title: 'قصة تاريخ فاسد', expires_at: 'not-a-date' }
    });
    assert.strictEqual(status, 400);
    assert.ok(body.message.includes('غير صالح'));
  });

  const storyViewerAPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  const storyViewerBPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  let storyViewerA = null;
  let storyViewerB = null;

  // Inserted straight into the DB and signed locally, not through
  // /api/auth/register — the suite has already spent most of its shared
  // authLimiter budget (20 requests/window across register+login+admin/login)
  // by this point, and these two accounts exist only to carry a distinct
  // clan_town each; they need no password flow of their own.
  await test('Set up: two registered viewers from two different towns', async () => {
    const insertViewer = async (phoneNumber, fullName, clanTown) => {
      const { insertId } = await db.execute(
        `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'user')`,
        [phoneNumber, fullName, 'x', clanTown]
      );
      const token = signToken({ id: insertId, phone_number: phoneNumber, full_name: fullName, role: 'user' }, '1h');
      return { token, id: insertId };
    };

    storyViewerA = await insertViewer(storyViewerAPhone, 'مشاهد رهط', 'رهط');
    storyViewerB = await insertViewer(storyViewerBPhone, 'مشاهد حورة', 'حورة');
  });

  await test('A registered viewer watching the same story twice today is counted once', async () => {
    const first = await api('POST', `/api/stories/${activeStoryId}/view`, { token: storyViewerA.token });
    assert.strictEqual(first.status, 200);
    const second = await api('POST', `/api/stories/${activeStoryId}/view`, { token: storyViewerA.token });
    assert.strictEqual(second.status, 200);

    const { body } = await api('GET', `/api/admin/stories/${activeStoryId}/metrics`, { token: adminToken });
    assert.strictEqual(body.metrics.views, 1);
    assert.strictEqual(body.metrics.distinct_viewers, 1);
  });

  await test('An anonymous viewer watching with the same device_id twice today is counted once', async () => {
    const deviceId = `device-${Date.now()}`;
    await api('POST', `/api/stories/${activeStoryId}/view`, { body: { device_id: deviceId } });
    await api('POST', `/api/stories/${activeStoryId}/view`, { body: { device_id: deviceId } });

    const { body } = await api('GET', `/api/admin/stories/${activeStoryId}/metrics`, { token: adminToken });
    assert.strictEqual(body.metrics.views, 2, 'one registered view + one anonymous device view = two, not three');
    assert.strictEqual(body.metrics.distinct_viewers, 2);
  });

  await test('A view with no token and no device_id is rejected', async () => {
    const { status, body } = await api('POST', `/api/stories/${activeStoryId}/view`, { body: {} });
    assert.strictEqual(status, 400);
    assert.ok(body.message.includes('معرّف الجهاز'));
  });

  await test('A second, different registered viewer is counted as a third distinct view/viewer overall', async () => {
    await api('POST', `/api/stories/${activeStoryId}/view`, { token: storyViewerB.token });

    const { body } = await api('GET', `/api/admin/stories/${activeStoryId}/metrics`, { token: adminToken });
    assert.strictEqual(body.metrics.views, 3);
    assert.strictEqual(body.metrics.distinct_viewers, 3);
  });

  await test('Town breakdown reports one count per registered viewer\'s town, and a bucket for the anonymous device view', async () => {
    const { body } = await api('GET', `/api/admin/stories/${activeStoryId}/metrics`, { token: adminToken });
    const byTown = Object.fromEntries(body.metrics.town_breakdown.map(row => [row.town, row.views]));
    assert.strictEqual(byTown['رهط'], 1);
    assert.strictEqual(byTown['حورة'], 1);
    assert.strictEqual(byTown['غير معروفة'], 1, 'the anonymous device view has no known town');
  });

  await test('Clicks are counted, and CPM/eCPM/frequency never appear in the metrics response', async () => {
    await api('POST', `/api/stories/${activeStoryId}/click`, { token: storyViewerA.token });
    await api('POST', `/api/stories/${activeStoryId}/click`, { body: { device_id: `click-device-${Date.now()}` } });

    const { body } = await api('GET', `/api/admin/stories/${activeStoryId}/metrics`, { token: adminToken });
    assert.strictEqual(body.metrics.clicks, 2);
    for (const forbiddenKey of ['cpm', 'ecpm', 'eCPM', 'CPM', 'frequency']) {
      assert.ok(!(forbiddenKey in body.metrics), `metrics must never carry "${forbiddenKey}"`);
    }
  });

  await test('A report is recorded once per person; a second report from the same person is rejected', async () => {
    const first = await api('POST', `/api/stories/${activeStoryId}/report`, { token: storyViewerA.token });
    assert.strictEqual(first.status, 200);
    const second = await api('POST', `/api/stories/${activeStoryId}/report`, { token: storyViewerA.token });
    assert.strictEqual(second.status, 409);
  });

  await test('Reporting a story requires a login', async () => {
    const { status } = await api('POST', `/api/stories/${activeStoryId}/report`);
    assert.strictEqual(status, 401);
  });

  await db.execute(
    'DELETE FROM stories WHERE id IN (?, ?, ?, ?)',
    [activeStoryId, adStoryId, expiredStoryId, neverExpiresStoryId]
  );
  await db.execute('DELETE FROM users WHERE phone_number IN (?, ?)', [storyViewerAPhone, storyViewerBPhone]);

  console.log('\nAdmin scope: local admins scoped to their own towns (services-directory spec)');

  // Every account below is inserted directly and signed with signToken, the
  // same pattern used for storyViewerA/B above — the suite has already spent
  // most of its shared authLimiter budget (register+login+admin/login share
  // one window), so no fixture from here on touches those three routes.

  const scopedTown = 'رهط';
  const outOfScopeTown = 'حورة';

  const scopedAdminPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  let scopedAdminId = 0;
  let scopedAdminToken = '';

  await test("Set up: a town-scoped admin, assigned to رهط via the super_admin's towns API", async () => {
    const hashedPin = bcrypt.hashSync('1234', config.bcryptRounds);
    const { insertId } = await db.execute(
      `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'admin')`,
      [scopedAdminPhone, 'أدمن رهط الاختبار', hashedPin, scopedTown]
    );
    scopedAdminId = insertId;
    scopedAdminToken = signToken(
      { id: scopedAdminId, phone_number: scopedAdminPhone, full_name: 'أدمن رهط الاختبار', role: 'admin' },
      '1h'
    );

    const assign = await api('PUT', `/api/admin/admins/${scopedAdminId}/towns`, {
      token: superAdminToken,
      body: { towns: [scopedTown] }
    });
    assert.strictEqual(assign.status, 200);
    assert.deepStrictEqual(assign.body.towns, [scopedTown]);
  });

  let scopeInEventId = 0;
  let scopeOutEventId = 0;
  await test("Set up: one pending event inside the scoped admin's town, one outside it", async () => {
    const inScope = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ honorees: [{ name: 'داخل نطاق الأدمن' }], town: scopedTown, event_date: '2027-12-01' })
    });
    assert.strictEqual(inScope.status, 201);
    assert.strictEqual(inScope.body.status, 'pending');
    scopeInEventId = inScope.body.eventId;

    const outOfScope = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ honorees: [{ name: 'خارج نطاق الأدمن' }], town: outOfScopeTown, event_date: '2027-12-02' })
    });
    assert.strictEqual(outOfScope.status, 201);
    assert.strictEqual(outOfScope.body.status, 'pending');
    scopeOutEventId = outOfScope.body.eventId;
  });

  await test('Case 1: a town-scoped admin approves an event in their own town — 200', async () => {
    const { status } = await api('PATCH', `/api/admin/events/${scopeInEventId}/status`, {
      token: scopedAdminToken, body: { status: 'approved' }
    });
    assert.strictEqual(status, 200);
  });

  await test('Case 2: the same admin gets 404, not 403, for an event outside their towns', async () => {
    const { status } = await api('PATCH', `/api/admin/events/${scopeOutEventId}/status`, {
      token: scopedAdminToken, body: { status: 'approved' }
    });
    assert.strictEqual(status, 404, 'a 403 here would confirm to an out-of-scope admin that the event exists at all');
  });

  await test('Case 3: GET /admin/events never returns the out-of-scope event to the scoped admin', async () => {
    const { body } = await api('GET', '/api/admin/events', { token: scopedAdminToken });
    assert.ok(!body.events.some(e => e.id === scopeOutEventId));
  });

  await test("Case 4: GET /admin/stats counts only the scoped admin's own town — matches a direct DB count for رهط exactly", async () => {
    const { body } = await api('GET', '/api/admin/stats', { token: scopedAdminToken });
    const dbCount = await db.queryOne('SELECT COUNT(*) AS total FROM events WHERE town = ?', [scopedTown]);
    assert.strictEqual(body.stats.totalEvents, Number(dbCount.total));
  });

  await test('Case 5: GET /admin/users is closed (403) to a plain admin — super_admin only now', async () => {
    const { status } = await api('GET', '/api/admin/users', { token: scopedAdminToken });
    assert.strictEqual(status, 403);
  });

  await test('Case 6: a super_admin passes every one of cases 1-5 — no town restriction, and /admin/users stays open to it', async () => {
    const approve = await api('PATCH', `/api/admin/events/${scopeOutEventId}/status`, {
      token: superAdminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200, 'a super_admin must be able to approve an event in any town');

    const list = await api('GET', '/api/admin/events', { token: superAdminToken });
    assert.ok(list.body.events.some(e => e.id === scopeOutEventId), 'a super_admin must see events outside any single town');

    const stats = await api('GET', '/api/admin/stats', { token: superAdminToken });
    const dbTotal = await db.queryOne('SELECT COUNT(*) AS total FROM events');
    assert.strictEqual(stats.body.stats.totalEvents, Number(dbTotal.total));

    const users = await api('GET', '/api/admin/users', { token: superAdminToken });
    assert.strictEqual(users.status, 200);
  });

  const noScopeAdminPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  let noScopeAdminId = 0;
  let noScopeAdminToken = '';
  let noScopeAttemptEventId = 0;

  await test('Case 7: an admin with zero admin_towns rows sees nothing and can approve nothing — fail closed', async () => {
    const hashedPin = bcrypt.hashSync('1234', config.bcryptRounds);
    const { insertId } = await db.execute(
      `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'admin')`,
      [noScopeAdminPhone, 'أدمن بلا بلدات', hashedPin, scopedTown]
    );
    noScopeAdminId = insertId;
    noScopeAdminToken = signToken(
      { id: noScopeAdminId, phone_number: noScopeAdminPhone, full_name: 'أدمن بلا بلدات', role: 'admin' },
      '1h'
    );

    const list = await api('GET', '/api/admin/events', { token: noScopeAdminToken });
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.events.length, 0, 'an admin with no admin_towns rows must see zero events, not everything');

    const stats = await api('GET', '/api/admin/stats', { token: noScopeAdminToken });
    assert.strictEqual(stats.body.stats.totalEvents, 0);

    const created = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ honorees: [{ name: 'محاولة أدمن بلا نطاق' }], town: scopedTown, event_date: '2027-12-03' })
    });
    noScopeAttemptEventId = created.body.eventId;

    const attempt = await api('PATCH', `/api/admin/events/${noScopeAttemptEventId}/status`, {
      token: noScopeAdminToken, body: { status: 'approved' }
    });
    assert.strictEqual(attempt.status, 404, 'zero admin_towns rows must fail closed, even for a town that objectively has events');
  });

  // The panel asks the server who it is instead of inferring its towns from
  // whatever happens to be in its lists. That inference is empty for exactly
  // the brand-new admin who most needs to be told why the panel looks empty.
  await test("GET /admin/me reports the caller's own towns, and an admin with none gets an empty list", async () => {
    const mine = await api('GET', '/api/admin/me', { token: scopedAdminToken });
    assert.strictEqual(mine.status, 200);
    assert.strictEqual(mine.body.role, 'admin');
    assert.deepStrictEqual(mine.body.towns, [scopedTown]);

    const none = await api('GET', '/api/admin/me', { token: noScopeAdminToken });
    assert.strictEqual(none.status, 200);
    assert.deepStrictEqual(none.body.towns, [], 'an unassigned admin must be told plainly that it holds no towns');

    const boss = await api('GET', '/api/admin/me', { token: superAdminToken });
    assert.strictEqual(boss.body.role, 'super_admin');
    assert.ok(boss.body.towns.length >= TOWNS.length, 'a super_admin implicitly holds every town');
  });

  await test("Case 8: an admin publishing in their own town is approved immediately; the same admin publishing outside it lands pending, never rejected", async () => {
    const own = await api('POST', '/api/events', {
      token: scopedAdminToken,
      body: weddingEventBody({ honorees: [{ name: 'أدمن ينشر في بلدته' }], town: scopedTown, event_date: '2027-12-04' })
    });
    assert.strictEqual(own.status, 201);
    assert.strictEqual(own.body.status, 'approved');

    const outside = await api('POST', '/api/events', {
      token: scopedAdminToken,
      body: weddingEventBody({ honorees: [{ name: 'أدمن ينشر خارج بلدته' }], town: outOfScopeTown, event_date: '2027-12-05' })
    });
    assert.strictEqual(outside.status, 201);
    assert.strictEqual(outside.body.status, 'pending', "outside the admin's own towns a publish must queue, never be rejected");

    await db.execute('DELETE FROM events WHERE id IN (?, ?)', [own.body.eventId, outside.body.eventId]);
  });

  console.log('\nBroadcasts & the live ticker (issue #85)');

  async function createUserInTown(fullName, town) {
    const userPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const hashedPin = bcrypt.hashSync('1234', config.bcryptRounds);
    const { insertId } = await db.execute(
      `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'user')`,
      [userPhone, fullName, hashedPin, town]
    );
    return {
      id: insertId,
      phone: userPhone,
      token: signToken({ id: insertId, phone_number: userPhone, full_name: fullName, role: 'user' }, '1h')
    };
  }

  const broadcastTownUser = await createUserInTown('مستخدم داخل بلدة التعميم', scopedTown);
  const broadcastOtherTownUser = await createUserInTown('مستخدم خارج بلدة التعميم', outOfScopeTown);
  const broadcastCleanupUserIds = [broadcastTownUser.id, broadcastOtherTownUser.id];
  const broadcastCleanupBroadcastIds = [];

  let globalBroadcastId = 0;
  await test("A super_admin's broadcast lands with scope_town = NULL and reaches a user in any town", async () => {
    const before = await db.queryOne('SELECT COUNT(*) AS total FROM broadcasts WHERE scope_town IS NULL');
    const { status, body } = await api('POST', '/api/admin/broadcast', {
      token: superAdminToken,
      body: { title: 'تعميم عام للاختبار', message: 'اختبار تعميم عام', duration: 'day', tone: 'urgent' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.broadcasts.length, 1, 'a super_admin broadcast must write exactly one row');
    assert.strictEqual(body.broadcasts[0].scope_town, null);
    globalBroadcastId = body.broadcasts[0].id;
    broadcastCleanupBroadcastIds.push(globalBroadcastId);

    const after = await db.queryOne('SELECT COUNT(*) AS total FROM broadcasts WHERE scope_town IS NULL');
    assert.strictEqual(Number(after.total), Number(before.total) + 1);

    const live = await api('GET', '/api/broadcasts/live', { token: broadcastOtherTownUser.token });
    assert.ok(live.body.broadcasts.some(b => b.id === globalBroadcastId), 'a global broadcast must reach a user in any town');
  });

  let townBroadcastId = 0;
  await test("A town admin's broadcast produces one row per own town and reaches only those users", async () => {
    const { status, body } = await api('POST', '/api/admin/broadcast', {
      token: scopedAdminToken,
      body: { title: 'تعميم بلدة الاختبار', message: 'اختبار تعميم بلدة', duration: 'day', tone: 'info' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.broadcasts.length, 1, 'the scoped admin owns exactly one town, so exactly one row');
    assert.strictEqual(body.broadcasts[0].scope_town, scopedTown);
    townBroadcastId = body.broadcasts[0].id;
    broadcastCleanupBroadcastIds.push(townBroadcastId);

    const inTown = await api('GET', '/api/broadcasts/live', { token: broadcastTownUser.token });
    assert.ok(inTown.body.broadcasts.some(b => b.id === townBroadcastId), 'a user in the broadcast town must see it');
  });

  await test('A user in another town does NOT see a town-scoped broadcast', async () => {
    const outside = await api('GET', '/api/broadcasts/live', { token: broadcastOtherTownUser.token });
    assert.ok(!outside.body.broadcasts.some(b => b.id === townBroadcastId), 'a user outside the broadcast town must never see it');
  });

  await test("A town admin naming a town outside their scope gets 404, and writes zero rows", async () => {
    const before = await db.queryOne('SELECT COUNT(*) AS total FROM broadcasts');
    const { status } = await api('POST', '/api/admin/broadcast', {
      token: scopedAdminToken,
      body: { message: 'محاولة تعميم خارج النطاق', duration: 'day', towns: [outOfScopeTown] }
    });
    assert.strictEqual(status, 404, "a town outside this admin's scope must never be confirmed to exist");

    const after = await db.queryOne('SELECT COUNT(*) AS total FROM broadcasts');
    assert.strictEqual(Number(after.total), Number(before.total), 'a rejected broadcast must write zero rows');
  });

  await test('An admin with no assigned towns is refused and writes zero rows', async () => {
    const before = await db.queryOne('SELECT COUNT(*) AS total FROM broadcasts');
    const { status, body } = await api('POST', '/api/admin/broadcast', {
      token: noScopeAdminToken,
      body: { message: 'محاولة بث بلا بلدات' }
    });
    assert.strictEqual(status, 400);
    assert.ok(/بلدة/.test(body.message || ''), 'expected a clear Arabic notice that this admin holds no towns');

    const after = await db.queryOne('SELECT COUNT(*) AS total FROM broadcasts');
    assert.strictEqual(Number(after.total), Number(before.total), 'a refused broadcast must write zero rows, never a silent success');
  });

  let expiredBroadcastId = 0;
  await test('An expired broadcast is absent from the live read and present in the notification centre', async () => {
    const { body } = await api('POST', '/api/admin/broadcast', {
      token: superAdminToken,
      body: { message: 'تعميم سينتهي', duration: 'hour' }
    });
    expiredBroadcastId = body.broadcasts[0].id;
    broadcastCleanupBroadcastIds.push(expiredBroadcastId);
    await db.execute('UPDATE broadcasts SET expires_at = ? WHERE id = ?', ['2020-01-01 00:00:00', expiredBroadcastId]);

    const live = await api('GET', '/api/broadcasts/live', { token: broadcastOtherTownUser.token });
    assert.ok(!live.body.broadcasts.some(b => b.id === expiredBroadcastId), 'an expired broadcast must not appear in the live ticker');

    const center = await api('GET', '/api/notifications', { token: broadcastOtherTownUser.token });
    assert.ok(
      center.body.notifications.some(n => n.type === 'broadcast' && n.broadcast_id === expiredBroadcastId),
      'an expired broadcast must still appear in the notification centre — expiry ends the ticker, not the record'
    );
  });

  let quietBroadcastId = 0;
  await test('A «بلا شريط» broadcast (expires_at = NULL) never appears in the live read', async () => {
    const { body } = await api('POST', '/api/admin/broadcast', {
      token: superAdminToken,
      body: { message: 'تعميم هادئ بلا شريط', duration: 'none' }
    });
    quietBroadcastId = body.broadcasts[0].id;
    broadcastCleanupBroadcastIds.push(quietBroadcastId);
    assert.strictEqual(body.broadcasts[0].expires_at, null);

    const live = await api('GET', '/api/broadcasts/live', { token: broadcastOtherTownUser.token });
    assert.ok(!live.body.broadcasts.some(b => b.id === quietBroadcastId));

    const center = await api('GET', '/api/notifications', { token: broadcastOtherTownUser.token });
    assert.ok(center.body.notifications.some(n => n.type === 'broadcast' && n.broadcast_id === quietBroadcastId));
  });

  await test("Dismissing hides a broadcast from the live read for that user only, moves it to read in their centre, and it stays there", async () => {
    const before = await api('GET', '/api/broadcasts/live', { token: broadcastOtherTownUser.token });
    assert.ok(before.body.broadcasts.some(b => b.id === globalBroadcastId));

    const beforeCenter = await api('GET', '/api/notifications', { token: broadcastOtherTownUser.token });
    const beforeEntry = beforeCenter.body.notifications.find(n => n.type === 'broadcast' && n.broadcast_id === globalBroadcastId);
    assert.ok(beforeEntry, 'expected the global broadcast in the centre before dismissing');
    assert.strictEqual(beforeEntry.is_read, false, 'an un-dismissed broadcast must read as unread');

    const dismiss = await api('PATCH', `/api/broadcasts/${globalBroadcastId}/dismiss`, { token: broadcastOtherTownUser.token });
    assert.strictEqual(dismiss.status, 200);

    const after = await api('GET', '/api/broadcasts/live', { token: broadcastOtherTownUser.token });
    assert.ok(!after.body.broadcasts.some(b => b.id === globalBroadcastId), 'dismissing must hide it for this user');

    const otherUser = await api('GET', '/api/broadcasts/live', { token: broadcastTownUser.token });
    assert.ok(otherUser.body.broadcasts.some(b => b.id === globalBroadcastId), 'dismissing must not hide it for anyone else');

    const center = await api('GET', '/api/notifications', { token: broadcastOtherTownUser.token });
    const entry = center.body.notifications.find(n => n.type === 'broadcast' && n.broadcast_id === globalBroadcastId);
    assert.ok(entry, 'a dismissed broadcast must stay in the notification centre');
    assert.strictEqual(entry.is_read, true, 'dismissing a broadcast must also mark it read in the centre');

    const again = await api('PATCH', `/api/broadcasts/${globalBroadcastId}/dismiss`, { token: broadcastOtherTownUser.token });
    assert.strictEqual(again.status, 200, 'dismissing twice must be idempotent, not an error');
  });

  await test("Dismissing a broadcast outside the caller's scope is 404", async () => {
    const { status } = await api('PATCH', `/api/broadcasts/${townBroadcastId}/dismiss`, { token: broadcastOtherTownUser.token });
    assert.strictEqual(status, 404);
  });

  await test('A user created AFTER the broadcast still sees it — proves no fan-out', async () => {
    const lateUser = await createUserInTown('مستخدم مسجَّل بعد التعميم', scopedTown);
    broadcastCleanupUserIds.push(lateUser.id);

    const live = await api('GET', '/api/broadcasts/live', { token: lateUser.token });
    assert.ok(
      live.body.broadcasts.some(b => b.id === townBroadcastId),
      'a broadcast sent before registration must still reach a newly registered user in its town'
    );
  });

  await test('An invalid tone is rejected in Arabic', async () => {
    const { status, body } = await api('POST', '/api/admin/broadcast', {
      token: superAdminToken,
      body: { message: 'اختبار نغمة فاسدة', tone: 'happy' }
    });
    assert.strictEqual(status, 400);
    assert.ok(/[؀-ۿ]/.test(body.message || ''), 'expected an Arabic error message');
  });

  await test('A past expires_at is rejected in Arabic', async () => {
    const { status, body } = await api('POST', '/api/admin/broadcast', {
      token: superAdminToken,
      body: { message: 'اختبار تاريخ ماضٍ', expires_at: '2020-01-01T00:00:00.000Z' }
    });
    assert.strictEqual(status, 400);
    assert.ok(/[؀-ۿ]/.test(body.message || ''), 'expected an Arabic error message');
  });

  await test('An expires_at too far in the future is rejected', async () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { status } = await api('POST', '/api/admin/broadcast', {
      token: superAdminToken,
      body: { message: 'اختبار تاريخ بعيد جداً', expires_at: farFuture }
    });
    assert.strictEqual(status, 400);
  });

  await db.query(
    `DELETE FROM broadcast_views WHERE user_id IN (${broadcastCleanupUserIds.map(() => '?').join(', ')})`,
    broadcastCleanupUserIds
  );
  if (broadcastCleanupBroadcastIds.length) {
    await db.query(
      `DELETE FROM broadcasts WHERE id IN (${broadcastCleanupBroadcastIds.map(() => '?').join(', ')})`,
      broadcastCleanupBroadcastIds
    );
  }
  await db.query(
    `DELETE FROM users WHERE id IN (${broadcastCleanupUserIds.map(() => '?').join(', ')})`,
    broadcastCleanupUserIds
  );

  console.log('\nRole management: the only path that appoints or removes an admin');

  // Created via direct SQL, not POST /api/auth/register, which shares the
  // suite-wide authLimiter budget with every other register/login call —
  // this section only needs a plain `user` row to promote, not a real signup.
  const promotableUserPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  const { insertId: promotableUserId } = await db.execute(
    `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'user')`,
    [promotableUserPhone, 'مستخدم للترقية', bcrypt.hashSync('1234', config.bcryptRounds), 'رهط']
  );
  const promotableUser = { id: promotableUserId, phone: promotableUserPhone };
  let promotedAdminId = 0;

  await test('A non-super admin gets 404, not 403, on PATCH /admin/users/:id/role', async () => {
    const { status } = await api('PATCH', `/api/admin/users/${promotableUser.id}/role`, {
      token: scopedAdminToken, body: { role: 'admin' }
    });
    assert.strictEqual(status, 404, 'a plain admin must never learn this capability exists at all');
  });

  await test('super_admin is never grantable through this endpoint', async () => {
    const { status } = await api('PATCH', `/api/admin/users/${promotableUser.id}/role`, {
      token: superAdminToken, body: { role: 'super_admin' }
    });
    assert.strictEqual(status, 400);
  });

  await test('Promotion reaches admin and nothing higher, and the response never carries pin_code', async () => {
    const { status, body } = await api('PATCH', `/api/admin/users/${promotableUser.id}/role`, {
      token: superAdminToken, body: { role: 'admin' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.user.role, 'admin');
    assert.ok(!('pin_code' in body.user), 'pin_code must never appear in this response');
    assert.ok(/بلدة/.test(body.message || ''), 'expected the empty-towns Arabic notice at the moment of promotion');
    promotedAdminId = body.user.id;

    const list = await api('GET', '/api/admin/admins', { token: superAdminToken });
    const found = list.body.admins.find(a => a.id === promotedAdminId);
    assert.ok(found, 'the freshly promoted admin must show up in the admins list');
    assert.deepStrictEqual(found.towns, [], 'a freshly promoted admin owns no towns yet');
  });

  await test('Promoting an already-admin user is rejected, not silently repeated', async () => {
    const { status } = await api('PATCH', `/api/admin/users/${promotedAdminId}/role`, {
      token: superAdminToken, body: { role: 'admin' }
    });
    assert.strictEqual(status, 409);
  });

  await test('Demoting clears admin_towns in the same transaction', async () => {
    const assign = await api('PUT', `/api/admin/admins/${promotedAdminId}/towns`, {
      token: superAdminToken, body: { towns: [scopedTown] }
    });
    assert.strictEqual(assign.status, 200);

    const before = await db.query('SELECT * FROM admin_towns WHERE user_id = ?', [promotedAdminId]);
    assert.strictEqual(before.length, 1);

    const demote = await api('PATCH', `/api/admin/users/${promotedAdminId}/role`, {
      token: superAdminToken, body: { role: 'user' }
    });
    assert.strictEqual(demote.status, 200);
    assert.strictEqual(demote.body.user.role, 'user');
    assert.ok(!('pin_code' in demote.body.user), 'pin_code must never appear in this response');

    const after = await db.query('SELECT * FROM admin_towns WHERE user_id = ?', [promotedAdminId]);
    assert.strictEqual(after.length, 0, 'demotion must clear admin_towns in the same transaction, not leave dangling rows');
  });

  await test('Demoting a plain user (never an admin) is rejected', async () => {
    const { status } = await api('PATCH', `/api/admin/users/${promotableUser.id}/role`, {
      token: superAdminToken, body: { role: 'user' }
    });
    assert.strictEqual(status, 409);
  });

  await test('Self-demotion is refused', async () => {
    const selfRow = await db.queryOne('SELECT id FROM users WHERE phone_number = ?', [config.admin.phone]);
    const { status } = await api('PATCH', `/api/admin/users/${selfRow.id}/role`, {
      token: superAdminToken, body: { role: 'user' }
    });
    assert.strictEqual(status, 400);
  });

  await test('The last remaining super_admin cannot be demoted', async () => {
    const totalSupers = await db.queryOne("SELECT COUNT(*) AS total FROM users WHERE role = 'super_admin'");
    assert.strictEqual(Number(totalSupers.total), 1, 'expected exactly one super_admin at this point in the suite');

    const selfRow = await db.queryOne('SELECT id FROM users WHERE phone_number = ?', [config.admin.phone]);

    // Calling the service directly with an acting id different from the
    // target is the only way to isolate this guard from the self-demotion
    // guard above, since the platform genuinely holds only one super_admin.
    let caught = null;
    try {
      await adminService.demoteToUser(selfRow.id, 0);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'expected demoteToUser to refuse demoting the sole remaining super_admin');
    assert.strictEqual(caught.status, 400);
  });

  await test('admin.demote is logged only for a successful commit, never for a rejected attempt', async () => {
    const logCalls = [];
    const originalInfo = logger.info;
    logger.info = (...args) => { logCalls.push(args); };
    try {
      // promotedAdminId is a plain 'user' at this point (demoted earlier in
      // this section), so this rejects before any write ever happens — the
      // exact shape of a rolled-back attempt. It must never be logged.
      let caught = null;
      try {
        await adminService.demoteToUser(promotedAdminId, 0);
      } catch (err) {
        caught = err;
      }
      assert.ok(caught, 'expected the rejected demote to throw');
      assert.ok(
        !logCalls.some(args => args[0] === 'admin.demote'),
        'a rejected/rolled-back attempt must never be logged as a demotion'
      );

      // Now a real commit: promote, then demote the same user again — this
      // time the log must fire, exactly once, only after it actually happened.
      await adminService.promoteToAdmin(promotedAdminId, 0);
      logCalls.length = 0;
      await adminService.demoteToUser(promotedAdminId, 0);
      const demoteLogs = logCalls.filter(args => args[0] === 'admin.demote');
      assert.strictEqual(demoteLogs.length, 1, 'a successful demotion must be logged exactly once');
    } finally {
      logger.info = originalInfo;
    }
  });

  console.log('\nVillages: village_id + town combination rules, legacy client compatibility (services-directory spec)');

  await test('Case 10: sending village_id together with a non-catch-all town is rejected', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'قرية مع بلدة أخرى' }],
        town: 'رهط',
        village_id: villageFixtureId,
        event_date: '2027-12-11'
      })
    });
    assert.strictEqual(status, 400);
    assert.ok(/القرى والتجمعات/.test(body.message || ''), `expected the villages-catch-all Arabic message, got: ${body.message}`);
  });

  await test('Case 12: GET /api/towns with no X-App-Version returns the towns array unchanged, element by element, plus the new villages key', async () => {
    const { body } = await api('GET', '/api/towns', { legacy: true });
    assert.deepStrictEqual(body.towns, ['الكل', ...TOWNS]);
    assert.ok(Array.isArray(body.villages), 'expected a villages array');
  });

  await api('DELETE', `/api/admin/villages/${villageFixtureId}`, { token: superAdminToken });

  console.log('\nArtist field: visible on عرس/خطوبة only, driven by occasion_type_fields, never by code (services-directory spec)');

  let funeralArtistEventId = 0;
  await test('Case 13: artist_name sent on a عزا publish is silently ignored — not stored, not rejected', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى بفنان' }],
        town: 'رهط',
        location_name: 'ديوان الاختبار',
        event_date: '2027-12-15',
        event_end_date: '2027-12-16',
        artist_name: 'فنان لن يُحفظ'
      }
    });
    assert.strictEqual(status, 201);
    funeralArtistEventId = body.eventId;

    const row = await db.queryOne('SELECT artist_name FROM events WHERE id = ?', [funeralArtistEventId]);
    assert.strictEqual(row.artist_name, null);

    await api('DELETE', `/api/admin/events/${funeralArtistEventId}`, { token: adminToken });
  });

  let weddingArtistEventId = 0;
  await test('Case 14: artist_name sent on a عرس publish is stored and comes back in GET /api/events', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس بفنان' }],
        town: 'رهط',
        event_date: '2027-12-17',
        artist_name: 'الفنان الاختبار'
      })
    });
    assert.strictEqual(status, 201);
    weddingArtistEventId = body.eventId;

    const { body: list } = await api('GET', '/api/events?limit=100');
    const event = list.events.find(e => e.id === weddingArtistEventId);
    assert.ok(event, 'expected the event on the public list');
    assert.strictEqual(event.artist_name, 'الفنان الاختبار');

    await api('DELETE', `/api/admin/events/${weddingArtistEventId}`, { token: adminToken });
  });

  console.log('\nServices directory: no phone on the list, consent required, containment (services-directory spec)');

  let serviceCategoryId = 0;
  await test('Set up: a super_admin creates a service category', async () => {
    const { status, body } = await api('POST', '/api/admin/service-categories', {
      token: superAdminToken,
      body: { name: `فئة اختبار ${Date.now()}`, icon: '🎤', color: '#ff0000' }
    });
    assert.strictEqual(status, 201);
    serviceCategoryId = body.category.id;
  });

  await test('Case 17: creating a provider without consent_at is rejected', async () => {
    const phone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { status } = await api('POST', '/api/admin/service-providers', {
      token: superAdminToken,
      body: {
        category_id: serviceCategoryId,
        name: 'مزوّد بلا إذن',
        phone,
        consent_channel: 'واتساب',
        towns: [scopedTown]
      }
    });
    assert.strictEqual(status, 400);
  });

  await test('Case 18: an admin holding only رهط cannot create a provider for {رهط, حورة} — containment', async () => {
    const phone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { status } = await api('POST', '/api/admin/service-providers', {
      token: scopedAdminToken,
      body: {
        category_id: serviceCategoryId,
        name: 'مزوّد احتواء',
        phone,
        consent_at: new Date().toISOString(),
        consent_channel: 'واتساب',
        towns: [scopedTown, outOfScopeTown]
      }
    });
    assert.strictEqual(status, 403);
  });

  let publicProviderPhone = '';
  let publicProviderId = 0;
  await test('Set up: a super_admin creates a real provider with a phone number', async () => {
    publicProviderPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const { status, body } = await api('POST', '/api/admin/service-providers', {
      token: superAdminToken,
      body: {
        category_id: serviceCategoryId,
        name: 'مزوّد الاختبار',
        phone: publicProviderPhone,
        consent_at: new Date().toISOString(),
        consent_channel: 'واتساب',
        towns: [scopedTown]
      }
    });
    assert.strictEqual(status, 201);
    publicProviderId = body.providerId;
  });

  await test('Case 15: GET /api/services/providers carries no phone key on any row', async () => {
    const { body } = await api('GET', '/api/services/providers');
    assert.ok(body.providers.length > 0, 'expected at least the provider just created');
    for (const provider of body.providers) {
      assert.ok(!('phone' in provider), 'expected the phone key entirely absent from the list row');
    }
  });

  await test('Case 16: GET /api/services/providers/:id carries phone', async () => {
    const { body } = await api('GET', `/api/services/providers/${publicProviderId}`);
    assert.ok('phone' in body.provider);
    assert.strictEqual(body.provider.phone, publicProviderPhone);
  });

  await api('DELETE', `/api/admin/service-providers/${publicProviderId}`, { token: superAdminToken });
  await api('DELETE', `/api/admin/service-categories/${serviceCategoryId}`, { token: superAdminToken });

  console.log("\nComments: a town-scoped admin's hide is a signed block, not the owner's to lift (services-directory spec)");

  const commentsOwnerPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  let commentsOwnerId = 0;
  let commentsOwnerToken = '';
  let commentsEventId = 0;
  let commentsCongratId = 0;

  await test("Set up: an owner publishes an approved event in the scoped admin's town, and a well-wisher congratulates it", async () => {
    const { insertId } = await db.execute(
      `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'user')`,
      [commentsOwnerPhone, 'صاحب مناسبة الحجب', 'x', scopedTown]
    );
    commentsOwnerId = insertId;
    commentsOwnerToken = signToken(
      { id: commentsOwnerId, phone_number: commentsOwnerPhone, full_name: 'صاحب مناسبة الحجب', role: 'user' },
      '1h'
    );

    const created = await api('POST', '/api/events', {
      token: commentsOwnerToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس اختبار الحجب' }], town: scopedTown, event_date: '2027-12-20' })
    });
    commentsEventId = created.body.eventId;

    const approve = await api('PATCH', `/api/admin/events/${commentsEventId}/status`, {
      token: superAdminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const posted = await api('POST', `/api/events/${commentsEventId}/congratulate`, {
      token: userToken, body: { message: 'رسالة سيتم حجبها' }
    });
    assert.strictEqual(posted.status, 201);
    commentsCongratId = posted.body.comment.id;
  });

  await test('Case 20: a town-scoped admin hides the comment — status becomes hidden, moderated_by is set to that admin', async () => {
    const { status, body } = await api('PATCH', `/api/events/${commentsEventId}/congratulations/${commentsCongratId}`, {
      token: scopedAdminToken, body: { action: 'reject' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.comment.status, 'hidden');

    const row = await db.queryOne('SELECT status, moderated_by FROM congratulations WHERE id = ?', [commentsCongratId]);
    assert.strictEqual(row.status, 'hidden');
    assert.strictEqual(row.moderated_by, scopedAdminId);
  });

  await test('Case 21: the event owner cannot lift the block the admin placed', async () => {
    const { status } = await api('PATCH', `/api/events/${commentsEventId}/congratulations/${commentsCongratId}`, {
      token: commentsOwnerToken, body: { action: 'approve' }
    });
    assert.strictEqual(status, 403);

    const row = await db.queryOne('SELECT status FROM congratulations WHERE id = ?', [commentsCongratId]);
    assert.strictEqual(row.status, 'hidden', "the block must still stand after the owner's rejected attempt");
  });

  await db.execute(
    'DELETE FROM events WHERE id IN (?, ?, ?, ?)',
    [commentsEventId, noScopeAttemptEventId, scopeInEventId, scopeOutEventId]
  );
  await db.execute(
    'DELETE FROM users WHERE id IN (?, ?, ?, ?)',
    [scopedAdminId, noScopeAdminId, commentsOwnerId, promotedAdminId]
  );

  console.log('\nShareable event page (GET /e/:id, issue #44)');

  /** Plain HTTP GET against the share page — not JSON, so bypasses api(). */
  async function rawGet(urlPath) {
    const res = await fetch(`${baseUrl}${urlPath}`);
    return { status: res.status, headers: res.headers, text: await res.text() };
  }

  /** Same as rawGet, but for the generated PNG card — a Buffer, not text. */
  async function rawGetBinary(urlPath) {
    const res = await fetch(`${baseUrl}${urlPath}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, buffer };
  }

  /**
   * A small hand-rolled PNG decoder, in the same spirit as
   * server/scripts/build-share-fallbacks.js's hand-rolled encoder: reads
   * IHDR for the real dimensions (never trust a Content-Type header alone —
   * this is what actually proves the bytes are a 1200×630 PNG) and, for the
   * palette test below, fully reconstructs pixels (concatenate every IDAT,
   * inflate, then undo the PNG's own per-scanline filtering) so a specific
   * pixel can be sampled. Handles exactly what @napi-rs/canvas's `toBuffer`
   * actually emits — 8-bit, non-interlaced, colour type 0/2/3/4/6 — which is
   * all this suite ever needs to read back.
   */
  /**
   * Decodes the generated card so its size and individual pixels can be
   * asserted. The card is a JPEG now (shareCard.service.js explains why: a
   * mostly-photographic PNG blew past the size at which WhatsApp drops the
   * preview outright), so this leans on the same decoder the server itself
   * uses rather than the hand-rolled PNG reader that used to live here —
   * a JPEG cannot be walked chunk by chunk the way IHDR/IDAT could.
   */
  async function decodeCard(buffer) {
    assert.ok(buffer[0] === 0xff && buffer[1] === 0xd8, 'expected a JPEG file signature');
    const image = await loadImage(buffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      pixelAt(x, y) {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        return { r, g, b };
      }
    };
  }

  /** The one cached card file for this event id — asserts there is exactly one (stale ones are evicted). */
  async function cachedCardFile(eventId) {
    const entries = await fsp.readdir(shareCard.CACHE_DIR);
    const matches = entries.filter(name => name.startsWith(`${eventId}-`));
    assert.strictEqual(matches.length, 1, `expected exactly one cached card for event ${eventId}, found: ${matches.join(', ')}`);
    return path.join(shareCard.CACHE_DIR, matches[0]);
  }

  /**
   * A portrait JPEG the size and shape of a real poster (this file's own
   * header measures a live one at 1080×2340), with per-pixel noise instead of
   * a flat wash — a smooth gradient compresses to almost nothing and would
   * pass the size guard below without exercising it. The card draws this
   * twice (blurred cover-fill plus the sharp contained copy), which is the
   * actual worst case the 600 KB guard exists to catch.
   */
  function buildRealisticPoster() {
    const width = 1080;
    const height = 2340;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#3b1f5c');
    gradient.addColorStop(0.5, '#a3315f');
    gradient.addColorStop(1, '#f2b134');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random() * 60 - 30;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toBuffer('image/jpeg', 90);
  }

  // Attack the values the page actually renders. It leads with the occasion type
  // and the honoree names now, not the free-text title, so putting the payload in
  // `title` alone would leave this test passing while testing nothing.
  const shareHonoree = `<img src=x onerror=alert(1)>"عريس`;
  const shareClan = `<script>alert(2)</script>عشيرة`;
  let shareEventId = 0;
  await test('Set up: an approved wedding whose honoree name and clan carry HTML metacharacters', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        title: 'عرس صفحة المشاركة',
        family_clan: shareClan,
        honorees: [{ name: shareHonoree }],
        town: 'رهط',
        event_date: '2027-09-10'
      })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.status, 'approved');
    shareEventId = body.eventId;
  });

  await test('GET /e/:id on an approved event returns 200 HTML with absolute og:title/og:image/og:url', async () => {
    const { status, headers, text } = await rawGet(`/e/${shareEventId}`);
    assert.strictEqual(status, 200);
    assert.ok((headers.get('content-type') || '').includes('text/html'));
    assert.ok(/property="og:title"/.test(text), 'expected an og:title meta tag');

    const imageMatch = text.match(/property="og:image" content="([^"]*)"/);
    const urlMatch = text.match(/property="og:url" content="([^"]*)"/);
    assert.ok(imageMatch && imageMatch[1].startsWith('http'), 'expected an absolute og:image');
    assert.ok(urlMatch && urlMatch[1].startsWith('http'), 'expected an absolute og:url');
  });

  await test('User text comes back escaped — in the page body AND inside content="…"', async () => {
    const { text } = await rawGet(`/e/${shareEventId}`);

    assert.ok(!text.includes('<img src=x onerror=alert(1)>'), 'raw markup must never appear unescaped');
    assert.ok(!text.includes('<script>alert(2)</script>'), 'a raw script tag must never appear');
    assert.ok(
      text.includes('&lt;img src=x onerror=alert(1)&gt;&quot;'),
      'expected the honoree name escaped in the body'
    );
    assert.ok(
      text.includes('&lt;script&gt;alert(2)&lt;/script&gt;'),
      'expected the clan escaped in the body'
    );

    // og:title now carries the occasion type plus the honoree names, so the
    // payload rides in through the name — the attribute context still has to hold.
    const titleMeta = text.match(/property="og:title" content="([^"]*)"/);
    assert.ok(titleMeta, 'expected an og:title meta tag');
    assert.ok(titleMeta[1].includes('&lt;img'), 'expected the escaped name inside content="…"');
    assert.ok(!titleMeta[1].includes('<img'), 'must not break out of content="…" with a raw tag');

    const descMeta = text.match(/property="og:description" content="([^"]*)"/);
    assert.ok(descMeta, 'expected an og:description meta tag');
    assert.ok(!descMeta[1].includes('<script'), 'the clan must not break out of content="…" either');
  });

  await test('The preview leads with the occasion type, not the free-text title', async () => {
    const { text } = await rawGet(`/e/${shareEventId}`);
    const titleMeta = text.match(/property="og:title" content="([^"]*)"/);
    assert.ok(titleMeta[1].startsWith('عرس'), `expected og:title to lead with the type, got: ${titleMeta[1]}`);
  });

  await test('og:image points at the generated card, and og:image:width/height declare its real 1200×1200 size', async () => {
    const { text } = await rawGet(`/e/${shareEventId}`);
    const imageMatch = text.match(/property="og:image" content="([^"]*)"/);
    assert.ok(imageMatch, 'expected an og:image tag');
    assert.ok(imageMatch[1].startsWith('http'), 'expected an absolute og:image');
    assert.ok(imageMatch[1].endsWith(`/e/${shareEventId}/card.jpg`), `expected og:image to point at the card, got: ${imageMatch[1]}`);

    assert.ok(text.includes('og:image:width" content="1200"'), 'expected og:image:width 1200 — we generate this file, its size is not a guess');
    assert.ok(text.includes('og:image:height" content="1200"'), 'expected og:image:height 1200');
  });

  await test('GET /e/:id/card.jpg on the approved event is a real 1200×1200 JPEG', async () => {
    const { status, headers, buffer } = await rawGetBinary(`/e/${shareEventId}/card.jpg`);
    assert.strictEqual(status, 200);
    assert.strictEqual(headers.get('content-type'), 'image/jpeg');
    assert.ok((headers.get('cache-control') || '').includes('max-age='), 'expected a long-lived Cache-Control header');

    const card = await decodeCard(buffer);
    assert.strictEqual(card.width, 1200);
    assert.strictEqual(card.height, 1200);

    // WhatsApp drops a link preview's image once it is past roughly 600 KB,
    // which is the failure this whole card exists to fix — a card that is
    // correct but too heavy is still a preview with no picture in it.
    assert.ok(
      buffer.length < 600 * 1024,
      `the card must stay under WhatsApp's preview size limit, got ${Math.round(buffer.length / 1024)} KB`
    );
  });

  await test('THE SIZE GUARD: a card built from a real (non-trivial) poster still stays under the WhatsApp preview limit', async () => {
    const created = await apiUpload('/api/events', {
      token: adminToken,
      fields: uploadFields({ 'honorees[0][name]': 'عريس بطاقة ثقيلة', event_date: '2027-09-14' }),
      files: [{ field: 'poster', buffer: buildRealisticPoster(), type: 'image/jpeg', name: 'heavy.jpg' }]
    });
    assert.strictEqual(created.status, 201);

    const { status, buffer } = await rawGetBinary(`/e/${created.body.eventId}/card.jpg`);
    assert.strictEqual(status, 200);
    assert.ok(
      buffer.length < 600 * 1024,
      `a card built from a real poster must stay under WhatsApp's preview limit, got ${Math.round(buffer.length / 1024)} KB`
    );

    await api('DELETE', `/api/admin/events/${created.body.eventId}`, { token: adminToken });
  });

  await test('The footer mark/text sit clear of the decorative frame — lowest drawn content stays ≥12px above the companion rule', async () => {
    const created = await apiUpload('/api/events', {
      token: adminToken,
      fields: uploadFields({ 'honorees[0][name]': 'عريس فحص الإطار', event_date: '2027-09-15' }),
      files: [{ field: 'poster', buffer: buildRealisticPoster(), type: 'image/jpeg', name: 'frame-check.jpg' }]
    });
    assert.strictEqual(created.status, 201);

    const { buffer } = await rawGetBinary(`/e/${created.body.eventId}/card.jpg`);
    const card = await decodeCard(buffer);

    // عمود شاهد بعيد عن علامات زوايا الإطار (تمتد من ٢٢ إلى ٤٨ بكسل من كل
    // حافة) وعن مجموعة العلامة/النص المتوسطة — أي فرق بينه وبين عمود آخر في
    // الصف نفسه يدلّ على محتوى حقيقي (علامة أو نص)، لا على خط الإطار الذي
    // يمتد بعرض البطاقة كله بنفس اللون عند أي x فيُطرَح تلقائياً من المقارنة.
    const controlX = 100;
    let lowestContentY = 0;
    for (let y = card.height - 120; y < card.height - 5; y += 1) {
      const control = card.pixelAt(controlX, y);
      for (let x = 250; x <= 950; x += 15) {
        const sample = card.pixelAt(x, y);
        const diff = Math.abs(sample.r - control.r) + Math.abs(sample.g - control.g) + Math.abs(sample.b - control.b);
        if (diff > 40) { lowestContentY = y; break; }
      }
    }
    assert.ok(lowestContentY > 0, 'expected to actually find the footer mark/text while scanning the band');

    const companionRuleY = card.height - 31; // FRAME_INSET(22) + FRAME_GAP(9)
    const limit = companionRuleY - 12;
    assert.ok(
      lowestContentY <= limit,
      `expected the lowest footer content row (${lowestContentY}) at least 12px above the frame's companion rule (y=${companionRuleY}); limit was ${limit}`
    );

    await api('DELETE', `/api/admin/events/${created.body.eventId}`, { token: adminToken });
  });

  await test('A second request for the same card is served from cache, not re-rendered', async () => {
    const file = await cachedCardFile(shareEventId);
    const before = await fsp.stat(file);

    const { status, buffer } = await rawGetBinary(`/e/${shareEventId}/card.jpg`);
    assert.strictEqual(status, 200);

    const after = await fsp.stat(file);
    assert.strictEqual(after.mtimeMs, before.mtimeMs, 'the cache file must not have been rewritten by the second request');
    assert.ok(buffer.length > 0, 'expected non-empty JPEG bytes from the cache hit');
  });

  await test('The Content-Security-Policy header is present on the share route, with a font source and still no script source', async () => {
    const { headers } = await rawGet(`/e/${shareEventId}`);
    const csp = headers.get('content-security-policy');
    assert.strictEqual(
      csp,
      "default-src 'none'; img-src *; style-src 'unsafe-inline'; font-src 'self'"
    );
    assert.ok(csp.includes("font-src 'self'"), 'expected a font-src directive for the page\'s own Cairo woff2 files');
    assert.ok(!csp.includes('script-src'), 'expected no script-src to ever be added to this route');
  });

  await test('The Cairo woff2 files are actually served by the assets route with the woff2 content type', async () => {
    for (const file of ['Cairo-Regular.woff2', 'Cairo-Bold.woff2']) {
      const { status, headers, buffer } = await rawGetBinary(`/e/assets/${file}`);
      assert.strictEqual(status, 200, `expected ${file} to be served`);
      assert.strictEqual(headers.get('content-type'), 'font/woff2');
      assert.ok(buffer.length > 0, `expected non-empty bytes for ${file}`);
    }
  });

  await test('Both download buttons are present, and the secondary one points at the site root rather than the APK', async () => {
    const { text } = await rawGet(`/e/${shareEventId}`);
    assert.ok(text.includes('class="cta"'), 'expected the primary download button');
    assert.ok(text.includes('class="cta-secondary"'), 'expected a secondary button');

    const secondaryMatch = text.match(/class="cta-secondary" href="([^"]*)"/);
    assert.ok(secondaryMatch, 'expected an href on the secondary button');
    assert.strictEqual(secondaryMatch[1], config.publicUrl, 'expected the secondary button to point at the site root, not the APK download route');

    const primaryMatch = text.match(/class="cta" href="([^"]*)"/);
    assert.ok(primaryMatch[1].includes('/download'), 'expected the primary button to still point at the download-recording route');
  });

  await test('The three-reason strip is present', async () => {
    const { text } = await rawGet(`/e/${shareEventId}`);
    assert.ok(text.includes('class="reasons"'), 'expected the reasons strip container');
    const reasonCount = (text.match(/class="reason"/g) || []).length;
    assert.strictEqual(reasonCount, 3, `expected exactly three reasons, found ${reasonCount}`);
  });

  await test('The page contains no <script tag at all', async () => {
    const { text } = await rawGet(`/e/${shareEventId}`);
    assert.ok(!text.includes('<script'), 'expected zero <script tags on this page');
  });

  await test('No date, venue, or phone value leaks anywhere in the response for an event that has all three set', async () => {
    const created = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'عريس فحص التسريب' }],
        town: 'رهط',
        location_name: 'قاعة الاختبار السرية',
        event_date: '2027-09-16',
        host_phone: '0501234567'
      })
    });
    assert.strictEqual(created.status, 201);

    const { text } = await rawGet(`/e/${created.body.eventId}`);
    assert.ok(!text.includes('قاعة الاختبار السرية'), 'the venue must never appear on the share page');
    assert.ok(!text.includes('0501234567'), 'the phone number must never appear on the share page');
    assert.ok(!text.includes('2027-09-16'), 'the raw event date must never appear on the share page');
    assert.ok(!text.includes('16/09/2027') && !text.includes('16-09-2027'), 'no reformatted date either');

    await api('DELETE', `/api/admin/events/${created.body.eventId}`, { token: adminToken });
  });

  await test('Editing the event produces a different card, and the old cached one is evicted', async () => {
    const before = await rawGetBinary(`/e/${shareEventId}/card.jpg`);

    // events.updated_at is a TIMESTAMP with one-second resolution, and it is
    // the card's cache key (shareCard.service.js) — an edit inside the same
    // wall-clock second as the original publish would collide with it. This
    // test exists specifically to prove the cache busts on edit, so it has
    // to guarantee the two timestamps actually differ rather than rely on
    // the suite being slow enough by accident.
    await new Promise(resolve => setTimeout(resolve, 1100));

    const { status, body } = await api('PATCH', `/api/events/${shareEventId}`, {
      token: adminToken,
      body: { family_clan: 'عائلة مُعدَّلة لاختبار البطاقة' }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amendment, 'cosmetic', 'a family_clan edit must stay approved, not fall back to pending');

    const after = await rawGetBinary(`/e/${shareEventId}/card.jpg`);
    assert.strictEqual(after.status, 200);
    assert.ok(!before.buffer.equals(after.buffer), 'expected a new card after the edit — same bytes means the old one was reused');

    // Confirms it was a real re-render, not just new bytes for the same
    // reason (e.g. non-determinism) — the cache key changed, so the old file
    // is gone and only the new one remains.
    await cachedCardFile(shareEventId);
  });

  let pendingShareEventId = 0;
  await test('Set up: a pending (not yet approved) wedding', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: userToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس معلَّق' }], town: 'حورة', event_date: '2027-09-11' })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.status, 'pending');
    pendingShareEventId = body.eventId;
  });

  await test('GET /e/:id on a pending event, a non-existent id, and a non-numeric id all 404 with an identical body', async () => {
    const pending = await rawGet(`/e/${pendingShareEventId}`);
    const missing = await rawGet('/e/999999999');
    const malformed = await rawGet('/e/not-a-number');

    assert.strictEqual(pending.status, 404);
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(malformed.status, 404);
    assert.strictEqual(pending.text, missing.text, 'a pending event must be indistinguishable from a missing one');
    assert.strictEqual(pending.text, malformed.text, 'a malformed id must be indistinguishable from a missing one');
  });

  await test('GET /e/:id/card.jpg on a pending event, a non-existent id, and a non-numeric id all 404', async () => {
    const pending = await rawGetBinary(`/e/${pendingShareEventId}/card.jpg`);
    const missing = await rawGetBinary('/e/999999999/card.jpg');
    const malformed = await rawGetBinary('/e/not-a-number/card.jpg');
    assert.strictEqual(pending.status, 404, 'same as the page: a pending event has no card either');
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(malformed.status, 404);
  });

  let expiredShareEventId = 0;
  await test('Set up: an approved wedding whose date has already passed', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس منتهية مشاركته' }], town: 'رهط', event_date: '2020-01-01' })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.status, 'approved');
    expiredShareEventId = body.eventId;
  });

  await test('GET /e/:id on an expired approved event is still 200 and shows the «انتهت» marker', async () => {
    const { status, text } = await rawGet(`/e/${expiredShareEventId}`);
    assert.strictEqual(status, 200);
    assert.ok(text.includes('انتهت'), 'expected the expired marker in the page');
  });

  let solemnShareEventId = 0;
  await test('Set up: a poster-less عزا (solemn tone, no default_poster_url either)', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'متوفَّى صفحة المشاركة' }],
        town: 'رهط',
        location_name: 'ديوان الاختبار',
        event_date: '2027-09-12',
        event_end_date: '2027-09-13'
      }
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.status, 'approved');
    solemnShareEventId = body.eventId;
  });

  await test('The festive share page carries «أعراسنا» in og:site_name, the description, and the footer', async () => {
    const { text } = await rawGet(`/e/${shareEventId}`);

    assert.ok(
      /property="og:site_name" content="أعراسنا"/.test(text),
      'expected og:site_name to be أعراسنا on a festive (wedding) event'
    );
    const descMeta = text.match(/property="og:description" content="([^"]*)"/);
    assert.ok(descMeta && descMeta[1].includes('أعراسنا'), `expected the description to carry أعراسنا, got: ${descMeta && descMeta[1]}`);
    assert.ok(/<p class="mark">أعراسنا<\/p>/.test(text), 'expected the footer mark to read أعراسنا on a festive event');
  });

  await test('A solemn-tone event with no poster renders a real card in the solemn palette, not the festive one', async () => {
    const { status, buffer } = await rawGetBinary(`/e/${solemnShareEventId}/card.jpg`);
    assert.strictEqual(status, 200, 'card generation must not crash on a poster-less solemn event');

    const card = await decodeCard(buffer);
    assert.strictEqual(card.width, 1200);
    assert.strictEqual(card.height, 1200);

    // Sampled on the short accent mark a poster-less card draws above the type
    // chip (shareCard.service.js) — a flat run of the palette's own accent
    // colour, far from any glyph. Festive is warm gold there (red well above
    // blue); solemn is a cool muted sage (blue at or above red). Unlike the
    // background sample this replaced, the two tones cannot converge: these
    // accent colours differ by hue, not merely by brightness.
    const rule = card.pixelAt(600, 456);
    assert.ok(
      rule.b >= rule.r,
      `expected the solemn palette's cool accent, got a warm one (festive leaked in): ${JSON.stringify(rule)}`
    );
  });

  await test('Both palettes expose a wordmark, and the generated card renders for each tone', async () => {
    assert.strictEqual(PALETTES.festive.wordmark, 'أعراسنا');
    assert.strictEqual(PALETTES.solemn.wordmark, 'مناسبات النقب');

    // The wordmark drawn ON the JPEG cannot be asserted by reading pixels
    // (there is no OCR here) — this only pins the contract a card render can
    // be checked against: both tones have a wordmark to draw, and drawing it
    // does not throw for either tone. The share-page assertions above are
    // what actually catch a forgotten hardcoded string.
    for (const eid of [shareEventId, solemnShareEventId]) {
      const { status } = await rawGetBinary(`/e/${eid}/card.jpg`);
      assert.strictEqual(status, 200, `expected card generation to succeed for event ${eid}`);
    }
  });

  await test('The solemn (condolence) share page never carries «أعراسنا» anywhere, and still carries «مناسبات النقب»', async () => {
    const { status, text } = await rawGet(`/e/${solemnShareEventId}`);
    assert.strictEqual(status, 200);

    assert.strictEqual(
      (text.match(/أعراسنا/g) || []).length,
      0,
      'the festive wordmark must not appear anywhere on a condolence page — it would read as celebrating a death'
    );
    assert.ok(text.includes('مناسبات النقب'), 'the descriptive line must still appear, standing alone, on a solemn page');
  });

  await db.execute(
    'DELETE FROM events WHERE id IN (?, ?, ?, ?)',
    [shareEventId, pendingShareEventId, expiredShareEventId, solemnShareEventId]
  );

  console.log('\nAnalytics (behavioural events, issue #44)');

  let analyticsEventId = 0;
  await test('Set up: an approved event for the share/download analytics tests below', async () => {
    const { status, body } = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'عريس اختبار التحليلات' }], town: 'رهط', event_date: '2027-09-20' })
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.status, 'approved');
    analyticsEventId = body.eventId;
  });

  await test('A name from the closed list is accepted, and a row is actually written', async () => {
    const { status } = await api('POST', '/api/analytics/events', {
      body: { event_name: 'image_upload_failed', platform: 'web', device_id: `device-${Date.now()}` }
    });
    assert.strictEqual(status, 201);

    const row = await db.queryOne(
      "SELECT * FROM analytics_events WHERE event_name = 'image_upload_failed' ORDER BY id DESC LIMIT 1"
    );
    assert.ok(row, 'expected a row to have been written');
    assert.strictEqual(row.platform, 'web');
  });

  await test('A name outside the closed list is rejected with an Arabic message', async () => {
    const { status, body } = await api('POST', '/api/analytics/events', {
      body: { event_name: `not_a_real_event_${Date.now()}`, platform: 'web' }
    });
    assert.strictEqual(status, 400);
    assert.ok(body.message.includes('غير معروف'), `expected an "unknown event" message, got: ${body.message}`);
  });

  await test('A count-only name (share_page_viewed) sent WITH a token and a device_id still writes a row whose user_id and device_id are both NULL', async () => {
    const { status } = await api('POST', '/api/analytics/events', {
      token: userToken,
      body: { event_name: 'share_page_viewed', platform: 'web', device_id: `device-${Date.now()}` }
    });
    assert.strictEqual(status, 201);

    const row = await db.queryOne(
      "SELECT * FROM analytics_events WHERE event_name = 'share_page_viewed' ORDER BY id DESC LIMIT 1"
    );
    assert.ok(row, 'expected a row to have been written');
    assert.strictEqual(row.user_id, null, 'a count-only event must never carry identity, even with a valid token');
    assert.strictEqual(row.device_id, null, 'a count-only event must never carry identity, even with a device_id in the body');
  });

  await test('The tighter analytics rate limit actually returns a rejection when exceeded', async () => {
    let sawTooMany = false;
    for (let i = 0; i < config.rateLimit.analyticsMax + 5; i += 1) {
      const { status } = await api('POST', '/api/analytics/events', {
        body: { event_name: 'share_clicked', platform: 'web', device_id: `rl-${i}` }
      });
      if (status === 429) { sawTooMany = true; break; }
    }
    assert.ok(sawTooMany, `expected a 429 within ${config.rateLimit.analyticsMax + 5} requests to the tighter analytics limiter`);
  });

  await test('The analytics_events table has no event_id, ip, or user_agent column at all — the direct, permanent test of the governing rule', async () => {
    const rows = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'analytics_events'
          AND COLUMN_NAME IN ('event_id', 'ip', 'user_agent')`
    );
    assert.strictEqual(rows.length, 0, `expected none of event_id/ip/user_agent, found: ${rows.map(r => r.COLUMN_NAME).join(', ')}`);
  });

  await test('Exercising the nokoot (دفتر النقوط) routes writes ZERO analytics rows — the private ledger is not an exception', async () => {
    const before = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events');

    const created = await api('POST', '/api/nokoot', {
      token: userToken,
      body: { recipient_name: 'اختبار عدم تسريب التحليلات', clan_town: 'رهط', amount: 42, event_date: '2026-09-05' }
    });
    assert.strictEqual(created.status, 201);
    await api('GET', '/api/nokoot', { token: userToken });
    await api('DELETE', `/api/nokoot/${created.body.recordId}`, { token: userToken });

    const after = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events');
    assert.strictEqual(Number(after.cnt), Number(before.cnt));
  });

  await test("GET /e/:id/download 302-redirects to the APK url and records app_download_clicked with the event's town", async () => {
    const before = await db.queryOne(
      "SELECT COUNT(*) AS cnt FROM analytics_events WHERE event_name = 'app_download_clicked'"
    );

    const res = await fetch(`${baseUrl}/e/${analyticsEventId}/download`, { redirect: 'manual' });
    assert.strictEqual(res.status, 302);
    const expectedTarget = absoluteMediaUrl(config.app.apkUrl) || config.publicUrl;
    assert.strictEqual(res.headers.get('location'), expectedTarget);

    const after = await db.queryOne(
      "SELECT COUNT(*) AS cnt FROM analytics_events WHERE event_name = 'app_download_clicked'"
    );
    assert.strictEqual(Number(after.cnt) - Number(before.cnt), 1);

    const row = await db.queryOne(
      "SELECT * FROM analytics_events WHERE event_name = 'app_download_clicked' ORDER BY id DESC LIMIT 1"
    );
    assert.strictEqual(row.content_town, 'رهط');
    assert.strictEqual(row.user_id, null);
  });

  await test('GET /e/:id/download still redirects and records for a non-existent id — just with no content_town', async () => {
    const res = await fetch(`${baseUrl}/e/999999999/download`, { redirect: 'manual' });
    assert.strictEqual(res.status, 302);

    const row = await db.queryOne(
      "SELECT * FROM analytics_events WHERE event_name = 'app_download_clicked' ORDER BY id DESC LIMIT 1"
    );
    assert.strictEqual(row.content_town, null);
  });

  await db.execute('DELETE FROM events WHERE id = ?', [analyticsEventId]);

  console.log('\nAnalytics retention fold (90 days identified, then anonymous counters)');

  await test('A row older than the retention window loses its identity on fold and survives as a daily counter; running the fold twice does not double-count', async () => {
    const testUser = await db.queryOne('SELECT id FROM users WHERE phone_number = ?', [phone]);
    const oldDate = new Date(Date.now() - (analyticsService.RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000);
    const dayString = oldDate.toISOString().slice(0, 10);

    const { insertId } = await db.execute(
      `INSERT INTO analytics_events (event_name, user_id, device_id, platform, app_version, content_town, created_at)
       VALUES ('login', ?, NULL, 'web', NULL, NULL, ?)`,
      [testUser.id, oldDate]
    );

    const first = await analyticsService.foldOldEvents();
    assert.ok(first.folded >= 1, 'expected at least one group folded');
    assert.ok(first.deleted >= 1, 'expected at least one row deleted');

    const stillThere = await db.queryOne('SELECT id FROM analytics_events WHERE id = ?', [insertId]);
    assert.strictEqual(stillThere, null, 'the identified row must be gone after the fold');

    const counter = await db.queryOne(
      "SELECT * FROM analytics_daily_counters WHERE day = ? AND event_name = 'login' AND platform = 'web' AND content_town = ''",
      [dayString]
    );
    assert.ok(counter, 'expected a daily counter row for the folded group');
    const countAfterFirst = Number(counter.count);
    assert.ok(countAfterFirst >= 1);

    const second = await analyticsService.foldOldEvents();
    assert.strictEqual(second.folded, 0, 'a second run must find nothing left to fold for this row');
    assert.strictEqual(second.deleted, 0);

    const counterAfterSecond = await db.queryOne(
      "SELECT count FROM analytics_daily_counters WHERE day = ? AND event_name = 'login' AND platform = 'web' AND content_town = ''",
      [dayString]
    );
    assert.strictEqual(Number(counterAfterSecond.count), countAfterFirst, 'running the fold twice must not double-count');
  });

  console.log('\nPrivacy (issue #44): opt-out, self-service erasure, the access/erasure queue, and the public notice');

  /**
   * The shared authLimiter budget for register/login/admin-login is already
   * spent by this point in the suite (same constraint the "Admin scope"
   * section above notes and works around) — inserted directly via SQL and
   * signed with signToken, same pattern as scopedAdminPhone/scopedAdminId.
   */
  async function insertTestUser(fullName) {
    const userPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
    const hashedPin = bcrypt.hashSync('1234', config.bcryptRounds);
    const { insertId } = await db.execute(
      `INSERT INTO users (phone_number, full_name, pin_code, clan_town, role) VALUES (?, ?, ?, ?, 'user')`,
      [userPhone, fullName, hashedPin, 'رهط']
    );
    const token = signToken({ id: insertId, phone_number: userPhone, full_name: fullName, role: 'user' }, '1h');
    return { id: insertId, phone: userPhone, token, full_name: fullName };
  }

  let privacyUserA = null; // will opt out of behavioural analytics below
  let privacyUserB = null; // stays opted in throughout
  let privacyRequestId = 0;

  await test('Set up: two fresh users for the privacy tests below, each with a pre-existing identified analytics row (standing in for the register-time row a real sign-up would have written)', async () => {
    privacyUserA = await insertTestUser('مستخدم رفض التحليلات');
    privacyUserB = await insertTestUser('مستخدم آخر للتحليلات');

    await db.execute(
      `INSERT INTO analytics_events (event_name, user_id, platform) VALUES ('register', ?, 'web')`,
      [privacyUserA.id]
    );
    await db.execute(
      `INSERT INTO analytics_events (event_name, user_id, platform) VALUES ('register', ?, 'web')`,
      [privacyUserB.id]
    );

    assert.ok(privacyUserA.token && privacyUserB.token);
  });

  await test('PATCH /api/auth/me opts a user out of behavioural analytics, and GET /api/auth/me reflects it — neither response carries pin_code', async () => {
    const patch = await api('PATCH', '/api/auth/me', {
      token: privacyUserA.token,
      body: { analytics_opt_out: true }
    });
    assert.strictEqual(patch.status, 200);
    assert.strictEqual(patch.body.user.analytics_opt_out, true);
    assert.ok(!('pin_code' in patch.body.user), 'pin_code must never appear in this response');

    const me = await api('GET', '/api/auth/me', { token: privacyUserA.token });
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.user.analytics_opt_out, true);
    assert.ok(!('pin_code' in me.body.user), 'pin_code must never appear in this response');
  });

  await test('An opted-out signed-in user triggers an identified analytics event ⇒ zero rows written for them — not an anonymised one', async () => {
    // Exercised directly against analytics.service.record() — the actual
    // enforcement point per the brief ("honoured at the write, not only at
    // the route") — rather than through POST /api/analytics/events, whose
    // own tighter rate limit (config.rateLimit.analyticsMax) was already
    // deliberately exhausted by the "tighter analytics rate limit" test
    // above, in the same shared window.
    const before = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?', [privacyUserA.id]);

    const result = await analyticsService.record({ eventName: 'share_clicked', userId: privacyUserA.id, platform: 'web' });
    assert.strictEqual(result.skipped, true, 'expected record() to report the write was skipped for an opted-out user');
    assert.strictEqual(result.id, null);

    const after = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?', [privacyUserA.id]);
    assert.strictEqual(Number(after.cnt), Number(before.cnt), 'an opted-out user must get ZERO new rows for an identified event');
  });

  await test('Opting out changes nothing about the ability to use the app — a normal authenticated action still succeeds', async () => {
    const { status, body } = await api('POST', '/api/nokoot', {
      token: privacyUserA.token,
      body: { recipient_name: 'اختبار عدم تعطيل أي ميزة', clan_town: 'رهط', amount: 10, event_date: '2026-09-05' }
    });
    assert.strictEqual(status, 201, 'opting out of analytics must never gate a feature');
    await api('DELETE', `/api/nokoot/${body.recordId}`, { token: privacyUserA.token });
  });

  await test("POST /api/privacy/analytics-erasure erases only the caller's own analytics rows — another user's rows are untouched", async () => {
    // privacyUserA's "register" row (inserted in the set-up above) predates
    // the opt-out set later — proves erasure removes rows that predate the
    // opt-out too, not just future ones.
    const beforeA = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?', [privacyUserA.id]);
    assert.ok(Number(beforeA.cnt) > 0, 'expected at least the "register" row written at sign-up');

    const beforeB = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?', [privacyUserB.id]);
    assert.ok(Number(beforeB.cnt) > 0, 'expected at least the "register" row for the untouched user too');

    const { status, body } = await api('POST', '/api/privacy/analytics-erasure', { token: privacyUserA.token });
    assert.strictEqual(status, 200);
    assert.ok(body.deleted >= Number(beforeA.cnt));

    const afterA = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?', [privacyUserA.id]);
    assert.strictEqual(Number(afterA.cnt), 0, "the caller's own rows must actually be gone");

    const afterB = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?', [privacyUserB.id]);
    assert.strictEqual(Number(afterB.cnt), Number(beforeB.cnt), "another user's rows must be untouched by someone else's erasure");
  });

  await test('Deleting an account removes its analytics rows too — the FK cascade, not a separate code path', async () => {
    const before = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?', [privacyUserB.id]);
    assert.ok(Number(before.cnt) > 0, 'expected privacyUserB to still have analytics rows before deletion');

    await db.execute('DELETE FROM users WHERE id = ?', [privacyUserB.id]);

    const after = await db.queryOne('SELECT COUNT(*) AS cnt FROM analytics_events WHERE user_id = ?', [privacyUserB.id]);
    assert.strictEqual(Number(after.cnt), 0, 'deleting the account must cascade-delete its analytics rows');
  });

  await test('POST /api/privacy/requests queues a formal request and states a deadline', async () => {
    const { status, body } = await api('POST', '/api/privacy/requests', {
      token: privacyUserA.token,
      body: { request_type: 'access' }
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.request.request_type, 'access');
    assert.strictEqual(body.request.status, 'pending');
    assert.ok(/\d+\s*يوماً/.test(body.message), 'expected the response to state a deadline');
    privacyRequestId = body.request.id;
  });

  await test('POST /api/privacy/requests rejects an unknown request type', async () => {
    const { status } = await api('POST', '/api/privacy/requests', {
      token: privacyUserA.token,
      body: { request_type: 'not_a_real_type' }
    });
    assert.strictEqual(status, 400);
  });

  await test('A town-scoped admin gets 403 on both the analytics read and the privacy request queue — super_admin only, never a town admin', async () => {
    const analyticsRead = await api('GET', '/api/admin/analytics/counts', { token: scopedAdminToken });
    assert.strictEqual(analyticsRead.status, 403);

    const queueRead = await api('GET', '/api/admin/privacy-requests', { token: scopedAdminToken });
    assert.strictEqual(queueRead.status, 403);
  });

  await test('A super_admin gets 200 on both, sees the queued request, and can close it', async () => {
    const analyticsRead = await api('GET', '/api/admin/analytics/counts', { token: superAdminToken });
    assert.strictEqual(analyticsRead.status, 200);
    assert.ok(Array.isArray(analyticsRead.body.counts));

    const queueRead = await api('GET', '/api/admin/privacy-requests', { token: superAdminToken });
    assert.strictEqual(queueRead.status, 200);
    assert.ok(queueRead.body.requests.some(r => r.id === privacyRequestId));

    const close = await api('PATCH', `/api/admin/privacy-requests/${privacyRequestId}`, { token: superAdminToken });
    assert.strictEqual(close.status, 200);
    assert.strictEqual(close.body.request.status, 'completed');
    assert.ok(close.body.request.handled_at, 'expected handled_at to be set on close');
  });

  await test('GET /api/admin/analytics/users/:id (issue #44, user story 45) — a super_admin reads one user\'s own rows, isolated from another user\'s, with no event id of any kind, and pagination that behaves', async () => {
    const rowsUser = await insertTestUser('مستخدم لاختبار قراءة السجل الفردي');
    const otherUser = await insertTestUser('مستخدم آخر يجب ألا تظهر بياناته هنا');

    // Five distinct rows for rowsUser (enough to exercise a page size of 2
    // below), and one unrelated row for otherUser, standing in for the
    // scenario this endpoint actually exists to serve: fulfilling a §13
    // access request about ONE named person, never a second one.
    for (let i = 0; i < 5; i += 1) {
      await db.execute(
        `INSERT INTO analytics_events (event_name, user_id, platform, app_version, content_town) VALUES (?, ?, 'web', '2.0.0', ?)`,
        ['share_clicked', rowsUser.id, 'رهط']
      );
    }
    await db.execute(
      `INSERT INTO analytics_events (event_name, user_id, platform) VALUES ('login', ?, 'web')`,
      [otherUser.id]
    );

    const full = await api('GET', `/api/admin/analytics/users/${rowsUser.id}`, { token: superAdminToken });
    assert.strictEqual(full.status, 200);
    assert.strictEqual(full.body.user_id, rowsUser.id);
    assert.strictEqual(full.body.pagination.total, 5);
    assert.strictEqual(full.body.events.length, 5);
    for (const row of full.body.events) {
      assert.strictEqual(row.event_name, 'share_clicked');
      assert.strictEqual(row.content_town, 'رهط');
      assert.ok(row.created_at, 'expected a timestamp on every row');
      assert.ok(!('id' in row), 'must not carry the analytics_events row\'s own id');
      assert.ok(!('event_id' in row), 'must not carry any event/occasion id — none exists in this table at all');
      assert.ok(!('device_id' in row), 'story 45 was scoped to a signed-in user, not a device fingerprint');
      assert.ok(!('user_id' in row), 'the endpoint already scopes by user in the path — no need to echo it per row');
    }

    // Another user's row must never leak into this user's read.
    assert.ok(!full.body.events.some(row => row.event_name === 'login'), "otherUser's row must not appear in rowsUser's read");

    const page1 = await api('GET', `/api/admin/analytics/users/${rowsUser.id}?limit=2&page=1`, { token: superAdminToken });
    assert.strictEqual(page1.status, 200);
    assert.strictEqual(page1.body.events.length, 2);
    assert.strictEqual(page1.body.pagination.total, 5);
    assert.strictEqual(page1.body.pagination.totalPages, 3);

    const page2 = await api('GET', `/api/admin/analytics/users/${rowsUser.id}?limit=2&page=2`, { token: superAdminToken });
    assert.strictEqual(page2.status, 200);
    assert.strictEqual(page2.body.events.length, 2);

    const otherRead = await api('GET', `/api/admin/analytics/users/${otherUser.id}`, { token: superAdminToken });
    assert.strictEqual(otherRead.status, 200);
    assert.strictEqual(otherRead.body.pagination.total, 1);
    assert.strictEqual(otherRead.body.events[0].event_name, 'login');

    const scopedRead = await api('GET', `/api/admin/analytics/users/${rowsUser.id}`, { token: scopedAdminToken });
    assert.strictEqual(scopedRead.status, 403, 'a town-scoped admin must never read another user\'s analytics rows — super_admin only');

    const userRead = await api('GET', `/api/admin/analytics/users/${rowsUser.id}`, { token: userToken });
    assert.strictEqual(userRead.status, 403, 'an ordinary signed-in user must not read analytics rows either');

    await db.execute('DELETE FROM users WHERE id IN (?, ?)', [rowsUser.id, otherUser.id]);
  });

  await test('GET /api/privacy/notice is public, names every event in the closed list in Arabic, and leaks no code identifiers', async () => {
    const { status, body } = await api('GET', '/api/privacy/notice');
    assert.strictEqual(status, 200);

    const text = body.notice.text;
    assert.ok(text.includes(String(analyticsService.RETENTION_DAYS)), 'expected the retention window mentioned');

    // The notice is read by the people the data is about, so it must name
    // every collected event in Arabic — and must NOT hand them the code key,
    // which informs nobody. Both halves matter: the first keeps the notice
    // complete, the second keeps it a notice rather than a schema dump.
    for (const event of ANALYTICS_EVENTS) {
      assert.ok(text.includes(event.label), `expected the notice to name "${event.label}"`);
      assert.ok(!text.includes(event.key), `the notice must not print the code key "${event.key}"`);
    }
  });

  console.log('\nPlatform settings (issue #85 batch 1)');

  // app_settings is not reset between test runs like the throwaway
  // users/events this suite creates — start from a known-empty state so "no
  // setting was ever saved" is actually true on a re-run against the same
  // database, not just on a freshly migrated one.
  await db.execute("DELETE FROM app_settings WHERE setting_key = 'support_whatsapp_number'");

  await test('GET /api/settings/public answers cleanly before any setting was ever saved, and exposes nothing but the support number', async () => {
    const { status, body } = await api('GET', '/api/settings/public');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(Object.keys(body.settings), ['support_whatsapp_number']);
    assert.strictEqual(body.settings.support_whatsapp_number, null);
  });

  await test('A plain (town-scoped) admin is refused on both GET and PUT /api/admin/settings — super_admin only', async () => {
    const get = await api('GET', '/api/admin/settings', { token: scopedAdminToken });
    assert.strictEqual(get.status, 403);

    const put = await api('PUT', '/api/admin/settings', {
      token: scopedAdminToken, body: { support_whatsapp_number: '0501234567' }
    });
    assert.strictEqual(put.status, 403);
  });

  await test('PUT /api/admin/settings rejects an invalid WhatsApp number with an Arabic message', async () => {
    const { status, body } = await api('PUT', '/api/admin/settings', {
      token: superAdminToken, body: { support_whatsapp_number: '12345' }
    });
    assert.strictEqual(status, 400);
    assert.ok(/[؀-ۿ]/.test(body.message), 'expected an Arabic error message');
  });

  await test('PUT /api/admin/settings rejects a key outside the code-owned whitelist', async () => {
    const { status } = await api('PUT', '/api/admin/settings', {
      token: superAdminToken, body: { some_unknown_setting: 'x' }
    });
    assert.strictEqual(status, 400);
  });

  await test('A super_admin saves the support number, local and international forms normalise to the same canonical value, and it reads back on both the admin and public routes', async () => {
    const save = await api('PUT', '/api/admin/settings', {
      token: superAdminToken, body: { support_whatsapp_number: '050-1234567' }
    });
    assert.strictEqual(save.status, 200);
    assert.strictEqual(save.body.settings.support_whatsapp_number, '972501234567');

    const adminRead = await api('GET', '/api/admin/settings', { token: superAdminToken });
    assert.strictEqual(adminRead.status, 200);
    assert.strictEqual(adminRead.body.settings.support_whatsapp_number, '972501234567');

    const publicRead = await api('GET', '/api/settings/public');
    assert.strictEqual(publicRead.status, 200);
    assert.deepStrictEqual(Object.keys(publicRead.body.settings), ['support_whatsapp_number']);
    assert.strictEqual(publicRead.body.settings.support_whatsapp_number, '972501234567');

    const resave = await api('PUT', '/api/admin/settings', {
      token: superAdminToken, body: { support_whatsapp_number: '+972501234567' }
    });
    assert.strictEqual(resave.status, 200);
    assert.strictEqual(resave.body.settings.support_whatsapp_number, '972501234567');
  });

  await test('A super_admin clears a previously-saved support number with an explicit empty value — it goes back to null everywhere, and an absent key leaves it untouched', async () => {
    const save = await api('PUT', '/api/admin/settings', {
      token: superAdminToken, body: { support_whatsapp_number: '0501234567' }
    });
    assert.strictEqual(save.status, 200);
    assert.strictEqual(save.body.settings.support_whatsapp_number, '972501234567');

    const clear = await api('PUT', '/api/admin/settings', {
      token: superAdminToken, body: { support_whatsapp_number: '' }
    });
    assert.strictEqual(clear.status, 200, 'an explicit empty value must clear the setting, not be rejected');
    assert.strictEqual(clear.body.settings.support_whatsapp_number, null);

    const adminRead = await api('GET', '/api/admin/settings', { token: superAdminToken });
    assert.strictEqual(adminRead.body.settings.support_whatsapp_number, null);

    const publicRead = await api('GET', '/api/settings/public');
    assert.strictEqual(publicRead.body.settings.support_whatsapp_number, null);

    // A PUT that never mentions the key must not touch it — save it again,
    // then PUT an unrelated whitelisted-but-absent scenario is not
    // reachable with only one key today, so this asserts the narrower,
    // still-real guarantee: an empty PUT body is rejected outright rather
    // than silently clearing everything.
    const resave = await api('PUT', '/api/admin/settings', {
      token: superAdminToken, body: { support_whatsapp_number: '0501234567' }
    });
    assert.strictEqual(resave.status, 200);
    const emptyBody = await api('PUT', '/api/admin/settings', { token: superAdminToken, body: {} });
    assert.strictEqual(emptyBody.status, 400);
    const stillSet = await api('GET', '/api/admin/settings', { token: superAdminToken });
    assert.strictEqual(stillSet.body.settings.support_whatsapp_number, '972501234567', 'a PUT that names no keys must change nothing');
  });

  console.log('\nMulti-value filtering: ?town=, ?occasion_type_id=, ?village_id= on GET /api/events and GET /api/map/events (issue #85 batch 5)');

  const filterTownA = 'تل السبع';
  const filterTownB = 'كسيفة';
  const filterTownC = 'شقيب السلام';
  let filterEventA = 0; // wedding, filterTownA
  let filterEventB = 0; // wedding, filterTownB
  let filterEventC = 0; // funeral, filterTownC — the non-legacy type
  let filterVillageId = 0;
  let filterVillageEventId = 0;

  await test('Set up: three events across three distinct towns (two weddings, one funeral) plus a fourth event in a fresh village', async () => {
    const a = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'فلتر بلدة أ' }], town: filterTownA, event_date: '2027-03-01' })
    });
    assert.strictEqual(a.status, 201);
    filterEventA = a.body.eventId;

    const b = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({ honorees: [{ name: 'فلتر بلدة ب' }], town: filterTownB, event_date: '2027-03-02' })
    });
    assert.strictEqual(b.status, 201);
    filterEventB = b.body.eventId;

    const c = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        occasion_type_id: funeralType.id,
        honorees: [{ name: 'فلتر عزا ج' }],
        town: filterTownC,
        location_name: 'ديوان الاختبار',
        event_date: '2027-03-03',
        event_end_date: '2027-03-04'
      }
    });
    assert.strictEqual(c.status, 201);
    filterEventC = c.body.eventId;

    const villageCreate = await api('POST', '/api/admin/villages', {
      token: superAdminToken,
      body: { name: `قرية فلترة ${Date.now()}`, latitude: 31.2, longitude: 34.95 }
    });
    assert.strictEqual(villageCreate.status, 201);
    filterVillageId = villageCreate.body.village.id;

    const v = await api('POST', '/api/events', {
      token: adminToken,
      body: weddingEventBody({
        honorees: [{ name: 'فلتر قرية' }],
        town: 'القرى والتجمعات',
        village_id: filterVillageId,
        event_date: '2027-03-05'
      })
    });
    assert.strictEqual(v.status, 201);
    filterVillageEventId = v.body.eventId;
  });

  await test('A single ?town= value returns exactly what it always has — the no-regression case', async () => {
    const { status, body } = await api('GET', `/api/events?limit=200&town=${encodeURIComponent(filterTownA)}`);
    assert.strictEqual(status, 200);
    const ids = body.events.map(e => e.id);
    assert.ok(ids.includes(filterEventA));
    assert.ok(!ids.includes(filterEventB));
    assert.ok(body.events.every(e => e.town === filterTownA));
  });

  await test('Two comma-separated towns return the union of both, and nothing from a third', async () => {
    const list = `${encodeURIComponent(filterTownA)},${encodeURIComponent(filterTownB)}`;
    const { status, body } = await api('GET', `/api/events?limit=200&town=${list}`);
    assert.strictEqual(status, 200);
    const ids = body.events.map(e => e.id);
    assert.ok(ids.includes(filterEventA));
    assert.ok(ids.includes(filterEventB));
    assert.ok(!ids.includes(filterEventC));
  });

  await test('A single occasion_type_id (the funeral) excludes a wedding event', async () => {
    const { body } = await api('GET', `/api/events?limit=200&occasion_type_id=${funeralType.id}`);
    const ids = body.events.map(e => e.id);
    assert.ok(ids.includes(filterEventC));
    assert.ok(!ids.includes(filterEventA));
  });

  await test('Two comma-separated occasion_type_id values return the union of both types', async () => {
    const { status, body } = await api('GET', `/api/events?limit=200&occasion_type_id=${weddingType.id},${funeralType.id}`);
    assert.strictEqual(status, 200);
    const ids = body.events.map(e => e.id);
    assert.ok(ids.includes(filterEventA));
    assert.ok(ids.includes(filterEventC));
  });

  await test('?village_id= filters to only that village alone', async () => {
    const alone = await api('GET', `/api/events?limit=200&village_id=${filterVillageId}`);
    assert.strictEqual(alone.status, 200);
    assert.deepStrictEqual(alone.body.events.map(e => e.id), [filterVillageEventId], 'expected exactly the one event in this fresh village');
  });

  // FIX 2: village_id is non-NULL only under town = 'القرى والتجمعات', so ANDing
  // a specific OTHER town with a village can never match anything — exactly
  // the "عائلتي موزّعة" combination stories 40/41 describe picking from one
  // place picker. The place filter must be a UNION of what was chosen.
  await test('village_id combined with a town in a DIFFERENT town returns the union of both places, not their (always-empty) intersection', async () => {
    const unioned = await api('GET', `/api/events?limit=200&village_id=${filterVillageId}&town=${encodeURIComponent(filterTownA)}`);
    assert.strictEqual(unioned.status, 200);
    const ids = unioned.body.events.map(e => e.id);
    assert.ok(ids.includes(filterVillageEventId), 'expected the chosen village\'s event to still appear');
    assert.ok(ids.includes(filterEventA), 'expected the unrelated town\'s event to appear too — a union, not an AND that can only ever be empty');
    assert.ok(!ids.includes(filterEventB), 'a town never requested must still be excluded');
  });

  await test("village_id combined with town = 'القرى والتجمعات' itself is coherent: the catch-all town already contains every village's events, so the union is just that same catch-all set", async () => {
    const { status, body } = await api('GET', `/api/events?limit=200&village_id=${filterVillageId}&town=${encodeURIComponent('القرى والتجمعات')}`);
    assert.strictEqual(status, 200);
    const ids = body.events.map(e => e.id);
    assert.ok(ids.includes(filterVillageEventId));
    assert.ok(!ids.includes(filterEventA), 'a town outside القرى والتجمعات that was never requested must not leak in');
  });

  await test('Twenty comma-separated occasion_type_id values are accepted', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => 90000 + i).join(',');
    const { status } = await api('GET', `/api/events?limit=5&occasion_type_id=${ids}`);
    assert.strictEqual(status, 200);
  });

  await test('Twenty-one comma-separated occasion_type_id values are rejected with 400 and an Arabic message — not a silent truncation to the first twenty', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => 90000 + i).join(',');
    const { status, body } = await api('GET', `/api/events?limit=5&occasion_type_id=${ids}`);
    assert.strictEqual(status, 400);
    assert.ok(/[؀-ۿ]/.test(body.message || ''), 'expected an Arabic error message');
  });

  // FIX 3: the cap counts what the caller actually SENT, before dedupe — 21
  // repetitions of the SAME id collapse to one distinct value, but the spec's
  // "سقف عشرين قيمة" is a limit on the request, not on what survives cleanup.
  await test('Twenty-one repetitions of the SAME occasion_type_id are also rejected — the cap counts raw values sent, not distinct ones after dedupe', async () => {
    const ids = Array.from({ length: 21 }, () => funeralType.id).join(',');
    const { status, body } = await api('GET', `/api/events?limit=5&occasion_type_id=${ids}`);
    assert.strictEqual(status, 400);
    assert.ok(/[؀-ۿ]/.test(body.message || ''), 'expected an Arabic error message');
  });

  await test('A duplicated value in the list does not duplicate a row in the result', async () => {
    const { status, body } = await api('GET', `/api/events?limit=200&occasion_type_id=${funeralType.id},${funeralType.id},${funeralType.id}`);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.events.filter(e => e.id === filterEventC).length, 1);
  });

  await test("'الكل' inside a town list still means no town filter, exactly as a lone ?town=الكل", async () => {
    const { status, body } = await api('GET', `/api/events?limit=200&town=${encodeURIComponent(filterTownA)},${encodeURIComponent('الكل')}`);
    assert.strictEqual(status, 200);
    const ids = body.events.map(e => e.id);
    assert.ok(ids.includes(filterEventA));
    assert.ok(ids.includes(filterEventB), 'الكل in the list must void the town filter entirely, not narrow it to filterTownA');
    assert.ok(ids.includes(filterEventC));
  });

  // FIX 1: TOWNS is duplicated by hand in mobile/lib/config.dart (CLAUDE.md)
  // and a published APK cannot be pushed a fix, so a stale town value must
  // stay exactly as forgiving on the read path as it always was — matching
  // nothing, never a 400 that takes the whole feed down. Publishing (POST
  // /api/events) is a different codepath and stays strict against TOWNS.
  await test('An unknown town value matches nothing, exactly like before list support existed — 200 with an empty list, not a 400', async () => {
    const { status, body } = await api('GET', '/api/events?town=بلدة_وهمية_غير_موجودة');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.events.length, 0);
  });

  await test('A request with no X-App-Version cannot see the non-legacy funeral type even when it asks for it by id inside a list', async () => {
    const { status, body } = await api('GET', `/api/events?limit=200&occasion_type_id=${weddingType.id},${funeralType.id}`, { legacy: true });
    assert.strictEqual(status, 200);
    const ids = body.events.map(e => e.id);
    assert.ok(ids.includes(filterEventA), 'the legacy-supported wedding must still appear');
    assert.ok(!ids.includes(filterEventC), 'a funeral must never reach a legacy client, even when explicitly requested by id');
  });

  await test('A legacy client requesting ONLY the non-legacy funeral type by id gets an empty result, never a widened one', async () => {
    const { status, body } = await api('GET', `/api/events?limit=200&occasion_type_id=${funeralType.id}`, { legacy: true });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.events.length, 0);
  });

  await test('GET /api/map/events supports the same town/occasion_type_id/village_id list filtering, including the legacy intersection', async () => {
    const byTown = await api('GET', `/api/map/events?town=${encodeURIComponent(filterTownA)},${encodeURIComponent(filterTownB)}`);
    assert.strictEqual(byTown.status, 200);
    const townIds = byTown.body.points.map(p => p.id);
    assert.ok(townIds.includes(filterEventA));
    assert.ok(townIds.includes(filterEventB));
    assert.ok(!townIds.includes(filterEventC));

    const byType = await api('GET', `/api/map/events?occasion_type_id=${funeralType.id}`);
    const typeIds = byType.body.points.map(p => p.id);
    assert.ok(typeIds.includes(filterEventC));
    assert.ok(!typeIds.includes(filterEventA));

    const byVillage = await api('GET', `/api/map/events?village_id=${filterVillageId}`);
    assert.deepStrictEqual(byVillage.body.points.map(p => p.id), [filterVillageEventId]);

    const legacyByType = await api('GET', `/api/map/events?occasion_type_id=${funeralType.id}`, { legacy: true });
    assert.strictEqual(legacyByType.body.points.length, 0, 'a legacy client must not see a non-legacy type on the map either, even by explicit id');

    // Same FIX 2 union as the feed: village_id + an unrelated town must union, not AND.
    const unioned = await api('GET', `/api/map/events?village_id=${filterVillageId}&town=${encodeURIComponent(filterTownA)}`);
    const unionedIds = unioned.body.points.map(p => p.id);
    assert.ok(unionedIds.includes(filterVillageEventId));
    assert.ok(unionedIds.includes(filterEventA));
    assert.ok(!unionedIds.includes(filterEventB));
  });

  await api('DELETE', `/api/admin/events/${filterEventA}`, { token: adminToken });
  await api('DELETE', `/api/admin/events/${filterEventB}`, { token: adminToken });
  await api('DELETE', `/api/admin/events/${filterEventC}`, { token: adminToken });
  await api('DELETE', `/api/admin/events/${filterVillageEventId}`, { token: adminToken });
  await api('DELETE', `/api/admin/villages/${filterVillageId}`, { token: superAdminToken });

  await db.execute('DELETE FROM users WHERE id = ?', [privacyUserA.id]);

  // Clean up the throwaway accounts.
  await db.execute('DELETE FROM users WHERE phone_number = ?', [phone]);
  await db.execute('DELETE FROM users WHERE phone_number = ?', [plainAdminPhone]);

  await new Promise(resolve => server.close(resolve));
  await db.close();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error('Smoke run crashed:', err);
  process.exit(1);
});
