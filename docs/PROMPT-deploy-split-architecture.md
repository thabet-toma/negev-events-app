# برومت النشر — فصل الخادم عن الواجهة على munasbat.ktra-pro.tech

انسخ كل ما تحت الخط وأعطه للوكيل الذي يملك وصولاً إلى السيرفر.

---

أنت تنشر تحديثاً بنيوياً على سيرفر إنتاج **يعمل حالياً ويخدم مستخدمين فعليين**.
اقرأ كل شيء قبل تنفيذ أي أمر، ولا تنفّذ خطوة لم تفهم أثرها.

## الوضع الحالي على السيرفر

- دومين: `https://munasbat.ktra-pro.tech`
- تطبيق Node/Express واحد يخدم الـAPI **و** واجهة الويب من نفس العملية
- قاعدة MySQL فيها بيانات حقيقية (مناسبات، مستخدمون، دفاتر نقوط)
- مجلد `uploads/` فيه صور وملفات صوت رفعها مستخدمون فعليون
- ملف `.env` فيه أسرار حقيقية (كلمة مرور القاعدة، `JWT_SECRET`)

## ما تغيّر في المستودع

المستودع: `https://github.com/thabet-toma/negev-events-app` — الفرع `main`،
التزام `f610464` أو أحدث.

أُعيدت هيكلة المشروع إلى ثلاث وحدات:

```
server/   الخادم — JSON فقط، لم يعد يخدم أي HTML
web/      واجهة الويب — ملفات ثابتة
mobile/   تطبيق فلاتر — لا يُنشر على السيرفر
```

المسارات القديمة انتقلت: `src/` → `server/src/` · `server.js` →
`server/server.js` · `package.json` → `server/package.json` · `public/` → `web/`
· `uploads/` → `server/uploads/` · `.env` → `server/.env`

## أخطر ثلاث نقاط — اقرأها مرتين

1. **لا تفقد `.env` الحالي.** فيه كلمة مرور القاعدة و `JWT_SECRET`. لو ضاع
   `JWT_SECRET` ستنتهي جلسات كل المستخدمين فوراً. انسخه إلى `server/.env`
   وأضف إليه المتغيرات الجديدة أدناه — **لا تولّد أسراراً جديدة**.
2. **لا تفقد `uploads/`.** فيه ملفات مستخدمين لا نسخة أخرى منها. انقله إلى
   `server/uploads/` بالمحتوى كاملاً.
3. **لا تلمس قاعدة البيانات.** لا هجرة مطلوبة في هذا التحديث إطلاقاً. إن رأيت
   نفسك تكتب `ALTER` أو `DROP` أو `DELETE` فقد أخطأت الطريق — توقف واسأل.

خذ نسخة احتياطية قبل البدء:

```bash
mysqldump -u <user> -p <db> > ~/backup-$(date +%F).sql
cp -r <app-dir> ~/backup-app-$(date +%F)
```

## الهدف المعماري

منفذ عام واحد فقط (443). nginx يوجّه حسب المسار:

```
munasbat.ktra-pro.tech (443)
   ├─ /           → ملفات web/ ثابتة (nginx يخدمها مباشرة)
   ├─ /api        → 127.0.0.1:3000
   ├─ /uploads    → 127.0.0.1:3000
   ├─ /downloads  → 127.0.0.1:3000   (ملف APK)
   └─ /socket.io  → 127.0.0.1:3000   (يحتاج ترقية WebSocket)
```

الخادم يستمع على **127.0.0.1:3000 فقط** — غير مكشوف للإنترنت. لا تفتح 3000
في الجدار الناري.

## الخطوات

### 1. اسحب الكود

```bash
cd <app-dir>
git fetch origin && git checkout main && git pull origin main
```

إن كان النشر يتم بنسخ الملفات لا بـgit، انسخ الشجرة الجديدة كاملة إلى مجلد
جديد بجانب القديم ولا تحذف القديم بعد.

### 2. انقل الأسرار والملفات

```bash
cp <old>/.env server/.env          # لا تعدّل القيم الموجودة
cp -r <old>/uploads/. server/uploads/
```

تحقّق أن `server/uploads/` صار فيه نفس عدد ملفات القديم قبل المتابعة.

### 3. أضف المتغيرات الجديدة إلى `server/.env`

```env
PUBLIC_URL=https://munasbat.ktra-pro.tech
CORS_ORIGINS=https://munasbat.ktra-pro.tech

APP_LATEST_VERSION=1.0.0
APP_MIN_VERSION=1.0.0
APP_APK_URL=/downloads/negev-events.apk
APP_RELEASE_NOTES=الإصدار الأول من تطبيق الموبايل
```

