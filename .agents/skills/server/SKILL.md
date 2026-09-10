---
name: server
description: >-
  دليل ومعلومات خادم الإنتاج (Production Server) وقاعدة البيانات لمنصة مناسبات النقب (أعراسنا).
  يشمل بيانات الاتصال، التوصيف المعماري للحاويات، بنية قاعدة البيانات MySQL،
  أوامر التشغيل والإدارة والصيانة، والقواعد التشغيلية الصارمة.
---

# دليل خادم الإنتاج وقاعدة البيانات — منصة مناسبات النقب (أعراسنا)

مرجع شامل لجميع تفاصيل ومعلومات بيئة الإنتاج الحية، البنية التحتية، حاويات Docker، قاعدة البيانات MySQL، وأوامر التشغيل والصيانة.

---

## 1. بيانات الخادم والاتصال (Server Access & Credentials Reference)

| البند | القيمة / المسار | ملاحظات |
|---|---|---|
| **عنوان الخادم (Domain)** | `https://munasbat.ktra-pro.tech` | الواجهة العامة للويب والـ API |
| **عنوان IP الخادم** | `187.124.164.58` | مزود الاستضافة: Hostinger VPS |
| **مستخدم SSH** | `root` | صلاحيات كاملة على السيرفر |
| **مفتاح SSH المحلي** | `C:\Users\asus\.ssh\hostenger2\id_ed25519` | المفتاح الخاص المعتمد للاتصال |
| **تهيئة SSH المحلية** | `C:\Users\asus\.ssh\config` | اختصار `ktra-prod` مُعرَّف وجاهز |
| **مسار التطبيق على السيرفر** | `/root/munasbat/app` | مستودع Git للمشروع على الخادم |
| **ملف المتغيرات السرية** | `/root/munasbat/app/.env` | يحتوي كلمات المرور، VAPID، وJWT |
| **توقيت الخادم (System Time)** | `Etc/UTC` (UTC +00:00) | خادم Linux بنظام أوبنتو |

### كيفية الاتصال والتنفيذ السريع:
```powershell
# عبر ملف الـ config المهيأ:
ssh -F "C:\Users\asus\.ssh\config" ktra-prod "<أمر>"

# أو بالمفتاح المباشر:
ssh -i "C:\Users\asus\.ssh\hostenger2\id_ed25519" root@187.124.164.58 "<أمر>"
```

---

## 2. بنية الحاويات في الإنتاج (Docker Topology)

تُدار خدمات المنصة عبر Docker Compose من المسار `/root/munasbat/app/docker-compose.yml` على شبكة جسر داخلية `negev_net`:

| الحاوية (Container) | الصورة (Image) | المنافذ (Ports) | الحجم والمسارات المربوطة (Volumes) | الوصف والدور |
|---|---|---|---|---|
| **`negev_events_app`** | `munasbat-app` (Node.js 20+) | `127.0.0.1:3100 -> 3000` | • `negev_uploads:/app/uploads`<br>• `./server/downloads:/app/downloads` | خادم Express JSON API و Socket.IO. يرتبط بحاوية MySQL الصحية. |
| **`negev_events_web`** | `nginx:alpine` | `127.0.0.1:8080 -> 80` | • `./web:/usr/share/nginx/html:ro` | يقدم ملفات الويب الثابتة (HTML/CSS/JS). مربوط مباشرة بملفات المجلد `web/`. |
| **`negev_events_mysql`** | `mysql:8.0` | `3306/tcp` (داخلي فقط) | • `negev_mysql_data:/var/lib/mysql` | قاعدة البيانات الرئيسية للمشروع. محجوبة عن الوصول الخارجي المباشر. |

> [!NOTE]
> توجد حاويات أخرى مستقلة على نفس الخادم:
> - `naqab-mysql` (MySQL 8.4 على المنفذ المحلي 3307)
> - `hermes-public` (بيئة Hermes Agent)

---

## 3. قاعدة البيانات (Database Architecture & Queries)

### إعدادات قاعدة البيانات:
- **اسم القاعدة:** `negev_events`
- **المستخدم الافتراضي:** `negev` (ومستخدم `root`)
- **ترميز المحارف:** `utf8mb4` بتجميع `utf8mb4_unicode_ci`
- **المنفذ الداخلي:** `3306` على الشبكة `negev_net`
- **إعداد الاتصال من الخادم (`pool.js`):**
  - `timezone: 'Z'` (توقيت غرينتش)
  - `dateStrings: ['DATE']` — حقول الـ `DATE` (مثل `event_date`) تُعاد كنصوص نقية `YYYY-MM-DD` ولا تُحوّل إلى كائنات Date في Node.js.

