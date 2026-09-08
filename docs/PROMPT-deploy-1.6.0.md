# برومت الوكيل — نشر ‎#85 «الوصول وسهولة الاستعمال» + إصدار ‎1.6.0

انسخ كل ما تحت الخطّ والصقه لوكيل يعمل **من داخل مجلد المشروع على جهازك**
(يحتاج SSH للسيرفر والـAPK المبنيّ محلياً).

**قبل أن تبدأ — خطوة إنسان واحدة لا يفعلها الوكيل:** ولّد زوج VAPID على جهازك
بـ`npx web-push generate-vapid-keys`، والصق القيمتين بيدك في
`/root/munasbat/app/.env` (‏`VAPID_PUBLIC_KEY` و`VAPID_PRIVATE_KEY`، ومعهما
`VAPID_SUBJECT=mailto:<بريدك>`). الوكيل ممنوع من قراءة `.env` أو كتابته إلا في
سطر واحد محدَّد لاحقاً. **الزوج يُولَّد مرّة واحدة ولا يُدوَّر أبداً** — تدويره يُخرج
كل مشترك من اشتراكه على كل أجهزته بلا إشعار. وإن أجّلت هذه الخطوة فالنشر يصحّ
كما هو: الخادم يعمل طبيعياً، الإشعارات تُكتب كصفوف، ويُرفض اشتراك Web Push
برسالة عربية واضحة بدل عطل — لكن الدفع إلى متصفّح مسكَّر لن يعمل حتى تفعلها.

---

أنت تنشر إصداراً لمنصة مناسبات النقب. اقرأ كل شيء قبل أن تنفّذ أول أمر.

## البيئة

- السيرفر: `root@munasbat.ktra-pro.tech` · المفتاح `~/.ssh/hostenger2/id_ed25519`
- مسار التطبيق على السيرفر: `/root/munasbat/app`
- ملف البيئة: `/root/munasbat/app/.env` — **وليس** `server/.env`
- الفرع المنشور: `main`
- ملف الـAPK محلياً: `mobile/build/app/outputs/flutter-apk/app-release.apk`

## قواعد لا تُكسر

1. **لا تقرأ `.env` ولا تطبع محتواه ولا تنسخ أي قيمة منه إلى أي ملف أو رسالة.**
   ستعدّل فيه سطراً واحداً بأداة تحرير موضعية — وهذا كل تعاملك معه.
2. **لا تلمس `APP_MIN_VERSION` إطلاقاً.** رفعه يجبر كل مستخدم على التحديث قبل
   أن يفتح التطبيق.
3. **لا تشغّل `npm test` على السيرفر** — يرفض العمل عند `NODE_ENV=production`
   ويكتب بيانات تجريبية.
4. **لا تحذف أي شيء من `/app/uploads`** — ملصقات مناسبات قائمة.
5. **عند أي نتيجة مخالفة للمتوقَّع: توقّف فوراً، لا تُصلح من عندك، وأبلغ.**
6. الأجزاء الثلاثة بالترتيب. **أنجِز كل جزء كاملاً وأبلغ، ثم انتظر إذناً للتالي.**

## ما الذي تنشره

**هذا الإصدار يغيّر الخادم والقاعدة معاً — ليس تجميلياً.** ‏#85 كاملة:

- **الخادم:** ثلاثة جداول جديدة (`broadcast_views`، `app_settings`،
  `push_subscriptions`)، وأعمدة جديدة على `notifications` و`broadcasts`
  و`occasion_types`، ووظيفة مجدولة (`server/src/jobs/scheduler.js`) تبدأ مع
  إقلاع الخادم وتكتب إشعارات العدّ التنازلي ٩:٠٠ صباحاً بتوقيت آسيا/القدس ·
  Web Push بلا Firebase · التعاميم بنغمة ومدّة · إعدادات المنصّة (رقم واتساب
  الدعم) · فلترة بعدّة أماكن وأنواع معاً.
- **الواجهة:** فلتر متعدد الاختيار بورقة بحث بدل شريطين زاحفين · كرت ٤:٥ يعرض
  الملصق كاملاً · مركز إشعارات · شريط تعاميم · **Service Worker جديد على
  `/sw.js`** · حماية جلسة الأدمن ومسودّاته.
- **التطبيق:** ‎1.6.0+8 — منبّه محلي، مركز إشعارات، الكرت ٤:٥، رقاقتا الفلتر.

⚠️ **ترحيل القاعدة يعمل تلقائياً عند كل إقلاع للحاوية** (`RUN_MIGRATIONS`).
لذلك النسخة الاحتياطية **قبل** إعادة التشغيل، لا بعدها.

---

# الجزء الأول — النسخة الاحتياطية والخادم

**١. النسخة الاحتياطية أولاً — قبل أي سحب وقبل أي إعادة تشغيل:**

