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
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { renderIcon, buildIconSvg, tracePart } = require('../scripts/brand-icons');
const { GROUND, MARK, R_IN, buildMarkParts, markScale, partsToSvgPaths } = require('../src/utils/brandMark');
const BRAND_WORD = require('../src/utils/brandWord');

GlobalFonts.registerFromPath(path.join(__dirname, '../src/assets/fonts/Cairo-Bold.ttf'), 'CairoBold');

// Reused, not re-typed: TOWNS/TOWN_COORDINATES are fixed-in-code on the
// server and this fixture must not become a second copy of them (CLAUDE.md,
// "البلدات ثابتة بالكود ومكرَّرة في العميلين ... نسخها ... يعيد المشكلة").
const { TOWNS, TOWN_COORDINATES, ANALYTICS_EVENTS } = require('../src/constants');

// The analytics tab fetches its event catalogue and retention window from the
// real GET /api/privacy/notice (privacyNotice.js), not a copy in web/admin.js
// — so the mocked response here is built from the SAME live constants that
// endpoint reads, not a hand-typed literal. If RETENTION_DAYS ever changes,
// this fixture changes with it, which is the whole point of the assertion
// below that reads it back through the UI.
const { RETENTION_DAYS } = require('../src/services/analytics.service');
const PRIVACY_NOTICE_FIXTURE = {
  retention_days: RETENTION_DAYS,
  events: ANALYTICS_EVENTS.map(e => ({ key: e.key, label: e.label, count_only: e.countOnly }))
};

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

/**
 * jsdom queues its DOMContentLoaded dispatch at document-parse time, which
 * lands BEFORE `window.eval(COMBINED_SCRIPT)` runs synchronously — so by the
 * time app.js's own `addEventListener('DOMContentLoaded', ...)` registers,
 * that dispatch is already pending and fires on the very next microtask tick
 * (verified directly against jsdom before writing this, the same way the
 * concatenated-eval comment above buildEnv() was). Most tests never notice —
 * they assert synchronously, before that tick ever runs — but any test that
 * awaits something (fetchLiveBroadcasts, waitFor, initSocket + a fired
 * handler) risks a REAL second automatic call racing its own explicit one.
 * Awaiting this, right after buildEnv() and before installing any
 * test-specific fetch/io stub, lets that one automatic pass complete against
 * whatever buildEnv() already installed, so nothing installed afterward can
 * ever race it.
 */
