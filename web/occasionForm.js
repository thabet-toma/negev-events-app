/*
 * ما تتشاركه شاشتا النشر فعلياً — نموذج الموقع العام (app.js) ونموذج النشر
 * المباشر في لوحة الإدارة (admin.js) — بما فيه الآن مفكّ شفرة الحقول
 * (switch field_key) نفسه: الحقول الأربعة عشر تُبنى مرّة واحدة هنا، لا
 * مرّتين. ما يختلف فعلاً بين الشاشتين — بادئة معرّفات DOM، أسماء معالجات
 * onchange (أو غيابها في اللوحة: لا فحص تعارض حيّ ولا خريطة تُعاد توسيطها
 * هناك)، وأربعة حقول ذات معالجة غنية لا تملكها اللوحة (خريطة الموقع، محرِّر
 * القص، صندوقا الرفع المزخرَفان للصوت وصورة الفنان) — يبقى بارامترات تمرّرها
 * كل صفحة لـ`buildOccasionFieldsHtml`، لا نسخة ثانية من الحقول الأخرى.
 *
 * يعتمد هذا الملف على escapeHtml بلا تعريفها هنا — كل من app.js وadmin.js
 * يُعرّفها إعلان دالة top-level خاصاً به (تكرار سابق لهذا التغيير، لا يُلمَس
 * هنا)، فتكون عامة على window بحلول أول استدعاء فعلي لدوال هذا الملف (بعد
 * تحميل الصفحة بالكامل)، بصرف النظر عن ترتيب وسوم <script>. صفحة ثالثة تُحمِّل
 * occasionForm.js دون أن تُعرِّف escapeHtml بنفسها ستفشل بـReferenceError عند
 * أول استدعاء لأي دالة هنا تبني HTML.
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

// حقول تُعامَل كملفات رفع لا نص — نفس القائمة التي كانت مكرَّرة داخل
// renderOccasionForm (app.js) وحدها من قبل؛ تُستعمَل فقط حين ctx.groupUploads
// صحيحة (الموقع العام يفصلها في قسم "upload-section" بصري، اللوحة لا).
const OCCASION_UPLOAD_FIELD_KEYS = ['poster_url', 'audio_url', 'artist_image_url'];

/**
 * يبني HTML كل حقول نوع مناسبة مُختار، بترتيب position، ويستدعيها كل من
 * app.js (نموذج النشر العام) وadmin.js (نموذج النشر المباشر) بدل تكرار نفس
 * الحقول الأربعة عشر في كل ملف.
 *
 * ctx: {
 *   idPrefix: 'add' | 'dir' — يُلحَق بكل معرّف DOM يُولَّد؛ الفارق الوحيد
 *     الحقيقي بين الشاشتين في شكل المعرّفات،
 *   renderHonoreeAddButton(containerId): string — زرّ «إضافة اسم» بأسلوب كل
 *     صفحة (صنف CSS مختلف تماماً بين styles.css وadmin.css)، إلزامي،
 *   onTownChange / onVillageChange / onDateChange: اسم دالة onchange (نصّاً)
 *     أو null/undefined لإسقاط السمة كلياً — اللوحة لا تملك فحص تعارض حيّ
 *     ولا خريطة تُعاد توسيطها عند تغيير القرية، فتمرّر null لهما،
 *   overrides: { field_key: (field) => string } اختياري — استبدال كامل
 *     لحقل بعينه؛ الموقع العام وحده يستعملها (location_name، poster_url،
 *     audio_url، artist_image_url) ليحتفظ بمعالجته الغنية (خريطة Leaflet،
 *     محرِّر قص، صندوق رفع مزخرَف) التي لا تحتاجها اللوحة ولا تملك CSS لها،
 *   groupUploads: boolean — لفّ حقول الرفع الثلاثة في `.upload-section`
 *     واحد، كما يفعل الموقع العام؛ اللوحة تُبقيها مسطَّحة كما كانت دائماً.
 * }
 */
function buildOccasionFieldsHtml(type, ctx) {
  const orderedFields = [...type.fields].sort((a, b) => a.position - b.position);

  if (!ctx.groupUploads) {
    return orderedFields.map(field => renderOccasionFieldHtml(field, ctx)).join('');
  }

  const uploadFields = orderedFields.filter(f => OCCASION_UPLOAD_FIELD_KEYS.includes(f.field_key));
  const otherFields = orderedFields.filter(f => !OCCASION_UPLOAD_FIELD_KEYS.includes(f.field_key));

  let html = otherFields.map(field => renderOccasionFieldHtml(field, ctx)).join('');
  if (uploadFields.length) {
    html += `<div class="upload-section">${uploadFields.map(field => renderOccasionFieldHtml(field, ctx)).join('')}</div>`;
  }
  return html;
}

/** حقول المناسبة المعروفة (server/src/constants.js) — كل نوع يختار الظاهر منها فقط، هذا الجدول لا يخترع حقلاً جديداً. */
function renderOccasionFieldHtml(field, ctx) {
  const override = ctx.overrides && ctx.overrides[field.field_key];
  if (override) return override(field);

  const req = field.is_required ? ' *' : '';
  const label = escapeHtml(field.label);
  const p = ctx.idPrefix;
  const attr = (handlerName, attrName = 'onchange') => (handlerName ? ` ${attrName}="${handlerName}()"` : '');

  switch (field.field_key) {
    case 'honorees':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <div id="${p}HonoreesList"></div>
          ${ctx.renderHonoreeAddButton(`${p}HonoreesList`)}
        </div>`;
    case 'town':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <select id="${p}Town"${attr(ctx.onTownChange)}></select>
        </div>
        <!-- يظهر فقط تحت بند "القرى والتجمعات" — إلزامي عندها (خريطة #21) -->
        <div class="form-group" id="${p}VillageGroup" style="display:none;">
          <label>القرية *</label>
          <select id="${p}Village"${attr(ctx.onVillageChange)}></select>
        </div>`;
    case 'event_date':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="date" id="${p}EventDate"${attr(ctx.onDateChange)}>
        </div>`;
    case 'event_end_date':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="date" id="${p}EventEndDate"${attr(ctx.onDateChange)}>
        </div>`;
    case 'youth_party_date':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="date" id="${p}YouthDate">
        </div>`;
    case 'dinner_time':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="${p}DinnerTime" placeholder="مثال: 7:30 مساءً">
        </div>`;
    case 'host_phone':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="tel" id="${p}HostPhone" placeholder="05XXXXXXXX">
        </div>`;
    case 'title':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="${p}Title" placeholder="اتركه فارغاً ليُولَّد تلقائياً">
        </div>`;
    case 'family_clan':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="${p}Family" placeholder="مثال: آل الأطرش">
        </div>`;
    case 'location_name':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="${p}LocationName" placeholder="مثال: ديوان آل فلان بالقرب من الدوار الشرقي">
        </div>`;
    case 'secondary_location_name':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="${p}SecondaryLocationName" placeholder="مكان إضافي (اختياري)">
        </div>`;
    case 'poster_url':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="file" id="${p}PosterFile" accept="image/*">
        </div>`;
    case 'audio_url':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="file" id="${p}AudioFile" accept="audio/*">
        </div>`;
    case 'audio_title':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="${p}AudioTitle" placeholder="مثال: شيلة الترحيب">
        </div>`;
    case 'artist_name':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="${p}ArtistName" placeholder="مثال: عيسى الشمري">
        </div>`;
    case 'artist_image_url':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="file" id="${p}ArtistImageFile" accept="image/*">
        </div>`;
    default:
      return '';
  }
}
