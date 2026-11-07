# فهرس المشروع — منصة مناسبات النقب

> **مولَّد من `server/scripts/build-index.js` — لا تحرّره بيدك؛ شغّل `npm run index:build`.**
> بوابة التقادم: `npm run index:check` (مدمجة في `npm test`) تفشل عند أي اختلاف — في هذا الملف أو أحد ملحقيه.
>
> ابدأ من هنا، ثم افتح `ملف:سطر` مباشرة. لا طابع زمني ولا مسار مطلق في هذا الملف، والمخرج حتمي بالكامل.
> بحث عن دالة أو تصدير أو خطوة ترحيل أو متغير بيئة ← `INDEX-code.md`.
> بحث عن حالة اختبار ← `INDEX-tests.md`.
> الأحجام أدناه بالأسطر غير الفارغة: `server/src` ملفات `.js` وحدها، و`web` ملفات `.js`، و`mobile/lib` كل الملفات.

## ١. خريطة الوحدات

| الوحدة | الملفات | الأسطر |
|---|---|---|
| `server/src` | 79 | 24187 |
| `web` | 7 | 19333 |
| `mobile/lib` | 66 | 29019 |

### توزيع `server/src`

| المجلد/الملف | الملفات | الأسطر |
|---|---|---|
| `app.js` | 1 | 136 |
| `config/` | 1 | 136 |
| `constants.js` | 1 | 360 |
| `db/` | 4 | 2800 |
| `jobs/` | 1 | 351 |
| `middleware/` | 6 | 775 |
| `privacyNotice.js` | 1 | 115 |
| `realtime/` | 2 | 85 |
| `routes/` | 24 | 5858 |
| `services/` | 26 | 12706 |
| `utils/` | 12 | 865 |

### ملفات `web/*.js`

| الملف | الأسطر |
|---|---|
| `admin.js` | 8122 |
| `api.js` | 137 |
| `app.js` | 10342 |
| `config.js` | 32 |
| `occasionForm.js` | 352 |
| `serve.js` | 149 |
| `sw.js` | 199 |

`web/` كله HTML وCSS بلا خطوة بناء؛ `web/serve.js` خادم الملفات الثابتة المحلي وحده.

### توزيع `mobile/lib`

| المجلد/الملف | الملفات | الأسطر |
|---|---|---|
| `api/` | 2 | 1705 |
| `config.dart` | 1 | 69 |
| `main.dart` | 1 | 273 |
| `models/` | 11 | 2484 |
| `screens/` | 19 | 18757 |
| `state/` | 18 | 1808 |
| `theme.dart` | 1 | 296 |
| `widgets/` | 13 | 3627 |

## ٢. المهمة ← الملفات

| المهمة | ابدأ من |
|---|---|
| إضافة نقطة API | `server/src/routes/index.js:56` للتركيب، ثم `server/src/routes/<المجال>.routes.js` — مثل `server/src/routes/events.routes.js:80` — والخدمة `server/src/services/events.service.js` |
| تغيير حقل أو جدول | `server/src/db/schema.sql` (للتنصيبات الجديدة) + خطوة جديدة في `server/src/db/dataMigrations.js` — آخر خطوة اليوم `server/src/db/dataMigrations.js:2563` |
| رفع صورة أو وسيط | `server/src/middleware/upload.js:145` · `server/src/services/cloudinary.service.js:194` |
| الصلاحيات والمصادقة | `server/src/middleware/auth.js:47` · `server/src/routes/admin.routes.js:25` |
| بثّ لحظي (Socket.IO) | `server/src/realtime/index.js:27` · `server/src/routes/admin.routes.js:128` |
| واجهة الويب | `web/app.js:322` · `web/admin.js` · `web/api.js:60` |
| تطبيق الموبايل | `mobile/lib/api/negev_api.dart:21` · `mobile/lib/screens/` · `mobile/lib/models/` |

قاعدة الطبقات: المسار يتحقق والخدمة تستعلم — لا SQL خارج `server/src/services/`، ولا `req`/`res` داخلها.

## ٣. نقاط API — 203

المسار الكامل = جذر التركيب في `server/src/app.js` + تركيب الراوتر في `server/src/routes/index.js` + المسار داخل الملف.
راوترات `share.routes.js` تُركَّب على الجذور `/e` `/p` `/a` `/person` `/live` `/v` مباشرةً في `server/src/app.js`، لا تحت `/api`.
الحرّاس: معرّفات المصادقة في الاستدعاء نفسه، أو في `router.use(بادئة, حارس)` أعلى الملف فتشمل المسار؛ `asyncHandler` ومحدِّدات المعدّل ليست حرّاساً.

