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
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { renderIcon, buildIconSvg } = require('../scripts/brand-icons');
const { ringBeads, HUB, GROUND, MARK, buildMarkParts, partsToSvgPaths } = require('../src/utils/brandMark');

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
const STYLES_CSS_RAW = fs.readFileSync(path.join(WEB_DIR, 'styles.css'), 'utf8');
const CONFIG_JS = fs.readFileSync(path.join(WEB_DIR, 'config.js'), 'utf8');
const API_JS = fs.readFileSync(path.join(WEB_DIR, 'api.js'), 'utf8');
const OCCASION_FORM_JS = fs.readFileSync(path.join(WEB_DIR, 'occasionForm.js'), 'utf8');
const APP_JS = fs.readFileSync(path.join(WEB_DIR, 'app.js'), 'utf8');

// index.html's own <script> tags either point at a CDN (Leaflet, Chart.js,
// Socket.IO — README: "كلها عبر CDN ... لا React ولا خطوة بناء") or at the
// four local files above. jsdom never fetches either kind unless
// `resources: 'usable'` is set, which this harness deliberately does not do
// (no network, no database — this suite must run standalone) — so those
// tags would just be silent no-ops if left in place. They are stripped for a
// different, positive reason: app.js reads api.js's top-level `const
// API_BASE` directly (shareOrigin(), initSocket()), and jsdom's window.eval
// does not share `let`/`const` bindings across separate eval() calls the way
// a real browser shares them across sequential <script> tags (verified
// directly against jsdom before writing this). Evaluating config.js, api.js,
// occasionForm.js and app.js concatenated as ONE script — exactly the scope a
// browser would give them — sidesteps that without changing a single byte of
// any of them.
const HTML_WITHOUT_SCRIPTS = INDEX_HTML_RAW.replace(/<script[\s\S]*?<\/script>/gi, '');
const COMBINED_SCRIPT = [CONFIG_JS, API_JS, OCCASION_FORM_JS, APP_JS].join('\n;\n');

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
const ADMIN_COMBINED_SCRIPT = [CONFIG_JS, API_JS, OCCASION_FORM_JS, ADMIN_JS].join('\n;\n');

// The two stylesheets are read as text, not parsed: jsdom implements no layout
// and loads no external CSS here, so there is nothing to compute a style from.
// A text assertion is still a real guard — it fails the moment someone deletes
// the rule — and it is the only seam this buildless frontend offers.
const STYLES_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles.css'), 'utf8');
const ADMIN_CSS = fs.readFileSync(path.join(WEB_DIR, 'admin.css'), 'utf8');

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
    { field_key: 'location_name', label: 'موقع القاعة', is_required: true, position: 5 },
    { field_key: 'poster_url', label: 'صورة الملصق', is_required: false, position: 6 }
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

/** One approved event with a poster — enough for renderAdminEvents to draw a card. */
const ADMIN_EVENT_FIXTURE = {
  id: 7,
  status: 'approved',
  title: 'شقيب سلام',
  town: 'شقيب السلام',
  groom_name: 'راني',
  family_clan: 'سلام',
  event_date: '2026-09-26',
  location_name: 'شقيب سلام دوار الثاني بجانب الملعب الكبير',
  poster_url: 'https://example.test/uploads/poster.jpg'
};

/** Two platform users — enough to exercise the phone/name search filter (issue #83). */
const ADMIN_USERS_FIXTURE = [
  { id: 501, phone_number: '0501112223', full_name: 'أحمد المستخدم', clan_town: 'رهط', role: 'user', created_at: '2026-01-01' },
  { id: 502, phone_number: '0509998887', full_name: 'سارة الإدارية', clan_town: 'حورة', role: 'admin', created_at: '2026-01-02' }
];

/** Four of the eight ANALYTICS_EVENTS, two of them the failure ones — enough to exercise Arabic-label mapping and the failure highlight. */
const ANALYTICS_COUNTS_FIXTURE = [
  { event_name: 'share_page_viewed', total: 120 },
  { event_name: 'login', total: 80 },
  { event_name: 'publish_failed', total: 3 },
  { event_name: 'image_upload_failed', total: 1 }
];

/** One user's recent rows, shaped exactly like analytics.service.js#listForUser's return. */
const ANALYTICS_USER_LOG_FIXTURE = {
  events: [
    { event_name: 'login', platform: 'web', app_version: null, content_town: null, created_at: '2026-09-01T10:00:00.000Z' },
    { event_name: 'publish_failed', platform: 'web', app_version: '1.2.0', content_town: 'رهط', created_at: '2026-09-02T11:00:00.000Z' }
  ],
  pagination: { page: 1, limit: 30, total: 2, totalPages: 1 }
};

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
    if (requestPath === '/api/admin/events') {
      return jsonResponse({ success: true, events: [ADMIN_EVENT_FIXTURE] });
    }
    if (requestPath === '/api/admin/users') {
      return jsonResponse({ success: true, users: ADMIN_USERS_FIXTURE });
    }
    if (requestPath === '/api/admin/analytics/counts') {
      return jsonResponse({ success: true, counts: ANALYTICS_COUNTS_FIXTURE });
    }
    if (requestPath.startsWith('/api/admin/analytics/users/')) {
      return jsonResponse({ success: true, user_id: 501, ...ANALYTICS_USER_LOG_FIXTURE });
    }
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
      getZoom() { return 9; },
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
 * The poster crop editor's three seams beyond the 2D context, needed for the
 * publish form's crop editor (app.js): jsdom has no real image decoding (an
 * `Image`'s `src` never fires load/error — verified directly against jsdom
 * before writing this, the same way the concatenated-eval comment above was),
 * no `URL.createObjectURL`, and `HTMLCanvasElement.toBlob` only logs "not
 * implemented" and never calls back. None of these weaken app.js's real path:
 * a real browser provides all three natively, and the editor deliberately
 * never re-queries layout (getBoundingClientRect) for its drag math — it
 * tracks pointer movement by delta from the drag's own start point instead
 * (see `movePosterCropDrag` in app.js) — so no fourth seam is needed for that.
 *
 * `window.__FAKE_IMAGE_SIZE` lets a test choose the "photo" dimensions the
 * next chosen file will decode to, before dispatching its `change` event —
 * this is what exercises the 1600px downscale cap deliberately.
 */
