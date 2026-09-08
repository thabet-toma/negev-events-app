// State Management
let allEvents = [];
let searchQuery = '';
let currentAudio = null;
let currentAudioBtn = null;
let currentChatEventId = null;
let currentChatEvent = null; // الحدث الكامل من فتح مودال التبريكات — يغذّي زرّ المشاركة (تذكرة #44)
let socket = null;
let stickerTheme = 'royal-gold';
let leafletMap = null;
let nokootChart = null;

// Publish-form location picker (#20 step 6)
let locationPickerMap = null;
let locationPickerMarker = null;
let pickerPinPlacedByUser = false;
let townCoordinates = {};
let townsList = [];
let villagesList = []; // من GET /api/towns (villages) — لا تُكرَّر في أي عميل (خريطة #21)
const NEGEV_NEUTRAL_CENTER = [31.2858, 34.8431];

// «القرى والتجمعات» — البند الجامع الوحيد الذي يطلب قرية إلزامية عند النشر
// تحته (services-directory spec). القيمة نفسها ثابتة في server/src/constants.js.
const VILLAGES_TOWN = 'القرى والتجمعات';

// Publish form — occasion type drives the rest of the form (#20 step 9)
let occasionTypesCache = null;
let selectedOccasionType = null;
let myEventsCache = [];

// Poster crop editor (Facebook-style) — the rectangle answers "what IS this
// image", not "how is it framed on any given surface"; display CSS elsewhere
// is untouched. Free aspect ratio, no rotation/zoom. All geometry lives in
// the working canvas's own pixel space, downscaled once on load so a 4000px
// phone photo never freezes the page.
let posterCropState = null;
const POSTER_CROP_MAX_DIMENSION = 1600; // longest edge cap on the exported crop
const POSTER_CROP_MIN_SIZE = 40; // smallest crop rectangle edge, in working-canvas pixels
const POSTER_CROP_MAX_EDITOR_WIDTH = 560; // fits a phone screen without CSS-scaling the canvas unpredictably

// Services directory tab (#31) — فئات مسطَّحة، قائمة أبجدية، بلا تقييمات
let servicesInitialized = false;
// Whether the publish form has actually been built. This is NOT the same
// question as "have occasion types been fetched": the browse tabs fetch them
// at startup, so keying the form's construction off that cache meant the form
// was never built at all and its spinner span forever.
let publishFormReady = false;
let serviceCategoriesCache = null;
let selectedServiceCategoryId = null; // null = "الكل"
let selectedServiceTown = '';
let serviceProvidersCache = [];
let servicesPage = 1;
let servicesPagination = null;
let currentProviderPhone = ''; // لا يظهر إلا بعد فعل تواصل صريح (#25)

// Read surface — tabs, pagination, archive, notifications, review queue (#20 step 10)
let currentPage = 1;
const EVENTS_PAGE_SIZE = 30;
let currentPagination = null;
let showArchive = false;

// Place & kind filter — رقاقة واحدة لكل منها تفتح ورقة بحث متعددة الاختيار،
// بدل شريطين زاحفين (#85 خطوة 40-46). البلدة والقرية يُختاران من قائمة واحدة
// لكنهما يُرسلان في معاملين منفصلين — الخادم يوحّدهما (union) لا يقاطعهما.
let selectedTowns = []; // أسماء بلدات، من TOWNS على الخادم
let selectedVillageIds = []; // معرّفات قرى رقمية
let selectedOccasionTypeIds = []; // معرّفات أنواع مناسبات رقمية
let filterSheetActiveKey = null; // 'place' أو 'kind' — أيّ ورقة فلترة مفتوحة الآن (ورقة واحدة في كل لحظة)
let filterSheetDraft = []; // رموز {kind, id} داخل الورقة المفتوحة فقط — لا تُطبَّق إلا بزرّ «تطبيق»
let eventsFeedFirstLoadDone = false; // ظهور متدرّج للشاشة الأولى فقط (#85 خطوة 54)
let notificationsList = [];
let congratsQueueEventId = null;

// News ticker (#85 خطوة 28-33) — الحيّ من GET /api/broadcasts/live، مرتّباً
// بالأحدث أولاً كما يعيده الخادم. tickerExpanded توسيع قائمة البقيّة في مكانها
// لزائر مجهول فقط (المسجَّل دخوله يفتح مركز الإشعارات بدلاً منه).
// tickerTextExpanded مستقلّة عنها تماماً: عرض نصّ الصفّ الأساسي كاملاً بلا قصّ،
// للمسجَّل دخوله وللمجهول معاً (مراجعة #85، FIX 1).
let liveBroadcasts = [];
let tickerExpanded = false;
let tickerTextExpanded = false;
let tickerPrimaryBroadcastId = null;

// المصدر الحقيقي الوحيد لهذا التعداد هو تعليق عمود broadcasts.tone في
// server/src/db/schema.sql — لا استيراد ممكن هنا (web/ بلا خطوة بناء)، فهذه
// نسخة يدوية واحدة معرَّفة مرّة، لا نسخة إضافية متفرّقة (مراجعة #85، FIX 7).
const BROADCAST_TONES = ['info', 'urgent', 'solemn'];

// رقم الدعم الفني من GET /api/settings/public (#85 خطوة 34-35، 39) — null يعني
// لم يُضبط بعد، وهي الحالة الافتراضية اليوم.
let supportWhatsappNumber = null;

// Story viewer (#20 step 18) — the strip's own stories list, plus the
// viewer's playback state; opened by index into this same array.
let allStories = [];
let storyViewerIndex = 0;
let storyViewerElapsedMs = 0;
let storyViewerViewRecorded = false;
let storyViewerPaused = false;
let storyViewerLastTickTs = 0;
let storyViewerRafId = null;
let storyViewerDeviceId = null;

// Write actions (publish, congratulate) require login; browsing never does.
// Set right before openAuthModal() so a successful login/register can pick
// back up exactly what the visitor was trying to do (#20 step 9).
let pendingIntent = null;

// Auth State
let currentUser = JSON.parse(localStorage.getItem('negev_user') || 'null');
let authToken = localStorage.getItem('negev_token') || null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initErrorTracking();
  initSocket();
  loadFilterSelectionFromStorage();
  updateAuthUI();
  initPlaceFilter();
  initKindFilter();
  initAppDownload();
  initInstallHint();
  fetchNotifications();
  fetchLiveBroadcasts();
  initSupportEntry();
  initNotificationsPush();
  initServiceWorker();
  initUrlNavigation();
  initFeedScroller();
  fetchEvents();
  fetchStories();
  renderStickerCanvas();

  const today = new Date().toISOString().split('T')[0];

  const nokootDateInput = document.getElementById('nokootDate');
  if (nokootDateInput) nokootDateInput.value = today;
});

// -1. Light/dark theme — data-theme on <html>, persisted in localStorage.
// Absence of a saved choice means "follow the system" (#20 step 11): styles.css
// already reacts to prefers-color-scheme on its own, so with nothing stored we
// simply never set data-theme and let that media query decide.
function initTheme() {
  const saved = localStorage.getItem('negev_theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  updateThemeToggleIcon();
}

function toggleTheme() {
  const isDark = currentThemeIsDark();
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('negev_theme', next);
  updateThemeToggleIcon();
}

function currentThemeIsDark() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (icon) icon.className = currentThemeIsDark() ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// -0.5. Error tracking (Sentry) — مُوصَّل لكن نائم (تذكرة #44)
//
// الخادم الذاتي المستضاف لتلقّي هذه التقارير لم يُنشر بعد (خادم الإنتاج
// بمعالج واحد وswap ممتلئة أصلاً)، فـ errorDsn في config.js فارغ افتراضياً.
// فارغ ⇒ لا سكربت يُحقَن، لا اتصال، لا تكلفة — الشرط أدناه هو كل ما يحول
// دون ذلك. لا بيانات شخصية أبداً (لا معرّف مستخدم، لا هاتف، لا اسم) — لم
// نستدعِ Sentry.setUser في أي مكان، وsendDefaultPii مضبوطة صراحةً false.
// غير مربوط بمفتاح رفض التحليلات (analytics_opt_out) عمداً: تقرير عطل لا
// يحمل هوية شخص بالتصميم، فهو خارج سؤال الموافقة من الأساس.
//
// ⚠️ انحراف مقصود عن CLAUDE.md («المكتبات الخارجية: كلها عبر CDN في
// index.html»): وسم ثابت هناك كان سيحمّل المكتبة على كل زائر وفي كل تحميل
// صفحة، ويفتح اتصالاً بطرف ثالث، **بلا أي فائدة ما دام الـDSN فارغاً** —
// أي كلفة على الجميع مقابل صفر. علّة القاعدة (لا خطوة بناء ولا bundler)
// محفوظة كاملةً هنا: وسم script عادي، بإصدار مثبَّت، بلا أي أداة.
function initErrorTracking() {
  const cfg = window.NEGEV_CONFIG || {};
  const dsn = cfg.errorDsn;
  if (!dsn) return;

  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/7.120.3/bundle.min.js'; // إصدار مثبَّت دائماً — لا "latest"
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    if (!window.Sentry) return;
    window.Sentry.init({
      dsn,
      release: cfg.releaseVersion || undefined,
      sendDefaultPii: false
    });
  };
  document.head.appendChild(script);
}

// -0.4. Analytics — the client half (تذكرة #44)
//
// نسجّل ما يفعله المستخدم، لا ما يقرأه — القائمة مغلقة ويملكها الخادم
// (server/src/constants.js ANALYTICS_EVENTS)، واسم خارجها يُرفَض هناك. نداء
// صامت تماماً: فشله لا يُزعج المستخدم ولا يوقف أي شيء يفعله — ولهذا لا
// await على استدعائه في أي مكان.
//
// معرّف الجهاز نفسه المستعمل أصلاً لمشاهدات/نقرات القصص (negev_device_id) —
// عشوائي بحت، لا يُشتقّ من أي شيء يخصّ الشخص، ونفس السبب بالضبط: تمييز جهاز
// غير مسجَّل لا معرفة من هو. رقم واحد لكل جهاز يكفي، فلا داعي لمفتاح ثانٍ.
function getDeviceId() {
  return getStoryDeviceId();
}

/**
 * يرفق رمز الدخول فقط عند تسجيل الدخول (نفس نمط auth:true في كل الملف) —
 * ويعمل أيضاً بلا تسجيل دخول لأن apiFetch لا يرفق شيئاً حين لا يوجد رمز.
 * content_town دائماً بلدة المناسبة موضوع الفعل، لا بلدة المستخدم نفسه —
 * هذا هو الفارق الذي يحفظه القرار كله (README الخادم، ANALYTICS_EVENTS).
 */
function recordAnalyticsEvent(eventName, { contentTown } = {}) {
  try {
    apiFetch('/api/analytics/events', {
      auth: true,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        platform: 'web',
        device_id: getDeviceId(),
        content_town: contentTown || undefined
      })
    }).catch(() => {});
  } catch (e) {
    // لا شيء — هذا النداء لا يجوز أن يزعج المستخدم أبداً مهما فشل.
  }
}

/**
 * يميّز فشل نشر بسبب الصورة/الملف عن أي فشل نشر آخر — لا كود خطأ مخصَّص
 * يرجعه الخادم، فقط نص الرسالة الذي يبنيه بالضبط server/src/middleware/error.js
 * لأخطاء multer الثلاثة (حجم الملف، النوع غير المدعوم، أو خطأ رفع عام).
 * إن تغيّرت تلك الرسائل يوماً يفقد هذا التمييز دقّته لا أكثر — النشر نفسه لا
 * يتأثر، فالفشل يُسجَّل حينها كـpublish_failed العام بدل image_upload_failed.
 */
function isMediaUploadErrorMessage(message) {
  if (!message) return false;
  return message.includes('حجم الملف') || message.includes('نوع الملف غير مدعوم') || message.includes('خطأ في رفع الملف');
}

// 0. Android app download entry
//
// كل الحقائق تأتي من ‎GET /api/app/version‎ — الرابط والإصدار — والحجم من
// ترويسة الملف نفسه. لا شيء مثبَّت هنا، فإصدار نسخة جديدة يبقى تغيير متغيّر
// بيئة على الخادم دون لمس الواجهة.
async function initAppDownload() {
  const btn = document.getElementById('appDownloadBtn');
  if (!btn) return;

  // ملف APK لا يعمل على iOS إطلاقاً. عرضه لمستخدم آيفون وعدٌ كاذب، فنخفيه.
  // على سطح المكتب نُبقيه: الزائر قد ينزّله لينقله إلى هاتفه، ووسم «أندرويد»
  // في النص يمنع اللبس.
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return;

  try {
    const res = await apiFetch('/api/app/version');
    if (!res.ok) return;

    const data = await res.json();
    // الإعلان معطَّل (متغيرات فارغة) → لا يظهر شيء. لا زر بلا وجهة.
    if (!data.success || !data.apk_url) return;

    btn.href = data.apk_url;
    btn.title = data.latest_version
      ? `تطبيق مناسبات النقب — الإصدار ${data.latest_version}`
      : 'تطبيق مناسبات النقب لأجهزة أندرويد';

    const size = await fetchDownloadSize(data.apk_url);
    if (size) {
      const label = document.getElementById('appDownloadSize');
      label.textContent = size;
      label.hidden = false;
    }

    btn.hidden = false;
  } catch (e) {
    // الخادم متوقف أو النداء فشل: الزائر لا يرى زراً ولا خطأ.
    console.debug('App download entry unavailable:', e);
  }
}

/**
 * إرشاد التثبيت على iOS — الوجه الآخر لـ`initAppDownload` أعلاه.
 *
 * زرّ التحميل يختفي على الآيفون لأن ملف APK لا يعمل هناك، فيبقى مستخدم الآيفون
 * بلا أي مسار تطبيق. وهذا مساره الوحيد: iOS لا يعرض أي مُحفِّز تثبيت — لا
 * `beforeinstallprompt` ولا مكافئ له (#54) — فلا يوجد زرّ «ثبّت» يمكن برمجته،
 * والشرح اليدوي خيارٌ وحيد لا خيارٌ كسول.
 *
 * ويُصرَف مرة واحدة إلى الأبد: من أغلقه لا يُزعَج به ثانيةً.
 */
/** كشف جهاز iOS (آيفون أو آيباد بما في ذلك iPadOS 13+) */
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** هل الموقع يعمل في وضع التثبيت المستقل (PWA) */
function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return (window.navigator && window.navigator.standalone === true)
    || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

/** هل متصفح Safari على iOS والموقع غير مثبت على الشاشة الرئيسية بعد (قصة 17) */
function isIOSSafariNotInstalled() {
  return isIOSDevice() && !isStandaloneMode();
}

/** فحص هل صرف المستخدم إرشاد التثبيت إلى الأبد */
function isInstallHintDismissed() {
  try {
    return localStorage.getItem('negev_install_hint') === 'dismissed';
  } catch (e) {
    return false;
  }
}

function initInstallHint() {
  const sheet = document.getElementById('installHint');
  if (!sheet) return;
  if (!isIOSSafariNotInstalled()) return;
  if (isInstallHintDismissed()) return;

  sheet.hidden = false;
}

/** صرف الإرشاد — يُستدعى من الزر في index.html. */
function dismissInstallHint() {
  const sheet = document.getElementById('installHint');
  if (sheet) sheet.hidden = true;
  try {
    localStorage.setItem('negev_install_hint', 'dismissed');
  } catch (e) {
    // لا شيء يُحفظ في التصفّح الخاص، والصرف يبقى نافذاً لهذه الجلسة على الأقل.
  }
}

/** حجم الملف من ترويسة HEAD — يعود فارغاً بهدوء إن تعذّر. */
async function fetchDownloadSize(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const bytes = parseInt(res.headers.get('content-length'), 10);
    if (!bytes || Number.isNaN(bytes)) return '';
    return `${Math.round(bytes / (1024 * 1024))} م.ب`;
  } catch (e) {
    return '';
  }
}

// 1. Socket.io Realtime Setup
function initSocket() {
  try {
    socket = io(API_BASE || undefined);
    socket.on('new_event_created', (data) => {
      showToast(`🎉 تم نشر مناسبة جديدة في ${data.town}: ${data.title}`);
      fetchEvents();
    });

    // بثّ عام (كل المستخدمين) — الحمولة تحمل نصاً فعلاً، لكن لا معرّف
    // (`id`) يسمح بإغلاقه لاحقاً، فنعيد الجلب من GET /api/broadcasts/live
    // دائماً لنحصل على الصفّ كاملاً بدل تركيب واحد ناقص من الحمولة (#85 خطوة 28).
    socket.on('system_broadcast', () => {
      fetchLiveBroadcasts();
    });

    // بثّ بلدة — الحمولة بلا عنوان ولا نص عمداً (القناة بلا غرف، تصل كل
    // عميل متصل)؛ نتجاهلها ونعيد الجلب دائماً، بنفس انضباط قناة الإشعارات
    // أعلاه (#85 خطوة 28-31).
    socket.on('town_broadcast', () => {
      fetchLiveBroadcasts();
    });

    subscribeToNotificationSocket();
  } catch (e) {
    console.log('Socket initialization note:', e);
  }
}

/**
 * قناة الإشعارات بمعرّف المستخدم لا معرّف المناسبة — تُبثّ فقط لمن كان متصلاً
 * فعلاً تلك اللحظة (#20 step 7). تُستدعى عند تحميل الصفحة (إن كان الحساب
 * محفوظاً في localStorage) وبعد كل دخول/تسجيل ناجح.
 */
function subscribeToNotificationSocket() {
  if (!socket || !currentUser) return;
  socket.off(`new_notification_${currentUser.id}`);
  // الحمولة هنا بلا عنوان ولا نص عمداً (issue #85 دفعة 3) — القناة بلا غرف
  // وتصل كل عميل متصل، فأي نصّ فيها كان سيُسرَّب. نتجاهلها ونعيد جلب القائمة
  // نفسها دائماً، تماماً كما يفعل تطبيق الموبايل (events_screen.dart)، ولا
  // نُنبِّه إلا بعد وصول محتوًى حقيقي من الخادم.
  socket.on(`new_notification_${currentUser.id}`, async () => {
    await fetchNotifications();
    const latest = notificationsList[0];
    if (latest) showToast(`🔔 ${latest.title}`);
  });
}

// 1.5 News ticker (#85 خطوة 28-33) — أثر دائم تحت الترويسة، غير ملتصق وبلا
// زحف. يظهر عند فتح الصفحة من GET /api/broadcasts/live مباشرة، لا فقط عند
// إشارة socket (قصة 28)، فيراه أيضاً من سجّل بعد بثّ التعميم (قصة 32) —
// الخادم يستثني المنتهي والمُغلَق أصلاً ولا تُعاد فلترته هنا.

const DISMISSED_BROADCASTS_KEY = 'negev_dismissed_broadcasts';
const DISMISSED_BROADCASTS_CAP = 50; // سقف بسيط كي لا ينمو التخزين بلا حدّ

/** إغلاق الشريط للزائر المجهول — الخادم بلا كوكيز ولا هوية مجهولة يُبنى عليها صفّ (قصة 29). */
function getLocallyDismissedBroadcastIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_BROADCASTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function rememberBroadcastDismissedLocally(broadcastId) {
  try {
    const ids = getLocallyDismissedBroadcastIds();
    if (!ids.includes(broadcastId)) ids.push(broadcastId);
    while (ids.length > DISMISSED_BROADCASTS_CAP) ids.shift();
    localStorage.setItem(DISMISSED_BROADCASTS_KEY, JSON.stringify(ids));
  } catch (e) {
    // تصفّح خاص أو تخزين ممتلئ — الإغلاق يبقى نافذاً لهذه الجلسة على الأقل.
  }
}

function isBroadcastDismissedLocally(broadcastId) {
  return getLocallyDismissedBroadcastIds().includes(broadcastId);
}

async function fetchLiveBroadcasts() {
  try {
    // auth:true يرفق الرمز إن وُجد فقط (apiFetch)، فيعمل بلا تسجيل دخول
    // أيضاً — والمسار نفسه optionalAuthenticate على الخادم.
    const res = await apiFetch('/api/broadcasts/live', { auth: true });
    const data = await res.json();
    if (data.success) {
      liveBroadcasts = data.broadcasts || [];
      renderBroadcastTicker();
    }
  } catch (e) {
    console.error('Broadcasts error:', e);
  }
}

/**
 * صفّ نصّ واحد (عنوان + رسالة) — المكان الوحيد الذي يبنيه، يستعمله الصفّ
 * الأساسي (بمعرّفين لعناصره) وكل صفّ في القائمة الموسَّعة (بلا معرّفات) معاً
 * (مراجعة #85، FIX 6). عبر `textContent` لا `innerHTML` — نفس تحصين XSS الذي
 * كان قائماً، بلا حاجة إلى `escapeHtml` هنا لأنه غير وارد إطلاقاً.
 */
function buildTickerTextRow(title, message, ids) {
  const wrap = document.createElement('div');
  wrap.className = 'ticker-text';

  const strong = document.createElement('strong');
  if (ids) strong.id = ids.titleId;
  strong.textContent = title || '';

  const span = document.createElement('span');
  if (ids) span.id = ids.messageId;
  span.textContent = message || '';

  wrap.appendChild(strong);
  wrap.appendChild(span);
  return wrap;
}

/**
 * الأحدث وحده يُعرَض، و«+N» تفتح الباقي — مركز الإشعارات لمن سجّل دخوله
 * (نفس الطابور الذي يدمج التعاميم فعلاً)، أو توسيع الشريط في مكانه لزائر
 * مجهول (قصة 31). فلتر الإغلاق المحلي يُطبَّق دائماً بلا شرط تسجيل الدخول
 * (مراجعة #85، FIX 2ب) — تعميم أغلقه هذا الشخص وهو زائر يجب ألّا يعود له على
 * نفس الجهاز بعد أن يسجّل دخوله. المُغلَق محلياً يُستبعد من العرض هنا فقط —
 * لا يُحذف من liveBroadcasts نفسها لأن معرّف مركز الإشعارات لاحقاً (#85
 * دفعة 6ج) قد يحتاجها كاملة.
 */
