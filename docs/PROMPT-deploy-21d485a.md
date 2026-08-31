# برومت النشر — تحديث 21d485a

انسخ كل ما تحت الخط وأعطه للوكيل.

---

تحديث صغير على `https://munasbat.ktra-pro.tech`. **لا تغيير في البنية ولا في
قاعدة البيانات ولا في المنافذ** — سحب كود، حل تعارض واحد متوقَّع، إعادة بناء.

المستودع: `https://github.com/thabet-toma/negev-events-app` · الفرع `main` ·
الالتزام `21d485a`.

## ما فيه

ثلاث علل في المستودع كشفها نشرك السابق، أُصلحت الآن في الأصل. **الحلول
الالتفافية التي طبّقتها على السيرفر صارت زائدة، وبعضها سيتعارض.**

1. `web/config.js` كان يشحن `apiBase: 'http://localhost:3000'` مثبَّتاً. صار
   الافتراضي `''` (نفس الأصل) — نفس ما ضبطته يدوياً، لكن في الأصل هذه المرة.
2. `docker-compose.yml` صار يمرّر `APP_*` إلى الحاوية، ويربط
   `./server/downloads` كـbind mount، ويربط المنافذ المنشورة بـ`127.0.0.1`
   افتراضياً (`BIND_HOST` للتجاوز).
3. `server/test/smoke.test.js` صار يرفض العمل عند `NODE_ENV=production`.

كما أُضيف `web/serve.js` يمرّر مسارات الخادم في التطوير — لا أثر له على
الإنتاج، فnginx يقوم بهذا الدور.

## التعارض المتوقَّع — الوحيد

عدّلت `web/config.js` يدوياً، وهو ملف متتبَّع تغيّر في الأصل. سيرفض `git pull`
الدمج أو يفتح تعارضاً.

**الحل: تخلَّ عن تعديلك المحلي واقبل نسخة المستودع.** القيمة الجديدة `''` هي
نفسها التي ضبطتها، مع تعليقات تشرح السبب.

```bash
cd <app-dir>
git stash push web/config.js     # أو: git checkout -- web/config.js
git pull origin main
git stash drop                   # لن تحتاجه
```

تحقّق بعدها أن الملف يحمل `apiBase: ''` وليس أي عنوان مطلق:

```bash
grep apiBase web/config.js
```

إن ظهر أي تعارض آخر في ملف متتبَّع عدّلته، **قف وأبلغ** قبل حله.

## `docker-compose.override.yml` — لا تحذفه كاملاً

الأصل صار يمرّر `APP_*` بنفسه، فتلك السطور في ملف التجاوز صارت مكرّرة. التكرار
غير ضار — Compose يدمج والتجاوز يفوز بنفس القيم.

لكن ملف التجاوز يحمل أيضاً إعدادات حقيقية لا بديل عنها (المنفذ 3100، ربط
الواجهة بالحلقة المحلية، وربما مسارات). **أبقِه.** لك أن تحذف منه سطور `APP_*`
فقط إن أردت التبسيط، بشرط أن تبقى القيم مضبوطة في `.env` وأن يقرأها Compose.

بعد الدمج تحقّق أن المنفذ الفعلي لم يتغيّر عمّا كان (3100) — الأصل يفترض 3000،
وتجاوزك هو ما يحسم.

## أعد البناء والتشغيل

```bash
docker compose up -d --build
docker compose ps
```

انتظر حتى تصبح الحاويات `healthy` قبل التحقق.

## تحقّق

```bash
curl -s https://munasbat.ktra-pro.tech/health
# {"status":"ok","database":"up",...}

curl -s https://munasbat.ktra-pro.tech/api/app/version
# latest_version = 1.0.0 و apk_url مطلق — وليس null

curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/api.js
# 200 — ملف ثابت. لو رجع 404 فقاعدة nginx تبتلع المسار: استخدم ^~ /api/

curl -s https://munasbat.ktra-pro.tech/api/events | grep -o '"poster_url":"[^"]*"' | head -5
# لا رابط يبدأ بـ /uploads

curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/
# 200
```

ثم في المتصفح: الموقع يعرض المناسبات والصور، `/admin.html` يعمل، وجلسة قديمة
ما زالت صالحة.

## ملف APK

سيزوّدك المستخدم بـ`negev-events.apk` (حوالي 54 ميجابايت). ضعه في المجلد
المربوط كـbind mount:

```bash
cp negev-events.apk <app-dir>/server/downloads/negev-events.apk
curl -sI https://munasbat.ktra-pro.tech/downloads/negev-events.apk | head -1
# HTTP/2 200
```

لا إعادة بناء ولا إعادة تشغيل — هذا هو الغرض من الـbind mount.

## اختبارات

لا تشغّل `npm test` على قاعدة الإنتاج. الاختبار الآن يرفض ذلك بنفسه عند
`NODE_ENV=production`، لكن لا تتجاوزه بـ`ALLOW_TESTS_ON_PRODUCTION`. إن أردت
تشغيله فعلى حاوية MySQL مؤقتة كما فعلت سابقاً.

## التراجع

```bash
git reset --hard d224823 && docker compose up -d --build
```

لا هجرة قاعدة بيانات في هذا التحديث، فالتراجع لا يفقد بيانات.

## أبلغ عند الانتهاء

اذكر: كيف حللت تعارض `config.js`، ما إذا بقي `docker-compose.override.yml` كما
هو أم عدّلته، نتيجة كل أمر تحقّق أعلاه، وهل رُفع ملف APK.
