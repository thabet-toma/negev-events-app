# برومت الوكيل — نشر ‎1.4.0 كاملاً

انسخ كل ما تحت الخطّ والصقه لوكيل يعمل **من داخل مجلد المشروع على جهازك**
(يحتاج SSH للسيرفر والـAPK المبنيّ محلياً).

---

أنت تنشر إصداراً لمنصة مناسبات النقب. اقرأ كل شيء قبل أن تنفّذ أول أمر.

## البيئة

- السيرفر: `root@munasbat.ktra-pro.tech` · المفتاح `~/.ssh/hostenger2/id_ed25519`
- مسار التطبيق على السيرفر: `/root/munasbat/app`
- الفرع المنشور: `main` عند `0e7e3fb`
- ملف الـAPK محلياً: `mobile/build/app/outputs/flutter-apk/app-release.apk`
  (‏55.4 م.ب، ‏`versionName=1.4.0 versionCode=6`)

## قواعد لا تُكسر

1. **لا تقرأ `.env` ولا تطبع محتواه ولا تنسخ أي قيمة منه إلى أي ملف أو رسالة.**
   ستعدّل فيه سطراً واحداً بأداة تحرير موضعية — وهذا كل تعاملك معه.
2. **لا تلمس `APP_MIN_VERSION` إطلاقاً.** رفعه يجبر كل مستخدم على التحديث قبل أن
   يفتح التطبيق، وهذا إصدار تجميلي.
3. **لا تشغّل `npm test` على السيرفر** — يرفض العمل عند `NODE_ENV=production`
   ويكتب بيانات تجريبية.
4. **لا تحذف أي شيء من `/app/uploads`** — ملصقات مناسبات قائمة.
5. **عند أي نتيجة مخالفة للمتوقَّع: توقّف فوراً، لا تُصلح من عندك، وأبلغ.**
6. الجزءان مستقلّان. **أنجِز الجزء الأول كاملاً وأبلغ، ثم انتظر إذناً للثاني.**

## ما الذي تنشره

علامة بصرية جديدة (بيت الشَّعَر) محلّ إيموجي الهلال · الموقع صار قابلاً للتثبيت
كتطبيق (مانيفست + أيقونات + إرشاد تثبيت للآيفون) · وإصدار تطبيق ‎1.4.0 فيه
الأيقونة الجديدة وإصلاح قصّ الملصق. **الخادم لم يتغيّر بحرف واحد.**

---

# الجزء الأول — الواجهة

`web` خدمة nginx بصورة جاهزة مع ربط `./web` بالقرص للقراءة. **لا build ولا
restart ولا نسخة احتياطية**: لا حاوية تُعاد تشغيلها، فلا ترحيل يعمل، والقاعدة لا
تُمَسّ. إن وجدت نفسك تكتب `docker compose build` في هذا الجزء فقد أخطأت.

```
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech \
  'cd /root/munasbat/app && git status --short && git pull origin main && git log --oneline -1'
```

`git log` يجب أن يُظهر `0e7e3fb`. وجود `docker-compose.override.yml` غير متتبَّع
أمر طبيعي — اتركه.

ثم افحص الستة، وقارن كل واحد بالمتوقَّع:

```
curl -sI https://munasbat.ktra-pro.tech/manifest.json | grep -iE "^HTTP/|^content-type"

for f in icon.svg favicon-32.png apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png; do
  printf "%-26s " "$f"
  curl -s -o /dev/null -w "%{http_code}\n" "https://munasbat.ktra-pro.tech/icons/$f"
done

curl -s https://munasbat.ktra-pro.tech/ | grep -oE 'rel="(manifest|apple-touch-icon|icon)"' | sort -u
curl -s https://munasbat.ktra-pro.tech/ | grep -c "logo-moon"
curl -s "https://munasbat.ktra-pro.tech/api/services/providers" | grep -c phone
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/
curl -sI "https://munasbat.ktra-pro.tech/e/13/card.jpg" | grep -iE "^HTTP/"
```

المتوقَّع: ‏`200` و`application/json` · **`200` ست مرات** · الأسطر الثلاثة
`manifest` و`apple-touch-icon` و`icon` · **صفر** · **صفر** · `200` · `200`.

🛑 إن جاء عدّاد `phone` بغير الصفر: **قف وأبلغ فوراً** — أرقام مزوّدي خدمة تُبَثّ
في استجابة عامة، وهو خرق أمني لا خلل تجميلي.

إن جاءت أي أيقونة `404`: السحب ناقص. راجع `git log` — لا تبنِ شيئاً.

