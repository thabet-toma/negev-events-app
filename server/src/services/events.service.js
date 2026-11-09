'use strict';

const crypto = require('crypto');
const db = require('../db/pool');
const ApiError = require('../utils/ApiError');
const occasionTypes = require('./occasionTypes.service');
const townsService = require('./towns.service');
const adminScope = require('./adminScope.service');
const villagesService = require('./villages.service');
const albums = require('./albums.service');
const people = require('./people.service');
const cloudinary = require('./cloudinary.service');
const logger = require('../utils/logger');
const { REACTION_TYPES, CONGRATULATION_REPORT_THRESHOLD, DUPLICATE_DATE_WINDOW_DAYS, TRENDING_WINDOW_DAYS, VILLAGES_TOWN, FEATURED_EVENTS_MAX_PER_REGION } = require('../constants');
const { withAbsoluteMedia, absoluteMediaUrl } = require('../utils/mediaUrl');
const { haversineDistanceKm } = require('../utils/geo');
const { nameKey, nameTokens, comparePersonNames } = require('../utils/arabicName');
const { jerusalemDateTimeString } = require('../utils/jerusalemTime');

const EMPTY_REACTIONS = () => REACTION_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});

/** Default and hard-ceiling page sizes for `GET /api/events` (#20 step 4, decision ب). */
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

/**
 * أعلى عدد مناسبات يعيده قسم «الأكثر تفاعلاً هذا الأسبوع» (تذكرة #177) — ستة،
 * صفاً واحداً في كل شريط. والحدّ في الاستعلام لا في رسم البطاقات: السابع لا
 * يُقرأ من القاعدة أصلاً، فلا يصل عميلاً ثم يُخفى فيه.
 */
const TRENDING_EVENTS_LIMIT = 6;

/**
 * Columns the public list actually needs — a card's fields plus whatever the
 * relations/filtering steps below need (`occasion_type_id`, `event_end_date`).
 * `secondary_location_name`, `created_by`, `updated_at` and `status` are
 * dropped: no client displays them from this endpoint. `GET /api/events/:id`
 * is unaffected and still returns every column (#20 step 4, decision هـ).
 */
const LIST_COLUMNS = [
  'events.id', 'events.title', 'events.groom_name', 'events.family_clan', 'events.occasion_type_id',
  'events.town', 'events.village_id', 'events.requested_village_name', 'events.location_name',
  'events.latitude', 'events.longitude', 'events.event_date', 'events.event_end_date', 'events.youth_party_date',
  'events.dinner_time', 'events.poster_url', 'events.audio_url', 'events.audio_title',
  'events.artist_name', 'events.artist_image_url', 'events.host_phone', 'events.views_count'
].join(', ');

/**
 * The date span of an event, as a SQL fragment — every day the occasion
 * actually covers, not just the column pair it was published with.
 * `event_date` is its first day and `event_end_date` (when set) its last
 * fixed one, but `youth_party_date` (the «سهرة الشباب», usually held before
 * the wedding) and every `event_days` row (the named days — حنّة، غداء) are
 * real days of the same occasion. A span that ignored them would drop a
 * wedding from the upcoming list the day after its main date while its حنّة
 * day is still ahead, and file it in the archive while it is still going on.
 *
 * `LEAST`/`GREATEST` yield NULL if any argument is NULL, so every nullable
 * term — `event_end_date`, `youth_party_date`, and the empty-set MIN/MAX of
 * the correlated subquery — is COALESCEd back to `event_date`. One literal
 * per table-reference style the queries actually use (`e` for a joined
 * `events e`, `events` for the bare/qualified table); each is a fixed string
 * with no interpolated value or name, so it stays parameter-free like every
 * other fragment here (CLAUDE.md: no SQL text concatenation).
 */
const EVENT_SPAN_START_SQL_EVENTS =
  'LEAST(events.event_date,'
  + ' COALESCE(events.youth_party_date, events.event_date),'
  + ' COALESCE((SELECT MIN(d.day_date) FROM event_days d WHERE d.event_id = events.id), events.event_date))';
const EVENT_SPAN_END_SQL_EVENTS =
  'GREATEST(COALESCE(events.event_end_date, events.event_date),'
  + ' COALESCE(events.youth_party_date, events.event_date),'
  + ' COALESCE((SELECT MAX(d.day_date) FROM event_days d WHERE d.event_id = events.id), events.event_date))';
const EVENT_SPAN_END_SQL_E =
  'GREATEST(COALESCE(e.event_end_date, e.event_date),'
  + ' COALESCE(e.youth_party_date, e.event_date),'
  + ' COALESCE((SELECT MAX(d.day_date) FROM event_days d WHERE d.event_id = e.id), e.event_date))';
const EVENT_SPAN_START_SQL_E =
  'LEAST(e.event_date,'
  + ' COALESCE(e.youth_party_date, e.event_date),'
  + ' COALESCE((SELECT MIN(d.day_date) FROM event_days d WHERE d.event_id = e.id), e.event_date))';

/**
 * شرط «مناسبة ظاهرة للعامة» — **القطعة الواحدة** التي تكتبها كل قراءة قائمة
 * عامة بدل نسختها اليدوية، والموضع الوحيد لشرط الظهور في **قراءات القوائم**.
 * أثلاثها اليوم `approved` (تذكرة #165) و`visibility = 'public'` (تذكرة #166)
 * و`(publish_at IS NULL OR publish_at <= ?)` (تذكرة #167، النشر المجدول):
 * مناسبة «بالرابط فقط» تغيب بهاتين الكلمتين عن كل قراءة تمرّ بها، ومناسبة
 * جدول صاحبها نشرها تغيب بالثلث الثالث حتى يبلغ موعدها — ولا نسخة ثانية من
 * الشرط في أي **استعلام قائمة** (وبوابات الصفّ الواحد تحته مستثناة صراحةً).
 * والثلث الثالث لا يمسّ `status` ولا `visibility`: يُضاف إليها كشرط رابع،
 * فمناسبة مجدولة تبقى معتمدة وعامة في الصفّ نفسه، غائبةً عن القوائم وحدها حتى
 * موعدها.
 *
 * **وساعة المقارنة تُمرَّر مُعامَلةً** (`publishNowClock()`، وتُقرن بهذا الموضع
 * من `params` عند كل مستدعٍ): `publish_at` عمود `DATETIME` يحمل ساعة الحائط
 * التي كتبها صاحب المناسبة في القدس، بلا منطقة محفوظة معه. ومقارنته بـ`NOW()`
 * تقارنه بساعة **جلسة MySQL** — وحاوية الإنتاج بلا `TZ` فجلستها UTC، فتظهر
 * المجدولةُ ويُعلَن عنها متأخّرةً ساعتين شتاءً وثلاثاً صيفاً. و`publishNowClock()`
 * يقرأ «الآن» بساعة القدس في JS (`getZonedParts`)، فلا يختلف الشرط بين عملية
 * وأخرى ولا بين جلسة وأخرى.
 *
 * **تُستعمل** في كل قراءة قائمة يراها الجمهور بلا حساب: التغذية
 * (`listPublicEvents`)، والخريطة (`listMapPoints`)، وتقويم الشهر
 * (`listCalendarDays`)، والإعلانات الحية
 * (`listLiveAnnouncements`)، و«مناسبات أخرى» (`listRelatedEvents`)، وخريطة
 * الموقع (`listSitemapEvents`)، وعدّ المناسبات لكل بلدة (`townStats`) ولكل
 * محافظة (`listDiscoveryRegions` في `towns.service.js`)، ومناسبات الشخص
 * وعدّادها في البحث (`getPublicPerson` و`searchPeople` في `albums.service.js`).
 * وكل قراءة عامة للألبوم أو الصورة أو الفيديو هناك تمرّ بها عبر
 * `publicAlbumConditions()` — القوائم، وصفحات المعرّف `/a/:id` و`/p/:id`
 * و`/v/:id`. ولا إشعار «مناسبة جديدة» يخرج منها: قاعدته في
 * `notifications.service.notifyNewEvent` صراحةً، لا هنا (تذكرة #166).
 *
 * **ولا تُستعمل** في غير ما سبق ولو كتب الموضع `status = 'approved'`
 * بيده. أولها **القراءة بالمعرّف للحدث**: التفصيل (`getEventDetails`) لا يقيّد
 * حالة المناسبة أصلاً — وإن كانت صور أرشيفه تمرّ ببوابة الألبوم أعلاه — ويعيد
 * `visibility` كما قرأها (`SELECT *`)، لأن التفصيل بالمعرّف طريقٌ ثانية إلى
 * مناسبة «بالرابط فقط» يجوز أن تفتح لمن يحمل معرّفها. و
 * `getShareEvent` (`/e/:id` و`/e/:id/card.jpg` و`/e/:id/download`) يكتب
 * `events.status = 'approved'` نصاً بيده خارج القطعة عمداً، فلا يرث شرط
 * الظهور؛ لأن `/e/:id` هي الطريق التي يملكها من يصله الرابط إلى المناسبة
 * «بالرابط فقط»، فقاعدتها هناك صراحةً (`visibility` تُقرأ ولا تُصفّى). ثم طابور الأدمن
 * (`listEvents` في `admin.service.js` — يقرأ
 * الحالة المطلوبة نفسها، لا بوابة ظهور)، ومرشّحو حارس التكرار
 * (`findPossibleDuplicates` يقارن المعتمدة والمعلّقة معاً، و«بالرابط فقط»
 * معها)، و«قائمتي» الخاصة
 * بالمستخدم (`listMyReminders`)، وتحقق «ذكّرني» الداخلي (`setReminder`)،
 * وعدّاد التبريكات — كلها تقرأ الحالة لسبب آخر لا لبوابة ظهور للجمهور. ثم
 * **بوابات الصفّ الواحد للجدولة والإعلان** (تذكرة #167): `publishGateOpen`
 * (أيُعلن الآن أم ينتظر المجدول؟)، و`listDueScheduledPublish` (ما بلغ موعده ولم
 * يُعلَن بعد)، و`markAnnounced` (حجز الإعلان ذرّياً داخل معاملة الإعلان) — وهي
 * تعيد فحص أهلية صفٍّ واحد بنفس الساعة الممرَّرة (`publishNowClock()`) في موضعها
 * من `params`، لا بشرط ظهور ثانٍ لقراءة قائمة. وهي ليست قراءات قوائم أصلاً:
 * فالأولى قراءة صفٍّ بمعرّفه، والثانية مسح المجدول، والثالثة `UPDATE` — وشرط
 * القطعة شرطُ صفّ معروض لقائمة، وهذه بوابات صفٍّ واحد تُشترَط قبل الإعلان.
 *
 * **ومرشّح النسخة (`legacyOnly` / `X-App-Version`) خارجها عمداً:** شرطه يعتمد
 * على **الطلب** لا على الصف — يُبنى من `occasionTypes.getLegacyTypeIds()` وقت
 * النداء، فيبقى في مكانه مع بقية الشروط الديناميكية. أما الظهور فشرطه على
 * الصفّ وحده، فيسري على طلب بلا ترويسة (كل APK قديم) كما على أحدث نسخة، بلا
 * فرع هنا. والنسختان هنا
 * (`_EVENTS` و`_E`) على اصطلاح `EVENT_SPAN_*` نفسه: الأولى لاسم الجدول كاملاً
 * والثانية للمُستعار `e`؛ كلتاهما سلسلة ثابتة فيها **موضع `?` واحد** للثلث
 * الثالث، بلا قيمة مُدرَجة ولا اسم مُمرَّر (CLAUDE.md: لا دمج نصوص SQL) —
 * ومستدعيها يضع `publishNowClock()` في موضعها من `params`.
 */
const PUBLIC_EVENT_VISIBLE_SQL_EVENTS =
  "events.status = 'approved' AND events.visibility = 'public'"
  + ' AND (events.publish_at IS NULL OR events.publish_at <= ?)';
const PUBLIC_EVENT_VISIBLE_SQL_E =
  "e.status = 'approved' AND e.visibility = 'public'"
  + ' AND (e.publish_at IS NULL OR e.publish_at <= ?)';

/**
 * «الآن» بساعة القدس، بصيغة عمود `publish_at` نفسها — القيمة الوحيدة التي
 * تُمرَّر مكان `?` في **كل** مقارنة لـ`publish_at`: هنا، وفي
 * `albums.service.js` و`towns.service.js` التي تستعير القطعة أعلاه.
 *
 * لا `NOW()` (منطقة جلسة MySQL) ولا `UTC_TIMESTAMP()` (غرينتش) — العمود يحمل
 * ساعة حائط القدس التي كتبها صاحب المناسبة. وتُحسب لحظةَ النداء لا مرةً عند
 * التحميل، فشرط الظهور يتقدّم مع الساعة في عملية طويلة العمر.
 */
function publishNowClock() {
  return jerusalemDateTimeString();
}

/**
 * حدّ «القادم» في **التغذية وحدها** (تذكرة #167) — نهاية أيام المناسبة
 * (`EVENT_SPAN_END_SQL_EVENTS`، لا `COALESCE` جديد) تُقارَن باليوم ناقص نافذة
 * البقاء الخاصة بنوعها: مناسبة «نجاح» تنتهي اليوم تبقى في «القادم» سبعة أيام
 * وكرتها يقول «انتهت»، والعرس (صفر) يخرج غداً كما كان.
 *
 * **ولا تُعمَّم:** الخريطة (`listMapPoints`) و«قائمتي» والتذكيرات
 * و`related`/`sitemap` كلها على حدّها القائم (`span_end >= CURDATE()`)، لأن
 * «انتهت» كلامُ تغذيةٍ لا خريطةٍ. **والتقويم (`listCalendarDays`) ليس منها:**
 * لا يقيّد بالقادم أصلاً — بوابة الظهور العام وحدها — ويعدّ الشهر كاملاً بما
 * فيه أيام مضت. وهي شرط واحد يُضاف إلى `conditions` في `listPublicEvents`
 * مكان الحدّ القديم، لا في كل استعلام.
 *
 * `DATEDIFF(CURDATE(), span_end) <= linger` هي `span_end >= CURDATE() - linger`
 * نفسها (و`linger = 0` يعطي الحدّ القديم حرفياً: «لم ينتهِ بعد»)، مكتوبةً بهذا
 * الاتجاه لأن `feed_linger_days` يأتي من صفّ النوع عبر استعلام فرعي — و`INTERVAL
 * <استعلام فرعي> DAY` غير مقبول في MySQL، بخلاف طرف مقارنة عادي.
 *
 * و`COALESCE(…, 0)` هو نافذة الصفّ **الذي لا نوع له** (صفوف ما قبل الأنواع،
 * والبذرة والمستوردون الذين يُدرجون بلا `occasion_type_id`): صفر يوم، أي
 * `span_end >= CURDATE()` حرفياً — فلا بقاء أبديّ. (كان هنا فرع
 * `occasion_type_id IS NULL` يجعل الشرط صحيحاً دائماً، فما انتهى من تلك
 * الصفوف لا يخرج من «القادم» أبداً.)
 */
const EVENT_FEED_WINDOW_SQL_EVENTS =
  '(DATEDIFF(CURDATE(), '
  + EVENT_SPAN_END_SQL_EVENTS
  + ') <= COALESCE((SELECT ot.feed_linger_days FROM occasion_types ot WHERE ot.id = events.occasion_type_id), 0))';

/**
 * «مناسبة كبرى» النشِطة (تذكرة #171): القطعة الواحدة التي تعرّف «مبرزة الآن».
 * الإدارة تضبط `featured_until` (تاريخ ينتهي عنده الإبراز، أو `NULL` إلغاءً)،
 * والنشاط حكمٌ على الصفّ وحده: العمود غير فارغ **ولم يمضِ تاريخه بعد**. تُقارَن
 * بـ`CURDATE()` (يوم قاعدة البيانات) لا بساعة العميل — الإبراز «حتى هذا اليوم»
 * كما كتبه الأدمن في القدس، وساعة الحائط لا منطقة لها في عمود DATE أصلاً.
 *
 * تُستعمل في موضعين: عمود `is_featured` في تغذية `listPublicEvents` (وعليه
 * يُبنى ترتيبها)، وعدّاد السقف في `setEventFeatured`. **ولا تُعمَّم** على
 * الخريطة ولا البحث ولا `related`/`sitemap` — التذكرة نصّت على التغذية وحدها،
 * والإبراز كلامُ تغذيةٍ لا وسمٌ لكل قراءة.
 */
const EVENT_FEATURED_ACTIVE_SQL_EVENTS =
  '(events.featured_until IS NOT NULL AND events.featured_until >= CURDATE())';

/** Escapes LIKE wildcards so a user search term stays a literal substring. */
function escapeLike(term) {
  return term.replace(/[\\%_]/g, char => `\\${char}`);
}

/** Groups reaction counts by event id: { [eventId]: { coffee: 3, ... } }. */
async function reactionsForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, reaction_type, COUNT(*) AS count
       FROM reactions
      WHERE event_id IN (${placeholders})
      GROUP BY event_id, reaction_type`,
    eventIds
  );

  const map = {};
  for (const row of rows) {
    if (!map[row.event_id]) map[row.event_id] = EMPTY_REACTIONS();
    map[row.event_id][row.reaction_type] = Number(row.count);
  }
  return map;
}

/**
 * Groups congratulation count + newest one by event id, in a single query:
 * { [eventId]: { congratulations_count, latest_congratulation: { sender_name, message, created_at } } }.
 * One window-function pass over `congratulations` (COUNT as a partition
 * aggregate, ROW_NUMBER to pick the newest row per event) instead of a JOIN
 * that would multiply event rows by their congratulation count (#20 step 4,
 * decision د).
 */
async function congratulationsForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, sender_name, message, created_at, cnt
       FROM (
         SELECT event_id, sender_name, message, created_at,
                ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at DESC, id DESC) AS rn,
                COUNT(*) OVER (PARTITION BY event_id) AS cnt
           FROM congratulations
          WHERE event_id IN (${placeholders}) AND status = 'approved'
       ) ranked
      WHERE rn = 1`,
    eventIds
  );

  const map = {};
  for (const row of rows) {
    map[row.event_id] = {
      congratulations_count: Number(row.cnt),
      latest_congratulation: { sender_name: row.sender_name, message: row.message, created_at: row.created_at }
    };
  }
  return map;
}

/**
 * Whether the event page's public «تبريكات» counter may be drawn (تذكرة #170).
 * Same three refusals `rsvpCountVisible` below spells out, for the same
 * reasons: a `solemn` type carries no counter at all («العزاء لا أزرار ولا
 * عدّادات»، #146 المرحلة ٢), a type that switched the flag off hides it, and
 * no type means no rule to read. The type object is what callers already hold
 * (`attachHonoreesAndTypes`), and a raw SQL row's 0/1 is accepted too.
 */
function congratulationsCountVisible(occasionType) {
  if (!occasionType) return false;
  if (occasionType.tone === 'solemn') return false;
  if (occasionType.show_congratulations_count === false) return false;
  if (occasionType.show_congratulations_count === 0) return false;
  return true;
}

/**
 * Approved congratulations of one event — the public figure. A `pending` or
 * `hidden` row is not counted: `getEventDetails` hands the caller its own
 * pending submission inside the list, and counting that would make the number
 * disagree with what everyone else sees.
 */
async function approvedCongratulationsCount(eventId) {
  const row = await db.queryOne(
    "SELECT COUNT(*) AS total FROM congratulations WHERE event_id = ? AND status = 'approved'",
    [eventId]
  );
  return Number(row.total);
}

/** Groups follower counts by event id: { [eventId]: count }. */
async function followersCountsForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, COUNT(*) AS count FROM event_reminders
      WHERE event_id IN (${placeholders})
      GROUP BY event_id`,
    eventIds
  );

  const map = {};
  for (const row of rows) map[row.event_id] = Number(row.count);
  return map;
}

/** Which of these events the given user has an active "ذكّرني" on — empty for an anonymous caller. */
async function remindedEventIdsForUser(userId, eventIds) {
  if (!userId || !eventIds.length) return new Set();

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id FROM event_reminders WHERE user_id = ? AND event_id IN (${placeholders})`,
    [userId, ...eventIds]
  );
  return new Set(rows.map(row => row.event_id));
}

/**
 * Attaches `is_reminded` (always), and `followers_count` + `interested_count`
 * (only when the event's occasion type has `show_followers_count` on — absent
 * entirely otherwise, never zero, since a hidden count must not be inferable
 * from a suspicious zero) to a list of events already carrying
 * `occasion_type`.
 *
 * The two counter keys carry the **same number** on purpose: `interested_count`
 * is the name the #168 spec uses («التذكيرات، تحت `show_followers_count`»),
 * and `followers_count` is what every published client already reads. An alias
 * adds the requested name without breaking a single shipped APK; neither key
 * is ever written without the other.
 */
async function attachReminderState(events, userId) {
  if (!events.length) return events;

  const eventIds = events.map(event => event.id);
  const [followersMap, remindedSet] = await Promise.all([
    followersCountsForEvents(eventIds),
    remindedEventIdsForUser(userId, eventIds)
  ]);

  return events.map(event => {
    const shaped = { ...event, is_reminded: remindedSet.has(event.id) };
    if (event.occasion_type?.show_followers_count !== false) {
      const followers = followersMap[event.id] || 0;
      shaped.followers_count = followers;
      shaped.interested_count = followers;
    }
    return shaped;
  });
}

/**
 * Toggles a "ذكّرني" on — a follow, not an RSVP. Only an `approved` event can
 * be followed: a pending/rejected one answers 404, exactly like a
 * non-existent id, so the endpoint never confirms that an unreviewed
 * submission exists. Re-pressing an active reminder is a silent no-op (UNIQUE
 * key) and leaves the row — `notify` included — untouched.
 */