| METHOD | path | guards | file:line |
|---|---|---|---|
| GET | `/a/:id` | — | `server/src/routes/share.routes.js:1825` |
| DELETE | `/api/account` | `authenticate` | `server/src/routes/auth.routes.js:209` |
| GET | `/api/admin/admins` | `requireAdmin`, `requireSuperAdmin` | `server/src/routes/admin.routes.js:380` |
| PUT | `/api/admin/admins/:id/towns` | `requireAdmin`, `requireSuperAdmin` | `server/src/routes/admin.routes.js:384` |
| GET | `/api/admin/albums` | `requireAdmin` | `server/src/routes/albums.routes.js:209` |
| POST | `/api/admin/albums` | `requireAdmin` | `server/src/routes/albums.routes.js:222` |
| DELETE | `/api/admin/albums/:id` | `requireSuperAdmin`, `requireAdmin` | `server/src/routes/albums.routes.js:259` |
| PATCH | `/api/admin/albums/:id` | `requireAdmin` | `server/src/routes/albums.routes.js:244` |
| POST | `/api/admin/albums/:id/import-facebook` | `requireSuperAdmin`, `requireAdmin` | `server/src/routes/albums.routes.js:425` |
| GET | `/api/admin/albums/:id/photos` | `requireAdmin` | `server/src/routes/albums.routes.js:265` |
| POST | `/api/admin/albums/:id/photos` | `requireAdmin` | `server/src/routes/albums.routes.js:282` |
| POST | `/api/admin/albums/:id/photos/import-url` | `requireAdmin` | `server/src/routes/albums.routes.js:295` |
| POST | `/api/admin/albums/:id/photos/signatures` | `requireAdmin` | `server/src/routes/albums.routes.js:276` |
| GET | `/api/admin/albums/:id/videos` | `requireAdmin` | `server/src/routes/albums.routes.js:312` |
| POST | `/api/admin/albums/:id/videos` | `requireAdmin` | `server/src/routes/albums.routes.js:317` |
| GET | `/api/admin/analytics/activity` | `requireSuperAdmin` | `server/src/routes/analytics.routes.js:76` |
| GET | `/api/admin/analytics/counts` | `requireSuperAdmin` | `server/src/routes/analytics.routes.js:82` |
| GET | `/api/admin/analytics/devices` | `requireSuperAdmin` | `server/src/routes/analytics.routes.js:98` |
| GET | `/api/admin/analytics/devices/:deviceId/log` | `requireSuperAdmin` | `server/src/routes/analytics.routes.js:113` |
| GET | `/api/admin/analytics/overview` | `requireSuperAdmin` | `server/src/routes/analytics.routes.js:89` |
| GET | `/api/admin/analytics/users/:userId` | `requireSuperAdmin` | `server/src/routes/analytics.routes.js:132` |
| POST | `/api/admin/broadcast` | `requireAdmin` | `server/src/routes/admin.routes.js:314` |
| GET | `/api/admin/comments` | `requireAdmin` | `server/src/routes/admin.routes.js:215` |
| GET | `/api/admin/events` | `requireAdmin` | `server/src/routes/admin.routes.js:59` |
| DELETE | `/api/admin/events/:id` | `requireAdmin` | `server/src/routes/admin.routes.js:162` |
| GET | `/api/admin/events/:id/albums` | `requireAdmin` | `server/src/routes/albums.routes.js:197` |
| POST | `/api/admin/events/:id/albums` | `requireAdmin` | `server/src/routes/albums.routes.js:235` |
| GET | `/api/admin/events/:id/amendments` | `requireAdmin` | `server/src/routes/admin.routes.js:156` |
| PATCH | `/api/admin/events/:id/featured` | `requireAdmin` | `server/src/routes/admin.routes.js:195` |
| PATCH | `/api/admin/events/:id/owner` | `requireAdmin` | `server/src/routes/admin.routes.js:171` |
| GET | `/api/admin/events/:id/photos` | `requireAdmin` | `server/src/routes/archivePhotos.routes.js:28` |
| POST | `/api/admin/events/:id/photos` | `requireAdmin` | `server/src/routes/archivePhotos.routes.js:42` |
| DELETE | `/api/admin/events/:id/photos/:photoId` | `requireAdmin` | `server/src/routes/archivePhotos.routes.js:56` |
| POST | `/api/admin/events/:id/photos/signature` | `requireAdmin` | `server/src/routes/archivePhotos.routes.js:35` |
| POST | `/api/admin/events/:id/promote-village` | `requireSuperAdmin` | `server/src/routes/villages.routes.js:99` |
| PATCH | `/api/admin/events/:id/status` | `requireAdmin` | `server/src/routes/admin.routes.js:67` |
| GET | `/api/admin/facebook/page-albums` | `requireSuperAdmin`, `requireAdmin` | `server/src/routes/albums.routes.js:421` |
| GET | `/api/admin/live/episodes` | `requireSuperAdmin` | `server/src/routes/live.routes.js:109` |
| PUT | `/api/admin/live/episodes/:date` | `requireSuperAdmin` | `server/src/routes/live.routes.js:113` |
| DELETE | `/api/admin/live/episodes/:id` | `requireSuperAdmin` | `server/src/routes/live.routes.js:154` |
| DELETE | `/api/admin/live/episodes/:id/share-image` | `requireSuperAdmin` | `server/src/routes/live.routes.js:148` |
| PUT | `/api/admin/live/episodes/:id/share-image` | `requireSuperAdmin` | `server/src/routes/live.routes.js:137` |
| POST | `/api/admin/live/episodes/:id/share-image/signature` | `requireSuperAdmin` | `server/src/routes/live.routes.js:132` |
| POST | `/api/admin/login` | — | `server/src/routes/admin.routes.js:25` |
| GET | `/api/admin/me` | `requireAdmin` | `server/src/routes/admin.routes.js:47` |
| POST | `/api/admin/notifications/run-reminders` | `requireAdmin` | `server/src/routes/admin.routes.js:370` |
| GET | `/api/admin/occasion-types` | `requireSuperAdmin` | `server/src/routes/occasionTypes.routes.js:112` |
| POST | `/api/admin/occasion-types` | `requireSuperAdmin` | `server/src/routes/occasionTypes.routes.js:120` |
| DELETE | `/api/admin/occasion-types/:id` | `requireSuperAdmin` | `server/src/routes/occasionTypes.routes.js:199` |
| PATCH | `/api/admin/occasion-types/:id` | `requireSuperAdmin` | `server/src/routes/occasionTypes.routes.js:160` |
| GET | `/api/admin/occasion-types/:id/messages` | `requireSuperAdmin` | `server/src/routes/occasionTypes.routes.js:232` |
| POST | `/api/admin/occasion-types/:id/messages` | `requireSuperAdmin` | `server/src/routes/occasionTypes.routes.js:237` |
| PATCH | `/api/admin/occasion-types/:id/messages/:mid` | `requireSuperAdmin` | `server/src/routes/occasionTypes.routes.js:249` |
| GET | `/api/admin/people` | `requireSuperAdmin` | `server/src/routes/people.routes.js:22` |
| POST | `/api/admin/people/:id/merge` | `requireSuperAdmin` | `server/src/routes/people.routes.js:33` |
| GET | `/api/admin/photo-reports` | `requireAdmin` | `server/src/routes/albums.routes.js:402` |
| PATCH | `/api/admin/photo-reports/:id` | `requireAdmin` | `server/src/routes/albums.routes.js:411` |
| GET | `/api/admin/photo-tags` | `requireAdmin` | `server/src/routes/albums.routes.js:366` |
| DELETE | `/api/admin/photo-tags/:id` | `requireAdmin` | `server/src/routes/albums.routes.js:396` |
| PATCH | `/api/admin/photo-tags/:id` | `requireAdmin` | `server/src/routes/albums.routes.js:375` |
| DELETE | `/api/admin/photos/:id` | `requireAdmin` | `server/src/routes/albums.routes.js:360` |
| PATCH | `/api/admin/photos/:id` | `requireAdmin` | `server/src/routes/albums.routes.js:347` |
| POST | `/api/admin/photos/:id/tags` | `requireAdmin` | `server/src/routes/albums.routes.js:389` |
| GET | `/api/admin/privacy-requests` | `requireSuperAdmin` | `server/src/routes/privacy.routes.js:113` |
| PATCH | `/api/admin/privacy-requests/:id` | `requireSuperAdmin` | `server/src/routes/privacy.routes.js:118` |
| POST | `/api/admin/regions` | `requireSuperAdmin` | `server/src/routes/towns.routes.js:105` |
| PATCH | `/api/admin/regions/:id` | `requireSuperAdmin` | `server/src/routes/towns.routes.js:119` |
| GET | `/api/admin/service-categories` | `requireSuperAdmin` | `server/src/routes/services.routes.js:295` |
| POST | `/api/admin/service-categories` | `requireSuperAdmin` | `server/src/routes/services.routes.js:299` |
| DELETE | `/api/admin/service-categories/:id` | `requireSuperAdmin` | `server/src/routes/services.routes.js:330` |
| PATCH | `/api/admin/service-categories/:id` | `requireSuperAdmin` | `server/src/routes/services.routes.js:314` |
| GET | `/api/admin/service-providers` | `requireAdmin` | `server/src/routes/services.routes.js:160` |
| POST | `/api/admin/service-providers` | `requireAdmin` | `server/src/routes/services.routes.js:174` |
| DELETE | `/api/admin/service-providers/:id` | `requireAdmin` | `server/src/routes/services.routes.js:284` |
| GET | `/api/admin/service-providers/:id` | `requireAdmin` | `server/src/routes/services.routes.js:169` |
| PATCH | `/api/admin/service-providers/:id` | `requireAdmin` | `server/src/routes/services.routes.js:224` |
| PATCH | `/api/admin/service-providers/:id/status` | `requireAdmin` | `server/src/routes/services.routes.js:273` |
| GET | `/api/admin/settings` | `requireSuperAdmin` | `server/src/routes/settings.routes.js:187` |
| PUT | `/api/admin/settings` | `requireSuperAdmin` | `server/src/routes/settings.routes.js:191` |
| DELETE | `/api/admin/settings/default-audio` | `requireSuperAdmin` | `server/src/routes/settings.routes.js:262` |
| POST | `/api/admin/settings/default-audio` | `requireSuperAdmin` | `server/src/routes/settings.routes.js:250` |
| GET | `/api/admin/stats` | `requireAdmin` | `server/src/routes/admin.routes.js:55` |
| GET | `/api/admin/stories` | `requireSuperAdmin` | `server/src/routes/stories.routes.js:188` |
| POST | `/api/admin/stories` | `requireSuperAdmin` | `server/src/routes/stories.routes.js:196` |
| DELETE | `/api/admin/stories/:id` | `requireSuperAdmin` | `server/src/routes/stories.routes.js:262` |
| PATCH | `/api/admin/stories/:id` | `requireSuperAdmin` | `server/src/routes/stories.routes.js:230` |
| GET | `/api/admin/stories/:id/metrics` | `requireSuperAdmin` | `server/src/routes/stories.routes.js:267` |
| POST | `/api/admin/stories/studio` | `requireSuperAdmin` | `server/src/routes/stories.routes.js:177` |
| POST | `/api/admin/stories/studio/preview` | `requireSuperAdmin` | `server/src/routes/stories.routes.js:173` |
| GET | `/api/admin/towns` | `requireSuperAdmin` | `server/src/routes/towns.routes.js:43` |
| POST | `/api/admin/towns` | `requireSuperAdmin` | `server/src/routes/towns.routes.js:47` |
| DELETE | `/api/admin/towns/:id` | `requireSuperAdmin` | `server/src/routes/towns.routes.js:91` |
| PATCH | `/api/admin/towns/:id` | `requireSuperAdmin` | `server/src/routes/towns.routes.js:76` |
| PUT | `/api/admin/towns/order` | `requireSuperAdmin` | `server/src/routes/towns.routes.js:62` |
| GET | `/api/admin/users` | `requireSuperAdmin`, `requireAdmin` | `server/src/routes/admin.routes.js:224` |
| DELETE | `/api/admin/users/:id` | `requireSuperAdmin`, `requireAdmin` | `server/src/routes/admin.routes.js:238` |
| PATCH | `/api/admin/users/:id/role` | `requireAdmin` | `server/src/routes/admin.routes.js:262` |
| DELETE | `/api/admin/videos/:id` | `requireAdmin` | `server/src/routes/albums.routes.js:341` |
| PATCH | `/api/admin/videos/:id` | `requireAdmin` | `server/src/routes/albums.routes.js:331` |
| GET | `/api/admin/villages` | `requireSuperAdmin` | `server/src/routes/villages.routes.js:25` |
| POST | `/api/admin/villages` | `requireSuperAdmin` | `server/src/routes/villages.routes.js:29` |
| DELETE | `/api/admin/villages/:id` | `requireSuperAdmin` | `server/src/routes/villages.routes.js:84` |
| PATCH | `/api/admin/villages/:id` | `requireSuperAdmin` | `server/src/routes/villages.routes.js:60` |
| POST | `/api/ai/generate-poem` | — | `server/src/routes/ai.routes.js:40` |
| POST | `/api/ai/scan-card` | — | `server/src/routes/ai.routes.js:51` |
| GET | `/api/albums` | `optionalAuthenticate` | `server/src/routes/albums.routes.js:49` |
| GET | `/api/albums/:id` | — | `server/src/routes/albums.routes.js:62` |
| POST | `/api/analytics/events` | `optionalAuthenticate` | `server/src/routes/analytics.routes.js:28` |
| GET | `/api/app/version` | — | `server/src/routes/app.routes.js:19` |
| POST | `/api/auth/login` | — | `server/src/routes/auth.routes.js:63` |
| GET | `/api/auth/me` | `authenticate` | `server/src/routes/auth.routes.js:82` |
| PATCH | `/api/auth/me` | `authenticate` | `server/src/routes/auth.routes.js:105` |
| POST | `/api/auth/me/avatar` | `authenticate` | `server/src/routes/auth.routes.js:167` |
| PATCH | `/api/auth/me/phone` | `authenticate` | `server/src/routes/auth.routes.js:181` |
| POST | `/api/auth/register` | — | `server/src/routes/auth.routes.js:32` |
| PATCH | `/api/broadcasts/:id/dismiss` | `authenticate` | `server/src/routes/broadcasts.routes.js:32` |
| GET | `/api/broadcasts/live` | `optionalAuthenticate` | `server/src/routes/broadcasts.routes.js:28` |
| POST | `/api/check-collision` | — | `server/src/routes/events.routes.js:946` |
| GET | `/api/events` | `optionalAuthenticate` | `server/src/routes/events.routes.js:80` |
| POST | `/api/events` | `authenticate` | `server/src/routes/events.routes.js:219` |
| GET | `/api/events/:id` | `optionalAuthenticate` | `server/src/routes/events.routes.js:179` |
| PATCH | `/api/events/:id` | `authenticate` | `server/src/routes/events.routes.js:482` |
| GET | `/api/events/:id/amendments` | `authenticate` | `server/src/routes/events.routes.js:936` |
| POST | `/api/events/:id/congratulate` | `authenticate` | `server/src/routes/events.routes.js:1001` |
| GET | `/api/events/:id/congratulations` | `authenticate` | `server/src/routes/events.routes.js:1029` |
| DELETE | `/api/events/:id/congratulations/:cid` | `authenticate` | `server/src/routes/events.routes.js:1087` |
| PATCH | `/api/events/:id/congratulations/:cid` | `authenticate` | `server/src/routes/events.routes.js:1043` |
| POST | `/api/events/:id/congratulations/:cid/report` | `authenticate` | `server/src/routes/events.routes.js:1098` |
| POST | `/api/events/:id/react` | — | `server/src/routes/events.routes.js:966` |
| DELETE | `/api/events/:id/remind` | `authenticate` | `server/src/routes/events.routes.js:855` |
| PATCH | `/api/events/:id/remind` | `authenticate` | `server/src/routes/events.routes.js:846` |
| POST | `/api/events/:id/remind` | `authenticate` | `server/src/routes/events.routes.js:834` |
| DELETE | `/api/events/:id/rsvp` | `authenticate` | `server/src/routes/events.routes.js:902` |
| PUT | `/api/events/:id/rsvp` | `authenticate` | `server/src/routes/events.routes.js:885` |
| GET | `/api/events/:id/rsvps` | `authenticate` | `server/src/routes/events.routes.js:914` |
| GET | `/api/live` | — | `server/src/routes/settings.routes.js:276` |
| POST | `/api/live/episodes/:id/vote` | `authenticate` | `server/src/routes/live.routes.js:93` |
| GET | `/api/live/hub` | `optionalAuthenticate` | `server/src/routes/live.routes.js:77` |
| GET | `/api/map/events` | `optionalAuthenticate` | `server/src/routes/events.routes.js:119` |
| GET | `/api/my-events` | `authenticate` | `server/src/routes/events.routes.js:828` |
| GET | `/api/my-photos` | `authenticate` | `server/src/routes/albums.routes.js:136` |
| DELETE | `/api/my-reminders` | `authenticate` | `server/src/routes/events.routes.js:925` |
| GET | `/api/my-reminders` | `authenticate` | `server/src/routes/events.routes.js:865` |
| GET | `/api/news` | `optionalAuthenticate` | `server/src/routes/news.routes.js:43` |
| GET | `/api/news/:id` | — | `server/src/routes/news.routes.js:63` |
| GET | `/api/nokoot` | `authenticate` | `server/src/routes/nokoot.routes.js:16` |
| POST | `/api/nokoot` | `authenticate` | `server/src/routes/nokoot.routes.js:21` |
| DELETE | `/api/nokoot/:id` | `authenticate` | `server/src/routes/nokoot.routes.js:37` |
| GET | `/api/notifications` | `authenticate` | `server/src/routes/notifications.routes.js:17` |
| DELETE | `/api/notifications/:id` | `authenticate` | `server/src/routes/notifications.routes.js:123` |
| PATCH | `/api/notifications/:id/read` | `authenticate` | `server/src/routes/notifications.routes.js:36` |
| POST | `/api/notifications/clear-all` | `authenticate` | `server/src/routes/notifications.routes.js:47` |
| GET | `/api/notifications/preferences` | `authenticate` | `server/src/routes/notifications.routes.js:22` |
| PATCH | `/api/notifications/preferences` | `authenticate` | `server/src/routes/notifications.routes.js:26` |
| POST | `/api/notifications/read-all` | `authenticate` | `server/src/routes/notifications.routes.js:42` |
| DELETE | `/api/notifications/subscribe` | `authenticate` | `server/src/routes/notifications.routes.js:117` |
| POST | `/api/notifications/subscribe` | `authenticate` | `server/src/routes/notifications.routes.js:111` |
| GET | `/api/notifications/vapid-public-key` | — | `server/src/routes/notifications.routes.js:61` |
| GET | `/api/occasion-types` | — | `server/src/routes/occasionTypes.routes.js:102` |
| GET | `/api/people/:id` | — | `server/src/routes/albums.routes.js:106` |
| GET | `/api/photos` | `optionalAuthenticate` | `server/src/routes/albums.routes.js:74` |
| GET | `/api/photos/:id` | — | `server/src/routes/albums.routes.js:88` |
| POST | `/api/photos/:id/reports` | `authenticate` | `server/src/routes/albums.routes.js:167` |
| POST | `/api/photos/:id/tags` | `authenticate` | `server/src/routes/albums.routes.js:146` |
| DELETE | `/api/photos/:id/tags/me` | `authenticate` | `server/src/routes/albums.routes.js:161` |
| POST | `/api/privacy/analytics-erasure` | `authenticate` | `server/src/routes/privacy.routes.js:46` |
| POST | `/api/privacy/deletion-request` | — | `server/src/routes/privacy.routes.js:86` |
| GET | `/api/privacy/notice` | — | `server/src/routes/privacy.routes.js:37` |
| POST | `/api/privacy/requests` | `authenticate` | `server/src/routes/privacy.routes.js:60` |
| GET | `/api/reminders/schedule` | `authenticate` | `server/src/routes/notifications.routes.js:55` |
| GET | `/api/search` | `optionalAuthenticate` | `server/src/routes/albums.routes.js:124` |
| GET | `/api/services/categories` | — | `server/src/routes/services.routes.js:66` |
| GET | `/api/services/my-services` | `authenticate` | `server/src/routes/services.routes.js:148` |
| GET | `/api/services/providers` | `optionalAuthenticate` | `server/src/routes/services.routes.js:76` |
| POST | `/api/services/providers` | `authenticate` | `server/src/routes/services.routes.js:96` |
| GET | `/api/services/providers/:id` | — | `server/src/routes/services.routes.js:89` |
| GET | `/api/settings/public` | — | `server/src/routes/settings.routes.js:268` |
| GET | `/api/stats/ticker` | — | `server/src/routes/stats.routes.js:29` |
| GET | `/api/stories` | `optionalAuthenticate` | `server/src/routes/stories.routes.js:48` |
| POST | `/api/stories/:id/click` | `optionalAuthenticate` | `server/src/routes/stories.routes.js:87` |
| POST | `/api/stories/:id/report` | `authenticate` | `server/src/routes/stories.routes.js:96` |
| POST | `/api/stories/:id/view` | `optionalAuthenticate` | `server/src/routes/stories.routes.js:74` |
| GET | `/api/stories/entry-card` | — | `server/src/routes/stories.routes.js:64` |
| GET | `/api/towns` | — | `server/src/routes/events.routes.js:146` |
| GET | `/api/videos/:id` | — | `server/src/routes/albums.routes.js:97` |
| GET | `/e/:id` | — | `server/src/routes/share.routes.js:961` |
| GET | `/e/:id/card.jpg` | — | `server/src/routes/share.routes.js:1203` |
| GET | `/e/:id/download` | — | `server/src/routes/share.routes.js:1231` |
| POST | `/e/:id/rsvp` | — | `server/src/routes/share.routes.js:1160` |
| GET | `/e/assets/:file` | — | `server/src/routes/share.routes.js:930` |
| GET | `/live` | — | `server/src/routes/share.routes.js:1480` |
| GET | `/live/card.jpg` | — | `server/src/routes/share.routes.js:1544` |
| GET | `/live/download` | — | `server/src/routes/share.routes.js:1602` |
| GET | `/live/e/:id` | — | `server/src/routes/share.routes.js:1735` |
| GET | `/live/e/:id/card.jpg` | — | `server/src/routes/share.routes.js:1762` |
| GET | `/live/e/:id/embed` | — | `server/src/routes/share.routes.js:1796` |
| GET | `/live/e/:id/go` | — | `server/src/routes/share.routes.js:1787` |
| GET | `/live/embed` | — | `server/src/routes/share.routes.js:1625` |
| GET | `/live/go` | — | `server/src/routes/share.routes.js:1583` |
| GET | `/p/:id` | — | `server/src/routes/share.routes.js:1801` |
| GET | `/person/:id` | — | `server/src/routes/share.routes.js:1856` |
| GET | `/v/:id` | — | `server/src/routes/share.routes.js:1918` |
| GET | `/v/:id/card.jpg` | — | `server/src/routes/share.routes.js:1945` |

