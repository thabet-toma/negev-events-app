'use strict';

/**
 * يولّد كل أيقونات العلامة من تعريف واحد — خاتم «عرس» الذهبي المحزَّز (‏#99).
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
 *   docs/brand/           — لقطة أساس فحص الانحراف البصري
 *
 * ولا يلمس شيئاً آخر. تشغيله متكرّراً آمن: يستبدل الملفات نفسها بالمحتوى نفسه.
 * `require`-ه (كما يفعل test/web-dom.test.js) لا يكتب شيئاً — الكتابة كلها
 * خلف `require.main === module` في ذيل الملف.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const {
  GROUND,
  MARK,
  GOLD_DEEP,
  GOLD_MID,
  GOLD_HI,
  BRIGHT_EDGE,
  WORD_INK,
  GOLD_GRADIENT,
  goldGradient,
  buildMarkParts,
  markScale,
  shapeToSvgD
} = require('../src/utils/brandMark');

const REPO = path.join(__dirname, '..', '..');

GlobalFonts.registerFromPath(path.join(__dirname, '../src/assets/fonts/Cairo-Bold.ttf'), 'CairoBold');

// ---------------------------------------------------------------------------
// الرسم على القماش
// ---------------------------------------------------------------------------

/** يبني مسار جزء واحد على القماش، بلا ملء — القاعدة نفسها يُبنى عليها ملء الشكل بلون وحذف بكسله معاً. */
function tracePart(ctx, part, u) {
  ctx.beginPath();
  if (part.shape.type === 'annulus') {
    const { cx, cy, rIn, rOut } = part.shape;
    ctx.arc(cx * u, cy * u, rOut * u, 0, Math.PI * 2, false);
    ctx.arc(cx * u, cy * u, rIn * u, 0, Math.PI * 2, true);
  } else {
    part.shape.commands.forEach(([type, ...args]) => {
      if (type === 'M') ctx.moveTo(args[0] * u, args[1] * u);
      else if (type === 'L') ctx.lineTo(args[0] * u, args[1] * u);
      else if (type === 'Q') ctx.quadraticCurveTo(args[0] * u, args[1] * u, args[2] * u, args[3] * u);
      else if (type === 'C') ctx.bezierCurveTo(args[0] * u, args[1] * u, args[2] * u, args[3] * u, args[4] * u, args[5] * u);
      else if (type === 'Z') ctx.closePath();
    });
  }
}

function drawShapesOnCanvas(ctx, parts, u, size) {
  parts.forEach(part => {
    if (part.fill === 'band') ctx.fillStyle = goldGradient(ctx, size);
    else if (part.fill === 'bright') ctx.fillStyle = BRIGHT_EDGE;
    else if (part.fill === 'bezel') ctx.fillStyle = GOLD_HI;
    else if (part.fill === 'engrave') ctx.fillStyle = GOLD_DEEP;
    else if (part.fill === 'floret') ctx.fillStyle = GOLD_MID;
    else if (part.fill === 'word') ctx.fillStyle = WORD_INK;
    else if (part.fill === 'ground') ctx.fillStyle = GROUND;
    else ctx.fillStyle = MARK;

    tracePart(ctx, part, u);
    ctx.fill();
  });
}

function drawRingMark(ctx, size, { safeZone, detail = 'full' }) {
  const u = size / 100;
  const scale = markScale(safeZone);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-size / 2, -size / 2);

  drawShapesOnCanvas(ctx, buildMarkParts(detail), u, size);

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
  drawRingMark(ctx, size, { safeZone, detail });
  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// SVG — يُبنى من نفس `buildMarkParts`، لا يُكتب يدوياً أبداً
// ---------------------------------------------------------------------------

