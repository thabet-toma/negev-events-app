'use strict';

/**
 * The one privacy notice this platform states (issue #44, privacy layer part
 * 4) — a dedicated module, not inline in a route handler, and served from
 * the server so web/ and mobile/ render the same Arabic text instead of two
 * that drift apart.
 *
 * Answers four questions: what is collected, why, how long it is kept, and
 * who sees it. Every behavioural event name is enumerated from the closed
 * ANALYTICS_EVENTS list itself (constants.js) — never retyped here — so the
 * notice cannot silently fall out of date when that list changes. That is
 * exactly why ANALYTICS_EVENTS is code-owned instead of living in a doc.
 *
 * This notice also covers what predates this branch and is NOT part of it —
 * the obligation exists today, not once this ships:
 *   - story_views and story_clicks already carry a user id today;
 *   - story_views.viewer_town already records the viewer's OWN town, which
 *     contradicts this branch's own rule (content town only, never viewer
 *     town). Whether to stop writing it is an open, undecided question and
 *     out of scope here — disclosing it honestly is the obligation, changing
 *     the behaviour is not.
 * Omitting either from the notice because they predate this branch would be
 * worse than saying nothing at all.
 */

const { ANALYTICS_EVENTS, PRIVACY_REQUEST_DEADLINE_DAYS } = require('./constants');
const { RETENTION_DAYS } = require('./services/analytics.service');

// The Arabic label, never the code key: this text is read by the people the
// data is about, and a list of English identifiers informs nobody.
function eventLabel(event) {
  return event.countOnly
    ? `${event.label} (بلا هوية — لا يُسجَّل معه أي معرّف مستخدم أو جهاز)`
    : event.label;
}

function buildNoticeText() {
  const eventList = ANALYTICS_EVENTS.map(eventLabel).join('، ');

  return [
    'إشعار الخصوصية — منصة مناسبات النقب',
    '',
    '1) ماذا نجمع؟',
    `نُسجّل ما يفعله المستخدم في التطبيق، لا ما يقرأه فيه: ${eventList}.`,
    'الأحداث المعلَّمة "بلا هوية" هي عدّاد فقط ولا تُسجَّل أبداً مع معرّف مستخدم أو جهاز، ' +
      'أما بقية الأحداث فقد تحمل معرّف المستخدم (إن كان مسجَّل الدخول) أو معرّف الجهاز.',
    '',
    'إلى جانب هذه القائمة، يجمع النظام اليوم أيضاً — وهذا سلوك سابق لهذه الطبقة ولا يزال قائماً كما هو:',
    '- مشاهدات القصص ونقراتها — وكلتاهما قد تحملان معرّف المستخدم عند تسجيل الدخول.',
    '- مشاهدات القصص تُسجّل أيضاً بلدة المُشاهِد نفسه لا بلدة المحتوى فقط — ' +
      'رغم أن قاعدة هذه الطبقة الجديدة تُسجّل بلدة المحتوى وحدها لا بلدة الزائر أبداً. ' +
      'وقف تسجيل بلدة المُشاهِد في القصص مسألة مفتوحة لم تُحسَم بعد.',
    '',
    '2) لماذا نجمعها؟',
    'لفهم استخدام التطبيق وتحسين الخدمة — الأعطال، الميزات الأكثر استعمالاً — لا لبناء ملف تسويقي أو سلوكي عن أي شخص.',
    '',
    '3) كم تبقى محفوظة؟',
    `${RETENTION_DAYS} يوماً مرتبطة بهوية صاحبها، ثم تُطوى في عدّادات يومية مجهولة الهوية ` +
      '(رقم إجمالي فقط، بلا أي معرّف مستخدم أو جهاز) وتُحذف الصفوف الأصلية نهائياً.',
    '',
    '4) من يطّلع عليها؟',
    'المدير العام للمنصّة وحده يستطيع الاطلاع على إحصاءات مجمَّعة — عدد لكل نوع حدث. ' +
      'لا توجد شاشة لعرض سجل شخص بعينه، ولا يملك مدير بلدة أي صلاحية هنا.',
    '',
    'سجل الوصول للخادم',
    'سجل الوصول (access log) للخادم لا يحتفظ بعنوان IP الزائر.',
    '',
    'رفض التحليلات السلوكية',
    'يمكن رفض التحليلات السلوكية في أي وقت من صفحة «حسابي» — ولا تتعطّل بذلك أي ميزة ' +
      'في التطبيق، ولا يتغيّر شيء مما يمكنك فعله فيه.',
    '',
    'طلب الاطلاع أو الحذف',
    'يمكن حذف بيانات التحليلات الخاصة بك فوراً من صفحة «حسابي». ويمكن أيضاً تقديم طلب ' +
      `للاطلاع على ما سُجّل عنك أو لمحوه، ويُعالَج خلال ${PRIVACY_REQUEST_DEADLINE_DAYS} يوماً.`
  ].join('\n');
}

/** Structured + plain-text notice, for a client to render however it likes. */
function getPrivacyNotice() {
  return {
    retention_days: RETENTION_DAYS,
    request_deadline_days: PRIVACY_REQUEST_DEADLINE_DAYS,
    events: ANALYTICS_EVENTS.map(event => ({ key: event.key, label: event.label, count_only: event.countOnly })),
    text: buildNoticeText()
  };
}

module.exports = { getPrivacyNotice };
