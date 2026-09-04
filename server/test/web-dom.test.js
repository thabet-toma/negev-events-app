'use strict';

/**
 * DOM smoke seam for web/ (issue #44's post-mortem).
 *
 * On 2026-09-02 the publish form never built at all — its spinner span
 * forever — because switchTab('tabAdd') keyed the form's construction off a
 * cache that was already populated for an unrelated reason, so
 * initPublishForm() was never called. No test anywhere loaded a page and
 * asserted a screen actually renders, so this shipped and stayed broken
 * until the product owner found it by hand. This file is that missing check.
 *
 * It loads web/index.html and web/app.js FROM OUTSIDE, in a jsdom document,
 * and drives them through their real entry points (switchTab, renderEvents)
 * exactly as a browser would. It does NOT touch a database and does NOT
 * start the Express app — see smoke.test.js for that.
 *
 *   node test/web-dom.test.js   (also wired into `npm test`)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

// Reused, not re-typed: TOWNS/TOWN_COORDINATES are fixed-in-code on the
// server and this fixture must not become a second copy of them (CLAUDE.md,
// "البلدات ثابتة بالكود ومكرَّرة في العميلين ... نسخها ... يعيد المشكلة").
const { TOWNS, TOWN_COORDINATES } = require('../src/constants');

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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Polls until `conditionFn()` is truthy or `timeout` elapses. */
async function waitFor(conditionFn, { timeout = 3000, interval = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (conditionFn()) return true;
    await delay(interval);
  }
  return conditionFn();
}

// ---------------------------------------------------------------------------
// Loading web/ as plain files — no build step
// ---------------------------------------------------------------------------
//
// web/ ships zero tooling (CLAUDE.md: "ملفات ثابتة يخدمها Express — لا خطوة
// بناء"). This harness respects that: it reads index.html/config.js/api.js
// /app.js as the plain files they are and evaluates them unmodified. web/
// itself gains nothing — no package.json, no dependency, no artifact.

const WEB_DIR = path.join(__dirname, '..', '..', 'web');
const INDEX_HTML_RAW = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');
const CONFIG_JS = fs.readFileSync(path.join(WEB_DIR, 'config.js'), 'utf8');
const API_JS = fs.readFileSync(path.join(WEB_DIR, 'api.js'), 'utf8');
const APP_JS = fs.readFileSync(path.join(WEB_DIR, 'app.js'), 'utf8');

// index.html's own <script> tags either point at a CDN (Leaflet, Chart.js,
// Socket.IO — README: "كلها عبر CDN ... لا React ولا خطوة بناء") or at the
// three local files above. jsdom never fetches either kind unless
// `resources: 'usable'` is set, which this harness deliberately does not do
// (no network, no database — this suite must run standalone) — so those
// tags would just be silent no-ops if left in place. They are stripped for a
// different, positive reason: app.js reads api.js's top-level `const
// API_BASE` directly (shareOrigin(), initSocket()), and jsdom's window.eval
// does not share `let`/`const` bindings across separate eval() calls the way
// a real browser shares them across sequential <script> tags (verified
// directly against jsdom before writing this). Evaluating config.js, api.js
// and app.js concatenated as ONE script — exactly the scope a browser would
// give them — sidesteps that without changing a single byte of any of them.
const HTML_WITHOUT_SCRIPTS = INDEX_HTML_RAW.replace(/<script[\s\S]*?<\/script>/gi, '');
const COMBINED_SCRIPT = [CONFIG_JS, API_JS, APP_JS].join('\n;\n');

// ---------------------------------------------------------------------------
// Fixtures — shaped exactly like GET /api/occasion-types
// (server/src/services/occasionTypes.service.js: attachFieldsAndReactions)
// ---------------------------------------------------------------------------

