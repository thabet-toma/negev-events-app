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
const { signToken } = require('../src/middleware/auth');
const { OCCASION_FIELD_KEYS, CONGRATULATION_REPORT_THRESHOLD, TOWNS } = require('../src/constants');

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
    const approve = await api('PATCH', `/api/admin/events/${reminderEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

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
      'SELECT * FROM notifications WHERE user_id = ? AND event_id = ?', [reminderOwner.id, reminderEventId]
    );
    assert.strictEqual(ownerNotifs.length, 0, 'the person who made the edit must never be notified of it');

    const strangerNotifs = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? AND event_id = ?', [reminderOther.id, reminderEventId]
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
      'SELECT * FROM notifications WHERE user_id = ? AND event_id = ?', [reminderFollower.id, reminderEventId]
    );
    assert.strictEqual(followerNotifs.length, 2, 'one from each of the two approved date edits');

    const ownerNotifs = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? AND event_id = ?', [reminderOwner.id, reminderEventId]
    );
    assert.strictEqual(ownerNotifs.length, 1, 'the owner is notified this time — the edit was not their own');
  });

  await test('GET /api/notifications returns only this user\'s own rows, and PATCH marks one read', async () => {
    const { status, body } = await api('GET', '/api/notifications', { token: reminderFollower.token });
    assert.strictEqual(status, 200);
    assert.ok(body.notifications.length >= 2);
    assert.ok(body.notifications.every(n => n.user_id === reminderFollower.id));

    const unread = body.notifications.find(n => !n.is_read);
    assert.ok(unread, 'expected at least one unread notification');
    const marked = await api('PATCH', `/api/notifications/${unread.id}/read`, { token: reminderFollower.token });
    assert.strictEqual(marked.status, 200);

    const { body: after } = await api('GET', '/api/notifications', { token: reminderFollower.token });
    assert.ok(after.notifications.find(n => n.id === unread.id).is_read, 'expected the notification marked read');
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

  await test('A critical edit that is NOT a date change (location) is approved normally but never publishes an announcement or a notification', async () => {
    const edit = await api('PATCH', `/api/events/${reminderEventId}`, {
      token: adminToken, body: { location_name: 'قاعة جديدة لاختبار التذكير' }
    });
    assert.strictEqual(edit.status, 200);
    assert.strictEqual(edit.body.amendment, 'critical');
    assert.strictEqual(edit.body.status, 'pending');

    const beforeAnnouncements = await db.queryOne('SELECT COUNT(*) AS total FROM event_announcements WHERE event_id = ?', [reminderEventId]);
    const beforeNotifs = await db.queryOne('SELECT COUNT(*) AS total FROM notifications WHERE event_id = ?', [reminderEventId]);

    const approve = await api('PATCH', `/api/admin/events/${reminderEventId}/status`, {
      token: adminToken, body: { status: 'approved' }
    });
    assert.strictEqual(approve.status, 200);

    const afterAnnouncements = await db.queryOne('SELECT COUNT(*) AS total FROM event_announcements WHERE event_id = ?', [reminderEventId]);
    const afterNotifs = await db.queryOne('SELECT COUNT(*) AS total FROM notifications WHERE event_id = ?', [reminderEventId]);
    assert.strictEqual(Number(afterAnnouncements.total), Number(beforeAnnouncements.total), 'a location amendment must never publish a date announcement');
    assert.strictEqual(Number(afterNotifs.total), Number(beforeNotifs.total));
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

    const columns = await db.query(
      `SELECT TABLE_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'user_id'`
    );
    // story_views is a deliberate, documented exception (#20 step 8): a
    // story's honest once-per-day view count is a different domain with
    // different requirements than an event's bare views_count. The
    // invariant this assertion guards is specifically about *events* — so
    // only a per-user view table that also carries an event_id column would
    // violate it, and story_views carries no such column.
    const eventViewTables = columns
      .map(c => c.TABLE_NAME)
      .filter(name => /view/i.test(name) && name !== 'story_views');
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
    'DELETE FROM users WHERE id IN (?, ?, ?)',
    [scopedAdminId, noScopeAdminId, commentsOwnerId]
  );

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
