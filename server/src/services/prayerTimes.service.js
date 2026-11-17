'use strict';

/**
 * مواقيت الصلاة (M3) — الحساب كله هنا، **بلا SQL وبلا `req`/`res`**: الإحداثيات
 * تصل من `towns.service.placeCoordinates` و`middleware/region.js`، وهذا الملف
 * لا يعرف جدولاً ولا طلباً ولا عميلاً.
 *
 * **لماذا تُحسَب على خادمنا ولا تُجلَب من طرف خارجي (قرار المالك):** المواقيت
 * نتيجةُ حسابٍ فلكي من إحداثيات معلومة، فنداءُ خدمة خارجية لها يضيف توفّراً
 * وأخطاءً شبكةً وشروطَ استخدام بلا مقابل. و`adhan` (adhan-js، MIT، بلا تبعيات
 * وقت تشغيل) هو الحساب نفسه هنا، فتصير النتيجة قابلةً للاختبار بلا شبكة.
 *
 * **والتوقيت الصيفي لا يمرّ عبر إزاحة ثابتة في هذا الملف:** adhan يعيد لحظةً
 * مطلقة (`Date`) لكل صلاة، والصيغة `HH:mm` تُبنى منها بـ`Intl` بمنطقة القدس
 * صراحةً — فعبرَ ٢٧ آذار و٢٥ تشرين الأول تتحرّك المنطقة وحدها واللحظة لا تتغيّر.
 */

const adhan = require('adhan');
const { PRAYER_CALC_METHOD } = require('../constants');
const { jerusalemDateString } = require('../utils/jerusalemTime');

/** منطقة العرض الوحيدة — القدس، كما في كل ما يعرض وقتاً في هذا المشروع. */
const TIME_ZONE = 'Asia/Jerusalem';

/**
 * مداخل الوقت الستّة بترتيبها الزمني وأسمائها العربية — هيئة الاستجابة نفسها.
 * الشروق **ليس صلاة** ولا يدخل «الصلاة القادمة» (`NEXT_KEYS` أدناه)، لكنه ميقاتٌ
 * يعرضه العميل ويعرف به انتهاء وقت الفجر.
 */
const TIMES = [
  { key: 'fajr', name: 'الفجر' },
  { key: 'sunrise', name: 'الشروق' },
  { key: 'dhuhr', name: 'الظهر' },
  { key: 'asr', name: 'العصر' },
  { key: 'maghrib', name: 'المغرب' },
  { key: 'isha', name: 'العشاء' }
];

/** ما يجوز أن يكون «الصلاة القادمة» — الشروق خارجها عمداً. */
const NEXT_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/**
 * مفتاح `PRAYER_CALC_METHOD` ← هيئة adhan واسمها العربي في مدخل واحد: تبديل
 * المفتاح في `constants.js` يبدّل الحساب والاسم الذي يقرأه العميل معاً، فلا
 * يمكن أن يبقى أحدهما على القديم.
 */
const CALC_METHODS = {
  egyptian: {
    name: 'الهيئة المصرية العامة للمساحة',
    build: () => adhan.CalculationMethod.Egyptian()
  }
};

const CALC_METHOD = CALC_METHODS[PRAYER_CALC_METHOD];
if (!CALC_METHOD) {
  // ثابتٌ في الكود لا إعداد وقت تشغيل: قيمة خاطئة عيبُ بناءٍ يُقال عند الإقلاع،
  // لا 500 في أوّل طلب مواقيت.
  throw new Error(`PRAYER_CALC_METHOD غير معروف: ${PRAYER_CALC_METHOD}`);
}

/** `{ key, name }` كما تخرجه الاستجابة — مفتاح الهيئة واسمها العربي. */
const METHOD = { key: PRAYER_CALC_METHOD, name: CALC_METHOD.name };

/**
 * الصيغة الوحيدة للوقت: `HH:mm` بساعة ٢٤ في القدس. و`hourCycle: 'h23'` كي تعود
 * منتصف الليل `00:xx` لا `24:xx`، و`en-GB` كي يكون الفاصل `:` والترتيب ساعةً
 * قبل الدقيقة أياً كانت لغة الخادم.
 */
