'use strict';

/**
 * تعريف العلامة — «خاتم زواج ذهبي محزَّز، فصّ مرصَّع على الشريط، وداخله «عرس» بحرف عربي حقيقي» (‏#99).
 *
 * بلا أي رسم على قماش ولا أي كتابة ملف عند التحميل. هذه الوحدة تحت `server/src/`
 * فقط لأنها تُقرأ من طبقة المسارات (`share.routes.js`) ومن خدمة بطاقة المشاركة
 * (`shareCard.service.js`).
 *
 * `server/scripts/brand-icons.js` يستدعي هذه الوحدة بدوره لبناء الأيقونات
 * والـSVG (توليد وقت أوفلاين، لا مسار تشغيل الخادم).
 *
 * دوال محضة: لا آثار جانبية عند `require`، وبلا أي اعتماد على خطوط في وقت التشغيل.
 */

const BRAND_WORD = require('./brandWord');

// ---- لوحة ألوان العلامة — معرَّفة هنا ومصدَّرة للمستهلكين كافة ----------------
const GROUND = '#0c1b2a';
const GOLD_DEEP = '#8f6a20';
const GOLD_MID = '#c39a55';
const GOLD_HI = '#f0d5a8';
const BRIGHT_EDGE = '#f3dcb4';
const WORD_INK = '#f6e2c2';
const MARK = GOLD_MID;

// ---- التدرّج المعدني الموحَّد — تعريف واحد يقرأه القماش وSVG ------------------
const GOLD_GRADIENT = {
  x1: 0.16,
  y1: 0.14,
  x2: 0.86,
  y2: 0.88,
  stops: [
    { offset: 0, color: GOLD_HI },
    { offset: 0.42, color: GOLD_DEEP },
    { offset: 0.72, color: GOLD_MID },
    { offset: 1, color: GOLD_HI }
  ]
};

function goldGradient(ctx, size) {
  const g = ctx.createLinearGradient(
    size * GOLD_GRADIENT.x1,
    size * GOLD_GRADIENT.y1,
    size * GOLD_GRADIENT.x2,
    size * GOLD_GRADIENT.y2
  );
  GOLD_GRADIENT.stops.forEach(s => g.addColorStop(s.offset, s.color));
  return g;
}

// ---- الهندسة، بنسبة إلى ضلع اللوحة، على مقياس منطقة الأمان (المربّع ١٠٠ وحدة) ----
const R_OUT = 38.3;        // الحافّة الخارجية للشريط
const BAND = 9.8;          // سماكة الشريط
const R_MID = 33.4;        // خط منتصف الشريط (R_OUT - BAND / 2)
const R_IN = 28.5;         // الحافّة الداخلية للشريط
const BEZEL_W = 1.55 * BAND; // عرض الفص (15.19)
const BEZEL_H = 1.24 * BAND; // ارتفاع الفص (12.152) — قمّته عند ٠٫٣٩٤٨ داخل حدّ الأمان ٠٫٤٠

function pathPart(fill, role, commands) {
  return { fill, role, shape: { type: 'path', commands } };
}

function annulusPart(fill, role, cx, cy, rIn, rOut) {
  return { fill, role, shape: { type: 'annulus', cx, cy, rIn, rOut } };
}

function lozengePart(fill, role, cx, cy, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  return pathPart(fill, role, [
    ['M', cx, cy - hh],
    ['L', cx + hw, cy],
    ['L', cx, cy + hh],
    ['L', cx - hw, cy],
    ['Z']
  ]);
}

function notchPart(cx, cy, r0, r1, angle, thickness) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = thickness / 2;
  const px = -sin * hw;
  const py = cos * hw;

  const p0x = cx + cos * r0 - px;
  const p0y = cy + sin * r0 - py;
  const p1x = cx + cos * r1 - px;
  const p1y = cy + sin * r1 - py;
  const p2x = cx + cos * r1 + px;
  const p2y = cy + sin * r1 + py;
  const p3x = cx + cos * r0 + px;
  const p3y = cy + sin * r0 + py;

  const part = pathPart('engrave', 'notch', [
    ['M', p0x, p0y],
    ['L', p1x, p1y],
    ['L', p2x, p2y],
    ['L', p3x, p3y],
    ['Z']
  ]);
  part.angle = angle;
  return part;
}

/**
 * هندسة العلامة المعتمدة — خاتم زواج ذهبي وفص وكلمة «عرس».
 *
 * `detail`:
 *   'full' — ٣٦ حزاً، حلقتان محفورتان، زهرتان بجانب الكلمة.
 *   'icon' — ١٨ حزاً (النصف بالضبط من الـ٣٦)، بلا حلقتين وبلا زهرتين.
 */
