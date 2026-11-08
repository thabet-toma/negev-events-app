'use strict';

/**
 * Service Worker for Negev Events / أعراسنا — two independent jobs that happen
 * to share one worker scope: Web Push (issue #85 batch 6c) and the offline
 * shell cache (issue #164). Self-contained and dependency-free; runs in the
 * worker scope.
 */

/* -------------------------------------------------------------------------
 * 1. كاش الهيكل (#164) — الصفحة وملفاتها المحلية وحدها
 * ---------------------------------------------------------------------- */

/**
 * رقم نسخة الكاش: **يُرفَع عند كل نشر**. `activate` يحذف كل كاش هيكل يحمل
 * غير هذا الاسم، فرفعُ الرقم وحده يُبطل ما خزّنه النشر السابق — ولا يبقى
 * ملف قديم يخدم طلباً بعد تحديث الموقع.
 *
 * و`175.1` لتقويم الشهر (تذكرة #175): `styles.css` و`app.js` يُخدمان من الكاش
 * أولاً (`cacheFirstShell`)، فبلا رفع الرقم يصل `index.html` الجديد (الشبكة
 * أولاً للتنقّل) بينما يخدم الكاشُ نسخةً قديمة منهما — تقويم بلا فلتر محافظة
 * وبلا نقاط ملوّنة، أي بالضبط ما بُنِي في التذكرة.
 */
const CACHE_VERSION = '175.1';
const CACHE_PREFIX = 'aarasna-shell-';
const SHELL_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;

/** مدخل الصفحة — بديل التنقّل حين تنقطع الشبكة. */
const SHELL_ENTRY = '/index.html';

/**
 * ملفات الهيكل الضرورية: الصفحة الواحدة وملفاتها المحلية. لا صور الخادم ولا
 * Cloudinary ولا أي CDN — كل ما هو من نطاق آخر يمرّ للمتصفّح ولا يُكاش إطلاقاً
 * (انظر `fetch` أدناه)، وهذه القائمة لا تحاكيه. وفشل تنزيل واحد منها **يُفشل
 * التثبيت** (انظر `install` أدناه): هيكل ناقص لا يُثبَّت.
 */
const SHELL_ESSENTIAL_PATHS = [
  '/index.html',
  '/styles.css',
  '/app.js',
  '/api.js',
  '/config.js',
  // نموذج المناسبة المحلي: app.js يستدعي `isoLocalDay` منه (web/index.html،
  // وسكربت الصفحة يُحمَّل قبله)، فإسقاطه من الهيكل يترك صفحة بلا نموذج نشر.
  '/occasionForm.js'
];

/**
 * أيقونات الهيكل الاختيارية: تزيّن الصفحة والمتصفّح ولا تبنيها. فشل تنزيلها
 * لا يُفشل التثبيت، بخلاف سكربت أو ملف نمط ناقص — والكاش وقت التشغيل يلتقط
 * الأيقونة عند أول طلب يصل بعد عودة الشبكة (انظر `cacheFirstShell`).
 */
const SHELL_OPTIONAL_PATHS = [
  '/icons/icon.svg',
  '/icons/favicon-32.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png'
];

/** مسارات الهيكل وقت التشغيل: ملفات الصفحة نفسها وأيقوناتها المحلية. */
const SHELL_PATH_PATTERN = /^\/(?:index\.html|styles\.css|app\.js|api\.js|config\.js|occasionForm\.js)$/;

function isShellAsset(pathname) {
  return SHELL_PATH_PATTERN.test(pathname) || pathname.startsWith('/icons/');
}