```
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech \
  'cd /root/munasbat/app && docker exec negev_events_mysql sh -c "mysqldump -u root -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --routines negev_events" > ~/negev-backup-before-1.6.0.sql && tail -1 ~/negev-backup-before-1.6.0.sql && ls -l ~/negev-backup-before-1.6.0.sql'
```

السطر الأخير يجب أن يكون `-- Dump completed`، والحجم غير صفري. إن لم يكن:
**قف وأبلغ، ولا تكمل.**

**٢. سجّل نقطة التراجع — الـcommit الحالي على السيرفر قبل السحب:**

```
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech \
  'cd /root/munasbat/app && git rev-parse --short HEAD && git status --short'
```

**اكتب هذا الـSHA في تقريرك** — هو نقطة التراجع الوحيدة. وجود
`docker-compose.override.yml` غير متتبَّع أمر طبيعي — اتركه.

**٣. اسحب:**

```
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech \
  'cd /root/munasbat/app && git pull origin main && git log --oneline -1'
```

⚠️ السحب يحدّث `web/` **فوراً** (nginx يربط المجلد بالقرص للقراءة، بلا بناء).
فمن هذه اللحظة حتى إعادة تشغيل `app` في الخطوة ٥ يكون الموقع الجديد يخاطب
خادماً قديماً. **لا تتوقّف بين هذه الخطوة والخامسة** — أكمل مباشرة.

**٤. أعلن إصدار التطبيق** في `/root/munasbat/app/.env`، سطر واحد فقط:

```
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech \
  "cd /root/munasbat/app && sed -i 's/^APP_LATEST_VERSION=.*/APP_LATEST_VERSION=1.6.0/' .env && grep -c '^APP_LATEST_VERSION=1.6.0' .env"
```

الناتج يجب أن يكون `1`. **لا تطبع الملف ولا تقرأ أي سطر آخر منه.** إن جاء `0`
فالسطر غير موجود أصلاً — **قف وأبلغ**، ولا تضِف سطراً من عندك.

**٥. أعد التشغيل، ثم اقرأ سطر الترحيل:**

```
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech \
  'cd /root/munasbat/app && docker compose up -d app && sleep 25 && docker compose logs --tail=60 app'
```

في السجلّ يجب أن تجد سطراً يبدأ بـ:

```
[migrations] add-reach-and-usability-schema-2026-09: ensured columns/keys/tables;
```

🛑 إن لم يظهر هذا السطر، أو ظهر خطأ SQL: **قف فوراً وأبلغ بنصّ السجلّ كاملاً.**
لا تعِد التشغيل مرّة ثانية على أمل أن ينجح.

**٦. تحقّق من الخادم — سبعة فحوص، قارن كل واحد بالمتوقَّع:**

```
curl -s https://munasbat.ktra-pro.tech/api/app/version
curl -s https://munasbat.ktra-pro.tech/api/settings/public
curl -s https://munasbat.ktra-pro.tech/api/broadcasts/live
curl -s https://munasbat.ktra-pro.tech/api/notifications/vapid-public-key
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/api/reminders/schedule
curl -s -o /dev/null -w "%{http_code}\n" "https://munasbat.ktra-pro.tech/api/events?limit=5&town=%D8%B1%D9%87%D8%B7,%D8%AA%D9%84%20%D8%A7%D9%84%D8%B3%D8%A8%D8%B9"
curl -s "https://munasbat.ktra-pro.tech/api/services/providers" | grep -c phone
```

المتوقَّع بالترتيب:

1. `"latest_version":"1.6.0"` و`apk_url` يبدأ بـ`https://`
2. `{"success":true,"settings":{"support_whatsapp_number":null}}` — `null` صحيح
   ومتوقَّع، فالرقم لم يُحفَظ بعد من اللوحة
3. `{"success":true,"broadcasts":[]}` — مصفوفة، ولا يتطلب تسجيل دخول
4. `public_key` — قيمة نصّية إن ألصقت زوج VAPID، أو `null` إن لم تفعل بعد.
   **كلاهما مقبول**؛ اذكر أيّهما جاء
5. `401` — النقطة خلف تسجيل دخول، وهذا هو السلوك الصحيح
6. `200` — الفلترة بمكانين معاً تعمل (البلدتان «رهط» و«تل السبع» مُرمَّزتان
   في الرابط أعلاه)
7. **صفر**

🛑 إن جاء عدّاد `phone` بغير الصفر: **قف وأبلغ فوراً** — أرقام مزوّدي خدمة
تُبَثّ في استجابة عامة، وهو خرق أمني لا خلل تجميلي.

🛑 إن جاء الخامس `500` بدل `401` فالخادم انكسر بإعادة التشغيل: **أبلغ بنصّ**
`docker compose logs app | tail -60`.