function renderBroadcastTicker() {
  const el = document.getElementById('broadcastTicker');
  if (!el) return;

  const visible = liveBroadcasts.filter(b => !isBroadcastDismissedLocally(b.id));

  if (!visible.length) {
    el.hidden = true;
    tickerPrimaryBroadcastId = null;
    tickerExpanded = false;
    tickerTextExpanded = false;
    return;
  }

  const primary = visible[0];
  const rest = visible.slice(1);
  tickerPrimaryBroadcastId = primary.id;

  el.hidden = false;
  const tone = BROADCAST_TONES.includes(primary.tone) ? primary.tone : 'info';
  // النبض اللطيف حصراً لنغمة «عاجل» — الوقور لا يتحرك أبداً بأي حال (قصة 27، 33).
  el.className = `broadcast-ticker tone-${tone}`
    + (tone === 'urgent' ? ' ticker-urgent-pulse' : '')
    + (tickerTextExpanded ? ' ticker-text-expanded' : '');

  const textArea = document.getElementById('tickerTextArea');
  if (textArea) {
    textArea.innerHTML = '';
    textArea.appendChild(buildTickerTextRow(primary.title, primary.message, { titleId: 'tickerTitle', messageId: 'tickerMessage' }));
  }

  const expandTextBtn = document.getElementById('tickerExpandTextBtn');
  if (expandTextBtn) {
    expandTextBtn.setAttribute('aria-expanded', String(tickerTextExpanded));
    const icon = expandTextBtn.querySelector('i');
    if (icon) icon.className = tickerTextExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
  }

  const moreBtn = document.getElementById('tickerMoreBtn');
  const moreCount = document.getElementById('tickerMoreCount');
  if (moreBtn && moreCount) {
    if (rest.length) {
      moreBtn.hidden = false;
      moreCount.textContent = String(rest.length);
    } else {
      moreBtn.hidden = true;
      tickerExpanded = false;
    }
  }

  const expandedList = document.getElementById('tickerExpandedList');
  if (expandedList) {
    if (tickerExpanded && rest.length) {
      expandedList.hidden = false;
      expandedList.innerHTML = '';
      rest.forEach(b => {
        const item = document.createElement('div');
        item.className = 'ticker-expanded-item';
        item.appendChild(buildTickerTextRow(b.title, b.message));

        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'ticker-dismiss-btn';
        dismissBtn.setAttribute('aria-label', 'إغلاق التعميم');
        dismissBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        dismissBtn.addEventListener('click', () => dismissBroadcastById(b.id));
        item.appendChild(dismissBtn);

        expandedList.appendChild(item);
      });
    } else {
      expandedList.hidden = true;
      expandedList.innerHTML = '';
    }
  }
}

/**
 * سطر النصّ الأساسي مقصوص سطراً واحداً افتراضياً (هذا هو معنى الشريط) — هذا
 * الزرّ يفتحه كاملاً بلا قصّ، للمسجَّل دخوله وللزائر المجهول معاً؛ مستقلّ عن
 * وجود «+N» تماماً (مراجعة #85، FIX 1: تعميم واحد فقط بلا أي بقيّة كان بلا أي
 * وسيلة لقراءته كاملاً). لا يحرّك شيئاً — تبديل خاصية CSS فقط.
 */
function toggleTickerTextExpanded() {
  tickerTextExpanded = !tickerTextExpanded;
  renderBroadcastTicker();
}

/**
 * «+N» — مركز الإشعارات لمن سجّل دخوله، توسيع الشريط في مكانه لغيره (قصة 31).
 * يُعاد جلب مركز الإشعارات أولاً (مراجعة #85، FIX 3) — بلا ذلك يمكن أن يحمل
 * «+N» عدداً وصل بعد آخر جلب بينما يفتح مركزاً لا يزال يعرض القائمة القديمة.
 */
async function handleTickerMoreClick() {
  if (currentUser && authToken) {
    await fetchNotifications();
    toggleNotificationsPanel();
    return;
  }
  tickerExpanded = !tickerExpanded;
  renderBroadcastTicker();
}

/** إغلاق التعميم المعروض حالياً (الأحدث) — زرّ الإغلاق الرئيسي على الشريط. */
function dismissActiveBroadcast() {
  if (tickerPrimaryBroadcastId != null) dismissBroadcastById(tickerPrimaryBroadcastId);
}

/**
 * مسجَّل دخوله → PATCH يُذكَر عبر الأجهزة؛ مجهول → localStorage محلي بحت
 * (قصة 29). الإزالة من liveBroadcasts فورية في الحالتين حتى لا ينتظر
 * الشريط جولة شبكة قبل أن يختفي التعميم المُغلَق.
 */
async function dismissBroadcastById(broadcastId) {
  liveBroadcasts = liveBroadcasts.filter(b => b.id !== broadcastId);
  renderBroadcastTicker();

  if (currentUser && authToken) {
    try {
      await apiFetch(`/api/broadcasts/${broadcastId}/dismiss`, { method: 'PATCH', auth: true });
    } catch (e) {
      console.error('Dismiss broadcast error:', e);
    }
  } else {
    rememberBroadcastDismissedLocally(broadcastId);
  }
}

// 1.6 زرّ الدعم الفني (#85 خطوة 34-35، 39) — يفتح واتساب على الرقم من
// GET /api/settings/public، برقم كما يعيده الخادم حرفياً («972XXXXXXXXX» بلا
// «+») بلا أي إعادة تهيئة هنا؛ wa.me يقبله كما هو.
async function initSupportEntry() {
  try {
    const res = await apiFetch('/api/settings/public');
    const data = await res.json();
    if (data.success && data.settings) {
      supportWhatsappNumber = data.settings.support_whatsapp_number || null;
    }
  } catch (e) {
    console.error('Support settings error:', e);
  } finally {
    updateSupportButtonState();
  }
}

/** يبقى الزرّ ظاهراً دائماً بعد وصول الاستجابة — معطَّلاً بصرياً لا مخفياً حين لا رقم محفوظ، كي لا يصير طرفاً ميتاً بلا تفسير. */
function updateSupportButtonState() {
  const btn = document.getElementById('supportBtn');
  if (!btn) return;
  const configured = !!supportWhatsappNumber;
  btn.hidden = false;
  btn.classList.toggle('support-btn-disabled', !configured);
  btn.title = configured ? 'الدعم الفني عبر واتساب' : 'الدعم الفني غير مُفعَّل بعد';
}

/**
 * سطر إفصاح واحد قبل الفتح (قصة 35) — مودال الصفحة نفسه لا `confirm()`
 * المتصفّح (مراجعة #85، FIX 5): حوار المتصفّح الأصلي يرسم اتجاهه وأزراره من
 * لغة المتصفّح لا الصفحة، فيظهر LTR بزرّي "OK/Cancel" فوق صفحة عربية RTL.
 * رقم بلا تهيئة يُفتح بنفس هوية المودال — رسالة وزرّ واحد، لا `alert()`.
 */
function handleSupportClick() {
  const text = document.getElementById('supportModalText');
  const confirmActions = document.getElementById('supportModalConfirmActions');
  const okActions = document.getElementById('supportModalOkActions');
  if (!text || !confirmActions || !okActions) return;

  if (!supportWhatsappNumber) {
    text.textContent = 'الدعم الفني غير مُفعَّل بعد على المنصّة — حاول لاحقاً';
    confirmActions.hidden = true;
    okActions.hidden = false;
  } else {
    text.textContent = 'سيرى فريق الدعم الفني رقم هاتفك عند فتح واتساب — هل تريد المتابعة؟';
    confirmActions.hidden = false;
    okActions.hidden = true;
  }
  document.getElementById('supportModal').style.display = 'flex';
}

/** زرّ «متابعة إلى واتساب» في المودال — الرقم كما وصل من الخادم حرفياً، بلا أي إعادة تهيئة. */
function confirmSupportWhatsappOpen() {
  closeSupportModal();
  if (supportWhatsappNumber) window.open(`https://wa.me/${supportWhatsappNumber}`, '_blank', 'noopener');
}

function closeSupportModal() {
  const modal = document.getElementById('supportModal');
  if (modal) modal.style.display = 'none';
}

// 2. Stories / Snaps Loader
async function fetchStories() {
  try {
    const res = await apiFetch('/api/stories');
    const data = await res.json();
    const container = document.getElementById('storiesContainer');

    if (data.success && data.stories) {
      allStories = data.stories;
      container.innerHTML = allStories.map((s, i) => `
        <div class="story-item" onclick="openStoryViewer(${i})">
          <div class="story-avatar-ring ${s.isLive ? 'live' : ''}">
            <img src="${s.image}" class="story-avatar-img" alt="${escapeHtml(s.title)}">
          </div>
          <span class="story-title">${escapeHtml(s.title)}</span>
        </div>
      `).join('');
      updateFeedDimensions();
    }
  } catch (e) {
    console.error('Stories error:', e);
  }
}

// 2.5 Story Viewer (#20 step 18) — full-screen viewer opened from the strip
// above. Explicit prev/next/close controls, not implicit tap zones — a
// deliberate deviation from touch conventions for a mouse-driven UI (README,
// "الويب": أسهم وزرّ إغلاق صريحة). Matches
// mobile/lib/screens/story_viewer_screen.dart's behaviour, not its gestures.

// السقف الاحتياطي الوحيد لمدة الشريحة — يُستعمل فقط حين لا يرسل الخادم
// slide_duration_seconds لهذه القصة تحديداً؛ الرقم الحقيقي يأتي من الخادم
// دائماً (README: «مدة الشريحة تخرج من الخادم … حتى لا تُنسَخ كرقم ثابت»).
const STORY_FALLBACK_SLIDE_MS = 5000;

// عتبة «شوهدت» (README، جدول الستوريات؛ stories.routes.js): ثانيتان تُقاس
// على جهاز المشاهد لا الخادم. تُقاس من نفس ساعة التقدّم (storyViewerElapsedMs)
// لا مؤقّت ثانٍ منفصل، فتتوقّف تلقائياً مع الضغط المطوّل أو تبويب مخفي —
// نفس مبدأ الموبايل (`_onTick` في story_viewer_screen.dart).
const STORY_WATCHED_THRESHOLD_MS = 2000;

/**
 * معرّف عشوائي بحت لتمييز جهاز غير مسجَّل بين مشاهدتين — لا يُشتقّ من أي
 * بصمة متصفّح (لا user-agent، لا مقاسات شاشة، لا canvas fingerprint)، بنفس
 * سبب mobile/lib/state/device_id_store.dart: المطلوب تمييز مشاهدَين لا
 * معرفة من هو. يُولَّد مرّة واحدة عبر crypto.randomUUID (أو
 * crypto.getRandomValues احتياطاً) ويُحفظ في localStorage.
 */
function getStoryDeviceId() {
  if (storyViewerDeviceId) return storyViewerDeviceId;
  let id = localStorage.getItem('negev_device_id');
  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('negev_device_id', id);
  }
  storyViewerDeviceId = id;
  return id;
}

function openStoryViewer(index) {
  if (!allStories.length) return;
  storyViewerIndex = index;
  storyViewerPaused = false;
  document.getElementById('storyViewerOverlay').style.display = 'flex';
  document.addEventListener('keydown', handleStoryViewerKeydown);
  document.addEventListener('visibilitychange', handleStoryViewerVisibilityChange);
  renderStoryProgressBars();
  startStorySlide();
}

function closeStoryViewer() {
  document.getElementById('storyViewerOverlay').style.display = 'none';
  if (storyViewerRafId) cancelAnimationFrame(storyViewerRafId);
  storyViewerRafId = null;
  storyViewerPaused = false;
  document.removeEventListener('keydown', handleStoryViewerKeydown);
  document.removeEventListener('visibilitychange', handleStoryViewerVisibilityChange);
}

function renderStoryProgressBars() {
  document.getElementById('storyProgressRow').innerHTML = allStories
    .map(() => '<div class="story-progress-bar"><div class="story-progress-fill"></div></div>')
    .join('');
}

/** يبدأ (أو يعيد بدء) الشريحة الحالية — يصفّر ساعة التقدّم ويحدّث كل ما يُعرض. */
function startStorySlide() {
  const story = allStories[storyViewerIndex];
  storyViewerElapsedMs = 0;
  storyViewerViewRecorded = false;
  storyViewerLastTickTs = performance.now();

  const img = document.getElementById('storyViewerImage');
  img.src = story.image || '';
  img.alt = story.title || '';
  document.getElementById('storyViewerTitle').textContent = story.title || '';
  document.getElementById('storyViewerSubtitle').textContent = [story.clan, story.town].filter(Boolean).join(' · ');
  document.getElementById('storyViewerAdBadge').hidden = !story.is_ad;

  renderStoryFooter(story);
  updateStoryProgressBarsForIndex();

  if (storyViewerRafId) cancelAnimationFrame(storyViewerRafId);
  storyViewerRafId = requestAnimationFrame(tickStorySlide);
}

/** فصل الإعلان ثلاث طبقات (README): شارة «إعلان» (في الرأس)، اسم المعلن حرفياً هنا، وزرّ الإبلاغ. */
function renderStoryFooter(story) {
  const footer = document.getElementById('storyViewerFooter');
  const hasTarget = isSafeHttpUrl(story.target_url);

  if (story.is_ad) {
    footer.innerHTML = `
      <span class="story-viewer-advertiser">${escapeHtml(story.advertiser_name || '')}</span>
      <div class="story-viewer-actions">
        ${hasTarget ? '<button class="story-viewer-visit-btn" onclick="handleStoryTargetClick()">زيارة</button>' : ''}
        <button class="story-viewer-report-btn" onclick="handleStoryReport()"><i class="fa-solid fa-flag"></i> إبلاغ</button>
      </div>
    `;
  } else {
    footer.innerHTML = `
      <div class="story-viewer-actions">
        <button class="story-viewer-report-btn" onclick="handleStoryReport()"><i class="fa-solid fa-flag"></i> إبلاغ</button>
      </div>
    `;
  }
}

/** target_url قادم من قاعدة بيانات يديرها أدمن، ويُوضع في href/window.open — يُرفض أي مخطَّط غير http/https (مثل javascript:). */
function isSafeHttpUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function updateStoryProgressBarsForIndex() {
  const fills = document.querySelectorAll('#storyProgressRow .story-progress-fill');
  fills.forEach((fill, i) => {
    fill.style.width = i < storyViewerIndex ? '100%' : '0%';
  });
}

function tickStorySlide(now) {
  const story = allStories[storyViewerIndex];
  const delta = now - storyViewerLastTickTs;
  storyViewerLastTickTs = now;

  if (!storyViewerPaused && !document.hidden) {
    storyViewerElapsedMs += delta;
  }

  const durationMs = story.slide_duration_seconds
    ? story.slide_duration_seconds * 1000
    : STORY_FALLBACK_SLIDE_MS;

  const fills = document.querySelectorAll('#storyProgressRow .story-progress-fill');
  const activeFill = fills[storyViewerIndex];
  if (activeFill) activeFill.style.width = Math.min(100, (storyViewerElapsedMs / durationMs) * 100) + '%';

  if (!storyViewerViewRecorded && storyViewerElapsedMs >= STORY_WATCHED_THRESHOLD_MS) {
    storyViewerViewRecorded = true;
    recordStoryView(story);
  }

  if (storyViewerElapsedMs >= durationMs) {
    storyViewerGoNext();
    return;
  }

  storyViewerRafId = requestAnimationFrame(tickStorySlide);
}

function storyViewerGoNext() {
  if (storyViewerIndex >= allStories.length - 1) {
    closeStoryViewer();
    return;
  }
  storyViewerIndex++;
  startStorySlide();
}

function storyViewerGoPrev() {
  if (storyViewerIndex === 0) {
    startStorySlide();
    return;
  }
  storyViewerIndex--;
  startStorySlide();
}

function pauseStorySlide() {
  storyViewerPaused = true;
}

function resumeStorySlide() {
  storyViewerPaused = false;
}

/**
 * الأسهم تتنقّل، لكن ليس بالافتراض الغربي: بالعربية RTL السهم المتّجه بصرياً
 * يميناً يعيد للخلف (نفس جهة زرّ «السابق» على يمين الشاشة)، والمتّجه يساراً
 * يقدّم (نفس جهة زرّ «التالي» على يسارها) — طابِق زوج أزرار التنقّل، لا اتجاه
 * القراءة الغربي المعتاد لأسهم لوحة المفاتيح.
 */
function handleStoryViewerKeydown(e) {
  if (e.key === 'Escape') { closeStoryViewer(); return; }
  if (e.key === 'ArrowRight') storyViewerGoPrev();
  else if (e.key === 'ArrowLeft') storyViewerGoNext();
}

/**
 * rAF يتوقف أو يُبطَّأ فعلياً في تبويب مخفي، فـ storyViewerLastTickTs يبقى
 * قديماً. بلا هذا التصحيح، أول نبضة بعد العودة تحسب delta ضخماً (كل مدة
 * الإخفاء) وتُضيفه لزمن المشاهدة رغم أن التبويب لم يكن مرئياً — وهذا بالضبط
 * ما يمنعه شرط document.hidden في tickStorySlide، بشرط أن تبدأ الساعة من
 * جديد لا من رصيد قديم.
 */
function handleStoryViewerVisibilityChange() {
  if (!document.hidden) {
    storyViewerLastTickTs = performance.now();
  }
}

/** تسجيل مشاهدة تحسين صامت — فشله لا يوقف العرض ولا يزعج المستخدم (مطابق للموبايل). */
async function recordStoryView(story) {
  try {
    await apiFetch(`/api/stories/${story.id}/view`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: getStoryDeviceId() })
    });
  } catch (e) {
    console.error('Story view error:', e);
  }
}

async function handleStoryTargetClick() {
  const story = allStories[storyViewerIndex];
  if (!isSafeHttpUrl(story.target_url)) return;
  try {
    await apiFetch(`/api/stories/${story.id}/click`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: getStoryDeviceId() })
    });
  } catch (e) {
    // فشل تسجيل النقرة لا يمنع فتح الرابط نفسه (مطابق للموبايل).
  }
  window.open(story.target_url, '_blank', 'noopener');
}

/** إبلاغ يتطلّب حساباً — زائر بلا حساب يُوجَّه لمسار الدخول القائم، لا لرسالة خطأ (نفس نمط reportCongratulation). */
async function handleStoryReport() {
  if (!requireAuth({ type: 'report' })) return;
  const story = allStories[storyViewerIndex];
  pauseStorySlide();
  try {
    const res = await apiFetch(`/api/stories/${story.id}/report`, { method: 'POST', auth: true });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      showToast(data.message || 'تم استلام بلاغك');
    } else {
      alert(data.message || 'تعذر إرسال الإبلاغ');
    }
  } catch (e) {
    alert('تعذر إرسال الإبلاغ');
  } finally {
    resumeStorySlide();
  }
}

// 3. Fetch Events from API
//
// مرقّمة، مفلترة على الخادم دائماً (البلدة/البحث/النوع/الأرشيف تُمرَّر كوسائط
// استعلام — لا ترشيح في العميل، وإلا انكسر الترقيم) (#20 step 10).
/** هياكل تحميل شبيهة بشكل الكرت بدل الدوّارة — تُعرَض قبل استجابة الخادم (#85 خطوة 53). */
function renderEventSkeletons(container, count = 3) {
  container.classList.remove('events-feed-first-load');
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="card-skeleton skeleton-shimmer">
      <div class="skeleton-shot"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  `).join('');
}

let isFetchingEvents = false;

function initFeedScroller() {
  const container = document.getElementById('eventsContainer');
  if (container) {
    container.addEventListener('scroll', handleFeedScroll, { passive: true });
  }
  window.addEventListener('resize', updateFeedDimensions);
  window.addEventListener('load', updateFeedDimensions);
  observeFeedChrome();
  updateFeedDimensions();
}

/*
 * الكروم الثابت يتغيّر ارتفاعه بلا `resize`: الترويسة تلتفّ سطرين عند تبدّل
 * الخط أو اللغة، والشريط السفلي يتغيّر مع منطقة الأمان في الهواتف. ربطُ الحساب
 * بـ`resize` وحده كان يترك القيمة قديمة بعد كل تغيّر من هذا النوع، وهو سبب
 * تقطّع العطل. `ResizeObserver` يراقب الصندوقين اللذين يدخلان الحساب فعلاً.
 */
let feedChromeObserver = null;
function observeFeedChrome() {
  if (feedChromeObserver || typeof ResizeObserver === 'undefined') return;
  feedChromeObserver = new ResizeObserver(() => updateFeedDimensions());
  [document.querySelector('.app-header'), feedBottomChromeEl()]
    .filter(Boolean)
    .forEach((el) => feedChromeObserver.observe(el));
}

function feedBottomChromeEl() {
  return document.querySelector('.bottom-nav-wrap') || document.querySelector('.bottom-navbar');
}

/*
 * ارتفاع الخلاصة = الشاشة ناقص **الكروم الثابت وحده**: الترويسة `sticky` أعلى
 * الصفحة، والشريط السفلي `fixed` أسفلها. لا شيء غيرهما يبقى على الشاشة.
 *
 * الحساب السابق كان يطرح `getBoundingClientRect().top + scrollY` — أي إزاحة
 * الخلاصة عن أعلى **المستند**، فيدخل فيه كل ما فوقها: شريط التعميم وشريط
 * الستوريات ورقاقتا الفلتر وشريط البحث. وهذه كلها `static` تمرّ عند التمرير
 * ولا تشغل الشاشة بعده، ومع ذلك كانت تُطرح طرحاً دائماً. على 390×844 كان
 * المطروح 630px من 844، فلا يتبقّى للكرت داخل الشاشة إلا 145px.
 *
 * والقيمة تؤدّي وظيفتين معاً بعد أن صارت الخلاصة `position: sticky`: مقدار
 * الطرح من ارتفاع الشاشة، ومسافة التثبيت (`top`) تحت الترويسة.
 */
function updateFeedDimensions() {
  const container = document.getElementById('eventsContainer');
  if (!container) return;

  const measure = (el) => (el ? Math.round(el.getBoundingClientRect().height || el.offsetHeight || 0) : 0);
  const feedTop = measure(document.querySelector('.app-header'));
  const feedBottom = measure(feedBottomChromeEl());
  // أرضية ٦٠٪ من الشاشة: على هاتف قصير بترويسة ملتفّة قد يصير الباقي أقلّ من
  // كرت صالح للقراءة، والمطلوب ألّا تختفي المناسبات مهما ضاق الباقي.
  const available = Math.max(Math.round(window.innerHeight * 0.6), window.innerHeight - feedTop - feedBottom);

  // بالبكسل على العنصر نفسه، لا عبر `var()` يُقرأ من أب داخل `calc`: القياس
  // جرى هنا أصلاً، والكتابة المباشرة تُخرج الأرضية أعلاه من قدرة CSS وحدها
  // (لا تعرف ارتفاع الكروم) وتُسقط طبقة استبدال كاملة من طريق الخطأ.
  container.style.setProperty('top', `${feedTop}px`, 'important');
  container.style.setProperty('height', `${available}px`, 'important');
}

function handleFeedScroll() {
  const container = document.getElementById('eventsContainer');
  if (!container || isFetchingEvents) return;
  const hasMore = !!(currentPagination && currentPagination.page < currentPagination.totalPages);
  if (!hasMore) return;

  const threshold = container.clientHeight || 500;
  const distanceToEnd = container.scrollHeight - (container.scrollTop + container.clientHeight);
  if (distanceToEnd <= threshold) {
    loadMoreEvents();
  }
}

async function fetchEvents(options = {}) {
  const { append = false } = options;
  const container = document.getElementById('eventsContainer');
  if (append && isFetchingEvents) return;
  isFetchingEvents = true;

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const loadingPill = document.getElementById('feedLoadingSpinner');
  const loadWrapper = document.getElementById('loadMoreWrapper');

  if (append) {
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (loadingPill) loadingPill.style.display = 'inline-flex';
    if (loadWrapper) loadWrapper.style.display = 'block';
  } else {
    currentPage = 1;
    renderEventSkeletons(container);
  }

  try {
    const params = new URLSearchParams();
    // البلدة والقرية مفصولتان بفاصلة لكل منهما — الخادم يقبل قوائم مفصولة
    // بفاصلة ويوحّدهما، لا يقاطعهما (#85 خطوة 40-42). عدم اختيار أي مكان يعني
    // كل الأماكن، فلا معامل يُرسَل أصلاً.
    if (selectedTowns.length) params.set('town', selectedTowns.join(','));
    if (selectedVillageIds.length) params.set('village_id', selectedVillageIds.join(','));
    if (selectedOccasionTypeIds.length) params.set('occasion_type_id', selectedOccasionTypeIds.join(','));
    if (searchQuery) params.set('search', searchQuery);
    if (showArchive) params.set('archive', '1');
    params.set('page', currentPage);
    params.set('limit', EVENTS_PAGE_SIZE);

    const res = await apiFetch(`/api/events?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      allEvents = append ? allEvents.concat(data.events) : data.events;
      currentPagination = data.pagination || null;
      renderEvents(allEvents);
      renderAnnouncements(data.announcements);
      renderLoadMoreButton();
      updateFeedDimensions();
      // فحص أي رابط عميق بعد اكتمال جلب التغذية (FIX 5)
      if (!append) {
        await checkPendingDeepLink();
      }
    } else {
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>تعذر جلب المناسبات حالياً</p></div>`;
      if (!append) await checkPendingDeepLink();
    }
  } catch (err) {
    console.error('Error fetching events:', err);
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>حدث خطأ في الاتصال بالخادم</p></div>`;
    if (!append) await checkPendingDeepLink();
  } finally {
    isFetchingEvents = false;
    if (loadingPill) loadingPill.style.display = 'none';
    renderLoadMoreButton();
  }
}