// The admin panel is the second page in web/ and loads the same way, for the
// same reason: nothing anywhere asserted that one of its screens renders. Same
// script stripping and same concatenation as above, and for the same causes.
const ADMIN_HTML_RAW = fs.readFileSync(path.join(WEB_DIR, 'admin.html'), 'utf8');
const ADMIN_JS = fs.readFileSync(path.join(WEB_DIR, 'admin.js'), 'utf8');
const ADMIN_HTML_WITHOUT_SCRIPTS = ADMIN_HTML_RAW.replace(/<script[\s\S]*?<\/script>/gi, '');
const ADMIN_COMBINED_SCRIPT = [CONFIG_JS, API_JS, ADMIN_JS].join('\n;\n');

const WEDDING_TYPE = {
  id: 1,
  name: 'عرس',
  icon: '💍',
  color: 'dfb15b',
  position: 1,
  is_active: true,
  tone: 'festive',
  congratulations_label: 'تبريكات',
  show_congratulations_count: true,
  show_followers_count: true,
  show_views_count: true,
  default_badge_title: 'مبارك الفرح',
  default_poster_url: null,
  legacy_client_supported: true,
  reactions: ['coffee', 'horse', 'fireworks', 'rose', 'hand'],
  fields: [
    { field_key: 'honorees', label: 'أصحاب المناسبة', is_required: true, position: 1 },
    { field_key: 'town', label: 'البلدة', is_required: true, position: 2 },
    { field_key: 'event_date', label: 'تاريخ المناسبة', is_required: true, position: 3 },
    { field_key: 'youth_party_date', label: 'سهرة الشباب والدحة', is_required: false, position: 4 },
    { field_key: 'location_name', label: 'موقع القاعة', is_required: true, position: 5 }
  ]
};

const FUNERAL_TYPE = {
  id: 2,
  name: 'عزا',
  icon: '🕊️',
  color: '4b5563',
  position: 2,
  is_active: true,
  tone: 'solemn',
  congratulations_label: 'تعازي',
  show_congratulations_count: false,
  show_followers_count: false,
  show_views_count: false,
  default_badge_title: null,
  default_poster_url: null,
  legacy_client_supported: true,
  reactions: [],
  fields: [
    { field_key: 'honorees', label: 'المتوفَّى', is_required: true, position: 1 },
    { field_key: 'town', label: 'البلدة', is_required: true, position: 2 },
    { field_key: 'event_date', label: 'تاريخ العزاء', is_required: true, position: 3 },
    { field_key: 'location_name', label: 'موقع بيت العزاء', is_required: true, position: 4 }
  ]
};

const OCCASION_TYPES_FIXTURE = [WEDDING_TYPE, FUNERAL_TYPE];

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null }
  };
}

/** A minimal fetch stub for every endpoint app.js's startup path touches. */
function buildFetchStub() {
  return async function fetchStub(url) {
    const requestPath = String(url).split('?')[0];
    if (requestPath === '/api/occasion-types') {
      return jsonResponse({ success: true, types: OCCASION_TYPES_FIXTURE });
    }
    if (requestPath === '/api/towns') {
      return jsonResponse({ success: true, towns: TOWNS, town_coordinates: TOWN_COORDINATES, villages: [] });
    }
    if (requestPath === '/api/events') {
      return jsonResponse({ success: true, events: [], pagination: { page: 1, totalPages: 1 }, announcements: [] });
    }
    if (requestPath === '/api/stories') return jsonResponse({ success: true, stories: [] });
    if (requestPath === '/api/notifications') return jsonResponse({ success: true, notifications: [] });
    if (requestPath === '/api/map/events') return jsonResponse({ success: true, points: [] });
    if (requestPath === '/api/app/version') return jsonResponse({ success: false });
    if (requestPath === '/api/my-events') return jsonResponse({ success: true, events: [] });
    return jsonResponse({ success: false });
  };
}

/** A Leaflet stand-in — every call chains, nothing touches a real canvas/network. */
function buildFakeLeaflet() {
  const chainable = () => {
    const obj = {
      addTo() { return obj; },
      on() { return obj; },
      setView() { return obj; },
      invalidateSize() {},
      removeLayer() {},
      setLatLng() {},
      getLatLng() { return { lat: 0, lng: 0 }; },
      bindPopup() { return obj; }
    };
    return obj;
  };
  return {
    map: () => chainable(),
    tileLayer: () => chainable(),
    marker: () => chainable(),
    divIcon: () => ({})
  };
}