**التراجع:** على السيرفر `git checkout <SHA خطوة ٢>` ثم
`docker compose up -d app`. ⚠️ **الترحيل لا يتراجع مع الكود** — الأعمدة
والجداول الجديدة تبقى. وهي كلها إضافات لا تكسر الكود القديم، فالتراجع آمن؛
لكن إن احتجت قاعدة نظيفة فمن نسخة الخطوة ١ وحدها.

---

# الجزء الثاني — الواجهة (لا تبدأه بلا إذن صريح)

الملفات وصلت مع سحب الجزء الأول. **لا build ولا restart هنا** — إن وجدت نفسك
تكتب `docker compose build` فقد أخطأت.

```
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/
curl -sI https://munasbat.ktra-pro.tech/sw.js | grep -iE "^HTTP/|^content-type"
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/occasionForm.js
curl -s https://munasbat.ktra-pro.tech/ | grep -c "occasionForm.js"
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/admin.html
```

المتوقَّع: `200` · `200` مع `content-type` فيه `javascript` · `200` · `1` · `200`.

🛑 إن جاء `sw.js` بـ`404`: السحب ناقص أو nginx يحجب الملف — بلا هذا الملف لا
يعمل Web Push إطلاقاً. **قف وأبلغ.**

🛑 إن جاء `content-type` نصّاً عادياً (`text/plain` أو `text/html`): المتصفّح
يرفض تسجيل Service Worker بنوع غير جافاسكربت. **قف وأبلغ** — هذا إعداد nginx،
لا تُصلحه من عندك.

ثم **قف**، واطلب من الإنسان فتح الموقع بـ`Ctrl + Shift + R` وتأكيد أربعة
أشياء لا تستطيع أنت رؤيتها:

1. أعلى التغذية **رقاقتان** («كل الأماكن» و«كل الأنواع») لا شريطان زاحفان،
   والضغط على أيّهما يفتح ورقة فيها بحث واختيار متعدد
2. كرت المناسبة **مربّع ٤:٥** والملصق كاملاً بلا قصّ فوق خلفية مطموسة منه
3. جرس الإشعارات يفتح مركز الإشعارات
4. من لوحة الإدارة: بثّ تعميم تجريبي بمدّة «ساعة» يظهر **شريطاً** أعلى الموقع

---

# الجزء الثالث — رفع الـAPK (لا تبدأه بلا إذن صريح)

**١. ارفعه من جهازك المحلي** (لا من السيرفر):

```
scp -i ~/.ssh/hostenger2/id_ed25519 \
  "mobile/build/app/outputs/flutter-apk/app-release.apk" \
  root@munasbat.ktra-pro.tech:/root/munasbat/app/server/downloads/negev-events.apk
```

`server/downloads` مربوط بالقرص، فالملف يُخدَم فور نسخه بلا إعادة بناء.

**٢. تحقّق أن الحجم على السيرفر يطابق المحلي بالبايت:**

```
ls -l mobile/build/app/outputs/flutter-apk/app-release.apk
ssh -i ~/.ssh/hostenger2/id_ed25519 root@munasbat.ktra-pro.tech 'ls -l /root/munasbat/app/server/downloads/negev-events.apk'
curl -sI https://munasbat.ktra-pro.tech/downloads/negev-events.apk | grep -iE "^HTTP/|^content-length"
```

اختلاف بايت واحد يعني نقلاً مقطوعاً — أعد النسخ، ولا تكمل.

**٣. اطلب من الإنسان** تثبيت الـAPK على هاتف أندرويد حقيقي وتأكيد أربعة أشياء:

1. الكرت ٤:٥ والملصق كاملاً
2. رقاقتا الفلتر بدل الشريطين
3. مركز الإشعارات يفتح ويعرض التعميم الذي بُثّ في الجزء الثاني
4. **المنبّه المحلي** — «ذكّرني» على مناسبة قادمة، ثم إغلاق التطبيق تماماً،
   ووصول تنبيه في موعده. **هذا لا يمكن التحقق منه إلا على جهاز حقيقي**؛ لا
   اختبار في المشروع يغطّيه

**التراجع:** أعد `APP_LATEST_VERSION` إلى `1.5.0` ثم `docker compose up -d app`،
وأعد نسخ الـAPK السابق إن كان محفوظاً.

---

## ماذا تُبلغ في النهاية

أي الأجزاء نفّذت · SHA نقطة التراجع من الخطوة ٢ · سطر الترحيل كما ظهر في
السجلّ · كل فحص برقمه الفعلي لا بكلمة «نجح» · هل جاء `public_key` قيمةً أم
`null` · أي شيء خالف المتوقَّع وما فعلته حياله · وما الذي لا يزال ينتظر تأكيد
الإنسان بصرياً أو على جهاز.
