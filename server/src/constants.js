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
  { key: 'host_phone', label: 'رقم التواصل', core: false }
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

module.exports = {
  TOWNS,
  TOWN_COORDINATES,
  REACTION_TYPES,
  EVENT_STATUSES,
  DEFAULT_POSTER,
  OCCASION_FIELDS,
  OCCASION_FIELD_KEYS,
  CORE_OCCASION_FIELDS,
  CONGRATULATION_REPORT_THRESHOLD,
  OCCASION_TONES
};