/** زرّ «عرض المزيد» — يحافظ على الفلاتر النشِطة (يستخدم fetchEvents نفسها بصفحة تالية). */
function loadMoreEvents() {
  if (isFetchingEvents) return;
  if (!currentPagination || currentPagination.page >= currentPagination.totalPages) return;
  currentPage = currentPagination.page + 1;
  fetchEvents({ append: true });
}

function renderLoadMoreButton() {
  const wrapper = document.getElementById('loadMoreWrapper');
  const btn = document.getElementById('loadMoreBtn');
  const loadingPill = document.getElementById('feedLoadingSpinner');
  if (!wrapper) return;
  const isLoading = isFetchingEvents;
  const hasMore = !!(currentPagination && currentPagination.page < currentPagination.totalPages);

  if (isLoading) {
    wrapper.style.display = 'block';
    if (btn) btn.style.display = 'none';
    if (loadingPill) loadingPill.style.display = 'inline-flex';
  } else if (hasMore) {
    wrapper.style.display = 'block';
    if (btn) btn.style.display = 'inline-block';
    if (loadingPill) loadingPill.style.display = 'none';
  } else {
    wrapper.style.display = 'none';
    if (btn) btn.style.display = 'none';
    if (loadingPill) loadingPill.style.display = 'none';
  }
}

/** المنتهي لا يزاحم القادم — يُطلَب صراحةً فقط عبر ?archive=1 (#20 step 10). */
function toggleArchive() {
  showArchive = !showArchive;
  const btn = document.getElementById('archiveToggleBtn');
  if (btn) btn.classList.toggle('active', showArchive);
  fetchEvents();
}

/**
 * إعلانات تعديل التاريخ — خبر عن مناسبة قائمة لا مناسبة جديدة، فتُعرَض ككرت
 * مميّز بعرض القائمة، بالحقيقة الحالية فقط (من كذا إلى كذا) (#20 step 10).
 * الخادم يرسل الحيّ وحده ضمن `announcements` — لا فلترة ولا منطق انتهاء هنا.
 */
function renderAnnouncements(announcements) {
  const container = document.getElementById('announcementsContainer');
  if (!container) return;
  if (!announcements || !announcements.length) {
    container.innerHTML = '';
    updateFeedDimensions();
    return;
  }

  container.innerHTML = announcements.map(a => `
    <div class="event-card announcement-card">
      <div class="card-header-bar">
        <div class="card-clan-town">
          <span class="town-badge">${escapeHtml(a.event.town)}</span>
        </div>
        <span class="countdown-badge"><i class="fa-solid fa-bullhorn"></i> إعلان تعديل موعد</span>
      </div>
      <div class="card-body">
        <h2 class="event-main-title">${escapeHtml(a.event.title || a.event.groom_name || '')}</h2>
        <p style="color:var(--text-secondary); margin-top:6px;">
          تغيّر موعد المناسبة من <strong>${escapeHtml(String(a.old_value))}</strong> إلى <strong>${escapeHtml(String(a.new_value))}</strong>.
        </p>
      </div>
    </div>
  `).join('');
  updateFeedDimensions();
}

// 4. Render Event Cards
/** الحقول الظاهرة والتفاعلات تأتيان من إعداد النوع على الخادم — لا جدول ثابت هنا. */
function typeVisibleFields(evt) {
  return (evt.occasion_type && evt.occasion_type.fields) || null;
}

/**
 * نوع لم ترسله القائمة (صفّ أقدم من الأنواع) يعرض كل شيء كما كان — إخفاءُ
 * حقلٍ لا نعرف إعداده يخفي بياناتٍ حقيقية بلا سبب.
 */
function typeShowsField(evt, fieldKey) {
  const fields = typeVisibleFields(evt);
  if (!fields) return true;
  return fields.some(f => f.field_key === fieldKey);
}

function typeFieldLabel(evt, fieldKey, fallback) {
  const fields = typeVisibleFields(evt);
  const field = fields && fields.find(f => f.field_key === fieldKey);
  return (field && field.label) || fallback;
}

const REACTION_EMOJI = { coffee: '☕', horse: '🐎', fireworks: '🎆', rose: '🌹', hand: '🤝' };

/**
 * شريط التفاعلات من قائمة النوع لا من قائمة ثابتة في العميل. والعزاء مضبوط
 * على صفر تفاعلات: أيّ عدّاد بجانب وفاة يخلق مقارنة بين الوفيات، والألعاب
 * النارية على نعيٍ إساءة. صفر تفاعلات ⇒ لا شريط إطلاقاً.
 */
function renderReactionBarHtml(evt) {
  const allowed = evt.occasion_type
    ? (evt.occasion_type.reactions || [])
    : Object.keys(REACTION_EMOJI);
  if (!allowed.length) return '';

  const buttons = allowed.filter(type => REACTION_EMOJI[type]).map(type => `
            <button class="reaction-btn" onclick="sendReaction(${evt.id}, '${type}', this)">
              <span class="emoji">${REACTION_EMOJI[type]}</span>
              <span class="react-count">${(evt.reactions && evt.reactions[type]) || 0}</span>
            </button>`).join('');

  return `<div class="reaction-bar">${buttons}
          </div>`;
}

/** «تبريكات» أم «تعازي» — من إعداد النوع لا من نصّ ثابت؛ اللغة تقول للناس أين هم. */
function congratulationsLabel(evt) {
  return (evt.occasion_type && evt.occasion_type.congratulations_label) || 'تبريكات';
}

/**
 * الهدوء البصري للعزاء — لا حقل «نوع» صريح في البيانات، فنستدل من نفس
 * الإعداد الذي يميّز العزاء فعلياً على الخادم (congratulations_label 'تعازي'،
 * seed بيانات dataMigrations.js) بدل مطابقة اسم النوع حرفياً (#20 خطوة 11، قرار ٥).
 */
function isMourningTone(evt) {
  // علَم صريح من الخادم — لا مقارنة بتسمية يكتبها الأدمن ويستطيع تغييرها.
  return !!(evt.occasion_type && evt.occasion_type.tone === 'solemn');
}

/**
 * حيّز HTML جاهز للحقن مباشرة في رسالة «لا توجد مناسبات» — لا وصف نصّي عادي
 * (الاسم يخالف ما كان يعيده: هذه القيمة مُهرَّبة (`escapeHtml`) بالفعل ومُعَدّة
 * للحقن، لا للعرض بذاتها) (#85 FIX 10أ). لا تعود أبداً لـ«منطقة النقب» طالما
 * هناك اختيار فعلي، حتى إن تعذّر حلّ اسم أحد عناصره — حينها تُعرَض العدّة
 * («٢ أماكن محدَّدة») لا الفراغ (#85 FIX 1، نفس علّة `filterChipLabelText`).
 */
function selectedPlacesHtml() {
  const tokens = FILTER_SHEETS.place.selected();
  if (!tokens.length) return 'منطقة النقب';
  const resolvedNames = tokens.map(t => resolveFilterOptionLabel(FILTER_SHEETS.place, t)).filter(Boolean);
  if (resolvedNames.length) return escapeHtml(resolvedNames.join('، '));
  return escapeHtml(tokens.length === 1 ? FILTER_SHEETS.place.nounSingular : FILTER_SHEETS.place.nounPlural(tokens.length));
}

function getBezelOrnamentSvg(color) {
  const stroke = encodeURIComponent(color || '#d4af37');
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Cg fill='none' stroke='${stroke}' stroke-width='1.1' opacity='0.24'%3E%3Crect x='14' y='14' width='36' height='36'/%3E%3Crect x='14' y='14' width='36' height='36' transform='rotate(45 32 32)'/%3E%3C/g%3E%3C/svg%3E`;
}

function renderSingleEventCardHtml(evt) {
  const eventDate = new Date(evt.event_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = eventDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // العدّ التنازلي يُقرأ على كل نوع — و«الفرح» ولهبُه على نعيٍ إساءة.
  let countdownText = '';
  if (diffDays === 0) countdownText = 'اليوم';
  else if (diffDays === 1) countdownText = 'غداً';
  else if (diffDays > 1) countdownText = `باقي ${diffDays} أيام`;
  else countdownText = 'مناسبة سابقة';

  const formattedDate = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(eventDate);

  let wazeUrl = '';
  let mapsUrl = '';
  if (evt.latitude && evt.longitude) {
    wazeUrl = `https://waze.com/ul?ll=${evt.latitude},${evt.longitude}&navigate=yes`;
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${evt.latitude},${evt.longitude}`;
  } else {
    const q = encodeURIComponent(`${evt.location_name} ${evt.town} النقب`);
    wazeUrl = `https://waze.com/ul?q=${q}&navigate=yes`;
    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  const audioBlock = evt.audio_url ? `
    <div class="card-audio-player">
      <div class="audio-info-area">
        <div class="wave-bars" id="waveBars-${evt.id}">
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
        </div>
        <div class="audio-text">
          <div class="audio-title">${escapeHtml(evt.audio_title || 'شيلة الفرح والترحيب')}</div>
          <div class="audio-sub">استمع للشيلة أو الترحيب الصوتي</div>
        </div>
      </div>
      <button class="play-audio-btn" onclick="toggleAudio('${evt.audio_url}', this, ${evt.id})" title="تشغيل / إيقاف">
        <i class="fa-solid fa-play"></i>
      </button>
    </div>
  ` : '';

  const isMourning = isMourningTone(evt);
  const toneColor = evt.occasion_type && evt.occasion_type.color
    ? (evt.occasion_type.color.startsWith('#') ? evt.occasion_type.color : `#${evt.occasion_type.color}`)
    : null;
  const toneStyle = toneColor ? ` style="--tone:${toneColor}"` : '';
  const bezelSvg = getBezelOrnamentSvg(toneColor);
  const bezelStyle = ` style="background-image:url(&quot;${bezelSvg}&quot;)"`;
  const hasShot = !!evt.poster_url;

  const mediaContent = hasShot ? `
    <img src="${escapeHtml(evt.poster_url)}" alt="${escapeHtml(evt.title)}" class="card-media-img" loading="lazy">` : `
    <div class="card-media-placeholder"><i class="fa-solid ${isMourning ? 'fa-dove' : 'fa-champagne-glasses'}"></i></div>`;

  const countdownChipHtml = isMourning ? '' : `<span class="card-datechip">${escapeHtml(countdownText)}</span>`;

  const clanTownParts = [evt.family_clan, evt.town].filter(Boolean).map(escapeHtml);
  const clanLineHtml = clanTownParts.length
    ? `<div class="card-clan-line card-clamp-1-line">${clanTownParts.join(' — ')}</div>` : '';

  // التاريخ والمكان يظهران في شريط التعريف لكل الأنواع دون استثناء؛ قصة 15 تقتضي قراءتهما مباشرة دون الحاجة لفتح التفاصيل.
  const dateVenueParts = [formattedDate, evt.location_name].filter(Boolean).map(escapeHtml);
  const dateVenueLineHtml = dateVenueParts.length
    ? `<div class="card-date-line card-clamp-1-line">${dateVenueParts.join(' — ')}</div>` : '';

  const artistLineHtml = (typeShowsField(evt, 'artist_name') && evt.artist_name)
    ? `<div class="card-artist-line">يحيي الحفلة الفنان ${escapeHtml(evt.artist_name)}</div>` : '';

  const captionHtml = `
    <div class="card-caption">
      <div class="card-caption-chips">
        <span class="card-kindchip">${occasionTypeBadgeHtml(evt.occasion_type)}</span>
        ${countdownChipHtml}
      </div>
      <h2 class="event-main-title card-clamp-1-line">${escapeHtml(evt.title)}</h2>
      ${clanLineHtml}
      ${dateVenueLineHtml}
      <div class="card-caption-actions">
        <button type="button" class="chat-trigger-btn card-action-btn" onclick="openChatModal(${evt.id})">
          <i class="fa-regular fa-comments"></i> <span>${escapeHtml(congratulationsLabel(evt))}</span>
        </button>
        ${renderReminderButtonHtml(evt)}
        <button type="button" class="share-event-btn card-action-btn" onclick="shareEventById(${evt.id})">
          <i class="fa-solid fa-share-nodes"></i> <span>${escapeHtml(shareButtonLabel(evt))}</span>
        </button>
        <button type="button" class="card-more-details-btn card-action-btn" aria-expanded="false" onclick="toggleCardDetails(${evt.id}, this)">
          <i class="fa-solid fa-chevron-down"></i> <span>مزيد من التفاصيل</span>
        </button>
      </div>
    </div>`;

  const collapsibleHtml = `
    <div class="card-details-collapsible" id="cardDetails-${evt.id}" hidden>
      <div class="card-details-sheet-header">
        <span class="card-details-sheet-title">تفاصيل المناسبة</span>
        <button type="button" class="card-details-close-btn" onclick="toggleCardDetails(${evt.id})" aria-label="إغلاق">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      ${artistLineHtml}
      ${audioBlock}
      <div class="event-details-grid">
        <div class="detail-item">
          <i class="fa-solid fa-calendar-day"></i>
          <span><strong>التاريخ:</strong> ${formattedDate}</span>
        </div>
        ${typeShowsField(evt, 'youth_party_date') && evt.youth_party_date ? `
        <div class="detail-item">
          <i class="fa-solid fa-fire"></i>
          <span><strong>${escapeHtml(typeFieldLabel(evt, 'youth_party_date', 'سهرة الشباب والدحة'))}:</strong> ${evt.youth_party_date}</span>
        </div>` : ''}
        ${typeShowsField(evt, 'dinner_time') ? `
        <div class="detail-item">
          <i class="fa-solid fa-utensils"></i>
          <span><strong>${escapeHtml(typeFieldLabel(evt, 'dinner_time', 'طعام العشاء'))}:</strong> ${escapeHtml(evt.dinner_time || 'الساعة 8:00 مساءً')}</span>
        </div>` : ''}
        <div class="detail-item">
          <i class="fa-solid fa-location-dot"></i>
          <span><strong>الموقع:</strong> ${escapeHtml(evt.location_name)}</span>
        </div>
      </div>

      <!-- 1-Click Navigation -->
      <div class="nav-buttons-row">
        <a href="${wazeUrl}" target="_blank" class="waze-btn">
          <i class="fa-brands fa-waze"></i> الملاحة عبر Waze
        </a>
        <a href="${mapsUrl}" target="_blank" class="maps-btn">
          <i class="fa-solid fa-location-arrow"></i> خرائط Google
        </a>
      </div>

      ${renderReactionBarHtml(evt)}
      ${renderCongratsPreviewHtml(evt)}

      <!-- Action Buttons Footer -->
      <div class="card-footer-actions">
        <button class="record-nokoot-btn" onclick="quickRecordNokoot('${escapeHtml(evt.groom_name)}', '${evt.event_date}', '${escapeHtml(evt.town)}')">
          <i class="fa-solid fa-wallet"></i> تسجيل نقوط
        </button>
      </div>
    </div>`;

  return `
    <div class="event-card${isMourning ? ' tone-mourning' : ''}" id="eventCard-${evt.id}"${toneStyle}>
      <div class="card-bezel"${bezelStyle}>
        <div class="card-framed">
          <div class="card-media${hasShot ? '' : ' card-media-empty'}">
            ${mediaContent}
          </div>
          ${captionHtml}
          <div class="card-goldframe" aria-hidden="true"></div>
          ${collapsibleHtml}
        </div>
      </div>
    </div>
  `;
}

function renderEvents(events) {
  const container = document.getElementById('eventsContainer');
  const isFirstLoad = !eventsFeedFirstLoadDone;
  eventsFeedFirstLoadDone = true;

  if (!events || events.length === 0) {
    container.classList.remove('events-feed-first-load');
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-calendar-xmark"></i>
        <h3>لا توجد مناسبات مسجلة</h3>
        <p>كن أول من يعلن عن مناسبة في ${selectedPlacesHtml()}</p>
      </div>
    `;
    updateFeedDimensions();
    return;
  }

  container.classList.toggle('events-feed-first-load', isFirstLoad);
  container.innerHTML = events.map(evt => renderSingleEventCardHtml(evt)).join('');
  updateFeedDimensions();
}

/**
 * يعرض مناسبة مفردة في الحاوية المخصصة (#singleEventContainer) عند الوصول
 * إليها عبر إشعار أو رابط عميق، دون تلويث allEvents أو الإخلال بفلاتر التغذية (قصة 14، FIX 6).
 */
function renderSingleEventView(event) {
  const container = document.getElementById('singleEventContainer');
  if (!container) return;

  const cardHtml = renderSingleEventCardHtml(event);
  container.innerHTML = `
    <div class="single-event-box">
      <div class="single-event-header">
        <span class="single-event-header-title">
          <i class="fa-solid fa-bell" aria-hidden="true"></i>
          <span>مناسبة من إشعار</span>
        </span>
        <button type="button" class="single-event-close-btn" onclick="clearSingleEventView()" title="إغلاق العرض الخاص">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i> إغلاق
        </button>
      </div>
      <div class="single-event-card-wrap">
        ${cardHtml}
      </div>
    </div>
  `;

  const card = document.getElementById(`eventCard-${event.id}`);
  if (card) {
    highlightAndScrollToCard(card, isMourningTone(event));
  }
}

function clearSingleEventView() {
  const container = document.getElementById('singleEventContainer');
  if (container) container.innerHTML = '';
}

/** يطوي/يبسط كتلة تفاصيل الكرت خلف زرّ واحد أو زر الإغلاق (#85 خطوة 48). */
function toggleCardDetails(eventId, btn) {
  const panel = document.getElementById(`cardDetails-${eventId}`);
  if (!panel) return;
  const willShow = panel.hidden;
  panel.hidden = !willShow;
  const toggleBtn = btn || document.querySelector(`#eventCard-${eventId} .card-more-details-btn`);
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(willShow));
    toggleBtn.innerHTML = willShow
      ? '<i class="fa-solid fa-chevron-up"></i> إخفاء التفاصيل'
      : '<i class="fa-solid fa-chevron-down"></i> مزيد من التفاصيل';
  }
}

/** أيقونة ولون نوع المناسبة من الخادم كما هما — لا لون جديد يُصمَّم هنا (#20 step 10). */
function occasionTypeBadgeHtml(occasionType) {
  if (!occasionType) return '';
  const color = occasionType.color && occasionType.color.startsWith('#') ? occasionType.color : (occasionType.color ? `#${occasionType.color}` : null);
  const style = color ? `style="background:${color}26; color:${color}; border-color:${color};"` : '';
  return `<span class="town-badge" ${style}>${occasionType.icon ? escapeHtml(occasionType.icon) + ' ' : ''}${escapeHtml(occasionType.name)}</span>`;
}

/**
 * العدّاد وسطر المعاينة — يفتحان ورقة التبريكات نفسها (الفتح على المودال
 * القائم، لا صفحة تفاصيل). `congratulations_count` قد يغيب كلياً حين يكون
 * `show_congratulations_count` مطفأً على النوع — غيابه يعني لا شيء يُعرَض،
 * لا صفراً (#20 step 10).
 */
