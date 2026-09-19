'use strict';

/**
 * تعريف العلامة — «حلقتا زواج ذهبيتان متشابكتان، فصّ ماسي فيروزي على الحلقة
 * اليسرى (بصرياً)، وقلب أحمر فوق اليمنى، وتحتهما كلمة «اعراسنا»» — مرسومة متّجهاً
 * عن صورة الشعار التي اعتمدها المالك (٢٠٢٦-٠٩)، على أرضية بيضاء مثلها.
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
const GROUND = '#ffffff';
const GOLD_DEEP = '#a8740c';
const GOLD_MID = '#d9a632';
const GOLD_HI = '#f7dc8c';
const WORD_INK = '#262626';
const GEM_LIGHT = '#a6e7ee';
const GEM = '#3bb4c4';
const GEM_DEEP = '#1f8a9b';
const HEART = '#e03a4f';
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

/** لون الملء الثابت لكل دور — `band` وحده تدرّج، فلا يرد هنا (انظر `fillStyleFor`). */
const SOLID_FILLS = {
  ground: GROUND,
  prong: GOLD_DEEP,
  'gem-light': GEM_LIGHT,
  gem: GEM,
  'gem-deep': GEM_DEEP,
  heart: HEART,
  word: WORD_INK
};

/** ملء جزء واحد على قماش — المصدر الوحيد لربط الأدوار بالألوان لكل من يرسم العلامة. */
function fillStyleFor(ctx, fill, size) {
  if (fill === 'band') return goldGradient(ctx, size);
  return SOLID_FILLS[fill] || MARK;
}

// ---- الهندسة، على مربّع ١٠٠ وحدة، قبل التوسيط ------------------------------
const R_OUT = 15.5;               // الحافّة الخارجية لكل حلقة
const BAND = 4.2;                 // سماكة الشريط
const R_IN = R_OUT - BAND;        // الحافّة الداخلية
const R_MID = R_OUT - BAND / 2;   // خط منتصف الشريط
const GAP = 1.1;                  // فراغ أبيض يفصل الحلقتين حيث تعبر إحداهما فوق الأخرى
const RING_DX = 9.5;              // نصف المسافة بين المركزين
const RING_Y = 45;
const LEFT_CX = 50 - RING_DX;
const RIGHT_CX = 50 + RING_DX;

// نصف القطر الذي تُحشر فيه العلامة كلها بعد التوسيط — منطقة الأمان الدائرية
// لأندرويد نصف قطرها ٠٫٤٠ من الضلع، ونترك نصف وحدة هامشاً لتنعيم الحواف.
const SAFE_RADIUS = 39.5;

function pathPart(fill, role, commands) {
  return { fill, role, shape: { type: 'path', commands } };
}

function annulusPart(fill, role, cx, cy, rIn, rOut) {
  return { fill, role, shape: { type: 'annulus', cx, cy, rIn, rOut } };
}

/**
 * قوس دائري بمنحنيات بيزييه تكعيبية (قطعة لكل ≤ ٩٠°) — أوامر `C` فقط، لأن
 * كل مستهلك للهندسة (القماش وSVG) يفهم M/L/Q/C/Z ولا يفهم أقواس SVG.
 */
function arcCommands(cx, cy, r, a0, a1) {
  const segments = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
  const step = (a1 - a0) / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const commands = [];
  for (let i = 0; i < segments; i += 1) {
    const s = a0 + i * step;
    const e = s + step;
    commands.push(['C',
      cx + r * (Math.cos(s) - k * Math.sin(s)), cy + r * (Math.sin(s) + k * Math.cos(s)),
      cx + r * (Math.cos(e) + k * Math.sin(e)), cy + r * (Math.sin(e) - k * Math.cos(e)),
      cx + r * Math.cos(e), cy + r * Math.sin(e)
    ]);
  }
  return commands;
}

/** قطاع من طارة بين زاويتين — به تعود الحلقة اليسرى فوق اليمنى عند إحدى نقطتَي التقاطع فقط. */
function sectorPart(fill, role, cx, cy, rIn, rOut, a0, a1) {
  return pathPart(fill, role, [
    ['M', cx + rOut * Math.cos(a0), cy + rOut * Math.sin(a0)],
    ...arcCommands(cx, cy, rOut, a0, a1),
    ['L', cx + rIn * Math.cos(a1), cy + rIn * Math.sin(a1)],
    ...arcCommands(cx, cy, rIn, a1, a0),
    ['Z']
  ]);
}