async function setReminder(eventId, userId) {
  const event = await db.queryOne("SELECT id FROM events WHERE id = ? AND status = 'approved'", [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  try {
    await db.execute('INSERT INTO event_reminders (user_id, event_id) VALUES (?, ?)', [userId, eventId]);
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  }
}

async function removeReminder(eventId, userId) {
  await db.execute('DELETE FROM event_reminders WHERE user_id = ? AND event_id = ?', [userId, eventId]);
}

/**
 * Mutes or un-mutes the reminder bell of an event already in «قائمتي» without
 * removing it — `WHERE event_id = ? AND user_id = ?` so a user can only ever
 * touch their own row. 0 affected rows means the event is not in this user's
 * list (or does not exist) — the same 404 for both.
 */
async function setReminderNotify(eventId, userId, notify) {
  const { affectedRows } = await db.execute(
    'UPDATE event_reminders SET notify = ? WHERE event_id = ? AND user_id = ?',
    [notify ? 1 : 0, eventId, userId]
  );
  if (!affectedRows) throw ApiError.notFound('المناسبة ليست في قائمتك');
}

/**
 * «نظّف المنتهية»: deletes this user's followed events whose span already
 * ended — `r.user_id = ?` sits in the DELETE itself, so one user can never
 * clear another's list. Returns how many rows were removed.
 */
async function clearEndedReminders(userId) {
  const { affectedRows } = await db.execute(
    `DELETE r FROM event_reminders r
       JOIN events e ON e.id = r.event_id
      WHERE r.user_id = ? AND ${EVENT_SPAN_END_SQL_E} < CURDATE()`,
    [userId]
  );
  return affectedRows;
}

// --- تأكيد الحضور: «جاي / مش جاي» بحساب (تذكرة #168) وبلا حساب على صفحة
// المشاركة (تذكرة #169) — ADR-0015 ---------------------------------------
//
// One table, two faces. The account face below (`setRsvp`/`removeRsvp`/
// `listEventRsvps`) keys on `(event_id, user_id)`; the share-page face
// (`guestRsvpOpen`/`guestRsvpContext`/`setGuestRsvp`) keys on
// `(event_id, guest_phone)` with `source = 'share_page'` and `user_id` NULL.
// Neither door writes the other's rows, and **no query here selects
// `guest_phone`**: the phone is the guest face's duplicate key and abuse
// control only — it never leaves the server, not even to the event's owner
// (ADR-0015 §2).

/**
 * Whether an occasion type shows its public «كم جاي» counter. Read off the
 * type's own flags, never off its name — with one deliberate exception stated
 * as data, not as a branch: a `solemn` type never shows it. That is the same
 * derivation the migration re-asserts on every run (`add-rsvp-2026-11`), and
 * the response side must not depend on "the next migrate run will fix the flag"
 * — an admin PATCH between two deploys would otherwise put an attendance
 * counter on a funeral for a whole release cycle.
 *
 * **`rsvp_enabled` closes the counter too**, not just the form: ADR-0015 §3
 * says a type with the feature off shows «لا النموذج ولا الزرّ ولا العدّاد»
 * and its route answers 404. Reading only `show_rsvp_count` here left the
 * number leaving the API for a type whose whole feature — and whose route —
 * was switched off.
 *
 * Accepts either shape a caller holds: the type object `attachHonoreesAndTypes`
 * builds (booleans already cast) or a raw SQL row (0/1). A missing key means
 * "not decided" and shows the counter, the same rule
 * `show_followers_count !== false` follows above.
 */
function rsvpCountVisible(occasionType) {
  if (!occasionType || occasionType.tone === 'solemn') return false;
  if (occasionType.rsvp_enabled === false || occasionType.rsvp_enabled === 0) return false;
  if (occasionType.show_rsvp_count === false || occasionType.show_rsvp_count === 0) return false;
  return true;
}

/**
 * أعداد الجايين لكل مناسبة: `SUM(party_size)` في أجوبة «جاي» وحدها، لا عدد
 * الصفوف — الجواب الواحد يحمل مرافقيه. غياب المناسبة من الخريطة يعني صفراً.
 */
async function rsvpGoingCountsForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, SUM(party_size) AS going FROM event_rsvps
      WHERE event_id IN (${placeholders}) AND response = 'yes'
      GROUP BY event_id`,
    eventIds
  );

  const map = {};
  for (const row of rows) map[row.event_id] = Number(row.going);
  return map;
}

/**
 * Attaches `rsvp_going_count` to a list of events already carrying
 * `occasion_type` — **absent entirely**, never zero, when the type hides it
 * (`rsvpCountVisible`). A hidden counter shown as 0 is a lie about the event,
 * so this follows `followers_count` exactly rather than inventing a third rule.
 */
async function attachRsvpCounters(events) {
  if (!events.length) return events;

  const visibleIds = events.filter(event => rsvpCountVisible(event.occasion_type)).map(event => event.id);
  const countsMap = await rsvpGoingCountsForEvents(visibleIds);

  return events.map(event => (
    rsvpCountVisible(event.occasion_type)
      ? { ...event, rsvp_going_count: countsMap[event.id] || 0 }
      : event
  ));
}

/**
 * The row every RSVP read starts from: the event's own status plus its type's
 * three flags — RSVP open, RSVP counter, follower counter — and whether the
 * occasion's span has already ended. `is_expired`
 * is selected here once — by the same EVERY-SPAN rule the share page and the
 * archive reads use — because the guest face on `/e/:id` closes on it
 * (ADR-0015 §3: an ended occasion shows no form) while the account face never
 * did and still does not. `null` for an id no event carries.
 */
async function rsvpContext(eventId) {
  return db.queryOne(
    `SELECT e.id, e.status, ot.rsvp_enabled, ot.show_rsvp_count, ot.show_followers_count, ot.tone,
            (${EVENT_SPAN_END_SQL_E} < CURDATE()) AS is_expired
       FROM events e
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE e.id = ?`,
    [eventId]
  );
}

/**
 * Asserts the event accepts an attendance answer at all, and returns its
 * context row. **One 404 covers all three refusals** — no such event, an event
 * not `approved` (a pending submission must not confirm its own existence), and
 * a type whose `rsvp_enabled` is off — so the route can never be used to probe
 * what is out there. Same door `setReminder` above keeps.
 */
async function assertEventAcceptsRsvp(eventId) {
  const context = await rsvpContext(eventId);
  if (!context || context.status !== 'approved' || !Number(context.rsvp_enabled || 0)) {
    throw ApiError.notFound('هذه المناسبة لا تقبل تأكيد الحضور');
  }
  return context;
}

/** العدّادات التي يجوز أن تُعاد مع حالة الحضور — `{}` حين يخفيها النوع. */
async function rsvpCountersForEvent(eventId, context) {
  const row = context || await rsvpContext(eventId);
  if (!row || !rsvpCountVisible(row)) return {};
  const going = await db.queryOne(
    "SELECT COALESCE(SUM(party_size), 0) AS going FROM event_rsvps WHERE event_id = ? AND response = 'yes'",
    [eventId]
  );
  return { rsvp_going_count: Number(going.going) };
}

/** جواب هذا المستخدم على هذه المناسبة، أو `null`. لا هاتف ولا اسم هنا. */
async function myRsvpFor(eventId, userId) {
  const row = await db.queryOne(
    'SELECT response, party_size, source FROM event_rsvps WHERE event_id = ? AND user_id = ?',
    [eventId, userId]
  );
  if (!row) return null;
  return { response: row.response, party_size: Number(row.party_size), source: row.source };
}

/**
 * «جاي» أو «مش جاي» من حساب — upsert على (event_id, user_id) بجواب واحد لكل
 * حساب: السؤال الثاني يُحدّث الصفّ القائم، ولا يُضيف ثانياً (المفتاح الفريد هو
 * ما يفرض ذلك، لا فحصٌ يسبق الكتابة).
 *
 * و`yes` ينشئ «ذكّرني» **إن غاب** بإعادة استعمال `setReminder` نفسها — لا نسخة
 * SQL ثانية للـINSERT — فيصل تذكير المناسبة تلقائياً. و`no` **لا يلمس** «ذكّرني»:
 * التراجع عن الحضور لا يُخرج المناسبة من «قائمتي»، فالقائمة متابعة لا تعهّد
 * (ADR-0015، والقاعدة نفسها في القسم أعلاه).
 */
async function setRsvp(eventId, userId, { response, partySize }) {
  const context = await assertEventAcceptsRsvp(eventId);

  await db.execute(
    `INSERT INTO event_rsvps (event_id, user_id, response, party_size, source)
     VALUES (?, ?, ?, ?, 'account')
     ON DUPLICATE KEY UPDATE response = VALUES(response), party_size = VALUES(party_size), source = 'account'`,
    [eventId, userId, response, partySize]
  );

  if (response === 'yes') await setReminder(eventId, userId);

  // حالة التذكير من المصدر نفسه الذي يبني التغذية، لا زيادة يخمّنها العميل.
  const [reminderState] = await attachReminderState([{
    id: eventId,
    occasion_type: { show_followers_count: Boolean(context.show_followers_count) }
  }], userId);
  const { id, occasion_type, ...reminderFields } = reminderState;
  return {
    my_rsvp: await myRsvpFor(eventId, userId),
    ...await rsvpCountersForEvent(eventId, context),
    ...reminderFields
  };
}

/**
 * سحب الجواب — يحذف صفّ الحساب وحده (`user_id = ?` في الحذف نفسه، فلا يمسّ
 * جواب حساب آخر)، **ولا يمسّ «ذكّرني»** بالحذف ولا بالإضافة. النوع المطفأ
 * يبقى 404 هنا أيضاً، كالإجابة نفسها.
 */
async function removeRsvp(eventId, userId) {
  const context = await assertEventAcceptsRsvp(eventId);
  await db.execute('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?', [eventId, userId]);
  return { my_rsvp: null, ...await rsvpCountersForEvent(eventId, context) };
}

/**
 * «مين جاي» — قائمة أجوبة الحضور لصاحب المناسبة أو أدمن في نطاقه.
 *
 * **الحكم هنا لا في طبقة المسار** (`CLAUDE.md`: نطاق الأدمن المحلي داخل
 * الاستعلام لا في الراوتر): `user` يُمرَّر إلى الخدمة، و
 * `adminScope.ownerOrTownScopeClause` يبني شرط النطاق الذي يحمله استعلام
 * القائمة نفسه — إضافةً إلى فحص الوجود أولاً بالشرط ذاته — فلا تخرج الأسماء
 * ولو نسي مسارٌ جديد تمرير المستخدم، والرفض **404 لا 403** كي لا يُؤكَّد وجود
 * مناسبة لمن لا يملكها (نفس نمط `assertEventInScope`).
 *
 * **الهاتف لا يُنتقى في هذا الاستعلام أصلاً** — لا `guest_phone` ولا `SELECT *`
 * لتُخفى في JS: عمود لا يدخل النتيجة لا يمكن أن يخرج في ردّ. والاسم من
 * `users.full_name` للحساب ومن `guest_name` للضيف، ولا يُطلب الاسم من العميل
 * لهذا الغرض.
 *
 * Over the two faces (account and share_page) the totals count both, so
 * the owner's number is the same number the public counter shows.
 *
 * كل صفّ يحمل `invite` (تذكرة #183): `{ id, name, opened_at }` للجواب الذي جاء
 * من دعوة شخصية، و`null` لغيره — «مين جاي» ترسم منه «دعوة: فلان — فُتحت/لم
 * تُفتح». والهاتف يبقى خارج كل استعلام في هذا الملف.
 */
async function listEventRsvps(eventId, user) {
  const { clause, params } = await adminScope.ownerOrTownScopeClause(user, 'e');

  // الوجود والنطاق في استعلام واحد: 404 واحدة لما لا يوجد ولما هو خارج النطاق.
  const event = await db.queryOne(
    `SELECT e.id FROM events e WHERE e.id = ?${clause}`,
    [eventId, ...params]
  );
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  const rows = await db.query(
    `SELECT er.id,
            COALESCE(u.full_name, er.guest_name) AS name,
            er.response, er.party_size, er.source,
            er.created_at, er.updated_at,
            ei.id AS invite_id, ei.name AS invite_name, ei.opened_at AS invite_opened_at
       FROM event_rsvps er
       JOIN events e ON e.id = er.event_id
       LEFT JOIN users u ON u.id = er.user_id
       LEFT JOIN event_invites ei ON ei.id = er.invite_id
      WHERE er.event_id = ?${clause}
      ORDER BY er.response DESC, er.created_at ASC, er.id ASC`,
    [eventId, ...params]
  );

  const rsvps = rows.map(row => ({
    id: row.id,
    name: row.name || '',
    response: row.response,
    party_size: Number(row.party_size),
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // الدعوة الشخصية التي جاء منها الجواب (تذكرة #183): `null` لجواب عادي.
    // `opened_at` يُقرأ من صفّ الدعوة نفسه، فلا عمود ثانٍ ولا حساب في العميل.
    invite: row.invite_id === null
      ? null
      : { id: row.invite_id, name: row.invite_name || '', opened_at: row.invite_opened_at }
  }));

  const goingRows = rsvps.filter(rsvp => rsvp.response === 'yes');
  return {
    rsvps,
    totals: {
      // مجموع العدد في «جاي» — الرقم نفسه الذي يحمله `rsvp_going_count`.
      going_count: goingRows.reduce((sum, rsvp) => sum + rsvp.party_size, 0),
      going_rows: goingRows.length,
      not_going_rows: rsvps.filter(rsvp => rsvp.response === 'no').length,
      total_rows: rsvps.length
    }
  };
}

/**
 * هل تُعرض بوابة جواب الضيف على هذه المناسبة الآن؟ القاعدة **الواحدة** التي
 * تقرأها الصفحة (`GET /e/:id` ترسم النموذج أو لا) والمسار (`POST /e/:id/rsvp`
 * يردّ الـ404 الموحّدة) — نسخة ثانية منها تعني يوماً نموذجاً ظاهراً فوق باب
 * مغلق.
 *
 * ثلاثة شروط، كلها من ADR-0015 §3 وطلب #169: المناسبة معتمدة، ونوعها
 * `rsvp_enabled` مفتوحاً، ومداها لم ينتهِ بعد (`is_expired`). وتقبل الصيغتين
 * اللتين يملكهما المستدعي: صفّ `rsvpContext` الخام (‏0/1) وكائن
 * `getShareEvent` (‏`is_expired` منطقي) — ولذلك يُنتقى `status` هناك أيضاً.
 */
function guestRsvpOpen(row) {
  if (!row) return false;
  if (row.status !== 'approved') return false;
  if (!Number(row.rsvp_enabled || 0)) return false;
  return !row.is_expired;
}

/**
 * صفّ الأهلية أو `null`. لا يرمي: الصفحة تسأل «نموذج أو لا» لا «أي خطأ»،
 * والـ404 الموحّدة للصفحة (‏HTML) لا لهذا النداء — والمسار وحده يترجم `null`
 * إلى تلك الصفحة.
 */
async function guestRsvpContext(eventId) {
  const context = await rsvpContext(eventId);
  return guestRsvpOpen(context) ? context : null;
}

/**
 * جواب ضيف بلا حساب من نموذج `/e/:id` — upsert على `(event_id, guest_phone)`
 * بـ`source = 'share_page'`: الإرسال الثاني بالهاتف نفسه يُحدّث الاسم والعدد
 * والجواب في الصفّ القائم ولا يُضيف صفاً ثانياً (المفتاح الفريد هو ما يفرض
 * ذلك، لا فحصٌ يسبق الكتابة). و`party_size` يبقى معنىً واحداً في الوجهين:
 * إجمالي الحاضرين بمن فيهم صاحب الجواب.
 *
 * **الأهلية تُفحص هنا أيضاً لا في المسار وحده:** منادٍ مستقبلي يتجاوز المسار
 * لا يكتب جواباً على نوع مطفأ أو مناسبة منتهية، والرفض 404 لا 403 كي لا
 * يؤكَّد وجود المناسبة لمن لا يملكها — نفس باب `assertEventAcceptsRsvp`.
 *
 * **`guest_phone` لا يغادر هذا الملف:** الصفّ يُكتب، والقيمة المُعادة عدّاداتٌ
 * وحدها (`rsvpCountersForEvent`) — لا هاتف ولا اسم.
 *
 * **`inviteId` (تذكرة #183):** يُمرَّر حين جاء الجواب من صفحة دعوة شخصية
 * (`/e/:id/i/:token`)، فيُكتب في الصفّ **وفي `ON DUPLICATE KEY UPDATE`** معاً —
 * إعادة الجواب بالهاتف نفسه تحدّث الاسم والعدد **والإشارة إلى الدعوة**، فلا يبقى
 * الصفّ مربوطاً بدعوة اختار صاحبها جواباً من صفحة المناسبة العامة بعدها. والجواب
 * العادي (بلا دعوة) يمرّره `null` صراحةً.
 */
async function setGuestRsvp(eventId, { name, phone, response, partySize, inviteId = null }) {
  const context = await guestRsvpContext(eventId);
  if (!context) throw ApiError.notFound('هذه المناسبة لا تقبل تأكيد الحضور');

  await db.execute(
    `INSERT INTO event_rsvps (event_id, user_id, guest_name, guest_phone, invite_id, response, party_size, source)
     VALUES (?, NULL, ?, ?, ?, ?, ?, 'share_page')
     ON DUPLICATE KEY UPDATE guest_name = VALUES(guest_name), response = VALUES(response),
       party_size = VALUES(party_size), invite_id = VALUES(invite_id), source = 'share_page'`,
    [eventId, name, phone, inviteId, response, partySize]
  );

  return { ...await rsvpCountersForEvent(eventId, context) };
}

// --- الدعوات الشخصية: «أهلاً فلان» (تذكرة #183) --------------------
//
// صاحب المناسبة ينشئ لكل ضيف دعوةً برابط `/e/:id/i/<token>`، والصفحة تعرض اسم
// الضيف ونموذج الحضور نفسه من #169 باسمه مسبقاً. القواعد هنا:
//
// - **الحكم داخل استعلام الخدمة** بنفس `adminScope.ownerOrTownScopeClause` الذي
//   يستعمله `listEventRsvps` — لا في طبقة المسار — والرفض **404 لا 403** كي لا
//   يُؤكَّد وجود مناسبة لمن لا يملكها.
// - **التوكِن عشوائي من `crypto`**: 32 حرفاً hex، ولا يُشتقّ من الاسم ولا من
//   المعرّف — توكِن يُخمَّن يعني قائمة ضيوف مكشوفة لمن يجرّب.
// - **الهاتف لا يدخل استعلاماً هنا أصلاً**، كحال «مين جاي».

/** توكِن دعوة واحد: 32 حرفاً hex صغيراً من مولّد العشوائية النظامي. */
function inviteToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * هل هذا نصّ توكِن دعوة بالشكل الوحيد الذي يولّده الخادم؟ يُستعمل في الصفحة
 * والمسار معاً، فلا يُقارَن رمزٌ قصير أو بحروف كبيرة بقاعدة البيانات أصلاً —
 * والرمز الخاطئ والشكل الخاطئ كلاهما 404 موحّدة بلا تفريق.
 */
const INVITE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

function isInviteToken(value) {
  return typeof value === 'string' && INVITE_TOKEN_PATTERN.test(value);
}

/**
 * بوابة الملكية للمناسبة: شرط النطاق وفحص الوجود في استعلام واحد، أو 404.
 * مشتركة بين الوظائف الأربع هنا، والشرط نفسه يبنيه
 * `adminScope.ownerOrTownScopeClause` كما في `listEventRsvps` — وهو ما يمنع
 * افتراق قائمة الدعوات عن قائمة الحضور يوماً. وتُعاد القطعة مع معاملاتها
 * ليستعملها الاستعلام الرئيسي أيضاً بلا بناء ثانٍ.
 */
async function eventManagementScope(eventId, user) {
  const { clause, params } = await adminScope.ownerOrTownScopeClause(user, 'e');
  const event = await db.queryOne(`SELECT e.id FROM events e WHERE e.id = ?${clause}`, [eventId, ...params]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');
  return { clause, params };
}

/**
 * إدراج دعوة واحدة بتوكِن جديد، وإعادة التوليد عند تصادم المفتاح الفريد.
 * `ER_DUP_ENTRY` هنا لا يعني شيئاً آخر: `token` هو المفتاح الفريد الوحيد على
 * `event_invites` غير المعرّف الذاتي. وإعادة المحاولة في المعاملة نفسها آمنة —
 * خطأ تكرار المفتاح على `INSERT` لا يُسقط معاملة InnoDB. وبعد ثلاث إعادات
 * يُرمى الخطأ أخيراً بدل حلقة لا تنتهي؛ والنصّ عربي لأنه قد يصل المستخدم.
 */
const INVITE_TOKEN_RETRIES = 3;

async function insertInviteWithFreshToken(connection, eventId, name) {
  for (let attempt = 0; ; attempt += 1) {
    const token = inviteToken();
    try {
      const [result] = await connection.execute(
        'INSERT INTO event_invites (event_id, name, token) VALUES (?, ?, ?)',
        [eventId, name, token]
      );
      return { id: result.insertId, name, token };
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY' || attempt >= INVITE_TOKEN_RETRIES) {
        if (err.code === 'ER_DUP_ENTRY') {
          throw ApiError.conflict('تعذّر توليد رابط دعوة فريد — أعد المحاولة');
        }
        throw err;
      }
      logger.warn(`[invites] token collision on event ${eventId}, regenerating (attempt ${attempt + 1}).`);
    }
  }
}

/**
 * إنشاء دعوة لكل اسم في الطلب، في **معاملة واحدة**: قائمة منتصفة الإنشاء ليست
 * نتيجة يريدها صاحب المناسبة، والأسماء نفسها قد تتكرّر (ضيفان باسم واحد) فلا
 * مفتاح فريد على `name`.
 */
async function createEventInvites(eventId, names, user) {
  await eventManagementScope(eventId, user);

  return db.transaction(async connection => {
    const created = [];
    for (const name of names) {
      created.push(await insertInviteWithFreshToken(connection, eventId, name));
    }
    return created;
  });
}

/**
 * دعوات المناسبة بترتيب إنشائها، لكل واحدة جوابها إن وُجد — `LEFT JOIN` واحد
 * على `event_rsvps.invite_id`، وشرط النطاق نفسه الذي يحمله `listEventRsvps`
 * (‏`clause` على الصفّ المُنضَمّ، بعد فحص الوجود أولاً) فلا تفترق القائمتان.
 * ووصفٌّ واحد للجواب لا أكثر: يُقرأ الصفّ ذو أكبر `id` (`MAX(latest.id)`) —
 * أحدثُ صفٍّ **إنشاءً**، لا أحدثُ جوابٍ تحديثاً — لأن توكِن واحداً قد يجيب منه
 * أكثر من هاتف (ضيفان في بيت واحد)، وقائمة الدعوات صفٌّ لكل **دعوة**. فإعادةُ
 * جوابٍ على صفٍّ قائم لا تجعله هو الظاهر.
 */
async function listEventInvites(eventId, user) {
  const { clause, params } = await eventManagementScope(eventId, user);

  const rows = await db.query(
    `SELECT i.id, i.name, i.token, i.opened_at,
            er.response AS rsvp_response, er.party_size AS rsvp_party_size
       FROM event_invites i
       JOIN events e ON e.id = i.event_id
       LEFT JOIN event_rsvps er
              ON er.id = (SELECT MAX(latest.id) FROM event_rsvps latest WHERE latest.invite_id = i.id)
      WHERE i.event_id = ?${clause}
      ORDER BY i.created_at ASC, i.id ASC`,
    [eventId, ...params]
  );

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    token: row.token,
    opened_at: row.opened_at,
    rsvp: row.rsvp_response === null
      ? null
      : { response: row.rsvp_response, party_size: Number(row.rsvp_party_size) }
  }));
}

/**
 * حذف دعوة واحدة من هذه المناسبة. الشرطان في `DELETE` نفسه: الملكية (بفحص
 * المناسبة أعلاه) والانتماء (`id = ? AND event_id = ?`) — فدعوة مناسبة أخرى
 * تعطي 404 لا حذفاً. والجواب يبقى: القيد `ON DELETE SET NULL` يفكّ الإشارة وحدها.
 */
async function deleteEventInvite(eventId, inviteId, user) {
  await eventManagementScope(eventId, user);

  const result = await db.execute(
    'DELETE FROM event_invites WHERE id = ? AND event_id = ?',
    [inviteId, eventId]
  );
  if (!result.affectedRows) throw ApiError.notFound('الدعوة غير موجودة');
}

/**
 * دعوة بصفحتها العامة: الصفّ أو `null` بلا رمي — صفحة الدعوة تسأل «دعوة أو لا»،
 * والـ404 الموحّدة قرار المسار لا قرار هذا النداء. ولا هاتف ولا صفوف أجوبة هنا.
 */
async function resolveInvite(eventId, token) {
  return db.queryOne(
    'SELECT id, name, token, opened_at FROM event_invites WHERE event_id = ? AND token = ?',
    [eventId, token]
  );
}

/**
 * «فُتحت الدعوة» — تُكتب **مرة واحدة**: `WHERE opened_at IS NULL` يجعل الفتح
 * الثاني (والثالث) بلا أثر، فلا يتغيّر التاريخ الذي يقرؤه صاحب المناسبة.
 * والفشل يُسجَّل عند المستدعي ولا يُسقط الصفحة: تسجيل الفتح لا يستحق صفحة 500.
 */
async function markInviteOpened(inviteId) {
  await db.execute(
    'UPDATE event_invites SET opened_at = NOW() WHERE id = ? AND opened_at IS NULL',
    [inviteId]
  );
}

/**
 * The «قائمتي» bucket one followed event falls into, given how far its span
 * sits from today and today's day-of-week (1 = Sunday … 7 = Saturday, so the
 * week runs Sunday–Saturday like the feed's «هذا الأسبوع»). Pure and exported
 * for its own test — `listMyReminders` reads every verdict from here, never a
 * second copy of the rule. First match wins:
 *   now          the event is running today (its span covers CURDATE())
 *   tomorrow     starts tomorrow
 *   this_week    starts later this week — `7 - todayDow` days remain of it
 *   later        starts further ahead than this week
 *   ended_recent ended within the last 7 days (rolling, deliberately NOT
 *                "since Sunday": a Thursday–Saturday wedding must not vanish
 *                from the list on Sunday)
 *   ended        anything older
 */
function myListBucket(daysUntilStart, daysUntilEnd, todayDow) {
  if (daysUntilStart <= 0 && daysUntilEnd >= 0) return 'now';
  if (daysUntilStart === 1) return 'tomorrow';
  if (daysUntilStart >= 2 && daysUntilStart <= (7 - todayDow)) return 'this_week';
  if (daysUntilStart > 0) return 'later';
  if (daysUntilEnd >= -7) return 'ended_recent';
  return 'ended';
}

/** The «قائمتي» buckets that count as "upcoming" — everything still ahead of the reader. */
const UPCOMING_MY_LIST_BUCKETS = new Set(['now', 'tomorrow', 'this_week', 'later']);

/**
 * «قائمتي» — the visible face of this user's «ذكّرني» follows. Only approved
 * events appear (a followed submission elsewhere is a review matter, not a
 * list entry), upcoming first then the recently ended. Every row carries its
 * span's own dates, a `bucket` (myListBucket) so a client can group without
 * re-deriving dates, the mute flag (`notify`), when it was saved (`saved_at`),
 * and `date_change` when a still-current announcement about the date was
 * published AFTER the user saved the event — an announcement that predates
 * the follow is old news the user never asked to track.
 *
 * `legacyOnly` applies the same occasion-type filter as the list/map/detail
 * endpoints (listLiveAnnouncements' pattern), so a pre-#20 client never sees a
 * type it cannot render. Returns a plain object — the route spreads it. The
 * span comes from the shared EVENT_SPAN_* constants, never a hand-written
 * COALESCE, and the announcement columns are stripped before the shape leaves.
 */
async function listMyReminders(userId, { legacyOnly = false } = {}) {
  const conditions = ["e.status = 'approved'", 'r.user_id = ?'];
  const params = [userId];
  // The under-review count answers the same client's question as the list
  // itself, so it carries the same legacy door: a pre-#20 client must never be
  // told that a pending event of a type it cannot render is «قيد المراجعة».
  const underReviewConditions = ["e.status = 'pending'", 'r.user_id = ?'];
  const underReviewParams = [userId];

  if (legacyOnly) {
    const legacyTypeIds = await occasionTypes.getLegacyTypeIds();
    if (!legacyTypeIds.length) {
      return { events: [], counts: { all: 0, upcoming: 0, ended: 0 }, under_review_count: 0 };
    }
    const legacyClause = `e.occasion_type_id IN (${legacyTypeIds.map(() => '?').join(',')})`;
    conditions.push(legacyClause);
    params.push(...legacyTypeIds);
    underReviewConditions.push(legacyClause);
    underReviewParams.push(...legacyTypeIds);
  }

  // The span and bucket helpers are computed inside a derived table and the
  // ORDER BY runs over its columns — so the upcoming/ended split and its two
  // sort directions read each helper once, as a real column, instead of
  // re-expanding the whole span fragment five times in the ordering.
  // The announcement's three columns come from one correlated, parameter-free
  // subquery each (LIMIT 1, newest first) rather than a JOIN: only one row per
  // event can ever be current, but a JOIN would silently double the event in
  // the list if that invariant ever broke.
  const rows = await db.query(
    `SELECT * FROM (
       SELECT e.*, r.notify, r.created_at AS saved_at,
              DATE_FORMAT(${EVENT_SPAN_START_SQL_E}, '%Y-%m-%d') AS span_start,
              DATE_FORMAT(${EVENT_SPAN_END_SQL_E}, '%Y-%m-%d') AS span_end,
              DATEDIFF(${EVENT_SPAN_START_SQL_E}, CURDATE()) AS days_until_start,
              DATEDIFF(${EVENT_SPAN_END_SQL_E}, CURDATE()) AS days_until_end,
              DAYOFWEEK(CURDATE()) AS today_dow,
              (SELECT a.old_value FROM event_announcements a
                WHERE a.event_id = e.id AND a.is_current = 1 AND a.published_at > r.created_at
                ORDER BY a.published_at DESC, a.id DESC LIMIT 1) AS announcement_old_value,
              (SELECT a.new_value FROM event_announcements a
                WHERE a.event_id = e.id AND a.is_current = 1 AND a.published_at > r.created_at
                ORDER BY a.published_at DESC, a.id DESC LIMIT 1) AS announcement_new_value,
              (SELECT a.published_at FROM event_announcements a
                WHERE a.event_id = e.id AND a.is_current = 1 AND a.published_at > r.created_at
                ORDER BY a.published_at DESC, a.id DESC LIMIT 1) AS announcement_published_at
         FROM event_reminders r
         JOIN events e ON e.id = r.event_id
        WHERE ${conditions.join(' AND ')}
     ) listed
      ORDER BY (days_until_end >= 0) DESC,
               CASE WHEN days_until_end >= 0 THEN span_start END ASC,
               CASE WHEN days_until_end >= 0 THEN id END ASC,
               CASE WHEN days_until_end < 0 THEN span_end END DESC,
               CASE WHEN days_until_end < 0 THEN id END DESC`,
    params
  );

  const withRelations = await attachHonoreesAndTypes(rows.map(withAbsoluteMedia));
  const withReminderState = await attachReminderState(withRelations, userId);

  const counts = { all: 0, upcoming: 0, ended: 0 };
  const events = withReminderState.map(row => {
    const {
      days_until_end, today_dow,
      announcement_old_value, announcement_new_value, announcement_published_at,
      ...event
    } = row;

    const bucket = myListBucket(Number(row.days_until_start), Number(row.days_until_end), Number(row.today_dow));
    counts.all += 1;
    if (UPCOMING_MY_LIST_BUCKETS.has(bucket)) counts.upcoming += 1;
    else counts.ended += 1;

    return {
      ...event,
      notify: Boolean(event.notify),
      saved_at: event.saved_at,
      span_start: event.span_start,
      span_end: event.span_end,
      days_until_start: Number(event.days_until_start),
      bucket,
      date_change: announcement_published_at
        ? {
          old_value: announcement_old_value,
          new_value: announcement_new_value,
          published_at: announcement_published_at
        }
        : null
    };
  });

  const { total } = await db.queryOne(
    `SELECT COUNT(*) AS total FROM event_reminders r
       JOIN events e ON e.id = r.event_id
      WHERE ${underReviewConditions.join(' AND ')}`,
    underReviewParams
  );

  return { events, counts, under_review_count: Number(total) };
}

/**
 * Live date-change announcements (#20 step 7): the current one per event,
 * still relevant (its event hasn't finished), shaped as a card pointing back
 * at the original event. `legacyOnly` applies the same occasion-type filter
 * as the list/map/detail endpoints — an announcement about a type an old
 * client cannot render must not leak through this door either.
 *
 * `regionId` (تذكرة #121) يعزل الإعلان في محافظة الطلب وحدها كما في مسارات
 * القائمة والخريطة والتفاصيل: عدد صحيح يقصر الإعلانات على مناسبات تلك
 * المحافظة، و`null` تعني «بلا تقييد» لكل نداء داخلي لا يعرف المحافظات،
 * والمسار العام يمرّر دائماً محافظة محلولة (`middleware/region.js`).
 *
 * **`event` يحمل بيانات الكرت كاملة، لا حقولاً مختصرة:** نفس `LIST_COLUMNS`
 * التي تحملها القائمة العامة + `village_name` من `villages`، ثم
 * `withAbsoluteMedia` و`attachHonoreesAndTypes` — فتصله `honorees`
 * و`occasion_type` (بحقوله وتسمياته) و`extra_days` و`poster_url`. الحقول
 * المختصرة كانت تُظهر «رهط» وحدها حين يكون `title` اسم البلدة، فتتطابق كرتان
 * لمناسبتين مختلفتين في البلدة نفسها. والحقول القديمة (`title`, `groom_name`,
 * `town`, `event_date`, `event_end_date`, `occasion_type_id`, `poster_url`)
 * باقية كلها كي لا تنكسر نسخة `1.21.3` المنشورة على Google Play — الحقول
 * الزائدة تتجاهلها.
 */
async function listLiveAnnouncements({ legacyOnly = false, regionId = null } = {}) {
  const conditions = [
    'a.is_current = 1', PUBLIC_EVENT_VISIBLE_SQL_EVENTS,
    `${EVENT_SPAN_END_SQL_EVENTS} >= CURDATE()`
  ];
  // شرط الظهور أول شرط فيه `?`، فالساعة أول `params` — قبل شرط المحافظة والقائمة.
  const params = [publishNowClock()];

  if (regionId !== null && regionId !== undefined) {
    conditions.push('events.region_id = ?');
    params.push(regionId);
  }

  if (legacyOnly) {
    const legacyTypeIds = await occasionTypes.getLegacyTypeIds();
    if (!legacyTypeIds.length) return [];
    conditions.push(`events.occasion_type_id IN (${legacyTypeIds.map(() => '?').join(',')})`);
    params.push(...legacyTypeIds);
  }

  // `a.id AS announcement_id` ضروري: `event_announcements.id` و`events.id`
  // كلاهما `id`، واستعمال أحدهما بلا استعارة يُفقد الآخر. `village_name`
  // يُضاف من `villages` كما في `listPublicEvents` — القرية مكان يشير إليه
  // `village_id`، ولا يُخزَّن على المناسبة نفسها.
  const rows = await db.query(
    `SELECT ${LIST_COLUMNS}, villages.name AS village_name,
            a.id AS announcement_id, a.event_id, a.old_value, a.new_value, a.published_at
       FROM event_announcements a
       JOIN events ON events.id = a.event_id
       LEFT JOIN villages ON villages.id = events.village_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.published_at DESC`,
    params
  );

  // استعلامات مجمَّعة لا استعلام داخل حلقة: أصحاب المناسبة والأيام والنوع
  // تُجلب لكل الإعلانات دفعة واحدة، كما في `listPublicEvents`.
  const withCardData = await attachHonoreesAndTypes(rows.map(withAbsoluteMedia));

  return withCardData.map(row => {
    const { announcement_id, event_id, old_value, new_value, published_at, ...event } = row;
    return { id: announcement_id, event_id, old_value, new_value, published_at, event };
  });
}

/** Groups honorees by event id, ordered by position: { [eventId]: [{ name, role, position }] }. */
async function honoreesForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, name, role, position FROM event_honorees
      WHERE event_id IN (${placeholders})
      ORDER BY event_id ASC, position ASC`,
    eventIds
  );

  const map = {};
  for (const row of rows) {
    (map[row.event_id] || (map[row.event_id] = [])).push({ name: row.name, role: row.role, position: row.position });
  }
  return map;
}