function renderCongratsPreviewHtml(evt) {
  if (evt.congratulations_count === undefined) return '';
  const label = (evt.occasion_type && evt.occasion_type.congratulations_label) || 'تبريكات';
  const latest = evt.latest_congratulation;
  const preview = latest ? ` — ${escapeHtml(latest.sender_name)}: ${escapeHtml(truncateText(latest.message, 40))}` : '';
  return `
    <button class="chat-trigger-btn" style="width:100%; margin-bottom:10px;" onclick="openChatModal(${evt.id})">
      <i class="fa-regular fa-comment-dots"></i> ${evt.congratulations_count} ${escapeHtml(label)}${preview}
    </button>`;
}

/**
 * «ذكّرني» — متابعة لا تعهّد حضور، ونفس التسمية في كل الأنواع (#20 step 10).
 */
function renderReminderButtonHtml(evt) {
  const isReminded = !!evt.is_reminded;
  const icon = isReminded ? 'fa-bell-slash' : 'fa-bell';
  const label = isReminded ? 'إلغاء التذكير' : 'ذكّرني';
  return `
    <button class="record-nokoot-btn card-action-btn" onclick="toggleReminder(${evt.id}, ${isReminded}, this)">
      <i class="fa-solid ${icon}"></i> <span>${label}</span>
    </button>`;
}

function truncateText(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

/** يبدّل حالة «ذكّرني» — فعل كتابة، خلف حساب مثل النشر والتبريك (#20 step 10). */
async function toggleReminder(eventId, isReminded, btnElement) {
  if (!requireAuth({ type: 'remind', eventId })) return;
  if (btnElement) btnElement.disabled = true;
  try {
    const res = await apiFetch(`/api/events/${eventId}/remind`, { method: isReminded ? 'DELETE' : 'POST', auth: true });
    const data = await res.json();
    if (data.success) {
      const evt = allEvents.find(e => e.id === eventId);
      if (evt) evt.is_reminded = !isReminded;
      renderEvents(allEvents);
      showToast(isReminded ? 'تم إلغاء التذكير' : '🔔 تم تفعيل التذكير');
      // طلب إذن الإشعارات الفورية عند إضافة تذكير فقط — لا عند أول فتح للموقع ولا عند إلغائه (قصة 16)
      if (!isReminded) {
        requestPushNotificationSubscription();
      }
    } else {
      alert(data.message || 'تعذر تنفيذ الطلب');
    }
  } catch (e) {
    alert('تعذر تنفيذ الطلب — تحقق من الاتصال بالخادم');
  } finally {
    if (btnElement) btnElement.disabled = false;
  }
}

// 5. Audio Player Controller
function toggleAudio(audioUrl, btnElement, eventId) {
  const waveBars = document.getElementById(`waveBars-${eventId}`);

  if (currentAudio && !currentAudio.paused && currentAudio.src.includes(audioUrl)) {
    currentAudio.pause();
    btnElement.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (waveBars) waveBars.classList.remove('playing');
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    if (currentAudioBtn) currentAudioBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    document.querySelectorAll('.wave-bars').forEach(wb => wb.classList.remove('playing'));
  }

  currentAudio = new Audio(audioUrl);
  currentAudioBtn = btnElement;
  btnElement.innerHTML = '<i class="fa-solid fa-pause"></i>';
  if (waveBars) waveBars.classList.add('playing');

  currentAudio.play().catch(err => {
    console.error('Audio playback error:', err);
    btnElement.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (waveBars) waveBars.classList.remove('playing');
  });

  currentAudio.onended = () => {
    btnElement.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (waveBars) waveBars.classList.remove('playing');
  };
}

// 6. Interactive Leaflet Map for Negev
async function initLeafletMap() {
  const mapElement = document.getElementById('negevEventsMap');
  if (!mapElement) return;

  if (!leafletMap) {
    // Centered on Negev (Beer Sheva / Rahat area)
    leafletMap = L.map('negevEventsMap').setView([31.2858, 34.8431], 10);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(leafletMap);
  }

  try {
    const res = await apiFetch('/api/map/events');
    const data = await res.json();

    if (data.success && data.points) {
      data.points.forEach(pt => {
        const customIcon = L.divIcon({
          className: 'map-marker-wrap',
          html: `<div class="map-marker-badge">💍 ${escapeHtml(pt.groom_name)}</div>`,
          iconSize: [80, 30]
        });

        L.marker([pt.latitude, pt.longitude], { icon: customIcon })
          .addTo(leafletMap)
          .bindPopup(`
            <div class="map-popup">
              <h4>${escapeHtml(pt.title)}</h4>
              <p><strong>البلدة:</strong> ${escapeHtml(pt.town)}</p>
              <p><strong>التاريخ:</strong> ${pt.event_date}</p>
              <a href="${pt.waze_url}" target="_blank" class="map-popup-waze-btn">الملاحة عبر Waze</a>
            </div>
          `);
      });
    }
  } catch (e) {
    console.error('Map points error:', e);
  }

  setTimeout(() => { leafletMap.invalidateSize(); }, 300);
}

// 6b. Interactive map picker for the publish form (#20 step 6)
//
// خط الطول وخط العرض لا يُكتَبان يدوياً بعد اليوم — المستخدم يسحب دبّوساً فوق
// موقع القاعة الفعلي على الخريطة. زر «موقعي الآن» يوسّط الخريطة فقط ولا يحفظ
// أي نقطة: من يملأ هذا النموذج غالباً في بيته قبل أسابيع من المناسبة، لا في
// القاعة نفسها، فموقعه الحالي ليس موقع المناسبة.

/** يجلب مراكز البلدات وقائمة البلدات نفسها من الخادم مرة واحدة فقط. */
/** يعيد true حين تُحمَّل البلدات/القرى فعلاً — الفلتر يتوقّف على هذا بدل افتراض النجاح دائماً (#85 FIX 10ب). */
async function loadTownCoordinates() {
  if (Object.keys(townCoordinates).length) return true;
  try {
    const res = await apiFetch('/api/towns');
    const data = await res.json();
    if (data.success) {
      if (data.town_coordinates) townCoordinates = data.town_coordinates;
      if (data.towns) townsList = data.towns.filter(t => t !== 'الكل');
      if (data.villages) villagesList = data.villages;
      return true;
    }
    return false;
  } catch (e) {
    console.error('Town coordinates error:', e);
    return false;
  }
}

/** يملأ قائمة بلدات منسدلة من townsList (مجلوبة من الخادم، لا قائمة مثبَّتة). */
function populateTownSelect(selectId, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = townsList.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if (selectedValue) select.value = selectedValue;
}

function setPickerCoordinates(lat, lng) {
  document.getElementById('addLat').value = lat != null ? lat : '';
  document.getElementById('addLng').value = lng != null ? lng : '';
}

/** يضع الدبّوس على نقطة (أو ينقله إن كان موضوعاً أصلاً) ويملأ الحقلين المخفيَّين. */
function placePickerMarker(lat, lng) {
  if (!locationPickerMap) return;

  if (locationPickerMarker) {
    locationPickerMarker.setLatLng([lat, lng]);
  } else {
    locationPickerMarker = L.marker([lat, lng], { draggable: true }).addTo(locationPickerMap);
    locationPickerMarker.on('dragend', () => {
      const pos = locationPickerMarker.getLatLng();
      pickerPinPlacedByUser = true;
      setPickerCoordinates(pos.lat, pos.lng);
    });
  }
  setPickerCoordinates(lat, lng);
}

/** يزيل الدبّوس الحالي بلا استبدال — يُستعمَل عند تفريغ النموذج بعد النشر. */
function clearPickerMarker() {
  if (locationPickerMarker && locationPickerMap) {
    locationPickerMap.removeLayer(locationPickerMarker);
  }
  locationPickerMarker = null;
  pickerPinPlacedByUser = false;
  setPickerCoordinates(null, null);
}

/**
 * يوسّط الخريطة على مركز البلدة المختارة، ويضع دبّوساً افتراضياً هناك ما دام
 * المستخدم لم يحرّك الدبّوس بنفسه بعد — أول تحريك يدوي (سحب أو نقر) يوقف هذا
 * التتبّع التلقائي نهائياً حتى لا يمحو تصحيحاً تعمّده المستخدم. «القرى
 * والتجمعات» بلا مركز معروف عمداً (#20 step 6, decision ٨): الخريطة تُفتح على
 * منظر عام للنقب بلا دبّوس، والمستخدم مطالَب بوضعه بنفسه.
 */
function recenterLocationPicker() {
  if (!locationPickerMap) return;
  const town = document.getElementById('addTown').value;
  const coords = townCoordinates[town];

  if (coords) {
    locationPickerMap.setView([coords.lat, coords.lng], 14);
    if (!pickerPinPlacedByUser) placePickerMarker(coords.lat, coords.lng);
  } else {
    locationPickerMap.setView(NEGEV_NEUTRAL_CENTER, 9);
  }
}

async function initLocationPickerMap() {
  const mapElement = document.getElementById('addLocationPickerMap');
  if (!mapElement) return;

  await loadTownCoordinates();

  if (!locationPickerMap) {
    locationPickerMap = L.map('addLocationPickerMap').setView(NEGEV_NEUTRAL_CENTER, 9);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(locationPickerMap);

    locationPickerMap.on('click', e => {
      pickerPinPlacedByUser = true;
      placePickerMarker(e.latlng.lat, e.latlng.lng);
    });

    // موقع المتصفح يتطلّب سياقاً آمناً (HTTPS، أو localhost أثناء التطوير) —
    // خارج ذلك يفشل باستمرار، فزر معطوب أسوأ من زر غائب (#20 step 6, decision ٧).
    const locateBtn = document.getElementById('useMyLocationBtn');
    if (locateBtn && window.isSecureContext && navigator.geolocation) {
      locateBtn.style.display = 'inline-flex';
    }
  }

  recenterLocationPicker();
  setTimeout(() => { locationPickerMap.invalidateSize(); }, 300);
}

/**
 * «موقعي الآن» يوسّط الخريطة فقط — لا يضع دبّوساً ولا يُرسِل أي إحداثية إلى
 * الخادم أبداً (#20 step 6, decision ٣). مهلة صريحة على `getCurrentPosition`
 * حتى لا يُعلَّق الزر إلى الأبد (افتراض المتصفح بلا مهلة).
 */
function centerPickerOnMyLocation() {
  if (!window.isSecureContext || !navigator.geolocation) return;

  const btn = document.getElementById('useMyLocationBtn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تحديد موقعك...';

  navigator.geolocation.getCurrentPosition(
    position => {
      locationPickerMap.setView([position.coords.latitude, position.coords.longitude], 15);
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    },
    () => {
      // رمز الخطأ 1 (PERMISSION_DENIED) يجمع ثلاث حالات: رفض المستخدم، سياق
      // غير آمن، وحجب بسياسة الأذونات — لا فرق بينها من هنا، فالرسالة تصدق
      // على الثلاث معاً بدل تخمين أيّها وقع.
      alert('تعذّر تحديد موقعك — يمكنك سحب الدبّوس يدوياً إلى موقع القاعة على الخريطة.');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// 7. AI Smart Nabati Poetry Generator
function openAIPoemModal() {
  document.getElementById('aiPoemModal').style.display = 'flex';
}

function closeAIPoemModal() {
  document.getElementById('aiPoemModal').style.display = 'none';
}

async function generateAIPoem() {
  const groom = document.getElementById('aiGroomInput').value.trim();
  const clan = document.getElementById('aiClanInput').value.trim();

  try {
    const res = await apiFetch('/api/ai/generate-poem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groom_name: groom, clan: clan })
    });
    const data = await res.json();

    if (data.success && data.poem) {
      document.getElementById('poemCategory').textContent = data.poem.category;
      document.getElementById('poemLine1').textContent = data.poem.verse1;
      document.getElementById('poemLine2').textContent = data.poem.verse2;
      document.getElementById('aiPoemResult').style.display = 'block';
    }
  } catch (e) {
    alert('حدث خطأ أثناء توليد الأبيات');
  }
}

function copyAIPoem() {
  const line1 = document.getElementById('poemLine1').textContent;
  const line2 = document.getElementById('poemLine2').textContent;
  navigator.clipboard.writeText(`${line1}\n${line2}`).then(() => {
    showToast('✨ تم نسخ أبيات التهنئة بنجاح!');
  });
}

function sharePoemToWhatsApp() {
  const line1 = document.getElementById('poemLine1').textContent;
  const line2 = document.getElementById('poemLine2').textContent;
  const text = encodeURIComponent(`🎉 تهنئة مباركة:\n\n${line1}\n${line2}\n\nعبر تطبيق وموقع مناسبات النقب: ${window.location.origin}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

// 8. AI Card OCR Scanner Simulation
async function simulateAICardScan() {
  showToast('🔍 جاري مسح كرت الدعوة واستخراج البيانات بالذكاء الاصطناعي...');
  
  try {
    const res = await apiFetch('/api/ai/scan-card', { method: 'POST' });
    const data = await res.json();

    if (data.success && data.extracted) {
      const ext = data.extracted;
      // النموذج لم يعد يملك حقل «اسم العريس» مستقلاً — أول صاحب مناسبة في
      // القائمة الديناميكية هو ما يُملأ الآن (#20 step 9).
      const firstHonoreeName = document.querySelector('#addHonoreesList .honoree-row .honoree-name');
      if (firstHonoreeName) firstHonoreeName.value = ext.groom_name;
      const familyInput = document.getElementById('addFamily');
      if (familyInput) familyInput.value = ext.family_clan;
      const townInput = document.getElementById('addTown');
      if (townInput) townInput.value = ext.town;
      const dateInput = document.getElementById('addEventDate');
      if (dateInput) dateInput.value = ext.event_date;
      const dinnerInput = document.getElementById('addDinnerTime');
      if (dinnerInput) dinnerInput.value = ext.dinner_time;
      const locationInput = document.getElementById('addLocationName');
      if (locationInput) locationInput.value = ext.location_name;

      checkDateCollisionLive();
      recenterLocationPicker();
      showToast(`✅ تم استخراج بيانات كرت ${ext.groom_name} بنجاح! دقة: ${ext.confidence}`);
    }
  } catch (e) {
    alert('تعذر مسح الكرت');
  }
}

// 9. Reactions Controller
async function sendReaction(eventId, type, btnElement) {
  try {
    const res = await apiFetch(`/api/events/${eventId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reaction_type: type,
        user_identifier: currentUser?.phone_number || 'guest'
      })
    });
    if (res.ok) {
      const countSpan = btnElement.querySelector('.react-count');
      if (countSpan) countSpan.textContent = parseInt(countSpan.textContent || '0') + 1;
      btnElement.style.transform = 'scale(1.25)';
      setTimeout(() => { btnElement.style.transform = 'scale(1)'; }, 200);
    }
  } catch (e) {
    console.error('Reaction error:', e);
  }
}

// 10. Navigation Tabs Switcher
//
// «إعلان مناسبة» هو أول لحظة كتابة، فالدخول يُطلَب هنا فقط — القراءة (باقي
// التبويبات) تبقى مفتوحة بلا حساب (#20 step 9). طلب الدخول يحفظ النيّة
// (pendingIntent) ليعود الزائر لهذا التبويب نفسه بعد الدخول، لا أن يضيع طلبه.
function switchTab(tabId) {
  if (tabId === 'tabAdd' && !requireAuth({ type: 'publish' })) return;

  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-tab'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active-tab');

  // «إضافة» لم تعد وجهة في الشريط (زرّ عائم بدلاً منها) — لا فهرس لها هنا،
  // فتبقى بلا تمييز «نشط» في الشريط نفسه، وهذا هو المقصود (تذكرة #31).
  const navIndex = ['tabHome', 'tabMap', 'tabNokoot', 'tabStickers', 'tabServices'].indexOf(tabId);
  const navBtns = document.querySelectorAll('.bottom-navbar .nav-btn');
  if (navBtns[navIndex]) navBtns[navIndex].classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabId === 'tabHome') updateFeedDimensions();
  else if (tabId === 'tabNokoot') loadNokootView();
  else if (tabId === 'tabStickers') renderStickerCanvas();
  else if (tabId === 'tabMap') initLeafletMap();
  else if (tabId === 'tabAdd') {
    if (!publishFormReady) initPublishForm();
    fetchMyEvents();
  } else if (tabId === 'tabServices') {
    if (!servicesInitialized) { servicesInitialized = true; initServicesTab(); }
  }
}

/**
 * يحرس أي فعل كتابة (نشر، تبريك). زائر بلا حساب يُحوَّل إلى شاشة الدخول
 * الموجودة أصلاً بدل شاشة جديدة، ونيّته (pendingIntent) تُستأنف تلقائياً بعد
 * نجاح الدخول أو التسجيل — القراءة نفسها لا تمرّ من هنا أبداً (#20 step 9).
 */
function requireAuth(intent) {
  if (currentUser && authToken) return true;
  pendingIntent = intent;
  showToast('🔒 يرجى تسجيل الدخول أو إنشاء حساب أولاً للمتابعة');
  openAuthModal();
  return false;
}

/** يُستدعى بعد نجاح الدخول/التسجيل — يعيد الزائر إلى ما كان يحاول فعله بالضبط. */
function resumePendingIntent() {
  if (!pendingIntent) return;
  const intent = pendingIntent;
  pendingIntent = null;

  if (intent.type === 'publish') {
    switchTab('tabAdd');
  } else if (intent.type === 'congratulate') {
    // نافذة التبريكات لم تُغلَق أصلاً — فقط اسم المرسِل يُحدَّث الآن بعد الدخول.
    const senderInput = document.getElementById('chatSenderName');
    if (senderInput && currentUser) senderInput.value = currentUser.full_name;
  }
}

// 11. Place & kind filter — رقاقتان تفتحان نفس ورقة البحث متعددة الاختيار،
// بإعداد مختلف لكل منهما، لا نسختين شبه متطابقتين من كل دالّة (#85 خطوة 40-46،
// FIX 9 على مراجعة الدفعة 6أ). الرقاقتان كانتا شريطين زاحفين يأكلان أعلى
// تبويب التغذية (#tabHome) وحده — لا كل شاشة في التطبيق.

// مطابق لـMAX_FILTER_VALUES في server/src/middleware/validate.js — الفلتر هنا
// يجب أن يمنع طلباً سيرفضه الخادم أصلاً بـ400، لا أن يرسله ثم يعرض خطأ عاماً
// (#85 FIX 2؛ حالة الاختبار القائمة في المواصفة: «فلتر بثلاثين بلدة → مرفوض
// بالسقف، لا استعلامٌ عملاق»). الحدّ لكل «نوع» (بلدة/قرية/نوع مناسبة) منفصلاً —
// مطابقةً لكيفية تحقّق الخادم من كل معامل قائمة بمعزل عن الآخر.
const FILTER_MAX_VALUES_PER_KIND = 20;
const FILTER_KIND_NOUNS = { town: 'بلدة', village: 'قرية', type: 'نوع مناسبة' };

/**
 * تعريف مُوحَّد لكل ورقة فلترة — إعداد واحد لكل استعمال بدل نسخة كاملة من كل
 * دالّة (#85 FIX 9). `selected()`/`commit()` يقرآن ويكتبان الحالة الفعلية
 * (`selectedTowns` وما شابه)؛ البقية وصف عرض بحت.
 */
const FILTER_SHEETS = {
  place: {
    sheetId: 'placeFilterModal',
    searchInputId: 'placeFilterSearchInput',
    listId: 'placeFilterList',
    chipLabelId: 'placeFilterChipLabel',
    warningId: 'placeFilterWarning',
    emptyLabel: 'كل الأماكن',
    nounSingular: 'مكان واحد محدَّد',
    nounPlural: n => `${n} أماكن محدَّدة`,
    // بلدات وقرى معاً في قائمة واحدة قابلة للبحث (#85 خطوة 40-42) — معرّف
    // البلدة اسمها نفسه، ومعرّف القرية رقمي؛ كلاهما يُميَّز بـ`kind`.
    options() {
      return [
        ...townsList.map(name => ({ kind: 'town', id: name, label: name })),
        ...villagesList.map(v => ({ kind: 'village', id: v.id, label: v.name }))
      ];
    },
    selected() {
      return [
        ...selectedTowns.map(name => ({ kind: 'town', id: name })),
        ...selectedVillageIds.map(id => ({ kind: 'village', id }))
      ];
    },
    commit(tokens) {
      selectedTowns = tokens.filter(t => t.kind === 'town').map(t => t.id);
      selectedVillageIds = tokens.filter(t => t.kind === 'village').map(t => t.id);
    }
  },
  kind: {
    sheetId: 'kindFilterModal',
    searchInputId: 'kindFilterSearchInput',
    listId: 'kindFilterList',
    chipLabelId: 'kindFilterChipLabel',
    warningId: 'kindFilterWarning',
    emptyLabel: 'كل الأنواع',
    nounSingular: 'نوع واحد محدَّد',
    nounPlural: n => `${n} أنواع محدَّدة`,
    options() {
      return (occasionTypesCache || []).map(t => ({ kind: 'type', id: t.id, label: t.name, icon: t.icon }));
    },
    // الأيقونة زينة عرض بحتة فوق تسمية النوع — لا تُستعمل في البحث ولا في تسمية الرقاقة.
    optionHtml(opt) {
      return `${opt.icon ? escapeHtml(opt.icon) + ' ' : ''}${escapeHtml(opt.label)}`;
    },
    selected() {
      return selectedOccasionTypeIds.map(id => ({ kind: 'type', id }));
    },
    commit(tokens) {
      selectedOccasionTypeIds = tokens.map(t => t.id);
    }
  }
};

/** يقرأ الاختيار المحفوظ من زيارة سابقة — كل قراءة محميّة، فقيمة تالفة تعني قائمة فارغة لا صفحة معطوبة (#85 خطوة 46). */
function loadFilterSelectionFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem('negev_filter_towns') || '[]');
    selectedTowns = Array.isArray(raw) ? raw.filter(t => typeof t === 'string') : [];
  } catch (err) { selectedTowns = []; }

  try {
    const raw = JSON.parse(localStorage.getItem('negev_filter_villages') || '[]');
    selectedVillageIds = Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [];
  } catch (err) { selectedVillageIds = []; }

  try {
    const raw = JSON.parse(localStorage.getItem('negev_filter_kinds') || '[]');
    selectedOccasionTypeIds = Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [];
  } catch (err) { selectedOccasionTypeIds = []; }
}