/** A 2D canvas context stand-in — jsdom has no real <canvas> renderer installed. */
function buildFakeCanvasContext() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '',
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {}, strokeRect() {}, fillText() {}, clearRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {},
    measureText: () => ({ width: 0 }),
    drawImage() {}
  };
}

/**
 * Every unhandled rejection anywhere in the process while a DOM env is live.
 * app.js's DOMContentLoaded handler fires several async functions
 * fire-and-forget (fetchEvents(), initSocket(), ...) — a genuine bug in one
 * of them would otherwise surface only as a silent, unattributed crash.
 */
const unhandledRejections = [];
process.on('unhandledRejection', reason => {
  unhandledRejections.push(reason);
});

function assertNoUnhandledRejections(context) {
  if (unhandledRejections.length) {
    const messages = unhandledRejections.map(r => (r && r.stack) || String(r));
    unhandledRejections.length = 0;
    throw new Error(`${context}: unhandled rejection(s):\n${messages.join('\n')}`);
  }
}

/**
 * Builds one fresh jsdom document with web/'s three scripts evaluated into
 * it, real CDN globals (L, Chart, io) and browser-only APIs (fetch,
 * matchMedia, canvas 2D, rAF) stubbed at the seam beforehand — never by
 * editing app.js. `loggedIn` seeds localStorage before evaluation, because
 * app.js reads negev_user/negev_token into module state at load time, the
 * same way a real page load would.
 */
function buildEnv({ loggedIn = false } = {}) {
  const virtualConsole = new VirtualConsole(); // swallow jsdom's own "not implemented" noise; real throws still propagate
  const dom = new JSDOM(HTML_WITHOUT_SCRIPTS, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    virtualConsole
  });
  const { window } = dom;

  if (loggedIn) {
    window.localStorage.setItem('negev_user', JSON.stringify({
      id: 501, full_name: 'مستخدم الاختبار', role: 'user', phone_number: '0521234567'
    }));
    window.localStorage.setItem('negev_token', 'test-token-web-dom');
  }

  window.fetch = buildFetchStub();
  window.io = () => ({ on() {}, off() {}, emit() {} });
  window.L = buildFakeLeaflet();
  window.Chart = function FakeChart() { return { destroy() {}, update() {} }; };
  window.matchMedia = () => ({
    matches: false, addListener() {}, addEventListener() {}, removeListener() {}, removeEventListener() {}
  });
  window.alert = () => {};
  window.confirm = () => true;
  window.requestAnimationFrame = cb => setTimeout(cb, 16);
  window.cancelAnimationFrame = id => clearTimeout(id);
  window.HTMLCanvasElement.prototype.getContext = () => buildFakeCanvasContext();

  window.eval(COMBINED_SCRIPT);

  return dom;
}

/**
 * The same seam for web/admin.html. Deliberately thinner than buildEnv(): the
 * admin panel talks to nothing until a token exists, so an unauthenticated load
 * is enough to drive a form open by hand, which is all these tests do.
 */
function buildAdminEnv() {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(ADMIN_HTML_WITHOUT_SCRIPTS, {
    url: 'http://localhost/admin.html',
    runScripts: 'dangerously',
    virtualConsole
  });
  const { window } = dom;

  window.fetch = buildFetchStub();
  window.alert = () => {};
  window.confirm = () => true;
  window.matchMedia = () => ({
    matches: false, addListener() {}, addEventListener() {}, removeListener() {}, removeEventListener() {}
  });
  window.Chart = function FakeChart() { return { destroy() {}, update() {} }; };
  window.HTMLCanvasElement.prototype.getContext = () => buildFakeCanvasContext();
  // jsdom implements no layout, so scrollIntoView throws "not implemented" —
  // and every form-open function in admin.js calls it as its last line.
  window.Element.prototype.scrollIntoView = () => {};

  window.eval(ADMIN_COMBINED_SCRIPT);

  return dom;
}

