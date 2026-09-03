'use strict';

/** Recognised Negev towns, in the order the UI presents them. */
const TOWNS = [
  'رهط',
  'حورة',
  'تل السبع',
  'كسيفة',
  'شقيب السلام',
  'اللقية',
  'عرعرة النقب',
  'القرى والتجمعات'
];

/** The catch-all bucket, the last entry of `TOWNS` — the only town a village may live under (services-directory spec). */
const VILLAGES_TOWN = 'القرى والتجمعات';

/**
 * Fallback map coordinates used when an event has no explicit location.
 * 'القرى والتجمعات' is deliberately absent: it is a catch-all bucket, not a
 * place, so no geocoder can resolve it — events filed under it get no pin
 * unless the publisher supplies explicit coordinates.
 */
const TOWN_COORDINATES = {
  'رهط': { lat: 31.393364, lng: 34.754678 },
  'حورة': { lat: 31.298567, lng: 34.926782 },
  'تل السبع': { lat: 31.245649, lng: 34.857768 },
  'كسيفة': { lat: 31.245249, lng: 35.095151 },
  'شقيب السلام': { lat: 31.194398, lng: 34.840581 },
  'اللقية': { lat: 31.324231, lng: 34.863202 },
  'عرعرة النقب': { lat: 31.157671, lng: 35.013021 }
};

/**
 * نغمة النوع — تحكم العرض لا المنطق: الاحتفالية تحمل صورة وشارة تاريخ فوقها،
 * والوقورة بطاقة هادئة. علَم صريح لأن كل تمييز بين الأنواع يمرّ بعلَم، ولأن
 * استنتاجها من تسمية يكتبها الأدمن يجعل إعادةَ تسميةٍ تقلبُ بطاقة نعي إلى
 * بطاقة فرح بصمت.
 */
const OCCASION_TONES = ['festive', 'solemn'];

/**
 * The `og:image` used by the shareable event page (`GET /e/:id`,
 * server/src/routes/share.routes.js) when an event has no `poster_url` and
 * its occasion type has no `default_poster_url` either — the last link in
 * that fallback chain, keyed by the type's own `tone` (never by name), so a
 * renamed عزا still gets the no-person, muted panel. Paths are relative to
 * the share router's own mount (`/e`); the route makes them absolute with
 * `config.publicUrl`, same as every other media URL (ADR-0002). A tone with
 * no entry here (there is none today — every `OCCASION_TONES` value is
 * covered) would need one added before it could be used as a fallback.
 */
const SHARE_FALLBACK_POSTERS = {
  festive: '/e/assets/festive.png',
  solemn: '/e/assets/solemn.png'
};

const REACTION_TYPES = ['coffee', 'horse', 'fireworks', 'rose', 'hand'];

const EVENT_STATUSES = ['pending', 'approved', 'rejected'];

const DEFAULT_POSTER =
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80';

/**
 * Hard ceiling on what an occasion type may show, hide or relabel. A type's
 * field configuration may only pick keys from this list — never invent one —
 * so the UI/search/migrations never have to deal with an unknown field.
 * `core: true` marks the three fields no occasion type may hide: honorees,
 * town, event_date. Keys match existing/new `events` columns.
 */
const OCCASION_FIELDS = [
  { key: 'honorees', label: 'أصحاب المناسبة', core: true },
  { key: 'title', label: 'العنوان', core: false },
  { key: 'family_clan', label: 'العائلة/العشيرة', core: false },
  { key: 'town', label: 'البلدة', core: true },
  { key: 'location_name', label: 'المكان', core: false },
  { key: 'secondary_location_name', label: 'مكان إضافي', core: false },
  { key: 'event_date', label: 'تاريخ المناسبة', core: true },
  { key: 'event_end_date', label: 'تاريخ الانتهاء', core: false },
  { key: 'youth_party_date', label: 'سهرة الشباب', core: false },
  { key: 'dinner_time', label: 'وقت العشاء', core: false },
  { key: 'poster_url', label: 'صورة الملصق', core: false },
  { key: 'audio_url', label: 'الملف الصوتي', core: false },
  { key: 'audio_title', label: 'عنوان المقطع الصوتي', core: false },
  { key: 'host_phone', label: 'رقم التواصل', core: false },
  { key: 'artist_name', label: 'الفنان', core: false },
  { key: 'artist_image_url', label: 'صورة الفنان', core: false }
];