function persistFilterSelection() {
  try { localStorage.setItem('negev_filter_towns', JSON.stringify(selectedTowns)); } catch (err) { /* التخزين المحلي معطَّل أو ممتلئ — الجلسة الحالية تبقى تعمل */ }
  try { localStorage.setItem('negev_filter_villages', JSON.stringify(selectedVillageIds)); } catch (err) {}
  try { localStorage.setItem('negev_filter_kinds', JSON.stringify(selectedOccasionTypeIds)); } catch (err) {}
}

async function initPlaceFilter() {
  const loaded = await loadTownCoordinates();
  const chip = document.getElementById('placeFilterChip');
  if (chip) {
    if (loaded) {
      chip.disabled = false;
      chip.removeAttribute('title');
    } else {
      // يبقى مقفلاً بدل أن يفتح على ورقة فارغة بلا أي تفسير (#85 FIX 10ب)
      chip.title = 'تعذّر تحميل قائمة الأماكن — أعد تحميل الصفحة للمحاولة مجدداً';
    }
  }
  updateFilterChipLabel('place');
}

async function initKindFilter() {
  await loadOccasionTypes();
  const chip = document.getElementById('kindFilterChip');
  if (chip) chip.disabled = false;
  updateFilterChipLabel('kind');
}

function openFilterSheet(key) {
  const cfg = FILTER_SHEETS[key];
  if (!cfg) return;
  filterSheetActiveKey = key;
  filterSheetDraft = cfg.selected();
  const searchInput = document.getElementById(cfg.searchInputId);
  if (searchInput) searchInput.value = '';
  hideFilterSheetWarning(cfg);
  renderFilterSheetList();
  const modal = document.getElementById(cfg.sheetId);
  if (modal) modal.style.display = 'flex';
}

function closeFilterSheet(key) {
  const cfg = FILTER_SHEETS[key];
  if (!cfg) return;
  const modal = document.getElementById(cfg.sheetId);
  if (modal) modal.style.display = 'none';
}

/** تُعيد رسم قائمة الورقة المفتوحة حالياً — بحث و«تطبيق» يستدعيانها معاً. */
function renderFilterSheetList() {
  const cfg = FILTER_SHEETS[filterSheetActiveKey];
  if (!cfg) return;
  const list = document.getElementById(cfg.listId);
  if (!list) return;

  const searchInput = document.getElementById(cfg.searchInputId);
  const query = ((searchInput && searchInput.value) || '').trim();
  const options = cfg.options().filter(opt => !query || opt.label.includes(query));

  if (!options.length) {
    list.innerHTML = `<p class="filter-sheet-empty">لا نتائج مطابقة</p>`;
    return;
  }

  list.innerHTML = options.map(opt => {
    const checked = filterSheetDraft.some(t => t.kind === opt.kind && t.id === opt.id);
    const labelHtml = cfg.optionHtml ? cfg.optionHtml(opt) : escapeHtml(opt.label);
    return `
      <label class="filter-option-row">
        <input type="checkbox" data-kind="${escapeHtml(opt.kind)}" data-id="${escapeHtml(String(opt.id))}" ${checked ? 'checked' : ''} onchange="toggleFilterSheetOption(this)">
        <span>${labelHtml}</span>
      </label>`;
  }).join('');
}

/** بلدة معرَّفة باسمها نصّاً، وقرية/نوع مناسبة برقم — لا نحوّل البلدة رقماً. */
function filterOptionIdFromDataset(kind, rawId) {
  return kind === 'town' ? rawId : Number(rawId);
}

function toggleFilterSheetOption(checkbox) {
  const cfg = FILTER_SHEETS[filterSheetActiveKey];
  if (!cfg) return;
  const kind = checkbox.dataset.kind;
  const id = filterOptionIdFromDataset(kind, checkbox.dataset.id);

  if (checkbox.checked) {
    const sameKindCount = filterSheetDraft.filter(t => t.kind === kind).length;
    if (sameKindCount >= FILTER_MAX_VALUES_PER_KIND) {
      // يرتدّ عن الاختيار — لا يبني طلباً سيرفضه الخادم بـ400 أصلاً (#85 FIX 2)
      checkbox.checked = false;
      const noun = FILTER_KIND_NOUNS[kind] || 'عنصر';
      showFilterSheetWarning(cfg, `لا يمكن اختيار أكثر من ${FILTER_MAX_VALUES_PER_KIND} ${noun} في هذا الفلتر`);
      return;
    }
    filterSheetDraft = [...filterSheetDraft, { kind, id }];
  } else {
    filterSheetDraft = filterSheetDraft.filter(t => !(t.kind === kind && t.id === id));
  }
  hideFilterSheetWarning(cfg);
}

function showFilterSheetWarning(cfg, message) {
  const el = document.getElementById(cfg.warningId);
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function hideFilterSheetWarning(cfg) {
  const el = document.getElementById(cfg.warningId);
  if (!el) return;
  el.hidden = true;
}

function applyFilterSheet() {
  const cfg = FILTER_SHEETS[filterSheetActiveKey];
  if (!cfg) return;
  cfg.commit(filterSheetDraft);
  persistFilterSelection();
  updateFilterChipLabel(filterSheetActiveKey);
  closeFilterSheet(filterSheetActiveKey);
  fetchEvents();
}

/**
 * يحلّ اسم رمز واحد ({kind, id}) من خيارات هذه الورقة — أو null إن تعذّر: قرية
 * حذفها الأدمن، أو عرض سبق وصول GET /api/towns (#85 FIX 1).
 */
function resolveFilterOptionLabel(cfg, token) {
  const match = cfg.options().find(opt => opt.kind === token.kind && opt.id === token.id);
  return match ? match.label : null;
}

/**
 * نص الرقاقة المغلقة — لا يعود أبداً لـ«لا شيء مختار» طالما هناك اختيار فعلي،
 * حتى حين يتعذّر حلّ اسمه: حينها تُعرَض العدّة («٢ أماكن محدَّدة») لا الفراغ
 * (#85 FIX 1 — رقاقة تقول «كل الأماكن» فوق فلتر فعلي تمنع المستخدم من الوصول
 * لزرّ «مسح الفلاتر» أصلاً، وهذا اللغز الذي وُجد الزرّ ليمنعه).
 */
function filterChipLabelText(cfg, tokens) {
  if (!tokens.length) return cfg.emptyLabel;
  const resolvedNames = tokens.map(t => resolveFilterOptionLabel(cfg, t)).filter(Boolean);
  if (!resolvedNames.length) {
    return tokens.length === 1 ? cfg.nounSingular : cfg.nounPlural(tokens.length);
  }
  if (tokens.length === 1) return resolvedNames[0];
  return `${resolvedNames[0]} +${tokens.length - 1}`;
}

function updateFilterChipLabel(key) {
  const cfg = FILTER_SHEETS[key];
  if (!cfg) return;
  const label = document.getElementById(cfg.chipLabelId);
  if (!label) return;
  label.textContent = filterChipLabelText(cfg, cfg.selected());
}

/** «مسح الفلاتر» ظاهر دائماً — لا فقط حين يوجد اختيار — لئلّا تصير التغذية الفارغة لغزاً (#85 خطوة 45). */
function clearAllFilters() {
  selectedTowns = [];
  selectedVillageIds = [];
  selectedOccasionTypeIds = [];
  persistFilterSelection();
  updateFilterChipLabel('place');
  updateFilterChipLabel('kind');
  fetchEvents();
}

function handleSearch() {
  const val = document.getElementById('eventSearchInput').value.trim();
  searchQuery = val;
  const clearBtn = document.getElementById('clearSearchBtn');
  clearBtn.style.display = val ? 'block' : 'none';
  fetchEvents();
}

function clearSearch() {
  document.getElementById('eventSearchInput').value = '';
  searchQuery = '';
  document.getElementById('clearSearchBtn').style.display = 'none';
  fetchEvents();
}

// 12. Occasion Type Picker & Dynamic Publish Form (#20 step 9)
//
// النموذج لم يعد ثابتاً — نوع المناسبة (من GET /api/occasion-types، لا قائمة
// مكتوبة هنا) يقرّر أي الحقول تظهر، بأي تسمية، وأيّها إجباري. أضف الخادم
// نوعاً جديداً غداً فسيظهر هنا بلا أي تغيير في هذا الملف.

/** يجلب أنواع المناسبات مرة واحدة فقط ويخزّنها. */
async function loadOccasionTypes() {
  if (occasionTypesCache) return occasionTypesCache;
  occasionTypesCache = await fetchActiveOccasionTypes();
  return occasionTypesCache;
}

/** يبني منتقي الأنواع (خطوة أولى في النموذج) ويختار أول نوع نشِط تلقائياً. */
async function initPublishForm() {
  await loadTownCoordinates();
  const picker = document.getElementById('occasionTypePicker');
  const types = await loadOccasionTypes();

  if (!types.length) {
    picker.innerHTML = '<p class="location-picker-hint">لا توجد أنواع مناسبات متاحة حالياً</p>';
    return;
  }

  picker.innerHTML = types.map(t => `
    <button type="button" class="town-pill occasion-type-pill" data-type-id="${t.id}" onclick="selectOccasionType(${t.id})">
      ${t.icon ? escapeHtml(t.icon) + ' ' : ''}${escapeHtml(t.name)}
    </button>
  `).join('');

  selectOccasionType(types[0].id);
  // Only now is the form genuinely built. Set on success, so the early return
  // above (no types available) leaves the next visit free to try again.
  publishFormReady = true;
}

function selectOccasionType(typeId) {
  const type = occasionTypesCache.find(t => t.id === typeId);
  if (!type) return;

  document.querySelectorAll('#occasionTypePicker .occasion-type-pill').forEach(pill => {
    pill.classList.toggle('active', Number(pill.dataset.typeId) === typeId);
  });

  renderOccasionForm(type);
}

/**
 * تُصنَع مرّة واحدة فقط، لا في كل استدعاء لـrenderOccasionForm — الدوال التي
 * تحملها (overrides، suffixes، renderHonoreeAddButton) لا حالة لها،
 * وbuildOccasionFieldsHtml (occasionForm.js) هي مالكة الحقول الأربعة عشر
 * المشتركة؛ هنا فقط أسماء معالجات onchange الخاصة بهذه الصفحة، وثلاثة حقول
 * ذات استبدال كامل (صناديق رفع مزخرَفة لا تملك اللوحة CSS لها)، وحقل واحد
 * بإلحاق فقط: location_name يبقى على الشكل الافتراضي نفسه (نص عادي بالتسمية
 * والتسمية الاحتياطية اللتين تملكهما اللوحة أيضاً)، وتُلحَق خريطة Leaflet
 * بعده — لا نسخة ثانية من ذلك الحقل النصّي.
 */
const PUBLISH_FORM_FIELD_CTX = {
  idPrefix: 'add',
  groupUploads: true,
  onTownChange: 'handleAddTownChange',
  onVillageChange: 'handleAddVillageChange',
  onDateChange: 'checkDateCollisionLive',
  renderHonoreeAddButton: containerId => `
    <button type="button" class="add-nokoot-btn" style="margin-top:6px;" onclick="addHonoreeRow('${containerId}')">
      <i class="fa-solid fa-plus"></i> إضافة اسم
    </button>`,
  suffixes: {
    location_name: () => `
      <div class="form-group">
        <div class="location-picker-toolbar">
          <label>حدّد الموقع على الخريطة</label>
          <button type="button" id="useMyLocationBtn" class="use-location-btn" onclick="centerPickerOnMyLocation()" style="display:none;">
            <i class="fa-solid fa-location-crosshairs"></i> موقعي الآن (لتوسيط الخريطة فقط)
          </button>
        </div>
        <div id="addLocationPickerMap" class="location-picker-map"></div>
        <p class="location-picker-hint">اسحب الدبّوس إلى الموقع الصحيح، أو انقر على المكان على الخريطة</p>
        <input type="hidden" id="addLat">
        <input type="hidden" id="addLng">
      </div>`
  },
  overrides: {
    poster_url: (field, { label, req }) => `
      <div class="poster-field">
        <div class="upload-box" id="posterUploadBox">
          <i class="fa-solid fa-image upload-icon"></i>
          <h4>${label}${req}</h4>
          <p>اختر صورة من الهاتف</p>
          <input type="file" id="addPosterFile" accept="image/*">
        </div>
        <div id="posterCropEditor" class="poster-crop-editor" hidden>
          <div class="poster-crop-canvas-wrap">
            <canvas id="posterCropCanvas"></canvas>
            <div class="poster-crop-guide" id="posterCropGuide"></div>
            <div class="poster-crop-box" id="posterCropBox">
              <div class="poster-crop-handle" data-corner="tl"></div>
              <div class="poster-crop-handle" data-corner="tr"></div>
              <div class="poster-crop-handle" data-corner="bl"></div>
              <div class="poster-crop-handle" data-corner="br"></div>
            </div>
          </div>
          <p class="poster-crop-hint">اسحب زوايا المربع لتحديد الجزء الذي تريد إظهاره، أو اسحب من الوسط لتحريكه. المربع المنقّط توضيحي فقط لما ستعرضه بطاقة المشاركة، ولا يفرض عليك شيئاً.</p>
          <div class="poster-crop-actions">
            <button type="button" class="submit-btn" onclick="confirmPosterCrop()">تأكيد القص</button>
            <button type="button" class="record-nokoot-btn" onclick="usePosterWholeImage()">استخدام الصورة كاملة</button>
          </div>
        </div>
        <div id="posterCropPreview" class="poster-crop-preview" hidden>
          <img id="posterCropPreviewImg" alt="الصورة بعد القص">
          <button type="button" class="record-nokoot-btn" onclick="reopenPosterCropEditor()">
            <i class="fa-solid fa-crop"></i> تعديل الاقتصاص
          </button>
          <button type="button" class="record-nokoot-btn" onclick="choosePosterAgain()">
            <i class="fa-solid fa-rotate"></i> اختيار صورة أخرى
          </button>
        </div>
      </div>`,
    audio_url: (field, { label, req }) => `
      <div class="upload-box audio-upload">
        <i class="fa-solid fa-music upload-icon"></i>
        <h4>${label}${req}</h4>
        <p>أرفق شيلة أو مقطعاً صوتياً (MP3/M4A)</p>
        <input type="file" id="addAudioFile" accept="audio/*">
      </div>`,
    artist_image_url: (field, { label, req }) => `
      <div class="upload-box">
        <i class="fa-solid fa-image upload-icon"></i>
        <h4>${label}${req}</h4>
        <p>صورة الفنان (اختياري)</p>
        <input type="file" id="addArtistImageFile" accept="image/*">
      </div>`
  }
};

/** يبني بقية النموذج من حقول هذا النوع تحديداً — الظاهر فقط، بتسميته هو. */
function renderOccasionForm(type) {
  selectedOccasionType = type;

  const container = document.getElementById('dynamicFormFields');
  container.innerHTML = buildOccasionFieldsHtml(type, PUBLISH_FORM_FIELD_CTX);

  const fieldsByKey = {};
  for (const f of type.fields) fieldsByKey[f.field_key] = f;

  if (fieldsByKey.town) {
    populateTownSelect('addTown');
    updateVillagePickerVisibility();
  }

  const dateInput = document.getElementById('addEventDate');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  if (fieldsByKey.honorees) addHonoreeRow('addHonoreesList');

  // المربّع أُعيد بناؤه للتو ضمن innerHTML أعلاه — أي مستمع سابق مات معه.
  initPosterCropField();

  // الخريطة مرتبطة بعنصر DOM أُعيد إنشاؤه للتو — أي مرجع قديم لها أصبح ميتاً.
  locationPickerMap = null;
  locationPickerMarker = null;
  pickerPinPlacedByUser = false;
  if (fieldsByKey.location_name) initLocationPickerMap();

  document.getElementById('collisionAlert').style.display = 'none';
}

/**
 * تغيير البلدة أثناء النشر — نفس التحقّق الحيّ من قبل، بالإضافة إلى إظهار/إخفاء
 * منتقي القرية. الترتيب مقصود: يعيد توسيط الخريطة على البلدة الجديدة أولاً،
 * ثم يقرّر منتقي القرية إن كان عليه أن يفرض مركزاً مختلفاً فوقه.
 */
function handleAddTownChange() {
  checkDateCollisionLive();
  recenterLocationPicker();
  updateVillagePickerVisibility();
}

/** يُظهر منتقي القرية فقط تحت بند "القرى والتجمعات"، ويملؤه من villagesList المجلوبة سلفاً. */
function updateVillagePickerVisibility() {
  const townSelect = document.getElementById('addTown');
  const group = document.getElementById('addVillageGroup');
  if (!townSelect || !group) return;

  const isVillages = townSelect.value === VILLAGES_TOWN;
  group.style.display = isVillages ? 'block' : 'none';

  if (isVillages) {
    populateVillageSelect();
  } else {
    const villageSelect = document.getElementById('addVillage');
    if (villageSelect) villageSelect.value = '';
  }
}

function populateVillageSelect() {
  const select = document.getElementById('addVillage');
  if (!select) return;
  select.innerHTML = '<option value="">اختر القرية</option>' +
    villagesList.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
}

/** اختيار القرية يوسّط الخريطة على مركزها — ما لم يكن المستخدم قد حرّك الدبّوس يدوياً بالفعل. */
function handleAddVillageChange() {
  const villageId = document.getElementById('addVillage')?.value;
  const village = villagesList.find(v => String(v.id) === String(villageId));
  if (village && locationPickerMap) {
    locationPickerMap.setView([village.latitude, village.longitude], 14);
    if (!pickerPinPlacedByUser) placePickerMarker(village.latitude, village.longitude);
  }
}

// أصحاب المناسبة ١..N — مُدخل ديناميكي مشترك بين نموذج النشر ونافذة التعديل
// ونموذج النشر المباشر في اللوحة؛ معرَّف في web/occasionForm.js (المشترك بين
// الصفحتين)، لا هنا.

// 12b. Poster crop editor (Facebook-style) — only the poster field, never
// artist_image or audio. The client crops; the cropped bytes are what gets
// uploaded — the server is untouched, no crop coordinates are stored. The
// rectangle starts around the whole image, so a publisher who never touches
// it uploads their picture with no re-encoding beyond the 1600px cap below.

/** يُستدعى بعد كل بناء لمربّع الرفع (renderOccasionForm) — العنصر جديد دائماً. */
function initPosterCropField() {
  resetPosterCropState({ clearInput: false });
  const input = document.getElementById('addPosterFile');
  if (!input) return;
  input.addEventListener('change', handlePosterFileChosen);
  attachPosterCropDragHandlers();
}

function handlePosterFileChosen(e) {
  const file = e.target.files && e.target.files[0];
  resetPosterCropState({ clearInput: false });
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, POSTER_CROP_MAX_DIMENSION / longestEdge);
    const workingWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const workingHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const displayScale = Math.min(1, POSTER_CROP_MAX_EDITOR_WIDTH / workingWidth);

    posterCropState = {
      objectUrl,
      previewUrl: null,
      workingWidth,
      workingHeight,
      displayScale,
      rect: { x: 0, y: 0, w: workingWidth, h: workingHeight },
      drag: null,
      blob: null
    };

    const canvas = document.getElementById('posterCropCanvas');
    canvas.width = workingWidth;
    canvas.height = workingHeight;
    canvas.style.width = `${Math.round(workingWidth * displayScale)}px`;
    canvas.style.height = `${Math.round(workingHeight * displayScale)}px`;
    canvas.getContext('2d').drawImage(image, 0, 0, workingWidth, workingHeight);

    renderPosterCropGuide();
    renderPosterCropBox();
    showPosterCropEditor();
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
  };
  image.src = objectUrl;
}

/** المربّع المنقّط — أكبر مربّع مركَزي يسع الصورة، توضيحي فقط ولا يُقيَّد به شيء. */
function renderPosterCropGuide() {
  const state = posterCropState;
  const guide = document.getElementById('posterCropGuide');
  if (!state || !guide) return;

  const size = Math.min(state.workingWidth, state.workingHeight);
  const x = (state.workingWidth - size) / 2;
  const y = (state.workingHeight - size) / 2;
  guide.style.left = `${(x / state.workingWidth) * 100}%`;
  guide.style.top = `${(y / state.workingHeight) * 100}%`;
  guide.style.width = `${(size / state.workingWidth) * 100}%`;
  guide.style.height = `${(size / state.workingHeight) * 100}%`;
}

function renderPosterCropBox() {
  const state = posterCropState;
  const box = document.getElementById('posterCropBox');
  if (!state || !box) return;

  const { x, y, w, h } = state.rect;
  box.style.left = `${(x / state.workingWidth) * 100}%`;
  box.style.top = `${(y / state.workingHeight) * 100}%`;
  box.style.width = `${(w / state.workingWidth) * 100}%`;
  box.style.height = `${(h / state.workingHeight) * 100}%`;
}

/** يُوصَل بعد كل بناء لمربّع القصّ (العنصر جديد دائماً) — pointerdown وحده هنا، إذ هو ما يبدأ السحب فعلياً. move/up على المستند لا تُوصَلان إلا مع بدء سحب حقيقي، وتُفكّان معه، فلا يبقى منهما شيء بين سحبة وأخرى. */
function attachPosterCropDragHandlers() {
  const box = document.getElementById('posterCropBox');
  if (!box) return;
  box.addEventListener('pointerdown', startPosterCropDrag);
}

function startPosterCropDrag(e) {
  if (!posterCropState) return;
  const corner = e.target && e.target.dataset ? e.target.dataset.corner : null;
  posterCropState.drag = {
    corner: corner || 'move',
    startClientX: e.clientX,
    startClientY: e.clientY,
    startRect: { ...posterCropState.rect }
  };
  document.addEventListener('pointermove', movePosterCropDrag);
  document.addEventListener('pointerup', endPosterCropDrag);
  document.addEventListener('pointercancel', endPosterCropDrag);
  e.preventDefault();
}

/** حساب بالفرق (delta) عن نقطة بدء السحب — لا يعتمد على موضع العنصر في الصفحة، فيعمل بلا تخطيط حقيقي أيضاً. */
function movePosterCropDrag(e) {
  const state = posterCropState;
  if (!state || !state.drag) return;

  const dx = (e.clientX - state.drag.startClientX) / state.displayScale;
  const dy = (e.clientY - state.drag.startClientY) / state.displayScale;
  const start = state.drag.startRect;
  const corner = state.drag.corner;
  let { x, y, w, h } = start;

  if (corner === 'move') {
    x = start.x + dx;
    y = start.y + dy;
  } else {
    if (corner.includes('l')) { x = start.x + dx; w = start.w - dx; }
    if (corner.includes('r')) { w = start.w + dx; }
    if (corner.includes('t')) { y = start.y + dy; h = start.h - dy; }
    if (corner.includes('b')) { h = start.h + dy; }
  }

  state.rect = clampPosterCropRect({ x, y, w, h }, state);
  renderPosterCropBox();
}