async function flushBoot() {
  await Promise.resolve();
  await Promise.resolve();
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
    if (requestPath === '/api/privacy/notice') {
      return jsonResponse({ success: true, notice: PRIVACY_NOTICE_FIXTURE });
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

/**
 * Ground-colour tolerance classification — any pixel that departs from the ground
 * colour beyond a tolerance is classified as 'mark'. This ensures antialiased gradient
 * pixels at the outer edge cannot be falsely classified as ground.
 */
function classifyPixel(r, g, b, tolerance = 25) {
  const distGround = Math.hypot(r - GROUND_RGB.r, g - GROUND_RGB.g, b - GROUND_RGB.b);
  return distGround > tolerance ? 'mark' : 'ground';
}

/**
 * Push notification fakes for jsdom: ServiceWorkerRegistration, PushManager,
 * and Notification. Stubbed at the window seam so tests can assert behavior.
 */
function installPushFakes(window, options = {}) {
  const {
    initialPermission = 'default',
    existingSubscription = null,
    onPrompt = null,
    onSubscribe = null,
    onUnsubscribe = null
  } = options;

  let currentPermission = initialPermission;
  let currentSub = existingSubscription ? {
    endpoint: existingSubscription.endpoint,
    keys: existingSubscription.keys || {},
    toJSON() { return { endpoint: this.endpoint, keys: { ...this.keys } }; },
    unsubscribe: async () => {
      if (existingSubscription.unsubscribe) await existingSubscription.unsubscribe();
      if (onUnsubscribe) onUnsubscribe();
      currentSub = null;
      return true;
    }
  } : null;
  const registerCalls = [];
  const promptCalls = [];

  window.Notification = {
    get permission() {
      return currentPermission;
    },
    requestPermission: async () => {
      promptCalls.push(Date.now());
      if (onPrompt) {
        currentPermission = await onPrompt();
      } else {
        currentPermission = 'granted';
      }
      return currentPermission;
    }
  };

  const fakePushManager = {
    getSubscription: async () => currentSub,
    subscribe: async (opts) => {
      if (onSubscribe) onSubscribe(opts);
      const sub = {
        endpoint: 'https://push.example.test/sub/12345',
        keys: {
          p256dh: 'fake-p256dh-key',
          auth: 'fake-auth-key'
        },
        toJSON() {
          return {
            endpoint: this.endpoint,
            keys: { ...this.keys }
          };
        },
        unsubscribe: async () => {
          if (onUnsubscribe) onUnsubscribe();
          currentSub = null;
          return true;
        }
      };
      currentSub = sub;
      return sub;
    }
  };

  const fakeRegistration = {
    pushManager: fakePushManager,
    showNotification: async (title, opts) => {},
    active: {}
  };

  const messageListeners = [];
  window.navigator.serviceWorker = {
    register: async (scriptUrl, opts) => {
      registerCalls.push(scriptUrl);
      return fakeRegistration;
    },
    ready: Promise.resolve(fakeRegistration),
    getRegistration: async () => fakeRegistration,
    addEventListener: (type, listener) => {
      if (type === 'message') messageListeners.push(listener);
    },
    removeEventListener: () => {},
    _dispatchMessage: (data) => {
      messageListeners.forEach(l => l({ data }));
    }
  };

  window.PushManager = function FakePushManager() {};

  return {
    registerCalls,
    promptCalls,
    fakePushManager,
    getPermission: () => currentPermission,
    setPermission: (p) => { currentPermission = p; },
    getSub: () => currentSub,
    setSub: (s) => { currentSub = s; },
    fakeRegistration
  };
}

/**
 * Builds one fresh jsdom document with web/'s three scripts evaluated into
 * it, real CDN globals (L, Chart, io) and browser-only APIs (fetch,
 * matchMedia, canvas 2D, rAF) stubbed at the seam beforehand — never by
 * editing app.js. `loggedIn` seeds localStorage before evaluation, because
 * app.js reads negev_user/negev_token into module state at load time, the
 * same way a real page load would.
 */
function buildEnv({ loggedIn = false, userAgent, onBeforeEval, url = 'http://localhost/' } = {}) {
  const virtualConsole = new VirtualConsole(); // swallow jsdom's own "not implemented" noise; real throws still propagate
  const dom = new JSDOM(HTML_WITHOUT_SCRIPTS, {
    url,
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

  if (onBeforeEval) {
    onBeforeEval(window);
  }

  window.eval(COMBINED_SCRIPT);

  return dom;
}

/**
 * The same seam for web/admin.html. Deliberately thinner than buildEnv(): the
 * admin panel talks to nothing until a token exists, so an unauthenticated load
 * is enough to drive a form open by hand, which is all these tests do.
 */
function buildAdminEnv({ loggedIn = false, role = 'super_admin', towns = [] } = {}) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(ADMIN_HTML_WITHOUT_SCRIPTS, {
    url: 'http://localhost/admin.html',
    runScripts: 'dangerously',
    virtualConsole
  });
  const { window } = dom;

  if (loggedIn) {
    window.localStorage.setItem('negev_admin_token', 'test-admin-token');
    window.localStorage.setItem('negev_admin_role', role);
  }

  const defaultFetch = buildFetchStub();
  window.fetch = async (url, options = {}) => {
    const requestPath = String(url).split('?')[0];
    if (requestPath === '/api/admin/me') {
      return jsonResponse({ success: true, user: { id: 1, role }, towns });
    }
    if (requestPath === '/api/admin/settings') {
      return jsonResponse({ success: true, settings: { support_whatsapp_number: '972501234567' } });
    }
    return defaultFetch(url, options);
  };
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
   * fetches occasion types for the kind-filter chip (initKindFilter(),
   * called from DOMContentLoaded — #85 batch 6a replaced the old scrolling
   * occasion-type strip with this chip, but the fetch-then-cache sequence it
   * gates is the same one the historical bug hit) — and only afterwards
   * opens "publish". The historical bug keyed the form's construction off
   * that same already-populated cache instead of "has the form itself been
   * built", so initPublishForm() was silently skipped. Asserting after this
   * same sequence is what makes this test capable of catching it again — see
   * the comment above buildEnv() for how it was verified against a
   * reintroduced copy of the bug.
   */
  async function openPublishTabAfterBrowsingHome(dom) {
    const { document } = dom.window;
    await waitFor(() => {
      const chip = document.getElementById('kindFilterChip');
      return !!chip && !chip.disabled;
    });
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

  console.log('\nPlace & kind filter — one searchable multi-select each (#85 batch 6a, stories 40-46)');

  const TEST_VILLAGE_FIXTURE = { id: 777, name: 'قرية الاختبار', latitude: 31.1, longitude: 34.8, position: 1 };
  const TOWNS_WITH_VILLAGE_FIXTURE = {
    success: true, towns: TOWNS, town_coordinates: TOWN_COORDINATES, villages: [TEST_VILLAGE_FIXTURE]
  };

  /** Every GET /api/events call this section's fetch stub receives, full URL (query string included). */
  function buildEventsCapturingFetchStub(townsFixture = TOWNS_WITH_VILLAGE_FIXTURE) {
    const calls = [];
    const fetchStub = async url => {
      const fullUrl = String(url);
      const requestPath = fullUrl.split('?')[0];
      if (requestPath === '/api/towns') return jsonResponse(townsFixture);
      if (requestPath === '/api/occasion-types') return jsonResponse({ success: true, types: OCCASION_TYPES_FIXTURE });
      if (requestPath === '/api/events') {
        calls.push(fullUrl);
        return jsonResponse({ success: true, events: [], pagination: { page: 1, totalPages: 1 }, announcements: [] });
      }
      return jsonResponse({ success: false });
    };
    return { fetchStub, calls };
  }

  function queryParam(fullUrl, key) {
    return new URLSearchParams(fullUrl.split('?')[1] || '').get(key);
  }

  /** Loads towns/villages/kinds, wiring a capturing fetch stub, so the sheets have real options to check. */
  async function setupFilterEnv(townsFixture) {
    const dom = buildEnv();
    const { fetchStub, calls } = buildEventsCapturingFetchStub(townsFixture);
    dom.window.fetch = fetchStub;
    await dom.window.initPlaceFilter();
    await dom.window.initKindFilter();
    return { dom, calls };
  }

  /** Ticks a checkbox inside an open filter sheet by its visible label text, firing the same 'change' event a click would. */
  function checkFilterOption(win, listId, labelText) {
    const rows = [...win.document.querySelectorAll(`#${listId} .filter-option-row`)];
    const row = rows.find(r => r.textContent.trim().includes(labelText));
    if (!row) throw new Error(`option "${labelText}" not found in #${listId}`);
    const input = row.querySelector('input');
    input.checked = true;
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  await test('selecting two towns sends both in one ?town= parameter', async () => {
    const { dom, calls } = await setupFilterEnv();
    dom.window.openFilterSheet('place');
    checkFilterOption(dom.window, 'placeFilterList', 'رهط');
    checkFilterOption(dom.window, 'placeFilterList', 'حورة');
    dom.window.applyFilterSheet();

    await waitFor(() => calls.length > 0);
    const lastCall = calls[calls.length - 1];
    assert.strictEqual(queryParam(lastCall, 'town'), 'رهط,حورة');
    assert.strictEqual(queryParam(lastCall, 'village_id'), null, 'no village was selected — no ?village_id= at all');
  });

  await test('selecting a village sends ?village_id=, separate from ?town=', async () => {
    const { dom, calls } = await setupFilterEnv();
    dom.window.openFilterSheet('place');
    checkFilterOption(dom.window, 'placeFilterList', TEST_VILLAGE_FIXTURE.name);
    dom.window.applyFilterSheet();

    await waitFor(() => calls.length > 0);
    const lastCall = calls[calls.length - 1];
    assert.strictEqual(queryParam(lastCall, 'village_id'), String(TEST_VILLAGE_FIXTURE.id));
    assert.strictEqual(queryParam(lastCall, 'town'), null);
  });

  await test('a town and a village picked together travel in their own separate parameters', async () => {
    const { dom, calls } = await setupFilterEnv();
    dom.window.openFilterSheet('place');
    checkFilterOption(dom.window, 'placeFilterList', 'رهط');
    checkFilterOption(dom.window, 'placeFilterList', TEST_VILLAGE_FIXTURE.name);
    dom.window.applyFilterSheet();

    await waitFor(() => calls.length > 0);
    const lastCall = calls[calls.length - 1];
    assert.strictEqual(queryParam(lastCall, 'town'), 'رهط');
    assert.strictEqual(queryParam(lastCall, 'village_id'), String(TEST_VILLAGE_FIXTURE.id));
  });

  await test('selecting two kinds sends both in one ?occasion_type_id= parameter, alongside a place filter', async () => {
    const { dom, calls } = await setupFilterEnv();
    dom.window.openFilterSheet('place');
    checkFilterOption(dom.window, 'placeFilterList', 'رهط');
    dom.window.applyFilterSheet();
    calls.length = 0;

    dom.window.openFilterSheet('kind');
    checkFilterOption(dom.window, 'kindFilterList', WEDDING_TYPE.name);
    checkFilterOption(dom.window, 'kindFilterList', FUNERAL_TYPE.name);
    dom.window.applyFilterSheet();

    await waitFor(() => calls.length > 0);
    const lastCall = calls[calls.length - 1];
    assert.strictEqual(queryParam(lastCall, 'occasion_type_id'), `${WEDDING_TYPE.id},${FUNERAL_TYPE.id}`);
    assert.strictEqual(queryParam(lastCall, 'town'), 'رهط', 'the earlier place filter must survive picking a kind too');
  });

  await test('nothing selected sends no place/kind parameters at all', async () => {
    const { dom, calls } = await setupFilterEnv();
    await dom.window.fetchEvents();
    await waitFor(() => calls.length > 0);
    const lastCall = calls[calls.length - 1];
    assert.strictEqual(queryParam(lastCall, 'town'), null);
    assert.strictEqual(queryParam(lastCall, 'village_id'), null);
    assert.strictEqual(queryParam(lastCall, 'occasion_type_id'), null);
  });

  await test('the place chip label shows one name, or "name +N" once more than one place is selected', async () => {
    const { dom } = await setupFilterEnv();
    const { document } = dom.window;

    dom.window.openFilterSheet('place');
    checkFilterOption(dom.window, 'placeFilterList', 'رهط');
    dom.window.applyFilterSheet();
    assert.strictEqual(document.getElementById('placeFilterChipLabel').textContent, 'رهط');

    dom.window.openFilterSheet('place');
    checkFilterOption(dom.window, 'placeFilterList', 'حورة');
    dom.window.applyFilterSheet();
    assert.strictEqual(document.getElementById('placeFilterChipLabel').textContent, 'رهط +1');
  });

  /**
   * Review round 2, FIX 1 (the important one): `updatePlaceFilterChipLabel`
   * used to resolve village ids through `villagesList` and drop what it could
   * not resolve (`.filter(Boolean)`) — so a village an admin deleted, or any
   * render before `GET /api/towns` resolves, made the chip read «كل الأماكن»
   * while the id was still filtering the feed. A selection the code cannot
   * NAME must still be reported as a selection — never silently coerced to
   * "nothing selected", which is exactly the puzzle «مسح الفلاتر» exists to
   * prevent (story 45).
   */
  await test('a selected id that cannot be resolved is still reported as selected, never silently dropped to "nothing selected"', async () => {
    const dom = buildEnv();
    // Two unresolvable ids — not in TOWNS_WITH_VILLAGE_FIXTURE.villages — so the
    // fallback must be the PLURAL, countable form, not the singular one.
    const UNRESOLVABLE_VILLAGE_IDS = [999999, 999998];
    dom.window.localStorage.setItem('negev_filter_towns', JSON.stringify([]));
    dom.window.localStorage.setItem('negev_filter_villages', JSON.stringify(UNRESOLVABLE_VILLAGE_IDS));
    dom.window.localStorage.setItem('negev_filter_kinds', JSON.stringify([]));
    const { fetchStub } = buildEventsCapturingFetchStub();
    dom.window.fetch = fetchStub;

    dom.window.loadFilterSelectionFromStorage();
    await dom.window.initPlaceFilter();

    const chipLabel = dom.window.document.getElementById('placeFilterChipLabel').textContent;
    assert.notStrictEqual(chipLabel, 'كل الأماكن', 'an unresolvable but real selection must never read as "nothing selected"');
    assert.ok(chipLabel.includes(String(UNRESOLVABLE_VILLAGE_IDS.length)), `expected the count of selected-but-unresolved places somewhere in the label, got "${chipLabel}"`);

    // The empty-state message must carry the exact same honesty (FIX 1 names both functions).
    dom.window.renderEvents([]);
    const emptyMessage = dom.window.document.querySelector('#eventsContainer .empty-state p').textContent;
    assert.ok(!emptyMessage.includes('منطقة النقب'), 'the empty state must not claim "no place selected" either, under the same unresolved filter');
  });

  /**
   * Review round 2, FIX 2: the server caps each filter parameter at twenty
   * values and rejects a 21st with 400 (`MAX_FILTER_VALUES`,
   * server/src/middleware/validate.js). Nothing stopped the sheet from
   * building a request past that cap — the user would only find out from a
   * generic server error. The cap must be enforced in the sheet itself, in
   * Arabic, at the moment it is hit.
   */
  await test('ticking a 21st option in one kind is rejected in the sheet, in Arabic, and never reaches the request', async () => {
    const MANY_VILLAGES = Array.from({ length: 25 }, (_, i) => ({
      id: 1000 + i, name: `قرية رقم ${i}`, latitude: 31, longitude: 34, position: i
    }));
    const { dom, calls } = await setupFilterEnv({
      success: true, towns: TOWNS, town_coordinates: TOWN_COORDINATES, villages: MANY_VILLAGES
    });
    const { document } = dom.window;

    dom.window.openFilterSheet('place');
    MANY_VILLAGES.forEach(v => checkFilterOption(dom.window, 'placeFilterList', v.name));

    const checkedCount = document.querySelectorAll('#placeFilterList input:checked').length;
    assert.strictEqual(checkedCount, 20, 'expected exactly twenty villages checked — the 21st tick must have been rejected, not silently dropped later');

    const warning = document.getElementById('placeFilterWarning');
    assert.strictEqual(warning.hidden, false, 'expected an Arabic warning to appear the moment the cap is hit');
    assert.ok(/\d+/.test(warning.textContent), 'expected the warning to name the actual cap');
    assert.ok(/[؀-ۿ]/.test(warning.textContent), 'expected the warning message in Arabic');

    dom.window.applyFilterSheet();
    await waitFor(() => calls.length > 0);
    const villageIds = queryParam(calls[calls.length - 1], 'village_id').split(',');
    assert.strictEqual(villageIds.length, 20, 'the request itself must never carry more than the server-side cap');
  });

  await test('"مسح الفلاتر" clears every filter, resets both chip labels, and re-fetches with no filter params', async () => {
    const { dom, calls } = await setupFilterEnv();
    const { document } = dom.window;

    dom.window.openFilterSheet('place');
    checkFilterOption(dom.window, 'placeFilterList', 'رهط');
    dom.window.applyFilterSheet();
    dom.window.openFilterSheet('kind');
    checkFilterOption(dom.window, 'kindFilterList', WEDDING_TYPE.name);
    dom.window.applyFilterSheet();
    await waitFor(() => calls.length > 0);
    calls.length = 0;

    dom.window.clearAllFilters();
    await waitFor(() => calls.length > 0);

    const lastCall = calls[calls.length - 1];
    assert.strictEqual(queryParam(lastCall, 'town'), null);
    assert.strictEqual(queryParam(lastCall, 'occasion_type_id'), null);
    assert.strictEqual(document.getElementById('placeFilterChipLabel').textContent, 'كل الأماكن');
    assert.strictEqual(document.getElementById('kindFilterChipLabel').textContent, 'كل الأنواع');
  });

  await test('«مسح الفلاتر» is always visible, not only once something is selected', () => {
    const markup = new JSDOM(INDEX_HTML_RAW).window.document;
    const clearBtn = markup.getElementById('clearFiltersBtn');
    assert.ok(clearBtn, 'expected the clear-filters chip in the static markup');
    assert.ok(!clearBtn.hasAttribute('hidden'), 'must not ship hidden — an empty feed must never be a puzzle');
    assert.ok(
      !/display\s*:\s*none/.test(clearBtn.getAttribute('style') || ''),
      'must not ship display:none either'
    );
  });

  await test('the selection is restored from localStorage on load, and reflected in the chip label', async () => {
    const dom = buildEnv();
    dom.window.localStorage.setItem('negev_filter_towns', JSON.stringify(['رهط']));
    dom.window.localStorage.setItem('negev_filter_villages', JSON.stringify([]));
    dom.window.localStorage.setItem('negev_filter_kinds', JSON.stringify([WEDDING_TYPE.id]));
    const { fetchStub } = buildEventsCapturingFetchStub();
    dom.window.fetch = fetchStub;

    dom.window.loadFilterSelectionFromStorage();
    await dom.window.initPlaceFilter();
    await dom.window.initKindFilter();

    assert.strictEqual(dom.window.document.getElementById('placeFilterChipLabel').textContent, 'رهط');
    assert.strictEqual(dom.window.document.getElementById('kindFilterChipLabel').textContent, WEDDING_TYPE.name);
  });

  await test('a restored village selection resolves its real name once towns/villages have loaded', async () => {
    const dom = buildEnv();
    dom.window.localStorage.setItem('negev_filter_towns', JSON.stringify([]));
    dom.window.localStorage.setItem('negev_filter_villages', JSON.stringify([TEST_VILLAGE_FIXTURE.id]));
    dom.window.localStorage.setItem('negev_filter_kinds', JSON.stringify([]));
    const { fetchStub } = buildEventsCapturingFetchStub();
    dom.window.fetch = fetchStub;

    dom.window.loadFilterSelectionFromStorage();
    await dom.window.initPlaceFilter();

    assert.strictEqual(dom.window.document.getElementById('placeFilterChipLabel').textContent, TEST_VILLAGE_FIXTURE.name);
  });

  await test('a corrupt or missing localStorage filter value does not break the page', async () => {
    const dom = buildEnv();
    dom.window.localStorage.setItem('negev_filter_towns', 'not-json{{{');
    dom.window.localStorage.setItem('negev_filter_villages', JSON.stringify({ not: 'an array' }));
    // negev_filter_kinds left entirely absent — the third read must still default cleanly.
    const { fetchStub } = buildEventsCapturingFetchStub();
    dom.window.fetch = fetchStub;

    assert.doesNotThrow(() => dom.window.loadFilterSelectionFromStorage());
    await dom.window.initPlaceFilter();
    await dom.window.initKindFilter();
    assertNoUnhandledRejections('corrupt localStorage filter values');

    assert.strictEqual(dom.window.document.getElementById('placeFilterChipLabel').textContent, 'كل الأماكن');
    assert.strictEqual(dom.window.document.getElementById('kindFilterChipLabel').textContent, 'كل الأنواع');
    assert.strictEqual(dom.window.document.getElementById('placeFilterChip').disabled, false, 'a corrupt stored value must not leave the picker stuck disabled');
  });

  console.log('\nLoading state — skeletons before the feed resolves, not a spinner (#85 خطوة 53-54)');

  await test('skeleton placeholders appear synchronously while fetchEvents is still in flight', async () => {
    const dom = buildEnv();
    const { document } = dom.window;
    let resolveEvents;
    dom.window.fetch = async url => {
      const path = String(url).split('?')[0];
      if (path === '/api/events') {
        return new Promise(resolve => {
          resolveEvents = () => resolve(jsonResponse({ success: true, events: [], pagination: { page: 1, totalPages: 1 }, announcements: [] }));
        });
      }
      return jsonResponse({ success: false });
    };

    const fetchPromise = dom.window.fetchEvents();

    assert.ok(document.querySelectorAll('#eventsContainer .card-skeleton').length > 0, 'expected skeleton placeholders while the request is in flight');
    assert.strictEqual(document.querySelector('#eventsContainer .loading-spinner'), null, 'no spinner — skeletons replace it (#53)');

    resolveEvents();
    await fetchPromise;
    assertNoUnhandledRejections('fetchEvents skeleton -> resolved');
  });

  await test('the fade-in class is applied on the very first render only, never on a later refetch', () => {
    const dom = buildEnv();
    const { document } = dom.window;
    const container = document.getElementById('eventsContainer');

    dom.window.renderEvents([{
      id: 950, title: 'عرس أول', family_clan: null, town: 'رهط',
      event_date: '2027-06-01', location_name: 'مكان', poster_url: null, audio_url: null,
      occasion_type: WEDDING_TYPE, reactions: {}
    }]);
    assert.ok(container.classList.contains('events-feed-first-load'), 'the very first render should carry the fade-in class');

    dom.window.renderEvents([{
      id: 951, title: 'عرس ثانٍ', family_clan: null, town: 'رهط',
      event_date: '2027-06-02', location_name: 'مكان آخر', poster_url: null, audio_url: null,
      occasion_type: WEDDING_TYPE, reactions: {}
    }]);
    assert.ok(!container.classList.contains('events-feed-first-load'), 'a later re-render (filter change, refresh) must not fade in again');
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
      },
      {
        id: 910, title: 'عرس أبو مصطفى', family_clan: 'آل تجربة', town: 'حورة',
        event_date: '2027-04-10', location_name: 'ديوان آل تجربة الثالث',
        youth_party_date: null, dinner_time: null,
        poster_url: 'https://example.test/uploads/poster910.jpg', audio_url: null,
        occasion_type: WEDDING_TYPE, reactions: {}
      },
      {
        id: 911, title: 'عزاء آل فلان', family_clan: 'آل فلان', town: 'رهط',
        event_date: '2027-05-01', location_name: 'بيت العزاء الثاني',
        youth_party_date: null, dinner_time: null,
        poster_url: 'https://example.test/uploads/poster911.jpg', audio_url: null,
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

  // WEDDING_TYPE above hides dinner_time, so this pair needs a type that shows
  // it: the point is the VALUE being empty, not the field being hidden.
  function renderDinnerFixtures() {
    const dom = buildEnv();
    const dinnerType = {
      ...WEDDING_TYPE,
      fields: [...WEDDING_TYPE.fields, { field_key: 'dinner_time', label: 'طعام العشاء', is_required: false, position: 7 }]
    };

    dom.window.renderEvents([
      {
        id: 920, title: 'عرس بوقت عشاء', family_clan: 'آل تجربة', town: 'حورة',
        event_date: '2027-07-01', location_name: 'ديوان', youth_party_date: null,
        dinner_time: 'الساعة 7:30 مساءً', poster_url: null, audio_url: null,
        occasion_type: dinnerType, reactions: {}
      },
      {
        id: 921, title: 'عرس بلا وقت عشاء', family_clan: 'آل تجربة', town: 'حورة',
        event_date: '2027-07-02', location_name: 'ديوان', youth_party_date: null,
        dinner_time: '', poster_url: null, audio_url: null,
        occasion_type: dinnerType, reactions: {}
      }
    ]);

    return { document: dom.window.document };
  }

  await test('an event card renders the dinner-time line when dinner_time carries a value', () => {
    const { document } = renderDinnerFixtures();
    const card = document.getElementById('eventCard-920');
    assert.ok(card, 'expected card #eventCard-920 to render');
    assert.ok(card.textContent.includes('الساعة 7:30 مساءً'), 'expected the announced dinner time in the card');
  });

  await test('an event card omits the dinner-time line entirely when dinner_time is empty — no invented 8:00', () => {
    const { document } = renderDinnerFixtures();
    const card = document.getElementById('eventCard-921');
    assert.ok(card, 'expected card #eventCard-921 to render');
    assert.ok(!card.textContent.includes('طعام العشاء'), 'the dinner-time line must not appear when the field is empty');
    assert.ok(!card.textContent.includes('8:00'), 'no default dinner hour may be invented for an event that announced none');
    assert.strictEqual(card.querySelector('.fa-utensils'), null, 'no leftover dinner-time detail-item should render either');
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

  console.log('\nEvent card — the image-first redesign (#85 batch 6a, stories 47-52)');

  await test('a card with a poster emits the four nested layers, media covers from top, no blur, and badges sit in caption', () => {
    const { document } = renderCardFixtures();
    const card = document.getElementById('eventCard-910');
    assert.ok(card, 'expected the poster-bearing card to render');

    // 1. No blur in feed card tree
    assert.strictEqual(card.querySelector('.card-poster-backdrop'), null, 'no blurred backdrop in the feed card');

    // 2. The four layers exist, and .card-caption is a sibling of .card-media, not a descendant of it
    const bezel = card.querySelector('.card-bezel');
    assert.ok(bezel, 'Layer 1: expected .card-bezel');
    const framed = bezel.querySelector('.card-framed');
    assert.ok(framed, 'Layer 2: expected .card-framed inside .card-bezel');
    const media = framed.querySelector('.card-media');
    assert.ok(media, 'Layer 3: expected .card-media inside .card-framed');
    const caption = framed.querySelector('.card-caption');
    assert.ok(caption, 'Layer 4: expected .card-caption inside .card-framed');
    const goldframe = framed.querySelector('.card-goldframe');
    assert.ok(goldframe, 'expected .card-goldframe inside .card-framed');

    assert.strictEqual(caption.parentElement, framed, '.card-caption is a direct child of .card-framed');
    assert.strictEqual(media.parentElement, framed, '.card-media is a direct child of .card-framed');
    assert.ok(!media.contains(caption), '.card-caption is a sibling of .card-media, not a descendant');
    assert.ok(!caption.contains(media), '.card-media is not a descendant of .card-caption');

    const img = media.querySelector('.card-media-img');
    assert.ok(img, 'expected .card-media-img inside .card-media');
    assert.ok(
      (img.getAttribute('src') || '').includes('poster910.jpg'),
      'expected the poster image to load poster910.jpg'
    );

    // Badges sit in caption
    assert.ok(caption.querySelector('.card-kindchip'), 'expected the kind badge inside caption');
    assert.ok(caption.querySelector('.card-datechip'), 'expected the countdown badge inside caption (festive tone)');
  });

  await test('a card with NO poster builds the short caption plus the icon, not a tall empty box', () => {
    const { document } = renderCardFixtures();
    const card = document.getElementById('eventCard-901');
    assert.ok(card, 'expected the poster-less card to render at all');

    // 4. A poster-less event builds the short caption plus the icon, not a tall empty box
    const bezel = card.querySelector('.card-bezel');
    assert.ok(bezel, 'expected .card-bezel');
    const framed = bezel.querySelector('.card-framed');
    assert.ok(framed, 'expected .card-framed');
    const media = framed.querySelector('.card-media');
    assert.ok(media, 'expected .card-media');
    assert.ok(media.classList.contains('card-media-empty'), 'expected card-media-empty class');
    assert.ok(media.querySelector('.card-media-placeholder i, .card-media-placeholder'), 'expected a placeholder icon, not an empty box');
    assert.strictEqual(media.querySelector('img'), null, 'no <img> should be emitted with no poster URL');
    assert.strictEqual(card.querySelector('.card-poster-backdrop'), null, 'no blurred backdrop — nothing to blur');

    const caption = framed.querySelector('.card-caption');
    assert.ok(caption, 'expected .card-caption');
    assert.ok(caption.querySelector('.card-kindchip'), 'the kind badge must still show in caption');
  });

  await test('frame colour source: type with colour sets inline --tone, type without colour emits no inline --tone', () => {
    // 3. Frame colour source
    const dom = buildEnv();
    dom.window.renderEvents([
      {
        id: 930, title: 'مناسبة بلون', family_clan: 'آل فلان', town: 'حورة',
        event_date: '2027-01-10', location_name: 'ديوان',
        occasion_type: { id: 1, name: 'عرس', color: '#10b981' }
      },
      {
        id: 931, title: 'مناسبة بلا لون', family_clan: 'آل علان', town: 'رهط',
        event_date: '2027-01-11', location_name: 'قاعة',
        occasion_type: { id: 2, name: 'عام', color: null }
      }
    ]);
    const coloredCard = dom.window.document.getElementById('eventCard-930');
    const uncoloredCard = dom.window.document.getElementById('eventCard-931');
    assert.ok(coloredCard, 'expected colored card to render');
    assert.ok(uncoloredCard, 'expected uncolored card to render');

    assert.ok(
      (coloredCard.getAttribute('style') || '').includes('--tone:#10b981'),
      'type with a colour produces that colour on the card inline --tone'
    );
    assert.ok(
      !(uncoloredCard.getAttribute('style') || '').includes('--tone'),
      'type with no colour produces no inline --tone and therefore falls to CSS default'
    );
  });

  await test('the feed is its own scroll container and its tree holds only cards', () => {
    // 6. The feed is its own scroll container and its tree holds only cards
    const { document } = renderCardFixtures();
    const feed = document.querySelector('.events-feed');
    assert.ok(feed, 'expected .events-feed element');
    const children = Array.from(feed.children);
    assert.ok(children.length > 0, 'expected cards in feed');
    assert.ok(
      children.every(child => child.classList.contains('event-card')),
      'every child of .events-feed is an .event-card'
    );
    assert.strictEqual(feed.querySelector('#announcementsContainer'), null, '#announcementsContainer is not inside .events-feed');
    assert.strictEqual(feed.querySelector('#loadMoreWrapper'), null, '#loadMoreWrapper is not inside .events-feed');
    assert.strictEqual(feed.querySelector('#eventSearchInput'), null, 'search bar is not inside .events-feed');
    assert.strictEqual(feed.querySelector('.search-bar-container'), null, 'search bar container is not inside .events-feed');
    assert.ok(
      /\.events-feed\s*\{[^}]*overflow-y:\s*auto/.test(STYLES_CSS),
      '.events-feed must declare overflow-y: auto to be its own scroll container'
    );

    // العطل الذي نزل للإنتاج في 1.7.0: التبويب كان `display: flex` فصار مقاس
    // التغذية يأتي من `flex-basis: auto` (حجم المحتوى) لا من `height`، و
    // `overflow: hidden` عليه كان يعطّل `position: sticky`. النتيجة كرت بارتفاع
    // 145px من 844 — المناسبات موجودة في الـDOM وغير مرئية.
    assert.ok(
      !/#tabHome\.active-tab\s*\{[^}]*overflow:\s*hidden/.test(STYLES_CSS),
      '#tabHome.active-tab must not clip: overflow:hidden disables position:sticky on the feed'
    );
    assert.ok(
      !/#tabHome\.active-tab\s*\{[^}]*display:\s*flex/.test(STYLES_CSS),
      '#tabHome.active-tab must not be a flex container: flex-basis:auto sizes the feed from content, not height'
    );
    assert.ok(
      /#eventsContainer\.events-feed\s*\{[^}]*min-height:\s*60dvh/.test(STYLES_CSS),
      'the home feed needs a min-height floor so a bad measurement can never hide every event'
    );
    assert.ok(
      /#eventsContainer\.events-feed\s*\{[^}]*position:\s*sticky/.test(STYLES_CSS),
      'the home feed pins under the sticky header once the scrollable chrome above it passes'
    );
  });

  await test('a mourning card never emits a countdown badge, whether or not it has a poster', () => {
    const { document } = renderCardFixtures();

    const noPosterMourning = document.getElementById('eventCard-903');
    assert.strictEqual(noPosterMourning.querySelector('.card-datechip'), null, 'no countdown on a solemn card without a poster');
    assert.ok(noPosterMourning.querySelector('.card-kindchip'), 'the kind badge should still show');

    const posterMourning = document.getElementById('eventCard-911');
    assert.strictEqual(posterMourning.querySelector('.card-datechip'), null, 'no countdown on a solemn card WITH a poster either — "باقي ٣ أيام" is a bad word choice on a condolence');
    assert.ok(posterMourning.querySelector('.card-kindchip'), 'the kind badge should still show');
  });

  /**
   * Review round 2, FIX 3: removing the countdown badge (story 52) is not the
   * same as removing the date. A مناسبة عزاء must still show WHEN it is,
   * plainly, on the card's visible face — not behind "مزيد من التفاصيل" like
   * the rest of the grid, and never as a countdown.
   */
  await test('a mourning card shows a plain, visible date on its face — never a countdown, never hidden behind "مزيد من التفاصيل"', () => {
    const { document } = renderCardFixtures();
    const card = document.getElementById('eventCard-903');

    const dateLine = card.querySelector('.card-date-line');
    assert.ok(dateLine, 'expected a visible quiet date line on a mourning card');
    assert.ok(!card.querySelector('.card-details-collapsible').contains(dateLine), 'the date line must sit outside the collapsed panel — visible immediately');
    assert.ok(dateLine.textContent.length > 0, 'expected an actual formatted date, not an empty line');

    const festiveCard = document.getElementById('eventCard-901');
    const festiveDateLine = festiveCard.querySelector('.card-date-line');
    assert.ok(festiveDateLine, 'a festive card now carries the date and venue line too (issue #98 story 15)');
    assert.ok(festiveDateLine.textContent.length > 0, 'expected formatted date and venue text');
  });

  await test('the details grid, nav buttons and artist line start collapsed behind "مزيد من التفاصيل"', () => {
    const { document } = renderCardFixtures();
    const card = document.getElementById('eventCard-901');

    const panel = card.querySelector('.card-details-collapsible');
    assert.ok(panel, 'expected a collapsible details panel');
    assert.strictEqual(panel.hidden, true, 'details must start collapsed — the text block is two lines only');
    assert.ok(panel.querySelector('.event-details-grid'), 'expected the details grid inside the collapsible panel');
    assert.ok(panel.querySelector('.nav-buttons-row'), 'expected the nav buttons inside the collapsible panel');

    const toggle = card.querySelector('.card-more-details-btn');
    assert.ok(toggle, 'expected the toggle button');
    toggle.click();
    assert.strictEqual(panel.hidden, false, 'clicking the toggle should reveal the details');
    assert.ok(toggle.textContent.includes('إخفاء التفاصيل'), 'the toggle label should flip once expanded');
  });

  /**
   * Review round 2, FIX 4: `.card-clan-line` was unclamped, so a long
   * `family_clan — town` pair could wrap the visible text block to three
   * lines on a narrow screen (spec: «كتلة النصّ سطران»). jsdom has no layout
   * engine, so this asserts the STRUCTURE (the clamp class is actually on the
   * element) and reads styles.css directly for the clamp rule itself — the
   * actual wrapping behaviour cannot be proven here.
   */
  await test('the clan/town line carries the same one-line clamp as the title, structurally', () => {
    const { document } = renderCardFixtures();
    const clanLine = document.querySelector('#eventCard-901 .card-clan-line');
    assert.ok(clanLine, 'expected a clan/town line on a card with a family_clan');
    assert.ok(clanLine.classList.contains('card-clamp-1-line'), 'expected the shared one-line clamp class on the clan/town line');

    assert.ok(
      /\.card-clamp-1-line\s*\{[^}]*-webkit-line-clamp:\s*1/.test(STYLES_CSS),
      'expected the shared clamp class to actually set -webkit-line-clamp: 1 in styles.css'
    );
  });

  console.log('\nNotification centre — merged personal + broadcast feed (issue #85, review round 2 FIX 1)');

  /**
   * `notifications.id` and `broadcasts.id` are two independent, overlapping
   * AUTO_INCREMENT counters — this fixture deliberately gives the personal
   * notification and the broadcast entry the SAME numeric id (5) to
   * reproduce that collision exactly. Before FIX 1, `renderNotificationsList`
   * built `onclick="markNotificationRead(${n.id})"` off a shared `id` field
   * and always called `PATCH /api/notifications/:id/read` — so clicking the
   * broadcast card here would have called `/api/notifications/5/read`
   * instead of `/api/broadcasts/5/dismiss`, either 404ing or marking an
   * unrelated personal notification of this same id read.
   */
  const MIXED_NOTIFICATIONS_FIXTURE = [
    {
      id: 5, type: 'event_soon', title: 'إشعار شخصي', body: 'نص شخصي',
      is_read: false, user_id: 501, event_id: null, created_at: '2026-09-05T10:00:00.000Z'
    },
    {
      broadcast_id: 5, type: 'broadcast', title: 'تعميم عام', body: 'نص التعميم',
      tone: 'info', expires_at: null, scope_town: null, is_read: false, created_at: '2026-09-04T10:00:00.000Z'
    }
  ];

  /** Every PATCH this section's fetch stub receives, in call order — `{ url, method }`. */
  function buildTrackingFetchStub() {
    const calls = [];
    const fetchStub = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      if (method !== 'GET') calls.push({ url: requestPath, method });

      if (requestPath === '/api/notifications' && method === 'GET') {
        return jsonResponse({ success: true, notifications: MIXED_NOTIFICATIONS_FIXTURE });
      }
      if (requestPath === '/api/notifications/5/read' && method === 'PATCH') {
        return jsonResponse({ success: true });
      }
      if (requestPath === '/api/broadcasts/5/dismiss' && method === 'PATCH') {
        return jsonResponse({ success: true });
      }
      // Any other path — e.g. the pre-FIX-1 shape's /api/notifications/undefined/read
      // — is a real 404 here, same as Express's own notFound handler would give an
      // unmatched route, not a masking default 200.
      return jsonResponse({ success: false, message: 'غير موجود' }, { status: 404 });
    };
    return { fetchStub, calls };
  }

  await test('the merged feed renders both a personal notification and a broadcast entry, both marked unread', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { fetchStub } = buildTrackingFetchStub();
    dom.window.fetch = fetchStub;

    await dom.window.fetchNotifications();

    const cards = dom.window.document.querySelectorAll('#notificationsList .event-card');
    assert.strictEqual(cards.length, 2, 'expected both the personal notification and the broadcast to render');
    assert.ok(cards[0].textContent.includes('إشعار شخصي'));
    assert.ok(cards[1].textContent.includes('تعميم عام'));
    assert.strictEqual(cards[0].querySelectorAll('.status-tag.pending').length, 1, 'the personal entry must show as new');
    assert.strictEqual(cards[1].querySelectorAll('.status-tag.pending').length, 1, 'the broadcast entry must show as new too');

    const badge = dom.window.document.getElementById('notificationsBadge');
    assert.strictEqual(badge.textContent, '2', 'expected both unread entries counted in the badge');
  });

  await test('clicking the broadcast card calls PATCH /api/broadcasts/:id/dismiss, never /api/notifications/:id/read — even though the ids collide', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { fetchStub, calls } = buildTrackingFetchStub();
    dom.window.fetch = fetchStub;

    await dom.window.fetchNotifications();
    const broadcastCard = dom.window.document.querySelectorAll('#notificationsList .event-card')[1];
    broadcastCard.click();
    await waitFor(() => calls.length > 0);

    assert.strictEqual(calls.length, 1, `expected exactly one PATCH call, got: ${JSON.stringify(calls)}`);
    assert.strictEqual(calls[0].url, '/api/broadcasts/5/dismiss', 'a broadcast entry must dismiss the broadcast, never touch /api/notifications/:id/read');
  });

  await test('the badge reaches zero once every entry — personal and broadcast alike — has been acted on', async () => {
    const dom = buildEnv({ loggedIn: true });
    const { fetchStub } = buildTrackingFetchStub();
    dom.window.fetch = fetchStub;

    await dom.window.fetchNotifications();
    const [personalCard, broadcastCard] = dom.window.document.querySelectorAll('#notificationsList .event-card');
    personalCard.click();
    broadcastCard.click();
    await waitFor(() => {
      const badge = dom.window.document.getElementById('notificationsBadge');
      return badge.style.display === 'none';
    });

    const badge = dom.window.document.getElementById('notificationsBadge');
    assert.strictEqual(badge.style.display, 'none', 'a broadcast entry must be reachable to zero unread, not permanently unread');
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
    assert.ok(
      /\.admin-card-poster-fill\s*\{[^}]*filter:\s*blur/.test(ADMIN_CSS),
      'the admin poster fill must still declare filter: blur — blur removal from the feed must not touch admin'
    );
  });

  /**
   * Spec issue #98: The feed card is redesigned as a full-screen card.
   * Blur and fixed 4:5 aspect ratio are deleted from the feed path.
   * Poster image becomes object-fit: cover with object-position: top center.
   * Snapping rules are declared in styles.css.
   */
  await test('the feed card has no blur and no fixed aspect ratio, object-fit is cover from top center, and snapping is declared', () => {
    // 1. No blur and no fixed aspect ratio anywhere in the feed path (styles.css text assertion)
    assert.ok(
      !/\.card-poster-backdrop\s*\{[^}]*filter:\s*blur/.test(STYLES_CSS),
      'feed backdrop blur rule must be deleted from styles.css'
    );
    assert.ok(
      !/\.card-poster-wrapper\s*\{[^}]*aspect-ratio/.test(STYLES_CSS),
      'feed 4:5 fixed aspect-ratio rule must be deleted from styles.css'
    );
    assert.ok(
      !/\.card-media\s*\{[^}]*aspect-ratio/.test(STYLES_CSS),
      'no aspect-ratio on .card-media in styles.css'
    );
    assert.ok(
      !/\.events-feed\s*\{[^}]*aspect-ratio/.test(STYLES_CSS),
      'no aspect-ratio on .events-feed in styles.css'
    );

    // Image object-fit and position
    assert.ok(
      /\.card-media-img\s*\{[^}]*object-fit:\s*cover/.test(STYLES_CSS),
      'the browsing card image must be object-fit: cover'
    );
    assert.ok(
      /\.card-media-img\s*\{[^}]*object-position:\s*top\s+center/.test(STYLES_CSS),
      'the browsing card image must be object-position: top center'
    );

    // 6. Snapping declared in styles.css
    assert.ok(
      /\.events-feed\s*\{[^}]*scroll-snap-type:\s*y\s+mandatory/.test(STYLES_CSS),
      '.events-feed must declare scroll-snap-type: y mandatory'
    );
    assert.ok(
      /\.events-feed\s*>\s*\.event-card\s*\{[^}]*scroll-snap-stop:\s*always/.test(STYLES_CSS) ||
      /\.event-card\s*\{[^}]*scroll-snap-stop:\s*always/.test(STYLES_CSS),
      '.event-card must declare scroll-snap-stop: always'
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

  await test('every known event renders as its own row, and one with zero recorded occurrences renders as 0, not blank or omitted', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminAnalyticsCounts();

    const { document } = dom.window;
    const rows = document.querySelectorAll('#analyticsCountsList tbody tr');
    assert.strictEqual(rows.length, ANALYTICS_EVENTS.length, `expected one row per known event (${ANALYTICS_EVENTS.length}), got ${rows.length}`);

    // register never appears in ANALYTICS_COUNTS_FIXTURE — it must still
    // render, explicitly at 0, not silently dropped from the table.
    const registerRow = Array.from(rows).find(r => r.textContent.includes('إنشاء حساب جديد'));
    assert.ok(registerRow, 'expected a row for register even though it has no rows in the fixture');
    assert.strictEqual(
      registerRow.querySelector('td:last-child').textContent.trim(),
      '0',
      'a never-recorded event must render its total as 0, not blank or omitted'
    );
  });

  /**
   * FIX 5 (review round 2): an `event_name` the counts endpoint actually has
   * rows for, but which is absent from the catalog (GET /api/privacy/notice —
   * a retired or otherwise unknown key — must still render: with its raw key
   * (there is no Arabic label to show instead) and an explicit "unknown"
   * marker, never silently dropped just because it has no catalog entry. A
   * pane header claiming "every event recorded on the platform" would be a
   * lie for real recorded data that a refactor quietly stopped drawing.
   *
   * Given its own stubbed counts response rather than editing
   * ANALYTICS_COUNTS_FIXTURE, so it does not disturb the "one row per known
   * event" count the test above asserts.
   */
  await test('a retired/unknown event_name the server still has real rows for renders with its raw key and an Arabic "unknown" marker, instead of vanishing', async () => {
    const dom = buildAdminEnv();

    dom.window.fetch = async url => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/privacy/notice') {
        return jsonResponse({ success: true, notice: PRIVACY_NOTICE_FIXTURE });
      }
      if (requestPath === '/api/admin/analytics/counts') {
        return jsonResponse({
          success: true,
          counts: [{ event_name: 'story_uploaded_legacy', total: 7 }]
        });
      }
      return jsonResponse({ success: false });
    };

    await dom.window.fetchAdminAnalyticsCounts();

    const { document } = dom.window;
    const rows = document.querySelectorAll('#analyticsCountsList tbody tr');
    assert.strictEqual(
      rows.length,
      ANALYTICS_EVENTS.length + 1,
      'expected the eight known events PLUS one extra row for the retired key — a dropped row means rows.length stayed at 8'
    );

    const retiredRow = Array.from(rows).find(r => r.textContent.includes('story_uploaded_legacy'));
    assert.ok(retiredRow, 'the retired key\'s row must render its raw key text — it has no Arabic label to show instead');
    assert.strictEqual(
      retiredRow.querySelector('td:last-child').textContent.trim(),
      '7',
      'the retired key\'s real recorded total must still show, not be hidden along with the row'
    );
    assert.ok(
      retiredRow.textContent.includes('غير معروف') || retiredRow.textContent.includes('متقاعد'),
      'expected an explicit Arabic marker that this key is unknown/retired, not a bare raw key with no explanation'
    );
  });

  /**
   * The notice's number must come from the same live value the endpoint
   * itself reads (server/src/services/analytics.service.js RETENTION_DAYS),
   * not two independent literals (one in the mock, one in the UI) that could
   * both go stale together without this test ever noticing.
   */
  await test('the retention notice states the real retention window read from analytics.service.js, not an independent literal', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminAnalyticsCounts();

    const noticeText = dom.window.document.getElementById('analyticsRetentionNotice').textContent;
    assert.ok(
      noticeText.includes(String(RETENTION_DAYS)),
      `expected the real retention window (${RETENTION_DAYS}) sourced from analytics.service.js, got: "${noticeText}"`
    );
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

  /**
   * ANALYTICS_USER_LOG_FIXTURE (used everywhere else in this suite) has
   * totalPages: 1, so no other test ever renders the prev/next controls or
   * exercises a page change. This one forces a two-page result and checks
   * that "next" actually requests page 2 from the server, not just that the
   * button exists.
   */
  await test('a multi-page user log renders prev/next controls, and clicking "next" requests page=2', async () => {
    const dom = buildAdminEnv();
    await dom.window.fetchAdminUsers();

    const requestedPaths = [];
    dom.window.fetch = async url => {
      const requestPath = String(url);
      requestedPaths.push(requestPath);
      if (requestPath === '/api/privacy/notice') {
        return jsonResponse({ success: true, notice: PRIVACY_NOTICE_FIXTURE });
      }
      if (requestPath.startsWith('/api/admin/analytics/users/')) {
        const page = requestPath.includes('page=2') ? 2 : 1;
        return jsonResponse({
          success: true,
          user_id: 501,
          events: [{ event_name: 'login', platform: 'web', app_version: null, content_town: null, created_at: '2026-09-01T10:00:00.000Z' }],
          pagination: { page, limit: 1, total: 2, totalPages: 2 }
        });
      }
      return jsonResponse({ success: false });
    };

    dom.window.viewUserAnalytics(501);
    await waitFor(() => dom.window.document.querySelectorAll('#analyticsUserLogPagination button').length > 0);
    assertNoUnhandledRejections('user log pagination (page 1)');

    const { document } = dom.window;
    const pageButtons = document.querySelectorAll('#analyticsUserLogPagination button');
    assert.strictEqual(pageButtons.length, 2, 'expected both a previous and a next control on a two-page log');
    assert.ok(document.getElementById('analyticsUserLogPagination').textContent.includes('1'), 'expected the current page number in the pagination label');

    const previousRequestCount = requestedPaths.length;
    const nextButton = pageButtons[1];
    nextButton.click();

    await waitFor(() => requestedPaths.length > previousRequestCount && requestedPaths.some(p => p.includes('page=2')));
    assertNoUnhandledRejections('user log pagination (page 2)');
    assert.ok(requestedPaths.some(p => p.includes('page=2')), 'clicking "next" must request page 2 from the server');
  });

  console.log('\nAdmin panel — batch 6d tests (spec stories 8, 22-27, 36-37, 46)');

  await test('rejecting an event sends a reason in the request body', async () => {
    const dom = buildAdminEnv({ loggedIn: true, role: 'super_admin' });
    const patchCalls = [];
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      if (method === 'GET' && requestPath === '/api/admin/events') {
        return jsonResponse({ success: true, events: [{ ...ADMIN_EVENT_FIXTURE, id: 99, status: 'pending' }] });
      }
      if (method === 'PATCH' && requestPath.startsWith('/api/admin/events/')) {
        patchCalls.push({
          url: requestPath,
          method,
          body: options.body ? JSON.parse(options.body) : null
        });
      }
      return jsonResponse({ success: true });
    };

    await dom.window.fetchAdminEvents();
    const rejectBtn = dom.window.document.querySelector('.btn-reject');
    assert.ok(rejectBtn, 'reject button must be present on a pending event');
    rejectBtn.click();

    const reasonInput = dom.window.document.getElementById('rejectReasonInput');
    const confirmBtn = dom.window.document.getElementById('confirmRejectBtn');
    if (reasonInput && confirmBtn) {
      reasonInput.value = 'الصورة غير واضحة';
      confirmBtn.click();
    }
    await waitFor(() => patchCalls.length > 0);

    assert.strictEqual(patchCalls.length, 1, 'expected one PATCH call');
    assert.strictEqual(patchCalls[0].body.status, 'rejected');
    assert.strictEqual(patchCalls[0].body.reason, 'الصورة غير واضحة', 'rejection request body must carry the reason');
  });

  await test('a broadcast carries a tone and a duration', async () => {
    const dom = buildAdminEnv({ loggedIn: true, role: 'super_admin' });
    const broadcastCalls = [];
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      if (method === 'POST' && requestPath === '/api/admin/broadcast') {
        broadcastCalls.push({
          url: requestPath,
          method,
          body: options.body ? JSON.parse(options.body) : null
        });
      }
      return jsonResponse({ success: true });
    };

    dom.window.renderBroadcastComposer();
    dom.window.document.getElementById('broadcastMessageInput').value = 'رسالة تجريبية هامة';
    dom.window.selectBroadcastTone('urgent');
    dom.window.selectBroadcastDuration('week');
    const form = dom.window.document.getElementById('broadcastForm');
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => broadcastCalls.length > 0);

    assert.strictEqual(broadcastCalls.length, 1, 'expected one POST /api/admin/broadcast call');
    const sentBody = broadcastCalls[0].body;
    assert.strictEqual(sentBody.message, 'رسالة تجريبية هامة');
    assert.strictEqual(sentBody.tone, 'urgent', 'broadcast payload must carry a tone');
    assert.strictEqual(sentBody.duration, 'week', 'broadcast payload must carry a duration');
  });

  await test('a broadcast with duration "none" sends duration: "none" and the composer describes it as centre-only', async () => {
    const dom = buildAdminEnv({ loggedIn: true, role: 'super_admin' });
    const broadcastCalls = [];
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      if (method === 'POST' && requestPath === '/api/admin/broadcast') {
        broadcastCalls.push({
          url: requestPath,
          method,
          body: options.body ? JSON.parse(options.body) : null
        });
      }
      return jsonResponse({ success: true });
    };

    dom.window.renderBroadcastComposer();
    dom.window.selectBroadcastDuration('none');
    const hint = dom.window.document.getElementById('broadcastDurationHint').textContent;
    assert.ok(hint.includes('بلا شريط') && hint.includes('مركز الإشعارات'), 'duration hint must honestly explain that "none" leaves the ticker empty');

    dom.window.document.getElementById('broadcastMessageInput').value = 'تعميم للأرشيف ومركز الإشعارات';
    const form = dom.window.document.getElementById('broadcastForm');
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => broadcastCalls.length > 0);

    assert.strictEqual(broadcastCalls.length, 1, 'expected one POST call');
    assert.strictEqual(broadcastCalls[0].body.duration, 'none');
  });

  await test('super admin sees no town picker; town admin sees only their own assigned towns', async () => {
    // 1. Super admin sees no town picker
    const superDom = buildAdminEnv({ loggedIn: true, role: 'super_admin' });
    superDom.window.renderBroadcastComposer();
    const superTownsGroup = superDom.window.document.getElementById('broadcastTownsGroup');
    assert.strictEqual(superTownsGroup.style.display, 'none', 'super admin must not see a town picker');
    const superNotice = superDom.window.document.getElementById('broadcastScopeNotice').textContent;
    assert.ok(superNotice.includes('بث عام وشامل'), 'super admin notice must describe global reach');

    // 2. Town admin sees only their own assigned towns
    const townDom = buildAdminEnv({ loggedIn: true, role: 'admin', towns: ['رهط', 'حورة'] });
    await townDom.window.fetchAdminIdentity();
    townDom.window.renderBroadcastComposer();
    const townGroup = townDom.window.document.getElementById('broadcastTownsGroup');
    assert.strictEqual(townGroup.style.display, 'block', 'town admin must see town picker');
    const checkboxes = Array.from(townDom.window.document.querySelectorAll('#broadcastTownsPicker .broadcast-town-check'));
    const renderedTowns = checkboxes.map(cb => cb.value);
    assert.deepStrictEqual(renderedTowns, ['رهط', 'حورة'], 'town admin can pick only from their assigned towns');

    // Select one town and submit
    checkboxes[0].checked = true;
    const broadcastCalls = [];
    townDom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      if (method === 'POST' && requestPath === '/api/admin/broadcast') {
        broadcastCalls.push({
          url: requestPath,
          method,
          body: options.body ? JSON.parse(options.body) : null
        });
      }
      return jsonResponse({ success: true });
    };

    townDom.window.document.getElementById('broadcastMessageInput').value = 'تعميم لأهل رهط';
    const form = townDom.window.document.getElementById('broadcastForm');
    form.dispatchEvent(new townDom.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => broadcastCalls.length > 0);

    assert.strictEqual(broadcastCalls.length, 1);
    assert.deepStrictEqual(broadcastCalls[0].body.towns, ['رهط'], 'payload must carry selected towns');
  });

  await test('admin with zero assigned towns is stopped before sending (controls disabled and notice shown)', async () => {
    const dom = buildAdminEnv({ loggedIn: true, role: 'admin', towns: [] });
    await dom.window.fetchAdminIdentity();
    dom.window.renderBroadcastComposer();

    const notice = dom.window.document.getElementById('broadcastScopeNotice');
    assert.ok(notice.classList.contains('scope-banner-empty'), 'empty scope notice should have empty banner styling');
    assert.ok(notice.textContent.includes('لا يملك أي بلدة مُسنَدة'), 'notice must tell the admin they have 0 assigned towns');

    const msgInput = dom.window.document.getElementById('broadcastMessageInput');
    const sendBtn = dom.window.document.getElementById('sendBroadcastBtn');
    assert.strictEqual(msgInput.disabled, true, 'message input must be disabled for 0-towns admin');
    assert.strictEqual(sendBtn.disabled, true, 'submit button must be disabled for 0-towns admin');

    let fetchCalled = false;
    dom.window.fetch = async () => {
      fetchCalled = true;
      return jsonResponse({ success: true });
    };

    dom.window.handleSendBroadcast({ preventDefault() {} });
    assert.strictEqual(fetchCalled, false, 'send broadcast must abort before network call when admin has 0 towns');
    const noticeModal = dom.window.document.getElementById('adminNoticeModal');
    assert.strictEqual(noticeModal.style.display, 'flex', 'in-app modal notice must be shown instead of native alert');
    assert.ok(dom.window.document.getElementById('adminNoticeMessage').textContent.includes('لا يملك أي بلدة مُسنَدة'));
  });

  await test('settings tab is reachable only for super admin, saves number, and can clear it', async () => {
    // 1. Role visibility — start from visible so hiding is load-bearing and falsifiable
    const townDom = buildAdminEnv({ loggedIn: true, role: 'admin' });
    const townSettingsBtn = townDom.window.document.getElementById('tabSettingsBtn');
    townSettingsBtn.style.display = 'flex';
    townDom.window.applyRoleVisibility();
    assert.strictEqual(townSettingsBtn.style.display, 'none', 'settings tab button must be hidden for town admin even if initially visible');

    const superDom = buildAdminEnv({ loggedIn: true, role: 'super_admin' });
    superDom.window.applyRoleVisibility();
    assert.strictEqual(superDom.window.document.getElementById('tabSettingsBtn').style.display, 'flex', 'settings tab button must be visible for super admin');

    // 2. Fetch settings
    let savedSettings = { support_whatsapp_number: '972501112233' };
    const calls = [];
    superDom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      calls.push({ url: requestPath, method, body: options.body ? JSON.parse(options.body) : null });
      if (method === 'GET' && requestPath === '/api/admin/settings') {
        return jsonResponse({ success: true, settings: savedSettings });
      }
      if (method === 'PUT' && requestPath === '/api/admin/settings') {
        const body = JSON.parse(options.body);
        savedSettings.support_whatsapp_number = body.support_whatsapp_number;
        return jsonResponse({ success: true, message: 'تم حفظ الإعدادات بنجاح', settings: savedSettings });
      }
      return jsonResponse({ success: false });
    };

    await superDom.window.fetchAdminSettings();
    const input = superDom.window.document.getElementById('settingSupportWhatsapp');
    assert.strictEqual(input.value, '972501112233', 'input must display fetched support number');

    // 3. Save number
    input.value = '972509998877';
    await superDom.window.handleSaveSettings({ preventDefault() {} });
    const putCall = calls.find(c => c.method === 'PUT');
    assert.ok(putCall, 'expected a PUT call to save settings');
    assert.strictEqual(putCall.body.support_whatsapp_number, '972509998877');

    // 4. Clear number
    calls.length = 0;
    await superDom.window.handleClearSupportNumber();
    const clearCall = calls.find(c => c.method === 'PUT');
    assert.ok(clearCall, 'expected a PUT call to clear settings');
    assert.strictEqual(clearCall.body.support_whatsapp_number, '', 'clearing must send empty string');
    assert.strictEqual(input.value, '', 'input must be empty after clearing');
  });

  await test('invalid WhatsApp number displays the server\'s Arabic error without client format check', async () => {
    const dom = buildAdminEnv();
    dom.window.localStorage.setItem('negev_admin_role', 'super_admin');
    dom.window.localStorage.setItem('negev_admin_token', 'test-admin-token');

    let putCalled = false;
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      if (method === 'PUT' && requestPath === '/api/admin/settings') {
        putCalled = true;
        return jsonResponse({ success: false, message: 'رقم واتساب غير صالح — يجب أن يبدأ برمز الدولة وبدون إشارات' }, { status: 400 });
      }
      return jsonResponse({ success: true });
    };

    const input = dom.window.document.getElementById('settingSupportWhatsapp');
    input.value = 'invalid-phone-string';
    await dom.window.handleSaveSettings({ preventDefault() {} });

    assert.strictEqual(putCalled, true, 'must attempt PUT without client-side regex blocking it');
    const notice = dom.window.document.getElementById('settingsNotice');
    assert.strictEqual(notice.style.display, 'block');
    assert.ok(notice.textContent.includes('رقم واتساب غير صالح'), 'must display server error message verbatim in settingsNotice');

    const noticeModal = dom.window.document.getElementById('adminNoticeModal');
    assert.strictEqual(noticeModal.style.display, 'flex');
    assert.ok(dom.window.document.getElementById('adminNoticeMessage').textContent.includes('رقم واتساب غير صالح'));
  });

  await test('town dropdowns are filled from GET /api/towns with \'الكل\' filtered out', async () => {
    const dom = buildAdminEnv();
    dom.window.fetch = async url => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/towns') {
        return jsonResponse({
          success: true,
          towns: ['الكل', 'رهط', 'حورة', 'تل السبع', 'اللقية']
        });
      }
      if (requestPath === '/api/occasion-types') {
        return jsonResponse({ success: true, types: OCCASION_TYPES_FIXTURE });
      }
      return jsonResponse({ success: true });
    };

    await dom.window.initDirectAddForm();
    const dirTownSelect = dom.window.document.getElementById('dirTown');
    assert.ok(dirTownSelect, '#dirTown select should exist in DOM');
    const optionValues = Array.from(dirTownSelect.querySelectorAll('option')).map(o => o.value);
    assert.ok(!optionValues.includes('الكل'), '\'الكل\' must be filtered out of admin town dropdowns');
    assert.ok(optionValues.includes('رهط') && optionValues.includes('حورة') && optionValues.includes('تل السبع'));
  });

  await test('panel behaves sanely when GET /api/towns fails (uses fallback array)', async () => {
    const dom = buildAdminEnv();
    dom.window.fetch = async url => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/towns') {
        throw new Error('Network error loading towns');
      }
      if (requestPath === '/api/occasion-types') {
        return jsonResponse({ success: true, types: OCCASION_TYPES_FIXTURE });
      }
      return jsonResponse({ success: false });
    };

    await dom.window.initDirectAddForm();
    const dirTownSelect = dom.window.document.getElementById('dirTown');
    assert.ok(dirTownSelect, '#dirTown select should exist in DOM');
    const optionValues = Array.from(dirTownSelect.querySelectorAll('option')).map(o => o.value);
    assert.ok(optionValues.length > 0, 'town dropdown must not be left empty on fetch failure');
    assert.ok(optionValues.includes('رهط'), 'fallback towns should be present in dropdown');
    assert.ok(!optionValues.includes('الكل'), 'fallback towns must never contain \'الكل\'');
  });

  await test('picking "القرى والتجمعات" in direct add form keeps the selection without resetting to default town', async () => {
    const dom = buildAdminEnv();
    await dom.window.initDirectAddForm();
    const townSelect = dom.window.document.getElementById('dirTown');
    assert.ok(townSelect, 'town select must exist');
    townSelect.value = 'القرى والتجمعات';
    await dom.window.handleDirTownChange();
    assert.strictEqual(townSelect.value, 'القرى والتجمعات', 'picking villages town must not reset town select back to first option');
  });

  console.log('\nAdmin panel — batch 6e tests (spec stories 55-61: session protection & form drafts)');

  function makeMockJwt({ exp, phone_number = '0501234567', role = 'super_admin' } = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ id: 1, phone_number, role, exp })).toString('base64url');
    const signature = 'fake-sig';
    return `${header}.${payload}.${signature}`;
  }

  await test('a token expiring in under 15 minutes triggers the warning, and one expiring in hours does not', () => {
    // 1. Expiring in 2 hours
    const longExpToken = makeMockJwt({ exp: Math.floor(Date.now() / 1000) + 7200 });
    const dom1 = buildAdminEnv({ loggedIn: false });
    dom1.window.localStorage.setItem('negev_admin_token', longExpToken);
    dom1.window.localStorage.setItem('negev_admin_role', 'super_admin');
    dom1.window.showDashboard();
    dom1.window.checkAdminSessionExpiry();
    const banner1 = dom1.window.document.getElementById('adminSessionWarning');
    assert.strictEqual(banner1.style.display, 'none', 'Warning must remain hidden when session has hours remaining');

    // 2. Expiring in 10 minutes (< 15 min)
    const soonExpToken = makeMockJwt({ exp: Math.floor(Date.now() / 1000) + 600 });
    const dom2 = buildAdminEnv({ loggedIn: false });
    dom2.window.localStorage.setItem('negev_admin_token', soonExpToken);
    dom2.window.localStorage.setItem('negev_admin_role', 'super_admin');
    dom2.window.showDashboard();
    dom2.window.checkAdminSessionExpiry();
    const banner2 = dom2.window.document.getElementById('adminSessionWarning');
    assert.strictEqual(banner2.style.display, 'flex', 'Warning must appear when session has < 15 minutes remaining');
  });

  await test('the warning appears ONCE, not on every tick', () => {
    const soonExpToken = makeMockJwt({ exp: Math.floor(Date.now() / 1000) + 600 });
    const dom = buildAdminEnv({ loggedIn: false });
    dom.window.localStorage.setItem('negev_admin_token', soonExpToken);
    dom.window.localStorage.setItem('negev_admin_role', 'super_admin');
    dom.window.showDashboard();

    const banner = dom.window.document.getElementById('adminSessionWarning');
    dom.window.checkAdminSessionExpiry();
    assert.strictEqual(banner.style.display, 'flex', 'Banner shown on first tick');

    // User dismisses banner
    dom.window.hideAdminSessionWarning();
    assert.strictEqual(banner.style.display, 'none', 'Banner dismissed by admin');

    // Second check tick: should NOT re-show (no nag loop)
    dom.window.checkAdminSessionExpiry();
    assert.strictEqual(banner.style.display, 'none', 'Banner must stay dismissed and not nag on subsequent ticks');
  });

  await test('an expired session does NOT tear the dashboard down', async () => {
    const dom = buildAdminEnv({ loggedIn: true });
    dom.window.fetch = async () => jsonResponse({ success: false, message: 'الجلسة منتهية' }, { status: 401 });

    await dom.window.adminFetch('/api/admin/test');

    const reauthModal = dom.window.document.getElementById('adminReauthModal');
    const dashboardScreen = dom.window.document.getElementById('adminDashboardScreen');
    const loginScreen = dom.window.document.getElementById('adminLoginScreen');

    assert.strictEqual(reauthModal?.style.display, 'flex', 'Re-login prompt must be shown over the dashboard');
    assert.strictEqual(dashboardScreen.style.display, 'block', 'Dashboard screen must stay displayed');
    assert.strictEqual(loginScreen.style.display, 'none', 'Login screen must not take over');
  });

  /*
   * `handleAdminSessionExpired` reaches openAdminReauthModal from TWO repeating
   * sources: the 30-second session timer, and every 401 `adminFetch` sees — and
   * loadAdminDashboard fires many requests through one Promise.all, so several
   * 401s land together. Since opening the modal clears the PIN field, an
   * unguarded re-entry wipes whatever the admin is typing underneath it, which
   * is the exact "thrown out mid-typing" experience story 57 exists to prevent.
   */
  await test('re-entering the expired-session path does not wipe a PIN already being typed', async () => {
    const dom = buildAdminEnv({ loggedIn: true });
    dom.window.fetch = async () => jsonResponse({ success: false, message: 'الجلسة منتهية' }, { status: 401 });

    await dom.window.adminFetch('/api/admin/test');
    const pinInput = dom.window.document.getElementById('adminReauthPin');
    assert.strictEqual(dom.window.document.getElementById('adminReauthModal').style.display, 'flex');

    pinInput.value = '1234';

    // A second 401 from the same Promise.all, then the 30-second timer tick.
    await dom.window.adminFetch('/api/admin/other');
    dom.window.checkAdminSessionExpiry();

    assert.strictEqual(pinInput.value, '1234', 'a re-entered expiry must not clear the PIN the admin is typing');
  });

  await test('a successful re-login swaps the stored token and leaves the dashboard mounted', async () => {
    const oldToken = makeMockJwt({ exp: Math.floor(Date.now() / 1000) - 100 });
    const newToken = makeMockJwt({ exp: Math.floor(Date.now() / 1000) + 3600 * 12 });
    const dom = buildAdminEnv({ loggedIn: false });
    dom.window.localStorage.setItem('negev_admin_token', oldToken);
    dom.window.localStorage.setItem('negev_admin_role', 'super_admin');
    dom.window.showDashboard();
    dom.window.checkAdminSessionExpiry();

    const reauthModal = dom.window.document.getElementById('adminReauthModal');
    assert.strictEqual(reauthModal.style.display, 'flex', 'Reauth modal open on expired token');

    dom.window.fetch = async (url, options) => {
      const path = String(url).split('?')[0];
      if (path === '/api/admin/login' && options.method === 'POST') {
        const body = JSON.parse(options.body);
        assert.strictEqual(body.pin_code, '9999');
        return jsonResponse({ success: true, token: newToken, user: { role: 'super_admin' } });
      }
      return buildFetchStub()(url, options);
    };

    dom.window.document.getElementById('adminReauthPin').value = '9999';
    await dom.window.handleAdminReauth({ preventDefault() {} });

    assert.strictEqual(dom.window.localStorage.getItem('negev_admin_token'), newToken, 'Stored token must be swapped');
    assert.strictEqual(reauthModal.style.display, 'none', 'Reauth modal must close after success');
    assert.strictEqual(dom.window.document.getElementById('adminDashboardScreen').style.display, 'block', 'Dashboard remains mounted');
    assert.strictEqual(dom.window.document.getElementById('adminLoginScreen').style.display, 'none', 'Login screen does not take over');
  });

  await test('the PIN is not in localStorage or sessionStorage after a successful re-login', async () => {
    const secretPin = '7391';
    const newToken = makeMockJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const dom = buildAdminEnv({ loggedIn: true });

    dom.window.fetch = async () => jsonResponse({ success: true, token: newToken, user: { role: 'super_admin' } });

    dom.window.openAdminReauthModal();
    dom.window.document.getElementById('adminReauthPin').value = secretPin;
    await dom.window.handleAdminReauth({ preventDefault() {} });

    // Assert PIN is NOT anywhere in localStorage
    for (let i = 0; i < dom.window.localStorage.length; i++) {
      const key = dom.window.localStorage.key(i);
      const val = dom.window.localStorage.getItem(key);
      assert.ok(!key.includes(secretPin), `Key ${key} must not contain PIN`);
      assert.ok(!val.includes(secretPin), `Value of ${key} must not contain PIN`);
    }

    // Assert PIN is NOT anywhere in sessionStorage
    for (let i = 0; i < dom.window.sessionStorage.length; i++) {
      const key = dom.window.sessionStorage.key(i);
      const val = dom.window.sessionStorage.getItem(key);
      assert.ok(!key.includes(secretPin), `Key ${key} in sessionStorage must not contain PIN`);
      assert.ok(!val.includes(secretPin), `Value of ${key} in sessionStorage must not contain PIN`);
    }

    // Assert input field was cleared
    assert.strictEqual(dom.window.document.getElementById('adminReauthPin').value, '', 'PIN input must be cleared');
  });

  await test('a draft is saved from the direct-add form and offered back after re-login', async () => {
    const dom = buildAdminEnv({ loggedIn: true });
    await dom.window.initDirectAddForm();

    // Type into form (wedding fixture defines dirLocationName)
    const locInput = dom.window.document.getElementById('dirLocationName');
    assert.ok(locInput, 'dirLocationName must exist');
    locInput.value = 'قاعة السلام - رهط';

    // Collect draft and save
    const draft = dom.window.collectDirectAddFormDraft();
    assert.ok(draft, 'Draft must be collected');
    assert.strictEqual(draft.values.dirLocationName, 'قاعة السلام - رهط');
    dom.window.localStorage.setItem('negev_draft_direct_add', JSON.stringify(draft));

    // Simulate session expired + reauth
    dom.window.handleAdminSessionExpired();
    assert.strictEqual(dom.window.document.getElementById('adminReauthModal').style.display, 'flex');

    // Direct add form checks draft
    dom.window.checkDirectAddDraft();
    const notice = dom.window.document.getElementById('dirDraftNotice');
    assert.strictEqual(notice.style.display, 'flex', 'Draft notice banner must be displayed');

    // Clear form and restore draft
    locInput.value = '';
    dom.window.applyDirectAddDraft();
    assert.strictEqual(locInput.value, 'قاعة السلام - رهط', 'Draft value must be restored');
    assert.strictEqual(notice.style.display, 'none', 'Draft banner hidden after restore');
  });

  await test('declining the restore deletes the draft so it is not offered again', async () => {
    const dom = buildAdminEnv({ loggedIn: true });
    await dom.window.initDirectAddForm();

    dom.window.localStorage.setItem('negev_draft_direct_add', JSON.stringify({
      occasion_type_id: 1,
      values: { dirLocationName: 'مناسبة ستُحذف' },
      updated_at: Date.now()
    }));

    dom.window.checkDirectAddDraft();
    const notice = dom.window.document.getElementById('dirDraftNotice');
    assert.strictEqual(notice.style.display, 'flex', 'Draft offer displayed');

    // Admin clicks "discard"
    dom.window.discardDirectAddDraft();
    assert.strictEqual(dom.window.localStorage.getItem('negev_draft_direct_add'), null, 'Draft must be deleted from localStorage');
    assert.strictEqual(notice.style.display, 'none', 'Notice must be hidden');

    // Calling check again should NOT offer
    dom.window.checkDirectAddDraft();
    assert.strictEqual(notice.style.display, 'none', 'Draft notice must not appear after being discarded');
  });

  await test('a draft that had a file field says so in Arabic on restore', async () => {
    const dom = buildAdminEnv({ loggedIn: true });
    await dom.window.initDirectAddForm();

    dom.window.localStorage.setItem('negev_draft_direct_add', JSON.stringify({
      occasion_type_id: 1,
      values: { dirLocationName: 'مناسبة مع ملف' },
      hadFiles: true,
      updated_at: Date.now()
    }));

    dom.window.applyDirectAddDraft();

    const fileNotice = dom.window.document.getElementById('dirDraftFileNotice');
    assert.ok(fileNotice, 'File notice element must exist');
    assert.strictEqual(fileNotice.style.display, 'flex', 'File notice must be shown when draft had files');
    assert.ok(
      fileNotice.textContent.includes('الصورة') && fileNotice.textContent.includes('لم يُحفظا'),
      'Notice must state in Arabic that files were not saved'
    );
  });

  await test('logging out clears the drafts', () => {
    const dom = buildAdminEnv({ loggedIn: true });
    dom.window.localStorage.setItem('negev_draft_direct_add', JSON.stringify({ occasion_type_id: 1, values: { dirTitle: 'مسودة مباشرة' } }));
    dom.window.localStorage.setItem('negev_draft_event_99', JSON.stringify({ values: { evtTitle: 'مسودة تعديل' } }));

    assert.ok(dom.window.localStorage.getItem('negev_draft_direct_add'), 'direct draft set');
    assert.ok(dom.window.localStorage.getItem('negev_draft_event_99'), 'edit draft set');

    dom.window.handleAdminLogout();

    assert.strictEqual(dom.window.localStorage.getItem('negev_draft_direct_add'), null, 'direct add draft must be cleared on logout');
    assert.strictEqual(dom.window.localStorage.getItem('negev_draft_event_99'), null, 'event edit draft must be cleared on logout');
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

  await test('the two detail levels share an identical outer silhouette', () => {
    function renderSilhouette(detail, size = 200) {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);

      const u = size / 100;
      const cx = size / 2;
      const cy = size / 2;

      ctx.fillStyle = '#ffffff';
      const parts = buildMarkParts(detail);
      parts.forEach(part => {
        tracePart(ctx, part, u);
        ctx.fill();
      });

      // Mask the interior hole (everything inside R_IN)
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, R_IN * u, 0, Math.PI * 2);
      ctx.fill();

      return ctx.getImageData(0, 0, size, size).data;
    }

    const full = renderSilhouette('full');
    const icon = renderSilhouette('icon');
    assert.strictEqual(full.length, icon.length);
    for (let i = 0; i < full.length; i += 1) {
      assert.strictEqual(
        full[i],
        icon[i],
        `silhouette mismatch at byte ${i}: full=${full[i]} icon=${icon[i]}`
      );
    }
  });

  await test('nothing is clipped by the circular mask at safe-zone scale', async () => {
    for (const detail of ['full', 'icon']) {
      const buffer = renderIcon(512, { safeZone: true, detail });
      const { data, width, height } = await decodeIconPixels(buffer);
      const cx = width / 2;
      const cy = height / 2;
      const maxRadius = width * 0.40;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (dist > maxRadius) {
            const idx = (y * width + x) * 4;
            const pixelType = classifyPixel(data[idx], data[idx + 1], data[idx + 2]);
            assert.strictEqual(
              pixelType,
              'ground',
              `detail=${detail}: non-ground pixel found at (${x}, ${y}), dist ${dist.toFixed(1)}px exceeds safe radius ${maxRadius.toFixed(1)}px`
            );
          }
        }
      }
    }
  });

  await test('the notches are a half, not a shift — every icon-level notch angle is present in the full-level set', () => {
    const fullNotches = buildMarkParts('full').filter(p => p.role === 'notch');
    const iconNotches = buildMarkParts('icon').filter(p => p.role === 'notch');

    assert.strictEqual(fullNotches.length, 36, 'expected 36 notches at full detail');
    assert.strictEqual(iconNotches.length, 18, 'expected 18 notches at icon detail');

    const fullAngles = new Set(fullNotches.map(n => Math.round(n.angle * 1e6)));
    iconNotches.forEach(n => {
      const a = Math.round(n.angle * 1e6);
      assert.ok(
        fullAngles.has(a),
        `icon notch angle ${n.angle} was not found in the full-detail notch set`
      );
    });
  });

  await test('the shaping parity gate — static vector path matches Cairo ctx.fillText Arabic shaping', () => {
    const fontSize = 100;
    const scale = fontSize / 1000;
    const inkW = BRAND_WORD.width * scale;
    const inkH = BRAND_WORD.height * scale;
    const originX = 50;
    const originY = 150;
    const inkX = originX + BRAND_WORD.originX * scale;
    const inkY = originY + BRAND_WORD.originY * scale;

    const c1 = createCanvas(350, 250);
    const ctx1 = c1.getContext('2d');
    ctx1.fillStyle = '#000000';
    ctx1.fillRect(0, 0, 350, 250);
    ctx1.fillStyle = '#ffffff';
    ctx1.beginPath();
    BRAND_WORD.commands.forEach(([type, ...args]) => {
      if (type === 'M') ctx1.moveTo(inkX + args[0] * inkW, inkY + args[1] * inkH);
      else if (type === 'L') ctx1.lineTo(inkX + args[0] * inkW, inkY + args[1] * inkH);
      else if (type === 'Q') ctx1.quadraticCurveTo(inkX + args[0] * inkW, inkY + args[1] * inkH, inkX + args[2] * inkW, inkY + args[3] * inkH);
      else if (type === 'C') ctx1.bezierCurveTo(inkX + args[0] * inkW, inkY + args[1] * inkH, inkX + args[2] * inkW, inkY + args[3] * inkH, inkX + args[4] * inkW, inkY + args[5] * inkH);
      else if (type === 'Z') ctx1.closePath();
    });
    ctx1.fill();

    const c2 = createCanvas(350, 250);
    const ctx2 = c2.getContext('2d');
    ctx2.fillStyle = '#000000';
    ctx2.fillRect(0, 0, 350, 250);
    ctx2.fillStyle = '#ffffff';
    ctx2.font = `${fontSize}px CairoBold`;
    ctx2.textAlign = 'left';
    ctx2.textBaseline = 'alphabetic';
    ctx2.direction = 'ltr';
    ctx2.fillText('عرس', originX, originY);

    const img1 = ctx1.getImageData(0, 0, 350, 250).data;
    const img2 = ctx2.getImageData(0, 0, 350, 250).data;

    let ink1 = 0;
    let ink2 = 0;
    let diffPixels = 0;
    for (let i = 0; i < img1.length; i += 4) {
      const v1 = img1[i];
      const v2 = img2[i];
      if (v1 > 20) ink1 += 1;
      if (v2 > 20) ink2 += 1;
      if (Math.abs(v1 - v2) > 30) diffPixels += 1;
    }

    const maxInk = Math.max(ink1, ink2);
    const diffRatio = diffPixels / maxInk;
    const inkAreaDiff = Math.abs(ink1 - ink2) / maxInk;

    assert.ok(
      inkAreaDiff < 0.03,
      `shaping parity ink area difference ${(inkAreaDiff * 100).toFixed(2)}% exceeds 3%`
    );
    assert.ok(
      diffRatio < 0.10,
      `shaping parity diff ratio ${(diffRatio * 100).toFixed(2)}% exceeds tight threshold 10%`
    );
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
    // Driven through its entry point, as every test here does: the queued
    // DOMContentLoaded dispatch actually DOES reach app.js's own listener
    // (readyState is still 'loading' when window.eval runs, and it fires
    // within two microtask ticks — see flushBoot() above, verified directly
    // against jsdom). It just hasn't happened yet at this synchronous line,
    // so calling the function directly is still required here, not optional.
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

  console.log('\nNews ticker & support button (issue #85 batch 6b)');

  const TICKER_INFO = {
    id: 101, title: 'تعميم عادي', message: 'نص تعميم عادي', tone: 'info',
    expires_at: '2026-09-10T00:00:00.000Z', scope_town: null, created_at: '2026-09-08T08:00:00.000Z'
  };
  const TICKER_URGENT = {
    id: 102, title: 'تعميم عاجل', message: 'نص تعميم عاجل', tone: 'urgent',
    expires_at: '2026-09-09T00:00:00.000Z', scope_town: null, created_at: '2026-09-08T09:00:00.000Z'
  };
  const TICKER_SOLEMN = {
    id: 103, title: 'تعميم وقور', message: 'نص تعميم وقور', tone: 'solemn',
    expires_at: '2026-09-09T00:00:00.000Z', scope_town: null, created_at: '2026-09-08T07:00:00.000Z'
  };
  // رقم اختباري بحت — ليس رقماً حقيقياً، شكله فقط مطابق لما يعيده settings.service.js.
  const FAKE_SUPPORT_NUMBER = '972520000000';

  /** يبني fetch stub يعيد `broadcasts` على GET /api/broadcasts/live فوق القاعدة العامة، ويتتبّع كل PATCH. */
  function buildBroadcastsFetchStub(broadcasts) {
    const calls = [];
    const fetchStub = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      if (method !== 'GET') calls.push({ url: requestPath, method });

      if (requestPath === '/api/broadcasts/live' && method === 'GET') {
        return jsonResponse({ success: true, broadcasts });
      }
      if (requestPath.startsWith('/api/broadcasts/') && requestPath.endsWith('/dismiss') && method === 'PATCH') {
        return jsonResponse({ success: true });
      }
      return buildFetchStub()(url, options);
    };
    return { fetchStub, calls };
  }

  await test('the ticker renders from GET /api/broadcasts/live on load, with no socket involved', async () => {
    const dom = buildEnv();
    await flushBoot();
    const { fetchStub } = buildBroadcastsFetchStub([TICKER_INFO]);
    dom.window.fetch = fetchStub;

    await dom.window.fetchLiveBroadcasts();

    const ticker = dom.window.document.getElementById('broadcastTicker');
    assert.strictEqual(ticker.hidden, false, 'a live broadcast must show the ticker without any socket signal');
    assert.strictEqual(dom.window.document.getElementById('tickerTitle').textContent, TICKER_INFO.title);
    assert.strictEqual(dom.window.document.getElementById('tickerMessage').textContent, TICKER_INFO.message);
  });

  await test('zero live broadcasts leaves the ticker hidden', async () => {
    const dom = buildEnv();
    await flushBoot();
    const { fetchStub } = buildBroadcastsFetchStub([]);
    dom.window.fetch = fetchStub;

    await dom.window.fetchLiveBroadcasts();

    assert.strictEqual(dom.window.document.getElementById('broadcastTicker').hidden, true);
  });

  await test('with two live broadcasts, the ticker shows the newest and an indicator that opens the rest', async () => {
    const dom = buildEnv(); // anonymous — the indicator expands the ticker in place
    await flushBoot();
    const { fetchStub } = buildBroadcastsFetchStub([TICKER_URGENT, TICKER_INFO]); // server order: newest first
    dom.window.fetch = fetchStub;

    await dom.window.fetchLiveBroadcasts();

    assert.strictEqual(dom.window.document.getElementById('tickerTitle').textContent, TICKER_URGENT.title, 'the newest broadcast must be the one shown');
    const moreBtn = dom.window.document.getElementById('tickerMoreBtn');
    assert.strictEqual(moreBtn.hidden, false);
    assert.strictEqual(dom.window.document.getElementById('tickerMoreCount').textContent, '1');

    const expandedList = dom.window.document.getElementById('tickerExpandedList');
    assert.strictEqual(expandedList.hidden, true, 'the rest stays collapsed until the indicator is used');

    dom.window.handleTickerMoreClick();
    assert.strictEqual(expandedList.hidden, false, 'an anonymous visitor expands the ticker in place');
    assert.ok(expandedList.textContent.includes(TICKER_INFO.title), 'the second broadcast must appear once expanded');
  });

  await test('signed in, the same indicator re-fetches the notifications centre before opening it, instead of expanding the ticker', async () => {
    const dom = buildEnv({ loggedIn: true });
    await flushBoot();
    const { fetchStub } = buildBroadcastsFetchStub([TICKER_URGENT, TICKER_INFO]);
    let notificationsFetches = 0;
    dom.window.fetch = async (url, options) => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/notifications') notificationsFetches += 1;
      return fetchStub(url, options);
    };

    await dom.window.fetchLiveBroadcasts();
    // FIX 3: without a re-fetch here, "+N" could open a centre still showing
    // the stale list fetched at page load — counting a broadcast the "+N"
    // itself just proved arrived, but never actually listing it.
    await dom.window.handleTickerMoreClick();

    assert.strictEqual(notificationsFetches, 1, 'opening the centre from "+N" must re-fetch it first');
    assert.strictEqual(dom.window.document.getElementById('notificationsModal').style.display, 'flex');
    assert.strictEqual(dom.window.document.getElementById('tickerExpandedList').hidden, true, 'a signed-in visitor never gets the inline expansion');
  });

  await test('a solemn broadcast gets its own class and never the animated (urgent-pulse) class', async () => {
    const dom = buildEnv();
    await flushBoot();
    const { fetchStub } = buildBroadcastsFetchStub([TICKER_SOLEMN]);
    dom.window.fetch = fetchStub;

    await dom.window.fetchLiveBroadcasts();

    const ticker = dom.window.document.getElementById('broadcastTicker');
    assert.ok(ticker.classList.contains('tone-solemn'));
    assert.ok(!ticker.classList.contains('ticker-urgent-pulse'), 'a solemn broadcast must never animate');
  });

  await test('an urgent broadcast gets the pulse class, for contrast with solemn', async () => {
    const dom = buildEnv();
    await flushBoot();
    const { fetchStub } = buildBroadcastsFetchStub([TICKER_URGENT]);
    dom.window.fetch = fetchStub;

    await dom.window.fetchLiveBroadcasts();

    assert.ok(dom.window.document.getElementById('broadcastTicker').classList.contains('ticker-urgent-pulse'));
  });

  await test('dismissing while signed in calls PATCH /api/broadcasts/:id/dismiss, and the ticker clears', async () => {
    const dom = buildEnv({ loggedIn: true });
    await flushBoot();
    const { fetchStub, calls } = buildBroadcastsFetchStub([TICKER_INFO]);
    dom.window.fetch = fetchStub;

    await dom.window.fetchLiveBroadcasts();
    dom.window.dismissActiveBroadcast();
    await waitFor(() => calls.length > 0);

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], { url: `/api/broadcasts/${TICKER_INFO.id}/dismiss`, method: 'PATCH' });
    assert.strictEqual(dom.window.document.getElementById('broadcastTicker').hidden, true);
  });

  await test('dismissing while anonymous writes to localStorage, calls no PATCH, and the broadcast does not come back on the next render', async () => {
    const first = buildEnv(); // anonymous
    await flushBoot();
    const { fetchStub, calls } = buildBroadcastsFetchStub([TICKER_INFO]);
    first.window.fetch = fetchStub;

    await first.window.fetchLiveBroadcasts();
    first.window.dismissActiveBroadcast();

    assert.strictEqual(calls.length, 0, 'an anonymous visitor must never call the server to dismiss — there is no identity to key it on');
    const stored = JSON.parse(first.window.localStorage.getItem('negev_dismissed_broadcasts') || '[]');
    assert.ok(stored.includes(TICKER_INFO.id), 'the dismissed id must be remembered in localStorage');
    assert.strictEqual(first.window.document.getElementById('broadcastTicker').hidden, true);

    // The next page load: a fresh document, the server still returns the same
    // still-live broadcast (it has no idea an anonymous visitor dismissed it),
    // but the persisted localStorage value must keep it off the ticker.
    const second = buildEnv();
    await flushBoot();
    second.window.localStorage.setItem('negev_dismissed_broadcasts', JSON.stringify(stored));
    const { fetchStub: secondFetchStub } = buildBroadcastsFetchStub([TICKER_INFO]);
    second.window.fetch = secondFetchStub;

    await second.window.fetchLiveBroadcasts();

    assert.strictEqual(
      second.window.document.getElementById('broadcastTicker').hidden,
      true,
      'a broadcast dismissed anonymously must not reappear after a reload'
    );
  });

  await test('a town_broadcast socket signal triggers a re-fetch and never renders text from the payload itself', async () => {
    const dom = buildEnv();
    await flushBoot();
    const socketHandlers = {};
    dom.window.io = () => ({
      on(event, handler) { socketHandlers[event] = handler; },
      off() {},
      emit() {}
    });

    let liveFetchCount = 0;
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/broadcasts/live') {
        liveFetchCount += 1;
        return jsonResponse({ success: true, broadcasts: [TICKER_INFO] });
      }
      return buildFetchStub()(url, options);
    };

    dom.window.initSocket();
    assert.strictEqual(typeof socketHandlers.town_broadcast, 'function', 'expected app.js to register a town_broadcast handler');

    // The real payload carries no title/message at all (server/src/routes/admin.routes.js) —
    // firing it with a shape that WOULD leak text if ever rendered directly is
    // the point: the assertion below only passes if the handler re-fetched.
    socketHandlers.town_broadcast({ id: 999, scope_town: 'رهط', tone: 'urgent', expires_at: null });
    // liveFetchCount already ticks up the instant the stub is CALLED — the
    // handler's own fire-and-forget promise (res.json(), render) may still be
    // in flight at that point, so wait for the actual render instead.
    // #tickerTitle is (re)created fresh on every render — before the first
    // one it does not exist in the document at all, so the lookup itself
    // must be null-safe here.
    await waitFor(() => {
      const titleEl = dom.window.document.getElementById('tickerTitle');
      return !!titleEl && titleEl.textContent === TICKER_INFO.title;
    });

    assert.strictEqual(liveFetchCount, 1);
    assert.strictEqual(
      dom.window.document.getElementById('tickerTitle').textContent,
      TICKER_INFO.title,
      'the ticker must show the re-fetched broadcast, never anything derived from the socket payload'
    );
  });

  await test('the support entry opens a wa.me link built from the exact stored number, unmodified — via the in-app modal, not confirm()', async () => {
    const dom = buildEnv();
    await flushBoot();
    dom.window.fetch = async url => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/settings/public') {
        return jsonResponse({ success: true, settings: { support_whatsapp_number: FAKE_SUPPORT_NUMBER } });
      }
      return buildFetchStub()(url);
    };

    await dom.window.initSupportEntry();

    const btn = dom.window.document.getElementById('supportBtn');
    assert.strictEqual(btn.hidden, false);
    assert.ok(!btn.classList.contains('support-btn-disabled'));

    const opened = [];
    dom.window.open = (...args) => opened.push(args);

    dom.window.handleSupportClick();
    assert.strictEqual(opened.length, 0, 'the modal must appear before anything opens');
    assert.strictEqual(dom.window.document.getElementById('supportModal').style.display, 'flex');
    assert.strictEqual(dom.window.document.getElementById('supportModalConfirmActions').hidden, false);
    assert.strictEqual(dom.window.document.getElementById('supportModalOkActions').hidden, true);

    dom.window.confirmSupportWhatsappOpen(); // the "متابعة إلى واتساب" button

    assert.strictEqual(opened.length, 1);
    assert.strictEqual(opened[0][0], `https://wa.me/${FAKE_SUPPORT_NUMBER}`, 'the number must travel into the link exactly as the server sent it — no re-formatting');
    assert.strictEqual(dom.window.document.getElementById('supportModal').style.display, 'none', 'the modal must close once WhatsApp opens');
  });

  await test('FIX 5: the disclosure is the page\'s own modal, not a browser confirm() — declining it opens nothing', async () => {
    const dom = buildEnv();
    await flushBoot();
    dom.window.fetch = async url => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/settings/public') {
        return jsonResponse({ success: true, settings: { support_whatsapp_number: FAKE_SUPPORT_NUMBER } });
      }
      return buildFetchStub()(url);
    };
    await dom.window.initSupportEntry();

    const opened = [];
    dom.window.open = (...args) => opened.push(args);
    // A page that still called window.confirm() here would auto-accept
    // under this env's default stub (buildEnv sets confirm to always return
    // true) — leaving it exactly as buildEnv provides it, unstubbed further,
    // is itself part of the proof that this path no longer consults it.

    dom.window.handleSupportClick();
    dom.window.document.getElementById('supportModalConfirmActions')
      .querySelector('.chat-trigger-btn').click(); // "إلغاء"

    assert.strictEqual(opened.length, 0, 'declining the disclosure must open nothing');
    assert.strictEqual(dom.window.document.getElementById('supportModal').style.display, 'none');

    dom.window.handleSupportClick();
    dom.window.document.getElementById('supportModalConfirmActions')
      .querySelector('.submit-btn').click(); // "متابعة إلى واتساب"

    assert.strictEqual(opened.length, 1, 'accepting the disclosure must open WhatsApp');
  });

  await test('a null support number leaves the entry visible but disabled, and tapping it explains why in the same modal, never a browser alert()', async () => {
    const dom = buildEnv();
    await flushBoot();
    dom.window.fetch = async url => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/settings/public') {
        return jsonResponse({ success: true, settings: { support_whatsapp_number: null } });
      }
      return buildFetchStub()(url);
    };

    await dom.window.initSupportEntry();

    const btn = dom.window.document.getElementById('supportBtn');
    assert.strictEqual(btn.hidden, false, 'a null number must not hide the entry — it must stay reachable, just disabled');
    assert.ok(btn.classList.contains('support-btn-disabled'));

    const opened = [];
    dom.window.open = (...args) => opened.push(args);

    dom.window.handleSupportClick();

    assert.strictEqual(opened.length, 0, 'no number means nothing to open');
    assert.strictEqual(dom.window.document.getElementById('supportModal').style.display, 'flex', 'tapping a disabled entry must explain why in the page\'s own modal, never do nothing at all');
    assert.ok(dom.window.document.getElementById('supportModalText').textContent.length > 0);
    assert.strictEqual(dom.window.document.getElementById('supportModalOkActions').hidden, false);
    assert.strictEqual(dom.window.document.getElementById('supportModalConfirmActions').hidden, true, 'no number means no "continue to WhatsApp" option at all');
  });

  console.log('\nNews ticker — second review round (issue #85, FIX 1 and FIX 2b)');

  await test('FIX 1: a single long broadcast — no "+N" to fall back on — is still reachable in full, for an anonymous AND a signed-in visitor', async () => {
    const LONG_BROADCAST = {
      id: 201,
      title: 'عنوان تعميم طويل جداً يتجاوز عرض السطر الواحد بسهولة، ولا يجوز أن يبقى مقصوصاً بلا وسيلة لقراءته كاملاً',
      message: 'نص تعميم طويل أيضاً يشرح تفاصيل حقيقية يجب أن تصل كاملة لكل من يقرأ الشريط، سواء كان مسجَّلاً دخوله أو زائراً مجهولاً بلا حساب على الإطلاق — لا مركز إشعارات يظهر له بديلاً',
      tone: 'info', expires_at: '2026-09-10T00:00:00.000Z', scope_town: null, created_at: '2026-09-08T08:00:00.000Z'
    };

    for (const loggedIn of [false, true]) {
      const dom = buildEnv({ loggedIn });
      await flushBoot();
      const { fetchStub } = buildBroadcastsFetchStub([LONG_BROADCAST]); // exactly one broadcast — no rest, so "+N" cannot be the answer
      dom.window.fetch = fetchStub;

      await dom.window.fetchLiveBroadcasts();

      const ticker = dom.window.document.getElementById('broadcastTicker');
      assert.strictEqual(dom.window.document.getElementById('tickerMoreBtn').hidden, true, 'a single broadcast never shows a +N — the expand button has to work without one');
      assert.ok(!ticker.classList.contains('ticker-text-expanded'), 'collapsed by default — that is still the point of a ticker');
      // jsdom draws no layout, so the full text already sits in the DOM even
      // collapsed — clipping is CSS-only. What the toggle must prove is the
      // CSS HOOK existing and actually being lifted, asserted below.
      assert.strictEqual(dom.window.document.getElementById('tickerTitle').textContent, LONG_BROADCAST.title);
      assert.strictEqual(dom.window.document.getElementById('tickerMessage').textContent, LONG_BROADCAST.message);

      dom.window.toggleTickerTextExpanded();

      assert.ok(ticker.classList.contains('ticker-text-expanded'), `expanding must work ${loggedIn ? 'signed in' : 'anonymously'}`);
      assert.strictEqual(dom.window.document.getElementById('tickerExpandTextBtn').getAttribute('aria-expanded'), 'true');
    }

    // The behavioural assertions above would still pass even if the CSS never
    // actually clipped anything, OR if it clipped everything permanently —
    // jsdom cannot tell those apart by itself. This reads the real stylesheet,
    // the same technique the file's own "nothing that ships hidden" test uses
    // for the identical reason.
    assert.ok(
      /\.broadcast-ticker:not\(\.ticker-text-expanded\)[\s\S]{0,120}white-space:\s*nowrap/.test(STYLES_CSS_RAW),
      'the collapsed row must actually be clipped to one line in CSS — that is what a ticker is'
    );
    assert.ok(
      STYLES_CSS_RAW.includes('.ticker-text-expanded'),
      'expanding must be wired to a real CSS rule, not just a JS class with nothing reading it'
    );
  });

  await test('FIX 2b: a broadcast dismissed while anonymous does not reappear after signing in on the SAME device', async () => {
    const dom = buildEnv(); // starts anonymous — nobody in negev_user yet
    await flushBoot();

    let liveFetches = 0;
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = (options && options.method) || 'GET';
      if (requestPath === '/api/broadcasts/live' && method === 'GET') {
        liveFetches += 1;
        // The server has no idea this visitor dismissed it locally — a
        // global broadcast is not scoped to an account that never called
        // PATCH .../dismiss because it had no account yet.
        return jsonResponse({ success: true, broadcasts: [TICKER_INFO] });
      }
      if (requestPath === '/api/auth/login' && method === 'POST') {
        return jsonResponse({ success: true, token: 'test-token-after-login', user: { id: 777, full_name: 'مستخدم بعد الدخول', role: 'user' } });
      }
      return buildFetchStub()(url, options);
    };

    await dom.window.fetchLiveBroadcasts();
    dom.window.dismissActiveBroadcast();
    assert.strictEqual(dom.window.document.getElementById('broadcastTicker').hidden, true, 'dismissed while still anonymous');
    assert.strictEqual(liveFetches, 1);

    // The real sign-in path, on the SAME window/closure — not a second
    // buildEnv(): app.js's top-level `currentUser`/`authToken` do not attach
    // to `window` under an indirect eval (this file's own documented gotcha),
    // so the only faithful way to become "signed in" here is the real
    // function that flips them from inside its own closure.
    dom.window.document.getElementById('loginPhone').value = '0500000000';
    dom.window.document.getElementById('loginPin').value = '1234';
    await dom.window.handleLogin({ preventDefault() {} });
    // handleLogin's own fetchLiveBroadcasts() call is fire-and-forget, same
    // as its existing fetchNotifications() — awaiting handleLogin itself does
    // NOT wait for that second render to land, so the count and the render
    // must both be polled for, or this assertion below would silently pass
    // against the PRE-fix state too (still-hidden from the dismiss above,
    // never actually re-checked against the re-fetched data at all).
    await waitFor(() => liveFetches >= 2);
    await flushBoot();

    assert.ok(liveFetches >= 2, 'signing in must re-fetch the live broadcasts (FIX 2a) — otherwise this proof cannot even reach the FIX 2b question');
    assert.strictEqual(
      dom.window.document.getElementById('broadcastTicker').hidden,
      true,
      'signing in must never resurrect a broadcast this same person, on this same device, already dismissed as a visitor'
    );
  });

  console.log('\nWeb Push & Notification Centre (issue #85 batch 6c, stories 12-18)');

  await test('loading the page does NOT request notification permission', async () => {
    let pushFakes;
    const FAKE_VAPID_PUBLIC_KEY = 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
    const dom = buildEnv({
      loggedIn: true,
      onBeforeEval: (w) => {
        pushFakes = installPushFakes(w);
        w.fetch = async (url, options = {}) => {
          const requestPath = String(url).split('?')[0];
          if (requestPath === '/api/notifications/vapid-public-key') {
            return jsonResponse({ success: true, public_key: FAKE_VAPID_PUBLIC_KEY });
          }
          return buildFetchStub()(url, options);
        };
      }
    });
    await flushBoot();
    await delay(50);

    assert.strictEqual(
      pushFakes.registerCalls.length,
      1,
      'expected service worker (/sw.js) to be registered on page load'
    );
    assert.strictEqual(
      pushFakes.promptCalls.length,
      0,
      'story 16: loading the page must never request notification permission'
    );
  });

  await test('tapping a personal notification with an event_id marks it read AND navigates to that event', async () => {
    const dom = buildEnv({ loggedIn: true });
    let patchCalled = false;
    let getEventCalled = false;

    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = options.method || 'GET';
      if (requestPath === '/api/notifications' && method === 'GET') {
        return jsonResponse({
          success: true,
          notifications: [
            {
              id: 99,
              type: 'event_soon',
              title: 'تذكير بمناسبة قادمة',
              body: 'مناسبة آل فلان غداً',
              event_id: 123,
              is_read: false,
              created_at: '2026-09-08T08:00:00.000Z'
            }
          ]
        });
      }
      if (requestPath === '/api/notifications/99/read' && method === 'PATCH') {
        patchCalled = true;
        return jsonResponse({ success: true });
      }
      if (requestPath === '/api/events/123' && method === 'GET') {
        getEventCalled = true;
        return jsonResponse({
          success: true,
          event: {
            id: 123,
            title: 'فرح راني سلام',
            town: 'شقيب السلام',
            event_date: '2026-09-09',
            location_name: 'قاعة الأساطير'
          }
        });
      }
      return buildFetchStub()(url, options);
    };

    dom.window.toggleNotificationsPanel();
    await dom.window.fetchNotifications();

    const notifCard = dom.window.document.querySelector('#notificationsList .event-card');
    assert.ok(notifCard, 'expected notification card to be rendered');

    notifCard.click();
    await waitFor(() => patchCalled);
    assert.strictEqual(patchCalled, true, 'expected PATCH /api/notifications/99/read to be called');

    const modal = dom.window.document.getElementById('notificationsModal');
    await waitFor(() => modal.style.display === 'none');
    assert.strictEqual(modal.style.display, 'none', 'expected notifications modal to be closed upon tapping an event notification');

    await waitFor(() => getEventCalled, { timeout: 500 });
    assert.strictEqual(getEventCalled, true, 'expected GET /api/events/123 to be called to load missing event');

    const eventCard = dom.window.document.getElementById('eventCard-123');
    assert.ok(eventCard, 'expected eventCard-123 to be rendered in the DOM');
    assert.ok(
      dom.window.document.querySelector('#singleEventContainer #eventCard-123'),
      'expected eventCard-123 to be rendered in #singleEventContainer (FIX 6)'
    );
    assert.strictEqual(
      dom.window.document.querySelector('#eventsContainer #eventCard-123'),
      null,
      'eventsContainer must not be corrupted by out-of-feed notification navigation (FIX 6)'
    );
  });

  await test('adding a reminder requests notification permission, and removing one does not', async () => {
    let pushFakes;
    const dom = buildEnv({
      loggedIn: true,
      onBeforeEval: (w) => {
        pushFakes = installPushFakes(w);
      }
    });
    await flushBoot();

    const FAKE_VAPID_PUBLIC_KEY = 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
    let remindPostCalled = false;
    let remindDeleteCalled = false;
    let subscribeCalled = false;

    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = options.method || 'GET';
      if (requestPath === '/api/notifications/vapid-public-key') {
        return jsonResponse({ success: true, public_key: FAKE_VAPID_PUBLIC_KEY });
      }
      if (requestPath === '/api/events/77/remind' && method === 'POST') {
        remindPostCalled = true;
        return jsonResponse({ success: true, reminded: true });
      }
      if (requestPath === '/api/events/77/remind' && method === 'DELETE') {
        remindDeleteCalled = true;
        return jsonResponse({ success: true, reminded: false });
      }
      if (requestPath === '/api/notifications/subscribe' && method === 'POST') {
        subscribeCalled = true;
        return jsonResponse({ success: true });
      }
      return buildFetchStub()(url, options);
    };

    // First: removing a reminder (isReminded: true)
    await dom.window.toggleReminder(77, true, null);
    assert.strictEqual(remindDeleteCalled, true, 'expected DELETE /api/events/77/remind');
    assert.strictEqual(pushFakes.promptCalls.length, 0, 'removing a reminder must NOT prompt for notification permission');
    assert.strictEqual(subscribeCalled, false, 'removing a reminder must NOT call subscribe');

    // Second: adding a reminder (isReminded: false)
    await dom.window.toggleReminder(77, false, null);
    assert.strictEqual(remindPostCalled, true, 'expected POST /api/events/77/remind');
    await waitFor(() => pushFakes.promptCalls.length > 0);
    assert.strictEqual(pushFakes.promptCalls.length, 1, 'adding a reminder MUST prompt for notification permission');
    await waitFor(() => subscribeCalled);
    assert.strictEqual(subscribeCalled, true, 'adding a reminder with permission granted MUST subscribe');
  });

  await test('a null VAPID public key means no prompt, no subscribe call, and no visible error', async () => {
    let pushFakes;
    const dom = buildEnv({
      loggedIn: true,
      onBeforeEval: (w) => {
        pushFakes = installPushFakes(w);
      }
    });
    await flushBoot();

    let subscribeCalled = false;
    let toastCreated = false;
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = options.method || 'GET';
      if (requestPath === '/api/notifications/vapid-public-key') {
        // Operator has not generated a VAPID pair — the state of the platform today
        return jsonResponse({ success: true, public_key: null });
      }
      if (requestPath === '/api/events/88/remind' && method === 'POST') {
        return jsonResponse({ success: true, reminded: true });
      }
      if (requestPath === '/api/notifications/subscribe') {
        subscribeCalled = true;
        return jsonResponse({ success: true });
      }
      return buildFetchStub()(url, options);
    };

    const origAppendChild = dom.window.document.body.appendChild;
    dom.window.document.body.appendChild = function (node) {
      if (node && node.className === 'app-toast' && node.textContent.includes('خطأ')) {
        toastCreated = true;
      }
      return origAppendChild.call(this, node);
    };

    // Adding reminder when VAPID key is null
    await dom.window.toggleReminder(88, false, null);
    await delay(50);

    assert.strictEqual(pushFakes.promptCalls.length, 0, 'null VAPID key must never prompt for notification permission');
    assert.strictEqual(subscribeCalled, false, 'null VAPID key must never call subscribe');
    assert.strictEqual(toastCreated, false, 'null VAPID key must not show an error to the user');
  });

  await test('a successful subscribe POSTs the exact { endpoint, keys: { p256dh, auth } } shape', async () => {
    let pushFakes;
    const dom = buildEnv({
      loggedIn: true,
      onBeforeEval: (w) => {
        pushFakes = installPushFakes(w);
      }
    });
    await flushBoot();

    const FAKE_VAPID_PUBLIC_KEY = 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
    let subscribePayload = null;
    let subscribeAuthHeader = null;

    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = options.method || 'GET';
      if (requestPath === '/api/notifications/vapid-public-key') {
        return jsonResponse({ success: true, public_key: FAKE_VAPID_PUBLIC_KEY });
      }
      if (requestPath === '/api/events/99/remind' && method === 'POST') {
        return jsonResponse({ success: true, reminded: true });
      }
      if (requestPath === '/api/notifications/subscribe' && method === 'POST') {
        subscribePayload = JSON.parse(options.body);
        subscribeAuthHeader = options.headers && options.headers['Authorization'];
        return jsonResponse({ success: true });
      }
      return buildFetchStub()(url, options);
    };

    await dom.window.toggleReminder(99, false, null);
    await waitFor(() => subscribePayload !== null);

    assert.ok(subscribePayload, 'subscribe endpoint was called');
    assert.strictEqual(typeof subscribePayload.endpoint, 'string');
    assert.ok(subscribePayload.endpoint.startsWith('https://'));
    assert.ok(subscribePayload.keys, 'keys object must be present');
    assert.strictEqual(typeof subscribePayload.keys.p256dh, 'string');
    assert.strictEqual(typeof subscribePayload.keys.auth, 'string');
    assert.strictEqual(subscribeAuthHeader, 'Bearer test-token-web-dom', 'subscribe request must include auth token');
  });

  await test('the off control calls DELETE /api/notifications/subscribe and the displayed state changes', async () => {
    let pushFakes;
    const existingSub = {
      endpoint: 'https://push.example.test/sub/active-endpoint',
      keys: { p256dh: 'active-p256dh', auth: 'active-auth' },
      toJSON() { return { endpoint: this.endpoint, keys: { ...this.keys } }; },
      unsubscribe: async () => true
    };

    const dom = buildEnv({
      loggedIn: true,
      onBeforeEval: (w) => {
        pushFakes = installPushFakes(w, {
          initialPermission: 'granted',
          existingSubscription: existingSub
        });
      }
    });
    await flushBoot();

    const FAKE_VAPID_PUBLIC_KEY = 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
    let deleteCalled = false;
    let deleteBody = null;
    let deleteAuth = null;

    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = options.method || 'GET';
      if (requestPath === '/api/notifications/vapid-public-key') {
        return jsonResponse({ success: true, public_key: FAKE_VAPID_PUBLIC_KEY });
      }
      if (requestPath === '/api/notifications/subscribe' && method === 'DELETE') {
        deleteCalled = true;
        deleteBody = JSON.parse(options.body);
        deleteAuth = options.headers && options.headers['Authorization'];
        return jsonResponse({ success: true });
      }
      return buildFetchStub()(url, options);
    };

    // Open notifications panel
    dom.window.toggleNotificationsPanel();
    await waitFor(() => {
      const status = dom.window.document.getElementById('pushStatusText');
      return status && status.textContent === 'مفعّلة';
    });

    const statusVal = dom.window.document.getElementById('pushStatusText');
    const toggleBtn = dom.window.document.getElementById('togglePushNotificationsBtn');
    assert.strictEqual(statusVal.textContent, 'مفعّلة', 'status should initially be on');
    assert.strictEqual(toggleBtn.textContent, 'إيقاف الإشعارات', 'button should offer to turn off');

    // Click off control
    toggleBtn.click();
    await waitFor(() => deleteCalled);

    assert.strictEqual(deleteCalled, true, 'expected DELETE /api/notifications/subscribe to be called');
    assert.strictEqual(deleteBody.endpoint, 'https://push.example.test/sub/active-endpoint', 'DELETE body must match endpoint');
    assert.strictEqual(deleteAuth, 'Bearer test-token-web-dom', 'DELETE request must include auth token');

    await waitFor(() => statusVal.textContent === 'متوقفة');
    assert.strictEqual(statusVal.textContent, 'متوقفة', 'status must update to off');
    assert.strictEqual(toggleBtn.textContent, 'تفعيل', 'button must update to enable');
  });

  await test('tapping a broadcast marks it read through the broadcast endpoint and navigates nowhere', async () => {
    const dom = buildEnv({ loggedIn: true });
    let dismissCalled = false;
    let eventGetCalled = false;

    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = options.method || 'GET';
      if (requestPath === '/api/notifications' && method === 'GET') {
        return jsonResponse({
          success: true,
          notifications: [
            {
              broadcast_id: 88,
              type: 'broadcast',
              title: 'تعميم إداري',
              body: 'نص التعميم الإداري',
              tone: 'info',
              expires_at: null,
              is_read: false,
              created_at: '2026-09-08T08:00:00.000Z'
            }
          ]
        });
      }
      if (requestPath === '/api/broadcasts/88/dismiss' && method === 'PATCH') {
        dismissCalled = true;
        return jsonResponse({ success: true });
      }
      if (requestPath.startsWith('/api/events/')) {
        eventGetCalled = true;
        return jsonResponse({ success: false });
      }
      return buildFetchStub()(url, options);
    };

    dom.window.toggleNotificationsPanel();
    await dom.window.fetchNotifications();

    const broadcastCard = dom.window.document.querySelector('#notificationsList .event-card');
    assert.ok(broadcastCard, 'expected broadcast card to be rendered');

    broadcastCard.click();
    await waitFor(() => dismissCalled);
    assert.strictEqual(dismissCalled, true, 'expected PATCH /api/broadcasts/88/dismiss to be called');

    // Broadcast has no event: must NOT call GET /api/events/:id, must remain on current view
    await delay(50);
    assert.strictEqual(eventGetCalled, false, 'tapping a broadcast must never navigate or fetch an event');
  });

  await test('a browser with no serviceWorker/PushManager degrades silently and the page still works', async () => {
    // Default buildEnv has NO serviceWorker, NO PushManager, NO Notification
    const dom = buildEnv({ loggedIn: true });
    await flushBoot();

    // Opening notifications panel should not throw
    dom.window.toggleNotificationsPanel();

    const statusVal = dom.window.document.getElementById('pushStatusText');
    const toggleBtn = dom.window.document.getElementById('togglePushNotificationsBtn');

    assert.strictEqual(statusVal.textContent, 'غير مدعومة على هذا الجهاز');
    assert.strictEqual(toggleBtn.disabled, true);

    // Adding reminder should succeed and not crash
    let remindCalled = false;
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/events/101/remind' && options.method === 'POST') {
        remindCalled = true;
        return jsonResponse({ success: true, reminded: true });
      }
      return buildFetchStub()(url, options);
    };

    await dom.window.toggleReminder(101, false, null);
    assert.strictEqual(remindCalled, true, 'reminder toggle still works in unsupported browser');
  });

  await test('iOS Safari not installed shows Arabic line and does not prompt', async () => {
    let pushFakes;
    const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

    const dom = buildEnv({
      loggedIn: true,
      userAgent: IPHONE_UA,
      onBeforeEval: (w) => {
        pushFakes = installPushFakes(w);
      }
    });
    await flushBoot();

    let toastMessage = '';
    const origAppendChild = dom.window.document.body.appendChild;
    dom.window.document.body.appendChild = function (node) {
      if (node && node.className === 'app-toast') {
        toastMessage = node.textContent;
      }
      return origAppendChild.call(this, node);
    };

    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/events/102/remind' && options.method === 'POST') {
        return jsonResponse({ success: true, reminded: true });
      }
      return buildFetchStub()(url, options);
    };

    await dom.window.toggleReminder(102, false, null);
    await delay(50);

    assert.strictEqual(pushFakes.promptCalls.length, 0, 'must not prompt for permission on uninstalled iOS Safari');
    assert.ok(toastMessage.includes('iPhone') && toastMessage.includes('الشاشة الرئيسية'), 'must show Arabic line directing to home screen');
  });

  await test('after turning notifications off, adding a reminder does not re-subscribe (FIX 4, story 18)', async () => {
    let pushFakes;
    const existingSub = {
      endpoint: 'https://push.example.test/sub/active-endpoint-opt-out',
      keys: { p256dh: 'opt-p256dh', auth: 'opt-auth' },
      toJSON() { return { endpoint: this.endpoint, keys: { ...this.keys } }; },
      unsubscribe: async () => true
    };

    const dom = buildEnv({
      loggedIn: true,
      onBeforeEval: (w) => {
        pushFakes = installPushFakes(w, {
          initialPermission: 'granted',
          existingSubscription: existingSub
        });
      }
    });
    await flushBoot();

    const FAKE_VAPID_PUBLIC_KEY = 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
    let deleteCalled = false;
    let subscribeCalled = false;
    let remindCalled = false;

    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      const method = options.method || 'GET';
      if (requestPath === '/api/notifications/vapid-public-key') {
        return jsonResponse({ success: true, public_key: FAKE_VAPID_PUBLIC_KEY });
      }
      if (requestPath === '/api/notifications/subscribe' && method === 'DELETE') {
        deleteCalled = true;
        return jsonResponse({ success: true });
      }
      if (requestPath === '/api/notifications/subscribe' && method === 'POST') {
        subscribeCalled = true;
        return jsonResponse({ success: true });
      }
      if (requestPath === '/api/events/200/remind' && method === 'POST') {
        remindCalled = true;
        return jsonResponse({ success: true, reminded: true });
      }
      return buildFetchStub()(url, options);
    };

    // Open notifications panel and turn push off
    dom.window.toggleNotificationsPanel();
    await waitFor(() => {
      const status = dom.window.document.getElementById('pushStatusText');
      return status && status.textContent === 'مفعّلة';
    });

    const toggleBtn = dom.window.document.getElementById('togglePushNotificationsBtn');
    toggleBtn.click();
    await waitFor(() => deleteCalled);
    assert.strictEqual(deleteCalled, true, 'expected DELETE /api/notifications/subscribe');
    assert.strictEqual(dom.window.localStorage.getItem('negev_push_opt_out'), 'true', 'opt-out must be stored in localStorage');

    // Now, add a reminder to an event while opted out
    pushFakes.promptCalls.length = 0;
    await dom.window.toggleReminder(200, false, null);
    assert.strictEqual(remindCalled, true, 'reminder toggle must still succeed');
    assert.strictEqual(pushFakes.promptCalls.length, 0, 'must not prompt for notification permission while opted out');
    assert.strictEqual(subscribeCalled, false, 'after turning notifications off, adding a reminder does not re-subscribe');
  });

  await test('the deep-linked event survives the feed load instead of being wiped by it (FIX 5, story 14)', async () => {
    let getSingleEventCalled = false;
    let getFeedCalled = false;

    const dom = buildEnv({
      loggedIn: true,
      url: 'http://localhost/?event_id=456',
      onBeforeEval: (w) => {
        w.fetch = async (url, options = {}) => {
          const requestPath = String(url).split('?')[0];
          const method = options.method || 'GET';
          if (requestPath === '/api/events' && method === 'GET') {
            getFeedCalled = true;
            return jsonResponse({
              success: true,
              events: [
                { id: 101, title: 'مناسبة عادية في التغذية', town: 'رهط', event_date: '2026-09-15', location_name: 'قاعة الأساطير' }
              ],
              pagination: { page: 1, totalPages: 1 },
              announcements: []
            });
          }
          if (requestPath === '/api/events/456' && method === 'GET') {
            getSingleEventCalled = true;
            return jsonResponse({
              success: true,
              event: {
                id: 456,
                title: 'مناسبة الرابط العميق',
                town: 'عرعرة النقب',
                event_date: '2026-09-20',
                location_name: 'قاعة السلام'
              }
            });
          }
          return buildFetchStub()(url, options);
        };
      }
    });

    await flushBoot();

    await waitFor(() => getFeedCalled);
    await waitFor(() => getSingleEventCalled);

    // Deep-linked event must be present in DOM (rendered in #singleEventContainer)
    const deepLinkedCard = dom.window.document.getElementById('eventCard-456');
    assert.ok(deepLinkedCard, 'deep-linked event 456 must be rendered in DOM');
    assert.ok(
      dom.window.document.querySelector('#singleEventContainer #eventCard-456'),
      'deep-linked event 456 must be rendered inside #singleEventContainer'
    );

    // Feed event must also be present in #eventsContainer
    const feedCard = dom.window.document.getElementById('eventCard-101');
    assert.ok(feedCard, 'feed event 101 must remain intact in #eventsContainer');

    // eventsContainer must NOT contain event 456
    assert.strictEqual(
      dom.window.document.querySelector('#eventsContainer #eventCard-456'),
      null,
      'eventsContainer must not contain the out-of-feed deep-linked event'
    );

    // ?event_id= must be cleaned from the URL via replaceState
    assert.strictEqual(
      dom.window.location.search.includes('event_id='),
      false,
      'event_id query param must be cleared from URL after handling'
    );
  });

  await test('navigateToEvent uses behavior auto under prefers-reduced-motion or solemn tone (FIX 7, story 54)', async () => {
    const dom = buildEnv({ loggedIn: true });

    let lastScrollBehavior = null;
    const origGetElementById = dom.window.document.getElementById.bind(dom.window.document);
    dom.window.document.getElementById = (id) => {
      if (id === 'eventCard-777') {
        return {
          id: 'eventCard-777',
          classList: {
            contains: (cls) => cls === 'tone-mourning',
            add: () => {},
            remove: () => {}
          },
          scrollIntoView: (opts) => {
            lastScrollBehavior = opts && opts.behavior;
          }
        };
      }
      return origGetElementById(id);
    };

    await dom.window.navigateToEvent(777);
    assert.strictEqual(lastScrollBehavior, 'auto', 'solemn occasion card must scroll with auto behavior, never smooth');
  });

  await test('iOS install hint is not shown unbidden if already dismissed (FIX 3, story 17)', async () => {
    const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    let pushFakes;

    const dom = buildEnv({
      loggedIn: true,
      userAgent: IPHONE_UA,
      onBeforeEval: (w) => {
        pushFakes = installPushFakes(w);
      }
    });

    // Dismiss the hint
    dom.window.dismissInstallHint();
    assert.strictEqual(dom.window.localStorage.getItem('negev_install_hint'), 'dismissed');

    const sheet = dom.window.document.getElementById('installHint');
    sheet.hidden = true;

    // Adding reminder on iOS when dismissed must show toast but NOT reopen installHint sheet unbidden
    dom.window.fetch = async (url, options = {}) => {
      const requestPath = String(url).split('?')[0];
      if (requestPath === '/api/events/888/remind' && options.method === 'POST') {
        return jsonResponse({ success: true, reminded: true });
      }
      return buildFetchStub()(url, options);
    };

    await dom.window.toggleReminder(888, false, null);
    assert.strictEqual(sheet.hidden, true, 'installHint sheet must remain hidden when dismissed forever');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error('DOM smoke run crashed:', err);
  process.exit(1);
});
