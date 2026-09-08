# برومت الوكيل — إعادة بناء الخادم وإنهاء نشر ‎#85

انسخ كل ما تحت الخطّ والصقه للوكيل الذي يعمل **على السيرفر**.

---

أنت تُنهي نشراً نصفه تمّ ونصفه لا. اقرأ كل شيء قبل أن تنفّذ أول أمر.

## البيئة

- تعمل على `root@munasbat.ktra-pro.tech`، داخل `/root/munasbat/app`
- ملف البيئة: `/root/munasbat/app/.env` — **وليس** `server/.env`
- الفرع: `main`

## الحالة الآن — مُتحقَّق منها فعلاً، لا مفترضة

فُحصت من الخارج قبل دقائق:

| | الحالة |
|---|---|
| ملفات الويب | ✅ منشورة — `/sw.js` و `/occasionForm.js` يرجّعان `200` |
| الخادم (API) | 🔴 **لا يزال يشغّل الكود القديم** |
| الـAPK | ✅ سليم ومرفوع ومُتحقَّق منه (تفاصيله أدناه — **لا تلمسه**) |

النقاط الأربع الجديدة كلها `404` الآن:

```
/api/settings/public                  404
/api/broadcasts/live                  404
/api/notifications/vapid-public-key   404
/api/reminders/schedule               404
```

**هذا هو العطل الوحيد المتبقّي، وهو سبب أن الموقع الجديد لا يعمل:** الواجهة
الجديدة منشورة وتنادي خادماً قديماً لا يعرف هذه العناوين. مركز الإشعارات
وشريط التعاميم ورقم الدعم كلها ميّتة حتى تُنهي هذه المهمّة.

**السبب:** `docker-compose.yml` فيه `app: build: ./server` — الصورة **مبنيّة**
من الكود لا مربوطة به. فـ`docker compose up -d app` وحده **لا يكفي**: يعيد
تشغيل الصورة القديمة نفسها. **لا بدّ من `build`.**

## ما الذي تنشره

‏#85 كاملة على الخادم: ثلاثة جداول جديدة (`broadcast_views`، `app_settings`،
`push_subscriptions`)، وأعمدة جديدة على `notifications` و`broadcasts`
و`occasion_types`، ووظيفة مجدولة تبدأ مع الإقلاع وتكتب إشعارات العدّ التنازلي
‏٩:٠٠ صباحاً بتوقيت آسيا/القدس، وWeb Push بلا Firebase، والتعاميم بنغمة ومدّة.

⚠️ **الترحيل يعمل تلقائياً عند كل إقلاع.** لذلك النسخة الاحتياطية **قبل**
إعادة التشغيل، لا بعدها.

## قواعد لا تُكسر

1. **لا تقرأ `.env` ولا تطبع محتواه ولا تنسخ أي قيمة منه إلى أي ملف أو رسالة.**
2. **لا تلمس `APP_MIN_VERSION` إطلاقاً.**
3. **لا تلمس `/root/munasbat/app/server/downloads/negev-events.apk`** — رُفع
   وتُحقِّق منه، وأي مساس به يكسر تحديث كل مستخدم.
4. **لا تشغّل `npm test` على السيرفر** — يرفض العمل عند `NODE_ENV=production`
   ويكتب بيانات تجريبية.
5. **لا تحذف أي شيء من `/app/uploads`** — ملصقات مناسبات قائمة.
6. **عند أي نتيجة مخالفة للمتوقَّع: قف فوراً، لا تُصلح من عندك، وأبلغ.**

---

## ١. النسخة الاحتياطية — أولاً، قبل أي شيء

```
cd /root/munasbat/app
docker exec negev_events_mysql sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines negev_events' > ~/negev-backup-before-85.sql
tail -1 ~/negev-backup-before-85.sql
ls -l ~/negev-backup-before-85.sql
```

السطر الأخير يجب أن يكون `-- Dump completed`، والحجم غير صفري.
🛑 إن لم يكن: **قف وأبلغ، ولا تكمل.**

## ٢. سجّل نقطة التراجع

```
cd /root/munasbat/app
git rev-parse --short HEAD
git status --short
```

**اكتب هذا الـSHA في تقريرك** — نقطة التراجع الوحيدة. وجود
`docker-compose.override.yml` غير متتبَّع أمر طبيعي، اتركه.

## ٣. اسحب

```
cd /root/munasbat/app
git pull origin main
git log --oneline -1
```

يجب أن يظهر `f81b853` أو أحدث. **هذا السحب ضروري**: فيه إصلاح
`docker-compose.yml` الذي بدونه لا تصل مفاتيح VAPID الحاوية إطلاقاً.

## ٤. تأكّد أن الإصلاح وصل فعلاً

```
cd /root/munasbat/app
grep -c "VAPID_PUBLIC_KEY" docker-compose.yml
```

يجب أن يكون **`1`**. 🛑 إن كان `0` فالسحب لم يأتِ بالإصلاح — **قف وأبلغ**، ولا
تعدّل الملف بيدك.

## ٥. أعد بناء الصورة ثم شغّلها

```
cd /root/munasbat/app
docker compose build app
docker compose up -d app
sleep 25
docker compose logs --tail=60 app
```

في السجلّ يجب أن تجد سطراً يبدأ بـ:

```
[migrations] add-reach-and-usability-schema-2026-09: ensured columns/keys/tables;
```

