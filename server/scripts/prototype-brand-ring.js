/**
 * العلامة النهائية للمعاينة — خاتم ذهبي محزَّز، فصّ مرصَّع على الشريط نفسه،
 * وداخله «عرس» بحرف عربي حقيقي.
 *
 * الهندسة كلها **بنسبة إلى ضلع اللوحة**، مرسومة على مقياس منطقة الأمان
 * (‏`markScale(true) === 1`) — أي أنّ كل ما هنا يسع داخل دائرة نصف قطرها ٠٫٤٠،
 * وتتكفّل `markScale(false) === 1.14` بتكبيره لما ليس مقنَّعاً. هذا هو العقد
 * القائم في `server/src/utils/brandMark.js`، والأرقام هنا مكتوبة له.
 *
 * سكربت يُرمى: يعيش في مجلّد مؤقّت، لا في المستودع.
 *   node mark.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const SERVER = 'C:/Users/asus/Desktop/negev_events_app (1)/negev_events_app/server';
const { createCanvas, GlobalFonts } = require(path.join(SERVER, 'node_modules/@napi-rs/canvas'));

GlobalFonts.registerFromPath(path.join(SERVER, 'src/assets/fonts/Cairo-Bold.ttf'), 'NegevBold');

const GROUND = '#0c1b2a';
const GOLD_DEEP = '#8f6a20';
const GOLD_MID = '#c39a55';
const GOLD_HI = '#f0d5a8';
const WORD_INK = '#f6e2c2';

// ---- الهندسة، بنسبة إلى ضلع اللوحة، على مقياس منطقة الأمان ----------------
const R_OUT = 0.383;      // الحافّة الخارجية للشريط
const BAND = 0.098;       // سماكة الشريط
const R_MID = R_OUT - BAND / 2;
const R_IN = R_OUT - BAND;
const STONE_W = BAND * 1.55;
const STONE_H = BAND * 1.24;   // قمّته تقف عند ٠٫٣٩٥ — داخل حدّ الأمان ٠٫٤٠
const SAFE = 0.40;

function goldGradient(ctx, S) {
  const g = ctx.createLinearGradient(S * 0.16, S * 0.14, S * 0.86, S * 0.88);
  g.addColorStop(0, GOLD_HI);
  g.addColorStop(0.42, GOLD_DEEP);
  g.addColorStop(0.72, GOLD_MID);
  g.addColorStop(1, GOLD_HI);
  return g;
}

function ring(ctx, c, r, w, style) {
  ctx.strokeStyle = style;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.stroke();
}

function milling(ctx, c, r0, r1, count, width) {
  ctx.strokeStyle = GOLD_DEEP;
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  for (let i = 0; i < count; i++) {
    // تبدأ من ٦ ونصف الدائرة كي لا يقع حزّ تحت الفصّ عند ١٢
    const a = ((i + 0.5) / count) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }
}

function lozenge(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * @param detail 'icon' | 'full'
 * @param safeZone true للأيقونة المقنَّعة (مقياس ١)، false لغيرها (مقياس ١٫١٤)
 */