## ٤. جدول قاعدة البيانات ← الخدمة — 46 جدولاً

الجدول من `server/src/db/schema.sql`، والخدمات التي يظهر اسمها في كودها (بحث لفظي بحدود الكلمة).

| الجدول | خدمات تذكره |
|---|---|
| `activity_log` | `activity.service.js`, `towns.service.js` |
| `admin_towns` | `admin.service.js`, `adminScope.service.js`, `towns.service.js` |
| `analytics_daily_counters` | `analytics.service.js` |
| `analytics_events` | `activity.service.js`, `analytics.service.js`, `auth.service.js`, `privacy.service.js` |
| `app_settings` | `settings.service.js` |
| `broadcast_views` | `broadcasts.service.js`, `notifications.service.js` |
| `broadcasts` | `broadcasts.service.js`, `liveHub.service.js`, `notifications.service.js`, `towns.service.js` |
| `congratulation_reports` | `events.service.js` |
| `congratulations` | `admin.service.js`, `auth.service.js`, `events.service.js` |
| `event_albums` | `adminScope.service.js`, `albums.service.js`, `people.service.js` |
| `event_amendments` | `admin.service.js`, `events.service.js` |
| `event_announcements` | `admin.service.js`, `events.service.js` |
| `event_days` | `events.service.js` |
| `event_honorees` | `albums.service.js`, `events.service.js`, `facebook.service.js`, `people.service.js` |
| `event_photos` | `adminScope.service.js`, `albums.service.js` |
| `event_reminders` | `admin.service.js`, `events.service.js`, `notifications.service.js`, `stories.service.js` |
| `event_rsvps` | `events.service.js` |
| `event_videos` | `albums.service.js` |
| `events` | `activity.service.js`, `admin.service.js`, `adminScope.service.js`, `albums.service.js`, `analytics.service.js`, `auth.service.js`, `cloudinary.service.js`, `events.service.js`, `facebook.service.js`, `notifications.service.js`, `occasionTypes.service.js`, `people.service.js`, `shareCard.service.js`, `stats.service.js`, `stories.service.js`, `towns.service.js`, `villages.service.js` |
| `live_episodes` | `liveHub.service.js` |
| `live_poll_votes` | `liveHub.service.js` |
| `nokoot_ledger` | `nokoot.service.js` |
| `notifications` | `activity.service.js`, `admin.service.js`, `auth.service.js`, `broadcasts.service.js`, `events.service.js`, `notifications.service.js`, `push.service.js` |
| `occasion_type_fields` | `notifications.service.js`, `occasionTypes.service.js` |
| `occasion_type_messages` | `occasionTypes.service.js` |
| `occasion_type_reactions` | `occasionTypes.service.js` |
| `occasion_types` | `activity.service.js`, `albums.service.js`, `events.service.js`, `facebook.service.js`, `notifications.service.js`, `occasionTypes.service.js`, `shareCard.service.js` |
| `people` | `admin.service.js`, `albums.service.js`, `auth.service.js`, `events.service.js`, `people.service.js`, `shareCard.service.js` |
| `people_merges` | `people.service.js` |
| `photo_reports` | `albums.service.js` |
| `photo_tags` | `albums.service.js`, `people.service.js` |
| `privacy_requests` | `auth.service.js`, `privacy.service.js` |
| `push_subscriptions` | `push.service.js` |
| `reactions` | `admin.service.js`, `events.service.js`, `occasionTypes.service.js` |
| `regions` | `adminScope.service.js`, `albums.service.js`, `analytics.service.js`, `events.service.js`, `notifications.service.js`, `push.service.js`, `stats.service.js`, `stories.service.js`, `towns.service.js` |
| `service_categories` | `services.service.js` |
| `service_category_attributes` | `services.service.js` |
| `service_provider_towns` | `services.service.js`, `towns.service.js` |
| `service_providers` | `events.service.js`, `services.service.js` |
| `stories` | `admin.service.js`, `albums.service.js`, `broadcasts.service.js`, `events.service.js`, `notifications.service.js`, `services.service.js`, `settings.service.js`, `stories.service.js`, `storyStudio.service.js`, `towns.service.js` |
| `story_clicks` | `stories.service.js` |
| `story_reports` | `stories.service.js` |
| `story_views` | `stories.service.js` |
| `towns` | `admin.service.js`, `adminScope.service.js`, `albums.service.js`, `analytics.service.js`, `auth.service.js`, `broadcasts.service.js`, `events.service.js`, `news.service.js`, `services.service.js`, `stats.service.js`, `stories.service.js`, `towns.service.js`, `villages.service.js` |
| `users` | `activity.service.js`, `admin.service.js`, `albums.service.js`, `analytics.service.js`, `auth.service.js`, `broadcasts.service.js`, `events.service.js`, `notifications.service.js`, `people.service.js`, `privacy.service.js`, `push.service.js`, `stories.service.js` |
| `villages` | `analytics.service.js`, `events.service.js`, `services.service.js`, `towns.service.js`, `villages.service.js` |

