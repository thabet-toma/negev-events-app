/*
 * ما تتشاركه شاشتا النشر فعلياً — نموذج الموقع العام (app.js) ونموذج النشر
 * المباشر في لوحة الإدارة (admin.js) — لا غير. كل ما يختلف بين الشاشتين
 * (معرّفات DOM، وجود خريطة أو محرِّر قص، شكل الحقول) يبقى مكتوباً في ملفه،
 * ولا يُقحَم هنا؛ نسخة ثانية من منطق بناء نموذج كامل هي عطل انحراف مؤجَّل.
 */

/** أنواع المناسبات النشِطة بحقولها الظاهرة — GET /api/occasion-types عام، لا يحتاج رمز دخول. */
async function fetchActiveOccasionTypes() {
  try {
    const res = await apiFetch('/api/occasion-types');
    const data = await res.json();
    return (data.success && data.types) ? data.types : [];
  } catch (e) {
    console.error('Occasion types error:', e);
    return [];
  }
}

// أصحاب المناسبة ١..N — مُدخل ديناميكي تستعمله ثلاث شاشات: نموذج النشر العام،
// نافذة تعديل مناسبتي، ونموذج النشر المباشر في اللوحة.
/** يضيف صفّاً جديداً (اسم + صفة اختيارية) إلى قائمة أصحاب مناسبة. */
function addHonoreeRow(containerId, name = '', role = '') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'honoree-row';
  row.innerHTML = `
    <input type="text" class="honoree-name" placeholder="الاسم" value="${escapeHtml(name)}">
    <input type="text" class="honoree-role" placeholder="الصفة (اختياري)" value="${escapeHtml(role)}">
    <button type="button" class="nokoot-del-btn" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
  `;
  container.appendChild(row);
}

/** يقرأ كل صفوف القائمة الحالية، ويُسقط أي صفّ بلا اسم — نفس منطق الخادم بالضبط. */
function collectHonorees(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('.honoree-row'))
    .map(row => ({
      name: row.querySelector('.honoree-name').value.trim(),
      role: row.querySelector('.honoree-role').value.trim()
    }))
    .filter(h => h.name);
}

/**
 * يُرفق أصحاب المناسبة داخل FormData بصيغة `honorees[i][name]` —
 * تحقّقنا فعلياً (اختبار مباشر على multer المُثبَّت في server/) أن هذه
 * الصيغة، وحدها من بين الصيغ الممكنة عبر multipart، تصل إلى الخادم كمصفوفة
 * كائنات `{name, role}` كما يتوقعها `parseHonorees` — لا JSON.stringify ولا
 * تكرار الحقل باسم واحد (ذاك يصل كمصفوفة نصوص، فيُسقَط بالكامل).
 */
function appendHonoreesToFormData(formData, honorees) {
  honorees.forEach((h, i) => {
    formData.append(`honorees[${i}][name]`, h.name);
    if (h.role) formData.append(`honorees[${i}][role]`, h.role);
  });
}

/**
 * يطابق تحقّق الخادم نفسه (events.routes.js: buildOptionalFieldFormatters):
 * كل حقل ظاهر وإجباري على هذا النوع تحديداً — عدا الثلاثة البنيوية
 * (أصحاب المناسبة، البلدة، تاريخ المناسبة، التي يتحقق منها كل نموذج على حدة
 * برسالة خاصة بها) — يجب أن يحمل قيمة. تُعيد تسمية أول حقل ناقص، أو null إن
 * اكتمل كل شيء؛ الصفحة المستدعية هي من تملك `valueGetters` (معرّفاتها الخاصة).
 */
function firstMissingRequiredField(type, valueGetters) {
  for (const field of type.fields) {
    if (!field.is_required || field.field_key === 'honorees' || field.field_key === 'town' || field.field_key === 'event_date') continue;
    const getter = valueGetters[field.field_key];
    const value = getter ? getter() : null;
    if (!value) return field.label;
  }
  return null;
}
