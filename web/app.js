// State Management
let allEvents = [];
let searchQuery = '';
let currentAudio = null;
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
let serviceSearchQuery = '';
let serviceDebounceTimer = null;
let serviceDraftTown = '';
let serviceDraftCategoryId = null;
let providerDetailsCache = {};
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

// المقطع الافتراضي للمناسبات من نفس GET /api/settings/public — يُشغَّل لكل
// مناسبة بلا مقطع خاص بها، ما دام نوعها يعرض حقل الصوت أصلاً (effectiveEventAudio).
let defaultEventAudioUrl = null;

// التشغيل التلقائي في التغذية — مقطع واحد في كل لحظة عبر currentAudio نفسه.
// soundMuted تفضيل الزائر وحده (localStorage)، وaudioUnlockNeeded تعني أن
// المتصفّح رفض play() قبل أول لمسة على الصفحة (سياسة التشغيل التلقائي).
const SOUND_MUTED_KEY = 'negev_sound_muted';
let soundMuted = readSoundMutedPreference();
let audioUnlockNeeded = false;
let currentAudioEventId = null;
let activeFeedEventId = null;
let feedAudioObserver = null;
const feedCardVisibility = new Map(); // eventId ⇒ درجة ظهور الكرت الآن (feedCardVisibilityScore)
const FEED_ACTIVE_MIN_SCORE = 0.5;

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

// «البث المباشر» — مصدر مستقل تماماً عن القصص. liveState هو آخر GET /api/live
// ({profile_url, live, embed_url, live_channel_url}) أو null قبل وصوله، ولا
// يقرؤه إلا شارة «مباشر» على الزرّين؛ الزرّان نفساهما ظاهران دائماً. liveHubState
// هو آخر GET /api/live/hub، ولا يُجلب إلا حين تُفتح نافذة البث.
let liveState = null;
let liveHubState = null;
let liveBadgeTimer = null;
let livePlayerKey = null; // ما يعرضه المشغّل الآن — لا يُعاد بناء iframe يعرض الشيء نفسه
let livePollChannel = null; // قناة live_poll_<id> المشترَك فيها الآن، أو null
let liveVoteInFlight = false;

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
  updateFloatingFilterLabel();
  initAppDownload();
  initInstallHint();
  fetchNotifications();
  fetchLiveBroadcasts();
  fetchLiveStatus();
  initSupportEntry();
  initNotificationsPush();
  initServiceWorker();
  initUrlNavigation();
  initFeedScroller();
  initFeedAudio();
  refreshSessionFromServer();
  fetchEvents();
  fetchStories();
  renderStickerCanvas();
  recordAnalyticsEvent('app_opened');

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

function recordLocationClicked(town) {
  recordAnalyticsEvent('location_clicked', { contentTown: town || undefined });
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
      if (currentUser) fetchNotifications();
    });

    // بثّ بلدة — الحمولة بلا عنوان ولا نص عمداً (القناة بلا غرف، تصل كل
    // عميل متصل)؛ نتجاهلها ونعيد الجلب دائماً، بنفس انضباط قناة الإشعارات
    // أعلاه (#85 خطوة 28-31).
    socket.on('town_broadcast', () => {
      fetchLiveBroadcasts();
      if (currentUser) fetchNotifications();
    });

    // «مناسبة جديدة» كُتبت للجميع دفعة واحدة — إشارة عامة واحدة بدل واحدة
    // لكل مستخدم؛ نعيد جلب مركزنا نحن فقط (الإعلان نفسه يأتي من new_event_created).
    socket.on('system_notification', () => {
      if (currentUser) fetchNotifications();
    });

    // إعدادات البث تغيّرت — الحمولة فارغة عمداً؛ نعيد قراءة الحالة، والنافذة إن كانت مفتوحة.
    socket.on('live_status', () => {
      fetchLiveStatus();
      if (isLiveSectionOpen()) fetchLiveHub();
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
      defaultEventAudioUrl = data.settings.default_event_audio_url || null;
      // التغذية قد تكون رُسمت قبل وصول الإعدادات — أعِد رسمها كي تظهر كتلة
      // المقطع الافتراضي على كروتها بلا انتظار جلب جديد.
      if (defaultEventAudioUrl && allEvents.length) renderEvents(allEvents);
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
  const fab = document.getElementById('supportFab');
  const configured = !!supportWhatsappNumber;
  if (btn) {
    btn.hidden = false;
    btn.classList.toggle('support-btn-disabled', !configured);
    btn.title = configured ? 'الدعم الفني عبر واتساب' : 'الدعم الفني غير مُفعَّل بعد';
  }
  if (fab) {
    fab.hidden = false;
    fab.classList.toggle('support-btn-disabled', !configured);
    fab.title = configured ? 'الدعم الفني عبر واتساب' : 'الدعم الفني غير مُفعَّل بعد';
  }
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
    if (data.success && data.stories) {
      allStories = data.stories;
      renderStoriesStrip();
    }
  } catch (e) {
    console.error('Stories error:', e);
  }
}

/**
 * يبني شريط القصص في الموضعين (الصفحة والدرج العلوي) من allStories وحدها —
 * openStoryViewer(i) يعتمد على i كفهرس في تلك المصفوفة تحديداً.
 */
function renderStoriesStrip() {
  const container = document.getElementById('storiesContainer');
  const drawerContainer = document.getElementById('drawerStoriesContainer');
  const html = allStories.map((s, i) => `
    <div class="story-item" onclick="openStoryViewer(${i}); toggleTopChrome(false);">
      <div class="story-avatar-ring ${s.isLive ? 'live' : ''}">
        <img src="${s.image}" class="story-avatar-img" alt="${escapeHtml(s.title)}">
      </div>
      <span class="story-title">${escapeHtml(s.title)}</span>
    </div>
  `).join('');
  if (container) container.innerHTML = html;
  if (drawerContainer) drawerContainer.innerHTML = html;
  updateFeedDimensions();
}

// «البث المباشر» — زرّان دائمان (الترويسة والشريط العائم) ونافذة واحدة.

/**
 * هل البث قائم الآن؟ active من الخادم أولاً (getLiveChannel يشتقّه من until)،
 * ثم until نفسه محلياً — كي تنطفئ الشارة في موعدها بلا انتظار حدث ولا إعادة جلب.
 */
function isLiveNow(state) {
  const live = state && state.live;
  if (!live || !live.active) return false;
  const until = Date.parse(live.until);
  return Number.isNaN(until) || until > Date.now();
}

/** رابط http(s) فقط يصل href — أي شيء آخر (javascript: مثلاً) يُسقَط. */
function safeHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

/** نصف البث من GET /api/live أو GET /api/live/hub — الشكل نفسه في الاثنين. */
function toLiveState(data) {
  return {
    profile_url: data.profile_url || null,
    live: data.live || null,
    embed_url: data.embed_url || null,
    live_channel_url: data.live_channel_url || null
  };
}

/**
 * حالة البث — GET /api/live عام بلا مصادقة، فلا auth:true هنا. لا يُخفي ولا
 * يُظهر أي زرّ؛ يضبط الشارة وحدها.
 */
async function fetchLiveStatus() {
  try {
    const res = await apiFetch('/api/live');
    const data = await res.json();
    if (data.success) {
      liveState = toLiveState(data);
      updateLiveEntryBadge();
    }
  } catch (e) {
    console.error('Live status error:', e);
  }
}

/**
 * شارة «مباشر» على الزرّين معاً، ومؤقّت واحد يطفئها عند until. setTimeout
 * يفيض بعد ~24 يوماً، فالمؤقّت مسقوف ويعيد الحساب عند انطلاقه لا أكثر.
 */
function updateLiveEntryBadge() {
  const active = isLiveNow(liveState);
  const headerBtn = document.getElementById('liveEntryBtn');
  const floatingBtn = document.getElementById('floatingLiveEntryBtn');
  const headerBadge = document.getElementById('liveEntryBadge');
  const floatingBadge = document.getElementById('floatingLiveEntryBadge');
  if (headerBtn) headerBtn.classList.toggle('is-live', active);
  if (floatingBtn) floatingBtn.classList.toggle('is-live', active);
  if (headerBadge) headerBadge.hidden = !active;
  if (floatingBadge) floatingBadge.hidden = !active;

  clearTimeout(liveBadgeTimer);
  liveBadgeTimer = null;
  if (active) {
    const msLeft = Date.parse(liveState.live.until) - Date.now();
    if (msLeft > 0) liveBadgeTimer = setTimeout(updateLiveEntryBadge, Math.min(msLeft + 500, 2147483647));
  }
}

function isLiveSectionOpen() {
  const modal = document.getElementById('liveModal');
  return !!modal && modal.style.display === 'flex';
}

/** مدخل واحد لكل ما يفتح البث: الزرّان، وإشعار «بدأ البث المباشر»، و?live=1. */
function openLiveSection() {
  const modal = document.getElementById('liveModal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (liveHubState) {
    renderLiveSection();
  } else {
    showLiveStatusMessage('<p>جارٍ التحميل…</p>');
  }
  fetchLiveHub();
}

function closeLiveSection() {
  const modal = document.getElementById('liveModal');
  if (modal) modal.style.display = 'none';
  stopLivePlayer();
  subscribeLivePoll(null);
}

/** يُفرغ المشغّل كلياً — iframe يبقى في الصفحة يبقى صوته يعمل خلف نافذة مغلقة. */
function stopLivePlayer() {
  const box = document.getElementById('livePlayer');
  if (box) {
    box.querySelectorAll('iframe').forEach(frame => { frame.src = 'about:blank'; });
    box.innerHTML = '';
  }
  livePlayerKey = null;
}

/**
 * GET /api/live/hub — بالرمز حين يوجد فقط (my_vote ونتائج اليوم لمن صوّت)،
 * وبلا رمز للزائر. نصف البث فيه هو GET /api/live نفسه، فيُحدِّث الشارة أيضاً.
 */
async function fetchLiveHub() {
  try {
    const res = await apiFetch('/api/live/hub', { auth: Boolean(authToken) });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'failed');
    liveHubState = data;
    liveState = toLiveState(data);
    updateLiveEntryBadge();
    if (isLiveSectionOpen()) renderLiveSection();
  } catch (e) {
    console.error('Live hub error:', e);
    if (isLiveSectionOpen() && !liveHubState) {
      showLiveStatusMessage(`
        <p>تعذّر تحميل البث، تحقّق من الاتصال</p>
        <button type="button" class="live-go-btn" onclick="fetchLiveHub()">إعادة المحاولة</button>
      `);
    }
  }
}