/** نسخة متّجهة للفافيكون — تكبر بلا حدّ ووزنها بضع مئات بايت، مبنيّة من نفس `buildMarkParts` تماماً كالقماش. */
function buildIconSvg(detail, safeZone) {
  const parts = buildMarkParts(detail);
  const scale = markScale(safeZone);
  const bandD = parts.filter(p => p.fill === 'band').map(p => shapeToSvgD(p.shape)).join(' ');
  const engraveD = parts.filter(p => p.fill === 'engrave').map(p => shapeToSvgD(p.shape)).join(' ');
  const brightD = parts.filter(p => p.fill === 'bright').map(p => shapeToSvgD(p.shape)).join(' ');
  const bezelD = parts.filter(p => p.fill === 'bezel').map(p => shapeToSvgD(p.shape)).join(' ');
  const floretD = parts.filter(p => p.fill === 'floret').map(p => shapeToSvgD(p.shape)).join(' ');
  const wordD = parts.filter(p => p.fill === 'word').map(p => shapeToSvgD(p.shape)).join(' ');

  const stops = GOLD_GRADIENT.stops.map(s =>
    `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`
  ).join('\n      ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="أعراسنا">
  <defs>
    <linearGradient id="gold-grad" x1="${GOLD_GRADIENT.x1 * 100}%" y1="${GOLD_GRADIENT.y1 * 100}%" x2="${GOLD_GRADIENT.x2 * 100}%" y2="${GOLD_GRADIENT.y2 * 100}%">
      ${stops}
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="${GROUND}"/>
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    ${bandD ? `<path d="${bandD}" fill="url(#gold-grad)"/>\n    ` : ''}${engraveD ? `<path d="${engraveD}" fill="${GOLD_DEEP}"/>\n    ` : ''}${brightD ? `<path d="${brightD}" fill="${BRIGHT_EDGE}"/>\n    ` : ''}${bezelD ? `<path d="${bezelD}" fill="${GOLD_HI}"/>\n    ` : ''}${floretD ? `<path d="${floretD}" fill="${GOLD_MID}"/>\n    ` : ''}${wordD ? `<path d="${wordD}" fill="${WORD_INK}"/>\n    ` : ''}</g>
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
 * يولّد لقطة مرجع العلامة البصري لـ docs/brand/mark-current-from-code.png
 * كما يحددها docs/brand/README.md: النسختان full و icon مع مقاسات حقيقية غير مكبرة.
 */
async function generateReferenceImage() {
  const S_CANVAS_W = 1100;
  const topPad = 40;
  const heroSize = 420;
  const heroGap = 60;
  const heroLabelPad = 30;
  const heroLabelSize = 20;

  const heroBottom = topPad + heroSize;
  const heroLabelY = heroBottom + heroLabelPad;

  // صف المقاسات الحقيقية — تشترك في سطر أساس واحد ومسافات متساوية
  const sampleSizes = [48, 96, 192];
  const sampleGap = 48; // مسافة متساوية بين العينات
  const maxSampleSize = Math.max(...sampleSizes);
  const sampleRowPadTop = 50;

  const samplesBaselineY = heroLabelY + heroLabelSize + sampleRowPadTop + maxSampleSize;
  const labelPadTop = 26;
  const labelY = samplesBaselineY + labelPadTop;
  const bottomPad = 40;

  // اشتقاق ارتفاع اللوحة ديناميكياً من أبعاد العناصر
  const S_CANVAS_H = labelY + bottomPad;

  const canvas = createCanvas(S_CANVAS_W, S_CANVAS_H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S_CANVAS_W, S_CANVAS_H);

  // المعاينتان الكبيرتان
  const heroLeftX = 40;
  const heroRightX = heroLeftX + heroSize + heroGap;

  const full420 = await loadImage(renderIcon(heroSize, { detail: 'full', safeZone: false }));
  ctx.drawImage(full420, heroLeftX, topPad);

  const icon420 = await loadImage(renderIcon(heroSize, { detail: 'icon', safeZone: true }));
  ctx.drawImage(icon420, heroRightX, topPad);

  ctx.fillStyle = '#222222';
  ctx.font = `${heroLabelSize}px CairoBold`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('full — الأسطح الكبيرة', heroLeftX + heroSize / 2, heroLabelY);
  ctx.fillText('icon + safeZone — أيقونة التطبيق', heroRightX + heroSize / 2, heroLabelY);

  // رسم عينات المقاسات الحقيقية الثلاث على سطر أساس موحّد مع تسمياتها
  let curX = 60;
  ctx.font = '15px CairoBold';
  ctx.fillStyle = '#222222';

  for (const s of sampleSizes) {
    const img = await loadImage(renderIcon(s, { detail: 'icon', safeZone: false }));
    const imgY = samplesBaselineY - s;
    ctx.drawImage(img, curX, imgY);

    ctx.textAlign = 'center';
    ctx.fillText(`${s}px`, curX + s / 2, labelY);

    curX += s + sampleGap;
  }

  // سطر التوضيح على اليمين مع سهم موجه
  const arrowX = curX + 30;
  const arrowY = samplesBaselineY - maxSampleSize / 2;

  ctx.font = '16px CairoBold';
  ctx.textAlign = 'left';
  ctx.fillText('مقاسات حقيقية غير مكبَّرة', arrowX + 25, arrowY + 5);

  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(arrowX + 15, arrowY);
  ctx.lineTo(arrowX, arrowY);
  ctx.lineTo(arrowX + 6, arrowY - 5);
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(arrowX + 6, arrowY + 5);
  ctx.stroke();

  const outPath = path.join(REPO, 'docs', 'brand', 'mark-current-from-code.png');
  const pngBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`  docs/brand/mark-current-from-code.png  (${Math.round(pngBuffer.length / 1024)} KB)`);
}

/**
 * قاعدة اختيار الطبقة — **بالغرض لا بمقاس الملف**.
 *
 * كل أيقونة يعرضها النظام **أيقونةَ تطبيق** (شاشة رئيسية، مشغّل، لسان متصفّح)
 * تأخذ `'icon'` مهما كان مقاس الملف، لأن النظام يصغّرها عند العرض: ملف ‎١٨٠px‎
 * يظهر على شاشة آيفون بنحو ‎٦٠px‎، وعندها تسقط الخطوط المحفورة الدقيقة والزهرتان
 * ويُنصَّف عدد الحزوز — وهو العطل الذي وُجدت الطبقتان لمنعه.
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

async function main() {
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
  // المبسَّطة بحكم القاعدة أعلى `WEB_ICONS`. ملف ‎٢٠px‎ بكامل تفاصيل الحفر والزخرفة
  // رذاذٌ لا علامة.
  console.log('\nmobile/ios — أيقونات التطبيق مبسَّطة، وصورة المتجر ١٠٢٤ وحدها بكامل التفصيل');
  IOS_ICONS.forEach(([filename, size]) => {
    const detail = size >= 1024 ? 'full' : 'icon';
    write(`mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/${filename}`, renderIcon(size, { detail }));
  });

  console.log('\ndocs/brand — لقطة أساس فحص الانحراف البصري');
  await generateReferenceImage();

  console.log('\nتمّ.');
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { drawRingMark, renderIcon, buildIconSvg, tracePart };
