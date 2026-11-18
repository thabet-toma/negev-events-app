// State Management
let allEvents = [];
let searchQuery = '';
let currentAudio = null;
let currentChatEventId = null;
let currentChatEvent = null; // الحدث الكامل من فتح مودال التبريكات — يغذّي زرّ المشاركة (تذكرة #44)
let socket = null;
let stickerTheme = 'royal-gold';
let leafletMap = null;
// دبابيس الخريطة الحالية — تُتتبَّع كي تُزال عند تبديل المحافظة (#124)، فلا
// تبقى دبابيس منطقة سابقة فوق خريطة المنطقة الجديدة. لا تُستخدم إلا مع
// leafletMap الموجود؛ التصفير وحده عند غياب الخريطة.
let mapMarkers = [];
let nokootChart = null;

// Publish-form location picker (#20 step 6)
let locationPickerMap = null;
let locationPickerMarker = null;
let pickerPinPlacedByUser = false;
let townCoordinates = {};
let townsList = [];
let villagesList = []; // من GET /api/towns (villages) — لا تُكرَّر في أي عميل (خريطة #21)
// من GET /api/towns (regions): المحافظات **النشطة** وحدها. اسم المحافظة نفسه
// مكان صالح لمناسبة بلدتها غير معروفة.
let regionsList = [];
// من GET /api/towns (regions_soon): المحافظات الموقوفة — `{ id, name }` فقط،
// تُعرض في منتقي الاكتشاف «قريباً» بلا اختيار (تذكرة #127). منفصلة عن
// regionsList عمداً: تلك قائمة **أماكن نشر** يقرؤها كل عميل منشور بلا فحص،
// فوجود موقوفة فيها يجعله ينشر فيها فيأخذ 400.
let regionsSoonList = [];
// المحافظة المختارة للاكتشاف (تذكرة #124) — معرّفها الرقمي من regionsList،
// وnull حتى يصل GET /api/towns. المتغيّر للرسم وحده: الحقيقة المحفوظة هي
// negev_region في localStorage، وهي وحدها ما يقرؤه apiFetch ليرسل X-Region.
let selectedRegionId = null;
// محافظة المناسبة المفتوحة في نافذة التعديل — كي يُرسَل region_id إن غيّرها
// المستخدم فقط (الخادم يقبلها اختيارية ويشتقّها من البلدة عند غيابها، #120).
let editEventRegionId = null;
// احتياط ما قبل وصول المناطق فقط — بعدها مركز المنطقة الأولى وتكبيرها (neutralPickerView)
const NEGEV_NEUTRAL_CENTER = [31.2858, 34.8431];

// «القرى والتجمعات» — البند الجامع الوحيد الذي يطلب قرية إلزامية عند النشر
// تحته (services-directory spec). القيمة نفسها ثابتة في server/src/constants.js.
const VILLAGES_TOWN = 'القرى والتجمعات';

// Publish form — occasion type drives the rest of the form (#20 step 9)
let occasionTypesCache = null;
let selectedOccasionType = null;
let myEventsCache = [];

// Poster crop editor (Facebook-style) — the rectangle is how this image is
// framed on the event card, locked to that card's 4:5 poster ratio (#178);
// display CSS elsewhere is untouched. No rotation/zoom; «استخدام الصورة كاملة»
// stays the path to the uncropped picture. All geometry lives in the working
// canvas's own pixel space, downscaled once on load so a 4000px phone photo
// never freezes the page.
let posterCropState = null;
// تزيد مع كل اختيار/إلغاء للغلاف كي لا تكتب نتيجة فكّ قديمة على الاختيار الحالي.
let posterCropSelectionGeneration = 0;
// فشل فكّ الصورة هو السبب الوحيد الذي يسمح برفع الملف الخام بلا معالجة (#178)
let posterCropDecodeFailed = false;
// حجز متزامن يحرس الإرسال قبل أي انتظار لتصدير القماش أو لطلب الشبكة.
let eventSubmitInFlight = false;
const POSTER_CROP_MAX_DIMENSION = 1600; // longest edge cap on the exported crop
const POSTER_CROP_MIN_SIZE = 40; // smallest crop rectangle edge, in working-canvas pixels
// width ÷ height — the event card's 4:5 poster ratio (the `aspect-ratio` of
// `.event-card .card-media` in web/styles.css, ticket #178)
const POSTER_CROP_ASPECT = 4 / 5;
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
// معرّف المزوّد المعروض في النافذة الآن — الكشف الصريح للرقم يعيد بناء روابط
// التواصل من الكائن المخزَّن نفسه لا من رقم منفصل (تذكرة #184).
let currentProviderId = null;
// شكل عرض مزوّدي الدليل (`providers_display`، تذكرة #158): الخادم يحسم الغياب
// والقيمة غير المعروفة، والعميل يقرأ ما يصل ويقبل `cards` وحدها؛ وما عداها —
// ومنها الحالة قبل وصول الإعداد — صفوف مختصرة. لا تخطيط ثالث هنا ولا إعادة حسم
// مكان الخادم، والقيمة تُطبَّق بلا إعادة تحميل.
let providersDisplayMode = null;

// مشاهدات المزوّد ومفضّلته (تذكرة #185). `providerViewsRecorded` تضمن تسجيل
// مشاهدة واحدة لكل مزوّد في هذا التحميل — لا في كل رسم: تعديل الفلتر أو تبديل
// شكل العرض يعيد رسم البطاقات، ولا يجوز أن يعيد تسجيل مشاهدة.
// و`negev_visitor_id` معرّف عشوائي يخزّنه الجهاز ويُرسَل في `X-Visitor-Id`
// وحده؛ لا عنوان IP في أي مفتاح ولا في أي مستند.
const VISITOR_ID_STORAGE_KEY = 'negev_visitor_id';
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const providerViewsRecorded = new Set();
let savedProvidersCache = [];

// «خدماتنا» و«آخر خبر» — وجهة عامة بلا حساب (منصّات كترا)، وشاشة أخبار
// المحافظة من مصدرها الخارجي عبر GET /api/news. لا رمز ولا محافظة محسوبة هنا:
// apiFetch يرفق X-Region من المحفوظ، والخادم يعيد `region_name` فيعرضه الهيدر
// كما حسبه هو — لا نسخة ثانية من الاسم في العميل.
const NEWS_PAGE_SIZE = 50;
let newsItems = [];
let newsOffset = 0;
let newsHasMore = false;
let newsGeneral = false; // true = الوجه العام (بعد زرّ «أخبار محلية عامة»)
let newsRegionName = ''; // اسم محافظة الزائر كما أعاده /api/news
let newsLoading = false;

// «حاسبات «خدماتنا» (#190)» — خمس حاسبات تحت كبسات المنصّات في الوجهة نفسها.
// الحساب كلّه في هذا الملف على الجهاز: لا `apiFetch` ولا `fetch` ولا حفظ، فلا
// شبكة ولا حساب. لوحة واحدة ظاهرة في كل لحظة (openCalculator)، ونتائجها تُكتب
// نصاً في لوحاتها.
const CALCULATOR_KEYS = ['budget', 'split', 'guests', 'countdown', 'hijri'];
const CALC_ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const CALC_GREGORIAN_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const CALC_HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
const CALC_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// «أسعار الذهب والعملات» (#189) — حاسبة الذهب ومحوّل العملات في «خدماتنا»،
// تحت كبسات المنصّات والحاسبات الخمس. بخلاف الحاسبات المحلية هاتان
// تقرآن `GET /api/prices` مرّة عند أول فتح (والخادم يكاشه ساعة)، والحساب نفسه
// هنا في الجهاز. `pricesSnapshot` آخر ردّ ناجح أو `null`؛ و`pricesLoading`
// وعد الطلب الجاري أو `null`، فلا يُطلق فتحُ اللوحتين طلبين.
const PRICES_TOOL_KEYS = ['gold', 'fx'];
const PRICES_UNAVAILABLE_TEXT = 'تعذّر جلب أسعار الذهب والعملات الآن — تحقّق من اتصالك وحاول مرة أخرى.';
let pricesSnapshot = null;
let pricesLoading = null;

// «مواقيت الصلاة» (M3-C) — قسمٌ تحت أداتَي الأسعار في «خدماتنا». الأوقات تأتي
// من `GET /api/prayer-times` كما يحسبها الخادم: هذا الملف لا يحسب وقتاً ولا
// يكتب وقتاً افتراضياً. `prayerTimesSnapshot` آخر ردّ ناجح أو `null`؛
// و`prayerTimesLoading`/`prayerTimesError` حالة السطر الواحد فوق القائمة.
// `prayerTimesRequestId` يمنع ردّ طلبٍ قديم من الكتابة فوق طلب أحدث (تبديل البلدة).
const PRAYER_TIMES_TOWN_KEY = 'negev_prayer_town';
const PRAYER_TIMES_ERROR_TEXT = 'تعذّر تحميل مواقيت الصلاة — حاول مرة أخرى';
const PRAYER_TIMES_LOADING_TEXT = 'جارٍ تحميل مواقيت الصلاة…';
// مفاتيح الأوقات الستة الوحيدة التي يقبلها العميل — بترتيب الخادم المعروض.
// ردّ ناقص أو مكرّر أو بوقت غير `HH:mm` يُرفض كخطأ، ولا تُكمَّل صفوفه بالعميل.
const PRAYER_TIMES_EXPECTED_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
let prayerTimesSnapshot = null;
let prayerTimesLoading = false;
let prayerTimesError = '';
let prayerTimesRequestId = 0;
let prayerTimesInitPending = false;


// Read surface — tabs, pagination, archive, notifications, review queue (#20 step 10)
let currentPage = 1;
const EVENTS_PAGE_SIZE = 30;
let currentPagination = null;
let upcomingOnly = false; // الافتراضي: عرض الكل (القادمة والمنتهية)، وعند التفعيل: القادمة فقط
let showArchive = false;
// بصمة الفلتر المطلوب — نصّ واحد يجمع كل ما يغيّر طلب `GET /api/events`.
// تطابقها مع الحالة الحالية يعني «لا شيء تغيّر»: لا طلب، ولا إعادة رسم، ولا
// فقد لموضع التمرير (وهو العطل الذي وُجدت هذه المقارنة لمنعه).
let feedAppliedSignature = null;
// بصمة وحالة ما هو معروض فعلاً (آخر ردّ ناجح) — منها تُبنى لقطة الرجوع، لأن
// حالة الفلتر تكون قد تغيّرت قبل أن يصل النداء إلى `fetchEvents`.
let feedRenderedSignature = null;
let feedRenderedFilterState = null;
// لقطة رجوع واحدة، في الذاكرة وحدها (بلا localStorage): آخر نتيجة معروضة قبل
// تغيير فلتر فعلي، بموضع تمريرها وحالة فلترها — زرّ «رجوع لنتائجك السابقة»
// يعيدها بلا شبكة.
let feedBackSnapshot = null;
// وضع «كل المحافظات» (تذكرة #161): علَم `all_regions=1` يُرسَل مع جلب التغذية
// وحدها (والترقيم التابع له) حتى يختار المستخدم محافظة صريحة فيُلغى. في الذاكرة
// لا في localStorage: إعادة تحميل الصفحة تعود إلى المحافظة المحفوظة، فلا تبقى
// شاشة تعرض «الكل» بلا سبب ظاهر بعد إغلاق التبويب وفتحه.
let feedAllRegions = false;
// رقم أحدث دورة جلب (#124): يزيد مع كل دورة، وأي استجابة لا تحمل الرقم الحالي
// تُتجاهَل — استجابة محافظة سابقة بطيئة لا يجوز أن تكتب `allEvents` فوق قائمة
// المحافظة الجديدة.
let feedRequestSeq = 0;

// Place & kind filter — رقاقة واحدة لكل منها تفتح ورقة بحث متعددة الاختيار،
// بدل شريطين زاحفين (#85 خطوة 40-46). البلدة والقرية يُختاران من قائمة واحدة
// لكنهما يُرسلان في معاملين منفصلين — الخادم يوحّدهما (union) لا يقاطعهما.
let selectedTowns = []; // أسماء بلدات، من TOWNS على الخادم
let selectedVillageIds = []; // معرّفات قرى رقمية
let selectedOccasionTypeIds = []; // معرّفات أنواع مناسبات رقمية
// فلتر التاريخ {key, label, from, to} — `null` = كل التواريخ. لا يُحفظ بين
// الزيارات كالمكان والنوع: «اليوم» محفوظاً يصير أمس في الزيارة التالية.
let selectedDateFilter = null;
let filterSheetActiveKey = null; // 'place' أو 'kind' — أيّ ورقة فلترة مفتوحة الآن (ورقة واحدة في كل لحظة)
let filterSheetDraft = []; // رموز {kind, id} داخل الورقة المفتوحة فقط — لا تُطبَّق إلا بزرّ «تطبيق»
let eventsFeedFirstLoadDone = false; // ظهور متدرّج للشاشة الأولى فقط (#85 خطوة 54)
let notificationsList = [];
let congratsQueueEventId = null;

// «قائمتي» — الوجه المرئي لمتابعة «ذكّرني»، صفحتها `tabMyList` كما هي وتُفتح
// من بطاقة الوصول السريع داخل «حسابي» (لم تعد وجهة في الشريط السفلي).
// التجميع والترتيب وكل التواريخ تأتي من الخادم (bucket وspan_start/span_end و
// days_until_start) — لا يعيد العميل اشتقاق تاريخ ولا ترتيباً. myListChip
// تفضيل هذه الجلسة وحدها (بلا تخزين)، و«انتهت سابقاً» مطويّة افتراضياً.
let myListData = null; // { events, counts: {all, upcoming, ended}, under_review_count } أو null قبل أول جلب
let myListChip = 'all'; // 'all' | 'upcoming' | 'ended'
let myListEndedExpanded = false;

// News ticker (#85 خطوة 28-33) — الحيّ من GET /api/broadcasts/live، مرتّباً
// بالأحدث أولاً كما يعيده الخادم. tickerExpanded توسيع قائمة البقيّة في مكانها
// لزائر مجهول فقط (المسجَّل دخوله يفتح مركز الإشعارات بدلاً منه).
// tickerTextExpanded مستقلّة عنها تماماً: عرض نصّ الصفّ الأساسي كاملاً بلا قصّ،
// للمسجَّل دخوله وللمجهول معاً (مراجعة #85، FIX 1).
let liveBroadcasts = [];
// هل حُسمت حالة التعاميم الحيّة بعد؟ `false` قبل أول ردّ ناجح من
// GET /api/broadcasts/live (وعند فشله). «لم تُعرف» ليست «لا تعميم»: عرض الأرقام
// ثم إخفاؤها حين يصل تعميم ومضةٌ يحكم بها ترتيب الشبكة وحده (#172، الجولة ٢).
let liveBroadcastsKnown = false;
let tickerExpanded = false;
let tickerTextExpanded = false;
let tickerPrimaryBroadcastId = null;

// حالة البطاقة الإعلانية الكبيرة وقسم الأعراس المميزة وورقة «مميّز عندنا»
let promoCarouselIndex = 0;
let promoCarouselTimer = null;
let drawerPromoCarouselIndex = 0;
let drawerPromoCarouselTimer = null;
let featuredCarouselIndex = 0;
let featuredCarouselTimer = null;
let featuredMenuOpen = false;
let featuredMenuReturnFocusEl = null;
// إيقاف مؤقّت لتقدّم «الأعراس المميزة» ما دام المؤشّر/اللمس/التركيز داخل القسم.
let featuredSlidePaused = false;

// الرئيسية الجديدة (M1-W): الشريط الإخباري وبطاقة الترحيب وأقسام الاكتشاف.
// كل جلب فيها مستقلّ تماماً — فشله يُخفي قسمه وحده، ولا يحجب التغذية ولا يُظهر
// توست خطأ. `homeTickerData` آخر ردّ GET /api/stats/ticker (أو null قبل أول
// جلب/عند فشله)، و`homeWelcome` ترحيب `home_welcome` من GET /api/settings/public.
let homeTickerData = null;
let homeWelcome = null;
// عدّاد محافظة الاكتشاف لهذه الأقسام: تبديل المحافظة يبطل أي ردّ قديم في الطريق
// فلا تُرسم مناسبات المحافظة السابقة فوق الجديدة.
let homeDiscoveryRegionToken = 0;

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
// موضع الظهور (تذكرة #173). `allStories` تبقى القائمة الكاملة كما وصلت، وكل
// موضع (شريط/كاروسيل/إعلان بين الكروت) يرشّح نسخته منها؛ والعارض يعمل على
// قائمة الموضع الذي فُتح منه، فمؤشّره ليس المؤشّر في غيرها.
let storyViewerList = [];
// فاصل إعلان الموضع `feed`: من `feed_ad_interval` في ردّ الخادم، و٨ احتياطاً
// حين يغيب المفتاح (ردّ قديم أو كاش) — الرقم لا يُنسَخ في عميل آخر.
let feedAdInterval = 8;
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
// «الحلقات السابقة» أسفل نافذة البث (ADR-0008): ما رُسم آخر مرة (لا يُعاد
// رسمه — ولا يُقطع تشغيل حلقة — حين تعيد قراءة الـhub القائمة نفسها)، والحلقة
// المشغَّلة الآن داخل النافذة أو null.
let livePastKey = null;
let livePastPlayingId = null;
// عارض صور «أرشيف العرس» في تفاصيل المناسبة.
let archiveViewerPhotos = [];
const archivePhotosByBox = {};
let archiveViewerIndex = 0;

// «ألبومات الأعراس» (ADR-0009) — صفحة واحدة، ثلاث مجموعات في البحث، وثلاثة
// مستويات: الألبوم ثم الصورة. لا تبويب سابع في الشريط السفلي.
let albumsTab = 'albums';
let albumsSearchQuery = '';
let albumsSearchResults = { albums: [], photos: [], people: [] };
let albumsSearchTimer = null;
let albumsList = [];
let albumsPagination = null;
let albumsCurrentAlbum = null;
let albumsAlbumPhotos = [];
let albumsAlbumVideos = [];
let albumsAlbumPagination = null;
let albumsCurrentPerson = null;
let albumsPersonPhotos = [];
let albumsPersonAlbums = [];
let albumsPersonPagination = null;
let albumsMyPhotosMode = false;
let albumsMyPhotosPhotos = [];
let albumsMyPhotosPagination = null;

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
  // جلسة محفوظة: «قائمتي» تُجلب مرة واحدة عند الإقلاع كي تكون شارتها صحيحة
  // بلا فتح التبويب (والفشل يُترك للتبويب نفسه وقت فتحه).
  initMyList();
  // منتقي المحافظة (#124) يقرأ نفس استجابة GET /api/towns — يُشغَّل بعد
  // initPlaceFilter كي لا يُطلب الملف مرتين عند أول إقلاع، ثم يقرأ المحفوظ
  // ويرسم المحافظات.
  initPlaceFilter().then(initRegionPicker);
  initKindFilter();
  updateFloatingFilterLabel();
  initAppDownload();
  // الترحيب أولاً: إرشاد التثبيت لا يُفتح فوقه، بل بعد «تخطّي» (dismissWelcome).
  if (!initWelcome()) initInstallHint();
  fetchNotifications();
  fetchLiveBroadcasts();
  fetchLiveStatus();
  initSupportEntry();
  initNotificationsPush();
  initServiceWorker();
  initUrlNavigation();
  document.addEventListener('visibilitychange', handleHomeCarouselsVisibilityChange);
  window.addEventListener('popstate', handleEventPagePopstate);
  window.addEventListener('hashchange', handleAlbumsHashChange);
  handleAlbumsHashChange();
  initFeedScroller();
  initFeedAudio();
  refreshSessionFromServer();
  fetchEvents();
  // «الأعراس المميزة» — من GET /api/events/featured لمحافظة الاكتشاف الحالية.
  loadFeaturedEvents();
  // الرئيسية الجديدة (M1-W): الشريط الإخباري وأقسام الاكتشاف. كلها تُطلق مع
  // التغذية لا بعدها، وكل جلب منها مستقلّ فلا يحجبها ولا يحجب بعضه.
  loadHomeNewsTicker();
  loadThisWeekEvents();
  loadNewestEvents();
  loadTrendingEvents();
  loadHomeServiceCategories();
  fetchStories();
  renderStickerCanvas();
  recordAnalyticsEvent('app_opened');

  const today = isoLocalDay(new Date());

  const nokootDateInput = document.getElementById('nokootDate');
  if (nokootDateInput) nokootDateInput.value = today;
});

// -1. Light/dark theme (#20 step 11, #179). Reading the saved choice and
// putting data-theme on <html> belongs to `web/theme-boot.js`, which every page
// loads in <head> BEFORE its styles — that is what keeps a saved dark choice
// from flashing light on the first paint. This file owns the button alone:
// flip, persist, icon; it builds on the bootstrap instead of repeating it.
// Absence of a saved choice means "follow the system": theme-boot.js sets no
// attribute then, and the prefers-color-scheme media query decides.
function initTheme() {
  window.NegevTheme.apply();
  updateThemeToggleIcon();
  // A system-preference change repaints the page by itself (the media query);
  // only the icon needs recomputing, and theme-boot.js is what announces it.
  document.addEventListener('negev:themechange', updateThemeToggleIcon);
}

function toggleTheme() {
  window.NegevTheme.toggle();
  updateThemeToggleIcon();
}

function currentThemeIsDark() {
  return window.NegevTheme.isDark();
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
      ? `تطبيق مناسبات منطقتك — الإصدار ${data.latest_version}`
      : 'تطبيق مناسبات منطقتك لأجهزة أندرويد';

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

/**
 * شاشة الترحيب (#163) — مرة واحدة لكل جهاز، وقبل أي ورقة أو اختيار محافظة.
 *
 * نفس نمط إرشاد التثبيت أعلاه: علامة محلية بلا طلب شبكة، تُقرأ عند الإقلاع
 * وحده. ولا تُكتب بمجرّد العرض بل عند ضغط «تخطّي»، فلا تفوت الشاشة من أغلق
 * الصفحة قبل أن يقرأها.
 */
const WELCOME_SEEN_KEY = 'negev_welcome_seen';

/** هل صرف الزائر شاشة الترحيب سابقاً؟ */
function hasSeenWelcome() {
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === 'seen';
  } catch (e) {
    return false;
  }
}

/**
 * يفتح شاشة الترحيب إن لم تُصرف بعد، ويعيد هل فُتحت الآن — الإقلاع يستعمل
 * الجواب كي يؤجّل إرشاد التثبيت إلى ما بعدها.
 */
function initWelcome() {
  const modal = document.getElementById('welcomeModal');
  if (!modal) return false;
  if (hasSeenWelcome()) return false;
  modal.hidden = false;
  // هذه الشاشة عُرضت في هذا الإقلاع: إرشاد التثبيت ينتظر انصرافها، فلا ورقتان
  // فوق بعضهما.
  return true;
}

/** إغلاق الترحيب — يُستدعى من زرّ «تخطّي» في index.html. */
function dismissWelcome() {
  const modal = document.getElementById('welcomeModal');
  if (modal) modal.hidden = true;
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, 'seen');
  } catch (e) {
    // لا شيء يُحفظ في التصفّح الخاص، والإغلاق يبقى نافذاً لهذه الجلسة على الأقل.
  }
  // دوره الآن: كانت الشاشة تحجب موضعه في الزيارة الأولى.
  initInstallHint();
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
      // `fetchEvents` يعيد رسم التغذية من أوّلها — من نزل فيها (أو غادر تبويبها
      // وموضعه محفوظ) لا يُنتزع من مكانه، ويرى الجديد بزرّ التحديث.
      const position = feedScrollPosition();
      if (position.feed > 0 || position.page > 0 || feedScrollMemory) return;
      // مناسبة جديدة فعلاً: `force` يتجاوز حارس البصمة (البصمة لم تتغيّر — الحدث هو التغيير).
      fetchEvents({ force: true });
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
      // ردّ ناجح — ولو فارغاً — هو ما يحسم الحالة: بعده فقط يجوز للشريط الظهور.
      liveBroadcastsKnown = true;
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

/*
 * «الشريط الإخباري» (M1-W) — شريط نصّ متحرّك أعلى الرئيسية من
 * GET /api/stats/ticker، منفصل تماماً عن شريط التعميم الحيّ (#broadcastTicker)
 * الذي يبقى سلوكه كما هو. البنود تُبنى في `buildHomeTickerItems` وحدها كنصوص
 * خام (بلا HTML) فيهرّبها الرسم، والجزء الغائب من الردّ يُسقط بنده وحده: أسعار
 * غائبة أو خبر غائب أو وقت غير مقروء لا تُخفي الشريط.
 */

/** أسماء العملات الثلاث المعروضة — تُطابَق بـ`currencies[].code` لا بالاسم العربي. */
const HOME_TICKER_CURRENCIES = [
  { code: 'USD', label: 'الدولار' },
  { code: 'JOD', label: 'الدينار الأردني' },
  { code: 'EUR', label: 'اليورو' }
];

/** «حُدّث HH:MM» بتوقيت القدس لا بتوقيت جهاز القارئ — '' لتاريخ غائب أو لا يُقرأ. */
function homeTickerClockLabel(iso) {
  // `new Date(null)` تاريخ صالح (١٩٧٠) — الغياب وحده لا يُقرأ وقتاً.
  if (iso === null || iso === undefined || iso === '') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: JERUSALEM_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

/** «الأحد، ٣ نوفمبر» — يوم اليوم في القدس لا في جهاز القارئ. */
function homeTickerTodayLabel(now = new Date()) {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: JERUSALEM_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(now);
}

/**
 * بنود الشريط من ردّ GET /api/stats/ticker — مصفوفة `{ text, action?, newsId? }`.
 * الترتيب هو ترتيب المواصفة: محافظات ← مجموع ← ذهب ← عملات ← آخر خبر ← وقت
 * التحديث ← اليوم. `action: 'news'` وحدها تجعل البند زرّاً يفتح «آخر خبر».
 */
function buildHomeTickerItems(data) {
  if (!data || data.success !== true) return [];
  const items = [];

  const regions = Array.isArray(data.regions) ? data.regions : [];
  regions.forEach(region => {
    const count = Number(region && region.upcoming_count);
    const name = String((region && region.name) || '').trim();
    if (Number.isFinite(count) && count > 0 && name) {
      items.push({ text: `📍 ${count} مناسبة في ${name}` });
    }
  });

  const total = Number(data.total);
  if (Number.isFinite(total) && total > 0) items.push({ text: `🎉 ${total} مناسبة قادمة` });

  const prices = data.prices && typeof data.prices === 'object' ? data.prices : null;
  const gold = prices && prices.gold && typeof prices.gold === 'object' ? prices.gold : null;
  if (gold) {
    [['24', 'k24'], ['21', 'k21'], ['18', 'k18']].forEach(([karat, key]) => {
      const value = Number(gold[key]);
      if (Number.isFinite(value) && value > 0) {
        items.push({ text: `الذهب عيار ${karat}: ₪${value.toFixed(2)} للغرام`, tone: 'gold' });
      }
    });
  }

  const currencies = prices && Array.isArray(prices.currencies) ? prices.currencies : [];
  HOME_TICKER_CURRENCIES.forEach(({ code, label }) => {
    const row = currencies.find(currency => currency && currency.code === code);
    const value = row ? Number(row.ils_per_unit) : NaN;
    if (Number.isFinite(value) && value > 0) items.push({ text: `${label} ₪${value.toFixed(2)}` });
  });

  const news = data.latest_news && typeof data.latest_news === 'object' ? data.latest_news : null;
  const newsTitle = news ? String(news.title || '').trim() : '';
  if (newsTitle) {
    const newsId = Number(news.id);
    items.push({
      text: `📰 ${newsTitle}`,
      action: 'news',
      newsId: Number.isInteger(newsId) && newsId > 0 ? newsId : null
    });
  }

  const updated = homeTickerClockLabel(data.updated_at);
  if (updated) items.push({ text: `🕒 حُدّث ${updated}` });

  // اليوم لا يغيب: بند أخير ثابت في كل ردّ ناجح (وإن خلا ما سواه).
  items.push({ text: `📅 ${homeTickerTodayLabel()}` });
  return items;
}

/** صفّ بنود واحد؛ `interactive` وحدها تحمل زرّ الخبر، ونسخة الزينة لا تحمل زرّاً. */
function homeTickerRowHtml(items, interactive) {
  const separator = '<span class="home-ticker-sep" aria-hidden="true">✦</span>';
  const body = items.map(item => {
    const text = escapeHtml(item.text);
    if (interactive && item.action === 'news') {
      return `<button type="button" class="home-ticker-link" onclick="openHomeTickerNews(${item.newsId === null ? 'null' : item.newsId})">${text}</button>`;
    }
    return `<span class="home-ticker-item${item.tone === 'gold' ? ' is-gold' : ''}">${text}</span>`;
  }).join(separator);
  return body + separator;
}

/**
 * فتح «آخر خبر» من الشريط: الشاشة أولاً، ثم الخبر نفسه إن كان معرّفه معروفاً
 * (الخادم الأقدم بلا `latest_news` يفتح القائمة وحدها).
 */
function openHomeTickerNews(newsId) {
  openNewsScreen();
  const id = Number(newsId);
  if (Number.isInteger(id) && id > 0) openNewsItem(id);
}

/**
 * الرسم: نسختان متطابقتان من الصفّ في مسار واحد، فالحركة تنزلق صفّاً كاملاً
 * وتعود إلى المشهد نفسه بلا فجوة. النسخة الثانية زخرفية (`aria-hidden` وبلا
 * أزرار) فلا يُقرأ الشريط مرتين ولا يُكرَّر زرّه على قارئ الشاشة.
 */
function renderHomeNewsTicker() {
  const bar = document.getElementById('homeNewsTicker');
  const track = document.getElementById('homeNewsTickerTrack');
  if (!bar || !track) return;

  const items = buildHomeTickerItems(homeTickerData);
  if (!items.length) {
    track.innerHTML = '';
    bar.hidden = true;
    return;
  }

  track.innerHTML = `<div class="home-ticker-row">${homeTickerRowHtml(items, true)}</div>`
    + `<div class="home-ticker-row" aria-hidden="true">${homeTickerRowHtml(items, false)}</div>`;
  bar.hidden = false;
}

/**
 * جلب الشريط — بلا `auth`: المسار عام ولا يخصّ صاحب الحساب. فشله يُخفي الشريط
 * وحده (لا توست، ولا مساس بالتغذية).
 */
async function loadHomeNewsTicker() {
  try {
    const res = await apiFetch('/api/stats/ticker');
    const data = await res.json();
    homeTickerData = data && data.success === true ? data : null;
  } catch (e) {
    homeTickerData = null;
  }
  renderHomeNewsTicker();
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
      // «شكل عرض المزوّدين» (تذكرة #158) يصل من نفس الاستجابة: يُطبَّق فوراً
      // ويُعاد رسم الدليل إن كان مفتوحاً، فلا إعادة تحميل يدوية للإعداد.
      applyProvidersDisplaySetting(data.settings.providers_display);
      // «ترحيب الرئيسية» (M1-W) من نفس استجابة الإعدادات العامة — لا نداء ثانٍ،
      // وغياب المفتاح (خادم أقدم) يعني «لا بطاقة».
      applyHomeWelcomeSetting((data.settings && data.settings.home_welcome) || data.home_welcome || null);
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

/*
 * بطاقة ترحيب الرئيسية (M1-W) — `home_welcome` في GET /api/settings/public.
 * الإغلاق يُحفظ ببصمة عنوان+نصّ لا بقيمة ثابتة: رسالة جديدة (بصمة جديدة) تعود،
 * والقديمة تبقى مغلقة على هذا الجهاز. غياب المفتاح — خادم أقدم — لا بطاقة.
 */
const HOME_WELCOME_DISMISSED_KEY = 'negev_home_welcome_dismissed';

/** بصمة النصّ: تغيّر حرف واحد يجعل الرسالة «جديدة» فتعود. */
function homeWelcomeFingerprint(welcome) {
  const text = `${(welcome && welcome.title) || ''}\u0000${(welcome && welcome.message) || ''}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `v${hash}`;
}

function isHomeWelcomeDismissed(welcome) {
  try {
    return localStorage.getItem(HOME_WELCOME_DISMISSED_KEY) === homeWelcomeFingerprint(welcome);
  } catch (e) {
    return false; // تخزين معطّل — البطاقة تُعرض ولا يُحفظ إغلاقها
  }
}

/** × يُخفي البطاقة ويسجّل بصمة نصوصها الحالية. */
function dismissHomeWelcome() {
  if (homeWelcome) {
    try {
      localStorage.setItem(HOME_WELCOME_DISMISSED_KEY, homeWelcomeFingerprint(homeWelcome));
    } catch (e) {
      // تخزين معطّل أو ممتلئ — الإغلاق نافذ لهذه الجلسة على الأقل.
    }
  }
  const card = document.getElementById('homeWelcomeCard');
  if (card) card.hidden = true;
}

/** يرسم البطاقة من `homeWelcome` أو يخفيها (لا ترحيب، أو ترحيب أُغلق). */
function renderHomeWelcome() {
  const card = document.getElementById('homeWelcomeCard');
  if (!card) return;
  if (!homeWelcome || isHomeWelcomeDismissed(homeWelcome)) {
    card.hidden = true;
    return;
  }
  const title = document.getElementById('homeWelcomeTitle');
  const message = document.getElementById('homeWelcomeMessage');
  if (title) title.textContent = homeWelcome.title;
  if (message) message.textContent = homeWelcome.message;
  card.hidden = false;
}

/** يقرأ `home_welcome` كما وصل — كائن بعنوان ورسالة، وأي شكل آخر يعني لا ترحيب. */
function applyHomeWelcomeSetting(raw) {
  const source = raw && typeof raw === 'object' ? raw : null;
  const title = source ? String(source.title || '').trim() : '';
  const message = source ? String(source.message || '').trim() : '';
  homeWelcome = title || message ? { title, message } : null;
  renderHomeWelcome();
}

/**
 * يطبّق `providers_display` القادم من `GET /api/settings/public` (تذكرة #158).
 * القيمة الفعّالة — ومنها الغياب والقيمة غير المعروفة — يحسمها الخادم في
 * `RESOLVED_KEYS`، فلا قيمة افتراضية مكتوبة هنا: `cards` وحدها تبدّل الشكل،
 * وأي شيء آخر (احتياطاً لقيمة غير متوقعة) يُعرض صفوفاً مختصرة. تغييرٌ فعلي
 * والدليل مفتوح ⇒ إعادة رسم من الذاكرة وحدها بلا طلب شبكة، فلا إعادة تحميل.
 */
function applyProvidersDisplaySetting(raw) {
  const next = raw === 'cards' ? 'cards' : null;
  if (next === providersDisplayMode) return;

  providersDisplayMode = next;
  if (servicesInitialized && serviceProvidersCache.length) {
    renderServiceProviders(serviceProvidersCache);
    renderServicesLoadMoreButton();
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

/**
 * ستوريات موضع واحد من `allStories` (تذكرة #173): الخادم يرسل كل المواضع
 * التي يفهمها هذا الطلب، وكل موضع في الصفحة يعرض ما يخصّه وحده. غياب
 * `placement` (ردّ قديم أو كاش) يعني `bar` — الشكل الذي كان قبل #173.
 */
function storiesForPlacement(placement) {
  if (placement === 'promo') {
    return [...storiesForPlacement('carousel'), ...storiesForPlacement('bar')];
  }
  return allStories.filter(story => (story.placement || 'bar') === placement);
}

/** بصمة ما يغيّر إعلانات التغذية: الفاصل وهويّات ستوريات `feed` وترتيبها. */
function feedAdSignature() {
  return `${feedAdInterval}|${storiesForPlacement('feed').map(story => story.id).join(',')}`;
}

async function fetchStories() {
  const adsBefore = feedAdSignature();
  try {
    const res = await apiFetch('/api/stories');
    const data = await res.json();
    if (data.success && data.stories) {
      allStories = data.stories;
      // الفاصل من الخادم لا من رقم مكتوب هنا (تذكرة #173) — و٨ احتياطاً فقط
      // حين يغيب المفتاح (ردّ قديم أو كاش).
      const interval = Number(data.feed_ad_interval);
      feedAdInterval = Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 8;
      renderStoryCarousel();
      renderDrawerStoryCarousel();
      // إعلانات «بين الكروت» وصلت بعد رسم التغذية (أو تغيّرت): تُعاد من
      // `allEvents` نفسها مع حفظ موضع التمرير، فلا يقفز الزائر إلى أول التغذية.
      if (feedAdSignature() !== adsBefore && allEvents.length) {
        const container = document.getElementById('eventsContainer');
        const scroll = container ? container.scrollTop : 0;
        renderEvents(allEvents);
        if (container) container.scrollTop = scroll;
      }
    }
  } catch (e) {
    console.error('Stories error:', e);
  }
}

/** نصّ زرّ الستوري: تسمية الستوديو، أو «زيارة» للإعلان و«شاهد الفيديو» لغيره. */
function storyCtaLabel(story) {
  const label = (story.cta_label || '').trim();
  if (label) return label;
  return story.is_ad ? 'زيارة' : 'شاهد الفيديو';
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isTopChromeDrawerOpen() {
  const drawer = document.getElementById('topChromeDrawer');
  return !!(drawer && drawer.style.display === 'flex');
}

/** هل توجد نافذة أو صفحة تغطي الرئيسية الآن؟ */
function isHomeCarouselCovered() {
  if (typeof document === 'undefined') return false;
  if (featuredMenuOpen) return true;
  if (typeof isEventPageOpen === 'function' && isEventPageOpen()) return true;
  if (typeof isLiveSectionOpen === 'function' && isLiveSectionOpen()) return true;
  const storyOverlay = document.getElementById('storyViewerOverlay');
  if (storyOverlay && storyOverlay.style.display === 'flex') return true;
  const archiveViewer = document.getElementById('archiveViewer');
  if (archiveViewer && !archiveViewer.hidden) return true;
  const newsScreen = document.getElementById('newsScreen');
  if (newsScreen && !newsScreen.hidden) return true;
  const albumsPage = document.getElementById('albumsPage');
  if (albumsPage && !albumsPage.hidden) return true;
  const modals = [...document.querySelectorAll('.modal-overlay')];
  if (modals.some(m => !m.hidden && m.style.display && m.style.display !== 'none')) return true;
  return false;
}

function shouldAutoAdvanceHomeCarousels() {
  if (typeof document === 'undefined') return false;
  if (prefersReducedMotion()) return false;
  if (document.hidden) return false;
  const homeTab = document.getElementById('tabHome');
  if (!homeTab || !homeTab.classList.contains('active-tab')) return false;
  if (isHomeCarouselCovered()) return false;
  return true;
}

function buildLiveFloatingPillHtml() {
  const active = isLiveNow(liveState);
  const cls = active ? 'is-live' : 'is-off';
  const label = active ? '● مباشر · البث المباشر' : 'البث المباشر';
  return `
    <button type="button" class="live-floating-pill ${cls}" onclick="openLiveSection(); event.stopPropagation();" aria-label="البث المباشر">
      <span class="live-dot" aria-hidden="true"></span>
      <span>${label}</span>
    </button>
  `;
}

function syncLiveCapsulesState(active) {
  const clsLive = Boolean(active);
  document.querySelectorAll('.live-floating-pill').forEach(pill => {
    pill.classList.toggle('is-live', clsLive);
    pill.classList.toggle('is-off', !clsLive);
    const spans = pill.querySelectorAll('span');
    if (spans[1]) spans[1].textContent = clsLive ? '● مباشر · البث المباشر' : 'البث المباشر';
  });
  document.querySelectorAll('.live-chip').forEach(chip => {
    chip.classList.toggle('is-live', clsLive);
    chip.classList.toggle('is-off', !clsLive);
    const tag = chip.querySelector('.live-tag');
    if (tag) tag.hidden = !clsLive;
  });
}

function promoSlideHtml(story) {
  const safeImg = story.image ? escapeHtml(story.image) : '';
  const title = escapeHtml(story.title || '');
  const target = isSafeHttpUrl(story.target_url);
  return `
    <div class="carousel-slide" data-story-id="${Number(story.id)}">
      ${safeImg ? `<img src="${safeImg}" alt="${title}" loading="lazy">` : '<div class="img-fallback" style="display:flex;"><span>' + title + '</span></div>'}
      <div class="ad-overlay">
        <div class="ad-title">${title}</div>
        ${target ? `<button type="button" class="ad-cta" onclick="event.stopPropagation(); handleStoryCtaById(${Number(story.id)})">${escapeHtml(storyCtaLabel(story))}</button>` : ''}
      </div>
    </div>
  `;
}

function renderBigPromoSurface({ sectionId, boxId, dotsId, chipId, isDrawer = false }) {
  const section = document.getElementById(sectionId);
  const box = document.getElementById(boxId);
  const dots = document.getElementById(dotsId);
  const chip = chipId ? document.getElementById(chipId) : null;
  if (!section || !box) return;

  const stories = storiesForPlacement('promo');
  if (isDrawer) {
    if (drawerPromoCarouselTimer) { clearInterval(drawerPromoCarouselTimer); drawerPromoCarouselTimer = null; }
  } else {
    if (promoCarouselTimer) { clearInterval(promoCarouselTimer); promoCarouselTimer = null; }
  }

  if (!stories.length) {
    section.hidden = true;
    box.innerHTML = '';
    if (dots) { dots.innerHTML = ''; dots.hidden = true; }
    if (chip) chip.hidden = false;
    syncLiveCapsulesState(isLiveNow(liveState));
    return;
  }

  if (chip) chip.hidden = true;
  section.hidden = false;

  let index = isDrawer ? drawerPromoCarouselIndex : promoCarouselIndex;
  if (index >= stories.length || index < 0) index = 0;
  if (isDrawer) drawerPromoCarouselIndex = index;
  else promoCarouselIndex = index;

  const slidesHtml = stories.map(promoSlideHtml).join('');
  box.innerHTML = `
    ${buildLiveFloatingPillHtml()}
    <div class="carousel-viewport">
      <div class="carousel-track" style="transform: translateX(-${index * 100}%);">
        ${slidesHtml}
      </div>
    </div>
  `;

  if (dots) {
    if (stories.length > 1) {
      dots.hidden = false;
      dots.innerHTML = stories.map((_, i) => `
        <button type="button" class="carousel-dot ${i === index ? 'is-active' : ''}" data-slide="${i}" aria-label="شريحة ${i + 1}"></button>
      `).join('');
    } else {
      dots.hidden = true;
      dots.innerHTML = '';
    }
  }

  const viewport = box.querySelector('.carousel-viewport');
  const track = box.querySelector('.carousel-track');
  if (!viewport || !track) return;

  const applyPos = (nextIdx) => {
    const wrapped = (nextIdx + stories.length) % stories.length;
    if (isDrawer) drawerPromoCarouselIndex = wrapped;
    else promoCarouselIndex = wrapped;
    track.classList.remove('is-dragging');
    track.style.transform = `translateX(-${wrapped * 100}%)`;
    if (dots) {
      dots.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === wrapped);
      });
    }
  };

  const stopTimer = () => {
    if (isDrawer) {
      if (drawerPromoCarouselTimer) { clearInterval(drawerPromoCarouselTimer); drawerPromoCarouselTimer = null; }
    } else {
      if (promoCarouselTimer) { clearInterval(promoCarouselTimer); promoCarouselTimer = null; }
    }
  };

  const startTimer = () => {
    stopTimer();
    if (stories.length <= 1 || prefersReducedMotion()) return;
    const tick = () => {
      if (isDrawer) {
        if (!isTopChromeDrawerOpen() || document.hidden || prefersReducedMotion()) return;
      } else {
        if (!shouldAutoAdvanceHomeCarousels()) return;
      }
      const cur = isDrawer ? drawerPromoCarouselIndex : promoCarouselIndex;
      applyPos(cur + 1);
    };
    const timer = setInterval(tick, 4000);
    if (isDrawer) drawerPromoCarouselTimer = timer;
    else promoCarouselTimer = timer;
  };

  if (dots && stories.length > 1) {
    dots.querySelectorAll('.carousel-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const nextIdx = Number(dot.dataset.slide) || 0;
        applyPos(nextIdx);
        startTimer();
      });
    });
  }

  let dragging = false;
  let startX = 0;
  let deltaX = 0;
  let moved = false;
  let handledPointerTap = false;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ad-cta') || e.target.closest('.live-floating-pill')) return;
    dragging = true;
    startX = e.clientX;
    deltaX = 0;
    moved = false;
    handledPointerTap = false;
    stopTimer();
    if (stories.length > 1) track.classList.add('is-dragging');
    if (viewport.setPointerCapture) {
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    deltaX = e.clientX - startX;
    if (Math.abs(deltaX) > 6) moved = true;
    if (stories.length > 1) {
      const cur = isDrawer ? drawerPromoCarouselIndex : promoCarouselIndex;
      track.style.transform = `translateX(calc(-${cur * 100}% + ${deltaX}px))`;
    }
  });

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove('is-dragging');
    const cur = isDrawer ? drawerPromoCarouselIndex : promoCarouselIndex;
    if (moved && stories.length > 1 && Math.abs(deltaX) > 40) {
      handledPointerTap = true;
      applyPos(deltaX < 0 ? cur + 1 : cur - 1);
    } else {
      applyPos(cur);
      if (!moved) {
        handledPointerTap = true;
        if (isDrawer) toggleTopChrome(false);
        openStoryViewer(cur, 'promo');
      }
    }
    startTimer();
  };

  viewport.addEventListener('pointerup', finishDrag);
  viewport.addEventListener('pointercancel', finishDrag);
  viewport.addEventListener('click', (e) => {
    if (e.target.closest('.ad-cta') || e.target.closest('.live-floating-pill')) return;
    if (handledPointerTap) {
      handledPointerTap = false;
      return;
    }
    if (!moved && !dragging) {
      const cur = isDrawer ? drawerPromoCarouselIndex : promoCarouselIndex;
      if (isDrawer) toggleTopChrome(false);
      openStoryViewer(cur, 'promo');
    }
  });

  startTimer();
}

/**
 * البطاقة الإعلانية الكبيرة أعلى التغذية: ستوريات `carousel` ثم `bar`.
 */
function renderStoryCarousel() {
  renderBigPromoSurface({
    sectionId: 'storyCarouselSection',
    boxId: 'storyCarouselBox',
    dotsId: 'storyCarouselDots',
    chipId: 'liveFilterChip',
    isDrawer: false
  });
  updateFeedDimensions();
}

/**
 * نسخة الدرج العلوي للهاتف/PWA: تُعامل بالمنطق نفسه (ستوريات `carousel` ثم `bar`)
 * لأن تغذية الموبايل الثابتة تحجب `#storyCarouselSection`.
 */
function renderDrawerStoryCarousel() {
  renderBigPromoSurface({
    sectionId: 'drawerStoryCarouselSection',
    boxId: 'drawerStoryCarouselBox',
    dotsId: 'drawerStoryCarouselDots',
    chipId: 'drawerLiveFilterChip',
    isDrawer: true
  });
}

function stopHomeCarouselTimers() {
  if (promoCarouselTimer) { clearInterval(promoCarouselTimer); promoCarouselTimer = null; }
  if (drawerPromoCarouselTimer) { clearInterval(drawerPromoCarouselTimer); drawerPromoCarouselTimer = null; }
  if (featuredCarouselTimer) { clearInterval(featuredCarouselTimer); featuredCarouselTimer = null; }
}

function handleHomeCarouselsVisibilityChange() {
  if (document.hidden) {
    stopHomeCarouselTimers();
  } else {
    if (storiesForPlacement('promo').length > 1) {
      renderStoryCarousel();
      if (isTopChromeDrawerOpen()) renderDrawerStoryCarousel();
    }
    startFeaturedAutoAdvance();
  }
}

/**
 * إعلان بين الكروت (تذكرة #173): شريحة كاملة في تغذية الالتقاط بعد كل
 * `feedAdInterval` كرت مناسبة. الصورة تفتح العارض (مشاهدة) والزرّ يسجّل
 * النقرة — الموضعان يُقاسان هنا كما في الشريط. وليست مناسبة: بلا صنف
 * `event-card` وبلا `data-event-id`، فلا تدخل عدّ كروت التغذية ولا مراقب
 * الصوت ولا أي منطق يبحث عن مناسبة.
 */
function renderFeedAdCardHtml(story, position) {
  const feedIndex = Math.max(0, storiesForPlacement('feed').indexOf(story));
  const image = story.image
    ? `<img src="${escapeHtml(story.image)}" alt="${escapeHtml(story.title || '')}" loading="lazy">`
    : '<span class="feed-ad-image-empty" aria-hidden="true"></span>';
  const target = isSafeHttpUrl(story.target_url);
  return `
    <article class="feed-ad-card" data-ad-story-id="${Number(story.id)}" data-ad-position="${position}">
      <div class="feed-ad-inner">
        <div class="feed-ad-head">
          <span class="feed-ad-chip">${story.is_ad ? 'إعلان' : 'مميّز'}</span>
          ${story.advertiser_name ? `<span class="feed-ad-source">${escapeHtml(story.advertiser_name)}</span>` : ''}
        </div>
        <button type="button" class="feed-ad-media" onclick="openStoryViewer(${feedIndex}, 'feed')">${image}</button>
        <div class="feed-ad-body">
          <h3 class="feed-ad-title">${escapeHtml(story.title || '')}</h3>
          ${target ? `<button type="button" class="feed-ad-cta" onclick="handleStoryCtaById(${Number(story.id)})">${escapeHtml(storyCtaLabel(story))}</button>` : ''}
        </div>
      </div>
    </article>`;
}

/**
 * كروت التغذية وبينها إعلانات موضع `feed`: بعد كل `feedAdInterval` كرت،
 * بالتناوب بين ستوريات الإعلان (بعد ٨ ثم ١٦ …). بلا ستوريات `feed` — أو
 * بقائمة أقصر من الفاصل — النتيجة هي الكروت وحدها، فلا يتغيّر شيء.
 */
function renderFeedCardsHtml(events) {
  const ads = storiesForPlacement('feed');
  const parts = [];
  let adIndex = 0;
  events.forEach((evt, index) => {
    parts.push(renderSingleEventCardHtml(evt));
    const position = index + 1;
    if (!ads.length || position % feedAdInterval !== 0) return;
    parts.push(renderFeedAdCardHtml(ads[adIndex % ads.length], position));
    adIndex += 1;
  });
  return parts.join('');
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
  syncLiveCapsulesState(active);

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
  stopLivePastEpisode();
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
  stopLivePastEpisode();
  livePastKey = null; // أُخفيت القائمة — الرسم التالي يعيدها ولو لم تتغيّر
  ['liveInfo', 'livePoll', 'livePrevious', 'livePastEpisodes'].forEach(id => {
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
  renderLivePastEpisodes();
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

/*
 * «الحلقات السابقة» — آخر قسم في صفحة البث (ADR-0008). past_episodes من
 * GET /api/live/hub، الأحدث أولاً؛ حلقة اليوم لا تظهر فيها ما دام البث قائماً
 * (هي البث نفسه). قائمة فارغة → القسم مخفي. كل حلقة: صورة المشاركة أو بديل
 * بالعلامة، العنوان والتاريخ، و«شاهد هنا» (iframe داخل النافذة بنفس خصائص
 * المشغّل أعلاه) و«افتح على يوتيوب» و«شارك».
 */
function livePastEpisodes() {
  return liveHubState && Array.isArray(liveHubState.past_episodes) ? liveHubState.past_episodes : [];
}

function findLivePastEpisode(id) {
  return livePastEpisodes().find(ep => Number(ep.id) === Number(id)) || null;
}

function buildLivePastMediaHtml(ep) {
  const image = safeHttpUrl(ep.share_image_url);
  if (image) return `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`;
  return `
    <div class="live-past-placeholder" aria-hidden="true">
      <img src="icons/icon.svg" alt="" loading="lazy">
    </div>
  `;
}

function buildLivePastEpisodeHtml(ep) {
  const id = Number(ep.id);
  const title = String(ep.title || '');
  const embedUrl = safeHttpUrl(ep.embed_url);
  const videoUrl = safeHttpUrl(ep.video_url);
  const shareUrl = safeHttpUrl(ep.share_url);
  return `
    <article class="live-past-item" data-episode-id="${id}">
      <div class="live-past-media">${buildLivePastMediaHtml(ep)}</div>
      <div class="live-past-body">
        <strong class="live-past-title">${escapeHtml(title)}</strong>
        <span class="live-past-date">${escapeHtml(String(ep.date || ''))}</span>
        <div class="live-past-actions">
          ${embedUrl ? `<button type="button" class="live-past-btn live-past-btn-primary" onclick="playLivePastEpisode(${id})">
            <i class="fa-solid fa-play" aria-hidden="true"></i> شاهد هنا
          </button>` : ''}
          ${videoUrl ? `<a class="live-past-btn" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">
            <i class="fa-brands fa-youtube" aria-hidden="true"></i> افتح على يوتيوب
          </a>` : ''}
          ${shareUrl ? `<button type="button" class="live-past-btn" onclick="shareLivePastEpisode(${id})">
            <i class="fa-solid fa-share-nodes" aria-hidden="true"></i> شارك
          </button>` : ''}
        </div>
      </div>
    </article>
  `;
}

function renderLivePastEpisodes() {
  const box = document.getElementById('livePastEpisodes');
  if (!box) return;
  const list = livePastEpisodes();
  const key = JSON.stringify(list.map(ep => [ep.id, ep.title, ep.date, ep.share_image_url, ep.embed_url, ep.video_url, ep.share_url]));
  if (key === livePastKey) return;
  stopLivePastEpisode();
  livePastKey = key;
  if (!list.length) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  box.innerHTML = `
    <h4 class="live-block-title"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> الحلقات السابقة</h4>
    <div class="live-past-list">${list.map(buildLivePastEpisodeHtml).join('')}</div>
  `;
  box.hidden = false;
}

/** يشغّل حلقة داخل بطاقتها — وحلقة واحدة فقط في كل مرة. */
function playLivePastEpisode(id) {
  const ep = findLivePastEpisode(id);
  const embedUrl = ep && safeHttpUrl(ep.embed_url);
  const box = document.getElementById('livePastEpisodes');
  const item = box && box.querySelector(`.live-past-item[data-episode-id="${Number(id)}"]`);
  if (!embedUrl || !item) return;
  stopLivePastEpisode();
  livePastPlayingId = Number(id);
  item.classList.add('is-playing');
  const media = item.querySelector('.live-past-media');
  if (media) {
    media.innerHTML = `
      <iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(String(ep.title || 'حلقة سابقة'))}"
        referrerpolicy="strict-origin-when-cross-origin"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
    `;
  }
}

/** يوقف الحلقة المشغَّلة ويعيد صورتها — iframe يبقى في الصفحة يبقى صوته يعمل. */
function stopLivePastEpisode() {
  const box = document.getElementById('livePastEpisodes');
  if (box) box.querySelectorAll('iframe').forEach(frame => { frame.src = 'about:blank'; });
  const playingId = livePastPlayingId;
  livePastPlayingId = null;
  if (playingId === null || !box) return;
  const item = box.querySelector(`.live-past-item[data-episode-id="${playingId}"]`);
  if (!item) return;
  item.classList.remove('is-playing');
  const ep = findLivePastEpisode(playingId);
  const media = item.querySelector('.live-past-media');
  if (media) media.innerHTML = ep ? buildLivePastMediaHtml(ep) : '';
}

/** رابط صفحة الحلقة على الخادم (share_url) — بنفس طريقة مشاركة البث والمناسبة. */
async function shareLivePastEpisode(id) {
  const ep = findLivePastEpisode(id);
  const url = ep && safeHttpUrl(ep.share_url);
  if (!url) return;
  const title = String(ep.title || 'حلقة من البث — أعراسنا');
  await shareLink({ title, line: title, url, copiedMessage: '📋 تم نسخ رابط الحلقة' });
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

/**
 * يفتح العارض على ستوريات موضع واحد ويبدأ من الحلقة المنقورة. `placement`
 * يحدّد القائمة التي يُقرأ منها المؤشّر — الشريط `bar` (الافتراضي، كما كان
 * الاستدعاء القديم)، والكاروسيل أعلى التغذية والإعلان بين الكروت موضعاهما
 * (تذكرة #173). لا قائمة = لا عارض.
 */
function openStoryViewer(index, placement = 'bar') {
  storyViewerList = storiesForPlacement(placement);
  if (!storyViewerList.length) return;
  storyViewerIndex = Math.min(Math.max(Number(index) || 0, 0), storyViewerList.length - 1);
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
  document.getElementById('storyProgressRow').innerHTML = storyViewerList
    .map(() => '<div class="story-progress-bar"><div class="story-progress-fill"></div></div>')
    .join('');
}

/** يبدأ (أو يعيد بدء) الشريحة الحالية — يصفّر ساعة التقدّم ويحدّث كل ما يُعرض. */
function startStorySlide() {
  const story = storyViewerList[storyViewerIndex];
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

/**
 * فصل الإعلان ثلاث طبقات (README): شارة «إعلان» في الرأس، اسم المعلن هنا،
 * وزرّ الإبلاغ. ومنذ ADR-0010، **أي** ستوري له رابط http(s) يعرض زرّ CTA —
 * الإعلان ليس النوع الوحيد الذي يملك وجهة. التسمية تأتي من `cta_label` الذي
 * كتبه الستوديو، وزرّ الإعلان القديم يبقى «زيارة» إن لم تصل تسمية.
 */
function renderStoryFooter(story) {
  const footer = document.getElementById('storyViewerFooter');
  const hasTarget = isSafeHttpUrl(story.target_url);
  const platformLabels = {
    youtube: 'يوتيوب', tiktok: 'تيك توك', facebook: 'فيسبوك', instagram: 'إنستغرام', website: 'فيديو'
  };
  const label = (story.cta_label || '').trim() || (story.is_ad ? 'زيارة' : 'شاهد الفيديو');
  const source = story.is_ad
    ? (story.advertiser_name || '')
    : (platformLabels[story.link_platform] || '');

  footer.innerHTML = `
    <span class="story-viewer-advertiser">${escapeHtml(source)}</span>
    <div class="story-viewer-actions">
      ${hasTarget ? `<button class="story-viewer-visit-btn" onclick="handleStoryTargetClick()"><i class="fa-solid fa-circle-play"></i> ${escapeHtml(label)}</button>` : ''}
      <button class="story-viewer-report-btn" onclick="handleStoryReport()"><i class="fa-solid fa-flag"></i> إبلاغ</button>
    </div>
  `;
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
  const story = storyViewerList[storyViewerIndex];
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
  if (storyViewerIndex >= storyViewerList.length - 1) {
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

/** تسجيل نقرة ستوري — فشله لا يمنع فتح الرابط نفسه (مطابق للموبايل). */
async function recordStoryClick(story) {
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
}

async function handleStoryTargetClick() {
  const story = storyViewerList[storyViewerIndex];
  if (!story || !isSafeHttpUrl(story.target_url)) return;
  await recordStoryClick(story);
  window.open(story.target_url, '_blank', 'noopener');
}

/**
 * زرّ CTA خارج العارض — كاروسيل البانرات وبطاقة الإعلان بين الكروت (تذكرة
 * #173). يسجّل النقرة ثم يفتح الرابط نفسه الذي يفتحه العارض، فالنقرة من أي
 * موضع تصل `story_clicks` لا من الشريط وحده.
 */
async function handleStoryCtaById(storyId) {
  const story = allStories.find(item => Number(item.id) === Number(storyId));
  if (!story || !isSafeHttpUrl(story.target_url)) return;
  await recordStoryClick(story);
  window.open(story.target_url, '_blank', 'noopener');
}

/** إبلاغ يتطلّب حساباً — زائر بلا حساب يُوجَّه لمسار الدخول القائم، لا لرسالة خطأ (نفس نمط reportCongratulation). */
async function handleStoryReport() {
  if (!requireAuth({ type: 'report' })) return;
  const story = storyViewerList[storyViewerIndex];
  if (!story) return;
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

/*
 * موضع التغذية لحظة مغادرة تبويبها — `display:none` على `#tabHome` يمحو
 * `scrollTop` حاوية القفز (الموبايل)، و`switchTab` يمرّر النافذة إلى أعلاها
 * (الديسكتوب). بلا هذا يعود من فتح تبويباً آخر إلى أوّل كرت لا إلى حيث وصل.
 */
let feedScrollMemory = null;

function feedScrollPosition() {
  const feed = document.getElementById('eventsContainer');
  return { feed: feed ? feed.scrollTop : 0, page: window.scrollY || 0 };
}

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

/**
 * بصمة الفلتر: نصّ واحد يصف كل ما يغيّر طلب `GET /api/events` — الأماكن
 * والقرى والأنواع والتاريخ والقادمة فقط والأرشيف والبحث المطبَّق. ترتيب
 * الاختيار داخل القائمة الواحدة لا يغيّر النتيجة (الخادم يوحّدها)، فتُرتَّب
 * قبل المقارنة: إعادة اختيار البلدات نفسها بترتيب آخر ليست تغييراً.
 */
function feedFilterSignature() {
  const numeric = list => [...list].map(Number).sort((a, b) => a - b);
  return JSON.stringify([
    [...selectedTowns].sort(),
    numeric(selectedVillageIds),
    numeric(selectedOccasionTypeIds),
    selectedDateFilter ? [selectedDateFilter.key, selectedDateFilter.from, selectedDateFilter.to] : null,
    Boolean(upcomingOnly),
    Boolean(showArchive),
    (searchQuery || '').trim()
  ]);
}

/** هل ما تطلبه الحالة الآن هو نفسه ما جُلب له آخر مرة ونجح؟ */
function feedFiltersUnchanged() {
  return feedAppliedSignature !== null && feedFilterSignature() === feedAppliedSignature;
}

/** الحالة الكاملة التي تصفها البصمة — تُلتقط في لقطة الرجوع وتُعاد عند الضغط عليها. */
function feedFilterState() {
  return {
    selectedTowns: [...selectedTowns],
    selectedVillageIds: [...selectedVillageIds],
    selectedOccasionTypeIds: [...selectedOccasionTypeIds],
    selectedDateFilter: selectedDateFilter ? { ...selectedDateFilter } : null,
    upcomingOnly: Boolean(upcomingOnly),
    showArchive: Boolean(showArchive),
    searchQuery: searchQuery || ''
  };
}

/**
 * يعيد حالة فلتر كاملة كما التُقطت، ومعها كل ما يعرضها: رقاقات المكان والنوع
 * والتاريخ (في الصفحة والدرج)، وحقلَي البحث وزرّي مسحه، ومفتاح «القادمة فقط»
 * عبر `syncUpcomingUi`. الاختيار يُحفظ محلياً كما لو اختاره المستخدم بنفسه.
 */
function applyFeedFilterState(state) {
  if (!state) return;
  selectedTowns = [...state.selectedTowns];
  selectedVillageIds = [...state.selectedVillageIds];
  selectedOccasionTypeIds = [...state.selectedOccasionTypeIds];
  selectedDateFilter = state.selectedDateFilter ? { ...state.selectedDateFilter } : null;
  upcomingOnly = Boolean(state.upcomingOnly);
  showArchive = Boolean(state.showArchive);
  searchQuery = state.searchQuery || '';

  persistFilterSelection();
  syncUpcomingUi();
  updateFilterChipLabel('place');
  updateFilterChipLabel('kind');
  updateDateFilterChipLabel();
  updateFloatingFilterLabel();

  const searchInput = document.getElementById('eventSearchInput');
  if (searchInput) searchInput.value = searchQuery;
  const drawerSearch = document.getElementById('drawerSearchInput');
  if (drawerSearch) drawerSearch.value = searchQuery;
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = searchQuery ? 'block' : 'none';
  const drawerClear = document.getElementById('drawerClearSearchBtn');
  if (drawerClear) drawerClear.style.display = searchQuery ? 'block' : 'none';
  syncHomeDiscoveryVisibility();
}

/** هل يوجد بحث أو فلتر أو وضع أرشيف/قادمة يبرّر إخفاء أقسام الاكتشاف العشرة لإظهار النتائج مباشرة؟ */
function hasActiveHomeFilters() {
  return Boolean(
    (searchQuery && searchQuery.trim()) ||
    (selectedTowns && selectedTowns.length > 0) ||
    (selectedVillageIds && selectedVillageIds.length > 0) ||
    (selectedOccasionTypeIds && selectedOccasionTypeIds.length > 0) ||
    selectedDateFilter ||
    upcomingOnly ||
    showArchive
  );
}

/** يربط الصنف `has-active-filters` على `#tabHome` لإظهار نتائج البحث/الفلتر فوراً في الويب والهاتف. */
function syncHomeDiscoveryVisibility() {
  const tabHome = document.getElementById('tabHome');
  if (!tabHome) return;
  tabHome.classList.toggle('has-active-filters', hasActiveHomeFilters());
  updateFeedDimensions();
}

/**
 * يعيد موضع التغذية بعد إعادة رسم أفرغت الحاوية لحظةً فأقصّت `scrollTop`
 * معها. يُستدعى بعد `updateFeedDimensions` كي يُحسب الارتفاع الجديد أولاً —
 * لا ننتظر المتصفّح ليفعل ذلك من نفسه.
 */
function restoreFeedScroll(position) {
  if (!position) return;
  const feed = document.getElementById('eventsContainer');
  if (feed) feed.scrollTop = position.feed || 0;
  if (position.page) window.scrollTo(0, position.page);
}

/**
 * يعيد التغذية إلى أوّل نتائجها بعد رسم قائمة جديدة — القائمة الجديدة ليست
 * امتداداً للقديمة، فلا معنى لموضع تمريرها القديم. القيمة تُضبَط صراحةً بعد
 * الرسم لا انتظاراً للمتصفّح.
 */
function restoreFeedTop() {
  const feed = document.getElementById('eventsContainer');
  if (feed) feed.scrollTop = 0;
  window.scrollTo(0, 0);
}

/** زرّ «رجوع لنتائجك السابقة» — يظهر فقط حين توجد لقطة، ويُخفى في كل تغيير فلتر جديد. */
function showFeedBackPill() {
  const pill = document.getElementById('feedBackPill');
  if (pill) pill.hidden = !feedBackSnapshot;
}

function hideFeedBackPill() {
  const pill = document.getElementById('feedBackPill');
  if (pill) pill.hidden = true;
}

/**
 * يعيد اللقطة السابقة — القائمة نفسها بالترتيب نفسه، وحالة الفلتر التي
 * جُلبت بها (فتصف الرقاقات وحقل البحث ما تراه العين)، وموضع التمرير نفسه —
 * بلا أي طلب شبكة، ثم يخفي الزرّ ويُفرغ اللقطة (رجوع واحد فقط).
 */
function restoreFeedBackSnapshot() {
  const snapshot = feedBackSnapshot;
  feedBackSnapshot = null;
  hideFeedBackPill();
  if (!snapshot) return;

  allEvents = snapshot.allEvents;
  currentPage = snapshot.currentPage;
  currentPagination = snapshot.currentPagination;
  // الحالة قبل البصمة: البصمة وصفٌ للحالة، فلا تفترقان بعد الرجوع.
  applyFeedFilterState(snapshot.filters);
  feedAppliedSignature = snapshot.signature;
  feedRenderedSignature = snapshot.signature;
  feedRenderedFilterState = feedFilterState();
  renderEvents(allEvents);
  updateFeedDimensions();
  restoreFeedScroll(snapshot.scroll);
}

async function fetchEvents(options = {}) {
  const { append = false, force = false } = options;
  const container = document.getElementById('eventsContainer');

  if (!append) syncHomeDiscoveryVisibility();

  // لا شيء تغيّر: الخروج قبل أي مسّ بالـDOM. إعادة الرسم نفسها هي ما يمحو
  // `scrollTop` ويفقد ما حُمِّل، فإعادة رسم مطابقة عطلٌ ولو حملت البيانات نفسها.
  if (!append && !force && feedFiltersUnchanged()) return;

  if (append && isFetchingEvents) return;
  isFetchingEvents = true;

  const loadingPill = document.getElementById('feedLoadingSpinner');
  const loadWrapper = document.getElementById('loadMoreWrapper');
  const signature = feedFilterSignature();
  // رقم هذه الدورة: أي ردّ يصل بعد دورة أحدث (تبديل محافظة مثلاً) يُهمَل،
  // فلا تُعاد بقايا المحافظة السابقة إلى القائمة (#124).
  const requestSeq = ++feedRequestSeq;
  // حالة هذا الطلب تُحفظ كي تصف البصمة، عند نجاحه، ما رُسم فعلاً.
  const requestState = feedFilterState();
  // البصمة السابقة تُحفظ للأخطاء: الطلب الذي لم ينجح لا يجعل حالته «مطبَّقة»،
  // فلا تبقى البصمة معلَّقة على نتيجة لم تُرسم.
  const previousSignature = feedAppliedSignature;
  let scrollBefore = null;

  if (append) {
    if (loadingPill) loadingPill.style.display = 'inline-flex';
    if (loadWrapper) loadWrapper.style.display = 'block';
  } else {
    scrollBefore = feedScrollPosition();
    // قبل أي تغيير بصمة فعلي: لقطة واحدة لما هو معروض الآن — ببصمته وحالة
    // فلتره لا بحالة الطلب الجديد — وموضعه. أول جلب لا لقطة له.
    if (signature !== previousSignature) {
      if (feedRenderedSignature !== null) {
        feedBackSnapshot = {
          allEvents, currentPage, currentPagination, scroll: scrollBefore,
          signature: feedRenderedSignature, filters: feedRenderedFilterState
        };
      }
      hideFeedBackPill();
    }
    // الحالة المطلوبة الآن، قبل وصول الردّ: طلبان متطابقان لا يخرجان معاً.
    feedAppliedSignature = signature;
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
    if (upcomingOnly) params.set('upcoming', '1');
    else if (showArchive) params.set('archive', '1');
    if (selectedDateFilter) {
      params.set('date_from', selectedDateFilter.from);
      params.set('date_to', selectedDateFilter.to);
    }
    params.set('page', currentPage);
    params.set('limit', EVENTS_PAGE_SIZE);

    // `allRegions` في وضع التوسّع (تذكرة #161): يُلحَق `all_regions=1` بكل جلب
    // تغذية — ومنه الترقيم اللاحق — حتى يختار المستخدم محافظة صريحة.
    const res = await apiFetch(`/api/events?${params.toString()}`, { allRegions: feedAllRegions });
    const data = await res.json();

    // دورة أحدث بدأت أثناء هذا الطلب (تبديل محافظة أو فلتر): هذا ردّ قديم،
    // فلا يمسّ القائمة ولا البصمة ولا موضع التمرير.
    if (requestSeq !== feedRequestSeq) return;

    if (data.success) {
      allEvents = append ? allEvents.concat(data.events) : data.events;
      currentPagination = data.pagination || null;
      renderEvents(allEvents);
      renderAnnouncements(data.announcements);
      renderFeedLoadingPill();
      updateFeedDimensions();
      if (!append) {
        // بصمة لم تتغيّر (تحديث يدوي/مناسبة جديدة): يبقى المستخدم حيث كان.
        // وبصمة تغيّرت فعلياً: قائمة جديدة تُعرَض من أوّلها صراحةً، لا من
        // منتصف نتيجة أخرى.
        if (signature === previousSignature) {
          restoreFeedScroll(scrollBefore);
        } else {
          restoreFeedTop();
        }
        feedRenderedSignature = signature;
        feedRenderedFilterState = requestState;
        showFeedBackPill();
      }
      // فحص أي رابط عميق بعد اكتمال جلب التغذية (FIX 5)
      if (!append) {
        await checkPendingDeepLink();
      }
    } else {
      if (!append && feedAppliedSignature === signature) feedAppliedSignature = previousSignature;
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>تعذر جلب المناسبات حالياً</p></div>`;
      if (!append) await checkPendingDeepLink();
    }
  } catch (err) {
    if (requestSeq !== feedRequestSeq) return;
    console.error('Error fetching events:', err);
    if (!append && feedAppliedSignature === signature) feedAppliedSignature = previousSignature;
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>حدث خطأ في الاتصال بالخادم</p></div>`;
    if (!append) await checkPendingDeepLink();
  } finally {
    // ردّ قديم لا يطفئ مؤشر الدورة الأحدث التي لا تزال في الطريق.
    if (requestSeq === feedRequestSeq) {
      isFetchingEvents = false;
      if (loadingPill) loadingPill.style.display = 'none';
      renderFeedLoadingPill();
    }
  }
}

/** الصفحة التالية من `handleFeedScroll` قرب آخر التغذية — يحافظ على الفلاتر النشِطة (يستخدم fetchEvents نفسها بصفحة تالية). */
function loadMoreEvents() {
  if (isFetchingEvents) return;
  if (!currentPagination || currentPagination.page >= currentPagination.totalPages) return;
  currentPage = currentPagination.page + 1;
  fetchEvents({ append: true });
}

/*
 * حبّة «جاري تحميل المزيد» وحدها — لا زرّ «عرض المزيد»: كان عائماً فوق صفّ
 * أزرار الكرت نفسه، والصفحة التالية تُجلب تلقائياً من `handleFeedScroll`.
 */
function renderFeedLoadingPill() {
  const wrapper = document.getElementById('loadMoreWrapper');
  const loadingPill = document.getElementById('feedLoadingSpinner');
  if (!wrapper) return;
  const isLoading = isFetchingEvents;
  wrapper.style.display = isLoading ? 'block' : 'none';
  if (loadingPill) loadingPill.style.display = isLoading ? 'inline-flex' : 'none';
}

/** تبديل عرض القادمة فقط vs الكل (الافتراضي: الكل) */
function toggleArchive() {
  toggleUpcomingOnly();
}

function toggleUpcomingOnly() {
  upcomingOnly = !upcomingOnly;
  syncUpcomingUi();
  updateFloatingFilterLabel();
  fetchEvents();
}

function syncUpcomingUi() {
  const mainBtn = document.getElementById('archiveToggleBtn');
  if (mainBtn) {
    mainBtn.classList.toggle('active', upcomingOnly);
    mainBtn.title = upcomingOnly ? 'عرض كل المناسبات' : 'إظهار المناسبات القادمة فقط';
    const textSpan = mainBtn.querySelector('span');
    if (textSpan) textSpan.textContent = upcomingOnly ? 'القادمة فقط ✓' : 'القادمة فقط';
  }
  const drawerSwitch = document.getElementById('drawerArchiveSwitch');
  if (drawerSwitch) drawerSwitch.checked = upcomingOnly;
}

/**
 * إعلانات تعديل التاريخ — خبر عن مناسبة قائمة لا مناسبة جديدة، فتُعرَض بكرت
 * المناسبة نفسه (نفس الصورة والعنوان والأسطر) بشريط «إعلان تعديل موعد» وسطر
 * التغيير، وبلا أزرار لا معنى لها على خبر (#20 step 10).
 * الخادم يرسل الحيّ وحده ضمن `announcements` — لا فلترة ولا منطق انتهاء هنا —
 * ومع كل إعلان بيانات كرت المناسبة كاملة (`honorees`، `occasion_type`)، فلم
 * يبقَ لاسم البلدة وحده محلّ (بلاغ المالك 2026-11-01: كانت مناسبتان في رهط
 * تظهران كرتين متطابقين).
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

  const html = announcements
    .map(a => renderSingleEventCardHtml(a.event, { announcement: a }))
    .join('');
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

/** أسماء أصحاب المناسبة، و`groom_name` للصفوف القديمة بلا `honorees`. */
function eventHonoreeNames(evt) {
  const names = (evt.honorees || []).map(h => String(h.name || '').trim()).filter(Boolean);
  if (!names.length && evt.groom_name && String(evt.groom_name).trim()) names.push(String(evt.groom_name).trim());
  return names;
}

/*
 * عنوان الكرت: النوع واسم صاحب المناسبة («عرس معاذ النباري») دائماً، لا
 * `title` الحرّ — ذاك قد يحمل اسم بلدة وحدها («اللد»). الأسماء موصولة بـ« و »
 * كما يصلها `buildDefaultTitle` على الخادم، ونفس `cardHeadline` في
 * `mobile/lib/models/event.dart`. بلا اسم إطلاقاً يعود إلى العنوان الحرّ.
 */
function eventCardHeadline(evt) {
  const names = eventHonoreeNames(evt);
  if (!names.length) return evt.title || (evt.occasion_type && evt.occasion_type.name) || '';
  const typeName = evt.occasion_type && evt.occasion_type.name ? evt.occasion_type.name : '';
  const joined = names.join(' و ');
  return typeName ? `${typeName} ${joined}` : joined;
}

/**
 * العنوان الحرّ سطراً صغيراً تحت العنوان — فقط حين يضيف شيئاً: لا حين يذكر
 * صاحب المناسبة باسمه الأوّل (العنوان الافتراضي والمستورَد يحملانه، والمستورَد
 * كثيراً بلا اسم الأب: «زفاف العريس سلمان أبو عصا») ولا حين يكون اسم البلدة
 * أو القرية، وهي في سطر المكان أصلاً. `null` يعني لا سطر.
 */
function eventCardSubtitle(evt) {
  const custom = String(evt.title || '').trim();
  if (!custom || custom === eventCardHeadline(evt) || custom === evt.town || custom === eventPlaceName(evt)) return null;
  const names = eventHonoreeNames(evt);
  if (names.length && custom.includes(names[0].split(' ')[0])) return null;
  return custom;
}

/** لون نصّ مقروء فوق لون النوع المصمت — أبيض على الداكن، داكن على الفاتح (الذهبي). */
function readableInkOn(hexColor) {
  const hex = String(hexColor || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#1F2937';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#1F2937' : '#FFFFFF';
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
  if (!tokens.length) {
    const regionName = activeRegionName();
    // بلا محافظة فعّالة يقول «منطقتك» لا اسم محافظة (تذكرة #127): النصّ العام
    // يخاطب كل المحافظات التي وصل إليها التطبيق، لا واحدة بعينها.
    return regionName ? escapeHtml(`منطقة ${regionName}`) : 'منطقتك';
  }
  const resolvedNames = tokens.map(t => resolveFilterOptionLabel(FILTER_SHEETS.place, t)).filter(Boolean);
  if (resolvedNames.length) return escapeHtml(resolvedNames.join('، '));
  return escapeHtml(tokens.length === 1 ? FILTER_SHEETS.place.nounSingular : FILTER_SHEETS.place.nounPlural(tokens.length));
}

function getBezelOrnamentSvg(color) {
  const stroke = encodeURIComponent(color || '#C59425');
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Cg fill='none' stroke='${stroke}' stroke-width='1.1' opacity='0.28'%3E%3Crect x='14' y='14' width='36' height='36'/%3E%3Crect x='14' y='14' width='36' height='36' transform='rotate(45 32 32)'/%3E%3C/g%3E%3C/svg%3E`;
}

/** يوم المناسبة تاريخاً محلياً بلا ساعة — 'YYYY-MM-DD' يُقرأ رقماً رقماً كي لا ينزاح يوماً بالمنطقة الزمنية. */
function eventDayDate(evt) {
  if (typeof evt.event_date === 'string' && evt.event_date.includes('-')) {
    const [y, m, d] = evt.event_date.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const eventDate = new Date(evt.event_date);
  eventDate.setHours(0, 0, 0, 0);
  return eventDate;
}

/** «الخميس، ٣ أكتوبر ٢٠٢٦» — نفس الصيغة في الكرت وصفحة المناسبة. */
function formatEventDayLong(evt) {
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(eventDayDate(evt));
}

/**
 * العدّ التنازلي و«غداً» يُحسبان **بتوقيت القدس** لا بتوقيت جهاز القارئ
 * (تذكرة #170، والمواصفة #156): مغتربٌ في لندن أو نيويورك يجب أن يقرأ «اليوم»
 * حين يكون اليومُ في القدس — وهو اليوم الذي يعيشه أهل المناسبة. `en-CA` يعطي
 * 'YYYY-MM-DD' مباشرة، فالمفتاحان يُقارنان نصّاً بلا تحويل منطقة.
 */
const JERUSALEM_TIME_ZONE = 'Asia/Jerusalem';

/** تاريخ اليوم في القدس بصيغة 'YYYY-MM-DD'. */
function jerusalemTodayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

/**
 * مفتاح يوم 'YYYY-MM-DD' بعد `offsetDays` من اليوم في القدس — حساب تقويمي
 * (`Date.UTC` على مكوّنات اليوم) لا إضافة ساعات، فلا تُزيحه ساعة صيفية.
 * يستعمله نطاق «هذا الأسبوع قربك» وحده.
 */
function jerusalemDayKey(offsetDays) {
  const [year, month, day] = jerusalemTodayKey().split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

/**
 * ساعة حائط القدس الآن بصيغة 'YYYY-MM-DDTHH:MM:SS' — الشكل نفسه الذي يصل به
 * `publish_at` من الخادم (عمود `DATETIME` يقرأه `pool.js` بتوقيت غرينتش كما
 * كتبه صاحب المناسبة، فيصل ISO ينتهي بـ`Z`). تُقارَن نصّاً: «مجدولة لم يبلغ
 * موعدها» هي التي ساعة حائطها أكبر من الآن — نفس `publishNowClock()` في شرط
 * الظهور على الخادم. لا `new Date(publish_at) <= new Date()`: تلك مقارنة لحظة
 * بلحظة، وساعة الحائط الملفوفة بغلاف غرينتش تُزيحها ساعتان أو ثلاث.
 */
function jerusalemWallClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const value = type => (parts.find(part => part.type === type) || {}).value || '00';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}`;
}

/** يوم المناسبة مفتاحاً 'YYYY-MM-DD' — الجزء التاريخي وحده من `event_date`. */
function eventDayKey(evt) {
  return String(evt && evt.event_date ? evt.event_date : '').split('T')[0];
}

/**
 * عدد الأيام من اليوم (بتوقيت القدس) إلى يوم المناسبة: 0 اليوم، 1 غداً، سالب
 * لمن مضت، و`null` لتاريخ لا يُقرأ. `Date.UTC` على المفتاحين يقيس فرقاً نقيّاً
 * بالأيام، فلا ساعة صيفية ولا منطقة متصفّح تُزيح النتيجة يوماً.
 */
function eventCountdownDays(evt, now = new Date()) {
  const dayKey = eventDayKey(evt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const diff = Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${jerusalemTodayKey(now)}T00:00:00Z`);
  if (Number.isNaN(diff)) return null;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

/**
 * نصّ شريحة العدّ التنازلي — الموضع الوحيد الذي يصوغها (M1-W): «اليوم»،
 * «غداً»، «بعد N أيام»، و'' لمناسبة انتهت أو بلا تاريخ يُقرأ — بنفس صياغة
 * تطبيق الموبايل (`eventCountdownChip` في `event_card.dart`). الأيام بتوقيت
 * القدس (`eventCountdownDays`) لا بتوقيت جهاز القارئ، و`now` للتثبيت في الاختبار.
 */
function eventCountdownLabel(evt, now = new Date()) {
  if (evt && evt.is_ended) return '';
  const days = eventCountdownDays(evt, now);
  if (days === null || days < 0) return '';
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غداً';
  return `بعد ${days} أيام`;
}

/**
 * شريحة العدّ على زاوية الملصق: حمراء حين يقترب الموعد (ثلاثة أيام أو أقل)،
 * ولا شيء لمناسبة انتهت. هي نفسها في كرت التغذية وبطاقة «الأعراس المميزة»
 * وكرت «الأكثر تفاعلاً» — النصّ من `eventCountdownLabel` وحدها.
 */
function posterCountdownChipHtml(evt, now = new Date()) {
  const label = eventCountdownLabel(evt, now);
  if (!label) return '';
  const days = eventCountdownDays(evt, now);
  const soon = days !== null && days <= 3;
  return `<span class="poster-countdown-chip${soon ? ' is-soon' : ''}">${escapeHtml(label)}</span>`;
}

/**
 * قيمة من إعلان تعديل الموعد: قد تكون تاريخاً ('YYYY-MM-DD') وقد تكون نصاً
 * حرّاً كتبه الأدمن (اسم يوم، «بعد أسبوع»…). التاريخ وحده يُصاغ عربياً طويلاً،
 * وغيره يُعرَض كما وصل — الصيغة العربية على قيمة لا تُقرأ تاريخاً تُلقي استثناءً
 * (`Intl.DateTimeFormat` على تاريخ غير صالح)، فتسقط معها القائمة كلها.
 */
function announcementDateLabel(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (Number.isNaN(eventDayDate({ event_date: raw }).getTime())) return raw;
  return formatEventDayLong({ event_date: raw });
}

/** سطر التغيير في كرت الإعلان — «من … إلى …» بالتاريخ العربي لا ISO خام. */
function announcementChangeText(announcement) {
  const from = announcementDateLabel(announcement.old_value);
  const to = announcementDateLabel(announcement.new_value);
  if (!from && !to) return 'تغيّر موعد المناسبة';
  if (!from) return `تغيّر موعد المناسبة إلى ${to}`;
  if (!to) return `تغيّر موعد المناسبة من ${from}`;
  return `تغيّر موعد المناسبة من ${from} إلى ${to}`;
}

/** روابط Waze وخرائط Google: الإحداثيات إن وُجدت، وإلا بحث باسم المكان والبلدة. */
function eventNavUrls(evt) {
  if (evt.latitude && evt.longitude) {
    return {
      wazeUrl: `https://waze.com/ul?ll=${evt.latitude},${evt.longitude}&navigate=yes`,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${evt.latitude},${evt.longitude}`
    };
  }
  // محافظة **المناسبة** نفسها بدل «النقب» الثابت (تذكرة #127): إلحاق النقب
  // بمناسبة في طولكرم يحيّد نتائج البحث ويرسل السائق إلى المكان الخطأ.
  // تُسقَط إن كان اسم البلدة هو اسم المحافظة نفسه (مناسبة على مستوى المحافظة).
  const regionName = regionNameById(evt.region_id);
  const parts = [evt.location_name, evt.town];
  if (regionName && regionName !== evt.town) parts.push(regionName);
  const q = encodeURIComponent(parts.filter(Boolean).join(' '));
  return {
    wazeUrl: `https://waze.com/ul?q=${q}&navigate=yes`,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}`
  };
}

/**
 * «أضف إلى تقويم الهاتف» (تذكرة #176) — ملف iCalendar من
 * `GET /api/events/:id/calendar.ics` على **أصل الخادم** (`shareOrigin()`، أي
 * `API_BASE`) لا على أصل الصفحة: الويب يُنشر على استضافة ثابتة مستقلة عن
 * الخادم (ADR-0001)، فرابط نسبي هنا يسقط على الاستضافة الثابتة ويردّ 404.
 * والتنزيل نفسه من `Content-Disposition` في الاستجابة، فلا `download` هنا.
 */
function eventCalendarUrl(evt) {
  return `${shareOrigin()}/api/events/${encodeURIComponent(evt.id)}/calendar.ics`;
}

/**
 * هل تُعرض «أضف إلى تقويم الهاتف» لهذه المناسبة؟ نفس شرط بوابة المسار على
 * الخادم (`PUBLIC_EVENT_VISIBLE_SQL_EVENTS`): معتمدة، وعامة، ومجدولةٌ بلغ
 * موعدُها — وإلا ردّ `calendar.ics` 404 والزرّ وعدٌ لا يُنفَّذ. الصفحة تُفتح
 * «بالرابط فقط» والمعلّقة والمجدولة (المالك يفتحها بمعرّفها)، فوجود الزرّ فيها
 * بلا هذا الشرط رابطٌ ميّت.
 *
 * `null`/الغائب يعني «الخادم لم يرسل المفتاح» — وصفوف التغذية لا تحمله، وهي
 * معتمدة عامة غير مجدولة بحكم استعلامها أصلاً — فغيابُه لا يمنع، وقيمةٌ مرسلة
 * مخالفة هي التي تمنع. نفس قاعدة زرّ التذكير في هذه الصفحة
 * (`!evt.status || evt.status === 'approved'`) وقاعدة `canFollow` في الموبايل.
 */
function eventCalendarEligible(evt) {
  if (!evt) return false;
  if (evt.status && evt.status !== 'approved') return false;
  if (evt.visibility && evt.visibility !== 'public') return false;
  if (!evt.publish_at) return true;
  const stored = new Date(evt.publish_at);
  // قيمة لا تُقرأ تاريخاً لا تُخفي الزرّ: المفتاح غير صالح، لا «مجدولة».
  if (Number.isNaN(stored.getTime())) return true;
  return stored.toISOString().slice(0, 19) <= jerusalemWallClock();
}

/** مشغّل مقطع المناسبة (خاصّ أو افتراضي) — فارغ لنوع لا صوت له. أزراره وموجاته تتبع syncAudioUi. */
function renderEventAudioBlockHtml(evt) {
  const effectiveAudio = effectiveEventAudio(evt);
  if (!effectiveAudio) return '';
  return `
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
  `;
}

/**
 * صورة كرت المناسبة مصغّرة (تذكرة #161، البند 3): رابط Cloudinary يُطلب بتحويل
 * `f_auto,q_auto,c_limit,w_600` — نفس اشتقاق الألبومات حرفاً
 * (`thumbFromImageUrl` في `server/src/services/albums.service.js`)، فلا تُنزّل
 * التغذية ملصقاً بعرض 1600px لخانة بعرض 600. ورابط `/uploads/` يبقى كما هو:
 * يستقرّ على خادمنا المحلي بلا خدمة تحويل، فأي إلحاق به يكسره.
 *
 * **لا يُستعمل في صفحة المناسبة**: هناك الصورة كاملة (`w_1600`)؛ التحويل هنا
 * لصورة الكرت وحدها. ولا يمسّ `absoluteMediaUrl` على الخادم — سلوكه العام
 * لم يتغيّر، ولا عميل آخر يعتمد على هذا الشكل.
 */
const CARD_IMAGE_WIDTH = 600;
const CLOUDINARY_UPLOAD_MARKER = '/image/upload/';

function cardImageUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\/res\.cloudinary\.com\//i.test(url)) return url;
  const markerAt = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (markerAt < 0) return url;
  const head = url.slice(0, markerAt + CLOUDINARY_UPLOAD_MARKER.length);
  const rest = url.slice(markerAt + CLOUDINARY_UPLOAD_MARKER.length);
  const slashAt = rest.indexOf('/');
  if (slashAt < 0) return url;
  const transform = rest.slice(0, slashAt);
  const tail = rest.slice(slashAt);
  // الرابط الذي يخزّنه deliveryUrl نفسه: العرض وحده يتغيّر.
  if (/^f_auto,q_auto,c_limit,w_\d+$/.test(transform)) {
    return `${head}f_auto,q_auto,c_limit,w_${CARD_IMAGE_WIDTH}${tail}`;
  }
  // رابط Cloudinary بلا تحويل (`upload/v<version>/…`): يُضاف التحويل كاملاً
  // بدل تركه بحجمه الأصلي. أي تحويل آخر مكتوب في الرابط يُترك كما هو — قد
  // يكون مقصوداً، ولا نُخمّن مكانه.
  if (/^v\d+$/.test(transform)) {
    return `${head}f_auto,q_auto,c_limit,w_${CARD_IMAGE_WIDTH}/${transform}${tail}`;
  }
  return url;
}

/**
 * زرّ «بارك»/«عزّي» — الموضع الوحيد الذي يبنيه، يستعمله كرت التغذية وبطاقة
 * «الأعراس المميزة» معاً. تسميته من نغمة النوع لا من اسمه: العزاء «عزّي» وكل
 * فرح «بارك»، والفتح على مسار التبريك القائم نفسه (`openMessageSheet`).
 */
function renderMessagesActionHtml(evt) {
  const isMourning = isMourningTone(evt);
  return `
        <button type="button" class="chat-trigger-btn card-action-btn card-messages-btn" onclick="openMessageSheet(${evt.id}, ${evt.occasion_type && evt.occasion_type.id ? evt.occasion_type.id : 'null'})">
          <i class="fa-regular fa-comments"></i> <span>${isMourning ? 'عزّي' : 'بارك'}</span>
        </button>`;
}

/**
 * كرت مناسبة واحد — وهو نفسه كرت الإعلان حين يصل `opts.announcement`
 * (`{ event_id, old_value, new_value }`): شريط «إعلان تعديل موعد» أعلى الكرت
 * وسطر التغيير، وزرّ «التفاصيل» وحده. «ذكّرني» و«التبريكات» و«المشاركة» لا
 * معنى لها على خبر عن مناسبة ليست جديدة، و`data-audio-url` يُسقط لأن المناسبة
 * نفسها في التغذية فلا يتنافس مقطعان. بلا `opts.announcement` يخرج الكرت كما
 * هو تماماً (#20 step 10).
 */
function renderSingleEventCardHtml(evt, opts = {}) {
  const announcement = opts.announcement || null;

  const formattedDate = formatEventDayLong(evt);
  const effectiveAudio = announcement ? null : effectiveEventAudio(evt);

  const isMourning = isMourningTone(evt);
  const toneColor = evt.occasion_type && evt.occasion_type.color
    ? (evt.occasion_type.color.startsWith('#') ? evt.occasion_type.color : `#${evt.occasion_type.color}`)
    : null;
  const toneStyle = toneColor ? ` style="--tone:${toneColor};--tone-ink:${readableInkOn(toneColor)}"` : '';
  const bezelSvg = getBezelOrnamentSvg(toneColor);
  const bezelStyle = ` style="background-image:url(&quot;${bezelSvg}&quot;)"`;
  const hasShot = !!evt.poster_url;

  const mediaContent = hasShot ? `
    <img src="${escapeHtml(cardImageUrl(evt.poster_url))}" alt="${escapeHtml(evt.title)}" class="card-media-img" loading="lazy">` : `
    <div class="card-media-placeholder"><i class="fa-solid ${isMourning ? 'fa-dove' : 'fa-champagne-glasses'}"></i></div>`;

  // العدّ التنازلي على زاوية الملصق (M1-W) — «اليوم/غداً/بعد N أيام» من
  // `eventCountdownLabel` وحدها، حمراء في آخر ثلاثة أيام، ولا شيء لمناسبة انتهت.
  // **وهو العدّ الوحيد على الكرت**: شريحة الكابشن القديمة أُزيلت، فبقي في الكابشن
  // «انتهت» وحدها. والعزاء بلا أي عدّ (هدوء النوع).
  const posterCountdownHtml = isMourning ? '' : posterCountdownChipHtml(evt);

  // «انتهت» (#167): نهاية أيام المناسبة مضت — يحسبها الخادم بامتداد الأيام كاملاً
  // (`is_ended` على الصفّ) لا العميل. شريحة العدّ لا تُرسم لمناسبة انتهت
  // (`posterCountdownChipHtml`)، فتبقى «انتهت» وحدها بلا شريحة ثانية، ولا تحملها
  // مناسبة قائمة: `is_ended` غير مرسل ⇒ لا شيء.
  const endedChipHtml = evt.is_ended ? '<span class="card-datechip is-ended">انتهت</span>' : '';

  // «مناسبة كبرى» (تذكرة #171): الخادم يحسبها على الصفّ (`is_featured`،
  // مشتقّة من `featured_until >= CURDATE()`)، فالعميل لا يقارن تواريخ ولا
  // يعرف معنى «انتهى الإبراز». الشارة ذهبية أبداً — لا بلون النوع — لأنها
  // وسام المنصّة لا وسم النغمة، وتُقرأ قبل رقاقة النوع.
  const isFeatured = evt.is_featured === true || evt.is_featured === 1 || evt.is_featured === '1';
  const featuredBadgeHtml = isFeatured ? `
        <span class="card-featured-badge"><i class="fa-solid fa-star" aria-hidden="true"></i> مناسبة كبرى</span>` : '';

  // سطر لكل معلومة بأيقونتها — لا سطر واحد تُحشر فيه كلها بفواصل (طلب المالك
  // 2026-09-30). التاريخ والمكان لكل الأنواع دون استثناء؛ قصة 15 تقتضي
  // قراءتهما مباشرة دون الحاجة لفتح التفاصيل.
  const infoLine = (className, icon, text) => text
    ? `<div class="card-info-line ${className}"><i class="${icon}" aria-hidden="true"></i><span class="card-clamp-1-line">${escapeHtml(text)}</span></div>` : '';
  const placeText = [eventPlaceName(evt), evt.location_name].filter(Boolean).join(' — ');
  const infoLinesHtml = [
    infoLine('card-date-line', 'fa-regular fa-calendar', formattedDate),
    typeShowsField(evt, 'dinner_time') ? infoLine('card-time-line', 'fa-regular fa-clock', evt.dinner_time) : '',
    infoLine('card-place-line', 'fa-solid fa-location-dot', placeText),
    infoLine('card-clan-line', 'fa-solid fa-people-group', evt.family_clan),
  ].join('');
  const subtitle = eventCardSubtitle(evt);
  const subtitleHtml = subtitle ? `<div class="card-subtitle card-clamp-1-line">${escapeHtml(subtitle)}</div>` : '';

  // الشريط العلوي وسطر التغيير — للكرت الإعلاني وحده، وبلا قصّ لسطر التغيير:
  // «من … إلى …» جملةٌ تُقرأ كاملة لا عنواناً يُختصر. يبدأ كلٌّ منهما بسطر جديد
  // كي يبقى كرت التغذية العادي (الفرعان فارغان) مطابقاً حرفياً لما كان.
  const announcementBannerHtml = announcement ? `
          <div class="announcement-banner">
            <i class="fa-solid fa-bullhorn" aria-hidden="true"></i>
            <span>إعلان تعديل موعد</span>
          </div>` : '';
  const announcementLineHtml = announcement ? `
        <div class="announcement-change-line">
          <i class="fa-solid fa-right-left" aria-hidden="true"></i>
          <span>${escapeHtml(announcementChangeText(announcement))}</span>
        </div>` : '';

  // أفعال الكرت (تذكرة #170، وقرار #146 المرحلة ٢): «التفاصيل» دائماً، ثم أفعال
  // المناسبة على الفرح — «جاي» (حين يفتح النوع تأكيد الحضور) و«بارك» و«ذكّرني»
  // — ثم «المشاركة». **والعزاء لا أزرار ولا عدّادات إلا «عزّي»**: زرّ تبريك واحد
  // بلا قلبٍ ولا «جاي»، والتبريكات تُقرأ «عزّي» من نغمة النوع لا من اسمه.
  const messagesActionHtml = renderMessagesActionHtml(evt);
  const actionsHtml = announcement ? `
      <div class="card-caption-actions">
        <button type="button" class="card-more-details-btn card-action-btn" onclick="openEventPage(${announcement.event_id != null ? announcement.event_id : evt.id})">
          <i class="fa-solid fa-circle-info"></i> <span>التفاصيل</span>
        </button>
      </div>` : `
      <div class="card-caption-actions">
        <button type="button" class="card-more-details-btn card-action-btn" onclick="openEventPage(${evt.id})">
          <i class="fa-solid fa-circle-info"></i> <span>التفاصيل</span>
        </button>${isMourning ? '' : renderRsvpCardButtonHtml(evt)}${messagesActionHtml}${isMourning ? '' : renderReminderButtonHtml(evt, { compact: true })}
        <button type="button" class="share-event-btn card-action-btn" onclick="shareEventById(${evt.id})">
          <i class="fa-solid fa-share-nodes"></i> <span>${escapeHtml(shareButtonLabel(evt))}</span>
        </button>
      </div>`;

  const captionHtml = `
    <div class="card-caption">
      <div class="card-caption-chips">${featuredBadgeHtml}
        <span class="card-kindchip">${occasionTypeBadgeHtml(evt.occasion_type)}</span>
        ${endedChipHtml}
      </div>
      <h2 class="event-main-title card-clamp-2-line"><a href="/e/${evt.id}" class="card-title-link" onclick="handleCardTitleClick(event, ${evt.id})">${escapeHtml(eventCardHeadline(evt))}</a></h2>
      ${subtitleHtml}
      <div class="card-info-lines">${infoLinesHtml}</div>${announcementLineHtml}${actionsHtml}
    </div>`;

  // `announcementCard-` لا `eventCard-`: للمناسبة الواحدة كرتان في الصفحة
  // (إعلانها وكرتها في التغذية)، ومعرّف مكرَّر في مستند واحد ليس معرّفاً.
  const cardIdPrefix = announcement ? 'announcementCard' : 'eventCard';

  return `
    <div class="event-card${isMourning ? ' tone-mourning' : ''}${isFeatured ? ' is-featured' : ''}${announcement ? ' announcement-card' : ''}" id="${cardIdPrefix}-${evt.id}"${toneStyle} data-solemn="${isMourning}" data-event-id="${evt.id}"${effectiveAudio ? ` data-audio-url="${escapeHtml(effectiveAudio.url)}"` : ''}>
      <div class="card-bezel"${bezelStyle}>
        <div class="card-framed">${announcementBannerHtml}
          <div class="card-media${hasShot ? '' : ' card-media-empty'}" onclick="openEventPage(${evt.id})">
            ${mediaContent}${posterCountdownHtml}
          </div>
          ${captionHtml}
          <div class="card-goldframe" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  `;
}

function handleCardTitleClick(event, id) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
  event.preventDefault();
  openEventPage(id);
}

function renderEvents(events) {
  const container = document.getElementById('eventsContainer');
  const isFirstLoad = !eventsFeedFirstLoadDone;
  eventsFeedFirstLoadDone = true;

  if (!events || events.length === 0) {
    container.classList.remove('events-feed-first-load');
    // الحالة الفارغة بابٌ لا جدار (تذكرة #161، البند 2): نصّها يقول لماذا
    // فرغت، وتحته فعلٌ ووجهتان وخروجٌ من المحافظة — لا رسالة تُترك للمستخدم
    // وحده. الوجهات كلها دوالّ قائمة: `openAddEventModal` و`switchTab`
    // و`openAlbumsPage`، والتوسيع يعيد استعمال خطوات تبديل المحافظة نفسها
    // (`resetFeedForRegionChange` و`fetchEvents`) لا حالة عرض ثانية.
    container.innerHTML = `
      <div class="empty-state feed-empty-state">
        <i class="fa-solid fa-calendar-xmark"></i>
        <h3>لا توجد مناسبات مسجلة</h3>
        <p>${selectedDateFilter
          ? `لا مناسبات في ${selectedPlacesHtml()} — ${escapeHtml(selectedDateFilter.label)}`
          : `كن أول من يعلن عن مناسبة في ${selectedPlacesHtml()}`}</p>
        <div class="feed-empty-actions">
          <button type="button" class="feed-empty-primary" onclick="openAddEventModal()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> أضف مناسبتك
          </button>
          <button type="button" class="feed-empty-card" onclick="switchTab('tabServices')">
            <i class="fa-solid fa-handshake-angle" aria-hidden="true"></i>
            <span>خدمات الأعراس في منطقتك</span>
            <i class="fa-solid fa-chevron-left feed-empty-card-arrow" aria-hidden="true"></i>
          </button>
          <button type="button" class="feed-empty-card" onclick="openAlbumsPage()">
            <i class="fa-regular fa-images" aria-hidden="true"></i>
            <span>ألبومات منطقتك</span>
            <i class="fa-solid fa-chevron-left feed-empty-card-arrow" aria-hidden="true"></i>
          </button>
          <button type="button" class="feed-empty-expand" onclick="expandFeedToAllRegions()">
            <i class="fa-solid fa-globe" aria-hidden="true"></i> وسّع إلى كل المحافظات
          </button>
        </div>
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
  // الكروت وبينها إعلانات موضع `feed` إن وُجدت (تذكرة #173) — الشكل نفسه
  // بلا ستوريات إعلان، فلا يتغيّر شيء لمن لا إعلان له.
  container.innerHTML = renderFeedCardsHtml(events);
  updateFeedDimensions();
  // الكروت أُعيد إنشاؤها للتو: المراقب يتبع العناصر الجديدة، وحالة الزرّ تُستعاد
  // من المقطع الذي ربما لا يزال يُسمَع (إعادة رسم لا توقف الصوت).
  observeFeedCardsForAudio();
  syncAudioUi();
}

/*
 * صفحة المناسبة — نفس صفحة «تفاصيل المناسبة» في تطبيق الموبايل
 * (mobile/lib/screens/event_details_screen.dart) وبترتيبها: البوستر كاملاً،
 * النوع والعنوان، سطر بتسميته لكل معلومة، المقطع، الملاحة والاتصال، المشاركة
 * و«ذكّرني» والنقوط، الأرشيف، التفاعلات، ثم التبريكات (طلب المالك 2026-10-02،
 * بدل ورقة التفاصيل داخل الكرت). تُفتح فوق التغذية ولا تمسّها، فالرجوع — بزرّها
 * أو بزرّ رجوع المتصفّح أو Escape — يعيد إلى نفس الكرت لا الأول.
 */
let eventPageEvent = null;
let eventPageHistoryPushed = false;
let ignoreNextEventPagePopstate = false;
// يزيد مع كل فتح — ردّ جلب متأخّر لمناسبة سابقة لا يُرسم فوق التالية.
let eventPageOpenSeq = 0;

function isEventPageOpen() {
  const page = document.getElementById('eventPage');
  return !!(page && !page.hidden);
}

/**
 * يفتح الصفحة فوراً ببيانات الكرت المحمّلة إن وُجدت، ثم يكملها من
 * `GET /api/events/:id` (التبريكات والأرشيف). مناسبة ليست في التغذية (إشعار،
 * رابط، فلتر آخر) تُجلب وحدها دون أن تلوّث allEvents.
 */
async function openEventPage(eventId) {
  const page = document.getElementById('eventPage');
  const body = document.getElementById('eventPageBody');
  if (!page || !body || !eventId) return;

  const openSeq = ++eventPageOpenSeq;
  const wasOpen = isEventPageOpen();
  const known = allEvents.find(e => e.id === eventId)
    || (eventPageEvent && eventPageEvent.id === eventId ? eventPageEvent : null);
  eventPageEvent = known;
  page.hidden = false;
  document.body.classList.add('event-page-open');
  body.scrollTop = 0;
  if (known) {
    renderEventPage(known);
  } else {
    body.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>جاري تحميل المناسبة...</p></div>';
  }

  if (!wasOpen) {
    document.addEventListener('keydown', handleEventPageKeydown);
    try {
      history.pushState({ eventPage: eventId }, '');
      eventPageHistoryPushed = true;
    } catch (e) {
      eventPageHistoryPushed = false;
    }
  }

  recordAnalyticsEvent('event_viewed', { contentTown: known ? known.town : undefined });
  if (known) playEventPageAudioOnOpen(known);

  try {
    const res = await apiFetch(`/api/events/${eventId}`, { auth: Boolean(authToken) });
    const data = await res.json();
    if (!isEventPageOpen() || openSeq !== eventPageOpenSeq) return;
    if (data && data.success && data.event) {
      eventPageEvent = { ...(known || {}), ...data.event };
      renderEventPage(eventPageEvent);
      if (!known) playEventPageAudioOnOpen(eventPageEvent);
    } else if (!known) {
      body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><h3>${escapeHtml((data && data.message) || 'المناسبة غير موجودة')}</h3></div>`;
    }
  } catch (e) {
    console.error('Event page error:', e);
    if (!known && isEventPageOpen() && openSeq === eventPageOpenSeq) {
      body.innerHTML = '<div class="empty-state"><i class="fa-solid fa-wifi"></i><h3>تعذّر تحميل المناسبة — تحقق من الاتصال</h3></div>';
    }
  }
}

/** فتح الصفحة يشغّل مقطع المناسبة (ضغطة حقيقية، فلا ترفضها سياسة التشغيل التلقائي) ما لم يكن الصوت مكتوماً — كفتح التفاصيل في الموبايل. */
function playEventPageAudioOnOpen(evt) {
  const audio = effectiveEventAudio(evt);
  if (!audio || soundMuted) return;
  manuallyPausedEventId = null;
  playEventAudio(evt.id, audio.url);
}

/** يعيد جلب المناسبة المعروضة — بعد تبريكة من الغرفة أو تغيير «ذكّرني». */
async function refreshEventPage() {
  if (!isEventPageOpen() || !eventPageEvent) return;
  const eventId = eventPageEvent.id;
  try {
    const res = await apiFetch(`/api/events/${eventId}`, { auth: Boolean(authToken) });
    const data = await res.json();
    if (data && data.success && data.event && isEventPageOpen() && eventPageEvent && eventPageEvent.id === eventId) {
      eventPageEvent = { ...eventPageEvent, ...data.event };
      renderEventPage(eventPageEvent);
    }
  } catch (e) {
    console.error('Event page refresh error:', e);
  }
}

function closeEventPage() {
  if (!isEventPageOpen()) return;
  hideEventPage();
  if (eventPageHistoryPushed) {
    eventPageHistoryPushed = false;
    ignoreNextEventPagePopstate = true;
    try {
      history.back();
    } catch (e) {
      ignoreNextEventPagePopstate = false;
    }
  }
}

function hideEventPage() {
  const page = document.getElementById('eventPage');
  if (page) page.hidden = true;
  document.body.classList.remove('event-page-open');
  document.removeEventListener('keydown', handleEventPageKeydown);
  closeArchiveViewer();
  // مقطع هذه المناسبة يقف بخروجها — كإغلاق الورقة القديمة؛ التغذية تقرّر بعدها.
  if (eventPageEvent && currentAudioEventId === eventPageEvent.id) {
    manuallyPausedEventId = eventPageEvent.id;
    pauseCurrentAudio();
  }
  eventPageEvent = null;
}

/** زرّ رجوع المتصفّح (أو إيماءة الرجوع في الهاتف) يغلق الصفحة بدل مغادرة الموقع. */
function handleEventPagePopstate() {
  if (ignoreNextEventPagePopstate) {
    ignoreNextEventPagePopstate = false;
    return;
  }
  if (isEventPageOpen()) {
    eventPageHistoryPushed = false;
    hideEventPage();
  }
}

/** Escape يغلق الصفحة — ما لم تكن نافذة فوقها (تبريكات، مشاركة، عارض صور) هي المقصودة. */
function handleEventPageKeydown(e) {
  if (e.key !== 'Escape') return;
  const archiveViewer = document.getElementById('archiveViewer');
  if (archiveViewer && !archiveViewer.hidden) return;
  const modalAbove = [...document.querySelectorAll('.modal-overlay')].some(m => m.style.display === 'flex');
  if (modalAbove) return;
  closeEventPage();
}

/** البوستر بملء الشاشة — في عارض الأرشيف نفسه، صورة واحدة. */
function openEventPagePoster() {
  if (!eventPageEvent || !safeHttpUrl(eventPageEvent.poster_url)) return;
  archivePhotosByBox.eventPagePoster = [{ image_url: eventPageEvent.poster_url }];
  openArchiveViewer(0, 'eventPagePoster');
}

function recordEventPageLocationClicked() {
  if (eventPageEvent) recordLocationClicked(eventPageEvent.town || '');
}

function recordEventPageContactClicked() {
  if (eventPageEvent) recordAnalyticsEvent('contact_clicked', { contentTown: eventPageEvent.town || '' });
}

/** «تسجيل نقوط» بقيم المناسبة المعروضة — تُقرأ هنا لا تُحشر نصّاً داخل onclick. */
function recordNokootFromEventPage() {
  if (!eventPageEvent) return;
  const names = eventHonoreeNames(eventPageEvent);
  quickRecordNokoot(names[0] || eventPageEvent.groom_name || '', String(eventPageEvent.event_date || '').split('T')[0], eventPageEvent.town || '');
}

/**
 * «برنامج المناسبة» (تذكرة #176): محطات المناسبة مجمّعة تحت تاريخها — تاريخٌ
 * واحد عنواناً لمجموعته، وتحته محطاته. الترتيب هو ترتيب الخادم نفسه (تاريخاً
 * ثم وقتاً ثم `position`، `eventDaysForEvents` في الخدمة) بلا إعادة ترتيب هنا:
 * منطق الترتيب واحد في الخادم، والعميل يرسم ما وصله. والتجميع بخريطة تُحفظ
 * بترتيب أول ظهور، فما جاء ليومٍ واحد متتالياً — وهو ما يضمنه الخادم — يصير
 * مجموعةً واحدة بلا فرض ترتيب ثانٍ.
 *
 * «الوقت» و«المكان» يظهران فقط حين كُتبا؛ ولا اسم محطّة هو تاريخها — كل محطة
 * سطرٌ باسمها هي، لا سطر تاريخها. وبلا محطات لا يُرسم القسم أصلاً.
 */
function eventProgramHtml(evt) {
  if (!typeShowsField(evt, 'extra_days') || !Array.isArray(evt.extra_days) || !evt.extra_days.length) return '';

  const byDate = new Map();
  for (const day of evt.extra_days) {
    const key = String(day.day_date || '');
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(day);
  }

  const groupsHtml = [...byDate.entries()].map(([date, days]) => `
    <div class="event-page-program-group">
      <div class="event-page-program-date">${escapeHtml(date ? formatEventDayLong({ event_date: date }) : '')}</div>
      ${days.map(day => {
        const parts = [day.name];
        if (day.day_time) parts.push(day.day_time);
        if (day.place) parts.push(day.place);
        return `<div class="event-page-program-stop">${escapeHtml(parts.filter(Boolean).join(' — '))}</div>`;
      }).join('')}
    </div>`).join('');

  return `
    <section class="event-page-program">
      <div class="event-page-program-head"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> برنامج المناسبة</div>
      ${groupsHtml}
    </section>`;
}

/** سطر «تسمية: قيمة» بأيقونته — فارغ إن لم تكن قيمة، كـ_InfoRow في الموبايل.
 *  `trailingHtml` اختياري يُلحق بآخر السطر (زرّ الملاحة بجانب المكان). */
function eventPageInfoRowHtml(icon, label, value, trailingHtml = '') {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  return `
    <div class="event-page-info-row">
      <i class="${icon}" aria-hidden="true"></i>
      <div>
        <div class="event-page-info-label">${escapeHtml(label)}</div>
        <div class="event-page-info-value">${escapeHtml(String(value))}</div>
      </div>${trailingHtml || ''}
    </div>`;
}

/**
 * سقف إجمالي الحاضرين في جواب واحد — مطابق لـ`RSVP_PARTY_SIZE_MAX` في
 * `server/src/constants.js`، فالواجهة لا ترسل قيمة سيرفضها الخادم بـ400.
 * والرقم **إجمالي الحاضرين بمن فيهم صاحب الجواب**، لا المرافقون وحدهم: الخادم
 * يجمع `party_size` في `rsvp_going_count`، واختيار 1 يعني «أنت وحدك».
 */
const RSVP_PARTY_SIZE_MAX = 20;

/**
 * هل تُعرض أزرار الحضور لهذه المناسبة؟ علَمان يُقرآن من نوع المناسبة كما وصلا:
 * `rsvp_enabled` (ميزة يفتحها السوبر أدمن لكل نوع) ونغمة غير وقورة. والخادم
 * هو الحَكَم في النهاية — هذا الاختبار يمنع رسم زرّ يجيبه 404 وحده.
 */
function eventRsvpVisible(evt) {
  const type = evt && evt.occasion_type;
  if (!type || type.tone === 'solemn') return false;
  return type.rsvp_enabled === true;
}

/** نصّ حالة الجواب الحالي — «لم تُجب بعد» تعني `my_rsvp === null`، لا غياب مفتاح. */
function rsvpStateText(myRsvp) {
  if (!myRsvp) return 'لم تُجب بعد';
  if (myRsvp.response === 'yes') {
    const size = Number(myRsvp.party_size) || 1;
    return size === 1 ? 'جوابك: «جاي» — أنت وحدك' : `جوابك: «جاي» — ${size} أشخاص`;
  }
  return 'جوابك: «مش جاي»';
}

/**
 * كتلة تأكيد الحضور في صفحة المناسبة (تذكرة #168): زرّا «جاي» و«مش جاي» مع
 * إجمالي الحاضرين (1..20، بمن فيهم صاحب الجواب)، وحالة الجواب، والعدّاد العلني
 * حين يسمح النوع به (`rsvp_going_count` يغيب كلياً حين يخفيه النوع أو تطفئه
 * الميزة — لا صفر). تُرسم لمناسبة `rsvp_enabled` وحدها، ولا تُرسم لنوع `solemn`
 * إطلاقاً.
 */
function renderEventRsvpHtml(evt, { isMourning = false } = {}) {
  if (isMourning || !eventRsvpVisible(evt)) return '';

  const mine = evt.my_rsvp || null;
  const chosen = mine ? mine.response : null;
  const partySize = mine ? Number(mine.party_size) || 1 : 1;
  const sizeOptions = Array.from({ length: RSVP_PARTY_SIZE_MAX }, (_, index) => index + 1)
    .map(size => `<option value="${size}"${size === partySize ? ' selected' : ''}>${size}</option>`)
    .join('');
  const goingCount = evt.rsvp_going_count;

  return `
    <div class="event-page-rsvp" id="eventPageRsvp">
      <div class="event-page-rsvp-head">
        <span class="event-page-rsvp-title"><i class="fa-solid fa-user-check" aria-hidden="true"></i> تأكيد الحضور</span>
        ${goingCount != null ? `<span class="event-page-rsvp-count" id="eventPageRsvpCount">جايين: ${Number(goingCount) || 0}</span>` : ''}
      </div>
      <div class="event-page-rsvp-controls">
        <label class="event-page-rsvp-size-label" for="rsvpPartySize">إجمالي الحاضرين بمن فيك</label>
        <select id="rsvpPartySize" class="event-page-rsvp-size" aria-label="إجمالي الحاضرين بمن فيك">${sizeOptions}</select>
        <button type="button" class="event-page-btn rsvp-choice${chosen === 'yes' ? ' is-chosen' : ''}" onclick="submitRsvp('yes')">
          <i class="fa-solid fa-check" aria-hidden="true"></i> جاي
        </button>
        <button type="button" class="event-page-btn rsvp-choice${chosen === 'no' ? ' is-chosen' : ''}" onclick="submitRsvp('no')">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i> مش جاي
        </button>
      </div>
      <div class="event-page-rsvp-state" id="eventPageRsvpState">${escapeHtml(rsvpStateText(mine))}</div>
      ${mine ? `
        <button type="button" class="event-page-rsvp-withdraw" onclick="withdrawRsvp()">
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> سحب جوابي
        </button>` : ''}
    </div>`;
}

/**
 * «جاي ✓» على الكرت (تذكرة #170): الفعل السريع الوحيد من الكرت، جوابه
 * `PUT /api/events/:id/rsvp` بعدد 1 — والعدد يُعدَّل من صفحة المناسبة. الزرّ
 * واحد لا اثنان: «مش جاي» قرار يتغيّر على صفحة المناسبة حيث العدّاد والقائمة.
 *
 * لا يُرسم لنوع `rsvp_enabled` مطفأ (`eventRsvpVisible`)، ولا للعزاء (لا يصل
 * إلى هنا أصلاً — كرت العزاء «عزّي» وحده). وحالته تُقرأ من `my_rsvp` حين
 * يكون الصفّ قد حملها (بعد جواب سابق في هذه الجلسة)، وإلا يبقى زرّ الدعوة.
 */
function renderRsvpCardButtonHtml(evt) {
  if (!eventRsvpVisible(evt)) return '';
  const going = !!(evt.my_rsvp && evt.my_rsvp.response === 'yes');
  return `
        <button type="button" class="card-action-btn rsvp-card-btn${going ? ' is-chosen' : ''}" onclick="submitCardRsvp(${evt.id})">
          <i class="fa-solid fa-check"></i> <span>جاي</span>
        </button>`;
}

/**
 * «جاي» من الكرت. العدد: 1 للجواب الأول، أما من سبق أن أجاب من صفحة المناسبة
 * بعددٍ أكبر فيُحفظ عدده كما هو — ضغطةٌ على الكرت ليست أمراً بمحو مرافقيه من
 * العدّاد العلني. و«جاي» يُنشئ «ذكّرني» على الخادم (تذكرة #168)، فحالة زرّ
 * القائمة تُحدَّث بنجاح الفعل نفسه لا تُفترض.
 */
async function submitCardRsvp(eventId) {
  if (!requireAuth({ type: 'rsvp', eventId, response: 'yes' })) return;

  const known = allEvents.find(e => e.id === eventId)
    || (eventPageEvent && eventPageEvent.id === eventId ? eventPageEvent : null);
  const mine = known && known.my_rsvp ? known.my_rsvp : null;
  const partySize = mine && mine.response === 'yes' ? (Number(mine.party_size) || 1) : 1;

  try {
    const res = await apiFetch(`/api/events/${eventId}/rsvp`, {
      method: 'PUT',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'yes', party_size: partySize })
    });
    const data = await res.json();
    if (!data || !data.success) {
      showToast((data && data.message) || 'تعذّر تسجيل حضورك');
      return;
    }
    applyRsvpState(eventId, data);
    // «جاي» يضيف المناسبة إلى «قائمتي» على الخادم — وزرّها في الكرت يقول ذلك.
    applySavedState(eventId, true);
    showToast('تم تسجيل حضورك — وأُضيفت إلى قائمتك');
  } catch (e) {
    showToast('تعذّر تسجيل حضورك — تحقّق من الاتصال');
  }
}

/** المناسبة من أي قائمة يحملها العميل الآن — للورقة وصفحة المناسبة. */
function eventByIdFromClient(eventId) {
  return allEvents.find(e => e.id === eventId)
    || (eventPageEvent && eventPageEvent.id === eventId ? eventPageEvent : null);
}

/** ما تعرضه ورقة «اختر رسالة» الآن: المناسبة ورسائل نوعها. */
let messageSheetState = null;

/**
 * ورقة «اختر رسالة» (تذكرة #170، والقصة ٥٧): «بارك»/«عزّي» يفتحها، وتُبنى من
 * `messages` التي يرسلها الخادم مع أنواع المناسبات (النشِط وحده) — فلا نصّ
 * تهنئة مكتوب في هذا الملف. اختيار رسالة يفتح مسار التبريك القائم نفسه
 * (`openChatModal`) بنصّها في الحقل، فيبقى للمستخدم أن يعدّله أو يكتب غيره.
 */
async function openMessageSheet(eventId, occasionTypeId) {
  const state = { eventId, occasionTypeId: occasionTypeId || null, messages: [] };
  messageSheetState = state;
  const modal = document.getElementById('messageSheetModal');
  const list = document.getElementById('messageSheetList');
  const subtitle = document.getElementById('messageSheetSubtitle');
  if (!modal || !list) return;

  const evt = eventByIdFromClient(eventId);
  if (subtitle) subtitle.textContent = evt ? congratulationsLabel(evt) : '';
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  modal.style.display = 'flex';

  const messages = await occasionTypeMessages(occasionTypeId);
  if (messageSheetState !== state) return;
  state.messages = messages;
  if (!messages.length) {
    // نوع بلا رسالة نشِطة: الورقة لا تكون جداراً — «اكتب رسالتك» وحدها باب.
    list.innerHTML = '<p class="message-sheet-empty">لا توجد رسائل جاهزة لهذا النوع بعد — اكتب رسالتك بنفسك.</p>';
    return;
  }

  list.innerHTML = messages.map((message, index) => `
    <button type="button" class="message-sheet-option" onclick="pickReadyMessage(${index})">
      <i class="fa-regular fa-comment-dots" aria-hidden="true"></i>
      <span>${escapeHtml(message.body)}</span>
    </button>`).join('');
}

/** رسائل نوع واحد من الذاكرة المحمّلة (GET /api/occasion-types) — بلا نداء جديد. */
async function occasionTypeMessages(occasionTypeId) {
  if (!occasionTypeId) return [];
  try {
    const types = await loadOccasionTypes();
    const type = (types || []).find(t => Number(t.id) === Number(occasionTypeId));
    if (!type || !Array.isArray(type.messages)) return [];
    return type.messages.filter(message => message && message.body);
  } catch (e) {
    // انقطاع الشبكة لا يُسقط الزرّ: الورقة تبقى «اكتب رسالتك» كما هي.
    return [];
  }
}

function closeMessageSheet() {
  const modal = document.getElementById('messageSheetModal');
  if (modal) modal.style.display = 'none';
  messageSheetState = null;
}

/** اختيار رسالة جاهزة: تُغلق الورقة ويُفتح التبريك بنصّها في الحقل. */
function pickReadyMessage(index) {
  const state = messageSheetState;
  const message = state && state.messages ? state.messages[index] : null;
  if (!state || !message) return;
  const { eventId } = state;
  closeMessageSheet();
  openChatModal(eventId, { presetMessage: message.body });
}

/** «اكتب رسالتك بنفسك»: المسار القائم بلا نصّ مسبق. */
function openFreeMessageComposer() {
  const state = messageSheetState;
  if (!state) return;
  const { eventId } = state;
  closeMessageSheet();
  openChatModal(eventId);
}

/**
 * يحفظ الجواب على الخادم ثم يرسمه. `yes` ينشئ «ذكّرني» على الخادم أيضاً، فحالة
 * زرّ القائمة تُحدَّث هنا بنداء الجلب نفسه (`refreshEventPage`) بعد رسم فوري
 * يمنح الضغطة أثراً بلا انتظار.
 */
async function submitRsvp(response) {
  const eventId = eventPageEvent ? eventPageEvent.id : null;
  if (!eventId) return;
  if (!requireAuth({ type: 'rsvp', eventId, response })) return;

  const sizeEl = document.getElementById('rsvpPartySize');
  const partySize = response === 'no' ? 1 : (parseInt(sizeEl ? sizeEl.value : '1', 10) || 1);

  try {
    const res = await apiFetch(`/api/events/${eventId}/rsvp`, {
      method: 'PUT',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response, party_size: partySize })
    });
    const data = await res.json();
    if (!data || !data.success) {
      alert((data && data.message) || 'تعذر حفظ جوابك');
      return;
    }
    applyRsvpState(eventId, data);
    showToast(response === 'yes' ? 'سجّلنا حضورك — وستبقى المناسبة في قائمتك' : 'سجّلنا أنك مش جاي');
  } catch (e) {
    alert('تعذر حفظ جوابك — تحقق من الاتصال بالخادم');
  }
}

/** سحب الجواب — `DELETE` على المسار نفسه. لا يمسّ «ذكّرني» على الخادم. */
async function withdrawRsvp() {
  const eventId = eventPageEvent ? eventPageEvent.id : null;
  if (!eventId) return;
  try {
    const res = await apiFetch(`/api/events/${eventId}/rsvp`, { method: 'DELETE', auth: true });
    const data = await res.json();
    if (!data || !data.success) {
      alert((data && data.message) || 'تعذر سحب جوابك');
      return;
    }
    applyRsvpState(eventId, data);
    showToast('سُحب جوابك');
  } catch (e) {
    alert('تعذر سحب جوابك — تحقق من الاتصال بالخادم');
  }
}

/**
 * يوائم ما رجع من الخادم مع ما هو مرسوم: الجواب والعدّاد في صفحة المناسبة.
 * عدّاد غائب من الردّ يعني «النوع يخفيه»، فيُمحى المخزَّن بدل أن يبقى رقماً
 * قديماً على الشاشة. و«جاي» يُنشئ «ذكّرني» على الخادم، فحالة زرّ القائمة تُقرأ
 * من جديد (`refreshEventPage`) لا تُفترض.
 */
function applyRsvpState(eventId, payload) {
  const merge = evt => {
    if (!evt || evt.id !== eventId) return evt;
    const next = { ...evt, my_rsvp: payload.my_rsvp || null };
    if (payload.rsvp_going_count === undefined || payload.rsvp_going_count === null) {
      delete next.rsvp_going_count;
    } else {
      next.rsvp_going_count = payload.rsvp_going_count;
    }
    return next;
  };

  const feedIndex = allEvents.findIndex(e => e.id === eventId);
  // إعادة رسم التغذية لهذا الصفّ وحده — ولو لم تكن المناسبة في التغذية أصلاً
  // (رابط عميق أو إشعار قبل تحميلها) لا تُرسم قائمة فارغة مكانها.
  if (feedIndex !== -1) {
    allEvents[feedIndex] = merge(allEvents[feedIndex]);
    renderEvents(allEvents);
  }
  if (eventPageEvent && eventPageEvent.id === eventId) eventPageEvent = merge(eventPageEvent);
  if (isEventPageOpen() && eventPageEvent) renderEventPage(eventPageEvent);
  if (payload.my_rsvp && payload.my_rsvp.response === 'yes') refreshEventPage();
}

function renderEventPage(evt) {
  const body = document.getElementById('eventPageBody');
  if (!body) return;
  const isMourning = isMourningTone(evt);
  const toneColor = evt.occasion_type && evt.occasion_type.color
    ? (evt.occasion_type.color.startsWith('#') ? evt.occasion_type.color : `#${evt.occasion_type.color}`)
    : null;
  const page = document.getElementById('eventPage');
  if (page) {
    page.classList.toggle('tone-mourning', isMourning);
    if (toneColor) {
      page.style.setProperty('--tone', toneColor);
      page.style.setProperty('--tone-ink', readableInkOn(toneColor));
    } else {
      page.style.removeProperty('--tone');
      page.style.removeProperty('--tone-ink');
    }
  }

  const posterUrl = safeHttpUrl(evt.poster_url) ? evt.poster_url : null;
  const posterHtml = posterUrl ? `
    <button type="button" class="event-page-poster" onclick="openEventPagePoster()" aria-label="عرض الصورة كاملة">
      <img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(evt.title || '')}">
      <span class="event-page-poster-chip"><i class="fa-solid fa-expand" aria-hidden="true"></i> عرض كامل</span>
    </button>` : '';

  const honorees = Array.isArray(evt.honorees) && evt.honorees.length
    ? evt.honorees
    : (evt.groom_name ? [{ name: evt.groom_name }] : []);
  const honoreeLabel = typeFieldLabel(evt, 'honorees', 'أصحاب المناسبة');
  const honoreeRows = honorees.map(h => eventPageInfoRowHtml(
    'fa-regular fa-user',
    honoreeLabel,
    h.role ? `${h.name} (${h.role})` : h.name
  )).join('');

  const artistHtml = (typeShowsField(evt, 'artist_name') && evt.artist_name && String(evt.artist_name).trim()) ? `
    <div class="event-page-info-row event-page-artist">
      ${safeHttpUrl(evt.artist_image_url)
        ? `<img src="${escapeHtml(evt.artist_image_url)}" alt="" class="event-page-artist-img">`
        : '<i class="fa-solid fa-music" aria-hidden="true"></i>'}
      <div>
        <div class="event-page-info-label">${escapeHtml(typeFieldLabel(evt, 'artist_name', 'الفنان'))}</div>
        <div class="event-page-info-value">${escapeHtml(evt.artist_name)}</div>
      </div>
    </div>` : '';

  const placeValue = [eventPlaceName(evt), evt.location_name].filter(Boolean).join(' — ');
  const nav = eventNavUrls(evt);
  // زرّ الملاحة بجانب سطر القاعة/المكان (تذكرة #176): خرائط Google بالإحداثيات
  // حين توجد، وباسم المكان والبلدة حين تغيب — فهو لا يغيب عن مناسبة بلا دبّوس،
  // بخلاف زرّ Waze القديم في صفّ الأزرار أدناه.
  const navLinkHtml = `
    <a class="event-page-nav-link" href="${escapeHtml(nav.mapsUrl)}" target="_blank" rel="noopener" onclick="recordEventPageLocationClicked()">
      <i class="fa-solid fa-diamond-turn-right" aria-hidden="true"></i> الملاحة
    </a>`;
  const infoRows = [
    honoreeRows,
    eventPageInfoRowHtml('fa-solid fa-people-group', typeFieldLabel(evt, 'family_clan', 'العائلة'), evt.family_clan),
    artistHtml,
    eventPageInfoRowHtml('fa-solid fa-location-dot', typeFieldLabel(evt, 'location_name', 'المكان'), placeValue, navLinkHtml),
    typeShowsField(evt, 'secondary_location_name')
      ? eventPageInfoRowHtml('fa-solid fa-location-dot', typeFieldLabel(evt, 'secondary_location_name', 'مكان آخر'), evt.secondary_location_name) : '',
    eventPageInfoRowHtml('fa-regular fa-calendar', typeFieldLabel(evt, 'event_date', 'التاريخ'), formatEventDayLong(evt)),
    typeShowsField(evt, 'event_end_date') && evt.event_end_date
      ? eventPageInfoRowHtml('fa-regular fa-calendar', typeFieldLabel(evt, 'event_end_date', 'حتى'), formatEventDayLong({ event_date: evt.event_end_date })) : '',
    typeShowsField(evt, 'youth_party_date')
      ? eventPageInfoRowHtml('fa-solid fa-fire', typeFieldLabel(evt, 'youth_party_date', 'سهرة الشباب والدحة'),
        evt.youth_party_date ? formatEventDayLong({ event_date: evt.youth_party_date }) : '') : '',
    eventProgramHtml(evt),
    typeShowsField(evt, 'dinner_time')
      ? eventPageInfoRowHtml('fa-regular fa-clock', typeFieldLabel(evt, 'dinner_time', 'طعام العشاء'), evt.dinner_time) : ''
  ].join('');

  const subtitle = eventCardSubtitle(evt);
  const { wazeUrl, mapsUrl } = nav;
  const phoneDigits = evt.host_phone ? String(evt.host_phone).replace(/[^\d]/g, '') : '';
  const contactHtml = phoneDigits ? `
      <a href="tel:${phoneDigits}" class="event-page-btn" onclick="recordEventPageContactClicked()">
        <i class="fa-solid fa-phone" aria-hidden="true"></i> اتصال
      </a>
      <a href="https://wa.me/972${phoneDigits.replace(/^0/, '')}" target="_blank" rel="noopener" class="event-page-btn" onclick="recordEventPageContactClicked()">
        <i class="fa-brands fa-whatsapp" aria-hidden="true"></i> واتساب المعلن
      </a>` : '';

  const label = congratulationsLabel(evt);
  // بطاقة الدعوة (#180) — لصاحب المناسبة وحده: زرّ التصميم، وبجانبه رفع
  // البطاقة الجاهزة (رفع الملصق القائم نفسه). `myEventsCache` يعرف مناسبات
  // الحساب، فلا يُرسم الزرّ لزائر أو لصاحب مناسبة أخرى.
  const ownsEvent = myEventsCache.some(own => own.id === evt.id);
  const cardStudioHtml = ownsEvent ? `
      <div class="event-page-btn-row">
        <button type="button" class="event-page-btn" onclick="openCardStudio(${evt.id})">
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> صمّم بطاقة
        </button>
        <button type="button" class="event-page-btn" onclick="triggerReadyCardUpload(${evt.id})">
          <i class="fa-solid fa-upload" aria-hidden="true"></i> ارفع بطاقتك الجاهزة
        </button>
      </div>` : '';
  const congrats = Array.isArray(evt.congratulations) ? evt.congratulations : null;
  let congratsListHtml;
  if (!congrats) {
    congratsListHtml = '<div class="loading-spinner"><div class="spinner"></div></div>';
  } else if (!congrats.length) {
    congratsListHtml = `<p class="event-page-empty">${escapeHtml(isMourning ? `كن أول من يضيف ${label}` : `كن أول من يضيف ${label} 🌹`)}</p>`;
  } else {
    congratsListHtml = congrats.map(c => `
      <div class="chat-bubble">
        <div class="chat-bubble-header">
          <span class="sender-name">${escapeHtml(c.sender_name)}</span>
          ${c.badge_title ? `<span class="sender-badge">${escapeHtml(c.badge_title)}</span>` : ''}
          ${c.status === 'pending' ? '<span class="status-tag pending">قيد المراجعة</span>' : ''}
        </div>
        <div class="chat-msg-text">${escapeHtml(c.message)}</div>
        ${c.status !== 'pending' ? `
          <button class="nokoot-del-btn" style="margin-top:6px;" onclick="reportCongratulation(${evt.id}, ${c.id}, this)">
            <i class="fa-solid fa-flag"></i> إبلاغ
          </button>` : ''}
      </div>`).join('');
  }

  body.innerHTML = `
    ${posterHtml}
    <div class="event-page-content">
      ${evt.occasion_type ? `<div class="event-page-type">${occasionTypeBadgeHtml(evt.occasion_type)}</div>` : ''}
      <h2 id="eventPageTitle" class="event-page-title">${escapeHtml(eventCardHeadline(evt))}</h2>
      ${subtitle ? `<div class="event-page-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      <div class="event-page-info">${infoRows}</div>
      ${renderEventAudioBlockHtml(evt)}
      <div class="nav-buttons-row">
        <a href="${wazeUrl}" target="_blank" rel="noopener" class="waze-btn" onclick="recordEventPageLocationClicked()">
          <i class="fa-brands fa-waze" aria-hidden="true"></i> اذهب بـ Waze
        </a>
        <a href="${mapsUrl}" target="_blank" rel="noopener" class="maps-btn" onclick="recordEventPageLocationClicked()">
          <i class="fa-solid fa-location-arrow" aria-hidden="true"></i> خرائط Google
        </a>
      </div>
      ${contactHtml ? `<div class="event-page-btn-row">${contactHtml}</div>` : ''}
      ${eventCalendarEligible(evt) ? `
      <a href="${escapeHtml(eventCalendarUrl(evt))}" class="event-page-btn event-page-share-btn">
        <i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> أضف إلى تقويم الهاتف
      </a>` : ''}
      <button type="button" class="event-page-btn event-page-share-btn" onclick="shareEvent(eventPageEvent)">
        <i class="fa-solid fa-share-nodes" aria-hidden="true"></i> ${escapeHtml(shareButtonLabel(evt))}
      </button>
      <button type="button" class="event-page-btn" onclick="downloadEventImage(${evt.id})">
        <i class="fa-solid fa-download" aria-hidden="true"></i> نزّل الصورة
      </button>
      ${cardStudioHtml}
      <div class="event-page-btn-row">
        ${!evt.status || evt.status === 'approved' ? renderReminderButtonHtml(evt) : ''}
        <button type="button" class="record-nokoot-btn card-action-btn" onclick="recordNokootFromEventPage()">
          <i class="fa-solid fa-wallet" aria-hidden="true"></i> <span>تسجيل نقوط</span>
        </button>
      </div>
      ${renderEventRsvpHtml(evt, { isMourning })}
      ${renderEventCountersHtml(evt, { isMourning })}
      ${renderEventAlbumsHtml(evt)}
      <section id="eventPageArchive" class="event-archive" hidden></section>
      ${renderReactionBarHtml(evt)}
      <div class="event-page-congrats-head">
        <h3>${escapeHtml(label)} <span class="event-page-count">(${congrats ? congrats.length : (evt.congratulations_count || 0)})</span></h3>
        <button type="button" class="chat-trigger-btn" onclick="openChatModal(${evt.id})">
          <i class="fa-regular fa-comment-dots" aria-hidden="true"></i> أضف ${escapeHtml(label)}
        </button>
      </div>
      <div class="event-page-congrats">${congratsListHtml}</div>
    </div>`;

  renderEventArchive(evt, 'eventPageArchive');
  syncAudioUi();
}

/**
 * عدّادات صفحة المناسبة العلنية (تذكرة #170، والقصة ٥٦): «مهتمين» و«تبريكات»
 * — و«جايين» في رأس صندوق تأكيد الحضور أعلاه، حيث تعيش أعلامه. كلٌّ يُرسم حين
 * يصل حقلُه في الردّ وحده (`interested_count`، و`congratulations_count`).
 * **الحقل الغائب يعني «النوع أطفأه»**، لا صفراً: عدّاد مخفيّ يُرسم صفراً كذبٌ
 * عن المناسبة — وهي القاعدة التي يطبّقها الخادم في `attachReminderState`
 * و`congratulationsCountVisible`.
 *
 * **ولا عدّاد على العزاء**: «العزاء لا أزرار ولا عدّادات» (#146 المرحلة ٢)،
 * والحجب هنا حتى لو وصل حقل — العزاء قرار النغمة لا مجموع الأعلام.
 */
function renderEventCountersHtml(evt, { isMourning = false } = {}) {
  if (isMourning) return '';

  const counters = [
    evt.interested_count != null
      ? { key: 'interested', icon: 'fa-solid fa-heart', label: 'مهتمين', value: evt.interested_count }
      : null,
    evt.congratulations_count != null
      ? { key: 'congratulations', icon: 'fa-regular fa-comment-dots', label: congratulationsLabel(evt), value: evt.congratulations_count }
      : null
  ].filter(Boolean);

  if (!counters.length) return '';
  return `
      <div class="event-page-counters">
        ${counters.map(counter => `
          <div class="event-page-counter" data-counter="${counter.key}">
            <i class="${counter.icon}" aria-hidden="true"></i>
            <span class="event-page-counter-value">${Number(counter.value) || 0}</span>
            <span class="event-page-counter-label">${escapeHtml(counter.label)}</span>
          </div>`).join('')}
      </div>`;
}

/** أيقونة ولون نوع المناسبة من الخادم كما هما — لا لون جديد يُصمَّم هنا (#20 step 10). */
function occasionTypeBadgeHtml(occasionType) {
  if (!occasionType) return '';
  const color = occasionType.color && occasionType.color.startsWith('#') ? occasionType.color : (occasionType.color ? `#${occasionType.color}` : null);
  const style = color ? `style="background:${color}26; color:${color}; border-color:${color};"` : '';
  return `<span class="town-badge" ${style}>${occasionType.icon ? escapeHtml(occasionType.icon) + ' ' : ''}${escapeHtml(occasionType.name)}</span>`;
}

/**
 * «ذكّرني ♥» / «في قائمتي» — زرّ واحد لمتابعة «ذكّرني» (قرار المالك: قائمة
 * واحدة، لا زرّ حفظ وزرّ تنبيه). is-saved يجعل الحالة النشِطة تُقرأ بالعين،
 * والقلب (الفراغ/الملء) يفرّق بينهما بلا نصّ إضافي — والقلب هو ما تسمّيه
 * المواصفة «ذكّرني ♥» (تذكرة #170).
 *
 * `compact` لكرت التغذية وحده: صفّه أزرار متساوية، و«أضف لقائمتي» تفيض منه على
 * زرّ المشاركة عند 375px. الكلمة القصيرة هناك («ذكّرني» ثم «محفوظة»)، والاسم
 * الكامل في aria-label لقارئ الشاشة — وصفحة المناسبة (رحبة) تبقى على النصّ
 * الكامل.
 */
function renderReminderButtonHtml(evt, { compact = false } = {}) {
  const isSaved = !!evt.is_reminded;
  const fullLabel = isSaved ? 'في قائمتي' : 'أضف لقائمتي';
  const label = compact ? (isSaved ? 'محفوظة' : 'ذكّرني') : fullLabel;
  const aria = compact ? ` aria-label="${fullLabel}"` : '';
  return `
    <button class="record-nokoot-btn card-action-btn reminder-btn${isSaved ? ' is-saved' : ''}"${aria} onclick="toggleReminder(${evt.id}, ${isSaved}, this)">
      <i class="fa-${isSaved ? 'solid' : 'regular'} fa-heart"></i> <span>${label}</span>
    </button>`;
}

/**
 * «قلب متحرّك حين أضغط ذكّرني» (القصة ٥٥): الصنف يُعاد إضافته بعد حذفه، لأن
 * إعادة الإضافة وحدها لا تعيد تشغيل الرسم المتحرّك — وقراءة `offsetWidth`
 * تُجبر المتصفّح على تثبيت الحالة الأولى قبل الثانية. بلا JS آخر: الرسم كله
 * في `styles.css` (`@keyframes heart-pop`)، ومن يفضّل تقليل الحركة يُطفئه
 * بـ`prefers-reduced-motion` هناك.
 */
function playHeartPop(btn) {
  if (!btn || !btn.classList) return;
  btn.classList.remove('heart-pop');
  void btn.offsetWidth;
  btn.classList.add('heart-pop');
}

/**
 * أزرار «ذكّرني» المرسومة الآن لهذه المناسبة. `applySavedState` يعيد رسم
 * الكرت/الصفحة، فالعنصر الذي وقعت عليه الضغطة يصير منفصلاً عن المستند —
 * والنبض يُطلَق على الزرّ الجديد المرسوم فعلاً.
 */
function reminderButtonsFor(eventId) {
  const buttons = Array.from(document.querySelectorAll(`#eventCard-${eventId} .reminder-btn, #announcementCard-${eventId} .reminder-btn, .featured-event-card[data-event-id="${eventId}"] .reminder-btn`));
  if (isEventPageOpen() && eventPageEvent && eventPageEvent.id === eventId) {
    buttons.push(...document.querySelectorAll('#eventPageBody .reminder-btn'));
  }
  return buttons;
}

/**
 * يوائم حالة «محفوظ» الظاهرة بعد نجاح أي فعل يغيّرها على الخادم: صفّ التغذية
 * المخزَّن (allEvents) وصفحة المناسبة المفتوحة إن كانت هي نفسها. `followers_count`
 * لا يُلمَس — عدّاد المتابعين ليس من شأن هذا الفعل، ولا يُعاد اشتقاقه هنا.
 * كل مسارات التغيير (toggleReminder، الإزالة، و«تراجع») تمرّ من هنا؛ بلا ذلك
 * بقي كرت التغذية يقول «في قائمتي» بعد الإزالة حتى إعادة تحميل الصفحة، وضغطه
 * حينها يرسل الطريقة الخطأ.
 */
function applySavedState(eventId, isSaved) {
  const evt = allEvents.find(e => e.id === eventId);
  if (evt) evt.is_reminded = isSaved;
  renderEvents(allEvents);
  if (isEventPageOpen() && eventPageEvent && eventPageEvent.id === eventId) {
    eventPageEvent = { ...eventPageEvent, is_reminded: isSaved };
    renderEventPage(eventPageEvent);
  }
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
      applySavedState(eventId, !isReminded);
      // بطاقات «الأعراس المميزة» خارج `allEvents`، فلا يعيد `applySavedState`
      // رسمها — حالتها تُزامَن هنا كي لا يبقى القلب فارغاً بعد الإضافة.
      syncFeaturedReminderState(eventId, !isReminded);
      // القلب ينبض عند الإضافة وحدها — هو «ذكّرني ♥» في المواصفة، والإزالة
      // ليست لحظة قلب.
      if (!isReminded) reminderButtonsFor(eventId).forEach(playHeartPop);
      // الإضافة تحمل فعل «عرض» يوصل التبويب الجديد مباشرةً — بدونه يبقى
      // المستخدم لا يعرف أين ذهبت المناسبة (التوست يمرّ في ٣.٥ ثانية).
      showToast(
        isReminded ? 'أُزيلت من قائمتي' : 'أُضيفت إلى قائمتي',
        isReminded ? null : { label: 'عرض', onClick: () => switchTab('tabMyList') }
      );
      // طلب إذن الإشعارات الفورية عند إضافة تذكير فقط — لا عند أول فتح للموقع ولا عند إلغائه (قصة 16)
      if (!isReminded) {
        recordAnalyticsEvent('reminder_clicked', { contentTown: evt ? evt.town : undefined });
        requestPushNotificationSubscription();
      }
      // القائمة المخزَّنة تُحدَّث بعد النجاح فقط إن كانت محمَّلة أصلاً — لا نداء
      // لم يطلبه أحد؛ والشارة تُحدَّث من داخلها.
      if (myListData) loadMyList();
    } else {
      alert(data.message || 'تعذر تنفيذ الطلب');
    }
  } catch (e) {
    alert('تعذر تنفيذ الطلب — تحقق من الاتصال بالخادم');
  } finally {
    if (btnElement) btnElement.disabled = false;
  }
}

// «قائمتي» — ترتيب الأقسام هو ترتيب الخادم نفسه (myListBucket: الأقرب أولاً،
// ثم ما انتهى حديثاً)، والعميل يرسم ولا يعيد الاشتقاق. الدلوان الأخيران
// «منتهيان» في عدّ counts ورقاقتها.
const MY_LIST_UPCOMING_BUCKETS = ['now', 'tomorrow', 'this_week', 'later'];
const MY_LIST_ENDED_BUCKETS = ['ended_recent', 'ended'];
const MY_LIST_BUCKET_ORDER = ['now', 'tomorrow', 'this_week', 'later', 'ended_recent', 'ended'];
const MY_LIST_BUCKET_TITLES = {
  now: 'اليوم',
  tomorrow: 'غداً',
  this_week: 'هذا الأسبوع',
  later: 'لاحقاً',
  ended_recent: 'انتهت خلال الأسبوع الأخير',
  ended: 'انتهت سابقاً'
};

/** عند الإقلاع: جلسة محفوظة تُحمَّل لها القائمة فوراً كي تكون الشارة صحيحة بلا فتح التبويب. */
function initMyList() {
  if (currentUser && authToken) loadMyList();
}

/** خروج أو انتهاء جلسة: القائمة المخزَّنة لم تعد لهذا الحساب، فتُمحى وشارتها معها. */
function clearMyList() {
  myListData = null;
  myListEndedExpanded = false;
  updateMyListNavBadge();
}

/**
 * شارة التبويب: عدد مناسبات اليوم الجارية (bucket 'now') وحده — هي وحدها ما
 * يستحقّ لفتة عين. تُخفى حين صفر أو حين لا جلسة، لا تظهر «0» أبداً.
 *
 * وبعد أن صارت «قائمتي» بطاقةً داخل «حسابي» بدل وجهة في الشريط، الشارة على
 * «حسابي» وعدّاد البطاقة يُكتبان من هنا معاً — رقم واحد في مكانين لا يجوز أن
 * يختلفا، فمصدرهما هذا الموضع الوحيد.
 */
function updateMyListNavBadge() {
  const todayCount = (currentUser && authToken && myListData && Array.isArray(myListData.events))
    ? myListData.events.filter(evt => evt.bucket === 'now').length
    : 0;
  const countText = todayCount > 0 ? (todayCount > 99 ? '99+' : String(todayCount)) : '';

  const accountCount = document.getElementById('accountMyListTodayCount');
  if (accountCount) {
    accountCount.textContent = countText;
    accountCount.hidden = todayCount <= 0;
  }

  const badge = document.getElementById('myListNavBadge');
  if (!badge) return;
  badge.textContent = countText;
  badge.hidden = todayCount <= 0;
}

/** يقرّر ما يراه زائر التبويب: بطاقة الدخول لغير المسجَّل، وصفحة «مناسباتي» للمسجَّل. */
function loadMyListView() {
  const lockedView = document.getElementById('myListLockedView');
  const unlockedView = document.getElementById('myListUnlockedView');
  if (!lockedView || !unlockedView) return;

  if (!currentUser || !authToken) {
    lockedView.style.display = 'block';
    unlockedView.style.display = 'none';
    return;
  }

  lockedView.style.display = 'none';
  unlockedView.style.display = 'block';
  fetchMyEvents();
  loadMyList();
  loadSavedProviders();
}

/**
 * جلب «قائمتي» وتخزينها في myListData ثم رسمها. لا شاشة فارغة في أي حال:
 * قبل أول استجابة دوّارة، وعند الفشل رسالة عربية وزرّ إعادة محاولة.
 */
async function loadMyList() {
  if (!currentUser || !authToken) return;
  const bodyEl = document.getElementById('myListBody');
  if (!myListData && bodyEl) {
    bodyEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  }

  try {
    const res = await apiFetch('/api/my-reminders', { auth: true });
    const data = await res.json();
    if (!data || !data.success || !Array.isArray(data.events)) throw new Error('bad my-reminders response');

    myListData = {
      events: data.events,
      counts: data.counts || { all: data.events.length, upcoming: 0, ended: 0 },
      under_review_count: Number(data.under_review_count) || 0
    };
    renderMyList();
    updateMyListNavBadge();
  } catch (e) {
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="empty-state my-list-empty">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <p>تعذّر تحميل قائمتك — تحقّق من الاتصال</p>
          <button type="button" class="gold-action-btn" onclick="loadMyList()"><i class="fa-solid fa-rotate-right"></i> إعادة المحاولة</button>
        </div>`;
    }
    updateMyListNavBadge();
  }
}

/**
 * «مزوّدون محفوظون» في «قائمتي» (تذكرة #185): يقرأ GET /api/services/favorites
 * لصاحب الحساب وحده. القسم يختفي كاملاً بلا محفوظات — لا عنوان لقسم فارغ —
 * وفشل الجلب لا يُسقط «قائمتي»: يختفي القسم ويبقى ما سواه كما هو.
 */
async function loadSavedProviders() {
  if (!currentUser || !authToken) {
    savedProvidersCache = [];
    renderSavedProviders();
    return;
  }
  try {
    const res = await apiFetch('/api/services/favorites', { auth: true });
    const data = await res.json();
    if (!res.ok || !data || !data.success || !Array.isArray(data.providers)) {
      throw new Error('bad favorites response');
    }
    savedProvidersCache = data.providers;
  } catch (e) {
    savedProvidersCache = [];
  }
  renderSavedProviders();
}

/** بطاقات المزوّدين المحفوظين — شكل بطاقة القائمة نفسه، وبلا وجهة جديدة في الشريط. */
function renderSavedProviders() {
  const section = document.getElementById('myListSavedProviders');
  const list = document.getElementById('myListSavedProvidersList');
  if (!section || !list) return;
  if (!savedProvidersCache.length) {
    list.innerHTML = '';
    section.hidden = true;
    return;
  }
  list.innerHTML = savedProvidersCache
    .map(provider => renderCompactServiceRowHtml(provider, {
      // معرّفات مختلفة عن بطاقة تبويب الخدمات: الصفحتان تعيشان في DOM واحد،
      // وتكرار `id` يجعل `getElementById` يصيب بطاقة التبويب الأخرى.
      rowId: `myListProviderRow-${provider.id}`,
      statsId: `myListProviderStats-${provider.id}`
    }))
    .join('');
  section.hidden = false;
}

/** الصفوف الظاهرة تحت الرقاقة المختارة — فلترة عميل بحتة على bucket القادم من الخادم. */
function myListVisibleEvents() {
  const events = (myListData && myListData.events) || [];
  if (myListChip === 'upcoming') return events.filter(evt => MY_LIST_UPCOMING_BUCKETS.indexOf(evt.bucket) !== -1);
  if (myListChip === 'ended') return events.filter(evt => MY_LIST_ENDED_BUCKETS.indexOf(evt.bucket) !== -1);
  return events;
}

/** حالة فارغة لكل رقاقة بنصّها — «قائمتك فارغة» ليست رسالة «لا مناسبات منتهية». */
function myListEmptyStateHtml() {
  if (myListChip === 'upcoming') {
    return `
      <div class="empty-state my-list-empty">
        <i class="fa-solid fa-calendar-check"></i>
        <p>لا مناسبات قادمة في قائمتك</p>
      </div>`;
  }
  if (myListChip === 'ended') {
    return `
      <div class="empty-state my-list-empty">
        <i class="fa-solid fa-box-archive"></i>
        <p>لا مناسبات منتهية في قائمتك</p>
      </div>`;
  }
  return `
    <div class="empty-state my-list-empty">
      <i class="fa-solid fa-bookmark"></i>
      <p>قائمتك فارغة. اضغط «أضف لقائمتي» على أي مناسبة لتجدها هنا.</p>
      <button type="button" class="gold-action-btn" onclick="switchTab('tabHome')"><i class="fa-solid fa-champagne-glasses"></i> تصفّح المناسبات</button>
    </div>`;
}

/**
 * شارة حالة الصف: «جارية اليوم»/«غداً»/«بعد N أيام» للقادم، و«انتهت» للمنتهي.
 * نوع وقور (عزاء) لا يحمل أي عدّ ولا احتفال — نعيٌ وعدّاد يومه إساءة،
 * فلا شارة له إطلاقاً، والسطر بتاريخه يكفي.
 */
function myListStatusPillHtml(evt) {
  if (isMourningTone(evt)) return '';
  if (MY_LIST_ENDED_BUCKETS.indexOf(evt.bucket) !== -1) {
    return '<span class="my-list-status-pill is-ended">انتهت</span>';
  }
  if (evt.bucket === 'now') return '<span class="my-list-status-pill is-now">جارية اليوم</span>';
  if (evt.bucket === 'tomorrow') return '<span class="my-list-status-pill">غداً</span>';
  return `<span class="my-list-status-pill">بعد ${Number(evt.days_until_start) || 0} أيام</span>`;
}

/** نصّ تاريخ الإعلان بصيغة الصفّ نفسها («١ ديسمبر ٢٠٢٧») — والقيمة الخام كما هي إن لم تكن تاريخاً صالحاً. */
function formatMyListDateValue(value) {
  const raw = String(value == null ? '' : value).trim();
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!parts) return raw;
  // التاريخ الذي يعيد تركيبه المتصفّح هو نفسه فقط إن كان يوماً حقيقياً؛
  // «2027-02-30» يمرّ من الشكل ويسقط هنا فيبقى خاماً بدل أن ينزاح إلى آذار.
  const date = eventDayDate({ event_date: raw });
  const sameDay = date.getFullYear() === Number(parts[1])
    && date.getMonth() === Number(parts[2]) - 1
    && date.getDate() === Number(parts[3]);
  return sameDay ? formatEventDayLong({ event_date: raw }) : raw;
}

/**
 * «تغيّر الموعد» — إعلان تعديل تاريخ نُشر بعد حفظ المستخدم للمناسبة (الخادم
 * يقصّ كل إعلان أقدم من الحفظ). التفصيل في title لا في نصّ الشارة.
 */
function myListChangePillHtml(evt) {
  if (!evt.date_change) return '';
  const from = formatMyListDateValue(evt.date_change.old_value);
  const to = formatMyListDateValue(evt.date_change.new_value);
  const detail = `من ${from} إلى ${to}`;
  return `<span class="my-list-change-pill" title="${escapeHtml(detail)}"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> تغيّر الموعد</span>`;
}

/** «سجّل نقوطك» من صفّ منتهٍ — نفس quickRecordNokoot القائمة، باسم أول صاحب مناسبة. */
function quickRecordNokootFromMyList(eventId) {
  const evt = ((myListData && myListData.events) || []).find(e => e.id === eventId);
  if (!evt) return;
  quickRecordNokoot(eventHonoreeNames(evt)[0] || evt.groom_name || '', evt.span_end, evt.town || '');
}

/** صفّ مضغوط: مصغّرة، وشارة النوع، والعنوان، وسطر تاريخ وبلدة، والحالة، وأفعاله. */
function renderMyListRowHtml(evt) {
  const ended = MY_LIST_ENDED_BUCKETS.indexOf(evt.bucket) !== -1;
  const media = evt.poster_url
    ? `<img src="${escapeHtml(evt.poster_url)}" alt="" class="my-list-row-img" loading="lazy">`
    : `<div class="my-list-row-img my-list-row-img-empty"><i class="fa-solid ${isMourningTone(evt) ? 'fa-dove' : 'fa-champagne-glasses'}" aria-hidden="true"></i></div>`;
  const metaLine = [formatEventDayLong(evt), evt.town].filter(Boolean).map(escapeHtml).join(' · ');

  // المنتهي لا جرس له (لا تذكير لما مضى) بل زرّ تسجيل نقوط — وهو الفعل
  // الوحيد المعقول بعد انتهاء المناسبة.
  const actionHtml = ended
    ? `<button type="button" class="my-list-nokoot-btn" onclick="quickRecordNokootFromMyList(${evt.id})">
         <i class="fa-solid fa-wallet" aria-hidden="true"></i> <span>سجّل نقوطك</span>
       </button>`
    : `<button type="button" class="my-list-icon-btn my-list-bell-btn${evt.notify ? '' : ' is-muted'}" onclick="setMyListNotify(${evt.id}, ${evt.notify ? 'false' : 'true'}, this)" aria-label="${evt.notify ? 'كتم التنبيه' : 'تفعيل التنبيه'}" title="${evt.notify ? 'كتم التنبيه' : 'تفعيل التنبيه'}">
         <i class="fa-solid ${evt.notify ? 'fa-bell' : 'fa-bell-slash'}" aria-hidden="true"></i>
       </button>`;

  return `
    <div class="my-list-row${ended ? ' is-ended' : ''}" data-event-id="${evt.id}">
      <div class="my-list-row-body" onclick="openEventPage(${evt.id})">
        ${media}
        <div class="my-list-row-main">
          <div class="my-list-row-top">
            ${occasionTypeBadgeHtml(evt.occasion_type)}
            ${myListStatusPillHtml(evt)}
            ${myListChangePillHtml(evt)}
          </div>
          <h4 class="my-list-row-title">${escapeHtml(eventCardHeadline(evt))}</h4>
          <div class="my-list-row-meta">${metaLine}</div>
        </div>
      </div>
      <div class="my-list-row-actions">
        ${actionHtml}
        <button type="button" class="my-list-icon-btn my-list-remove-btn" onclick="removeFromMyList(${evt.id}, this)" aria-label="إزالة من قائمتي" title="إزالة من قائمتي">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    </div>`;
}

/**
 * يرسم الرقاقات والأقسام والصفوف من myListData المخزَّنة. ترويسة لكل دلو فيه
 * صفوف ظاهرة، بترتيب الخادم؛ و«انتهت سابقاً» آخرها ومطويّة افتراضياً خلف زرّ
 * يحمل عدّها.
 */
function renderMyList() {
  if (!myListData) return;
  const chipsEl = document.getElementById('myListChips');
  const bodyEl = document.getElementById('myListBody');
  if (!bodyEl) return;

  const counts = myListData.counts || { all: 0, upcoming: 0, ended: 0 };

  if (chipsEl) {
    chipsEl.innerHTML = [
      { key: 'all', label: `الكل (${counts.all})` },
      { key: 'upcoming', label: `القادمة (${counts.upcoming})` },
      { key: 'ended', label: `انتهت (${counts.ended})` }
    ].map(chip => `
      <button type="button" class="filter-chip my-list-chip${myListChip === chip.key ? ' active' : ''}" onclick="setMyListChip('${chip.key}')">${chip.label}</button>`).join('');
  }

  const countEl = document.getElementById('myListCount');
  if (countEl) countEl.textContent = String(counts.all);

  // «نظّف المنتهية» لا معنى لها بلا منتهٍ واحد.
  const clearBtn = document.getElementById('myListClearEndedBtn');
  if (clearBtn) clearBtn.hidden = !(Number(counts.ended) > 0);

  const notice = document.getElementById('myListUnderReview');
  if (notice) {
    const pending = Number(myListData.under_review_count) || 0;
    notice.hidden = pending <= 0;
    notice.textContent = pending === 1
      ? 'مناسبة واحدة من قائمتك قيد المراجعة بعد تعديل، وستعود عند اعتمادها'
      : `${pending} مناسبات من قائمتك قيد المراجعة بعد تعديل، وستعود عند اعتمادها`;
  }

  const visible = myListVisibleEvents();
  if (!visible.length) {
    bodyEl.innerHTML = myListEmptyStateHtml();
    return;
  }

  bodyEl.innerHTML = MY_LIST_BUCKET_ORDER.map(bucket => {
    const rows = visible.filter(evt => evt.bucket === bucket);
    if (!rows.length) return '';
    const collapsed = bucket === 'ended' && !myListEndedExpanded;
    const head = bucket === 'ended'
      ? `<button type="button" class="my-list-bucket-head my-list-bucket-toggle" onclick="toggleMyListEnded()" aria-expanded="${myListEndedExpanded ? 'true' : 'false'}">
           <i class="fa-solid fa-chevron-${myListEndedExpanded ? 'up' : 'down'}" aria-hidden="true"></i> ${MY_LIST_BUCKET_TITLES[bucket]} (${rows.length})
         </button>`
      : `<h3 class="my-list-bucket-head">${MY_LIST_BUCKET_TITLES[bucket]}</h3>`;
    return `<section class="my-list-section" data-bucket="${bucket}">${head}${collapsed ? '' : rows.map(renderMyListRowHtml).join('')}</section>`;
  }).join('');
}

function setMyListChip(chip) {
  myListChip = chip;
  renderMyList();
}

function toggleMyListEnded() {
  myListEndedExpanded = !myListEndedExpanded;
  renderMyList();
}

/** كتم/تفعيل جرس مناسبة في قائمتي عبر PATCH — تبقى في القائمة، فقط لا تُنبّه. */
async function setMyListNotify(eventId, notify, btnElement) {
  if (btnElement) btnElement.disabled = true;
  try {
    const res = await apiFetch(`/api/events/${eventId}/remind`, {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notify })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || (notify ? 'تم تفعيل التنبيه' : 'تم كتم التنبيه'));
      await loadMyList();
    } else {
      alert(data.message || 'تعذّر تغيير التنبيه');
    }
  } catch (e) {
    alert('تعذّر تغيير التنبيه — تحقّق من الاتصال');
  } finally {
    if (btnElement) btnElement.disabled = false;
  }
}

/** إزالة صفّ من قائمتي، مع «تراجع» يعيد الإضافة نفسها ثم يعيد الجلب. */
async function removeFromMyList(eventId, btnElement) {
  if (btnElement) btnElement.disabled = true;
  try {
    const res = await apiFetch(`/api/events/${eventId}/remind`, { method: 'DELETE', auth: true });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'تعذّر حذف المناسبة من قائمتك');
      return;
    }
    // التغذية وصفحة المناسبة تُوائم قبل إعادة الجلب: الإزالة من «قائمتي» تغيير
    // حالة حفظ كأي زرّ «في قائمتي» في التغذية، لا حذفاً للمناسبة نفسها.
    applySavedState(eventId, false);
    showToast('أُزيلت من قائمتي', {
      label: 'تراجع',
      onClick: async () => {
        try {
          const undoRes = await apiFetch(`/api/events/${eventId}/remind`, { method: 'POST', auth: true });
          const undoData = await undoRes.json();
          if (!undoRes.ok || !undoData.success) throw new Error('undo failed');
          applySavedState(eventId, true);
        } catch (e) {
          alert('تعذّر إرجاع المناسبة إلى قائمتك');
        } finally {
          // مهما كانت النتيجة، القائمة المخزَّنة هي الحكم — لا شارة ولا صفّ يسبقها.
          loadMyList();
        }
      }
    });
    await loadMyList();
  } catch (e) {
    alert('تعذّر حذف المناسبة — تحقّق من الاتصال');
  } finally {
    if (btnElement) btnElement.disabled = false;
  }
}

/** «نظّف المنتهية» — حذف كل ما انتهى من قائمتي، مؤكَّد قبل الإرسال لأنه بلا رجعة. */
async function clearEndedMyList() {
  if (!confirm('حذف كل المناسبات المنتهية من قائمتك؟')) return;
  try {
    const res = await apiFetch('/api/my-reminders?scope=ended', { method: 'DELETE', auth: true });
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(data.message || 'تعذّر حذف المناسبات المنتهية');
      return;
    }
    // ما حُذف على الخادم يخرج أيضاً من كرت التغذية ومن صفحة المناسبة المفتوحة:
    // لا كرت يقول «في قائمتي» لمناسبة لم تعد في القائمة.
    ((myListData && myListData.events) || []).forEach(evt => {
      if (MY_LIST_ENDED_BUCKETS.indexOf(evt.bucket) !== -1) applySavedState(evt.id, false);
    });
    myListEndedExpanded = false;
    showToast(data.message || 'تم حذف المناسبات المنتهية من قائمتك');
    await loadMyList();
  } catch (e) {
    alert('تعذّر حذف المناسبات المنتهية — تحقّق من الاتصال');
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
async function initLeafletMap({ focusRegion = false } = {}) {
  const mapElement = document.getElementById('negevEventsMap');
  if (!mapElement) return;

  // ضمان وصول محافظات GET /api/towns قبل اختيار المركز: تبويب الخريطة قد
  // يُفتح قبل انتهاء طلب الإقلاع، والمركز يأتي من `regions` لا من ثابت.
  await loadTownCoordinates();

  // مركز المحافظة الفعّالة وتكبيرها من `regions` في GET /api/towns — العنوان
  // صار «خريطة أفراح منطقتك» فلا يفتح المركز على النقب الثابت بعد تبديل
  // المحافظة (#124). بلا محافظة (قبل وصول القائمة/فشلها) يُبقى الاحتياط.
  const region = activeRegion();
  const center = region ? [region.latitude, region.longitude] : NEGEV_NEUTRAL_CENTER;
  const zoom = region ? region.map_zoom : 10;

  if (!leafletMap) {
    leafletMap = L.map('negevEventsMap').setView(center, zoom);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(leafletMap);
  } else if (focusRegion) {
    // تبديل المحافظة يعيد تمركز الخريطة على محافظتها الجديدة، ولو كانت
    // مفتوحة على مركز محافظة سابقة.
    leafletMap.setView(center, zoom);
  }

  // كل استدعاء يبدأ بلا دبابيس (#124): زرّ «تحديث» وتبديل المحافظة يستدعيان
  // هذه الدالة نفسها، وترك العلامات القديمة يراكم دبابيس مكرّرة.
  clearMapMarkers();

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

        const marker = L.marker([pt.latitude, pt.longitude], { icon: customIcon })
          .addTo(leafletMap)
          .bindPopup(`
            <div class="map-popup">
              <h4>${escapeHtml(pt.title)}</h4>
              <p><strong>البلدة:</strong> ${escapeHtml(pt.town)}</p>
              <p><strong>التاريخ:</strong> ${pt.event_date}</p>
              <a href="${pt.waze_url}" target="_blank" class="map-popup-waze-btn" data-town="${escapeHtml(pt.town || '')}" onclick="recordLocationClicked(this.dataset.town)">الملاحة عبر Waze</a>
            </div>
          `);
        // يُتتبَّع كي يُزال عند تبديل المحافظة (#124).
        mapMarkers.push(marker);
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
      if (data.regions) regionsList = data.regions;
      if (data.regions_soon) regionsSoonList = data.regions_soon;
      return true;
    }
    return false;
  } catch (e) {
    console.error('Town coordinates error:', e);
    return false;
  }
}

/** المنطقة التي اسمها هذا بالضبط (مكان «بلا بلدة محدّدة»)، أو null. */
function findRegionByName(name) {
  return regionsList.find(r => r.name === name) || null;
}

/**
 * المحافظات **النشطة** — `regions` من GET /api/towns، ولا يحمل إلا النشطة
 * (الموقوفة في `regions_soon`، تذكرة #127). المرشِّح هنا للدفاع لا للفصل:
 * `is_active !== false` يعامل ردّاً قديماً بلا الحقل على أنه نشط.
 */
function activeRegionsList() {
  return regionsList.filter(r => r.is_active !== false);
}

/** المحافظات الموقوفة — `regions_soon`: `{ id, name }` تُعرض «قريباً» فقط. */
function soonRegionsList() {
  return regionsSoonList.filter(r => r && r.name);
}

/**
 * اسم المحافظة بمعرّفها من القائمتين (نشطة أو موقوفة)، أو null.
 * يخدم ما يحتاج اسم محافظة المناسبة — بحث الخرائط مثلاً — فلا يُلحق اسم
 * محافظةٍ ثابتة بمناسبةٍ في محافظة أخرى.
 */
function regionNameById(regionId) {
  const id = Number(regionId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const region = regionsList.find(r => r.id === id) || regionsSoonList.find(r => r.id === id);
  return region ? region.name : null;
}

/**
 * يملأ قائمة بلدات منسدلة من townsList (مجلوبة من الخادم، لا قائمة مثبَّتة)،
 * وبعدها خيار لكل منطقة «بلا بلدة محدّدة». قيمة حالية ليست بين الخيارات
 * (بلدة أوقفها الأدمن مثلاً) تُضاف مختارةً — وإلا فرغت القائمة وحُفظ '' بدلها.
 *
 * بمعرّف محافظة نشطة (`regionId`) تصير الخيارات بلدات تلك المحافظة وحدها
 * بترتيب الخادم، ثم اسمها هي «بلا بلدة محدّدة» — فلا يرى ناشر النقب بلدات
 * طولكرم ولا العكس. ومعرّف غير نشط أو غائب يعود إلى القائمة الكاملة أعلاه،
 * فتبقى القوائم صالحة حين يتعذّر GET /api/towns أو تُوقف محافظة بعده.
 */
function populateTownSelect(selectId, selectedValue, regionId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const region = regionId !== null && regionId !== undefined
    ? activeRegionsList().find(r => r.id === Number(regionId))
    : null;
  // «القرى والتجمعات» ليس مكاناً: صفّه في `towns` مسجَّل تحت محافظة واحدة
  // للعرض فقط، وكل قرى المنصة تحته أيّاً كانت محافظتها (towns.service). فتُلحَق
  // بالخيارات في كل محافظة لا تسجّله — وإلا اختفت قرى محافظة كاملة من نموذج
  // ناشرها. ولا تُضاف مرتين حين تسجّلها محافظتها أصلاً (النقب).
  const catchAll = region && Array.isArray(region.towns) && townsList.includes(VILLAGES_TOWN)
    && !region.towns.includes(VILLAGES_TOWN)
    ? [VILLAGES_TOWN]
    : [];
  const options = region && Array.isArray(region.towns)
    ? [
        ...region.towns.map(t => ({ value: t, label: t })),
        ...catchAll.map(t => ({ value: t, label: t })),
        { value: region.name, label: `${region.name} — بلا بلدة محدّدة` }
      ]
    : [
        ...townsList.map(t => ({ value: t, label: t })),
        // المحافظة **النشطة** وحدها مكاناً (تذكرة #127) — الموقوفة ليست مكان نشر.
        ...activeRegionsList().map(r => ({ value: r.name, label: `${r.name} — بلا بلدة محدّدة` }))
      ];
  if (selectedValue && !options.some(o => o.value === selectedValue)) {
    options.push({ value: selectedValue, label: selectedValue });
  }
  select.innerHTML = options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  if (selectedValue) select.value = selectedValue;
}

/**
 * يعيد بناء بلدات نموذج النشر على محافظة المنتقي بعد تبديل الحبة: بلدة حالية
 * موجودة في المحافظة الجديدة تبقى مختارة، وإلا فالخيار الأول — فقائمة بلدات
 * المحافظة السابقة لا تبقى معروضة تحتها. والمعالج نفسه يُستدعى بعدها كي يبقى
 * دبّوس الخريطة ومنتقي القرية متسقين مع البلدة الجديدة.
 * ومنتقي محافظة القرية (تحت البند الجامع) يتبع المحافظة الجديدة ما دام المستخدم
 * لم يختر فيه غيره — الافتراضي لا يعود إلى محافظةٍ سابقة.
 */
function refreshPublishTownForRegion(previousRegionId) {
  const townSelect = document.getElementById('addTown');
  if (!townSelect) return;

  const region = activeRegion();
  const current = townSelect.value;
  // «القرى والتجمعات» تُعرض في قائمة كل محافظة، فاختيارها يبقى عبر تبديل
  // الحبة — بخلاف بلدةٍ تنتمي إلى محافظة أخرى، تستبدلها الأولى.
  const regionTowns = region && Array.isArray(region.towns) ? region.towns : townsList;
  const keep = regionTowns.includes(current)
    || (current === VILLAGES_TOWN && townsList.includes(VILLAGES_TOWN));

  const regionSelect = document.getElementById('addRegion');
  if (regionSelect && regionSelect.options.length > 1) {
    const chosen = regionSelect.value ? Number(regionSelect.value) : null;
    if (chosen === null || chosen === previousRegionId) populateRegionSelect('addRegion', selectedRegionId);
  }

  populateTownSelect('addTown', keep ? current : null, selectedRegionId);
  handleAddTownChange();
}

/**
 * يهيّئ منتقي المحافظة (#124): يقرأ المحفوظ في negev_region — إن كان محافظة
 * **نشطة** فهو المختار (الموقوفة تُعامل كأنها ليست اختياراً، #127)، وإلا فمحافظة
 * الحساب النشطة إن وُجدت (وهي ما يستعمله الخادم بلا ترويسة)، وإلا فأول محافظة
 * نشطة هي الافتراضية بلا رسالة خطأ.
 * مفتاح قديم لم يعد نشطاً يُمسح ويعامل كأنه لا اختيار، كي لا يرسل apiFetch
 * معرّفاً يردّ عليه الخادم 400. والحفظ لا يحدث هنا: زائر بلا اختيار يبقى
 * بلا ترويسة، والخادم نفسه يعرض المحافظة الافتراضية.
 */
async function initRegionPicker() {
  await loadTownCoordinates();
  syncRegionPickerSelection();
}

/** يثبّت المحافظة النشطة من القائمة المجلوبة والمحفوظ، ثم يرسم. */
function syncRegionPickerSelection() {
  const active = activeRegionsList();
  if (!active.length) {
    renderRegionPicker();
    return;
  }
  const saved = readSavedRegionId();
  const savedRegion = saved !== null ? active.find(r => r.id === saved) : null;
  if (savedRegion) {
    selectedRegionId = savedRegion.id;
  } else {
    if (saved !== null) clearSavedRegionId();
    // بلا اختيار محفوظ، محافظة الحساب هي ما يستعمله الخادم فعلاً بلا ترويسة
    // (middleware/region.js) — فتُرسم مختارة بدل الأولى، وإلا رأى المسجّل حبة
    // محافظة غير التي يراها محتواه (#124). الافتراضية تبقى لغير المسجَّل.
    const accountRegionId = currentUser && currentUser.region_id !== null && currentUser.region_id !== undefined
      ? Number(currentUser.region_id)
      : null;
    const accountRegion = accountRegionId !== null ? active.find(r => r.id === accountRegionId) : null;
    selectedRegionId = (accountRegion || active[0]).id;
  }
  renderRegionPicker();
}

/**
 * يتبنّى محافظة الحساب بعد وصولها من GET /api/auth/me ويرسمها — لكن لا
 * يعلو على اختيار صريح محفوظ في المتصفّح، ولا على محافظة غير نشطة (الخادم
 * نفسه يعود للافتراضية فيها).
 * يُستدعى بعد تحديث currentUser في أي مسار جلسة.
 */
function adoptAccountRegion(regionId) {
  if (readSavedRegionId() !== null) return;
  const region = activeRegionsList().find(r => r.id === Number(regionId));
  if (!region || selectedRegionId === region.id) return;
  selectedRegionId = region.id;
  renderRegionPicker();
}

/** محافظة الاكتشاف الفعّالة الآن (التي يرسمها المنتقي)، أو null قبل وصول القائمة. */
function activeRegion() {
  const active = activeRegionsList();
  return active.find(r => r.id === selectedRegionId) || active[0] || null;
}

/** اسم المحافظة المعروضة الآن — من activeRegion وحدها، وإلا null. */
function activeRegionName() {
  const region = activeRegion();
  return region ? region.name : null;
}

/**
 * يرسم حبوب المحافظات في الموضعين: أعلى التغذية، ونسخة الدرج على الهاتف.
 * النشطة تحمل حالتها — «مختارة» أو «متاحة» — وهي وحدها القابلة للاختيار.
 * والموقوفة (`regions_soon`) تُرسم «قريباً» بلونٍ خفيف ومع `aria-disabled`
 * **لا `disabled`**: الزرّ المعطّل يخرج من التنقّل فيفقد قارئ الشاشة نصّه
 * («اسم المحافظة — قريباً»)، ومع `aria-disabled` يبقى مقروءاً وقابلاً للتركيز
 * لكن بلا `onclick` فلا شيء يختاره. واسم المحافظة من الخادم وحده.
 * القائمة فارغة قبل وصول GET /api/towns أو عند فشله، فيبقى المنتقي مخفياً.
 */
function renderRegionPicker() {
  const chipHtml = (region, { soon, selected }) => {
    const state = soon ? 'قريباً' : (selected ? 'مختارة' : 'متاحة');
    const classes = `region-chip${selected ? ' active' : ''}${soon ? ' soon' : ''}`;
    const ariaDisabled = soon ? ' aria-disabled="true"' : '';
    const onClick = soon ? '' : ` onclick="selectRegion(${region.id})"`;
    return `<button type="button" class="${classes}" data-region-id="${region.id}" aria-pressed="${selected}"${ariaDisabled}${onClick}>
      <span class="region-chip-name">${escapeHtml(region.name)}</span>
      <span class="region-chip-state">${state}</span>
    </button>`;
  };

  const chipsHtml = [
    ...activeRegionsList().map(region => chipHtml(region, { soon: false, selected: region.id === selectedRegionId })),
    ...soonRegionsList().map(region => chipHtml(region, { soon: true, selected: false }))
  ].join('');

  [['regionPicker', 'regionPickerChips'], ['drawerRegionPicker', 'drawerRegionPickerChips']].forEach(([wrapId, chipsId]) => {
    const wrap = document.getElementById(wrapId);
    const chips = document.getElementById(chipsId);
    if (!wrap || !chips) return;
    wrap.hidden = !chipsHtml;
    chips.innerHTML = chipsHtml;
  });

  // ورقة المحافظة في الترويسة الغنية (تذكرة #174): حباتٌ من نفس المصدر ونفس
  // الدالة، فلا نسخة ثانية من قائمة المحافظات ولا من حالاتها. وقبل وصول
  // القائمة أو عند فشلها تُقال الرسالة القصيرة في الورقة بدل بطاقة فارغة.
  const sheetChips = document.getElementById('regionSheetChips');
  if (sheetChips) sheetChips.innerHTML = chipsHtml;
  const sheetEmpty = document.getElementById('regionSheetEmpty');
  if (sheetEmpty) sheetEmpty.hidden = Boolean(chipsHtml);

  // كبسولة المحافظة تحمل اسم المحافظة الفعّالة من الخادم وحده — في موضعَيها:
  // الترويسة العريضة (سطح المكتب) والصفّ الغني في الشريط العائم (الهاتف/PWA)،
  // وهي النسخة التي يراها مستخدم الهاتف فعلاً. ولا تُخفى قبل وصول
  // `GET /api/towns`: تعرض «منطقتك» — وهي الصياغة نفسها التي يستعملها منتقي
  // التغذية عند غياب الاسم (activeRegionName) — وورقتها تشرح سبب الفراغ بدل
  // طرفٍ ميت.
  const capsuleText = activeRegionName() || 'منطقتك';
  ['headerRegionName', 'floatingRegionName'].forEach((id) => {
    const capsuleName = document.getElementById(id);
    if (capsuleName) capsuleName.textContent = capsuleText;
  });

  // شريط التوسّع يتبع الحبة المختارة، فيُرسم معها في كل مسار يغيّرها: الإقلاع،
  // وتبديل المحافظة (#127)، وتبنّي محافظة الحساب بعد GET /api/auth/me.
  renderRegionBanner();
}

/**
 * ورقة المحافظة — بابها كبسولة الترويسة الغنية (تذكرة #174).
 *
 * الورقة ليست منتقياً ثانياً: حباتها تُرسم في `renderRegionPicker` نفسها،
 * والاختيار فيها يمشي في `selectRegion` القائم (يحفظ المحافظة، ويعيد جلب
 * التغذية والأسطح الظاهرة، ويغلق الورقة). ولذلك تُعاد رسم الحبات عند الفتح:
 * قائمة المحافظات تصل بعد الإقلاع، فتفتح الورقة على ما وصل فعلاً.
 */
function openRegionSheet() {
  renderRegionPicker();
  const modal = document.getElementById('regionSheetModal');
  if (modal) modal.style.display = 'flex';
}

function closeRegionSheet() {
  const modal = document.getElementById('regionSheetModal');
  if (modal) modal.style.display = 'none';
}

// شريط التوسّع (#127) — خبر داخليّ تحت منتقي المحافظة وفوق رقاقات الفلترة، لا
// ورقة حواريّة ولا طبقة تحجب الصفحة: سطران بحدّ أقصى يتبعان المحافظة الفعّالة.
// «بعد النجاح في {الأصل}… توسّعنا إلى {المحافظة}» — الأصل أول محافظة نشطة
// بترتيب الخادم، والاسم والعدّادان من GET /api/towns وحده، فلا اسم مكتوب هنا
// ولا طلب إضافي. الإخفاء (×) يُسجَّل لهذه المحافظة وحدها، وتبديل المحافظة يعرض
// شريط المحافظة الجديدة.

/** صيغ الاسم بعد العدد — مفرد ومثنّى وجمع قلّة؛ وما فوق العشرة يعود إلى المفرد. */
const REGION_BANNER_TOWNS = { single: 'بلدة', dual: 'بلدتان', plural: 'بلدات' };
const REGION_BANNER_EVENTS = { single: 'مناسبة', dual: 'مناسبتان', plural: 'مناسبات' };

/**
 * صيغة الاسم بعد العدد في العربية: ١ «بلدة»، ٢ «بلدتان»، ٣–١٠ «بلدات»، و١١+
 * تعود إلى المفرد («11 بلدة») — ليست «3 بلدة» ولا «11 بلدات».
 */
function regionBannerNoun(count, forms) {
  if (count === 1) return forms.single;
  if (count === 2) return forms.dual;
  if (count <= 10) return forms.plural;
  return forms.single;
}

/** عدّاد من الخادم، أو null حين يغيب الرقم — لا يُخترع صفر من غيابه. */
function regionBannerCount(region, field) {
  const value = region ? region[field] : null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** مفتاح إخفاء الشريط لمحافظة بعينها — إخفاء طولكرم لا يخفي شريط اللد. */
function regionBannerKey(regionId) {
  return `negev_region_banner_${regionId}`;
}

/** هل أخفى الزائر شريط هذه المحافظة؟ تعذّر قراءة التخزين = غير مخفي. */
function isRegionBannerDismissed(regionId) {
  try {
    return localStorage.getItem(regionBannerKey(regionId)) !== null;
  } catch (e) {
    return false; // تخزين معطّل — الشريط يظهر، ولا شيء يُسجَّل.
  }
}

/**
 * سطر المعلومات تحت العنوان: المناسبات المعتمدة إن وُجدت، وإلا عدد البلدات مع
 * دعوة من لا مناسبة فيها بعد. محافظة بلا مناسبات **لا تكتب «0 مناسبة»** —
 * عدد البلدات هو الخبر، وصفر البلدات يُقال «بلا بلدات» لا «0 بلدة».
 */
function regionBannerLineHtml(region, events, towns) {
  const name = escapeHtml(region.name);
  if (events > 0) {
    return `${escapeHtml(String(events))} ${regionBannerNoun(events, REGION_BANNER_EVENTS)} في ${name}`;
  }
  if (towns > 0) {
    return `${escapeHtml(String(towns))} ${regionBannerNoun(towns, REGION_BANNER_TOWNS)} في ${name} — كن أول من يعلن مناسبة فيها`;
  }
  return `بلا بلدات في ${name} — كن أول من يعلن مناسبة فيها`;
}

/**
 * يرسم الشريط أو يخفيه — الدالة الوحيدة التي تكتب فيه، وتُستدعى مع رسم حبوب
 * المحافظة فيتبع المختارَ في كل مسار (الإقلاع، التبديل، تبنّي محافظة الحساب).
 * لا شريط على المحافظة الأصلية (أول نشطة بترتيب الخادم) — الشريط خبر توسّع؛
 * ولا شريط حين يغيب أحد العدّادين (لا رقم مخترع) أو يكون الزائر قد أخفاه.
 */
function renderRegionBanner() {
  const banner = document.getElementById('regionBanner');
  const titleEl = document.getElementById('regionBannerTitle');
  const lineEl = document.getElementById('regionBannerLine');
  if (!banner || !titleEl || !lineEl) return;

  const origin = activeRegionsList()[0] || null;
  const region = activeRegion();
  const events = regionBannerCount(region, 'events_count');
  const towns = regionBannerCount(region, 'towns_count');
  const show = Boolean(origin) && Boolean(region)
    && region.id !== origin.id
    && events !== null && towns !== null
    && !isRegionBannerDismissed(region.id);

  if (!show) {
    banner.hidden = true;
    titleEl.innerHTML = '';
    lineEl.innerHTML = '';
    return;
  }

  titleEl.innerHTML = escapeHtml(`بعد النجاح في ${origin.name}… توسّعنا إلى ${region.name}`);
  lineEl.innerHTML = regionBannerLineHtml(region, events, towns);
  banner.hidden = false;
}

/** × يُخفي الشريط ويسجّله لهذه المحافظة وحدها، فيبقى مخفياً بعد إعادة التحميل. */
function dismissRegionBanner() {
  const region = activeRegion();
  if (!region) return;
  try {
    localStorage.setItem(regionBannerKey(region.id), '1');
  } catch (e) {
    // تخزين معطّل — يختفي الشريط الآن ولا يُسجَّل.
  }
  const banner = document.getElementById('regionBanner');
  if (banner) banner.hidden = true;
}

/**
 * تبديل المحافظة (#124): يُحفظ المعرّف فوراً (فيقرؤه apiFetch في الطلب
 * التالي)، ثم تُصفَّر التغذية كلها — لا صفحة تالية، ولا لقطة «رجوع لنتائجك
 * السابقة»، ولا بصمة فلتر قديمة تمنع الطلب — وتُجلب من الصفحة الأولى
 * بترويسة المحافظة الجديدة. ثم تُعاد أسطح الاكتشاف الظاهرة من دوال تحميلها
 * القائمة، فلا يبقى على الشاشة كرت أو دبّوس أو ستوري من المنطقة السابقة.
 */
async function selectRegion(regionId) {
  const region = regionsList.find(r => r.id === Number(regionId));
  // الموقوفة تُعرض «قريباً» ولا تُختار (تذكرة #127): معرّفاتها في
  // regionsSoonList لا في regionsList، فلا يجدها البحث هنا ولا تُحفظ ولا تُجلب.
  if (!region) return;

  // ورقة المحافظة تُغلق باختيارها مهما كان — حتى لو كانت الحبة المختارة هي
  // نفسها، فالنقر عليها في الورقة إغلاقٌ لا إعادة اختيار (تذكرة #174).
  closeRegionSheet();

  // لا خروج مبكر إلا حين تكون الحبة هي الفعّالة **والمحفوظة** فعلاً: المحافظة
  // الافتراضية أو محافظة الحساب تُرسم مختارة بلا قيمة في negev_region، والضغط
  // عليها يجب أن يثبّتها في المتصفّح ويجلب بها — وإلا بقي الخادم على محافظة
  // الحساب بينما يظنّ المستخدم أنه اختار ما يراه (#124).
  //
  // **ولا خروج مبكر في وضع «كل المحافظات»**: الحبّة المحفوظة تُرسم مختارة فيه،
  // والضغط عليها هو الخروج منه — وهو ما كان يفعله مسحُ المحفوظ قبل #161. بلا
  // هذا الشرط بقي العلَم معلَّقاً على التغذية بلا زرّ يُلغيه.
  if (region.id === selectedRegionId && readSavedRegionId() === region.id && !feedAllRegions) return;

  const previousRegionId = selectedRegionId;
  // اختيار محافظة صريح يُلغي وضع «كل المحافظات» فوراً (تذكرة #161) — وإلا بقي
  // الفلتر معلَّقاً على التغذية بعد أن اختار المستخدم محافظته.
  feedAllRegions = false;
  saveRegionId(region.id);
  selectedRegionId = region.id;
  renderRegionPicker();
  // نموذج النشر المفتوح يتبع المحافظة الجديدة في بلداته أيضاً — بلدة من
  // المحافظة السابقة كانت ستبقى مختارة تحت قائمة المحافظة الجديدة.
  refreshPublishTownForRegion(previousRegionId);
  resetFeedForRegionChange();
  refreshPlaceFilterForRegion();
  // الأقسام التابعة للمحافظة قبل طلب التغذية: كلها في الدورة نفسها، ويبقى طلب
  // التغذية آخر طلب `/api/events` فيها.
  reloadHomeDiscoverySections();
  fetchEvents({ force: true });
  reloadDiscoverySurfacesForRegion();
}

/**
 * «وسّع إلى كل المحافظات» — خروج الحالة الفارغة من محافظةٍ لا مناسبات فيها
 * (تذكرة #161، البند 2). مسح الاختيار المحفوظ وحده لا يوسّع شيئاً: الخادم يحسم
 * محافظةً دائماً (ترويسة، أو محافظة الحساب، أو الافتراضية)، فيعود الجلب إلى
 * التغذية نفسها حرفياً. فالتوسيع علَم طلب صريح — `all_regions=1` عبر `apiFetch`
 * في `fetchEvents` — يتجاوز تقييد المحافظة على الخادم لهذا الجلب وطلبات الترقيم
 * التالية، ويبقى فعّالاً حتى يختار المستخدم محافظة صريحة (`selectRegion`
 * تلغيه).
 *
 * **ولا يمسّ التوسيعُ المحفوظ**: العلَم يوسّع الجلب وحده، و`negev_region` يبقى كما هو،
 * فإعادة تحميل الصفحة تعود إلى المحافظة التي اختارها المستخدم. والطلب الموسَّع
 * لا يحمل `X-Region` أصلاً (`apiFetch`)، فلا يدّعي محافظةً لم تخترها هذه النقرة.
 */
function expandFeedToAllRegions() {
  feedAllRegions = true;
  syncRegionPickerSelection();
  resetFeedForRegionChange();
  refreshPlaceFilterForRegion();
  // نفس ترتيب تبديل المحافظة: الأقسام التابعة للمحافظة أولاً ثم التغذية.
  reloadHomeDiscoverySections();
  fetchEvents({ force: true });
  reloadDiscoverySurfacesForRegion();
}

/*
 * «الأعراس المميزة» — من GET /api/events/featured لمحافظة الاكتشاف الحالية.
 * بطاقة واحدة كاملة تُعرض في كل لحظة (دعوة كاملة على أرضية داكنة، إطار ذهبي
 * متوهّج، وسم «مناسبة مميزة»، شريحة عدّ تنازلي)، وتتبدّل في مكانها كل ٥ ثوانٍ
 * بلا تمرير: البطاقات كلها في المستند وواحدة `is-active` والباقي `display:none`،
 * وتحت الشريط نقاط تختار البطاقة. يتوقف التبديل عند تفضيل تقليل الحركة أو
 * تغطية الرئيسية (نفس `shouldAutoAdvanceHomeCarousels`) وعند تحويم/لمس/تركيز
 * داخل القسم، ولا يبدأ ببطاقة واحدة.
 */
let featuredRequestSeq = 0;

function featuredTargets() {
  return [
    { sectionId: 'featuredEventsSection', rowId: 'featuredEventsTrack', dotsId: 'featuredEventsDots' },
    { sectionId: 'drawerFeaturedEventsSection', rowId: 'drawerFeaturedEventsTrack', dotsId: 'drawerFeaturedEventsDots' }
  ]
    .map(({ sectionId, rowId, dotsId }) => ({
      section: document.getElementById(sectionId),
      row: document.getElementById(rowId),
      dots: document.getElementById(dotsId)
    }))
    .filter(target => target.section && target.row);
}

/** بطاقات الشريط المرسومة الآن — العدّ من المستند لا من متغيّر قد يتقادم. */
function featuredCards() {
  return Array.from(document.querySelectorAll('#featuredEventsTrack .featured-event-card'));
}

function featuredSlideCount() {
  return featuredCards().length;
}

/**
 * ينقل العرض إلى بطاقة بعينها في النسختين (الصفحة والدرج): `is-active` على
 * بطاقة واحدة والنقاط تتبعها. لا إعادة بناء ولا تمرير — التبديل في مكانه.
 */
function syncFeaturedSlides(index) {
  const total = featuredSlideCount();
  if (!total) return;
  featuredCarouselIndex = ((index % total) + total) % total;

  featuredTargets().forEach(({ row, dots }) => {
    row.querySelectorAll('.featured-event-card').forEach((card, cardIndex) => {
      card.classList.toggle('is-active', cardIndex === featuredCarouselIndex);
    });
    if (!dots) return;
    dots.querySelectorAll('.featured-events-dot').forEach((dot, dotIndex) => {
      const active = dotIndex === featuredCarouselIndex;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-current', active ? 'true' : 'false');
    });
  });
}

/** نقرة نقطة تحت الشريط — تنتقل إلى بطاقتها. */
function goToFeaturedSlide(index) {
  syncFeaturedSlides(index);
}

function stopFeaturedAutoAdvance() {
  if (featuredCarouselTimer) {
    clearInterval(featuredCarouselTimer);
    featuredCarouselTimer = null;
  }
}

/**
 * التبديل التلقائي كل ٥ ثوانٍ في المكان نفسه. الحارس في كل نبضة لا عند
 * التشغيل وحده: نافذة/صفحة تُفتح فوق الرئيسية توقف التبديل فوراً حتى لو بقي
 * المؤقّت حياً.
 */
function startFeaturedAutoAdvance() {
  stopFeaturedAutoAdvance();
  if (prefersReducedMotion()) return;
  if (featuredSlidePaused) return;
  if (featuredSlideCount() <= 1) return;

  featuredCarouselTimer = setInterval(() => {
    if (featuredSlidePaused) return;
    if (!shouldAutoAdvanceHomeCarousels()) return;
    if (featuredSlideCount() <= 1) return;
    syncFeaturedSlides(featuredCarouselIndex + 1);
  }, 5000);
}

/** إيقاف/استئناف التبديل — من التحويم أو اللمس أو التركيز داخل القسم. */
function setFeaturedSlidePaused(paused) {
  featuredSlidePaused = Boolean(paused);
  if (featuredSlidePaused) stopFeaturedAutoAdvance();
  else startFeaturedAutoAdvance();
}

/** يربط الإيقاف المؤقّت بالنسختين مرة واحدة (الدرج يُبنى متأخّراً، فالحارس لازم). */
function bindFeaturedInteraction() {
  featuredTargets().forEach(({ section }) => {
    if (section.dataset.featuredBound === '1') return;
    section.dataset.featuredBound = '1';
    // مؤشّر الفأرة واللمس كلاهما `pointerenter`/`pointerleave` (اللمس يرفع
    // المؤشّر بعد الإفلات)، والتركيز لوحة المفاتيح له حدثاه.
    section.addEventListener('pointerenter', () => setFeaturedSlidePaused(true));
    section.addEventListener('pointerleave', () => setFeaturedSlidePaused(false));
    section.addEventListener('focusin', () => setFeaturedSlidePaused(true));
    section.addEventListener('focusout', () => setFeaturedSlidePaused(false));
  });
}

async function loadFeaturedEvents() {
  const seq = ++featuredRequestSeq;
  const targets = featuredTargets();
  if (!targets.length) return;

  stopFeaturedAutoAdvance();
  featuredCarouselIndex = 0;

  targets.forEach(({ section, row, dots }) => {
    row.innerHTML = '';
    if (dots) {
      dots.innerHTML = '';
      dots.hidden = true;
    }
    section.hidden = true;
  });

  const params = new URLSearchParams();
  if (selectedRegionId !== null && selectedRegionId !== undefined && !feedAllRegions) {
    params.set('region_id', String(selectedRegionId));
  }
  const query = params.toString();

  let data = null;
  try {
    const res = await apiFetch(`/api/events/featured${query ? `?${query}` : ''}`, { allRegions: feedAllRegions });
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (seq !== featuredRequestSeq) return;

  const events = data && Array.isArray(data.events) ? data.events : [];
  if (!events.length) return;

  const cardsHtml = events.map(renderFeaturedCardHtml).join('');
  const dotsHtml = events.map((evt, index) => `
        <button type="button" class="featured-events-dot${index === 0 ? ' is-active' : ''}" onclick="goToFeaturedSlide(${index})" aria-label="البطاقة ${index + 1} من ${events.length}" aria-current="${index === 0 ? 'true' : 'false'}"></button>`).join('');

  targets.forEach(({ section, row, dots }) => {
    row.innerHTML = cardsHtml;
    if (dots) {
      dots.innerHTML = events.length > 1 ? dotsHtml : '';
      dots.hidden = events.length <= 1;
    }
    section.hidden = false;
  });

  bindFeaturedInteraction();
  syncFeaturedSlides(0);
  startFeaturedAutoAdvance();
}

/**
 * بطاقة «الأعراس المميزة» — الدعوة كاملة (object-fit: contain على أرضية داكنة)،
 * وسم ذهبي على الزاوية، شريحة عدّ تنازلي، عنوان الكرت نفسه، سطر «مكان · تاريخ
 * · وقت»، ثم أفعال كرت التغذية نفسها لا نسخة ثانية: «ذكّرني» و«مهتم» (فعل
 * التذكير نفسه) و«جاي» (مسار تأكيد الحضور) و«بارك» (مسار التبريك، و«عزّي» على
 * نغمة النوع). والنقر على البطاقة أو الملصق يفتح صفحة المناسبة، وأزرار الأفعال
 * توقف تصعيد النقر إلى البطاقة.
 */
function renderFeaturedCardHtml(evt) {
  const isMourning = isMourningTone(evt);
  const poster = evt.poster_url ? cardImageUrl(evt.poster_url) : '';
  const shot = poster
    ? `<img class="featured-event-img" src="${escapeHtml(poster)}" alt="" loading="lazy">`
    : '<span class="featured-event-img featured-event-img-empty" aria-hidden="true"><i class="fa-solid fa-champagne-glasses"></i></span>';
  const meta = [
    eventPlaceName(evt),
    formatEventDayLong(evt),
    typeShowsField(evt, 'dinner_time') ? evt.dinner_time : ''
  ].filter(Boolean).map(text => escapeHtml(text)).join(' · ');

  // «ذكّرني» القائم نفسه (قلب/محفوظة)، و«مهتم» فعل التذكير ذاته بلا تبديل:
  // الضغط عليها يضيف ولا يزيل. العزاء بلا قلب ولا «جاي» كما في كرت التغذية.
  const remindHtml = isMourning ? '' : renderReminderButtonHtml(evt, { compact: true });
  const interestHtml = isMourning ? '' : `
          <button type="button" class="card-action-btn featured-interest-btn" onclick="toggleReminder(${evt.id}, false, this)">
            <i class="fa-solid fa-star"></i> <span>مهتم</span>
          </button>`;
  const rsvpHtml = isMourning ? '' : renderRsvpCardButtonHtml(evt);

  return `
    <article class="featured-event-card" data-event-id="${evt.id}" onclick="openEventPage(${evt.id})">
      <button type="button" class="featured-event-shot" onclick="event.stopPropagation(); openEventPage(${evt.id})" aria-label="فتح صفحة المناسبة">
        ${shot}
        <span class="featured-event-badge">✦ مناسبة مميزة</span>
        ${isMourning ? '' : posterCountdownChipHtml(evt)}
      </button>
      <div class="featured-event-body">
        <h3 class="featured-event-name card-clamp-1-line">${escapeHtml(eventCardHeadline(evt))}</h3>
        <span class="featured-event-meta card-clamp-1-line">${meta}</span>
        <div class="featured-event-actions" onclick="event.stopPropagation()">
          ${remindHtml}${interestHtml}${rsvpHtml}${renderMessagesActionHtml(evt)}
        </div>
      </div>
    </article>`;
}

/**
 * يوائم حالة «ذكّرني» في بطاقات «الأعراس المميزة» بعد نجاح الفعل: البطاقة
 * خارج `allEvents`، فلا يعيد `applySavedState` رسمها وتبقى حالتها قديمة.
 */
function syncFeaturedReminderState(eventId, isSaved) {
  document.querySelectorAll(`.featured-event-card[data-event-id="${eventId}"] .reminder-btn`).forEach(btn => {
    btn.classList.toggle('is-saved', isSaved);
    const icon = btn.querySelector('i');
    if (icon) icon.className = `fa-${isSaved ? 'solid' : 'regular'} fa-heart`;
    const label = btn.querySelector('span');
    if (label) label.textContent = isSaved ? 'محفوظة' : 'ذكّرني';
  });
}

/*
 * أقسام الاكتشاف الجديدة في الرئيسية (M1-W) — «هذا الأسبوع قربك» و«جديد عنا»
 * و«الأكثر تفاعلاً» وفئات الخدمات. كل قسم مستقلّ تماماً: جلبه لا يحجب التغذية،
 * وفشله يُخفي قسمه وحده بلا توست خطأ. والأقسام الثلاثة الأولى تتبع محافظة
 * الاكتشاف نفسها التي تتبعها التغذية (`apiFetch` بترويسة X-Region، وعلَم
 * «كل المحافظات» عند التوسّع)، فتُعاد مع تبديل المحافظة وحده — لا مع كل تغيير
 * فلتر، فذلك لا يغيّر محافظتها.
 */

/** يُخفي قسماً ويفرّغ صفّه — الفراغ والفشل لا يتركان بقايا رسم قديم. */
function hideHomeSection(section, row) {
  if (row) row.innerHTML = '';
  if (section) section.hidden = true;
}

/**
 * كرت مصغّر: صورة على جهة البداية، شريحة يوم الأسبوع، عنوان بسطر واحد واسم
 * المكان. الموضع الوحيد الذي يبني هذا الشكل — يستعمله «هذا الأسبوع قربك»
 * و«جديد عنا» معاً.
 */
function renderCompactEventCardHtml(evt) {
  const poster = evt.poster_url ? cardImageUrl(evt.poster_url) : '';
  const thumb = poster
    ? `<span class="home-compact-thumb"><img src="${escapeHtml(poster)}" alt="" loading="lazy"></span>`
    : '<span class="home-compact-thumb" aria-hidden="true"><i class="fa-solid fa-champagne-glasses"></i></span>';
  const day = eventDayDate(evt);
  const weekday = Number.isNaN(day.getTime())
    ? ''
    : new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(day);
  const place = eventPlaceName(evt) || '';
  return `
    <button type="button" class="home-compact-card" data-event-id="${evt.id}" onclick="openEventPage(${evt.id})">
      ${thumb}
      <span class="home-compact-body">
        ${weekday ? `<span class="home-compact-weekday">${escapeHtml(weekday)}</span>` : ''}
        <span class="home-compact-title">${escapeHtml(eventCardHeadline(evt))}</span>
        <span class="home-compact-place">${escapeHtml(place)}</span>
      </span>
    </button>`;
}

/**
 * «هذا الأسبوع قربك» — من اليوم إلى اليوم السابع بتوقيت القدس (نطاق أيام
 * تقويمية لا ساعات)، وبمحافظة التغذية نفسها، بحدّ عشرة صفوف.
 */
async function loadThisWeekEvents() {
  const section = document.getElementById('homeWeekSection');
  const row = document.getElementById('homeWeekRow');
  if (!section || !row) return;
  const token = homeDiscoveryRegionToken;
  try {
    const params = new URLSearchParams();
    params.set('date_from', jerusalemDayKey(0));
    params.set('date_to', jerusalemDayKey(6));
    params.set('limit', '10');
    const res = await apiFetch(`/api/events?${params.toString()}`, { allRegions: feedAllRegions });
    const data = await res.json();
    if (token !== homeDiscoveryRegionToken) return;
    const events = data && data.success === true && Array.isArray(data.events) ? data.events : [];
    if (!events.length) {
      hideHomeSection(section, row);
      return;
    }
    row.innerHTML = events.map(renderCompactEventCardHtml).join('');
    section.hidden = false;
  } catch (e) {
    if (token !== homeDiscoveryRegionToken) return;
    hideHomeSection(section, row);
  }
}

/** «جديد عنا» — أحدث المناسبات المنشورة (`sort=newest`)، بالكرت المصغّر نفسه. */
async function loadNewestEvents() {
  const section = document.getElementById('homeNewestSection');
  const row = document.getElementById('homeNewestRow');
  if (!section || !row) return;
  const token = homeDiscoveryRegionToken;
  try {
    const res = await apiFetch('/api/events?sort=newest&limit=10', { allRegions: feedAllRegions });
    const data = await res.json();
    if (token !== homeDiscoveryRegionToken) return;
    const events = data && data.success === true && Array.isArray(data.events) ? data.events : [];
    if (!events.length) {
      hideHomeSection(section, row);
      return;
    }
    row.innerHTML = events.map(renderCompactEventCardHtml).join('');
    section.hidden = false;
  } catch (e) {
    if (token !== homeDiscoveryRegionToken) return;
    hideHomeSection(section, row);
  }
}

/**
 * كرت «الأكثر تفاعلاً»: ملصق، شارة ترتيب (الأولى «🔥 الأكثر تفاعلاً» والبقية
 * أرقامها)، شريحة عدّ تنازلي، وعنوان وسطر مكان · تاريخ.
 */
function renderTrendingCardHtml(evt, index) {
  const poster = evt.poster_url ? cardImageUrl(evt.poster_url) : '';
  const shot = poster
    ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy">`
    : '<span class="home-trending-shot-empty" aria-hidden="true"><i class="fa-solid fa-champagne-glasses"></i></span>';
  const rank = index === 0
    ? '<span class="home-trending-rank is-first">🔥 الأكثر تفاعلاً</span>'
    : `<span class="home-trending-rank">#${index + 1}</span>`;
  const meta = [eventPlaceName(evt), formatEventDayLong(evt)].filter(Boolean)
    .map(text => escapeHtml(text)).join(' · ');
  return `
    <button type="button" class="home-trending-card" data-event-id="${evt.id}" onclick="openEventPage(${evt.id})">
      <span class="home-trending-shot">${shot}${rank}${posterCountdownChipHtml(evt)}</span>
      <span class="home-trending-body">
        <span class="home-trending-title">${escapeHtml(eventCardHeadline(evt))}</span>
        <span class="home-trending-meta">${escapeHtml(meta)}</span>
      </span>
    </button>`;
}

/** «الأكثر تفاعلاً» — من GET /api/events/trending بمحافظة التغذية نفسها. */
async function loadTrendingEvents() {
  const section = document.getElementById('homeTrendingSection');
  const row = document.getElementById('homeTrendingRow');
  if (!section || !row) return;
  const token = homeDiscoveryRegionToken;
  try {
    const res = await apiFetch('/api/events/trending', { allRegions: feedAllRegions });
    const data = await res.json();
    if (token !== homeDiscoveryRegionToken) return;
    const events = data && data.success === true && Array.isArray(data.events) ? data.events : [];
    if (!events.length) {
      hideHomeSection(section, row);
      return;
    }
    row.innerHTML = events.map(renderTrendingCardHtml).join('');
    section.hidden = false;
  } catch (e) {
    if (token !== homeDiscoveryRegionToken) return;
    hideHomeSection(section, row);
  }
}

/**
 * يستخرج رمز إيموجي واحداً صالحاً لأيقونة فئة الخدمات، ويرفض النصوص العربية
 * واللاتينية والأرقام (مثل «طباخ الافراح» أو «ب») ويقتصر على أول إيموجي عند تكدّس
 * عدّة رموز مثل «🍬🍰🧁» كي لا ينقصّ النصّ داخل الدائرة.
 */
function usableCategoryIcon(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/[A-Za-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(trimmed)) {
    return '';
  }
  let firstCluster = '';
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('ar', { granularity: 'grapheme' });
    const next = segmenter.segment(trimmed)[Symbol.iterator]().next();
    firstCluster = next && next.value ? next.value.segment : '';
  } else {
    const match = trimmed.match(/^(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\u200D\uFE0F])(?:\uFE0F|\u200D(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|.)\uFE0F?)*/);
    firstCluster = match ? match[0] : '';
  }
  if (!firstCluster) return '';
  for (const ch of firstCluster) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x1F1E6 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x231A && cp <= 0x23FF) || cp === 0x2B50 || cp === 0x2B55) {
      return firstCluster;
    }
  }
  return '';
}

/** بلاطة فئة: أيقونة الفئة نفسها إن كانت إيموجي صالحاً، وإلا أيقونة Font Awesome مناسبة. */
function renderHomeCategoryTileHtml(category) {
  const icon = usableCategoryIcon(category && category.icon);
  const iconHtml = icon
    ? `<span class="home-category-emoji" aria-hidden="true">${escapeHtml(icon)}</span>`
    : '<i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i>';
  return `
    <button type="button" class="home-category-tile" onclick="openHomeServiceCategory(${Number(category.id)})">
      <span class="home-category-icon">${iconHtml}</span>
      <span class="home-category-name">${escapeHtml(category.name || '')}</span>
    </button>`;
}

/** فئات الخدمات — من GET /api/services/categories، ونقرها يفلتر الدليل. */
async function loadHomeServiceCategories() {
  const section = document.getElementById('homeCategoriesSection');
  const row = document.getElementById('homeCategoryRow');
  if (!section || !row) return;
  try {
    const res = await apiFetch('/api/services/categories');
    const data = await res.json();
    const categories = data && data.success === true && Array.isArray(data.categories) ? data.categories : [];
    if (!categories.length) {
      hideHomeSection(section, row);
      return;
    }
    row.innerHTML = categories.map(renderHomeCategoryTileHtml).join('');
    section.hidden = false;
  } catch (e) {
    hideHomeSection(section, row);
  }
}

/**
 * «استوديو الدعوات» في الأزرار السريعة: الاستوديو لكل مناسبة على حِدة، فالوجهة
 * قائمة مناسبات صاحب الحساب في «مناسباتي» (وفيها زرّا الستوديو لكل مناسبة).
 * غير المسجَّل يمرّ بنافذة الدخول القائمة ثم يعود إلى «مناسباتي» نفسها.
 */
function openInvitationStudioFromHome() {
  if (!requireAuth({ type: 'my_list' })) return;
  switchTab('tabMyList');
}

/**
 * تصفير حالة التغذية قبل جلب المنطقة الجديدة: الصفحة الأولى، واللقطة
 * والرقاقة المرتبطة بها، وبصمتا الفلتر المطبَّقة والمرسومة (البصمة القديمة
 * كانت ستمنع `fetchEvents` من إرسال طلب ولو أرسلنا `force`)، وقائمة الكروت
 * نفسها كي لا يبقى أي كرت من المنطقة السابقة أثناء انتظار الردّ.
 */
function resetFeedForRegionChange() {
  // أقسام الاكتشاف الجديدة (M1-W) تتبع المحافظة نفسها: تبديلها يُبطل أي ردّ
  // قديم في الطريق فلا تُرسم مناسبات المحافظة السابقة فوق الجديدة.
  homeDiscoveryRegionToken += 1;
  currentPage = 1;
  currentPagination = null;
  feedBackSnapshot = null;
  hideFeedBackPill();
  feedAppliedSignature = null;
  feedRenderedSignature = null;
  feedRenderedFilterState = null;
  allEvents = [];
  const container = document.getElementById('eventsContainer');
  if (container) container.innerHTML = '';
}

/**
 * أقسام الرئيسية التابعة للمحافظة (M1-W) — «هذا الأسبوع قربك» و«جديد عنا»
 * و«الأكثر تفاعلاً». تُنادى في مساري تبديل المحافظة والتوسيع **قبل**
 * `fetchEvents` فتبقى طلباتها وطلب التغذية في الدورة نفسها، ويبقى طلب التغذية
 * آخر طلب `/api/events` فيها. ولا تُنادى مع تغيير فلتر: الفلتر لا يغيّر
 * المحافظة، وهذه الأقسام لا تتبعه.
 */
function reloadHomeDiscoverySections() {
  loadThisWeekEvents();
  loadNewestEvents();
  loadTrendingEvents();
}

/** يعيد تحميل بقية أسطح الاكتشاف الظاهرة بالمنطقة الجديدة (تذكرة #124). */
function reloadDiscoverySurfacesForRegion() {
  // شريط الستوريات ظاهر دائماً أعلى التغذية.
  fetchStories();

  // «الأعراس المميزة» تتبع محافظة الاكتشاف الحالية.
  loadFeaturedEvents();

  // الخريطة إن كانت قد فُتحت — initLeafletMap نفسها تزيل الدبابيس القديمة
  // وتعيد التمركز على محافظة الاكتشاف الجديدة (تذكرة #124).
  if (leafletMap) initLeafletMap({ focusRegion: true });

  // دليل الخدمات بعد أول فتح لتبويبه.
  if (servicesInitialized) fetchServiceProviders();

  // صفحة الألبومات إن كانت مفتوحة (بحثاً أو قائمة).
  if (isAlbumsPageOpen()) {
    if (albumsSearchQuery) runAlbumsSearch();
    else loadAlbumsList(1);
  }
}

/** يزيل دبابيس الخريطة الحالية — بلا خريطة لا شيء يُزال. */
function clearMapMarkers() {
  if (leafletMap) mapMarkers.forEach(marker => leafletMap.removeLayer(marker));
  mapMarkers = [];
}

/**
 * يملأ منتقي المحافظة المنسدل (#124) من المحافظات **النشطة** (تذكرة #127:
 * الموقوفة مكانٌ لا تُنشر فيه مناسبة). الخيار الفارغ
 * أولاً يمنع إرسال محافظة بلا اختيار صريح — العميل هو من يُلزم بها، والخادم
 * يقبل region_id اختيارياً (#120). قيمة حالية غير نشطة (محافظة أُوقفت بعد
 * النشر) تُضاف مختارةً بنفس قاعدة populateTownSelect، فلا يضيع تعديل بلا سبب.
 */
function populateRegionSelect(selectId, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const options = activeRegionsList().map(r => ({ value: String(r.id), label: r.name }));
  if (selectedValue !== null && selectedValue !== undefined && !options.some(o => o.value === String(selectedValue))) {
    options.push({ value: String(selectedValue), label: 'المحافظة الحالية' });
  }
  select.innerHTML = '<option value="">اختر المحافظة</option>' +
    options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  if (selectedValue !== null && selectedValue !== undefined) select.value = String(selectedValue);
}

/** مجموعة المحافظة في نموذج النشر — تُلحَق بعد القرية وتظهر تحت البند الجامع وحده. */
function publishRegionGroupHtml() {
  return `
    <div class="form-group" id="addRegionGroup" style="display:none;">
      <label>المحافظة *</label>
      <select id="addRegion" onchange="handleAddRegionChange()"></select>
      <p class="location-picker-hint">تُنسب المناسبة والقرية إلى المحافظة المختارة.</p>
    </div>`;
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
 * منظر عام للنقب بلا دبّوس، والمستخدم مطالَب بوضعه بنفسه. والمنطقة نفسها
 * («النقب — بلا بلدة محدّدة») تُفتح على مركزها وتكبيرها بلا دبّوس أيضاً —
 * دبّوس في وسط منطقة دبّوس خاطئ — ويُزال دبّوس تلقائي بقي من بلدة سابقة.
 */
function recenterLocationPicker() {
  if (!locationPickerMap) return;
  const town = document.getElementById('addTown').value;
  const coords = townCoordinates[town];
  const region = findRegionByName(town);

  if (coords) {
    locationPickerMap.setView([coords.lat, coords.lng], 14);
    if (!pickerPinPlacedByUser) placePickerMarker(coords.lat, coords.lng);
  } else if (region) {
    locationPickerMap.setView([region.latitude, region.longitude], region.map_zoom);
    if (!pickerPinPlacedByUser) clearPickerMarker();
  } else {
    // بلا مركز («القرى والتجمعات» قبل اختيار القرية): الدبّوس التلقائي للبلدة
    // السابقة لم يعد يصف المكان، فلا يُرسَل مع المناسبة.
    const view = neutralPickerView();
    locationPickerMap.setView(view.center, view.zoom);
    if (!pickerPinPlacedByUser) clearPickerMarker();
  }
}

/** منظر عام بلا بلدة: مركز المنطقة الأولى وتكبيرها متى وصلت المناطق، وإلا الثابت الاحتياطي. */
function neutralPickerView() {
  // محافظة **نشطة** (تذكرة #127): منظر منتقي مكان النشر لا يقف على محافظة
  // موقوفة «قريباً» لا يُنشر فيها شيء.
  const region = activeRegionsList()[0];
  if (region) return { center: [region.latitude, region.longitude], zoom: region.map_zoom };
  return { center: NEGEV_NEUTRAL_CENTER, zoom: 9 };
}

async function initLocationPickerMap() {
  const mapElement = document.getElementById('addLocationPickerMap');
  if (!mapElement) return;

  await loadTownCoordinates();

  if (!locationPickerMap) {
    const view = neutralPickerView();
    locationPickerMap = L.map('addLocationPickerMap').setView(view.center, view.zoom);

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
  const text = encodeURIComponent(`🎉 تهنئة مباركة:\n\n${line1}\n${line2}\n\nعبر تطبيق وموقع مناسبات منطقتك: ${window.location.origin}`);
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
//
// الشريط السفلي بست خانات (من اليمين في RTL):
// المناسبات · خدماتنا · [زرّ الوسط الذهبي — ليس تبويباً] · خدمات الأعراس · مناسباتي · حسابي.
// زرّ الوسط يفتح ورقة «مميّز عندنا»؛ أزرار التبويب الخمسة تملك الصنف `.nav-btn`.
const BOTTOM_NAV_INDEX = {
  tabHome: 0,
  tabOurServices: 1,
  tabServices: 2,
  tabMyList: 3,
  tabAccount: 4
};

function switchTab(tabId) {
  if (tabId === 'tabAdd' && !requireAuth({ type: 'publish' })) return;
  closeFeaturedMenu({ restoreFocus: false });

  const homeTab = document.getElementById('tabHome');
  const wasOnHome = !!(homeTab && homeTab.classList.contains('active-tab'));
  if (wasOnHome && tabId !== 'tabHome') feedScrollMemory = feedScrollPosition();
  const feedToRestore = tabId === 'tabHome' && !wasOnHome ? feedScrollMemory : null;

  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-tab'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active-tab');

  const navIndex = BOTTOM_NAV_INDEX[tabId];
  const navBtns = document.querySelectorAll('.bottom-navbar .nav-btn');
  if (navIndex !== undefined && navBtns[navIndex]) {
    const activeBtn = navBtns[navIndex];
    activeBtn.classList.add('active');
    const navBar = activeBtn.parentElement;
    if (navBar && navBar.scrollWidth > navBar.clientWidth && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  }

  if (feedToRestore) window.scrollTo(0, feedToRestore.page);
  else window.scrollTo({ top: 0, behavior: 'smooth' });

  // صوت التغذية يخصّ تبويبها وحده — مغادرته توقفه، والعودة إليه تستأنف الكرت النشِط.
  if (tabId === 'tabHome') autoplayActiveFeedCard();
  else pauseCurrentAudio();

  if (tabId === 'tabHome') {
    updateFeedDimensions();
    const feed = document.getElementById('eventsContainer');
    if (feedToRestore && feed) feed.scrollTop = feedToRestore.feed;
    feedScrollMemory = null;
    if (storiesForPlacement('promo').length > 1) renderStoryCarousel();
    startFeaturedAutoAdvance();
  } else {
    stopHomeCarouselTimers();
  }

  if (tabId === 'tabNokoot') loadNokootView();
  else if (tabId === 'tabMyList') loadMyListView();
  else if (tabId === 'tabAccount') loadAccountView();
  else if (tabId === 'tabStickers') renderStickerCanvas();
  else if (tabId === 'tabMap') initLeafletMap();
  else if (tabId === 'tabAdd') {
    if (!publishFormReady) initPublishForm();
    fetchMyEvents();
  } else if (tabId === 'tabOurServices') {
    // التحقين هنا لا في `openOurServices` وحدها: الرابط العميق `?tab=ourServices`
    // يصل `switchTab` مباشرةً (`initUrlNavigation`)، فلو بقي في الدالة الأخرى
    // لفتح رابطُ المشاركة التبويبَ بلا أدوات. والتحقين لا يجلب شيئاً — الجلب
    // عند أول فتح لأداة وحدها. وقسم «مواقيت الصلاة» (M3-C) يُحقن هنا أيضاً،
    // ويُعيد جلب المواقيت في كل زيارة للوجهة.
    initPricesTools();
    initPrayerTimesTool();
  } else if (tabId === 'tabServices') {
    if (!servicesInitialized) { servicesInitialized = true; initServicesTab(); }
  }
}

function openAddEventModal() {
  if (!requireAuth({ type: 'publish' })) return;
  switchTab('tabAdd');
}

/**
 * وجهة «خدماتنا» — تُفعَّل عبر `switchTab` وحدها، وفيه تحقين قسم الأسعار
 * (#189). جلب الأسعار نفسها لا يقع عند الفتح: أول فتح لأداة هو ما ينادي
 * `/api/prices`، والطلب الثاني خلال ساعة يخدمه كاش الخادم.
 */
function openOurServices() {
  switchTab('tabOurServices');
}

// 10a. ورقة «مميّز عندنا» (S1: ورقة سفلية من زرّ الوسط الذهبي)
const STORES_PLATFORM_URL = 'https://kolshee.ktra-pro.tech/';
const SPECIAL_MENU_ITEMS = [
  { id: 'card', title: 'صمّم بطاقة دعوتك', desc: '١٢ قالباً جاهزاً، شاركها بالواتساب', icon: '💌', hero: true },
  { id: 'gold', title: 'حاسبة الذهب', desc: 'سعر الغرام اليوم', icon: '🪙', hero: false },
  { id: 'fx', title: 'محوّل العملات', desc: 'شيكل، دولار، دينار، يورو', icon: '💱', hero: false },
  { id: 'albums', title: 'ألبومات الأعراس', desc: 'صور وفيديوهات أعراس بلدك', icon: '📸', hero: false },
  { id: 'live', title: 'البث المباشر', desc: 'شاهد البث والحلقات السابقة', icon: '📡', hero: false },
  { id: 'news', title: 'آخر خبر', desc: 'أخبار محافظتك', icon: '📰', hero: false },
  { id: 'stores', title: 'متاجرنا', desc: 'منصّة كترا للمتاجر', icon: '🛍️', hero: false },
  { id: 'nokoot', title: 'دفتر النقوط', desc: 'سجّل النقوط اللي عليك واللي إلك', icon: '📒', hero: false }
];

function renderSheetGrid() {
  const panel = document.getElementById('featuredMenuPanel');
  if (!panel) return;
  const hero = SPECIAL_MENU_ITEMS[0];
  const others = SPECIAL_MENU_ITEMS.slice(1);

  panel.innerHTML = `
    <div class="featured-sheet-head" id="featuredMenuDragHandle">
      <div class="featured-sheet-handle" aria-hidden="true"></div>
      <div class="featured-sheet-title-row">
        <h2 class="featured-sheet-title" id="featuredMenuTitle">مميّز عندنا</h2>
        <button type="button" class="featured-sheet-close" onclick="closeFeaturedMenu()" aria-label="إغلاق">×</button>
      </div>
    </div>
    <button type="button" class="featured-hero-card" data-special-id="${hero.id}" onclick="selectSpecialMenuItem('${hero.id}')">
      <div class="featured-hero-icon" aria-hidden="true">${hero.icon}</div>
      <div class="featured-hero-text">
        <div class="featured-hero-title">${hero.title}</div>
        <div class="featured-hero-desc">${hero.desc}</div>
      </div>
    </button>
    <div class="featured-sheet-grid">
      ${others.map(item => `
        <button type="button" class="featured-grid-item" data-special-id="${item.id}" onclick="selectSpecialMenuItem('${item.id}')">
          <span class="featured-grid-icon" aria-hidden="true">${item.icon}</span>
          <span class="featured-grid-title">${item.title}</span>
          <span class="featured-grid-desc">${item.desc}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function initFeaturedSheetDrag() {
  const handle = document.getElementById('featuredMenuDragHandle');
  const panel = document.getElementById('featuredMenuPanel');
  if (!handle || !panel) return;

  let dragging = false;
  let startY = 0;
  let deltaY = 0;

  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.featured-sheet-close')) return;
    dragging = true;
    startY = e.clientY;
    deltaY = 0;
    panel.style.transition = 'none';
    if (handle.setPointerCapture) {
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    }
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    deltaY = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${deltaY}px)`;
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = 'transform 0.2s ease';
    if (deltaY > 75) {
      closeFeaturedMenu();
    } else {
      panel.style.transform = '';
    }
  };

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}

function handleFeaturedMenuKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeFeaturedMenu();
  }
}

function openFeaturedMenu() {
  const backdrop = document.getElementById('featuredMenuBackdrop');
  const panel = document.getElementById('featuredMenuPanel');
  const trigger = document.getElementById('navBtnFeaturedMenu');
  if (!backdrop || !panel) return;

  featuredMenuReturnFocusEl = (typeof document !== 'undefined' && document.activeElement) || trigger;
  featuredMenuOpen = true;
  renderSheetGrid();
  backdrop.hidden = false;
  panel.style.transform = '';
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', handleFeaturedMenuKeydown);
  initFeaturedSheetDrag();

  const closeBtn = panel.querySelector('.featured-sheet-close');
  if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
  else if (typeof panel.focus === 'function') panel.focus();
}

function closeFeaturedMenu({ restoreFocus = true } = {}) {
  const backdrop = document.getElementById('featuredMenuBackdrop');
  const panel = document.getElementById('featuredMenuPanel');
  const trigger = document.getElementById('navBtnFeaturedMenu');
  const wasOpen = featuredMenuOpen || (backdrop && !backdrop.hidden);
  featuredMenuOpen = false;
  if (backdrop) backdrop.hidden = true;
  if (panel) panel.style.transform = '';
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', handleFeaturedMenuKeydown);

  if (wasOpen && restoreFocus) {
    const target = (featuredMenuReturnFocusEl && typeof featuredMenuReturnFocusEl.focus === 'function')
      ? featuredMenuReturnFocusEl
      : trigger;
    if (target && typeof target.focus === 'function') target.focus();
  }
  featuredMenuReturnFocusEl = null;
}

function scrollPricesSectionIntoView(panelId) {
  const target = document.getElementById(panelId) || document.getElementById('pricesToolsSection');
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function selectSpecialMenuItem(itemId) {
  closeFeaturedMenu({ restoreFocus: false });

  if (itemId === 'card') {
    switchTab('tabMyList');
    if (!(currentUser && authToken)) requireAuth({ type: 'my_list' });
  } else if (itemId === 'gold') {
    openOurServices();
    openPricesTool('gold');
    scrollPricesSectionIntoView('pricesPanelGold');
  } else if (itemId === 'fx') {
    openOurServices();
    openPricesTool('fx');
    scrollPricesSectionIntoView('pricesPanelFx');
  } else if (itemId === 'albums') {
    openAlbumsPage();
  } else if (itemId === 'live') {
    openLiveSection();
  } else if (itemId === 'news') {
    openNewsScreen();
  } else if (itemId === 'stores') {
    window.open(STORES_PLATFORM_URL, '_blank', 'noopener');
  } else if (itemId === 'nokoot') {
    switchTab('tabNokoot');
    if (!(currentUser && authToken)) requireAuth({ type: 'nokoot' });
  }
}

// 10b. حاسبات «خدماتنا» (تذكرة #190) — خمس حاسبات تعمل في الجهاز وحده:
// ميزانية العرس، تقسيم المصاريف، عدد المعازيم، العدّ التنازلي، والتاريخ الهجري.
// لا نداء /api ولا fetch هنا إطلاقاً، ولا حفظ: كل مدخل يبقى في الصفحة وحدها،
// فيعمل **هذا القسم** بلا شبكة وبلا خادم — وليس التبويب كله: قسم الأسعار تحته
// (#189) يجلب من `/api/prices` عند فتح أداته. وكل حاسبة تتحقّق من مدخلاتها
// بنفسها وتعود برسالة عربية واحدة في نتيجتها: نجاحاً أو خطأً — ولا NaN ولا Infinity.

/** يحوّل الأرقام اللاتينية في نصّ إلى نظيراتها العربية الهندية. */
function calcDigits(text) {
  return String(text).replace(/[0-9]/g, digit => CALC_ARABIC_DIGITS[Number(digit)]);
}

/** أرقام عربية هندية مع فاصل آلاف `٬` (والمشروع كله يكتب أرقامه هكذا). */
function calcGroupDigits(digits) {
  return String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
}

/** الأرقام العربية الهندية في نصّ إلى لاتينية، كي يقبل الحقل ما يكتبه العربي. */
function calcLatinDigits(text) {
  return String(text).replace(/[٠-٩]/g, char => String(CALC_ARABIC_DIGITS.indexOf(char)));
}

/** عدد صحيح مهيّأ للعرض: ٢٤٠، ١٬٢٥٠. */
function calcCount(value) {
  return calcDigits(calcGroupDigits(String(value)));
}

/** مبلغ بالأغورة (عدد صحيح) إلى نصّ بالشيكل: ٢٬٥٠٠ ₪ أو ٣٣٫٥٠ ₪. */
function calcMoney(cents) {
  const value = Math.max(0, Math.round(cents));
  const shekels = calcGroupDigits(String(Math.floor(value / 100)));
  const agorot = value % 100;
  return `${calcDigits(agorot ? `${shekels}٫${String(agorot).padStart(2, '0')}` : shekels)} ₪`;
}

/**
 * صيغة العدد في العربية: مفرد ومثنّى وجمع قِلّة (٣-١٠) وجمع كثرة — بصيغة
 * الجرّ لأن كل استعمالاتها تلي حرفاً («على ٣ بنود»، «بين شخصين»).
 */
function calcCountPhrase(count, forms) {
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  if (count >= 3 && count <= 10) return `${calcDigits(count)} ${forms.few}`;
  return `${calcDigits(count)} ${forms.many}`;
}

/** أيام: يوم واحد، يومين، ٣ أيام، ٤٥ يوماً. */
function calcDaysPhrase(days) {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومين';
  if (days >= 3 && days <= 10) return `${calcDigits(days)} أيام`;
  return `${calcDigits(days)} يوماً`;
}

/** ١٠ أبريل ٢٠٢٤ — بلا اسم اليوم، فاليوم يُذكر حيث يلزم وحده. */
function calcGregorianDate(date) {
  return `${calcDigits(date.getDate())} ${CALC_GREGORIAN_MONTHS[date.getMonth()]} ${calcDigits(date.getFullYear())}`;
}

/**
 * يقرأ مبلغاً مكتوباً ويعيده أغورة: أرقام لاتينية أو عربية، وفاصلا آلاف
 * `٬` و`,` يُتجاهلان. يعيد `{ cents }` أو `{ error }` برسالة عربية — ورسالة
 * الفراغ تختلف عن رسالة النصّ والسالب كي يعرف المستخدم ما يصحّح.
 */
function parseCalcAmount(raw) {
  const text = calcLatinDigits(String(raw == null ? '' : raw).trim()).replace(/[٬,،\s]/g, '');
  if (!text) return { error: 'اكتب المبلغ' };
  if (text.startsWith('-')) return { error: 'المبلغ لا يكون سالباً' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: 'المبلغ بالأرقام فقط (مثل ١٥٠٠)' };
  const value = Number(text);
  // حدّ عملي يمنع Infinity وتجاوز دقّة الأعداد الصحيحة في JavaScript.
  if (!Number.isFinite(value) || value > 100000000) return { error: 'المبلغ كبير جداً' };
  return { cents: Math.round(value * 100) };
}

/**
 * يقرأ عدداً صحيحاً غير سالب. الفراغ صفر مسموح (حقول التقدير اختيارية)، وما
 * عداه يُرفض برسالة تحمل اسم الحقل نفسه.
 */
function parseCalcCount(raw, label) {
  const text = calcLatinDigits(String(raw == null ? '' : raw).trim()).replace(/[٬,،\s]/g, '');
  if (!text) return { value: 0 };
  if (text.startsWith('-')) return { error: `${label}: العدد لا يكون سالباً` };
  if (!/^\d+$/.test(text)) return { error: `${label}: العدد بالأرقام فقط` };
  const value = Number(text);
  if (!Number.isFinite(value) || value > 100000) return { error: `${label}: العدد كبير جداً` };
  return { value };
}

/**
 * يقرأ `YYYY-MM-DD` ويتحقّق من وجود اليوم نفسه في التقويم: `2026-02-31` يعود
 * على `Date` يوم ٣ مارس، فيُكشف بمقارنة اليوم والشهر بعد الإنشاء. والفراغ
 * رسالته مختلفة عن التاريخ المشوّه وعن غير الموجود.
 */
function parseCalcDate(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { error: 'اختر تاريخاً أولاً من التقويم' };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return { error: 'التاريخ غير صحيح — اختره من التقويم' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { error: 'هذا التاريخ غير موجود' };
  }
  return { date };
}

/** يكتب نتيجة الحاسبة نصاً — لا HTML، فأسماء المستخدمين لا تُفسَّر وسوماً. */
function setCalcResult(element, message, { error = false } = {}) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', error);
}

/** يقرأ قيمة حقل بالمعرّف، وفارغ إن لم يكن في الصفحة. */
function readCalcInput(id) {
  const input = document.getElementById(id);
  return input ? input.value : '';
}

/**
 * يفتح لوحة حاسبة واحدة ويطفئ البقية — الرقاقة النشِطة وحدها `aria-selected`.
 * والإطفاء يمسّ **كل** لوحات `#tabOurServices` (`hideToolPanels`)، فلوحة
 * الأسعار المخفية لا تبقى ظاهرة تحت لوحة حاسبة.
 */
function openCalculator(key) {
  if (!CALCULATOR_KEYS.includes(key)) return;
  hideToolPanels();
  const suffix = key.charAt(0).toUpperCase() + key.slice(1);
  const panel = document.getElementById(`calcPanel${suffix}`);
  const tab = document.getElementById(`calcTab${suffix}`);
  if (panel) panel.hidden = false;
  if (tab) tab.setAttribute('aria-selected', 'true');
  // حقل التاريخ يبدأ بيوم اليوم عند أول فتح — والحاسبة تقرأ ما فيه وحده.
  const dateInputId = key === 'countdown' ? 'calcCountdownDate' : (key === 'hijri' ? 'calcHijriDate' : '');
  if (dateInputId) {
    const dateInput = document.getElementById(dateInputId);
    if (dateInput && !dateInput.value) dateInput.value = isoLocalDay(new Date());
  }
}
/** صفّ بند جديد في ميزانية العرس — القالب ثابت، وقيمه تُقرأ وقت الحساب. */
function addCalcBudgetRow() {
  const box = document.getElementById('calcBudgetRows');
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'calc-row';
  row.innerHTML = '<input type="text" class="calc-input calc-budget-name" placeholder="اسم البند" aria-label="اسم البند">'
    + '<input type="text" inputmode="decimal" class="calc-input calc-budget-amount" placeholder="المبلغ (₪)" aria-label="مبلغ البند">'
    + '<button type="button" class="calc-row-remove" onclick="removeCalcRow(this)" aria-label="حذف البند"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>';
  box.appendChild(row);
  const input = row.querySelector('.calc-budget-name');
  if (input) input.focus();
}

/** صفّ شخص جديد في تقسيم المصاريف. */
function addCalcSplitRow() {
  const box = document.getElementById('calcSplitRows');
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'calc-row';
  row.innerHTML = '<input type="text" class="calc-input calc-split-name" placeholder="اسم الشخص" aria-label="اسم الشخص">'
    + '<input type="text" inputmode="decimal" class="calc-input calc-split-paid" placeholder="دفع (₪)" aria-label="ما دفعه الشخص">'
    + '<button type="button" class="calc-row-remove" onclick="removeCalcRow(this)" aria-label="حذف الشخص"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>';
  box.appendChild(row);
  const input = row.querySelector('.calc-split-name');
  if (input) input.focus();
}

/** حذف صفّ من أي قائمة بنود — الزرّ نفسه يعرف صفّه. */
function removeCalcRow(button) {
  const row = button && button.closest ? button.closest('.calc-row') : null;
  if (row) row.remove();
}

/** ١ — ميزانية العرس: مجموع البنود، بلا سقف ميزانية هنا (بند وبند فقط). */
function calculateBudget() {
  const box = document.getElementById('calcBudgetRows');
  const result = document.getElementById('calcBudgetResult');
  if (!box || !result) return;

  const rows = Array.from(box.querySelectorAll('.calc-row'));
  if (!rows.length) {
    setCalcResult(result, 'أضف بنداً واحداً على الأقل — لا شيء يُجمع حتى الآن.', { error: true });
    return;
  }

  let totalCents = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const nameInput = rows[index].querySelector('.calc-budget-name');
    const amountInput = rows[index].querySelector('.calc-budget-amount');
    const name = nameInput ? nameInput.value.trim() : '';
    const label = `الصف ${calcDigits(index + 1)}`;
    if (!name) {
      setCalcResult(result, `${label}: اكتب اسم البند أولاً.`, { error: true });
      return;
    }
    const amount = parseCalcAmount(amountInput ? amountInput.value : '');
    if (amount.error) {
      setCalcResult(result, `${label} «${name}»: ${amount.error}.`, { error: true });
      return;
    }
    totalCents += amount.cents;
  }

  const count = calcCountPhrase(rows.length, { one: 'بند واحد', two: 'بندين', few: 'بنود', many: 'بنداً' });
  setCalcResult(result, `مجموع ميزانية العرس ${calcMoney(totalCents)} على ${count}.`);
}

/**
 * يسوّي مصاريف مجموعة أشخاص دفعوا مبالغ مختلفة: المجموع يُقسَّم بالتساوي، ثم
 * أقلّ عدد تحويلات ممكن (المدين الأكبر إلى الدائن الأكبر حتى ينتهي الطرفان).
 *
 * الحساب بالأغورة (أعداد صحيحة) كي لا يضيع أوغر واحد في التقريب: الباقي
 * يُضاف أوغراً واحداً لأوائل الصفوف، فيبقى مجموع الحصص مساوياً للمجموع تماماً.
 * يعيد `{ totalCents, shareCents, transfers }` أو `{ error }` برسالة عربية.
 */
function splitSettlement(people) {
  const totalCents = people.reduce((sum, person) => sum + person.paidCents, 0);
  if (!people.length || totalCents <= 0) {
    return { error: 'مجموع ما دفعه الجميع صفر — لا شيء يُقسَّم.' };
  }

  const base = Math.floor(totalCents / people.length);
  const remainder = totalCents % people.length;
  const creditors = [];
  const debtors = [];
  people.forEach((person, index) => {
    const share = base + (index < remainder ? 1 : 0);
    const difference = person.paidCents - share;
    if (difference > 0) creditors.push({ name: person.name, cents: difference });
    else if (difference < 0) debtors.push({ name: person.name, cents: -difference });
  });

  creditors.sort((left, right) => right.cents - left.cents);
  debtors.sort((left, right) => right.cents - left.cents);

  const transfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const paid = Math.min(debtors[debtorIndex].cents, creditors[creditorIndex].cents);
    if (paid > 0) {
      transfers.push({ from: debtors[debtorIndex].name, to: creditors[creditorIndex].name, cents: paid });
    }
    debtors[debtorIndex].cents -= paid;
    creditors[creditorIndex].cents -= paid;
    if (debtors[debtorIndex].cents === 0) debtorIndex += 1;
    if (creditors[creditorIndex].cents === 0) creditorIndex += 1;
  }

  return { totalCents, shareCents: base, transfers };
}

/** ٢ — تقسيم المصاريف: يتحقّق من الصفوف ثم يعرض خطة التسوية نصاً. */
function calculateSplit() {
  const box = document.getElementById('calcSplitRows');
  const result = document.getElementById('calcSplitResult');
  if (!box || !result) return;

  const rows = Array.from(box.querySelectorAll('.calc-row'));
  if (!rows.length) {
    setCalcResult(result, 'أضف شخصاً واحداً على الأقل.', { error: true });
    return;
  }
  if (rows.length === 1) {
    setCalcResult(result, 'شخص واحد فقط — لا شيء يُقسَّم عليه.', { error: true });
    return;
  }

  const people = [];
  for (let index = 0; index < rows.length; index += 1) {
    const nameInput = rows[index].querySelector('.calc-split-name');
    const paidInput = rows[index].querySelector('.calc-split-paid');
    const name = nameInput ? nameInput.value.trim() : '';
    const label = `الصف ${calcDigits(index + 1)}`;
    if (!name) {
      setCalcResult(result, `${label}: اكتب اسم الشخص أولاً.`, { error: true });
      return;
    }
    const amount = parseCalcAmount(paidInput ? paidInput.value : '');
    if (amount.error) {
      setCalcResult(result, `${label} «${name}»: ${amount.error}.`, { error: true });
      return;
    }
    people.push({ name, paidCents: amount.cents });
  }

  const plan = splitSettlement(people);
  if (plan.error) {
    setCalcResult(result, plan.error, { error: true });
    return;
  }

  const peoplePhrase = calcCountPhrase(people.length, { one: 'شخص واحد', two: 'شخصين', few: 'أشخاص', many: 'شخصاً' });
  const summary = `مجموع المصاريف ${calcMoney(plan.totalCents)} على ${peoplePhrase} — حصّة كل شخص نحو ${calcMoney(plan.shareCents)}.`;
  const settlement = plan.transfers.length
    ? `التسوية: ${plan.transfers.map(transfer => `${transfer.from} يدفع إلى ${transfer.to} ${calcMoney(transfer.cents)}`).join(' · ')}.`
    : 'لا تسوية لازمة — كلٌّ دفع حصّته.';
  setCalcResult(result, `${summary} ${settlement}`);
}

/** ٣ — عدد المعازيم: عائلات × متوسطها + طاولات × متوسطها، وحقل فارغ صفر. */
function calculateGuests() {
  const result = document.getElementById('calcGuestsResult');
  if (!result) return;

  const families = parseCalcCount(readCalcInput('calcGuestsFamilies'), 'عدد العائلات');
  if (families.error) return setCalcResult(result, families.error, { error: true });
  const perFamily = parseCalcCount(readCalcInput('calcGuestsPerFamily'), 'متوسط المدعوين لكل عائلة');
  if (perFamily.error) return setCalcResult(result, perFamily.error, { error: true });
  const tables = parseCalcCount(readCalcInput('calcGuestsTables'), 'عدد الطاولات');
  if (tables.error) return setCalcResult(result, tables.error, { error: true });
  const perTable = parseCalcCount(readCalcInput('calcGuestsPerTable'), 'الجالسون على الطاولة');
  if (perTable.error) return setCalcResult(result, perTable.error, { error: true });

  const fromFamilies = families.value * perFamily.value;
  const fromTables = tables.value * perTable.value;
  const total = fromFamilies + fromTables;
  if (total <= 0) {
    setCalcResult(result, 'أدخل عدداً أكبر من صفر في أحد الحقول — لا شيء يُقدَّر.', { error: true });
    return;
  }

  const parts = [];
  if (fromFamilies > 0) {
    parts.push(`العائلات ${calcCount(families.value)} × ${calcCount(perFamily.value)} = ${calcCount(fromFamilies)}`);
  }
  if (fromTables > 0) {
    parts.push(`الطاولات ${calcCount(tables.value)} × ${calcCount(perTable.value)} = ${calcCount(fromTables)}`);
  }
  setCalcResult(result, `تقدير عدد المعازيم: ${calcCount(total)} — ${parts.join('، و')}.`);
}

/** ٤ — العدّ التنازلي: أيام تبقّت (أو مضت) بين اليوم المحلي وتاريخ مختار. */
function calculateCountdown() {
  const result = document.getElementById('calcCountdownResult');
  if (!result) return;

  const parsed = parseCalcDate(readCalcInput('calcCountdownDate'));
  if (parsed.error) return setCalcResult(result, parsed.error, { error: true });

  const chosen = parsed.date;
  const now = new Date();
  // منتصف ليل اليومين بتوقيت UTC: فروق التواريخ لا تتأثّر بساعة الصيف.
  const days = Math.round(
    (Date.UTC(chosen.getFullYear(), chosen.getMonth(), chosen.getDate())
      - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  const dateText = `الموعد يوم ${CALC_WEEKDAYS[chosen.getDay()]} ${calcGregorianDate(chosen)}`;

  if (days > 0) setCalcResult(result, `بقي ${calcDaysPhrase(days)} على الموعد — ${dateText}.`);
  else if (days === 0) setCalcResult(result, `الموعد اليوم — ${dateText}.`);
  else setCalcResult(result, `مضى الموعد منذ ${calcDaysPhrase(-days)} (${dateText}).`);
}

/**
 * ٥ — التاريخ الهجري: تقويم أم القرى حسابياً بالخوارزمية الكويتية الجدولية —
 * يوم يولياني (Julian Day Number) من الميلادي، ثم تحويله هجرياً بدورة ٣٠ سنة
 * فيها ١١ سنة كبيسة، بالمعادلات الجدولية المعروفة (l و n و j في الدالة).
 * النتيجة تقريبية بيوم على الأكثر، والتنبيه «تقريبي ±يوم» ظاهر في اللوحة.
 */
function hijriFromJulianDay(julianDay) {
  const l = julianDay - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  let l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719)
    + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  l2 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l2) / 709);
  return {
    year: 30 * n + j - 30,
    month,
    day: l2 - Math.floor((709 * month) / 24)
  };
}

/** يوم ميلادي (محلي) إلى هجري: الرقم اليولياني للتاريخ ثم الجدول. */
function gregorianToHijri(date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  const day = date.getDate();
  if (month < 3) {
    year -= 1;
    month += 12;
  }
  const century = Math.floor(year / 100);
  const correction = 2 - century + Math.floor(century / 4);
  const julianDay = Math.floor(365.25 * (year + 4716))
    + Math.floor(30.6001 * (month + 1))
    + day + correction - 1524;
  return hijriFromJulianDay(julianDay);
}

function calculateHijri() {
  const result = document.getElementById('calcHijriResult');
  if (!result) return;

  const parsed = parseCalcDate(readCalcInput('calcHijriDate'));
  if (parsed.error) return setCalcResult(result, parsed.error, { error: true });

  const hijri = gregorianToHijri(parsed.date);
  setCalcResult(
    result,
    `${CALC_WEEKDAYS[parsed.date.getDay()]} ${calcDigits(hijri.day)} ${CALC_HIJRI_MONTHS[hijri.month - 1]} ${calcDigits(hijri.year)}هـ — يوافق ${calcGregorianDate(parsed.date)}.`
  );
}

// ---------------------------------------------------------------------------
// «أسعار الذهب والعملات» (#189) — حاسبة الذهب ومحوّل العملات.
//
// بخلاف الحاسبات الخمس (#190) هاتان تقرآن `GET /api/prices` عند أول فتح (ولا
// نداء ثانياً: الخادم يكاشه ساعة)، لكن الحساب كلّه هنا في الجهاز كما فيهن.
// و**جسم الأداة وتاريخها يختفيان معاً حين لا تصل الأسعار** — لا حاسبة بسعر
// مخترع ولا تاريخ فارغ، بل رسالة عربية واحدة تقول لماذا.
//
// القسم كله يُحقن في `#tabOurServices` من هذا الملف لا من `index.html`: وسم
// التبويب هناك يبقى كما هو فلا يُعاد تحريره لمجموعة أدوات، والتخطيط بأصناف
// `styles.css` القائمة نفسها (`calc-*`) فلا تخطيط جديد. والتحقين في `switchTab`
// عند تفعيل الوجه، فيصل إليه الرابط العميق `?tab=ourServices` أيضاً.
// ---------------------------------------------------------------------------

/** لاحقة المعرّفات من مفتاح الأداة: gold ← Gold، fx ← Fx. */
function pricesToolSuffix(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * يحقن قسم الأداتين بعد قسم «حاسبات تهمّك» — مرّة واحدة، وبلا أي تغيير إن كان
 * موجوداً. تُستدعى من `switchTab('tabOurServices')` في كل زيارة للوجهة، ومنها
 * الرابط العميق `?tab=ourServices`؛ ولا تجلب شيئاً بنفسها.
 */
function initPricesTools() {
  const page = document.getElementById('tabOurServices');
  if (!page || document.getElementById('pricesToolsSection')) return;

  const section = document.createElement('section');
  section.className = 'calc-section';
  section.id = 'pricesToolsSection';
  section.setAttribute('aria-labelledby', 'pricesSectionTitle');
  section.innerHTML = `
    <h3 class="calc-section-title" id="pricesSectionTitle">أسعار الذهب والعملات</h3>
    <p class="calc-section-lead">سعر الذهب وسعر صرف العملات الست كما يعلنه مصدراهما، تُحسب بهما هنا في جهازك — ولا تُرسَل مدخلاتك إلى أحد.</p>
    <div class="calc-tabs" role="tablist" aria-label="اختر الأداة">
      <button type="button" class="prices-tab" id="pricesTabGold" role="tab" aria-selected="false" aria-controls="pricesPanelGold" onclick="openPricesTool('gold')">حاسبة الذهب</button>
      <button type="button" class="prices-tab" id="pricesTabFx" role="tab" aria-selected="false" aria-controls="pricesPanelFx" onclick="openPricesTool('fx')">محوّل العملات</button>
    </div>

    <div class="calc-panel" id="pricesPanelGold" role="tabpanel" aria-labelledby="pricesTabGold" hidden>
      <p class="calc-panel-lead">اكتب وزن الذهب بالغرام واختر عياره، وتظهر قيمة المعدن بلا مصنعية بسعر المصدر.</p>
      <p class="calc-status" id="pricesGoldStatus" role="status" aria-live="polite"></p>
      <div id="pricesGoldBody" hidden>
        <div class="calc-grid">
          <label class="calc-field"><span>الوزن (غرام)</span>
            <input type="text" inputmode="decimal" class="calc-input" id="pricesGoldWeight" placeholder="مثال: ٢١">
          </label>
          <label class="calc-field"><span>العيار</span>
            <select class="calc-input" id="pricesGoldKarat">
              <option value="24">عيار ٢٤</option>
              <option value="21">عيار ٢١</option>
              <option value="18">عيار ١٨</option>
            </select>
          </label>
        </div>
        <div class="calc-actions">
          <button type="button" class="calc-run" onclick="calculateGold()">احسب قيمة المعدن</button>
        </div>
        <div class="calc-result" id="pricesGoldResult" role="status" aria-live="polite"></div>
        <p class="calc-panel-lead" id="pricesGoldSource"></p>
      </div>
    </div>

    <div class="calc-panel" id="pricesPanelFx" role="tabpanel" aria-labelledby="pricesTabFx" hidden>
      <p class="calc-panel-lead">حوّل بين الشيكل والعملات الست بسعر الصرف المعلن — اختر العملة والاتجاه.</p>
      <p class="calc-status" id="pricesFxStatus" role="status" aria-live="polite"></p>
      <div id="pricesFxBody" hidden>
        <div class="calc-grid">
          <label class="calc-field"><span>المبلغ</span>
            <input type="text" inputmode="decimal" class="calc-input" id="pricesFxAmount" placeholder="مثال: ١٠٠٠">
          </label>
          <label class="calc-field"><span>العملة</span>
            <select class="calc-input" id="pricesFxCurrency"></select>
          </label>
        </div>
        <label class="calc-field"><span>اتجاه التحويل</span>
          <select class="calc-input" id="pricesFxDirection">
            <option value="to_foreign">من الشيكل إلى العملة</option>
            <option value="to_ils">من العملة إلى الشيكل</option>
          </select>
        </label>
        <div class="calc-actions">
          <button type="button" class="calc-run" onclick="convertCurrency()">حوّل</button>
        </div>
        <div class="calc-result" id="pricesFxResult" role="status" aria-live="polite"></div>
        <p class="calc-panel-lead" id="pricesFxSource"></p>
      </div>
    </div>`;

  const calcSection = page.querySelector('.calc-section');
  if (calcSection && calcSection.parentNode === page) {
    calcSection.insertAdjacentElement('afterend', section);
  } else {
    page.appendChild(section);
  }
}

/** يطفئ كل لوحات أدوات «خدماتنا» ورقاقاتها — حاسبةً كانت أو أداة أسعار. */
function hideToolPanels() {
  const page = document.getElementById('tabOurServices');
  if (!page) return;
  page.querySelectorAll('.calc-panel').forEach(panel => { panel.hidden = true; });
  page.querySelectorAll('.calc-tab, .prices-tab').forEach(tab => {
    tab.setAttribute('aria-selected', 'false');
  });
}

function openPricesTool(key) {
  if (!PRICES_TOOL_KEYS.includes(key)) return;
  const suffix = pricesToolSuffix(key);
  hideToolPanels();
  const panel = document.getElementById(`pricesPanel${suffix}`);
  const tab = document.getElementById(`pricesTab${suffix}`);
  if (panel) panel.hidden = false;
  if (tab) tab.setAttribute('aria-selected', 'true');
  ensurePricesLoaded();
}

/**
 * يجلب الأسعار مرّة، ويعيد الوعد الجاري إن كان هناك طلب في الطريق. الفشل لا
 * يرمي هنا: الحالة `pricesSnapshot = null` ومعها رسالة عربية في اللوحة، وإعادة
 * الفتح تعيد المحاولة بدل أن تُقفل الأداة أبدياً.
 */
function ensurePricesLoaded({ force = false } = {}) {
  if (pricesSnapshot && !force) return Promise.resolve(pricesSnapshot);
  if (pricesLoading) return pricesLoading;

  const request = (async () => {
    try {
      const res = await apiFetch('/api/prices');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.success !== true || !data.gold
        || !Array.isArray(data.currencies) || !data.currencies.length) {
        throw new Error('prices payload rejected');
      }
      pricesSnapshot = data;
    } catch (e) {
      pricesSnapshot = null;
    } finally {
      pricesLoading = null;
      renderPricesState();
    }
    return pricesSnapshot;
  })();

  pricesLoading = request;
  renderPricesState();
  return request;
}

/** نصّ الحالة العربي: أثناء الجلب، أو عند تعذّره — والجسم مخفي في الحالين. */
function renderPricesState() {
  const hasPrices = Boolean(pricesSnapshot);
  const message = hasPrices
    ? ''
    : (pricesLoading ? 'جارٍ جلب الأسعار…' : PRICES_UNAVAILABLE_TEXT);

  PRICES_TOOL_KEYS.forEach(key => {
    const suffix = pricesToolSuffix(key);
    const status = document.getElementById(`prices${suffix}Status`);
    const body = document.getElementById(`prices${suffix}Body`);
    if (status) {
      status.textContent = message;
      status.classList.toggle('is-error', !hasPrices && !pricesLoading);
    }
    if (body) body.hidden = !hasPrices;
  });

  if (hasPrices) fillPricesData();
}

/** تاريخ ميلادي مقروء من `YYYY-MM-DD` (بلا انزياح منطقة) — أو '' لغير المقروء. */
function pricesDayText(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return calcGregorianDate(date);
}

/**
 * تاريخ المصدر من ISO كما يرسله الخادم، بتقويم **UTC** الذي كُتبت به اللحظة —
 * لا بتوقيت جهاز الزائر: جهاز في أقصى الشرق كان يعرض «١٠ نوفمبر» لسعر ٩ نوفمبر،
 * والاختبار نفسه كان يتبع منطقة الجهاز. والتاريخ المعروض هنا تاريخ المصدر.
 */
function pricesTimestampText(timestamp) {
  const date = new Date(timestamp || '');
  if (Number.isNaN(date.getTime())) return '';
  return calcGregorianDate(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * يملأ ما يعتمد على البيانات وحدها: قائمة العملات وتاريخ المصدر في الأداتين.
 * الأسماء من الخادم تُكتب `textContent` لا قوالب HTML، فلا يصير اسم عملة وسماً.
 */
function fillPricesData() {
  if (!pricesSnapshot) return;

  const select = document.getElementById('pricesFxCurrency');
  if (select) {
    const previous = select.value;
    select.textContent = '';
    (pricesSnapshot.currencies || []).forEach(currency => {
      const option = document.createElement('option');
      option.value = String(currency.code || '');
      option.textContent = String(currency.name_ar || currency.code || '');
      select.appendChild(option);
    });
    if (previous && Array.from(select.options).some(option => option.value === previous)) {
      select.value = previous;
    }
  }

  const goldSource = document.getElementById('pricesGoldSource');
  if (goldSource) {
    const day = pricesTimestampText(pricesSnapshot.gold && pricesSnapshot.gold.source_time);
    goldSource.textContent = day
      ? `تاريخ سعر الذهب: ${day} — المصدر: gold-api.`
      : 'المصدر: gold-api.';
  }

  const fxSource = document.getElementById('pricesFxSource');
  if (fxSource) {
    const day = pricesDayText(pricesSnapshot.fx_date);
    fxSource.textContent = day
      ? `تاريخ سعر الصرف: ${day} — المصدر: Frankfurter.`
      : 'المصدر: Frankfurter.';
  }
}

/** رقم عشري إلى نصّ عربي بفاصلة عشرية `٫` وفاصل آلاف `٬` (٠٫٠٦٢٥، ١٬٢٥٠٫٥٠). */
function pricesNumber(value, digits) {
  const rounded = Math.round(value * (10 ** digits)) / (10 ** digits);
  const fixed = rounded.toFixed(digits);
  const [whole, fraction] = fixed.split('.');
  const grouped = calcGroupDigits(whole);
  return calcDigits(fraction ? `${grouped}٫${fraction}` : grouped);
}

/** يقرأ الوزن بالغرام: موجب، أرقام لاتينية أو عربية، وكسر عشري مسموح. */
function parsePricesWeight(raw) {
  const text = calcLatinDigits(String(raw == null ? '' : raw).trim()).replace(/[٬,،\s]/g, '');
  if (!text) return { error: 'اكتب الوزن بالغرام أولاً' };
  if (text.startsWith('-')) return { error: 'الوزن لا يكون سالباً' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: 'الوزن بالأرقام فقط (مثل ٢١)' };
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return { error: 'اكتب وزناً أكبر من صفر' };
  if (value > 100000) return { error: 'الوزن كبير جداً' };
  return { grams: value };
}

/**
 * حاسبة الذهب: الوزن × سعر غرام العيار من `/api/prices` — والحساب بالأغورة
 * (الوزن بأجزاء الألف) كي لا يضيع أغورة في كسر عائم.
 */
function calculateGold() {
  const result = document.getElementById('pricesGoldResult');
  if (!result) return;

  if (!pricesSnapshot || !pricesSnapshot.gold) {
    setCalcResult(result, PRICES_UNAVAILABLE_TEXT, { error: true });
    return;
  }

  const parsed = parsePricesWeight(readCalcInput('pricesGoldWeight'));
  if (parsed.error) return setCalcResult(result, parsed.error, { error: true });

  const select = document.getElementById('pricesGoldKarat');
  const karat = select ? String(select.value) : '24';
  const price = Number(pricesSnapshot.gold[`k${karat}`]);
  if (!Number.isFinite(price) || price <= 0) {
    setCalcResult(result, PRICES_UNAVAILABLE_TEXT, { error: true });
    return;
  }

  const weightThousandths = Math.round(parsed.grams * 1000);
  const priceAgorot = Math.round(price * 100);
  const totalAgorot = Math.round((weightThousandths * priceAgorot) / 1000);
  setCalcResult(
    result,
    `قيمة المعدن بلا مصنعية: ${calcMoney(totalAgorot)} — سعر غرام عيار ${calcDigits(karat)} نحو ${calcMoney(priceAgorot)}.`
  );
}

/** محوّل العملات: شيكل ← عملة أو عملة ← شيكل بسعر `ils_per_unit` نفسه. */
function convertCurrency() {
  const result = document.getElementById('pricesFxResult');
  if (!result) return;

  if (!pricesSnapshot || !Array.isArray(pricesSnapshot.currencies) || !pricesSnapshot.currencies.length) {
    setCalcResult(result, PRICES_UNAVAILABLE_TEXT, { error: true });
    return;
  }

  const amount = parseCalcAmount(readCalcInput('pricesFxAmount'));
  if (amount.error) return setCalcResult(result, amount.error, { error: true });

  const select = document.getElementById('pricesFxCurrency');
  const selected = select ? String(select.value) : '';
  const currency = pricesSnapshot.currencies.find(item => String(item.code) === selected);
  if (!currency || !(Number(currency.ils_per_unit) > 0)) {
    setCalcResult(result, 'اختر عملة من القائمة أولاً.', { error: true });
    return;
  }

  const rate = Number(currency.ils_per_unit);
  const amountValue = amount.cents / 100;
  const direction = document.getElementById('pricesFxDirection');
  const name = String(currency.name_ar || currency.code);

  if (direction && direction.value === 'to_ils') {
    const ilsAgorot = Math.round(amountValue * rate * 100);
    setCalcResult(
      result,
      `${pricesNumber(amountValue, 2)} ${name} = ${calcMoney(ilsAgorot)} بسعر ${pricesNumber(rate, 4)} ₪ للوحدة الواحدة.`
    );
    return;
  }

  const foreignValue = amountValue / rate;
  setCalcResult(
    result,
    `${calcMoney(amount.cents)} = ${pricesNumber(foreignValue, 2)} ${name} بسعر ${pricesNumber(rate, 4)} ₪ للوحدة الواحدة.`
  );
}

// ---------------------------------------------------------------------------
// «مواقيت الصلاة» (M3-C) — قسمٌ في «خدماتنا» بعد أداتَي الأسعار.
//
// **العميل لا يحسب وقت صلاة ولا يخترع وقتاً**: `GET /api/prayer-times` يعيد
// الأسماء والأوقات والطريقة والبلدة كما حسبها الخادم، وهذا الملف يعرضها فقط.
// و«الصلاة القادمة» وسطرها يُبنيان من `next.minutes_until` القادم من الخادم.
// القسم يُحقن من هنا على نمط أدوات الأسعار، فلا يتغيّر وسم التبويب في
// `index.html`، والجلب يقع في كل فتح للوجهة وفي كل تبديل بلدة وفي المحاولة.
// ---------------------------------------------------------------------------

/**
 * نصّ المهلة النسبية من دقائق الخادم: «٤٧ دقيقة»، «ساعة و١٢ دقيقة»،
 * «أقل من دقيقة» — بصيغة العدد العربية نفسها المستعملة في الحاسبات.
 */
function prayerRelativeText(minutesUntil) {
  const total = Math.round(Number(minutesUntil));
  if (!Number.isFinite(total) || total < 1) return 'أقل من دقيقة';
  if (total < 60) return prayerMinutesText(total);

  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const hourText = prayerHoursText(hours);
  return minutes ? `${hourText} و${prayerMinutesText(minutes)}` : hourText;
}

/** صيغة الدقائق وحدها: دقيقة، دقيقتان، ٣ دقائق، ١١ دقيقة. */
function prayerMinutesText(count) {
  if (count === 1) return 'دقيقة';
  if (count === 2) return 'دقيقتان';
  if (count >= 3 && count <= 10) return `${calcDigits(count)} دقائق`;
  return `${calcDigits(count)} دقيقة`;
}

/** صيغة الساعات وحدها: ساعة، ساعتان، ٣ ساعات، ١١ ساعة. */
function prayerHoursText(count) {
  if (count === 1) return 'ساعة';
  if (count === 2) return 'ساعتان';
  if (count >= 3 && count <= 10) return `${calcDigits(count)} ساعات`;
  return `${calcDigits(count)} ساعة`;
}

/** تاريخ `YYYY-MM-DD` صالح فعلاً — لا ٣٠ فبراير ولا شهراً ١٣. */
function prayerDayIsValid(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const date = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month, date));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month
    && parsed.getUTCDate() === date;
}

/** تاريخ المواقيت `YYYY-MM-DD` كما يعرضه القسم — أو '' لغير المقروء. */
function prayerDateText(day) {
  if (!prayerDayIsValid(day)) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return calcGregorianDate(date);
}

/**
 * هل الردّ يوماً كاملاً قابلاً للعرض؟ ستة مفاتيح فريدة من المفاتيح المتوقَّعة،
 * لكلٍّ اسم عربي من الخادم ووقت `HH:mm`، مع مكان وتاريخ ومنطقة زمنية وطريقة
 * حساب — فلا تُرسم بطاقة فيها صفّ فارغ أو حاشية بلا طريقة. هذا تحقّق حدّي
 * واحد، لا إطار تحقّق عام: الردّ غير الصالح يعود إلى رسالة الخطأ وزرّ المحاولة.
 */
function prayerTimesPayloadIsUsable(data) {
  if (!data || typeof data !== 'object' || data.success !== true) return false;

  const place = data.place;
  if (!place || typeof place !== 'object') return false;
  const placeName = typeof place.name === 'string' ? place.name.trim() : '';
  if (!placeName) return false;
  if (place.kind !== 'town' && place.kind !== 'region') return false;

  if (!prayerDayIsValid(data.date)) return false;
  if (typeof data.timezone !== 'string' || !data.timezone.trim()) return false;

  const method = data.method;
  if (!method || typeof method !== 'object') return false;
  if (typeof method.key !== 'string' || !method.key.trim()) return false;
  if (typeof method.name !== 'string' || !method.name.trim()) return false;

  if (!Array.isArray(data.times) || data.times.length !== PRAYER_TIMES_EXPECTED_KEYS.length) {
    return false;
  }

  const seen = new Set();
  for (const row of data.times) {
    if (!row || typeof row !== 'object') return false;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const time = typeof row.time === 'string' ? row.time.trim() : '';
    if (!PRAYER_TIMES_EXPECTED_KEYS.includes(key) || seen.has(key)) return false;
    if (!name || !PRAYER_TIME_PATTERN.test(time)) return false;
    seen.add(key);
  }
  return seen.size === PRAYER_TIMES_EXPECTED_KEYS.length;
}

/** اسم الصلاة القادمة: «فجر الغد» حين يكون موعدها غداً، وإلا اسمها من الخادم. */
function prayerNextLabel(next, date) {
  const name = next && next.name ? String(next.name) : '';
  const nextMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(next && next.date || ''));
  const baseMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!nextMatch || !baseMatch) return name;

  const nextDay = Date.UTC(Number(nextMatch[1]), Number(nextMatch[2]) - 1, Number(nextMatch[3]));
  const baseDay = Date.UTC(Number(baseMatch[1]), Number(baseMatch[2]) - 1, Number(baseMatch[3]));
  return nextDay - baseDay === 86400000 ? 'فجر الغد' : name;
}

/** البلدة المحفوظة — '' تعني «حسب محافظتي» (بلا `town`). */
function readPrayerTown() {
  try {
    const saved = localStorage.getItem(PRAYER_TIMES_TOWN_KEY);
    return saved ? String(saved).trim() : '';
  } catch (e) {
    return '';
  }
}

/** يحفظ اختيار البلدة؛ القيمة الفارغة تعني «حسب محافظتي» صراحةً. */
function savePrayerTown(town) {
  try {
    localStorage.setItem(PRAYER_TIMES_TOWN_KEY, town ? String(town).trim() : '');
  } catch (e) {
    // التخزين معطَّل أو ممتلئ — الاختيار يبقى صالحاً لهذه الزيارة.
  }
}

/**
 * يحقن قسم المواقيت بعد أدوات الأسعار — مرّة واحدة، وفي كل زيارة يعيد الجلب.
 * البلدات من `townsList` (GET /api/towns) لا من قائمة مثبَّتة؛ وحتى يصل الكتالوج
 * المؤكَّد تبقى «حسب محافظتي» وبلدة المستخدم المحفوظة إن وُجدت، ثم تُملأ القائمة.
 */
async function initPrayerTimesTool() {
  const page = document.getElementById('tabOurServices');
  if (!page) return;

  injectPrayerTimesSection(page);
  fillPrayerTownOptions({ authoritative: townsList.length > 0 });

  if (!townsList.length) {
    if (prayerTimesInitPending) return;
    prayerTimesInitPending = true;
    // لا فراغ أثناء انتظار البلدات: السطر يقول إن الجلب جارٍ.
    prayerTimesSnapshot = null;
    prayerTimesError = '';
    prayerTimesLoading = true;
    renderPrayerTimesState();
    const loaded = await loadTownCoordinates();
    prayerTimesInitPending = false;
    if (!document.getElementById('prayerTimesSection')) return;
    // الكتالوج المؤكَّد وحده يمسح بلدةً محفوظة لم يعد يذكرها؛ فشل الشبكة أو
    // ردّ بلا بلدات يُبقيها (وهو معنى `fromServer` في الموبايل نفسه).
    fillPrayerTownOptions({ authoritative: loaded && townsList.length > 0 });
  }

  loadPrayerTimes();
}

/** يبني وسم القسم مرّة واحدة، ويضعه بعد `#pricesToolsSection` مباشرةً. */
function injectPrayerTimesSection(page) {
  if (document.getElementById('prayerTimesSection')) return;

  const section = document.createElement('section');
  section.className = 'calc-section';
  section.id = 'prayerTimesSection';
  section.setAttribute('aria-labelledby', 'prayerTimesSectionTitle');
  section.innerHTML = `
    <h3 class="calc-section-title" id="prayerTimesSectionTitle">مواقيت الصلاة</h3>
    <p class="calc-section-lead">مواقيت اليوم حسب بلدتك أو محافظتك — الأوقات من الخادم.</p>
    <div class="prayer-card">
      <label class="calc-field prayer-place-field"><span>البلدة</span>
        <select class="calc-input" id="prayerTownSelect" onchange="onPrayerTownChange()"></select>
      </label>
      <p class="calc-status" id="prayerTimesStatus" role="status" aria-live="polite"></p>
      <button type="button" class="calc-run" id="prayerRetry" onclick="retryPrayerTimes()" hidden>إعادة المحاولة</button>
      <div id="prayerTimesBody" hidden>
        <h4 class="prayer-card-title" id="prayerTimesPlaceTitle"></h4>
        <p class="prayer-date-line" id="prayerTimesDate"></p>
        <ul class="prayer-times-list" id="prayerTimesList"></ul>
        <p class="prayer-next-line" id="prayerNextLine" hidden></p>
        <p class="prayer-footnote" id="prayerTimesFootnote"></p>
      </div>
    </div>`;

  const anchor = document.getElementById('pricesToolsSection');
  if (anchor && anchor.parentNode === page) {
    anchor.insertAdjacentElement('afterend', section);
    return;
  }
  const calcSection = page.querySelector('.calc-section');
  if (calcSection && calcSection.parentNode === page) {
    calcSection.insertAdjacentElement('afterend', section);
  } else {
    page.appendChild(section);
  }
}

/** يملأ منتقي البلدة: «حسب محافظتي» أولاً ثم بلدات الخادم النشطة. */
function fillPrayerTownOptions({ authoritative = false } = {}) {
  const select = document.getElementById('prayerTownSelect');
  if (!select) return;

  const saved = readPrayerTown();
  const towns = Array.isArray(townsList) ? townsList : [];
  const savedKnown = Boolean(saved) && towns.includes(saved);

  const ownOption = document.createElement('option');
  ownOption.value = '';
  ownOption.textContent = 'حسب محافظتي';
  select.textContent = '';
  select.appendChild(ownOption);

  towns.forEach(town => {
    const option = document.createElement('option');
    option.value = String(town);
    option.textContent = String(town);
    select.appendChild(option);
  });

  // قبل وصول الكتالوج المؤكَّد تبقى بلدة المستخدم المحفوظة قابلةً للعرض والطلب.
  // فشل الشبكة لا يعني أن البلدة عُطّلت، فلا تُمحى من المنتقي ولا من التخزين.
  if (saved && !savedKnown && !authoritative) {
    const option = document.createElement('option');
    option.value = saved;
    option.textContent = saved;
    select.appendChild(option);
  }

  const known = Array.from(select.options).some(option => option.value === saved);
  select.value = known ? saved : '';

  // بلدة عُطّلت بعد الحفظ: الكتالوج المؤكَّد وحده يمسحها، فلا يُرسَل اسم ميت.
  if (saved && !savedKnown && authoritative) savePrayerTown('');
}

/** تغيير البلدة: يحفظ الاختيار ويعيد الجلب فوراً. */
function onPrayerTownChange() {
  const select = document.getElementById('prayerTownSelect');
  savePrayerTown(select ? select.value : '');
  loadPrayerTimes();
}

/**
 * زرّ المحاولة: يعيد الكتالوج إن كان فشل من قبل ثم المواقيت نفسها، فلا تبقى
 * قائمة البلدات فارغة بعد نجاح الشبكة.
 */
async function retryPrayerTimes() {
  if (!townsList.length) {
    const loaded = await loadTownCoordinates();
    fillPrayerTownOptions({ authoritative: loaded && townsList.length > 0 });
  }
  loadPrayerTimes();
}

/**
 * يجلب المواقيت للبلدة المختارة. كل طلب يمسح النسخة السابقة ويُعلن الجلب،
 * فلا تظهر أوقات قديمة تحت بلدة جديدة؛ وردّ طلبٍ سبقه طلبٌ أحدث يُهمَل.
 */
async function loadPrayerTimes() {
  const section = document.getElementById('prayerTimesSection');
  if (!section) return;

  const select = document.getElementById('prayerTownSelect');
  const town = select ? String(select.value || '').trim() : readPrayerTown();
  const requestId = ++prayerTimesRequestId;

  prayerTimesSnapshot = null;
  prayerTimesError = '';
  prayerTimesLoading = true;
  clearPrayerTimesData();
  renderPrayerTimesState();

  const path = town
    ? `/api/prayer-times?town=${encodeURIComponent(town)}`
    : '/api/prayer-times';

  try {
    const res = await apiFetch(path);
    const data = await res.json().catch(() => null);
    if (requestId !== prayerTimesRequestId) return;

    if (res.ok && prayerTimesPayloadIsUsable(data)) {
      prayerTimesSnapshot = data;
    } else {
      const serverMessage = res.status === 400 && data && typeof data.message === 'string'
        ? data.message.trim()
        : '';
      prayerTimesError = serverMessage || PRAYER_TIMES_ERROR_TEXT;
    }
  } catch (e) {
    if (requestId !== prayerTimesRequestId) return;
    prayerTimesError = PRAYER_TIMES_ERROR_TEXT;
  }

  if (requestId !== prayerTimesRequestId) return;
  prayerTimesLoading = false;
  renderPrayerTimesState();
}

/** حالة السطر الواحد: جلب، أو خطأ عربي مع زرّ المحاولة، أو لا شيء. */
function renderPrayerTimesState() {
  const status = document.getElementById('prayerTimesStatus');
  const retry = document.getElementById('prayerRetry');
  const body = document.getElementById('prayerTimesBody');
  const hasData = Boolean(prayerTimesSnapshot);

  if (status) {
    status.textContent = prayerTimesLoading
      ? PRAYER_TIMES_LOADING_TEXT
      : (prayerTimesError || '');
    status.classList.toggle('is-error', !prayerTimesLoading && Boolean(prayerTimesError));
  }
  if (retry) retry.hidden = !(prayerTimesError && !prayerTimesLoading);
  if (body) body.hidden = !hasData;

  if (hasData) fillPrayerTimesData();
}

/** يمسح كل ما يعتمد على بيانات سابقة — رسوباً أو وقتاً أو طريقة. */
function clearPrayerTimesData() {
  ['prayerTimesPlaceTitle', 'prayerTimesDate', 'prayerNextLine', 'prayerTimesFootnote'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.textContent = '';
  });
  const list = document.getElementById('prayerTimesList');
  if (list) list.textContent = '';
}

/**
 * يعرض الردّ كما وصل: العنوان بالبلدة، والتاريخ، وستة صفوف بترتيب الخادم،
 * وصفّ الصلاة القادمة مميّزاً بالذهبي، وسطرها، وطريقة الحساب في الحاشية.
 */
function fillPrayerTimesData() {
  const data = prayerTimesSnapshot;
  if (!data) return;

  const placeName = String(data.place.name).trim();
  const title = document.getElementById('prayerTimesPlaceTitle');
  if (title) title.textContent = `مواقيت الصلاة — ${placeName}`;

  const dateLine = document.getElementById('prayerTimesDate');
  const dayText = prayerDateText(data.date);
  if (dateLine) dateLine.textContent = dayText ? `اليوم ${dayText}` : '';

  const list = document.getElementById('prayerTimesList');
  if (list) {
    list.textContent = '';
    const next = data.next && typeof data.next === 'object' ? data.next : null;
    const nextIsToday = Boolean(next && String(next.date || '') === String(data.date || ''));

    data.times.forEach(row => {
      const item = document.createElement('li');
      item.className = 'prayer-row';
      item.dataset.key = String(row && row.key || '');
      if (nextIsToday && item.dataset.key === String(next.key || '')) {
        item.classList.add('is-next');
      }

      const name = document.createElement('span');
      name.className = 'prayer-row-name';
      name.textContent = String(row && row.name || '');

      const time = document.createElement('span');
      time.className = 'prayer-row-time';
      time.textContent = String(row && row.time || '');

      item.append(name, time);
      list.appendChild(item);
    });
  }

  const nextLine = document.getElementById('prayerNextLine');
  const next = data.next && typeof data.next === 'object' ? data.next : null;
  if (nextLine) {
    if (next && next.name) {
      const label = prayerNextLabel(next, data.date);
      const minutes = Number(next.minutes_until);
      nextLine.textContent = Number.isFinite(minutes)
        ? `الصلاة القادمة: ${label} بعد ${prayerRelativeText(minutes)}`
        : `الصلاة القادمة: ${label}`;
      nextLine.hidden = false;
    } else {
      nextLine.hidden = true;
    }
  }

  const footnote = document.getElementById('prayerTimesFootnote');
  if (footnote) {
    const methodName = data.method && data.method.name ? String(data.method.name).trim() : '';
    footnote.textContent = methodName
      ? `حسب طريقة ${methodName} — قد تختلف دقيقة أو دقيقتين عن تقويم مسجدك`
      : '';
  }
}

/**
 * شعار الترويسة — زرّ «الرئيسية» (تذكرة #157). من صفحة مناسبة مفتوحة يغلقها
 * ويعود إلى التغذية، ومن وجهة أخرى يبدّلها إلى «المناسبات»، وعلى التغذية نفسها
 * يصعد إلى أوّل قائمتها. **لا يمسّ الفلتر ولا يعيد الجلب**: الإغلاق
 * (`closeEventPage`) والتمرير (`restoreFeedTop`) وحدهما، فبصمة الفلتر
 * (`feedFilterSignature`) تبقى كما هي ولا يقع طلب `/api/events`.
 *
 * و`eventPage` المفتوح يعود إلى نفس الكرت الذي كان عليه — كما يفعل زرّ رجوعها
 * بزرّ المتصفّح وEscape — لأنّ التغذية لم تكن ظاهرةً تحته بعدُ؛ الصعود إلى
 * أوّل القائمة لتغذية ظاهرة بالفعل وحدها.
 *
 * تُستدعى من `onclick` في index.html وتعيد `false` كي لا يقفز المتصفّح إلى
 * `#tabHome` ويضيف تاريخاً جديداً للتبديل الذي وقع في الصفحة نفسها.
 */
function brandGoToFeed() {
  const eventPageWasOpen = isEventPageOpen();
  if (eventPageWasOpen) closeEventPage();

  const homeTab = document.getElementById('tabHome');
  const onFeed = !!(homeTab && homeTab.classList.contains('active-tab'));
  if (!onFeed) {
    switchTab('tabHome');
    return false;
  }
  if (!eventPageWasOpen) restoreFeedTop();
  return false;
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

    // الصورة الشخصية: رابط مطلق أو null من publicUser — الأيقونة بديل فقط.
    const avatarImg = document.getElementById('accountAvatarImg');
    const avatarFallback = document.getElementById('accountAvatarFallback');
    if (avatarImg && avatarFallback) {
      if (currentUser.avatar_url) {
        avatarImg.src = currentUser.avatar_url;
        avatarImg.hidden = false;
        avatarFallback.hidden = true;
      } else {
        avatarImg.removeAttribute('src');
        avatarImg.hidden = true;
        avatarFallback.hidden = false;
      }
    }

    const profileNameInput = document.getElementById('accountProfileNameInput');
    if (profileNameInput) profileNameInput.value = currentUser.full_name || currentUser.name || '';

    const profileTownInput = document.getElementById('accountProfileTownInput');
    if (profileTownInput) profileTownInput.value = currentUser.clan_town || '';

    const phoneInput = document.getElementById('accountPhoneInput');
    if (phoneInput) phoneInput.value = currentUser.phone_number || currentUser.phone || '';

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

    // عدّاد «قائمتي» في بطاقة الوصول السريع — يُكتب من نفس موضع شارة الشريط.
    updateMyListNavBadge();

    fetchMyEvents();
    // «مزوّدي» (تذكرة #187): الحساب المربوط وحده له قسم هنا، والجلب لا يُسقط
    // «حسابي» إن فشل — يختفي القسم ويبقى ما سواه.
    loadMyProviders();
    // «الطلبات الواردة» و«العروض المستلمة» (تذكرة #188): كلاهما يختفي كاملاً
    // حين لا صفوف — لا عنوان لقسم فارغ ولا قسم يُقال لحسابٍ لا يملكه.
    loadIncomingQuotes();
    loadMyQuotes('all');
  } else {
    guestView.style.display = 'block';
    loggedInView.style.display = 'none';
    myProvidersCache = [];
    renderMyProviders();
    incomingQuotesCache = [];
    renderIncomingQuotes();
    myQuotesState.quotes = [];
    myQuotesState.hasAny = false;
    myQuotesState.tab = 'all';
    renderMyQuotes();
  }
}

/**
 * «مزوّدي» في «حسابي» (تذكرة #187): يقرأ `GET /api/services/my-providers`
 * لصاحب الحساب وحده — مزوّدات الربط، بشكل بطاقة الدليل نفسه. القسم يختفي
 * كاملاً بلا ربط (لا عنوان لقسم فارغ)، وفشل الجلب يخفيه ولا يُسقط «حسابي».
 */
let myProvidersCache = [];

async function loadMyProviders() {
  if (!currentUser || !authToken) {
    myProvidersCache = [];
    renderMyProviders();
    return;
  }
  try {
    const res = await apiFetch('/api/services/my-providers', { auth: true });
    const data = await res.json();
    if (!res.ok || !data || !data.success || !Array.isArray(data.providers)) {
      throw new Error('bad my-providers response');
    }
    myProvidersCache = data.providers;
  } catch (e) {
    myProvidersCache = [];
  }
  renderMyProviders();
}

/** بطاقات «مزوّدي» — «تفاصيل» فيها يفتح نافذة المزوّد حيث الردّ على التقييمات. */
function renderMyProviders() {
  const section = document.getElementById('accountMyProvidersSection');
  const list = document.getElementById('accountMyProvidersList');
  if (!section || !list) return;
  if (!myProvidersCache.length) {
    list.innerHTML = '';
    section.hidden = true;
    return;
  }
  list.innerHTML = myProvidersCache
    .map(provider => renderCompactServiceRowHtml(provider, {
      // معرّفات مختلفة عن بطاقة تبويب الخدمات: الصفحتان تعيشان في DOM واحد،
      // وتكرار `id` يجعل `getElementById` يصيب بطاقة التبويب الأخرى.
      rowId: `accountProviderRow-${provider.id}`,
      statsId: `accountProviderStats-${provider.id}`
    }))
    .join('');
  section.hidden = false;
}

// --- «الطلبات الواردة» و«العروض المستلمة» (تذكرة #188، ADR-0016) -------
// قسمان في «حسابي»: الأول لصاحب مزوّد مربوط يردّ بعرضه، والثاني للزبون يقرّر.
// الاختيار بين الطلبات والعروض يجري في الخادم وحده (اسم طالبٍ لا يخرج إلا
// لمن يملك الصفّ)، وهنا رسمٌ للأشكال الثلاثة: `shapeQuoteRow` واحد للجميع.

/**
 * تسميات الحالات الخمس — نسخة العرض في هذا الملف وحده (`status` هو ما يخرج من
 * الخادم، وتسميته العربية للعميل). ونصّ 409 العربي في الخادم له نسخته هناك،
 * فحالة جديدة تُضاف في الموضعين: هذا للبطاقة، وذاك لرسالة الرفض.
 */
const QUOTE_STATUS_LABELS = {
  awaiting_offer: 'بانتظار عرض المزوّد',
  offered: 'وصل عرض',
  accepted: 'مقبول',
  declined: 'مرفوض',
  cancelled: 'ملغى'
};

function quoteStatusLabel(status) {
  return QUOTE_STATUS_LABELS[status] || 'غير معروفة';
}

/** سطور التفاصيل المشتركة بين البطاقتين — الفارغ منها لا يُرسم. */
function quoteDetailLinesHtml(quote) {
  return [
    quote.event_title ? `المناسبة: ${quote.event_title}` : null,
    quote.event_date ? `تاريخ المناسبة: ${quote.event_date}` : null,
    quote.wanted_date ? `التاريخ المرغوب: ${quote.wanted_date}` : null,
    quote.guests_count ? `عدد المعازيم: ${quote.guests_count}` : null,
    quote.note ? `ملاحظة: ${quote.note}` : null
  ].filter(Boolean).map(line => `<p class="quote-line">${escapeHtml(line)}</p>`).join('');
}

/** رأس البطاقة: الاسم على اليمين والحالة على اليسار — حالة كل طلب ظاهرة. */
function quoteCardHeadHtml(name, status) {
  return `
    <div class="quote-card-head">
      <strong>${escapeHtml(name)}</strong>
      <span class="quote-status quote-status-${escapeHtml(status)}">${escapeHtml(quoteStatusLabel(status))}</span>
    </div>`;
}

let incomingQuotesCache = [];

/**
 * «الطلبات الواردة» — `GET /api/services/incoming-quotes` لصاحب الحساب المربوط
 * وحده. حساب بلا ربط يستلم مصفوفة فارغة فيختفي القسم كاملاً، وفشل الجلب يخفيه
 * ولا يُسقط «حسابي» (نفس نمط «مزوّدي»).
 */
async function loadIncomingQuotes() {
  if (!currentUser || !authToken) {
    incomingQuotesCache = [];
    renderIncomingQuotes();
    return;
  }
  try {
    const res = await apiFetch('/api/services/incoming-quotes', { auth: true });
    const data = await res.json();
    if (!res.ok || !data || !data.success || !Array.isArray(data.quotes)) {
      throw new Error('bad incoming-quotes response');
    }
    incomingQuotesCache = data.quotes;
  } catch (e) {
    incomingQuotesCache = [];
  }
  renderIncomingQuotes();
}

function renderIncomingQuotes() {
  const section = document.getElementById('accountIncomingQuotesSection');
  const list = document.getElementById('accountIncomingQuotesList');
  if (!section || !list) return;
  if (!incomingQuotesCache.length) {
    list.innerHTML = '';
    section.hidden = true;
    return;
  }
  list.innerHTML = incomingQuotesCache.map(quote => `
    <article class="quote-card" data-quote-id="${Number(quote.id)}" data-quote-status="${escapeHtml(quote.status)}">
      ${quoteCardHeadHtml(quote.user_name || 'زبون', quote.status)}
      ${quoteDetailLinesHtml(quote)}
      ${quote.offer_price
        ? `<p class="quote-offer-line">عرضك: <strong>${escapeHtml(quote.offer_price)}</strong>${quote.offer_note ? ` — ${escapeHtml(quote.offer_note)}` : ''}</p>`
        : ''}
      ${quote.status === 'awaiting_offer' ? `
        <div class="quote-offer-form">
          <input type="text" class="quote-offer-price" maxlength="100" placeholder="السعر كما تكتبه (مثال: 1500 شيكل)">
          <input type="text" class="quote-offer-note" maxlength="1000" placeholder="ملاحظة على العرض (اختياري)">
          <button type="button" class="quote-offer-btn" onclick="submitQuoteOffer(${Number(quote.id)})">أرسل العرض</button>
        </div>` : ''}
    </article>`).join('');
  section.hidden = false;
}

/**
 * إرسال العرض — `PUT .../incoming-quotes/:qid/offer` بسعر إلزامي وملاحظة
 * اختيارية. السعر نصّ كما كتبه المزوّد (لا تحويل ولا تقريب)، والخادم يرفض
 * أي انتقال غير `awaiting_offer ← offered` بـ409 ويُعاد الرسم من الخادم.
 */
async function submitQuoteOffer(quoteId) {
  const card = document.querySelector(`#accountIncomingQuotesList .quote-card[data-quote-id="${Number(quoteId)}"]`);
  if (!card) return;
  const priceInput = card.querySelector('.quote-offer-price');
  const noteInput = card.querySelector('.quote-offer-note');
  const price = priceInput ? priceInput.value.trim() : '';
  if (!price) {
    showToast('اكتب سعر العرض أولاً');
    return;
  }

  const button = card.querySelector('.quote-offer-btn');
  if (button) button.disabled = true;
  try {
    const res = await apiFetch(`/api/services/incoming-quotes/${Number(quoteId)}/offer`, {
      method: 'PUT',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price, note: noteInput ? noteInput.value.trim() : '' })
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      showToast((data && data.message) || 'تعذّر إرسال العرض — حاول مرة أخرى');
      return;
    }
    await loadIncomingQuotes();
    showToast((data && data.message) || 'تم إرسال عرضك إلى الزبون');
  } catch (e) {
    showToast('تعذّر إرسال العرض — تحقّق من الاتصال');
  } finally {
    if (button) button.disabled = false;
  }
}

/**
 * «العروض المستلمة» — ثلاثة أقسام يفلترها الخادم (`?tab=all|awaiting|accepted`)،
 * فلا يُفلتر شيء بعد الجلب. و«كل» وحدها تقول هل للمستخدم طلبات أصلاً: قسمٌ
 * فارغ مختار لا يُخفي التبويبات ولا يُخفي القسم كله.
 */
const myQuotesState = { tab: 'all', quotes: [], hasAny: false };

async function loadMyQuotes(tab = myQuotesState.tab) {
  const chosen = ['all', 'awaiting', 'accepted'].includes(tab) ? tab : 'all';
  myQuotesState.tab = chosen;
  if (!currentUser || !authToken) {
    myQuotesState.quotes = [];
    myQuotesState.hasAny = false;
    renderMyQuotes();
    return;
  }
  try {
    const res = await apiFetch(`/api/services/my-quotes?tab=${encodeURIComponent(chosen)}`, { auth: true });
    const data = await res.json();
    if (!res.ok || !data || !data.success || !Array.isArray(data.quotes)) {
      throw new Error('bad my-quotes response');
    }
    myQuotesState.quotes = data.quotes;
    if (chosen === 'all') myQuotesState.hasAny = data.quotes.length > 0;
  } catch (e) {
    myQuotesState.quotes = [];
    if (chosen === 'all') myQuotesState.hasAny = false;
  }
  renderMyQuotes();
}

function setMyQuotesTab(tab) {
  loadMyQuotes(tab);
}

function renderMyQuotes() {
  const section = document.getElementById('accountMyQuotesSection');
  const list = document.getElementById('accountMyQuotesList');
  if (!section || !list) return;

  section.querySelectorAll('.quote-tab').forEach(tab => {
    const active = tab.dataset.quoteTab === myQuotesState.tab;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  if (!myQuotesState.hasAny) {
    list.innerHTML = '';
    section.hidden = true;
    return;
  }
  section.hidden = false;
  if (!myQuotesState.quotes.length) {
    list.innerHTML = '<p class="quote-empty">لا طلبات في هذا القسم.</p>';
    return;
  }
  list.innerHTML = myQuotesState.quotes.map(myQuoteCardHtml).join('');
}

/** بطاقة «عرض مستلم» — أزرارها بحسب الحالة، والانتقالات الممنوعة لا تُعرض. */
function myQuoteCardHtml(quote) {
  const status = quote.status;
  const actions = [];
  if (status === 'offered') {
    actions.push(`<button type="button" class="quote-action quote-accept" onclick="decideQuote(${Number(quote.id)}, 'accept')">قبول العرض</button>`);
    actions.push(`<button type="button" class="quote-action quote-decline" onclick="decideQuote(${Number(quote.id)}, 'decline')">رفض العرض</button>`);
  }
  if (status === 'awaiting_offer' || status === 'offered') {
    actions.push(`<button type="button" class="quote-action quote-cancel" onclick="decideQuote(${Number(quote.id)}, 'cancel')">إلغاء الطلب</button>`);
  }

  return `
    <article class="quote-card" data-quote-id="${Number(quote.id)}" data-quote-status="${escapeHtml(status)}">
      ${quoteCardHeadHtml(quote.provider_name || 'مزوّد خدمة', status)}
      ${quote.provider_category_name ? `<p class="quote-line">${escapeHtml(quote.provider_category_name)}</p>` : ''}
      ${quoteDetailLinesHtml(quote)}
      ${quote.offer_price
        ? `<p class="quote-offer-line">العرض: <strong>${escapeHtml(quote.offer_price)}</strong>${quote.offer_note ? ` — ${escapeHtml(quote.offer_note)}` : ''}</p>`
        : ''}
      ${actions.length ? `<div class="quote-actions">${actions.join('')}</div>` : ''}
    </article>`;
}

/**
 * قرار الزبون — `PATCH .../my-quotes/:qid` بـ`accept` | `decline` | `cancel`.
 * الخادم وحده يحكم الانتقال (409 لغيره) ويُشعر الحساب المربوط عند القبول،
 * فتُقرأ القائمة من جديد بدل تعديل الصفّ في الذاكرة.
 */
async function decideQuote(quoteId, action) {
  try {
    const res = await apiFetch(`/api/services/my-quotes/${Number(quoteId)}`, {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      showToast((data && data.message) || 'تعذّر تحديث الطلب — حاول مرة أخرى');
      return;
    }
    await loadMyQuotes(myQuotesState.tab);
    showToast((data && data.message) || 'تم تحديث الطلب');
  } catch (e) {
    showToast('تعذّر تحديث الطلب — تحقّق من الاتصال');
  }
}

/**
 * «غيّر صورتك» — ترفع الصورة إلى POST /api/auth/me/avatar.
 * الجسم FormData كما هو، بلا `Content-Type` عمداً: المتصفّح يبني الترويسة
 * بحدّها الفاصل (boundary) بنفسه، ووضعها يدوياً يفقده فيرفض الخادم الطلب.
 */
async function handleAccountAvatarPick(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;

  if (!/^image\//.test(file.type || '')) {
    showToast('اختر صورة');
    input.value = '';
    return;
  }

  const form = new FormData();
  form.append('image', file);

  try {
    const res = await apiFetch('/api/auth/me/avatar', { method: 'POST', auth: true, body: form });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      currentUser = data.user;
      try {
        localStorage.setItem('negev_user', JSON.stringify(currentUser));
      } catch (e) { /* التخزين المحلي معطَّل — الصورة تبقى معروضة في هذه الجلسة */ }
      updateAuthUI();
      loadAccountView();
      showToast(data.message || 'تم تحديث صورتك الشخصية');
    } else {
      showToast(data.message || 'تعذّر رفع صورتك — حاول مرة أخرى');
    }
  } catch (e) {
    showToast('تعذّر رفع صورتك — تحقّق من الاتصال وحاول مرة أخرى');
  } finally {
    // تفريغ الحقل يتيح اختيار الملف نفسه مرة أخرى بعد فشل أو استبدال.
    input.value = '';
  }
}

/** يحفظ الاسم والبلدة عبر PATCH /api/auth/me — والاسم لا يُرسل فارغاً أبداً. */
async function saveAccountProfile() {
  const nameInput = document.getElementById('accountProfileNameInput');
  const townInput = document.getElementById('accountProfileTownInput');
  if (!nameInput || !townInput) return;

  const full_name = nameInput.value.trim();
  const clan_town = townInput.value.trim();
  if (!full_name) {
    showToast('الاسم لا يكون فارغاً');
    return;
  }

  try {
    const res = await apiFetch('/api/auth/me', {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, clan_town })
    });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      currentUser = data.user;
      try {
        localStorage.setItem('negev_user', JSON.stringify(currentUser));
      } catch (e) { /* التخزين المحلي معطَّل — الحساب محدَّث في هذه الجلسة */ }
      updateAuthUI();
      loadAccountView();
      showToast(data.message || 'تم تحديث بيانات حسابك');
    } else {
      // رسالة الخادم عربية دائماً — تُعرض كما هي بدل نصّ عام يغطّيها.
      showToast(data.message || 'تعذّر حفظ بياناتك — حاول مرة أخرى');
    }
  } catch (e) {
    showToast('تعذّر الاتصال بالخادم — حاول مرة أخرى');
  }
}

/**
 * يفتح نموذج تعديل رقم الهاتف أو يغلقه. الفتح يعيد الرقم الحالي من الجلسة،
 * والرمز يُفرَّغ دائماً فلا يبقى رمز مكتوب في الحقل بعد الإغلاق.
 */
function toggleAccountPhoneForm(show) {
  const form = document.getElementById('accountPhoneForm');
  const editBtn = document.getElementById('accountPhoneEditBtn');
  const phoneInput = document.getElementById('accountPhoneInput');
  const pinInput = document.getElementById('accountPhonePinInput');
  if (!form) return;

  form.hidden = !show;
  if (editBtn) editBtn.hidden = !!show;
  if (pinInput) pinInput.value = '';
  if (show && phoneInput && currentUser) {
    phoneInput.value = currentUser.phone_number || currentUser.phone || '';
  }
}

/**
 * يغيّر رقم الهاتف (اسم الدخول) بعد تأكيده برمز الدخول الحالي.
 * الاستجابة تحمل رمزاً جديداً موقَّعاً بالرقم الجديد، فيُحفظ وحده مكان القديم
 * كي لا يخرج المستخدم من جلسته بتغييره — ورمز الدخول نفسه لا يُخزَّن أبداً.
 */
async function saveAccountPhone() {
  const phoneInput = document.getElementById('accountPhoneInput');
  const pinInput = document.getElementById('accountPhonePinInput');
  if (!phoneInput || !pinInput) return;

  const phone_number = phoneInput.value.trim();
  const pin_code = pinInput.value;

  try {
    const res = await apiFetch('/api/auth/me/phone', {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number, pin_code })
    });
    const data = await res.json();
    if (res.ok && data.success && data.token && data.user) {
      try {
        localStorage.setItem('negev_token', data.token);
      } catch (e) { /* التخزين المحلي معطَّل — الجلسة الجديدة تعمل في الذاكرة */ }
      authToken = data.token;
      currentUser = data.user;
      try {
        localStorage.setItem('negev_user', JSON.stringify(currentUser));
      } catch (e) { /* التخزين المحلي معطَّل — الحساب محدَّث في هذه الجلسة */ }
      updateAuthUI();
      toggleAccountPhoneForm(false);
      loadAccountView();
      showToast(data.message || 'تم تحديث رقم هاتفك');
    } else {
      // الفشل يُبقي النموذج مفتوحاً لتصحيح الرقم أو رمز الدخول.
      showToast(data.message || 'تعذّر تحديث رقمك — تحقّق من رقم الهاتف ورمز الدخول');
    }
  } catch (e) {
    showToast('تعذّر الاتصال بالخادم — حاول مرة أخرى');
  }
}

function handleLogout() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem('negev_user');
  localStorage.removeItem('negev_token');
  updateAuthUI();
  clearMyList();
  loadAccountView();
  showToast('تم تسجيل الخروج بنجاح');
  switchTab('tabHome');
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
  clearMyList();
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
      // محافظة الحساب التي يستعملها الخادم بلا ترويسة تُرسم مختارة (#124) —
      // ولا تعلو على اختيار صريح محفوظ في المتصفّح.
      adoptAccountRegion(currentUser.region_id);
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
  } else if (intent.type === 'remind') {
    // الزرّ ضُغط قبل الدخول — تُنفَّذ المتابعة نفسها الآن، إلا أن تكون المناسبة
    // في «قائمتي» فعلاً (جلسة أو جهاز آخر) فلا معنى لإعادة الإضافة.
    const known = allEvents.find(e => e.id === intent.eventId)
      || (eventPageEvent && eventPageEvent.id === intent.eventId ? eventPageEvent : null);
    if (!(known && known.is_reminded)) toggleReminder(intent.eventId, false, null);
  } else if (intent.type === 'my_list') {
    // بطاقة الدخول في تبويب «مناسباتي» — يعود إليه بعد الدخول لا إلى التغذية.
    switchTab('tabMyList');
  } else if (intent.type === 'nokoot') {
    // بطاقة «دفتر النقوط» في ورقة «مميّز عندنا» — يعود إليه بعد الدخول.
    switchTab('tabNokoot');
  } else if (intent.type === 'provider_favorite') {
    // «احفظ المزوّد» ضُغط قبل الدخول (تذكرة #185): تُفتح نافذة المزوّد نفسها
    // بعد الدخول، فيكمل المستخدم الفعل الذي أراده بزرّه هو — لا حفظ صامت.
    openProviderModal(intent.providerId);
  } else if (intent.type === 'provider_review') {
    // «اكتب تقييمك» ضُغط قبل الدخول (تذكرة #186): تُفتح نافذة المزوّد ثم ورقة
    // الكتابة فوقها بعد جهوز بياناتها — الفعل نفسه يُستأنف لا عرضُ نافذة فقط.
    Promise.resolve(openProviderModal(intent.providerId)).then(() => openProviderReviewForm());
  } else if (intent.type === 'provider_review_report') {
    // «بلّغ» ضُغط قبل الدخول: يُستأنف البلاغ نفسه على التقييم ذاته بعد الدخول،
    // لا ورقة الكتابة — الفعل الذي أراده المستخدم هو ما يعود إليه.
    Promise.resolve(openProviderModal(intent.providerId))
      .then(() => reportProviderReview(intent.reviewId));
  } else if (intent.type === 'provider_quote') {
    // «اطلب عرض سعر» ضُغط قبل الدخول (تذكرة #188): تُفتح نافذة المزوّد ثم
    // نموذج الطلب فوقها بعد جهوز بياناتها — الفعل نفسه يُستأنف لا عرضُ نافذة.
    Promise.resolve(openProviderModal(intent.providerId)).then(() => openQuoteRequestForm());
  } else if (intent.type === 'rsvp') {
    // زرّ «جاي»/«مش جاي» ضُغط قبل الدخول — يُنفَّذ الجواب نفسه الآن بما اختاره
    // المستخدم من عدد (المنتقي ما زال في الصفحة تحت نافذة الدخول).
    if (eventPageEvent && eventPageEvent.id === intent.eventId) {
      submitRsvp(intent.response || 'yes');
    } else if (intent.response === 'yes') {
      // «جاي» من الكرت لا يفتح صفحة المناسبة، فلا منتقي عدد تحته: يُكرَّر الفعل
      // من الكرت نفسه، وإلا صار الدخول طريقاً مسدوداً بلا جواب مسجَّل.
      submitCardRsvp(intent.eventId);
    }
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

/**
 * بلدات فلتر المكان من المحافظة الفعّالة وحدها (#124): GET /api/towns يعيد
 * بلدات كل المحافظات، فبلا هذا التقييد يعرض فلتر النقب بلدات طولكرم. اسم
 * المحافظة نفسه يبقى مكاناً صالحاً («بلا بلدة محدّدة») — محافظتها وحدها.
 * قبل وصول regions (أو عند فشل الطلب) نعود إلى القائمة الكاملة كما كانت.
 */
function placeFilterTownOptions() {
  const region = activeRegion();
  if (!region) {
    return [
      ...townsList.map(name => ({ kind: 'town', id: name, label: name })),
      // بلدات كل المحافظات؛ والمحافظة **النشطة** وحدها مكاناً (#127) — الموقوفة
      // لا تُعرض للاكتشاف فلا تظهر في فلتره.
      ...activeRegionsList().map(r => ({ kind: 'town', id: r.name, label: `${r.name} (بلا بلدة محدّدة)` }))
    ];
  }
  const regionTowns = Array.isArray(region.towns) ? region.towns : townsList;
  return [
    ...regionTowns.map(name => ({ kind: 'town', id: name, label: name })),
    { kind: 'town', id: region.name, label: `${region.name} (بلا بلدة محدّدة)` }
  ];
}

/**
 * قرى فلتر المكان: استجابة GET /api/towns الحالية لا تحمل region_id للقرية
 * (`villages.service.listActive` تنتقي id/name/latitude/longitude/position
 * فقط)، فتبقى القرى كلها معروضة كما هي. الفلترة تُفعَّل تلقائياً إن أضاف
 * الخادم الحقل لاحقاً — بلا تغيير في هذا الملف.
 */
function placeFilterVillageOptions() {
  const region = activeRegion();
  const villagesHaveRegion = villagesList.length > 0
    && villagesList.every(v => v.region_id !== undefined && v.region_id !== null);
  const villages = region && villagesHaveRegion
    ? villagesList.filter(v => Number(v.region_id) === region.id)
    : villagesList;
  return villages.map(v => ({ kind: 'village', id: v.id, label: v.name }));
}

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
        ...placeFilterTownOptions(),
        ...placeFilterVillageOptions()
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

/**
 * يُعيد بناء خيارات فلتر المكان عند تبديل المحافظة (#124): الورقة المفتوحة
 * تُعاد من القائمة المقيَّدة بالمحافظة الجديدة، ورقاقة المكان تُحدَّث. الاختيار
 * نفسه لا يُمسّ — قرار المستخدم — والخادم يوحّد البلدة مع المحافظة.
 */
function refreshPlaceFilterForRegion() {
  if (filterSheetActiveKey === 'place') renderFilterSheetList();
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
  // هل هناك فلتر يمسحه هذا الزرّ فعلاً؟ بلا فلتر نشِط لا شيء يتغيّر، فلا
  // طلب ولا إعادة رسم — البحث وحده لا يمسحه الزرّ فلا يُحسب هنا.
  const hadFilters = Boolean(
    selectedTowns.length || selectedVillageIds.length || selectedOccasionTypeIds.length ||
    selectedDateFilter || upcomingOnly
  );
  selectedTowns = [];
  selectedVillageIds = [];
  selectedOccasionTypeIds = [];
  selectedDateFilter = null;
  upcomingOnly = false;
  syncUpcomingUi();
  persistFilterSelection();
  updateFilterChipLabel('place');
  updateFilterChipLabel('kind');
  updateDateFilterChipLabel();
  hideFeedBackPill();
  syncHomeDiscoveryVisibility();
  if (!hadFilters) return;
  fetchEvents();
}

const FEED_DATE_PRESETS = { today: 'اليوم', tomorrow: 'غداً', week: 'هذا الأسبوع', weekend: 'الخميس – السبت' };

/*
 * نطاق فلتر التاريخ — نفس `FeedDateFilter.preset` في
 * `mobile/lib/screens/events_screen.dart`. الأسبوع من الأحد إلى السبت،
 * و«الخميس – السبت» ليالي الأعراس القادمة، من اليوم نفسه إن كنّا فيها.
 */
function feedDateRange(key, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay();
  const plus = days => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  let from = today;
  let to = today;
  if (key === 'tomorrow') {
    from = plus(1);
    to = plus(1);
  } else if (key === 'week') {
    to = plus(6 - dayOfWeek);
  } else if (key === 'weekend') {
    from = dayOfWeek >= 4 ? today : plus(4 - dayOfWeek);
    to = plus(6 - dayOfWeek);
  } else {
    key = 'today';
  }
  return { key, label: FEED_DATE_PRESETS[key], from: isoLocalDay(from), to: isoLocalDay(to) };
}

/** يوم من منتقي التاريخ (`YYYY-MM-DD`)، مسمّى بالصيغة العربية الطويلة نفسها على الكرت. */
function feedDayRange(isoDay) {
  const [y, m, d] = isoDay.split('-').map(Number);
  const label = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(y, m - 1, d));
  return { key: 'day', label, from: isoDay, to: isoDay };
}

function openDateFilterSheet() {
  const list = document.getElementById('dateFilterList');
  const modal = document.getElementById('dateFilterModal');
  if (!list || !modal) return;
  const current = selectedDateFilter ? selectedDateFilter.key : 'all';
  const row = (key, label) => `
      <label class="filter-option-row">
        <input type="radio" name="feedDateOption" value="${key}" ${current === key ? 'checked' : ''}>
        <span>${escapeHtml(label)}</span>
      </label>`;
  const pickedDay = current === 'day' ? selectedDateFilter.from : '';
  list.innerHTML = [
    row('all', 'كل التواريخ'),
    ...Object.entries(FEED_DATE_PRESETS).map(([key, label]) => row(key, label)),
    `<label class="filter-option-row">
        <input type="radio" name="feedDateOption" value="day" ${current === 'day' ? 'checked' : ''}>
        <span>اختر يوماً</span>
        <input type="date" id="dateFilterDayInput" class="filter-date-input" value="${pickedDay}"
               onchange="this.closest('label').querySelector('input[type=radio]').checked = true">
      </label>`
  ].join('');
  modal.style.display = 'flex';
}

function closeDateFilterSheet() {
  const modal = document.getElementById('dateFilterModal');
  if (modal) modal.style.display = 'none';
}

function applyDateFilterSheet() {
  const chosen = document.querySelector('input[name="feedDateOption"]:checked');
  const key = chosen ? chosen.value : 'all';
  if (key === 'day') {
    const dayInput = document.getElementById('dateFilterDayInput');
    const day = dayInput ? dayInput.value : '';
    if (!day) {
      showToast('اختر اليوم أولاً');
      return;
    }
    selectedDateFilter = feedDayRange(day);
  } else {
    selectedDateFilter = key === 'all' ? null : feedDateRange(key);
  }
  closeDateFilterSheet();
  updateDateFilterChipLabel();
  fetchEvents();
}

function updateDateFilterChipLabel() {
  const text = selectedDateFilter ? selectedDateFilter.label : 'كل التواريخ';
  ['dateFilterChipLabel', 'drawerDateChipLabel'].forEach(id => {
    const label = document.getElementById(id);
    if (label) label.textContent = text;
  });
  updateFloatingFilterLabel();
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
  syncHomeDiscoveryVisibility();
  // النص نفسه المطبَّق: الواجهة تحدَّثت أعلاه، ولا طلب يعيد رسم القائمة من أوّلها.
  if (feedFiltersUnchanged()) return;
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
  syncHomeDiscoveryVisibility();
  // لا نص مطبَّق أصلاً: لا شيء ليمسحه هذا الزرّ، فلا جلب.
  if (feedFiltersUnchanged()) return;
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
  const hasDate = Boolean(selectedDateFilter);
  const hasUpcoming = Boolean(upcomingOnly);
  const hasArchive = Boolean(showArchive);
  const hasActiveFilters = hasSearch || hasPlaces || hasKinds || hasDate || hasUpcoming || hasArchive;

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

  const parts = [placeText, kindText, hasDate ? selectedDateFilter.label : ''].filter(Boolean);
  if (parts.length) {
    floatingLabel.textContent = parts.join(' • ');
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

    // إعادة رسم البطاقة الإعلانية الكبيرة في الدرج بالبيانات الحالية.
    renderDrawerStoryCarousel();

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
    if (drawerPromoCarouselTimer) {
      clearInterval(drawerPromoCarouselTimer);
      drawerPromoCarouselTimer = null;
    }
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
    syncHomeDiscoveryVisibility();
    // الكتابة ثم الرجوع إلى النص المطبَّق نفسه: لا شيء تغيّر، فلا جلب.
    if (feedFiltersUnchanged()) return;
    fetchEvents();
  }, 400);
}

/** ضغط Enter / بحث من لوحة الهاتف يطبّق البحث فوراً ويغلق الدرج لتظهر النتائج مباشرةً. */
function handleDrawerSearchKeydown(event) {
  if (!event || event.key !== 'Enter') return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  clearTimeout(drawerSearchDebounceTimer);
  const drawerSearch = document.getElementById('drawerSearchInput');
  const query = drawerSearch ? drawerSearch.value : searchQuery;
  searchQuery = String(query || '').trim();
  const mainInput = document.getElementById('eventSearchInput');
  if (mainInput) mainInput.value = searchQuery;
  updateFloatingFilterLabel();
  syncHomeDiscoveryVisibility();
  toggleTopChrome(false);
  if (feedFiltersUnchanged()) {
    restoreFeedTop();
    return;
  }
  fetchEvents();
}

function clearDrawerSearch() {
  const drawerSearch = document.getElementById('drawerSearchInput');
  if (drawerSearch) drawerSearch.value = '';
  const clearBtn = document.getElementById('drawerClearSearchBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  handleDrawerSearch('');
}

function toggleArchiveSwitch(checked) {
  toggleUpcomingSwitch(checked);
}

function toggleUpcomingSwitch(checked) {
  upcomingOnly = Boolean(checked);
  syncUpcomingUi();
  updateFloatingFilterLabel();
  fetchEvents();
}

function refreshEventsFeed() {
  fetchStories();
  // تحديث صريح: يُجلب دائماً حتى لو لم تتغيّر البصمة، ثم يُعاد موضع التمرير
  // بعد الرسم داخل `fetchEvents` (المسار غير التابع).
  fetchEvents({ page: 1, force: true });
  showToast('🔄 تم تحديث المناسبات');
}

// Agenda Calendar state & functions (تذكرة #175)
let agendaCurrentDate = new Date();
let agendaSelectedDate = new Date();
// عدّ الأيام يأتي من `GET /api/events/calendar` وحده، لا من `allEvents` المحلية:
// الخادم هو من يعرف امتداد المناسبة كاملاً (`EVENT_SPAN_*` — event_end_date
// ويوم الحنّة وسهرة الشباب) وبوابة الظهور العام. العدّ في العميل على
// `event_date` وحده كان يعدّ المناسبة ثلاثة أيام واحداً، ويعدّ `link_only`
// وهي غائبة عن كل قائمة.
let agendaDayCounts = {};
// هوية العدّ الذي في الذاكرة: لا يصلح عدّ شهر/محافظة تحت شهر أو محافظة أخرى.
let agendaDayCountsIdentity = null;
// فلتر المحافظة **داخل التقويم وحده** — `null` = كل المحافظات. لا يغيّر
// المحافظة المكتشفة المحفوظة (`negev_region`) ولا ترويسة `X-Region` التي
// تحملها التغذية والخريطة: التقويم يقرأ فلتره من اختيار المستخدم هنا.
let agendaRegionId = null;
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
  populateAgendaRegionFilter();
  // أول فتح قد يسبق وصول GET /api/towns — يُعاد ملء الفلتر حين تصل المحافظات،
  // بلا انتظار النقرة عليه (وبلا خطأ إن انقطعت الشبكة: يبقى «كل المحافظات»).
  if (!regionsList.length) {
    loadTownCoordinates().then(() => populateAgendaRegionFilter()).catch(() => {});
  }
  renderAgendaCalendar();
}

/**
 * يملأ فلتر المحافظة من `GET /api/towns` — `activeRegionsList()` القائمة نفسها
 * التي يرسم بها منتقي المحافظة، فلا اسم محافظة مكتوب في هذا الملف.
 *
 * واختيار لم تبقَ محافظته نشطة يعود إلى «كل المحافظات»: قائمة لا تحمل القيمة
 * الحالية تُظهر أول خيار كأنه المختار، فيصمت الفلتر عن أنه لم يعد يعني شيئاً.
 */
function populateAgendaRegionFilter() {
  const select = document.getElementById('agendaRegionFilter');
  if (!select) return;
  const regions = activeRegionsList();
  if (agendaRegionId !== null && !regions.some(region => region.id === agendaRegionId)) {
    agendaRegionId = null;
  }
  select.innerHTML = [
    '<option value="">كل المحافظات</option>',
    ...regions.map(region => `<option value="${region.id}">${escapeHtml(region.name)}</option>`)
  ].join('');
  select.value = agendaRegionId === null ? '' : String(agendaRegionId);
}

/** تبديل فلتر المحافظة داخل التقويم: يُعاد عدّ الشهر وقائمة اليوم معاً. */
function onAgendaRegionChange(value) {
  const regionId = Number.parseInt(value, 10);
  agendaRegionId = Number.isInteger(regionId) && regionId > 0 ? regionId : null;
  renderAgendaCalendar();
}

function closeAgendaModal() {
  const modal = document.getElementById('agendaModal');
  if (modal) modal.style.display = 'none';
}

function changeAgendaMonth(delta) {
  agendaCurrentDate = new Date(agendaCurrentDate.getFullYear(), agendaCurrentDate.getMonth() + delta, 1);
  renderAgendaCalendar();
}

/**
 * عدّ أيام الشهر من مسار التقويم العام — `{ days: [{ date, count }] }`.
 * `region: false` عمداً: فلتر المحافظة هنا هو `region_id` الصريح وحده، والمسار
 * لا يقرأ ترويسة `X-Region` (تلك تقييد التغذية والخريطة)، فلا تُرسَل معه.
 *
 * والمحافظة تُمرَّر **وسيطاً** لا تُقرأ من المتغيّر العام: هوية الطلب تُلتقط
 * قبل النداء، فجوابُ نقرٍ متأخّر يُقارَن بهويته لا بهوية ما هو مختار الآن.
 */
async function fetchAgendaDayCounts(monthKey, regionId) {
  const query = [`month=${encodeURIComponent(monthKey)}`];
  if (regionId !== null) query.push(`region_id=${encodeURIComponent(regionId)}`);
  try {
    const res = await apiFetch(`/api/events/calendar?${query.join('&')}`, { region: false });
    const data = await res.json();
    const counts = {};
    if (data && data.success && Array.isArray(data.days)) {
      data.days.forEach(day => { counts[day.date] = Number(day.count) || 0; });
    }
    return counts;
  } catch (e) {
    // انقطاع أو ردّ غير متوقَّع: تقويم بلا نقاط أصدق من تقويم يخمّن.
    console.error('Agenda calendar error:', e);
    return {};
  }
}

/** يرسم شبكة الشهر من `agendaDayCounts` وحدها (بلا شبكة) — فالنقر لا يعيد الجلب. */
function renderAgendaGrid() {
  const grid = document.getElementById('agendaDaysGrid');
  if (!grid) return;

  const year = agendaCurrentDate.getFullYear();
  const month = agendaCurrentDate.getMonth();
  const startingDay = new Date(year, month, 1).getDay(); // 0 = الأحد
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  const todayStr = isoLocalDay(new Date());
  const selectedDateStr = isoLocalDay(agendaSelectedDate);

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
    const count = agendaDayCounts[fullDateStr] || 0;
    // نقطة ذهبية لمناسبة واحدة وحمراء لاثنتين فأكثر — صنفان صريحان لكل لون،
    // لا نقطة واحدة بلون واحد كما كان الحال قبل التذكرة.
    const dotClass = count >= 2
      ? 'agenda-day-dot agenda-day-dot-many'
      : (count === 1 ? 'agenda-day-dot agenda-day-dot-single' : '');

    html += `
      <div class="agenda-day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${fullDateStr}" onclick="selectAgendaDate('${fullDateStr}')">
        <span>${d}</span>
        ${dotClass ? `<span class="${dotClass}"></span>` : ''}
      </div>
    `;
  }

  const totalCells = startingDay + totalDays;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let n = 1; n <= remainingCells; n++) {
    html += `<div class="agenda-day-cell other-month">${n}</div>`;
  }

  grid.innerHTML = html;
}

function agendaCalendarIdentity(monthKey, regionId) {
  return `${monthKey}|${regionId === null ? 'null' : regionId}`;
}

async function renderAgendaCalendar() {
  const year = agendaCurrentDate.getFullYear();
  const month = agendaCurrentDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  // هوية الطلب — الشهر **والمحافظة** — تُلتقط قبل النداء وتُقارَن بعد وصول
  // الجواب وقبل أي كتابة حالة. تبديل المحافظة أ ثم ب قد يستقبل جواب أ أخيراً،
  // فتُقبل أعدادُ أ وتناقض الاختيار. الحارس بالقيمة، لا بترتيب الطلبات ولا
  // بإلغائها: كل ما يغيّر الطلب داخل الهوية.
  const regionId = agendaRegionId;
  const countsIdentity = agendaCalendarIdentity(monthKey, regionId);

  // «القادم هذا الشهر» يعود مع كل فتح أو تبديل شهر أو محافظة — ولا يعود
  // لاختيار يومٍ آخر وحده (`selectAgendaDate` لا يمرّ من هنا). وقد يُخفى
  // القسم كاملاً لشهرٍ مضى بلا أي طلب.
  renderAgendaMonthUpcoming(year, month, regionId);

  const monthDisplay = document.getElementById('agendaMonthDisplay');
  if (monthDisplay) {
    monthDisplay.textContent = `${AR_MONTHS_NAMES[month]} ${year}`;
  }

  const grid = document.getElementById('agendaDaysGrid');
  if (!grid) return;

  // لا تظهر نقاطُ هوية سابقة أثناء جلب الهوية الجديدة: الحارس أدناه يحمي من
  // جوابٍ متأخّر، لكنه لا يمسح ما رُسم من الطلب السابق قبل أن يصل الجواب الجديد.
  if (agendaDayCountsIdentity !== null && agendaDayCountsIdentity !== countsIdentity) {
    agendaDayCounts = {};
    agendaDayCountsIdentity = null;
    renderAgendaGrid();
  }

  // إلى متغيّر محلي عمداً: الكتابة على `agendaDayCounts` قبل الحارس تجعل كل
  // جوابٍ متأخّر يكتب العدّ الذي سيُرسم بعده، فيصير الحارس بلا أثر.
  const counts = await fetchAgendaDayCounts(monthKey, regionId);
  if (agendaCurrentDate.getFullYear() !== year || agendaCurrentDate.getMonth() !== month
    || agendaRegionId !== regionId) return;

  agendaDayCounts = counts;
  agendaDayCountsIdentity = countsIdentity;
  renderAgendaGrid();
  renderAgendaSelectedDayEvents(isoLocalDay(agendaSelectedDate));
}

// حجم الصفحة في `GET /api/events` — سقف الخادم نفسه (DEFAULT/MAX في
// `events.service.js`)، فلا صفحة أكبر منه ولا حدّ أضيق يخفي ما بعده.
const AGENDA_PAGE_SIZE = 100;
// توقّف احتياطي للحلقة: عشرون صفحة = ألفا مناسبة في نطاق واحد، ولا يوم ولا شهر
// بلغه، ووجود السقف يمنع حلقةً لا تنقضي لو أعاد الخادم صفحاتٍ لا تنتهي.
const AGENDA_MAX_PAGES = 20;

/**
 * مناسبات نطاقٍ من `GET /api/events` القائم (`date_from` و`date_to`): الخادم
 * يطابق بالتقاطع على الامتداد نفسه الذي يعدّ به التقويم، فما يعدّه التقويم هو
 * ما يعود هنا — لا مصفوفة محلية ثانية. يستدعيه اليوم بنطاق يوم واحد وقسمُ
 * «القادم هذا الشهر» بنطاق شهر، والحلقة واحدة فلا سلوكين للصفحات.
 *
 * **والصفحات كلها تُحمَّل** حتى `pagination.totalPages`: الصفحة الواحدة سقفها
 * مئة، ويومٌ فيه ١٠١ مناسبة كان يعرض ١٠٠ ويعلن رقماً لا يمكن الوصول إلى ما
 * بعده. والعدّ المعلن `pagination.total` من الخادم لا طول ما وصل.
 *
 * والمحافظة تمرّ كما يراها المستخدم في التقويم: محافظةً محدّدة في ترويسة
 * `X-Region` (‏`region: false` كي لا تعلو عليها المحافظة المحفوظة)، أو
 * `all_regions=1` حين يكون الفلتر «كل المحافظات». وهي وسيط هنا كذلك، فحارس
 * الطلب في المستدعي يُقارن هوية الطلب لا الاختيار اللاحق.
 *
 * تعيد `{ events, total, truncated, failed }`؛ `truncated` تعني أن ما وصل أقل
 * من عدّ الخادم (سقف الصفحات أو صفحة فارغة)، و`failed` يفصل فشل الجلب عن نطاق
 * فارغ حقيقي كي لا تعلن الواجهة صفراً لا تعرفه.
 */
async function fetchAgendaRangeEvents(dateFrom, dateTo, regionId) {
  const options = regionId === null
    ? { allRegions: true }
    : { region: false, headers: { 'X-Region': String(regionId) } };
  const events = [];
  let total = 0;
  let page = 1;
  let lastPage = 1;

  while (true) {
    const query = `date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`
      + `&limit=${AGENDA_PAGE_SIZE}&page=${page}`;
    let data;
    try {
      const res = await apiFetch(`/api/events?${query}`, options);
      data = await res.json();
    } catch (e) {
      // انقطاع أو ردّ غير متوقَّع: قائمةٌ جزئية تعدّ نصف النطاق أسوأ من لا شيء،
      // فترجع القائمة فارغة كما كانت قبل الترقيم.
      console.error('Agenda range events error:', e);
      return { events: [], total: 0, truncated: false, failed: true };
    }
    if (!data || !data.success || !Array.isArray(data.events)) {
      return { events: [], total: 0, truncated: false, failed: true };
    }

    events.push(...data.events);
    const pagination = data.pagination || {};
    total = Number(pagination.total) || events.length;
    lastPage = Math.max(1, Number(pagination.totalPages) || 1);

    if (page >= lastPage) break; // آخر صفحة: الحلقة تمّت
    if (!data.events.length) break; // صفحة فارغة قبل النهاية: توقّف احتياطي
    if (page >= AGENDA_MAX_PAGES) break; // سقف الصفحات
    page += 1;
  }

  return { events, total, truncated: events.length < total, failed: false };
}

/** مناسبات يومٍ بعينه — نطاق يوم واحد على الجالب نفسه (سلوك قائمة اليوم كما هو). */
async function fetchAgendaDayEvents(dateStr, regionId) {
  return fetchAgendaRangeEvents(dateStr, dateStr, regionId);
}

// ---- «القادم هذا الشهر» تحت قائمة اليوم -----------------------------------
// مناسبات الشهر المعروض من اليوم (أو أول الشهر) إلى آخره، مجمّعة تحت رأس كل
// يوم. هوية الطلب هي الشهر المعروض + المحافظة، فجواب شهرٍ أو محافظةٍ سابقة
// لا يرسم تحت الحالي. شهرٌ مضى بكامله لا قسم له ولا طلب أصلاً.

/** هوية قسم «القادم هذا الشهر» التي طُلب لها آخر جواب. */
let agendaMonthUpcomingIdentity = null;

/** هل الشهر المعروض مضى بكامله قبل شهر اليوم؟ (شهر اليوم نفسه ليس ماضياً). */
function agendaMonthIsPast(year, month) {
  const now = new Date();
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
}

/** نطاق «القادم»: الأبعد بين اليوم وأول الشهر المعروض ← آخر يوم في الشهر المعروض. */
function agendaUpcomingRange(year, month) {
  const today = isoLocalDay(new Date());
  const monthStart = isoLocalDay(new Date(year, month, 1));
  return {
    from: today > monthStart ? today : monthStart,
    to: isoLocalDay(new Date(year, month + 1, 0))
  };
}

/**
 * «الجمعة ٢٠ نوفمبر» — باسم اليوم والشهر العربيين وأرقام عربية هندية، نفس
 * الصيغة التي يبنيها الموبايل من `arabicWeekdayName` و`arabicMonthName`
 * و`arabicDayNumber`، فلا نصّان ليوم واحد على العميلين.
 */
function formatAgendaUpcomingDay(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return dateStr;
  const weekday = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(date);
  const day = new Intl.DateTimeFormat('ar-EG', { day: 'numeric' }).format(date);
  return `${weekday} ${day} ${AR_MONTHS_NAMES[date.getMonth()]}`;
}

/** صفّ مناسبة واحد — نفس الصفّ، ونفس النقر ولوحة المفاتيح، في قائمة اليوم وفي «القادم هذا الشهر». */
function agendaEventItemHtml(evt) {
  return `
    <div class="agenda-event-item" role="button" tabindex="0"
      onclick="closeAgendaModal(); navigateToEvent(${evt.id});"
      onkeydown="agendaEventItemKeydown(event, ${evt.id});">
      <div>
        <div class="agenda-event-title">${escapeHtml(evt.title || evt.groom_name)}</div>
        <div class="agenda-event-meta">
          <span class="town-badge">${escapeHtml(evt.town)}</span>
          ${evt.occasion_type?.name ? `<span>${escapeHtml(evt.occasion_type.name)}</span>` : ''}
        </div>
      </div>
      <i class="fa-solid fa-chevron-left" style="color:var(--ink-faint);"></i>
    </div>
  `;
}

/**
 * لوحة المفاتيح لصفّ المناسبة: Enter والمسافة يفتحان المناسبة نفسها التي
 * يفتحها النقر، ولا يُنفَّذ شيء لمفتاح آخر. الصفّ `role="button"` بـ`tabindex`
 * فيبلغه Tab، وهذا المعالج يمنحه ما يمنحه زرٌّ أصلي بلا تغيير شكل الصفّ.
 */
function agendaEventItemKeydown(event, eventId) {
  if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
  event.preventDefault();
  closeAgendaModal();
  navigateToEvent(eventId);
}

/**
 * تاريخ تجميع المناسبة: الأبعد بين يومها وبداية النطاق — مناسبة متعددة الأيام
 * بدأت قبل اليوم تظهر تحت اليوم، لا تحت يومٍ مضى ولا في لا مكان.
 */
function agendaUpcomingGroupKey(evt, rangeFrom) {
  const own = String(evt.event_date || '').split('T')[0];
  return own > rangeFrom ? own : rangeFrom;
}

/** يجمّع المناسبات تحت أيامها صاعدةً؛ ترتيب الخادم داخل كل يوم كما هو. */
function groupAgendaUpcomingEvents(events, rangeFrom) {
  const groups = new Map();
  events.forEach(evt => {
    const date = agendaUpcomingGroupKey(evt, rangeFrom);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(evt);
  });
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * يجلب ويرسم «القادم هذا الشهر» للشهر المعروض والمحافظة المختارة.
 *
 * الشهر الماضي بكامله: القسم كله مخفي ولا طلب إطلاقاً. وغير ذلك يُطلب النطاق
 * من `GET /api/events` بالصفحات كلها، والشارة `pagination.total` من الخادم لا
 * طول ما وصل. والفشل سطرٌ عربي وشارة «—» — لا صفرٌ مخترع ولا «لا مناسبات».
 *
 * والحارس بعد الجواب يقارن الهوية لا ترتيب الطلبات: جواب شهرٍ أو محافظةٍ
 * سابقة يصل أخيراً لا يكتب تحت الحالي.
 */
async function renderAgendaMonthUpcoming(year, month, regionId) {
  const section = document.getElementById('agendaMonthUpcoming');
  const countEl = document.getElementById('agendaMonthUpcomingCount');
  const listEl = document.getElementById('agendaMonthUpcomingList');
  if (!section || !countEl || !listEl) return;

  // شهرٌ مضى بكامله: لا رأس ولا طلب — ويُخفى القسم ولو كان معروضاً قبله.
  if (agendaMonthIsPast(year, month)) {
    agendaMonthUpcomingIdentity = null;
    section.hidden = true;
    countEl.textContent = '…';
    listEl.innerHTML = '';
    return;
  }
  section.hidden = false;

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const identity = agendaCalendarIdentity(monthKey, regionId);
  agendaMonthUpcomingIdentity = identity;
  countEl.textContent = '…';
  // لا تبقى مناسبات شهرٍ سابق قابلة للنقر تحت الشهر الجديد على اتصال بطيء.
  listEl.innerHTML = '<p class="empty-state" style="padding:14px; text-align:center; font-size:0.88rem; color:var(--ink-soft);">جارٍ تحميل مناسبات الشهر…</p>';

  const { from, to } = agendaUpcomingRange(year, month);
  const { events, total, truncated, failed } = await fetchAgendaRangeEvents(from, to, regionId);
  // هوية الطلب — الشهر المعروض + المحافظة — لا اليوم المختار: تصفّح الأيام لا
  // يعيد جلب هذا القسم، وكل ما يغيّر الشهر أو المحافظة يغيّر الهوية.
  if (agendaMonthUpcomingIdentity !== identity) return;

  if (failed) {
    countEl.textContent = '—';
    listEl.innerHTML = `
      <p class="empty-state" style="padding:14px 14px 4px; text-align:center; font-size:0.88rem; color:var(--ink-soft);">تعذّر تحميل مناسبات الشهر — حاول مرة أخرى</p>
      <p style="text-align:center; margin:0 0 10px;">
        <button type="button" class="agenda-retry-btn" aria-label="إعادة المحاولة — القادم هذا الشهر" onclick="retryAgendaMonthUpcoming()">
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> إعادة المحاولة
        </button>
      </p>`;
    return;
  }

  // الشارة `total` من الخادم لا طول ما وصل: سقف الصفحات لا يجعل الشهر يعلن
  // عدداً أقل مما عدّه خادمه.
  countEl.textContent = `(${total})`;

  if (!events.length) {
    listEl.innerHTML = '<p class="empty-state" style="padding:14px; text-align:center; font-size:0.88rem; color:var(--ink-soft);">لا مناسبات قادمة في هذا الشهر</p>';
    return;
  }

  const groups = groupAgendaUpcomingEvents(events, from);
  listEl.innerHTML = groups.map(([date, dayEvents]) => `
    <div class="agenda-upcoming-group">
      <div class="agenda-upcoming-day" data-date="${date}">${formatAgendaUpcomingDay(date)}</div>
      ${dayEvents.map(agendaEventItemHtml).join('')}
    </div>
  `).join('') + (truncated
    // سطر واحد حين تُعرض قائمة ناقصة — نفس سطر قائمة اليوم، فالفرق حدُّ
    // الصفحات لا عطل.
    ? `<p style="padding:10px 14px; text-align:center; font-size:0.82rem; color:var(--ink-soft);">تُعرض أول ${events.length} من ${total} مناسبة</p>`
    : '');
}

/**
 * إعادة محاولة «القادم هذا الشهر» وحدها: النطاق الذي فشل هو ما يُعاد طلبه،
 * لا عدّ التقويم ولا قائمة اليوم.
 */
function retryAgendaMonthUpcoming() {
  renderAgendaMonthUpcoming(
    agendaCurrentDate.getFullYear(),
    agendaCurrentDate.getMonth(),
    agendaRegionId
  );
}

function selectAgendaDate(dateStr) {
  agendaSelectedDate = new Date(dateStr + 'T00:00:00');
  // تمييز اليوم فوراً بلا إعادة جلب عدّ الشهر — الجلب لِما تحته وحده.
  renderAgendaGrid();
  renderAgendaSelectedDayEvents(dateStr);
}

async function renderAgendaSelectedDayEvents(dateStr) {
  const labelEl = document.getElementById('agendaSelectedDateLabel');
  const countBadge = document.getElementById('agendaDayCountBadge');
  const listEl = document.getElementById('agendaEventsList');
  if (!listEl) return;

  const d = new Date(dateStr + 'T00:00:00');
  const formattedDate = `${d.getDate()} ${AR_MONTHS_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  // هوية الطلب هنا اليوم **والمحافظة** معاً: تبديل المحافظة يعيد طلب اليوم
  // نفسه، فحارس اليوم وحده يُبقي قائمة المحافظة السابقة تحت العنوان الجديد.
  const regionId = agendaRegionId;

  if (labelEl) labelEl.textContent = `مناسبات ${formattedDate}`;
  if (countBadge) countBadge.textContent = '…';
  // امسح عناصر اليوم السابق قبل أي انتظار: لا تبقى مناسبة قابلة للنقر تحت
  // عنوان يوم جديد على اتصال بطيء.
  listEl.innerHTML = '<p class="empty-state" style="padding:14px; text-align:center; font-size:0.88rem; color:var(--ink-soft);">جارٍ تحميل مناسبات اليوم…</p>';

  const { events, total, truncated, failed } = await fetchAgendaDayEvents(dateStr, regionId);
  // اختير يوم آخر أو محافظة أخرى أثناء الجلب: لا تُرسم شارةُ ولا قائمةُ طلبٍ
  // قديم — ولا حتى مسار «لا توجد مناسبات» وهو كتابةُ حالة كذلك.
  if (isoLocalDay(agendaSelectedDate) !== dateStr || agendaRegionId !== regionId) return;

  if (failed) {
    // ليس صفراً: لا نعرف عدد اليوم ولا إن كانت القائمة فارغة فعلاً.
    if (countBadge) countBadge.textContent = '—';
    listEl.innerHTML = '<p class="empty-state" style="padding:14px; text-align:center; font-size:0.88rem; color:var(--ink-soft);">تعذّر تحميل مناسبات هذا اليوم — تحقّق من الاتصال وحاول مرة أخرى</p>';
    return;
  }

  // الشارة `total` من الخادم لا طول ما وصل: توقّفُ الحلقة قبل النهاية لا
  // يجعل اليوم يعلن عدداً أقل مما عدّه تقويمه.
  if (countBadge) countBadge.textContent = `${total} مناسبة`;

  if (!events.length) {
    listEl.innerHTML = `<p class="empty-state" style="padding:14px; text-align:center; font-size:0.88rem; color:var(--ink-soft);">لا توجد مناسبات مسجلة في هذا اليوم</p>`;
    return;
  }

  listEl.innerHTML = events.map(agendaEventItemHtml).join('') + (truncated
    // سطر واحد حين تُعرض قائمة ناقصة: الشارة تعدّ اليوم كله والقائمة أقلّ،
    // فبلا هذا السطر يبدو الفرق عطلاً لا حدّاً.
    ? `<p style="padding:10px 14px; text-align:center; font-size:0.82rem; color:var(--ink-soft);">تُعرض أول ${events.length} من ${total} مناسبة</p>`
    : '');
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
 * وbuildOccasionFieldsHtml (occasionForm.js) هي مالكة الحقول السبعة عشر
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
  renderExtraDayAddButton: containerId => `
    <button type="button" class="add-nokoot-btn" style="margin-top:6px;" onclick="addEventDayRow('${containerId}')">
      <i class="fa-solid fa-plus"></i> أضف يوماً
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
          <p class="poster-crop-hint">المستطيل هو ما سيظهر في كرت المناسبة بنسبة ٤:٥ — اسحب زواياه لتحديد الجزء الظاهر، أو اسحب من الوسط لتحريكه. المربّع المنقّط توضيحي لما تستخدمه بطاقة المشاركة، وزرّ «استخدام الصورة كاملة» يرفع الصورة بلا قصّ.</p>
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
    // بلدات محافظة الزائر وحدها — لا كل بلدات المنصة.
    populateTownSelect('addTown', null, selectedRegionId);
    // منتقي المحافظة (#124) يُلحَق بعد القرية مباشرةً، ويظهر تحت البند الجامع
    // وحده — updateVillagePickerVisibility يقرّر الإظهار ويملأ الخيارات.
    const villageGroup = document.getElementById('addVillageGroup');
    if (villageGroup) villageGroup.insertAdjacentHTML('afterend', publishRegionGroupHtml());
    updateVillagePickerVisibility();
  }

  const dateInput = document.getElementById('addEventDate');
  if (dateInput) dateInput.value = isoLocalDay(new Date());

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

  // المحافظة إلزامية تحت البند الجامع وحده (تذكرة #124): تُملأ من
  // regionsList **النشطة** (تذكرة #127) مرة واحدة ثم تبقى، فلا يمسح تبديلُ
  // البلدة ذهاباً وإياباً اختيار المستخدم. وقائمة محافظات فارغة (فشل
  // GET /api/towns، أو كلها موقوفة) لا تعرض حقلاً لا خيار فيه.
  const regionGroup = document.getElementById('addRegionGroup');
  const regionSelect = document.getElementById('addRegion');
  const activeRegionCount = activeRegionsList().length;
  if (regionGroup) regionGroup.style.display = isVillages && activeRegionCount ? 'block' : 'none';
  if (regionSelect && isVillages && activeRegionCount && regionSelect.options.length <= 1) {
    // محافظة الزائر افتراضاً — لا الأولى — كي لا يختار من اختار محافظته حبّةً
    // قبلها اختياراً ثانياً. وتغيير صريح بعده يعلو على هذا الافتراضي.
    populateRegionSelect('addRegion', selectedRegionId);
  }

  if (isVillages) {
    populateVillageSelect();
  } else {
    const villageSelect = document.getElementById('addVillage');
    if (villageSelect) villageSelect.value = '';
  }
  syncRequestedVillageInput('add');
}

/**
 * قرى منتقي القرية في نموذج النشر: قرى المحافظة المختارة في #addRegion وحدها،
 * بنفس قاعدة فلتر المكان (placeFilterVillageOptions): تُطبَّق الفلترة حين تحمل
 * كل صفوف GET /api/towns حقل `region_id`، وبلا هذه المعلومات تُعرض القرى كلها
 * بدل قائمة فارغة. فقرى محافظتين لا تختلط في منتقٍ واحد.
 */
function publishFormVillages() {
  const regionSelect = document.getElementById('addRegion');
  const regionId = regionSelect && regionSelect.value ? Number(regionSelect.value) : null;
  if (regionId === null || !villagesList.length) return villagesList;
  const villagesHaveRegion = villagesList.every(v => v.region_id !== undefined && v.region_id !== null);
  return villagesHaveRegion ? villagesList.filter(v => Number(v.region_id) === regionId) : villagesList;
}

/**
 * يملأ منتقي القرية بقرى المحافظة المختارة. `preserveSelection` تُبقي القرية
 * المختارة ما دامت في القائمة الجديدة؛ وبدونها (تبديل المحافظة صراحةً) تُمسح،
 * فلا تبقى قرية من محافظة أخرى مختارةً تحت قائمتها.
 */
function populateVillageSelect(preserveSelection = true) {
  const select = document.getElementById('addVillage');
  if (!select) return;
  const current = preserveSelection ? select.value : '';
  select.innerHTML = villageSelectOptionsHtml(publishFormVillages());
  const kept = current && Array.from(select.options).some(o => o.value === current);
  select.value = kept ? current : '';
}

/** تبديل محافظة القرية: تُبنى القرى من المحافظة الجديدة وحدها، والقرية السابقة تُمسح. */
function handleAddRegionChange() {
  populateVillageSelect(false);
  syncRequestedVillageInput('add');
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
// rectangle starts as the largest 4:5 rectangle centred in the working canvas
// (#178: the event card's poster ratio), so confirming it as-is uploads exactly
// the card crop; «استخدام الصورة كاملة» below is the uncropped way out.

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

  const selectionGeneration = posterCropSelectionGeneration;
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (selectionGeneration !== posterCropSelectionGeneration) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
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
      rect: initialPosterCropRect(workingWidth, workingHeight),
      drag: null,
      blob: null,
      editGeneration: 0
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
    if (selectionGeneration !== posterCropSelectionGeneration) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
    posterCropDecodeFailed = true;
    URL.revokeObjectURL(objectUrl);
  };
  image.src = objectUrl;
}

/**
 * أكبر مستطيل ٤:٥ متمركز في قماشة العمل، بأعداد صحيحة بالبكسل ولا يتجاوز
 * القماشة. صورة ٤:٥ أصلاً يغطّيها الحساب تماماً، بلا حالة خاصة.
 */
function initialPosterCropRect(width, height) {
  let w;
  let h;
  if (width / height > POSTER_CROP_ASPECT) {
    h = height;
    w = Math.round(h * POSTER_CROP_ASPECT);
  } else {
    w = width;
    h = Math.round(w / POSTER_CROP_ASPECT);
  }
  w = Math.min(w, width);
  h = Math.min(h, height);
  return {
    x: Math.floor((width - w) / 2),
    y: Math.floor((height - h) / 2),
    w,
    h
  };
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

/**
 * حساب بالفرق (delta) عن نقطة بدء السحب — لا يعتمد على موضع العنصر في الصفحة،
 * فيعمل بلا تخطيط حقيقي أيضاً. سحب الزاوية يحفظ ٤:٥ (تذكرة #178): المحور
 * الغالب بالمؤشّر يقود والبعد الآخر يُشتق من النسبة، والزاوية المقابلة مربوطة.
 * السحب من داخل المستطيل نقلٌ حرّ لا يغيّر أبعاده.
 */
function movePosterCropDrag(e) {
  const state = posterCropState;
  if (!state || !state.drag) return;

  const dx = (e.clientX - state.drag.startClientX) / state.displayScale;
  const dy = (e.clientY - state.drag.startClientY) / state.displayScale;
  const start = state.drag.startRect;
  const corner = state.drag.corner;

  state.rect = corner === 'move'
    ? clampPosterCropPosition({ x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }, state)
    : resizePosterCropRect(state, corner, dx, dy);
  state.editGeneration += 1;
  state.blob = null;
  renderPosterCropBox();
}

function endPosterCropDrag() {
  if (posterCropState) posterCropState.drag = null;
  document.removeEventListener('pointermove', movePosterCropDrag);
  document.removeEventListener('pointerup', endPosterCropDrag);
  document.removeEventListener('pointercancel', endPosterCropDrag);
}

/** النقل من داخل المستطيل يحرّك الموضع وحده — الأبعاد تبقى كما هي حرفياً، فلا يغيّر النقل نسبة ٤:٥. */
function clampPosterCropPosition(rect, state) {
  const { x, y, w, h } = rect;
  return {
    x: Math.max(0, Math.min(x, state.workingWidth - w)),
    y: Math.max(0, Math.min(y, state.workingHeight - h)),
    w,
    h
  };
}

/**
 * سحب الزاوية بنسبة الكرت: المحور الغالب بحركة المؤشّر (بالبكسل داخل القماشة)
 * يضبط ضلعه، والبعد الآخر يُشتق من النسبة، والزاوية المقابلة تبقى مكانها.
 * الحدّ الأدنى والبقاء داخل القماشة يُفرضان **بعد** تثبيت النسبة — لو قُصّت
 * الأضلاع الخام أولاً لخرج مستطيل ٣:٤ أو ٢:٣ عند الحافة.
 */
function resizePosterCropRect(state, corner, dx, dy) {
  const start = state.drag.startRect;
  const left = corner.includes('l');
  const top = corner.includes('t');

  // الزاوية المقابلة مربوطة، والمساحة المتاحة هي امتدادها داخل القماشة.
  const anchorX = left ? start.x + start.w : start.x;
  const anchorY = top ? start.y + start.h : start.y;
  const roomW = left ? anchorX : state.workingWidth - anchorX;
  const roomH = top ? anchorY : state.workingHeight - anchorY;
  const maxW = Math.max(1, Math.min(roomW, roomH * POSTER_CROP_ASPECT));

  // المحور الغالب هو الذي يقود، والبعد الآخر يتبع النسبة.
  const byWidth = start.w + (left ? -dx : dx);
  const byHeight = (start.h + (top ? -dy : dy)) * POSTER_CROP_ASPECT;
  const driven = Math.abs(dx) >= Math.abs(dy) ? byWidth : byHeight;

  // بعد تثبيت النسبة: سقف القماشة، ثم الحدّ الأدنى ما لم يكن السقف أصغر منه.
  let w = Math.min(driven, maxW);
  w = Math.max(w, Math.min(POSTER_CROP_MIN_SIZE, maxW));
  w = Math.floor(w);
  const h = Math.round(w / POSTER_CROP_ASPECT);

  return {
    x: left ? anchorX - w : anchorX,
    y: top ? anchorY - h : anchorY,
    w,
    h
  };
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
  state.editGeneration += 1;
  state.blob = null;
  renderPosterCropBox();
  exportPosterCrop(state.rect);
}

/**
 * يرسم المستطيل المحدَّد فقط من المصدر (أصلاً محدود ‎1600px‎ بالفعل) إلى قماشة
 * جديدة ويصدّرها JPEG بجودة ٠٫٩ — ويُعيد وعداً بالبلوب كي ينتظره الإرسال حين
 * لم يؤكّد الناشر قصّه بعد (#178).
 */
function exportPosterCrop(rect) {
  const state = posterCropState;
  const source = document.getElementById('posterCropCanvas');
  if (!state || !source) return Promise.resolve(null);
  const editGeneration = state.editGeneration;

  const outWidth = Math.max(1, Math.round(rect.w));
  const outHeight = Math.max(1, Math.round(rect.h));
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  outCanvas.getContext('2d').drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, outWidth, outHeight);

  return new Promise(resolve => {
    outCanvas.toBlob(blob => {
      if (!blob || posterCropState !== state || state.editGeneration !== editGeneration) {
        resolve(null);
        return;
      }
      state.blob = blob;
      showPosterCropPreview(blob);
      resolve(blob);
    }, 'image/jpeg', 0.9);
  });
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
  const state = posterCropState;
  if (!state) return;
  // كل فتح للمحرّر يبدأ من أكبر ٤:٥ متمركز (#178): «استخدام الصورة كاملة»
  // يترك المستطيل بحجم الصورة، فإعادة فتحه لا يجوز أن تصدّر قصّاً بغير نسبة
  // الكرت. والبلوب السابق يُسقَط كي لا يُرفع ما صدّره مسارٌ سبق بدل المستطيل
  // المعروض الآن.
  state.rect = initialPosterCropRect(state.workingWidth, state.workingHeight);
  state.editGeneration += 1;
  state.blob = null;
  renderPosterCropBox();
  document.getElementById('posterUploadBox').hidden = true;
  document.getElementById('posterCropEditor').hidden = false;
  document.getElementById('posterCropPreview').hidden = true;
}

/** يمحو كل شيء ويُعيد مربّع الاختيار — الطريق الوحيد لبدء صورة جديدة من الصفر. */
function choosePosterAgain() {
  resetPosterCropState({ clearInput: true });
}

function resetPosterCropState({ clearInput } = {}) {
  posterCropSelectionGeneration += 1;
  if (posterCropState) {
    if (posterCropState.objectUrl) URL.revokeObjectURL(posterCropState.objectUrl);
    if (posterCropState.previewUrl) URL.revokeObjectURL(posterCropState.previewUrl);
  }
  posterCropState = null;
  posterCropDecodeFailed = false;

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
  const catTabs = serviceCategoriesCache.map(c => {
    const catIcon = usableCategoryIcon(c.icon);
    return `
    <button class="town-pill ${selectedServiceCategoryId === c.id ? 'active' : ''}" data-cat-id="${c.id}" onclick="selectServiceCategory(${c.id})">
      ${catIcon ? escapeHtml(catIcon) + ' ' : ''}${escapeHtml(c.name)}
    </button>
  `;
  }).join('');
  container.innerHTML = allTab + catTabs;
  // الرقاقة تقرأ اسم الفئة من هذه القائمة، وكانت تُحسب قبل وصولها فتظنّ
  // «كل الفئات» — إعادة الحساب بعد الوصول تُبقي الاسم والفلتر متطابقين.
  updateServiceFilterChipLabels();
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

/**
 * بلاطة فئة من الرئيسية (M1-W): تفتح «دليل خدمات المناسبات» على الفئة نفسها.
 * الاختيار يُكتب في الحالة قبل `switchTab` كي يبنيه التبويب في أول فتح بالفئة
 * الصحيحة، و`selectServiceCategory` تزامن الحبّة والرقاقة حين يكون مبنيّاً.
 */
function openHomeServiceCategory(categoryId) {
  const resolved = Number(categoryId);
  const id = Number.isInteger(resolved) && resolved > 0 ? resolved : null;
  const alreadyBuilt = servicesInitialized;
  selectedServiceCategoryId = id;
  switchTab('tabServices');
  if (alreadyBuilt) selectServiceCategory(id);
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
      const optIcon = usableCategoryIcon(opt.icon);
      return `
        <label class="filter-option-row">
          <input type="radio" name="serviceCatRadio" value="${opt.id === null ? '' : opt.id}" ${isChecked ? 'checked' : ''} onchange="serviceDraftCategoryId = this.value ? Number(this.value) : null">
          <span>${optIcon ? escapeHtml(optIcon) + ' ' : ''}${escapeHtml(opt.label)}</span>
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

  container.innerHTML = providers.map(p => renderServiceProviderEntryHtml(p)).join('');
}

/**
 * الشكل الذي يرسمه الدليل لكل مزوّد (تذكرة #158): الصفّ المختصر افتراضاً
 * (‏٤–٥ مزوّدين في الشاشة)، والكرت الكبير حين يختار السوبر أدمن `cards`.
 * القرار من `providersDisplayMode` وحده — الذي يصل من الخادم.
 */
function renderServiceProviderEntryHtml(p) {
  return providersDisplayMode === 'cards'
    ? renderSingleServiceCardHtml(p)
    : renderCompactServiceRowHtml(p);
}

/** تسمية شارة السعر — واحدة للصفّ المختصر والكرت الكبير، فلا تسميتان لسعر واحد. */
function providerPriceBadgeText(p) {
  if (p.price_type === 'contact') return 'تواصل للسعر';
  if (p.price_type === 'starting_at') return 'ابتداءً من';
  if (p.price_type === 'fixed') return 'سعر محدد';
  return 'سعر تقديري';
}

/**
 * معرّف زائر عشوائي (تذكرة #185): يُولَّد مرة ويبقى في `localStorage` تحت
 * `negev_visitor_id`. `crypto.randomUUID()` حيث يتوفّر، وإلا 32 حرفاً hex من
 * `crypto.getRandomValues` أو `Math.random` في متصفّح قديم. الشكل يطابق ما
 * يتحقّق منه الخادم (16..64 من `[A-Za-z0-9_-]`)، فلا يصل مفتاح مرفوض.
 */
function newProviderVisitorId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    // متصفّح يمنع crypto — البديل العشوائي أدناه يكفي لمعرّف غير سرّي.
  }
  let fallback = '';
  while (fallback.length < 32) {
    fallback += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  }
  return fallback.slice(0, 32);
}

/** المعرّف المحفوظ، أو يُولَّد ويُحفظ مرة واحدة. التخزين المعطَّل يعطي معرّفاً لهذه الجلسة. */
function providerVisitorId() {
  try {
    const saved = localStorage.getItem(VISITOR_ID_STORAGE_KEY);
    if (saved && VISITOR_ID_PATTERN.test(saved)) return saved;
    const generated = newProviderVisitorId();
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, generated);
    return generated;
  } catch (e) {
    return newProviderVisitorId();
  }
}

/**
 * عدّادات البطاقة: 👁 المشاهدات و♥ المفضّلة (تذكرة #185) — الصفر يُعرض أيضاً —
 * و★ «المتوسط (العدد)» (تذكرة #186). **نجمة بلا تقييمات لا تُعرض**: صفرٌ أو
 * شرطة سوداء تقول «مزوّد سيّئ» عن مزوّد لم يقيّمه أحد بعد، خلافاً لعدّادٍ
 * حقيقيّ قيمته صفر. ومزوّد له تقييمات بلا `rating_avg` (خادم أقدم) يُعامل
 * كغير المقيَّم بدل عرض `NaN`.
 */
function providerStatsHtml(p) {
  const ratingCount = Number(p && p.rating_count) || 0;
  const ratingAvg = p && p.rating_avg !== null && p.rating_avg !== undefined && Number.isFinite(Number(p.rating_avg))
    ? Number(p.rating_avg)
    : null;
  const ratingHtml = ratingCount > 0 && ratingAvg !== null
    ? `<span class="provider-stat provider-stat-rating" data-stat="rating" title="متوسط التقييمات">
      <span class="provider-stat-icon" aria-hidden="true">★</span>
      <span class="provider-stat-num">${ratingAvg.toFixed(1)}</span>
      <span class="provider-stat-count">(${ratingCount})</span>
    </span>`
    : '';

  return `
    <span class="provider-stat" data-stat="views" title="عدد المشاهدات">
      <span class="provider-stat-icon" aria-hidden="true">👁</span>
      <span class="provider-stat-num">${Number(p && p.views_count) || 0}</span>
    </span>
    <span class="provider-stat" data-stat="favorites" title="عدد من حفظوه">
      <span class="provider-stat-icon" aria-hidden="true">♥</span>
      <span class="provider-stat-num">${Number(p && p.favorites_count) || 0}</span>
    </span>${ratingHtml}`;
}

/**
 * تسجيل مشاهدة صفحة مزوّد مرة واحدة لكل تحميل — تُستدعى لحظة فتح نافذة
 * المزوّد، لا عند كل رسم للبطاقة. الخادم يمنع تكرار اليوم نفسه أساساً، وهذا
 * الحارس يوفّر الطلب المكرّر في الجلسة الواحدة.
 */
async function recordProviderView(providerId) {
  const id = Number(providerId);
  if (!id || providerViewsRecorded.has(id)) return;
  providerViewsRecorded.add(id);
  try {
    const res = await apiFetch(`/api/services/providers/${id}/view`, {
      method: 'POST',
      // الرمز يُرفق إن وُجد (المستخدم المسجَّل مفتاحه `u:<id>` في الخادم)،
      // و`X-Visitor-Id` يرافق الطلب دائماً لأن الزائر هو من لا رمز له.
      auth: true,
      headers: { 'X-Visitor-Id': providerVisitorId() }
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) return;
    applyProviderViewCount(id, data.views_count);
  } catch (e) {
    console.error('Provider view error:', e);
  }
}

/** يحدّث عدّاد المشاهدة في الكاش والبطاقة والنافذة بما ردّ به الخادم. */
function applyProviderViewCount(providerId, viewsCount) {
  const count = Number(viewsCount) || 0;
  const cached = providerDetailsCache[providerId];
  if (cached) cached.views_count = count;
  const row = serviceProvidersCache.find(item => Number(item.id) === Number(providerId));
  if (row) row.views_count = count;
  updateProviderStatsDom(providerId);
}

/** يعيد رسم عدّادي المزوّد حيث ظهر: صفّ القائمة، الكرت، ونافذته المفتوحة. */
function updateProviderStatsDom(providerId) {
  const provider = providerDetailsCache[providerId]
    || serviceProvidersCache.find(item => Number(item.id) === Number(providerId));
  if (!provider) return;
  for (const id of [`serviceRowStats-${providerId}`, `serviceCardStats-${providerId}`, `myListProviderStats-${providerId}`]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = providerStatsHtml(provider);
  }
  if (Number(currentProviderId) === Number(providerId)) {
    const modalStats = document.getElementById('providerModalStats');
    if (modalStats) modalStats.innerHTML = providerStatsHtml(provider);
  }
}

/** زرّ «احفظ المزوّد»/«محفوظ» — حالته من كائن المزوّد المخزَّن لا من نصّ الزرّ. */
function updateProviderFavoriteButton(provider) {
  const btn = document.getElementById('providerFavoriteBtn');
  if (!btn) return;
  const saved = Boolean(provider && provider.is_favorite);
  btn.classList.toggle('is-saved', saved);
  btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
  btn.innerHTML = saved
    ? '<i class="fa-solid fa-heart" aria-hidden="true"></i> <span>محفوظ</span>'
    : '<i class="fa-regular fa-heart" aria-hidden="true"></i> <span>احفظ المزوّد</span>';
}

/**
 * تبديل المفضّلة عبر PUT/DELETE، والعدّاد يُقرأ من ردّ الخادم وحده. الزائر
 * يُحوَّل إلى الدخول بنيّة محفوظة، فيعود إلى نافذة المزوّد نفسها بعد الدخول.
 */
async function toggleProviderFavorite() {
  const providerId = Number(currentProviderId);
  const provider = providerDetailsCache[providerId];
  if (!providerId || !provider) return;
  if (!requireAuth({ type: 'provider_favorite', providerId })) return;

  const wantFavorite = !provider.is_favorite;
  const btn = document.getElementById('providerFavoriteBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await apiFetch(`/api/services/providers/${providerId}/favorite`, {
      method: wantFavorite ? 'PUT' : 'DELETE',
      auth: true
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      alert((data && data.message) || 'تعذّر حفظ المزوّد — حاول مرة أخرى');
      return;
    }
    provider.is_favorite = Boolean(data.is_favorite);
    provider.favorites_count = Number(data.favorites_count) || 0;
    updateProviderFavoriteButton(provider);
    updateProviderStatsDom(providerId);
    showToast(data.is_favorite ? 'حُفظ المزوّد في «مزوّدون محفوظون»' : 'أُزيل المزوّد من محفوظاتك');
    // القسم في «قائمتي» يتبع الحالة الجديدة بلا إعادة تحميل الصفحة.
    loadSavedProviders();
  } catch (e) {
    alert('تعذّر حفظ المزوّد — تحقّق من الاتصال');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * شارتا المزوّد (تذكرة #184): «موثّق» و«مميّز» يضعهما السوبر أدمن وحدهما من
 * اللوحة، وتصلان مع كل صفّ في القائمة (`is_verified`/`is_featured`). لا شارة
 * لغيابهما — لا شارة رمادية تقول «غير موثّق»، فالغياب هو الحالة الافتراضية.
 */
function providerBadgesHtml(p) {
  const badges = [];
  if (p.is_verified) {
    badges.push('<span class="provider-badge provider-badge-verified"><i class="fa-solid fa-circle-check"></i> موثّق</span>');
  }
  if (p.is_featured) {
    badges.push('<span class="provider-badge provider-badge-featured"><i class="fa-solid fa-star"></i> مميّز</span>');
  }
  return badges.length ? badges.join('') : '';
}

/**
 * الصفّ المختصر (تذكرة #158): صورة مربّعة 88px، والاسم عريض 17، وسطر الفئة
 * والبلدة، وشارة سعر صغيرة، وزرّا «اتصال» (حين يوجد رقم) و«تفاصيل».
 * «تفاصيل» يفتح نافذة المزوّد القائمة `openProviderModal`، وهي تقرأ
 * `GET /api/services/providers/:id` فتحمل حزمة السعر والمواصفات — والرقم
 * نفسه لا يُجلب إلا هناك، فلا رقم في القائمة أصلاً.
 */
function renderCompactServiceRowHtml(p, { rowId = `serviceRow-${p.id}`, statsId = `serviceRowStats-${p.id}` } = {}) {
  const toneColor = p.category_color
    ? (p.category_color.startsWith('#') ? p.category_color : `#${p.category_color}`)
    : '#B8860B';

  // القائمة تحمل has_phone فقط (لا الرقم نفسه)؛ غيابه (خادم أقدم) يعني «نعم»
  const hasPhone = p.has_phone !== false;

  const priceBadgeText = providerPriceBadgeText(p);
  const categoryIcon = usableCategoryIcon(p.category_icon);

  const mediaHtml = p.image_url
    ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="service-row-img" loading="lazy">`
    : `<span class="service-row-img service-row-img-placeholder">${categoryIcon ? escapeHtml(categoryIcon) : '🛠️'}</span>`;

  // البلدان القليلة تُسمّى صراحةً، والأكثر يُسمّى منه اثنان و«وغيرها» — لا
  // ادّعاء «جميع البلدات» من قائمة قصيرة (تذكرة #127)، ولا سطر يطول.
  const townsText = (p.towns && p.towns.length)
    ? (p.towns.length > 3
        ? `${p.towns.slice(0, 2).join('، ')} وغيرها`
        : p.towns.join('، '))
    : 'مناطق الخدمة غير محدَّدة';

  const badgesHtml = providerBadgesHtml(p);

  return `
    <div class="service-row" id="${rowId}" style="--tone:${toneColor}">
      <div class="service-row-summary">
        ${mediaHtml}
        <div class="service-row-body">
          <h3 class="service-row-name">${escapeHtml(p.name)}</h3>
          ${badgesHtml ? `<div class="service-row-badges">${badgesHtml}</div>` : ''}
          <div class="service-row-meta">
            <span class="service-row-category">${categoryIcon ? escapeHtml(categoryIcon) + ' ' : ''}${escapeHtml(p.category_name || 'خدمة')}</span>
            <span class="service-row-town"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(townsText)}</span>
          </div>
          <div class="service-row-stats" id="${statsId}">${providerStatsHtml(p)}</div>
          <span class="service-row-price">
            <i class="fa-solid fa-tag"></i> <span class="service-row-price-text">${p.price != null ? `${Number(p.price).toLocaleString('ar-EG')} ₪ · ` : ''}${priceBadgeText}</span>
          </span>
        </div>
      </div>
      <div class="service-row-actions">
        ${hasPhone ? `<button type="button" class="service-row-btn service-row-contact" onclick="openProviderModal(${p.id}, { revealContact: true })">
          <i class="fa-solid fa-phone"></i> اتصال
        </button>` : ''}
        <button type="button" class="service-row-btn service-row-details" onclick="openProviderModal(${p.id})">
          <i class="fa-solid fa-circle-info"></i> تفاصيل
        </button>
      </div>
    </div>
  `;
}

/** رقم التواصل اختياري — السطر الهادئ الذي يحلّ محل أزرار الاتصال عند غيابه */
function noProviderPhoneHtml() {
  return '<div style="font-size:0.8rem; color:var(--ink-faint);"><i class="fa-solid fa-phone-slash"></i> لا يوجد رقم تواصل مسجّل</div>';
}

function renderSingleServiceCardHtml(p) {
  const toneColor = p.category_color
    ? (p.category_color.startsWith('#') ? p.category_color : `#${p.category_color}`)
    : '#B8860B';
  const toneStyle = ` style="--tone:${toneColor}"`;
  const bezelSvg = getBezelOrnamentSvg(toneColor);
  const bezelStyle = ` style="background-image:url(&quot;${bezelSvg}&quot;)"`;

  // القائمة تحمل has_phone فقط (لا الرقم نفسه)؛ غيابه (خادم أقدم) يعني «نعم»
  const hasPhone = p.has_phone !== false;

  // Price Badge text
  const priceBadgeText = providerPriceBadgeText(p);
  const categoryIcon = usableCategoryIcon(p.category_icon);

  // Floating Media Content
  const mediaHtml = p.image_url ? `
    <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="card-media-img" loading="lazy">` : `
    <div class="service-card-media-placeholder">
      <span class="placeholder-icon">${categoryIcon ? escapeHtml(categoryIcon) : '🛠️'}</span>
    </div>`;

  // Towns line
  const townsText = (p.towns && p.towns.length)
    ? (p.towns.includes('جميع البلدات') || p.towns.length > 5 ? 'يخدم جميع بلدات منطقتك' : `يخدم: ${p.towns.join('، ')}`)
    : 'يخدم بلدات منطقتك';

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
                ${categoryIcon ? escapeHtml(categoryIcon) + ' ' : ''}${escapeHtml(p.category_name || 'خدمة')}
              </span>
              <span class="service-badge-price">
                <i class="fa-solid fa-tag"></i> ${priceBadgeText}${p.price != null ? `: ${Number(p.price).toLocaleString('ar-EG')} ₪` : ''}
              </span>
            </div>
          </div>

          <!-- جسم الكرت والوصف العام والباكيج -->
          <div class="service-card-caption">
            <h2 class="service-card-title" onclick="toggleServiceDetails(${p.id})" style="cursor:pointer;">${escapeHtml(p.name)}</h2>
            ${providerBadgesHtml(p) ? `<div class="provider-badges">${providerBadgesHtml(p)}</div>` : ''}
            <div class="service-card-price-hero">
              <span class="price-hero-label">${priceBadgeText}:</span>
              <span class="price-hero-num">${p.price != null ? `<strong>${Number(p.price).toLocaleString('ar-EG')}</strong> <span class="price-currency">₪</span>` : '<strong>حسب الطلب</strong>'}</span>
            </div>
            <div class="service-card-towns">
              <i class="fa-solid fa-location-dot" style="color:var(--tone)"></i>
              <span>${escapeHtml(townsText)}</span>
            </div>
            <div class="service-card-stats" id="serviceCardStats-${p.id}">${providerStatsHtml(p)}</div>
            ${p.description ? `<p class="service-card-desc">${escapeHtml(p.description)}</p>` : ''}
            ${packageBannerHtml}

            <!-- شريط الأزرار التفاعلية -->
            <div class="service-card-actions">
              ${hasPhone ? `<button type="button" class="service-action-btn service-contact-btn" onclick="revealServiceContact(${p.id})">
                <i class="fa-solid fa-phone"></i> <span>تواصل فوري</span>
              </button>` : ''}
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
              <i class="fa-solid fa-map-location-dot"></i> <strong>المناطق المخدومة:</strong> ${(p.towns && p.towns.length) ? escapeHtml(p.towns.join('، ')) : 'جميع بلدات منطقتك'}
            </div>

            <!-- أزرار التواصل المباشرة المفتوحة بعد النقر -->
            <div id="serviceContactRow-${p.id}">
              ${hasPhone ? `<button type="button" class="submit-btn" style="width:100%;" onclick="revealServiceContact(${p.id})">
                <i class="fa-solid fa-phone"></i> إظهار خيارات الاتصال والواتساب
              </button>` : noProviderPhoneHtml()}
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

  // فتح البطاقة الكبيرة (لا رسمها) مشاهدةٌ للمزوّد (تذكرة #185): مرة واحدة
  // لكل تحميل بحارس recordProviderView، فلا يعدّها كل فتح/إغلاق.
  if (isHidden) recordProviderView(providerId);

  const btn = btnEl || document.getElementById(`serviceMoreBtn-${providerId}`);
  if (btn) {
    btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    btn.innerHTML = isHidden
      ? `<i class="fa-solid fa-chevron-up"></i> <span>إخفاء التفاصيل</span>`
      : `<i class="fa-solid fa-chevron-down"></i> <span>مزيد من التفاصيل</span>`;
  }
}

/**
 * رابط الاتصال الهاتفي — يُستدعى بعد فعل تواصل صريح وحده: لا رقم يُعرض قبل
 * ذلك. **ورابط واتساب لم يبقَ هنا** (تذكرة #184): صار يبنيه الخادم وحده في
 * `GET /api/services/providers/:id/whatsapp`، فالعميل لا يكوّن `wa.me` ولا
 * يعرف صيغة الرقم الدولي أصلاً.
 */
function providerContactUrls(p) {
  const phone = p.phone || '';
  return { phone, telUrl: `tel:${phone}` };
}

/**
 * رابط واتساب المزوّد (تذكرة #184): الرسالة العربية تُبنى في الخادم، والعميل
 * يفتح `url` كما وصل — لا `wa.me` في العميل ولا رسالة يركّبها بنفسه.
 */
async function openProviderWhatsapp(providerId) {
  try {
    const res = await apiFetch(`/api/services/providers/${providerId}/whatsapp`);
    const data = await res.json();
    if (!data.success || !data.url) {
      alert((data && data.message) || 'لا يوجد رقم واتساب مسجَّل لهذا المزوّد');
      return;
    }
    window.open(data.url, '_blank');
  } catch (e) {
    console.error('Provider WhatsApp error:', e);
    alert('تعذّر فتح واتساب — تحقّق من الاتصال وحاول مرة أخرى');
  }
}

/** زرّ واتساب (رابط الخادم) ورابط الاتصال الهاتفي لمزوّد جُلِب كاملاً. */
function providerContactLinksHtml(p) {
  const { phone, telUrl } = providerContactUrls(p);

  return `
    <div class="service-contact-row">
      <button type="button" class="service-btn-whatsapp" onclick="openProviderWhatsapp(${Number(p.id)})">
        <i class="fa-brands fa-whatsapp"></i> واتساب مباشر
      </button>
      <a class="service-btn-call" href="${escapeHtml(telUrl)}">
        <i class="fa-solid fa-phone"></i> اتصال (${escapeHtml(phone)})
      </a>
    </div>
  `;
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
      const emptyRow = document.getElementById(`serviceContactRow-${providerId}`);
      if (emptyRow) emptyRow.innerHTML = noProviderPhoneHtml();
      return;
    }

    const { telUrl } = providerContactUrls(p);

    // إذا طلب إجراء مباشر
    if (preferredAction === 'whatsapp') {
      await openProviderWhatsapp(providerId);
      return;
    } else if (preferredAction === 'call') {
      window.location.href = telUrl;
      return;
    }

    // عرض أزرار التواصل المباشرة داخل اللوح وفي الكرت
    const contactHtml = providerContactLinksHtml(p);

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

/** أسماء الأيام السبعة بمفاتيح `hours` (0 = الأحد). */
const PROVIDER_DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** صفوف جدول الساعات الأسبوعي — المفتوح بوقتيه، والمغلق بكلمة واحدة. */
function providerHoursRowsHtml(hours) {
  return [...hours]
    .sort((left, right) => Number(left.day) - Number(right.day))
    .map(row => {
      const dayName = PROVIDER_DAY_NAMES[Number(row.day)] || '';
      const value = row.closed
        ? '<span class="provider-hours-closed">مغلق</span>'
        : `<span class="provider-hours-times">${escapeHtml(row.from || '')} — ${escapeHtml(row.to || '')}</span>`;
      return `<tr><td class="provider-hours-day">${escapeHtml(dayName)}</td><td class="provider-hours-value">${value}</td></tr>`;
    })
    .join('');
}

/** شبكة صور المعرض — الصورة وتعليقها إن وُجد. */
function providerGalleryHtml(gallery) {
  return gallery.map(photo => `
    <figure class="provider-gallery-item">
      <img src="${escapeHtml(photo.image_url)}" alt="${escapeHtml(photo.caption || 'صورة من أعمال المزوّد')}" loading="lazy">
      ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}
    </figure>
  `).join('');
}

/** العروض السارية: عنوان ووصف وسعر وينتهي — ولا قسم إن لم يوجد عرض واحد. */
function providerOffersHtml(offers) {
  return offers.map(offer => `
    <div class="provider-offer">
      <div class="provider-offer-title">${escapeHtml(offer.title)}</div>
      ${offer.description ? `<div class="provider-offer-desc">${escapeHtml(offer.description)}</div>` : ''}
      <div class="provider-offer-meta">
        ${offer.price != null ? `<span class="provider-offer-price"><i class="fa-solid fa-tag"></i> ${Number(offer.price).toLocaleString('ar-EG')} ₪</span>` : ''}
        ${offer.ends_at ? `<span class="provider-offer-ends"><i class="fa-regular fa-clock"></i> ينتهي ${escapeHtml(offer.ends_at)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

/** المنتجات بسعر «تبدأ من». */
function providerProductsHtml(products) {
  return products.map(product => `
    <div class="provider-product">
      ${product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" class="provider-product-img" loading="lazy">`
        : '<span class="provider-product-img provider-product-img-placeholder"><i class="fa-solid fa-box-open"></i></span>'}
      <div class="provider-product-body">
        <div class="provider-product-name">${escapeHtml(product.name)}</div>
        ${product.description ? `<div class="provider-product-desc">${escapeHtml(product.description)}</div>` : ''}
        ${product.price != null ? `<div class="provider-product-price">تبدأ من ${Number(product.price).toLocaleString('ar-EG')} ₪</div>` : ''}
      </div>
    </div>
  `).join('');
}

/** «مزوّدون مشابهون» — كل بطاقة تفتح نافذة المزوّد الآخر نفسها. */
function providerSimilarHtml(similar) {
  return similar.map(candidate => {
    const candidateIcon = usableCategoryIcon(candidate.category_icon);
    return `
    <button type="button" class="provider-similar-card" onclick="openProviderModal(${Number(candidate.id)})">
      ${candidate.image_url
        ? `<img src="${escapeHtml(candidate.image_url)}" alt="${escapeHtml(candidate.name)}" class="provider-similar-img" loading="lazy">`
        : `<span class="provider-similar-img provider-similar-img-placeholder">${candidateIcon ? escapeHtml(candidateIcon) : '🛠️'}</span>`}
      <span class="provider-similar-name">${escapeHtml(candidate.name)}</span>
      <span class="provider-similar-town">${escapeHtml((candidate.towns || []).slice(0, 2).join('، ') || 'مناطق الخدمة غير محدَّدة')}</span>
    </button>
  `;
  }).join('');
}

// ======================================================================
// تقييمات المزوّد (تذكرة #186)
// ======================================================================
// المتوسط والعدد من صفحة المزوّد وحدها (وهي على `visible`)، والتعليقات من
// مسارها المرقّم. الكتابة والإبلاغ والحذف تمرّ عبر `apiFetch` بـ`auth: true`،
// والقراءة تحمل الرمز أيضاً إن وُجد كي تعرف `is_mine`/`can_delete` — ولا يغيّر
// ذلك ما هو عام في الردّ.

const PROVIDER_REVIEWS_LIMIT = 5;
const providerReviewsState = { providerId: null, page: 0, totalPages: 0, reviews: [] };

/** تاريخ التقييم كما يراه المستخدم — تاريخ غير صالح لا يكسر الصفّ. */
function formatProviderReviewDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return '';
  }
}

/** نجوم التقييم نصّاً — الممتلئ ★ والناقص ☆، فلا لون وحده يحمل المعنى. */
function providerReviewStarsHtml(rating) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return '★'.repeat(value) + '☆'.repeat(5 - value);
}

/**
 * «★ 4.5 (12 تقييماً)» — ومزوّد بلا تقييمات يقول ذلك صراحةً ولا يعرض صفراً
 * مضلّلاً (نفس سبب إخفاء النجمة في بطاقة القائمة).
 */
function providerRatingSummaryHtml(p) {
  const count = Number(p && p.rating_count) || 0;
  if (!count) {
    return '<p class="provider-rating-empty">لا تقييمات بعد — كن أول من يقيّم هذا المزوّد.</p>';
  }
  const avg = Number(p && p.rating_avg);
  return `
    <div class="provider-rating-hero">
      <span class="provider-rating-hero-star" aria-hidden="true">★</span>
      <span class="provider-rating-hero-avg">${Number.isFinite(avg) ? avg.toFixed(1) : '—'}</span>
      <span class="provider-rating-hero-count">(${count} تقييماً)</span>
    </div>`;
}

/**
 * توزيع النجوم خمسة أعمدة: ارتفاع كل عمود نسبةً إلى أكثر النجوم تكراراً (لا
 * إلى المجموع) كي يبقى الرسم مقروءاً حين تتجمّع التقييمات في نجوم واحدة.
 * والعدد مكتوب فوق كل عمود، فالشكل لا يحمل المعنى وحده.
 */
function providerRatingDistributionHtml(distribution, ratingCount) {
  const total = Number(ratingCount) || 0;
  if (!total) return '';
  const counts = [5, 4, 3, 2, 1].map(stars => Number(distribution && distribution[stars]) || 0);
  const max = Math.max(...counts, 1);
  return `<div class="provider-rating-dist">${[5, 4, 3, 2, 1].map((stars, index) => {
    const count = counts[index];
    const height = Math.round((count / max) * 100);
    return `
      <div class="provider-rating-dist-col" data-stars="${stars}" title="${stars} نجوم: ${count}">
        <span class="provider-rating-dist-count">${count}</span>
        <span class="provider-rating-dist-track"><span class="provider-rating-dist-bar" style="height:${height}%"></span></span>
        <span class="provider-rating-dist-label">${stars}★</span>
      </div>`;
  }).join('')}</div>`;
}

/** صفّ تعليق واحد: الاسم من الخادم، والنجوم، والنصّ، وحذف صاحبه أو بلاغ غيره. */
function providerReviewHtml(review) {
  const body = review.body ? `<p class="provider-review-body">${escapeHtml(review.body)}</p>` : '';
  const date = formatProviderReviewDate(review.created_at);
  const deleteBtn = review.can_delete
    ? `<button type="button" class="provider-review-action provider-review-delete" onclick="deleteProviderReview()">حذف تقييمي</button>`
    : '';
  const reportBtn = !review.is_mine
    ? `<button type="button" class="provider-review-action provider-review-report" onclick="reportProviderReview(${Number(review.id)})">بلّغ</button>`
    : '';

  // ردّ المزوّد المربوط (تذكرة #187): اقتباس واضح تحت التقييم — صاحبه يعرف
  // أنه قراءة من المزوّد لا تعليق زائر ثالث — ووقته معه. الزرّ للحساب المربوط
  // وحده (`can_reply`)، ونصّه «عدّل الردّ» حين يكون هناك ردّ قائم.
  const replyText = review.reply_body ? String(review.reply_body).trim() : '';
  const replyDate = formatProviderReviewDate(review.reply_at);
  const replyHtml = replyText
    ? `
      <blockquote class="provider-review-reply">
        <span class="provider-review-reply-label"><i class="fa-solid fa-reply" aria-hidden="true"></i> ردّ المزوّد</span>
        <p class="provider-review-reply-body">${escapeHtml(replyText)}</p>
        ${replyDate ? `<span class="provider-review-reply-date">${escapeHtml(replyDate)}</span>` : ''}
      </blockquote>`
    : '';
  const replyBtn = review.can_reply
    ? `<button type="button" class="provider-review-action provider-review-reply-btn" onclick="openProviderReplyForm(${Number(review.id)})">${replyText ? 'عدّل الردّ' : 'ردّ على التقييم'}</button>`
    : '';

  return `
    <article class="provider-review" data-review-id="${Number(review.id)}">
      <div class="provider-review-head">
        <span class="provider-review-author">${escapeHtml(review.user_name || 'مستخدم')}</span>
        <span class="provider-review-stars-text" aria-label="${Number(review.rating)} من 5" dir="ltr">${providerReviewStarsHtml(review.rating)}</span>
      </div>
      ${body}
      ${replyHtml}
      <div class="provider-review-foot">
        ${date ? `<span class="provider-review-date">${escapeHtml(date)}</span>` : '<span></span>'}
        <span class="provider-review-actions">${replyBtn}${deleteBtn}${reportBtn}</span>
      </div>
    </article>`;
}

/** يعيد رسم المتوسط والتوزيع من كائن المزوّد المخزَّن (بعد أي كتابة). */
function renderProviderRatingSummary(provider) {
  const p = provider || providerDetailsCache[currentProviderId];
  const summary = document.getElementById('providerRatingSummary');
  const distribution = document.getElementById('providerRatingDistribution');
  if (!summary || !distribution) return;
  summary.innerHTML = p ? providerRatingSummaryHtml(p) : '';
  distribution.innerHTML = p ? providerRatingDistributionHtml(p.rating_distribution, p.rating_count) : '';
}

/**
 * زرّا صاحبه: «اكتب/عدّل تقييمك» و«حذف تقييمي» وملاحظة الإخفاء — كلها من
 * `my_review` في صفحة المزوّد، لا من قائمة التعليقات: تقييم مخفي أو في صفحة
 * لاحقة لا صفّ له هنا، وصاحبه ما زال يملك تعديله وحذفه.
 */
function renderProviderMyReviewState() {
  const provider = providerDetailsCache[currentProviderId];
  const myReview = provider && provider.my_review ? provider.my_review : null;

  const writeBtn = document.getElementById('providerReviewWriteBtn');
  if (writeBtn) {
    writeBtn.innerHTML = myReview
      ? '<i class="fa-solid fa-pen"></i> عدّل تقييمك'
      : '<i class="fa-solid fa-pen"></i> اكتب تقييمك';
  }

  const deleteBtn = document.getElementById('providerReviewDeleteMineBtn');
  if (deleteBtn) {
    const listedMine = providerReviewsState.reviews.some(review => review.is_mine);
    deleteBtn.hidden = !myReview || listedMine;
  }

  const hiddenNote = document.getElementById('providerReviewHiddenNote');
  if (hiddenNote) hiddenNote.hidden = !(myReview && myReview.status === 'hidden');
}

/** يبدّل رسالة فشل التعليقات وزرّ إعادة المحاولة — الفشل لا يُترك صامتاً. */
function setProviderReviewsError(failed) {
  const error = document.getElementById('providerReviewsError');
  const retry = document.getElementById('providerReviewsRetryBtn');
  const empty = document.getElementById('providerReviewsEmpty');
  if (error) error.hidden = !failed;
  if (retry) retry.hidden = !failed;
  if (failed && empty) empty.hidden = true;
}

/** يعيد رسم التعليقات من الحالة المحلية، ويبدّل زرّ «المزيد» بحسب الصفحات. */
function renderProviderReviews() {
  const list = document.getElementById('providerReviewsList');
  const empty = document.getElementById('providerReviewsEmpty');
  const moreWrap = document.getElementById('providerReviewsMoreWrap');
  if (!list) return;
  list.innerHTML = providerReviewsState.reviews.map(providerReviewHtml).join('');
  if (empty) empty.hidden = providerReviewsState.reviews.length > 0;
  if (moreWrap) moreWrap.hidden = providerReviewsState.page >= providerReviewsState.totalPages;
  renderProviderMyReviewState();
}

/**
 * صفحة تعليقات — `page` جديد أو إضافة إلى ما ظهر. الحارس على
 * `currentProviderId` يمنع ردّ مزوّد سابق من الرسم فوق واحد مفتوح بعده.
 */
async function loadProviderReviews(providerId, { page = 1, append = false } = {}) {
  const targetId = Number(providerId);
  if (!targetId) return;
  setProviderReviewsError(false);
  try {
    const res = await apiFetch(
      `/api/services/providers/${targetId}/reviews?page=${page}&limit=${PROVIDER_REVIEWS_LIMIT}`,
      { auth: true }
    );
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      if (Number(currentProviderId) === targetId) setProviderReviewsError(true);
      return;
    }
    if (Number(currentProviderId) !== targetId) return;

    const incoming = Array.isArray(data.reviews) ? data.reviews : [];
    providerReviewsState.providerId = targetId;
    providerReviewsState.page = Number(data.pagination && data.pagination.page) || page;
    providerReviewsState.totalPages = Number(data.pagination && data.pagination.totalPages) || 0;
    providerReviewsState.reviews = append
      ? providerReviewsState.reviews.concat(incoming)
      : incoming;
    renderProviderReviews();
  } catch (e) {
    console.error('Provider reviews fetch error:', e);
    if (Number(currentProviderId) === targetId) setProviderReviewsError(true);
  }
}

/** «المزيد من التعليقات» — صفحة تالية تُضاف، لا تُستبدل. */
function loadMoreProviderReviews() {
  loadProviderReviews(currentProviderId, {
    page: providerReviewsState.page + 1,
    append: true
  });
}

/**
 * ورقة «اكتب تقييمك»: تُعبَّأ من تقييم صاحبه إن وُجد (تعديل لا تقييم ثانٍ)،
 * والزائر يُحوَّل إلى الدخول بنيّة محفوظة تعيده إلى النافذة والورقة معاً.
 */
function openProviderReviewForm() {
  const providerId = Number(currentProviderId);
  if (!providerId || !providerDetailsCache[providerId]) return;
  if (!requireAuth({ type: 'provider_review', providerId })) return;

  const form = document.getElementById('providerReviewForm');
  const modal = document.getElementById('providerReviewModal');
  if (!form || !modal) return;

  // `my_review` أوّلاً: هو المرجع ولو كان التقييم مخفياً أو في صفحة لاحقة.
  const provider = providerDetailsCache[providerId];
  const mine = (provider && provider.my_review)
    || providerReviewsState.reviews.find(review => review.is_mine)
    || null;
  form.reset();
  setProviderReviewStars(mine ? Number(mine.rating) : 0);
  document.getElementById('providerReviewBody').value = mine && mine.body ? mine.body : '';
  modal.dataset.providerId = String(providerId);
  modal.style.display = 'flex';
  const bodyInput = document.getElementById('providerReviewBody');
  if (bodyInput) bodyInput.focus();
}

function closeProviderReviewModal() {
  const modal = document.getElementById('providerReviewModal');
  if (modal) modal.style.display = 'none';
}

/** نجوم 1..5 كأزرار: القيمة في حقل مخفي واحد، والحالة على الأزرار نفسها. */
function setProviderReviewStars(rating) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  const hidden = document.getElementById('providerReviewRating');
  if (hidden) hidden.value = String(value);
  const stars = document.querySelectorAll('#providerReviewStars .provider-review-star');
  stars.forEach(button => {
    const star = Number(button.dataset.star) || 0;
    button.classList.toggle('is-on', star <= value);
    button.setAttribute('aria-pressed', star === value ? 'true' : 'false');
  });
}

/**
 * نشر التقييم — الـupsert في الخادم يجعل النداء نفسه كتابةً أولى أو تعديلاً.
 * `confirm_phone` منطقي حصراً، وإقرار الرقم شرطٌ يُمنع الإرسال دونه (والخادم
 * يرفضه 400 على أي حال — هذا حارس تجربة لا بديل عن حارس الخادم).
 */
async function submitProviderReview(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();

  const reviewModal = document.getElementById('providerReviewModal');
  const providerId = Number(currentProviderId)
    || Number(reviewModal && reviewModal.dataset.providerId)
    || 0;
  const rating = Number(document.getElementById('providerReviewRating').value) || 0;
  const body = document.getElementById('providerReviewBody').value.trim();
  const confirmPhone = document.getElementById('providerReviewConfirmPhone').checked === true;

  if (!providerId) return;
  if (rating < 1 || rating > 5) {
    showToast('اختر من نجمة إلى خمس نجوم أولاً');
    return;
  }
  if (!confirmPhone) {
    showToast('أكّد أن رقمك شخصي قبل نشر التقييم');
    return;
  }

  const submitBtn = document.getElementById('providerReviewSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await apiFetch(`/api/services/providers/${providerId}/review`, {
      method: 'PUT',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, body, confirm_phone: confirmPhone })
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      alert((data && data.message) || 'تعذّر نشر التقييم — حاول مرة أخرى');
      return;
    }

    const cached = providerDetailsCache[providerId];
    if (cached) cached.my_review = data.review || null;
    applyProviderRatingSummary(providerId, data);
    // قبل انتظار إعادة قراءة التعليقات: زرّا صاحبه يتبعان `my_review` لا
    // نجاح القراءة، فلا يبقى «عدّل تقييمك» أو الحذف على تقييم غير موجود.
    renderProviderMyReviewState();
    closeProviderReviewModal();
    await loadProviderReviews(providerId);
    showToast('نُشر تقييمك — شكراً لك');
  } catch (e) {
    alert('تعذّر نشر التقييم — تحقّق من الاتصال');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/** حذف تقييم صاحبه وحده — الخادم يعرف صاحبه من الرمز لا من رقم في الطلب. */
async function deleteProviderReview() {
  const providerId = Number(currentProviderId);
  if (!providerId) return;
  if (!window.confirm('هل تحذف تقييمك؟')) return;

  try {
    const res = await apiFetch(`/api/services/providers/${providerId}/review`, {
      method: 'DELETE',
      auth: true
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      alert((data && data.message) || 'تعذّر حذف التقييم — حاول مرة أخرى');
      return;
    }
    // `deleted: false` تعني «لا تقييم لك» لا فشلاً — لا تُطبَّق أرقام على
    // مزوّد لم يُحذف منه شيء ولا يُمسح تقييم صاحبه من الكاش.
    if (data.deleted) {
      const cached = providerDetailsCache[providerId];
      if (cached) cached.my_review = null;
      applyProviderRatingSummary(providerId, data);
      renderProviderMyReviewState();
    }
    await loadProviderReviews(providerId);
    showToast((data && data.message) || 'حُذف تقييمك');
  } catch (e) {
    alert('تعذّر حذف التقييم — تحقّق من الاتصال');
  }
}

/** بلاغ عن تقييم غيره — صفّ واحد لكل مستخدم، والثالث يُخفيه فيُعاد الرسم. */
async function reportProviderReview(reviewId) {
  const providerId = Number(currentProviderId);
  if (!providerId || !reviewId) return;
  if (!requireAuth({ type: 'provider_review_report', providerId, reviewId })) return;
  if (!window.confirm('هل تبلّغ الإدارة عن هذا التقييم؟')) return;

  try {
    const res = await apiFetch(`/api/services/providers/${providerId}/reviews/${reviewId}/report`, {
      method: 'POST',
      auth: true
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      alert((data && data.message) || 'تعذّر إرسال البلاغ — حاول مرة أخرى');
      return;
    }
    if (data.status === 'hidden') {
      // أخفاه البلاغ: تُقرأ الصفحة من جديد كي يخرج من القائمة ومن المتوسط.
      await openProviderModal(providerId);
      showToast('أُخفي التقييم بعد البلاغات');
    } else {
      showToast('تم إبلاغ الإدارة عن التقييم');
    }
  } catch (e) {
    alert('تعذّر إرسال البلاغ — تحقّق من الاتصال');
  }
}

/**
 * ورقة ردّ المزوّد المربوط على تقييم (تذكرة #187): تُعبَّأ من ردّه القائم إن
 * وُجد (تعديل لا ردّ ثانٍ)، والصفّ يُقرأ من القائمة المعروضة أو من `my_review`
 * — تقييم صاحبه في صفحة لاحقة لا صفّ له هنا.
 */
function openProviderReplyForm(reviewId) {
  const id = Number(reviewId) || 0;
  if (!id) return;

  const provider = providerDetailsCache[currentProviderId] || null;
  const fromList = providerReviewsState.reviews.find(review => Number(review.id) === id) || null;
  const fromMine = provider && provider.my_review && Number(provider.my_review.id) === id
    ? provider.my_review
    : null;
  const review = fromList || fromMine;

  const modal = document.getElementById('providerReplyModal');
  const idInput = document.getElementById('providerReplyReviewId');
  const bodyInput = document.getElementById('providerReplyBody');
  if (!modal || !idInput || !bodyInput) return;

  idInput.value = String(id);
  bodyInput.value = review && review.reply_body ? String(review.reply_body) : '';
  modal.style.display = 'flex';
  bodyInput.focus();
}

function closeProviderReplyModal() {
  const modal = document.getElementById('providerReplyModal');
  if (modal) modal.style.display = 'none';
}

/**
 * حفظ الردّ — `PUT /api/services/reviews/:rid/reply`. المسار على التقييم وحده
 * (لا يحتاج رقم المزوّد)، والخادم يتحقّق أن الحساب مربوط بمزوّد هذا التقييم
 * داخل الاستعلام: أي حساب آخر يعود 404 لا 403. والفراغ لا يُرسل أصلاً —
 * والخادم يرفضه 400 على أي حال.
 */
async function submitProviderReply(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();

  const reviewId = Number(document.getElementById('providerReplyReviewId').value) || 0;
  const replyBody = document.getElementById('providerReplyBody').value.trim();
  if (!reviewId) return;
  if (!replyBody) {
    showToast('اكتب نصّ الردّ أولاً');
    return;
  }

  const submitBtn = document.getElementById('providerReplySubmitBtn');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await apiFetch(`/api/services/reviews/${reviewId}/reply`, {
      method: 'PUT',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply_body: replyBody })
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      alert((data && data.message) || 'تعذّر حفظ الردّ — حاول مرة أخرى');
      return;
    }

    // `my_review` الصفّ نفسه إن كان هذا التقييم تقييم صاحبه المربوط أيضاً.
    const providerId = Number(currentProviderId);
    const cached = providerDetailsCache[providerId];
    const updated = data.review || null;
    if (cached && cached.my_review && updated && Number(cached.my_review.id) === Number(updated.id)) {
      cached.my_review.reply_body = updated.reply_body;
      cached.my_review.reply_at = updated.reply_at;
    }

    closeProviderReplyModal();
    await loadProviderReviews(providerId);
    showToast('حُفظ ردّك على التقييم');
  } catch (e) {
    alert('تعذّر حفظ الردّ — تحقّق من الاتصال');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * نموذج «اطلب عرض سعر» (تذكرة #188، ADR-0016): يُفتح من نافذة المزوّد، ونيّة
 * الزائر تُحفظ (`provider_quote`) وتُستأنف بعد الدخول كما تُستأنف نيّتا
 * `provider_favorite`/`provider_review`. والمناسبة اختيارية وتُنتقى من
 * `GET /api/my-events` — مناسبات صاحب الحساب وحدها، ولا رقم مناسبتها يُكتب
 * بيد أحد.
 */
function openQuoteRequestForm() {
  const providerId = Number(currentProviderId);
  if (!providerId) return;
  if (!requireAuth({ type: 'provider_quote', providerId })) return;

  const modal = document.getElementById('providerQuoteModal');
  const form = document.getElementById('providerQuoteForm');
  if (!modal || !form) return;

  const provider = providerDetailsCache[providerId] || null;
  const providerInput = document.getElementById('providerQuoteProviderId');
  const sub = document.getElementById('providerQuoteModalSub');
  form.reset();
  if (providerInput) providerInput.value = String(providerId);
  if (sub) {
    sub.textContent = provider
      ? `أرسل تفاصيل مناسبتك إلى «${provider.name}» ليصلك عرضه`
      : 'أرسل تفاصيل مناسبتك ليصلك عرض المزوّد';
  }
  modal.style.display = 'flex';
  loadQuoteRequestEvents();
}

function closeProviderQuoteModal() {
  const modal = document.getElementById('providerQuoteModal');
  if (modal) modal.style.display = 'none';
}

/** يملأ منتقي «مناسبتي» من `GET /api/my-events` — وفشله لا يمنع الطلب نفسه. */
async function loadQuoteRequestEvents() {
  const select = document.getElementById('providerQuoteEventSelect');
  if (!select) return;
  select.innerHTML = '<option value="">بلا مناسبة محدّدة</option>';
  if (!currentUser || !authToken) return;
  try {
    const res = await apiFetch('/api/my-events', { auth: true });
    const data = await res.json();
    if (!res.ok || !data || !data.success || !Array.isArray(data.events)) return;
    select.innerHTML = '<option value="">بلا مناسبة محدّدة</option>'
      + data.events.map(event => {
        const label = event.event_date ? `${event.title || 'مناسبة'} — ${event.event_date}` : (event.title || 'مناسبة');
        return `<option value="${Number(event.id)}">${escapeHtml(label)}</option>`;
      }).join('');
  } catch (e) { /* المنتقي يبقى على «بلا مناسبة» — الطلب يُرسل بلا مناسبة */ }
}

/**
 * إرسال الطلب — `POST /api/services/providers/:id/quote-requests`.
 *
 * **والردّ يفترق بحسب `channel`:** `app` يعني أن صفّاً كُتب للمزوّد المربوط
 * فيُغلق النموذج ويُحدَّث «العروض المستلمة»، و`whatsapp` يعني أن الخادم بنى
 * رسالة جاهزة ولا صفّ — فتُفتح `url` وحدها (`window.open`)، والعميل لا يبني
 * نصّاً ولا يعرف رقم المزوّد.
 */
async function submitQuoteRequest(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();

  const modal = document.getElementById('providerQuoteModal');
  const providerInput = document.getElementById('providerQuoteProviderId');
  const providerId = Number(currentProviderId) || Number(providerInput && providerInput.value) || 0;
  if (!providerId) return;

  const dateInput = document.getElementById('providerQuoteDate');
  const guestsInput = document.getElementById('providerQuoteGuests');
  const noteInput = document.getElementById('providerQuoteNote');
  const eventSelect = document.getElementById('providerQuoteEventSelect');

  const body = { note: noteInput ? noteInput.value.trim() : '' };
  const wantedDate = dateInput ? dateInput.value.trim() : '';
  if (wantedDate) body.wanted_date = wantedDate;

  const guestsRaw = guestsInput ? guestsInput.value.trim() : '';
  if (guestsRaw) {
    const guests = Number(guestsRaw);
    if (!Number.isInteger(guests) || guests < 1 || guests > 100000) {
      showToast('عدد المعازيم يجب أن يكون عدداً صحيحاً بين 1 و100000');
      return;
    }
    body.guests_count = guests;
  }

  const eventId = eventSelect ? Number(eventSelect.value) : 0;
  if (eventId > 0) body.event_id = eventId;

  const submitBtn = document.getElementById('providerQuoteSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const res = await apiFetch(`/api/services/providers/${providerId}/quote-requests`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      showToast((data && data.message) || 'تعذّر إرسال الطلب — حاول مرة أخرى');
      return;
    }

    if (modal) modal.style.display = 'none';
    if (data.channel === 'whatsapp') {
      if (data.url) window.open(data.url, '_blank');
      showToast(data.message || 'أكمل طلبك في واتساب برسالة جاهزة');
    } else {
      // الطلب صار في القاعدة: يظهر في «العروض المستلمة» بانتظار عرض المزوّد.
      loadMyQuotes('all');
      showToast(data.message || 'وصل طلبك إلى المزوّد');
    }
  } catch (e) {
    showToast('تعذّر إرسال الطلب — تحقّق من الاتصال');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/** يطبّق متوسطاً وعدّاً وتوزيعاً وصلت من ردّ كتابة على الكاش والبطاقة والنافذة. */
function applyProviderRatingSummary(providerId, summary) {
  const provider = providerDetailsCache[providerId];
  if (provider) {
    provider.rating_avg = summary.rating_avg ?? null;
    provider.rating_count = Number(summary.rating_count) || 0;
    if (summary.rating_distribution) provider.rating_distribution = summary.rating_distribution;
  }
  const card = serviceProvidersCache.find(item => Number(item.id) === Number(providerId));
  if (card) {
    card.rating_avg = summary.rating_avg ?? null;
    card.rating_count = Number(summary.rating_count) || 0;
  }
  updateProviderStatsDom(providerId);
  renderProviderRatingSummary(provider);
}

/**
 * يملأ قسماً من نافذة المزوّد ويخفيه إن كان فارغاً — قاعدة واحدة للأقسام
 * الأربعة (تذكرة #184)، فلا يظهر عنوان لقسم لا محتوى تحته.
 */
function renderProviderSection(sectionId, listId, items, renderHtml) {
  const section = document.getElementById(sectionId);
  const list = document.getElementById(listId);
  if (!section || !list) return;

  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    list.innerHTML = '';
    section.hidden = true;
    return;
  }
  list.innerHTML = renderHtml(rows);
  section.hidden = false;
}

/**
 * نافذة المزوّد المنفصلة — تقرأ `GET /api/services/providers/:id` فتحمل حزمة
 * السعر والمواصفات والوصف، والرقم لا يُعرض فيها إلا بفعل صريح.
 * «تفاصيل» في الصفّ المختصر تفتحها وحدها، و«اتصال» (تذكرة #158) تفتحها مع
 * `revealContact: true` فتُعرض روابط التواصل مباشرةً — الفعل صريح أصلاً،
 * والرقم يصل مع النافذة نفسها لا من القائمة.
 *
 * **وصارت غنية (تذكرة #184):** الغلاف والشعار، وشارتا «موثّق»/«مميّز»، وجدول
 * الساعات الأسبوعي، ومعرض الأعمال، والعروض السارية، والمنتجات، ثم «مزوّدون
 * مشابهون» يفتح كلٌّ منهم نافذته. **كل قسم فارغ يُخفى** — لا عنوان لقسم بلا
 * محتوى — والرقم لا يتغيّر سلوكه.
 *
 * **والتقييمات (تذكرة #186):** المتوسط والعدد من الصفحة نفسها، والتوزيع
 * والتعليقات المرقّمة من `…/reviews`، وورقة الكتابة/الحذف فوقها. القسم يبقى
 * ظاهراً حتى بلا تقييمات — هو موضع زرّ «اكتب تقييمك» ودعوة أول مقيِّم.
 */
async function openProviderModal(providerId, { revealContact = false } = {}) {
  try {
    // بالرمز إن وُجد (`optionalAuthenticate` على الخادم): `my_review` يقول
    // ألصاحب الطلب تقييم — ولو كان مخفياً أو في صفحة تعليقات لاحقة — فلا تفتح
    // الورقة فارغة على صاحب تقييم قائم، و`is_favorite` تصحّ في النافذة.
    const res = await apiFetch(`/api/services/providers/${providerId}`, { auth: true });
    const data = await res.json();
    if (!data.success) return;

    const p = data.provider;
    providerDetailsCache[providerId] = p;
    currentProviderPhone = p.phone || '';
    currentProviderId = providerId;

    document.getElementById('providerModalName').textContent = p.name;
    document.getElementById('providerModalCategory').textContent = p.category_name || '';

    // الغلاف يحلّ محلّ صورة المزوّد في الترويسة حين يوجد، والشعار شارة دائرية
    // بجانبه. وغياب الاثنين يترك الصورة القديمة كما كانت.
    const coverWrap = document.getElementById('providerModalCoverWrap');
    const coverImg = document.getElementById('providerModalCover');
    if (coverWrap && coverImg) {
      if (p.cover_url) {
        coverImg.src = p.cover_url;
        coverImg.alt = p.name;
        coverWrap.hidden = false;
      } else {
        coverImg.removeAttribute('src');
        coverWrap.hidden = true;
      }
    }

    const logoImg = document.getElementById('providerModalLogo');
    if (logoImg) {
      if (p.logo_url) {
        logoImg.src = p.logo_url;
        logoImg.alt = `شعار ${p.name}`;
        logoImg.hidden = false;
        // يتداخل الشعار مع الغلاف وحده؛ بلا غلاف يجلس على هوامشه كي لا يغطّي
        // ما فوقه من نصّ.
        logoImg.classList.toggle('is-overlap', Boolean(p.cover_url));
      } else {
        logoImg.removeAttribute('src');
        logoImg.hidden = true;
        logoImg.classList.remove('is-overlap');
      }
    }

    const badgesEl = document.getElementById('providerModalBadges');
    if (badgesEl) {
      const badges = providerBadgesHtml(p);
      badgesEl.innerHTML = badges;
      badgesEl.hidden = !badges;
    }

    // عدّادا المشاهدة والمفضّلة (تذكرة #185)، وزرّ الحفظ حالته من `is_favorite`
    // التي يرسلها الخادم لهذا المستخدم — زرّ واحد لا زرّان.
    const statsEl = document.getElementById('providerModalStats');
    if (statsEl) {
      statsEl.innerHTML = providerStatsHtml(p);
      statsEl.hidden = false;
    }
    updateProviderFavoriteButton(p);

    const img = document.getElementById('providerModalImage');
    if (p.cover_url || !p.image_url) {
      img.hidden = true;
    } else {
      img.src = p.image_url;
      img.alt = p.name;
      img.hidden = false;
    }

    // الساعات: مصفوفة 0..6 كما يخزّنها الأدمن — جدول أسبوعي، ويُخفى كاملاً
    // إن لم يسجّل المزوّد ساعات بعد.
    const hoursSection = document.getElementById('providerHoursSection');
    const hoursBody = document.getElementById('providerHoursRows');
    if (hoursSection && hoursBody) {
      const hours = Array.isArray(p.hours) ? [...p.hours] : [];
      if (hours.length) {
        hoursBody.innerHTML = providerHoursRowsHtml(hours);
        hoursSection.hidden = false;
      } else {
        hoursBody.innerHTML = '';
        hoursSection.hidden = true;
      }
    }

    // المعرض والعروض والمنتجات والمشابهون: أربعة أقسام تُخفى فارغةً.
    renderProviderSection('providerGallerySection', 'providerGalleryGrid', p.gallery, providerGalleryHtml);
    renderProviderSection('providerOffersSection', 'providerOffersList', p.offers, providerOffersHtml);
    renderProviderSection('providerProductsSection', 'providerProductsList', p.products, providerProductsHtml);
    renderProviderSection('providerSimilarSection', 'providerSimilarGrid', p.similar, providerSimilarHtml);

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

    document.getElementById('providerContactArea').innerHTML = currentProviderPhone
      ? (revealContact
        // «اتصال» في الصفّ المختصر فعلٌ صريح أصلاً: تظهر روابط التواصل مباشرةً.
        ? providerContactLinksHtml(p)
        : `<button type="button" class="submit-btn" onclick="revealProviderPhone()">
        <i class="fa-solid fa-phone"></i> إظهار رقم التواصل
      </button>`)
      : noProviderPhoneHtml();

    // التقييمات (تذكرة #186): المتوسط والتوزيع من كائن المزوّد نفسه، والتعليقات
    // من مسارها المرقّم — تبدأ من الصفحة الأولى مع كل فتح، فلا بقايا مزوّد سابق.
    providerReviewsState.providerId = Number(providerId);
    providerReviewsState.page = 0;
    providerReviewsState.totalPages = 0;
    providerReviewsState.reviews = [];
    renderProviderRatingSummary(p);
    renderProviderReviews();
    const reviewsSection = document.getElementById('providerReviewsSection');
    if (reviewsSection) reviewsSection.hidden = false;
    const reviewsLoaded = loadProviderReviews(providerId);

    document.getElementById('providerModal').style.display = 'flex';

    // مشاهدة واحدة لهذا المزوّد في هذا التحميل (تذكرة #185): تُسجَّل عند فتح
    // النافذة لا عند كل رسم للبطاقة، والحارس في recordProviderView يمنع التكرار.
    recordProviderView(providerId);

    // النافذة ظهرت أصلاً؛ الانتظار هنا فقط ليكتمل `openProviderModal` بعد أول
    // صفحة تعليقات، فيستأنف `provider_review` بعد الدخول بورقة معبّأة لا فارغة.
    await reviewsLoaded;
  } catch (e) {
    console.error('Provider fetch error:', e);
  }
}

/** الفعل الصريح الذي يكشف الرقم في النافذة المنفصلة — ورابط واتساب معه. */
function revealProviderPhone() {
  const provider = providerDetailsCache[currentProviderId];
  if (!currentProviderPhone || !provider) return;
  document.getElementById('providerContactArea').innerHTML = providerContactLinksHtml(provider);
}

function closeProviderModal() {
  document.getElementById('providerModal').style.display = 'none';
  // ورقة التقييم وورقة طلب عرض السعر ابنتان للنافذة في التسلسل: إغلاق الأصل
  // لا يترك ورقة معلّقة.
  closeProviderReviewModal();
  closeProviderQuoteModal();
  currentProviderId = null;
  currentProviderPhone = '';
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

// 12d. «آخر خبر» — شاشة أخبار المحافظة داخل الموقع (وجهة «خدماتنا»).
// المصدر منصة كترا الإخبارية عبر GET /api/news، والخادم وحده يعرف مفتاح
// المنطقة: هو يشتقّه من اسم محافظة الزائر ويعيد الاسم نفسه في `region_name`،
// فلا يبني العميل نسخة ثانية من خريطة الأسماء. لا رمز هنا (auth غير مفعّل)،
// وX-Region يرفقه apiFetch من المحفوظ تلقائياً.

/** يفتح الشاشة من الصفر: حالة نظيفة، هيدر، ثم أول صفحة. */
function openNewsScreen() {
  const screen = document.getElementById('newsScreen');
  if (!screen) return;
  if (!screen.hidden) return; // مفتوحة أصلاً — لا نُصفّر ما يقرأه القارئ الآن

  newsItems = [];
  newsOffset = 0;
  newsHasMore = false;
  newsGeneral = false;
  newsRegionName = '';
  newsLoading = false;

  screen.hidden = false;
  document.body.classList.add('news-screen-open');
  document.addEventListener('keydown', handleNewsKeydown);

  showNewsList();
  updateNewsHeader();
  loadNews({ reset: true });
}

/** × وEscape — الطريقان الوحيدان للخروج، والطبقة تكشف ما تحتها بلا تغيير. */
function closeNewsScreen() {
  const screen = document.getElementById('newsScreen');
  if (screen) screen.hidden = true;
  document.body.classList.remove('news-screen-open');
  document.removeEventListener('keydown', handleNewsKeydown);
}

function handleNewsKeydown(event) {
  if (event.key === 'Escape') closeNewsScreen();
}

/**
 * هيدر الشاشة: «آخر الأخبار — {اسم محافظة الزائر}» ثم وسم «عامة» حين يكون
 * الوجه عاماً. الاسم من ردّ الخادم أولاً، وقبله من المحافظة المعروضة في
 * المنتقي (نفس ما سيرسله apiFetch) كي لا يظهر الهيدر بلا اسم لحظة التحميل.
 */
function updateNewsHeader() {
  const title = document.getElementById('newsScreenTitle');
  const tag = document.getElementById('newsGeneralTag');
  const name = newsRegionName || activeRegionName();
  if (title) title.textContent = name ? `آخر الأخبار — ${name}` : 'آخر الأخبار';
  if (tag) tag.hidden = !newsGeneral;
}

/**
 * جلب صفحة أخبار: `reset` يبدأ من أولها ويرسم هيكل التحميل، وبدونه يُلحق
 * بالصفحة المزيد ويُبقي الكروت المعروضة في مكانها (زرّ «المزيد»).
 */
async function loadNews({ reset = false } = {}) {
  if (newsLoading) return;
  newsLoading = true;

  if (reset) {
    newsOffset = 0;
    newsItems = [];
    renderNewsSkeleton();
  }
  updateNewsLoadMore();

  try {
    const res = await apiFetch(`/api/news?limit=${NEWS_PAGE_SIZE}&offset=${newsOffset}&general=${newsGeneral ? 1 : 0}`);
    const data = await res.json();
    if (!res.ok || !data || data.success !== true || !Array.isArray(data.items)) {
      throw new Error('bad news response');
    }

    newsRegionName = data.region_name || newsRegionName;
    newsGeneral = data.general === true;
    newsHasMore = data.has_more === true;

    const received = data.items.length;
    newsItems = reset ? data.items : newsItems.concat(data.items);
    newsOffset += received;
    // صفحة فارغة مع has_more تعني أن المصدر لا يقدّم أكثر — لا نستمرّ في السؤال.
    if (!received) newsHasMore = false;

    updateNewsHeader();
    renderNewsList();
  } catch (e) {
    // فشل «المزيد» لا يمحو ما قُرئ: الكروت تبقى، والرسالة العربية تقول ما جرى
    // ويبقى الزرّ للمحاولة مرّة أخرى. الفشل الأول وحده يُنشئ حالة الخطأ.
    if (newsItems.length) showToast('تعذّر تحميل المزيد من الأخبار — حاول مرة أخرى');
    else renderNewsError();
  } finally {
    newsLoading = false;
    updateNewsLoadMore();
  }
}

/** «المزيد» — تكملة الصفحة نفسها، والإزاحة هي عدد ما وصل فعلاً. */
function loadMoreNews() {
  if (newsLoading || !newsHasMore) return;
  loadNews();
}

/** زرّ الحالة الفارغة: يعيد الجلب على الوجه العام ويرفع وسم «عامة» في الهيدر. */
function loadGeneralNews() {
  newsGeneral = true;
  updateNewsHeader();
  loadNews({ reset: true });
}

function updateNewsLoadMore() {
  const wrapper = document.getElementById('newsLoadMoreWrapper');
  const btn = document.getElementById('newsLoadMoreBtn');
  if (!wrapper) return;
  wrapper.hidden = !(newsHasMore && newsItems.length > 0);
  if (btn) btn.disabled = newsLoading;
}

/** هيكل تحميل بشكل الكرت نفسه بدل دوّارة وسط الشاشة. */
function renderNewsSkeleton() {
  const list = document.getElementById('newsList');
  if (!list) return;
  list.innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="news-skeleton" aria-hidden="true">
      <div class="news-skeleton-media skeleton-shimmer"></div>
      <div class="news-skeleton-line skeleton-shimmer"></div>
      <div class="news-skeleton-line news-skeleton-line-short skeleton-shimmer"></div>
    </div>`).join('');
}

function renderNewsList() {
  const list = document.getElementById('newsList');
  if (!list) return;
  if (!newsItems.length) {
    renderNewsEmpty();
    return;
  }
  list.innerHTML = newsItems.map(renderNewsCardHtml).join('');
}

/** كرت خبر واحد — صورة 16:9 إن وُجدت، شارة «عاجل»، العنوان، القسم، الوقت النسبي. */
function renderNewsCardHtml(item) {
  const media = item.image
    ? `<div class="news-card-media"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy"></div>`
    : '<div class="news-card-media news-card-media-empty"><i class="fa-regular fa-newspaper" aria-hidden="true"></i></div>';
  const chips = [
    item.is_breaking ? '<span class="news-breaking">عاجل</span>' : '',
    item.category && item.category.name ? `<span class="news-card-category">${escapeHtml(item.category.name)}</span>` : ''
  ].join('');
  const time = formatNewsRelativeTime(item.published_at);

  return `
    <article class="news-card" data-news-id="${item.id}">
      <button type="button" class="news-card-open" onclick="openNewsItem(${item.id})">
        ${media}
        <div class="news-card-body">
          <div class="news-card-chips">${chips}</div>
          <h3 class="news-card-title">${escapeHtml(item.title)}</h3>
          ${item.excerpt ? `<p class="news-card-excerpt">${escapeHtml(item.excerpt)}</p>` : ''}
          ${time ? `<div class="news-card-time"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHtml(time)}</div>` : ''}
        </div>
      </button>
    </article>`;
}

function renderNewsError() {
  const list = document.getElementById('newsList');
  if (!list) return;
  newsHasMore = false;
  list.innerHTML = `
    <div class="empty-state news-empty">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <h3>تعذّر تحميل الأخبار</h3>
      <p>تحقّق من الاتصال ثم أعد المحاولة.</p>
      <button type="button" class="gold-action-btn" onclick="loadNews({ reset: true })">
        <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> إعادة المحاولة
      </button>
    </div>`;
}

function renderNewsEmpty() {
  const list = document.getElementById('newsList');
  if (!list) return;

  // الوجه العام نفسه بلا أخبار: لا زرّ يعيد الجلب إلى الوجه العام مرّة أخرى.
  if (newsGeneral) {
    list.innerHTML = `
      <div class="empty-state news-empty">
        <i class="fa-regular fa-newspaper" aria-hidden="true"></i>
        <h3>لا أخبار بعد</h3>
        <p>لم يصلنا أي خبر عام حتى الآن — عُد قريباً.</p>
      </div>`;
    return;
  }

  list.innerHTML = `
    <div class="empty-state news-empty">
      <i class="fa-regular fa-newspaper" aria-hidden="true"></i>
      <h3>لا أخبار لمحافظتك بعد</h3>
      <p>لم يصلنا خبر من محافظتك حتى اللحظة.</p>
      <button type="button" class="gold-action-btn" onclick="loadGeneralNews()">
        <i class="fa-solid fa-globe" aria-hidden="true"></i> أخبار محلية عامة
      </button>
    </div>`;
}

/** يبدّل إلى عرض التفصيل ويجلب الخبر — الفتح داخل الطبقة نفسها، لا صفحة جديدة. */
async function openNewsItem(id) {
  const detail = document.getElementById('newsDetailView');
  if (!detail) return;

  showNewsDetail();
  detail.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch(`/api/news/${id}`);
    const data = await res.json();
    if (!res.ok || !data || data.success !== true || !data.item) throw new Error('bad news item');
    renderNewsDetail(data.item);
  } catch (e) {
    detail.innerHTML = `
      <div class="empty-state news-empty">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <p>تعذّر تحميل الخبر — تحقّق من الاتصال</p>
        <button type="button" class="gold-action-btn" onclick="openNewsItem(${id})">
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> إعادة المحاولة
        </button>
      </div>`;
  }
}

/** زرّ الرجوع داخل التفصيل — يعود إلى القائمة كما كانت، بلا إعادة جلب. */
function backToNewsList() {
  showNewsList();
}

function showNewsList() {
  const listView = document.getElementById('newsListView');
  const detailView = document.getElementById('newsDetailView');
  if (listView) listView.hidden = false;
  if (detailView) detailView.hidden = true;
}

function showNewsDetail() {
  const listView = document.getElementById('newsListView');
  const detailView = document.getElementById('newsDetailView');
  if (listView) listView.hidden = true;
  if (detailView) detailView.hidden = false;
  // التفصيل يبدأ من أعلاه: الطبقة نفسها هي الحاوية المُمرَّرة.
  const scroller = document.querySelector('.news-screen-scroll');
  if (scroller) scroller.scrollTop = 0;
}

function renderNewsDetail(item) {
  const detail = document.getElementById('newsDetailView');
  if (!detail) return;

  const time = formatNewsRelativeTime(item.published_at);
  const date = formatNewsDay(item.published_at);
  const paragraphs = String(item.body_text || '')
    .split(/\n+/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
  const bodyHtml = paragraphs.length
    ? paragraphs.map(paragraph => `<p class="news-detail-paragraph">${escapeHtml(paragraph)}</p>`).join('')
    : (item.excerpt ? `<p class="news-detail-paragraph">${escapeHtml(item.excerpt)}</p>` : '');
  const meta = [
    date ? `<span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${escapeHtml(date)}</span>` : '',
    time ? `<span><i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHtml(time)}</span>` : ''
  ].join('');
  const chips = [
    item.is_breaking ? '<span class="news-breaking">عاجل</span>' : '',
    item.category && item.category.name ? `<span class="news-card-category">${escapeHtml(item.category.name)}</span>` : ''
  ].join('');

  detail.innerHTML = `
    <div class="news-detail">
      <button type="button" class="news-detail-back" onclick="backToNewsList()">
        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> رجوع
      </button>
      ${item.image ? `<div class="news-detail-media"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}"></div>` : ''}
      <div class="news-detail-head">
        <div class="news-card-chips">${chips}</div>
        <h2 class="news-detail-title">${escapeHtml(item.title)}</h2>
        <div class="news-detail-meta">${meta}</div>
      </div>
      <div class="news-detail-text">${bodyHtml}</div>
      <p class="news-detail-source">من منصة كترا الإخبارية</p>
      ${item.url ? `<a class="news-detail-open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
        <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> افتح على كترا
      </a>` : ''}
    </div>`;
}

/** تاريخ يوم الخبر عربياً طويلاً — 'YYYY-MM-DD' خاماً لا يصل القارئ. */
function formatNewsDay(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

/**
 * الوقت النسبي بالعربية: «الآن» ثم «قبل ٥ دقائق / ٣ ساعات / يومين»، وما تجاوز
 * أسبوعاً يخرج تاريخاً — «قبل ٤٠ يوماً» لا تُقرأ أسرع من «٥ سبتمبر ٢٠٢٦».
 */
function formatNewsRelativeTime(iso) {
  if (!iso) return '';
  const published = new Date(iso);
  if (Number.isNaN(published.getTime())) return '';

  const minutes = Math.floor((Date.now() - published.getTime()) / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${arabicUnit(minutes, 'دقيقة', 'دقيقتين', 'دقائق')}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${arabicUnit(hours, 'ساعة', 'ساعتين', 'ساعات')}`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `قبل ${arabicUnit(days, 'يوم', 'يومين', 'أيام')}`;

  return formatNewsDay(iso);
}

/**
 * صيغة العدد العربية: ١ «دقيقة»، ٢ «دقيقتين»، ٣–١٠ «٣ دقائق»، ١١ فأكثر
 * بالمفرد المنصوب («١١ دقيقة» — صيغة ما فوق العشرة الصحيحة بلا تشكيل) —
 * التي يتكلّمها القارئ، لا «قبل 1 يوم».
 */
function arabicUnit(count, singular, dual, plural) {
  if (count === 1) return singular;
  if (count === 2) return dual;
  if (count >= 3 && count <= 10) return `${count} ${plural}`;
  return `${count} ${singular}`;
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
        <strong>تنبيه تضارب مواعيد:</strong> يوجد بالفعل (${escapeHtml(String(data.count))}) مناسبة مسجلة في <strong>${escapeHtml(town)}</strong> في تاريخ ${escapeHtml(date)}.
      `;
    } else {
      alertBox.style.display = 'block';
      alertBox.className = 'collision-box safe';
      alertBox.innerHTML = `
        <i class="fa-solid fa-circle-check"></i>
        <strong>الموعد متاح وممتاز:</strong> لا يوجد تضارب في مناسبات <strong>${escapeHtml(town)}</strong> في هذا اليوم.
      `;
    }
  } catch (e) {
    console.error('Collision check error:', e);
  }
}

async function handleEventSubmit(e) {
  e.preventDefault();
  if (eventSubmitInFlight) return;
  eventSubmitInFlight = true;
  const btn = document.getElementById('submitEventBtn');
  try {
    if (!requireAuth({ type: 'publish' })) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';

    const type = selectedOccasionType;
    if (!type) {
      alert('يرجى اختيار نوع المناسبة أولاً');
      return;
    }

    const fieldsByKey = {};
    for (const f of type.fields) fieldsByKey[f.field_key] = f;
    const labelOf = key => (fieldsByKey[key] && fieldsByKey[key].label) || key;

    // أيام المناسبة الإضافية تُقرأ مرّة واحدة هنا (لا عند كل حقل)، وتُستعمل في
    // فحص الإجبارية وفي إرفاق FormData معاً — الحقل اختياري على الأنواع اليوم.
    const extraDays = fieldsByKey.extra_days ? collectEventDays('addExtraDaysList') : [];

    const honorees = collectHonorees('addHonoreesList');
    if (!honorees.length) {
      alert(`${labelOf('honorees')} مطلوب`);
      return;
    }

    const town = document.getElementById('addTown').value;

    // قاعدة تكامل الخادم نفسها: قرية إلزامية تحت "القرى والتجمعات" فقط، ومُرسَلة
    // فقط عندها — بلدة أخرى لا تُرسِل village_id إطلاقاً (خريطة #21، تذكرة #23).
    // «قريتي غير موجودة» يُرسِل requested_village_name بدلها، لا الاثنين معاً.
    // والمحافظة إلزامية تحت هذا البند وحده (تذكرة #124) — الخادم يقبل region_id
    // اختيارياً (#120)، والعميل هو من يُلزم بها كي لا تُنسب مناسبة قروية إلى
    // المحافظة الافتراضية بلا أن يختارها ناشرها.
    let villageId = null;
    let requestedVillageName = '';
    let regionId = null;
    if (town === VILLAGES_TOWN) {
      const choice = readVillageChoice('add');
      villageId = choice.villageId;
      requestedVillageName = choice.requestedName;
      if (!villageId && !requestedVillageName) {
        alert('اختر القرية من القائمة أو اكتب اسم قريتك');
        return;
      }
      const regionSelect = document.getElementById('addRegion');
      regionId = regionSelect && regionSelect.value ? Number(regionSelect.value) : null;
      // تُلزَم فقط إن كانت قائمة المحافظات **النشطة** قد وصلت فعلاً (تذكرة #127)؛
      // تعذّر GET /api/towns، أو كون كلها موقوفة، يترك الحقل بلا خيارات فلا
      // يُحوَّل إلى منع نشر — الخادم يشتقّ الافتراضية.
      if (!regionId && activeRegionsList().length) {
        alert('اختر المحافظة التي تنتمي إليها القرية');
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
      extra_days: () => (extraDays.length ? '1' : ''),
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

    // كل غلاف يمرّ بمعالجة العميل قبل الرفع (#178): صورة اختارها الناشر ولم
    // يؤكّد قصّها تُصدَّر الآن بالمستطيل المعروض (٤:٥ افتراضاً) بدل رفع الملف
    // الخام. والملف الخام لا يبقى إلا حين يفشل فكّ الصورة فعلاً — أما صورة ما
    // زالت تُفكّ فلا تُرفَع خامة ولا يُوقَف الناشر بلا سبب، بل يُطلب إعادة المحاولة.
    const posterFileInput = fieldsByKey.poster_url ? document.getElementById('addPosterFile') : null;
    const posterFile = posterFileInput && posterFileInput.files ? posterFileInput.files[0] : null;
    let posterUpload = posterCropState && posterCropState.blob ? posterCropState.blob : null;
    if (posterFile && !posterUpload) {
      if (posterCropState) {
        posterUpload = await exportPosterCrop(posterCropState.rect);
        if (!posterUpload) {
          alert('تعذّر تجهيز صورة الغلاف، يرجى إعادة اختيار الصورة');
          return;
        }
      } else if (!posterCropDecodeFailed) {
        alert('انتظر لحظة ريثما تجهز صورة الغلاف ثم أعد الإرسال');
        return;
      }
    }

    const formData = new FormData();
    formData.append('occasion_type_id', type.id);
    appendHonoreesToFormData(formData, honorees);
    if (fieldsByKey.extra_days) appendEventDaysToFormData(formData, extraDays);
    formData.append('town', town);
    if (villageId) formData.append('village_id', villageId);
    else if (requestedVillageName) formData.append('requested_village_name', requestedVillageName);
    if (regionId) formData.append('region_id', regionId);
    formData.append('event_date', eventDate);

    // ظهور المناسبة (#166): «عام» افتراضاً — نفس افتراض الخادم، فلا يتغيّر شيء
    // في طلب لا يجد الحقل (صفحة قديمة من كاش) ولا في نشر عميل لا يعرفه أصلاً.
    const visibilitySelect = document.getElementById('addVisibility');
    formData.append('visibility', (visibilitySelect && visibilitySelect.value) || 'public');

    // موعد النشر المجدول (#167): يُرسَل فقط إن مُلئ — وغيابه «بلا جدولة»، نفس ما
    // يرسله كل عميل منشور اليوم. والخادم يرفض الماضي بـ400 عربية.
    const publishAtInput = document.getElementById('addPublishAt');
    if (publishAtInput && publishAtInput.value) formData.append('publish_at', publishAtInput.value);

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

    if (fieldsByKey.poster_url && posterUpload) {
      // اسم صريح ثالث لـ`append` لا غنى عنه، وإلا صار originalname الحرفي
      // "blob" بلا امتداد (server/src/middleware/upload.js).
      formData.append('poster', posterUpload, 'poster.jpg');
    } else if (fieldsByKey.poster_url && posterFile && posterCropDecodeFailed) {
      // فكّ الصورة فشل فعلاً (image.onerror) فلم يقم محرّر قصّ أصلاً — لا أن
      // الناشر ترك القصّ عمداً، ولا أن الصورة ما زالت تُفكّ (يُوقَف قبل هنا).
      formData.append('poster', posterFile);
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
        const extraDaysList = document.getElementById('addExtraDaysList');
        if (extraDaysList) extraDaysList.innerHTML = '';
        fetchMyEvents();
        switchTab('tabHome');
        // مناسبة جديدة نُشرت للتوّ: تُجلب حتى لو لم تتغيّر بصمة الفلتر.
        fetchEvents({ force: true });
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
    }
  } finally {
    eventSubmitInFlight = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال طلب إعلان المناسبة للإدارة للمراجعة';
  }
}

// 14. "مناسباتي" — ownership & editing (#20 step 9)
const MY_EVENT_STATUS_LABELS = { approved: 'منشورة', pending: 'قيد المراجعة', rejected: 'مرفوضة' };

function myEventsContainers() {
  return ['myEventsList', 'accountMyEventsList', 'myPublishedEventsList']
    .map(id => document.getElementById(id))
    .filter(Boolean);
}

async function fetchMyEvents() {
  const containers = myEventsContainers();
  if (!containers.length || !currentUser || !authToken) return;

  if (!myEventsCache.length) {
    const loadingHtml = '<div class="loading-spinner"><div class="spinner"></div><p>جاري جلب مناسباتك...</p></div>';
    containers.forEach(c => { c.innerHTML = loadingHtml; });
  }

  try {
    const res = await apiFetch('/api/my-events', { auth: true });
    const data = await res.json();
    if (!data.success) {
      containers.forEach(c => { c.innerHTML = '<div class="empty-state"><p>تعذر جلب مناسباتك</p></div>'; });
      return;
    }
    myEventsCache = data.events;
    renderMyEvents(myEventsCache);
    // زرّا ستوديو البطاقة في صفحة المناسبة يُبنيان من `myEventsCache`؛ صفحةٌ
    // فُتحت قبل وصول القائمة (فتح مباشر من إشعار أو رابط) كانت تظهر بلا زرّين.
    // إعادة رسم واحدة عند الوصول تكفي — نفس ما يفعله `refreshEventPage`.
    if (eventPageEvent && isEventPageOpen()) renderEventPage(eventPageEvent);
  } catch (e) {
    console.error('My events error:', e);
    containers.forEach(c => { c.innerHTML = '<div class="empty-state"><p>تعذر جلب مناسباتك</p></div>'; });
  }
}

function renderMyEvents(events) {
  const containers = myEventsContainers();

  if (!containers.length) return;

  if (!events || !events.length) {
    const emptyHtml = `
      <div class="empty-state my-events-empty">
        <i class="fa-solid fa-calendar-plus" aria-hidden="true"></i>
        <p>ما نشرت مناسبات بعد</p>
        <button type="button" class="gold-action-btn" onclick="openAddEventModal()">
          <i class="fa-solid fa-plus" aria-hidden="true"></i> أضف عرسك
        </button>
      </div>`;
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
        ${evt.occasion_type && evt.occasion_type.rsvp_enabled === true && evt.occasion_type.tone !== 'solemn' ? `
        <div class="event-page-btn-row my-event-card-row">
          <button type="button" class="record-nokoot-btn" onclick="openRsvpListModal(${evt.id})">
            <i class="fa-solid fa-user-check"></i> مين جاي
          </button>
          <button type="button" class="record-nokoot-btn" onclick="openEventInvitesModal(${evt.id})">
            <i class="fa-solid fa-envelope-open-text"></i> الدعوات
          </button>
        </div>` : ''}
        <!-- بطاقة الدعوة (#180): زرّان جنباً إلى جنب — تصميم من قالب، أو رفع
             البطاقة الجاهزة (وهو رفع الملصق القائم نفسه، بلا مسار جديد). -->
        <div class="event-page-btn-row my-event-card-row">
          <button type="button" class="event-page-btn" onclick="openCardStudio(${evt.id})">
            <i class="fa-solid fa-wand-magic-sparkles"></i> صمّم بطاقة
          </button>
          <button type="button" class="event-page-btn" onclick="triggerReadyCardUpload(${evt.id})">
            <i class="fa-solid fa-upload"></i> ارفع بطاقتك الجاهزة
          </button>
        </div>
      </div>
    </div>
  `).join('');

  containers.forEach(c => { c.innerHTML = html; });
}

// 14ب. ستوديو بطاقة الدعوة (#180)
/**
 * صاحب المناسبة يصمّم «بطاقة الدعوة» من قالب: يختار القالب والخط واللون
 * والمقاس والصورة، يعاينها حقيقةً من الخادم (`POST …/cards/preview` — PNG
 * مصغّر يُعرض blob لا data-URL)، ثم يحفظها فتصير الأساسية فتظهر `og:image`
 * على رابط `/e/:id`.
 *
 * كل نداء عبر apiFetch، والكتالوج (`GET /api/card-templates`) عام ويُجلب مرة
 * واحدة لكل جلسة صفحة. **النبرة تحكم المعروض هنا أيضاً لا الخادم وحده:**
 * مناسبة العزاء لا تُعرض لها إلا القوالب الهادئة، والخادم يردّ 400 لو خولف —
 * فلا العميل يعرض خياراً مرفوضاً ولا يُعتمد على العميل.
 *
 * الحالات الثلاث المطلوبة كلها مرئية: تحميل (نصّ في المعاينة/القائمة)، فشل
 * شبكة (رسالة عربية عامة)، و429 («حاول بعد قليل») — والمناسبة بلا صورة تعمل
 * بخيار «بلا صورة» بلا خطأ.
 */
let cardStudioCatalog = null; // { templates, sizes, fonts } — من الخادم مرة واحدة
let cardStudioState = null;   // { eventId, tone, templateKey, sizeKey, fontKey, color, photoSource, photoFile }
let cardStudioPreviewUrl = null; // ObjectURL يُحرَّر عند كل معاينة وعند الإغلاق
let readyCardUploadEventId = null;

function cardStudioEvent() {
  return myEventsCache.find(evt => evt.id === cardStudioState.eventId) || null;
}

function cardStudioSolemn() {
  const evt = cardStudioEvent();
  return Boolean(evt && evt.occasion_type && evt.occasion_type.tone === 'solemn');
}

function cardStudioTemplatesForTone() {
  const tone = cardStudioSolemn() ? 'solemn' : 'festive';
  return cardStudioCatalog.templates.filter(template => template.tone === tone);
}

function cardStudioTemplate(key) {
  return cardStudioCatalog.templates.find(template => template.key === key) || null;
}

function cardStudioSize(key) {
  return cardStudioCatalog.sizes.find(size => size.key === key) || null;
}

function cardStudioFont(key) {
  return cardStudioCatalog.fonts.find(font => font.key === key) || null;
}

/** أول قالب متاح لنبرة المناسبة، ثم أول خط ولون مسموحين به — قيمة ابتدائية صالحة دائماً. */
function pickCardStudioDefaults() {
  const templates = cardStudioTemplatesForTone();
  const template = templates[0] || null;
  cardStudioState.templateKey = template ? template.key : null;
  cardStudioState.sizeKey = 'story';
  cardStudioState.fontKey = template ? template.default_font : null;
  const color = template ? template.colors[0] : null;
  cardStudioState.color = color ? color.value : null;
  cardStudioState.photoSource = 'event';
  cardStudioState.photoFile = null;
}

function cardStudioTemplateSwatch(template) {
  const first = (template.colors[0] && template.colors[0].value) || 'var(--surface-sunk)';
  const second = (template.colors[1] && template.colors[1].value) || first;
  // معاينة مصغّرة للقالب: أرضية من لونيه المميّزين — بلا صورة من الخادم ولا
  // طلب إضافي، لكنها تقول «القالب» بصرياً قبل ضغط «معاينة».
  return `background:linear-gradient(135deg, ${escapeHtml(first)} 0%, ${escapeHtml(first)} 46%, ${escapeHtml(second)} 46%, ${escapeHtml(second)} 100%);`;
}

function renderCardStudioControls() {
  const templatesBox = document.getElementById('cardStudioTemplates');
  const sizesBox = document.getElementById('cardStudioSizes');
  const colorsBox = document.getElementById('cardStudioColors');
  const fontSelect = document.getElementById('cardStudioFont');
  if (!templatesBox || !sizesBox || !colorsBox || !fontSelect) return;

  const templates = cardStudioTemplatesForTone();
  templatesBox.innerHTML = templates.map(template => `
    <button type="button" class="card-studio-template${template.key === cardStudioState.templateKey ? ' is-selected' : ''}"
            role="radio" aria-checked="${template.key === cardStudioState.templateKey ? 'true' : 'false'}"
            data-template="${escapeHtml(template.key)}" onclick="selectCardStudioTemplate(this.dataset.template)">
      <span class="card-studio-swatch" style="${cardStudioTemplateSwatch(template)}" aria-hidden="true"></span>
      <span class="card-studio-template-name">${escapeHtml(template.name)}</span>
      <span class="card-studio-template-note">${escapeHtml(template.tagline || '')}</span>
    </button>`).join('');

  sizesBox.innerHTML = cardStudioCatalog.sizes.map(size => `
    <button type="button" class="card-studio-chip${size.key === cardStudioState.sizeKey ? ' is-selected' : ''}"
            role="radio" aria-checked="${size.key === cardStudioState.sizeKey ? 'true' : 'false'}"
            data-size="${escapeHtml(size.key)}" onclick="selectCardStudioSize(this.dataset.size)">
      <span>${escapeHtml(size.name)}</span>
      <span class="card-studio-chip-note">${size.width}×${size.height}</span>
    </button>`).join('');

  const template = cardStudioTemplate(cardStudioState.templateKey);
  const colors = template ? template.colors : [];
  colorsBox.innerHTML = colors.map(color => `
    <button type="button" class="card-studio-colour${color.value === cardStudioState.color ? ' is-selected' : ''}"
            role="radio" aria-checked="${color.value === cardStudioState.color ? 'true' : 'false'}"
            aria-label="${escapeHtml(color.name)}" title="${escapeHtml(color.name)}"
            data-colour="${escapeHtml(color.value)}"
            style="background:${escapeHtml(color.value)}" onclick="selectCardStudioColour(this.dataset.colour)"></button>`).join('');

  const allowedFonts = template ? template.fonts : [];
  fontSelect.innerHTML = allowedFonts.map(key => {
    const font = cardStudioFont(key);
    if (!font) return '';
    return `<option value="${escapeHtml(font.key)}"${font.key === cardStudioState.fontKey ? ' selected' : ''}>${escapeHtml(font.name)}</option>`;
  }).join('');
  if (!allowedFonts.includes(cardStudioState.fontKey) && allowedFonts.length) {
    cardStudioState.fontKey = allowedFonts[0];
    fontSelect.value = allowedFonts[0];
  }

  const photoSelect = document.getElementById('cardStudioPhoto');
  if (photoSelect) photoSelect.value = cardStudioState.photoSource;
  const photoNote = document.getElementById('cardStudioPhotoNote');
  const evt = cardStudioEvent();
  if (photoNote) {
    photoNote.textContent = evt && evt.poster_url
      ? 'ستُستخدم صورة المناسبة المنشورة.'
      : 'هذه المناسبة بلا صورة — البطاقة ستُرسم نصّية، أو ارفع صورة من جهازك.';
  }
}

function selectCardStudioTemplate(key) {
  const template = cardStudioTemplate(key);
  if (!template) return;
  if (!cardStudioTemplatesForTone().some(candidate => candidate.key === key)) return;
  cardStudioState.templateKey = key;
  cardStudioState.fontKey = template.default_font;
  cardStudioState.color = template.colors[0].value;
  renderCardStudioControls();
}

function selectCardStudioSize(key) {
  if (!cardStudioSize(key)) return;
  cardStudioState.sizeKey = key;
  renderCardStudioControls();
}

function selectCardStudioColour(value) {
  const template = cardStudioTemplate(cardStudioState.templateKey);
  if (!template || !template.colors.some(color => color.value === value)) return;
  cardStudioState.color = value;
  renderCardStudioControls();
}

function handleCardStudioPhotoChange() {
  const select = document.getElementById('cardStudioPhoto');
  if (!select) return;
  cardStudioState.photoSource = select.value;
  const fileInput = document.getElementById('cardStudioPhotoFile');
  if (cardStudioState.photoSource === 'upload' && fileInput) fileInput.click();
  else cardStudioState.photoFile = null;
}

function handleCardStudioPhotoFile(input) {
  const file = input && input.files && input.files[0];
  cardStudioState.photoFile = file || null;
  const note = document.getElementById('cardStudioPhotoNote');
  if (note && file) note.textContent = `الصورة المختارة: ${file.name}`;
}

/** جسم POST المعاينة/الحفظ — نفس الحقول حرفياً في النداءين. */
function cardStudioFormData() {
  const form = new FormData();
  form.append('template_key', cardStudioState.templateKey || '');
  form.append('size', cardStudioState.sizeKey || '');
  form.append('font_key', cardStudioState.fontKey || '');
  form.append('color', cardStudioState.color || '');
  // «أرفع صورة» بلا ملف (أُلغيت نافذة الاختيار) تعود إلى صورة المناسبة بدل
  // إرسال مصدرٍ بلا صورة، فيردّ الخادم 400 لطلبٍ لم يقصده أحد.
  const chosenSource = cardStudioState.photoSource === 'upload' && !cardStudioState.photoFile
    ? 'event'
    : cardStudioState.photoSource;
  form.append('photo_source', cardStudioState.photoFile ? 'upload' : chosenSource);
  if (cardStudioState.photoFile) form.append('photo', cardStudioState.photoFile);
  return form;
}

function setCardStudioStatus(elementId, message, { error = false } = {}) {
  const element = document.getElementById(elementId);
  if (!element) return;
  if (!message) {
    element.hidden = true;
    element.textContent = '';
    element.classList.remove('is-error');
    return;
  }
  element.hidden = false;
  element.textContent = message;
  element.classList.toggle('is-error', Boolean(error));
}

/** رسالة الفشل: 429 لها نصّها المطلوب، وغيرها رسالة الخادم العربية أو عامة. */
async function cardStudioErrorMessage(res, fallback) {
  if (res && res.status === 429) return 'طلبات كثيرة في وقت قصير — حاول بعد قليل';
  let message = fallback;
  try {
    const data = await res.json();
    if (data && data.message) message = data.message;
  } catch (e) { /* جسم غير JSON — تبقى الرسالة العامة */ }
  return message;
}

function setCardStudioBusy(busy, which) {
  const previewBtn = document.getElementById('cardStudioPreviewBtn');
  const saveBtn = document.getElementById('cardStudioSaveBtn');
  if (previewBtn) previewBtn.disabled = busy && which === 'preview';
  if (saveBtn) saveBtn.disabled = busy && which === 'save';
}

async function previewCardStudio() {
  if (!cardStudioState || !cardStudioState.templateKey) return;
  const empty = document.getElementById('cardStudioPreviewEmpty');
  const img = document.getElementById('cardStudioPreviewImg');
  setCardStudioStatus('cardStudioPreviewStatus', 'جارٍ رسم البطاقة…');
  setCardStudioBusy(true, 'preview');

  try {
    const res = await apiFetch(`/api/events/${cardStudioState.eventId}/cards/preview`, {
      method: 'POST',
      auth: true,
      body: cardStudioFormData()
    });
    if (!res.ok) {
      setCardStudioStatus('cardStudioPreviewStatus', await cardStudioErrorMessage(res, 'تعذّرت معاينة البطاقة — حاول مرة أخرى'), { error: true });
      return;
    }
    const blob = await res.blob();
    if (cardStudioPreviewUrl) URL.revokeObjectURL(cardStudioPreviewUrl);
    cardStudioPreviewUrl = URL.createObjectURL(blob);
    if (img) {
      img.src = cardStudioPreviewUrl;
      img.hidden = false;
    }
    if (empty) empty.hidden = true;
    setCardStudioStatus('cardStudioPreviewStatus', '');
  } catch (err) {
    setCardStudioStatus('cardStudioPreviewStatus', 'تعذّر الاتصال بالخادم — تحقّق من الشبكة وحاول مرة أخرى', { error: true });
  } finally {
    setCardStudioBusy(false, 'preview');
  }
}

async function saveCardStudio() {
  if (!cardStudioState || !cardStudioState.templateKey) return;
  setCardStudioStatus('cardStudioResult', 'جارٍ حفظ البطاقة…');
  setCardStudioBusy(true, 'save');

  try {
    const res = await apiFetch(`/api/events/${cardStudioState.eventId}/cards`, {
      method: 'POST',
      auth: true,
      body: cardStudioFormData()
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
      const message = res.status === 429
        ? 'طلبات كثيرة في وقت قصير — حاول بعد قليل'
        : ((data && data.message) || 'تعذّر حفظ البطاقة — حاول مرة أخرى');
      setCardStudioStatus('cardStudioResult', message, { error: true });
      return;
    }
    const link = data.card && data.card.image_url
      ? `<a href="${escapeHtml(data.card.image_url)}" target="_blank" rel="noopener">افتح البطاقة بالمقاس الكامل</a>`
      : '';
    const result = document.getElementById('cardStudioResult');
    if (result) {
      result.hidden = false;
      result.classList.remove('is-error');
      result.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHtml(data.message || 'حُفظت البطاقة')} ${link}`;
    }
    await loadEventCards({ quiet: true });
  } catch (err) {
    setCardStudioStatus('cardStudioResult', 'تعذّر الاتصال بالخادم — لم تُحفظ البطاقة، حاول مرة أخرى', { error: true });
  } finally {
    setCardStudioBusy(false, 'save');
  }
}

function cardStudioCardLabel(card) {
  const template = cardStudioTemplate(card.template_key);
  const size = cardStudioSize(card.size);
  const font = cardStudioFont(card.font_key);
  return [template ? template.name : card.template_key, size ? size.name : card.size, font ? font.name : '']
    .filter(Boolean).join(' · ');
}

function renderEventCards(cards) {
  const list = document.getElementById('cardStudioCardsList');
  if (!list) return;
  if (!cards || !cards.length) {
    list.innerHTML = '<p class="card-studio-empty">لا بطاقات محفوظة لهذه المناسبة بعد.</p>';
    return;
  }
  list.innerHTML = cards.map(card => `
    <div class="card-studio-card-row${card.is_primary ? ' is-primary' : ''}" data-card-id="${card.id}">
      <img class="card-studio-card-thumb" src="${escapeHtml(card.image_url)}" alt="${escapeHtml(cardStudioCardLabel(card))}" loading="lazy">
      <div class="card-studio-card-meta">
        <strong>${escapeHtml(cardStudioCardLabel(card))}</strong>
        ${card.is_primary ? '<span class="card-studio-primary">أساسية — تظهر في معاينة الرابط</span>' : ''}
        <a href="${escapeHtml(card.image_url)}" target="_blank" rel="noopener" class="card-studio-link">الرابط الكامل</a>
      </div>
      <div class="card-studio-card-actions">
        ${card.is_primary ? '' : `<button type="button" class="event-page-btn" onclick="setPrimaryCard(${card.id})">اجعلها أساسية</button>`}
        <button type="button" class="event-page-btn card-studio-delete" onclick="deleteEventCard(${card.id})">حذف</button>
      </div>
    </div>`).join('');
}

async function loadEventCards({ quiet = false } = {}) {
  const list = document.getElementById('cardStudioCardsList');
  if (!cardStudioState) return;
  if (list && !quiet) list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const res = await apiFetch(`/api/events/${cardStudioState.eventId}/cards`, { auth: true });
    if (res.status === 429) {
      if (list) list.innerHTML = '<p class="card-studio-empty is-error">طلبات كثيرة في وقت قصير — حاول بعد قليل</p>';
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data || !data.success) {
      if (list) list.innerHTML = '<p class="card-studio-empty is-error">تعذّر جلب بطاقات المناسبة</p>';
      return;
    }
    renderEventCards(data.cards);
  } catch (err) {
    if (list) list.innerHTML = '<p class="card-studio-empty is-error">تعذّر الاتصال بالخادم</p>';
  }
}

async function setPrimaryCard(cardId) {
  if (!cardStudioState) return;
  try {
    const res = await apiFetch(`/api/events/${cardStudioState.eventId}/cards/${cardId}`, { method: 'PATCH', auth: true });
    const data = await res.json().catch(() => null);
    if (res.status === 429) { setCardStudioStatus('cardStudioResult', 'طلبات كثيرة في وقت قصير — حاول بعد قليل', { error: true }); return; }
    if (!data || !data.success) {
      setCardStudioStatus('cardStudioResult', (data && data.message) || 'تعذّر تعيين البطاقة الأساسية', { error: true });
      return;
    }
    setCardStudioStatus('cardStudioResult', data.message || 'صارت هذه البطاقة الأساسية');
    await loadEventCards({ quiet: true });
  } catch (err) {
    setCardStudioStatus('cardStudioResult', 'تعذّر الاتصال بالخادم', { error: true });
  }
}

async function deleteEventCard(cardId) {
  if (!cardStudioState) return;
  if (!confirm('حذف هذه البطاقة؟ سيعود رابط المشاركة إلى البطاقة التي يولّدها الموقع إن كانت هي الأساسية.')) return;
  try {
    const res = await apiFetch(`/api/events/${cardStudioState.eventId}/cards/${cardId}`, { method: 'DELETE', auth: true });
    const data = await res.json().catch(() => null);
    if (res.status === 429) { setCardStudioStatus('cardStudioResult', 'طلبات كثيرة في وقت قصير — حاول بعد قليل', { error: true }); return; }
    if (!data || !data.success) {
      setCardStudioStatus('cardStudioResult', (data && data.message) || 'تعذّر حذف البطاقة', { error: true });
      return;
    }
    setCardStudioStatus('cardStudioResult', data.message || 'حُذفت البطاقة');
    await loadEventCards({ quiet: true });
  } catch (err) {
    setCardStudioStatus('cardStudioResult', 'تعذّر الاتصال بالخادم', { error: true });
  }
}

/** يفتح الستوديو لمناسبة يملكها الحساب، ويجلب الكتالوج مرة واحدة. */
async function openCardStudio(eventId) {
  const modal = document.getElementById('cardStudioModal');
  if (!modal) return;
  const evt = myEventsCache.find(item => item.id === eventId);
  if (!evt) return;

  cardStudioState = { eventId, photoSource: 'event', photoFile: null };
  const subtitle = document.getElementById('cardStudioSubtitle');
  if (subtitle) subtitle.textContent = evt.title || evt.groom_name || '';
  document.getElementById('cardStudioPhotoFile').value = '';
  setCardStudioStatus('cardStudioPreviewStatus', '');
  setCardStudioStatus('cardStudioResult', '');
  const img = document.getElementById('cardStudioPreviewImg');
  const empty = document.getElementById('cardStudioPreviewEmpty');
  if (img) { img.hidden = true; img.removeAttribute('src'); }
  if (empty) empty.hidden = false;
  modal.style.display = 'flex';

  if (!cardStudioCatalog) {
    const list = document.getElementById('cardStudioTemplates');
    if (list) list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    try {
      const res = await apiFetch('/api/card-templates');
      const data = await res.json().catch(() => null);
      if (!data || !data.success) {
        if (list) list.innerHTML = '<p class="card-studio-empty is-error">تعذّر جلب القوالب — تحقّق من الاتصال ثم أعد المحاولة</p>';
        return;
      }
      cardStudioCatalog = { templates: data.templates, sizes: data.sizes, fonts: data.fonts };
    } catch (err) {
      if (list) list.innerHTML = '<p class="card-studio-empty is-error">تعذّر الاتصال بالخادم — تعذّر جلب القوالب</p>';
      return;
    }
  }

  pickCardStudioDefaults();
  renderCardStudioControls();
  loadEventCards();
}

function closeCardStudio() {
  const modal = document.getElementById('cardStudioModal');
  if (modal) modal.style.display = 'none';
  if (cardStudioPreviewUrl) {
    URL.revokeObjectURL(cardStudioPreviewUrl);
    cardStudioPreviewUrl = null;
  }
  cardStudioState = null;
}

/**
 * «ارفع بطاقتك الجاهزة»: ملصق جاهز من تصميم صاحب المناسبة — نفس رفع الملصق
 * القائم (`PATCH /api/events/:id` بحقل `poster`)، فلا مسار خادم جديد ولا
 * عمود جديد. والباقي إن كان أساسياً يعود للملصق المرفوع، وصفّ `event_cards`
 * لا يُكتب هنا إطلاقاً.
 */
function triggerReadyCardUpload(eventId) {
  readyCardUploadEventId = eventId;
  const input = document.getElementById('readyCardUploadInput');
  if (!input) return;
  input.value = '';
  input.click();
}

async function handleReadyCardUpload(input) {
  const file = input && input.files && input.files[0];
  const eventId = readyCardUploadEventId;
  readyCardUploadEventId = null;
  if (!file || !eventId) return;

  const form = new FormData();
  form.append('poster', file);

  try {
    const res = await apiFetch(`/api/events/${eventId}`, { method: 'PATCH', auth: true, body: form });
    const data = await res.json().catch(() => null);
    if (res.status === 429) { alert('طلبات كثيرة في وقت قصير — حاول بعد قليل'); return; }
    if (!data || !data.success) { alert((data && data.message) || 'تعذّر رفع البطاقة — حاول مرة أخرى'); return; }
    alert('تم رفع بطاقتك الجاهزة وستظهر كصورة المناسبة.');
    fetchMyEvents();
    if (eventPageEvent && eventPageEvent.id === eventId) refreshEventPage();
  } catch (err) {
    alert('تعذّر رفع البطاقة — تحقّق من الاتصال بالخادم');
  }
}

// 14أ. «مين جاي» — قائمة أجوبة الحضور لصاحب المناسبة (تذكرة #168).
// GET /api/events/:id/rsvps يعيد الأسماء والعدد والجواب والمصدر والمجاميع،
// **بلا هاتف**: الخادم لا ينتقي `guest_phone` أصلاً، فلا شيء يُخفى هنا.
const RSVP_SOURCE_LABELS = { account: 'حساب', share_page: 'رابط المشاركة' };

async function openRsvpListModal(eventId) {
  const modal = document.getElementById('rsvpListModal');
  const body = document.getElementById('rsvpListBody');
  const subtitle = document.getElementById('rsvpListSubtitle');
  if (!modal || !body) return;

  const evt = myEventsCache.find(e => e.id === eventId);
  if (subtitle) subtitle.textContent = evt ? (evt.title || evt.groom_name || '') : '';
  modal.style.display = 'flex';
  body.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const res = await apiFetch(`/api/events/${eventId}/rsvps`, { auth: true });
    const data = await res.json();
    if (!data || !data.success) {
      body.innerHTML = `<div class="empty-state" style="padding:20px;"><p>${escapeHtml((data && data.message) || 'تعذر جلب قائمة الحضور')}</p></div>`;
      return;
    }
    renderRsvpList(data);
  } catch (e) {
    body.innerHTML = '<div class="empty-state" style="padding:20px;"><p>تعذر جلب قائمة الحضور</p></div>';
  }
}

function renderRsvpList({ rsvps = [], totals = {} }) {
  const body = document.getElementById('rsvpListBody');
  if (!body) return;

  const summary = `
    <div class="rsvp-list-summary">
      <span>جايين: <strong>${Number(totals.going_count) || 0}</strong></span>
      <span>أجوبة «جاي»: <strong>${Number(totals.going_rows) || 0}</strong></span>
      <span>أجوبة «مش جاي»: <strong>${Number(totals.not_going_rows) || 0}</strong></span>
    </div>`;

  if (!rsvps.length) {
    body.innerHTML = `${summary}<div class="empty-state" style="padding:20px;"><p>لا أجوبة حضور بعد</p></div>`;
    return;
  }

  body.innerHTML = summary + rsvps.map(rsvp => `
    <div class="chat-bubble">
      <div class="chat-bubble-header">
        <span class="sender-name">${escapeHtml(rsvp.name || '')}</span>
        <span class="status-tag ${rsvp.response === 'yes' ? 'approved' : 'pending'}">${rsvp.response === 'yes' ? 'جاي' : 'مش جاي'}</span>
        <span class="sender-badge">${Number(rsvp.party_size) || 1}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(RSVP_SOURCE_LABELS[rsvp.source] || rsvp.source || '')}</div>
      ${rsvp.invite ? `<div class="chat-msg-text">دعوة: ${escapeHtml(rsvp.invite.name || '')} — ${rsvp.invite.opened_at ? 'فُتحت' : 'لم تُفتح'}</div>` : ''}
    </div>
  `).join('');
}

function closeRsvpListModal() {
  const modal = document.getElementById('rsvpListModal');
  if (modal) modal.style.display = 'none';
}

// الدعوات الشخصية (تذكرة #183) — صاحب المناسبة ينشئ لكل ضيف دعوةً برابط
// `/e/:id/i/<token>` يقول «أهلاً <الاسم>» وفيه نموذج الحضور نفسه باسمه مسبقاً.
// الإنشاء POST والقراءة GET والحذف DELETE على `/api/events/:id/invites`، والرابط
// المطلق يصل جاهزاً من الخادم (لا يُركَّب هنا). والهاتف لا يصل في أي استجابة.
/** المناسبة التي تخصّها النافذة المفتوحة، ودعواتها كما وصلت آخر مرة. */
let eventInvitesState = null;

async function openEventInvitesModal(eventId) {
  const modal = document.getElementById('eventInvitesModal');
  const body = document.getElementById('eventInvitesBody');
  const subtitle = document.getElementById('eventInvitesSubtitle');
  const names = document.getElementById('eventInvitesNames');
  if (!modal || !body) return;

  const evt = myEventsCache.find(e => e.id === eventId);
  if (subtitle) subtitle.textContent = evt ? (evt.title || evt.groom_name || '') : '';
  if (names) names.value = '';
  eventInvitesState = { eventId, invites: [] };
  modal.style.display = 'flex';
  body.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  await loadEventInvites();
}

/** قراءة الدعوات وإعادة رسم القائمة — بعد الإنشاء والحذف أيضاً. */
async function loadEventInvites() {
  const body = document.getElementById('eventInvitesBody');
  if (!eventInvitesState || !body) return;

  try {
    const res = await apiFetch(`/api/events/${eventInvitesState.eventId}/invites`, { auth: true });
    const data = await res.json().catch(() => null);
    if (!data || !data.success) {
      eventInvitesState.invites = [];
      body.innerHTML = `<div class="empty-state" style="padding:20px;"><p>${escapeHtml((data && data.message) || 'تعذر جلب الدعوات')}</p></div>`;
      return;
    }
    eventInvitesState.invites = data.invites || [];
    renderEventInvites();
  } catch (e) {
    body.innerHTML = '<div class="empty-state" style="padding:20px;"><p>تعذر جلب الدعوات</p></div>';
  }
}

function renderEventInvites() {
  const body = document.getElementById('eventInvitesBody');
  if (!body || !eventInvitesState) return;

  const invites = eventInvitesState.invites;
  if (!invites.length) {
    body.innerHTML = '<div class="empty-state" style="padding:20px;"><p>لا دعوات بعد — اكتب الأسماء أعلاه ثم اضغط «أنشئ الدعوات»</p></div>';
    return;
  }

  body.innerHTML = invites.map(invite => {
    const answer = invite.rsvp
      ? `${invite.rsvp.response === 'yes' ? 'جاي' : 'مش جاي'} — ${Number(invite.rsvp.party_size) || 1}`
      : 'لا جواب بعد';
    return `
    <div class="chat-bubble">
      <div class="chat-bubble-header">
        <span class="sender-name">${escapeHtml(invite.name || '')}</span>
        <span class="sender-badge">${invite.opened_at ? 'فُتحت' : 'لم تُفتح'}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(answer)}</div>
      <div class="chat-msg-text" style="word-break:break-all;">${escapeHtml(invite.url || '')}</div>
      <div class="event-page-btn-row" style="margin-top:8px;">
        <button type="button" class="record-nokoot-btn" onclick="copyEventInviteLink(${invite.id})">
          <i class="fa-regular fa-copy"></i> نسخ الرابط
        </button>
        <button type="button" class="record-nokoot-btn" onclick="deleteEventInvite(${invite.id})">
          <i class="fa-solid fa-trash"></i> حذف
        </button>
      </div>
    </div>`;
  }).join('');
}

/**
 * إنشاء دعوة لكل اسم في الصندوق — اسم في كل سطر، والسطور الفارغة تُسقَط.
 * والسقف (`INVITE_BATCH_MAX` = ٥٠) والتحقّق من الاسم في الخادم وحده: رسالته
 * عربية، ورقمٌ مكرَّر هنا يعني رقمين يفترقان يوماً.
 */
async function createEventInvites() {
  const input = document.getElementById('eventInvitesNames');
  if (!eventInvitesState || !input) return;

  const names = input.value.split('\n').map(line => line.trim()).filter(Boolean);
  if (!names.length) {
    alert('اكتب اسماً واحداً على الأقل — اسم في كل سطر');
    return;
  }

  try {
    const res = await apiFetch(`/api/events/${eventInvitesState.eventId}/invites`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names })
    });
    const data = await res.json().catch(() => null);
    if (res.status === 429) { alert('طلبات كثيرة في وقت قصير — حاول بعد قليل'); return; }
    if (!data || !data.success) {
      alert((data && data.message) || 'تعذّر إنشاء الدعوات — حاول مرة أخرى');
      return;
    }

    input.value = '';
    await loadEventInvites();
    showToast(data.message || 'تم إنشاء الدعوات');
  } catch (err) {
    alert('تعذّر إنشاء الدعوات — تحقّق من الاتصال بالخادم');
  }
}

/** حذف دعوة — والجواب الذي جمعته يبقى (الخادم يفكّ الإشارة وحدها). */
async function deleteEventInvite(inviteId) {
  if (!eventInvitesState) return;
  if (!confirm('حذف هذه الدعوة؟ يبقى جواب الحضور الذي جمعته.')) return;

  try {
    const res = await apiFetch(`/api/events/${eventInvitesState.eventId}/invites/${inviteId}`, {
      method: 'DELETE',
      auth: true
    });
    const data = await res.json().catch(() => null);
    if (!data || !data.success) {
      alert((data && data.message) || 'تعذّر حذف الدعوة');
      return;
    }

    await loadEventInvites();
    showToast(data.message || 'تم حذف الدعوة');
  } catch (err) {
    alert('تعذّر حذف الدعوة — تحقّق من الاتصال بالخادم');
  }
}

/**
 * نسخ رابط الدعوة — `navigator.clipboard` ثم البديل القديم (`execCommand`)
 * حين يغيب (سياق غير آمن مثلاً)، كما يفعل نسخ رابط المشاركة في هذا الملف.
 */
async function copyEventInviteLink(inviteId) {
  const invite = eventInvitesState && eventInvitesState.invites.find(item => item.id === inviteId);
  if (!invite || !invite.url) return;

  let copied = false;
  try {
    await navigator.clipboard.writeText(invite.url);
    copied = true;
  } catch (e) {
    try {
      const temp = document.createElement('textarea');
      temp.value = invite.url;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      copied = document.execCommand('copy');
      document.body.removeChild(temp);
    } catch (err) {
      copied = false;
    }
  }

  showToast(copied ? 'تم نسخ رابط الدعوة' : 'تعذّر النسخ — حدّد الرابط وانسخه بيدك');
}

function closeEventInvitesModal() {
  const modal = document.getElementById('eventInvitesModal');
  if (modal) modal.style.display = 'none';
  eventInvitesState = null;
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
    extra_days: 'editExtraDaysList',
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

  // مجموعة المحافظة تتبع مجموعة البلدة: نوعٌ بلا بلدة (أو بلا حقل بلدة)
  // لا محافظة له هنا (تذكرة #124).
  updateEditRegionGroupVisibility();
}

/**
 * مجموعة المحافظة في نافذة التعديل (#124): تظهر فقط حين تكون البلدة ظاهرة
 * وقيمتها البند الجامع «القرى والتجمعات»، وحين وصلت قائمة المحافظات فعلاً —
 * فحقل لا يظهر لا يُرسَل ولا يُلزم به أحد، وحقل بلا خيارات لا يُعرَض.
 */
function updateEditRegionGroupVisibility() {
  const group = document.getElementById('editRegionGroup');
  const townSelect = document.getElementById('editTown');
  if (!group || !townSelect) return;
  const townGroup = townSelect.closest('.form-group');
  const townVisible = !townGroup || townGroup.style.display !== 'none';
  group.style.display = townVisible && activeRegionsList().length && townSelect.value === VILLAGES_TOWN ? 'block' : 'none';
}

/** تبديل بلدة المناسبة في التعديل — يُظهر/يُخفي منتقي المحافظة ويجهّز خياراته. */
function handleEditTownChange() {
  const regionSelect = document.getElementById('editRegion');
  if (regionSelect && activeRegionsList().length && regionSelect.options.length <= 1) {
    populateRegionSelect('editRegion', editEventRegionId);
  }
  updateEditRegionGroupVisibility();
}

/**
 * قيمة `<input type="datetime-local">` من `publish_at` كما يعيده الخادم (#167).
 * الخادم يقرأ عمود `DATETIME` بتوقيت غرينتش (`pool.js`: `timezone: 'Z'`)، فالجزء
 * الأول من ISO هو ساعة الحائط التي كتبها صاحب المناسبة — لا تُحوَّل إلى توقيت
 * المتصفّح. و`null`/الفارغ يعني «بلا جدولة» فيبقى الحقل فارغاً.
 */
function publishAtInputValue(stored) {
  if (!stored) return '';
  const date = new Date(stored);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function openEditEventModal(eventId) {
  const evt = myEventsCache.find(e => e.id === eventId);
  if (!evt) return;

  document.getElementById('editEventId').value = evt.id;
  document.getElementById('editTitle').value = evt.title || '';
  document.getElementById('editFamily').value = evt.family_clan || '';
  // محافظة المناسبة نفسها كقيمة ابتدائية (#124) — تُرسَل فقط إن غيّرها
  // المستخدم؛ غياب region_id في الاستجابة يعني «غير معروف» فلا نختار بدلاً منه.
  editEventRegionId = evt.region_id !== null && evt.region_id !== undefined ? Number(evt.region_id) : null;
  // بلدات محافظة المناسبة وحدها، وبلدتها الحالية تبقى مختارة حتى لو غابت عن
  // تلك القائمة (بلدة عُطِّلت أو نُقلت) — نفس قاعدة ما قبل العزل.
  populateTownSelect('editTown', evt.town, editEventRegionId);
  populateRegionSelect('editRegion', editEventRegionId);
  updateEditRegionGroupVisibility();
  document.getElementById('editEventDate').value = evt.event_date || '';
  document.getElementById('editEventEndDate').value = evt.event_end_date || '';
  document.getElementById('editYouthDate').value = evt.youth_party_date || '';
  document.getElementById('editLocationName').value = evt.location_name || '';
  document.getElementById('editSecondaryLocationName').value = evt.secondary_location_name || '';
  document.getElementById('editDinnerTime').value = evt.dinner_time || '';
  document.getElementById('editHostPhone').value = evt.host_phone || '';
  // ظهور المناسبة (#166): القيمة من الصفّ نفسه؛ غيابها (خادم أقدم) تعني «عامة»
  // كالافتراض، فلا يظهر الخيار مختاراً بالخطأ على مناسبة ظاهرة.
  document.getElementById('editVisibility').value = evt.visibility === 'link_only' ? 'link_only' : 'public';
  // موعد النشر المجدول (#167): القيمة من الصفّ نفسه — و`''` يعني «بلا جدولة».
  document.getElementById('editPublishAt').value = publishAtInputValue(evt.publish_at);

  const honoreesList = document.getElementById('editHonoreesList');
  honoreesList.innerHTML = '';
  const honorees = (evt.honorees && evt.honorees.length) ? evt.honorees : [{ name: evt.groom_name || '', role: '' }];
  honorees.forEach(h => addHonoreeRow('editHonoreesList', h.name, h.role || ''));

  const extraDaysList = document.getElementById('editExtraDaysList');
  extraDaysList.innerHTML = '';
  (evt.extra_days || []).forEach(day => addEventDayRow('editExtraDaysList', {
    name: day.name, date: day.day_date, place: day.place || '', time: day.day_time || ''
  }));

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

  const editTown = document.getElementById('editTown').value;
  const payload = {
    title: document.getElementById('editTitle').value,
    family_clan: document.getElementById('editFamily').value,
    town: editTown,
    event_date: document.getElementById('editEventDate').value,
    event_end_date: document.getElementById('editEventEndDate').value,
    youth_party_date: document.getElementById('editYouthDate').value,
    location_name: document.getElementById('editLocationName').value,
    secondary_location_name: document.getElementById('editSecondaryLocationName').value,
    dinner_time: document.getElementById('editDinnerTime').value,
    host_phone: document.getElementById('editHostPhone').value,
    visibility: document.getElementById('editVisibility').value,
    honorees
  };

  // موعد النشر المجدول (#167): يُرسَل فقط حين يحمل الحقل قيمة. القيمة المخزَّنة
  // تصل الحقل مُعبَّأة، فإرسالها كما هي يعني «بلا تعديل» (والخادم يقبلها ولو
  // حلّ موعدها)، ومسح الحقل لا يُنشر المناسبة فوراً ولا يلغي الجدولة — يُبقيها
  // كما هي، لأن غياب المفتاح هو «بلا تعديل» في كل عميل منشور.
  const editPublishAt = document.getElementById('editPublishAt').value;
  if (editPublishAt) payload.publish_at = editPublishAt;

  // المحافظة (#124): لا تُرسَل إلا إن غيّرها المستخدم صراحةً — الخادم يقبلها
  // اختيارية ويشتقّها من البلدة/القرية عند غيابها (#120)، فإرسالها بلا تغيير
  // يكتب قيمة لا طلب لها وقد يعيد حساب محافظة صحيحة. ولا تُلزَم حين لم تصل
  // قائمة المحافظات أصلاً (regionsList فارغة): الحقل عندها بلا خيارات، وحجب
  // كل تعديل بسبب تعذّر GET /api/towns عطلٌ أكبر من غياب حقل اختياري أصلاً.
  const editRegionGroup = document.getElementById('editRegionGroup');
  const editRegionSelect = document.getElementById('editRegion');
  if (editRegionGroup && editRegionGroup.style.display !== 'none' && editRegionSelect) {
    const chosenRegionId = editRegionSelect.value ? Number(editRegionSelect.value) : null;
    if (!chosenRegionId && activeRegionsList().length) {
      alert('اختر المحافظة');
      return;
    }
    if (chosenRegionId !== null && chosenRegionId !== editEventRegionId) payload.region_id = chosenRegionId;
  }

  // extra_days غيابه يعني «اترك الأيام كما هي»، و[] يعني «امسحها» — فيُرسَل
  // فقط حين تكون المجموعة ظاهرة لهذا النوع، وإلا مسح تعديلُ نوعٍ آخر أيامه.
  const extraDaysGroup = document.getElementById('editExtraDaysGroup');
  if (extraDaysGroup && extraDaysGroup.style.display !== 'none') {
    payload.extra_days = collectEventDays('editExtraDaysList');
  }

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
/**
 * `opts.presetMessage` (تذكرة #170): نصّ رسالة جاهزة اختارها المستخدم من ورقة
 * «اختر رسالة». يُكتب في الحقل قبل الجلب ويبقى قابلاً للتعديل — الورقة تقترح
 * ولا تُرسل، والإرسال زرّ المستخدم نفسه (`sendCongratulation`).
 */
async function openChatModal(eventId, opts = {}) {
  currentChatEventId = eventId;
  currentChatEvent = null; // يُعاد ضبطه أدناه بعد نجاح الجلب — لا زرّ مشاركة على بيانات مناسبة سابقة
  const modal = document.getElementById('chatModal');
  modal.style.display = 'flex';
  renderEventArchive(null); // لا تبقى صور مناسبة سابقة ظاهرة أثناء الجلب

  const messageInput = document.getElementById('chatInputMessage');
  const presetMessage = opts.presetMessage || '';
  messageInput.value = presetMessage;
  if (presetMessage) messageInput.focus();

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
        // البلدة تُمرَّر خاصيةَ data-town مهرَّبة لا نصّاً داخل كود onclick —
        // `&#039;` يُفكّ إلى ' قبل أن يقرأ المتصفّح الكود فيكسره. والرقم نصّ حرّ
        // من النشر، فيُهرَّب أينما ظهر.
        const townAttr = escapeHtml(evt.town || '');
        hostBar.innerHTML = `
          <a href="tel:${escapeHtml(evt.host_phone)}" class="host-call-btn" data-town="${townAttr}" onclick="recordAnalyticsEvent('contact_clicked', { contentTown: this.dataset.town })"><i class="fa-solid fa-phone"></i> اتصال بالمعلن (${escapeHtml(evt.host_phone)})</a>
          <a href="https://wa.me/972${escapeHtml(evt.host_phone.replace(/^0/, ''))}" target="_blank" class="host-wa-btn" data-town="${townAttr}" onclick="recordAnalyticsEvent('contact_clicked', { contentTown: this.dataset.town })"><i class="fa-brands fa-whatsapp"></i> واتساب المعلن</a>
        `;
      } else {
        hostBar.style.display = 'none';
      }

      renderEventArchive(evt);
      renderChatMessages(evt.congratulations);
    }
  } catch (e) {
    console.error('Chat error:', e);
  }
}

/*
 * «أرشيف العرس» (ADR-0008) — صور ما بعد المناسبة. الخادم وحده يقرّر متى تظهر
 * (معتمدة + انتهت + النوع يسمح بالأرشيف) فيعيد archive_photos فارغة في كل
 * حالة أخرى؛ هنا يكفي: فارغة → القسم مخفي. الشبكة كسولة التحميل، والنقر يفتح
 * عارضاً بملء الشاشة بإغلاق وسابق/تالي.
 */
// ======================================================================
// ألبومات الأعراس — البحث والألبوم والصورة (ADR-0009)
// ======================================================================

function albumsPhotoBoxId(kind) {
  return `albums-${kind}`;
}

function albumsSafeImage(photo, thumb) {
  const value = thumb ? (photo.thumb_url || photo.image_url) : photo.image_url;
  return safeHttpUrl(value) ? value : '';
}

/**
 * هوية ألبوم بلا مناسبة (`event: null`): الخادم يرسله باسم العريس في
 * `honoree_name` وبلدته في `town`، بلا كائن مناسبة. الاسم من `honoree_name`
 * بأثر رجعي `person.name` (استجابة سبقت الحقل)، والبلدة من `town`. أيٌّ منهما
 * قد يغيب — فتعود القائمة فارغة ويُخفى السطر بدل رسمه فارغاً.
 */
function albumIdentityText(album) {
  const name = album.honoree_name || (album.person && album.person.name) || '';
  return [name, album.town].filter(Boolean).join(' · ');
}

/**
 * عدّاد الألبوم في المواضع الثلاثة (بطاقة القائمة، شريط ألبومات المناسبة، رأس
 * صفحة الألبوم) بقاعدة واحدة: الصور أولاً — «N صورة» كما كانت حرفياً — فإن لم
 * تكن فالفيديوهات «M فيديو»، وإلا «0 صورة». ألبوم الفيديو وحده صار ظاهراً
 * (ADR-0013، قرار المالك 2026-10-27)، فلا بطاقة تعدّ صفراً وهي تحمل فيديوهات.
 */
function albumMediaCountText(album) {
  const photoCount = Number(album.photo_count) || 0;
  if (photoCount > 0) return `${photoCount} صورة`;
  const videoCount = Number(album.video_count) || 0;
  if (videoCount > 0) return `${videoCount} فيديو`;
  return '0 صورة';
}

function albumCardHtml(album) {
  const cover = safeHttpUrl(album.cover_thumb_url || album.cover_url) ? (album.cover_thumb_url || album.cover_url) : '';
  const event = album.event || {};
  // ألبوم المناسبة يبقى حرفياً كما كان (عنوان المناسبة ثم بلدتها). ألبوم بلا
  // مناسبة يعرض اسم العريس وبلدته، وإن غابا معاً اختفى السطر كلّياً بدل
  // `<span>` فارغ يترك بياضاً على البطاقة.
  const identity = album.event ? '' : albumIdentityText(album);
  const subtitle = album.event
    ? `<span>${escapeHtml(event.title || '')}${event.town ? ` · ${escapeHtml(event.town)}` : ''}</span>`
    : identity ? `<span>${escapeHtml(identity)}</span>` : '';
  return `
    <button type="button" class="album-card" onclick="openAlbumDetail(${Number(album.id)})">
      <span class="album-card-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : '<i class="fa-solid fa-images" aria-hidden="true"></i>'}</span>
      <span class="album-card-body">
        <strong>${escapeHtml(album.title || 'ألبوم عرس')}</strong>
        ${subtitle}
        <small>${albumMediaCountText(album)}</small>
      </span>
    </button>
  `;
}

function albumPhotoCardHtml(photo, boxId, index) {
  const image = albumsSafeImage(photo, true);
  const tags = Array.isArray(photo.tags) ? photo.tags.map(tag => tag.name).filter(Boolean) : [];
  return `
    <button type="button" class="albums-photo-card" onclick="openArchiveViewer(${index}, '${boxId}')" aria-label="${escapeHtml(photo.caption || `صورة ${index + 1}`)}">
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(photo.caption || '')}" loading="lazy" decoding="async">` : '<span class="albums-photo-placeholder"><i class="fa-solid fa-image"></i></span>'}
      ${photo.caption ? `<span class="albums-photo-caption">${escapeHtml(photo.caption)}</span>` : ''}
      ${tags.length ? `<span class="albums-photo-tags">${tags.slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</span>` : ''}
    </button>
  `;
}

/**
 * فيديوهات الألبوم (T-11) — الفيديو يبقى على منصّته: البطاقة تعرض صورته
 * المصغّرة (`thumb_url` من GET /api/albums/:id، وإن غابت مربّعاً بأيقونة فيلم)،
 * و«فتح الفيديو» ينقل الزائر إلى المنصّة نفسها في تبويب جديد، و«مشاركة» يبقى
 * عندنا: صفحة `/v/:id` على الخادم هي ما يغلّفه ببطاقة «أعراسنا».
 */
const ALBUM_VIDEO_PROVIDER_LABELS = {
  youtube: 'يوتيوب',
  tiktok: 'تيك توك',
  facebook: 'فيسبوك',
  instagram: 'إنستغرام',
  website: 'الموقع'
};

function albumVideoProviderLabel(provider) {
  return ALBUM_VIDEO_PROVIDER_LABELS[String(provider || '').toLowerCase()] || 'فيديو';
}

function albumVideoCardHtml(video) {
  const thumb = safeHttpUrl(video.thumb_url);
  const external = safeHttpUrl(video.external_url);
  return `
    <article class="album-video-card">
      <div class="album-video-media">
        ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" decoding="async">` : '<span class="album-video-placeholder"><i class="fa-solid fa-film" aria-hidden="true"></i></span>'}
        <span class="album-video-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>
      </div>
      <div class="album-video-body">
        <strong>${escapeHtml(video.title || 'فيديو من الألبوم')}</strong>
        <span class="album-video-platform">${escapeHtml(albumVideoProviderLabel(video.provider))}</span>
        <div class="album-video-actions">
          ${external ? `<a class="album-video-open" href="${escapeHtml(external)}" target="_blank" rel="noopener noreferrer">فتح الفيديو</a>` : ''}
          <button type="button" class="album-video-share" data-video-id="${Number(video.id)}" onclick="shareVideoFromAlbum(this.dataset.videoId)">مشاركة</button>
        </div>
      </div>
    </article>
  `;
}

/**
 * مشاركة فيديو من الألبوم — رابط **صفحتنا** `/v/:id` لا رابط يوتيوب/تيك توك:
 * صفحة المشاركة على الخادم تحمل بطاقة OG بتغليف «أعراسنا»، فرابط المنصّة
 * نفسها يُسقط التغليف. والزرّ يمرّر معرّف الفيديو (وسم HTML نصّ) فتُقبل هنا
 * عرضاً كان أو معرّفاً.
 */
async function shareVideoFromAlbum(video) {
  const target = video && typeof video === 'object'
    ? video
    : albumsAlbumVideos.find(item => Number(item.id) === Number(video));
  if (!target || !target.id) return;
  recordAnalyticsEvent('share_clicked', {
    contentTown: (albumsCurrentAlbum && (albumsCurrentAlbum.town || (albumsCurrentAlbum.event && albumsCurrentAlbum.event.town))) || null
  });
  const title = target.title || 'فيديو من ألبوم العرس';
  await shareLink({
    title,
    line: title,
    url: `${shareOrigin()}/v/${target.id}`,
    copiedMessage: '📋 تم نسخ رابط الفيديو'
  });
}

function peopleCardHtml(person) {
  const image = safeHttpUrl(person.sample_thumb_url || person.sample_url) ? (person.sample_thumb_url || person.sample_url) : '';
  const counts = [];
  if (Number(person.photos_count)) counts.push(`${Number(person.photos_count)} صورة`);
  if (Number(person.albums_count)) counts.push(`${Number(person.albums_count)} مناسبة`);
  return `
    <button type="button" class="album-person-card" data-person-id="${Number(person.id)}" onclick="openPerson(this.dataset.personId)">
      <span class="album-person-avatar">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<i class="fa-solid fa-user"></i>'}</span>
      <strong>${escapeHtml(person.name || '')}</strong>
      <small>${escapeHtml(counts.join(' · ') || '—')}</small>
    </button>
  `;
}

/** صفحة الشخص داخل صفحة الألبومات: اسمه، مناسباته، ثم صوره (ADR-0011). */
function personPageHtml() {
  const person = albumsCurrentPerson;
  const photos = albumsPersonPhotos;
  const albums = albumsPersonAlbums;
  if (!photos.length && !albums.length) {
    return albumsEmptyHtml('fa-user-slash', 'لا شيء ظاهر لهذا الشخص بعد');
  }
  archivePhotosByBox.albumPerson = photos;
  const count = Number(person.photos_count) || photos.length;
  return `
    <div class="album-person-head">
      <strong>${escapeHtml(person.name || '')}</strong>
      <small>${count} صورة${Number(person.albums_count) ? ` · ${Number(person.albums_count)} مناسبة` : ''}</small>
    </div>
    ${albums.length ? `<div class="albums-grid">${albums.map(albumCardHtml).join('')}</div>` : ''}
    ${photos.length ? `<div class="albums-photo-grid">${photos.map((photo, index) => albumPhotoCardHtml(photo, 'albumPerson', index)).join('')}</div>` : ''}
    ${albumsPersonPagination && albumsPersonPagination.hasMore
      ? '<button type="button" class="albums-load-more" onclick="loadMorePersonPhotos()">عرض المزيد من الصور</button>'
      : ''}
  `;
}

function albumsEmptyHtml(icon, text) {
  return `<div class="albums-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><p>${escapeHtml(text)}</p></div>`;
}

function isAlbumsPageOpen() {
  const page = document.getElementById('albumsPage');
  return Boolean(page && !page.hidden);
}

function openAlbumsPage({ skipHash = false } = {}) {
  const page = document.getElementById('albumsPage');
  if (!page) return;
  if (!skipHash && window.location.hash !== '#albums') {
    window.history.pushState({ albums: true }, '', '#albums');
  }
  page.hidden = false;
  document.body.classList.add('albums-page-open');
  document.getElementById('albumsBrowserView').hidden = false;
  document.getElementById('albumDetailView').hidden = true;
  albumsTab = 'albums';
  document.querySelectorAll('.albums-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.albumsTab === 'albums');
  });
  albumsCurrentAlbum = null;
  albumsMyPhotosMode = false;
  albumsCurrentPerson = null;
  albumsPersonPhotos = [];
  if (!albumsList.length && !albumsSearchQuery) loadAlbumsList(1);
  else renderAlbumsResults();
}

function closeAlbumsPage({ skipHash = false } = {}) {
  const page = document.getElementById('albumsPage');
  if (!page) return;
  page.hidden = true;
  document.body.classList.remove('albums-page-open');
  closeArchiveViewer();
  if (!skipHash && /^#(albums|album|photo)/.test(window.location.hash)) {
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }
}

async function loadAlbumsList(page = 1) {
  const results = document.getElementById('albumsResults');
  if (!results) return;
  if (page === 1) {
    results.innerHTML = '<div class="albums-loading"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل الألبومات...</div>';
  }
  try {
    const res = await apiFetch(`/api/albums?page=${page}&limit=12`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'تعذّر تحميل الألبومات');
    if (page === 1) albumsList = [];
    albumsList = albumsList.concat(Array.isArray(data.albums) ? data.albums : []);
    albumsPagination = data.pagination || null;
    renderAlbumsResults();
  } catch (error) {
    results.innerHTML = albumsEmptyHtml('fa-triangle-exclamation', error.message || 'تعذّر تحميل الألبومات');
  }
}

function handleAlbumsSearch() {
  const input = document.getElementById('albumsSearchInput');
  const clear = document.getElementById('albumsClearSearchBtn');
  if (clear) clear.style.display = input && input.value.trim() ? 'inline-flex' : 'none';
  clearTimeout(albumsSearchTimer);
  albumsSearchTimer = setTimeout(() => {
    albumsSearchQuery = (input && input.value.trim()) || '';
    albumsCurrentPerson = null;
    albumsPersonPhotos = [];
    albumsPersonAlbums = [];
    albumsPersonPagination = null;
    albumsMyPhotosMode = false;
    if (albumsSearchQuery) runAlbumsSearch();
    else {
      albumsSearchResults = { albums: [], photos: [], people: [] };
      loadAlbumsList(1);
    }
  }, 320);
}

async function runAlbumsSearch() {
  const results = document.getElementById('albumsResults');
  if (!results) return;
  results.innerHTML = '<div class="albums-loading"><i class="fa-solid fa-spinner fa-spin"></i> جاري البحث...</div>';
  try {
    const res = await apiFetch(`/api/search?q=${encodeURIComponent(albumsSearchQuery)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'تعذّر البحث');
    albumsSearchResults = {
      albums: Array.isArray(data.albums) ? data.albums : [],
      photos: Array.isArray(data.photos) ? data.photos : [],
      people: Array.isArray(data.people) ? data.people : []
    };
    renderAlbumsResults();
  } catch (error) {
    results.innerHTML = albumsEmptyHtml('fa-triangle-exclamation', error.message || 'تعذّر البحث');
  }
}

function clearAlbumsSearch() {
  albumsSearchQuery = '';
  albumsSearchResults = { albums: [], photos: [], people: [] };
  albumsCurrentPerson = null;
  albumsPersonPhotos = [];
  albumsPersonAlbums = [];
  albumsPersonPagination = null;
  albumsMyPhotosMode = false;
  const input = document.getElementById('albumsSearchInput');
  if (input) input.value = '';
  const clear = document.getElementById('albumsClearSearchBtn');
  if (clear) clear.style.display = 'none';
  loadAlbumsList(1);
}

function setAlbumsTab(tab) {
  if (!['albums', 'photos', 'people'].includes(tab)) return;
  albumsTab = tab;
  document.querySelectorAll('.albums-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.albumsTab === tab);
  });
  renderAlbumsResults();
}

function albumsSummaryText() {
  if (albumsMyPhotosMode) return 'صور وُسمت فيها بموافقة الإدارة';
  if (albumsCurrentPerson) return `صور ${albumsCurrentPerson.name || ''}`;
  if (!albumsSearchQuery) return '';
  const counts = [
    `${albumsSearchResults.albums.length} ألبوم`,
    `${albumsSearchResults.photos.length} صورة`,
    `${albumsSearchResults.people.length} شخص`
  ];
  return `نتائج «${albumsSearchQuery}» — ${counts.join(' · ')}`;
}

function renderAlbumsResults() {
  const results = document.getElementById('albumsResults');
  if (!results) return;
  const summary = document.getElementById('albumsSearchSummary');
  const summaryText = albumsSummaryText();
  if (summary) {
    summary.textContent = summaryText;
    summary.hidden = !summaryText;
  }

  const loadMore = document.getElementById('albumsLoadMoreBtn');
  if (loadMore) {
    const canMore = albumsTab === 'albums'
      && !albumsSearchQuery
      && albumsPagination
      && albumsPagination.page < albumsPagination.totalPages;
    loadMore.hidden = !canMore;
  }

  if (albumsTab === 'albums') {
    const albums = albumsSearchQuery ? albumsSearchResults.albums : albumsList;
    results.innerHTML = albums.length
      ? `<div class="albums-grid">${albums.map(albumCardHtml).join('')}</div>`
      : albumsEmptyHtml('fa-images', albumsSearchQuery ? 'لا ألبومات تطابق بحثك' : 'لا توجد ألبومات ظاهرة بعد');
    return;
  }

  if (albumsTab === 'photos') {
    let photos = [];
    let boxId = albumsPhotoBoxId('search');
    if (albumsMyPhotosMode) {
      photos = albumsMyPhotosPhotos;
      boxId = albumsPhotoBoxId('mine');
    } else if (albumsCurrentPerson) {
      photos = albumsPersonPhotos;
      boxId = albumsPhotoBoxId('person');
    } else if (albumsSearchQuery) {
      photos = albumsSearchResults.photos;
      boxId = albumsPhotoBoxId('search');
    } else {
      results.innerHTML = albumsEmptyHtml('fa-magnifying-glass', 'ابحث باسم العريس أو العشيرة أو اسم شخص لتظهر الصور');
      return;
    }
    archivePhotosByBox[boxId] = photos;
    results.innerHTML = photos.length
      ? `<div class="albums-photo-grid">${photos.map((photo, index) => albumPhotoCardHtml(photo, boxId, index)).join('')}</div>`
      : albumsEmptyHtml('fa-image', 'لا صور تطابق بحثك');
    return;
  }

  const people = albumsSearchQuery ? albumsSearchResults.people : [];
  // شخصٌ مفتوح يغلب قائمة البحث: صفحته هي ما يراه المستخدم حتى يكتب اسماً آخر.
  if (albumsCurrentPerson && albumsCurrentPerson.id) {
    results.innerHTML = personPageHtml();
    return;
  }
  results.innerHTML = people.length
    ? `<div class="albums-people-grid">${people.map(peopleCardHtml).join('')}</div>`
    : albumsEmptyHtml('fa-users', albumsSearchQuery ? 'لا أشخاص يطابقون بحثك' : 'ابحث باسم شخص لترى صوره');
}

async function loadMoreAlbums() {
  if (!albumsPagination || albumsPagination.page >= albumsPagination.totalPages) return;
  await loadAlbumsList(albumsPagination.page + 1);
}

async function openAlbumDetail(albumId, { skipHash = false } = {}) {
  const id = Number(albumId);
  if (!id) return;
  if (!skipHash) window.history.pushState({ album: id }, '', `#album/${id}`);
  document.getElementById('albumsBrowserView').hidden = true;
  document.getElementById('albumDetailView').hidden = false;
  document.getElementById('albumDetailHeader').innerHTML = '<div class="albums-loading"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل الألبوم...</div>';
  document.getElementById('albumDetailGrid').innerHTML = '';
  // فيديوهات الألبوم تُفرَّغ مع الرأس: ألبومٌ فشل تحميله كان سيورث فيديوهات
  // الألبوم السابق تحت عنوانه الجديد (T-11).
  albumsAlbumVideos = [];
  const videosBox = document.getElementById('albumDetailVideos');
  if (videosBox) {
    videosBox.hidden = true;
    videosBox.innerHTML = '';
  }
  try {
    const res = await apiFetch(`/api/albums/${id}?page=1&limit=24`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'تعذّر تحميل الألبوم');
    albumsCurrentAlbum = data.album;
    albumsAlbumPhotos = Array.isArray(data.photos) ? data.photos : [];
    albumsAlbumVideos = Array.isArray(data.videos) ? data.videos : [];
    albumsAlbumPagination = data.pagination || null;
    renderAlbumDetail();
  } catch (error) {
    document.getElementById('albumDetailHeader').innerHTML = albumsEmptyHtml('fa-triangle-exclamation', error.message || 'تعذّر تحميل الألبوم');
  }
}

function renderAlbumDetail() {
  const album = albumsCurrentAlbum;
  if (!album) return;
  const event = album.event || {};
  // رأس ألبوم المناسبة كما كان: عنوانها وبلدتها وتاريخها. ألبوم بلا مناسبة
  // (`event: null`) بلا تاريخ أصلاً، فسطره من الاسم والبلدة وحدهما — ويختفي
  // السطر كلّياً إن غابا، فلا سطر فارغ ولا «—» معلّقة.
  const identity = album.event ? '' : albumIdentityText(album);
  const subtitle = album.event
    ? `<p>${escapeHtml(event.title || '')}${event.town ? ` · ${escapeHtml(event.town)}` : ''}${event.event_date ? ` · ${escapeHtml(event.event_date)}` : ''}</p>`
    : identity ? `<p>${escapeHtml(identity)}</p>` : '';
  document.getElementById('albumDetailHeader').innerHTML = `
    <div class="album-detail-card">
      <span class="album-detail-cover">${album.cover_url ? `<img src="${escapeHtml(album.cover_url)}" alt="">` : '<i class="fa-solid fa-images"></i>'}</span>
      <div>
        <h2>${escapeHtml(album.title || 'ألبوم عرس')}</h2>
        ${subtitle}
        <span class="album-detail-count">${albumMediaCountText(album)}</span>
        <button type="button" class="album-share-btn" onclick="shareAlbum(${Number(album.id)})">
          <i class="fa-solid fa-share-nodes" aria-hidden="true"></i> مشاركة
        </button>
      </div>
    </div>
  `;
  const grid = document.getElementById('albumDetailGrid');
  if (!albumsAlbumPhotos.length) {
    grid.innerHTML = albumsEmptyHtml('fa-image', 'هذا الألبوم بلا صور ظاهرة');
  } else {
    archivePhotosByBox.albumDetail = albumsAlbumPhotos;
    grid.innerHTML = albumsAlbumPhotos.map((photo, index) => albumPhotoCardHtml(photo, 'albumDetail', index)).join('');
  }
  // فيديوهات الألبوم (T-11) — قسم مستقلّ تحت الصور: بطاقة لكل فيديو معتمد،
  // والقسم كلّه مخفي حين لا فيديوهات، فلا فراغ ولا عنوان لقسم فارغ.
  const videosBox = document.getElementById('albumDetailVideos');
  if (videosBox) {
    videosBox.hidden = !albumsAlbumVideos.length;
    videosBox.innerHTML = albumsAlbumVideos.map(albumVideoCardHtml).join('');
  }
  const more = document.getElementById('albumDetailMoreBtn');
  if (more) {
    more.hidden = !(albumsAlbumPagination && albumsAlbumPagination.page < albumsAlbumPagination.totalPages);
  }
}

async function loadMoreAlbumPhotos() {
  if (!albumsCurrentAlbum || !albumsAlbumPagination) return;
  if (albumsAlbumPagination.page >= albumsAlbumPagination.totalPages) return;
  const next = albumsAlbumPagination.page + 1;
  try {
    const res = await apiFetch(`/api/albums/${albumsCurrentAlbum.id}?page=${next}&limit=24`);
    const data = await res.json();
    if (!data.success) return;
    albumsAlbumPhotos = albumsAlbumPhotos.concat(Array.isArray(data.photos) ? data.photos : []);
    albumsAlbumPagination = data.pagination || albumsAlbumPagination;
    renderAlbumDetail();
  } catch (e) {
    // الصفحة التالية فشلت — تبقى المعروضة، ولا نمسحها.
  }
}

/**
 * مشاركة الألبوم (تذكرة #100) — الرابط من الخادم (`share_url`)، وهو صفحة
 * `/a/:id` المصيَّرة، لا `#album/:id`: ما بعد `#` لا يصل إلى زاحف واتساب، فيصل
 * الرابط بلا صورة. وإن غاب `share_url` (خادم لم يُحدَّث بعد) نسقط إلى الرابط
 * الداخلي بدل أن يرمي الزرّ — لا تنكسر الصفحة بين نشرَين.
 */
async function shareAlbum(albumId) {
  const album = albumsCurrentAlbum;
  if (!album || Number(album.id) !== Number(albumId)) return;
  // ألبوم العريس (2026-10) يصل بـ`event: null` عمداً، وبلدته على الألبوم نفسه —
  // فقراءة بلدة المناسبة وحدها كانت تُسقط البلدة من نصّ المشاركة وتتبّعها معاً.
  const town = album.event ? album.event.town : album.town;
  // `shareOrigin()` is the API origin (`API_BASE || location.origin`), and a
  // `#album/…` link is a page of the static web app, not of the JSON server —
  // in the split deploy `web/config.js` supports, pointing it at the API origin
  // would land on a server that has no such page. The fallback therefore uses
  // the web page's own origin, exactly like `closeAlbumsPage` builds its path.
  const url = safeHttpUrl(album.share_url)
    || `${window.location.origin}${window.location.pathname}${window.location.search}#album/${album.id}`;
  recordAnalyticsEvent('share_clicked', { contentTown: town });
  await shareLink({
    title: album.title || 'ألبوم عرس',
    line: [album.title, town].filter(Boolean).join(' — '),
    url,
    copiedMessage: '📋 تم نسخ رابط الألبوم'
  });
}

function closeAlbumDetail() {
  document.getElementById('albumDetailView').hidden = true;
  document.getElementById('albumsBrowserView').hidden = false;
  if (window.location.hash.startsWith('#album/')) {
    window.history.replaceState({}, '', '#albums');
  }
  renderAlbumsResults();
}

/**
 * صفحة الشخص (ADR-0011، تذكرة #105) — تُقرأ من `/api/people/:id` لا من شبكة
 * صور باسم: الخادم وحده يعرف من ظاهر، ويعيد صوره ومناسباته معاً. ولكل صفحة
 * عنوانها `#person/<id>` كي يعمل زرّ الرجوع ويصلح الرابط للمشاركة.
 */
async function openPerson(personId, { page = 1, append = false, skipHash = false } = {}) {
  const id = Number(personId);
  if (!id) return;
  if (!append) {
    albumsCurrentPerson = { id, name: '' };
    albumsPersonPhotos = [];
    albumsPersonAlbums = [];
    albumsPersonPagination = null;
    albumsMyPhotosMode = false;
    albumsSearchQuery = '';
    const input = document.getElementById('albumsSearchInput');
    if (input) input.value = '';
    const clear = document.getElementById('albumsClearSearchBtn');
    if (clear) clear.style.display = 'none';
  }
  if (!skipHash) window.history.pushState({ person: id }, '', `#person/${id}`);
  albumsTab = 'people';
  document.querySelectorAll('.albums-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.albumsTab === 'people');
  });
  const results = document.getElementById('albumsResults');
  if (!append) {
    results.innerHTML = '<div class="albums-loading"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل الشخص...</div>';
  }
  try {
    const res = await apiFetch(`/api/people/${id}?page=${page}&limit=48`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'تعذّر تحميل الشخص');
    albumsCurrentPerson = {
      id,
      name: data.person.name,
      photos_count: Number(data.person.photos_count) || 0,
      albums_count: Number(data.person.albums_count) || 0
    };
    const incoming = Array.isArray(data.person.photos) ? data.person.photos : [];
    albumsPersonPhotos = append ? albumsPersonPhotos.concat(incoming) : incoming;
    albumsPersonAlbums = Array.isArray(data.person.albums) ? data.person.albums : [];
    albumsPersonPagination = data.person.pagination || null;
    renderAlbumsResults();
  } catch (error) {
    results.innerHTML = albumsEmptyHtml('fa-triangle-exclamation', error.message || 'تعذّر تحميل الشخص');
  }
}

/** «عرض المزيد» في صفحة الشخص — الصفحة التالية تُلحق ولا تستبدل. */
async function loadMorePersonPhotos() {
  const person = albumsCurrentPerson;
  const pagination = albumsPersonPagination;
  if (!person || !person.id || !pagination || !pagination.hasMore) return;
  await openPerson(person.id, { page: pagination.page + 1, append: true, skipHash: true });
}

async function openMyPhotos() {
  if (!requireAuth({ type: 'photos' })) return;
  albumsMyPhotosMode = true;
  albumsCurrentPerson = null;
  albumsSearchQuery = '';
  const input = document.getElementById('albumsSearchInput');
  if (input) input.value = '';
  albumsTab = 'photos';
  document.querySelectorAll('.albums-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.albumsTab === 'photos');
  });
  const results = document.getElementById('albumsResults');
  results.innerHTML = '<div class="albums-loading"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل صورك...</div>';
  try {
    const res = await apiFetch('/api/my-photos?limit=48', { auth: true });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'تعذّر تحميل صورك');
    albumsMyPhotosPhotos = Array.isArray(data.photos) ? data.photos : [];
    albumsMyPhotosPagination = data.pagination || null;
    renderAlbumsResults();
  } catch (error) {
    results.innerHTML = albumsEmptyHtml('fa-triangle-exclamation', error.message || 'تعذّر تحميل صورك');
  }
}

function currentArchivePhoto() {
  return archiveViewerPhotos[archiveViewerIndex] || null;
}

/**
 * مشاركة الصورة (تذكرة #102) — رابطها صفحة `/p/:id` على الخادم، لا `#photo/:id`:
 * صفحة الصورة (ADR-0009) هي ما يحمل الصورة نفسها في معاينة واتساب. وكانت هنا
 * وصلة `<a>` اسمها «صفحة الصورة» — فعلُ معاينة لا فعلُ مشاركة؛ صارت زرّاً يمرّ
 * بنفس `shareLink` الذي تمرّ به المناسبة والحلقة، فتُفتح ورقة النظام على الهاتف
 * وورقتنا على الحاسوب.
 */
async function shareCurrentPhoto() {
  const photo = currentArchivePhoto();
  if (!photo || !photo.id) return;
  // `archive_photos` (the event page's own strip) carries no `event` object,
  // so the town comes from the open event when the photo itself has none —
  // otherwise those shares would be counted with no town at all.
  const town = (photo.event && photo.event.town) || (currentChatEvent && currentChatEvent.town);
  recordAnalyticsEvent('share_clicked', { contentTown: town });
  await shareLink({
    title: photo.caption || 'صورة من ألبوم العرس',
    line: photo.caption || '',
    url: `${shareOrigin()}/p/${photo.id}`,
    copiedMessage: '📋 تم نسخ رابط الصورة'
  });
}

function updateArchiveViewerFooter(photo) {
  const footer = document.getElementById('archiveViewerFooter');
  if (!footer) return;
  if (!photo || !photo.id) {
    footer.hidden = true;
    return;
  }
  footer.hidden = false;
  const caption = document.getElementById('archiveViewerCaption');
  if (caption) {
    caption.textContent = photo.caption || '';
    caption.hidden = !photo.caption;
  }
  const tagsBox = document.getElementById('archiveViewerTags');
  if (tagsBox) {
    const names = Array.isArray(photo.tags) ? photo.tags.map(tag => tag.name).filter(Boolean) : [];
    tagsBox.innerHTML = names.map(name => `<span>${escapeHtml(name)}</span>`).join('');
    tagsBox.hidden = !names.length;
  }
  const tagBtn = document.getElementById('archiveViewerTagBtn');
  if (tagBtn) {
    tagBtn.disabled = false;
    tagBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> أنا في الصورة';
  }
  const withdraw = document.getElementById('archiveViewerWithdrawBtn');
  if (withdraw) withdraw.hidden = !authToken;
}

/**
 * «أنا في الصورة» لم تعد ترسل شيئاً: تفتح ورقة تشرح ما يفعله الوسم وتذكّر
 * بشرطَي T-06 (صورة شخصية مرفوعة، ورقم يخصّ صاحبه). الجلسة تُحدَّث أولاً كي
 * تكون `avatar_url` و`phone_number` في `currentUser` أحدث ما يعرفه الخادم.
 */
async function requestPhotoTag() {
  const photo = currentArchivePhoto();
  if (!photo || !photo.id) return;
  if (!requireAuth({ type: 'photos' })) return;
  await refreshSessionFromServer();
  // خرج المستخدم أو انتهت جلسته أثناء التحديث — لا ورقة لحساب لم يعد موجوداً.
  if (!currentUser) { closePhotoTagSheet(); return; }
  openPhotoTagSheet();
}

/** يملأ صفّي الشرط في ورقة الوسم من `currentUser` ويضبط زرّ الإرسال. */
function renderPhotoTagSheetState() {
  const user = currentUser || {};
  const hasAvatar = !!user.avatar_url;
  const avatarState = document.getElementById('photoTagAvatarState');
  if (avatarState) {
    avatarState.textContent = hasAvatar
      ? '✅ صورتك الشخصية مرفوعة'
      : '⚠️ لازم ترفع صورتك الشخصية أولاً';
    avatarState.classList.toggle('is-ok', hasAvatar);
  }
  const uploadBtn = document.getElementById('photoTagUploadAvatarBtn');
  if (uploadBtn) uploadBtn.hidden = hasAvatar;
  const phoneState = document.getElementById('photoTagPhoneState');
  if (phoneState) phoneState.textContent = `رقمك الشخصي: ${user.phone_number || '—'}`;
  updatePhotoTagSubmitState();
}

/** الإرسال لا يُتاح إلا بصورة شخصية مرفوعة ورقم مؤكَّد — نفس شرطَي الخادم. */
function updatePhotoTagSubmitState() {
  const submitBtn = document.getElementById('photoTagSubmitBtn');
  if (!submitBtn) return;
  const confirm = document.getElementById('photoTagConfirmPhone');
  const confirmed = !!(confirm && confirm.checked);
  const hasAvatar = !!(currentUser && currentUser.avatar_url);
  submitBtn.disabled = !(confirmed && hasAvatar);
}

function showPhotoTagError(message) {
  const errorBox = document.getElementById('photoTagError');
  if (!errorBox) return;
  errorBox.textContent = message || '';
  errorBox.hidden = !message;
}

function openPhotoTagSheet() {
  const sheet = document.getElementById('photoTagSheet');
  if (!sheet) return;
  const selfDescription = document.getElementById('photoTagSelfDescription');
  const captionSuggestion = document.getElementById('photoTagCaptionSuggestion');
  if (selfDescription) selfDescription.value = '';
  if (captionSuggestion) captionSuggestion.value = '';
  const confirm = document.getElementById('photoTagConfirmPhone');
  if (confirm) confirm.checked = false;
  showPhotoTagError('');
  renderPhotoTagSheetState();
  sheet.hidden = false;
}

function closePhotoTagSheet() {
  const sheet = document.getElementById('photoTagSheet');
  if (sheet) sheet.hidden = true;
}

/** «ارفع صورتك الآن» — تخرج من العارض إلى حسابك وتفتح منتقي الصورة نفسه. */
function goToPhotoTagAvatarUpload() {
  closePhotoTagSheet();
  switchTab('tabAccount');
  const input = document.getElementById('accountAvatarInput');
  if (input) input.click();
}

/** «عدّل رقمي» — تخرج إلى الحساب وتفتح نموذج تعديل الرقم القائم (T-04). */
function goToPhotoTagPhoneEdit() {
  closePhotoTagSheet();
  switchTab('tabAccount');
  toggleAccountPhoneForm(true);
}

/**
 * إرسال طلب الوسم من الورقة. الحقول الفارغة تُرسل `''` — والخادم يخزّنها NULL.
 * 400/409 رسالته عربية وموضعها سطر الخطأ داخل الورقة (تبقى مفتوحة كي يصحّح
 * المستخدم ما ينقصه)؛ النجاح وحده يغلقها ويحوّل الزرّ إلى «طلبك معلّق».
 */
async function submitPhotoTag() {
  const photo = currentArchivePhoto();
  if (!photo || !photo.id) return;
  const submitBtn = document.getElementById('photoTagSubmitBtn');
  const selfDescription = document.getElementById('photoTagSelfDescription');
  const captionSuggestion = document.getElementById('photoTagCaptionSuggestion');
  showPhotoTagError('');
  try {
    if (submitBtn) submitBtn.disabled = true;
    const res = await apiFetch(`/api/photos/${photo.id}/tags`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        self_description: ((selfDescription && selfDescription.value) || '').trim(),
        caption_suggestion: ((captionSuggestion && captionSuggestion.value) || '').trim(),
        confirm_phone: true
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'تعذّر إرسال طلب الوسم');
    closePhotoTagSheet();
    const tagBtn = document.getElementById('archiveViewerTagBtn');
    if (tagBtn) {
      tagBtn.disabled = true;
      tagBtn.innerHTML = '<i class="fa-solid fa-clock"></i> طلبك معلّق';
    }
    showToast(data.message || 'تم إرسال طلبك — يظهر اسمك بعد موافقة الإدارة');
  } catch (error) {
    showPhotoTagError(error.message || 'تعذّر إرسال طلب الوسم');
  } finally {
    updatePhotoTagSubmitState();
  }
}

async function withdrawPhotoTag() {
  const photo = currentArchivePhoto();
  if (!photo || !photo.id) return;
  if (!requireAuth({ type: 'photos' })) return;
  try {
    const res = await apiFetch(`/api/photos/${photo.id}/tags/me`, { method: 'DELETE', auth: true });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'لا يوجد وسم لك على هذه الصورة');
    showToast(data.message || 'تم سحب وسمك');
    updateArchiveViewerFooter(photo);
  } catch (error) {
    showToast(error.message || 'لا يوجد وسم لك على هذه الصورة');
  }
}

async function reportCurrentPhoto() {
  const photo = currentArchivePhoto();
  if (!photo || !photo.id) return;
  if (!requireAuth({ type: 'report' })) return;
  if (!confirm('إبلاغ عن هذه الصورة لمراجعة الإزالة؟')) return;
  try {
    const res = await apiFetch(`/api/photos/${photo.id}/reports`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'privacy' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'تعذّر إرسال البلاغ');
    showToast(data.message || 'تم استلام بلاغك — ستراجعه الإدارة');
  } catch (error) {
    showToast(error.message || 'تعذّر إرسال البلاغ');
  }
}

function handleAlbumsHashChange() {
  const hash = window.location.hash;
  if (hash === '#albums') {
    openAlbumsPage({ skipHash: true });
    return;
  }
  if (hash.startsWith('#album/')) {
    const id = Number(hash.slice('#album/'.length));
    if (id) {
      openAlbumsPage({ skipHash: true });
      openAlbumDetail(id, { skipHash: true });
    }
    return;
  }
  if (hash.startsWith('#photo/')) {
    const id = Number(hash.slice('#photo/'.length));
    if (!id) return;
    openAlbumsPage({ skipHash: true });
    apiFetch(`/api/photos/${id}`).then(res => res.json()).then(data => {
      if (!data.success || !data.photo) return;
      archivePhotosByBox.photoDeepLink = [data.photo];
      openArchiveViewer(0, 'photoDeepLink');
    }).catch(() => {});
    return;
  }
  if (hash.startsWith('#person/')) {
    const id = Number(hash.slice('#person/'.length));
    if (!id) return;
    openAlbumsPage({ skipHash: true });
    setAlbumsTab('people');
    openPerson(id, { skipHash: true });
    return;
  }
  if (!hash && isAlbumsPageOpen()) closeAlbumsPage({ skipHash: true });
}

function renderEventAlbumsHtml(evt) {
  const albums = Array.isArray(evt && evt.albums) ? evt.albums : [];
  if (!albums.length) return '';
  return `
    <section class="event-albums-strip">
      <div class="event-albums-head">
        <h4><i class="fa-solid fa-images" aria-hidden="true"></i> ألبومات العرس <span>${albums.length}</span></h4>
        <button type="button" class="event-albums-all" onclick="openAlbumsForEvent(eventPageEvent)">كل الألبومات</button>
      </div>
      <div class="event-albums-row">
        ${albums.map(album => {
          const cover = safeHttpUrl(album.cover_thumb_url || album.cover_url)
            ? (album.cover_thumb_url || album.cover_url)
            : '';
          return `
            <button type="button" class="event-album-card" onclick="openAlbumFromEvent(${Number(album.id)})">
              <span class="event-album-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy">` : '<i class="fa-solid fa-images" aria-hidden="true"></i>'}</span>
              <strong>${escapeHtml(album.title || 'ألبوم')}</strong>
              <small>${albumMediaCountText(album)}</small>
            </button>`;
        }).join('')}
      </div>
    </section>
  `;
}

function openAlbumsForEvent(evt) {
  openAlbumsPage();
  const term = (evt && (evt.title || evt.groom_name)) || '';
  const input = document.getElementById('albumsSearchInput');
  if (input) input.value = term;
  if (term) handleAlbumsSearch();
}

function openAlbumFromEvent(albumId) {
  openAlbumsPage();
  openAlbumDetail(albumId);
}

function openMyPhotosFromAccount() {
  openAlbumsPage();
  openMyPhotos();
}

function renderEventArchive(evt, boxId = 'chatArchive') {
  const box = document.getElementById(boxId);
  if (!box) return;
  const photos = (evt && Array.isArray(evt.archive_photos) ? evt.archive_photos : [])
    .filter(photo => photo && safeHttpUrl(photo.image_url));
  archiveViewerPhotos = photos;
  // غرفة التبريكات وصفحة المناسبة قد تكونان مفتوحتين معاً — لكلّ صندوق صوره.
  archivePhotosByBox[boxId] = photos;
  if (!photos.length) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  box.innerHTML = `
    <h4 class="event-archive-title">
      <i class="fa-solid fa-images" aria-hidden="true"></i> أرشيف العرس
      <span class="event-archive-count">${photos.length}</span>
    </h4>
    <div class="event-archive-grid">
      ${photos.map((photo, index) => {
        const image = safeHttpUrl(photo.thumb_url) ? photo.thumb_url : photo.image_url;
        return `
        <button type="button" class="event-archive-thumb" onclick="openArchiveViewer(${index}, '${boxId}')" aria-label="${escapeHtml(photo.caption || `عرض الصورة ${index + 1}`)}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(photo.caption || '')}" loading="lazy" decoding="async">
        </button>`;
      }).join('')}
    </div>
  `;
  box.hidden = false;
}

function openArchiveViewer(index, boxId) {
  if (boxId && archivePhotosByBox[boxId]) archiveViewerPhotos = archivePhotosByBox[boxId];
  if (!archiveViewerPhotos.length) return;
  const viewer = document.getElementById('archiveViewer');
  if (!viewer) return;
  archiveViewerIndex = Math.max(0, Math.min(archiveViewerPhotos.length - 1, Number(index) || 0));
  viewer.hidden = false;
  document.addEventListener('keydown', handleArchiveViewerKeydown);
  showArchiveViewerPhoto();
}

/** نفس مفاتيح عارض الستوري: Escape يغلق، والسهمان بترتيب القراءة من اليمين. */
function handleArchiveViewerKeydown(e) {
  if (e.key === 'Escape') { closeArchiveViewer(); return; }
  if (e.key === 'ArrowRight') archiveViewerStep(-1);
  else if (e.key === 'ArrowLeft') archiveViewerStep(1);
}

function closeArchiveViewer() {
  const viewer = document.getElementById('archiveViewer');
  if (!viewer || viewer.hidden) return;
  viewer.hidden = true;
  document.removeEventListener('keydown', handleArchiveViewerKeydown);
  const img = document.getElementById('archiveViewerImage');
  if (img) img.removeAttribute('src');
  if (window.location.hash.startsWith('#photo/') && isAlbumsPageOpen()) {
    window.history.replaceState({}, '', '#albums');
  }
}

/** ‏+1 التالية، ‎-1 السابقة — تدور من الأخيرة إلى الأولى وبالعكس. */
function archiveViewerStep(delta) {
  const total = archiveViewerPhotos.length;
  if (!total) return;
  archiveViewerIndex = (archiveViewerIndex + delta + total) % total;
  showArchiveViewerPhoto();
}

function showArchiveViewerPhoto() {
  const photo = archiveViewerPhotos[archiveViewerIndex];
  const img = document.getElementById('archiveViewerImage');
  const counter = document.getElementById('archiveViewerCounter');
  if (!photo || !img) return;
  img.src = photo.image_url;
  img.alt = photo.caption || 'صورة من ألبوم العرس';
  if (counter) counter.textContent = `${archiveViewerIndex + 1} / ${archiveViewerPhotos.length}`;
  const single = archiveViewerPhotos.length < 2;
  document.querySelectorAll('#archiveViewer .archive-viewer-nav').forEach(btn => { btn.hidden = single; });
  updateArchiveViewerFooter(photo);
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
  closeArchiveViewer();
  currentChatEventId = null;
  currentChatEvent = null;
  // غرفة فُتحت من صفحة المناسبة — تبريكة جديدة تظهر في قائمتها بعد الإغلاق.
  refreshEventPage();
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
  // Trailing slashes are stripped here, once: every caller concatenates
  // `${shareOrigin()}/…`, and a base ending in `/` would produce `//e/1`.
  return (API_BASE || window.location.origin).replace(/\/+$/, '');
}

/**
 * سطر قصير باسم المناسبة وبلدتها ثم رابط صفحة المشاركة على الخادم
 * (`GET /e/:id`، share.routes.js) — بلا «حمّل التطبيق»: تلك الصفحة نفسها تحمل
 * زرّ التحميل، وتكراره هنا يحوّل دعوة إلى إعلان (تذكرة #44).
 *
 * صحيفة المشاركة على الموبايل، ونافذتنا (واتساب/فيسبوك/نسخ/إلغاء) على الكمبيوتر
 * أو حين لا مشاركة في المتصفّح — والزرّ لا يفشل بصمت في أي مسار: إلغاء المستخدم
 * لورقة المشاركة (AbortError) وحده يُعامَل كلا شيء، لا كخطأ (shareLink أدناه).
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

/**
 * «نزّل الصورة» في صفحة المناسبة (تذكرة #182) — الصورة التي رسمها الخادم على
 * `GET /e/:id/download.png`: صورة المناسبة كما هي، وتحتها شريط «أعراسنا»
 * (العلامة، «امسح الرمز وافتح المناسبة»، ورمز QR لصفحة المناسبة).
 *
 * الرابط من `api.js`/`config.js` وحده (`apiUrl` تُبنى من `API_BASE`) ولا `fetch`
 * هنا إطلاقاً: المتصفّح يتولّى التنزيل من ترويسة `Content-Disposition` التي
 * يرسلها الخادم، فالملفّ لا يُحمَّل إلى ذاكرة الصفحة ولا يُعاد بناؤه فيها.
 *
 * و`try/catch` ليس تجميلاً: منع المتصفّح/الوكيل إنشاء رابط تنزيل يرمي هنا،
 * وبدون التقاطه يصعد الخطأ فيُقرأ الزرّ ميتاً. بدله توست عربي — **الزرّ لا
 * يفشل بصمت**، نفس قاعدة زرّ المشاركة أعلاه، والصفحة تبقى كما هي.
 */
function downloadEventImage(eventId) {
  try {
    const id = Number(eventId);
    const link = document.createElement('a');
    link.href = apiUrl(`/e/${id}/download.png`);
    // الاسم الاحتياطي حين يتجاهل المتصفّح `download` (أصل مختلف): الاسم العربي
    // نفسه يأتي في `filename*` من الخادم، وهذا لا يُغيَّر.
    link.download = `أعراسنا-مناسبة-${id}.png`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (e) {
    showToast('تعذّر تنزيل الصورة — حاول مرة أخرى');
  }
}

/**
 * كمبيوتر بفأرة (لا شاشة لمس) — هناك تُفتح نافذتنا الخاصة بدل نافذة النظام.
 * السبب ليس ذوقاً: كروم على ويندوز 10 يعلن `navigator.share` ثم لا تظهر نافذة
 * ويندوز إطلاقاً ولا يرجع خطأ، فيبدو الزرّ ميتاً (جهاز المالك، 2026-10-02).
 */
function prefersOwnShareSheet() {
  try {
    return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  } catch (e) {
    return false;
  }
}

/**
 * المسار المشترك لكل زرّ مشاركة في الموقع (المناسبة والبث) — الوصف أعلى
 * shareCurrentEvent. على الكمبيوتر نافذتنا (واتساب/فيسبوك/نسخ/إلغاء)، فلا شيء
 * يُنسخ أو يُرسل من ضغطة خاطئة؛ على الموبايل صحيفة النظام كما هي.
 */
async function shareLink({ title, line, url, copiedMessage }) {
  if (prefersOwnShareSheet() || !navigator.share) {
    openShareSheet({ title, line, url, copiedMessage });
    return;
  }
  try {
    await navigator.share({ title, text: line, url });
  } catch (e) {
    if (e && e.name === 'AbortError') return; // المستخدم أغلق ورقة المشاركة بنفسه — ليس خطأ
    // أي فشل آخر (نادر) — نافذتنا بدل ترك الزرّ بلا أثر.
    openShareSheet({ title, line, url, copiedMessage });
  }
}

/** ما تعرضه نافذة المشاركة الآن — يُضبط عند كل فتح. */
let shareSheetState = null;

function openShareSheet({ title, line, url, copiedMessage }) {
  const modal = document.getElementById('shareSheetModal');
  if (!modal) return;
  shareSheetState = { title, line, url, copiedMessage };

  const message = `${line}\n${url}`;
  document.getElementById('shareSheetLine').textContent = line;
  document.getElementById('shareSheetUrl').value = url;
  document.getElementById('shareSheetWhatsapp').href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  document.getElementById('shareSheetFacebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  resetShareSheetCopyButton();
  modal.style.display = 'flex';
}

function closeShareSheet() {
  const modal = document.getElementById('shareSheetModal');
  if (modal) modal.style.display = 'none';
  shareSheetState = null;
}

function resetShareSheetCopyButton() {
  const btn = document.getElementById('shareSheetCopyBtn');
  if (!btn) return;
  btn.classList.remove('is-copied');
  btn.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i> <span>نسخ الرابط</span>';
}

/** نسخ الرابط لا يحدث إلا بهذا الزرّ — بتأكيد ظاهر على الزرّ نفسه وتنبيه صغير. */
async function copyShareSheetLink() {
  if (!shareSheetState) return;
  const { url, copiedMessage } = shareSheetState;
  const input = document.getElementById('shareSheetUrl');
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch (e) {
    // لا clipboard API (سياق غير آمن مثلاً) — الطريقة القديمة من الحقل نفسه.
    try {
      input.select();
      copied = document.execCommand('copy');
    } catch (err) {
      copied = false;
    }
  }

  const btn = document.getElementById('shareSheetCopyBtn');
  if (copied) {
    btn.classList.add('is-copied');
    btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> <span>تم النسخ</span>';
    showToast(copiedMessage);
  } else {
    // لا يبقى الزرّ بلا أثر: الرابط محدَّد في الحقل وجاهز للنسخ باليد.
    input.focus();
    input.select();
    showToast('حدّد الرابط وانسخه بـ Ctrl+C');
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
            <h4>${escapeHtml(item.recipient_name)} (${escapeHtml(item.clan_town || 'منطقتك')})</h4>
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
      link.download = `سجل-النقوط-مناسبات-منطقتك-${Date.now()}.csv`;
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
      // محافظة الحساب صارت هي ما يستعمله الخادم بلا ترويسة — تُرسم مختارة
      // كي لا يعرض المنتقي محافظة غير التي ستأتي بها الطلبات التالية (#124).
      adoptAccountRegion(currentUser.region_id);
      loadNokootView();
      loadMyList(); // الحساب صار له قائمة الآن — الشارة تُبنى بلا فتح التبويب
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
      adoptAccountRegion(currentUser.region_id);
      loadNokootView();
      loadMyList(); // الحساب صار له قائمة الآن — الشارة تُبنى بلا فتح التبويب
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

  updateNotificationsHeaderButtons();
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
  // المقروء يبقى في القائمة باهتاً بلا نقطة حمراء ولا «جديد» — لا يختفي
  // بالنقر (طلب المالك 2026-10-02)؛ الحذف لـ«مسح الكل» وحده.
  container.innerHTML = notificationsList.map(n => {
    const isBroadcast = isBroadcastEntry(n);
    const clickArgs = isBroadcast ? `true, ${n.broadcast_id}` : `false, ${n.id}`;
    return `
    <div class="event-card notif-item ${n.is_read ? 'is-read' : 'is-unread'}" style="padding:14px; cursor:pointer;" onclick="markNotificationRead(${clickArgs})">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <strong class="notif-item-title">${!n.is_read ? '<span class="notif-unread-dot" aria-hidden="true"></span>' : ''}${escapeHtml(n.title)}</strong>
        ${!n.is_read ? '<span class="status-tag pending">جديد</span>' : ''}
      </div>
      <p style="margin-top:6px; color:var(--ink-soft); font-size:0.88rem;">${escapeHtml(n.body)}</p>
    </div>
  `;
  }).join('');
}

/** زرّ «جعل الكل مقروء» يظهر ما دام في القائمة غير مقروء، و«مسح الكل» ما دامت غير فارغة. */
function updateNotificationsHeaderButtons() {
  const markAllBtn = document.getElementById('markAllNotificationsReadBtn');
  const clearBtn = document.getElementById('clearAllNotificationsBtn');
  if (markAllBtn) markAllBtn.hidden = !notificationsList.some(n => !n.is_read);
  if (clearBtn) clearBtn.hidden = !notificationsList.length;
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
  if (!notification.is_read) {
    try {
      const res = await apiFetch(endpoint, { method: 'PATCH', auth: true });
      if (res.ok) {
        notificationsList = notificationsList.map(n => (n === notification ? { ...n, is_read: true } : n));
        renderNotificationsList();
        updateNotificationsBadge();
      }
    } catch (e) {
      console.error('Mark notification read error:', e);
    }
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

/** «جعل الكل مقروء» — لا يحذف شيئاً؛ القائمة تبقى كما هي باهتة، والعدّاد الأحمر يختفي. */
async function markAllNotificationsRead() {
  try {
    const res = await apiFetch('/api/notifications/read-all', { method: 'POST', auth: true });
    if (!res.ok) throw new Error('failed');
    notificationsList = notificationsList.map(n => ({ ...n, is_read: true }));
    renderNotificationsList();
    updateNotificationsBadge();
  } catch (e) {
    console.error('Mark all notifications read error:', e);
    showToast('تعذّر تعليم الإشعارات كمقروءة، حاول مرة أخرى');
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
 * يفتح مناسبة من إشعار أو رابط عميق أو الأجندة (قصة 14): يغلق المركز، يعيد
 * التغذية تحتها، ويفرغ معامل ?event_id= من العنوان عبر replaceState (FIX 5)،
 * ثم صفحة المناسبة نفسها — كالنقر على إشعار في الموبايل. مناسبة خارج التغذية
 * المحمّلة تُجلب وحدها دون تلويث allEvents أو الإخلال بالفلاتر (FIX 6).
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

  await openEventPage(eventId);
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
 * زرّ «حسابي» في الترويسة والشريط العائم (للهاتف): رمز شخص ونصّ واحد لا
 * يتبدّلان مع الجلسة — النقر (في index.html) يفتح وجهة «حسابي» للزائر
 * وللمسجَّل معاً، والدخول والخروج داخلها. الاسم الأول يظهر في title، وفي
 * «أهلاً، الاسم» بالترويسة الغنية (تذكرة #174) للمسجَّل وحده.
 * «لوحة الإدارة» زرّ منفصل يظهر لدوري admin وsuper_admin وحدهما — الدور من
 * استجابة الخادم، لا رقم هاتف ثابت.
 */
function updateAuthUI() {
  updateNotificationsBadge();
  updatePushControlUI();

  const loggedIn = !!(currentUser && authToken);
  const firstName = loggedIn ? String(currentUser.full_name || '').split(' ')[0] : '';

  // «أهلاً، الاسم» في الترويسة الغنية (تذكرة #174): المسجَّل وحده يراه،
  // وموضعان: الترويسة العريضة (سطح المكتب) والصفّ الغني في الشريط العائم
  // (الهاتف/PWA)، فالكتابة في العقدتين معاً كما في منتقي المحافظة.
  [['headerGreeting', 'headerGreetingName'], ['floatingHeaderGreeting', 'floatingHeaderGreetingName']].forEach(([wrapId, nameId]) => {
    const greeting = document.getElementById(wrapId);
    const greetingName = document.getElementById(nameId);
    if (greetingName) greetingName.textContent = firstName;
    if (greeting) greeting.hidden = !(loggedIn && firstName);
  });

  const adminBtn = document.getElementById('adminPanelBtn');
  if (adminBtn) {
    adminBtn.hidden = !(loggedIn && (currentUser.role === 'admin' || currentUser.role === 'super_admin'));
  }
}

// 17c. Privacy — إشعار الخصوصية، رفض التحليلات، والاطلاع/الحذف (تذكرة #44)
//
// هذا القسم يعيش داخل تبويب النقوط (index.html، #privacyAccountSection)،
// ووُضع هناك حين كان زرّ الهوية في الترويسة يفتح tabNokoot للمسجَّل دخوله —
// الزرّ اليوم «حسابي» ويفتح tabAccount (updateAuthUI أعلاه)، والقسم باقٍ في مكانه.

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
  ctx.fillText('مناسبات وأعراس منطقتك • دياركم عامرة', width / 2, 340);
}

function downloadStickerImage() {
  const canvas = document.getElementById('stickerCanvas');
  const link = document.createElement('a');
  link.download = `تهنئة-مناسبات-منطقتك-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function shareStickerToWhatsApp() {
  const sender = document.getElementById('stickerSenderName').value || 'أخوكم';
  const phrase = document.getElementById('stickerPhrase').value;
  const text = encodeURIComponent(`🎉 ${phrase}\nتهنئة خاصة من: ${sender}\n\nعبر تطبيق وموقع مناسبات منطقتك: ${window.location.origin}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

/**
 * توست عابر. الوسيط الثاني اختياري: فعل واحد داخل التوست ({ label, onClick })
 * — يُستعمل في «عرض» بعد الإضافة إلى قائمتي و«تراجع» بعد الإزالة. النداءات
 * القديمة بلا وسيط ثانٍ تعمل كما هي.
 */
function showToast(msg, action) {
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  const text = document.createElement('span');
  text.textContent = msg;
  toast.appendChild(text);
  if (action && action.label && typeof action.onClick === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-toast-action';
    btn.textContent = action.label;
    btn.onclick = () => { toast.remove(); action.onClick(); };
    toast.appendChild(btn);
  }
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
