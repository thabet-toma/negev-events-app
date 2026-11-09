'use strict';

/**
 * ستوديو بطاقة الدعوة (المواصفة #156، المرحلة ٣ — تذكرة #180): القوالب
 * الاثنا عشر وخطوطها وألوانها، والرسم على `@napi-rs/canvas`.
 *
 * **لماذا وحدة رسم مستقلة عن `shareCard.service`:** تلك ترسم بطاقة `og:image`
 * **واحدة** بشكل ثابت (زاوية مربعة ولوحة واحدة لكل نبرة) يراها الزاحف على
 * `/e/:id`. هذه ترسم بطاقة **يصمّمها صاحب المناسبة**: اثنا عشر قالباً بأربعة
 * مقاسات وخمس عائلات خطوط وألوان يختارها، ثم تُحفظ الصورة في `event_cards`
 * وتصير `og:image` إن جعلها أساسية. التشابه في التقنية (Canvas وحده) لا في
 * الغرض، فلواحق `shareCard` (اللوحة، الشريط، العلامة) لا تصلح لمقاس 1080×1920
 * ولا لـA4. ما يُعاد استعماله منها صراحةً: `wrapLines` (الالتفاف العربي نفسه)،
 * و`loadPosterBuffer` (قراءة الملصق من القرص لا عبر الشبكة)، و`drawBrandMark`
 * (هندسة العلامة الواحدة)، و`PALETTES` (اسم الموقع ونغمته).
 *
 * **لا SQL هنا ولا `req`/`res`:** الوحدة ترسم فقط. قراءة الصفوف في
 * `eventCards.service.js`، والتحقق في الراوتر.
 *
 * **النبرة تحكم الظهور.** `tone` لكل قالب، ونبرة المناسبة تأتي من
 * `occasion_types.tone` (عمود قائم يستعمله #177). مناسبة `solemn` (عزاء) لا
 * ترى إلا قوالب `solemn` — وهذا قرار مقصود لا تقييد تقني: لو رأت قوالب
 * `festive` لأمكن رسم بطاقة عزاء بزخرفة فرح وأسماء ذهبية، وهو إساءة لا
 * «خيار تصميم». والعكس مقصور أيضاً: مناسبة `festive` لا ترى قوالب العزاء،
 * لأن دعوة عرس بإطار رمادي هادئ تقول شيئاً لم يقله صاحبها. القاعدتان في
 * `templatesForTone` وحدها، ويستعملها الراوتر في كل كتابة (لا العميل وحده).
 *
 * **الخطوط** خمس عائلات OFL في `server/src/assets/fonts/`، تُسجَّل مرة واحدة
 * عند تحميل الوحدة كما يفعل `shareCard.service.js` (Alpine لا يحمل خطاً ولا
 * fontconfig، فالتسجيل بمسار صريح شرط لا تحسين). `availableFonts()` يعيد
 * المسجَّل فعلاً وحده، و`GET /api/card-templates` يعيده — فلا يختار المستخدم
 * خطاً لن يُرسم.
 */

const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { PALETTES } = require('../utils/shareTheme');
const { drawBrandMark, wrapLines } = require('./shareCard.service');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');

/**
 * عرض أقصى لصورة المعاينة. المعاينة تُعاد `image/png` بمقاس مصغّر محسوب من
 * المقاس المختار، فلا يُعاد إلى المتصفّح 2480×3508 لمجرّد اختيار قالب.
 * الرقم ثابت (لا `?width=`) كي تكون أبعاد المعاينة معلومة للعميل والاختبار
 * معاً من نفس الدالة (`previewDimensions`).
 */
const PREVIEW_MAX_WIDTH = 480;

// ---------------------------------------------------------------------------
// الخطوط
// ---------------------------------------------------------------------------

/**
 * العائلات الخمس، كلها برخصة OFL (SIL Open Font License 1.1) وملف ترخيصها
 * بجانبها في المجلد نفسه (`OFL.txt` لـCairo، و`OFL-<العائلة>.txt` للباقي):
 * الترخيص واحد لكن التتبّع يقتضي أن يُعرف ملفه من اسمه.
 *
 * الاسم المختصر (`key`) هو ما يُخزَّن في `event_cards.font_key`، واسم العائلة
 * المسجَّل في Skia شيء آخر (`cardstudio-<key>-r|b`) لأن اسم عائلة خط OFL مكرَّر
 * بين نسختَي الوزن، والتسجيل باسمين صريحين هو نفس نهج `shareCard.service.js`.
 */
const CARD_FONTS = [
  {
    key: 'cairo',
    name: 'القاهرة',
    note: 'خط الهوية — هندسي واضح',
    wordSpacing: 0,
    regular: 'Cairo-Regular.ttf',
    bold: 'Cairo-Bold.ttf'
  },
  {
    key: 'tajawal',
    name: 'تجوال',
    note: 'عصري رشيق',
    wordSpacing: 0,
    regular: 'Tajawal-Regular.ttf',
    bold: 'Tajawal-Bold.ttf'
  },
  {
    key: 'amiri',
    name: 'أميري',
    note: 'نسخ كلاسيكي بلمسة دعوة مطبوعة',
    wordSpacing: 0,
    regular: 'Amiri-Regular.ttf',
    bold: 'Amiri-Bold.ttf'
  },
  {
    key: 'reem_kufi',
    name: 'ريم كوفي',
    note: 'كوفي هندسي',
    wordSpacing: 0.12,
    // **ملف متغيّر واحد، لا ملفَّي وزن** (بخلاف العائلات الأربع الأخرى):
    // نسخة Google Fonts الساكنة لهذه العائلة تُشكّل العربية تشكيلاً مكسوراً —
    // الحروف تتراكب والحركات تنفصل، رُئي ذلك فعلياً برسم الاسم «محمد أحمد أبو
    // القيعان» ومقارنته بالملف المتغيّر الرسمي من مستودع google/fonts. والملف
    // المتغيّر يعطي الوزن الصحيح من `ctx.font` (أثبت ذلك فحص البكسلات: وزن ٤٠٠
    // يرسم حبراً أقل من ٧٠٠)، فسُجِّل مرتين باسمَي وزنٍ لا بملفّين.
    regular: 'ReemKufi-Variable.ttf',
    bold: 'ReemKufi-Variable.ttf'
  },
  {
    key: 'noto_naskh',
    name: 'نسخ نوتو',
    note: 'نسخ هادئ للعزاء',
    wordSpacing: 0,
    regular: 'NotoNaskhArabic-Regular.ttf',
    bold: 'NotoNaskhArabic-Bold.ttf'
  }
];

