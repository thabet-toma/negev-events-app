'use strict';

/**
 * يولّد كل أيقونات العلامة من تعريف واحد — «بيت الشَّعَر» (‏#56).
 *
 * الأيقونات صور ثنائية، ولو دخلت المستودع مرسومة يدوياً لصارت غير قابلة
 * لإعادة التوليد: أي تعديل على العلامة يعني إعادة رسم ٢٥ ملفاً بيدك. هندسة
 * العلامة نفسها (‏`buildMarkParts` وما تحته) معرَّفة مرة واحدة في
 * `server/src/utils/brandMark.js` — لا هنا — لأن طبقة المسارات
 * (`share.routes.js`) وخدمة بطاقة المشاركة تحتاجانها أيضاً، ولا يجوز لـ
 * `server/src/` أن يستدعي `server/scripts/` (أداة تشغيل تنفّذ عملاً حقيقياً
 * عند التحميل). هذا الملف يستهلك تلك الهندسة ويضيف عليها ما هو من اختصاصه
 * فقط: الرسم على القماش بكل مقاس، وقالب SVG، وجداول ملفات الإخراج، والكتابة
 * الفعلية.
 *
 *   node scripts/brand-icons.js          (من داخل server/)
 *
 * يكتب إلى ثلاثة أماكن:
 *   web/icons/            — فافيكون، apple-touch-icon، وأيقونات PWA
 *   mobile/android/.../mipmap-*   — أيقونة الأندرويد
 *   mobile/ios/.../AppIcon.appiconset — أيقونة iOS
 *
 * ولا يلمس شيئاً آخر. تشغيله متكرّراً آمن: يستبدل الملفات نفسها بالمحتوى نفسه.
 * `require`-ه (كما يفعل test/web-dom.test.js) لا يكتب شيئاً — الكتابة كلها
 * خلف `require.main === module` في ذيل الملف.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { GROUND, MARK, buildMarkParts, markScale, partsToSvgPaths } = require('../src/utils/brandMark');

const REPO = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// الرسم على القماش
// ---------------------------------------------------------------------------

/** يبني مسار جزء واحد على القماش، بلا ملء — القاعدة نفسها يُبنى عليها ملء الشكل بلون وحذف بكسله معاً. */
function tracePart(ctx, part, u) {
  ctx.beginPath();
  if (part.shape.type === 'circle') {
    ctx.arc(part.shape.cx * u, part.shape.cy * u, part.shape.r * u, 0, Math.PI * 2);
  } else {
    part.shape.commands.forEach(([type, ...args]) => {
      if (type === 'M') ctx.moveTo(args[0] * u, args[1] * u);
      else if (type === 'L') ctx.lineTo(args[0] * u, args[1] * u);
      else if (type === 'Q') ctx.quadraticCurveTo(args[0] * u, args[1] * u, args[2] * u, args[3] * u);
      else if (type === 'Z') ctx.closePath();
    });
  }
}

function drawShapesOnCanvas(ctx, parts, u) {
  ['mark', 'ground'].forEach(fillKind => {
    ctx.fillStyle = fillKind === 'mark' ? MARK : GROUND;
    parts.filter(p => p.fill === fillKind).forEach(part => {
      tracePart(ctx, part, u);
      ctx.fill();
    });
  });
}

function drawTent(ctx, size, { safeZone, detail = 'full' }) {
  const u = size / 100;
  const scale = markScale(safeZone);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-size / 2, -size / 2);

  drawShapesOnCanvas(ctx, buildMarkParts(detail), u);

  ctx.restore();
}

/**
 * أيقونة كاملة: أرضية مصمتة ثم العلامة.
 *
 * الأرضية مصمتة لا شفّافة عمداً — iOS يرفض الشفافية في أيقونة التطبيق، وأندرويد
 * يرسم خلفها أبيض فتظهر العلامة على لون لم يُختَر.
 */
function renderIcon(size, { safeZone = false, detail = 'full' } = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, size, size);
  drawTent(ctx, size, { safeZone, detail });
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// SVG — يُبنى من نفس `buildMarkParts`، لا يُكتب يدوياً أبداً
// ---------------------------------------------------------------------------