/**
 * Groups extra days by event id — «برنامج المناسبة» — ordered by date, then by
 * time, then by the row's own position (تذكرة #176): two stations on the same
 * date of a multi-day occasion (حنّة الظهر ثم حنّة المساء، أو مهرجان يومين في
 * قاعة واحدة) read in the order they actually happen, not in the order the form
 * happened to build them. `position` stays the last tie-break so two stations
 * with the same (or no) written time keep the publisher's own order.
 *
 * `day_time` is free text (`VARCHAR`), so the comparison is lexicographic on
 * whatever the publisher typed; a station with no written time comes first
 * (MySQL's own ASC order puts NULL before any value).
 */
async function eventDaysForEvents(eventIds) {
  if (!eventIds.length) return {};

  const placeholders = eventIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT event_id, name, day_date, place, day_time, position FROM event_days
      WHERE event_id IN (${placeholders})
      ORDER BY event_id ASC, day_date ASC, day_time ASC, position ASC`,
    eventIds
  );

  const map = {};
  for (const row of rows) {
    (map[row.event_id] || (map[row.event_id] = [])).push({
      name: row.name,
      day_date: row.day_date,
      place: row.place,
      day_time: row.day_time,
      position: row.position
    });
  }
  return map;
}

/** Attaches honorees, extra days and occasion-type info to a list of raw event rows (media already made absolute). */
async function attachHonoreesAndTypes(rows) {
  if (!rows.length) return [];

  const [honoreeMap, extraDayMap, typeMap] = await Promise.all([
    honoreesForEvents(rows.map(row => row.id)),
    eventDaysForEvents(rows.map(row => row.id)),
    occasionTypes.getTypesByIds(rows.map(row => row.occasion_type_id))
  ]);

  return rows.map(row => ({
    ...row,
    honorees: honoreeMap[row.id] || [],
    extra_days: extraDayMap[row.id] || [],
    occasion_type: row.occasion_type_id ? (typeMap[row.occasion_type_id] || null) : null
  }));
}

/**
 * Resolves the `occasion_type_id` list a query should filter by, combining a
 * caller's requested ids (if any) with the legacy-client restriction (if
 * any) by INTERSECTION rather than override — a legacy client asking for a
 * type it cannot render must get an empty result, never a widened one (#85
 * batch 5: "silence beats a funeral drawn as a wedding"). `null` means no
 * restriction at all; an empty array means the filter can match nothing, and
 * the caller must short-circuit without a query. Shared by `listPublicEvents`
 * and `listMapPoints` so the two can't drift apart.
 */
async function resolveTypeFilterIds({ legacyOnly, occasionTypeIds }) {
  if (legacyOnly) {
    const legacyTypeIds = await occasionTypes.getLegacyTypeIds();
    return occasionTypeIds ? occasionTypeIds.filter(id => legacyTypeIds.includes(id)) : legacyTypeIds;
  }
  return occasionTypeIds;
}

/**
 * Builds the place filter for `towns`/`villageIds` — a UNION of what the
 * caller picked, never an intersection. `events.village_id` is non-NULL
 * ONLY when `town = 'القرى والتجمعات'` (the villages catch-all), so ANDing a
 * specific town together with a village produces zero rows for exactly the
 * combination a single searchable place picker naturally creates — pick
 * «رهط» and one village together (stories 40/41, "عائلتي موزّعة") and an AND
 * can never match anything (#85 batch 5, FIX 2). When only one of the two is
 * given, the result is that single `IN (...)` clause, unchanged.
 *
 * `villageColumn` lets each caller qualify the column its own query needs
 * (`events.village_id` alongside a JOIN, plain `village_id` otherwise)
 * without a second copy of this logic — shared by `listPublicEvents` and
 * `listMapPoints` so the two can't drift apart the way they already had.
 */
function buildPlaceCondition(towns, villageIds, villageColumn) {
  const townClause = towns ? `town IN (${towns.map(() => '?').join(',')})` : null;
  const villageClause = villageIds ? `${villageColumn} IN (${villageIds.map(() => '?').join(',')})` : null;

  if (townClause && villageClause) {
    return { clause: `(${townClause} OR ${villageClause})`, params: [...towns, ...villageIds] };
  }
  if (townClause) return { clause: townClause, params: [...towns] };
  if (villageClause) return { clause: villageClause, params: [...villageIds] };
  return null;
}

/**
 * Approved events, optionally filtered by town, date, occasion type and
 * free-text search — paginated, upcoming-first (or archived-first when
 * `archive` is set), with per-card congratulation stats attached.
 *
 * `archive`: false (default) shows only what has not finished yet —
 * `span_end >= CURDATE()` (see the EVENT_SPAN_* constants), so a multi-day عزا
 * that started yesterday still shows today — and so does a wedding whose
 * fixed date has passed but whose حنّة day or youth party is still ahead.
 * `archive: true` flips to what already ended (`span_end < CURDATE()`),
 * newest-ended first, reached only on explicit request so it never crowds out
 * what's upcoming (#20 step 4, decision أ).
 *
 * `dateFrom`/`dateTo` (either may be alone) are the clients' date filter. An
 * event is in the range when any of its days is (`span_start <= dateTo` and
 * `span_end >= dateFrom`) — overlap, not start date, so a multi-day عزا
 * covering the range is in it, and so is a day filed only as an extra day or
 * a youth party. The range REPLACES the upcoming/archive cut instead of
 * intersecting it: the reader asked for these days, and a day picked in the
 * past must not come back empty just because the archive switch is off.
 * `archive` then only sets the order.
 *
 * `towns`, `occasionTypeIds` and `villageIds` are each either `null` (no
 * filter) or a non-empty array — a single value is simply a one-element
 * array, built as a one-element `IN (?)` (#85 batch 5). `towns`/`villageIds`
 * combine as a UNION via `buildPlaceCondition`, never an AND (FIX 2).
 * `legacyOnly` still intersects `occasionTypeIds` via `resolveTypeFilterIds`
 * — a legacy client's own UI cannot even render a type outside its supported
 * set, so asking for one by id must never widen past it (#20 step 4,
 * decision و).
 *
 * `regionId` (تذكرة #121) is the discovery feed's governorate filter: an
 * integer narrows to that region, `null` means "no restriction" so every
 * internal caller that knows nothing about regions keeps its behaviour
 * unchanged. The public route always passes a resolved region
 * (`middleware/region.js`), never `null`.
 */
async function listPublicEvents({
  towns = null, date, dateFrom = null, dateTo = null, search, occasionTypeIds = null, villageIds = null,
  legacyOnly = false, archive = false, upcoming = false, page = 1, limit = DEFAULT_PAGE_SIZE, userId = null,
  regionId = null
} = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);

  const conditions = [PUBLIC_EVENT_VISIBLE_SQL_EVENTS];
  const params = [publishNowClock()];

  if (regionId !== null && regionId !== undefined) {
    conditions.push('events.region_id = ?');
    params.push(regionId);
  }

  if (dateFrom || dateTo) {
    if (dateFrom) {
      conditions.push(`${EVENT_SPAN_END_SQL_EVENTS} >= ?`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`${EVENT_SPAN_START_SQL_EVENTS} <= ?`);
      params.push(dateTo);
    }
  } else if (archive) {
    conditions.push(`${EVENT_SPAN_END_SQL_EVENTS} < CURDATE()`);
  } else if (upcoming) {
    // حدّ «القادم» هنا **وحده** صار نافذة بقاء النوع (تذكرة #167)؛ الخريطة
    // والتذكيرات على `span_end >= CURDATE()` كما هي.
    conditions.push(EVENT_FEED_WINDOW_SQL_EVENTS);
  }

  const typeFilterIds = await resolveTypeFilterIds({ legacyOnly, occasionTypeIds });
  if (typeFilterIds && !typeFilterIds.length) {
    return { events: [], pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 } };
  }
  if (typeFilterIds) {
    conditions.push(`occasion_type_id IN (${typeFilterIds.map(() => '?').join(',')})`);
    params.push(...typeFilterIds);
  }

  const placeCondition = buildPlaceCondition(towns, villageIds, 'events.village_id');
  if (placeCondition) {
    conditions.push(placeCondition.clause);
    params.push(...placeCondition.params);
  }

  if (date) {
    conditions.push('event_date = ?');
    params.push(date);
  }

  if (search) {
    // The EXISTS subquery (not a JOIN) is deliberate: a JOIN against the 1..N
    // event_honorees table would return one row per matching honoree, i.e.
    // the same event several times over.
    conditions.push(
      `(groom_name LIKE ? ESCAPE '\\\\' OR family_clan LIKE ? ESCAPE '\\\\'
        OR title LIKE ? ESCAPE '\\\\' OR location_name LIKE ? ESCAPE '\\\\'
        OR town LIKE ? ESCAPE '\\\\'
        OR EXISTS (
             SELECT 1 FROM event_honorees eh
              WHERE eh.event_id = events.id AND eh.name LIKE ? ESCAPE '\\\\'
           ))`
    );
    const term = `%${escapeLike(search)}%`;
    params.push(term, term, term, term, term, term);
  }

  const whereClause = conditions.join(' AND ');

  const { total } = await db.queryOne(`SELECT COUNT(*) AS total FROM events WHERE ${whereClause}`, params);

  const offset = (safePage - 1) * safeLimit;
  // «مناسبة كبرى» (تذكرة #171): المبرزة النشِطة تتصدّر **تغذية محافظتها وحدها**،
  // فالبادئة مشروطة بأن الطلب مقيَّد بمحافظة واحدة (`regionId !== null`). طلب
  // «كل المحافظات» (`all_regions=1`، فيعود `regionId` هنا `null`) يخلط صفوف
  // محافظات عدة، وإبرازُ صفٍّ فوقها جميعاً يجعل مناسبةً «كبرى» في محافظةٍ تتصدّر
  // تغذية غير تغذيتها — وهو ما تنفيه التذكرة. والصفّ نفسه يبقى `is_featured`
  // صادقاً في كل قراءة؛ الترتيب وحده هو ما يُقيَّد.
  //
  // وتوضع **قبل** الترتيب القائم لا مكانه: المبرزة تسبق كل ما كان يتصدّر،
  // والبقية تبقى على ترتيبها حرفاً بحرف. ولا تمسّ `COUNT(*)` فوقها لأنها عمود
  // ترتيب لا شرط — فالترقيم يُعدّ الصفوف نفسها التي تُعاد.
  const featuredFirst = regionId !== null && regionId !== undefined ? 'is_featured DESC, ' : '';
  let orderClause;
  if (archive) {
    orderClause = 'events.event_date DESC, events.id DESC';
  } else if (upcoming || dateFrom || dateTo) {
    orderClause = 'events.event_date ASC, events.id ASC';
  } else {
    // Default (all events): upcoming/active first (chronological), then ended (reverse-chronological)
    orderClause = `(span_end_order >= CURDATE()) DESC,
      CASE WHEN span_end_order >= CURDATE() THEN events.event_date END ASC,
      CASE WHEN span_end_order >= CURDATE() THEN events.id END ASC,
      CASE WHEN span_end_order < CURDATE() THEN events.event_date END DESC,
      CASE WHEN span_end_order < CURDATE() THEN events.id END DESC`;
  }
  orderClause = `${featuredFirst}${orderClause}`;

  // LIMIT/OFFSET as bound parameters, not string-concatenated — same
  // parameterization rule as every other value in this query. `village_name`
  // is joined in, never stored on `events` itself — a village is a place
  // `village_id` merely points at.
  const rows = await db.query(
    `SELECT ${LIST_COLUMNS}, villages.name AS village_name,
            (${EVENT_SPAN_END_SQL_EVENTS}) AS span_end_order,
            (${EVENT_SPAN_END_SQL_EVENTS} < CURDATE()) AS is_ended,
            (${EVENT_FEATURED_ACTIVE_SQL_EVENTS}) AS is_featured
       FROM events
       LEFT JOIN villages ON villages.id = events.village_id
      WHERE ${whereClause} ORDER BY ${orderClause} LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  const eventIds = rows.map(e => e.id);
  const [reactionMap, congratsMap, withRelations] = await Promise.all([
    reactionsForEvents(eventIds),
    congratulationsForEvents(eventIds),
    attachHonoreesAndTypes(rows.map(withAbsoluteMedia))
  ]);

  const events = withRelations.map(event => {
    // «انتهت» (تذكرة #167): الحكم على امتداد أيام المناسبة كاملاً يُحسب في
    // القاعدة (`EVENT_SPAN_END_SQL_EVENTS`، لا عميل يحسبه) ويصل منطقياً لا 1/0.
    // و«مناسبة كبرى» (تذكرة #171) كذلك: `is_featured` منطقي يُحسب بـ`CURDATE()`
    // في القاعدة، فلا يقرّر عميلٌ أن الإبراز انتهى بساعته.
    const shaped = {
      ...event,
      reactions: reactionMap[event.id] || EMPTY_REACTIONS(),
      is_ended: Boolean(event.is_ended),
      is_featured: Boolean(event.is_featured)
    };

    // Hidden by type flag, not by name — the counter/preview never appears
    // for an occasion type whose admin turned it off (#20 step 4, decision د).
    if (event.occasion_type?.show_congratulations_count !== false) {
      const congrats = congratsMap[event.id] || { congratulations_count: 0, latest_congratulation: null };
      shaped.congratulations_count = congrats.congratulations_count;
      shaped.latest_congratulation = congrats.latest_congratulation;
    }
    return shaped;
  });

  const withReminderState = await attachReminderState(events, userId);
  // `rsvp_going_count` بعد أعلام النوع: الحقل يُضاف ولا يُحذف، فطلبه من عميل لا
  // يعرفه لا يكسر شيئاً (ADR-0004)، وغيابه وحده يعني «النوع يخفيه».
  const withRsvpCounters = await attachRsvpCounters(withReminderState);

  return {
    events: withRsvpCounters,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / safeLimit)
    }
  };
}