function polygonPart(fill, role, points) {
  return pathPart(fill, role, [
    ['M', points[0][0], points[0][1]],
    ...points.slice(1).map(([x, y]) => ['L', x, y]),
    ['Z']
  ]);
}

/** قلب بستّ منحنيات، داخل صندوق عرضه `w` وارتفاعه `h` أعلاه اليساري (x, y). */
function heartPart(fill, role, x, y, w, h) {
  const p = (nx, ny) => [x + nx * w, y + ny * h];
  return pathPart(fill, role, [
    ['M', ...p(0.5, 0.26)],
    ['C', ...p(0.5, 0.1), ...p(0.38, 0), ...p(0.25, 0)],
    ['C', ...p(0.1, 0), ...p(0, 0.13), ...p(0, 0.3)],
    ['C', ...p(0, 0.56), ...p(0.28, 0.76), ...p(0.5, 1)],
    ['C', ...p(0.72, 0.76), ...p(1, 0.56), ...p(1, 0.3)],
    ['C', ...p(1, 0.13), ...p(0.9, 0), ...p(0.75, 0)],
    ['C', ...p(0.62, 0), ...p(0.5, 0.1), ...p(0.5, 0.26)],
    ['Z']
  ]);
}

function wordPart(left, top, width) {
  const height = width / BRAND_WORD.aspectRatio;
  const commands = BRAND_WORD.commands.map(([type, ...args]) => {
    if (type === 'Z') return ['Z'];
    const out = [type];
    for (let i = 0; i < args.length; i += 2) out.push(left + args[i] * width, top + args[i + 1] * height);
    return out;
  });
  return pathPart('word', 'word', commands);
}

/** كل نقطة تحكّم وكل حافّة طارة — غلاف محافظ للحبر (نقاط التحكّم خارج المنحنى أو عليه). */
function extremePoints(parts) {
  const points = [];
  parts.forEach(({ shape }) => {
    if (shape.type === 'annulus') {
      points.push([shape.cx - shape.rOut, shape.cy], [shape.cx + shape.rOut, shape.cy],
        [shape.cx, shape.cy - shape.rOut], [shape.cx, shape.cy + shape.rOut]);
      return;
    }
    shape.commands.forEach(([, ...args]) => {
      for (let i = 0; i < args.length; i += 2) points.push([args[i], args[i + 1]]);
    });
  });
  return points;
}

/**
 * يوسّط الأجزاء على (٥٠، ٥٠) ويكبّرها حتى يبلغ أبعد حبرها `SAFE_RADIUS` بالضبط —
 * فالطبقتان (بالكلمة وبدونها) تملآن منطقة الأمان نفسها بلا أرقام يدوية لكلٍّ منهما.
 */
function fitToSafeZone(parts) {
  const points = extremePoints(parts);
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2;
  const oy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let maxDist = 0;
  parts.forEach(({ shape }) => {
    if (shape.type === 'annulus') {
      maxDist = Math.max(maxDist, Math.hypot(shape.cx - ox, shape.cy - oy) + shape.rOut);
    }
  });
  points.forEach(([x, y]) => { maxDist = Math.max(maxDist, Math.hypot(x - ox, y - oy)); });
  const s = SAFE_RADIUS / maxDist;
  const tx = x => 50 + (x - ox) * s;
  const ty = y => 50 + (y - oy) * s;

  return parts.map(part => {
    const { shape } = part;
    if (shape.type === 'annulus') {
      return { ...part, shape: { ...shape, cx: tx(shape.cx), cy: ty(shape.cy), rIn: shape.rIn * s, rOut: shape.rOut * s } };
    }
    const commands = shape.commands.map(([type, ...args]) => {
      if (type === 'Z') return ['Z'];
      const out = [type];
      for (let i = 0; i < args.length; i += 2) out.push(tx(args[i]), ty(args[i + 1]));
      return out;
    });
    return { ...part, shape: { type: 'path', commands } };
  });
}

/**
 * هندسة العلامة المعتمدة.
 *
 * `detail`:
 *   'full' — الحلقتان والفصّ والقلب وكلمة «اعراسنا» تحتها، كما في صورة الشعار.
 *   'icon' — بلا الكلمة: الفافيكون ‎٣٢px‎ والشارات أحادية اللون بجانب اسم
 *            التطبيق المكتوب أصلاً، حيث الكلمة إمّا رذاذ أو تكرار.
 *
 * ترتيب الأجزاء ترتيب رسم: الفراغات الأرضية (`ground`) تُرسم فوق ما قبلها.
 */