function endPosterCropDrag() {
  if (posterCropState) posterCropState.drag = null;
  document.removeEventListener('pointermove', movePosterCropDrag);
  document.removeEventListener('pointerup', endPosterCropDrag);
  document.removeEventListener('pointercancel', endPosterCropDrag);
}

function clampPosterCropRect(rect, state) {
  let { x, y, w, h } = rect;
  w = Math.max(POSTER_CROP_MIN_SIZE, Math.min(w, state.workingWidth));
  h = Math.max(POSTER_CROP_MIN_SIZE, Math.min(h, state.workingHeight));
  x = Math.max(0, Math.min(x, state.workingWidth - w));
  y = Math.max(0, Math.min(y, state.workingHeight - h));
  return { x, y, w, h };
}

function showPosterCropEditor() {
  document.getElementById('posterUploadBox').hidden = true;
  document.getElementById('posterCropEditor').hidden = false;
  document.getElementById('posterCropPreview').hidden = true;
}

function confirmPosterCrop() {
  if (!posterCropState) return;
  exportPosterCrop(posterCropState.rect);
}

/** «استخدام الصورة كاملة» — يُعيد المربّع ليغطّي الصورة كلها ثم يصدّرها كما هي، دون قصّ. */
function usePosterWholeImage() {
  const state = posterCropState;
  if (!state) return;
  state.rect = { x: 0, y: 0, w: state.workingWidth, h: state.workingHeight };
  renderPosterCropBox();
  exportPosterCrop(state.rect);
}

/** يرسم المستطيل المحدَّد فقط من المصدر (أصلاً محدود ‎1600px‎ بالفعل) إلى قماشة جديدة ويصدّرها JPEG. */
function exportPosterCrop(rect) {
  const state = posterCropState;
  const source = document.getElementById('posterCropCanvas');
  if (!state || !source) return;

  const outWidth = Math.max(1, Math.round(rect.w));
  const outHeight = Math.max(1, Math.round(rect.h));
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  outCanvas.getContext('2d').drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, outWidth, outHeight);

  outCanvas.toBlob(blob => {
    if (!blob || !posterCropState) return;
    posterCropState.blob = blob;
    showPosterCropPreview(blob);
  }, 'image/jpeg', 0.9);
}

function showPosterCropPreview(blob) {
  const state = posterCropState;
  if (!state) return;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(blob);

  document.getElementById('posterCropPreviewImg').src = state.previewUrl;
  document.getElementById('posterUploadBox').hidden = true;
  document.getElementById('posterCropEditor').hidden = true;
  document.getElementById('posterCropPreview').hidden = false;
}

function reopenPosterCropEditor() {
  if (!posterCropState) return;
  document.getElementById('posterUploadBox').hidden = true;
  document.getElementById('posterCropEditor').hidden = false;
  document.getElementById('posterCropPreview').hidden = true;
}

/** يمحو كل شيء ويُعيد مربّع الاختيار — الطريق الوحيد لبدء صورة جديدة من الصفر. */
function choosePosterAgain() {
  resetPosterCropState({ clearInput: true });
}

function resetPosterCropState({ clearInput } = {}) {
  if (posterCropState) {
    if (posterCropState.objectUrl) URL.revokeObjectURL(posterCropState.objectUrl);
    if (posterCropState.previewUrl) URL.revokeObjectURL(posterCropState.previewUrl);
  }
  posterCropState = null;

  const uploadBox = document.getElementById('posterUploadBox');
  const editor = document.getElementById('posterCropEditor');
  const preview = document.getElementById('posterCropPreview');
  if (uploadBox) uploadBox.hidden = false;
  if (editor) editor.hidden = true;
  if (preview) preview.hidden = true;

  if (clearInput) {
    const input = document.getElementById('addPosterFile');
    if (input) input.value = '';
  }
}

// 12c. Services Directory Tab (تذكرة #31) — فئات مسطَّحة أوّلها "الكل" (نفس
// نمط تبويبات نوع المناسبة #18)، فلتر بلدة، ثم قائمة مزوّدين أبجدية مسطّحة.
// بلا رقم وبلا زرّ تواصل على الصفّ — الخادم أصلاً لا يرسل الرقم في هذه
// القائمة. الرقم يظهر فقط داخل صفحة المزوّد بعد فعل تواصل صريح.

async function initServicesTab() {
  await loadTownCoordinates(); // townsList + villagesList معاً، نداء واحد مشترك
  populateServiceTownFilter();
  await initServiceCategoryTabs();
  fetchServiceProviders();
}

function populateServiceTownFilter() {
  const select = document.getElementById('serviceTownFilter');
  if (!select) return;
  select.innerHTML = '<option value="">كل البلدات</option>' +
    townsList.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
}

function handleServiceTownFilterChange() {
  selectedServiceTown = document.getElementById('serviceTownFilter').value;
  fetchServiceProviders();
}

async function initServiceCategoryTabs() {
  const container = document.getElementById('serviceCategoryTabs');
  if (!container) return;

  try {
    const res = await apiFetch('/api/services/categories');
    const data = await res.json();
    serviceCategoriesCache = (data.success && data.categories) ? data.categories : [];
  } catch (e) {
    console.error('Service categories error:', e);
    serviceCategoriesCache = [];
  }

  const allTab = `<button class="town-pill active" data-cat-id="" onclick="selectServiceCategory(null)">الكل</button>`;
  const catTabs = serviceCategoriesCache.map(c => `
    <button class="town-pill" data-cat-id="${c.id}" onclick="selectServiceCategory(${c.id})">
      ${c.icon ? escapeHtml(c.icon) + ' ' : ''}${escapeHtml(c.name)}
    </button>
  `).join('');
  container.innerHTML = allTab + catTabs;
}

function selectServiceCategory(categoryId) {
  selectedServiceCategoryId = categoryId;
  document.querySelectorAll('#serviceCategoryTabs .town-pill').forEach(pill => {
    const pillId = pill.dataset.catId ? Number(pill.dataset.catId) : null;
    pill.classList.toggle('active', pillId === categoryId);
  });
  fetchServiceProviders();
}

async function fetchServiceProviders(options = {}) {
  const { append = false } = options;
  const container = document.getElementById('servicesListContainer');
  if (!container) return;

  if (!append) {
    servicesPage = 1;
    container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;
  }

  try {
    const params = new URLSearchParams();
    if (selectedServiceCategoryId) params.set('category_id', selectedServiceCategoryId);
    if (selectedServiceTown) params.set('town', selectedServiceTown);
    params.set('page', servicesPage);
    params.set('limit', 30);

    const res = await apiFetch(`/api/services/providers?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      serviceProvidersCache = append ? serviceProvidersCache.concat(data.providers) : data.providers;
      servicesPagination = data.pagination || null;
      renderServiceProviders(serviceProvidersCache);
      renderServicesLoadMoreButton();
    } else {
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>تعذر جلب مزوّدي الخدمات حالياً</p></div>`;
    }
  } catch (e) {
    console.error('Service providers error:', e);
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>حدث خطأ في الاتصال بالخادم</p></div>`;
  }
}

function loadMoreServiceProviders() {
  if (!servicesPagination || servicesPagination.page >= servicesPagination.totalPages) return;
  servicesPage = servicesPagination.page + 1;
  fetchServiceProviders({ append: true });
}

function renderServicesLoadMoreButton() {
  const wrapper = document.getElementById('servicesLoadMoreWrapper');
  if (!wrapper) return;
  const hasMore = !!(servicesPagination && servicesPagination.page < servicesPagination.totalPages);
  wrapper.style.display = hasMore ? 'block' : 'none';
}

/** قائمة مسطّحة مرتّبة أبجدياً: الاسم · الفئة · البلدات · الصورة — لا رقم ولا زرّ تواصل هنا (#25). */
function renderServiceProviders(providers) {
  const container = document.getElementById('servicesListContainer');
  if (!providers || !providers.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-screwdriver-wrench"></i>
        <h3>لا يوجد مزوّدون بعد</h3>
        <p>سيُضيف الأدمن مزوّدي الخدمات قريباً</p>
      </div>`;
    return;
  }

  const sorted = [...providers].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  container.innerHTML = sorted.map(p => `
    <div class="provider-row" onclick="openProviderModal(${p.id})">
      <div class="provider-avatar">
        ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">` : `<i class="fa-solid fa-shop"></i>`}
      </div>
      <div class="provider-info">
        <b>${escapeHtml(p.name)}</b>
        <small>${escapeHtml(p.category_name || '')}${(p.towns && p.towns.length) ? ' · ' + escapeHtml(p.towns.join('، ')) : ''}</small>
      </div>
    </div>
  `).join('');
}

/** فتح صفحة المزوّد: الوصف والصورة أولاً، والرقم خلف زرّ تواصل صريح — لا يُعرَض تلقائياً (#25). */
async function openProviderModal(providerId) {
  try {
    const res = await apiFetch(`/api/services/providers/${providerId}`);
    const data = await res.json();
    if (!data.success) return;

    const p = data.provider;
    currentProviderPhone = p.phone || '';

    document.getElementById('providerModalName').textContent = p.name;
    document.getElementById('providerModalCategory').textContent = p.category_name || '';

    const img = document.getElementById('providerModalImage');
    if (p.image_url) {
      img.src = p.image_url;
      img.alt = p.name;
      img.hidden = false;
    } else {
      img.hidden = true;
    }

    document.getElementById('providerModalDescription').textContent = p.description || '';
    document.getElementById('providerModalTowns').textContent = (p.towns && p.towns.length)
      ? `يخدم: ${p.towns.join('، ')}` : '';

    document.getElementById('providerContactArea').innerHTML = `
      <button type="button" class="submit-btn" onclick="revealProviderPhone()">
        <i class="fa-solid fa-phone"></i> إظهار رقم التواصل
      </button>`;

    document.getElementById('providerModal').style.display = 'flex';
  } catch (e) {
    console.error('Provider fetch error:', e);
  }
}

/** الفعل الصريح الذي يكشف الرقم — لا يظهر بأي مسار آخر. */
function revealProviderPhone() {
  if (!currentProviderPhone) return;
  document.getElementById('providerContactArea').innerHTML = `
    <a class="submit-btn" href="tel:${escapeHtml(currentProviderPhone)}" style="text-decoration:none; display:flex; align-items:center; justify-content:center; gap:8px;">
      <i class="fa-solid fa-phone"></i> ${escapeHtml(currentProviderPhone)}
    </a>`;
}

function closeProviderModal() {
  document.getElementById('providerModal').style.display = 'none';
}

// 13. Add Event & Collision Check
async function checkDateCollisionLive() {
  const dateInput = document.getElementById('addEventDate');
  const townInput = document.getElementById('addTown');
  const alertBox = document.getElementById('collisionAlert');
  if (!dateInput || !alertBox) return;

  const date = dateInput.value;
  const town = townInput ? townInput.value : null;
  const endDateInput = document.getElementById('addEventEndDate');

  if (!date) {
    alertBox.style.display = 'none';
    return;
  }

  try {
    const res = await apiFetch('/api/check-collision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        town,
        event_end_date: endDateInput ? endDateInput.value : undefined,
        occasion_type_id: selectedOccasionType ? selectedOccasionType.id : undefined
      })
    });
    const data = await res.json();

    if (data.hasCollision) {
      alertBox.style.display = 'block';
      alertBox.className = 'collision-box warn';
      alertBox.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        <strong>تنبيه تضارب مواعيد:</strong> يوجد بالفعل (${data.count}) مناسبة مسجلة في <strong>${town}</strong> في تاريخ ${date}.
      `;
    } else {
      alertBox.style.display = 'block';
      alertBox.className = 'collision-box safe';
      alertBox.innerHTML = `
        <i class="fa-solid fa-circle-check"></i>
        <strong>الموعد متاح وممتاز:</strong> لا يوجد تضارب في مناسبات <strong>${town}</strong> في هذا اليوم.
      `;
    }
  } catch (e) {
    console.error('Collision check error:', e);
  }
}

