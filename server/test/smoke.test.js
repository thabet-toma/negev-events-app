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

const config = require('../src/config');
const db = require('../src/db/pool');
const migrate = require('../src/db/migrate');
const seed = require('../src/db/seed');
const createApp = require('../src/app');
const { OCCASION_FIELD_KEYS } = require('../src/constants');

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

async function api(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

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

  const phone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;
  let userToken = '';
  let adminToken = '';
  let nokootId = 0;

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

  await test('Every pre-existing event was backfilled to عرس with one event_honorees row', async () => {
    const { body: publicEvents } = await api('GET', '/api/events');
    const sample = publicEvents.events[0];
    const row = await db.queryOne('SELECT occasion_type_id FROM events WHERE id = ?', [sample.id]);
    const wedding = await db.queryOne("SELECT id FROM occasion_types WHERE name = 'عرس'");
    assert.strictEqual(row.occasion_type_id, wedding.id);

    const honorees = await db.query('SELECT * FROM event_honorees WHERE event_id = ?', [sample.id]);
    assert.strictEqual(honorees.length, 1);
    assert.strictEqual(honorees[0].name, sample.groom_name);
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

  await test("An event in 'القرى والتجمعات' with no explicit coordinates gets no pin", async () => {
    const { body: created } = await api('POST', '/api/events', {
      token: adminToken,
      body: {
        groom_name: 'عريس بلا إحداثيات',
        town: 'القرى والتجمعات',
        location_name: 'ديوان الاختبار',
        event_date: '2027-01-04'
      }
    });
    assert.strictEqual(created.status, 'approved');
    const { body } = await api('GET', `/api/events/${created.eventId}`);
    assert.strictEqual(body.event.latitude, null);
    assert.strictEqual(body.event.longitude, null);
    await api('DELETE', `/api/admin/events/${created.eventId}`, { token: adminToken });
  });

  console.log('\nModeration flow');
  let createdEventId = 0;
  await test('A public submission lands in the pending queue', async () => {
    const { status, body } = await api('POST', '/api/events', {
      body: {
        groom_name: 'عريس الاختبار',
        town: 'حورة',
        location_name: 'ديوان الاختبار',
        event_date: '2026-12-31'
      }
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
      body: {
        groom_name: 'عريس الإدارة',
        town: 'كسيفة',
        location_name: 'ديوان الإدارة',
        event_date: '2026-12-30'
      }
    });
    assert.strictEqual(body.status, 'approved');
    await api('DELETE', `/api/admin/events/${body.eventId}`, { token: adminToken });
  });

  await test('An unknown town is rejected', async () => {
    const { status } = await api('POST', '/api/events', {
      body: { groom_name: 'س', town: 'مدينة وهمية', location_name: 'x', event_date: '2026-12-31' }
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
    await api('POST', `/api/events/${createdEventId}/congratulate`, {
      body: { sender_name: 'صديق', message: 'مبروك' }
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