/**
 * «مناسبة كبرى» (تذكرة #171): يضبط الأدمن تاريخ انتهاء الإبراز على صفّ واحد،
 * أو يلغيه بـ`null`. النطاق (404 خارج بلدات الأدمن) والحقّ الإداري يُفحصان في
 * طبقة المسار قبل الوصول إلى هنا (`adminScope.assertEventInScope`)، والتحقق من
 * شكل التاريخ في `middleware/validate.js` — هذه الدالة تحكم **السقف** وحده.
 *
 * السقف: الرابعة النشِطة في المحافظة نفسها تُردّ 409 عربية. العدّاد مقيَّد
 * بـ`region_id` (فمحافظة أخرى لا تتأثّر) ويستثني الصفّ نفسه (فتمديد إبراز
 * قائم أو إعادة كتابة تاريخه لا يُحسب صفّاً رابعاً)، ويعدّ **النشِطة وحدها**
 * (`EVENT_FEATURED_ACTIVE_SQL_EVENTS`) فلا يحجز مقعداً إبرازٌ انتهى تاريخه.
 *
 * **والعدّ والكتابة معاملة واحدة مسلسَلة على المحافظة:** قفل صفّ المحافظة
 * (`SELECT … FOR UPDATE`، وهو القفل نفسه الذي تُقفل به
 * `notifications.service.js` المحافظةَ قبل قراءة حصّتها) يجعل الطلب الثاني
 * ينتظر إفراج الأول، فيعدّ بعده ويرى المقعد محجوزاً فيُردّ 409. وبدونه كان
 * طلبان على مناسبتين مختلفتين يقرآن العدد نفسه ثم يكتبان معاً فتصير المحافظة
 * بأربع نشِطة.
 *
 * **والسقف يحرس الانتقال إلى «نشِط» لا الكتابة نفسها:** لا يُفرض إلا إذا كانت
 * القيمة الجديدة تجعل الصفّ نشِطاً (`>= CURDATE()`). تاريخ منقضٍ — و`null` —
 * لا يزيد النشِط في المحافظة أبداً، فلا يجوز أن يُردّ 409 مهما امتلأت: وإلا
 * لتعذّر على الأدمن سحب إبرازٍ منتهٍ أو كتابة تاريخ ماضٍ في محافظة كاملة،
 * وهي عملية **تنقص** ولا تضيف. و«نشِطة» للقيمة الجديدة تُحسب بساعة القاعدة
 * (`SELECT (? >= CURDATE())`) لا بساعة Node، فالحكمان هنا وفي التغذية
 * (`EVENT_FEATURED_ACTIVE_SQL_EVENTS`) لا يفترقان عند منتصف الليل.
 */
async function setEventFeatured(event, featuredUntil) {
  // `null` لا يمرّ بالفحص أصلاً، والقيمة غير الفارغة تسأل القاعدة أولاً:
  // هل تجعل الصفّ نشِطاً؟ تاريخ ماضٍ جوابه «لا»، فيمرّ بلا عدّ ولا 409.
  const becomesActive = featuredUntil !== null
    && Number((await db.queryOne('SELECT (? >= CURDATE()) AS active', [featuredUntil])).active) === 1;

  await db.transaction(async connection => {
    if (becomesActive) {
      // صفّ المحافظة هو القفل المشترك لسقفها: قفل صفّ المناسبة وحده لا يرتّب
      // مناسبتين مختلفتين في محافظة واحدة، فطلبان متزامنان يقرآن العدد نفسه
      // ثم يكتبان معاً، فتصير المحافظة بأربع نشِطة والسقف ثلاثة.
      await connection.execute('SELECT id FROM regions WHERE id = ? FOR UPDATE', [event.region_id]);

      // العدّ بعد القفل لا قبله: لقطة المعاملة تُنشأ عند أول قراءة عادية فيها،
      // وهي هنا بعد انتظار القفل — أما `FOR UPDATE` فقراءة حالّة لا تُنشئها —
      // فيرى الطلب الثاني ما التزم به الأول ولا يحسب المقعد الحرّ نفسه.
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) AS total FROM events
          WHERE events.region_id = ? AND events.id <> ?
            AND ${EVENT_FEATURED_ACTIVE_SQL_EVENTS}`,
        [event.region_id, event.id]
      );

      if (Number(countRows[0].total) >= FEATURED_EVENTS_MAX_PER_REGION) {
        throw ApiError.conflict(
          `لا يمكن إبراز أكثر من ${FEATURED_EVENTS_MAX_PER_REGION} مناسبات في المحافظة الواحدة — ألغِ إبراز مناسبة قائمة أولاً`
        );
      }
    }

    // الكتابة داخل المعاملة نفسها: الإفراج عن القفل قبل `UPDATE` يعيد فتح
    // النافذة التي أُقفلت، فالفحص بلا كتابة ذرّية معه لا يمنع شيئاً.
    await connection.execute('UPDATE events SET featured_until = ? WHERE id = ?', [featuredUntil, event.id]);
  });

  // الصفّ يُقرأ ثانيةً بعد الكتابة كي يصل `is_featured` محسوباً بالقاعدة نفسها
  // التي تحسبه في التغذية — لا بحساب JS ثانٍ يخالفها بعد منتصف الليل.
  const updated = await db.queryOne(
    `SELECT events.*, (${EVENT_FEATURED_ACTIVE_SQL_EVENTS}) AS is_featured
       FROM events WHERE events.id = ?`,
    [event.id]
  );
  return { ...withAbsoluteMedia(updated), is_featured: Boolean(updated.is_featured) };
}

/**
 * A single event with its reactions and congratulations. View count is
 * bumped. `legacyOnly` (no `X-App-Version` header) 404s an occasion type the
 * caller cannot render, instead of handing it data it would mislabel — the
 * same wedding-only understanding `listPublicEvents`/`listMapPoints` apply
 * (#20 step 4, decision و).
 *
 * Congratulations returned here are every `approved` row plus, when `userId`
 * is set, that same caller's own still-`pending` rows — the sender sees
 * their own submission tagged as pending, nobody else does (#20 step 5,
 * decision 4). A pending/hidden row belonging to someone else, and the full
 * moderation queue, are what `GET /events/:id/congratulations` is for.
 */
async function getEventDetails(eventId, { legacyOnly = false, userId = null } = {}) {
  // `SELECT *` لا `LIST_COLUMNS`: التفصيل بالمعرّف يعيد الصفّ كما هو، ومنه
  // `visibility` — فلا تُصفّى «بالرابط فقط» بل تُعاد، لأن من يملك معرّف المناسبة
  // (التطبيق والرابط العميق، تذكرة #166) يفتحها به وحدها. التصفية وظيفة
  // القوائم العامة (`PUBLIC_EVENT_VISIBLE_SQL_*`) لا هذه القراءة.
  const event = await db.queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  if (legacyOnly) {
    const legacyTypeIds = await occasionTypes.getLegacyTypeIds();
    if (!legacyTypeIds.includes(event.occasion_type_id)) {
      throw ApiError.notFound('هذه المناسبة تحتاج نسخة أحدث من التطبيق');
    }
  }

  await db.execute('UPDATE events SET views_count = views_count + 1 WHERE id = ?', [eventId]);

  const [congratulations, reactionRows, [withRelations], archivePhotoRows, publicAlbums] = await Promise.all([
    db.query(
      `SELECT * FROM congratulations
        WHERE event_id = ? AND (status = 'approved' OR (user_id = ? AND status = 'pending'))
        ORDER BY created_at DESC`,
      [eventId, userId]
    ),
    db.query(
      'SELECT reaction_type, COUNT(*) AS count FROM reactions WHERE event_id = ? GROUP BY reaction_type',
      [eventId]
    ),
    attachHonoreesAndTypes([withAbsoluteMedia(event)]),
    // «أرشيف الأعراس» (ADR-0008/0009): empty unless the event is approved,
    // has ended and its type carries the gallery — the rule is in the query.
    // This is the event's default album, in the old shape plus additives.
    albums.listDefaultAlbumPhotosForEvent(eventId),
    // Every published album of this event, for the page's albums strip. The
    // same visibility rule lives in the query; this is an additive summary.
    albums.listPublicAlbums({ eventId, page: 1, limit: 100 })
  ]);

  const reactions = EMPTY_REACTIONS();
  for (const row of reactionRows) reactions[row.reaction_type] = Number(row.count);

  const [withReminderState] = await attachReminderState([withRelations], userId);
  // العدّاد العلني حين يسمح النوع (`rsvpCountVisible`) — ويغيب كلياً حين يخفيه.
  const [withRsvpCounters] = await attachRsvpCounters([withReminderState]);

  // عدّاد التبريكات العلني (تذكرة #170): «تبريكات» في عدّادات صفحة المناسبة.
  // يغيب كلياً — لا صفراً — حين يخفيه النوع أو تكون نغمته وقورة، كأخويه
  // `followers_count` و`rsvp_going_count` أعلاه: عدّاد مخفيّ يُرسم صفراً كذبٌ
  // عن المناسبة.
  const withCongratsCount = congratulationsCountVisible(withRsvpCounters.occasion_type)
    ? { ...withRsvpCounters, congratulations_count: await approvedCongratulationsCount(eventId) }
    : withRsvpCounters;

  // جواب المستخدم على المناسبة المعروضة: لعميل مسجَّل ونوع `rsvp_enabled` وحدهما،
  // وإلا فلا مفتاح أصلاً (كـ`followers_count` أعلاه — الحقل الإضافي يغيب ولا
  // يُملأ لزائر). و`null` هنا تعني «لم يُجب بعد»، لا «غير مسموح».
  const withRsvpState = userId && withCongratsCount.occasion_type?.rsvp_enabled === true
    ? { ...withCongratsCount, my_rsvp: await myRsvpFor(eventId, userId) }
    : withCongratsCount;

  return {
    ...withRsvpState,
    views_count: event.views_count + 1,
    reactions,
    congratulations: congratulations.map(withAbsoluteMedia),
    archive_photos: archivePhotoRows,
    albums: publicAlbums.albums
  };
}

/**
 * Approved, upcoming events that carry coordinates, shaped for the map view.
 * Same upcoming cutoff, legacy-client type filter, and town/type/village list
 * filtering as `listPublicEvents` (#20 step 4, decisions أ and و; #85 batch 5).
 * `regionId` is the same governorate isolation as `listPublicEvents` — `null`
 * leaves the query unrestricted, and only the public map route passes one.
 */
async function listMapPoints({
  towns = null, occasionTypeIds = null, villageIds = null, legacyOnly = false, regionId = null
} = {}) {
  const conditions = [
    PUBLIC_EVENT_VISIBLE_SQL_EVENTS, 'latitude IS NOT NULL', 'longitude IS NOT NULL',
    `${EVENT_SPAN_END_SQL_EVENTS} >= CURDATE()`
  ];
  const params = [publishNowClock()];

  if (regionId !== null && regionId !== undefined) {
    conditions.push('region_id = ?');
    params.push(regionId);
  }

  const typeFilterIds = await resolveTypeFilterIds({ legacyOnly, occasionTypeIds });
  if (typeFilterIds && !typeFilterIds.length) return [];
  if (typeFilterIds) {
    conditions.push(`occasion_type_id IN (${typeFilterIds.map(() => '?').join(',')})`);
    params.push(...typeFilterIds);
  }

  const placeCondition = buildPlaceCondition(towns, villageIds, 'village_id');
  if (placeCondition) {
    conditions.push(placeCondition.clause);
    params.push(...placeCondition.params);
  }

  const rows = await db.query(
    `SELECT id, title, groom_name, town, event_date, location_name, poster_url, latitude, longitude
       FROM events
      WHERE ${conditions.join(' AND ')}
      ORDER BY event_date ASC`,
    params
  );

  return rows.map(row => ({
    ...withAbsoluteMedia(row),
    waze_url: `https://waze.com/ul?ll=${row.latitude},${row.longitude}&navigate=yes`
  }));
}

/**
 * تقويم الشهر (تذكرة #175): عدد المناسبات في كل يوم من أيام شهر، للويب
 * والتطبيق.
 *
 * **الأيام هي امتداد المناسبة كاملة** — `EVENT_SPAN_START_SQL_E`/
 * `EVENT_SPAN_END_SQL_E`، لا `event_date` وحده. عرس بدأ الخميس وينتهي السبت
 * يُعدّ في الأيام الثلاثة، وسهرة شباب أو يوم حنّة خارج `event_date` يجعل
 * المناسبة ظاهرة في يومه هو أيضاً. وهما حرفياً المصدر الذي يبني به
 * `listPublicEvents` شرط `date_from`/`date_to`: اليوم الذي يقول التقويم إن فيه
 * ثلاث مناسبات يعيد `GET /api/events?date_from=D&date_to=D` ثلاثتها — لا اثنتين
 * — فلا يفتح المستخدم يوماً من التقويم فيجد قائمةً تناقض عدّه (العدّ في العميل
 * على `event_date` وحده هو بالضبط ما ينتج هذا التناقض).
 *
 * **وبوابة الظهور العام وحدها** (`PUBLIC_EVENT_VISIBLE_SQL_E`): «بالرابط فقط»
 * وغير المعتمدة والمجدولة غائبة، فلا يعلن التقويم مناسبةً لا تعرضها القائمة.
 * و`legacyOnly` على أنواع المناسبات كالتغذية والخريطة (`resolveTypeFilterIds`):
 * عميل بلا `X-App-Version` لا يرى إلا النوع الأول، فلا يُعَدّ له ما لا يستطيع
 * رسمه.
 *
 * **والعدّ استعلام واحد**: الأيام تُبنى تكراريّاً (`month_days`) بين أول الشهر
 * و`LAST_DAY` منه، والامتداد يُحسب **مرّة لكل مناسبة** في `spans` ثم يُنضَم
 * إلى الأيام، والعدّ `COUNT(*)` على اليوم. لا التقاط صفوف إلى JS ثم بسط
 * امتداداتها هناك، حيث يسهل أن تخطئ بداية الشهر ونهايته أو يعود تاريخ منزاح
 * بمنطقة زمنية. و`DATE_FORMAT` يُخرج اليوم نصاً `YYYY-MM-DD` (نفس اصطلاح
 * `span_start` في «قائمتي») لا كائن `Date`.
 *
 * ويعود **ما فيه مناسبة وحدها**: الأيام الصفرية لا تُرسَل أصلاً، مرتبةً تصاعدياً.
 * `regionId` (اختياري) محافظة واحدة يختارها القارئ في التقويم، و`null` «بلا
 * تقييد» — فهو فلتر التطبيق والويب لا تقييد الاكتشاف، ويتلقّاه المسار من
 * `?region_id=` صراحةً لا من ترويسة `X-Region` (تلك تخصّ التغذية والخريطة).
 */
