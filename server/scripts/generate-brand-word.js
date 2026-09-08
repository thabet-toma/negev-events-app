'use strict';

/**
 * سكربت استخراج وتشكيل كلمة «عرس» من خط Cairo-Bold.ttf بواسطة HarfBuzz،
 * وتطبيع إحداثيات المسار إلى المجال [0, 1] نسبةً إلى صندوق الحبر،
 * وتوليد ملف الهندسة الثابتة server/src/utils/brandWord.js.
 *
 * التشغيل من داخل server/:
 *   node scripts/generate-brand-word.js
 */

const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

async function generate() {
  const hb = await import('harfbuzzjs');
  const fontPath = path.join(__dirname, '../src/assets/fonts/Cairo-Bold.ttf');
  const fontBuffer = fs.readFileSync(fontPath);

  // ١. التشكيل العربي عبر HarfBuzz لتحديد المحارف السياقية المتصلة (GSUB) والتقدّمات
  const blob = new hb.Blob(fontBuffer);
  const face = new hb.Face(blob, 0);
  const hbFont = new hb.Font(face);
  const buffer = new hb.Buffer();
  buffer.addText('عرس');
  buffer.guessSegmentProperties();
  hb.shape(hbFont, buffer);

  const glyphsInfo = buffer.getGlyphInfosAndPositions();
  const otFont = opentype.parse(fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength));
  const unitsPerEm = otFont.unitsPerEm; // 1000

  // ٢. استخراج مسارات المحارف وتجميعها على سطر الأساس بالترتيب البصري
  let curX = 0;
  let curY = 0;
  const rawCommands = [];

  for (const info of glyphsInfo) {
    const glyph = otFont.glyphs.get(info.codepoint);
    const p = glyph.getPath(curX + info.xOffset, curY - info.yOffset, unitsPerEm);
    p.commands.forEach(cmd => {
      rawCommands.push(cmd);
    });
    curX += info.xAdvance;
    curY += info.yAdvance;
  }

  // ٣. قياس حدود صندوق الحبر الفعلي (ink bounding box) وأصل الإحداثيات بالنسبة لسطر الأساس
  const tempPath = new opentype.Path();
  tempPath.commands = rawCommands;
  const bbox = tempPath.getBoundingBox();

  const minX = bbox.x1;
  const maxX = bbox.x2;
  const minY = bbox.y1;
  const maxY = bbox.y2;
  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;

  const round5 = n => Math.round(n * 100000) / 100000;
  const normX = x => round5((x - minX) / boxWidth);
  const normY = y => round5((y - minY) / boxHeight);

  // ٤. تطبيع أوامر الرسم إلى المجال [0, 1] نسبة إلى صندوق الحبر
  const normCommands = rawCommands.map(cmd => {
    if (cmd.type === 'M') return ['M', normX(cmd.x), normY(cmd.y)];
    if (cmd.type === 'L') return ['L', normX(cmd.x), normY(cmd.y)];
    if (cmd.type === 'Q') return ['Q', normX(cmd.x1), normY(cmd.y1), normX(cmd.x), normY(cmd.y)];
    if (cmd.type === 'C') return ['C', normX(cmd.x1), normY(cmd.y1), normX(cmd.x2), normY(cmd.y2), normX(cmd.x), normY(cmd.y)];
    if (cmd.type === 'Z') return ['Z'];
    throw new Error(`أمر رسم غير معروف: ${cmd.type}`);
  });

  const now = new Date().toISOString().split('T')[0];
  const targetFile = path.join(__dirname, '../src/utils/brandWord.js');

  const content = `'use strict';

/**
 * مسار متّجه ثابت لكلمة «عرس» مستخرَج من خط Cairo-Bold.ttf ومشكَّل
 * بـHarfBuzz (قواعد GSUB لربط الحروف العربية سياقياً).
 *
 * مطبَّع إلى صندوق حبره الخاص: الإحداثيات في المجال [0, 1] حيث:
 *   س: 0 = حافة الحبر اليمنى/اليسرى، 1 = الطرف المقابل
 *   ص: 0 = أعلى نقطة حبر، 1 = أسفل نقطة حبر
 *
 * أصل صندوق الحبر بوحدات الخط (originX, originY) مسجَّل هنا كي تشتق
 * اختبارات التطابق الإزاحة الدقيقة دون أرقام سحرية مكررة.
 *
 * وُلِّد بواسطة: node scripts/generate-brand-word.js
 * تاريخ التوليد: ${now}
 * لإعادة التوليد: شغّل \`node scripts/generate-brand-word.js\` من داخل server/
 *
 * بلا أي اعتمادية وقت تشغيل على الخط: هذه الهندسة النقية تعمل في المتصفح والـNode
 * دون الحاجة لتحميل ملف .ttf أو محرك تشكيل نصوص.
 */

const BRAND_WORD = {
  width: ${boxWidth},
  height: ${boxHeight},
  aspectRatio: ${round5(boxWidth / boxHeight)},
  originX: ${minX},
  originY: ${minY},
  commands: ${JSON.stringify(normCommands)}
};

module.exports = BRAND_WORD;
`;

  fs.writeFileSync(targetFile, content, 'utf8');
  console.log(`تم توليد ${targetFile}`);
  console.log(`صندوق الحبر: ${boxWidth} × ${boxHeight}، نسبة الأبعاد: ${round5(boxWidth / boxHeight)}`);
  console.log(`أصل الإحداثيات: (${minX}, ${minY})`);
  console.log(`عدد أوامر الرسم: ${normCommands.length}`);
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