const OCCASION_FIELD_KEYS = OCCASION_FIELDS.map(field => field.key);
const CORE_OCCASION_FIELDS = OCCASION_FIELDS.filter(field => field.core).map(field => field.key);

/**
 * Reports a single congratulation/تعزية needs before it auto-hides itself
 * pending human review (#20 step 5). No keyword filter exists in this domain
 * — reports plus a human are the only signal — so this threshold has to
 * stand on its own: low enough that a small town's real reaction to a
 * genuine insult clears it fast, high enough that one annoyed person alone
 * can't silence someone else's message.
 */
const CONGRATULATION_REPORT_THRESHOLD = 3;

/**
 * Closed list of analytics event names (issue #44). The governing rule is:
 * we record what a person DID in the app, never what they READ in it — a row
 * saying "this named person opened this particular عزاء" reads as
 * family-life information under Israeli Privacy Protection Law Amendment 13,
 * which raises the required security tier and doubles the notice obligation.
 * A name outside this list is rejected by analytics.service.js — that is
 * what stops a client writing whatever it likes into analytics_events, and
 * it is also what makes a privacy notice about this table writable at all
 * (you can only describe a closed, known set of things to a regulator).
 *
 * `countOnly: true` marks the one kind of event allowed to describe someone
 * opening a specific piece of content (share_page_viewed today). A
 * count-only event is written with user_id and device_id forced to NULL
 * regardless of what the caller sent — analytics.service.js enforces this in
 * the layer closest to the write, not just here. Every other event may carry
 * identity because it describes an action (a click, a login, a publish
 * attempt), never a read.
 *
 * Adding an event name is a product decision, same as OCCASION_FIELDS above
 * — never invent one inline in a route or service.
 */
// Each carries an Arabic label because this list is what the privacy notice
// is generated from, and a notice that lists 'share_page_viewed' at a reader
// in Rahat has not informed anyone — which is the entire point of the notice.
// Same shape as OCCASION_FIELDS: key, human label, one flag.
const ANALYTICS_EVENTS = [
  { key: 'share_clicked', label: 'الضغط على زرّ المشاركة', countOnly: false },
  { key: 'app_download_clicked', label: 'الضغط على «حمّل التطبيق»', countOnly: false },
  { key: 'publish_started', label: 'بدء نشر مناسبة', countOnly: false },
  { key: 'publish_failed', label: 'فشل نشر مناسبة', countOnly: false },
  { key: 'image_upload_failed', label: 'فشل رفع صورة', countOnly: false },
  { key: 'login', label: 'تسجيل الدخول', countOnly: false },
  { key: 'register', label: 'إنشاء حساب جديد', countOnly: false },
  { key: 'share_page_viewed', label: 'فتح صفحة رابط مناسبة مشارَكة', countOnly: true }
];

const ANALYTICS_EVENT_KEYS = ANALYTICS_EVENTS.map(event => event.key);
const COUNT_ONLY_ANALYTICS_EVENTS = ANALYTICS_EVENTS.filter(event => event.countOnly).map(event => event.key);

/**
 * The two request kinds the privacy request queue (issue #44, part 3)
 * accepts. "access" has no self-service path in this version — a
 * super_admin fulfils it by hand — while "erasure" also has an immediate
 * self-service endpoint (POST /api/privacy/analytics-erasure); a user may
 * still file a formal erasure request here instead of/in addition to that
 * button, for a documented, handled-by record.
 */
const PRIVACY_REQUEST_TYPES = ['access', 'erasure'];

/**
 * The deadline stated back to a user who files a formal privacy request.
 * This is this project's own declared SLA, not a figure copied from the
 * statute (the brief only requires that some deadline be stated) — 30 days
 * matches the general timeframe used across Israeli data-subject-request
 * practice, and is deliberately short enough to be a real commitment, not a
 * shrug.
 */
const PRIVACY_REQUEST_DEADLINE_DAYS = 30;

module.exports = {
  TOWNS,
  VILLAGES_TOWN,
  TOWN_COORDINATES,
  REACTION_TYPES,
  EVENT_STATUSES,
  DEFAULT_POSTER,
  OCCASION_FIELDS,
  OCCASION_FIELD_KEYS,
  CORE_OCCASION_FIELDS,
  CONGRATULATION_REPORT_THRESHOLD,
  OCCASION_TONES,
  SHARE_FALLBACK_POSTERS,
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_KEYS,
  COUNT_ONLY_ANALYTICS_EVENTS,
  PRIVACY_REQUEST_TYPES,
  PRIVACY_REQUEST_DEADLINE_DAYS
};
