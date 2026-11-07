'use strict';

/**
 * شريط الإحصائيات في الرئيسية (تذكرة #172) — عدد المناسبات القادمة في كل
 * محافظة، ومجموعها، ولحظة حسابها.
 *
 * **الرقم ليس عدّاً جديداً بل هو القوائم العامة نفسها:** الشرطان هنا هما
 * القطعتان المشتركتان حرفياً — `PUBLIC_EVENT_VISIBLE_SQL_EVENTS` من
 * `events.service.js` (معتمدة + عامة + بلغ موعد نشرها، بإذن #165/#166/#167) و
 * `EVENT_SPAN_END_SQL_EVENTS` (آخر أيام المناسبة لا `event_date`، بلا
 * `COALESCE` جديد) — فمناسبة «بالرابط فقط» أو معلّقة أو مجدولة أو انتهت لا
 * تُعدّ هنا كما لا تظهر هناك. وأي تعديل مستقبلي على أي من القطعتين يصل الشريط
 * تلقائياً؛ **ولا نُكتب نسخة ثانية من الشرط في هذا الملف أبداً**، وإلا افترق
 * رقم الشريط عن عدد ما يراه الزائر في التغذية والخريطة.
 *
 * **حدّ «قادم» هو حدّ القوائم القائم** (`span_end >= CURDATE()`) لا نافذة بقاء
 * التغذية (`EVENT_FEED_WINDOW_SQL_EVENTS`): تلك نافذة عرضٍ في التغذية وحدها
 * (تذكرة #167، «مناسبة انتهت اليوم تبقى سبعة أيام في نجاح»)، والشريط يقول
 * «قادمة» فيومُ انتهائها ليس قادماً. ولو استُعيرت النافذة هنا لصار الشريط
 * يعدّ مناسبة انتهت وكرتها يقول «انتهت».
 *
 * **ولا SQL في طبقة المسارات:** القاعدة هنا وحدها (`db.query`، كل استعلام
 * مُعامَل بـ`?`)، والمسار يغلّف الناتج بـ`success` ونقطة.
 *
 * **الكاش نطاقه العملية لا الطلب** (شرط التذكرة): `STATS_TICKER_CACHE_SECONDS`
 * بالثواني، والطلب الأول بعد انتهاء الصلاحية هو ما يعيد التعبئة — لا مؤقّت
 * دوري ولا كاش لكل عميل. و`updated_at` يُختم **لحظة التعبئة** لا لحظة الردّ،
 * فأي طلب داخل المدّة يعيد النسخة نفسها بحقلها نفسه — والفرق يظهر في الاختبار:
 * تنفيذٌ يختم اللحظة عند كل ردّ يعطي سلسلتين مختلفتين لطلبين متتاليين. وهو ما
 * يجعل «حُدّث HH:MM» في العميلين صادقاً: يقول متى حُسب الرقم لا متى سُئل عنه.
 *
 * وكاش واحد لكل المحافظات لا مفتاح لكل محافظة: الاستعلام قراءة واحدة تجمع
 * الجميع، ومفتاحٌ لكل محافظة كان سيعني استعلاماً لكلٍّ على حدة عند أول طلب
 * بعد انتهاء الصلاحية — أي أن الكاش كان سيضاعف العمل لا يوفّره.
 */

const db = require('../db/pool');
const { STATS_TICKER_CACHE_SECONDS } = require('../constants');

/**
 * القطعتان المشتركتان، وطلبهما **كسولاً** كما يفعل `towns.service.js`
 * و`albums.service.js`: `events.service.js` يُحمَّل قبل هذا الملف في مسار
 * التطبيق، لكن الطلب في الأعلى يخلق دورة تُقرأ فيها القطعة قبل تعريفها إن
 * تغيّر ترتيب التحميل.
 */
function publicEventVisibleSql() {
  return require('./events.service').PUBLIC_EVENT_VISIBLE_SQL_EVENTS;
}

function upcomingSpanEndSql() {
  return require('./events.service').EVENT_SPAN_END_SQL_EVENTS;
}

/** قيمة `?` الواحدة في قطعة الظهور (`publish_at <= ?`) — ساعة القدس، لا `NOW()`. */
function publicEventVisibleParam() {
  return require('./events.service').publishNowClock();
}

/** آخر نسخة محسوبة: `{ payload, filledAt }` — `null` قبل أول طلب. */
let cache = null;

/**
 * `{ regions, total, updated_at }` — المحافظات **النشطة** بترتيب عرضها (الموقوفة
 * ليست مكاناً في أي منتقٍ ولا في أي قائمة، فلا رقم لها هنا)، ولكلٍّ عدد
 * مناسباتها القادمة الظاهرة، ثم المجموع.
 *
 * المجموع يُجمع من الأعداد المعروضة نفسها لا باستعلام ثانٍ: `total` يقول ما
 * يقوله الشريط، فلا يمكن أن يخالفه برقم يتيم. والعدّ بالمعرّف
 * (`events.region_id`) لا بالاسم — المنطقة هي التي تحمل الصفّ في كل قراءة
 * اكتشاف، والاسم للمعروض وحده.
 */
async function ticker() {
  const now = Date.now();
  if (cache && now - cache.filledAt < STATS_TICKER_CACHE_SECONDS * 1000) {
    return cache.payload;
  }

  // نفس شكل عدّاد المحافظة في `towns.service.js#listDiscoveryRegions`:
  // استعلام فرعي مرتبط لكل محافظة، فالقطعة المشتركة تُكتب مرّة واحدة في
  // العبارة الواحدة. وهي تحمل `?` واحداً، وتُمرَّر له ساعة القدس في موضعها.
  const rows = await db.query(
    `SELECT r.id AS region_id, r.name AS name,
            (SELECT COUNT(*) FROM events
              WHERE events.region_id = r.id
                AND ${publicEventVisibleSql()}
                AND ${upcomingSpanEndSql()} >= CURDATE()) AS upcoming_count
       FROM regions r
      WHERE r.is_active = 1
      ORDER BY r.position ASC, r.id ASC`,
    [publicEventVisibleParam()]
  );

  const regions = rows.map(row => ({
    region_id: Number(row.region_id),
    name: row.name,
    upcoming_count: Number(row.upcoming_count)
  }));

  // لحظة واحدة للاثنين: ختمُ `updated_at` هو نفسه ما تُقاس به صلاحية الكاش،
  // فلا يفترق «متى حُسب الرقم» عن «متى بُني الحفظ».
  const filledAt = Date.now();
  const payload = {
    regions,
    total: regions.reduce((sum, region) => sum + region.upcoming_count, 0),
    // بعد انتهاء الاستعلام: لو حُسبت قبله لقالت وقتاً لم يكن الرقم فيه جاهزاً.
    updated_at: new Date(filledAt).toISOString()
  };

  cache = { payload, filledAt };
  return payload;
}

/**
 * تفريغ الكاش — للاختبارات وحدها (كما `news.service.clearCache`): لا مسار
 * عمومي يفعل هذا، ولا سبب إنتاجي له. الاختبار يحتاجه كي يقيس العدّ على صفوفه
 * لا على نسخة بُنيت قبلها، وكي يُثبت أن الكاش هو ما يمنع قراءة جديدة.
 */
function clearTickerCache() {
  cache = null;
}

module.exports = {
  ticker,
  clearTickerCache
};