function draw(ctx, S, { detail = 'full', safeZone = false } = {}) {
  const c = S / 2;
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, S, S);

  const k = safeZone ? 1 : 1.14;
  const rOut = S * R_OUT * k;
  const band = S * BAND * k;
  const rMid = S * R_MID * k;
  const rIn = S * R_IN * k;
  const full = detail === 'full';

  // ---- الشريط ---------------------------------------------------------
  ring(ctx, c, rMid, band, goldGradient(ctx, S));

  // ---- الحزوز: ٣٦ في الكبير، ١٨ في الأيقونة ---------------------------
  // النصف بالضبط، فيقع كل حزّ من الأيقونة على حزّ من الكبير — نفس الجسم
  // بدقّتين، لا رسمان مختلفان.
  milling(ctx, c, rIn + band * 0.26, rOut - band * 0.26, full ? 36 : 18,
          Math.max(1, S * 0.0075 * k));

  // ---- خطّان محفوران يحصران الحزوز — تفصيل داخليّ، يسقط في الأيقونة ----
  if (full) {
    ring(ctx, c, rOut - band * 0.16, Math.max(1, S * 0.006), GOLD_DEEP);
    ring(ctx, c, rIn + band * 0.16, Math.max(1, S * 0.006), GOLD_DEEP);
  }
  // خطّ لامع على الحافّة الخارجية — يبقى في المستويين: هو حدّ الجسم
  ring(ctx, c, rOut - S * 0.004 * k, Math.max(1, S * 0.008 * k), '#f3dcb4');

  // ---- الفصّ: مرصَّع على الشريط، لا ناتئ فوقه -------------------------
  const sy = c - rMid;
  lozenge(ctx, c, sy, S * STONE_W * k, S * STONE_H * k, GOLD_HI);
  ctx.strokeStyle = GOLD_DEEP;
  ctx.lineWidth = Math.max(1, S * 0.006 * k);
  ctx.beginPath();
  ctx.moveTo(c - S * STONE_W * k * 0.26, sy - S * STONE_H * k * 0.22);
  ctx.lineTo(c + S * STONE_W * k * 0.26, sy - S * STONE_H * k * 0.22);
  ctx.stroke();

  // ---- الكلمة ---------------------------------------------------------
  const boxW = rIn * 1.28;
  let size = rIn * 1.05;
  ctx.font = `${size}px NegevBold`;
  let m = ctx.measureText('عرس');
  if (m.width > boxW) {
    size *= boxW / m.width;
    ctx.font = `${size}px NegevBold`;
    m = ctx.measureText('عرس');
  }
  ctx.fillStyle = WORD_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('عرس', c, c + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);

  // ---- زهرتان تحفّان الكلمة — تفصيل داخليّ، يسقط في الأيقونة ----------
  if (full) {
    const fx = rIn * 0.82;
    lozenge(ctx, c - fx, c, S * 0.033, S * 0.052, GOLD_MID);
    lozenge(ctx, c + fx, c, S * 0.033, S * 0.052, GOLD_MID);
  }
}

/** يحاكي قصّ المشغّل الدائري على أندرويد: يبقي الدائرة المركزية ٨٠٪. */
function masked(S, opts) {
  const cv = createCanvas(S, S);
  const ctx = cv.getContext('2d');
  draw(ctx, S, opts);
  const out = createCanvas(S, S);
  const o = out.getContext('2d');
  o.save();
  o.beginPath();
  o.arc(S / 2, S / 2, S * 0.40, 0, Math.PI * 2);
  o.clip();
  o.drawImage(cv, 0, 0);
  o.restore();
  return out;
}

function render(S, opts) {
  const cv = createCanvas(S, S);
  draw(cv.getContext('2d'), S, opts);
  return cv;
}

/* ------------------------------------------------------------------ */
const OUT = __dirname;
const w = (name, cv) => fs.writeFileSync(path.join(OUT, name), cv.toBuffer('image/png'));

w('mark-512.png', render(512, { detail: 'full' }));
w('mark-192.png', render(192, { detail: 'full' }));
w('mark-48.png', render(48, { detail: 'icon' }));
w('mark-maskable-512.png', render(512, { detail: 'icon', safeZone: true }));

// لوح المعاينة
const P = createCanvas(1120, 620);
const p = P.getContext('2d');
p.fillStyle = '#05101a';
p.fillRect(0, 0, 1120, 620);
p.drawImage(render(512, { detail: 'full' }), 24, 24, 512, 512);

p.drawImage(render(192, { detail: 'icon' }), 566, 24, 192, 192);
p.drawImage(masked(512, { detail: 'icon', safeZone: true }), 566, 250, 192, 192);

p.imageSmoothingEnabled = false;
p.drawImage(render(48, { detail: 'icon' }), 800, 24, 192, 192);
p.drawImage(render(48, { detail: 'icon' }), 800, 250, 48, 48);
p.imageSmoothingEnabled = true;

// الخطّ الوحيد المسجَّل في هذه العملية هو Cairo — أي خطّ آخر يخرج مربّعات
p.fillStyle = '#a9bccf';
p.font = '17px NegevBold';
p.direction = 'rtl';
p.textAlign = 'right';
p.fillText('المستوى الكامل — ٥١٢', 536, 562);
p.fillText('مستوى الأيقونة — ١٩٢', 758, 236);
p.fillText('مقنَّعة، بعد القصّ الدائري', 758, 462);
p.fillText('٤٨ مكبَّرة ×٤', 992, 236);
p.fillText('٤٨ بحجمها الحقيقي', 992, 320);
w('preview-final.png', P);
console.log('done');
