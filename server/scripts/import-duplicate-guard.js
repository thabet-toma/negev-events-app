'use strict';

/**
 * نقطة الفحص الواحدة التي يمرّ بها كل مدخل مناسبة قبل إدراجه من سكربتات
 * الاستيراد (تذكرة #160): `munasabatna-insert.js`، `import-munasabatna.js`،
 * `import-legacy-json.js`.
 *
 * الحارس نفسه هو `events.service.findPossibleDuplicates` — لا نسخة منه هنا،
 * ولا منطق أسماء أو عائلة أو نافذة تاريخ مكرَّر في هذا الملف: السكربت يمرّر
 * الصفّ كما سيُكتب فعلاً (أسماء أصحابه، عائلته، محافظته، مكانه، تاريخه) ويقرأ
 * القرار. فكل ما يُقرَّر هنا هو ما يقرّره الحارس في النشر والاعتماد والتعديل.
 * والاستثناء الوحيد في `import-legacy-json.js`: حين تغيب العائلة يكتب المستورد
 * اسم البلدة في `family_clan`، ولا يمرّره هنا عائلةً — البلدة ليست عائلة،
 * ويقارنها الحارس مكاناً أصلاً؛ تمريرها عائلةً يُخطّئ كل مناسبة في البلدة نفسها.
 *
 * والقرار واحد من اثنين:
 *   { action: 'insert' }        ما في شبهة: يُدرج كما كان السكربت يفعل.
 *   { action: 'skip', match }   يشبه مناسبة قائمة: لا يُكتب في القاعدة إطلاقاً،
 *                               ويُطبع في تقرير التشغيل لمراجعة بشرية.
 *
 * `match` هو أوّل مرشّح من الحارس (فرز الحارس يضع 'certain' قبل 'likely')،
 * وفيه `id` و`title` و`honorees` و`event_date` و`confidence` و`reasons`.
 *
 * ولا يُمرَّر `scope` إلى الحارس: السكربت يعمل من طرف الخادم بلا أدمن بلدة،
 * فمرشّحوه كل مناسبة معتمدة وكل طلب معلَّق (نفس سلوك النداء الداخلي) — وهو
 * الأشدّ، ومكان المطابقة يبقى شرطاً في كل فروع الحارس.
 */

const events = require('../src/services/events.service');

/** درجة الشبه كما يعيدها الحارس، ومعها كلمة عربية للمشغّل. */
const CONFIDENCE_LABELS = { certain: 'شبه مؤكَّدة', likely: 'مشتبهة' };

/** حالة المناسبة القائمة، للمشغّل — لا للمقارنة. */
const STATUS_LABELS = { approved: 'منشورة', pending: 'معلَّقة', rejected: 'مرفوضة' };

function confidenceLabel(confidence) {
  return CONFIDENCE_LABELS[confidence] ? `${confidence} (${CONFIDENCE_LABELS[confidence]})` : confidence;
}

/** حالة الصفّ بالعربية للتقارير — لا تمسّ ما يعيده الخادم. */
function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

/**
 * يفحص مدخل مناسبة واحداً قبل إدراجه.
 *
 * @param {{
 *   names: string[],
 *   family_clan?: string,
 *   region_id?: number|null,
 *   town?: string,
 *   village_id?: number|null,
 *   requested_village_name?: string|null,
 *   event_date: string,
 *   event_end_date?: string|null
 * }} subject القيم النهائية التي سيُكتبها السكربت على الصفّ — لا مدخل العميل الخام.
 * @returns {Promise<{ action: 'insert' } | { action: 'skip', match: object }>}
 */
async function checkImportEntry(subject) {
  if (!subject || !subject.event_date) {
    throw new Error('فحص التكرار يحتاج تاريخ المناسبة (event_date)');
  }
  const [matches] = await events.findPossibleDuplicates([subject]);
  const [match] = matches;
  return match ? { action: 'skip', match } : { action: 'insert' };
}

/**
 * سطر عربي واحد يصف سبب التخطّي: المناسبة القائمة المطابقة (معرّفها وعنوانها
 * وأصحابها وحالتها) ودرجة الشبه وأسبابها. لا تليفون ولا رابط بطاقة — لا شيء
 * حسّاس في التقرير.
 */