`PUBLIC_URL` **إلزامي**. الوسائط مخزّنة بمسارات نسبية (`/uploads/ملف.jpg`)
والخادم يحوّلها إلى مطلقة بناءً عليه. لو كانت قيمته خاطئة ستُكسر كل الصور
والصوت في تطبيق الموبايل. تأكد أنه بلا شرطة مائلة في آخره.

### 4. ثبّت الاعتماديات وشغّل الاختبارات

الأوامر الآن تُنفَّذ من داخل `server/` وليس من الجذر:

```bash
cd server
npm ci --omit=dev
```

إن كانت MySQL متاحة من السيرفر، شغّل `npm test` — يجب أن تمر **33** حالة.
لا تكمل إن فشلت أي واحدة.

### 5. ارفع ملف APK

المستخدم سيزوّدك بملف `negev-events.apk` (حوالي 54 ميجابايت). ضعه في:

```
server/downloads/negev-events.apk
```

المجلد يُنشأ تلقائياً عند إقلاع الخادم. الملف نفسه غير موجود في git لحجمه.

### 6. أعد تشغيل الخادم

عدّل خدمة systemd / pm2 الحالية:

- مجلد العمل: `<app-dir>/server` (كان الجذر)
- أمر التشغيل: `node server.js` (المسار نفسه لكن داخل `server/`)

```bash
sudo systemctl restart <service> && sudo systemctl status <service>
```

### 7. اضبط nginx

أضف داخل كتلة `server` الخاصة بالدومين:

```nginx
# واجهة الويب — ملفات ثابتة
root /var/www/<app-dir>/web;
index index.html;

location / {
    try_files $uri $uri/ /index.html;
}

# الخادم
location /api {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 32M;          # رفع البوسترات والصوت
}

location /uploads {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
}

location /downloads {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
}

# البث اللحظي — يحتاج ترقية الاتصال وإلا انقطع Socket.IO
location /socket.io {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

`client_max_body_size 32M` مهم: الخادم يقبل رفعاً حتى 30 ميجابايت، وnginx
الافتراضي يرفض عند 1 ميجابايت فتفشل البوسترات برسالة غامضة.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

يجب أن يبقى `web/` قابلاً للقراءة من مستخدم nginx.

### 8. تحقّق — لا تعتبر المهمة منتهية قبل أن تمر كلها

```bash
curl -s https://munasbat.ktra-pro.tech/health
# {"status":"ok","database":"up",...}

curl -s https://munasbat.ktra-pro.tech/api/app/version
# يجب أن يظهر latest_version = 1.0.0 و apk_url مطلق

curl -s https://munasbat.ktra-pro.tech/api/events | grep -o '"poster_url":"[^"]*"' | head -5
# يجب ألا يبدأ أي رابط بـ "/uploads" — كلها https://

curl -sI https://munasbat.ktra-pro.tech/downloads/negev-events.apk | head -3
# HTTP 200

curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/
# 200 وصفحة الموقع تظهر في المتصفح
```

ثم افتح الموقع في المتصفح وتحقّق يدوياً من:
- ظهور المناسبات والصور
- عمل `/admin.html` وتسجيل دخول الإدارة
- بقاء جلسة مستخدم قديمة صالحة (دليل أن `JWT_SECRET` لم يتغيّر)

### 9. التراجع إن فشل شيء

```bash
sudo systemctl stop <service>
# أعد المجلد القديم مكانه، وأعد nginx إلى إعداده السابق
sudo systemctl start <service> && sudo systemctl reload nginx
```

قاعدة البيانات لم تُمس، فالتراجع لا يفقد أي بيانات.

## إصدار نسخة تطبيق لاحقاً

لا يحتاج نشراً ولا تعديل كود:

```bash
cp <new>.apk server/downloads/negev-events.apk
# غيّر APP_LATEST_VERSION في server/.env ثم:
sudo systemctl restart <service>
```

ارفع `APP_MIN_VERSION` **فقط** عند تغيير كاسر في الـAPI — فهو يمنع كل نسخة
أقدم من الاستخدام حتى تُحدَّث.

## أبلغ عند الانتهاء

اذكر صراحةً: أي خطوة تخطّيتها ولماذا، نتيجة كل أمر تحقّق أعلاه، وأي شيء عدّلته
خارج ما ورد هنا.