/**
 * تسجيل العائلات مرة واحدة عند تحميل الوحدة. الفشل لا يُسقط الخدمة كلها:
 * عائلة ناقصة تُستثنى من `availableFonts()` (فيختفي خيارها من الستوديو
 * والـAPI) بدل أن ينهار الخادم عند الإقلاع لملف خط مفقود.
 */
for (const font of CARD_FONTS) {
  const family = `cardstudio-${font.key}`;
  font.regularFamily = `${family}-r`;
  font.boldFamily = `${family}-b`;
  try {
    if (!fs.existsSync(path.join(FONT_DIR, font.regular)) || !fs.existsSync(path.join(FONT_DIR, font.bold))) {
      throw new Error('font file missing');
    }
    GlobalFonts.registerFromPath(path.join(FONT_DIR, font.regular), font.regularFamily);
    GlobalFonts.registerFromPath(path.join(FONT_DIR, font.bold), font.boldFamily);
    font.registered = true;
  } catch (err) {
    font.registered = false;
    logger.warn(`[cardStudio] font ${font.key} unavailable: ${err.message}`);
  }
}

/** العائلات المسجَّلة فعلاً — هذا وحده ما يعرضه المنتقي ويقبله التحقق. */
function availableFonts() {
  return CARD_FONTS
    .filter(font => font.registered)
    .map(font => ({ key: font.key, name: font.name, note: font.note }));
}

function fontByKey(key) {
  return CARD_FONTS.find(font => font.key === key && font.registered) || null;
}

// ---------------------------------------------------------------------------
// المقاسات
// ---------------------------------------------------------------------------

/**
 * الأربعة المطلوبة في المواصفة. `unit` ليس هنا: كل شكل يُقاس بـ`width / 1080`
 * (نسبةً إلى أضيق قماش) فتبقى النسب واحدة في الأربعة.
 *
 * `maxProgramGroups` و`maxDetailLines` يكفلان أن يبقى المحتوى داخل القماش في
 * المربّع (الأضيق رأسياً) بلا قصّ: بطاقة المربّع بنفس عدد أسطر الستوري لا
 * تُقرأ، فلا يُرسم منها إلا ما يتّسع.
 */
const CARD_SIZES = [
  { key: 'story', name: 'ستوري', width: 1080, height: 1920, maxProgramGroups: 4, maxDetailLines: 4, photoRatio: 0.34 },
  { key: 'portrait', name: 'عمودي', width: 1080, height: 1350, maxProgramGroups: 3, maxDetailLines: 3, photoRatio: 0.30 },
  { key: 'square', name: 'مربّع', width: 1080, height: 1080, maxProgramGroups: 1, maxDetailLines: 2, photoRatio: 0.26 },
  { key: 'a4', name: 'A4 للطباعة', width: 2480, height: 3508, maxProgramGroups: 4, maxDetailLines: 4, photoRatio: 0.32 }
];

function sizeByKey(key) {
  return CARD_SIZES.find(size => size.key === key) || null;
}

/**
 * أبعاد المعاينة المصغّرة لمقاس: العرض 480 والعرض/الطول محفوظان، بارتفاع
 * مقرَّب إلى أقرب بكسل. الثابتة الوحيدة هي العرض الأقصى، فالنتيجة دالة نقية
 * من المقاس (`story` 480×853، `portrait` 480×600، `square` 480×480،
 * `a4` 480×679) — يعيدها نفس المصدر الذي يرسم بها الخادم.
 */
function previewDimensions(size) {
  const resolved = typeof size === 'string' ? sizeByKey(size) : size;
  if (!resolved) return null;
  const width = Math.min(PREVIEW_MAX_WIDTH, resolved.width);
  const height = Math.round((width / resolved.width) * resolved.height);
  return { width, height };
}

// ---------------------------------------------------------------------------
// النبرة واللوحات
// ---------------------------------------------------------------------------

/**
 * لوحة كل خلفية: أرضية القماش وتدرّجها، وحبر النص وأخفته، وخط الاستدارة.
 * قيمها ثابتة هنا (لا من قاعدة البيانات) لأنها جزء من شكل القالب نفسه، واللون
 * الذي يختاره المستخدم هو **اللون المميّز** (accent) وحده — الإطار والشرائح
 * وأسماء أصحاب المناسبة — فيبقى النص مقروءاً مهما اختار من لوحة القالب.
 */
const DECORS = {
  nocturne: {
    bg: '#091624', bg2: '#14293c', ink: '#f4f9fc', soft: '#b3c8d8', faint: '#7f97a9',
    panel: 'rgba(255, 255, 255, 0.05)', line: 'rgba(255, 255, 255, 0.16)', frame: true
  },
  ivory: {
    bg: '#fdfaf3', bg2: '#f2e7d3', ink: '#1e2a34', soft: '#5c6a75', faint: '#7d8791',
    panel: 'rgba(255, 255, 255, 0.65)', line: 'rgba(30, 42, 52, 0.16)', frame: true
  },
  sky: {
    bg: '#062a40', bg2: '#0b5074', ink: '#f1fbff', soft: '#b4d8ea', faint: '#8bb6cc',
    panel: 'rgba(255, 255, 255, 0.06)', line: 'rgba(255, 255, 255, 0.18)', frame: false
  },
  rose: {
    bg: '#fdf4f1', bg2: '#f5dfd8', ink: '#3a1f24', soft: '#7c5a5f', faint: '#93787c',
    panel: 'rgba(255, 255, 255, 0.6)', line: 'rgba(58, 31, 36, 0.16)', frame: false
  },
  graphite: {
    bg: '#141a20', bg2: '#242e38', ink: '#eef3f7', soft: '#adbac5', faint: '#8695a2',
    panel: 'rgba(255, 255, 255, 0.05)', line: 'rgba(255, 255, 255, 0.16)', frame: false
  },
  sand: {
    bg: '#f8f2e4', bg2: '#e9dcc2', ink: '#22302b', soft: '#5f6f66', faint: '#7d8b83',
    panel: 'rgba(255, 255, 255, 0.6)', line: 'rgba(34, 48, 43, 0.18)', frame: true
  },
  midnight: {
    bg: '#050b14', bg2: '#0d1a29', ink: '#e9f3ff', soft: '#9ab3cb', faint: '#7a93aa',
    panel: 'rgba(255, 255, 255, 0.04)', line: 'rgba(255, 255, 255, 0.14)', frame: true
  },
  sunrise: {
    bg: '#fff5e6', bg2: '#ffdfba', ink: '#3b2412', soft: '#7c5b3f', faint: '#94795f',
    panel: 'rgba(255, 255, 255, 0.55)', line: 'rgba(59, 36, 18, 0.16)', frame: false
  },
  classic: {
    bg: '#ffffff', bg2: '#eff4f9', ink: '#0f2130', soft: '#556a7c', faint: '#728796',
    panel: 'rgba(15, 33, 48, 0.03)', line: 'rgba(15, 33, 48, 0.18)', frame: true
  },
  carnival: {
    bg: '#180f2c', bg2: '#2b1752', ink: '#fcf6ff', soft: '#c9b7e6', faint: '#a390c2',
    panel: 'rgba(255, 255, 255, 0.06)', line: 'rgba(255, 255, 255, 0.18)', frame: false
  },
  quiet: {
    bg: '#f0f2ef', bg2: '#dee4dd', ink: '#222d28', soft: '#58655e', faint: '#74827a',
    panel: 'rgba(255, 255, 255, 0.55)', line: 'rgba(34, 45, 40, 0.20)', frame: true
  },
  ash: {
    bg: '#eceef0', bg2: '#d9dee2', ink: '#1f262c', soft: '#555f68', faint: '#717b84',
    panel: 'rgba(255, 255, 255, 0.5)', line: 'rgba(31, 38, 44, 0.20)', frame: false
  }
};