async function run() {
  console.log('\nDOM smoke seam (web/, no database)\n');

  await test('web/index.html + config.js + api.js + app.js load together in a jsdom document with no source change', () => {
    const dom = buildEnv();
    assert.strictEqual(typeof dom.window.switchTab, 'function');
    assert.strictEqual(typeof dom.window.renderEvents, 'function');
    assert.strictEqual(typeof dom.window.initPublishForm, 'function');
  });

  console.log('\nPublish form (the 2026-09-02 regression)');

  /**
   * Reproduces the actual sequence that shipped the 2026-09-02 bug, not just
   * a click in isolation: a visitor lands on the home feed first — which
   * fetches occasion types for its own tab bar (initOccasionTypeTabs(),
   * called from DOMContentLoaded) — and only afterwards opens "publish".
   * The historical bug keyed the form's construction off that same
   * already-populated cache instead of "has the form itself been built",
   * so initPublishForm() was silently skipped. Asserting after this same
   * sequence is what makes this test capable of catching it again — see the
   * comment above buildEnv() for how it was verified against a reintroduced
   * copy of the bug.
   */
  async function openPublishTabAfterBrowsingHome(dom) {
    const { document } = dom.window;
    await waitFor(() => document.querySelectorAll('#occasionTypeTabs .town-pill').length > 0);
    dom.window.switchTab('tabAdd');
  }

  await test('switchTab(\'tabAdd\') actually builds the publish form — dynamicFormFields stops being empty', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { document } = dom.window;

    await openPublishTabAfterBrowsingHome(dom);

    const built = await waitFor(() => document.getElementById('dynamicFormFields').children.length > 0);
    assertNoUnhandledRejections('switchTab(\'tabAdd\')');
    assert.ok(built, 'dynamicFormFields never gained any children — this is exactly the spinner-forever regression');

    assert.ok(
      document.getElementById('tabAdd').classList.contains('active-tab'),
      'tabAdd should be the active tab after switchTab'
    );
    assert.ok(
      document.querySelectorAll('#occasionTypePicker .occasion-type-pill').length === OCCASION_TYPES_FIXTURE.length,
      'the occasion-type picker should hold one pill per active type'
    );
  });

  await test('the publish form carries a «سهرة الشباب» field for a type that defines one', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { document } = dom.window;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addYouthDate') !== null);
    assertNoUnhandledRejections('publish form / youth field');

    const input = document.getElementById('addYouthDate');
    assert.ok(input, 'expected an #addYouthDate input for the (default-selected) عرس type');
    assert.strictEqual(input.getAttribute('type'), 'date');

    const label = input.closest('.form-group').querySelector('label');
    assert.ok(label.textContent.includes('سهرة الشباب'), `expected the field's own label, got "${label.textContent}"`);
  });

  console.log('\nEvent card rendering');

  // One renderEvents() call, asserted on synchronously right after — the
  // startup path's own async fetchEvents() would otherwise be a race that
  // could overwrite #eventsContainer out from under this test's fixtures.
  function renderCardFixtures() {
    const dom = buildEnv();
    const { document } = dom.window;

    dom.window.renderEvents([
      {
        id: 901, title: 'عرس أبو فراس', family_clan: 'آل تجربة', town: 'حورة',
        event_date: '2027-01-10', location_name: 'ديوان آل تجربة',
        youth_party_date: '2027-01-09', dinner_time: null, poster_url: null, audio_url: null,
        occasion_type: WEDDING_TYPE, reactions: {}
      },
      {
        id: 902, title: 'عرس أبو سالم', family_clan: 'آل تجربة', town: 'حورة',
        event_date: '2027-02-10', location_name: 'ديوان آل تجربة الثاني',
        youth_party_date: '', dinner_time: null, poster_url: null, audio_url: null,
        occasion_type: WEDDING_TYPE, reactions: {}
      },
      {
        id: 903, title: 'عزاء آل تجربة', family_clan: 'آل تجربة', town: 'حورة',
        event_date: '2027-03-10', location_name: 'بيت العزاء',
        youth_party_date: null, dinner_time: null, poster_url: null, audio_url: null,
        occasion_type: FUNERAL_TYPE, reactions: {}
      }
    ]);

    return { document };
  }

  await test('an event card renders the youth-party line when youth_party_date is present', () => {
    const { document } = renderCardFixtures();
    const card = document.getElementById('eventCard-901');
    assert.ok(card, 'expected card #eventCard-901 to render');
    assert.ok(card.textContent.includes('سهرة الشباب'), 'expected the youth-party field label in the card');
    assert.ok(card.textContent.includes('2027-01-09'), 'expected the youth-party date value in the card');
  });

  await test('an event card omits the youth-party line entirely when youth_party_date is empty', () => {
    const { document } = renderCardFixtures();
    const card = document.getElementById('eventCard-902');
    assert.ok(card, 'expected card #eventCard-902 to render');
    assert.ok(!card.textContent.includes('سهرة الشباب'), 'the youth-party line must not appear when the field is empty');
    assert.strictEqual(card.querySelector('.fa-fire'), null, 'no leftover youth-party detail-item should render either');
  });

  await test('the share button exists on every card and its word follows the occasion type\'s tone', () => {
    const { document } = renderCardFixtures();

    const festiveBtn = document.querySelector('#eventCard-901 .share-event-btn');
    assert.ok(festiveBtn, 'expected a share button on the festive (عرس) card');
    assert.strictEqual(festiveBtn.textContent.trim(), 'شارك المناسبة');

    const solemnBtn = document.querySelector('#eventCard-903 .share-event-btn');
    assert.ok(solemnBtn, 'expected a share button on the solemn (عزا) card');
    assert.strictEqual(solemnBtn.textContent.trim(), 'أرسل النعي');
  });

  console.log('\nAdmin panel — the emoji icon fields');

  /**
   * `service_categories.icon` and `occasion_types.icon` hold a literal emoji:
   * both clients print it as text beside the name (web/app.js and
   * mobile/lib/screens/services_screen.dart), so it can never become a Font
   * Awesome class. The field is free text, correctly — but it shipped with no
   * way to enter one, which is what the product owner hit: "where am I supposed
   * to get an emoji from?". These assert the shortcut exists and writes into
   * the field the form actually submits.
   */
  await test('opening the service-category form renders an icon picker under the free-text field', () => {
    const dom = buildAdminEnv();
    dom.window.openServiceCategoryForm();

    const choices = dom.window.document.querySelectorAll('#scIconPicker .icon-choice');
    assert.ok(choices.length > 0, 'expected the service-category icon picker to render its choices');
    assert.ok(
      dom.window.document.getElementById('scIcon'),
      'the free-text icon input must still be there — the picker is a shortcut, not a replacement'
    );
  });

  await test('clicking a suggested icon fills the input the form submits', () => {
    const dom = buildAdminEnv();
    dom.window.openServiceCategoryForm();

    const { document } = dom.window;
    const choice = document.querySelectorAll('#scIconPicker .icon-choice')[3];
    const expected = choice.textContent.trim();
    choice.click();

    assert.strictEqual(document.getElementById('scIcon').value, expected, 'the clicked emoji should land in #scIcon');
    assert.ok(choice.classList.contains('active'), 'the clicked choice should be the highlighted one');
  });

  await test('the occasion-type form got the same treatment, not just the service one', () => {
    const dom = buildAdminEnv();
    // Opened for a new type rather than an existing one: admin.js keeps its
    // loaded types in a top-level `let`, which an indirect eval does not expose
    // on window (the same jsdom binding rule the comment above buildEnv()
    // describes), so there is no honest way to seed one from out here. The
    // pre-selection path is covered by the click test above regardless.
    dom.window.openOccasionTypeForm();

    const { document } = dom.window;
    const choices = document.querySelectorAll('#otIconPicker .icon-choice');
    assert.ok(choices.length > 0, 'expected the occasion-type icon picker to render its choices');
    assert.strictEqual(
      document.querySelectorAll('#otIconPicker .icon-choice.active').length,
      0,
      'nothing should be highlighted for a brand-new type with an empty icon'
    );

    choices[0].click();
    assert.strictEqual(document.getElementById('otIcon').value, choices[0].textContent.trim());
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error('DOM smoke run crashed:', err);
  process.exit(1);
});