### الوصول لقاعدة البيانات من سطر الأوامر:
```bash
# تشغيل استعلام مباشر عبر الحاوية:
docker exec negev_events_mysql mysql -u root -p$(grep MYSQL_ROOT_PASSWORD /root/munasbat/app/.env | cut -d= -f2) negev_events -e "SELECT id, title, event_date FROM events ORDER BY id DESC LIMIT 5;"

# الدخول إلى سطر أوامر MySQL التفاعلي:
docker exec -it negev_events_mysql mysql -u negev -p negev_events
```

### قواعد التعامل مع المخطط (Schema Rules):
1. ملف `schema.sql` يُطبق فقط عند إنشاء الجداول لأول مرة (`CREATE TABLE IF NOT EXISTS`).
2. **أي تعديل على جدول موجود (إضافة عمود أو مفتاح)** لا يكفي تعديله في `schema.sql`، بل **يجب** كتابة خطوة هجرة صريحة وآمنة للتكرار في `server/src/db/dataMigrations.js`.
3. استعلامات دفتر النقوط (`nokoot_ledger`) تتطلب حتماً تقييد `WHERE user_id = ?` لمنع تسريب البيانات.

---

## 4. مسارات التخزين والملفات العامة

1. **الوسائط المرفوعة (`uploads`):**
   - المسار على الخادم: مخزنة داخل مجلد الـ volume `negev_uploads`.
   - تُخدم عبر الـ API تحت الرابط: `https://munasbat.ktra-pro.tech/uploads/<filename>`.
   - **ممنوع نهائياً حذف أي ملف من uploads** (ملصقات المناسبات والصوتيات للمستخدمين).

2. **تطبيق الموبايل (APK Downloads):**
   - المسار على الخادم: `/root/munasbat/app/server/downloads/negev-events.apk`.
   - الرابط العام للتحميل: `https://munasbat.ktra-pro.tech/downloads/negev-events.apk`.
   - الصلاحيات المطلوبة: `chmod 644`.

---

## 5. إجراءات النشر والصيانة اليومية (Runbook)

### أ) نشر تعديلات واجهة الويب (`web/`):
نظراً لأن حاوية `negev_events_web` مربوطة كـ volume مباشر بمجلد `./web`:
```bash
cd /root/munasbat/app
git pull origin main
docker exec negev_events_web nginx -s reload
```
التعديل يظهر لحظياً دون توقف الخدمة.

### ب) نشر تعديلات الخادم (`server/`):
```bash
cd /root/munasbat/app
git pull origin main
docker compose build app
docker compose up -d app
```

### ج) فحص حالة وسجلات الخادم (Logs & Health):
```bash
# فحص حالة الحاويات
docker ps

# قراءة سجلات الخادم لحظياً
docker logs -f --tail 100 negev_events_app

# قراءة سجلات قاعدة البيانات
docker logs --tail 50 negev_events_mysql

# قراءة سجلات الويب (Nginx)
docker logs --tail 50 negev_events_web
```

---

## 6. المحظورات والقواعد الذهبية (Production Invariants)

1. **ممنوع تشغيل `npm test` على سيرفر الإنتاج:**
   بيئة `NODE_ENV=production` تمنع تشغيل الاختبارات، والاختبارات تمسح وتزرع بيانات وهمية. الاختبارات تُشغَّل محلياً فقط.
2. **ممنوع قراءة أو طباعة أو نسخ ملف `.env`:**
   لا تطبع محتوى `.env` كاملاً في الطرفية لتجنب تسريب المفاتيح السرية وبيانات المرور.
3. **ممنوع تعديل صفوف يدوياً في قاعدة البيانات** إلا بتوجيه صريح ومدروس، ويُفضل دائماً الاعتماد على الـ API أو سكربتات الهجرة المنضبطة.
4. **ممنوع المساس بـ `APP_MIN_VERSION`** في `.env` إلا في حال وجود تحديث يكسر التوافق تماماً ويستلزم إجبار كل المستخدمين على التحديث.
5. **التعامل مع التواريخ:** خادم الإنتاج يعمل بتوقيت UTC، بينما المستخدمون في منطقة النقب/فلسطين يعملون بتوقيت القدس (UTC+2 / UTC+3). أي عمليات حسابية للأيام يجب أن تعتمد على التوقيت المحلي لمنتصف الليل وليس توقيت UTC لتفادي مشاكل الفارق الزمني.