async function listCalendarDays({ month, regionId = null, legacyOnly = false } = {}) {
  const monthStart = `${month}-01`;
  const conditions = [PUBLIC_EVENT_VISIBLE_SQL_E];
  const spanParams = [publishNowClock()];

  if (regionId !== null && regionId !== undefined) {
    conditions.push('e.region_id = ?');
    spanParams.push(regionId);
  }

  const typeFilterIds = await resolveTypeFilterIds({ legacyOnly, occasionTypeIds: null });
  if (typeFilterIds && !typeFilterIds.length) return { days: [] };
  if (typeFilterIds) {
    conditions.push(`e.occasion_type_id IN (${typeFilterIds.map(() => '?').join(',')})`);
    spanParams.push(...typeFilterIds);
  }

  const rows = await db.query(
    `WITH RECURSIVE month_days (day) AS (
       SELECT CAST(? AS DATE)
       UNION ALL
       SELECT DATE_ADD(month_days.day, INTERVAL 1 DAY)
         FROM month_days
        WHERE month_days.day < LAST_DAY(CAST(? AS DATE))
     ),
     spans AS (
       SELECT ${EVENT_SPAN_START_SQL_E} AS span_start,
              ${EVENT_SPAN_END_SQL_E} AS span_end
         FROM events e
        WHERE ${conditions.join(' AND ')}
     )
     SELECT DATE_FORMAT(month_days.day, '%Y-%m-%d') AS date, COUNT(*) AS count
       FROM month_days
       JOIN spans ON spans.span_start <= month_days.day AND spans.span_end >= month_days.day
      GROUP BY month_days.day
      ORDER BY month_days.day`,
    [monthStart, monthStart, ...spanParams]
  );

  return { days: rows.map(row => ({ date: row.date, count: Number(row.count) })) };
}

/**
 * «الأكثر تفاعلاً هذا الأسبوع» (تذكرة #177) — أعلى `TRENDING_EVENTS_LIMIT`
 * مناسبات بمجموع إشاراتها **داخل نافذة `TRENDING_WINDOW_DAYS` وحدها**، للويب
 * والتطبيق معاً عبر `GET /api/events/trending`.
 *
 * **الإشارات أربع**، وكل واحدة تُعدّ بتوقيتها لا بتاريخ المناسبة:
 * `reactions.created_at`، و`congratulations.created_at` المعتمدة وحدها
 * (`status = 'approved'`)، و`event_reminders.created_at`، و`event_rsvps.updated_at`
 * بشرط `response = 'yes'` — آخر جواب هو لحظة الإشارة، فتغيير الجواب إلى «جاي»
 * اليوم إشارة اليوم. والصفّ الذي لا إشارة واحدة له في النافذة **لا يظهر**:
 * `HAVING signal_score > 0` على اسم العمود المحسوب، لا بتكرار التعبير في
 * `WHERE`. «الأكثر تفاعلاً» بقائمة صفرية ليست نتيجة، وهي ما يجعل اختفاء القسم
 * حين لا نتيجة صادقاً على الخادم أيضاً.
 *
 * **والترتيب حتمي:** `signal_score DESC` ثم `events.event_date ASC` ثم
 * `events.id ASC` — فالتعادل لا يعتمد على ترتيب القاعدة.
 *
 * **والبوابة** `PUBLIC_EVENT_VISIBLE_SQL_EVENTS` بساعة `publishNowClock()` في
 * موضعها: غير المعتمدة و«بالرابط فقط» والمجدولة غائبة كما في كل قائمة عامة.
 * **والعزاء مستبعد** بالعلم `tone` لا بالاسم: `NOT EXISTS (… ot.tone =
 * 'solemn')`، ولا شرط «قادم» ولا نافذة بقاء — التذكرة لم تنصّ عليهما.
 *
 * **وتُشكَّل الصفوف بمسار `listPublicEvents` نفسه حرفياً** (`LIST_COLUMNS`،
 * `villages.name AS village_name`، `span_end_order` و`is_ended` و`is_featured`،
 * ثم `withAbsoluteMedia` ثم `attachHonoreesAndTypes` ثم التبريكات باحترام
 * `show_congratulations_count` ثم `attachReminderState(events, null)` ثم
 * `attachRsvpCounters`) — فيرسم العميلان كرت التغذية نفسه لا شكلاً جديداً.
 * و`signal_score` مفتاح ترتيبٍ داخلي يُنزع قبل الإعادة، فلا يدخل شكل الكرت.
 *
 * `regionId` محافظة واحدة، و`null` «بلا تقييد» — كما في `listPublicEvents`،
 * والمسار هو من يقرّره (ترويسة/حساب/افتراضية أو `?region_id=` صريح).
 */
async function listTrendingEvents({ regionId = null, legacyOnly = false } = {}) {
  // ترتيب `params` مقصود ولا يجوز تغييره: معاملات `SELECT` تُستهلك أولاً عند
  // التنفيذ، فأربع نسخ النافذة (`TRENDING_WINDOW_DAYS`) تسبق معاملات `WHERE`
  // (ساعة البوابة، ثم المحافظة، ثم الأنواع). من يضيف شرطاً هنا يضيف قيمته في
  // موضعه من هذا الترتيب لا في آخره.
  const params = [TRENDING_WINDOW_DAYS, TRENDING_WINDOW_DAYS, TRENDING_WINDOW_DAYS, TRENDING_WINDOW_DAYS];
  const conditions = [
    PUBLIC_EVENT_VISIBLE_SQL_EVENTS,
    // العزاء بالعلم لا بالاسم: أي نوع نغمته `solemn` يخرج من القسم، ولو
    // أضاف سوبر أدمن نوعاً حزيناً جديداً غداً بلا سطر كود.
    `NOT EXISTS (
       SELECT 1 FROM occasion_types ot
        WHERE ot.id = events.occasion_type_id AND ot.tone = 'solemn'
     )`
  ];
  params.push(publishNowClock());

  if (regionId !== null && regionId !== undefined) {
    conditions.push('events.region_id = ?');
    params.push(regionId);
  }

  const typeFilterIds = await resolveTypeFilterIds({ legacyOnly, occasionTypeIds: null });
  if (typeFilterIds && !typeFilterIds.length) {
    return { events: [], window_days: TRENDING_WINDOW_DAYS };
  }
  if (typeFilterIds) {
    conditions.push(`events.occasion_type_id IN (${typeFilterIds.map(() => '?').join(',')})`);
    params.push(...typeFilterIds);
  }

  const rows = await db.query(
    `SELECT ${LIST_COLUMNS}, villages.name AS village_name,
            (${EVENT_SPAN_END_SQL_EVENTS}) AS span_end_order,
            (${EVENT_SPAN_END_SQL_EVENTS} < CURDATE()) AS is_ended,
            (${EVENT_FEATURED_ACTIVE_SQL_EVENTS}) AS is_featured,
            ((SELECT COUNT(*) FROM reactions r
               WHERE r.event_id = events.id
                 AND r.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY))
           + (SELECT COUNT(*) FROM congratulations c
               WHERE c.event_id = events.id AND c.status = 'approved'
                 AND c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY))
           + (SELECT COUNT(*) FROM event_reminders er
               WHERE er.event_id = events.id
                 AND er.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY))
           + (SELECT COUNT(*) FROM event_rsvps rs
               WHERE rs.event_id = events.id AND rs.response = 'yes'
                 AND rs.updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY))) AS signal_score
       FROM events
       LEFT JOIN villages ON villages.id = events.village_id
      WHERE ${conditions.join(' AND ')}
     HAVING signal_score > 0
      ORDER BY signal_score DESC, events.event_date ASC, events.id ASC
      LIMIT ?`,
    [...params, TRENDING_EVENTS_LIMIT]
  );

  const eventIds = rows.map(e => e.id);
  const [reactionMap, congratsMap, withRelations] = await Promise.all([
    reactionsForEvents(eventIds),
    congratulationsForEvents(eventIds),
    attachHonoreesAndTypes(rows.map(withAbsoluteMedia))
  ]);

  const events = withRelations.map(event => {
    const shaped = {
      ...event,
      reactions: reactionMap[event.id] || EMPTY_REACTIONS(),
      is_ended: Boolean(event.is_ended),
      is_featured: Boolean(event.is_featured)
    };

    if (event.occasion_type?.show_congratulations_count !== false) {
      const congrats = congratsMap[event.id] || { congratulations_count: 0, latest_congratulation: null };
      shaped.congratulations_count = congrats.congratulations_count;
      shaped.latest_congratulation = congrats.latest_congratulation;
    }

    // مفتاح الترتيب لا حقل كرت: شكل الصفّ هو شكل كرت التغذية نفسه (تذكرة #177).
    delete shaped.signal_score;
    return shaped;
  });

  const withReminderState = await attachReminderState(events, null);
  const withRsvpCounters = await attachRsvpCounters(withReminderState);

  return { events: withRsvpCounters, window_days: TRENDING_WINDOW_DAYS };
}

/**
 * Builds the default title when the publisher leaves it blank. Derived from
 * the occasion type's own name and its honorees' names — never a hardcoded
 * "زفاف/فرح" string — so a funeral never inherits wedding wording (#11).
 */
function buildDefaultTitle(occasionTypeName, honorees, familyClan, town) {
  const names = honorees.map(h => h.name).join(' و ');
  const place = familyClan || town;
  const prefix = occasionTypeName ? `${occasionTypeName} ` : '';
  return `${prefix}${names}${place ? ` — ${place}` : ''}`.trim();
}

/** The active town whose centre sits closest to a coordinate pair — 'القرى والتجمعات' has none, so it can never win. */
async function nearestTownTo(latitude, longitude) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const [town, coords] of Object.entries(await townsService.coordinatesByName())) {
    const distance = haversineDistanceKm({ lat: latitude, lng: longitude }, coords);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = town;
    }
  }
  return nearest;
}

/**
 * Soft mismatch check (#20 step 6, decision ٦), run on publish and on edit.
 * A wedding hall commonly sits outside its own town's boundary, and the town
 * is a social identity as much as a place — so a pin nearer another town's
 * centre only ever warns; it never rejects the submission or rewrites the
 * town the publisher chose. Returns `null` when there is nothing to warn
 * about (no explicit coordinate, or it agrees with the chosen town).
 */
async function checkTownMismatch(town, latitude, longitude) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return null;
  }
  // A region-level place ("النقب" — town unknown) contains every town in it,
  // so no pin can be "nearer another town" than it.
  if (await townsService.isRegionName(town)) return null;
  const nearest = await nearestTownTo(latitude, longitude);
  if (!nearest || nearest === town) return null;
  return {
    nearest_town: nearest,
    message: `المكان الذي حدّدته على الخريطة أقرب إلى بلدة "${nearest}" منه إلى "${town}" — تم الحفظ بالبلدة التي اخترتها كما هي`
  };
}

/**
 * العائلة كما تُخزَّن على الصفّ: ما كتبه العميل، وإلا «آل» وآخر كلمة من اسم
 * صاحب المناسبة الأول. قاعدة واحدة يستعملها النشر (createEvent) وحارس التكرار
 * معاً (تذكرة #159)، فلا يقارن الحارس عائلةً تخالف العائلة التي ستُكتب.
 */
function familyClanFor(familyClan, honorees) {
  return familyClan || `آل ${honorees[0].name.split(' ').slice(-1)[0]}`;
}

/**
 * هل فُتح باب النشر المجدول لهذه المناسبة؟ (تذكرة #167) — نفس شرط القطعة
 * (`PUBLIC_EVENT_VISIBLE_SQL_*`) لكن لصفٍّ واحد، وبنفس ساعة القدس الممرَّرة
 * مُعامَلةً (`publishNowClock()`)، لا بساعة جلسة MySQL. يستعمله
 * مسارا الإعلان (النشر الفوري والاعتماد) وحدهما: قرار «أيُعلن الآن أم ينتظر
 * المجدول» يجب أن يُقرأ من الصفّ لا من حقل يمرّره المستدعي، تماماً كما تُقرأ
 * المحافظة (`eventRegionId`) والإخفاء (`eventIsLinkOnly`) في
 * notifications.service.js. صفّ غير موجود ⇒ `false` (لا إعلان عمّا لا وجود له).
 */
async function publishGateOpen(eventId) {
  const row = await db.queryOne(
    'SELECT (publish_at IS NULL OR publish_at <= ?) AS open_gate FROM events WHERE id = ?',
    [publishNowClock(), eventId]
  );
  return row ? Boolean(row.open_gate) : false;
}

/**
 * المناسبات المعتمدة التي بلغ موعد نشرها ولم تُعلَن بعد — قراءة المجدول وحده
 * (تذكرة #167). شرط `publish_at IS NOT NULL` هو ما يمنع إعلاناً بأثر رجعي: كل
 * صفّ قائم له `announced_at` فارغ، ولولا هذا الشرط لأعلن المجدول المنصّة كلها
 * في أول تشغيل له. و`announced_at IS NULL` تعني «لم يكتمل إعلانها» لا «لم
 * يبدأ»: التعليم يُكتب في معاملة الإعلان نفسها، فصفٌّ فشل إعلانه يعود NULL
 * وتُعيده الدورة التالية (تصحيح جولة #167).
 */
async function listDueScheduledPublish() {
  return db.query(
    `SELECT id, title, groom_name, town, event_date, created_by
       FROM events
      WHERE status = 'approved' AND publish_at IS NOT NULL AND publish_at <= ?
        AND announced_at IS NULL
      ORDER BY id ASC`,
    [publishNowClock()]
  );
}

/**
 * تعليم المناسبة «أُعلنت» — ذرّي: `UPDATE ... WHERE announced_at IS NULL`
 * ينجح مرّة واحدة ولو تزامن تشغيلان، فيُعلن أحدهما وحده. يُستعمل اليوم في
 * موضع واحد: داخل قفل صفّ المناسبة في معاملة `notifications.service.notifyNewEvent`
 * (تصحيح جولة #167)، فالحجز والإعلان **معاملة واحدة**: يمنع التكرار بين
 * تشغيلين متزامنين، ويسقط مع صفوف الإشعارات إن فشل الإعلان لأن المعاملة كلها
 * تتراجع — فلا يبقى `announced_at` معلَّماً على إعلان لم يصل (وهو ما كان
 * يستبعد الصفّ من كل محاولة تالية)، ولا يُعلَّم صفٌّ أعلنه المسار عند الاعتماد
 * ثم تغيّر موعده إلى المستقبل.
 *
 * يعيد `UPDATE` فحص الأهلية الحالية تحت القفل، لا أهلية دفعة المجدول القديمة:
 * اعتمادٌ قائم وظهورٌ عام وموعدٌ بلغ (أو NULL للنشر الفوري)، وإلا لا حجز ولا
 * إعلان. فالتأجيل أو العودة للمراجعة بين الجلب والحجز يتركان الصفّ للمحاولة اللاحقة.
 *
 * `connection` اختياري: يُمرَّر داخل معاملة قائمة (mysql2 يرفض `undefined`،
 * و`eventId` رقم دائم)، ويُستعمل `db` بدونه.
 * يعيد `true` للمستدعي الذي حجز الصفّ المؤهل فعلاً.
 */
async function markAnnounced(eventId, connection = null) {
  const sql = `UPDATE events SET announced_at = NOW()
                WHERE id = ? AND announced_at IS NULL
                  AND status = 'approved' AND visibility = 'public'
                  AND (publish_at IS NULL OR publish_at <= ?)`;
  // `announced_at = NOW()` أعلاه ساعة خادم لا تُقارَن بـ`publish_at` (يُفحَص
  // بـ`IS NULL` وحده)، أما أهلية الموعد فساعة القدس الممرَّرة — والساعتان في
  // العبارة نفسها: `[eventId, publishNowClock()]`.
  const params = [eventId, publishNowClock()];
  if (connection) {
    const [result] = await connection.execute(sql, params);
    return result.affectedRows === 1;
  }
  const { affectedRows } = await db.execute(sql, params);
  return affectedRows === 1;
}

/**
 * Creates an event plus its honorees and extra days in one transaction —
 * either all rows exist or none does, so a published card is never missing
 * the names it exists to display. `groom_name` (kept for every old client
 * that still reads it) is derived from the first honoree by `position`,
 * written in the same transaction rather than a follow-up job. Admins publish
 * immediately; everyone else lands in the moderation queue.
 *
 * `regionId` is the governorate **already resolved by the caller** (#123): the
 * publish route resolves it once and hands the same value to the duplicate
 * guard, so what the guard compared against and what the row stores can never
 * drift apart even if the resolution's inputs change later. Callers that do not
 * pass it (seed, importer, scripts) get the one rule below, exactly as before.
 */
async function createEvent(data, { autoApprove = false, createdBy = null, regionId = null } = {}) {
  // The villages catch-all has no centre of its own — `data.villageCoords`
  // (the chosen village's own lat/lng, looked up by the route) fills that gap
  // the exact same way a real town's centre does, so a village event gets a
  // correct pin on every published client with no query-time logic at all.
  const coords = (await townsService.coordinatesByName())[data.town] || data.villageCoords || {};
  const latitude = data.latitude ?? coords.lat ?? null;
  const longitude = data.longitude ?? coords.lng ?? null;
  const status = autoApprove ? 'approved' : 'pending';

  // محافظة المناسبة (تذكرة #120) — تُحسب في مكان واحد وتُنسخ على الصفّ، لا
  // تُشتقّ في أي قراءة. حين يمرّر المسار `regionId` المحلولة (تذكرة #123) فهي
  // هي نفسها التي قارن بها حارس التكرار، وتُستعمل كما هي. وأي نداء آخر يمرّ
  // بالقاعدة الوحيدة هنا: `data.region_id` اختياري من العميل، وغيابه (كل عميل
  // منشور اليوم، ومنه 1.21.3) يُسقط إلى محافظة البلدة أو إلى الافتراضية.
  const resolvedRegionId = regionId === null || regionId === undefined
    ? await townsService.resolveRegionForEventPlace({
      town: data.town,
      regionId: data.region_id ?? null
    })
    : regionId;

  // A field the route silently dropped (hidden for this occasion type) is
  // simply absent from `data` — `undefined`, not `null`. The raw connection
  // used inside a transaction skips pool.js's normalise(), and mysql2 rejects
  // an `undefined` bind value outright, so every optional column is coerced
  // to `null` right here.
  const secondaryLocationName = data.secondary_location_name ?? null;
  const eventEndDate = data.event_end_date ?? null;
  const youthPartyDate = data.youth_party_date ?? null;
  const audioUrl = data.audio_url ?? null;
  const hostPhone = data.host_phone ?? null;
  const villageId = data.village_id ?? null;
  const requestedVillageName = data.requested_village_name ?? null;
  const artistName = data.artist_name ?? null;
  const artistImageUrl = data.artist_image_url ?? null;
  // ظهور المناسبة (تذكرة #166): العمود NOT NULL، ونداءات لا تعرفه (بذرة،
  // مستورد، سكربتات) تُنشر عامةً كما كانت — الغياب `public` لا `undefined`
  // (اتصال المعاملة لا يقبل `undefined` أصلاً).
  const visibility = data.visibility || 'public';
  // موعد النشر المجدول (تذكرة #167): نصّ `YYYY-MM-DD HH:mm:ss` يبنيه المسار بعد
  // التحقق أنه في المستقبل، أو `null` («يُنشر متى اعتُمد»). النداءات التي لا
  // تعرفه (بذرة، مستورد، سكربتات) تبقى `null` فلا يتغيّر نشرها.
  const publishAt = data.publish_at ?? null;

  return db.transaction(async connection => {
    const groomName = data.honorees[0].name;
    const familyClan = familyClanFor(data.family_clan, data.honorees);
    const title = data.title || buildDefaultTitle(data.occasionTypeName, data.honorees, familyClan, data.town);
    // audio_title only ever defaults when there is actually an audio clip to
    // name — otherwise every event, funerals included, would silently pick
    // up a "شيلة الفرح" (wedding song) label it never asked for.
    const audioTitle = audioUrl ? (data.audio_title || 'مقطع صوتي مرفق') : null;

    const [result] = await connection.execute(
      `INSERT INTO events
         (title, groom_name, family_clan, occasion_type_id, region_id, town, village_id, requested_village_name,
          location_name, secondary_location_name,
          latitude, longitude, event_date, event_end_date, youth_party_date, dinner_time, poster_url,
          audio_url, audio_title, artist_name, artist_image_url, host_phone, status, visibility, created_by,
          first_approved_at, publish_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'approved', NOW(), NULL), ?)`,
      [
        title,
        groomName,
        familyClan,
        data.occasion_type_id,
        resolvedRegionId,
        data.town,
        villageId,
        requestedVillageName,
        // No column default exists for this NOT NULL text column; an
        // occasion type may leave it optional, so a blank submission still
        // needs a safe placeholder instead of a raw SQL NULL violation.
        data.location_name || 'سيُحدَّد لاحقاً',
        secondaryLocationName,
        latitude,
        longitude,
        data.event_date,
        eventEndDate,
        youthPartyDate,
        // Left blank on purpose stays blank: an occasion type may leave this
        // field optional, and inventing a dinner hour nobody announced puts a
        // wrong time in front of guests. NOT NULL, so '' — never a fixed hour.
        data.dinner_time || '',
        // The default image belongs to the occasion type: a celebration type
        // carries one, عزا carries none, and neither is decided here by name.
        data.poster_url || data.default_poster_url || null,
        audioUrl,
        audioTitle,
        artistName,
        artistImageUrl,
        hostPhone,
        status,
        visibility,
        createdBy,
        status,
        publishAt
      ]
    );
    const eventId = result.insertId;

    let position = 0;
    for (const honoree of data.honorees) {
      // صاحب المناسبة شخصٌ (ADR-0011) — والعروس ليست حالة خاصة: الدور نصّ
      // حرّ، والتحليل إلى شخص لا يفرّق بينه وبين غيره.
      await connection.execute(
        'INSERT INTO event_honorees (event_id, name, role, position, person_id) VALUES (?, ?, ?, ?, ?)',
        [eventId, honoree.name, honoree.role, position, await people.resolveByName(honoree.name, connection)]
      );
      position += 1;
    }

    // Extra days are a child list like the honorees above, in the same
    // transaction: a day that failed to land must not leave a card
    // advertising it. Hidden for this occasion type ⇒ `data.extra_days` is an
    // empty array, so this loop simply does nothing.
    let dayPosition = 0;
    for (const day of data.extra_days || []) {
      await connection.execute(
        'INSERT INTO event_days (event_id, name, day_date, place, day_time, position) VALUES (?, ?, ?, ?, ?, ?)',
        [eventId, day.name, day.day_date, day.place, day.day_time, dayPosition]
      );
      dayPosition += 1;
    }

    return { id: eventId, title, status, groom_name: groomName, town: data.town, event_date: data.event_date };
  });
}