/**
 * القوالب الاثنا عشر. لكل قالب: مفتاح فريد، اسم عربي، نبرة، وصف سطر واحد،
 * خلفية (`decor`)، شكل إطار الصورة، العائلات التي يُنصح بها، وثلاثة ألوان
 * مميّزة متوافقة مع خلفيته.
 *
 * **قالبان للعزاء** (`solemn`) على الأقل كما اشترطت المواصفة، وكلاهما هادئ
 * رسمي بلا زخرفة فرح: واحد رمادي فاتح (أش) وواحد أخضر-رمادي (quiet).
 */
const CARD_TEMPLATES = [
  {
    key: 'wedding_night',
    name: 'ليل الفرح',
    tone: 'festive',
    tagline: 'ليلٌ كحلي وإطار ذهبي هادئ',
    decor: 'nocturne',
    photoStyle: 'rounded',
    defaultFont: 'cairo',
    fonts: ['cairo', 'tajawal', 'amiri', 'reem_kufi'],
    colors: [
      { value: '#d9b25f', name: 'ذهبي' },
      { value: '#e8d9b0', name: 'عاجي' },
      { value: '#9fb6c9', name: 'فضي' }
    ]
  },
  {
    key: 'gold_frame',
    name: 'إطار ذهبي',
    tone: 'festive',
    tagline: 'دعوة كلاسيكية على أرضية عاجية',
    decor: 'ivory',
    photoStyle: 'plain',
    defaultFont: 'amiri',
    fonts: ['amiri', 'cairo', 'noto_naskh', 'tajawal'],
    colors: [
      { value: '#a87c2b', name: 'ذهب داكن' },
      { value: '#0f5b6b', name: 'فيروزي' },
      { value: '#7b2d3b', name: 'عنّابي' }
    ]
  },
  {
    key: 'sky_arc',
    name: 'قوس السماء',
    tone: 'festive',
    tagline: 'أقواس زرقاء واسعة',
    decor: 'sky',
    photoStyle: 'arch',
    defaultFont: 'tajawal',
    fonts: ['tajawal', 'cairo', 'reem_kufi'],
    colors: [
      { value: '#7dd3fc', name: 'سماوي فاتح' },
      { value: '#e6f4ff', name: 'أبيض مائل' },
      { value: '#fcd34d', name: 'ذهبي فاتح' }
    ]
  },
  {
    key: 'rose_ribbon',
    name: 'شريط الورد',
    tone: 'festive',
    tagline: 'شريط وردي على ورق ناعم',
    decor: 'rose',
    photoStyle: 'rounded',
    defaultFont: 'amiri',
    fonts: ['amiri', 'cairo', 'tajawal'],
    colors: [
      { value: '#a83256', name: 'وردي عميق' },
      { value: '#8d5a34', name: 'بنّي دافئ' },
      { value: '#5b4a8a', name: 'بنفسجي' }
    ]
  },
  {
    key: 'diamond',
    name: 'الماسة',
    tone: 'festive',
    tagline: 'زوايا مصقولة على فحم داكن',
    decor: 'graphite',
    photoStyle: 'sharp',
    defaultFont: 'reem_kufi',
    fonts: ['reem_kufi', 'cairo', 'tajawal'],
    colors: [
      { value: '#d7e1e8', name: 'فضي' },
      { value: '#f0c987', name: 'شامبانيا' },
      { value: '#8fd3c7', name: 'فيروزي باهت' }
    ]
  },
  {
    key: 'heritage',
    name: 'تراث النقب',
    tone: 'festive',
    tagline: 'أرضية رملية وشريط كوفي',
    decor: 'sand',
    photoStyle: 'plain',
    defaultFont: 'reem_kufi',
    fonts: ['reem_kufi', 'amiri', 'noto_naskh', 'cairo'],
    colors: [
      { value: '#1f5c4a', name: 'أخضر صحراوي' },
      { value: '#8a4b2a', name: 'طيني' },
      { value: '#7a6410', name: 'زيتوني' }
    ]
  },
  {
    key: 'midnight',
    name: 'منتصف الليل',
    tone: 'festive',
    tagline: 'نجوم على سواد هادئ',
    decor: 'midnight',
    photoStyle: 'rounded',
    defaultFont: 'cairo',
    fonts: ['cairo', 'tajawal', 'reem_kufi', 'amiri'],
    colors: [
      { value: '#7dd3fc', name: 'فيروزي' },
      { value: '#e9e4d6', name: 'قمرّي' },
      { value: '#f0a4c8', name: 'وردي خافت' }
    ]
  },
  {
    key: 'sunrise',
    name: 'شروق',
    tone: 'festive',
    tagline: 'شمس دافئة على ورق كريمي',
    decor: 'sunrise',
    photoStyle: 'arch',
    defaultFont: 'tajawal',
    fonts: ['tajawal', 'cairo', 'amiri'],
    colors: [
      { value: '#c2601c', name: 'برتقالي محروق' },
      { value: '#8b2f4a', name: 'توتي' },
      { value: '#2f6b5a', name: 'أخضر غامق' }
    ]
  },
  {
    key: 'invitation',
    name: 'دعوة كلاسيكية',
    tone: 'festive',
    tagline: 'بياض ونواميس دقيقة',
    decor: 'classic',
    photoStyle: 'plain',
    defaultFont: 'amiri',
    fonts: ['amiri', 'noto_naskh', 'cairo'],
    colors: [
      { value: '#0f3f63', name: 'كحلي' },
      { value: '#6b4b21', name: 'بنّي ذهبي' },
      { value: '#4a2f5c', name: 'بنفسجي داكن' }
    ]
  },
  {
    key: 'festival',
    name: 'مهرجان',
    tone: 'festive',
    tagline: 'شرائط مائلة وجرأة بنفسجية',
    decor: 'carnival',
    photoStyle: 'rounded',
    defaultFont: 'cairo',
    fonts: ['cairo', 'tajawal', 'reem_kufi'],
    colors: [
      { value: '#f7c948', name: 'أصفر مهرجان' },
      { value: '#8ef0d0', name: 'نعناعي' },
      { value: '#ff9bd1', name: 'وردي فاقع' }
    ]
  },
  {
    key: 'condolence_quiet',
    name: 'عزاء هادئ',
    tone: 'solemn',
    tagline: 'وقار رمادي بلا زخرفة',
    decor: 'quiet',
    photoStyle: 'plain',
    defaultFont: 'noto_naskh',
    fonts: ['noto_naskh', 'amiri', 'cairo'],
    colors: [
      { value: '#3f5548', name: 'أخضر داكن' },
      { value: '#40505c', name: 'أردوازي' },
      { value: '#5c4b3f', name: 'بنّي خافت' }
    ]
  },
  {
    key: 'condolence_ash',
    name: 'عزاء رمادي',
    tone: 'solemn',
    tagline: 'خطوط رقيقة ومساحة صامتة',
    decor: 'ash',
    photoStyle: 'plain',
    defaultFont: 'amiri',
    fonts: ['amiri', 'noto_naskh', 'cairo'],
    colors: [
      { value: '#33414d', name: 'رمادي أزرق' },
      { value: '#4a4a44', name: 'رمادي دافئ' },
      { value: '#3b3b52', name: 'رمادي بنفسجي' }
    ]
  }
];