function buildMarkParts(detail = 'full') {
  const full = detail === 'full';
  const parts = [];

  // 1. الحلقة اليسرى كاملة، ثم فراغ حول اليمنى يقطعها عند نقطتي التقاطع، ثم اليمنى
  parts.push(annulusPart('band', 'ring', LEFT_CX, RING_Y, R_IN, R_OUT));
  parts.push(annulusPart('ground', 'gap', RIGHT_CX, RING_Y, R_IN - GAP, R_OUT + GAP));
  parts.push(annulusPart('band', 'ring', RIGHT_CX, RING_Y, R_IN, R_OUT));

  // 2. التشابك: عند التقاطع السفلي تعود اليسرى فوق اليمنى — قطاع ٢٠°..٧٠° منها
  //    طرفاه داخل فتحة اليمنى وخارجها، فلا يظهر قطعه المستقيم.
  const a0 = (20 * Math.PI) / 180;
  const a1 = (70 * Math.PI) / 180;
  // الفراغ أضيق زاوياً من القطاع بدرجتين من كل طرف: قطعه الشعاعي يقع داخل
  // القطاع الذهبي فيُغطّى، فلا يبقى خطّ أبيض رفيع عند طرفيه.
  const pad = (2 * Math.PI) / 180;
  parts.push(sectorPart('ground', 'gap', LEFT_CX, RING_Y, R_IN - GAP, R_OUT + GAP, a0 + pad, a1 - pad));
  parts.push(sectorPart('band', 'ring-over', LEFT_CX, RING_Y, R_IN, R_OUT, a0, a1));

  // 3. الفصّ الماسي على قمّة اليسرى: مخلبان ذهبيان، تاج فاتح، وجناحا قاعدة بظلّين
  const top = RING_Y - R_OUT;
  const gx = LEFT_CX;
  parts.push(polygonPart('prong', 'prong', [[gx - 3.4, top + 1.6], [gx - 2.2, top - 3.4], [gx + 2.2, top - 3.4], [gx + 3.4, top + 1.6]]));
  const girdleY = top - 5.6;
  const crownY = top - 9.4;
  parts.push(polygonPart('gem-light', 'gem', [[gx - 6.4, girdleY], [gx - 3.4, crownY], [gx + 3.4, crownY], [gx + 6.4, girdleY]]));
  parts.push(polygonPart('gem', 'gem', [[gx - 6.4, girdleY], [gx, girdleY], [gx, top + 0.8]]));
  parts.push(polygonPart('gem-deep', 'gem', [[gx, girdleY], [gx + 6.4, girdleY], [gx, top + 0.8]]));

  // 4. القلب فوق اليمنى، منفصلاً عنها بفراغ
  const heartW = 12.4;
  const heartH = 11;
  const heartX = RIGHT_CX + 1 - heartW / 2;
  const heartY = top - 2.2 - heartH;
  parts.push(heartPart('heart', 'heart', heartX, heartY, heartW, heartH));

  // 5. الكلمة تحت الحلقتين — عرضها يقارب عرض الحلقتين معاً كما في الصورة
  if (full) {
    const wordW = 2 * (RING_DX + R_OUT) * 0.92;
    parts.push(wordPart(50 - wordW / 2, RING_Y + R_OUT + 3.6, wordW));
  }

  return fitToSafeZone(parts);
}

/** خارج المنطقة الآمنة (مربّع لا دائرة) تتّسع العلامة لتملأ اللوح أكثر. */
function markScale(safeZone) {
  return safeZone ? 1 : 1.14;
}

/** يتتبّع مسار جزء واحد على القماش بمقياس `u`، بلا ملء — التتبّع نفسه يخدم الملء والقصّ معاً. */
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

/**
 * يرسم الأجزاء بترتيبها. `cutGround`: الفراغات تُقصّ شفّافةً (`destination-out`)
 * بدل أن تُطلى بلون الأرضية — لرسم العلامة على قماش مستقلّ ثم لصقه فوق أي خلفية.
 */
function paintParts(ctx, parts, u, size, { cutGround = false } = {}) {
  parts.forEach(part => {
    ctx.save();
    if (part.fill === 'ground' && cutGround) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
    } else {
      ctx.fillStyle = fillStyleFor(ctx, part.fill, size);
    }
    tracePart(ctx, part, u);
    ctx.fill();
    ctx.restore();
  });
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
  GOLD_GRADIENT,
  SAFE_RADIUS,
  goldGradient,
  fillStyleFor,
  buildMarkParts,
  markScale,
  tracePart,
  paintParts,
  partsToSvgPaths,
  shapeToSvgD
};