/**
 * Columns an amendment to this event that touches the map/schedule the public relies on forces re-review.
 *
 * `visibility` غائب عنها عمداً (تذكرة #166): إخفاء مناسبة معتمدة أو إعادتها
 * عامةً ليس تغييراً في تاريخها ولا في مكانها، فلا يُعيدها إلى المراجعة. ولأن
 * `/e/:id` لا تفتح إلا `approved`، لولا ذلك لأصبح إخفاء المناسبة سبباً في 404
 * لرابطها هي نفسها — عكس المطلوب.
 */
const CRITICAL_AMENDMENT_FIELDS = [
  'event_date', 'event_end_date', 'town', 'village_id', 'requested_village_name', 'location_name', 'latitude', 'longitude'
];

/**
 * Classifies a set of changed column names as 'critical' (event returns to
 * `pending`) or 'cosmetic' (stays `approved`). Kept as one small, reusable,
 * DB-free function so the amendment-log step planned next can call it
 * without duplicating the rule.
 */
function classifyAmendment(changedColumns) {
  return changedColumns.some(column => CRITICAL_AMENDMENT_FIELDS.includes(column)) ? 'critical' : 'cosmetic';
}

/**
 * Deletes from Cloudinary an image a row just stopped using (a replaced
 * poster, artist image or service image, or an `event_cards` image whose row
 * was deleted — تذكرة #180). Only one storeUploadedImage/uploadBuffer made,
 * and only when no row anywhere still holds that URL — the edit forms accept
 * a typed URL, so an admin may have pasted it onto another event. Best-effort,
 * like every other destroy: called after the row write has succeeded.
 *
 * وصفحة المزوّد (تذكرة #184) أضافت مواضع صور أخرى للمزوّد نفسه: الشعار
 * والغلاف وصور المعرض وصورة المنتج — وهي في القائمة نفسها، فلا تُحذف صورةً
 * ما دام صفٌّ آخر يحملها.
 */
async function releaseReplacedImage(oldUrl, newUrl) {
  if (!oldUrl || oldUrl === newUrl) return;
  const publicId = cloudinary.forwardedPublicId(oldUrl);
  if (!publicId) return;
  const inUse = await db.queryOne(
    `SELECT 1 AS used FROM events WHERE poster_url = ? OR artist_image_url = ?
     UNION ALL SELECT 1 FROM service_providers WHERE image_url = ? OR logo_url = ? OR cover_url = ?
     UNION ALL SELECT 1 FROM occasion_types WHERE default_poster_url = ?
     UNION ALL SELECT 1 FROM event_cards WHERE image_url = ?
     UNION ALL SELECT 1 FROM service_provider_photos WHERE image_url = ?
     UNION ALL SELECT 1 FROM service_provider_products WHERE image_url = ?
     LIMIT 1`,
    [oldUrl, oldUrl, oldUrl, oldUrl, oldUrl, oldUrl, oldUrl, oldUrl, oldUrl]
  );
  if (inUse) return;
  logger.info('cloudinary.release', { publicId });
  await cloudinary.destroy(publicId);
}

/**
 * Fetches an event row for an ownership check / edit diff, or throws 404.
 *
 * و`publish_at` يخرج منها **نصّ العمود** (`DATE_FORMAT`، بتوقيت القاعدة) لا
 * `Date` (تذكرة #167): مسار التعديل يقارن به «هل أُرسل الموعد المخزَّن كما هو؟»
 * و«ما القيمة القديمة في سجلّ التعديلات؟»، وكلاهما مقارنة نصّية بساعة الحائط
 * التي كتبها صاحب المناسبة — و`timezone: 'Z'` في pool.js يقرأ `DATETIME` كـ`Date`
 * بتوقيت غرينتش، فتتحوّل اللحظة. الصفّ لا يُعاد لأي عميل من هنا، فلا شكل عام
 * يتغيّر.
 */
async function getEventForEdit(eventId) {
  const event = await db.queryOne(
    `SELECT *, DATE_FORMAT(publish_at, '%Y-%m-%d %H:%i:%s') AS publish_at_clock
       FROM events WHERE id = ?`,
    [eventId]
  );
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');
  event.publish_at = event.publish_at_clock;
  delete event.publish_at_clock;
  return event;
}

/**
 * The extra-days list in a comparable shape: ordered by day, then by the
 * written time, then by the row's own position — **the same order
 * `eventDaysForEvents` reads them in** (تذكرة #176) — and reduced to the four
 * fields that describe the day. Both sides of an edit's comparison go through
 * here, so a client that sends the same days in a different date order is
 * still seen as unchanged — only the content counts, not the order the form
 * happened to build.
 *
 * Ordering by `position` alone was a save regression: two stations on one date
 * (العشاء 20:00 written first, الحنّة 17:00 second) read back as الحنّة ثم
 * العشاء, and the editor resends them in that read order with fresh positions
 * 0..N — a `position`-only sort then compared [العشاء, الحنّة] with
 * [الحنّة, العشاء], called an unchanged list changed, deleted and re-inserted
 * its rows and logged an amendment. Sorting on the read order instead makes
 * GET → resave byte-stable: identical content always sorts to the same list.
 *
 * `day_time` is free text (`VARCHAR`), so the comparison is lexicographic on
 * whatever the publisher typed, and a station with no written time comes first
 * — matching MySQL's own `ASC` order, which puts NULL before any value.
 */
function normaliseEventDays(days) {
  return [...days]
    .sort((a, b) => {
      if (a.day_date !== b.day_date) return a.day_date < b.day_date ? -1 : 1;
      const timeA = a.day_time ?? '';
      const timeB = b.day_time ?? '';
      if (timeA !== timeB) return timeA < timeB ? -1 : 1;
      return (a.position ?? 0) - (b.position ?? 0);
    })
    .map(day => ({ name: day.name, day_date: day.day_date, place: day.place, day_time: day.day_time }));
}

/**
 * The honorees list in a comparable shape: name and role, kept in the order
 * given (their stored position). Both sides of an edit's comparison go
 * through here, so a client that resends the same people and roles in the
 * same order is seen as unchanged — only the content counts.
 */
function normaliseHonorees(honorees) {
  return honorees.map(honoree => ({ name: honoree.name, role: honoree.role ?? null }));
}

/**
 * An amendment row's `old_value`/`new_value` are display text a client prints
 * verbatim, so a list field is spelled out rather than dumped as JSON: names
 * joined by «، », each carrying « (role) » when a role is set. An empty list
 * is null — every client already renders null as «—».
 */
function formatHonoreesList(honorees) {
  if (!honorees.length) return null;
  return honorees.map(honoree => (honoree.role ? `${honoree.name} (${honoree.role})` : honoree.name)).join('، ');
}

/**
 * The same readable treatment for the (normalised, sorted) extra-days list:
 * each day is «الاسم: التاريخ», with « الوقت » appended when set and
 * « — المكان » when set, days joined by «؛ ». An empty list is null.
 */
function formatEventDaysList(days) {
  if (!days.length) return null;
  return days.map(day => {
    let text = `${day.name}: ${day.day_date}`;
    if (day.day_time) text += ` ${day.day_time}`;
    if (day.place) text += ` — ${day.place}`;
    return text;
  }).join('؛ ');
}

/**
 * Whether an extra-days edit moves the schedule or only describes it.
 *
 * 'critical' when the multiset of (day_date, place) pairs differs — a day
 * added, removed, re-dated or moved to another place — or when the same set
 * of day names stays put as names but is re-assigned to other dates/places:
 * [{الحنّة, 10-08}, {العرس, 10-09}] → [{الحنّة, 10-09}, {العرس, 10-08}] keeps
 * both (day_date, place) pairs yet moves each named day, so the henna moved a
 * day and the event must re-enter moderation. 'cosmetic' otherwise: a rename
 * (and/or a time tweak) on a day that kept its date and place changes only the
 * description. A rename that coincides with a swap changes at least one name,
 * so the two name sets no longer match and the edit stays 'cosmetic' — an
 * acknowledged ambiguity, deliberately resolved the same way on both server
 * and admin panel. The lists are sorted before comparison so the test is
 * order-blind and two days on the same date cannot hide a move behind each
 * other.
 */
function classifyEventDaysAmendment(oldDays, newDays) {
  const pairs = days => days.map(day => `${day.day_date}\u0000${day.place ?? ''}`).sort();
  if (JSON.stringify(pairs(oldDays)) !== JSON.stringify(pairs(newDays))) return 'critical';
  // Same (day_date, place) pairs: only a re-assignment of the same day names
  // to other dates/places — a swap, not a rename — is still a schedule move.
  const names = days => days.map(day => day.name ?? '').sort();
  const triples = days => days.map(day => `${day.name ?? ''}\u0000${day.day_date}\u0000${day.place ?? ''}`).sort();
  const sameNames = JSON.stringify(names(oldDays)) === JSON.stringify(names(newDays));
  if (sameNames && JSON.stringify(triples(oldDays)) !== JSON.stringify(triples(newDays))) return 'critical';
  return 'cosmetic';
}

/**
 * A column is changed when the submitted value differs from what is stored.
 *
 * `latitude`/`longitude` are the one exception: they are DECIMAL(10,7), so
 * MySQL hands them back as strings ('31.3933640') while the route parses the
 * request to a number (31.393364) — a plain string compare would read an
 * unchanged, re-sent pin as a change and bounce an approved event back to
 * 'pending'. Both sides are compared as numbers rounded to the column's own
 * seven decimal places, with absence on either side meaning "no pin".
 */
function columnValueChanged(column, storedValue, submittedValue) {
  if (column === 'latitude' || column === 'longitude') {
    const storedEmpty = storedValue === null || storedValue === undefined || storedValue === '';
    const submittedEmpty = submittedValue === null || submittedValue === undefined || submittedValue === '';
    if (storedEmpty || submittedEmpty) return storedEmpty !== submittedEmpty;
    return Math.round(Number(storedValue) * 1e7) !== Math.round(Number(submittedValue) * 1e7);
  }
  return String(storedValue ?? '') !== String(submittedValue ?? '');
}

/**
 * محافظة الصفّ بعد تعديل، أو `null` حين لا يُعيد التعديل حسابها (لم تُمسّ
 * البلدة ولا القرية، ولم تُرسَل محافظة صريحة).
 *
 * المحافظة (تذكرة #120) مشتقّة من المكان لا حقلاً يحرّره المستخدم: تُعاد
 * حسابها كلما مسّ التعديل البلدة أو اختيار القرية، أو أرسل العميل محافظة
 * صريحة (البند الجامع وحده يحتاجها). ولا تدخل `changes` عمداً — فلا تظهر في
 * سجل التعديلات، ولا تغيّر تصنيف التعديل الحرِج. وتُحسب قبل المعاملة كي
 * يُرفض معرّف المحافظة غير النشِط بـ400 قبل كتابة أي صفّ.
 *
 * القرية المختارة هي مصدر محافظتها حين لا تُرسَل محافظة صريحة: تمرير البلدة
 * وحدها كان يجعل البند الجامع يعود إلى المحافظة الافتراضية، فتصير مناسبة
 * طولكرمية تُغيَّر قريتها نقبية. وإن لم تكن هناك قرية (بند جامع بلا قرية)
 * بقيت المناسبة على محافظتها الحالية، لا على الافتراضية.
 *
 * دالة واحدة يستعملها `updateEvent` عند الكتابة وحارس التكرار قبلها (تذكرة
 * #159): تعديل مناسبة معتمدة يُقارَن بمحافظة الصفّ النهائي، لا بمحافظته
 * المخزَّنة، وإلا رأى الحارس مرشّحي محافظة غادرتها المناسبة.
 */
async function editedRegion(existing, { changes = {}, regionId = null } = {}) {
  const nextTown = changes.town !== undefined ? changes.town : existing.town;
  const villageRegionId = changes.village_id !== undefined && changes.village_id !== null
    ? await villagesService.regionIdById(changes.village_id)
    : null;
  const regionNeedsRewrite = changes.town !== undefined || changes.village_id !== undefined
    || (regionId !== null && regionId !== undefined);
  if (!regionNeedsRewrite) return null;
  return townsService.resolveRegionForEventPlace({
    town: nextTown,
    regionId: regionId ?? null,
    villageRegionId,
    fallbackRegionId: existing.region_id ?? null
  });
}

/**
 * Applies a partial edit. `changes` holds, for every column the client named,
 * the value the route already cleaned — sent even when it equals what is
 * stored; which of them actually differ is decided here, by
 * `columnValueChanged`. `honorees`, when present,
 * fully replaces event_honorees and re-derives groom_name, and `extraDays`,
 * when present, fully replaces event_days the same way — all in the same
 * transaction as the event row update, same invariant as createEvent. A
 * critical column change drops an approved event back to pending; honoree
 * spelling edits are always cosmetic, per the domain's own classification.
 *
 * Honorees are compared on their own content, like extra days: a list whose
 * names and roles match the stored rows in order is not an edit at all — the
 * rows are not rewritten and no amendment is logged. A real change is one
 * amendment row (`field = 'honorees'`, the two lists as readable text)
 * classified 'cosmetic' and written `approved`: a name or a role is not a date
 * or a place, so an approved event stays published.
 *
 * Extra days are classified on their own content, not on the column rule: a
 * day added, removed, re-dated or moved is critical and re-enters moderation,
 * while a name/time tweak on a day that stayed put is cosmetic and leaves the
 * event published. A list identical to what is stored is not an edit at all —
 * no rows are rewritten and no amendment is logged. The overall amendment is
 * the columns' rule (classifyAmendment) OR the extra-days one, so one
 * critical change in either place is enough to bounce the event back.
 *
 * Every column that actually changed also gets an event_amendments row, in
 * the same transaction as the event write — either both exist or neither
 * does, so the log is never read as complete when it silently isn't. Each
 * row is classified on its own field (`classifyAmendment([column])`, the
 * same function reused rather than a second rule) so a cosmetic field
 * travelling alongside a critical one in one request is still logged
 * `approved` immediately — it never went through review either.
 *
 * `forceReview` sends an edit that would otherwise stay published back to the
 * queue: an owner's edit the duplicate guard finds suspicious (ticket #159)
 * is never refused — the owner is never blocked — but it must not go live
 * unread, so the event lands `pending` and the admin queue shows what it
 * resembles.
 *
 * `visibility` (تذكرة #166) يصل وسيطاً مستقلاً لا مفتاحاً في `changes`،
 * بالسببين الذين جعلا `region_id` كذلك: سجلّ التعديلات يطبع قيمة العمود كما
 * هي، و`public`/`link_only` مفتاحان إنجليزيان في الـAPI لا نصّاً يقرأه مستخدم
 * عربي — وثانيهما أن الإخفاء تصنيفه تجميليّ أصلاً (ليس في
 * `CRITICAL_AMENDMENT_FIELDS`). ويُكتب في نفس `UPDATE`، ولا يُكتب إلا إن اختلف
 * فعلاً عن المخزَّن.
 */