async function handleEventSubmit(e) {
  e.preventDefault();
  if (!requireAuth({ type: 'publish' })) return;

  const type = selectedOccasionType;
  if (!type) {
    alert('يرجى اختيار نوع المناسبة أولاً');
    return;
  }

  const fieldsByKey = {};
  for (const f of type.fields) fieldsByKey[f.field_key] = f;
  const labelOf = key => (fieldsByKey[key] && fieldsByKey[key].label) || key;

  const honorees = collectHonorees('addHonoreesList');
  if (!honorees.length) {
    alert(`${labelOf('honorees')} مطلوب`);
    return;
  }

  const town = document.getElementById('addTown').value;

  // قاعدة تكامل الخادم نفسها: قرية إلزامية تحت "القرى والتجمعات" فقط، ومُرسَلة
  // فقط عندها — بلدة أخرى لا تُرسِل village_id إطلاقاً (خريطة #21، تذكرة #23).
  let villageId = null;
  if (town === VILLAGES_TOWN) {
    villageId = document.getElementById('addVillage')?.value || '';
    if (!villageId) {
      alert('يرجى اختيار القرية');
      return;
    }
  }

  const eventDate = document.getElementById('addEventDate').value;
  if (!eventDate) {
    alert(`${labelOf('event_date')} مطلوب`);
    return;
  }

  // نفس تحقّق الإجبارية الذي يطبّقه الخادم من إعداد النوع نفسه — قبل الإرسال
  // لا بعده، برسالة تحمل تسمية الحقل في هذا النوع تحديداً.
  const textFieldGetters = {
    title: () => document.getElementById('addTitle')?.value.trim(),
    family_clan: () => document.getElementById('addFamily')?.value.trim(),
    location_name: () => document.getElementById('addLocationName')?.value.trim(),
    secondary_location_name: () => document.getElementById('addSecondaryLocationName')?.value.trim(),
    event_end_date: () => document.getElementById('addEventEndDate')?.value,
    youth_party_date: () => document.getElementById('addYouthDate')?.value,
    dinner_time: () => document.getElementById('addDinnerTime')?.value.trim(),
    host_phone: () => document.getElementById('addHostPhone')?.value.trim(),
    audio_title: () => document.getElementById('addAudioTitle')?.value.trim(),
    poster_url: () => document.getElementById('addPosterFile')?.files[0],
    audio_url: () => document.getElementById('addAudioFile')?.files[0],
    artist_name: () => document.getElementById('addArtistName')?.value.trim(),
    artist_image_url: () => document.getElementById('addArtistImageFile')?.files[0]
  };

  const missingFieldLabel = firstMissingRequiredField(type, textFieldGetters);
  if (missingFieldLabel) {
    alert(`${missingFieldLabel} مطلوب`);
    return;
  }

  const btn = document.getElementById('submitEventBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';

  const formData = new FormData();
  formData.append('occasion_type_id', type.id);
  appendHonoreesToFormData(formData, honorees);
  formData.append('town', town);
  if (villageId) formData.append('village_id', villageId);
  formData.append('event_date', eventDate);

  const latInput = document.getElementById('addLat');
  const lngInput = document.getElementById('addLng');
  if (latInput && latInput.value) formData.append('latitude', latInput.value);
  if (lngInput && lngInput.value) formData.append('longitude', lngInput.value);

  if (fieldsByKey.title) formData.append('title', document.getElementById('addTitle').value);
  if (fieldsByKey.family_clan) formData.append('family_clan', document.getElementById('addFamily').value);
  if (fieldsByKey.location_name) formData.append('location_name', document.getElementById('addLocationName').value);
  if (fieldsByKey.secondary_location_name) formData.append('secondary_location_name', document.getElementById('addSecondaryLocationName').value);
  if (fieldsByKey.event_end_date) formData.append('event_end_date', document.getElementById('addEventEndDate').value);
  if (fieldsByKey.youth_party_date) formData.append('youth_party_date', document.getElementById('addYouthDate').value);
  if (fieldsByKey.dinner_time) formData.append('dinner_time', document.getElementById('addDinnerTime').value);
  if (fieldsByKey.host_phone) formData.append('host_phone', document.getElementById('addHostPhone').value);
  if (fieldsByKey.audio_title) formData.append('audio_title', document.getElementById('addAudioTitle').value);
  if (fieldsByKey.artist_name) formData.append('artist_name', document.getElementById('addArtistName').value);

  if (fieldsByKey.poster_url) {
    // القص اختياري: القيمة المقصوصة هي ما يُرفع إن وُجدت، والملف الخام كما
    // هو إن لم يكتمل مسار القص لأي سبب (مثلاً فشل تحميل الصورة في المحرِّر) —
    // اسم صريح ثالث لـ`append` لا غنى عنه، وإلا صار originalname الحرفي "blob"
    // بلا امتداد (server/src/middleware/upload.js).
    if (posterCropState && posterCropState.blob) {
      formData.append('poster', posterCropState.blob, 'poster.jpg');
    } else {
      const posterFile = document.getElementById('addPosterFile').files[0];
      if (posterFile) formData.append('poster', posterFile);
    }
  }
  if (fieldsByKey.audio_url) {
    const audioFile = document.getElementById('addAudioFile').files[0];
    if (audioFile) formData.append('audio', audioFile);
  }
  if (fieldsByKey.artist_image_url) {
    const artistImageFile = document.getElementById('addArtistImageFile').files[0];
    if (artistImageFile) formData.append('artist_image', artistImageFile);
  }

  // بدء فعلي للنشر (تذكرة #44) — بعد كل التحقق المحلي أعلاه، لا عند فتح
  // النموذج أو الضغط الأول على الزر بلا اكتمال الحقول.
  recordAnalyticsEvent('publish_started', { contentTown: town });

  try {
    const res = await apiFetch('/api/events', { method: 'POST', body: formData, auth: true });
    const data = await res.json();

    if (data.success) {
      if (data.status === 'pending') {
        alert('✅ تم إرسال طلب إعلان المناسبة بنجاح!\n\nطلبك الآن قيد مراجعة واعتماد الإدارة، وسيتم نشره على التطبيق بعد التحقق خلال دقائق.');
      } else {
        showToast('🎉 تم نشر المناسبة بنجاح!');
      }
      // تنبيه ليّن من الخادم — البلدة والإحداثيات كما اختارها المستخدم بالضبط،
      // هذا إعلام لا رفض، والنشر أعلاه مضى فعلاً (#20 step 6, decision ٦).
      if (data.location_warning) {
        alert(`⚠️ ${data.location_warning.message}`);
      }
      document.getElementById('addEventForm').reset();
      document.getElementById('collisionAlert').style.display = 'none';
      updateVillagePickerVisibility();
      clearPickerMarker();
      resetPosterCropState({ clearInput: false });
      const honoreesList = document.getElementById('addHonoreesList');
      if (honoreesList) {
        honoreesList.innerHTML = '';
        addHonoreeRow('addHonoreesList');
      }
      fetchMyEvents();
      switchTab('tabHome');
      fetchEvents();
    } else {
      alert(data.message || 'حدث خطأ أثناء النشر');
      // فشل بسبب الصورة/الملف تحديداً (متعدّد multer، error.js) يُسجَّل باسمه
      // الخاص لا كفشل نشر عام — الاثنان مفتاحان منفصلان في القائمة المغلقة.
      recordAnalyticsEvent(
        isMediaUploadErrorMessage(data.message) ? 'image_upload_failed' : 'publish_failed',
        { contentTown: town }
      );
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
    recordAnalyticsEvent('publish_failed', { contentTown: town });
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال طلب إعلان المناسبة للإدارة للمراجعة';
  }
}

// 14. "مناسباتي" — ownership & editing (#20 step 9)
const MY_EVENT_STATUS_LABELS = { approved: 'منشورة', pending: 'قيد المراجعة', rejected: 'مرفوضة' };

async function fetchMyEvents() {
  const container = document.getElementById('myEventsList');
  if (!container || !currentUser || !authToken) return;

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>جاري جلب مناسباتك...</p></div>';

  try {
    const res = await apiFetch('/api/my-events', { auth: true });
    const data = await res.json();
    if (!data.success) {
      container.innerHTML = '<div class="empty-state"><p>تعذر جلب مناسباتك</p></div>';
      return;
    }
    myEventsCache = data.events;
    renderMyEvents(myEventsCache);
  } catch (e) {
    console.error('My events error:', e);
    container.innerHTML = '<div class="empty-state"><p>تعذر جلب مناسباتك</p></div>';
  }
}

function renderMyEvents(events) {
  const container = document.getElementById('myEventsList');
  if (!events || !events.length) {
    container.innerHTML = '<div class="empty-state"><p>لم تنشر أي مناسبة بعد</p></div>';
    return;
  }

  container.innerHTML = events.map(evt => `
    <div class="event-card">
      <div class="card-header-bar">
        <div class="card-clan-town">
          <span class="town-badge">${escapeHtml(evt.town)}</span>
          <span class="clan-text">${escapeHtml(evt.occasion_type?.name || '')}</span>
        </div>
        <span class="status-tag ${evt.status}">${MY_EVENT_STATUS_LABELS[evt.status] || evt.status}</span>
      </div>
      <div class="card-body">
        <h2 class="event-main-title">${escapeHtml(evt.title || evt.groom_name)}</h2>
        <div class="detail-item">
          <i class="fa-solid fa-calendar-day"></i>
          <span>${evt.event_date}</span>
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="record-nokoot-btn" style="flex:1;" onclick="openEditEventModal(${evt.id})">
            <i class="fa-solid fa-pen"></i> تعديل
          </button>
          <button class="record-nokoot-btn" style="flex:1;" onclick="openCongratsQueueModal(${evt.id})">
            <i class="fa-solid fa-list-check"></i> مراجعة الرسائل
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// 14b. مراجعة التبريكات/التعازي — طابور مناسبة يملكها المستخدم الحالي (#20 step 10).
// GET .../congratulations?status=pending، والمفتاح في الاستجابة هو `comments`.
async function openCongratsQueueModal(eventId) {
  congratsQueueEventId = eventId;
  const modal = document.getElementById('congratsQueueModal');
  const list = document.getElementById('congratsQueueList');
  modal.style.display = 'flex';
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch(`/api/events/${eventId}/congratulations?status=pending`, { auth: true });
    const data = await res.json();
    if (data.success) {
      renderCongratsQueue(data.comments);
    } else {
      list.innerHTML = `<div class="empty-state" style="padding:20px;"><p>${escapeHtml(data.message || 'تعذر جلب الطابور')}</p></div>`;
    }
  } catch (e) {
    list.innerHTML = '<div class="empty-state" style="padding:20px;"><p>تعذر جلب الطابور</p></div>';
  }
}

function renderCongratsQueue(comments) {
  const list = document.getElementById('congratsQueueList');
  if (!comments || !comments.length) {
    list.innerHTML = '<div class="empty-state" style="padding:20px;"><p>لا توجد رسائل قيد المراجعة</p></div>';
    return;
  }

  list.innerHTML = comments.map(c => `
    <div class="chat-bubble">
      <div class="chat-bubble-header">
        <span class="sender-name">${escapeHtml(c.sender_name)}</span>
        ${c.badge_title ? `<span class="sender-badge">${escapeHtml(c.badge_title)}</span>` : ''}
      </div>
      <div class="chat-msg-text">${escapeHtml(c.message)}</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="record-nokoot-btn" onclick="moderateCongratsItem(${c.id}, 'approve')"><i class="fa-solid fa-check"></i> اعتماد</button>
        <button class="nokoot-del-btn" onclick="moderateCongratsItem(${c.id}, 'reject')"><i class="fa-solid fa-xmark"></i> رفض</button>
        <button class="nokoot-del-btn" onclick="deleteCongratsItem(${c.id})"><i class="fa-solid fa-trash"></i> حذف</button>
      </div>
    </div>
  `).join('');
}

async function moderateCongratsItem(congratulationId, action) {
  if (!congratsQueueEventId) return;
  try {
    const res = await apiFetch(`/api/events/${congratsQueueEventId}/congratulations/${congratulationId}`, {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.success) {
      showToast(action === 'approve' ? 'تم اعتماد الرسالة' : 'تم رفض الرسالة');
      openCongratsQueueModal(congratsQueueEventId);
    } else {
      alert(data.message || 'تعذر تنفيذ الإجراء');
    }
  } catch (e) {
    alert('تعذر تنفيذ الإجراء');
  }
}

async function deleteCongratsItem(congratulationId) {
  if (!congratsQueueEventId) return;
  if (!confirm('هل تريد حذف هذه الرسالة؟')) return;
  try {
    const res = await apiFetch(`/api/events/${congratsQueueEventId}/congratulations/${congratulationId}`, {
      method: 'DELETE',
      auth: true
    });
    const data = await res.json();
    if (data.success) {
      openCongratsQueueModal(congratsQueueEventId);
    } else {
      alert(data.message || 'تعذر الحذف');
    }
  } catch (e) {
    alert('تعذر الحذف');
  }
}

function closeCongratsQueueModal() {
  document.getElementById('congratsQueueModal').style.display = 'none';
  congratsQueueEventId = null;
}

/**
 * يطبّق إعداد النوع على نموذج التعديل الثابت: يخفي ما لا يخصّ هذا النوع
 * ويعيد تسمية ما يبقى بتسميته فيه. بدون هذا يعرض تعديلُ عزاءٍ حقلَ «سهرة
 * الشباب والدحة» — وهو نفس الأذى الذي بُني نموذج النشر كلّه لتجنّبه.
 */
function applyOccasionTypeToEditForm(evt) {
  const EDIT_FIELD_INPUTS = {
    honorees: 'editHonoreesList',
    title: 'editTitle',
    town: 'editTown',
    family_clan: 'editFamily',
    event_date: 'editEventDate',
    event_end_date: 'editEventEndDate',
    youth_party_date: 'editYouthDate',
    location_name: 'editLocationName',
    secondary_location_name: 'editSecondaryLocationName',
    dinner_time: 'editDinnerTime',
    host_phone: 'editHostPhone'
  };

  const typeId = evt.occasion_type && evt.occasion_type.id;
  const type = occasionTypesCache.find(t => t.id === typeId);

  const fieldsByKey = {};
  if (type) for (const f of type.fields) fieldsByKey[f.field_key] = f;

  for (const [fieldKey, elementId] of Object.entries(EDIT_FIELD_INPUTS)) {
    const el = document.getElementById(elementId);
    if (!el) continue;
    const group = el.closest('.form-group');
    if (!group) continue;

    // نوع غير معروف للواجهة (نسخة أقدم من الأنواع) — أظهر كل شيء بدل إخفاء
    // حقل يحمل بيانات حقيقية.
    const field = type ? fieldsByKey[fieldKey] : { label: null, is_required: false };
    if (!field) {
      group.style.display = 'none';
      continue;
    }

    group.style.display = '';
    const label = group.querySelector('label');
    if (label && field.label) label.textContent = field.label + (field.is_required ? ' *' : '');
  }
}

function openEditEventModal(eventId) {
  const evt = myEventsCache.find(e => e.id === eventId);
  if (!evt) return;

  document.getElementById('editEventId').value = evt.id;
  document.getElementById('editTitle').value = evt.title || '';
  document.getElementById('editFamily').value = evt.family_clan || '';
  populateTownSelect('editTown', evt.town);
  document.getElementById('editEventDate').value = evt.event_date || '';
  document.getElementById('editEventEndDate').value = evt.event_end_date || '';
  document.getElementById('editYouthDate').value = evt.youth_party_date || '';
  document.getElementById('editLocationName').value = evt.location_name || '';
  document.getElementById('editSecondaryLocationName').value = evt.secondary_location_name || '';
  document.getElementById('editDinnerTime').value = evt.dinner_time || '';
  document.getElementById('editHostPhone').value = evt.host_phone || '';

  const honoreesList = document.getElementById('editHonoreesList');
  honoreesList.innerHTML = '';
  const honorees = (evt.honorees && evt.honorees.length) ? evt.honorees : [{ name: evt.groom_name || '', role: '' }];
  honorees.forEach(h => addHonoreeRow('editHonoreesList', h.name, h.role || ''));

  applyOccasionTypeToEditForm(evt);
  document.getElementById('editEventModal').style.display = 'flex';
}

function closeEditEventModal() {
  document.getElementById('editEventModal').style.display = 'none';
}

async function handleEventEditSubmit(e) {
  e.preventDefault();
  const eventId = document.getElementById('editEventId').value;

  const honorees = collectHonorees('editHonoreesList');
  if (!honorees.length) {
    alert('يجب إدخال اسم واحد على الأقل لأصحاب المناسبة');
    return;
  }

  const payload = {
    title: document.getElementById('editTitle').value,
    family_clan: document.getElementById('editFamily').value,
    town: document.getElementById('editTown').value,
    event_date: document.getElementById('editEventDate').value,
    event_end_date: document.getElementById('editEventEndDate').value,
    youth_party_date: document.getElementById('editYouthDate').value,
    location_name: document.getElementById('editLocationName').value,
    secondary_location_name: document.getElementById('editSecondaryLocationName').value,
    dinner_time: document.getElementById('editDinnerTime').value,
    host_phone: document.getElementById('editHostPhone').value,
    honorees
  };

  try {
    const res = await apiFetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      // الرسالة تفرّق أصلاً بين التجميلي والحرِج — نعرضها كما هي، ونضيف تنبيه
      // الموقع إن جاء (#20 step 9).
      alert(data.message + (data.location_warning ? `\n\n⚠️ ${data.location_warning.message}` : ''));
      closeEditEventModal();
      fetchMyEvents();
    } else {
      alert(data.message || 'حدث خطأ أثناء حفظ التعديل');
    }
  } catch (err) {
    alert('تعذر حفظ التعديل — تحقق من الاتصال بالخادم');
  }
}

// 15. Live Chat & Congratulations Modal
async function openChatModal(eventId) {
  currentChatEventId = eventId;
  currentChatEvent = null; // يُعاد ضبطه أدناه بعد نجاح الجلب — لا زرّ مشاركة على بيانات مناسبة سابقة
  const modal = document.getElementById('chatModal');
  modal.style.display = 'flex';

  const hostBar = document.getElementById('chatHostBar');
  const stream = document.getElementById('chatMessagesStream');
  stream.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>جاري جلب التبريكات...</p></div>';

  const senderInput = document.getElementById('chatSenderName');
  if (currentUser) {
    senderInput.value = currentUser.full_name;
  } else {
    senderInput.value = '';
    senderInput.placeholder = 'سجّل الدخول لإرسال تبريكة';
  }

  try {
    const res = await apiFetch(`/api/events/${eventId}`);
    const data = await res.json();

    if (data.success) {
      const evt = data.event;
      currentChatEvent = evt;
      document.getElementById('chatModalTitle').textContent = `${congratulationsLabel(evt)}: ${evt.groom_name}`;
      document.getElementById('chatModalSubtitle').textContent = `${evt.town} - ${evt.event_date}`;
      const shareLabel = document.getElementById('shareEventBtnLabel');
      if (shareLabel) shareLabel.textContent = shareButtonLabel(evt);

      if (evt.host_phone) {
        hostBar.style.display = 'flex';
        hostBar.innerHTML = `
          <a href="tel:${evt.host_phone}" class="host-call-btn"><i class="fa-solid fa-phone"></i> اتصال بالمعلن (${evt.host_phone})</a>
          <a href="https://wa.me/972${evt.host_phone.replace(/^0/, '')}" target="_blank" class="host-wa-btn"><i class="fa-brands fa-whatsapp"></i> واتساب المعلن</a>
        `;
      } else {
        hostBar.style.display = 'none';
      }

      renderChatMessages(evt.congratulations);
    }
  } catch (e) {
    console.error('Chat error:', e);
  }
}

/**
 * رسالة `pending` لا يراها إلا مُرسِلها — الخادم أصلاً لا يعيد لهذا الطالب سوى
 * رسائله المعلَّقة هو، فأي صفّ status==='pending' هنا هو صفّ الزائر نفسه
 * (#20 step 10). شارة فارغة (`badge_title` غائب) لا تُعرَض كـ«مبارك» ثابتة —
 * نوع بلا شارة افتراضية (كالعزاء) يبقى بلا شارة، لا نصّاً مُخترَعاً هنا.
 */
function renderChatMessages(congrats) {
  const stream = document.getElementById('chatMessagesStream');
  if (!congrats || congrats.length === 0) {
    stream.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>كن أول من يكتب هنا!</p></div>';
    return;
  }

  stream.innerHTML = congrats.map(c => `
    <div class="chat-bubble">
      <div class="chat-bubble-header">
        <span class="sender-name">${escapeHtml(c.sender_name)}</span>
        ${c.badge_title ? `<span class="sender-badge">${escapeHtml(c.badge_title)}</span>` : ''}
        ${c.status === 'pending' ? '<span class="status-tag pending">قيد المراجعة</span>' : ''}
      </div>
      <div class="chat-msg-text">${escapeHtml(c.message)}</div>
      ${c.status !== 'pending' ? `
        <button class="nokoot-del-btn" style="margin-top:6px;" onclick="reportCongratulation(${currentChatEventId}, ${c.id}, this)">
          <i class="fa-solid fa-flag"></i> إبلاغ
        </button>` : ''}
    </div>
  `).join('');

  stream.scrollTop = stream.scrollHeight;
}

/** إبلاغ واحد لكل مستخدم — الخادم يرفض التكرار بـ409 ويعيد رسالة عربية جاهزة (#20 step 10). */
async function reportCongratulation(eventId, congratulationId, btnElement) {
  if (!requireAuth({ type: 'report' })) return;
  if (btnElement) btnElement.disabled = true;
  try {
    const res = await apiFetch(`/api/events/${eventId}/congratulations/${congratulationId}/report`, {
      method: 'POST',
      auth: true
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      showToast('تم إرسال الإبلاغ');
      if (btnElement) btnElement.innerHTML = '<i class="fa-solid fa-check"></i> تم الإبلاغ';
    } else {
      alert(data.message || 'تعذر إرسال الإبلاغ');
      if (btnElement) btnElement.disabled = false;
    }
  } catch (e) {
    alert('تعذر إرسال الإبلاغ');
    if (btnElement) btnElement.disabled = false;
  }
}

function closeChatModal() {
  document.getElementById('chatModal').style.display = 'none';
  currentChatEventId = null;
  currentChatEvent = null;
}

/**
 * زرّ المشاركة في تفاصيل المناسبة (تذكرة #44) — الكلمة من نغمة النوع لا اسمه:
 * نفس العلَم الذي يبني عليه isMourningTone أعلاه، لا مقارنة بتسمية يكتبها
 * الأدمن. الاحتفالية «شارك المناسبة»، والوقورة «أرسل النعي».
 */
function shareButtonLabel(evt) {
  return isMourningTone(evt) ? 'أرسل النعي' : 'شارك المناسبة';
}

/** الأصل من config.js دائماً (نفس API_BASE الذي يبنيه api.js) — لا نص ثابت ثانٍ هنا. */
function shareOrigin() {
  return API_BASE || window.location.origin;
}

/**
 * سطر قصير باسم المناسبة وبلدتها ثم رابط صفحة المشاركة على الخادم
 * (`GET /e/:id`، share.routes.js) — بلا «حمّل التطبيق»: تلك الصفحة نفسها تحمل
 * زرّ التحميل، وتكراره هنا يحوّل دعوة إلى إعلان (تذكرة #44).
 *
 * navigator.share عند توفّره؛ نسخ إلى الحافظة مع تأكيد مرئي حين لا يتوفر —
 * والزرّ لا يفشل بصمت في أي مسار: إلغاء المستخدم لورقة المشاركة (AbortError)
 * وحده يُعامَل كلا شيء، لا كخطأ.
 */
async function shareCurrentEvent() {
  await shareEvent(currentChatEvent);
}

/** مشاركة من البطاقة — المناسبة من القائمة المحمّلة أصلاً، بلا نداء جديد. */
async function shareEventById(eventId) {
  await shareEvent(allEvents.find(e => e.id === eventId));
}

async function shareEvent(evt) {
  if (!evt) return;

  const url = `${shareOrigin()}/e/${evt.id}`;
  const line = `${evt.title} — ${evt.town}`;

  recordAnalyticsEvent('share_clicked', { contentTown: evt.town });

  if (navigator.share) {
    try {
      await navigator.share({ title: evt.title, text: line, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // المستخدم أغلق ورقة المشاركة بنفسه — ليس خطأ
      // أي فشل آخر (نادر) — نكمل إلى نسخ الرابط بدل ترك الزر بلا أثر.
    }
  }

  const fullText = `${line}\n${url}`;
  try {
    await navigator.clipboard.writeText(fullText);
    showToast('📋 تم نسخ رابط المناسبة');
  } catch (e) {
    // لا clipboard API متاح (سياق غير آمن مثلاً) — لا يبقى الزر بلا أثر أبداً.
    alert(fullText);
  }
}

function insertEmojiToChat(text) {
  const input = document.getElementById('chatInputMessage');
  input.value = (input.value ? input.value + ' ' : '') + text;
  input.focus();
}

async function sendCongratulation(e) {
  e.preventDefault();
  if (!currentChatEventId) return;
  // التبريك فعل كتابة كالنشر — خلف authenticate على الخادم أيضاً، والاسم يُبنى
  // من الحساب لا من الحقل (#20 step 9).
  if (!requireAuth({ type: 'congratulate', eventId: currentChatEventId })) return;

  const message = document.getElementById('chatInputMessage').value.trim();
  if (!message) return;

  try {
    const res = await apiFetch(`/api/events/${currentChatEventId}/congratulate`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('chatInputMessage').value = '';
      openChatModal(currentChatEventId);
    } else {
      alert(data.message || 'تعذر إرسال التهنئة');
    }
  } catch (e) {
    alert('تعذر إرسال التهنئة');
  }
}

// 16. Nokoot Ledger & Financial Chart
function loadNokootView() {
  const lockedView = document.getElementById('nokootLockedView');
  const unlockedView = document.getElementById('nokootUnlockedView');

  if (!authToken || !currentUser) {
    lockedView.style.display = 'block';
    unlockedView.style.display = 'none';
  } else {
    lockedView.style.display = 'none';
    unlockedView.style.display = 'block';
    fetchNokootRecords();
    // 🚧 قسم الخصوصية وحسابي أسفل سجل النقوط — لا نداء تحليلات هنا ولا في أي
    // مسار آخر يلمس دفتر النقوط، بلا استثناء (تذكرة #44، القاعدة الحاكمة).
    renderAnalyticsOptOutToggle();
  }
}

async function fetchNokootRecords() {
  try {
    const res = await apiFetch('/api/nokoot', { auth: true });
    const data = await res.json();

    if (data.success) {
      document.getElementById('nokootTotalAmount').textContent = `${data.totalAmount.toLocaleString()} ₪`;
      document.getElementById('nokootCount').textContent = data.count;
      document.getElementById('nokootAverage').textContent = `${data.analytics?.averageNokoot || 0} ₪`;

      renderNokootChart(data.analytics?.townBreakdown || {});

      const list = document.getElementById('nokootList');
      if (data.records.length === 0) {
        list.innerHTML = `
          <div class="empty-state" style="padding:20px;">
            <i class="fa-solid fa-wallet"></i>
            <p>لا توجد قيود نقوط مسجلة حتى الآن. اضغط على الزر بالأعلى لتسجيل نقوطك.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = data.records.map(item => `
        <div class="nokoot-item-card">
          <div class="nokoot-item-info">
            <h4>${escapeHtml(item.recipient_name)} (${escapeHtml(item.clan_town || 'النقب')})</h4>
            <div class="nokoot-item-meta">
              <span><i class="fa-regular fa-calendar"></i> ${item.event_date}</span>
              ${item.notes ? ` • <span>${escapeHtml(item.notes)}</span>` : ''}
            </div>
          </div>
          <div class="nokoot-amount-badge">
            <span class="nokoot-amount-val">${item.amount} ₪</span>
            <button class="nokoot-del-btn" onclick="deleteNokoot(${item.id})"><i class="fa-solid fa-trash"></i> حذف</button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error('Nokoot fetch error:', e);
  }
}

function renderNokootChart(townData) {
  const canvas = document.getElementById('nokootChartCanvas');
  if (!canvas) return;

  const labels = Object.keys(townData);
  const values = Object.values(townData);

  if (labels.length === 0) {
    labels.push('لا توجد بيانات');
    values.push(1);
  }

  if (nokootChart) nokootChart.destroy();

  nokootChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ['#0369a1', '#38bdf8', '#075985', '#15803d', '#9a7222', '#7c3aed'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: currentThemeIsDark() ? '#9fb6c9' : '#47617a', font: { family: 'Cairo' } }
        }
      }
    }
  });
}

function exportNokootData() {
  apiFetch('/api/nokoot', { auth: true })
    .then(res => res.json())
    .then(data => {
      if (!data.success || !data.records || data.records.length === 0) {
        alert('لا توجد بيانات للتصدير');
        return;
      }
      let csv = 'اسم الشخص,البلدة,المبلغ بالشيكل,التاريخ,ملاحظات\n';
      data.records.forEach(r => {
        csv += `"${r.recipient_name}","${r.clan_town || ''}","${r.amount}","${r.event_date}","${r.notes || ''}"\n`;
      });
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `سجل-النقوط-مناسبات-النقب-${Date.now()}.csv`;
      link.click();
    });
}

function quickRecordNokoot(groomName, eventDate, town) {
  if (!authToken) {
    openAuthModal();
    return;
  }
  document.getElementById('nokootRecipient').value = groomName;
  document.getElementById('nokootDate').value = eventDate;
  document.getElementById('nokootClan').value = town;
  openAddNokootModal();
}

function openAddNokootModal() {
  document.getElementById('addNokootModal').style.display = 'flex';
}

function closeAddNokootModal() {
  document.getElementById('addNokootModal').style.display = 'none';
}

async function handleAddNokoot(e) {
  e.preventDefault();
  const recipient = document.getElementById('nokootRecipient').value;
  const amount = document.getElementById('nokootAmount').value;
  const date = document.getElementById('nokootDate').value;
  const clan = document.getElementById('nokootClan').value;
  const notes = document.getElementById('nokootNotes').value;

  try {
    const res = await apiFetch('/api/nokoot', {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_name: recipient,
        amount: amount,
        event_date: date,
        clan_town: clan,
        notes: notes
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('💰 تم حفظ قيد النقوط بنجاح');
      closeAddNokootModal();
      document.getElementById('addNokootForm').reset();
      fetchNokootRecords();
    }
  } catch (err) {
    alert('حدث خطأ أثناء حفظ النقوط');
  }
}

async function deleteNokoot(id) {
  if (!confirm('هل أنت متأكد من حذف هذا القيد؟')) return;
  try {
    const res = await apiFetch(`/api/nokoot/${id}`, { method: 'DELETE', auth: true });
    if (res.ok) fetchNokootRecords();
  } catch (e) {
    console.error('Delete error:', e);
  }
}

// 17. Auth Modal & Controller
function openAuthModal() {
  document.getElementById('authModal').style.display = 'flex';
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function switchAuthMode(mode) {
  if (mode === 'login') {
    document.getElementById('authTabLogin').classList.add('active');
    document.getElementById('authTabRegister').classList.remove('active');
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
  } else {
    document.getElementById('authTabLogin').classList.remove('active');
    document.getElementById('authTabRegister').classList.add('active');
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('loginPhone').value.trim();
  const pin = document.getElementById('loginPin').value.trim();

  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, pin_code: pin })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('negev_token', authToken);
      localStorage.setItem('negev_user', JSON.stringify(currentUser));
      updateAuthUI();
      closeAuthModal();
      showToast(`مرحباً بك يا ${currentUser.full_name}`);
      loadNokootView();
      subscribeToNotificationSocket();
      fetchNotifications();
      // بلا هذا يبقى الشريط بنتيجة الزائر المجهول (تعاميم عامة فقط) حتى
      // إعادة تحميل يدوية — تعاميم بلدة هذا الحساب لا تظهر رغم أنها له
      // فعلاً (مراجعة #85، FIX 2أ، قصة 32).
      fetchLiveBroadcasts();
      resumePendingIntent();
    } else {
      alert(data.message || 'بيانات الدخول غير صحيحة');
    }
  } catch (err) {
    alert('تعذر تسجيل الدخول');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const clan = document.getElementById('regClan').value.trim();
  const pin = document.getElementById('regPin').value.trim();

  try {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, phone_number: phone, clan_town: clan, pin_code: pin })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('negev_token', authToken);
      localStorage.setItem('negev_user', JSON.stringify(currentUser));
      updateAuthUI();
      closeAuthModal();
      showToast(`تم إنشاء حسابك وتفعيل السجل بنجاح!`);
      loadNokootView();
      subscribeToNotificationSocket();
      fetchNotifications();
      // بلا هذا يبقى الشريط بنتيجة الزائر المجهول (تعاميم عامة فقط) حتى
      // إعادة تحميل يدوية — تعاميم بلدة هذا الحساب لا تظهر رغم أنها له
      // فعلاً (مراجعة #85، FIX 2أ، قصة 32).
      fetchLiveBroadcasts();
      resumePendingIntent();
    } else {
      alert(data.message || 'حدث خطأ في التسجيل');
    }
  } catch (err) {
    alert('تعذر إنشاء الحساب');
  }
}

// 17b. Notifications Center — in-page only, no browser push (#20 step 10)
async function fetchNotifications() {
  if (!currentUser || !authToken) return;
  try {
    const res = await apiFetch('/api/notifications', { auth: true });
    const data = await res.json();
    if (data.success) {
      notificationsList = data.notifications;
      renderNotificationsList();
      updateNotificationsBadge();
    }
  } catch (e) {
    console.error('Notifications error:', e);
  }
}

function updateNotificationsBadge() {
  const btn = document.getElementById('notificationsBtn');
  const badge = document.getElementById('notificationsBadge');
  if (!btn || !badge) return;
  btn.style.display = currentUser ? 'inline-flex' : 'none';
  const unread = notificationsList.filter(n => !n.is_read).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderNotificationsList() {
  const container = document.getElementById('notificationsList');
  if (!container) return;
  if (!notificationsList.length) {
    container.innerHTML = '<div class="empty-state" style="padding:20px;"><p>لا توجد إشعارات بعد</p></div>';
    return;
  }
  // A merged entry (issue #85, story 30) is either a personal notification
  // (`id`, marked read via PATCH /api/notifications/:id/read) or a broadcast
  // (`broadcast_id`, no `id` at all — marked read via the SAME
  // PATCH /api/broadcasts/:id/dismiss story 29 already uses, see
  // notifications.service.js). `notifications.id` and `broadcasts.id` are two
  // independent, overlapping AUTO_INCREMENT counters, so which endpoint gets
  // called must be decided by entry kind, never by treating both as one `id`.
  container.innerHTML = notificationsList.map(n => {
    const isBroadcast = isBroadcastEntry(n);
    const clickArgs = isBroadcast ? `true, ${n.broadcast_id}` : `false, ${n.id}`;
    return `
    <div class="event-card" style="padding:14px; cursor:pointer;" onclick="markNotificationRead(${clickArgs})">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <strong style="color:${n.is_read ? 'var(--ink-soft)' : 'var(--sky)'};">${escapeHtml(n.title)}</strong>
        ${!n.is_read ? '<span class="status-tag pending">جديد</span>' : ''}
      </div>
      <p style="margin-top:6px; color:var(--ink-soft); font-size:0.88rem;">${escapeHtml(n.body)}</p>
    </div>
  `;
  }).join('');
}

function toggleNotificationsPanel() {
  document.getElementById('notificationsModal').style.display = 'flex';
  updatePushControlUI();
}

function closeNotificationsModal() {
  document.getElementById('notificationsModal').style.display = 'none';
}

// Which kind an entry is, decided by a field a broadcast STRUCTURALLY has and
// a personal notification cannot: `notifications.type` is a free-text
// VARCHAR(40) written by application code, so a personal row whose type
// happened to be 'broadcast' would otherwise be routed to the wrong endpoint.
function isBroadcastEntry(entry) {
  return entry.broadcast_id !== undefined;
}

async function markNotificationRead(isBroadcast, id) {
  const notification = isBroadcast
    ? notificationsList.find(n => isBroadcastEntry(n) && n.broadcast_id === id)
    : notificationsList.find(n => !isBroadcastEntry(n) && n.id === id);
  if (!notification) return;

  const eventId = !isBroadcast ? notification.event_id : null;

  if (!notification.is_read) {
    const endpoint = isBroadcast ? `/api/broadcasts/${id}/dismiss` : `/api/notifications/${id}/read`;
    try {
      const res = await apiFetch(endpoint, { method: 'PATCH', auth: true });
      if (res.ok) {
        notification.is_read = true;
        renderNotificationsList();
        updateNotificationsBadge();
      }
    } catch (e) {
      console.error('Mark notification read error:', e);
    }
  }

  // التوجّه إلى المناسبة نفسها عند النقر على إشعار شخصي مرتبط بمناسبة (قصة 14)
  if (eventId) {
    await navigateToEvent(eventId);
  }
}

/**
 * تظليل الكرت والتمرير إليه، مع احترام تفضيل تقليل الحركة ونغمة الوقار (قصة 54، FIX 7).
 */
function isReducedMotionPreferred() {
  try {
    return !!(typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

function highlightAndScrollToCard(card, isSolemn = false) {
  if (!card) return;
  const reduceMotion = isReducedMotionPreferred();
  const solemn = isSolemn || card.classList.contains('tone-mourning');
  if (typeof card.scrollIntoView === 'function') {
    card.scrollIntoView({
      behavior: (reduceMotion || solemn) ? 'auto' : 'smooth',
      block: 'center'
    });
  }
  card.classList.add('event-card-highlight');
  setTimeout(() => card.classList.remove('event-card-highlight'), 2500);
}

/**
 * ينتقل إلى مناسبة في التغذية (قصة 14):
 * يغلق المركز، يفتح تبويب الرئيسية، ويفرغ معامل ?event_id= من العنوان عبر replaceState (FIX 5).
 * إن كان الكرت في التغذية المحمّلة ينتقل إليه.
 * إن لم يكن في التغذية (فلتر نشط أو صفحة لاحقة)، يجلبه ويعرضه في #singleEventContainer
 * دون تلويث allEvents أو الإخلال بالفلاتر الحالية (FIX 6).
 */
async function navigateToEvent(eventId) {
  if (!eventId) return;
  closeNotificationsModal();
  switchTab('tabHome');

  // تنظيف ?event_id= من شريط العنوان حتى لا يُعاد تشغيل التنقل عند كل تحديث (FIX 5)
  try {
    if (typeof window !== 'undefined' && window.location && window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      if (url.searchParams.has('event_id')) {
        url.searchParams.delete('event_id');
        const cleanSearch = url.searchParams.toString();
        const cleanUrl = url.pathname + (cleanSearch ? '?' + cleanSearch : '') + url.hash;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  } catch (e) {}

  let card = document.getElementById(`eventCard-${eventId}`);
  if (card) {
    clearSingleEventView();
    highlightAndScrollToCard(card);
    return;
  }

  // الكرت غير موجود في القائمة المحمّلة: جلبه وعرضه في خانة مستقلة (FIX 6)
  try {
    const res = await apiFetch(`/api/events/${eventId}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.event) {
        renderSingleEventView(data.event);
      }
    }
  } catch (err) {
    console.error('Failed to fetch event for navigation:', err);
  }
}

let pendingDeepLinkEventId = null;

function initUrlNavigation() {
  try {
    if (typeof window === 'undefined' || !window.location) return;
    const urlParams = new URLSearchParams(window.location.search);
    const raw = urlParams.get('event_id');
    if (raw) {
      const num = Number(raw);
      if (!isNaN(num) && num > 0) {
        pendingDeepLinkEventId = num;
      }
    }
  } catch (e) {
    // ignore
  }
}

async function checkPendingDeepLink() {
  if (pendingDeepLinkEventId) {
    const id = pendingDeepLinkEventId;
    pendingDeepLinkEventId = null;
    await navigateToEvent(id);
  }
}

// ============================================================================
// Web Push Client (قصص 16، 17، 18)
// ============================================================================

let cachedVapidPublicKey = null;

async function getVapidPublicKey() {
  if (cachedVapidPublicKey) {
    return cachedVapidPublicKey;
  }
  try {
    const res = await apiFetch('/api/notifications/vapid-public-key');
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.public_key) {
        cachedVapidPublicKey = data.public_key;
      }
    }
  } catch (err) {
    console.warn('VAPID key check error:', err);
  }
  return cachedVapidPublicKey;
}

