'use strict';

/**
 * يولّد كل أيقونات العلامة من تعريف واحد — «بيت الشَّعَر» (‏#56).
 *
 * الأيقونات صور ثنائية، ولو دخلت المستودع مرسومة يدوياً لصارت غير قابلة
 * لإعادة التوليد: أي تعديل على العلامة يعني إعادة رسم ٢٦ ملفاً بيدك. هذا
 * السكربت هو مصدر الحقيقة بدلاً منها — العلامة معرَّفة مرة واحدة في
 * `buildMarkParts` أدناه، وكل مقاس (بما فيه SVG الفافيكون) مشتقّ منها.
 *
 *   node scripts/brand-icons.js          (من داخل server/)
 *
 * يكتب إلى أربعة أماكن:
 *   web/icons/            — فافيكون، apple-touch-icon، وأيقونات PWA
 *   mobile/android/.../mipmap-*   — أيقونة الأندرويد
 *   mobile/ios/.../AppIcon.appiconset — أيقونة iOS
 *   server/src/assets/share/ — علامة بطاقة المشاركة وحدها، بخلفية شفافة
 *
 * ولا يلمس شيئاً آخر. تشغيله متكرّراً آمن: يستبدل الملفات نفسها بالمحتوى نفسه.
 * `require`-ه (كما يفعل test/web-dom.test.js) لا يكتب شيئاً — الكتابة كلها
 * خلف `require.main === module` في ذيل الملف.
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

// ---------------------------------------------------------------------------
// أدوات بناء المسار — نفس تعريف الشكل يُستخدم للرسم على القماش وللـSVG معاً
// ---------------------------------------------------------------------------

function polarPoint(cx, cy, angleDeg, radius) {
  const angleRad = (angleDeg * Math.PI) / 180;
  // زاوية تُقاس من محور +x صعوداً، مع أن y ينمو نازلاً على الشاشة — ولهذا الطرح لا الجمع
  return { x: cx + radius * Math.cos(angleRad), y: cy - radius * Math.sin(angleRad) };
}

function bezierPoint(p0, c, p1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y
  };
}

/** عند أي t من [0,1] تمرّ منحنية Bezier تربيعية بإحداثي x بعينه — يحدّد أين يبدأ شقّ الباب فعلياً على السقف المتهدّل، بدل رقم مثبَّت يشيخ صامتاً إن تغيّر شكل السقف. */
function solveQuadraticT(p0x, cx, p1x, targetX) {
  const a = p0x - 2 * cx + p1x;
  const b = 2 * (cx - p0x);
  const c = p0x - targetX;
  if (Math.abs(a) < 1e-9) return -c / b;
  const discriminant = Math.sqrt(b * b - 4 * a * c);
  const candidates = [(-b + discriminant) / (2 * a), (-b - discriminant) / (2 * a)];
  return candidates.find(t => t >= 0 && t <= 1);
}

function pathPart(fill, commands) {
  return { fill, shape: { type: 'path', commands } };
}

function circlePart(fill, cx, cy, r) {
  return { fill, shape: { type: 'circle', cx, cy, r } };
}