async function updateEvent(eventId, existing, { changes = {}, honorees = null, extraDays = null, changedBy = null, regionId = null, visibility = null, forceReview = false } = {}) {
  // Only columns whose value actually differs count towards the
  // classification — a form resubmitting today's already-approved date
  // must not bounce the event back into moderation for no reason.
  const changedColumns = Object.keys(changes).filter(
    column => columnValueChanged(column, existing[column], changes[column])
  );

  // محافظة الصفّ بعد التعديل — القاعدة الوحيدة في `editedRegion`، والنداء
  // نفسه يستعمله حارس التكرار قبل أي كتابة (تذكرة #159).
  const resolvedRegionId = await editedRegion(existing, { changes, regionId });

  const { amendment, status: nextStatus, extraDaysChanged, honoreesChanged } = await db.transaction(async connection => {
    // The stored honorees are read here, before any replacement: the same
    // source-of-truth role the extra-days rows below play.
    let honoreesChanged = false;
    let oldHonorees = null;
    let newHonorees = null;

    // The stored days are read here, before any replacement: they are the
    // only source of truth for whether this edit changes the schedule at all.
    // The order matches the display order of «برنامج المناسبة» (date, then
    // time, then position — تذكرة #176); `normaliseEventDays` below re-sorts
    // both sides on content, so the comparison never depends on it.
    let extraDaysEdit = null;
    if (extraDays !== null) {
      const [currentRows] = await connection.execute(
        `SELECT name, day_date, place, day_time, position FROM event_days
          WHERE event_id = ? ORDER BY day_date ASC, day_time ASC, position ASC`,
        [eventId]
      );
      const oldDays = normaliseEventDays(currentRows);
      const newDays = normaliseEventDays(extraDays.map((day, position) => ({ ...day, position })));
      if (JSON.stringify(oldDays) !== JSON.stringify(newDays)) {
        extraDaysEdit = {
          classification: classifyEventDaysAmendment(oldDays, newDays),
          oldValue: formatEventDaysList(oldDays),
          newValue: formatEventDaysList(newDays)
        };
      }
    }

    // One decision, two sources: the columns' own classifyAmendment plus the
    // extra-days comparison above. A critical change in either re-enters
    // moderation; otherwise the event keeps the status it had — unless the
    // route asked for a review (a suspicious duplicate, ticket #159), in which
    // case an edit that would have stayed published returns to the queue.
    const amendment = classifyAmendment(changedColumns) === 'critical'
      || extraDaysEdit?.classification === 'critical'
      ? 'critical'
      : 'cosmetic';
    const nextStatus = (amendment === 'critical' || forceReview) && existing.status === 'approved'
      ? 'pending'
      : existing.status;

    // سطر سجلّ التعديل يقول هل صار هذا التغيير نافذاً أم ينتظر مراجعة. و`forceReview`
    // (تذكرة #159) يحبس التعديل كلّه، فلا يجوز أن يقول سطرٌ فيه «approved» والمناسبة
    // نفسها «pending»؛ واعتماد المناسبة يحوّل أسطرها المعلّقة تباعاً (admin.service.js).
    const amendmentRowStatus = classification => (
      forceReview || classification === 'critical' ? 'pending' : 'approved'
    );

    const assignments = [];
    const params = [];
    for (const [column, value] of Object.entries(changes)) {
      assignments.push(`${column} = ?`);
      params.push(value);
    }
    // محافظة الصفّ تُكتب في نفس `UPDATE` أعلاه، لا في عبارة ثانية: تعديل
    // يغيّر البلدة والقرية والمحافظة معاً يصل إلى القاعدة ذرّياً.
    if (resolvedRegionId !== null) {
      assignments.push('region_id = ?');
      params.push(resolvedRegionId);
    }
    // ظهور المناسبة (تذكرة #166) في نفس `UPDATE`، وخارج `changes` عمداً (انظر
    // تعليق الدالة). صفّ لا يلمس الخيار لا يكتب شيئاً هنا.
    if (visibility !== null && columnValueChanged('visibility', existing.visibility, visibility)) {
      assignments.push('visibility = ?');
      params.push(visibility);
    }
    if (nextStatus !== existing.status) {
      assignments.push('status = ?');
      params.push(nextStatus);
    }

    if (honorees !== null) {
      // Same compare-then-write as extra days above: the stored rows are read
      // before any replacement, and a list identical to them (names and
      // roles, in position order) is skipped entirely — nothing rewritten,
      // no amendment. Only a real change deletes and re-inserts, and it also
      // carries the amendment row written below.
      const [currentRows] = await connection.execute(
        'SELECT name, role FROM event_honorees WHERE event_id = ? ORDER BY position ASC',
        [eventId]
      );
      oldHonorees = normaliseHonorees(currentRows);
      newHonorees = normaliseHonorees(honorees);
      honoreesChanged = JSON.stringify(oldHonorees) !== JSON.stringify(newHonorees);

      if (honoreesChanged) {
        await connection.execute('DELETE FROM event_honorees WHERE event_id = ?', [eventId]);
        let position = 0;
        for (const honoree of honorees) {
          await connection.execute(
            'INSERT INTO event_honorees (event_id, name, role, position, person_id) VALUES (?, ?, ?, ?, ?)',
            [eventId, honoree.name, honoree.role, position, await people.resolveByName(honoree.name, connection)]
          );
          position += 1;
        }
        assignments.push('groom_name = ?');
        params.push(honorees[0].name);
      }
    }

    // A provided extra-days list replaces the whole set, the same
    // delete-then-insert `honorees` above uses; `null` means the caller never
    // sent the key (every published APK today), so the existing days stay. A
    // list identical to the stored one is skipped entirely — nothing to
    // rewrite and nothing to log.
    if (extraDaysEdit) {
      await connection.execute('DELETE FROM event_days WHERE event_id = ?', [eventId]);
      let dayPosition = 0;
      for (const day of extraDays) {
        await connection.execute(
          'INSERT INTO event_days (event_id, name, day_date, place, day_time, position) VALUES (?, ?, ?, ?, ?, ?)',
          [eventId, day.name, day.day_date, day.place, day.day_time, dayPosition]
        );
        dayPosition += 1;
      }
    }

    if (assignments.length) {
      params.push(eventId);
      await connection.execute(`UPDATE events SET ${assignments.join(', ')} WHERE id = ?`, params);
    }

    for (const column of changedColumns) {
      const fieldClassification = classifyAmendment([column]);
      const rowStatus = amendmentRowStatus(fieldClassification);
      const oldValue = existing[column];
      const newValue = changes[column];
      await connection.execute(
        `INSERT INTO event_amendments (event_id, field, old_value, new_value, changed_by, classification, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          column,
          oldValue === null || oldValue === undefined ? null : String(oldValue),
          newValue === null || newValue === undefined ? null : String(newValue),
          changedBy,
          fieldClassification,
          rowStatus
        ]
      );
    }

    // The extra-days list is one field, so it is one amendment row carrying
    // both lists as the readable text formatEventDaysList builds — the same
    // shape the per-column rows above use, just with a value that is itself a
    // list. Its status matches a column row's: pending for a critical change
    // (or for any change when the guard holds the event back), approved for a
    // cosmetic one that goes out at once.
    if (extraDaysEdit) {
      await connection.execute(
        `INSERT INTO event_amendments (event_id, field, old_value, new_value, changed_by, classification, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          'extra_days',
          extraDaysEdit.oldValue,
          extraDaysEdit.newValue,
          changedBy,
          extraDaysEdit.classification,
          amendmentRowStatus(extraDaysEdit.classification)
        ]
      );
    }

    // Same one-field/one-row shape for the honorees list. Its classification
    // is always 'cosmetic': honorees are never critical, so the row is
    // written approved exactly as a cosmetic column row is — unless the guard
    // holds the whole edit back.
    if (honoreesChanged) {
      await connection.execute(
        `INSERT INTO event_amendments (event_id, field, old_value, new_value, changed_by, classification, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          'honorees',
          formatHonoreesList(oldHonorees),
          formatHonoreesList(newHonorees),
          changedBy,
          'cosmetic',
          amendmentRowStatus('cosmetic')
        ]
      );
    }

    return { amendment, status: nextStatus, extraDaysChanged: extraDaysEdit !== null, honoreesChanged };
  });

  // A critical edit that moves the date or the town has to be re-checked on
  // the values it lands on, not the ones it was created with — otherwise the
  // collision check stays frozen at publish time (#20 step 3, decision 5).
  let collision = null;
  if (amendment === 'critical' && ('event_date' in changes || 'town' in changes)) {
    const checkDate = 'event_date' in changes ? changes.event_date : existing.event_date;
    const checkEndDate = 'event_end_date' in changes ? changes.event_end_date : existing.event_end_date;
    const checkTown = 'town' in changes ? changes.town : existing.town;
    const conflicts = await findCollisions({
      date: checkDate,
      endDate: checkEndDate,
      town: checkTown,
      occasionTypeId: existing.occasion_type_id,
      excludeEventId: eventId
    });
    collision = { hasCollision: conflicts.length > 0, count: conflicts.length, conflicts };
  }

  return { amendment, status: nextStatus, collision, changedColumns, extraDaysChanged, honoreesChanged };
}

/** Every logged change to this event, newest first, with the name of who made it. */
async function listAmendments(eventId) {
  return db.query(
    `SELECT a.id, a.event_id, a.field, a.old_value, a.new_value, a.classification, a.status, a.created_at,
            u.full_name AS changed_by_name
       FROM event_amendments a
       LEFT JOIN users u ON u.id = a.changed_by
      WHERE a.event_id = ?
      ORDER BY a.created_at DESC, a.id DESC`,
    [eventId]
  );
}

/** Everything a given user has published, any status — the "my events" screen ownership implies. */
async function listMyEvents(userId) {
  const rows = await db.query('SELECT * FROM events WHERE created_by = ? ORDER BY created_at DESC', [userId]);
  return attachHonoreesAndTypes(rows.map(withAbsoluteMedia));
}

/**
 * Events whose date range overlaps the given range (optionally within one
 * town) — an end-less event is a one-day range, via COALESCE(event_end_date,
 * event_date) on both sides of the intersection test, so a wedding landing
 * on day two of a four-day عزا is still caught (#20 step 3, decision 4/9).
 *
 * Direction is read off the occasion types themselves, never off a type's
 * name: `occasionTypeId` (the event asking) must have `creates_collision`
 * or the check is skipped outright — a عزا asking never gets a warning,
 * because a death is never rescheduled around another death. Every match
 * returned must have `warns_others` — a عزا never checks, but it always
 * counts as a conflict when something else (typically a عرس) checks against
 * it. A caller with no `occasionTypeId` (the pre-#20 request shape) gets the
 * old, type-blind behaviour untouched — any non-rejected overlap counts.
 *
 * **و«بالرابط فقط» لا تُرشَّح هنا (تذكرة #166):** `visibility = 'public'` في
 * `conditions` وحدها. هذه نقطة تنبيه تصادم مواعيد في نموذج النشر، والتحذير
 * بمناسبة مخفيّة يُعلِن وجودها واسم صاحبها وبلدةها لأي زائر يجرّب تاريخاً —
 * فهي إعلان لا يريده صاحبها، والمناسبة التي لا تدخل أي قائمة لا تنبّه على
 * موعد مشغول فيها. `findPossibleDuplicates` **لا** يأخذ هذا الشرط عمداً: هو
 * حارس تكرار يمنع صفّاً ثانياً للمناسبة نفسها، فلا يصحّ أن يعميه الإخفاء.
 */
async function findCollisions({ date, endDate = null, town = null, occasionTypeId = null, excludeEventId = null }) {
  if (occasionTypeId) {
    const type = await occasionTypes.getTypeById(occasionTypeId);
    if (!type || !type.creates_collision) return [];
  }

  const rangeEnd = endDate || date;
  const conditions = [
    "e.status <> 'rejected'",
    "e.visibility = 'public'",
    'e.event_date <= ?',
    'COALESCE(e.event_end_date, e.event_date) >= ?'
  ];
  const params = [rangeEnd, date];

  if (town && town !== 'الكل') {
    conditions.push('e.town = ?');
    params.push(town);
  }
  if (excludeEventId) {
    conditions.push('e.id <> ?');
    params.push(excludeEventId);
  }
  if (occasionTypeId) {
    conditions.push('ot.warns_others = 1');
  }

  return db.query(
    `SELECT e.id, e.title, e.groom_name, e.family_clan, e.town, e.location_name,
            e.event_date, e.event_end_date, e.dinner_time
       FROM events e
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.town ASC, e.event_date ASC`,
    params
  );
}

/** A 'YYYY-MM-DD' date moved by `days` — calendar arithmetic in UTC, so no timezone can shift the day. */
function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Where an event takes place, as one comparable key. Under the villages
 * catch-all the town name alone says nothing — two weddings there sit in two
 * different villages — so the village (picked, or typed and still waiting
 * for promotion) is the place.
 */
function placeKey(row) {
  if (row.town !== VILLAGES_TOWN) return row.town;
  if (row.village_id) return `village:${row.village_id}`;
  return `village:${nameKey(row.requested_village_name || '')}`;
}

/**
 * Whether `candidate` looks like the same occasion as `subject`, and how
 * sure that is — or `null`. Same person by name (see comparePersonNames),
 * dates overlapping or at most DUPLICATE_DATE_WINDOW_DAYS apart. 'certain'
 * needs the identical name on an overlapping date in the same place (or one
 * of the two places only a region, i.e. "town unknown"); anything weaker is
 * 'likely'. A one-word name is too common to stand on its own, so it only
 * counts at all in the same place. The occasion type is deliberately not
 * compared: a wedding republished as «خطوبة» by mistake is still the same one.
 *
 * The governorate is not compared here. Once a subject carries a `region_id`,
 * `findPossibleDuplicates` drops every candidate from another governorate
 * (#123), so the only place names that reach this function are inside that one
 * governorate — and there a name that is a governorate means "town unknown
 * *inside this governorate*", never "another place". The exception is a subject
 * with no `region_id` (an internal caller that predates #120): candidates are
 * not filtered at all then, so another governorate's names can meet here — the
 * older, unrestricted behaviour, kept on purpose for those callers only.
 *
 * When no pair of owner names meets, the family is the fallback signal
 * (ticket #159): the same `family_clan`, in the same place and inside the
 * window, is 'likely' by construction and never 'certain' — a clan can hold
 * two weddings on one day, and the guard warns, it does not decide. It is not
 * consulted when the names did meet, and never across towns.
 */
function matchDuplicate(subject, candidate, regionNames) {
  // Dates first: the cheap test, and the one that rules out almost every
  // candidate when one query serves a whole queue spanning months.
  const subjectEnd = subject.event_end_date || subject.event_date;
  const candidateEnd = candidate.event_end_date || candidate.event_date;
  const withinWindow = candidate.event_date <= shiftDate(subjectEnd, DUPLICATE_DATE_WINDOW_DAYS)
    && candidateEnd >= shiftDate(subject.event_date, -DUPLICATE_DATE_WINDOW_DAYS);
  if (!withinWindow) return null;
  const overlaps = candidate.event_date <= subjectEnd && candidateEnd >= subject.event_date;

  const samePlace = placeKey(subject) === placeKey(candidate);
  let best = null;
  for (const subjectName of subject.names) {
    for (const candidateName of candidate.names) {
      const match = comparePersonNames(subjectName, candidateName);
      if (!match || (match.singleToken && !samePlace)) continue;
      if (!best || (match.exact && !best.exact)) best = match;
    }
  }

  if (!best) {
    // لم تلتقِ أسماء أصحاب المناسبة: العائلة وحدها، وبنفس البلدة وحدها
    // (والنافذة فُحصت أعلى الدالة، والمحافظة قُصّت قبل المطابقة).
    if (!samePlace || !sameFamilyClan(subject, candidate)) return null;
    return {
      confidence: 'likely',
      reasons: ['نفس العائلة', overlaps ? 'نفس التاريخ' : 'تاريخ قريب', 'نفس البلدة']
    };
  }

  const placeUnknown = !samePlace && (regionNames.has(subject.town) || regionNames.has(candidate.town));
  return {
    confidence: best.exact && overlaps && (samePlace || placeUnknown) ? 'certain' : 'likely',
    reasons: [
      best.exact ? 'الاسم مطابق' : 'الاسم مشابه',
      overlaps ? 'نفس التاريخ' : 'تاريخ قريب',
      samePlace ? 'نفس البلدة' : placeUnknown ? 'البلدة غير محدَّدة في إحداهما' : 'بلدة مختلفة'
    ]
  };
}

/**
 * مفتاح العائلة — توحيد الإملاء نفسه الذي تمرّ به أسماء الأشخاص
 * (`nameTokens` في `arabicName.js`): همزات، ة/ه، ى/ي، «ال» التعريف،
 * و«أبو/عبد» الملتصقة. فـ«آل الهواشلة» و«الهواشلة» عائلة واحدة.
 *
 * وأداة التعريف «آل» وحدها تصير «ال» بعد التوحيد وليست اسماً، فتُسقَط من أوّل
 * المفتاح: الخادم نفسه هو من يشتقّها افتراضياً (`familyClanFor`)، فمقارنتها
 * بمفتاح بقي فيه «آل» تعني ألا تلتقي العائلة المكتوبة بأيدي الناس أبداً.
 * والباقي يُقارَن حرفياً: عائلتان تفترقان بحرف واحد عائلتان مختلفتان.
 */
function familyKey(familyClan) {
  const tokens = nameTokens(familyClan || '');
  if (tokens[0] === 'ال') tokens.shift();
  return tokens.join(' ');
}

/**
 * «نفس العائلة» — تُقارَن `family_clan` بمفتاح واحد على الطرفين (تذكرة #159).
 * عائلة فارغة على أحد الطرفين لا تطابق شيئاً: الصفوف القديمة المزروعة
 * مباشرة قد تحمل نصاً فارغاً، و«فارغ = فارغ» ليس دليلاً على تكرار.
 */
function sameFamilyClan(subject, candidate) {
  const key = familyKey(subject.family_clan);
  return key !== '' && key === familyKey(candidate.family_clan);
}

/**
 * The possible-duplicate guard's lookup. For each subject (`{ id?, names?,
 * family_clan?, region_id, town, village_id, requested_village_name,
 * event_date, event_end_date }`) returns, at the same index, the events that
 * look like the same occasion — 'certain' ones first. A subject with an `id`
 * but no `names` has its honorees read here, and is never reported as its own
 * duplicate; an edit passes the id in `excludeEventId` instead, because its
 * subject carries the values the edit lands on, not the stored row.
 *
 * One query covers every subject: the date window narrows candidates in SQL;
 * the name comparison runs here because it is fuzzy and MySQL has no edit
 * distance. Candidates are every approved event (public anyway) plus the
 * pending ones inside `scope` — the caller's `adminScope.townScopeClause`, so
 * a town admin is never shown another town's unpublished request. Rejected
 * events are never candidates: rejecting one is how a duplicate is cleared.
 *
 * Candidates are also narrowed by governorate (#123): two identical occasions
 * in two governorates are two different occasions, so `e.region_id` is read
 * and a candidate is never compared against a subject from another one. A
 * subject with no `region_id` — an internal caller that predates #120 — keeps
 * the older, unrestricted behaviour instead of failing.
 */
async function findPossibleDuplicates(
  subjects,
  { scope = { clause: '', params: [] }, excludeEventId = null } = {}
) {
  if (!subjects.length) return [];

  const windowStart = shiftDate(
    subjects.map(s => s.event_date).sort()[0], -DUPLICATE_DATE_WINDOW_DAYS
  );
  const windowEnd = shiftDate(
    subjects.map(s => s.event_end_date || s.event_date).sort().slice(-1)[0], DUPLICATE_DATE_WINDOW_DAYS
  );

  const candidates = await db.query(
    `SELECT e.id, e.title, e.groom_name, e.family_clan, e.region_id, e.town, e.village_id,
            e.requested_village_name, e.event_date, e.event_end_date, e.status, e.poster_url,
            ot.name AS occasion_type_name
       FROM events e
       LEFT JOIN occasion_types ot ON ot.id = e.occasion_type_id
      WHERE e.event_date <= ? AND COALESCE(e.event_end_date, e.event_date) >= ?
        AND (e.status = 'approved' OR (e.status = 'pending'${scope.clause}))
      ORDER BY e.event_date ASC, e.id ASC`,
    [windowEnd, windowStart, ...scope.params]
  );

  const unnamedSubjectIds = subjects.filter(s => s.id && !s.names).map(s => s.id);
  const [honoreeMap, regionNames] = await Promise.all([
    honoreesForEvents([...new Set([...candidates.map(c => c.id), ...unnamedSubjectIds])]),
    townsService.activeRegionNames()
  ]);
  const regionSet = new Set(regionNames);
  // event_honorees is the source; groom_name only for a row that has none.
  const namesOf = row => {
    const honorees = honoreeMap[row.id] || [];
    return honorees.length ? honorees.map(h => h.name) : [row.groom_name].filter(Boolean);
  };
  for (const candidate of candidates) candidate.names = namesOf(candidate);

  return subjects.map(subject => {
    const resolved = subject.names ? subject : { ...subject, names: namesOf(subject) };
    // The governorate boundary (#123). `events.region_id` is NOT NULL, so every
    // candidate has one; only a subject can lack it, and then this restriction
    // is switched off rather than throwing.
    const regionUnknown = resolved.region_id === null || resolved.region_id === undefined;
    const matches = [];
    for (const candidate of candidates) {
      if (excludeEventId && candidate.id === excludeEventId) continue;
      if (resolved.id && candidate.id === resolved.id) continue;
      if (!regionUnknown && candidate.region_id !== resolved.region_id) continue;
      const match = matchDuplicate(resolved, candidate, regionSet);
      if (!match) continue;
      matches.push({
        id: candidate.id,
        title: candidate.title,
        honorees: candidate.names,
        town: candidate.town,
        event_date: candidate.event_date,
        event_end_date: candidate.event_end_date,
        status: candidate.status,
        occasion_type_name: candidate.occasion_type_name,
        poster_url: absoluteMediaUrl(candidate.poster_url),
        ...match
      });
    }
    return matches.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'certain' ? -1 : 1));
  });
}

/**
 * The guard's refusal: 409 with `details.code = 'POSSIBLE_DUPLICATE'` and the
 * matches, so a client can show them side by side and resend with
 * `confirm_duplicate`. The message stands on its own for a client that
 * cannot — every APK published before the guard existed. Its verb is neutral
 * («أكّد المتابعة») because one message now serves publish, approval and edit,
 * and each client's own button words the action differently.
 */
function possibleDuplicateError(duplicates) {
  const [first] = duplicates;
  const more = duplicates.length > 1 ? ` (و${duplicates.length - 1} غيرها)` : '';
  return ApiError.conflict(
    `تشبه مناسبة موجودة: "${first.title}" بتاريخ ${first.event_date}${first.town ? ` في ${first.town}` : ''}${more}. `
      + 'إن كانت مناسبة مختلفة فأكّد المتابعة رغم ذلك من لوحة الإدارة أو من آخر نسخة من التطبيق',
    { code: 'POSSIBLE_DUPLICATE', duplicates }
  );
}

async function addReaction(eventId, reactionType, userIdentifier) {
  const event = await db.queryOne('SELECT id FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  await db.execute(
    'INSERT INTO reactions (event_id, reaction_type, user_identifier) VALUES (?, ?, ?)',
    [eventId, reactionType, userIdentifier || 'guest']
  );
}

/**
 * Writes a congratulation/تعزية. Status is decided by the occasion type's own
 * `premoderate_messages` flag, never by name — عزا carries it today, nothing
 * else does (#20 step 5, decision ٢). The badge falls back to the type's own
 * `default_badge_title`, and to an empty string (never a festive placeholder
 * like the old hardcoded 'صديق العريس') when the type has none — `badge_title`
 * stays NOT NULL in the schema on purpose (an already-published APK reads
 * it), so "no badge" is an empty string, not NULL (#20 step 5, decision ٨).
 */
async function addCongratulation(eventId, { userId, senderName, badgeTitleOverride, message, stickerUrl }) {
  const event = await db.queryOne('SELECT id, occasion_type_id FROM events WHERE id = ?', [eventId]);
  if (!event) throw ApiError.notFound('المناسبة غير موجودة');

  const type = event.occasion_type_id ? await occasionTypes.getTypeById(event.occasion_type_id) : null;
  const status = type?.premoderate_messages ? 'pending' : 'approved';
  const badge = badgeTitleOverride || type?.default_badge_title || '';

  const { insertId } = await db.execute(
    `INSERT INTO congratulations (event_id, sender_name, badge_title, message, sticker_url, user_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eventId, senderName, badge, message, stickerUrl, userId, status]
  );

  return {
    id: insertId,
    event_id: eventId,
    sender_name: senderName,
    badge_title: badge,
    message,
    sticker_url: stickerUrl || null,
    status,
    user_id: userId,
    reports_count: 0,
    created_at: new Date().toISOString()
  };
}

/** Every congratulation on an event, optionally filtered by status — the owner/admin moderation queue. */
async function listCongratulationsForModeration(eventId, status = null) {
  const rows = status
    ? await db.query(
      'SELECT * FROM congratulations WHERE event_id = ? AND status = ? ORDER BY created_at DESC',
      [eventId, status]
    )
    : await db.query('SELECT * FROM congratulations WHERE event_id = ? ORDER BY created_at DESC', [eventId]);
  return rows.map(withAbsoluteMedia);
}

/** Fetches a single congratulation scoped to its event, or null — used to check who last moderated it before an owner is allowed to lift a hide. */
async function getCongratulationById(eventId, congratulationId) {
  return db.queryOne('SELECT * FROM congratulations WHERE id = ? AND event_id = ?', [congratulationId, eventId]);
}

/**
 * A human review decision — approve or reject — always recorded with who and
 * when. There is no 'rejected' status in this domain (only pending/approved/
 * hidden), so 'reject' lands on 'hidden': not shown to anyone, same outcome
 * as an auto-hide from reports, but this one was a deliberate human call.
 */
async function moderateCongratulation(eventId, congratulationId, { action, moderatedBy }) {
  const nextStatus = action === 'approve' ? 'approved' : 'hidden';
  const { affectedRows } = await db.execute(
    `UPDATE congratulations SET status = ?, moderated_by = ?, moderated_at = NOW()
      WHERE id = ? AND event_id = ?`,
    [nextStatus, moderatedBy, congratulationId, eventId]
  );
  if (!affectedRows) throw ApiError.notFound('التعليق غير موجود');

  return db.queryOne('SELECT * FROM congratulations WHERE id = ?', [congratulationId]);
}

/** The owner or admin deletes a congratulation on their own event — an ownership right, in every occasion type. */
async function deleteCongratulation(eventId, congratulationId) {
  const { affectedRows } = await db.execute(
    'DELETE FROM congratulations WHERE id = ? AND event_id = ?',
    [congratulationId, eventId]
  );
  if (!affectedRows) throw ApiError.notFound('التعليق غير موجود');
}

/**
 * Records one report (the UNIQUE key on congratulation_reports rejects a
 * second report from the same person outright) and, past the threshold,
 * auto-hides the message — but only one nobody has reviewed yet. A message a
 * human already approved on purpose (`moderated_by` set) is left alone:
 * reports are a substitute for review, not a veto over a review that already
 * happened, otherwise a pile-on could silence something a human already
 * judged fine (#20 step 5, decision ٩).
 */
async function reportCongratulation(eventId, congratulationId, userId) {
  return db.transaction(async connection => {
    const [rows] = await connection.execute(
      'SELECT id, status, moderated_by FROM congratulations WHERE id = ? AND event_id = ?',
      [congratulationId, eventId]
    );
    if (!rows.length) throw ApiError.notFound('التعليق غير موجود');

    try {
      await connection.execute(
        'INSERT INTO congratulation_reports (congratulation_id, user_id) VALUES (?, ?)',
        [congratulationId, userId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw ApiError.conflict('لقد أبلغت عن هذه الرسالة مسبقاً');
      throw err;
    }

    await connection.execute(
      'UPDATE congratulations SET reports_count = reports_count + 1 WHERE id = ?',
      [congratulationId]
    );

    const [updatedRows] = await connection.execute(
      'SELECT reports_count, status, moderated_by FROM congratulations WHERE id = ?',
      [congratulationId]
    );
    const updated = updatedRows[0];

    let status = updated.status;
    if (updated.reports_count >= CONGRATULATION_REPORT_THRESHOLD && status === 'approved' && updated.moderated_by === null) {
      await connection.execute("UPDATE congratulations SET status = 'hidden' WHERE id = ?", [congratulationId]);
      status = 'hidden';
    }

    return { reports_count: updated.reports_count, status };
  });
}

/**
 * The one row the shareable event page (`GET /e/:id`) needs — nothing else,
 * since that page deliberately shows only a poster, the honoree names and a
 * download button (server/src/routes/share.routes.js). Returns `null` for a
 * non-`approved` status or a non-existent id alike: the route must not be
 * able to tell those two apart from this function's result, any more than
 * from its own response.
 *
 * **وهو قراءة بالمعرّف، فلا يستدعي `PUBLIC_EVENT_VISIBLE_SQL_EVENTS` عمداً:**
 * `approved` مكتوبة صراحةً في `WHERE` لأن الصفحة تُفتح بلا حساب فالمعتمدة وحدها
 * لها صفحة. وهذا هو ما يجعل هذه القراءة **الطريق التي يملكها من يصله الرابط
 * إلى مناسبة «بالرابط فقط»** (تذكرة #166): شرط الظهور المضاف إلى القطعة لا
 * يصلها، و`visibility` تُقرأ وتُعاد ولا تُصفّى — فالصفحة تُفتح للمخفيّة كما
 * تُفتح للعامة، والفرق الوحيد `noindex` في الوسم والترويسة (`share.routes.js`).
 * ولو مرّت بها القطعة لصارت 404، ولما بقي لصاحب المناسبة المخفيّة طريق.
 *
 * والاستعلام نفسه يخدم أيضاً `/e/:id/card.jpg` و`/e/:id/download` و
 * `/e/:id/download.png`: تستدعي `getShareEvent` أربع صفحات في `share.routes.js` —
 * `GET /e/:id` و`GET /e/:id/card.jpg` و`GET /e/:id/download` و
 * `GET /e/:id/download.png` — فقاعدة هذه القراءة تسري على الأربع معاً.
 *
 * `is_expired` reuses the exact span rule
 * (`span_end < CURDATE()`, the EVENT_SPAN_* constants) every other
 * upcoming/archive query in this file uses, computed in SQL rather than by a
 * second, JS-side copy of the same rule.
 *
 * `updated_at` is selected for one more reason beyond display: it is the
 * cache key `shareCard.service.js` renders the OG card under, so an edited
 * event gets a new card automatically — no explicit cache-invalidation call
 * anywhere else in the codebase.
 *
 * `status` and `rsvp_enabled` are selected for one reader only: the guest RSVP
 * form on this page (ticket #169, ADR-0015 §3). `status` is fixed by the
 * WHERE clause, but `guestRsvpOpen` reads the same two keys off both this
 * object and a raw `rsvpContext` row — selecting it here is what lets one
 * predicate serve the page and the POST instead of a second copy of the rule.
 */
async function getShareEvent(eventId) {
  const row = await db.queryOne(
    `SELECT events.id, events.title, events.family_clan, events.poster_url, events.town,
            events.event_date, events.event_end_date, events.location_name,
            events.visibility, events.status, events.updated_at,
            occasion_types.name AS occasion_type_name,
            occasion_types.tone AS occasion_type_tone,
            occasion_types.icon AS occasion_type_icon,
            occasion_types.color AS occasion_type_colour,
            occasion_types.default_poster_url AS occasion_type_poster_url,
            occasion_types.rsvp_enabled AS rsvp_enabled,
            (${EVENT_SPAN_END_SQL_EVENTS} < CURDATE()) AS is_expired
       FROM events
       LEFT JOIN occasion_types ON occasion_types.id = events.occasion_type_id
      WHERE events.id = ? AND events.status = 'approved'`,
    [eventId]
  );
  if (!row) return null;

  const honoreeMap = await honoreesForEvents([eventId]);
  // Media leaves this layer absolute, like every other query here (ADR-0002).
  // withAbsoluteMedia covers the row's own poster_url; the occasion type's
  // default poster is a joined column, not one of MEDIA_FIELDS, so it is
  // converted explicitly rather than by widening that list — the list
  // describes an event row's own media, and this column belongs to another
  // table entirely. The route does no URL work beyond the fallback constant.
  const absolute = withAbsoluteMedia(row);
  return {
    ...absolute,
    occasion_type_poster_url: absoluteMediaUrl(absolute.occasion_type_poster_url),
    is_expired: Boolean(row.is_expired),
    honorees: honoreeMap[eventId] || []
  };
}

/** منطقة التقويم كما تُعلَن في الملف — ساعة القدس التي يكتب بها أهل المناسبة. */
const CALENDAR_TIME_ZONE = 'Asia/Jerusalem';

/**
 * Domain half of `UID`: a fixed label, not `PUBLIC_URL`/the request host —
 * the UID must survive a deploy to another origin, or the same event lands in
 * the user's calendar twice.
 */
const CALENDAR_UID_DOMAIN = 'negev-events';

/**
 * Escapes one ICS text value (RFC 5545 §3.3.11): the backslash itself first,
 * then `;` `,` and a line break become `\;` `\,` `\n`. A CN/SUMMARY a
 * publisher typed must never be able to start a new property or a new
 * component.
 */
function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds one content line at 75 octets (RFC 5545 §3.1), counting UTF-8 bytes so
 * neither a property nor an Arabic letter is split down the middle; every
 * continuation line begins with a single space, which counts towards its own
 * 75, hence the 74-byte budget after the first chunk. Folding a value's middle
 * is exactly what a calendar client un-folds back, so the text survives run
 * through `fold` → `unfold` unchanged.
 */
function foldIcsLine(line) {
  const chunks = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    const budget = chunks.length === 0 ? 75 : 74;
    if (bytes + size > budget) {
      chunks.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  chunks.push(current);
  return chunks.join('\r\n ');
}

/** `'YYYY-MM-DD'` (mysql2 returns DATE as this string) → `'YYYYMMDD'`, no time zone involved. */
function icsDate(dateString) {
  return String(dateString).slice(0, 10).replace(/-/g, '');
}

/** The day after `'YYYY-MM-DD'`, in the same `'YYYYMMDD'` shape — `DTEND` is exclusive. */
function icsDayAfter(dateString) {
  const [year, month, day] = String(dateString).slice(0, 10).split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

/** `DTSTAMP` — the instant the file was generated, UTC as the property requires (`…Z`). */
function icsStamp(now = new Date()) {
  return `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** اسم القرية تحت البند الجامع، وإلا البلدة — نفس `eventPlaceName` في العميلين. */
function calendarPlaceName(row) {
  if (row.town === VILLAGES_TOWN) {
    if (row.village_name) return row.village_name;
    if (row.village_id === null && row.requested_village_name) return row.requested_village_name;
  }
  return row.town;
}

/**
 * `DESCRIPTION` — نصوص الوقت التي كتبها الناشر، بترتيب صفحة المناسبة نفسها:
 * أوقات محطات «برنامج المناسبة» (`event_days.day_time`) ثم سطر «موعد العشاء»
 * (`events.dinner_time`). نصوص حرّة («بعد العصر»، «7:30 مساءً») تُنقل كما هي:
 * لا تحويل إلى ساعة رقمية ولا اختلاق ساعة لـ`DTSTART` (المدخل يومٌ كامل)،
 * لكن إسقاطها مرفوض — الملف يوصف بالعنوان والتاريخ والمكان والوقت. سطر بلا
 * وقت مكتوب لا يُكتب، وبلا أوقات أصلاً يعود النصّ فارغاً فلا `DESCRIPTION`
 * إطلاقاً.
 */
function calendarDescription(eventDays, dinnerTime) {
  const lines = eventDays
    .filter(day => day.day_time && String(day.day_time).trim())
    .map(day => `${day.name}: ${String(day.day_time).trim()}`);
  const dinner = dinnerTime && String(dinnerTime).trim();
  if (dinner) lines.push(`موعد العشاء: ${dinner}`);
  return lines.join('\n');
}

/**
 * «أضف إلى تقويم الهاتف» (تذكرة #176) — ملف iCalendar (RFC 5545) لصفحة
 * المناسبة، يُقدَّم من `GET /api/events/:id/calendar.ics` بلا مصادقة.
 *
 * **بوابته هي بوابة الظهور العامة وحدها** (`PUBLIC_EVENT_VISIBLE_SQL_EVENTS`):
 * معتمدة **وعامة**، ومجدولةٌ بلغ موعدُها (أو غير مجدولة أصلاً). فالمعلّقة
 * والمردودة و«بالرابط فقط» والمجدولة التي لم يبلغ موعدها بعد وغير الموجودة
 * كلها 404 بجسم واحد، فلا يفرّق الردّ بين «غير موجودة» و«لم تُعتمد بعد» — كصفحة
 * المشاركة في هذا الجزء بعينه.
 * **وهو أضيق منها في موضعين عمداً:** `/e/:id` تفتح «بالرابط فقط» لأنها طريقها
 * الوحيد (ADR-0006)، وتفتح المعتمدة المجدولة قبل موعدها؛ وهذا الملف ليس طريقاً
 * إليهما فلا يرث استثناءيهما.
 * ولا يُقيَّد بالمناسبة القادمة: تقويم عرسٍ مضى ما زال ملفاً صحيحاً يفتحه صاحب
 * رابطه.
 *
 * **وبياناته هي بيانات صفحة المناسبة** لا استعلاماً موازياً: نفس صفّ
 * `events`، ونفس `attachHonoreesAndTypes` الذي يبني منه `getEventDetails`
 * `honorees` و`extra_days` و`occasion_type`. والعنوان هو عنوان الصفحة نفسه
 * (`eventCardHeadline` في `web/app.js`، ونظيره `cardHeadline` في
 * `mobile/lib/models/event.dart`): «النوع + أسماء أصحاب المناسبة»، و`groom_name`
 * للصفوف القديمة بلا `honorees`، وبلا اسم إطلاقاً العنوان الحرّ ثم اسم النوع.
 * والمكان هو سطر المكان فيها: اسم القرية تحت البند الجامع وإلا البلدة، ثم
 * `location_name`.
 *
 * **الوقت:** لا عمود ساعة على المناسبة — `dinner_time` و`day_time` نصّان حرّان
 * يكتبهما الناشر («7:30 مساءً»، «بعد العصر»)، فلا يُختلق منهما `DTSTART` ساعةً.
 * المدخل **يومٌ كامل** (`DTSTART;VALUE=DATE`، و`DTEND` اليوم التالي لآخر يوم)،
 * و«آخر يوم» هو `event_end_date` حين يكون بعد البداية، و`X-WR-TIMEZONE` يعلن
 * منطقة القدس التي يُفتح بها التقويم. **ونصوص الوقت لا تُسقَط:** تُسرد في
 * `DESCRIPTION` (وقت كل يوم كتب له وقت في «برنامج المناسبة»، ثم «موعد العشاء:
 * …») — ملفٌّ يقول العنوان والتاريخ والمكان ويسكت عن الساعة التي كتبها صاحب
 * المناسبة لا يطابق صفحته.
 *
 * Returns `{ filename, body }` — الاسم من معرّف رقمي وحده (لا شيء يكتبه مستخدم
 * يدخل `Content-Disposition`)، و`UID` مشتقّ من المعرّف وحده فيبقى ثابتاً مهما
 * تغيّر عنوان الخادم، فلا يُنشئ التقويم حدثاً ثانياً لصاحب رابط قديم.
 */
async function getEventCalendar(eventId) {
  // `events.occasion_type_id` منتقىً هنا لأن `attachHonoreesAndTypes` يبني منه
  // `occasion_type` (تحتاج أيضاً `events.id`، وهو منتقى): بلا هذا العمود يعود
  // النوع فارغاً ويُبنى `SUMMARY` من الأصحاب وحدهم بلا اسم النوع («سالم» لا
  // «عرس سالم»). و`groom_name` لأن عنوان الصفحة يسقط إليه حين لا `honorees`،
  // و`dinner_time` لأن `DESCRIPTION` يحمل الوقت. والأعمدة الأخرى في القائمة هي
  // كل ما يقرأه التوليد أدناه.
  // معرّف المناسبة أول `params`، فساعة الإعلان ثانيتهما (موضع `?` الوحيد في
  // شرط الظهور).
  const row = await db.queryOne(
    `SELECT events.id, events.occasion_type_id, events.title, events.groom_name,
            events.town, events.village_id, events.requested_village_name,
            events.location_name, events.dinner_time,
            events.event_date, events.event_end_date,
            villages.name AS village_name
       FROM events
       LEFT JOIN villages ON villages.id = events.village_id
      WHERE events.id = ? AND ${PUBLIC_EVENT_VISIBLE_SQL_EVENTS}`,
    [eventId, publishNowClock()]
  );
  if (!row) throw ApiError.notFound('المناسبة غير موجودة');

  const [withRelations] = await attachHonoreesAndTypes([row]);
  const typeName = withRelations.occasion_type ? withRelations.occasion_type.name : '';
  // أسماء أصحاب المناسبة، و`groom_name` للصفوف القديمة بلا `honorees` — نفس
  // `eventHonoreeNames` في الويب. بلا هذا السقوط يخرج `SUMMARY` بالعنوان الحرّ
  // وحده («اللد») بينما الصفحة تقول «عرس سالم».
  const honoreeNames = withRelations.honorees
    .map(honoree => String(honoree.name || '').trim())
    .filter(Boolean);
  if (!honoreeNames.length && row.groom_name && String(row.groom_name).trim()) {
    honoreeNames.push(String(row.groom_name).trim());
  }
  const joinedNames = honoreeNames.join(' و ');
  // «النوع + الأسماء» دائماً حين يوجد اسم؛ وإلا العنوان الحرّ ثم اسم النوع —
  // و«مناسبة» آخر ملاذ كي لا يخرج `SUMMARY` فارغاً.
  const summary = joinedNames
    ? (typeName ? `${typeName} ${joinedNames}` : joinedNames)
    : (row.title || typeName || 'مناسبة');
  const place = [calendarPlaceName(row), row.location_name].filter(Boolean).join(' — ');
  const description = calendarDescription(withRelations.extra_days, row.dinner_time);
  const lastDay = row.event_end_date && row.event_end_date > row.event_date ? row.event_end_date : row.event_date;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Negev Events//Occasion Calendar//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-TIMEZONE:${CALENDAR_TIME_ZONE}`,
    'BEGIN:VEVENT',
    `UID:event-${eventId}@${CALENDAR_UID_DOMAIN}`,
    `DTSTAMP:${icsStamp()}`,
    `DTSTART;VALUE=DATE:${icsDate(row.event_date)}`,
    `DTEND;VALUE=DATE:${icsDayAfter(lastDay)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    ...(place ? [`LOCATION:${escapeIcsText(place)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeIcsText(description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  // CRLF after every line, the last one included (RFC 5545 §3.1).
  return { filename: `event-${eventId}.ics`, body: `${lines.map(foldIcsLine).join('\r\n')}\r\n` };
}

/**
 * «مناسبات أخرى» أسفل صفحة المشاركة (/e/:id): مناسبات معتمدة أخرى في نفس
 * البلدة أو لنفس العائلة، القادمة أولاً ثم الأحدث، بلا المناسبة نفسها.
 * كل الاستعلامات مربوطة `?` — لا دمج نصوص SQL بقيم. `limit` مقصوص 1..6
 * (ومخرجه لا يزيد على 6 صفوف مهما أُرسل).
 *
 * The union is OR, not AND: an event sharing either the town or the family is
 * a plausible "other occasion" — requiring both would empty the section for
 * every family whose occasions are spread across towns. Both missing means
 * there is nothing to relate to (an unconditional query would just return an
 * arbitrary list), so that case short-circuits before touching the database.
 * Ordering reuses the EVENT_SPAN_* rule rather than COALESCE(event_end_date,
 * event_date): a multi-day occasion whose حنّة day is still ahead is upcoming
 * even if its main date has passed.
 */
async function listRelatedEvents({ town = null, familyClan = null, excludeId = null, limit = 6 } = {}) {
  // بلا بلدة وبلا عائلة لا يوجد «مناسبات أخرى» — استعلام بلا شرط يرجّع قائمة عشوائية.
  if (!town && !familyClan) return [];
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 6, 1), 6);

  const conditions = [PUBLIC_EVENT_VISIBLE_SQL_EVENTS];
  const params = [publishNowClock()];

  const placeConditions = [];
  if (town) {
    placeConditions.push('events.town = ?');
    params.push(town);
  }
  if (familyClan) {
    placeConditions.push('events.family_clan = ?');
    params.push(familyClan);
  }
  conditions.push(`(${placeConditions.join(' OR ')})`);

  if (excludeId) {
    conditions.push('events.id <> ?');
    params.push(excludeId);
  }

  // Only the six columns the share page's link list draws, nothing else —
  // the route has no use for the rest of the row.
  const rows = await db.query(
    `SELECT events.id, events.title, events.town, events.family_clan,
            occasion_types.name AS occasion_type_name, events.event_date
       FROM events
       LEFT JOIN occasion_types ON occasion_types.id = events.occasion_type_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY (${EVENT_SPAN_END_SQL_EVENTS} >= CURDATE()) DESC,
               CASE WHEN ${EVENT_SPAN_END_SQL_EVENTS} >= CURDATE() THEN events.event_date END ASC,
               events.event_date DESC,
               events.id DESC
      LIMIT ?`,
    [...params, safeLimit]
  );
  return rows;
}

/** All approved events for sitemap generation — only id and lastmod. */
async function listSitemapEvents() {
  const rows = await db.query(
    `SELECT id, updated_at FROM events WHERE ${PUBLIC_EVENT_VISIBLE_SQL_EVENTS} ORDER BY updated_at DESC`,
    [publishNowClock()]
  );
  return rows.map(r => ({
    id: r.id,
    lastmod: r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  }));
}

/** Per-town counts of approved events, for the filter chips. */
async function townStats() {
  return db.query(
    `SELECT town, COUNT(*) AS events_count
       FROM events
      WHERE ${PUBLIC_EVENT_VISIBLE_SQL_EVENTS}
      GROUP BY town
      ORDER BY events_count DESC`,
    [publishNowClock()]
  );
}

module.exports = {
  listPublicEvents,
  setEventFeatured,
  getEventDetails,
  listMapPoints,
  listCalendarDays,
  listTrendingEvents,
  checkTownMismatch,
  createEvent,
  familyClanFor,
  getEventForEdit,
  releaseReplacedImage,
  updateEvent,
  editedRegion,
  classifyAmendment,
  columnValueChanged,
  CRITICAL_AMENDMENT_FIELDS,
  EVENT_SPAN_START_SQL_EVENTS,
  EVENT_SPAN_END_SQL_EVENTS,
  EVENT_SPAN_END_SQL_E,
  EVENT_SPAN_START_SQL_E,
  PUBLIC_EVENT_VISIBLE_SQL_EVENTS,
  PUBLIC_EVENT_VISIBLE_SQL_E,
  EVENT_FEED_WINDOW_SQL_EVENTS,
  publishNowClock,
  publishGateOpen,
  listDueScheduledPublish,
  markAnnounced,
  escapeLike,
  honoreesForEvents,
  eventDaysForEvents,
  listAmendments,
  listMyEvents,
  findCollisions,
  findPossibleDuplicates,
  possibleDuplicateError,
  setReminder,
  removeReminder,
  setReminderNotify,
  clearEndedReminders,
  rsvpCountVisible,
  setRsvp,
  removeRsvp,
  listEventRsvps,
  guestRsvpOpen,
  guestRsvpContext,
  setGuestRsvp,
  isInviteToken,
  createEventInvites,
  listEventInvites,
  deleteEventInvite,
  resolveInvite,
  markInviteOpened,
  myListBucket,
  listMyReminders,
  listLiveAnnouncements,
  addReaction,
  addCongratulation,
  listCongratulationsForModeration,
  getCongratulationById,
  moderateCongratulation,
  deleteCongratulation,
  reportCongratulation,
  townStats,
  getShareEvent,
  getEventCalendar,
  listRelatedEvents,
  listSitemapEvents
};