function installPosterCropFakes(window) {
  window.__FAKE_IMAGE_SIZE = { width: 480, height: 640 };

  window.URL.createObjectURL = () => 'blob:fake-poster-url';
  window.URL.revokeObjectURL = () => {};

  window.Image = function FakeImage() {
    const size = window.__FAKE_IMAGE_SIZE;
    const img = { naturalWidth: size.width, naturalHeight: size.height, onload: null, onerror: null };
    Object.defineProperty(img, 'src', {
      set() { setTimeout(() => { if (img.onload) img.onload(); }, 0); }
    });
    return img;
  };

  window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type) {
    const blob = new window.Blob(['fake-cropped-bytes'], { type: type || 'image/png' });
    setTimeout(() => callback(blob), 0);
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
 * Decodes a brand-icon PNG buffer (server/scripts/brand-icons.js) into its raw
 * pixels, the same loadImage -> drawImage -> getImageData round-trip
 * smoke.test.js's decodeCard() uses for the share card.
 */
async function decodeIconPixels(buffer) {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
  return { data, width, height };
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

const MARK_RGB = hexToRgb(MARK);
const GROUND_RGB = hexToRgb(GROUND);

/** Nearest-colour classification — anti-aliased edge pixels fall on whichever side they lean toward. */
function classifyPixel(r, g, b) {
  const distMark = (r - MARK_RGB.r) ** 2 + (g - MARK_RGB.g) ** 2 + (b - MARK_RGB.b) ** 2;
  const distGround = (r - GROUND_RGB.r) ** 2 + (g - GROUND_RGB.g) ** 2 + (b - GROUND_RGB.b) ** 2;
  return distMark < distGround ? 'mark' : 'ground';
}

/**
 * Builds one fresh jsdom document with web/'s three scripts evaluated into
 * it, real CDN globals (L, Chart, io) and browser-only APIs (fetch,
 * matchMedia, canvas 2D, rAF) stubbed at the seam beforehand — never by
 * editing app.js. `loggedIn` seeds localStorage before evaluation, because
 * app.js reads negev_user/negev_token into module state at load time, the
 * same way a real page load would.
 */
function buildEnv({ loggedIn = false, userAgent } = {}) {
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

  // The install hint is the one thing here that branches on the device, and it
  // branches on the user agent. jsdom has no constructor option for this —
  // its `userAgent` option belongs to the resource loader and never reaches
  // navigator — so the property is redefined directly, before app.js is
  // evaluated and can read it.
  if (userAgent) {
    Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
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
  installPosterCropFakes(window);

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
  window.L = buildFakeLeaflet();
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

  /**
   * The field-key switch itself moved into web/occasionForm.js and is now
   * shared with admin.js's direct-publish form (buildOccasionFieldsHtml) —
   * app.js supplies overrides only for location_name/poster_url/audio_url/
   * artist_image_url, the four fields with a richer treatment than a plain
   * input. This pins that the public form still gets ITS OWN rich markup for
   * those (map, crop entry point) and its own button styling, not the admin
   * panel's plain defaults or its button class.
   */
  await test('after the shared field-renderer refactor, the public form still has its own map, crop entry point, and honoree-button styling', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { document } = dom.window;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addLocationPickerMap') !== null);
    assertNoUnhandledRejections('publish form / shared renderer — location + poster');

    assert.ok(document.getElementById('addLocationPickerMap'), 'expected the Leaflet map container — the public form must keep its rich location picker, not the admin panel\'s plain text field');
    assert.ok(document.getElementById('addLat'), 'expected the hidden latitude input the map writes into');
    assert.ok(document.getElementById('addLng'), 'expected the hidden longitude input the map writes into');
    assert.ok(document.getElementById('posterUploadBox'), 'expected the poster crop editor\'s entry point, not a plain file input');
    assert.ok(document.getElementById('addPosterFile'), 'expected the poster file input inside the crop editor\'s upload box');

    const honoreesGroup = document.getElementById('addHonoreesList').closest('.form-group');
    const addButton = honoreesGroup.querySelector('button.add-nokoot-btn');
    assert.ok(addButton, 'expected the public form\'s own styled honoree-add button (add-nokoot-btn), not the admin panel\'s (btn-approve)');
    assert.ok(!honoreesGroup.querySelector('button.btn-approve'), 'must not borrow the admin panel\'s button class — styles.css does not style it');
  });

  /**
   * The four overrides/one suffix above are the exception, not the rule —
   * most fields on the public form (town, event_date, and every field with
   * no override at all) go through the SAME default renderer admin.js's
   * direct-publish form uses. This pins that the shared path itself still
   * works correctly for the public page: right id, right onchange wiring,
   * right label — not just the overridden fields covered above.
   */
  await test('shared (non-overridden) fields still render correctly on the public form: town select and event-date input', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { document } = dom.window;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addTown') !== null);
    assertNoUnhandledRejections('publish form / shared renderer — town + event_date');

    const townSelect = document.getElementById('addTown');
    assert.ok(townSelect, 'expected the shared default #addTown select — town has no override on the public form');
    assert.strictEqual(townSelect.tagName, 'SELECT');
    assert.strictEqual(townSelect.getAttribute('onchange'), 'handleAddTownChange()', 'expected the public form\'s own onTownChange handler wired by the shared renderer');
    const townLabel = townSelect.closest('.form-group').querySelector('label');
    assert.ok(townLabel.textContent.includes('البلدة'), `expected the type's own town label, got "${townLabel.textContent}"`);
    assert.ok(!townSelect.closest('.form-row'), 'the public form\'s town field is not a two-column row — that layout is the admin panel\'s override');

    const dateInput = document.getElementById('addEventDate');
    assert.ok(dateInput, 'expected the shared default #addEventDate input');
    assert.strictEqual(dateInput.getAttribute('type'), 'date');
    assert.strictEqual(dateInput.getAttribute('onchange'), 'checkDateCollisionLive()', 'expected the public form\'s own onDateChange handler wired by the shared renderer');
  });

  /**
   * groupUploads: true is what wraps upload fields in a single
   * `.upload-section` on the public form (occasionForm.js's
   * buildOccasionFieldsHtml) — asserted nowhere before this.
   */
  await test('groupUploads wraps the poster field in .upload-section on the public form', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { document } = dom.window;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addPosterFile') !== null);
    assertNoUnhandledRejections('publish form / upload-section grouping');

    const uploadSection = document.querySelector('#dynamicFormFields .upload-section');
    assert.ok(uploadSection, 'expected upload fields grouped inside a single .upload-section on the public form');
    assert.ok(uploadSection.querySelector('#addPosterFile'), 'expected the poster field specifically inside that section');
  });

  console.log('\nPublish form — poster crop editor (Facebook-style, #optional-crop)');

  /**
   * Simulates a publisher choosing a file for the poster field: assigns a
   * fake `File` onto `#addPosterFile.files` (jsdom's own `files` is read-only,
   * so this is the standard `defineProperty` workaround) and fires the same
   * `change` event a real file picker would, then waits for the editor to
   * actually appear — `installPosterCropFakes` is what makes the underlying
   * `Image`/`toBlob`/`createObjectURL` calls resolve at all under jsdom.
   */
  async function choosePosterFile(dom, size) {
    const win = dom.window;
    const { document } = win;
    if (size) win.__FAKE_IMAGE_SIZE = size;

    const input = document.getElementById('addPosterFile');
    const file = new win.File(['fake-bytes'], 'invitation.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change', { bubbles: true }));

    await waitFor(() => document.getElementById('posterCropEditor').hidden === false);
  }

  /** Fills in what handleEventSubmit requires for the (default-selected) عرس type, beyond the poster itself. */
  function fillRequiredPublishFields(document) {
    document.querySelector('#addHonoreesList .honoree-name').value = 'محمد وفاطمة';
    document.getElementById('addLocationName').value = 'ديوان آل تجربة بجانب الجامع';
  }

  await test('choosing a poster reveals the crop editor and steps the plain upload box aside', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { document } = dom.window;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addPosterFile') !== null);

    await choosePosterFile(dom);
    assertNoUnhandledRejections('poster crop editor / reveal');

    assert.strictEqual(document.getElementById('posterCropEditor').hidden, false, 'expected the crop editor to be shown');
    assert.strictEqual(document.getElementById('posterUploadBox').hidden, true, 'the plain file box must step aside once a file is chosen');
    assert.strictEqual(document.getElementById('posterCropPreview').hidden, true, 'no preview yet — nothing has been confirmed');
  });

  await test('the crop rectangle initialises around the whole image', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { document } = dom.window;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addPosterFile') !== null);
    await choosePosterFile(dom, { width: 480, height: 640 });

    const box = document.getElementById('posterCropBox');
    assert.strictEqual(box.style.left, '0%', 'the crop box must start flush with the image\'s left edge');
    assert.strictEqual(box.style.top, '0%', 'the crop box must start flush with the image\'s top edge');
    assert.strictEqual(box.style.width, '100%', 'nothing is cropped away until the publisher drags a handle');
    assert.strictEqual(box.style.height, '100%');
  });

  await test('dragging a corner handle changes the crop rectangle\'s stored bounds', async () => {
    const dom = buildEnv({ loggedIn: true });
    const win = dom.window;
    const { document } = win;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addPosterFile') !== null);
    // 480×640 keeps displayScale at 1 (below POSTER_CROP_MAX_EDITOR_WIDTH), so
    // client-pixel deltas map onto working-canvas pixels one-to-one — this
    // test's own arithmetic below can stay a direct mirror of app.js's.
    await choosePosterFile(dom, { width: 480, height: 640 });

    const handle = document.querySelector('#posterCropBox .poster-crop-handle[data-corner="br"]');
    handle.dispatchEvent(new win.PointerEvent('pointerdown', { clientX: 480, clientY: 640, bubbles: true }));
    document.dispatchEvent(new win.PointerEvent('pointermove', { clientX: 380, clientY: 500, bubbles: true }));
    document.dispatchEvent(new win.PointerEvent('pointerup', { clientX: 380, clientY: 500, bubbles: true }));

    const box = document.getElementById('posterCropBox');
    assert.strictEqual(box.style.left, '0%', 'dragging the bottom-right corner must not move the fixed top-left one');
    assert.strictEqual(box.style.top, '0%');
    assert.strictEqual(box.style.width, `${(380 / 480) * 100}%`, 'shrinking by 100 client px on a 1:1 scale should shrink the rect by exactly that');
    assert.strictEqual(box.style.height, `${(500 / 640) * 100}%`);
  });

  await test('confirming a crop sends the cropped Blob under "poster", with an explicit .jpg filename', async () => {
    const dom = buildEnv({ loggedIn: true });
    const win = dom.window;
    const { document } = win;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addPosterFile') !== null);
    await choosePosterFile(dom, { width: 480, height: 640 });

    win.confirmPosterCrop();
    await waitFor(() => document.getElementById('posterCropPreview').hidden === false);
    assertNoUnhandledRejections('confirmPosterCrop');

    fillRequiredPublishFields(document);

    let capturedRequest = null;
    win.fetch = async (url, opts = {}) => {
      if (String(url).includes('/api/events') && opts.method === 'POST') {
        capturedRequest = opts;
        return jsonResponse({ success: true, status: 'approved' });
      }
      return jsonResponse({ success: true, events: [], pagination: { page: 1, totalPages: 1 }, announcements: [] });
    };

    await win.handleEventSubmit({ preventDefault() {} });
    assertNoUnhandledRejections('handleEventSubmit after confirming a crop');

    assert.ok(capturedRequest, 'expected the publish POST to actually fire');
    const posterEntry = capturedRequest.body.get('poster');
    assert.ok(posterEntry, 'expected a "poster" entry in the submitted FormData');
    // The regression this guards: appending a Blob with no third argument
    // makes multer's `file.originalname` the literal string "blob" — no
    // extension — and upload.js's filename() builds the stored name from
    // `path.extname(originalname)`, so the file is saved with no suffix at all.
    assert.ok(
      posterEntry.name.endsWith('.jpg'),
      `expected an explicit filename ending in .jpg, got "${posterEntry.name}" — a nameless Blob would silently save with no extension`
    );
    assert.strictEqual(posterEntry.type, 'image/jpeg', 'expected the export MIME to be image/jpeg, as passed to canvas.toBlob');
  });

  await test('"استخدام الصورة كاملة" still submits a Blob, and the working canvas never exceeds 1600px on its longest edge', async () => {
    const dom = buildEnv({ loggedIn: true });
    const win = dom.window;
    const { document } = win;

    await openPublishTabAfterBrowsingHome(dom);
    await waitFor(() => document.getElementById('addPosterFile') !== null);

    // Deliberately over the cap — 3000×4000 — to exercise the downscale, not just assert its absence of harm.
    await choosePosterFile(dom, { width: 3000, height: 4000 });

    const canvas = document.getElementById('posterCropCanvas');
    assert.ok(
      canvas.width <= 1600 && canvas.height <= 1600,
      `expected the working canvas capped at 1600px, got ${canvas.width}x${canvas.height}`
    );
    assert.strictEqual(
      Math.max(canvas.width, canvas.height), 1600,
      'an oversized photo should be downscaled until its longest edge lands exactly on the cap'
    );

    win.usePosterWholeImage();
    await waitFor(() => document.getElementById('posterCropPreview').hidden === false);
    assertNoUnhandledRejections('usePosterWholeImage');

    fillRequiredPublishFields(document);

    let capturedRequest = null;
    win.fetch = async (url, opts = {}) => {
      if (String(url).includes('/api/events') && opts.method === 'POST') {
        capturedRequest = opts;
        return jsonResponse({ success: true, status: 'approved' });
      }
      return jsonResponse({ success: true, events: [], pagination: { page: 1, totalPages: 1 }, announcements: [] });
    };

    await win.handleEventSubmit({ preventDefault() {} });
    assertNoUnhandledRejections('handleEventSubmit after "use the whole image"');

    assert.ok(capturedRequest, 'expected the publish POST to actually fire even with no crop made');
    const posterEntry = capturedRequest.body.get('poster');
    assert.ok(posterEntry, 'expected a "poster" entry even when the publisher never touched the crop rectangle');
    assert.ok(posterEntry.name.endsWith('.jpg'), `expected the filename to end in .jpg, got "${posterEntry.name}"`);
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

  console.log('\nAdmin panel — editing an event');

  /**
   * The edit form used to ask for a latitude and a longitude as two bare text
   * boxes, and for the poster as a URL — so replacing a picture meant hosting
   * it somewhere else first. Both were the product owner's report. These pin
   * the replacements: the coordinates come from a map, and a file can be
   * chosen straight from the device.
   */
  await test('the event edit form carries a map and a file input, not hand-typed coordinates', () => {
    const dom = buildAdminEnv();
    dom.window.ensureEventEditFormMounted();

    const { document } = dom.window;
    assert.ok(document.getElementById('evtLocationMap'), 'expected a map container in the edit form');
    assert.ok(document.getElementById('evtPosterFile'), 'expected a poster file input in the edit form');
    assert.strictEqual(
      document.getElementById('evtLat').type,
      'hidden',
      'latitude must no longer be a box someone types into — the map writes it'
    );
    assert.strictEqual(document.getElementById('evtLng').type, 'hidden');
  });

  await test('opening the map on an event with coordinates fills the fields the form submits', () => {
    const dom = buildAdminEnv();
    dom.window.ensureEventEditFormMounted();
    dom.window.initEventLocationMap('31.2589', '34.7913');

    const { document } = dom.window;
    // 7 decimals, not 6 — villages.latitude/longitude and events.latitude/longitude
    // are both DECIMAL(10,7); toFixed(6) silently dropped the seventh digit, so
    // re-saving an event with no real change moved its pin.
    assert.strictEqual(document.getElementById('evtLat').value, '31.2589000');
    assert.strictEqual(document.getElementById('evtLng').value, '34.7913000');
    assert.ok(
      document.getElementById('evtCoordsLabel').textContent.includes('31.2589000'),
      'the coordinates should be readable under the map, not only inside a hidden input'
    );
  });

  await test('an event with no coordinates opens with nothing selected, and clearing says so', () => {
    const dom = buildAdminEnv();
    dom.window.ensureEventEditFormMounted();
    dom.window.initEventLocationMap('', '');

    const { document } = dom.window;
    assert.strictEqual(document.getElementById('evtLat').value, '', 'no pin means no coordinate, not a default one');
    assert.strictEqual(document.getElementById('evtCoordsLabel').textContent, 'لا موقع محدَّد');
  });

  await test('a chosen poster is sent as multipart under the field name the server reads', () => {
    const dom = buildAdminEnv();
    const file = new dom.window.File(['x'], 'poster.png', { type: 'image/png' });

    const form = dom.window.buildEventEditFormData(
      { title: 'عنوان جديد', village_id: null, honorees: [{ name: 'عريس' }] },
      file
    );

    assert.ok(form.get('poster'), 'the file must ride under "poster" — the name upload.js registers');
    assert.strictEqual(form.get('title'), 'عنوان جديد');
    assert.strictEqual(form.get('village_id'), '', 'a cleared village must travel as empty, which the server reads as null');
    assert.strictEqual(form.get('honorees'), JSON.stringify([{ name: 'عريس' }]), 'honorees must be JSON, as the publish form sends them');
  });

  console.log('\nAdmin panel — village map (typed-by-hand coordinates → click-to-pick)');

  /**
   * Adding a village used to mean typing latitude/longitude from memory —
   * nobody has their village's coordinates memorised, so the pin landed
   * wrong or the village never got added. The fix reuses the event-edit
   * form's map logic (extracted into initLocationPicker) rather than a
   * second copy: these pin that both forms share the one initialiser and
   * that the village form's own coordinate fields stay required, unlike the
   * event form's map (whose location is optional).
   */
  await test('the village form carries a map container, and coordinates stay required', () => {
    const dom = buildAdminEnv();
    dom.window.openVillageForm();

    const { document } = dom.window;
    assert.ok(document.getElementById('vilLocationMap'), 'expected a map container in the village form');
    assert.strictEqual(document.getElementById('vilLat').required, true, 'latitude must stay mandatory — the map makes it easy, not optional');
    assert.strictEqual(document.getElementById('vilLng').required, true, 'longitude must stay mandatory — the map makes it easy, not optional');
  });

  await test('opening the map on a village with coordinates fills the fields the form submits', () => {
    const dom = buildAdminEnv();
    dom.window.initVillageLocationMap('31.2589', '34.7913');

    const { document } = dom.window;
    // 7 decimals — see the matching event-form assertion above for why.
    assert.strictEqual(document.getElementById('vilLat').value, '31.2589000');
    assert.strictEqual(document.getElementById('vilLng').value, '34.7913000');
  });

  await test('a simulated pin placement (click or drag) writes vilLat/vilLng — the same function the map\'s own click/drag handlers call', () => {
    const dom = buildAdminEnv();
    dom.window.openVillageForm();
    dom.window.placeLocationMarker('vilLocationMap', 31.3, 34.8);

    const { document } = dom.window;
    assert.strictEqual(document.getElementById('vilLat').value, '31.3000000');
    assert.strictEqual(document.getElementById('vilLng').value, '34.8000000');
  });

  /**
   * Typing coordinates by hand used to submit the typed value while the pin
   * silently kept pointing wherever it last was — the map and the fields
   * could disagree with nothing on screen saying so. Fixed by having the
   * fields drive the marker too (followManualCoordsInput), wired from
   * vilLat/vilLng's own oninput in admin.html. The event form's inputs stay
   * hidden, so it gets none of this.
   */
  await test('typing a full, valid pair of coordinates by hand moves the pin and recentres the map', () => {
    const dom = buildAdminEnv();
    dom.window.openVillageForm();

    const { document, L } = dom.window;
    const markerCalls = [];
    const originalMarker = L.marker;
    L.marker = (latlng, opts) => { markerCalls.push(latlng); return originalMarker(latlng, opts); };

    document.getElementById('vilLat').value = '31.4';
    document.getElementById('vilLng').value = '34.9';
    dom.window.followManualCoordsInput('vilLocationMap');

    assert.strictEqual(markerCalls.length, 1, 'a full valid pair should place a pin — none existed yet for a brand-new village');
    // markerCalls[0] is an Array from the jsdom window's own realm, not Node's
    // — compared element-by-element rather than via deepStrictEqual to avoid
    // a spurious cross-realm inequality.
    assert.strictEqual(markerCalls[0][0], 31.4);
    assert.strictEqual(markerCalls[0][1], 34.9);
    // must not fight the admin mid-keystroke: the fields stay exactly what
    // was typed, not reformatted to 7 decimals the moment a valid pair lands
    assert.strictEqual(document.getElementById('vilLat').value, '31.4');
    assert.strictEqual(document.getElementById('vilLng').value, '34.9');
  });

  await test('typing a partial or non-numeric coordinate by hand is ignored — no thrown error, no pin jumping to a nonsense location', () => {
    const dom = buildAdminEnv();
    dom.window.openVillageForm();

    const { document, L } = dom.window;
    const markerCalls = [];
    const originalMarker = L.marker;
    L.marker = (latlng, opts) => { markerCalls.push(latlng); return originalMarker(latlng, opts); };

    document.getElementById('vilLat').value = '31.2589';
    document.getElementById('vilLng').value = ''; // still mid-typing
    assert.doesNotThrow(() => dom.window.followManualCoordsInput('vilLocationMap'));
    assert.strictEqual(markerCalls.length, 0, 'an incomplete pair must not place or move a pin');

    document.getElementById('vilLat').value = 'abc';
    document.getElementById('vilLng').value = '34.7913';
    assert.doesNotThrow(() => dom.window.followManualCoordsInput('vilLocationMap'));
    assert.strictEqual(markerCalls.length, 0, 'non-numeric text must not place or move a pin either');
  });

  /**
   * The earlier version of this test only asserted that evtLat/vilLat ended
   * up with the right values — which a shared-module-globals implementation
   * (exactly what the registry replaced) would also get right, since each
   * wrapper passes its own field ids straight through. That proved nothing
   * about the registry itself. This asserts the thing that actually depends
   * on per-container keying: initialising the village map must not skip
   * building a real Leaflet map for it, and re-initialising the event map
   * afterwards must not rebuild one either (its own picker entry is still
   * there, untouched). Note: the fake Leaflet's on() is a no-op, so this
   * still cannot exercise real click/drag wiring — only inspect it.
   */
  await test('the event and village pickers are genuinely distinct registry entries, not a shared global', () => {
    const dom = buildAdminEnv();
    dom.window.ensureEventEditFormMounted();

    const mapCalls = [];
    const originalMap = dom.window.L.map;
    dom.window.L.map = containerId => {
      mapCalls.push(containerId);
      return originalMap(containerId);
    };

    dom.window.initEventLocationMap('31.0', '34.0');
    dom.window.initVillageLocationMap('30.0', '35.0');
    // re-initialising the event picker must reuse its own stored map, not
    // rebuild one — a shared-globals implementation that let the village
    // init overwrite a single module-level map variable would fail this by
    // either rebuilding here or never having built a real map for the
    // village container in the first place.
    dom.window.initEventLocationMap('31.1', '34.1');

    assert.deepStrictEqual(
      mapCalls,
      ['evtLocationMap', 'vilLocationMap'],
      'expected exactly one L.map() call per container — one for each — and none rebuilt on re-init'
    );
  });

  console.log('\nAdmin panel — direct publish form (the production blocker: no occasion type, no honorees)');

  /**
   * Before this fix, "نشر مناسبة معتمدة فوراً" was a hardcoded wedding form
   * that sent groom_name/town/family_clan/... with no occasion_type_id and no
   * honorees[] — events.routes.js rejects that unconditionally
   * (parseId(undefined) → "نوع المناسبة غير صالح", the exact alert the super
   * admin saw). These pin the fixed behaviour: the type picker drives the
   * rest of the form, built by the SAME field-key renderer web/app.js's own
   * publish form uses (buildOccasionFieldsHtml, web/occasionForm.js) — the
   * admin panel overrides only 'town' (its own two-column form-row layout)
   * and the honoree-add button's class, so every other field gets the plain
   * default markup (no map, no crop editor) instead of a second copy of the
   * switch.
   */
  await test('initDirectAddForm() builds a type picker and the first active type\'s own fields — no hardcoded wedding form', async () => {
    const dom = buildAdminEnv();
    await dom.window.initDirectAddForm();

    const { document } = dom.window;
    const options = document.querySelectorAll('#dirOccasionType option');
    assert.strictEqual(options.length, OCCASION_TYPES_FIXTURE.length, 'expected one option per active occasion type');

    assert.ok(document.getElementById('dirHonoreesList'), 'expected an honorees list for the (default-selected) عرس type');
    assert.ok(document.querySelector('#dirHonoreesList .honoree-name'), 'expected at least one honoree row pre-added');
    assert.ok(document.getElementById('dirTown'), 'expected a town select');
    assert.ok(document.getElementById('dirEventDate'), 'expected an event-date input');
    assert.ok(document.getElementById('dirYouthDate'), 'عرس defines a youth-party field');
    assert.ok(document.getElementById('dirLocationName'), 'عرس defines a location field');
    assert.ok(document.getElementById('dirPosterFile'), 'عرس defines a poster field');

    assert.strictEqual(document.getElementById('dirFamily'), null, 'family_clan is not on the عرس fixture — it must not render');
    assert.strictEqual(document.getElementById('dirGroom'), null, 'the old hardcoded groom_name field must be gone entirely');
  });

  await test('switching to a mourning type relabels the honorees field and drops fields it does not define', async () => {
    const dom = buildAdminEnv();
    await dom.window.initDirectAddForm();
    const { document } = dom.window;

    document.getElementById('dirOccasionType').value = String(FUNERAL_TYPE.id);
    dom.window.handleDirOccasionTypeChange();

    const label = document.getElementById('dirHonoreesList').closest('.form-group').querySelector('label');
    assert.ok(label.textContent.includes('المتوفَّى'), `expected the funeral type's own label, got "${label.textContent}"`);
    assert.strictEqual(document.getElementById('dirYouthDate'), null, 'a funeral type has no youth-party field in this fixture — it must not render');
    assert.strictEqual(document.getElementById('dirPosterFile'), null, 'a funeral type has no poster field in this fixture — it must not render');
  });

  await test('the admin honoree-add button keeps the panel\'s own styling, not the public site\'s', async () => {
    const dom = buildAdminEnv();
    await dom.window.initDirectAddForm();
    const { document } = dom.window;

    const button = document.querySelector('#dirHonoreesList + button');
    assert.ok(button, 'expected an add-honoree button right after the list');
    assert.ok(button.classList.contains('btn-approve'), 'the admin panel button must use its own admin.css class');
    assert.ok(!button.classList.contains('add-nokoot-btn'), 'must not borrow the public site\'s button class — admin.css does not style it');
  });

  /**
   * The town+village pair used to sit side by side (a `.form-row` of two
   * `.form-group.half`s, styled by admin.css:372-373) before the shared
   * renderer shipped, and silently stacked full-width afterwards — nothing
   * asked for that, and admin.css never stopped supporting the two-column
   * layout. 'town' is the one field the admin panel overrides (not just
   * relabels), specifically to keep this layout.
   */
  await test('the panel keeps its own two-column layout for town+village — not the shared renderer\'s stacked default', async () => {
    const dom = buildAdminEnv();
    await dom.window.initDirectAddForm();
    const { document } = dom.window;

    const townSelect = document.getElementById('dirTown');
    assert.ok(townSelect, 'expected the town select');
    const row = townSelect.closest('.form-row');
    assert.ok(row, 'expected the town field wrapped in a .form-row — the panel\'s own two-column layout');

    const halves = row.querySelectorAll(':scope > .form-group.half');
    assert.strictEqual(halves.length, 2, 'expected exactly two .form-group.half columns: town and village');
    assert.ok(halves[0].contains(townSelect), 'the town select must be the first column');
    assert.ok(halves[1].querySelector('#dirVillageGroup') || halves[1].id === 'dirVillageGroup', 'the village group must be the second column');
  });

  /**
   * groupUploads: false on the panel — it never wrapped upload fields in a
   * visual section, and the shared renderer must not start doing that on its
   * behalf just because the public form wants it.
   */
  await test('the panel gets no .upload-section wrapper — groupUploads stays false there', async () => {
    const dom = buildAdminEnv();
    await dom.window.initDirectAddForm();
    const { document } = dom.window;

    assert.ok(document.getElementById('dirPosterFile'), 'expected the poster field to exist');
    assert.strictEqual(document.querySelector('#dirDynamicFields .upload-section'), null, 'the admin panel must not gain the public form\'s upload-section grouping');
  });

  await test('a required field left empty is rejected client-side with that type\'s own label', async () => {
    const dom = buildAdminEnv();
    await dom.window.initDirectAddForm();
    const win = dom.window;
    const { document } = win;

    document.querySelector('#dirHonoreesList .honoree-name').value = 'محمد وفاطمة';
    document.getElementById('dirEventDate').value = '2027-05-01';
    // location_name («موقع القاعة» على هذا النوع تحديداً) يبقى فارغاً عمداً

    let alertedWith = null;
    win.alert = msg => { alertedWith = msg; };
    let fetchCalled = false;
    win.fetch = async () => { fetchCalled = true; return jsonResponse({ success: true }); };

    await win.handleDirectAdd({ preventDefault() {} });
    assertNoUnhandledRejections('handleDirectAdd / missing required field');

    assert.ok(alertedWith && alertedWith.includes('موقع القاعة'), `expected the alert to name the type's own location label, got "${alertedWith}"`);
    assert.ok(!fetchCalled, 'the publish request must not fire while a required field is missing');
  });

  await test('a successful publish sends occasion_type_id and honorees[], never the old hardcoded groom_name form', async () => {
    const dom = buildAdminEnv();
    await dom.window.initDirectAddForm();
    const win = dom.window;
    const { document } = win;

    document.querySelector('#dirHonoreesList .honoree-name').value = 'سالم ونورة';
    document.getElementById('dirEventDate').value = '2027-06-15';
    document.getElementById('dirLocationName').value = 'ديوان آل تجربة';

    let captured = null;
    win.fetch = async (url, opts = {}) => {
      if (String(url).includes('/api/events') && opts.method === 'POST') {
        captured = opts;
        return jsonResponse({ success: true, status: 'approved' });
      }
      return jsonResponse({ success: true });
    };

    await win.handleDirectAdd({ preventDefault() {} });
    assertNoUnhandledRejections('handleDirectAdd / successful publish');

    assert.ok(captured, 'expected the publish POST to actually fire');
    assert.strictEqual(captured.body.get('occasion_type_id'), String(WEDDING_TYPE.id));
    assert.strictEqual(captured.body.get('honorees[0][name]'), 'سالم ونورة');
    assert.strictEqual(captured.body.get('groom_name'), null, 'the old hardcoded field must never be sent again');
  });

  console.log('\nAdmin panel — the poster is no longer cropped through the head');

  /**
   * The product owner sent a screenshot of the admin list: a portrait photo
   * with the head cut clean off. `object-fit: cover` crops from the CENTRE by
   * default, and every poster here is portrait — a printed invitation or a 3:4
   * phone photo — inside a landscape band, so the crop eats the top and the
   * bottom, and the face lives at the top.
   *
   * The contract these pin (#53): a surface you SCAN crops, but from the top;
   * a surface where you DECIDE shows the whole poster. The admin list is the
   * second kind — an admin looking at a crop is being shown the wrong thing.
   */
  await test('the admin list draws the whole poster over a fill, not a crop of it', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminEvents();

    const { document } = dom.window;
    const shot = document.querySelector('#adminEventsList .admin-card-shot');
    assert.ok(shot, 'expected the poster to sit in a shot wrapper, which is what holds the fill behind it');

    const poster = shot.querySelector('.admin-card-poster');
    const fill = shot.querySelector('.admin-card-poster-fill');
    assert.ok(poster, 'the poster itself must still be there');
    assert.ok(fill, 'and a blurred copy behind it, or the contained poster sits in empty gutters');
    assert.strictEqual(poster.getAttribute('src'), fill.getAttribute('src'), 'both must be the same file — one fetch, not two');
    assert.strictEqual(fill.getAttribute('aria-hidden'), 'true', 'the fill is decoration and must not be announced twice');
  });

  await test('and its stylesheet contains the poster rather than cropping it', () => {
    assert.ok(
      /\.admin-card-poster\s*\{[^}]*object-fit:\s*contain/.test(ADMIN_CSS),
      'the admin poster must be contained — a cropped poster is what the product owner reported'
    );
    assert.ok(
      /\.admin-card-shot\s*\{[^}]*height:\s*200px/.test(ADMIN_CSS),
      'the height must stay fixed, or the card grid goes ragged — that is the whole reason for the blurred fill'
    );
  });

  await test('the browsing cards still crop, but from the top, so the face survives', () => {
    assert.ok(
      /\.card-poster-img\s*\{[^}]*object-position:\s*top/.test(STYLES_CSS),
      'without an explicit top anchor object-fit: cover crops from the centre, which is the reported bug'
    );
    assert.ok(
      /\.card-poster-img\s*\{[^}]*object-fit:\s*cover/.test(STYLES_CSS),
      'the browsing card keeps cropping on purpose: contained inside 124px a portrait poster is a 93px stamp'
    );
  });


  console.log('\nAdmin panel — searching for a user by phone number or name (issue #83)');

  /**
   * Issue #83 criterion 1: a super admin «يبحث عن مستخدم برقمه» before
   * promoting them. The list itself already came from GET /api/admin/users —
   * this filters over that already-fetched array, client-side, with no new
   * request per keystroke.
   */
  await test('the users tab filters by phone number and by name, over the already-fetched list', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminUsers();

    const { document } = dom.window;
    const rowCount = () => document.querySelectorAll('#adminUsersList tbody tr').length;
    assert.strictEqual(rowCount(), ADMIN_USERS_FIXTURE.length, 'expected every fetched user to render with no filter applied');

    document.getElementById('adminUserSearch').value = '0509998887';
    dom.window.handleAdminUserSearch();
    assert.strictEqual(rowCount(), 1, 'expected the phone-number filter to narrow to exactly one row');
    assert.ok(document.getElementById('adminUsersList').textContent.includes('سارة الإدارية'));

    document.getElementById('adminUserSearch').value = 'أحمد';
    dom.window.handleAdminUserSearch();
    assert.strictEqual(rowCount(), 1, 'expected the name filter to narrow to exactly one row');
    assert.ok(document.getElementById('adminUsersList').textContent.includes('0501112223'));

    document.getElementById('adminUserSearch').value = '';
    dom.window.handleAdminUserSearch();
    assert.strictEqual(rowCount(), ADMIN_USERS_FIXTURE.length, 'clearing the search must restore the full list');
  });

  console.log('\nAdmin panel — analytics/tracking tab (the reading UI that shipped with no UI)');

  /**
   * Both endpoints (GET /api/admin/analytics/counts and
   * GET /api/admin/analytics/users/:userId) predate this UI — only the
   * reading screen was missing. These pin the two things the brief called
   * out by name: a super admin reading "share_page_viewed" is told nothing,
   * and the two events that mean something is actually broken
   * (publish_failed, image_upload_failed) must stand out, not sit in a plain
   * list indistinguishable from the rest.
   */
  await test('the counts panel shows Arabic labels, never raw English event keys, and flags exactly the two failure events', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminAnalyticsCounts();

    const { document } = dom.window;
    const text = document.getElementById('analyticsCountsList').textContent;

    assert.ok(text.includes('فتح صفحة رابط مناسبة مشارَكة'), 'expected the Arabic label for share_page_viewed');
    assert.ok(text.includes('تسجيل الدخول'), 'expected the Arabic label for login');
    assert.ok(text.includes('فشل نشر مناسبة'), 'expected the Arabic label for publish_failed');
    assert.ok(!text.includes('share_page_viewed'), 'the raw English key must never reach the screen');
    assert.ok(!text.includes('publish_failed'), 'the raw English key must never reach the screen');
    assert.ok(!text.includes('image_upload_failed'), 'the raw English key must never reach the screen');

    const failureBadges = document.querySelectorAll('#analyticsCountsList .status-tag.rejected');
    assert.strictEqual(failureBadges.length, 2, 'expected exactly publish_failed and image_upload_failed to carry the failure badge');
  });

  await test('every one of the eight known events renders, even one with zero recorded occurrences so far', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminAnalyticsCounts();

    // register never appears in ANALYTICS_COUNTS_FIXTURE — an admin reading
    // this panel must still see it listed, at zero, not silently dropped.
    const text = dom.window.document.getElementById('analyticsCountsList').textContent;
    assert.ok(text.includes('إنشاء حساب جديد'), 'expected the Arabic label for register even though it has no rows in the fixture');
  });

  await test('the retention notice states the real 90-day window, not a made-up number', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminAnalyticsCounts();

    const noticeText = dom.window.document.getElementById('analyticsRetentionNotice').textContent;
    assert.ok(noticeText.includes('90'), `expected the real retention window from analytics.service.js, got: "${noticeText}"`);
  });

  await test('a 403 on the counts endpoint (a non-super-admin somehow landing here) renders the server\'s Arabic message, not a blank panel or a thrown error', async () => {
    const dom = buildAdminEnv();
    dom.window.fetch = async () => jsonResponse({ success: false, message: 'صلاحيات المدير العام مطلوبة' }, { status: 403 });

    await dom.window.fetchAdminAnalyticsCounts();

    const text = dom.window.document.getElementById('analyticsCountsList').textContent;
    assert.ok(text.includes('صلاحيات المدير العام مطلوبة'), 'expected the server\'s own Arabic forbidden message on screen');
  });

  /**
   * Picking a user is a button on the ALREADY-fetched/searchable users list
   * (issue #83), not a second search implementation — this drives that exact
   * path: fetch the users list, then pick one, and check the per-user log
   * that comes back from the paginated endpoint.
   */
  await test('picking a user from the users list renders that user\'s paginated log with Arabic event labels', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminUsers();

    dom.window.viewUserAnalytics(501);
    await waitFor(() => dom.window.document.getElementById('analyticsUserLog').querySelectorAll('tbody tr').length > 0);
    assertNoUnhandledRejections('viewUserAnalytics');

    const { document } = dom.window;
    assert.ok(document.getElementById('tabAnalytics').classList.contains('active-pane'), 'picking a user must switch to the analytics tab');
    assert.ok(document.getElementById('analyticsUserLogHeader').textContent.includes('أحمد المستخدم'), 'expected the picked user\'s own name in the log header');

    const rows = document.querySelectorAll('#analyticsUserLog tbody tr');
    assert.strictEqual(rows.length, ANALYTICS_USER_LOG_FIXTURE.events.length, 'expected one row per returned event');
    assert.ok(rows[0].textContent.includes('تسجيل الدخول'), 'expected the Arabic label for login');
    assert.ok(rows[1].textContent.includes('فشل نشر مناسبة'), 'expected the Arabic label for publish_failed');
    assert.ok(!document.getElementById('analyticsUserLog').textContent.includes('publish_failed'), 'the raw English key must never reach the screen');
  });

  console.log('\nInstallable on a phone — the manifest, the mark, and the iOS hint');

  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

  /**
   * index.html used to carry two Apple meta tags under a comment reading
   * "Web App Manifest Meta" — and no manifest. So the site had no icon at all:
   * iOS derived the home-screen icon from a SCREENSHOT of the page. On iOS 26
   * every site added to the home screen opens standalone regardless, so this
   * was not a dormant feature, it was a live one wearing a screenshot for a
   * face (#54, #55).
   */
  await test('the page links a real manifest and a real apple-touch-icon', () => {
    const dom = buildEnv();
    const { document } = dom.window;

    assert.ok(document.querySelector('link[rel="manifest"]'), 'the manifest promised by the old comment must actually exist');
    assert.ok(
      document.querySelector('link[rel="apple-touch-icon"]'),
      'iOS prefers apple-touch-icon OVER the manifest icons — without it the icon is a screenshot of the page'
    );
    assert.ok(document.querySelector('link[rel="icon"]'), 'and a favicon, which the site never had');
  });

  await test('the manifest is valid JSON, standalone, and names icons that exist on disk', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(WEB_DIR, 'manifest.json'), 'utf8'));

    assert.strictEqual(manifest.display, 'standalone', 'a browser-tab manifest installs nothing worth installing');
    assert.strictEqual(manifest.dir, 'rtl', 'the whole product is RTL Arabic; the installed shell must be too');

    const maskable = manifest.icons.filter(i => String(i.purpose).includes('maskable'));
    assert.ok(maskable.length > 0, 'without a maskable icon Android crops the mark inside its own shape');

    manifest.icons.forEach(icon => {
      const onDisk = path.join(WEB_DIR, icon.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(onDisk), `manifest names ${icon.src}, which is not on disk — a 404 icon is worse than none`);
    });
  });

  await test('the header carries a drawn mark, not an emoji', () => {
    const dom = buildEnv();
    const badge = dom.window.document.querySelector('.logo-badge');

    assert.ok(badge.querySelector('svg path'), 'the mark must be a path we own, not a glyph the OS draws differently everywhere');
    assert.ok(!/🌙/.test(badge.textContent), 'the crescent is retired: it reads religious, and the platform is civic');
  });

  /**
   * The header mark, the iOS install-hint mark, and the admin header mark are
   * all hand-inlined `<path>`s — copies, not references to icon.svg — because
   * an inline SVG path is what lets `fill="currentColor"` follow the theme.
   * A hand-copied path is exactly what let the site keep shipping the retired
   * three-pole tent after the mark itself changed underneath it: nothing
   * failed, so nobody noticed. This pins all three against the single
   * geometry definition (server/src/utils/brandMark.js) so the next redraw
   * cannot silently leave them behind. Compared against the mark-coloured
   * path only (`markD`) — these badges are a single-colour `currentColor`
   * silhouette, with no ground-coloured door cut-out layered under it.
   */
  await test('the inlined header/install-hint/admin mark paths match the current mark geometry', () => {
    const { markD } = partsToSvgPaths(buildMarkParts('icon'));
    const pathRe = /<path d="([^"]+)" fill="currentColor">/g;

    const indexMatches = [...INDEX_HTML_RAW.matchAll(pathRe)].map(m => m[1]);
    assert.strictEqual(indexMatches.length, 2, 'expected two inlined marks in index.html: the header and the iOS install hint');
    indexMatches.forEach(d => assert.strictEqual(d, markD, 'index.html carries a mark path that has drifted from buildMarkParts'));

    const adminMatches = [...ADMIN_HTML_RAW.matchAll(pathRe)].map(m => m[1]);
    assert.strictEqual(adminMatches.length, 1, 'expected one inlined mark in admin.html: the admin header');
    assert.strictEqual(adminMatches[0], markD, 'admin.html carries a mark path that has drifted from buildMarkParts');
  });

  await test('the rename to «أعراسنا» reached the document title, the iOS web-app title, and the header', () => {
    const dom = buildEnv();
    const { document } = dom.window;

    assert.ok(document.title.startsWith('أعراسنا'), `expected the title to lead with أعراسنا, got: ${document.title}`);
    assert.strictEqual(
      document.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),
      'أعراسنا',
      'the iOS home-screen label is a one-word surface — أعراسنا alone, mandatory'
    );
    assert.ok(
      dom.window.document.querySelector('.logo-text h1').textContent.includes('أعراسنا'),
      'the header is an internal surface — the app name alone'
    );
  });

  await test('the manifest short_name is «أعراسنا» alone, and name carries both names', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(WEB_DIR, 'manifest.json'), 'utf8'));

    assert.strictEqual(manifest.short_name, 'أعراسنا', 'short_name is a one-word surface — Android truncates a long label');
    assert.ok(manifest.name.includes('أعراسنا'), `expected the manifest name to carry أعراسنا, got: ${manifest.name}`);
    assert.ok(manifest.name.includes('مناسبات النقب'), `expected the manifest name to also carry the descriptive line, got: ${manifest.name}`);
  });

  console.log('\nBrand icon generation (server/scripts/brand-icons.js)');

  await test('the smallest Android mipmap (mdpi, 48×48) really is 48×48 and mixes mark- and ground-coloured pixels', async () => {
    const buffer = renderIcon(48, { safeZone: true, detail: 'icon' });
    const { data, width, height } = await decodeIconPixels(buffer);

    assert.strictEqual(width, 48);
    assert.strictEqual(height, 48);

    let markCount = 0;
    let groundCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (classifyPixel(data[i], data[i + 1], data[i + 2]) === 'mark') markCount += 1;
      else groundCount += 1;
    }
    assert.ok(markCount > 0, 'expected mark-coloured pixels — the mark must not vanish at 48px');
    assert.ok(groundCount > 0, 'expected ground-coloured pixels too — a single flat colour means nothing rendered');
  });

  await test('every safe-zone render keeps mark-coloured pixels inside the circular safe zone (radius 40% of the image width)', async () => {
    const sizes = [48, 72, 96, 144, 192, 512];
    for (const size of sizes) {
      const buffer = renderIcon(size, { safeZone: true, detail: 'icon' });
      const { data, width, height } = await decodeIconPixels(buffer);
      const cx = width / 2;
      const cy = height / 2;
      const maxRadius = width * 0.4;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = (y * width + x) * 4;
          if (classifyPixel(data[idx], data[idx + 1], data[idx + 2]) !== 'mark') continue;
          const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          assert.ok(
            dist <= maxRadius + 1,
            `mark pixel at (${x},${y}) in a ${size}×${size} render sits ${dist.toFixed(1)}px from centre, past the ${maxRadius.toFixed(1)}px safe radius — Android's circular mask would clip it`
          );
        }
      }
    }
  });

  /**
   * The burst used to run into the ring — outer beam lamps overlapped ring
   * beads, and the mast finial nearly touched the top one. Asserted against
   * the geometry rather than rendered pixels: at the sizes these icons ship
   * at (down to 32-48px) the required 3-unit gap is often under one pixel,
   * so a pixel scan would pass by accident even with the wrong geometry —
   * the source coordinates are the only place this is actually checkable.
   */
  await test('the mast finial keeps at least 3 units of dark space from the ring\'s top bead, in both detail tiers', () => {
    ['full', 'icon'].forEach(detail => {
      const topBead = ringBeads(detail).reduce((closest, bead) => (bead.y < closest.y ? bead : closest));
      const topBeadInnerEdgeY = topBead.y + topBead.r; // closer to the tent, since y grows downward
      const finialTopEdgeY = HUB.y - HUB.r; // closer to the ring
      const gap = finialTopEdgeY - topBeadInnerEdgeY;
      assert.ok(
        gap >= 3,
        `detail=${detail}: only ${gap.toFixed(2)} units of dark space between the mast finial and the ring's top bead, need >= 3`
      );
    });
  });

  await test('detail \'icon\' and detail \'full\' render different bytes at the same size', () => {
    const iconBuffer = renderIcon(192, { safeZone: false, detail: 'icon' });
    const fullBuffer = renderIcon(192, { safeZone: false, detail: 'full' });
    assert.ok(!iconBuffer.equals(fullBuffer), 'the detail flag must actually change what gets drawn, not be a no-op');
  });

  await test('the generated favicon SVG is well-formed, carries both brand colours, and matches the geometry the raster uses', () => {
    const svgContent = fs.readFileSync(path.join(WEB_DIR, 'icons', 'icon.svg'), 'utf8');

    const parserWindow = new JSDOM('').window;
    const doc = new parserWindow.DOMParser().parseFromString(svgContent, 'image/svg+xml');
    assert.strictEqual(doc.querySelector('parsererror'), null, 'icon.svg must be well-formed XML');
    assert.strictEqual(doc.documentElement.tagName, 'svg');

    assert.ok(svgContent.includes(GROUND), 'expected the ground colour hex in the SVG');
    assert.ok(svgContent.includes(MARK), 'expected the mark colour hex in the SVG');

    assert.strictEqual(
      svgContent,
      buildIconSvg('icon', false),
      'icon.svg must be generated straight from buildMarkParts, not hand-copied — it drifts the moment someone edits the mark and forgets this file'
    );
  });

  /**
   * iOS exposes no install prompt at all — `beforeinstallprompt` is not
   * supported there and has no equivalent (#54) — so a written explanation is
   * the only path, not a lazy one. And the APK button is hidden on iOS on
   * purpose (an APK does nothing there), which is exactly why an iPhone
   * visitor would otherwise be offered no app at all.
   */
  await test('an iPhone visitor who has not installed is shown how', () => {
    const dom = buildEnv({ userAgent: IPHONE_UA });
    // Driven through its entry point, as every test here does: jsdom fires
    // DOMContentLoaded while parsing, which is before this file evaluates
    // app.js into the window, so the real listener never runs under test. The
    // wiring itself is asserted separately below.
    dom.window.initInstallHint();

    assert.strictEqual(dom.window.document.getElementById('installHint').hidden, false);
  });

  await test('everyone else is left alone', () => {
    const dom = buildEnv();
    dom.window.initInstallHint();

    assert.strictEqual(
      dom.window.document.getElementById('installHint').hidden,
      true,
      'an Android or desktop visitor already has the APK button — this would be noise'
    );
  });

  await test('an iPhone that already installed the app is not told to install it', () => {
    const dom = buildEnv({ userAgent: IPHONE_UA });
    dom.window.navigator.standalone = true;   // what iOS sets inside an installed web app
    dom.window.initInstallHint();

    assert.strictEqual(
      dom.window.document.getElementById('installHint').hidden,
      true,
      'showing install instructions to someone who installed is worse than showing nothing'
    );
  });

  await test('and it is actually wired into page load, not merely defined', () => {
    // The bug this guards is silent: every test above would still pass with the
    // call missing from the boot sequence, and no visitor would ever see it.
    const boot = APP_JS.slice(APP_JS.indexOf("addEventListener('DOMContentLoaded'"));
    assert.ok(
      /initInstallHint\(\)/.test(boot.slice(0, boot.indexOf('});'))),
      'initInstallHint() must be called on load, next to initAppDownload() whose gap it fills'
    );
  });

  /**
   * The regression this exists for: `hidden` is a browser default
   * (`[hidden] { display: none }`) and ANY author rule that sets `display` on
   * the same element beats it. `.install-hint` set `display: flex`, so setting
   * `.hidden = true` changed the property and nothing on screen — the close
   * button appeared dead, and the sheet showed to every visitor on every
   * platform because the `hidden` attribute in index.html never applied either.
   *
   * Every test above asserts the `.hidden` PROPERTY, which stayed true the
   * whole time. jsdom applies no stylesheet, so none of them could ever have
   * caught it. This one reads the stylesheet instead, for every element that
   * ships hidden.
   */
  await test('nothing that ships hidden is un-hidden by a class that forces a display', () => {
    // Parsed, not pattern-matched: the markup is the thing under test, so read
    // it as a document rather than guessing at attribute order. No scripts run
    // here — this is index.html exactly as it is served.
    const markup = new JSDOM(INDEX_HTML_RAW).window.document;
    const shipsHidden = [...markup.querySelectorAll('[hidden]')];
    assert.ok(shipsHidden.length, 'expected index.html to ship some elements hidden');

    for (const element of shipsHidden) {
      for (const cls of [...element.classList]) {
        // Every class in this stylesheet is plain kebab-case; anything else is
        // not worth interpolating into a pattern, so skip it rather than
        // escape it.
        if (!/^[a-zA-Z0-9_-]+$/.test(cls)) continue;

        const rule = STYLES_CSS_RAW.match(new RegExp('[.]' + cls + '[ ]*[{]([^}]*)[}]'));
        if (!rule || !/display[ ]*:/.test(rule[1])) continue;

        const neutralised = new RegExp('[.]' + cls + '\\[hidden\\][^{]*[{][^}]*display[ ]*:[ ]*none')
          .test(STYLES_CSS_RAW);
        assert.ok(
          neutralised,
          '#' + (element.id || cls) + ' ships hidden, but .' + cls
          + ' sets a display that overrides it — add ".' + cls
          + '[hidden] { display: none; }" or it stays on screen for everyone'
        );
      }
    }
  });

  await test('dismissing the hint keeps it dismissed on the next visit', () => {
    const first = buildEnv({ userAgent: IPHONE_UA });
    first.window.dismissInstallHint();
    assert.strictEqual(first.window.document.getElementById('installHint').hidden, true);
    assert.strictEqual(first.window.localStorage.getItem('negev_install_hint'), 'dismissed');

    // A second page load with that choice already stored — the real repeat visit.
    const second = buildEnv({ userAgent: IPHONE_UA });
    second.window.localStorage.setItem('negev_install_hint', 'dismissed');
    second.window.initInstallHint();
    assert.strictEqual(
      second.window.document.getElementById('installHint').hidden,
      true,
      'nagging someone who already said no is the fastest way to lose them'
    );
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error('DOM smoke run crashed:', err);
  process.exit(1);
});