function formatDuplicateMatch(match) {
  const title = match.title ? `«${match.title}»` : 'بلا عنوان';
  const honorees = (match.honorees || []).filter(Boolean).join('، ');
  const owners = honorees ? ` — أصحابها: ${honorees}` : '';
  const status = STATUS_LABELS[match.status] ? `، ${STATUS_LABELS[match.status]}` : '';
  const reasons = (match.reasons || []).join('، ');
  return `يشبه المناسبة القائمة #${match.id} ${title} بتاريخ ${match.event_date}${status}${owners}`
    + ` — درجة الشبه: ${confidenceLabel(match.confidence)} — الأسباب: ${reasons || 'غير مذكورة'}`;
}

/**
 * تقرير التشغيل: أربعة أقسام في مخرَج طرفية واحد — «أُدرج»، و«تُخطِّي» (شبه
 * مناسبة قائمة، وفيه المطابقة ودرجتها)، و«موجودة مسبقاً» (بطاقة أُدرجت في
 * تشغيل سابق)، و«مشوّه/متجاهَل» (مدخل ناقص لم يُقرأ أصلاً). المشتبه لا يُدرج
 * أصلاً، فوجوده في قسم التخطّي هو بيانُ ما لم يُكتب لمراجعة بشرية — لا سطر لوج
 * لعملية رُفضت ثم نُفِّذت.
 *
 * وفصل «موجودة مسبقاً» عن «تُخطِّي» مقصود: الثاني مناسبة جديدة أوقفها الحارس،
 * والأولى ليست جديدة أصلاً — وخلط العدّادين يُخفي كم مناسبة أوقفها الحارس فعلاً.
 * وقسم «مشوّه/متجاهَل» يجعل مجموع الأقسام يساوي عدد مدخلات الملف: بلا هذا
 * القسم كانت المدخلات الناقصة تُسقَط في صمت فيبدو العدد أقلّ من الحقيقة.
 */
function createImportReport() {
  const inserted = [];
  const present = [];
  const skipped = [];
  const malformed = [];

  return {
    inserted(title, detail = '') {
      inserted.push({ title, detail });
    },
    present(title, detail = '') {
      present.push({ title, detail });
    },
    skipped(title, reason) {
      skipped.push({ title, reason });
    },
    malformed(title, reason) {
      malformed.push({ title, reason });
    },
    counts() {
      return {
        inserted: inserted.length,
        skipped: skipped.length,
        present: present.length,
        malformed: malformed.length
      };
    },
    print(emit = console.log) {
      emit('========== تقرير الاستيراد ==========');
      emit(`— أُدرج (${inserted.length}) —`);
      if (!inserted.length) emit('  (لا شيء)');
      inserted.forEach((row, index) => {
        emit(`  ${index + 1}. «${row.title}»${row.detail ? ` — ${row.detail}` : ''}`);
      });
      emit(`— تُخطِّي (${skipped.length}) —`);
      if (!skipped.length) emit('  (لا شيء)');
      skipped.forEach((row, index) => {
        emit(`  ${index + 1}. «${row.title}» — ${row.reason}`);
      });
      emit(`— موجودة مسبقاً (${present.length}) —`);
      if (!present.length) emit('  (لا شيء)');
      present.forEach((row, index) => {
        emit(`  ${index + 1}. «${row.title}»${row.detail ? ` — ${row.detail}` : ''}`);
      });
      emit(`— مشوّه/متجاهَل (${malformed.length}) —`);
      if (!malformed.length) emit('  (لا شيء)');
      malformed.forEach((row, index) => {
        emit(`  ${index + 1}. «${row.title}» — ${row.reason}`);
      });
      emit(`الخلاصة: أُدرج ${inserted.length} · تُخطِّي ${skipped.length}`
        + ` · موجودة مسبقاً ${present.length} · مشوّه ${malformed.length}`
        + ` · المجموع ${inserted.length + skipped.length + present.length + malformed.length}`);
    }
  };
}

module.exports = { checkImportEntry, formatDuplicateMatch, statusLabel, createImportReport };