/**
 * القوالب التي يجوز لهذه النبرة أن تراها. العزاء (`solemn`) لا يرى إلا
 * `solemn`، وغير العزاء لا يرى `solemn` — القاعدة كلها هنا، ويستعملها
 * الراوتر في التحقق من كل كتابة لا العميل وحده.
 */
function templatesForTone(tone) {
  const wanted = tone === 'solemn' ? 'solemn' : 'festive';
  return CARD_TEMPLATES.filter(template => template.tone === wanted);
}

function templateByKey(key) {
  return CARD_TEMPLATES.find(template => template.key === key) || null;
}

/** ما يعرضه المنتقي: القالب مع عائلاته وألوانه، بلا دواله الداخلية. */
function publicTemplate(template) {
  const fonts = template.fonts.filter(key => fontByKey(key));
  return {
    key: template.key,
    name: template.name,
    tone: template.tone,
    tagline: template.tagline,
    default_font: fonts.includes(template.defaultFont) ? template.defaultFont : (fonts[0] || 'cairo'),
    fonts,
    colors: template.colors,
    photo_style: template.photoStyle,
    decor: template.decor
  };
}

/**
 * كتالوج الـAPI: القوالب (كلها أو بنبرة)، والمقاسات، والخطوط المسجَّلة فعلاً.
 * `?tone=` في الراوتر يمرّر هنا، فلا تُعاد واجهة ثانية في طبقة المسارات.
 */
function catalog({ tone = null } = {}) {
  const templates = (tone ? templatesForTone(tone) : CARD_TEMPLATES).map(publicTemplate);
  return {
    templates,
    sizes: CARD_SIZES.map(size => ({
      key: size.key,
      name: size.name,
      width: size.width,
      height: size.height,
      preview: previewDimensions(size)
    })),
    fonts: availableFonts(),
    preview_max_width: PREVIEW_MAX_WIDTH
  };
}

// ---------------------------------------------------------------------------
// أدوات لون ونص
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  return {
    r: parseInt(full.slice(1, 3), 16),
    g: parseInt(full.slice(3, 5), 16),
    b: parseInt(full.slice(5, 7), 16)
  };
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixColour(a, b, t) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  const channel = (from, to) => Math.round(from + (to - from) * t).toString(16).padStart(2, '0');
  return `#${channel(first.r, second.r)}${channel(first.g, second.g)}${channel(first.b, second.b)}`;
}

