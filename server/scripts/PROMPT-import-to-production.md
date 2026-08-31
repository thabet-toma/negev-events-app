# برومت جاهز — استيراد أعراس munasabatna إلى سيرفر الإنتاج

انسخ كل اللي تحت السطر وارساله للوكيل الشغال على سيرفر `munasbat.ktra-pro.tech`.

---

## المهمة

عندك مشروع `negev_events_app` (Node + Express + MySQL) شغال على `https://munasbat.ktra-pro.tech/`.
قاعدة البيانات فيها حالياً 5 مناسبات تجريبية فقط (ids 1–5).

بدي تضيف 5 أعراس حقيقية على جدول `events`. البيانات كلها موجودة تحت — **لا تحتاج تفتح أي موقع خارجي ولا تدوّر على أي مصدر**، البيانات مقروءة أصلاً من بطاقات الدعوة المنشورة على `https://munasabatna.com/weddings/` (البطاقات صور، فانقرأت يدوياً).

## جدول events — الأعمدة المطلوبة

```
title, groom_name, family_clan, town, location_name, latitude, longitude,
event_date (DATE), youth_party_date (DATE, nullable), dinner_time,
poster_url, host_phone (nullable), status ENUM('pending','approved','rejected')
```

## البيانات

```json
[
  {
    "title": "أفراح آل الكتناني — زفاف العريس مجدي",
    "groom_name": "مجدي الكتناني",
    "family_clan": "عائلة الكتناني",
    "town": "رهط",
    "location_name": "قاعة السعادة — رهط (الرجال والنساء في قاعة السعادة)",
    "event_date": "2025-10-11",
    "youth_party_date": null,
    "dinner_time": "الساعة 8:00 مساءً",
    "poster_url": "https://munasabatna.com/wp-content/uploads/2025/09/7Wedding-Invitation11.10.jpeg",
    "host_phone": null,
    "status": "approved",
    "_note": "المضيف: السيد محمد الكتناني (أبو يوسف) وعنهم يوسف الكتناني — يوم السبت"
  },
  {
    "title": "أفراح آل الزيادنة — زفاف العريسين معتز وعلي",
    "groom_name": "معتز وعلي الزيادنة",
    "family_clan": "عائلة الزيادنة",
    "town": "غير محدد",
    "location_name": "غير محدد",
    "event_date": "2025-10-17",
    "youth_party_date": "2025-10-15",
    "dinner_time": "وجبة العشاء قبل آذان المغرب",
    "poster_url": "https://munasabatna.com/wp-content/uploads/2025/09/2Wedding-Invitation17.10.jpeg",
    "host_phone": null,
    "status": "pending",
    "_note": "المضيف: عبدالعزيز الزيادنة (أبو معتز) — يوم الجمعة. البطاقة لا تذكر البلدة ولا الموقع إطلاقاً. فعاليات إضافية: عشاء افتتاح بيت الفرح 2025-10-12، حفل الشباب 2025-10-15 مع الفنان حميد أبو الليل، قعدة بدوية 2025-10-16 مع محيسن وعمر أبو عجاج، دحية مع سالم الأعسم"
  },
  {
    "title": "أفراح آل الأعسم — زفاف العريس عثمان",
    "groom_name": "عثمان الأعسم",
    "family_clan": "عائلة الأعسم",
    "town": "غير محدد",
    "location_name": "غير محدد",
    "event_date": "2025-10-24",
    "youth_party_date": null,
    "dinner_time": "الساعة 8:00 مساءً",
    "poster_url": "https://munasabatna.com/wp-content/uploads/2025/09/10Wedding-Invitation24.10.jpeg",
    "host_phone": null,
    "status": "pending",
    "_note": "المضيف: السيد نايف (أبو خالد) الأعسم — يوم الجمعة. البطاقة لا تذكر البلدة ولا الموقع"
  },
  {
    "title": "أفراح آل الحبانين — زفاف العريس هيثم",
    "groom_name": "هيثم الحبانين",
    "family_clan": "عائلة الحبانين",
    "town": "رهط",
    "location_name": "رهط — مدخل حارة 14",
    "event_date": "2025-11-01",
    "youth_party_date": "2025-10-30",
    "dinner_time": "قبل صلاة المغرب",
    "poster_url": "https://munasabatna.com/wp-content/uploads/2025/10/1.11.25-Wedding-invitation1.jpeg",
    "host_phone": null,
    "status": "approved",
    "_note": "المضيف: السيد عطيه الحبانين أبو كمال — يوم السبت. عشاء البيوت وسهرة دحية 2025-10-30 مع معين الأعسم ويوسف الصرايعه"
  },
  {
    "title": "أفراح آل الأعسم — زفاف العريس ياسين",
    "groom_name": "ياسين الأعسم",
    "family_clan": "عائلة الأعسم",
    "town": "تل السبع",
    "location_name": "تل السبع — حارة 16",
    "event_date": "2025-11-07",
    "youth_party_date": null,
    "dinner_time": "الساعة 8:00 مساءً",
    "poster_url": "https://munasabatna.com/wp-content/uploads/2025/09/12Wedding-Invitation7.11.jpeg",
    "host_phone": null,
    "status": "approved",
    "_note": "المضيف: السيد موسى الأعسم (أبو أحمد) — يوم الجمعة"
  }
]
```

احذف حقل `_note` قبل الإدخال، هو للتوثيق فقط.

## قواعد لازم تلتزم فيها

1. **أدخل عبر SQL مباشرة، مش عبر `POST /api/events`.** الراوت بيرفض أي `town` مش موجودة بقائمة `TOWNS` في `src/constants.js`، وفي مناسبتين البلدة عندهم `غير محدد` فرح ينرفضوا.

2. **الإحداثيات:** خُذ `latitude` و `longitude` من `TOWN_COORDINATES` في `src/constants.js` حسب البلدة. لـ `غير محدد` خلّيهم `NULL`.
   - رهط: `31.3925, 34.7554`
   - تل السبع: `31.2483, 34.8431`

3. **قابل لإعادة التشغيل:** قبل كل إدخال افحص
   `SELECT id FROM events WHERE groom_name = ? AND event_date = ?`
   وإذا موجود تخطّاه بدل ما تكرّره.

4. **لا تخمّن البلدة للمناسبتين الناقصات.** خليها `غير محدد` وحالتها `pending` عشان الأدمن يكمّلها من لوحة التحكم. `غير محدد` مش ضمن `TOWNS` يعني فلتر البلدات ما رح يلقطها — هاد متوقّع ومقصود.

5. **لا تلمس المناسبات الموجودة (ids 1–5)** ولا تعدّل السكيما.

## التحقق بعد الانتهاء

```sql
SELECT id, groom_name, family_clan, town, event_date, youth_party_date, status
FROM events ORDER BY event_date;
```

ولازم:

```bash
curl -s https://munasbat.ktra-pro.tech/api/events | grep -c groom_name
```

يرجّع 8 مناسبات معتمدة (5 قديمة + 3 جداد)، والمجموع الكلي بالجدول 10 مع 2 `pending`.

**تنبيه للواجهة:** تواريخ الأعراس هاي من 2025، يعني قبل التواريخ التجريبية (2026). الترتيب بالواجهة تصاعدي حسب `event_date` فرح تطلع بأول القائمة، وعليها لافتة "✨ مناسبة سابقة" — هاد سلوك طبيعي من `public/app.js` مش خطأ.