🛑 إن لم يظهر هذا السطر، أو ظهر خطأ SQL: **قف فوراً وأبلغ بنصّ السجلّ كاملاً.**
لا تعِد التشغيل مرّة ثانية على أمل أن ينجح.

## ٦. تحقّق — هذه هي البوّابة التي تثبت أن المهمّة نجحت

```
curl -s -o /dev/null -w "settings/public: %{http_code}\n"      https://munasbat.ktra-pro.tech/api/settings/public
curl -s -o /dev/null -w "broadcasts/live: %{http_code}\n"      https://munasbat.ktra-pro.tech/api/broadcasts/live
curl -s -o /dev/null -w "vapid-key: %{http_code}\n"            https://munasbat.ktra-pro.tech/api/notifications/vapid-public-key
curl -s -o /dev/null -w "reminders/schedule: %{http_code}\n"   https://munasbat.ktra-pro.tech/api/reminders/schedule
```

**المتوقَّع: `200` · `200` · `200` · `401`.**

الأربعة كانت `404` قبل عملك. `reminders/schedule` يعطي `401` لأنه خلف تسجيل
دخول — وهذا هو الصواب، لا عطل.

🛑 إن بقي أيٌّ منها `404` فالصورة القديمة لا تزال تعمل: **قف وأبلغ**، وأرفق
`docker compose logs app | tail -60` و `docker images | head`.

ثم الفحوص الخمسة الباقية:

```
curl -s https://munasbat.ktra-pro.tech/api/settings/public
curl -s https://munasbat.ktra-pro.tech/api/broadcasts/live
curl -s https://munasbat.ktra-pro.tech/api/notifications/vapid-public-key
curl -s https://munasbat.ktra-pro.tech/api/app/version
curl -s "https://munasbat.ktra-pro.tech/api/services/providers" | grep -c phone
```

المتوقَّع:

1. `{"success":true,"settings":{"support_whatsapp_number":null}}` — `null` صحيح
   ومتوقَّع، فالرقم لم يُحفَظ بعد من اللوحة
2. `{"success":true,"broadcasts":[]}` — مصفوفة، ولا يتطلب تسجيل دخول
3. `public_key` — **قيمة نصّية** إن كان المالك قد لصق زوج VAPID في `.env`، أو
   `null` إن لم يفعل بعد. **كلاهما مقبول؛ اذكر أيّهما جاء صراحةً** — فهذا
   بالضبط ما يثبت أن إصلاح `docker-compose.yml` عمل
4. `"latest_version":"1.6.0"` و `apk_url` يبدأ بـ`https://`
5. **صفر**

🛑 إن جاء عدّاد `phone` بغير الصفر: **قف وأبلغ فوراً** — أرقام مزوّدي خدمة
تُبَثّ في استجابة عامة، وهو خرق أمني لا خلل تجميلي.

## ٧. تأكّد أن الـAPK لم يُمَسّ

```
ls -l /root/munasbat/app/server/downloads/negev-events.apk
sha256sum /root/munasbat/app/server/downloads/negev-events.apk
```

المتوقَّع **بالضبط**:

```
الحجم   60296027
sha256  bfe06966e07ff7a63c2ed135658eb5fecb37414b5765467a8cf8658b19160da9
```

🛑 أي اختلاف: **قف وأبلغ.** لا تعِد رفع شيء ولا تحذف شيئاً — هذا الملف موقَّع
بمفتاحين مع نسب (v2+v3+v3.1)، وأي بديل موقَّع بمفتاح واحد يكسر التحديث على كل
جهاز أندرويد أقدم من ‎13.

## التراجع

```
cd /root/munasbat/app
git checkout <SHA خطوة ٢>
docker compose build app
docker compose up -d app
```

⚠️ **الترحيل لا يتراجع مع الكود** — الأعمدة والجداول الجديدة تبقى. وهي كلها
إضافات لا تكسر الكود القديم، فالتراجع آمن؛ لكن إن احتجت قاعدة نظيفة فمن نسخة
الخطوة ١ وحدها.

---

## ماذا تُبلغ في النهاية

SHA نقطة التراجع · ناتج `grep -c VAPID_PUBLIC_KEY` · سطر الترحيل كما ظهر في
السجلّ حرفياً · **الرموز الأربعة بأرقامها** · هل جاء `public_key` قيمةً أم
`null` · بصمة الـAPK وحجمه · أي شيء خالف المتوقَّع وما فعلته حياله.

**لا تكتب «نجح» بلا رقم.**

---

## خارج نطاقك — خطوة إنسان

توليد زوج VAPID (`npx web-push generate-vapid-keys`) ولصقه بيد المالك في
`.env`. **لا تولّده ولا تطلبه ولا تنقله** — المفتاح الخاص لا يمرّ عبر وكيل.
إن لم يكن قد لُصق بعد فالنشر يصحّ كما هو: الخادم يعمل، والإشعارات تُكتب
كصفوف، ويُرفض اشتراك Web Push برسالة عربية واضحة بدل عطل.

وبعد الانتهاء يبقى تأكيدان بصريان لا يستطيع وكيل رؤيتهما: فتح الموقع
بـ`Ctrl + Shift + R` والتأكّد من رقاقتَي الفلتر والكرت ٤:٥ ومركز الإشعارات ·
وتثبيت الـAPK على هاتف أندرويد حقيقي وتجربة «ذكّرني» ثم إغلاق التطبيق تماماً
وانتظار المنبّه.