## ٥. قنوات Socket.IO — 14 بثّاً

كل بثّ في `server/src` بأول وسيط نصّي؛ القنوات ذات المعرّفات تبقى قوالب (`_<id>` في المصدر).
`emit` العام في `server/src/realtime/index.js` هو الموصل نفسه لا قناة.

| القناة | file:line |
|---|---|
| `new_event_created` | `server/src/jobs/scheduler.js:243` |
| `new_notification_${userId}` | `server/src/realtime/announce.js:32` |
| `system_notification` | `server/src/realtime/announce.js:49` |
| `system_notification` | `server/src/realtime/announce.js:61` |
| `new_event_created` | `server/src/routes/admin.routes.js:128` |
| `system_broadcast` | `server/src/routes/admin.routes.js:345` |
| `town_broadcast` | `server/src/routes/admin.routes.js:358` |
| `admin_new_pending_event` | `server/src/routes/events.routes.js:403` |
| `new_event_created` | `server/src/routes/events.routes.js:426` |
| `event_reaction_${eventId}` | `server/src/routes/events.routes.js:975` |
| `new_congratulation_${eventId}` | `server/src/routes/events.routes.js:1020` |
| `new_congratulation_${eventId}` | `server/src/routes/events.routes.js:1080` |
| `live_poll_${episodeId}` | `server/src/routes/live.routes.js:100` |
| `live_status` | `server/src/routes/settings.routes.js:215` |

## ٦. الأوامر والبوابات

من `server/package.json` — تُشغَّل من داخل `server/` (أو `npm --prefix server <script>` من الجذر).

| السكربت | الأمر |
|---|---|
| `start` | `node server.js` |
| `dev` | `node --watch server.js` |
| `db:migrate` | `node src/db/migrate.js` |
| `db:seed` | `node src/db/seed.js` |
| `db:import-legacy` | `node scripts/import-legacy-json.js` |
| `sitemap:generate` | `node scripts/generate-sitemap.js` |
| `index:build` | `node scripts/build-index.js` |
| `index:check` | `node scripts/build-index.js --check` |
| `test` | `npm run index:check && node test/web-dom.test.js && node test/smoke.test.js` |

بوابة التقادم: `index:check` تفحص `INDEX.md` و`INDEX-code.md` و`INDEX-tests.md` معاً، وأول ما يشغّله `test`. و`flutter` خارج `npm test` كلياً: `flutter analyze` و`flutter test` من داخل `mobile/`.
