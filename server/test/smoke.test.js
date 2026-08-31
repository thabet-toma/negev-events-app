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

const config = require('../src/config');
const db = require('../src/db/pool');
const migrate = require('../src/db/migrate');
const seed = require('../src/db/seed');
const createApp = require('../src/app');

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

async function run() {
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

  // Clean up the throwaway account.
  await db.execute('DELETE FROM users WHERE phone_number = ?', [phone]);

  await new Promise(resolve => server.close(resolve));
  await db.close();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error('Smoke run crashed:', err);
  process.exit(1);
});