**التراجع إن لزم:** `git checkout 01e4ec7` على السيرفر. يسري فوراً بلا بناء.

ثم **قف**. اطلب من الإنسان أن يفتح الموقع بـ`Ctrl + Shift + R` ويؤكّد ثلاثة
أشياء لا تستطيع أنت رؤيتها: علامة **خيمة** في الترويسة بدل الهلال · أيقونة في
تبويب المتصفّح · ومن آيفون، ظهور ورقة «إضافة إلى الشاشة الرئيسية» ثم نزول
التطبيق بأيقونة الخيمة واسم «مناسبات النقب» وفتحه بلا شريط سفاري.

---

# الجزء الثاني — إصدار التطبيق (لا تبدأه بلا إذن صريح)

هذا الجزء **يعيد تشغيل `app`**، و`RUN_MIGRATIONS` يعمل عند كل إقلاع.

**١. النسخة الاحتياطية — قبل إعادة التشغيل لا بعدها:**

```
cd /root/munasbat/app
docker exec negev_events_mysql sh -c \
  'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines negev_events' \
  > ~/negev-backup-before-1.4.0.sql
tail -1 ~/negev-backup-before-1.4.0.sql
```

السطر الأخير يجب أن يكون `-- Dump completed`. إن لم يكن: **قف وأبلغ، ولا تكمل.**

**٢. ارفع الـAPK من جهازك المحلي** (لا من السيرفر):

```
scp -i ~/.ssh/hostenger2/id_ed25519 \
  "mobile/build/app/outputs/flutter-apk/app-release.apk" \
  root@munasbat.ktra-pro.tech:/root/munasbat/app/server/downloads/negev-events.apk
```

`server/downloads` مربوط بالقرص، فالملف يُخدَم فور نسخه بلا إعادة بناء. تحقّق أن
الحجم على السيرفر يطابق المحلي **بالبايت**:

```
ls -l mobile/build/app/outputs/flutter-apk/app-release.apk
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech 'ls -l /root/munasbat/app/server/downloads/negev-events.apk'
curl -sI https://munasbat.ktra-pro.tech/downloads/negev-events.apk | grep -iE "^HTTP/|^content-length"
```

اختلاف بايت واحد يعني نقلاً مقطوعاً — أعد النسخ، ولا تكمل.

**٣. أعلن الإصدار.** في `/root/munasbat/app/.env` اضبط سطراً واحداً فقط:

```
APP_LATEST_VERSION=1.4.0
```

استعمل تحريراً موضعياً يمسّ هذا السطر وحده، مثل:

```
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech \
  "cd /root/munasbat/app && sed -i 's/^APP_LATEST_VERSION=.*/APP_LATEST_VERSION=1.4.0/' .env && grep -c '^APP_LATEST_VERSION=1.4.0' .env"
```

الناتج يجب أن يكون `1`. **لا تطبع الملف ولا تقرأ أي سطر آخر منه.**

**٤. أعد التشغيل:**

```
cd /root/munasbat/app && docker compose up -d app && docker compose logs --tail=40 app
```

**٥. تحقّق:**

```
curl -s https://munasbat.ktra-pro.tech/api/app/version
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH https://munasbat.ktra-pro.tech/api/events/1
curl -s "https://munasbat.ktra-pro.tech/api/services/providers" | grep -c phone
curl -sI "https://munasbat.ktra-pro.tech/e/13/card.jpg" | grep -iE "^HTTP/"
```

المتوقَّع: `"latest_version":"1.4.0"` و`apk_url` يبدأ بـ`https://` · `401` ·
**صفر** · `200`.

🛑 إن جاء الثاني `500` بدل `401` فالخادم انكسر بإعادة التشغيل: **أبلغ بنصّ
`docker compose logs app | tail -40`.**

**التراجع:** أعد `APP_LATEST_VERSION` إلى `1.3.0` ثم `docker compose up -d app`.

ثم اطلب من الإنسان تثبيت الـAPK على هاتف أندرويد حقيقي وتأكيد: أيقونة الخيمة ·
قائمة المناسبات بصورة عمودية لم يعد رأسها مقطوعاً · وفتح مناسبة يعرض الملصق
كاملاً فوق خلفية مطموسة منه.

---

## ماذا تُبلغ في النهاية

أي الجزأين نفّذت · كل فحص برقمه الفعلي لا بكلمة «نجح» · أي شيء خالف المتوقَّع وما
فعلته حياله · وما الذي لا يزال ينتظر تأكيد الإنسان بصرياً.