/** اللون المقروء فوق تعبئة ملوّنة — نفس قاعدة `readableOnDark` بلا أسود كامل. */
function readableOn(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? '#141a20' : '#ffffff';
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** قوس علوي للصورة (قوس السماء/شروق): مستطيل قاعدته مسطّحة وأعلاه نصف دائرة. */
function archPath(ctx, x, y, width, height) {
  const radius = width / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.arc(x + radius, y + radius, radius, Math.PI, 0, false);
  ctx.lineTo(x + width, y + height);
  ctx.closePath();
}

/** سطر نصّ عربي واحد، باتجاه RTL وبمحاذاة اختيارية. */
function drawLine(ctx, text, x, y, { font, colour, align = 'center', spacing = 0 }) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = font;
  // `wordSpacing` يعوّض ضيق فراغ الخط نفسه (ريم كوفي 0.13em مقابل 0.22em عند
  // القاهرة): بلا هذا تتراكب الكلمات في أسماء الأصحاب. يُقاس معه الالتفاف
  // والملاءمة، فالعرض المحسوب هو المعروض.
  ctx.wordSpacing = `${spacing}px`;
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * أكبر حجم من `sizes` يُلتفّ عنده النصّ في `maxLines` بلا قصّ — نفس منطق
 * `shareCard.fitHeroText` لكن بخطّ المتغيّر الذي اختاره المستخدم وبأحجام
 * القالب. يُعاد `{ fontSize, lines }`، والنصّ يُقصّ بـ«…» عند الأرضية وحدها.
 */
function fitText(ctx, text, { sizes, fontFor, spacingFor, maxWidth, maxLines }) {
  let chosen = null;
  for (const size of sizes) {
    ctx.font = fontFor(size);
    ctx.wordSpacing = `${spacingFor ? spacingFor(size) : 0}px`;
    const lines = wrapLines(ctx, text, maxWidth, Number.MAX_SAFE_INTEGER);
    if (lines.length > maxLines) {
      if (chosen) break;
      continue;
    }
    if (chosen && lines.length >= chosen.lines.length) break;
    chosen = { fontSize: size, lines };
  }
  if (chosen) return chosen;
  const floor = sizes[sizes.length - 1];
  ctx.font = fontFor(floor);
  ctx.wordSpacing = `${spacingFor ? spacingFor(floor) : 0}px`;
  return { fontSize: floor, lines: wrapLines(ctx, text, maxWidth, maxLines) };
}

// ---------------------------------------------------------------------------
// بيانات المناسبة كما ترسمها البطاقة
// ---------------------------------------------------------------------------

const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/**
 * `YYYY-MM-DD` → «15 مارس 2026». لا `new Date(value)` أبداً: تحليلها يعطي منتصف
 * ليل UTC، وعرضها بتوقيت محلي غرب غرينتش يُرجع اليوم يوماً — تاريخٌ في غير
 * يومه أسوأ من غيابه. (نفس سبب نسخة `share.routes.js`؛ لم تُستورد لأن قاعدة
 * الطبقات تمنع استيراد ملف مسارات في خدمة، والقائمة مغلقة في مكانين.)
 */
function formatArabicDate(value) {
  if (!value) return '';
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return '';
  return `${day} ${ARABIC_MONTHS[monthIndex]} ${match[1]}`;
}

/** «برنامج المناسبة» مجمّعاً تحت تاريخه — مجموعات `maxGroups` الأولى وحدها. */
function programGroups(days, maxGroups) {
  if (!Array.isArray(days) || !days.length) return [];
  const byDate = new Map();
  for (const day of days) {
    const key = String(day.day_date || '');
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(day);
  }
  return [...byDate.entries()].slice(0, Math.max(0, maxGroups)).map(([date, stops]) => ({
    date,
    stops: stops.slice(0, 3).map(day => {
      const parts = [day.name];
      if (day.day_time) parts.push(day.day_time);
      if (day.place) parts.push(day.place);
      return parts.filter(Boolean).join(' — ');
    })
  }));
}

/**
 * ما تحمله البطاقة من المناسبة: الأسماء، النوع، العائلة، التاريخ/الوقت،
 * المدينة/المكان، البرنامج. مصدره الصفّ الذي يقرأه `eventCards.service` — هذه
 * الدالة تنسّقه فقط، وكل ما يغيب يُطوى بلا سطر فارغ.
 */
function eventFacts(event, size) {
  const honorees = Array.isArray(event.honorees) ? event.honorees.filter(honoree => honoree && honoree.name) : [];
  const names = honorees.map(honoree => honoree.name).join(' و ');
  const details = [];
  const dateText = formatArabicDate(event.event_date);
  if (dateText) details.push({ label: 'التاريخ', value: dateText });
  if (event.dinner_time) details.push({ label: 'الوقت', value: String(event.dinner_time) });
  const place = [event.town, event.location_name].filter(Boolean).join(' — ');
  if (place) details.push({ label: 'المكان', value: place });
  const family = event.family_clan ? `عائلة ${event.family_clan}` : '';

  return {
    typeName: event.occasion_type_name || '',
    names: names || event.title || '',
    family,
    details: details.slice(0, size.maxDetailLines),
    program: programGroups(event.program_days, size.maxProgramGroups),
    isExpired: Boolean(event.is_expired)
  };
}

// ---------------------------------------------------------------------------
// الخلفيات والزخارف
// ---------------------------------------------------------------------------

/** تعبئة الأرضية: تدرّج رأسي بلونَي الخلفية، وكل قالب يبني عليه زخرفته. */
function drawBackground(ctx, width, height, theme) {
  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, theme.bg);
  wash.addColorStop(1, theme.bg2);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
}