/**
 * التثبيت: تخزين الهيكل الضروري كاملاً ثم الاستيلاء الفوري. فشل تنزيل ملف
 * ضروري يُفشل التثبيت كلّه: لا `skipWaiting` ولا `activate`، فيبقى العامل
 * السابق يخدم كاشه الصالح. (كان `catch` لكل مسار يبتلع الفشل، فيستولي عاملٌ
 * بكاش ناقص ثم يحذف `activate` الكاش السليم — صفحة بلا `app.js` عند انقطاع
 * الشبكة. والكاش وقت التشغيل لا يغطّي ما لم يصل طلبه أصلاً.)
 * والاختياري (الأيقونات) يجوز أن يفشل وحده.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all([
        ...SHELL_ESSENTIAL_PATHS.map((path) => cache.add(path)),
        ...SHELL_OPTIONAL_PATHS.map((path) => cache.add(path).catch(() => {}))
      ]))
      .then(() => self.skipWaiting())
  );
});

/**
 * التنشيط: حذف كاش الهيكل القديم وحده (بالبادئة) قبل الاستيلاء على الصفحات
 * المفتوحة. لا يقع `activate` إلا بعد `install` ناجح، فالحذف هنا لا يطال آخر
 * كاش صالح: العامل الذي فشل تثبيته لا يصل إلى هنا، ويبقى سابقه يخدم نسخته.
 * وكاشات نطاق آخر غير هذه البادئة لا تُمسّ — البادئة هي حدّ ملكيتنا.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // ما ليس GET لا يُعترَض إطلاقاً — يُترك للمتصفّح كما هو.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // نطاق آخر (Cloudinary، خرائط، CDN، أو خادم على نطاق مختلف): لا كاش ولا تدخّل.
  if (url.origin !== self.location.origin) return;

  // **لا ردّ /api يُكاش ولا يُخدَم من الكاش، بأي حال.** بياناتها تخصّ
  // المستخدم وتتغيّر بكل طلب (وجلسة منتهية يجب أن تصل كـ401 لا كردّ محفوظ)،
  // فتُترك للشبكة دائماً — حتى لو كان المسار GET.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // الصفحة الواحدة '/' و'/index.html' فقط. أي تنقّل آخر (صفحات المشاركة
    // التي يولّدها الخادم) لا يخصّ الهيكل، فلا يُعترَض ولا يُخدَم بديلاً.
    if (url.pathname !== '/' && url.pathname !== SHELL_ENTRY) return;
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isShellAsset(url.pathname)) {
    event.respondWith(cacheFirstShell(request));
  }
});

/**
 * التنقّل أولاً من الشبكة — الصفحة جديدة عند كل فتح، والكاش بديل عند
 * الانقطاع وحده — وردّ الشبكة الصالح يُحفظ ليكون هو ذلك البديل.
 */
async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match(SHELL_ENTRY));
    return cached || Response.error();
  }
}

/**
 * ملفات الهيكل من الكاش أولاً — إبطالها برقم النسخة لا بكل طلب. `ignoreSearch`
 * لأن index.html يطلب `styles.css?v=2.8.3` والمخزَّن بلا `?v=` (قرار المالك:
 * الرقم لا يُرفع).
 */
async function cacheFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

/* -------------------------------------------------------------------------
 * 2. Web Push (issue #85 batch 6c) — كما هو
 * ---------------------------------------------------------------------- */

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: event.data.text() };
    }
  }

  const title = data.title || 'أعراسنا';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: {
      notification_id: data.notification_id || null,
      event_id: data.event_id || null,
      kind: data.kind || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const eventId = event.notification.data && event.notification.data.event_id;
  // «بدأ البث المباشر» بلا مناسبة — يفتح نافذة البث في الموقع (app.js، initUrlNavigation).
  const isLive = !eventId && event.notification.data && event.notification.data.kind === 'live_started';
  const targetPath = eventId ? ('/?event_id=' + eventId) : (isLive ? '/?live=1' : '/');
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then((focusedClient) => {
            const target = focusedClient || client;
            if (eventId && 'postMessage' in target) {
              target.postMessage({ type: 'NAVIGATE_EVENT', event_id: eventId });
            } else if (eventId && 'navigate' in target) {
              target.navigate(targetUrl);
            } else if (isLive && 'postMessage' in target) {
              target.postMessage({ type: 'OPEN_LIVE' });
            } else if (isLive && 'navigate' in target) {
              target.navigate(targetUrl);
            }
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