function rectPart(fill, x, y, w, h) {
  return pathPart(fill, [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']]);
}

/** حبل شدّ: خط مستقيم مشدود بعرض معيّن — مضلَّع رفيع لا stroke، فكل العلامة تمتلئ بتعبئة واحدة. */
function ropePart(x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const px = (-dy / length) * (width / 2);
  const py = (dx / length) * (width / 2);
  return pathPart('mark', [
    ['M', x1 + px, y1 + py],
    ['L', x2 + px, y2 + py],
    ['L', x2 - px, y2 - py],
    ['L', x1 - px, y1 - py],
    ['Z']
  ]);
}

/** وتد إضاءة: مضلَّع مصمت ضيّق من الداخل وأعرض من الخارج — كتلة لا نقطاً، فالستيبل يموت عند التصغير. */
function wedgePart(origin, angleDeg, innerRadius, outerRadius, innerWidth, outerWidth) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const dir = { x: Math.cos(angleRad), y: -Math.sin(angleRad) };
  const perp = { x: -dir.y, y: dir.x };
  const innerCenter = { x: origin.x + dir.x * innerRadius, y: origin.y + dir.y * innerRadius };
  const outerCenter = { x: origin.x + dir.x * outerRadius, y: origin.y + dir.y * outerRadius };
  const iw = innerWidth / 2;
  const ow = outerWidth / 2;
  return pathPart('mark', [
    ['M', innerCenter.x + perp.x * iw, innerCenter.y + perp.y * iw],
    ['L', outerCenter.x + perp.x * ow, outerCenter.y + perp.y * ow],
    ['L', outerCenter.x - perp.x * ow, outerCenter.y - perp.y * ow],
    ['L', innerCenter.x - perp.x * iw, innerCenter.y - perp.y * iw],
    ['Z']
  ]);
}

/**
 * هندسة بيت الشَّعَر الثابتة — نقاط لا تتغيّر بين `detail`.
 *
 * السقف منحنيان متقابلان (‏`eaveLeft`→`roofControlLeft`→`ridgeCenter` ثم
 * `ridgeCenter`→`roofControlRight`→`eaveRight`)، وكلّ واحد منهما **يتهدّل**:
 * نقطة التحكّم أوطأ من وتر المنحنى، فيمرّ المنحنى **تحت** الوتر لا فوقه.
 *
 * وهذا هو الشرط الذي يفصل بيت الشَّعَر عن القبّة، ويُفحص بالحساب لا بالعين:
 * نقطة منتصف منحنى تربيعي هي ‎¼p0 + ½c + ¼p1‎، ومنتصف الوتر ‎½p0 + ½p1‎. مع
 * الأرقام أدناه: منتصف المنحنى عند ‎y=53.5‎ ومنتصف الوتر عند ‎y=52.0‎ — أي
 * المنحنى أوطأ بـ‎1.5‎ وحدة، وهو التهدّل الضحل المطلوب. **إن صار منتصف المنحنى
 * أعلى من منتصف الوتر فقد انقلب الشكل قبّةً**، وهو ما حدث في محاولة سابقة
 * وُضعت فيها نقطتا التحكّم بنفس ارتفاع `ridgeCenter` تماماً.
 *
 * والصاري يرفع السقف عند المركز رفعاً خفيفاً — هكذا هي الخيمة فعلاً — فارتفاع
 * `ridgeCenter` فوق الأفريز ‎10‎ وحدات لا أكثر، والنسبة العامة ‎46×23‎ أي ‎2:1‎
 * بالضبط: الشكل يمتدّ ولا يرتفع.
 */
const TENT = {
  base: { y: 70, left: 27, right: 73 },
  eaveLeft: { x: 30, y: 57 },
  eaveRight: { x: 70, y: 57 },
  ridgeCenter: { x: 50, y: 47 },
  roofControlLeft: { x: 40, y: 55 },
  roofControlRight: { x: 60, y: 55 }
};

/** محور الزينة: نقطة يتوقف عندها الصاري وتتفرّع منها الأوتاد — قصيرة عمداً، انظر التعليق تحت `buildMarkParts`. */
const HUB = { x: 50, y: 44, r: 1.8 };

/** لمبات الطوق — مستخرجة من `buildMarkParts` لتصديرها للاختبارات دون تفكيك قائمة الأجزاء المجهولة الاسم. */
function ringBeads(detail) {
  const beadCount = detail === 'icon' ? 18 : 28;
  const ringRadius = 36;
  const beads = [];
  for (let i = 0; i < beadCount; i += 1) {
    const angle = (360 / beadCount) * i;
    const isLarge = detail === 'icon' ? true : i % 2 === 0;
    const r = detail === 'icon' ? 3.6 : (isLarge ? 3.0 : 1.6);
    const { x, y } = polarPoint(50, 50, angle, ringRadius);
    beads.push({ x, y, r });
  }
  return beads;
}

/**
 * العلامة المعتمدة: بيت شَعَر تحت انفجار أضواء عرس، محاط بطوق لمبات مغلق يُقرأ
 * كخاتم زواج. كل الإحداثيات في مربّع ١٠٠ وحدة، مركزه (‏٥٠،٥٠)، ودون أي مقياس —
 * القياس (‏`scale`) يُطبَّق لاحقاً في `drawTent`/`buildIconSvg` لا هنا.
 *
 * أربعة أشياء تفصل بيت الشَّعَر عن قبّة سيرك أو جبل، وكلها مقصودة هنا:
 *   • **السقف يتهدّل ولا ينتفخ** — هذا هو الشرط الحاسم. محاولة أولى جعلت
 *     المنحنيين يلتقيان في قمّة حادّة عالية فبدت الأيقونة خيمة سيرك، ومحاولة
 *     ثانية صحّحت القمّة فرفعت المنحنى **فوق** وتره فبدت قبّةً. الصواب بينهما:
 *     ارتفاع خفيف عند الصاري (‏`ridgeCenter` أعلى من الأفريز بعشر وحدات) مع
 *     تهدّل كل شقّ **تحت** وتره. الشرط محسوب في التعليق أعلى `TENT`، لا مقدَّر
 *     بالعين.
 *   • **الجدران مستقيمة مشدودة**، وكذلك حبال الشدّ — لا منحنى في أيّ منهما.
 *   • **القاعدة مسطّحة والنسبة واطئة** — فالشكل يمتدّ لا يرتفع.
 *   • **فراغ داكن حول العلامة الداخلية** — الصاري قصير عمداً (يتوقف عند
 *     `HUB`، لا يقارب الطوق)، والأوتاد مقصوصة عند نصف قطر يُبقي مسافة واضحة
 *     عن الحافة الداخلية لأقرب لمبة في الطوق. محاولة سابقة مدّت الأوتاد
 *     والصاري حتى لامسا الطوق فبدت العلامة كتلة واحدة مطموسة لا شكلين
 *     متمايزين.
 *
 * `detail`:
 *   'full' — الطوق الكامل (٢٨ لمبة متبادلة)، ٧ أوتاد، وحبال الشدّ وأوتادها.
 *   'icon' — طبقة مبسَّطة: بلا حبال شدّ، ٥ أوتاد أسمك، فتحتا باب أعرض، وطوق
 *            ١٨ لمبة كبيرة متساوية — لا اثنتي عشرة: عند اثنتي عشرة تتباعد
 *            اللمبات أكثر من قطرها فيقرأ الطوق نقطاً متناثرة لا خاتماً مغلقاً.
 */
function buildMarkParts(detail) {
  const parts = [];

  // الطوق — عقد لمبات مغلق حول المركز، يقرأ كخاتم زواج
  ringBeads(detail).forEach(({ x, y, r }) => parts.push(circlePart('mark', x, y, r)));

  // بيت الشَّعَر نفسه: قاعدة، جداران، وسقف يتهدّل قليلاً بين عمودين
  const { base, eaveLeft, eaveRight, ridgeCenter, roofControlLeft, roofControlRight } = TENT;
  parts.push(pathPart('mark', [
    ['M', base.left, base.y],
    ['L', eaveLeft.x, eaveLeft.y],
    ['Q', roofControlLeft.x, roofControlLeft.y, ridgeCenter.x, ridgeCenter.y],
    ['Q', roofControlRight.x, roofControlRight.y, eaveRight.x, eaveRight.y],
    ['L', base.right, base.y],
    ['Z']
  ]));

  // فتحتا الباب: تُرسمان بلون الأرضية فوق جسم الخيمة، لا بتفريغ حقيقي للمسار
  const doorHalfWidth = detail === 'icon' ? 1.3 : 0.9;
  [
    { centerX: 45.5, p0: eaveLeft, control: roofControlLeft, p1: ridgeCenter },
    { centerX: 54.5, p0: ridgeCenter, control: roofControlRight, p1: eaveRight }
  ].forEach(({ centerX, p0, control, p1 }) => {
    const t = solveQuadraticT(p0.x, control.x, p1.x, centerX);
    const { y: topY } = bezierPoint(p0, control, p1, t);
    parts.push(pathPart('ground', [
      ['M', centerX - doorHalfWidth, topY],
      ['L', centerX + doorHalfWidth, topY],
      ['L', centerX + doorHalfWidth, base.y],
      ['L', centerX - doorHalfWidth, base.y],
      ['Z']
    ]));
  });

  // الصاري: عمود قصير من منتصف تهدّل السقف إلى محور الزينة، يحمل لمبة في قمته
  parts.push(rectPart('mark', HUB.x - 0.7, HUB.y, 1.4, ridgeCenter.y - HUB.y));
  parts.push(circlePart('mark', HUB.x, HUB.y, HUB.r));

  // أشعّة الزينة: أوتاد صلبة تتفرّع من محور الزينة، كل واحدة بلمبة في طرفها —
  // نصف قطرها الخارجي مقصوص عمداً ليبقى بعيداً عن الطوق (انظر التعليق أعلاه)
  const beamCount = detail === 'icon' ? 5 : 7;
  const beamThickness = detail === 'icon' ? 1.6 : 1;
  for (let i = 0; i < beamCount; i += 1) {
    const angle = 20 + ((160 - 20) * i) / (beamCount - 1);
    parts.push(wedgePart(HUB, angle, 5, 19.5, 1.4 * beamThickness, 2.8 * beamThickness));
    const tip = polarPoint(HUB.x, HUB.y, angle, 19.5);
    parts.push(circlePart('mark', tip.x, tip.y, 2.4));
  }

  // حبال الشدّ: فقط في التفصيل الكامل — عند التصغير الشديد تصير خطوطاً مشوَّشة لا حبالاً
  if (detail !== 'icon') {
    parts.push(ropePart(eaveLeft.x, eaveLeft.y, 21, 71, 1.4));
    parts.push(rectPart('mark', 19.5, 70.4, 3, 1.2));
    parts.push(ropePart(eaveRight.x, eaveRight.y, 79, 71, 1.4));
    parts.push(rectPart('mark', 77.5, 70.4, 3, 1.2));
  }

  return parts;
}

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

/**
 * نفس الأجزاء، لكن بخلفية شفافة — تولّد علامة بطاقة المشاركة
 * (‏shareCard.service.js‏) التي لا تحمل مربّع أرضية أصلاً. فتحتا الباب هنا حذف
 * بكسل فعلي (‏`destination-out`‏) لا طلاء بلون الأرضية، إذ لا أرضية صلبة تحتهما
 * تبرّر الطلاء.
 */
function drawShapesTransparent(ctx, parts, u) {
  ctx.fillStyle = MARK;
  parts.filter(p => p.fill === 'mark').forEach(part => {
    tracePart(ctx, part, u);
    ctx.fill();
  });

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  parts.filter(p => p.fill === 'ground').forEach(part => {
    tracePart(ctx, part, u);
    ctx.fill();
  });
  ctx.restore();
}

/**
 * `detail` مستقلّ عن `safeZone` تماماً: الأول يختار مستوى تفصيل الهندسة
 * (كامل أم مبسَّط)، والثاني يختار مقياس الرسم (‏١ أم ١٫١٤). كل مقاس مصدَّر
 * يمرّر الاثنين حسب مكانه — أيقونة صغيرة أو مقصوصة دائرياً تأخذ 'icon'
 * بصرف النظر عن قيمة `safeZone` لديها، والعكس صحيح.
 */
/**
 * تكبير العلامة داخل المربّع. المسار النقطي والمسار المتّجه **يقرآن من هنا
 * معاً** — لو كُرِّر الرقم في الاثنين لانحرفت الأيقونة عن الـSVG بصمت عند أول
 * تعديل، وهو بالضبط نوع الانحراف الذي وُجد `buildMarkParts` لمنعه.
 */
function markScale(safeZone) {
  return safeZone ? 1 : 1.14;
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

/**
 * علامة بطاقة المشاركة وحدها، بخلفية شفافة — لا مربّع أرضية، فالبطاقة نفسها
 * (‏shareCard.service.js‏) تحمل خلفيتها الخاصة. طبقة 'icon' المبسَّطة دائماً:
 * تُرسم صغيرة على البطاقة (‏‎~44px‎) فتذوب لمبات الطوق الكاملة وحبال الشدّ
 * رذاذاً، تماماً كأيقونة تطبيق صغيرة (انظر التعليق أعلى WEB_ICONS).
 */
function renderShareMark(size, { detail = 'icon' } = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const u = size / 100;
  const scale = markScale(false);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-size / 2, -size / 2);
  drawShapesTransparent(ctx, buildMarkParts(detail), u);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// SVG — يُبنى من نفس `buildMarkParts`، لا يُكتب يدوياً أبداً
// ---------------------------------------------------------------------------

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

function shapeToSvgD(shape) {
  if (shape.type === 'circle') {
    const { cx, cy, r } = shape;
    // دائرة كمسار: نصفان مقوَّسان، فلا حاجة لعنصر <circle> منفصل يكسر التجميع في مسار واحد
    return `M ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} Z`;
  }
  return shape.commands
    .map(([type, ...args]) => (type === 'Z' ? 'Z' : `${type} ${args.map(fmt).join(' ')}`))
    .join(' ');
}

function partsToSvgPaths(parts) {
  const markD = parts.filter(p => p.fill === 'mark').map(p => shapeToSvgD(p.shape)).join(' ');
  const groundD = parts.filter(p => p.fill === 'ground').map(p => shapeToSvgD(p.shape)).join(' ');
  return { markD, groundD };
}

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

  console.log('\nserver/src/assets/share — علامة بطاقة المشاركة وحدها، بخلفية شفافة (‏٨٨px‎)');
  write('server/src/assets/share/mark.png', renderShareMark(88, { detail: 'icon' }));

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

module.exports = { drawTent, renderIcon, renderShareMark, buildMarkParts, partsToSvgPaths, buildIconSvg, ringBeads, HUB, GROUND, MARK };