/** إطار مزدوج حول القماش — للقوالب التي تحمله فقط. */
function drawFrame(ctx, width, height, theme, unit) {
  const inset = Math.round(unit * 26);
  const gap = Math.round(unit * 9);
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.accent, 0.75);
  ctx.lineWidth = Math.max(2, unit * 2.4);
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  ctx.strokeStyle = withAlpha(theme.accent, 0.35);
  ctx.lineWidth = Math.max(1, unit);
  ctx.strokeRect(inset + gap, inset + gap, width - (inset + gap) * 2, height - (inset + gap) * 2);

  // أربع علامات زوايا قصيرة — اصطلاح الدعوة المطبوعة.
  const markLength = unit * 34;
  ctx.strokeStyle = withAlpha(theme.accent, 0.9);
  ctx.lineWidth = Math.max(2, unit * 2);
  const corners = [
    [inset, inset, 1, 1],
    [width - inset, inset, -1, 1],
    [inset, height - inset, 1, -1],
    [width - inset, height - inset, -1, -1]
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * markLength);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * markLength, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** نجمة ثمانية الأطراف للزينة الشعبية (تراث النقب). */
function starPath(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * زخرفة القالب: كل مفتاح `decor` يرسم ما يميّزه خلف المحتوى، وندى ثابت
 * الرياضيات (لا عشوائية) كي تكون الصورة نفسها بكل مرة — الاختبار والفحص
 * البصري يعتمدان على ذلك.
 */
function drawOrnaments(ctx, width, height, theme, template, unit) {
  const accent = theme.accent;
  ctx.save();

  switch (template.decor) {
    case 'nocturne': {
      ctx.strokeStyle = withAlpha(accent, 0.12);
      ctx.lineWidth = Math.max(2, unit * 3);
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(width + unit * 60, unit * 120, (unit * 260) + i * unit * 120, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'ivory': {
      ctx.strokeStyle = withAlpha(accent, 0.22);
      ctx.lineWidth = Math.max(1, unit);
      ctx.strokeRect(unit * 58, unit * 58, width - unit * 116, height - unit * 116);
      break;
    }
    case 'sky': {
      ctx.strokeStyle = withAlpha(accent, 0.14);
      ctx.lineWidth = Math.max(2, unit * 3);
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.arc(0, height, (unit * 320) + i * unit * 150, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'rose': {
      ctx.save();
      ctx.fillStyle = withAlpha(accent, 0.12);
      ctx.translate(width / 2, height * 0.18);
      ctx.rotate(-0.22);
      ctx.fillRect(-width, -unit * 70, width * 2, unit * 140);
      ctx.restore();
      break;
    }
    case 'graphite': {
      // ماسة: مثلثان متقابلان بخطّ رفيع خلف منطقة الصورة.
      const cx = width / 2;
      const top = height * 0.2;
      const size = width * 0.34;
      ctx.strokeStyle = withAlpha(accent, 0.22);
      ctx.lineWidth = Math.max(1.5, unit * 1.6);
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx + size, top + size * 0.7);
      ctx.lineTo(cx, top + size * 1.4);
      ctx.lineTo(cx - size, top + size * 0.7);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'sand': {
      // شريط كوفي: مثلثات متكرّرة في الأعلى والأسفل.
      const step = unit * 54;
      ctx.fillStyle = withAlpha(accent, 0.18);
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, unit * 40);
        ctx.lineTo(x + step / 2, unit * 40 + step / 2);
        ctx.lineTo(x + step, unit * 40);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, height - unit * 40);
        ctx.lineTo(x + step / 2, height - unit * 40 - step / 2);
        ctx.lineTo(x + step, height - unit * 40);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = withAlpha(accent, 0.16);
      ctx.lineWidth = Math.max(1.5, unit * 1.6);
      // نجمة ثمانية صغيرة في الزاويتين السفليتين — زخرفة شعبية لا تعبر منطقة
      // النصّ (النجمة الكبيرة في وسط القماش كانت تُشبك سطور الأسماء).
      starPath(ctx, unit * 150, height - unit * 200, unit * 46, unit * 34);
      ctx.stroke();
      starPath(ctx, width - unit * 150, height - unit * 200, unit * 46, unit * 34);
      ctx.stroke();
      break;
    }
    case 'midnight': {
      // نجوم موزّعة بحساب ثابت (LCG بسيط) — لا عشوائية وقت التنفيذ.
      let seed = 20260301;
      const next = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let i = 0; i < 70; i += 1) {
        const x = next() * width;
        const y = next() * height;
        const radius = (0.6 + next() * 1.8) * unit;
        ctx.fillStyle = withAlpha(accent, 0.18 + next() * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'sunrise': {
      ctx.fillStyle = withAlpha(accent, 0.18);
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.42, width * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = withAlpha(accent, 0.28);
      ctx.lineWidth = Math.max(1.5, unit * 1.6);
      // الأفق أسفل المحتوى وفوق سطر الموقع: خطٌّ يعبر سطور البرنامج يقطعها.
      ctx.beginPath();
      ctx.moveTo(unit * 70, height - Math.round(height * 0.135));
      ctx.lineTo(width - unit * 70, height - Math.round(height * 0.135));
      ctx.stroke();
      break;
    }
    case 'classic': {
      ctx.strokeStyle = withAlpha(accent, 0.4);
      ctx.lineWidth = Math.max(1, unit);
      const inset = unit * 46;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
      ctx.strokeStyle = withAlpha(accent, 0.55);
      ctx.lineWidth = Math.max(1.5, unit * 1.4);
      [unit * 120, height - unit * 120].forEach(y => {
        ctx.beginPath();
        ctx.moveTo(width * 0.24, y);
        ctx.lineTo(width * 0.76, y);
        ctx.stroke();
      });
      break;
    }
    case 'carnival': {
      ctx.save();
      ctx.fillStyle = withAlpha(accent, 0.12);
      ctx.translate(width / 2, height * 0.1);
      ctx.rotate(-0.3);
      for (let i = -1; i <= 1; i += 1) {
        ctx.fillRect(-width, i * unit * 120, width * 2, unit * 46);
      }
      ctx.restore();
      break;
    }
    case 'quiet': {
      // خطّان رأسيان هادئان يحصران منطقة الاسم — بلا زخرفة تُقرأ احتفالاً.
      ctx.strokeStyle = withAlpha(accent, 0.28);
      ctx.lineWidth = Math.max(1, unit);
      [unit * 96, width - unit * 96].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, height * 0.34);
        ctx.lineTo(x, height * 0.66);
        ctx.stroke();
      });
      break;
    }
    case 'ash':
    default: {
      break;
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// الرسم
// ---------------------------------------------------------------------------

/**
 * رسم البطاقة كاملة. تُستدعى من `eventCards.service.js` (بالمعاينة والحفظ) ولا
 * تعرف شيئاً عن قاعدة البيانات: تستقبل الصفّ والصورة (Buffer) والاختيارات.
 *
 * `preview: true` يرسم على أبعاد المعاينة المصغّرة (`previewDimensions`) بنفس
 * الشكل والنسب — لا يُصغَّر PNG كامل بعد رسمه، لأن تصغير صورة 2480px إلى 480
 * يستهلك ذاكرة المقاس الكامل ويُنعّم الخطوط العربية.
 *
 * Returns: Buffer PNG.
 */
async function renderCard(options) {
  const {
    templateKey,
    sizeKey,
    fontKey,
    color,
    event,
    photo = null,
    preview = false
  } = options;

  const template = templateByKey(templateKey);
  if (!template) throw ApiError.badRequest('القالب المختار غير معروف');
  const size = sizeByKey(sizeKey);
  if (!size) throw ApiError.badRequest('مقاس البطاقة غير معروف');

  const chosenFont = fontByKey(fontKey);
  if (!chosenFont || !template.fonts.includes(fontKey)) {
    throw ApiError.badRequest('الخط المختار غير متاح لهذا القالب');
  }
  const accentChoice = template.colors.find(option => option.value.toLowerCase() === String(color || '').toLowerCase());
  if (!accentChoice) throw ApiError.badRequest('اللون المختار غير متاح لهذا القالب');

  const dimensions = preview ? previewDimensions(size) : { width: size.width, height: size.height };
  const width = dimensions.width;
  const height = dimensions.height;
  const unit = width / 1080;

  const palette = DECORS[template.decor] || DECORS.nocturne;
  const theme = { ...palette, accent: accentChoice.value };
  const fontRegular = `"${chosenFont.regularFamily}"`;
  const fontBold = `"${chosenFont.boldFamily}"`;
  // فراغ الكلمة بالبكسل لهذا الخط وحجمه — يُمرَّر لكل نصّ كي يُقاس المعروض نفسه.
  const spacingFor = sizeInPx => Math.round((chosenFont.wordSpacing || 0) * sizeInPx);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, width, height, theme);
  drawOrnaments(ctx, width, height, theme, template, unit);

  const facts = eventFacts(event || {}, size);
  const pad = Math.round(width * 0.085);
  const contentWidth = width - pad * 2;
  const chipHeight = unit * 52;

  // --- الشريحة العلوية: نوع المناسبة |
  const chipY = Math.round(height * 0.062);
  if (facts.typeName) {
    const chipSize = Math.round(unit * 26);
    const chipSpacing = spacingFor(chipSize);
    ctx.font = `700 ${chipSize}px ${fontBold}`;
    ctx.wordSpacing = `${chipSpacing}px`;
    const chipWidth = Math.min(contentWidth, ctx.measureText(facts.typeName).width + unit * 60);
    roundRect(ctx, width / 2 - chipWidth / 2, chipY, chipWidth, chipHeight, chipHeight / 2);
    ctx.fillStyle = withAlpha(theme.accent, 0.16);
    ctx.fill();
    ctx.strokeStyle = withAlpha(theme.accent, 0.55);
    ctx.lineWidth = Math.max(1, unit * 1.4);
    ctx.stroke();
    drawLine(ctx, facts.typeName, width / 2, chipY + chipHeight / 2 + unit * 2, {
      font: `700 ${chipSize}px ${fontBold}`,
      colour: theme.accent,
      spacing: chipSpacing
    });
  }

  // --- الصورة (إن وُجدت) |
  let photoBlockHeight = 0;
  let photoImage = null;
  if (photo) {
    try {
      photoImage = await loadImage(photo);
    } catch (err) {
      logger.warn(`[cardStudio] failed to decode card photo: ${err.message}`);
      photoImage = null;
    }
  }
  const photoWidth = Math.round(contentWidth * 0.86);
  // علبة الصورة تتّسع للصورة الطولية (ملصق مناسبة مثلاً) إلى حدّ النسبة
  // المعلنة للمقاس، فلا تُحصر في شريط أفقي ضيّق تُترك فيه فراغات جانبية.
  const maxPhotoHeight = Math.min(height * size.photoRatio, contentWidth * 1.15);
  let photoHeight = 0;
  if (photoImage) {
    const ratio = photoImage.width / photoImage.height;
    photoHeight = Math.round(Math.max(maxPhotoHeight * 0.5, Math.min(maxPhotoHeight, photoWidth / ratio)));
  } else {
    photoHeight = Math.round(maxPhotoHeight);
  }
  const photoGap = Math.round(unit * 44);
  if (photoImage) photoBlockHeight = photoHeight + photoGap;

  // --- الهيرو: الأسماء — |
  const nameSizes = [86, 76, 68, 60, 52].map(value => Math.round(value * unit));
  const nameFit = fitText(ctx, facts.names, {
    sizes: nameSizes,
    fontFor: value => `700 ${value}px ${fontBold}`,
    spacingFor,
    maxWidth: contentWidth,
    maxLines: 2
  });
  const nameLineHeight = Math.round(nameFit.fontSize * 1.22);
  const nameBlockHeight = nameFit.lines.length * nameLineHeight;

  // --- بقية المحتوى في تدفّق واحد: العائلة، فاصل، سطور التفاصيل، البرنامج ---
  const familyHeight = facts.family ? Math.round(unit * 52) : 0;
  const dividerHeight = Math.round(unit * 46);
  const detailLineHeight = Math.round(unit * 54);
  const detailHeight = facts.details.length ? facts.details.length * detailLineHeight + unit * 12 : 0;
  const programGroupHeight = Math.round(unit * 96);
  const programHeight = facts.program.length ? facts.program.length * programGroupHeight + unit * 20 : 0;

  const blocks = [];
  if (photoImage) {
    blocks.push({
      height: photoBlockHeight,
      draw: top => {
        const x = width / 2 - photoWidth / 2;
        const style = template.photoStyle;
        const clipPhoto = () => {
          if (style === 'arch') archPath(ctx, x, top, photoWidth, photoHeight);
          else if (style === 'sharp') {
            ctx.beginPath();
            ctx.rect(x, top, photoWidth, photoHeight);
          } else {
            roundRect(ctx, x, top, photoWidth, photoHeight, style === 'rounded' ? unit * 26 : unit * 6);
          }
        };

        ctx.save();
        clipPhoto();
        ctx.clip();

        // ١. تعبئة الصورة نفسها، مقصوصةً لتغطية العلبة ومموّهة: ما يتبقّى حول
        //    الصورة الكاملة ليس فراغاً مسطّحاً بل لونها هي (نفس فكرة
        //    drawHero في shareCard.service.js، بمقياس هذه البطاقة).
        const ratio = photoImage.width / photoImage.height;
        const boxRatio = photoWidth / photoHeight;
        const bleed = Math.round(unit * 40);
        let coverWidth;
        let coverHeight;
        if (ratio > boxRatio) {
          coverHeight = photoHeight + bleed * 2;
          coverWidth = coverHeight * ratio;
        } else {
          coverWidth = photoWidth + bleed * 2;
          coverHeight = coverWidth / ratio;
        }
        ctx.save();
        ctx.filter = `blur(${Math.round(unit * 30)}px)`;
        ctx.drawImage(photoImage, x + (photoWidth - coverWidth) / 2, top + (photoHeight - coverHeight) / 2, coverWidth, coverHeight);
        ctx.restore();
        ctx.fillStyle = withAlpha(theme.bg, 0.35);
        ctx.fillRect(x, top, photoWidth, photoHeight);

        // ٢. الصورة **كاملة** فوقه بلا قصّ: ملصق الدعوة قد يحمل تاريخه ومكانه،
        //    وقصّه يمحو ما جاء ليقوله.
        let drawWidth = photoWidth;
        let drawHeight = photoHeight;
        if (ratio > boxRatio) drawHeight = photoWidth / ratio;
        else drawWidth = photoHeight * ratio;
        ctx.drawImage(photoImage, x + (photoWidth - drawWidth) / 2, top + (photoHeight - drawHeight) / 2, drawWidth, drawHeight);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = withAlpha(theme.accent, 0.55);
        ctx.lineWidth = Math.max(1.5, unit * 2);
        clipPhoto();
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  blocks.push({
    height: nameBlockHeight,
    draw: top => {
      let y = top + nameLineHeight / 2;
      for (const line of nameFit.lines) {
        drawLine(ctx, line, width / 2, y, {
          font: `700 ${nameFit.fontSize}px ${fontBold}`,
          colour: theme.ink,
          spacing: spacingFor(nameFit.fontSize)
        });
        y += nameLineHeight;
      }
    }
  });

  if (facts.family) {
    blocks.push({
      height: familyHeight,
      draw: top => drawLine(ctx, facts.family, width / 2, top + familyHeight / 2, {
        font: `${Math.round(unit * 30)}px ${fontRegular}`,
        colour: theme.soft,
        spacing: spacingFor(Math.round(unit * 30))
      })
    });
  }

  blocks.push({
    height: dividerHeight,
    draw: top => {
      const y = top + dividerHeight / 2;
      ctx.save();
      ctx.strokeStyle = withAlpha(theme.accent, 0.7);
      ctx.lineWidth = Math.max(1.5, unit * 2);
      ctx.beginPath();
      ctx.moveTo(width / 2 - unit * 90, y);
      ctx.lineTo(width / 2 - unit * 18, y);
      ctx.moveTo(width / 2 + unit * 18, y);
      ctx.lineTo(width / 2 + unit * 90, y);
      ctx.stroke();
      ctx.fillStyle = withAlpha(theme.accent, 0.9);
      starPath(ctx, width / 2, y, unit * 14, unit * 7);
      ctx.fill();
      ctx.restore();
    }
  });

  if (facts.details.length) {
    blocks.push({
      height: detailHeight,
      draw: top => {
        let y = top + detailLineHeight / 2;
        for (const detail of facts.details) {
          drawLine(ctx, detail.value, width / 2, y, {
            font: `${Math.round(unit * 31)}px ${fontRegular}`,
            colour: theme.soft,
            spacing: spacingFor(Math.round(unit * 31))
          });
          y += detailLineHeight;
        }
      }
    });
  }

  if (facts.program.length) {
    blocks.push({
      height: programHeight,
      draw: top => {
        let y = top + unit * 30;
        for (const group of facts.program) {
          const dateText = formatArabicDate(group.date);
          if (dateText) {
            drawLine(ctx, dateText, width / 2, y, {
              font: `700 ${Math.round(unit * 26)}px ${fontBold}`,
              colour: theme.accent,
              spacing: spacingFor(Math.round(unit * 26))
            });
            y += unit * 40;
          }
          for (const stop of group.stops) {
            drawLine(ctx, stop, width / 2, y, {
              font: `${Math.round(unit * 25)}px ${fontRegular}`,
              colour: theme.soft,
              spacing: spacingFor(Math.round(unit * 25))
            });
            y += unit * 34;
          }
          y += unit * 16;
        }
      }
    });
  }

  const totalHeight = blocks.reduce((sum, block) => sum + block.height, 0);
  const footerZone = Math.round(height * 0.11);
  const topBound = chipY + chipHeight + Math.round(unit * 30);
  const bottomBound = height - footerZone;
  let cursor = topBound + Math.max(0, (bottomBound - topBound - totalHeight) / 2);
  for (const block of blocks) {
    block.draw(cursor);
    cursor += block.height;
  }

  // --- شارة «انتهت» (المناسبة المنقضية) في زاوية القماش |
  if (facts.isExpired) {
    const label = 'انتهت';
    const badgeFont = `700 ${Math.round(unit * 22)}px ${fontBold}`;
    ctx.font = badgeFont;
    const badgeWidth = ctx.measureText(label).width + unit * 44;
    const badgeHeight = unit * 40;
    const x = pad;
    const y = chipY + (chipHeight - badgeHeight) / 2;
    roundRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2);
    ctx.fillStyle = withAlpha(theme.bg, 0.85);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = Math.max(1, unit);
    ctx.stroke();
    drawLine(ctx, label, x + badgeWidth / 2, y + badgeHeight / 2 + unit, {
      font: badgeFont,
      colour: theme.faint,
      spacing: spacingFor(Math.round(unit * 22))
    });
  }

  // --- سطر الموقع أسفل البطاقة: العلامة والنصّ مجموعة واحدة توسّط القماش |
  const wordmark = (PALETTES[toneOfTemplate(template)].wordmark) || 'اعراسنا';
  const footerText = `${wordmark} · التفاصيل في التطبيق`;
  const footerFont = `600 ${Math.round(unit * 26)}px ${fontBold}`;
  const footerSpacing = spacingFor(Math.round(unit * 26));
  ctx.font = footerFont;
  ctx.wordSpacing = `${footerSpacing}px`;
  const footerTextWidth = ctx.measureText(footerText).width;
  const markSize = unit * 40;
  const markGap = unit * 14;
  const footerY = height - footerZone / 2;
  const groupRight = width / 2 + (markSize + markGap + footerTextWidth) / 2;
  drawBrandMark(ctx, groupRight - markSize, footerY - markSize / 2, markSize);
  drawLine(ctx, footerText, groupRight - markSize - markGap, footerY + unit * 2, {
    font: footerFont,
    colour: withAlpha(theme.accent, 0.95),
    align: 'right',
    spacing: footerSpacing
  });

  if (theme.frame) drawFrame(ctx, width, height, theme, unit);

  return canvas.toBuffer('image/png');
}

/** نبرة القالب → لوحة `shareTheme` (اسم الموقع، ولون الشارة) الموجودة. */
function toneOfTemplate(template) {
  return template.tone === 'solemn' ? 'solemn' : 'festive';
}

module.exports = {
  CARD_TEMPLATES,
  CARD_SIZES,
  CARD_FONTS,
  PREVIEW_MAX_WIDTH,
  availableFonts,
  templatesForTone,
  templateByKey,
  sizeByKey,
  previewDimensions,
  catalog,
  programGroups,
  formatArabicDate,
  renderCard
};