/** نسخة متّجهة للفافيكون — تكبر بلا حدّ ووزنها بضع مئات بايت، مبنيّة من نفس `buildMarkParts` تماماً كالقماش. */
function buildIconSvg(detail, safeZone) {
  const { markD, groundD } = partsToSvgPaths(buildMarkParts(detail));
  const scale = markScale(safeZone);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="أعراسنا">
  <rect width="100" height="100" rx="22" fill="${GROUND}"/>
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    <path d="${markD}" fill="${MARK}"/>
    <path d="${groundD}" fill="${GROUND}"/>
  </g>
</svg>
`;
}

// favicon.svg يشغل نفس دور favicon-32.png: تفصيل 'icon' بلا منطقة آمنة (نفس مقياس ١٫١٤)
const ICON_SVG = buildIconSvg('icon', false);

function write(relativePath, buffer) {
  const target = path.join(REPO, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  console.log(`  ${relativePath}  (${Math.round(buffer.length / 1024)} KB)`);
}

/**
 * قاعدة اختيار الطبقة — **بالغرض لا بمقاس الملف**.
 *
 * كل أيقونة يعرضها النظام **أيقونةَ تطبيق** (شاشة رئيسية، مشغّل، لسان متصفّح)
 * تأخذ `'icon'` مهما كان مقاس الملف، لأن النظام يصغّرها عند العرض: ملف ‎١٨٠px‎
 * يظهر على شاشة آيفون بنحو ‎٦٠px‎، وعندها تختفي لمبات الطوق الصغيرة وحبال الشدّ
 * وتصير رذاذاً — وهو العطل الذي وُجدت الطبقتان لمنعه.
 *
 * ولا يأخذ `'full'` إلا ما يُعرض **بحجمه الكبير فعلاً**: صورة المتجر (‏١٠٢٤‎)
 * وأصل الـPWA الكبير المستعمَل في شاشة التثبيت والإقلاع.
 */
const WEB_ICONS = [
  ['web/icons/favicon-32.png', 32, { detail: 'icon' }],
  ['web/icons/apple-touch-icon.png', 180, { detail: 'icon' }],
  ['web/icons/icon-192.png', 192, { detail: 'icon' }],
  ['web/icons/icon-512.png', 512, { detail: 'full' }],
  ['web/icons/icon-maskable-512.png', 512, { safeZone: true, detail: 'icon' }]
];

const ANDROID_ICONS = [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]
];

/** المقاسات كما يسمّيها `AppIcon.appiconset/Contents.json` حرفياً. */
const IOS_ICONS = [
  ['Icon-App-20x20@1x.png', 20], ['Icon-App-20x20@2x.png', 40], ['Icon-App-20x20@3x.png', 60],
  ['Icon-App-29x29@1x.png', 29], ['Icon-App-29x29@2x.png', 58], ['Icon-App-29x29@3x.png', 87],
  ['Icon-App-40x40@1x.png', 40], ['Icon-App-40x40@2x.png', 80], ['Icon-App-40x40@3x.png', 120],
  ['Icon-App-60x60@2x.png', 120], ['Icon-App-60x60@3x.png', 180],
  ['Icon-App-76x76@1x.png', 76], ['Icon-App-76x76@2x.png', 152],
  ['Icon-App-83.5x83.5@2x.png', 167],
  ['Icon-App-1024x1024@1x.png', 1024]
];

if (require.main === module) {
  console.log('web/');
  fs.mkdirSync(path.join(REPO, 'web', 'icons'), { recursive: true });
  fs.writeFileSync(path.join(REPO, 'web', 'icons', 'icon.svg'), ICON_SVG, 'utf8');
  console.log('  web/icons/icon.svg');
  WEB_ICONS.forEach(([target, size, options]) => write(target, renderIcon(size, options)));

  console.log('\nmobile/android — أندرويد يقصّ الأيقونة بأشكال مختلفة، فكلها بالمنطقة الآمنة وبالتفصيل المبسَّط');
  ANDROID_ICONS.forEach(([density, size]) => {
    write(`mobile/android/app/src/main/res/mipmap-${density}/ic_launcher.png`, renderIcon(size, { safeZone: true, detail: 'icon' }));
  });

  // iOS يقصّ بزواياه هو (لا منطقة آمنة دائرية)، لكن كل هذه الملفات — عدا صورة
  // المتجر ‎١٠٢٤‎ — أيقونةُ تطبيق تُعرض صغيرة على الشاشة الرئيسية، فتأخذ الطبقة
  // المبسَّطة بحكم القاعدة أعلى `WEB_ICONS`. ملف ‎٢٠px‎ بطوق ٢٨ لمبة وحبال شدّ
  // رذاذٌ لا علامة.
  console.log('\nmobile/ios — أيقونات التطبيق مبسَّطة، وصورة المتجر ١٠٢٤ وحدها بكامل التفصيل');
  IOS_ICONS.forEach(([filename, size]) => {
    const detail = size >= 1024 ? 'full' : 'icon';
    write(`mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/${filename}`, renderIcon(size, { detail }));
  });

  console.log('\nتمّ.');
}

module.exports = { drawTent, renderIcon, buildIconSvg };