const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/** اليوم في القدس — التاريخ الافتراضي حين لا يرسل العميل واحداً. */
function todayInJerusalem(now = new Date()) {
  return jerusalemDateString(now);
}

/** `YYYY-MM-DD` ← أجزاؤه الرقمية. الصيغة والوجود تحقّقا في المسار قبل هنا. */
function splitDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/** اليوم نفسه بعد `days` — بحساب UTC كي لا يقفز يومٌ عبر توقيت صيفي. */
function shiftDate(date, days) {
  const { year, month, day } = splitDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * مداخل الوقت الستّة لتاريخ محدّد كـ`[{ key, name, time, instant }]`، مرتّبةً زمنياً.
 *
 * **التاريخ يُبنى للتاريخ المطلوب لا لـ«الآن»:** `adhan.PrayerTimes` يقرأ اليوم
 * من `getFullYear/getMonth/getDate` في `Date`، فتُمرَّر له الظهيرةُ المحلية
 * لليوم المطلوب — أيّاً كانت منطقة الخادم — لا اللحظة الحاضرة. (adhan لا يقرأ
 * `getTimezoneOffset` أصلاً، فمنتصف النهار يجعل اليوم المقروء هو المطلوب في كل
 * المناطق.)
 */
function timesForDate({ latitude, longitude, date }) {
  const { year, month, day } = splitDate(date);
  const params = CALC_METHOD.build();
  params.madhab = adhan.Madhab.Shafi;
  const prayerTimes = new adhan.PrayerTimes(
    new adhan.Coordinates(latitude, longitude),
    new Date(year, month - 1, day, 12),
    params
  );
  return TIMES.map(({ key, name }) => ({
    key,
    name,
    time: TIME_FORMATTER.format(prayerTimes[key]),
    instant: prayerTimes[key]
  }));
}

/** دقائق كاملة لأعلى — ولا صفر لصلاةٍ لم تحلّ بعد. */
function minutesUntil(instant, now) {
  return Math.max(1, Math.ceil((instant.getTime() - now.getTime()) / 60000));
}

function shapeNext(entry, date, now) {
  return {
    key: entry.key,
    name: entry.name,
    time: entry.time,
    date,
    minutes_until: minutesUntil(entry.instant, now)
  };
}

/**
 * الصلاة القادمة بعد `now` من صلوات اليوم الخمس (بلا الشروق)، وإن مضت العشاء
 * فجرُ الغد — بتاريخ الغد ومحسوباً من الإحداثيات نفسها لا مكرَّراً من مواقيت
 * اليوم. `times` مرتّبة زمنياً، فأوّل ما يطابق الشرط هو الأقرب.
 */
function nextPrayer({ latitude, longitude, date, times, now }) {
  const upcoming = times.find(entry => NEXT_KEYS.includes(entry.key) && entry.instant > now);
  if (upcoming) return shapeNext(upcoming, date, now);

  const tomorrow = shiftDate(date, 1);
  const fajr = timesForDate({ latitude, longitude, date: tomorrow })
    .find(entry => entry.key === 'fajr');
  return shapeNext(fajr, tomorrow, now);
}

/**
 * النواة النقية — `{ latitude, longitude, date, now }` ← `{ date, times, next }`،
 * بلا قاعدة بيانات ولا طلب ولا ساعة نظام: `now` تُحقَن، فتُختبر الحالات كلها
 * (قبل الفجر، بين العصر والمغرب، بعد العشاء) بلا انتظار.
 *
 * `next` **لتاريخ اليوم وحده**: تاريخٌ آخر لا «قادم» له أصلاً — لا معنى لـ«بعد كم
 * دقيقة» في يومٍ ليس اليوم — فيعود `null` صراحةً لا قيمة مخمَّنة.
 */
function computePrayerTimes({ latitude, longitude, date, now = new Date() }) {
  const times = timesForDate({ latitude, longitude, date });
  const isToday = date === todayInJerusalem(now);
  return {
    date,
    times: times.map(({ key, name, time }) => ({ key, name, time })),
    next: isToday ? nextPrayer({ latitude, longitude, date, times, now }) : null
  };
}

module.exports = {
  TIME_ZONE,
  METHOD,
  todayInJerusalem,
  computePrayerTimes
};