function buildMarkParts(detail = 'full') {
  const full = detail === 'full';
  const cx = 50;
  const cy = 50;
  const parts = [];

  // 1. شريط الخاتم — طارة مفرغة
  parts.push(annulusPart('band', 'band', cx, cy, R_IN, R_OUT));

  // 2. الحزوز — ٣٦ في الكامل، ١٨ في الأيقونة (نصف الـ٣٦ بالضبط)
  const notchStep = (Math.PI * 2) / 36;
  const rNotchIn = R_IN + 0.26 * BAND;
  const rNotchOut = R_OUT - 0.26 * BAND;
  const notchThickness = 0.75; // 0.0075 * 100

  // تبدأ بزاوية إزاحة نصف خطوة من الساعة ١٢ كي لا يقع حزّ تحت الفص
  const indexStep = full ? 1 : 2;
  for (let i = 0; i < 36; i += indexStep) {
    const angle = -Math.PI / 2 + (i + 0.5) * notchStep;
    parts.push(notchPart(cx, cy, rNotchIn, rNotchOut, angle, notchThickness));
  }

  // 3. خطّان محفوران يحصران الحزوز — تفصيل داخلي يسقط في الأيقونة
  if (full) {
    const ringThickness = 0.6; // 0.006 * 100
    const rOuterEngrave = R_OUT - 0.16 * BAND;
    const rInnerEngrave = R_IN + 0.16 * BAND;
    parts.push(annulusPart('engrave', 'engraved-ring', cx, cy, rOuterEngrave - ringThickness / 2, rOuterEngrave + ringThickness / 2));
    parts.push(annulusPart('engrave', 'engraved-ring', cx, cy, rInnerEngrave - ringThickness / 2, rInnerEngrave + ringThickness / 2));
  }

  // 4. خط لامع على الحافة الخارجية — يبقى في المستويين (هو حدّ الجسم)
  const brightMid = R_OUT - 0.4; // 0.004 * 100
  const brightThickness = 0.8;   // 0.008 * 100
  parts.push(annulusPart('bright', 'bright-edge', cx, cy, brightMid - brightThickness / 2, brightMid + brightThickness / 2));

  // 5. الفص — معيّن مرصّع على خط المنتصف عند الساعة ١٢
  const bezelY = cy - R_MID;
  parts.push(lozengePart('bezel', 'bezel', cx, bezelY, BEZEL_W, BEZEL_H));

  // 6. خط واجهة الفص المحفور
  const facetY = bezelY - BEZEL_H * 0.22;
  const facetHalfW = BEZEL_W * 0.26;
  const facetThickness = 0.6;
  parts.push(pathPart('engrave', 'facet', [
    ['M', cx - facetHalfW, facetY - facetThickness / 2],
    ['L', cx + facetHalfW, facetY - facetThickness / 2],
    ['L', cx + facetHalfW, facetY + facetThickness / 2],
    ['L', cx - facetHalfW, facetY + facetThickness / 2],
    ['Z']
  ]));

  // 7. زهرتان تحفّان الكلمة (في المستوى الكامل فقط)
  if (full) {
    const floretOffset = 0.82 * R_IN; // 23.37
    const floretW = 3.3;  // 0.033 * 100
    const floretH = 5.2;  // 0.052 * 100
    parts.push(lozengePart('floret', 'floret', cx - floretOffset, cy, floretW, floretH));
    parts.push(lozengePart('floret', 'floret', cx + floretOffset, cy, floretW, floretH));
  }

  // 8. كلمة «عرس» — ممركزة على ارتفاع الحبر الحقيقي
  const wordW = 1.28 * R_IN; // 36.48
  const wordH = wordW / BRAND_WORD.aspectRatio;
  const wordLeft = cx - wordW / 2;
  const wordTop = cy - wordH / 2;

  const wordCommands = BRAND_WORD.commands.map(([type, ...args]) => {
    if (type === 'M') return ['M', wordLeft + args[0] * wordW, wordTop + args[1] * wordH];
    if (type === 'L') return ['L', wordLeft + args[0] * wordW, wordTop + args[1] * wordH];
    if (type === 'Q') return ['Q', wordLeft + args[0] * wordW, wordTop + args[1] * wordH, wordLeft + args[2] * wordW, wordTop + args[3] * wordH];
    if (type === 'C') return ['C', wordLeft + args[0] * wordW, wordTop + args[1] * wordH, wordLeft + args[2] * wordW, wordTop + args[3] * wordH, wordLeft + args[4] * wordW, wordTop + args[5] * wordH];
    if (type === 'Z') return ['Z'];
    return [type, ...args];
  });
  parts.push(pathPart('word', 'word', wordCommands));

  return parts;
}

function markScale(safeZone) {
  return safeZone ? 1 : 1.14;
}

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

function shapeToSvgD(shape) {
  if (shape.type === 'annulus') {
    const { cx, cy, rIn, rOut } = shape;
    return `M ${fmt(cx + rOut)} ${fmt(cy)} A ${fmt(rOut)} ${fmt(rOut)} 0 1 0 ${fmt(cx - rOut)} ${fmt(cy)} A ${fmt(rOut)} ${fmt(rOut)} 0 1 0 ${fmt(cx + rOut)} ${fmt(cy)} Z M ${fmt(cx + rIn)} ${fmt(cy)} A ${fmt(rIn)} ${fmt(rIn)} 0 1 1 ${fmt(cx - rIn)} ${fmt(cy)} A ${fmt(rIn)} ${fmt(rIn)} 0 1 1 ${fmt(cx + rIn)} ${fmt(cy)} Z`;
  }
  return shape.commands
    .map(([type, ...args]) => (type === 'Z' ? 'Z' : `${type} ${args.map(fmt).join(' ')}`))
    .join(' ');
}

function partsToSvgPaths(parts) {
  const markD = parts.filter(p => p.fill !== 'ground').map(p => shapeToSvgD(p.shape)).join(' ');
  const groundD = parts.filter(p => p.fill === 'ground').map(p => shapeToSvgD(p.shape)).join(' ');
  return { markD, groundD };
}

module.exports = {
  GROUND,
  MARK,
  GOLD_DEEP,
  GOLD_MID,
  GOLD_HI,
  BRIGHT_EDGE,
  WORD_INK,
  GOLD_GRADIENT,
  goldGradient,
  R_OUT,
  BAND,
  R_MID,
  R_IN,
  buildMarkParts,
  markScale,
  partsToSvgPaths,
  shapeToSvgD
};
