'use strict';

/**
 * يولّد كل أيقونات العلامة من تعريف واحد — «بيت الشَّعَر» (‏#56).
 *
 * الأيقونات صور ثنائية، ولو دخلت المستودع مرسومة يدوياً لصارت غير قابلة
 * لإعادة التوليد: أي تعديل على العلامة يعني إعادة رسم ٢٦ ملفاً بيدك. هذا
 * السكربت هو مصدر الحقيقة بدلاً منها — العلامة معرَّفة مرة واحدة في
 * `drawTent` أدناه، وكل مقاس مشتقّ منها.
 *
 *   node scripts/brand-icons.js          (من داخل server/)
 *
 * يكتب إلى ثلاثة أماكن:
 *   web/icons/            — فافيكون، apple-touch-icon، وأيقونات PWA
 *   mobile/android/.../mipmap-*   — أيقونة الأندرويد
 *   mobile/ios/.../AppIcon.appiconset — أيقونة iOS
 *
 * ولا يلمس شيئاً آخر. تشغيله متكرّراً آمن: يستبدل الملفات نفسها بالمحتوى نفسه.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const REPO = path.join(__dirname, '..', '..');

/**
 * ألوان العلامة.
 *
 * الأرضية `--ink` من لوحة الموقع نفسها (`web/styles.css`) — كحليّ شديد القتامة،
 * وهو اللون الذي يقرأه العين شعرَ الماعز الأسود الذي تُنسج منه الخيمة فعلاً.
 * والعلامة رمليّة دافئة مشتقّة من `--gold` (‏#8f6a20) بعد رفع إضاءتها لتُقرأ على
 * أرضية داكنة — نفس المنطق الذي تطبّقه `readableOnDark` في `shareCard.service.js`،
 * لا لون مخترَع من خارج اللوحة.
 */
const GROUND = '#0c1b2a';
const MARK = '#e3c08a';

/**
 * بيت الشَّعَر: ثلاثة أعمدة وسقف متهدّل بينها.
 *
 * الإحداثيات في مربّع ١٠٠ وحدة. أبعد نقطة عن المركز هي طرف القاعدة
 * (‏±٣٦، +١٦) أي على بُعد ٣٩٫٤ وحدة — تحت نصف قطر المنطقة الآمنة للقناع
 * (‏٤٠ وحدة، أي ٨٠٪ من الأيقونة)، فالعلامة تنجو من القصّ الدائري على أندرويد.
 *
 * ثلاثة أشياء تفصل بيت الشَّعَر عن سلسلة جبال، وكلها مقصودة هنا:
 *   • **التهدّل ضحل** — نقاط التحكّم عند ٤٧ بينما وتر المنحنى عند ٣٩٫٥، أي
 *     نزول ٣٫٧٥ وحدة لا أكثر. المحاولة الأولى هدّلت إلى ٦٠ فصارت الأيقونة
 *     ثلاث قمم وواديين.
 *   • **الأضلاع مستقيمة مشدودة** لا منحنية — حبال الشدّ تنزل من العمود إلى
 *     الوتد في خطّ واحد.
 *   • **القاعدة مسطّحة والنسبة واطئة** — عرض ٧٢ وحدة في ارتفاع ٣١، فالشكل
 *     يمتدّ لا يرتفع. الجبل يرتفع، والخيمة تمتدّ.
 */
function drawTent(ctx, size, { safeZone }) {
  const u = size / 100;
  const scale = safeZone ? 1 : 1.14;

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-size / 2, -size / 2);

  ctx.fillStyle = MARK;
  ctx.beginPath();
  ctx.moveTo(14 * u, 66 * u);
  ctx.lineTo(28 * u, 44 * u);
  ctx.quadraticCurveTo(39 * u, 47 * u, 50 * u, 35 * u);
  ctx.quadraticCurveTo(61 * u, 47 * u, 72 * u, 44 * u);
  ctx.lineTo(86 * u, 66 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * أيقونة كاملة: أرضية مصمتة ثم العلامة.
 *
 * الأرضية مصمتة لا شفّافة عمداً — iOS يرفض الشفافية في أيقونة التطبيق، وأندرويد
 * يرسم خلفها أبيض فتظهر العلامة على لون لم يُختَر.
 */
function renderIcon(size, { safeZone = false } = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, size, size);
  drawTent(ctx, size, { safeZone });
  return canvas.toBuffer('image/png');
}

function write(relativePath, buffer) {
  const target = path.join(REPO, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  console.log(`  ${relativePath}  (${Math.round(buffer.length / 1024)} KB)`);
}

/** نسخة متّجهة للفافيكون — تكبر بلا حدّ ووزنها بضع مئات بايت. */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="مناسبات النقب">
  <rect width="100" height="100" rx="22" fill="${GROUND}"/>
  <path d="M14 66 L28 44 Q39 47 50 35 Q61 47 72 44 L86 66 Z" fill="${MARK}"/>
</svg>
`;

const WEB_ICONS = [
  ['web/icons/favicon-32.png', 32, {}],
  ['web/icons/apple-touch-icon.png', 180, {}],
  ['web/icons/icon-192.png', 192, {}],
  ['web/icons/icon-512.png', 512, {}],
  ['web/icons/icon-maskable-512.png', 512, { safeZone: true }]
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

console.log('web/');
fs.mkdirSync(path.join(REPO, 'web', 'icons'), { recursive: true });
fs.writeFileSync(path.join(REPO, 'web', 'icons', 'icon.svg'), ICON_SVG, 'utf8');
console.log('  web/icons/icon.svg');
WEB_ICONS.forEach(([target, size, options]) => write(target, renderIcon(size, options)));

console.log('\nmobile/android — أندرويد يقصّ الأيقونة بأشكال مختلفة، فكلها بالمنطقة الآمنة');
ANDROID_ICONS.forEach(([density, size]) => {
  write(`mobile/android/app/src/main/res/mipmap-${density}/ic_launcher.png`, renderIcon(size, { safeZone: true }));
});

console.log('\nmobile/ios — iOS يقصّ بزواياه هو، والعلامة تملأ أكثر');
IOS_ICONS.forEach(([filename, size]) => {
  write(`mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/${filename}`, renderIcon(size));
});

console.log('\nتمّ.');