/** رسالة تحميل/خطأ مكان محتوى النافذة كلّه. */
function showLiveStatusMessage(html) {
  const status = document.getElementById('liveStatusMessage');
  if (status) {
    status.innerHTML = html;
    status.hidden = false;
  }
  stopLivePlayer();
  ['liveInfo', 'livePoll', 'livePrevious'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

function renderLiveSection() {
  if (!liveHubState) return;
  const status = document.getElementById('liveStatusMessage');
  if (status) status.hidden = true;
  renderLivePlayer();
  renderLiveInfo();
  renderLivePoll();
  renderLivePrevious();
  const today = liveHubState.today;
  subscribeLivePoll(today && today.poll ? today.id : null);
}

/**
 * المشغّل: embed_url → iframe داخل الصفحة (+ «افتح في يوتيوب» دائماً تحته)؛
 * بث برابط غير قابل للتضمين → بطاقة و«ادخل البث» عبر /live/go؛ لا بث → «قناتنا».
 * لا يُعاد بناؤه حين لا يتغيّر ما يعرضه، كي لا تعيد كل إعادة قراءة تشغيل البث.
 */
function renderLivePlayer() {
  const box = document.getElementById('livePlayer');
  if (!box) return;
  const hub = liveHubState;
  const live = hub.live;
  const liveNow = isLiveNow(hub);
  const embedUrl = liveNow ? safeHttpUrl(hub.embed_url) : null;
  const channelUrl = safeHttpUrl(hub.live_channel_url || hub.profile_url);
  const shareUrl = safeHttpUrl(hub.share_url) || `${shareOrigin()}/live`;

  const key = embedUrl ? `embed|${embedUrl}|${live.url}|${live.title}`
    : liveNow ? `link|${live.title}|${shareUrl}`
    : `none|${channelUrl || ''}`;
  if (key === livePlayerKey) return;
  stopLivePlayer();
  livePlayerKey = key;

  if (embedUrl) {
    const externalUrl = safeHttpUrl(live.url);
    box.innerHTML = `
      <div class="live-player-frame">
        <iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(live.title || 'البث المباشر')}"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
      </div>
      ${externalUrl ? `<a class="live-external-link" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener">
        <i class="fa-brands fa-youtube" aria-hidden="true"></i> افتح في يوتيوب
      </a>` : ''}
    `;
  } else if (liveNow) {
    box.innerHTML = `
      <div class="live-player-card">
        <span class="live-player-tag"><span class="live-entry-dot" aria-hidden="true"></span> مباشر الآن</span>
        <strong>${escapeHtml(live.title)}</strong>
        <a class="live-go-btn" href="${escapeHtml(`${shareUrl}/go`)}" target="_blank" rel="noopener">
          <i class="fa-solid fa-play" aria-hidden="true"></i> ادخل البث
        </a>
      </div>
    `;
  } else {
    box.innerHTML = `
      <div class="live-player-card">
        <i class="fa-solid fa-tower-broadcast live-player-idle-icon" aria-hidden="true"></i>
        <strong>لا يوجد بث الآن</strong>
        ${channelUrl ? `<a class="live-go-btn" href="${escapeHtml(channelUrl)}" target="_blank" rel="noopener">قناتنا</a>` : ''}
      </div>
    `;
  }
}

/** عنوان البث (حين لا تحمله بطاقة الرابط أصلاً) · موضوع اليوم · سؤال الحلقة — كلٌّ يُخفى إن كان فارغاً. */
function renderLiveInfo() {
  const box = document.getElementById('liveInfo');
  if (!box) return;
  const hub = liveHubState;
  const today = hub.today;
  const rows = [];
  if (isLiveNow(hub) && safeHttpUrl(hub.embed_url) && hub.live.title) {
    rows.push(`<h4 class="live-info-title">${escapeHtml(hub.live.title)}</h4>`);
  }
  if (today && today.topic) {
    rows.push(`<p class="live-info-row"><span>موضوع اليوم</span>${escapeHtml(today.topic)}</p>`);
  }
  if (today && today.episode_question) {
    rows.push(`<p class="live-info-row"><span>سؤال الحلقة</span>${escapeHtml(today.episode_question)}</p>`);
  }
  box.innerHTML = rows.join('');
  box.hidden = rows.length === 0;
}

/** أشرطة النسب — لنتيجة اليوم بعد التصويت ولنتيجة الأمس معاً. */
function buildLivePollBarsHtml(results, totalVotes, myVote) {
  const bars = (Array.isArray(results) ? results : []).map(r => {
    const pct = Math.max(0, Math.min(100, Math.round(Number(r.percentage) || 0)));
    const mine = myVote !== null && myVote !== undefined && r.index === myVote;
    return `
      <div class="live-poll-bar${mine ? ' is-mine' : ''}">
        <div class="live-poll-bar-head">
          <span>${escapeHtml(String(r.label))}${mine ? ' <i class="fa-solid fa-check" aria-label="صوتك"></i>' : ''}</span>
          <span class="live-poll-bar-pct">${pct}%</span>
        </div>
        <div class="live-poll-bar-track"><div class="live-poll-bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join('');
  const total = Math.max(0, Number(totalVotes) || 0);
  return `<div class="live-poll-bars">${bars}</div><p class="live-poll-total">عدد المشاركين: ${total}</p>`;
}

/**
 * نقاش التطبيق: الخيارات للجميع، والنتائج لمن صوّت فقط — الخادم لا يرسلها
 * قبل ذلك أصلاً. لا استفتاء اليوم → القسم مخفي.
 */
function renderLivePoll() {
  const box = document.getElementById('livePoll');
  if (!box) return;
  const today = liveHubState && liveHubState.today;
  const poll = today && today.poll;
  if (!poll) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  const voted = poll.my_vote !== null && poll.my_vote !== undefined && Array.isArray(poll.results);
  const body = voted
    ? buildLivePollBarsHtml(poll.results, poll.total_votes, poll.my_vote)
    : `<div class="live-poll-options">${(poll.options || []).map((label, i) => `
        <button type="button" class="live-poll-option" onclick="voteLivePoll(${i})">${escapeHtml(String(label))}</button>
      `).join('')}</div>`;
  box.innerHTML = `
    <h4 class="live-block-title"><i class="fa-solid fa-comments" aria-hidden="true"></i> نقاش التطبيق</h4>
    <p class="live-poll-question">${escapeHtml(poll.question)}</p>
    ${body}
  `;
  box.hidden = false;
}

function renderLivePrevious() {
  const box = document.getElementById('livePrevious');
  if (!box) return;
  const previous = liveHubState && liveHubState.previous;
  if (!previous) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  box.innerHTML = `
    <h4 class="live-block-title"><i class="fa-solid fa-chart-simple" aria-hidden="true"></i> نتيجة نقاش الأمس</h4>
    <p class="live-poll-question">${escapeHtml(previous.poll_question)}</p>
    ${buildLivePollBarsHtml(previous.results, previous.total_votes, null)}
  `;
  box.hidden = false;
}

/** قناة live_poll_<id> لاستفتاء اليوم المعروض وحده — null يلغي الاشتراك. */
function subscribeLivePoll(episodeId) {
  const channel = episodeId ? `live_poll_${episodeId}` : null;
  if (channel === livePollChannel) return;
  if (socket && livePollChannel) socket.off(livePollChannel);
  livePollChannel = channel;
  if (socket && channel) {
    socket.on(channel, payload => applyLivePollUpdate(episodeId, payload));
  }
}

/** أصوات الآخرين لحظياً — تُعرض فقط لمن صوّت هو نفسه — الخادم يبثّها لكل متصل. */
function applyLivePollUpdate(episodeId, payload) {
  const today = liveHubState && liveHubState.today;
  if (!today || today.id !== episodeId || !today.poll || !payload) return;
  if (today.poll.my_vote === null || today.poll.my_vote === undefined) return;
  today.poll.results = payload.results;
  today.poll.total_votes = payload.total_votes;
  renderLivePoll();
}

/**
 * صوت واحد لا يتغيّر. زائر بلا حساب → نافذة الدخول ولا طلب؛ بعد الدخول
 * (resumePendingIntent) تُعاد قراءة النقاش إن بقيت النافذة مفتوحة.
 */
async function voteLivePoll(optionIndex) {
  const today = liveHubState && liveHubState.today;
  if (!today || !today.poll) return;
  if (!requireAuth({ type: 'live_vote' })) return;
  if (liveVoteInFlight) return;
  liveVoteInFlight = true;
  try {
    const res = await apiFetch(`/api/live/episodes/${today.id}/vote`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option_index: optionIndex })
    });
    // الجلسة انتهت — apiFetch فتح نافذة الدخول، والنقاش يُعاد بعدها.
    if (res.status === 401) { pendingIntent = { type: 'live_vote' }; return; }
    const data = await res.json();
    if (res.ok && data.success) {
      today.poll = data.poll;
      renderLivePoll();
      return;
    }
    showToast(data.message || 'تعذّر تسجيل صوتك، حاول مرة أخرى');
    // 409 «صوّتَّ مسبقاً» يعرض النتيجة، و400 «هذا النقاش مغلق» يحدّث النافذة —
    // كلاهما بإعادة القراءة نفسها.
    if (res.status === 409 || res.status === 400 || res.status === 404) fetchLiveHub();
  } catch (e) {
    showToast('تعذّر تسجيل صوتك، حاول مرة أخرى');
  } finally {
    liveVoteInFlight = false;
  }
}

/** رابط /live نفسه من الخادم (share_url)، بنفس طريقة مشاركة المناسبة. */
async function shareLiveSection() {
  const hub = liveHubState;
  const url = (hub && safeHttpUrl(hub.share_url)) || `${shareOrigin()}/live`;
  const title = hub && isLiveNow(hub) && hub.live.title ? hub.live.title : 'البث المباشر — أعراسنا';
  await shareLink({ title, line: title, url, copiedMessage: '📋 تم نسخ رابط البث' });
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
  // الستوري تُسمَع وحدها — موسيقى التغذية تسكت ما دام العارض مفتوحاً.
  pauseCurrentAudio();
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
  autoplayActiveFeedCard();
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
  window.addEventListener('scroll', handleFeedScroll, { passive: true });
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
 * ارتفاع الخلاصة = الشاشة ناقص **الكروم الثابت وحده** في وضع الموبايل.
 * على شاشات الديسكتوب (> 768px)، التغذية تتبع سكرول الماوس الحر كفيسبوك (window scroll)
 * وبلا قيد ارتفاع أو سناب، فتُحذف خاصّيتا top وheight ليأخذ الـCSS الكامل مجراه.
 */
function updateFeedDimensions() {
  const container = document.getElementById('eventsContainer');
  if (!container) return;

  if (window.innerWidth > 768) {
    container.style.removeProperty('top');
    container.style.removeProperty('height');
    return;
  }

  const headerEl = document.querySelector('.app-header');
  const isHeaderVisible = headerEl && window.getComputedStyle(headerEl).display !== 'none';
  const measure = (el) => (el ? Math.round(el.getBoundingClientRect().height || el.offsetHeight || 0) : 0);

  if (!isHeaderVisible) {
    container.style.setProperty('top', '0px', 'important');
    container.style.setProperty('height', '100dvh', 'important');
    return;
  }

  const feedTop = measure(headerEl);
  const feedBottom = measure(feedBottomChromeEl());
  const available = Math.max(Math.round(window.innerHeight * 0.6), window.innerHeight - feedTop - feedBottom);

  container.style.setProperty('top', `${feedTop}px`, 'important');
  container.style.setProperty('height', `${available}px`, 'important');
}

function handleFeedScroll() {
  const container = document.getElementById('eventsContainer');
  if (!container || isFetchingEvents) return;
  const hasMore = !!(currentPagination && currentPagination.page < currentPagination.totalPages);
  if (!hasMore) return;

  if (window.innerWidth > 768) {
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    if (documentHeight - (scrollY + windowHeight) <= 600) {
      loadMoreEvents();
    }
    return;
  }

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
  const containers = [
    document.getElementById('announcementsContainer'),
    document.getElementById('drawerAnnouncementsContainer')
  ].filter(Boolean);
  if (!containers.length) return;
  if (!announcements || !announcements.length) {
    containers.forEach(c => c.innerHTML = '');
    updateFeedDimensions();
    return;
  }

  const html = announcements.map(a => `
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
  containers.forEach(c => c.innerHTML = html);
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

/**
 * المكان الظاهر على الكرت: تحت البند الجامع «القرى والتجمعات» اسم القرية نفسها
 * أدقّ من البند — القرية المدرجة (village_name من الخادم)، وإلا الاسم الذي
 * كتبه الناشر لقرية غير مدرجة بعد (requested_village_name). غير ذلك: البلدة.
 * نصّ خام — المستدعي يهرّبه.
 */
function eventPlaceName(evt) {
  if (evt.town === VILLAGES_TOWN) {
    if (evt.village_name) return evt.village_name;
    if (evt.village_id == null && evt.requested_village_name) return evt.requested_village_name;
  }
  return evt.town;
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
  const stroke = encodeURIComponent(color || '#C59425');
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Cg fill='none' stroke='${stroke}' stroke-width='1.1' opacity='0.28'%3E%3Crect x='14' y='14' width='36' height='36'/%3E%3Crect x='14' y='14' width='36' height='36' transform='rotate(45 32 32)'/%3E%3C/g%3E%3C/svg%3E`;
}

function renderSingleEventCardHtml(evt) {
  let eventDate;
  if (typeof evt.event_date === 'string' && evt.event_date.includes('-')) {
    const [y, m, d] = evt.event_date.split('T')[0].split('-').map(Number);
    eventDate = new Date(y, m - 1, d);
  } else {
    eventDate = new Date(evt.event_date);
    eventDate.setHours(0, 0, 0, 0);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = eventDate - today;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

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

  const effectiveAudio = effectiveEventAudio(evt);
  const audioBlock = effectiveAudio ? `
    <div class="card-audio-player">
      <div class="audio-info-area">
        <div class="wave-bars" id="waveBars-${evt.id}" data-audio-event-id="${evt.id}">
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
        </div>
        <div class="audio-text">
          <div class="audio-title">${escapeHtml(effectiveAudio.title)}</div>
          <div class="audio-sub">استمع للشيلة أو الترحيب الصوتي</div>
        </div>
      </div>
      <button class="play-audio-btn" data-audio-event-id="${evt.id}" data-audio-url="${escapeHtml(effectiveAudio.url)}" onclick="toggleEventAudio(${evt.id}, this)" title="تشغيل / إيقاف" aria-pressed="false">
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

  const clanTownParts = [evt.family_clan, eventPlaceName(evt)].filter(Boolean).map(escapeHtml);
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
        ${typeShowsField(evt, 'dinner_time') && evt.dinner_time ? `
        <div class="detail-item">
          <i class="fa-solid fa-utensils"></i>
          <span><strong>${escapeHtml(typeFieldLabel(evt, 'dinner_time', 'طعام العشاء'))}:</strong> ${escapeHtml(evt.dinner_time)}</span>
        </div>` : ''}
        <div class="detail-item">
          <i class="fa-solid fa-location-dot"></i>
          <span><strong>الموقع:</strong> ${escapeHtml(evt.location_name)}</span>
        </div>
      </div>

      <!-- 1-Click Navigation -->
      <div class="nav-buttons-row">
        <a href="${wazeUrl}" target="_blank" class="waze-btn" onclick="recordLocationClicked('${escapeHtml(evt.town || '')}')">
          <i class="fa-brands fa-waze"></i> الملاحة عبر Waze
        </a>
        <a href="${mapsUrl}" target="_blank" class="maps-btn" onclick="recordLocationClicked('${escapeHtml(evt.town || '')}')">
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
    <div class="event-card${isMourning ? ' tone-mourning' : ''}" id="eventCard-${evt.id}"${toneStyle} data-solemn="${isMourning}" data-event-id="${evt.id}"${effectiveAudio ? ` data-audio-url="${escapeHtml(effectiveAudio.url)}"` : ''}>
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
    // لا كروت بعد الآن — لا كرت نشِط يبقى مقطعه يُسمَع فوق رسالة «لا توجد مناسبات».
    observeFeedCardsForAudio();
    activeFeedEventId = null;
    pauseCurrentAudio();
    return;
  }

  container.classList.toggle('events-feed-first-load', isFirstLoad);
  container.innerHTML = events.map(evt => renderSingleEventCardHtml(evt)).join('');
  updateFeedDimensions();
  // الكروت أُعيد إنشاؤها للتو: المراقب يتبع العناصر الجديدة، وحالة الزرّ تُستعاد
  // من المقطع الذي ربما لا يزال يُسمَع (إعادة رسم لا توقف الصوت).
  observeFeedCardsForAudio();
  syncAudioUi();
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
  syncAudioUi();
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
  if (willShow) {
    const ev = allEvents.find(e => e.id === eventId);
    recordAnalyticsEvent('event_viewed', { contentTown: ev ? ev.town : undefined });
  }
  // فتح التفاصيل يشغّل مقطع المناسبة (ضغطة حقيقية، فلا ترفضها سياسة التشغيل
  // التلقائي) ما لم يكن الصوت مكتوماً؛ الإغلاق يوقفه.
  const card = panel.closest('.event-card');
  const audioUrl = card && card.dataset.audioUrl;
  if (willShow && audioUrl && !soundMuted) {
    manuallyPausedEventId = null;
    playEventAudio(eventId, audioUrl);
  } else if (!willShow && currentAudioEventId === eventId) {
    manuallyPausedEventId = eventId;
    pauseCurrentAudio();
  }
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
        recordAnalyticsEvent('reminder_clicked', { contentTown: evt ? evt.town : undefined });
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
//
// قناة واحدة (currentAudio) لكل صوت في الصفحة: زرّ التشغيل في الكرت، التشغيل
// التلقائي للكرت النشِط في التغذية، وفتح تفاصيل مناسبة. حالة الأزرار وموجات
// الصوت تُشتقّ من حدثَي `playing`/`pause` الفعليين للعنصر لا من النيّة — لا
// أيقونة «إيقاف مؤقت» ما لم يكن الصوت يُسمَع فعلاً.

/**
 * المقطع الفعلي لمناسبة: مقطعها الخاص، وإلا المقطع الافتراضي للمنصّة — لكن
 * فقط إن كان نوعها يعرض حقل الصوت أصلاً. نوع يُخفي audio_url (العزاء اليوم)
 * لا صوت له إطلاقاً، لا خاصّاً ولا افتراضياً.
 */
function effectiveEventAudio(evt) {
  if (!evt || !typeShowsField(evt, 'audio_url')) return null;
  if (evt.audio_url) {
    return { url: evt.audio_url, title: evt.audio_title || 'شيلة الفرح والترحيب', isDefault: false };
  }
  if (defaultEventAudioUrl) {
    return { url: defaultEventAudioUrl, title: 'مقطع المناسبة', isDefault: true };
  }
  return null;
}

function readSoundMutedPreference() {
  try {
    return localStorage.getItem(SOUND_MUTED_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

let currentAudioPlaying = false;
let manuallyPausedEventId = null; // أوقفه المستخدم بيده — لا يُعاد تشغيله تلقائياً حتى يغادر الكرت

/** يعكس حالة currentAudio الفعلية على كل زرّ وموجة تخصّ مناسبة (قد يتكرّر الكرت في التغذية وعرض الإشعار معاً). */
function syncAudioUi() {
  document.querySelectorAll('.play-audio-btn[data-audio-event-id]').forEach(btn => {
    const playing = currentAudioPlaying && String(currentAudioEventId) === btn.dataset.audioEventId;
    btn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    btn.setAttribute('aria-pressed', String(playing));
  });
  document.querySelectorAll('.wave-bars[data-audio-event-id]').forEach(bars => {
    const playing = currentAudioPlaying && String(currentAudioEventId) === bars.dataset.audioEventId;
    bars.classList.toggle('playing', playing);
  });
}

function pauseCurrentAudio() {
  if (currentAudio) currentAudio.pause();
  currentAudioPlaying = false;
  syncAudioUi();
}

/**
 * يشغّل مقطع مناسبة عبر القناة الواحدة. نفس المناسبة ⇒ استئناف لا إعادة من
 * البداية. رفض المتصفّح (NotAllowedError: لا لمسة على الصفحة بعد) يُظهر رقاقة
 * «اضغط لتشغيل الصوت» بدل التظاهر بالتشغيل؛ أول لمسة تعيد المحاولة.
 */
function playEventAudio(eventId, audioUrl) {
  if (!audioUrl) return;
  if (!currentAudio || currentAudioEventId !== eventId) {
    if (currentAudio) currentAudio.pause();
    currentAudioPlaying = false;
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    currentAudioEventId = eventId;
    audio.addEventListener('playing', () => {
      if (audio !== currentAudio) return;
      currentAudioPlaying = true;
      audioUnlockNeeded = false;
      hideSoundUnlockChip();
      syncAudioUi();
    });
    ['pause', 'ended', 'error'].forEach(type => audio.addEventListener(type, () => {
      if (audio !== currentAudio) return;
      currentAudioPlaying = false;
      syncAudioUi();
    }));
  } else if (currentAudioPlaying) {
    return;
  }

  const audio = currentAudio;
  let attempt;
  try {
    attempt = audio.play();
  } catch (err) {
    attempt = Promise.reject(err);
  }
  Promise.resolve(attempt).catch(err => {
    if (audio !== currentAudio) return;
    currentAudioPlaying = false;
    syncAudioUi();
    if (err && err.name === 'NotAllowedError') {
      audioUnlockNeeded = true;
      showSoundUnlockChip();
    } else {
      console.error('Audio playback error:', err);
    }
  });
}

/** زرّ التشغيل في الكرت — يعمل دائماً، حتى مع كتم الصوت العام (الكتم يوقف التلقائي وحده). */
function toggleEventAudio(eventId, btnElement) {
  if (currentAudio && currentAudioEventId === eventId && currentAudioPlaying) {
    manuallyPausedEventId = eventId;
    pauseCurrentAudio();
    return;
  }
  manuallyPausedEventId = null;
  const url = btnElement && btnElement.dataset.audioUrl;
  playEventAudio(eventId, url);
}

/** يشغّل مقطع الكرت النشِط في التغذية إن سمحت كل الشروط — لا شيء غير ذلك يبدأ صوتاً بلا ضغطة. */
function autoplayActiveFeedCard() {
  if (soundMuted || document.hidden) return;
  const home = document.getElementById('tabHome');
  if (!home || !home.classList.contains('active-tab')) return;
  if (activeFeedEventId == null || activeFeedEventId === manuallyPausedEventId) return;
  const storyOverlay = document.getElementById('storyViewerOverlay');
  if (storyOverlay && storyOverlay.style.display === 'flex') return;
  const card = document.querySelector(`#eventsContainer .event-card[data-event-id="${activeFeedEventId}"]`);
  const url = card && card.dataset.audioUrl;
  if (!url) {
    // الكرت النشِط بلا صوت — لا يبقى مقطع الكرت السابق يُسمَع فوقه.
    if (currentAudioPlaying) pauseCurrentAudio();
    return;
  }
  playEventAudio(activeFeedEventId, url);
}

/** يوقف المقطع الحالي ويرميه — العودة إلى مناسبته لاحقاً تبدأه من أوّله لا من حيث توقّف. */
function stopCurrentAudio() {
  if (currentAudio) currentAudio.pause();
  currentAudio = null;
  currentAudioEventId = null;
  currentAudioPlaying = false;
  syncAudioUi();
}

/**
 * «ظهور» كرت في الشاشة: نسبته الظاهرة من نفسه، أو من ارتفاع الشاشة إن كان
 * أطول منها — وإلا لم يبلغ كرت طويل على الحاسوب عتبة النشاط أبداً.
 */
function feedCardVisibilityScore(entry) {
  if (!entry.isIntersecting) return 0;
  const viewport = (entry.rootBounds && entry.rootBounds.height) || window.innerHeight || 0;
  const ofViewport = viewport ? entry.intersectionRect.height / viewport : 0;
  return Math.max(entry.intersectionRatio, ofViewport);
}

/**
 * IntersectionObserver واحد على كروت التغذية: الكرت الأوضح ظهوراً (≥ النصف)
 * هو النشِط، والتعادل يُبقي النشِط الحالي كي لا يتقلّب الصوت بين كرتين.
 */
function handleFeedAudioIntersections(entries) {
  entries.forEach(entry => {
    const eventId = Number(entry.target.dataset.eventId);
    const score = feedCardVisibilityScore(entry);
    if (score > 0) feedCardVisibility.set(eventId, score);
    else feedCardVisibility.delete(eventId);
  });
  let next = null;
  let best = FEED_ACTIVE_MIN_SCORE;
  feedCardVisibility.forEach((score, eventId) => {
    if (score > best) {
      best = score;
      next = eventId;
    }
  });
  const currentScore = feedCardVisibility.get(activeFeedEventId);
  if (currentScore != null && currentScore >= best) next = activeFeedEventId;
  setActiveFeedCard(next);
}

/**
 * عزل كالستوري: تغيّر الكرت النشِط يُسكت أي مقطع لا يخصّه فوراً — أيّاً كان
 * من شغّله، ولو كان الصوت مكتوماً — ثم يبدأ مقطع الكرت الجديد من أوّله.
 */
function setActiveFeedCard(eventId) {
  if (eventId !== activeFeedEventId) {
    activeFeedEventId = eventId;
    manuallyPausedEventId = null;
    if (currentAudio && currentAudioEventId !== eventId) stopCurrentAudio();
  }
  autoplayActiveFeedCard();
}

function observeFeedCardsForAudio() {
  if (!feedAudioObserver) return;
  feedAudioObserver.disconnect();
  feedCardVisibility.clear();
  document.querySelectorAll('#eventsContainer .event-card[data-event-id]').forEach(card => feedAudioObserver.observe(card));
}

/** إعادة المحاولة بعد رفض سياسة التشغيل التلقائي — لمسة/ضغطة حقيقية على الصفحة هي ما يفتح الصوت. */
function retryBlockedAudio() {
  if (!audioUnlockNeeded || soundMuted) return;
  if (currentAudio && currentAudioEventId != null && !currentAudioPlaying) {
    const card = document.querySelector(`.event-card[data-event-id="${currentAudioEventId}"]`);
    playEventAudio(currentAudioEventId, (card && card.dataset.audioUrl) || currentAudio.src);
  } else {
    autoplayActiveFeedCard();
  }
}

function showSoundUnlockChip() {
  const chip = document.getElementById('soundUnlockChip');
  if (chip && !soundMuted) chip.hidden = false;
}

function hideSoundUnlockChip() {
  const chip = document.getElementById('soundUnlockChip');
  if (chip) chip.hidden = true;
}

/** مبدّل الصوت العام (الترويسة والشريط العائم) — تفضيل هذا الزائر وحده في localStorage. */
function toggleSoundMuted() {
  soundMuted = !soundMuted;
  try {
    localStorage.setItem(SOUND_MUTED_KEY, String(soundMuted));
  } catch (e) { /* التخزين المحلي معطَّل — التفضيل يبقى لهذه الجلسة فقط */ }
  if (soundMuted) {
    audioUnlockNeeded = false;
    hideSoundUnlockChip();
    pauseCurrentAudio();
  } else {
    autoplayActiveFeedCard();
  }
  updateSoundToggleUI();
}

function updateSoundToggleUI() {
  ['soundToggleBtn', 'floatingSoundBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.title = soundMuted ? 'الصوت مكتوم — اضغط لتفعيل التشغيل التلقائي' : 'الصوت مفعَّل — اضغط لكتمه';
    btn.setAttribute('aria-label', soundMuted ? 'تفعيل الصوت' : 'كتم الصوت');
    btn.setAttribute('aria-pressed', String(soundMuted));
    const icon = btn.querySelector('i');
    if (icon) icon.className = soundMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
  });
}

function initFeedAudio() {
  if (typeof IntersectionObserver !== 'undefined') {
    feedAudioObserver = new IntersectionObserver(handleFeedAudioIntersections, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseCurrentAudio();
    else autoplayActiveFeedCard();
  });
  // pointerdown/keydown كما طُلب، وpointerup/touchend/click لأنها ما يمنح المتصفّح
  // «تفاعل المستخدم» فعلاً على شاشات اللمس (pointerdown باللمس لا يمنحه).
  ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'].forEach(type => {
    document.addEventListener(type, retryBlockedAudio, true);
  });
  updateSoundToggleUI();
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
              <a href="${pt.waze_url}" target="_blank" class="map-popup-waze-btn" onclick="recordLocationClicked('${escapeHtml(pt.town || '')}')">الملاحة عبر Waze</a>
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
      // وقت العشاء يُملأ فقط إن استُخرج فعلاً — لا ساعة مقترَحة تُزرَع في حقل فارغ
      const dinnerInput = document.getElementById('addDinnerTime');
      if (dinnerInput && ext.dinner_time) dinnerInput.value = ext.dinner_time;
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

  const navIndex = ['tabHome', 'tabMap', 'tabNokoot', 'tabAccount', 'tabServices'].indexOf(tabId);
  const navBtns = document.querySelectorAll('.bottom-navbar .nav-btn');
  if (navBtns[navIndex]) navBtns[navIndex].classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // صوت التغذية يخصّ تبويبها وحده — مغادرته توقفه، والعودة إليه تستأنف الكرت النشِط.
  if (tabId === 'tabHome') autoplayActiveFeedCard();
  else pauseCurrentAudio();

  if (tabId === 'tabHome') updateFeedDimensions();
  else if (tabId === 'tabNokoot') loadNokootView();
  else if (tabId === 'tabAccount') loadAccountView();
  else if (tabId === 'tabStickers') renderStickerCanvas();
  else if (tabId === 'tabMap') initLeafletMap();
  else if (tabId === 'tabAdd') {
    if (!publishFormReady) initPublishForm();
    fetchMyEvents();
  } else if (tabId === 'tabServices') {
    if (!servicesInitialized) { servicesInitialized = true; initServicesTab(); }
  }
}

function openAddEventModal() {
  if (!requireAuth({ type: 'publish' })) return;
  switchTab('tabAdd');
}

function closeAddEventModal() {
  switchTab('tabHome');
}

function loadAccountView() {
  const guestView = document.getElementById('accountGuestView');
  const loggedInView = document.getElementById('accountLoggedInView');
  if (!guestView || !loggedInView) return;

  if (currentUser && authToken) {
    guestView.style.display = 'none';
    loggedInView.style.display = 'block';

    const nameEl = document.getElementById('accountUserName');
    if (nameEl) nameEl.textContent = currentUser.full_name || currentUser.name || 'المستخدم';

    const phoneEl = document.getElementById('accountUserPhone');
    if (phoneEl) phoneEl.textContent = currentUser.phone_number || currentUser.phone || '';

    const roleBadge = document.getElementById('accountUserRoleBadge');
    if (roleBadge) {
      if (currentUser.role === 'super_admin') {
        roleBadge.textContent = 'مدير عام المنصة';
        roleBadge.className = 'status-tag approved';
      } else if (currentUser.role === 'admin') {
        roleBadge.textContent = 'أدمن بلدة';
        roleBadge.className = 'status-tag approved';
      } else {
        roleBadge.textContent = 'مستخدم';
        roleBadge.className = 'status-tag pending';
      }
    }

    const adminEntry = document.getElementById('accountAdminEntry');
    if (adminEntry) {
      if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
        adminEntry.style.display = 'block';
      } else {
        adminEntry.style.display = 'none';
      }
    }

    // Sync analytics opt-out toggle in account screen
    const toggle = document.getElementById('accountAnalyticsOptOutToggle');
    if (toggle) {
      toggle.checked = localStorage.getItem('negev_analytics_opt_out') === 'true';
    }

    fetchMyEvents();
  } else {
    guestView.style.display = 'block';
    loggedInView.style.display = 'none';
  }
}

function handleLogout() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem('negev_user');
  localStorage.removeItem('negev_token');
  updateAuthUI();
  loadAccountView();
  showToast('تم تسجيل الخروج بنجاح');
  switchTab('tabHome');
}

/** زرّ الهوية (الترويسة والشريط العائم معاً) — دخول لمن لا جلسة له، وخروج مؤكَّد لمن له جلسة. */
function handleAuthButtonClick() {
  if (currentUser) {
    if (confirm('هل تريد تسجيل الخروج؟')) handleLogout();
    return;
  }
  openAuthModal();
}

/**
 * جلسة الموقع انتهت (401 من أي نداء يحمل رمز الموقع — api.js يستدعيها مركزياً).
 * تمسح الجلسة كما يفعل handleLogout لكن بلا تبديل تبويب: نموذج نصف مكتمل يبقى
 * كما هو، وpendingIntent (إن ضبطه المستدعي) يُستأنف بعد الدخول من جديد. عدّة
 * نداءات 401 متوازية تصل هنا معاً — الأولى وحدها تجد جلسة فتُظهر النافذة،
 * والبقية تجدها ممسوحة فتعود بصمت (نافذة واحدة لا خمس).
 */
function handleSessionExpired() {
  if (!currentUser && !authToken) return;
  currentUser = null;
  authToken = null;
  try {
    localStorage.removeItem('negev_user');
    localStorage.removeItem('negev_token');
  } catch (e) { /* التخزين المحلي معطَّل — الجلسة ممسوحة من الذاكرة على الأقل */ }
  updateAuthUI();
  loadAccountView();
  showToast('انتهت جلستك، يرجى تسجيل الدخول من جديد');
  openAuthModal();
}

/**
 * عند فتح الصفحة: الجلسة المحفوظة محلياً ادّعاء قد يكون قديماً — GET /api/auth/me
 * يؤكّدها ويحدّث بيانات المستخدم، ويجدّد الرمز للمستخدم العادي حين يرسله الخادم.
 * 401 يمرّ بمعالجة api.js المركزية (handleSessionExpired)؛ انقطاع الشبكة يُبقي
 * الجلسة المحفوظة كما هي — غياب الاتصال ليس دليلاً على انتهائها.
 */
async function refreshSessionFromServer() {
  if (!authToken) return;
  const sentToken = authToken;
  try {
    const res = await apiFetch('/api/auth/me', { auth: true });
    if (res.status === 401) return;
    const data = await res.json();
    // خرج المستخدم أو دخل بحساب آخر أثناء الطلب — الاستجابة لم تعد تخصّ جلسته الحالية.
    if (authToken !== sentToken) return;
    if (data.success && data.user) {
      currentUser = data.user;
      if (data.token) authToken = data.token;
      try {
        localStorage.setItem('negev_user', JSON.stringify(currentUser));
        if (data.token) localStorage.setItem('negev_token', authToken);
      } catch (e) { /* التخزين المحلي معطَّل — الجلسة الحالية تبقى تعمل */ }
      updateAuthUI();
    }
  } catch (e) {
    console.error('Session refresh error:', e);
  }
}

function openStickerStudioModal() {
  switchTab('tabStickers');
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
  } else if (intent.type === 'publish_retry') {
    // الجلسة انتهت لحظة الإرسال (401) — النموذج بقي بقيمه كما هي، فيُعاد
    // الإرسال نفسه تلقائياً بالرمز الجديد بدل أن يعيد المستخدم الكتابة.
    switchTab('tabAdd');
    handleEventSubmit({ preventDefault() {} });
  } else if (intent.type === 'congratulate') {
    // نافذة التبريكات لم تُغلَق أصلاً — فقط اسم المرسِل يُحدَّث الآن بعد الدخول.
    const senderInput = document.getElementById('chatSenderName');
    if (senderInput && currentUser) senderInput.value = currentUser.full_name;
  } else if (intent.type === 'submit_service') {
    openSubmitServiceModal();
  } else if (intent.type === 'live_vote') {
    // نافذة البث بقيت مفتوحة تحت نافذة الدخول — تُقرأ من جديد بالرمز فيظهر صوت سابق إن وُجد.
    if (isLiveSectionOpen()) fetchLiveHub();
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
  const text = filterChipLabelText(cfg, cfg.selected());
  const label = document.getElementById(cfg.chipLabelId);
  if (label) label.textContent = text;

  if (key === 'place') {
    const drawerLabel = document.getElementById('drawerPlaceChipLabel');
    if (drawerLabel) drawerLabel.textContent = text;
  } else if (key === 'kind') {
    const drawerLabel = document.getElementById('drawerKindChipLabel');
    if (drawerLabel) drawerLabel.textContent = text;
  }

  updateFloatingFilterLabel();
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
  if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
  const drawerSearch = document.getElementById('drawerSearchInput');
  if (drawerSearch && drawerSearch.value !== val) drawerSearch.value = val;
  const drawerClear = document.getElementById('drawerClearSearchBtn');
  if (drawerClear) drawerClear.style.display = val ? 'block' : 'none';

  updateFloatingFilterLabel();
  fetchEvents();
}

function clearSearch() {
  const input = document.getElementById('eventSearchInput');
  if (input) input.value = '';
  const drawerSearch = document.getElementById('drawerSearchInput');
  if (drawerSearch) drawerSearch.value = '';
  searchQuery = '';
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  const drawerClear = document.getElementById('drawerClearSearchBtn');
  if (drawerClear) drawerClear.style.display = 'none';

  updateFloatingFilterLabel();
  fetchEvents();
}

function updateFloatingFilterLabel() {
  const floatingLabel = document.getElementById('floatingFilterLabel');
  const floatingDot = document.getElementById('floatingFilterDot');
  const floatingBtn = document.getElementById('floatingFilterBtn');
  if (!floatingLabel) return;

  const hasSearch = Boolean(searchQuery && searchQuery.trim());
  const hasPlaces = (selectedTowns && selectedTowns.length > 0) || (selectedVillageIds && selectedVillageIds.length > 0);
  const hasKinds = selectedOccasionTypeIds && selectedOccasionTypeIds.length > 0;
  const hasArchive = Boolean(showArchive);
  const hasActiveFilters = hasSearch || hasPlaces || hasKinds || hasArchive;

  if (floatingDot) {
    floatingDot.style.display = hasActiveFilters ? 'inline-block' : 'none';
  }
  if (floatingBtn) {
    if (hasActiveFilters) floatingBtn.classList.add('has-filter');
    else floatingBtn.classList.remove('has-filter');
  }

  if (hasSearch) {
    floatingLabel.textContent = `بحث: ${searchQuery.trim()}`;
    return;
  }

  const placeCfg = FILTER_SHEETS.place;
  const kindCfg = FILTER_SHEETS.kind;
  const placeText = (hasPlaces && placeCfg) ? filterChipLabelText(placeCfg, placeCfg.selected()) : '';
  const kindText = (hasKinds && kindCfg) ? filterChipLabelText(kindCfg, kindCfg.selected()) : '';

  if (hasPlaces && hasKinds) {
    floatingLabel.textContent = `${placeText} • ${kindText}`;
  } else if (hasPlaces) {
    floatingLabel.textContent = placeText;
  } else if (hasKinds) {
    floatingLabel.textContent = kindText;
  } else if (hasArchive) {
    floatingLabel.textContent = 'المناسبات المنتهية';
  } else {
    floatingLabel.textContent = 'الفلاتر والبحث';
  }
}

function toggleTopChrome(show) {
  const drawer = document.getElementById('topChromeDrawer');
  const backdrop = document.getElementById('topChromeBackdrop');
  if (!drawer || !backdrop) return;

  if (show) {
    drawer.style.display = 'flex';
    backdrop.style.display = 'block';

    // renderStoriesStrip هي الوحيدة التي تبني الشريطين معاً، فلا يفترقان.
    renderStoriesStrip();

    const drawerSearch = document.getElementById('drawerSearchInput');
    if (drawerSearch) {
      drawerSearch.value = searchQuery || '';
      const clearBtn = document.getElementById('drawerClearSearchBtn');
      if (clearBtn) clearBtn.style.display = searchQuery ? 'block' : 'none';
    }

    const archiveSwitch = document.getElementById('drawerArchiveSwitch');
    if (archiveSwitch) archiveSwitch.checked = Boolean(showArchive);

    const drawerAnnounce = document.getElementById('drawerAnnouncementsContainer');
    const mainAnnounce = document.getElementById('announcementsContainer');
    if (drawerAnnounce && mainAnnounce) {
      drawerAnnounce.innerHTML = mainAnnounce.innerHTML;
    }
  } else {
    drawer.style.display = 'none';
    backdrop.style.display = 'none';
  }
}

let drawerSearchDebounceTimer = null;
function handleDrawerSearch(query) {
  searchQuery = query;
  const mainInput = document.getElementById('eventSearchInput');
  if (mainInput) mainInput.value = query;
  const clearBtn = document.getElementById('drawerClearSearchBtn');
  if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';
  const mainClear = document.getElementById('clearSearchBtn');
  if (mainClear) mainClear.style.display = query ? 'block' : 'none';

  clearTimeout(drawerSearchDebounceTimer);
  drawerSearchDebounceTimer = setTimeout(() => {
    updateFloatingFilterLabel();
    fetchEvents();
  }, 400);
}

function clearDrawerSearch() {
  const drawerSearch = document.getElementById('drawerSearchInput');
  if (drawerSearch) drawerSearch.value = '';
  const clearBtn = document.getElementById('drawerClearSearchBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  handleDrawerSearch('');
}

function toggleArchiveSwitch(checked) {
  showArchive = checked;
  const mainBtn = document.getElementById('archiveToggleBtn');
  if (mainBtn) mainBtn.classList.toggle('active', showArchive);
  const drawerSwitch = document.getElementById('drawerArchiveSwitch');
  if (drawerSwitch) drawerSwitch.checked = showArchive;

  updateFloatingFilterLabel();
  fetchEvents();
}

function refreshEventsFeed() {
  fetchStories();
  fetchEvents({ page: 1 });
  showToast('🔄 تم تحديث المناسبات');
}

// Agenda Calendar state & functions
let agendaCurrentDate = new Date();
let agendaSelectedDate = new Date();
const AR_MONTHS_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

function openAgendaModal() {
  toggleTopChrome(false);
  const modal = document.getElementById('agendaModal');
  if (modal) modal.style.display = 'flex';
  agendaCurrentDate = new Date();
  agendaSelectedDate = new Date();
  renderAgendaCalendar();
}

function closeAgendaModal() {
  const modal = document.getElementById('agendaModal');
  if (modal) modal.style.display = 'none';
}

function changeAgendaMonth(delta) {
  agendaCurrentDate.setMonth(agendaCurrentDate.getMonth() + delta);
  renderAgendaCalendar();
}

function renderAgendaCalendar() {
  const year = agendaCurrentDate.getFullYear();
  const month = agendaCurrentDate.getMonth();
  const monthDisplay = document.getElementById('agendaMonthDisplay');
  if (monthDisplay) {
    monthDisplay.textContent = `${AR_MONTHS_NAMES[month]} ${year}`;
  }

  const grid = document.getElementById('agendaDaysGrid');
  if (!grid) return;

  const firstDay = new Date(year, month, 1);
  const startingDay = firstDay.getDay(); // 0 = Sunday
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  const eventDateCounts = {};
  allEvents.forEach(evt => {
    if (evt.event_date) {
      eventDateCounts[evt.event_date] = (eventDateCounts[evt.event_date] || 0) + 1;
    }
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const selectedDateStr = agendaSelectedDate.toISOString().slice(0, 10);

  let html = '';

  for (let i = startingDay - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    html += `<div class="agenda-day-cell other-month">${dayNum}</div>`;
  }

  for (let d = 1; d <= totalDays; d++) {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    const fullDateStr = `${year}-${monthStr}-${dayStr}`;
    const isToday = fullDateStr === todayStr;
    const isSelected = fullDateStr === selectedDateStr;
    const hasEvents = Boolean(eventDateCounts[fullDateStr]);

    html += `
      <div class="agenda-day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="selectAgendaDate('${fullDateStr}')">
        <span>${d}</span>
        ${hasEvents ? '<span class="agenda-day-dot"></span>' : ''}
      </div>
    `;
  }

  const totalCells = startingDay + totalDays;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let n = 1; n <= remainingCells; n++) {
    html += `<div class="agenda-day-cell other-month">${n}</div>`;
  }

  grid.innerHTML = html;
  renderAgendaSelectedDayEvents(selectedDateStr);
}

function selectAgendaDate(dateStr) {
  agendaSelectedDate = new Date(dateStr + 'T00:00:00');
  renderAgendaCalendar();
}

function renderAgendaSelectedDayEvents(dateStr) {
  const labelEl = document.getElementById('agendaSelectedDateLabel');
  const countBadge = document.getElementById('agendaDayCountBadge');
  const listEl = document.getElementById('agendaEventsList');
  if (!listEl) return;

  const eventsOnDate = allEvents.filter(e => e.event_date === dateStr);
  const d = new Date(dateStr + 'T00:00:00');
  const formattedDate = `${d.getDate()} ${AR_MONTHS_NAMES[d.getMonth()]} ${d.getFullYear()}`;

  if (labelEl) labelEl.textContent = `مناسبات ${formattedDate}`;
  if (countBadge) countBadge.textContent = `${eventsOnDate.length} مناسبة`;

  if (!eventsOnDate.length) {
    listEl.innerHTML = `<p class="empty-state" style="padding:14px; text-align:center; font-size:0.88rem; color:var(--ink-soft);">لا توجد مناسبات مسجلة في هذا اليوم</p>`;
    return;
  }

  listEl.innerHTML = eventsOnDate.map(evt => `
    <div class="agenda-event-item" onclick="closeAgendaModal(); openEventDetailsModal(${evt.id});">
      <div>
        <div class="agenda-event-title">${escapeHtml(evt.title || evt.groom_name)}</div>
        <div class="agenda-event-meta">
          <span class="town-badge">${escapeHtml(evt.town)}</span>
          ${evt.occasion_type?.name ? `<span>${escapeHtml(evt.occasion_type.name)}</span>` : ''}
        </div>
      </div>
      <i class="fa-solid fa-chevron-left" style="color:var(--ink-faint);"></i>
    </div>
  `).join('');
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
  syncRequestedVillageInput('add');
}

function populateVillageSelect() {
  const select = document.getElementById('addVillage');
  if (!select) return;
  select.innerHTML = villageSelectOptionsHtml(villagesList);
}

/** اختيار القرية يوسّط الخريطة على مركزها — ما لم يكن المستخدم قد حرّك الدبّوس يدوياً بالفعل. */
function handleAddVillageChange() {
  syncRequestedVillageInput('add');
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

// 12c. Services Directory Tab (تذكرة #31) — كروت خدمات المناسبات الفاخرة
// مع المواصفات والخصائص الديناميكية والأسعار التقديرية والفلاتر الذكية.
// الحفاظ الصارم على الأمان: الخادم لا يرسل رقم الهاتف في استعلام القائمة أبداً (#25)،
// بل يُجلب حصراً عند طلب التواصل الصريح عبر GET /api/services/providers/:id.

async function initServicesTab() {
  await loadTownCoordinates();
  updateServiceFilterChipLabels();
  await initServiceCategoryTabs();
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

  const allTab = `<button class="town-pill ${!selectedServiceCategoryId ? 'active' : ''}" data-cat-id="" onclick="selectServiceCategory(null)">الكل</button>`;
  const catTabs = serviceCategoriesCache.map(c => `
    <button class="town-pill ${selectedServiceCategoryId === c.id ? 'active' : ''}" data-cat-id="${c.id}" onclick="selectServiceCategory(${c.id})">
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
  updateServiceFilterChipLabels();
  fetchServiceProviders();
}

function updateServiceFilterChipLabels() {
  const placeLabel = document.getElementById('servicePlaceChipLabel');
  if (placeLabel) {
    placeLabel.textContent = selectedServiceTown ? selectedServiceTown : 'كل البلدات';
  }
  const categoryLabel = document.getElementById('serviceCategoryChipLabel');
  if (categoryLabel) {
    if (selectedServiceCategoryId && serviceCategoriesCache) {
      const cat = serviceCategoriesCache.find(c => c.id === selectedServiceCategoryId);
      categoryLabel.textContent = cat ? cat.name : 'كل الفئات';
    } else {
      categoryLabel.textContent = 'كل الفئات';
    }
  }
  const clearBtn = document.getElementById('serviceClearFiltersBtn');
  if (clearBtn) {
    const hasFilters = !!(selectedServiceTown || selectedServiceCategoryId || serviceSearchQuery);
    clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
  }
}

function openServicePlaceSheet() {
  serviceDraftTown = selectedServiceTown;
  const searchInput = document.getElementById('servicePlaceFilterSearchInput');
  if (searchInput) searchInput.value = '';
  renderServiceFilterSheetList('place');
  const modal = document.getElementById('servicePlaceFilterModal');
  if (modal) modal.style.display = 'flex';
}

function openServiceCategorySheet() {
  serviceDraftCategoryId = selectedServiceCategoryId;
  const searchInput = document.getElementById('serviceCategoryFilterSearchInput');
  if (searchInput) searchInput.value = '';
  renderServiceFilterSheetList('category');
  const modal = document.getElementById('serviceCategoryFilterModal');
  if (modal) modal.style.display = 'flex';
}

function closeServiceFilterSheet(type) {
  const modalId = type === 'place' ? 'servicePlaceFilterModal' : 'serviceCategoryFilterModal';
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

function renderServiceFilterSheetList(type) {
  if (type === 'place') {
    const list = document.getElementById('servicePlaceFilterList');
    if (!list) return;
    const query = (document.getElementById('servicePlaceFilterSearchInput')?.value || '').trim();
    const options = [
      { id: '', label: 'كل البلدات' },
      ...townsList.map(t => ({ id: t, label: t }))
    ].filter(opt => !query || opt.label.includes(query));

    if (!options.length) {
      list.innerHTML = `<p class="filter-sheet-empty">لا نتائج مطابقة</p>`;
      return;
    }

    list.innerHTML = options.map(opt => {
      const isChecked = serviceDraftTown === opt.id;
      return `
        <label class="filter-option-row">
          <input type="radio" name="servicePlaceRadio" value="${escapeHtml(opt.id)}" ${isChecked ? 'checked' : ''} onchange="serviceDraftTown = this.value">
          <span>${escapeHtml(opt.label)}</span>
        </label>`;
    }).join('');
  } else if (type === 'category') {
    const list = document.getElementById('serviceCategoryFilterList');
    if (!list) return;
    const query = (document.getElementById('serviceCategoryFilterSearchInput')?.value || '').trim();
    const options = [
      { id: null, label: 'كل الفئات', icon: '' },
      ...(serviceCategoriesCache || []).map(c => ({ id: c.id, label: c.name, icon: c.icon }))
    ].filter(opt => !query || opt.label.includes(query));

    if (!options.length) {
      list.innerHTML = `<p class="filter-sheet-empty">لا نتائج مطابقة</p>`;
      return;
    }

    list.innerHTML = options.map(opt => {
      const isChecked = serviceDraftCategoryId === opt.id;
      return `
        <label class="filter-option-row">
          <input type="radio" name="serviceCatRadio" value="${opt.id === null ? '' : opt.id}" ${isChecked ? 'checked' : ''} onchange="serviceDraftCategoryId = this.value ? Number(this.value) : null">
          <span>${opt.icon ? escapeHtml(opt.icon) + ' ' : ''}${escapeHtml(opt.label)}</span>
        </label>`;
    }).join('');
  }
}

function applyServiceFilterSheet(type) {
  if (type === 'place') {
    selectedServiceTown = serviceDraftTown;
    closeServiceFilterSheet('place');
  } else if (type === 'category') {
    selectedServiceCategoryId = serviceDraftCategoryId;
    // sync slider pills
    document.querySelectorAll('#serviceCategoryTabs .town-pill').forEach(pill => {
      const pillId = pill.dataset.catId ? Number(pill.dataset.catId) : null;
      pill.classList.toggle('active', pillId === selectedServiceCategoryId);
    });
    closeServiceFilterSheet('category');
  }
  updateServiceFilterChipLabels();
  fetchServiceProviders();
}

function clearServiceFilters() {
  selectedServiceTown = '';
  selectedServiceCategoryId = null;
  serviceSearchQuery = '';
  const searchInput = document.getElementById('serviceSearchInput');
  if (searchInput) searchInput.value = '';
  const clearSearchBtn = document.getElementById('clearServiceSearchBtn');
  if (clearSearchBtn) clearSearchBtn.style.display = 'none';

  document.querySelectorAll('#serviceCategoryTabs .town-pill').forEach(pill => {
    const pillId = pill.dataset.catId ? Number(pill.dataset.catId) : null;
    pill.classList.toggle('active', pillId === null);
  });

  updateServiceFilterChipLabels();
  fetchServiceProviders();
}

function handleServiceSearch() {
  const input = document.getElementById('serviceSearchInput');
  const clearBtn = document.getElementById('clearServiceSearchBtn');
  const val = (input?.value || '').trim();
  serviceSearchQuery = val;
  if (clearBtn) clearBtn.style.display = val ? 'inline-block' : 'none';
  updateServiceFilterChipLabels();

  if (serviceDebounceTimer) clearTimeout(serviceDebounceTimer);
  serviceDebounceTimer = setTimeout(() => {
    fetchServiceProviders();
  }, 250);
}

function clearServiceSearch() {
  const input = document.getElementById('serviceSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('clearServiceSearchBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  serviceSearchQuery = '';
  updateServiceFilterChipLabels();
  fetchServiceProviders();
}

async function fetchServiceProviders(options = {}) {
  const { append = false } = options;
  const container = document.getElementById('servicesListContainer');
  if (!container) return;

  if (!append) {
    servicesPage = 1;
    container.innerHTML = `
      <div class="card-skeleton skeleton-shimmer"><div class="skeleton-shot"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>
      <div class="card-skeleton skeleton-shimmer"><div class="skeleton-shot"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>
    `;
  }

  try {
    const params = new URLSearchParams();
    if (selectedServiceCategoryId) params.set('category_id', selectedServiceCategoryId);
    if (selectedServiceTown) params.set('town', selectedServiceTown);
    if (serviceSearchQuery) params.set('search', serviceSearchQuery);
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

function formatProviderAttributes(rawAttrs, categoryId) {
  if (!rawAttrs) return [];
  if (Array.isArray(rawAttrs)) {
    return rawAttrs.filter(a => a && a.value !== undefined && a.value !== null && a.value !== '');
  }
  if (typeof rawAttrs === 'object') {
    const cat = (serviceCategoriesCache || []).find(c => c.id === categoryId);
    const catAttrs = (cat && Array.isArray(cat.attributes)) ? cat.attributes : [];
    const result = [];
    for (const [key, val] of Object.entries(rawAttrs)) {
      if (val === undefined || val === null || val === '') continue;
      const def = catAttrs.find(a => a.attr_key === key);
      result.push({
        attr_key: key,
        label: def ? def.label : key,
        value: val,
        unit: def ? (def.unit || '') : ''
      });
    }
    return result;
  }
  return [];
}

function renderServiceProviders(providers) {
  const container = document.getElementById('servicesListContainer');
  if (!providers || !providers.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-screwdriver-wrench"></i>
        <h3>لا توجد خدمات مطابقة</h3>
        <p>${serviceSearchQuery || selectedServiceTown || selectedServiceCategoryId ? 'جرب تغيير أو مسح الفلاتر لعرض مزيد من الخدمات' : 'سيُضيف الأدمن مزوّدي الخدمات قريباً'}</p>
      </div>`;
    return;
  }

  container.innerHTML = providers.map(p => renderSingleServiceCardHtml(p)).join('');
}

function renderSingleServiceCardHtml(p) {
  const toneColor = p.category_color
    ? (p.category_color.startsWith('#') ? p.category_color : `#${p.category_color}`)
    : '#B8860B';
  const toneStyle = ` style="--tone:${toneColor}"`;
  const bezelSvg = getBezelOrnamentSvg(toneColor);
  const bezelStyle = ` style="background-image:url(&quot;${bezelSvg}&quot;)"`;

  // Price Badge text
  let priceBadgeText = 'سعر تقديري';
  if (p.price_type === 'contact') priceBadgeText = 'تواصل للسعر';
  else if (p.price_type === 'starting_at') priceBadgeText = 'ابتداءً من';
  else if (p.price_type === 'fixed') priceBadgeText = 'سعر محدد';

  // Floating Media Content
  const mediaHtml = p.image_url ? `
    <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="card-media-img" loading="lazy">` : `
    <div class="service-card-media-placeholder">
      <span class="placeholder-icon">${p.category_icon ? escapeHtml(p.category_icon) : '🛠️'}</span>
    </div>`;

  // Towns line
  const townsText = (p.towns && p.towns.length)
    ? (p.towns.includes('جميع البلدات') || p.towns.length > 5 ? 'يخدم جميع بلدات ومناطق النقب' : `يخدم: ${p.towns.join('، ')}`)
    : 'يخدم مناطق النقب';

  // Attributes & Specs for Collapsible Details Panel
  const attrs = formatProviderAttributes(p.attributes, p.category_id);

  // Package Estimate Banner (مختصر وأنيق على الكرت — المواصفات والكميات تظهر كاملة عند النقر أو الضغط على مزيد من التفاصيل)
  const packageBannerHtml = p.price_estimate_desc ? `
    <div class="service-package-banner">
      <div class="service-package-header">
        <i class="fa-solid fa-calculator"></i>
        <span>📦 حزمة نموذجية استرشادية بهذا السعر:</span>
      </div>
      <div class="service-package-desc">${escapeHtml(p.price_estimate_desc)}</div>
      <div class="service-package-subhint">
        * مثال توضيحي لتقدير التكلفة، والكميات قابلة للتعديل والزيادة بالاتفاق المباشر مع المزوّد
      </div>
    </div>` : '';

  // All Specs for Collapsible
  const allSpecsGridHtml = attrs.length ? `
    <div class="service-specs-grid">
      ${attrs.map(a => `
        <div class="service-spec-item">
          <span class="spec-label">${escapeHtml(a.label)}</span>
          <span class="spec-val">${escapeHtml(String(a.value))}${a.unit ? ' ' + escapeHtml(a.unit) : ''}</span>
        </div>
      `).join('')}
    </div>` : '';

  return `
    <div class="event-card service-card" id="serviceCard-${p.id}"${toneStyle}>
      <div class="card-bezel"${bezelStyle}>
        <div class="card-framed">
          <!-- صورة الخدمة والشارات العائمة — النقر عليها يفتح التفاصيل مثل المناسبات -->
          <div class="card-media" onclick="toggleServiceDetails(${p.id})">
            ${mediaHtml}
            <div class="service-floating-badges">
              <span class="service-badge-category" style="background:${toneColor}">
                ${p.category_icon ? escapeHtml(p.category_icon) + ' ' : ''}${escapeHtml(p.category_name || 'خدمة')}
              </span>
              <span class="service-badge-price">
                <i class="fa-solid fa-tag"></i> ${priceBadgeText}${p.price != null ? `: ${Number(p.price).toLocaleString('ar-EG')} ₪` : ''}
              </span>
            </div>
          </div>

          <!-- جسم الكرت والوصف العام والباكيج -->
          <div class="service-card-caption">
            <h2 class="service-card-title" onclick="toggleServiceDetails(${p.id})" style="cursor:pointer;">${escapeHtml(p.name)}</h2>
            <div class="service-card-price-hero">
              <span class="price-hero-label">${priceBadgeText}:</span>
              <span class="price-hero-num">${p.price != null ? `<strong>${Number(p.price).toLocaleString('ar-EG')}</strong> <span class="price-currency">₪</span>` : '<strong>حسب الطلب</strong>'}</span>
            </div>
            <div class="service-card-towns">
              <i class="fa-solid fa-location-dot" style="color:var(--tone)"></i>
              <span>${escapeHtml(townsText)}</span>
            </div>
            ${p.description ? `<p class="service-card-desc">${escapeHtml(p.description)}</p>` : ''}
            ${packageBannerHtml}

            <!-- شريط الأزرار التفاعلية -->
            <div class="service-card-actions">
              <button type="button" class="service-action-btn service-contact-btn" onclick="revealServiceContact(${p.id})">
                <i class="fa-solid fa-phone"></i> <span>تواصل فوري</span>
              </button>
              <button type="button" class="service-action-btn service-more-btn" id="serviceMoreBtn-${p.id}" aria-expanded="false" onclick="toggleServiceDetails(${p.id}, this)">
                <i class="fa-solid fa-chevron-down"></i> <span>مزيد من التفاصيل</span>
              </button>
            </div>
          </div>

          <!-- لوح التفاصيل الموسع القابل للطي -->
          <div class="service-details-panel" id="serviceDetails-${p.id}" style="display:none;">
            <div class="service-details-panel-header">
              <span class="service-details-panel-title"><i class="fa-solid fa-circle-info" style="color:var(--tone)"></i> مواصفات وتفاصيل الحزمة الاسترشادية</span>
              <button type="button" class="card-details-close-btn" onclick="toggleServiceDetails(${p.id})" aria-label="إغلاق">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div class="service-details-price-banner">
              <div>
                <span class="details-price-label">${priceBadgeText}</span>
                <strong class="details-price-val">${p.price != null ? `${Number(p.price).toLocaleString('ar-EG')} ₪` : 'تواصل للسعر'}</strong>
              </div>
              <div class="details-price-badge">
                <i class="fa-solid fa-handshake"></i> اتفاق مباشر
              </div>
            </div>

            <div class="service-capacity-notice">
              <i class="fa-solid fa-circle-info"></i>
              <div>
                <strong>توضيح مهم بشأن المواصفات والكميات:</strong>
                <p>المواصفات والكميات الموضحة هنا تمثل حزمة استرشادية قياسية بهذا السعر كمثال لتقدير التكلفة. بإمكانك دائماً طلب كميات أكبر أو أصغر أو تعديل المواصفات بالاتفاق المباشر مع المزوّد لتناسب حجم مناسبتك تماماً.</p>
              </div>
            </div>

            ${p.price_estimate_desc ? `
              <div class="service-package-banner" style="margin-bottom:12px;">
                <div class="service-package-header">
                  <i class="fa-solid fa-receipt"></i>
                  <span>تفاصيل الحزمة النموذجية المسعرة:</span>
                </div>
                <div class="service-package-desc">${escapeHtml(p.price_estimate_desc)}</div>
              </div>` : ''}

            ${allSpecsGridHtml ? `
              <div style="font-size:0.84rem; font-weight:800; color:var(--ink); margin-bottom:8px;">
                <i class="fa-solid fa-list-check" style="color:var(--tone)"></i> بنود ومواصفات هذه الحزمة النموذجية:
              </div>
              ${allSpecsGridHtml}` : ''}

            ${p.description ? `<div style="font-size:0.88rem; color:var(--ink); margin-bottom:12px; line-height:1.5;">${escapeHtml(p.description)}</div>` : ''}
            <div style="font-size:0.8rem; color:var(--ink-faint); margin-bottom:14px;">
              <i class="fa-solid fa-map-location-dot"></i> <strong>المناطق المخدومة:</strong> ${(p.towns && p.towns.length) ? escapeHtml(p.towns.join('، ')) : 'جميع مناطق النقب'}
            </div>

            <!-- أزرار التواصل المباشرة المفتوحة بعد النقر -->
            <div id="serviceContactRow-${p.id}">
              <button type="button" class="submit-btn" style="width:100%;" onclick="revealServiceContact(${p.id})">
                <i class="fa-solid fa-phone"></i> إظهار خيارات الاتصال والواتساب
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}

function toggleServiceDetails(providerId, btnEl) {
  const panel = document.getElementById(`serviceDetails-${providerId}`);
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';

  const btn = btnEl || document.getElementById(`serviceMoreBtn-${providerId}`);
  if (btn) {
    btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    btn.innerHTML = isHidden
      ? `<i class="fa-solid fa-chevron-up"></i> <span>إخفاء التفاصيل</span>`
      : `<i class="fa-solid fa-chevron-down"></i> <span>مزيد من التفاصيل</span>`;
  }
}

async function revealServiceContact(providerId, preferredAction = null) {
  try {
    let p = providerDetailsCache[providerId];
    if (!p || !p.phone) {
      const res = await apiFetch(`/api/services/providers/${providerId}`);
      const data = await res.json();
      if (!data.success || !data.provider) return;
      p = data.provider;
      providerDetailsCache[providerId] = p;
    }

    const phone = p.phone || '';
    if (!phone) {
      alert('رقم التواصل غير متوفر حالياً');
      return;
    }

    // تنظيف رقم الهاتف للواتساب الدولي (05... -> 9725...)
    let intlPhone = phone.replace(/[^\d+]/g, '');
    if (intlPhone.startsWith('05')) intlPhone = '972' + intlPhone.substring(1);
    else if (intlPhone.startsWith('+')) intlPhone = intlPhone.substring(1);

    const whatsappMsg = encodeURIComponent(`مرحباً ${p.name}، استفسار بخصوص خدمتك (${p.category_name || ''}) عبر منصة أعراسنا:`);
    const whatsappUrl = `https://wa.me/${intlPhone}?text=${whatsappMsg}`;
    const telUrl = `tel:${phone}`;

    // إذا طلب إجراء مباشر
    if (preferredAction === 'whatsapp') {
      window.open(whatsappUrl, '_blank');
      return;
    } else if (preferredAction === 'call') {
      window.location.href = telUrl;
      return;
    }

    // عرض أزرار التواصل المباشرة داخل اللوح وفي الكرت
    const contactHtml = `
      <div class="service-contact-row">
        <a class="service-btn-whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener">
          <i class="fa-brands fa-whatsapp"></i> واتساب مباشر
        </a>
        <a class="service-btn-call" href="${telUrl}">
          <i class="fa-solid fa-phone"></i> اتصال (${escapeHtml(phone)})
        </a>
      </div>
    `;

    // تحديث مكان التواصل في اللوح الموسع
    const rowInPanel = document.getElementById(`serviceContactRow-${providerId}`);
    if (rowInPanel) rowInPanel.innerHTML = contactHtml;

    // فتح اللوح الموسع تلقائياً إذا كان مغلقاً ليرى المستخدم الرقم والخيارات كاملة
    const panel = document.getElementById(`serviceDetails-${providerId}`);
    if (panel && panel.style.display === 'none') {
      toggleServiceDetails(providerId);
    }
  } catch (e) {
    console.error('Reveal contact error:', e);
  }
}

/** فتح نافذة المزوّد المنفصلة إذا تم استدعاؤها مع كامل المواصفات */
async function openProviderModal(providerId) {
  try {
    const res = await apiFetch(`/api/services/providers/${providerId}`);
    const data = await res.json();
    if (!data.success) return;

    const p = data.provider;
    providerDetailsCache[providerId] = p;
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

    const pkgEl = document.getElementById('providerModalPackage');
    if (pkgEl) {
      if (p.price_estimate_desc) {
        pkgEl.innerHTML = `
          <div class="service-package-header">
            <i class="fa-solid fa-calculator"></i>
            <span>حزمة نموذجية استرشادية بهذا السعر التقريبي:</span>
          </div>
          <div class="service-package-desc">${escapeHtml(p.price_estimate_desc)}</div>
          <div class="service-package-flexible-note">
            <i class="fa-solid fa-arrows-rotate"></i>
            <span>الكميات قابلة للزيادة والتعديل (مثل 2000 كرسي أو خيام إضافية) بالاتفاق المباشر</span>
          </div>
        `;
        pkgEl.style.display = 'flex';
      } else {
        pkgEl.style.display = 'none';
      }
    }

    const specsEl = document.getElementById('providerModalSpecs');
    if (specsEl) {
      const attrs = formatProviderAttributes(p.attributes, p.category_id);
      if (attrs.length) {
        specsEl.innerHTML = attrs.map(a => `
          <div class="service-spec-item">
            <span class="spec-label">${escapeHtml(a.label)}</span>
            <span class="spec-val">${escapeHtml(String(a.value))}${a.unit ? ' ' + escapeHtml(a.unit) : ''}</span>
          </div>
        `).join('');
        specsEl.style.display = 'grid';
      } else {
        specsEl.style.display = 'none';
      }
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

/** الفعل الصريح الذي يكشف الرقم في النافذة المنفصلة */
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

// --- Public Service Offer Submission -----------------------------
function openSubmitServiceModal() {
  if (!requireAuth({ type: 'submit_service' })) return;

  const modal = document.getElementById('submitServiceModal');
  const form = document.getElementById('publicSubmitServiceForm');
  if (!modal || !form) return;
  form.reset();
  clearPublicProviderImage();

  // Populate categories
  const catSelect = document.getElementById('userProvCategory');
  if (catSelect) {
    const cats = serviceCategoriesCache || [];
    catSelect.innerHTML = cats.map(c =>
      `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${escapeHtml(c.name)}</option>`
    ).join('');
  }

  // Pre-fill user details if available
  if (currentUser) {
    const nameInput = document.getElementById('userProvName');
    const phoneInput = document.getElementById('userProvPhone');
    if (nameInput) nameInput.value = currentUser.full_name || '';
    if (phoneInput) phoneInput.value = currentUser.phone_number || '';
  }

  // Populate towns
  const townsContainer = document.getElementById('userProvTownsPicker');
  if (townsContainer) {
    const towns = townsList && townsList.length ? townsList : ['رهط', 'تل السبع', 'عرعرة النقب', 'شقيب السلام', 'كسيفة', 'حورة', 'اللقية', 'القرى والتجمعات'];
    townsContainer.innerHTML = towns.map(t => `
      <label class="ot-check" style="font-size:0.85rem; cursor:pointer;">
        <input type="checkbox" class="user-prov-town-check" value="${escapeHtml(t)}"> ${escapeHtml(t)}
      </label>
    `).join('');
  }

  handlePublicServiceCategoryChange();

  modal.style.display = 'flex';
}

function closeSubmitServiceModal() {
  const modal = document.getElementById('submitServiceModal');
  if (modal) modal.style.display = 'none';
  clearPublicProviderImage();
  const form = document.getElementById('publicSubmitServiceForm');
  if (form) form.reset();
}

function previewPublicProviderImage(input) {
  const file = input && input.files ? input.files[0] : null;
  const preview = document.getElementById('userProvImagePreview');
  const wrapper = document.getElementById('userProvImagePreviewWrapper');
  if (!file || !preview || !wrapper) return;
  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    wrapper.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function clearPublicProviderImage() {
  const fileInput = document.getElementById('userProvImageFile');
  if (fileInput) fileInput.value = '';
  const wrapper = document.getElementById('userProvImagePreviewWrapper');
  if (wrapper) wrapper.style.display = 'none';
  const preview = document.getElementById('userProvImagePreview');
  if (preview) preview.src = '';
}

function handlePublicServiceCategoryChange() {
  const catSelect = document.getElementById('userProvCategory');
  const wrapper = document.getElementById('userProvDynamicAttributesWrapper');
  const container = document.getElementById('userProvDynamicAttributesContainer');
  if (!catSelect || !wrapper || !container) return;

  const catId = parseInt(catSelect.value, 10);
  const cat = (serviceCategoriesCache || []).find(c => c.id === catId);
  const attrs = (cat && Array.isArray(cat.attributes)) ? cat.attributes : [];

  if (!attrs.length) {
    wrapper.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.innerHTML = attrs.map(attr => {
    const placeholder = attr.sample_value ? `مثال: ${attr.sample_value}` : '';
    const unitText = attr.unit ? ` (${attr.unit})` : '';
    return `
      <div class="user-prov-attr-item">
        <label style="font-size:0.82rem; font-weight:700; color:var(--ink); display:block; margin-bottom:4px;">
          ${escapeHtml(attr.label)}${escapeHtml(unitText)}
        </label>
        <input type="text" class="user-prov-attr-input" data-key="${escapeHtml(attr.attr_key)}" data-label="${escapeHtml(attr.label)}" data-unit="${escapeHtml(attr.unit || '')}" placeholder="${escapeHtml(placeholder)}" style="width:100%; padding:8px; border-radius:6px; background:var(--surface); border:1px solid var(--border-subtle); color:var(--ink); font-size:0.88rem;">
      </div>
    `;
  }).join('');

  wrapper.style.display = 'block';
}

async function handlePublicSubmitService(e) {
  e.preventDefault();

  const selectedTowns = Array.from(document.querySelectorAll('#userProvTownsPicker .user-prov-town-check:checked')).map(cb => cb.value);
  if (!selectedTowns.length) {
    alert('يرجى اختيار بلدة أو منطقة واحدة على الأقل تخدمها');
    return;
  }

  const consentBox = document.getElementById('userProvConsent');
  if (!consentBox || !consentBox.checked) {
    alert('يجب الموافقة على شرط النشر وظهور الاسم ورقم الهاتف في الدليل');
    return;
  }

  const name = document.getElementById('userProvName').value.trim();
  const phone = document.getElementById('userProvPhone').value.trim();
  const categoryId = document.getElementById('userProvCategory').value;
  const priceVal = document.getElementById('userProvPrice').value.trim();
  const priceType = document.getElementById('userProvPriceType').value;
  const priceEstimateDesc = document.getElementById('userProvPriceDesc').value.trim();
  const description = document.getElementById('userProvDescription').value.trim();

  // Dynamic attributes
  const attrInputs = document.querySelectorAll('#userProvDynamicAttributesContainer .user-prov-attr-input');
  const attributes = Array.from(attrInputs).map(inp => {
    const val = inp.value.trim();
    return {
      attr_key: inp.dataset.key,
      label: inp.dataset.label,
      unit: inp.dataset.unit || null,
      value: val
    };
  }).filter(a => a.value !== '');

  const fd = new FormData();
  fd.append('category_id', categoryId);
  fd.append('name', name);
  fd.append('phone', phone);
  fd.append('price_type', priceType);
  if (priceVal !== '') fd.append('price', priceVal);
  if (priceEstimateDesc) fd.append('price_estimate_desc', priceEstimateDesc);
  if (description) fd.append('description', description);
  fd.append('towns', JSON.stringify(selectedTowns));
  if (attributes.length) fd.append('attributes', JSON.stringify(attributes));

  const imageFileInput = document.getElementById('userProvImageFile');
  if (imageFileInput && imageFileInput.files && imageFileInput.files[0]) {
    fd.append('image', imageFileInput.files[0]);
  }

  const btn = document.getElementById('userProvSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';

  try {
    const res = await apiFetch('/api/services/providers', {
      method: 'POST',
      body: fd,
      auth: true
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'تم إرسال عرض الخدمة بنجاح، وهو قيد مراجعة الإدارة');
      closeSubmitServiceModal();
    } else {
      alert(data.message || 'تعذّر إرسال العرض');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال العرض للمراجعة';
  }
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
  // «قريتي غير موجودة» يُرسِل requested_village_name بدلها، لا الاثنين معاً.
  let villageId = null;
  let requestedVillageName = '';
  if (town === VILLAGES_TOWN) {
    const choice = readVillageChoice('add');
    villageId = choice.villageId;
    requestedVillageName = choice.requestedName;
    if (!villageId && !requestedVillageName) {
      alert('اختر القرية من القائمة أو اكتب اسم قريتك');
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
  else if (requestedVillageName) formData.append('requested_village_name', requestedVillageName);
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
    if (res.status === 401) {
      // api.js مسح الجلسة وفتح نافذة الدخول؛ النموذج لا يُمسَح هنا عمداً،
      // والإرسال يُعاد تلقائياً بعد الدخول (resumePendingIntent).
      pendingIntent = { type: 'publish_retry' };
      return;
    }
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
  const containers = [
    document.getElementById('myEventsList'),
    document.getElementById('accountMyEventsList')
  ].filter(Boolean);

  if (!containers.length) return;

  if (!events || !events.length) {
    const emptyHtml = '<div class="empty-state"><p>لم تنشر أي مناسبة بعد</p></div>';
    containers.forEach(c => { c.innerHTML = emptyHtml; });
    return;
  }

  const html = events.map(evt => `
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
        ${evt.status === 'rejected' && evt.rejection_reason ? `
        <div class="rejection-reason-notice" style="margin-top:8px; padding:8px 12px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; color:#f87171; font-size:0.85rem;">
          <i class="fa-solid fa-circle-exclamation"></i> سبب الرفض: ${escapeHtml(evt.rejection_reason)}
        </div>` : ''}
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

  containers.forEach(c => { c.innerHTML = html; });
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
      document.getElementById('chatModalSubtitle').textContent = `${eventPlaceName(evt)} - ${evt.event_date}`;
      const shareLabel = document.getElementById('shareEventBtnLabel');
      if (shareLabel) shareLabel.textContent = shareButtonLabel(evt);

      if (evt.host_phone) {
        hostBar.style.display = 'flex';
        hostBar.innerHTML = `
          <a href="tel:${evt.host_phone}" class="host-call-btn" onclick="recordAnalyticsEvent('contact_clicked', { contentTown: '${escapeHtml(evt.town || '')}' })"><i class="fa-solid fa-phone"></i> اتصال بالمعلن (${evt.host_phone})</a>
          <a href="https://wa.me/972${evt.host_phone.replace(/^0/, '')}" target="_blank" class="host-wa-btn" onclick="recordAnalyticsEvent('contact_clicked', { contentTown: '${escapeHtml(evt.town || '')}' })"><i class="fa-brands fa-whatsapp"></i> واتساب المعلن</a>
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

  await shareLink({ title: evt.title, line, url, copiedMessage: '📋 تم نسخ رابط المناسبة' });
}

/** المسار المشترك لكل زرّ مشاركة في الموقع (المناسبة والبث) — الوصف أعلى shareCurrentEvent. */
async function shareLink({ title, line, url, copiedMessage }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text: line, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // المستخدم أغلق ورقة المشاركة بنفسه — ليس خطأ
      // أي فشل آخر (نادر) — نكمل إلى نسخ الرابط بدل ترك الزر بلا أثر.
    }
  }

  const fullText = `${line}\n${url}`;
  try {
    await navigator.clipboard.writeText(fullText);
    showToast(copiedMessage);
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
    // الجلسة انتهت — نص التهنئة يبقى في الحقل، وبعد الدخول يُحدَّث اسم المرسِل
    // (resumePendingIntent) فيكفي ضغط «إرسال» مرة أخرى بلا إعادة كتابة.
    if (res.status === 401) { pendingIntent = { type: 'congratulate', eventId: currentChatEventId }; return; }
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
  const floatingBtn = document.getElementById('floatingNotifBtn');
  const floatingBadge = document.getElementById('floatingNotifBadge');

  if (btn) btn.style.display = currentUser ? 'inline-flex' : 'none';
  if (floatingBtn) floatingBtn.style.display = currentUser ? 'inline-flex' : 'none';

  const unread = notificationsList.filter(n => !n.is_read).length;
  const badgeText = unread > 99 ? '99+' : String(unread);

  if (badge) {
    if (unread > 0) {
      badge.textContent = badgeText;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (floatingBadge) {
    if (unread > 0) {
      floatingBadge.textContent = badgeText;
      floatingBadge.style.display = 'inline-flex';
    } else {
      floatingBadge.style.display = 'none';
    }
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
  loadNotificationPreferences();
}

/** مفتاح «إشعارات المناسبات الجديدة» — يُقرأ من الخادم عند كل فتح، فلا يكذب على جهاز ثانٍ غيّره. */
async function loadNotificationPreferences() {
  const toggle = document.getElementById('notifyNewEventsToggle');
  if (!toggle || !currentUser || !authToken) return;
  try {
    const res = await apiFetch('/api/notifications/preferences', { auth: true });
    const data = await res.json();
    if (data.success) toggle.checked = Boolean(data.preferences.notify_new_events);
  } catch (e) {
    console.error('Notification preferences error:', e);
  }
}

async function setNotifyNewEventsPreference(enabled) {
  const toggle = document.getElementById('notifyNewEventsToggle');
  try {
    const res = await apiFetch('/api/notifications/preferences', {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notify_new_events: enabled })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'failed');
    showToast(data.message);
  } catch (e) {
    // الخادم لم يحفظ — المفتاح يعود لما هو محفوظ فعلاً بدل أن يكذب.
    if (toggle) toggle.checked = !enabled;
    showToast('تعذّر حفظ الإعداد، حاول مرة أخرى');
  }
}

/** «قوّي مناسبتك» يفتح نموذج تعديل المناسبة نفسها؛ إن لم تعد من مناسباتي فصفحتها العامة. */
async function openOwnEventForEdit(eventId) {
  if (!myEventsCache.some(e => e.id === eventId)) await fetchMyEvents();
  if (myEventsCache.some(e => e.id === eventId)) {
    openEditEventModal(eventId);
  } else {
    await navigateToEvent(eventId);
  }
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

  const endpoint = isBroadcast ? `/api/broadcasts/${id}/dismiss` : `/api/notifications/${id}/read`;
  try {
    await apiFetch(endpoint, { method: 'PATCH', auth: true });
    notificationsList = notificationsList.filter(n => isBroadcast ? n.broadcast_id !== id : n.id !== id);
    renderNotificationsList();
    updateNotificationsBadge();
  } catch (e) {
    console.error('Dismiss notification error:', e);
  }

  // التوجّه إلى المناسبة نفسها عند النقر على إشعار شخصي مرتبط بمناسبة (قصة 14)؛
  // «قوّي مناسبتك» إلى نموذج تعديلها، وملخّص «مناسبات جديدة اليوم» إلى التغذية.
  if (eventId && notification.type === 'event_nudge') {
    closeNotificationsModal();
    await openOwnEventForEdit(eventId);
  } else if (eventId) {
    closeNotificationsModal();
    await navigateToEvent(eventId);
  } else if (notification.type === 'event_new_digest') {
    closeNotificationsModal();
    switchTab('tabHome');
  } else if (notification.type === 'live_started') {
    closeNotificationsModal();
    openLiveSection();
  }
}

async function clearAllNotifications() {
  try {
    const res = await apiFetch('/api/notifications/clear-all', { method: 'POST', auth: true });
    if (res.ok) {
      notificationsList = [];
      renderNotificationsList();
      updateNotificationsBadge();
    }
  } catch (e) {
    console.error('Clear all notifications error:', e);
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
    // إشعار «بدأ البث المباشر» من Web Push يفتح الموقع على ?live=1 (sw.js).
    if (urlParams.get('live') === '1') openLiveSection();
    const tab = urlParams.get('tab');
    if (tab) {
      const target = tab.startsWith('tab') ? tab : ('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
      setTimeout(() => { if (typeof switchTab === 'function') switchTab(target); }, 50);
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
        if (event.data && event.data.type === 'OPEN_LIVE') {
          openLiveSection();
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

/**
 * زرّ الهوية صريح دائماً: «تسجيل الدخول» أو «تسجيل الخروج» — لا اسم المستخدم
 * مكان الفعل (الاسم الأول في title فقط). الزرّان (الترويسة والشريط العائم
 * للهاتف) يستدعيان handleAuthButtonClick نفسها. «لوحة الإدارة» زرّ منفصل يظهر
 * لدوري admin وsuper_admin وحدهما — الدور من استجابة الخادم، لا رقم هاتف ثابت.
 */
function updateAuthUI() {
  updateNotificationsBadge();
  updatePushControlUI();

  const loggedIn = !!currentUser;
  const firstName = loggedIn ? String(currentUser.full_name || '').split(' ')[0] : '';
  const title = loggedIn ? (firstName ? `${firstName} — تسجيل الخروج` : 'تسجيل الخروج') : 'تسجيل الدخول';
  const iconClass = loggedIn ? 'fa-solid fa-right-from-bracket' : 'fa-solid fa-user-lock';

  const label = document.getElementById('userAuthLabel');
  const btn = document.getElementById('userAuthBtn');
  if (label) label.textContent = loggedIn ? 'تسجيل الخروج' : 'تسجيل الدخول';
  if (btn) {
    btn.title = title;
    const icon = btn.querySelector('i');
    if (icon) icon.className = iconClass;
  }

  const floatingLabel = document.getElementById('floatingAuthLabel');
  const floatingBtn = document.getElementById('floatingAuthBtn');
  if (floatingLabel) floatingLabel.textContent = loggedIn ? 'تسجيل الخروج' : 'تسجيل الدخول';
  if (floatingBtn) {
    floatingBtn.title = title;
    floatingBtn.setAttribute('aria-label', loggedIn ? 'تسجيل الخروج' : 'تسجيل الدخول');
    const icon = floatingBtn.querySelector('i');
    if (icon) icon.className = iconClass;
  }

  const adminBtn = document.getElementById('adminPanelBtn');
  if (adminBtn) {
    adminBtn.hidden = !(loggedIn && (currentUser.role === 'admin' || currentUser.role === 'super_admin'));
  }
}

// 17c. Privacy — إشعار الخصوصية، رفض التحليلات، والاطلاع/الحذف (تذكرة #44)
//
// هذا القسم يعيش داخل تبويب النقوط (index.html، #privacyAccountSection)،
// ووُضع هناك حين كان زرّ الهوية في الترويسة يفتح tabNokoot للمسجَّل دخوله —
// الزرّ اليوم دخول/خروج صريح (updateAuthUI أعلاه)، والقسم باقٍ في مكانه.

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
