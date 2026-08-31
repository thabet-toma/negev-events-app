# بحث: آليات الستوريات الإعلانية — سناب شات وإنستغرام

> تذكرة: [#4](https://github.com/thabet-toma/negev-events-app/issues/4) — `wayfinder:research`
> فرع: `research/stories-ads` · تاريخ البحث: 2026-08-31
> **هذا الملف حقائق ومصادر فقط. لا يحتوي توصية بتصميم نهائي** — القرار يُتخذ في تذكرة لاحقة.

## المنهجية

كل رقم أدناه مأخوذ من توثيق المنتج أو الأعمال أو المطوّرين الرسمي، ومقتبَس من الصفحة الحيّة
وقت البحث (وليس من الذاكرة). المصادر الثانوية (مدوّنات وكالات، مقالات تحليل) **مستبعَدة** إلا
حيث يُذكر ذلك صراحةً ويُوسَم بـ«مصدر ثانوي». حيث لم أجد توثيقاً رسمياً، كتبتُ ذلك في
قسم [الفجوات](#الفجوات-ما-لا-توثّقه-المصادر-الرسمية) بدل التخمين.

قائمة المصادر الكاملة في [الأسفل](#المصادر).

---

## الوضع الحالي عندنا (خط الأساس)

من `server/src/db/schema.sql` و `server/src/services/events.service.js`:

| الحقيقة | التفصيل |
|---|---|
| الأعمدة الموجودة | `id`, `title`, `clan`, `town`, `image`, `is_live`, `event_id`, `created_at` |
| لا يوجد | `expires_at`، نوع وسائط (صورة/فيديو)، مدة عرض، كيان معلن، حالة دفع، عدّاد مشاهدات، وسم إعلان |
| القراءة | `GET /api/stories` فقط (`events.routes.js:28`) |
| الترتيب | `ORDER BY is_live DESC, id ASC` — ترتيب ثابت لا زمني ولا مُرتَّب بالتفاعل |
| الكتابة | لا مسار إنشاء. يُملأ من `seed.js:181` ومن `scripts/import-legacy-json.js:184` فقط |
| الوسائط | `image` نصّي واحد، يمرّ عبر `withAbsoluteMedia` عند الإخراج |

بمعنى آخر: الجدول اليوم **لوحة عرض ثابتة**، لا دورة حياة ولا قياس ولا فصل بين محتوى وإعلان.
كل محور من محاور البحث أدناه يقابل شيئاً غير موجود بعد.

---

## 1. آليات العارض

### 1.1 مدة الشريحة الافتراضية — أرقام موثّقة

| المنصة | الحالة | الرقم | المصدر |
|---|---|---|---|
| إنستغرام | صورة (إعلان) | «images will show for **5 seconds** by default» | Meta Business Help — Design requirements for Instagram Stories ads |
| إنستغرام | صورة (إعلان) | «may vary between **5-16 seconds** or until the user swipes out of the Story» | Meta Ads Guide — Awareness Image ad, Instagram Stories |
| إنستغرام | فيديو (إعلان) | أقل من **16 ثانية** يُعرض كاملاً؛ **16 ثانية فأكثر** قد يُقسَّم إلى بطاقات ستوري منفصلة (واحدة أو اثنتين أو ثلاث، تلقائياً وبحسب المشاهِد) | Meta Ads Guide — Awareness Video ad, Instagram Stories |
| إنستغرام | فيديو طويل | لبعض أهداف الحملة يظهر خيار **Keep Watching** لإكمال الفيديو | نفس المصدر |
| سناب شات | صورة (إعلان) | «The image will be converted into a video of **5 second** duration» | Snapchat Business Help — Single Image or Video Specifications |
| سناب شات | فيديو (إعلان) | **3 ثوانٍ إلى 30 دقيقة**؛ وأقل من 3 ثوانٍ **يُكرَّر تلقائياً** ليبلغ الحد الأدنى | نفس المصدر |
| سناب شات | توصية إبداعية | «up to 3 minutes long, but … we recommend keeping it at **3-5 seconds**» | Snapchat Business Help — About Single Image or Video Ads |

**الخلاصة الرقمية:** الرقم المشترك بين المنصتين للصورة الثابتة هو **5 ثوانٍ**، وهو
مذكور صراحةً في توثيق كل منهما. سناب شات يذهب أبعد: يحوّل الصورة إلى فيديو مدته 5 ثوانٍ،
أي أن مسار العرض عنده **فيديو دائماً** حتى لو كان المُدخَل صورة.

### 1.2 الإيماءات — ما هو موثّق حرفياً

**سناب شات** (Snapchat Support — «How do I view a friend's Story on Snapchat?»):

- «Tap the screen to watch the next Snap in a Story» — النقر يتقدّم
- «Tap the **left side** of the screen to go back to the last Snap» — منطقة رجوع في اليسار
- «Swipe **left** to go to your next friend's Story» — سحب أفقي = تخطّي الراوي كاملاً
- «Swipe **right** to go back to your last friend's Story»
- «Swipe **down** to exit a Story» — السحب للأسفل خروج
- «Swipe **up** on a Snap to reply to a Story» — السحب للأعلى ردّ (وهو أيضاً إيماءة الـ CTA في الإعلانات)
- الضغط المطوّل عند سناب شات موثّق كـ**إرسال/مشاركة** لا كإيقاف: «press and hold on a Snap you're watching, tap the blue arrow»

**إنستغرام** (Instagram Help Center — «What are some tips for watching and scrolling between people's stories?»):

- «Tap on the **left** of the screen to go back to the previous photo or video, or on the **right** to go to the next one»
- «Swipe right or left to skip between people's stories»
- «**Tap and hold** the screen to pause on a photo or video» — الإيقاف بالضغط المطوّل موثّق عند إنستغرام صراحةً

**إنستغرام على الويب/الحاسوب** (Instagram Help Center — «View someone's Instagram story»):
«use the **arrows** to get to the next screen or story. Select **x** in the top right to exit» —
أي أن نسخة سطح المكتب تستبدل مناطق النقر بأزرار سهمين وزرّ إغلاق. هذه نقطة مهمة لواجهتنا
الويبّية: العارض نفسه له تجسيدان مختلفان بحسب المدخل (لمس مقابل مؤشّر).

### 1.3 أشرطة التقدّم والتقدّم التلقائي

- التقدّم التلقائي مؤكَّد رسمياً عند سناب شات في سياق القياس: «Snapchat video Ads are
  **auto-play initiated**»، وأنه في بعض السياقات «ads can be viewed **continuously, without
  user interaction**» (Snapchat Description of Methodology).
- عند إنستغرام يظهر التقدّم التلقائي ضمناً في صياغة مواصفات الإعلان: الصورة تُعرض
  «5-16 seconds **or until the user swipes out**»، أي أن انتهاء المدة يقدّم الشريحة وحده.
- **شكل شريط التقدّم نفسه** (عدد القطع، السمك، سلوكه عند الإيقاف) **غير موثّق رسمياً** في
  أي من المنصتين — انظر [الفجوات](#الفجوات-ما-لا-توثّقه-المصادر-الرسمية).

---

## 2. الفصل بين الإعلان والمحتوى

### 2.1 ما تفعله المنصتان بصرياً

**إنستغرام**

- المنشور المدفوع يحمل وسم **Sponsored** أسفل اسم الحساب.
- المحتوى المموَّل العضوي (branded content) يحمل وسم **«Paid partnership with [اسم الشريك]»**.
- والأهم للتفريق: «If the post is **boosted or is an unpublished ad**, an **Ad label** appears,
  just like it would with any other ad» (Instagram Help — About labels on paid partnership posts).
  أي أن إنستغرام يفصل بين حالتين: «شراكة مدفوعة» (علاقة تجارية أفصح عنها الناشر)
  و«إعلان» (مساحة اشتُريت من المنصة) — ولكلٍّ وسمه.

**سناب شات**

- الـ Sponsored Snaps «are marked with an **'Ad' badge** to make it clear that it's an ad»
  (Snapchat Support — «What are the ads I'm seeing in my Chat feed?»).
- الإبلاغ عن الإعلان مسار أصيل في الواجهة: ضغط مطوّل → **Report Ad** → سبب.
- المواصفات الفنية تفرض هوية معلن ظاهرة على الإبداع نفسه لا على الإطار فقط:
  **Brand Name** حتى 32 حرفاً و**Headline** حتى 34 حرفاً، و«The Brand Name **must reflect the
  paying Advertiser**» و«Brand name must match the paying advertiser whose products or services
  are being advertised» (Single Image or Video Specifications).
- سياسات الإعلان تمنع صراحةً تقليد شكل المنتج: «Creating or sharing content that **mimics the
  appearance or function of Snapchat features or formats**»، وتمنع «Unauthorized or **undisclosed
  sponsored content**»، وتشترط أن «advertisers must be accurately and clearly identified in the ad».

**النمط المشترك:** ثلاث طبقات لا واحدة — (1) وسم نصّي قصير وثابت المكان، (2) اسم معلن
مُلزَم أن يطابق الجهة الدافعة، (3) مسار إبلاغ متاح من داخل العارض.

### 2.2 ما يفرضه القانون

| الجهة | النص | ما يعنيه عملياً |
|---|---|---|
| FTC (الولايات المتحدة) — Disclosures 101 | مصطلحات مثل «advertisement», «ad», «sponsored» كافية؛ و**تُمنع** «sp», «spon», «collab» والكلمات المفردة مثل «thanks» أو «ambassador» | الوسم يجب أن يكون كلمة صريحة لا اختصاراً ذكياً |
| FTC — نفس المصدر، وللستوريات تحديداً | «If your endorsement is in a picture on a platform like **Snapchat and Instagram Stories, superimpose the disclosure over the picture** and make sure viewers have **enough time to notice and read it**» | الوسم يُطبع فوق الصورة نفسها، ومدة الشريحة جزء من الامتثال |
| الاتحاد الأوروبي — التوجيه 2005/29/EC، الملحق I البند 11 | يُحظر «Using editorial content in the media to promote a product where a trader has paid for the promotion **without making that clear**» | الإعلان المموّه محظور في كل الأحوال (قائمة سوداء، بلا اختبار أثر) |
| إسرائيل — قانون حماية المستهلك 5741-1981، المادة 2 | يمنع التاجر من كل ما «likely to **mislead a consumer** as to any matter material to a transaction» | لا يوجد نص خاص بالستوري، والإخفاء يُعالَج تحت التضليل العام. الجهة المختصة: سلطة حماية المستهلك والتجارة العادلة |

**ملاحظة دقة:** بحثتُ عن دليل إرشادي إسرائيلي رسمي مخصّص للإفصاح عن المحتوى المدفوع على
الشبكات الاجتماعية ولم أعثر على وثيقة حكومية أوّلية بهذا الخصوص وقت البحث. ما وجدته يعالج
الأمر تحت مظلة المادة 2 من قانون 1981 (التضليل)، وما عدا ذلك تحليلات مكاتب محاماة —
**مصادر ثانوية**. لا أدّعي أكثر من ذلك.

### 2.3 ما يفرضه المتجران

**Apple — App Review Guidelines، البند 2.5.18 (Display Advertising)**

> «Ads displayed in an app must be **appropriate for the app's age rating** … **Interstitial ads or
> ads that interrupt or block the user experience must clearly indicate that they are an ad**, must
> not manipulate or trick users into tapping into them, and must provide **easily accessible and
> visible close/skip buttons large enough** for people to easily dismiss the ad. Apps that contain
> ads must also include the **ability for users to report** any inappropriate or age-inappropriate ads.»

والبند **3.2.2(iii)** يعدّ «Artificially increasing the number of impressions or click-throughs of
ads» ممارسة تجارية غير مقبولة — أي أن عدّاد المشاهدات المُنفَّخ ليس مشكلة أخلاقية فقط بل خطر رفض.

**Google Play — سياسة Ads**

- «Ads must **not simulate or impersonate the user interface** of any app feature, such as
  notifications or warning elements of an operating system.»
- «It must be **clear to the user which app is serving each ad**.»
- التسييل والإعلان «**not clearly distinguishable from your app content**, such as offerwalls and
  other immersive ads experiences, are not allowed.»
- «Full screen interstitial ads of all formats that are **not closeable after 15 seconds** are not allowed.»

**الأثر المباشر على ستوري ملء الشاشة:** ستوري إعلاني بملء الشاشة هو تعريفاً شيء
«interrupt or block the user experience» بلغة Apple. أي أن وسم «إعلان» + وسيلة تخطّي/إغلاق
ظاهرة + مسار إبلاغ **ليست تحسينات تجميلية بل شروط قبول في المتجرين**.

---

## 3. دورة الحياة

### 3.1 هل الـ 24 ساعة عرف سائد؟ — نعم، ومعها استثناء موثّق

| المنصة | النص | المصدر |
|---|---|---|
| إنستغرام | «Photos and videos you share to your story **disappear from Feed, your profile and Direct after 24 hours**, unless you add it as a highlight» | Instagram Help — How long Instagram stories remain visible |
| سناب شات | «You can view your friends' Stories an unlimited number of times **for 24 hours**» | Snapchat Support — How do I view a friend's Story |
| سناب شات (Snapchat+) | «Snaps on My Story **normally delete after 24 hours**» ويمكن للمشترك اختيار: **1 ساعة، 6، 12، 24 ساعة، يومان، 3 أيام، أسبوع** | Snapchat Support — My Story Timer |

**قراءة مهمة:** وجود My Story Timer يثبت أن الـ 24 ساعة **خيار منتج قابل للضبط، لا قيد تقني**.
سناب شات نفسه يبيع مدداً أطول كميزة مدفوعة. أي منصة تختار مدة أخرى لا تخالف «معياراً»،
لأن المعيار عادة سوقية.

### 3.2 الترتيب

- **داخل الستوري الواحد** — سناب شات: «A Story is a collection of Snaps that **play in the order
  they were taken**» (ترتيب زمني صارم).
- **بين الرواة** — إنستغرام: الترتيب **مُرتَّب بالتعلّم الآلي** لا زمنياً. Meta Transparency Center
  توثّق نظام «Instagram Stories AI system» الذي «determines the order in which stories from people
  you follow show up».
- **بلاطات الإعلان** — سناب شات: «Story Ad tiles are delivered in a **dynamic feed** that provides
  a **personalized experience** to each Snapchatter» (Story Ad Specifications).

أي أن الترتيب مسألتان منفصلتان: تسلسل الشرائح داخل الحلقة (زمني عند الاثنين)، وترتيب
الحلقات في الشريط (خوارزمي عند إنستغرام، وشخصي عند سناب في بلاطات الإعلان).

### 3.3 ماذا يحدث للمنتهي — الأرشفة

إنستغرام هو الوحيد الذي يوثّق آلية أرشفة كاملة:

- «Stories you create and share on Instagram are **saved to your Stories Archive**. You can **turn
  off** Stories Archive at any time in Settings.»
- عند الإطفاء: «any stories you share from that point on will be **deleted after 24 hours**» — أي أن
  الأرشيف اختياري والحذف هو السلوك البديل.
- الأرشيف **خاص**: «Your memories and archived stories can't be seen on Instagram unless you choose
  to share them.»
- الأرشفة **ليست نسخة طبق الأصل**: «some stories may be changed when they are saved to your archive.
  These changes can mean **muting music or freezing videos or gifs**… These changes are **permanent**»
  — والسبب المُعلن حرفياً: «to help Instagram keep up with **storage needs**». أي أن تكلفة التخزين
  دفعت أكبر منصة ستوريات في العالم إلى تدهين الأصول المؤرشفة.
- **Highlights** هي الاستثناء الوحيد لانتهاء الصلاحية: الستوري المضاف كـ highlight لا يختفي.
- **البيانات تعيش أطول من المحتوى:** «Although stories **expire after 24 hours**, you can still access
  **insights for up to two years** after they're created. **Expired stories themselves are not
  viewable**» (Instagram Help — View insights on your Instagram Stories).

وعند سناب على جانب الإعلانات: «aggregate impression data is currently available for a **minimum of
2 years** from the event» (Description of Methodology). أي أن المنصتين تتقاربان على الفصل نفسه:
**المحتوى يموت في 24 ساعة، والقياس يعيش سنتين.**

---

## 4. القياس — ما الذي يُعدّ «مشاهدة» فعلاً؟

### 4.1 تعريفات دقيقة من التوثيق

**سناب شات — إعلان الصورة/الفيديو المفرد** (Delivery Metrics Glossary):

| المقياس | التعريف الحرفي |
|---|---|
| Paid Impressions | «Tracked when the ad **fully renders** on a device for the **first time** during a Snapchatter viewing session» |
| Paid Reach | «The number of **unique** Snapchatters who have been served a paid impression» |
| 2 Second Video Views | «at least **2 seconds of consecutive watch time** **or a click** action on the ad» |
| 2 Second Video Views (View Time Only) | نفس المعيار **دون** احتساب النقر |
| 15 Second Video Views | «at least **15 seconds**, or **97% completion** if it's shorter than 15 seconds, or a click» |
| Video Completions | «viewed to **97%**. Video Completions only record Views and **not clicks**» |
| Average Screen Time | «Screen time **starts recording as soon as the media is fully rendered**» |

**سناب شات — Story Ads** (Story Ad Metrics Glossary): تعريف مختلف تماماً لأن الوحدة بلاطة في شبكة لا شاشة كاملة:

| المقياس | التعريف الحرفي |
|---|---|
| Paid Impressions | «The total number of times a Snapchatter saw the **Story Tile**… Counted when the tile is **50% on screen for at least 1 second**» |
| Story Opens | «Number of times a Snapchatter **taps** on the Story Ad» |
| Story Open Rate | (Story Opens / Paid Impressions) × 100 |
| Story Completes | «viewed through to the **last** image or video in your Story Ad» |
| Completed Story View Percentage | (Story Completes / Paid Impressions) × 100 |

**سناب شات — Viewability** (Viewability Metrics Glossary): «Viewable Impressions: The number of
impressions that were **100% viewable** on a user's screen for **at least 1 second**» — سقف أعلى من
معيار الصناعة، ومبرَّره في وثيقة المنهجية: «our Ads display on **100% of the mobile device screen**».

**إنستغرام / Meta:**

- Impressions (إعلانات): «The number of times your ads were **on screen**»، و«counted as the number of
  times an instance of an ad is on screen **for the first time**»، وصراحةً: «a **video is not required
  to start playing** for the impression to be counted».
- Stories Insights (عضوي/مُعزَّز): **Views** = «The number of times your story was **played or
  displayed**» · **Viewers** = «**Unique accounts** that saw your story at least once» ·
  **Interactions** (ردود، مشاركات، نقر ملصقات وروابط) · **Accounts engaged** · **Profile activity**.

**معيار الصناعة للمقارنة** — IAB/MRC Viewable Impression: العرض **50% من البكسلات لثانية واحدة
متصلة**، والفيديو **50% لثانيتين متصلتين**. سناب يذكر أن بعض مقاييسه معتمَدة من MRC، وMeta تذكر
أن «Impressions from certain placements are accredited by the Media Rating Council».

### 4.2 تفاصيل منهجية لافتة (سناب — Description of Methodology)

- «We **do not record ad impressions until a unit has been fully rendered** on the device» — لا انطباع قبل الاكتمال.
- «**Offline** impressions are stored and **resent once the user is back online** for up to 24 hours» — القياس يحتمل انقطاع الشبكة.
- «Snap considers this user interaction… as a **strong user interaction that is a proxy for a viewable impression**» — النقر/السحب يُحتسب كبديل عن المشاهدة القابلة للرؤية.
- تصفية الترافيك غير الصالح (IVT) تعمل **على مستوى الحساب** لا الانطباع المفرد.
- قياس الوصول (Reach) عبر **Theta sketch** بخطأ نسبي **2.210%** عند انحراف معياري واحد — أي أن
  «الوصول» عند أكبر المنصات **تقدير معلَن الخطأ**، لا عدّ دقيق.

### 4.3 ما يحتاجه معلن محلي صغير ليقتنع بالدفع

هنا لا يوجد توثيق منتج يجيب مباشرةً، لكن تحليل التعريفات أعلاه يعطي تصنيفاً قابلاً للدفاع:

**مقاييس رخيصة الحساب وقابلة للتحقق ذاتياً من المعلن:**

- **مشاهدات** (عدد مرات عرض الشريحة) و**مشاهدون فريدون** — هذا بالضبط ما تفصله إنستغرام إلى
  Views مقابل Viewers. الفرق بين الرقمين هو ما يمنع المعلن من الشعور بأنه يُبالَغ عليه.
- **إكمال** (بلوغ آخر شريحة) — Story Completes عند سناب. رقم واحد يقول «هل صبروا حتى النهاية؟».
- **النقر على الإجراء** (اتصال/واتساب/موقع) — النقر عند سناب يُعامَل كإشارة أقوى من المشاهدة نفسها.
- **مدة العرض المتوسطة** — Average Screen Time.

**مقاييس لا معنى لها في جمهور صغير محلي:**

- CPM / eCPM / eCPMR / Frequency الاحتمالية: كلها مصمَّمة لقياس مزادات بملايين الانطباعات.
  ملف السياق عندنا **يستبعد المزاد أصلاً** (الدفع يدوي والإدارة تفعّل)، فلا سعر لكل ألف يُحسب.
- Reach التقديري بـ sketch: تقنية لتفادي عدّ مئات الملايين من المعرّفات. في بلدة يبلغ جمهورها
  المئات، `COUNT(DISTINCT user_id)` أدقّ وأرخص من أي تقدير.
- Lookalike / Custom Audiences وكل بنية الاستهداف: خارج النطاق بالكامل بحكم قيود التذكرة.

**المفارقة الجوهرية للحجم الصغير:** المعلن المحلي يعرف جمهوره بالاسم. الرقم الذي يقنعه ليس
«12,400 انطباع» بل «شافوه 180 واحد من رهط، و23 ضغطوا على الرقم». أي أن **الفلترة الجغرافية
للمقياس** (المشاهدات لكل بلدة) قد تكون أثمن من دقة المقياس نفسه — وهذا ما لا تقدّمه أي من
المنصتين لأن جمهورها ليس بلدة.

**تحذير من التوثيق نفسه:** Apple تعدّ تضخيم الانطباعات صناعياً ممارسة مرفوضة (3.2.2(iii))،
وسناب لا يحتسب انطباعاً قبل اكتمال العرض، وMeta تعدّ الانطباع مرة واحدة لكل ظهور أول.
أي تعريف نتبنّاه لاحقاً يجب أن يكون **قابلاً للشرح لمعلن يشكّ**، لا كريماً معنا.

---

## 5. الوسائط — صورة أم فيديو؟

**الجواب من التوثيق: الاثنان، عند المنصتين، بلا استثناء.** ولا توجد منصة تدعم الصورة وحدها.

### 5.1 سناب شات — Single Image or Video Specifications

| البند | القيمة |
|---|---|
| المقاس | **1080 × 1920** بكسل، نسبة **9:16** |
| نسب فنية | SAR 9:16 · DAR 9:16 · **PAR 1:1** |
| المدة | **3 ثوانٍ – 30 دقيقة** (شرط ألا يتجاوز الحجم 1 غيغابايت) |
| الفيديو | `.mp4` أو `.mov`، ترميز **H.264**، **≤ 1 GB** |
| الصورة | `.jpg` أو `.png`، **≤ 5 MB**، حد أدنى **720 × 1280**، نسبة مطلوبة 9:16 |
| Dynamic Ads | ≤ 6 MB |
| الصوت | قناتان متوازنتان · هدف **-16 LUFS** · **PCM أو AAC** · **≥ 192 kbps** · 16 أو 24 بت فقط |
| قيد المحتوى | معتمَد للعرض لجمهور **13+** |

### 5.2 سناب شات — بلاطة Story Ad (وحدة الدخول في الشبكة)

| البند | القيمة |
|---|---|
| الشعار | **993 × 284** بكسل، PNG بخلفية شفافة |
| صورة البلاطة | **360 × 600** بكسل، PNG، **≤ 2 MB**، عمق ألوان **8-bit أو أقل** |
| مناطق آمنة | حاجز **175px** أعلى الصورة؛ ومع زر CTA: **175px** أعلى و**269px** أسفل؛ والنص داخل **300 × 128** |
| العنوان | حتى **55 حرفاً** بالمسافات (الإيموجي يُحتسب) |
| محتوى الحلقة | **1 – 10** شرائح، كل شريحة حتى **180 ثانية** |

### 5.3 إنستغرام — Stories

| البند | Meta Ads Guide | Meta Business Help |
|---|---|---|
| النسبة | 9:16 | 9:16 موصى بها (وكل نسب الفيد مدعومة، من 1.91:1 إلى 4:5) |
| الدقة | 1440 × 2560 موصى بها | **1080 × 1920** موصى بها · **حد أدنى 600 × 1067** |
| الصورة | JPG أو PNG · **≤ 30 MB** · عرض أدنى **500px** | ≤ 30 MB |
| الفيديو | MP4 / MOV / GIF · **1 ثانية – 60 دقيقة** · **≤ 4 GB** · عرض أدنى **250px** | ≤ 4 GB · حد أقصى 60 دقيقة |
| الترميز | H.264، بكسلات مربّعة، معدّل إطارات ثابت، مسح تدريجي، صوت AAC **≥128 kbps** | فيديو: **H.264, VP8** · صوت: **AAC, Vorbis** |
| تسامح النسبة | **1%** | — |
| مناطق آمنة | اترك ~**14% أعلى**، **35% أسفل**، **6% كل جانب** خالية من النص والشعارات | — |

**ثلاث ملاحظات فنية تستحق الانتباه:**

1. **مناطق الأمان ليست تجميلاً**: كلتا المنصتين تخصّص شريطاً علوياً وسفلياً لعناصر النظام
   (صورة الحساب، شريط التقدّم، زر الإجراء). أي تصميم يضع نصاً هناك يُقصّ.
2. **سناب يوحّد المسار على الفيديو**: الصورة تُحوَّل إلى فيديو 5 ثوانٍ. أي أن العارض عنده
   لا يعرف «صورة» أصلاً.
3. **الفارق في السقف هائل**: سناب يقبل **1 GB** فيديو، وإنستغرام **4 GB**. للسياق: هذه أسقف
   منصات تخدم مليارات؛ أي سقف نختاره سيكون أصغر بمراتب، والقيد عندنا سيكون الرفع لا التخزين.

---

## 6. RTL — ما ينعكس وما لا ينعكس

لا توجد وثيقة رسمية من سناب أو ميتا تصف سلوك عارض الستوري في الواجهة العربية. لكن توجد
**قواعد رسمية من صانعي المنصتين** (Apple / Flutter / معايير CSS) تحكم كل عنصر في العارض،
وهي مصادر أوّلية صالحة للاستشهاد.

### 6.1 قواعد Apple HIG — «Right to left»

**ينعكس:**

- **أشرطة التقدّم**: «**Flip controls that show progress from one value to another.** Because people
  tend to view forward progress as moving in the same direction as the language they read, it makes
  sense to flip controls like sliders and **progress indicators** in the RTL context.» وأيضاً:
  «be sure to **reverse the positions** of the accompanying glyphs or images that depict the beginning
  and ending values».
  → **شريط التقدّم يمتلئ من اليمين إلى اليسار، وأول شريحة تكون في أقصى اليمين.**
- **تالي/سابق**: «**Flip controls that help people navigate or access items in a fixed order.** For
  example, in the RTL context, a **back button must point to the right**… Similarly, **next or previous
  buttons** that let people access items in an ordered list need to flip».
  → **منطقة «التالي» تصبح اليسار، و«السابق» تصبح اليمين** — أي عكس ما توثّقه سناب وإنستغرام لواجهتيهما الإنجليزية.
- **ترتيب العناصر ذات المعنى التسلسلي**: «Reverse the positions of images when their **order is
  meaningful**» (زمني، أبجدي، مفضّل).
- **أرقام التقدّم**: «**Reverse the order of numerals that show progress or a counting direction**;
  **never flip the numerals themselves**.»

**لا ينعكس:**

- **الصور والوسائط**: «**Avoid flipping images** like photographs, illustrations, and general artwork.
  Flipping an image often **changes the image's meaning**; flipping a copyrighted image could be a
  **violation**.» → صورة الستوري وصورة المعلن تُعرض كما هي، دائماً.
- **الشعارات والعلامات العالمية**: «**Don't flip logos** or universal signs and marks. Displaying a
  flipped logo confuses people and can have **legal repercussions**.» → شعار المعلن لا يُعكس أبداً.
- **الأرقام داخل الرقم الواحد**: «**Don't reverse the order of numerals in a specific number.**
  Regardless of the current language… the digits in a specific number — such as "541", a **phone
  number**, or a credit card number — always appear in the same order.» → رقم هاتف المعلن يبقى كما هو.
- **الأيقونات التي تمثّل أشياء واقعية**: «clocks work the same everywhere» → أيقونة الساعة/المؤقّت
  لا تُعكس.
- **ما يشير إلى اتجاه فعلي على الشاشة**: «**Preserve the direction of a control that refers to an
  actual direction** or points to an onscreen area.»

**ونصيحة طباعية مباشرة لواجهة عربية:** «Arabic or Hebrew text can appear **too small** when next to
uppercased Latin text… it often works well to **increase the RTL font size by about 2 points**.»

### 6.2 آليات التنفيذ في وحداتنا الثلاث

- **فلاتر**: `Directionality` هو «A widget that determines the ambient directionality of text and
  **text-direction-sensitive render objects**». العناصر المبنية على `EdgeInsetsDirectional` وما
  شابه تتكيّف تلقائياً؛ وأي حساب إحداثيات يدوي (مناطق نقر محسوبة بـ `dx < width/2`) **لا يتكيّف
  تلقائياً** — لأنه ليس عنصر عرض بل حساب.
- **الويب بلا خطوة بناء**: خصائص CSS المنطقية تحلّ المسألة بلا JS: «The logical properties defined in
  this module enable defining properties **relative to the content's writing direction**, rather than
  a physical direction.» تحت `direction: rtl` يصير `inline-start` = اليمين و`inline-end` = اليسار.
  أي أن شريط تقدّم مبني على `inset-inline-start` وحركة `transform` منطقية ينعكس مجاناً،
  بينما شريط مبني على `left`/`right` أو `translateX` **لن ينعكس**.

### 6.3 جدول القرار السريع

| العنصر | ينعكس في RTL؟ | السند |
|---|---|---|
| اتجاه امتلاء شريط التقدّم | **نعم** | Apple HIG — flip progress indicators |
| ترتيب قطع شريط التقدّم (أول شريحة يميناً) | **نعم** | Apple HIG — reverse order when meaningful |
| منطقة النقر «التالي» | **نعم** (تصير اليسار) | Apple HIG — flip next/previous |
| منطقة النقر «السابق» | **نعم** (تصير اليمين) | Apple HIG — back button points right |
| اتجاه السحب للانتقال بين الحلقات | **نعم** (يتبع تالي/سابق) | Apple HIG — fixed order navigation |
| السحب للأسفل للخروج | **لا** — محور رأسي لا علاقة له بالقراءة | Apple HIG — preserve actual direction |
| الضغط المطوّل للإيقاف | **لا** — لا اتجاه فيه | — |
| صورة الستوري / صورة الإعلان | **لا** | Apple HIG — avoid flipping images |
| شعار المعلن | **لا** | Apple HIG — don't flip logos |
| رقم هاتف المعلن | **لا** | Apple HIG — don't reverse numerals in a number |
| عدّاد «3/7» أو المؤقّت | ترتيبه ينعكس، وأرقامه لا | Apple HIG — reverse order, never flip numerals |
| النص العربي والوسم | **نعم** (محاذاة) | Apple HIG — text alignment |

---

## الفجوات: ما لا توثّقه المصادر الرسمية

سُئلت عن أرقام محددة «حيثما أمكن». هذه المواضع التي **لم يمكن** فيها، وأصرّح بها بدل ملئها بالتخمين:

1. **شكل شريط التقدّم وسلوكه**: لا سناب ولا ميتا توثّق عدد القطع، أو ما يحدث للشريط عند الإيقاف
   بالضغط، أو هل يُستأنف من موضعه.
2. **الضغط المطوّل عند سناب شات**: موثّق كإرسال/مشاركة فقط. الإيقاف بالضغط موثّق عند
   **إنستغرام وحده**.
3. **انعكاس مناطق النقر في اللغات RTL**: **لا توجد وثيقة من أي من المنصتين** تقول ماذا تفعل نسختها
   العربية. ما في القسم 6 مستمَدّ من إرشادات المنصة (Apple) لا من سلوك سناب/إنستغرام المرصود.
   من أراد اليقين فطريقه القياس على جهاز عربي، لا التوثيق.
4. **مدة عرض الصورة في الستوري العضوي** (غير الإعلاني): الرقم 5 ثوانٍ موثّق في **مواصفات
   الإعلان** عند المنصتين؛ لم أجد نصاً رسمياً يذكره للستوري العادي.
5. **الإرشاد الإسرائيلي المخصّص للإفصاح عن المحتوى المدفوع**: لم أعثر على وثيقة حكومية أوّلية
   خاصة بالشبكات الاجتماعية؛ ما وُجد يعالج الأمر تحت المادة 2 العامة.
6. **حصص الإعلان في التدفّق** (كل كم ستوري يظهر إعلان): غير معلَنة عند أي من المنصتين.

---

## ما يتقاطع مع قيودنا — حقائق لا توصيات

| قيدنا | ما تقوله المصادر |
|---|---|
| الدفع يدوي، لا مزاد | كل مقاييس المزاد (CPM, eCPM, eCPMR, Frequency) تسقط. تبقى تعريفات: انطباع، وصول فريد، إكمال، نقر — وكلها معرّفة صراحةً في مسارد سناب وإنستغرام أعلاه |
| جمهور صغير محلي | Theta sketch وتقديرات الوصول تفقد مبرّرها (خطأها المعلَن 2.210% عند سناب)؛ العدّ الدقيق ممكن ورخيص على هذا الحجم |
| موبايل أولاً (فلاتر) | `Directionality` يتكفّل بعناصر العرض؛ حسابات مناطق النقر يدوية وتحتاج معالجة صريحة |
| ويب بلا خطوة بناء | خصائص CSS المنطقية تعطي انعكاس RTL بلا JS ولا مكتبة؛ ونسخة سطح المكتب من إنستغرام سابقة موثّقة لاستبدال مناطق النقر بأسهم + زر إغلاق |
| النشر على المتجرين | ملء الشاشة + إعلان = بند Apple 2.5.18 (وسم صريح + زر إغلاق/تخطٍّ ظاهر + إبلاغ) وسياسة Google Play (تمييز واضح عن المحتوى، عدم محاكاة واجهة التطبيق) |
| `stories` بلا `expires_at` | الـ 24 ساعة عرف سوقي لا قيد تقني — My Story Timer عند سناب يبيع 1 ساعة إلى أسبوع |
| `stories` بلا مشاهدات | الفصل الذي تعتمده المنصتان: المحتوى يختفي في 24 ساعة، والقياس يبقى سنتين (إنستغرام صراحةً، وسناب للبيانات المجمَّعة) |
| `image` عمود واحد | كلتا المنصتين تقبل صورة **وفيديو**؛ وسناب يوحّدهما بتحويل الصورة إلى فيديو 5 ثوانٍ |

---

## المصادر

**سناب شات — Business Help Center (توثيق أعمال رسمي)**

1. About Single Image or Video Ads — https://businesshelp.snapchat.com/s/article/image-video-ads?language=en_US
2. Single Image or Video Specifications — https://businesshelp.snapchat.com/s/article/top-snap-specs?language=en_US
3. Story Ad Specifications — https://businesshelp.snapchat.com/s/article/story-ad-specs?language=en_US
4. Delivery Metrics Glossary for Single Image or Video Ads — https://businesshelp.snapchat.com/s/article/metrics?language=en_US
5. Story Ad Metrics Glossary — https://businesshelp.snapchat.com/s/article/story-ad-metrics?language=en_US
6. Viewability Metrics Glossary for Single Image or Video Ads — https://businesshelp.snapchat.com/s/article/metrics-viewability?language=en_US
7. Snapchat Description of Methodology — https://businesshelp.snapchat.com/s/article/description-methodology?language=en_US

**سناب شات — Support / Policies (توثيق منتج رسمي)**

8. How do I view a friend's Story on Snapchat? — https://help.snapchat.com/hc/en-us/articles/7012308547092-How-do-I-view-a-friend-s-Story-on-Snapchat
9. How does the My Story Timer work on Snapchat? — https://help.snapchat.com/hc/en-us/articles/9482229148564-How-does-the-My-Story-Timer-work-on-Snapchat
10. What are the ads I'm seeing in my Chat feed? — https://help.snapchat.com/hc/en-us/articles/31709629111060-What-are-the-ads-I-m-seeing-in-my-Chat-feed
11. Understanding Ads on Snapchat — https://help.snapchat.com/hc/en-us/articles/7012345515796-Understanding-Ads-on-Snapchat
12. Snap Advertising Policies — https://snap.com/en-US/ad-policies

**إنستغرام / ميتا (توثيق منتج وأعمال رسمي)**

13. How long Instagram stories remain visible — https://help.instagram.com/1729008150678239/
14. Archive Instagram Stories or turn off Stories Archive — https://help.instagram.com/1935507879999791
15. View insights on your Instagram Stories — https://help.instagram.com/383939598845756/
16. What are some tips for watching and scrolling between people's stories? — https://help.instagram.com/1212825798758222
17. View someone's Instagram story — https://help.instagram.com/899271546851408/
18. About labels on paid partnership posts — https://help.instagram.com/1317960375957564/
19. Design requirements for Instagram Stories ads — https://www.facebook.com/business/help/2222978001316177
20. Meta Ads Guide — Awareness Image ad specs on Instagram Stories — https://www.facebook.com/business/ads-guide/update/image/instagram-story
21. Meta Ads Guide — Awareness Video ad specs on Instagram Stories — https://www.facebook.com/business/ads-guide/update/video/instagram-story
22. Impressions | Meta Business Help Center — https://www.facebook.com/business/help/675615482516035
23. Instagram Stories AI system | Meta Transparency Center — https://transparency.meta.com/features/explaining-ranking/ig-stories/

**قانون وتنظيم**

24. FTC — Disclosures 101 for Social Media Influencers — https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers
25. FTC — Endorsements, Influencers, and Reviews — https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews
26. Directive 2005/29/EC (UCPD)، الملحق I البند 11 — https://eur-lex.europa.eu/eli/dir/2005/29/oj/eng
27. Consumer Protection Law, 5741-1981 (إسرائيل) — WIPO Lex — https://www.wipo.int/wipolex/en/legislation/details/2389

**سياسات المتاجر**

28. Apple — App Review Guidelines (2.5.18 Display Advertising · 3.2.2(iii)) — https://developer.apple.com/app-store/review/guidelines/
29. Google Play — Ads policy — https://support.google.com/googleplay/android-developer/answer/9857753?hl=en

**معايير القياس وإرشادات الواجهة**

30. IAB/MRC — Viewable Ad Impression Measurement Guidelines — https://www.iab.com/wp-content/uploads/2015/06/MRC-Viewable-Ad-Impression-Measurement-Guideline.pdf
31. MRC — Mobile Viewable Ad Impression Measurement Guidelines — https://mediaratingcouncil.org/sites/default/files/Standards/062816%20Mobile%20Viewable%20Guidelines%20Final.pdf
32. Apple HIG — Right to left — https://developer.apple.com/design/human-interface-guidelines/right-to-left
33. Flutter API — `Directionality` — https://api.flutter.dev/flutter/widgets/Directionality-class.html
34. MDN — CSS logical properties and values — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values

**مصادر ثانوية (مستخدَمة للسياق فقط، ومُعلَّمة كذلك في المتن)**

35. تحليلات مكاتب محاماة حول تطبيق قانون حماية المستهلك الإسرائيلي على الإفصاح في المحتوى المدفوع — استُخدمت للتوجيه إلى المادة 2 فقط، ولم يُبنَ عليها أي ادّعاء قانوني مستقل.