function isPushOptedOut() {
  try {
    return localStorage.getItem('negev_push_opt_out') === 'true';
  } catch (e) {
    return false;
  }
}

function setPushOptOut(val) {
  try {
    if (val) {
      localStorage.setItem('negev_push_opt_out', 'true');
    } else {
      localStorage.removeItem('negev_push_opt_out');
    }
  } catch (e) {}
}

/** تسجيل Service Worker بأمان عند دعم المتصفح له، دون رمي أي خطأ */
function initServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !navigator.serviceWorker) return;
  try {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
    if (navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NAVIGATE_EVENT' && event.data.event_id) {
          const num = Number(event.data.event_id);
          if (num > 0) {
            navigateToEvent(num);
          }
        }
      });
    }
  } catch (err) {
    // Silently degrade
  }
}

function initNotificationsPush() {
  updatePushControlUI();
}

/** هل المتصفح يدعم واجهات Push البرمجية كاملة */
function isPushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

/**
 * Converts a base64url-encoded VAPID public key string into a Uint8Array
 * required by PushManager.subscribe({ applicationServerKey }).
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * يحدد الحالة الفعلية لعنصر التحكم بالإشعارات (FIX 8):
 * 'hidden' | 'unsupported' | 'ios_uninstalled' | 'no_vapid' | 'subscribed' | 'opted_out' | 'unsubscribed'
 */
async function getPushState() {
  if (!currentUser) return 'hidden';
  if (!isPushSupported()) return 'unsupported';
  if (isIOSSafariNotInstalled()) return 'ios_uninstalled';

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return 'no_vapid';

  let sub = null;
  try {
    const reg = (navigator.serviceWorker && navigator.serviceWorker.ready)
      ? await navigator.serviceWorker.ready
      : (navigator.serviceWorker && navigator.serviceWorker.getRegistration ? await navigator.serviceWorker.getRegistration() : null);
    if (reg && reg.pushManager) {
      sub = await reg.pushManager.getSubscription();
    }
  } catch (err) {
    console.warn('Check push subscription error:', err);
  }

  const isSubscribed = !!(sub && window.Notification && window.Notification.permission === 'granted');
  if (isSubscribed) {
    return 'subscribed';
  }
  if (isPushOptedOut()) {
    return 'opted_out';
  }
  return 'unsubscribed';
}

/** تحديث حالة زر وعنصر التحكم بالإشعارات الفورية بصدق عبر آلة الحالة الواحدة (قصة 18، FIX 8) */
async function updatePushControlUI() {
  const pushBar = document.getElementById('notificationsPushControl');
  const statusText = document.getElementById('pushStatusText');
  const toggleBtn = document.getElementById('togglePushNotificationsBtn');
  if (!pushBar || !statusText || !toggleBtn) return;

  const state = await getPushState();

  if (state === 'hidden') {
    pushBar.style.display = 'none';
    return;
  }
  pushBar.style.display = 'flex';

  switch (state) {
    case 'unsupported':
      statusText.textContent = 'غير مدعومة على هذا الجهاز';
      statusText.className = 'push-status-val status-na';
      toggleBtn.textContent = 'غير متوفرة';
      toggleBtn.disabled = true;
      toggleBtn.onclick = null;
      break;

    case 'ios_uninstalled':
      statusText.textContent = 'يتطلب إضافة الموقع للشاشة الرئيسية';
      statusText.className = 'push-status-val status-na';
      toggleBtn.textContent = 'تثبيت على الشاشة';
      toggleBtn.disabled = false;
      toggleBtn.onclick = togglePushNotifications;
      break;

    case 'no_vapid':
      statusText.textContent = 'غير متوفرة حالياً';
      statusText.className = 'push-status-val status-na';
      toggleBtn.textContent = 'غير متوفرة';
      toggleBtn.disabled = true;
      toggleBtn.onclick = null;
      break;

    case 'subscribed':
      statusText.textContent = 'مفعّلة';
      statusText.className = 'push-status-val status-on';
      toggleBtn.textContent = 'إيقاف الإشعارات';
      toggleBtn.disabled = false;
      toggleBtn.onclick = togglePushNotifications;
      break;

    case 'opted_out':
    case 'unsubscribed':
      statusText.textContent = 'متوقفة';
      statusText.className = 'push-status-val status-off';
      toggleBtn.textContent = 'تفعيل';
      toggleBtn.disabled = false;
      toggleBtn.onclick = togglePushNotifications;
      break;
  }
}

async function togglePushNotifications() {
  const state = await getPushState();
  if (state === 'subscribed') {
    await unsubscribeFromPush();
  } else if (state === 'opted_out' || state === 'unsubscribed') {
    await requestPushNotificationSubscription({ manual: true });
  } else if (state === 'ios_uninstalled') {
    showToast('لتفعيل الإشعارات على iPhone، أضف الموقع إلى الشاشة الرئيسية أولاً');
    if (!isInstallHintDismissed()) {
      const sheet = document.getElementById('installHint');
      if (sheet) sheet.hidden = false;
    }
  }
}

/**
 * طلب الإذن والاشتراك بالإشعارات الفورية:
 * يُستدعى حصراً عند تفعيل تذكير لمناسبة (قصة 16)، أو يدوياً عبر زر التفعيل في المركز.
 */
async function requestPushNotificationSubscription(options = {}) {
  const { manual = false } = options;
  if (!currentUser) return;

  if (!manual && isPushOptedOut()) {
    return;
  }

  if (!isPushSupported()) {
    if (manual) showToast('الإشعارات الفورية غير مدعومة على هذا المتصفح');
    return;
  }

  if (isIOSSafariNotInstalled()) {
    showToast('لتفعيل الإشعارات على iPhone، أضف الموقع إلى الشاشة الرئيسية أولاً');
    if (!isInstallHintDismissed()) {
      const sheet = document.getElementById('installHint');
      if (sheet) sheet.hidden = false;
    }
    return;
  }

  const publicKey = await getVapidPublicKey();
  // إذا لم يكن هناك مفتاح VAPID في الخادم (وهي الحالة اليوم)، نسلك المسار الهادئ
  if (!publicKey) {
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      await updatePushControlUI();
      return;
    }

    const reg = (navigator.serviceWorker && navigator.serviceWorker.ready)
      ? await navigator.serviceWorker.ready
      : (navigator.serviceWorker && navigator.serviceWorker.getRegistration ? await navigator.serviceWorker.getRegistration() : null);
    if (!reg || !reg.pushManager) return;

    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });

    const subJson = subscription.toJSON ? subscription.toJSON() : {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))) : '',
        auth: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))) : ''
      }
    };

    const subRes = await apiFetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subJson),
      auth: true
    });

    if (subRes.ok) {
      setPushOptOut(false);
      await updatePushControlUI();
      if (manual) {
        showToast('🔔 تم تفعيل الإشعارات الفورية');
      }
    }
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}

/** إيقاف الإشعارات الفورية وحذف الاشتراك من الخادم وحفظ خيار الإيقاف (قصة 18، FIX 4) */
async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  try {
    const reg = (navigator.serviceWorker && navigator.serviceWorker.ready)
      ? await navigator.serviceWorker.ready
      : (navigator.serviceWorker && navigator.serviceWorker.getRegistration ? await navigator.serviceWorker.getRegistration() : null);
    if (!reg || !reg.pushManager) return;

    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await apiFetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
        auth: true
      });
      await sub.unsubscribe();
    }
    // FIX 4: حفظ رغبة المستخدم في إيقاف الإشعارات حتى لا تعيد التذكيرات الاشتراك تلقائياً
    setPushOptOut(true);
    await updatePushControlUI();
    showToast('تم إيقاف الإشعارات الفورية');
  } catch (err) {
    console.error('Unsubscribe error:', err);
  }
}

function updateAuthUI() {
  const label = document.getElementById('userAuthLabel');
  const btn = document.getElementById('userAuthBtn');
  updateNotificationsBadge();
  updatePushControlUI();
  if (currentUser) {
    if (currentUser.role === 'super_admin' || currentUser.phone_number === '0500000000') {
      label.innerHTML = `👑 لوحة الإدارة`;
      btn.onclick = () => { window.location.href = '/admin.html'; };
      btn.style.borderColor = 'var(--sky)';
      btn.style.background = 'var(--sky-wash)';
    } else {
      label.textContent = currentUser.full_name.split(' ')[0];
      btn.onclick = () => { switchTab('tabNokoot'); };
    }
  } else {
    label.textContent = 'تسجيل الدخول';
    btn.onclick = () => { openAuthModal(); };
  }
}

// 17c. Privacy — إشعار الخصوصية، رفض التحليلات، والاطلاع/الحذف (تذكرة #44)
//
// لا شاشة "حسابي" مستقلة في هذا العميل بعد؛ هذا القسم يعيش داخل تبويب النقوط
// (index.html، #privacyAccountSection) لأنه المكان الفعلي الذي يصل إليه
// المستخدم المسجَّل دخوله اليوم (updateAuthUI أعلاه يفتح tabNokoot).

let privacyNoticeCache = null; // نص واحد لا يتغيّر أثناء الجلسة — يُجلب مرة، لا نداء عند كل فتح

async function openPrivacyNoticeModal() {
  const modal = document.getElementById('privacyNoticeModal');
  const body = document.getElementById('privacyNoticeText');
  modal.style.display = 'flex';

  if (privacyNoticeCache) {
    body.textContent = privacyNoticeCache.text;
    return;
  }

  body.textContent = 'جاري التحميل...';
  try {
    const res = await apiFetch('/api/privacy/notice');
    const data = await res.json();
    if (data.success && data.notice) {
      privacyNoticeCache = data.notice;
      body.textContent = data.notice.text;
    } else {
      body.textContent = 'تعذر جلب إشعار الخصوصية';
    }
  } catch (e) {
    body.textContent = 'تعذر جلب إشعار الخصوصية';
  }
}

function closePrivacyNoticeModal() {
  document.getElementById('privacyNoticeModal').style.display = 'none';
}

/** يعكس حالة الحساب الحالية (currentUser.analytics_opt_out) على المفتاح — بلا نداء شبكة. */
function renderAnalyticsOptOutToggle() {
  const toggle = document.getElementById('analyticsOptOutToggle');
  if (!toggle || !currentUser) return;
  toggle.checked = !!currentUser.analytics_opt_out;
}

/** مفتاح، لا شرط استخدام — لا تُقفَل أي ميزة إن رفض المستخدم (النص بجانب المفتاح في index.html يقول ذلك صراحةً). */
async function handleAnalyticsOptOutChange(checked) {
  if (!currentUser) return;
  try {
    const res = await apiFetch('/api/auth/me', {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analytics_opt_out: checked })
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      localStorage.setItem('negev_user', JSON.stringify(currentUser));
      showToast(data.message || 'تم الحفظ');
    } else {
      alert(data.message || 'تعذر حفظ الإعداد');
      renderAnalyticsOptOutToggle(); // إعادة المفتاح لحالته الحقيقية عند الفشل
    }
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
    renderAnalyticsOptOutToggle();
  }
}

/** حذف فوري، ذاتي الخدمة — يؤكَّد قبل الإرسال لأنه لا رجعة فيه. */
async function handleAnalyticsErasure() {
  if (!currentUser) return;
  if (!confirm('سيُحذف فوراً كل ما سُجِّل عنك من بيانات التحليلات السلوكية. متابعة؟')) return;
  try {
    const res = await apiFetch('/api/privacy/analytics-erasure', { method: 'POST', auth: true });
    const data = await res.json().catch(() => ({}));
    alert((data && data.message) || (res.ok ? 'تم الحذف' : 'تعذر الحذف'));
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  }
}

/** طلب رسمي (اطلاع أو حذف) — يُعرض الرد بحرفه لأنه يحمل مهلة المعالجة من الخادم (PRIVACY_REQUEST_DEADLINE_DAYS). */
async function handlePrivacyRequest(requestType) {
  if (!currentUser) return;
  try {
    const res = await apiFetch('/api/privacy/requests', {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_type: requestType })
    });
    const data = await res.json().catch(() => ({}));
    alert((data && data.message) || (res.ok ? 'تم استلام طلبك' : 'تعذر إرسال الطلب'));
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  }
}

// 18. Sticker Canvas Studio
function setStickerTheme(theme) {
  stickerTheme = theme;
  document.querySelectorAll('.theme-pill').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  renderStickerCanvas();
}

function renderStickerCanvas() {
  const canvas = document.getElementById('stickerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  const sender = document.getElementById('stickerSenderName').value || 'أخوك أحمد';
  const phrase = document.getElementById('stickerPhrase').value || 'ألف ألف مبارك يا عريس';

  if (stickerTheme === 'royal-gold') {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#061a12');
    grad.addColorStop(1, '#020b08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#dfb15b';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    ctx.strokeStyle = 'rgba(223, 177, 91, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(24, 24, width - 48, height - 48);
  } else if (stickerTheme === 'bedouin-green') {
    ctx.fillStyle = '#0a2e20';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, width - 36, height - 36);
  } else {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, width - 36, height - 36);
  }

  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🌙 ✨ ☕', width / 2, 70);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px Tajawal, sans-serif';
  ctx.fillText(phrase, width / 2, 160);

  ctx.fillStyle = '#dfb15b';
  ctx.font = 'bold 28px Amiri, Tajawal, serif';
  ctx.fillText(`تهنئة خاصة من: ${sender}`, width / 2, 240);

  ctx.fillStyle = 'rgba(223, 177, 91, 0.7)';
  ctx.font = '14px Tajawal, sans-serif';
  ctx.fillText('مناسبات وأعراس النقب • دياركم عامرة', width / 2, 340);
}

function downloadStickerImage() {
  const canvas = document.getElementById('stickerCanvas');
  const link = document.createElement('a');
  link.download = `تهنئة-مناسبات-النقب-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function shareStickerToWhatsApp() {
  const sender = document.getElementById('stickerSenderName').value || 'أخوكم';
  const phrase = document.getElementById('stickerPhrase').value;
  const text = encodeURIComponent(`🎉 ${phrase}\nتهنئة خاصة من: ${sender}\n\nعبر تطبيق وموقع مناسبات النقب: ${window.location.origin}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
