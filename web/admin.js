let adminToken = localStorage.getItem('negev_admin_token') || null;
let allAdminEvents = [];
let currentFilterStatus = 'all';
let searchKeyword = '';
let allOccasionTypes = [];
let editingOccasionTypeId = null;
let allServiceProviders = [];
let allPublicCategories = [];
let editingProviderId = null;
let allVillages = [];
let editingVillageId = null;
let allServiceCategories = [];
let editingServiceCategoryId = null;
let allAdminsWithTowns = [];
let myAdminTowns = [];

// حالة نموذج تعديل المناسبة (#43) — النموذج نفسه يُبنى ديناميكياً في JS (لا لمس
// لـadmin.html هنا)، فحالته تعيش هنا مع بقية حالة اللوحة.
let editingEventId = null;
let editingEventOriginal = null; // القيم الأصلية للمقارنة عند الحفظ — إرسال الفرق فقط (قيد ٤)
let allTownVillages = []; // من GET /api/towns، لا GET /api/admin/villages (قيد ٣ — الأخير 403 لأدمن محلي)
let townVillagesFetchAttempted = false;

// مرآة لـ TOWNS في server/src/constants.js — لا وحدة مشتركة بين web/ والخادم،
// نفس سبب OCCASION_FIELDS أدناه ونفس نمط قائمة dirTown في admin.html (services-directory).
const TOWNS = [
  'رهط', 'حورة', 'تل السبع', 'كسيفة', 'شقيب السلام', 'اللقية', 'عرعرة النقب', 'القرى والتجمعات'
];

// مرآة لـ VILLAGES_TOWN في server/src/constants.js — البلدة الوحيدة التي تقبل village_id.
const VILLAGES_TOWN = 'القرى والتجمعات';

// مرآة لـ CRITICAL_AMENDMENT_FIELDS في server/src/services/events.service.js —
// تعديل أيّ منها على مناسبة معتمدة يعيدها إلى pending (قيد ١). تُستخدم هنا
// فقط لتحذير المستخدم قبل الحفظ وتمييز الحقول بصرياً؛ التصنيف الحقيقي يبقى
// من الخادم دائماً (result.amendment في الاستجابة).
const CRITICAL_AMENDMENT_FIELDS = ['event_date', 'event_end_date', 'town', 'village_id', 'location_name', 'latitude', 'longitude'];

/** الدور المخزَّن محلياً — ادّعاء العميل، يُتحقّق منه فعلياً في كل 403 يرجعه الخادم (نفس منطق fetchOccasionTypes القائم). */
function currentAdminRole() {
  return localStorage.getItem('negev_admin_role') || '';
}
function isSuperAdminRole() {
  return currentAdminRole() === 'super_admin';
}

// مرآة لـ server/src/constants.js — لا وحدة مشتركة بين web/ والخادم، فالمفردات
// تُنسخ هنا حرفياً كما تُنسخ TOWNS أعلاه في admin.html (#20 خطوة 16).
const OCCASION_FIELDS = [
  { key: 'honorees', label: 'أصحاب المناسبة', core: true },
  { key: 'title', label: 'العنوان', core: false },
  { key: 'family_clan', label: 'العائلة/العشيرة', core: false },
  { key: 'town', label: 'البلدة', core: true },
  { key: 'location_name', label: 'المكان', core: false },
  { key: 'secondary_location_name', label: 'مكان إضافي', core: false },
  { key: 'event_date', label: 'تاريخ المناسبة', core: true },
  { key: 'event_end_date', label: 'تاريخ الانتهاء', core: false },
  { key: 'youth_party_date', label: 'سهرة الشباب', core: false },
  { key: 'dinner_time', label: 'وقت العشاء', core: false },
  { key: 'poster_url', label: 'صورة الملصق', core: false },
  { key: 'audio_url', label: 'الملف الصوتي', core: false },
  { key: 'audio_title', label: 'عنوان المقطع الصوتي', core: false },
  { key: 'host_phone', label: 'رقم التواصل', core: false }
];

const REACTION_TYPES_LABELS = {
  coffee: '☕ قهوة',
  horse: '🐎 خيل',
  fireworks: '🎆 ألعاب نارية',
  rose: '🌹 وردة',
  hand: '🤝 مصافحة'
};

document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    showDashboard();
  } else {
    showLogin();
  }

  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('dirDate');
  if (dateInput) dateInput.value = today;
});

// 1. Admin Authentication
async function handleAdminLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('adminPhone').value.trim();
  const pin = document.getElementById('adminPin').value.trim();
  const btn = document.getElementById('adminLoginBtn');

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';
  btn.disabled = true;

  try {
    const res = await apiFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, pin_code: pin })
    });
    const data = await res.json();

    if (data.success) {
      adminToken = data.token;
      localStorage.setItem('negev_admin_token', adminToken);
      localStorage.setItem('negev_admin_role', (data.user && data.user.role) || '');
      showDashboard();
    } else {
      alert(data.message || 'رمز الدخول غير صحيح');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> دخول مركز القيادة';
    btn.disabled = false;
  }
}

function handleAdminLogout() {
  localStorage.removeItem('negev_admin_token');
  localStorage.removeItem('negev_admin_role');
  adminToken = null;
  showLogin();
}

function showLogin() {
  document.getElementById('adminLoginScreen').style.display = 'flex';
  document.getElementById('adminDashboardScreen').style.display = 'none';
}

function showDashboard() {
  document.getElementById('adminLoginScreen').style.display = 'none';
  document.getElementById('adminDashboardScreen').style.display = 'block';

  applyRoleVisibility();
  loadAdminDashboard();
}

/*
 * كل مسار خلف requireSuperAdmin (المستخدمون، البث، الستوريات/أنواع المناسبات،
 * القرى، فئات الخدمات، الأدمن والبلدات) يُخفى تبويبه كلياً عن أدمن عادي — لا
 * يُعطَّل بل يغيب، لأن الزرّ المعطَّل تسريبٌ لـ403 إلى الواجهة (قاعدة اللوحة في
 * المواصفة). الدور المخزَّن ادّعاء محلي قد يكون قديماً؛ التحقق الحقيقي يبقى من
 * الخادم نفسه (403) في كل جلب — هذه الدالة تتحكم بالعرض الأولي فقط.
 */
function applyRoleVisibility() {
  const isSuperAdmin = isSuperAdminRole();
  const superAdminOnlyBtnIds = [
    'tabBroadcastBtn', 'tabUsersBtn', 'tabOccasionTypesBtn',
    'tabVillagesBtn', 'tabServiceCategoriesBtn', 'tabAdminsBtn'
  ];
  superAdminOnlyBtnIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = isSuperAdmin ? 'flex' : 'none';
  });

  const usersCard = document.getElementById('usersStatCard');
  if (usersCard) usersCard.style.display = isSuperAdmin ? 'flex' : 'none';

  // إن كان التبويب النشِط الآن محجوباً عن هذا الدور (جلسة سوبر أدمن سابقة
  // ثم دخول أدمن محلي بنفس المتصفح)، ارجع لتبويب متاح للجميع.
  const activePane = document.querySelector('.admin-tab-pane.active-pane');
  const hiddenPaneIds = superAdminOnlyBtnIds.map(id => id.replace(/Btn$/, ''));
  if (!isSuperAdmin && activePane && hiddenPaneIds.includes(activePane.id)) {
    switchAdminTab('tabEvents');
  }
}

// 2. Load Dashboard Stats & Events
async function loadAdminDashboard() {
  const isSuperAdmin = isSuperAdminRole();

  const tasks = [
    fetchAdminIdentity(),
    fetchKPIStats(),
    fetchAdminEvents(),
    fetchAdminComments(),
    fetchPublicServiceCategories(),
    fetchAdminServiceProviders(),
    fetchTownVillages()
  ];
  if (isSuperAdmin) {
    tasks.push(fetchAdminUsers(), fetchOccasionTypes(), fetchAdminVillages(), fetchAdminServiceCategories(), fetchAdminAdmins());
  }
  await Promise.all(tasks);
  renderScopeBanner();
}

/*
 * بلدات الأدمن كما يقولها الخادم نفسه (`GET /api/admin/me`)، لا كما تُستنتج من
 * مناسباته. الاستنتاج كان يفوّت بلدة أُسنِدت للتوّ ولا مناسبة لها بعد — وهي حالة
 * الأدمن الجديد بالضبط، أي الشخص الذي تربكه لوحة فارغة أكثر من غيره (قصة 36).
 */
function deriveScopedTowns() {
  return myAdminTowns;
}

async function fetchAdminIdentity() {
  // مرّتان كان هذا النداء يسقط بصمت: مساره كان '/admin/me' بلا بادئة
  // '/api' التي يحملها كل نداء آخر في هذا الملف، و`adminFetch` تُرجع
  // `Response` لا جسمها — فكان `data.towns` دائماً `undefined` و`myAdminTowns`
  // دائماً فارغة، أي أنّ شريط النطاق يقول 'لا بلدات' لكل أدمن محلي منذ شحن
  // الميزة. الفشل صامت لأن الاستدعاء داخل `Promise.all` بلا فحص `res.ok`.
  try {
    const res = await adminFetch('/api/admin/me');
    const data = await res.json();
    myAdminTowns = Array.isArray(data.towns) ? data.towns : [];
  } catch (e) {
    console.error('admin identity error:', e);
    myAdminTowns = [];
  }
}

/** شريط «تدير: رهط · اللقية» — قصة 21. */
function renderScopeBanner() {
  const el = document.getElementById('adminScopeBanner');
  if (!el) return;

  if (isSuperAdminRole()) {
    el.style.display = 'flex';
    el.classList.remove('scope-banner-empty');
    el.innerHTML = '<i class="fa-solid fa-earth-africa"></i> صلاحية سوبر أدمن — تدير كل بلدات المنصة بلا استثناء';
    return;
  }

  const towns = deriveScopedTowns();
  el.style.display = 'flex';
  if (towns.length) {
    el.classList.remove('scope-banner-empty');
    el.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> تدير: ${towns.map(escapeHtml).join(' · ')}`;
  } else {
    el.classList.add('scope-banner-empty');
    el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> لا تدير أي بلدة بعد — لن ترى أي مناسبة أو مزوّد خدمات حتى يُسنِد السوبر أدمن بلدة لحسابك';
  }
}

async function fetchKPIStats() {
  try {
    const res = await adminFetch('/api/admin/stats');
    const data = await res.json();

    if (data.success) {
      document.getElementById('kpiPending').textContent = data.stats.pendingEvents;
      document.getElementById('kpiApproved').textContent = data.stats.approvedEvents;
      document.getElementById('kpiUsers').textContent = data.stats.totalUsers;
      document.getElementById('kpiComments').textContent = data.stats.totalCongrats;
      
      const badge = document.getElementById('pendingBadgeCount');
      if (badge) badge.textContent = data.stats.pendingEvents;
    }
  } catch (e) {
    console.error('KPI error:', e);
  }
}

async function fetchAdminEvents() {
  try {
    const res = await adminFetch('/api/admin/events');
    const data = await res.json();

    if (data.success) {
      allAdminEvents = data.events;
      renderAdminEvents();
    }
  } catch (e) {
    console.error('Fetch admin events error:', e);
  }
}

function renderAdminEvents() {
  const container = document.getElementById('adminEventsList');
  let filtered = [...allAdminEvents];

  if (currentFilterStatus !== 'all') {
    filtered = filtered.filter(e => e.status === currentFilterStatus);
  }

  if (searchKeyword) {
    filtered = filtered.filter(e => 
      e.groom_name.includes(searchKeyword) ||
      e.town.includes(searchKeyword) ||
      (e.family_clan && e.family_clan.includes(searchKeyword))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; color: var(--gold-main); margin-bottom: 10px;"></i>
        <p>لا توجد مناسبات في هذا القسم حالياً</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(evt => {
    let statusLabel = 'قيد المراجعة 🟡';
    let statusClass = 'pending';
    if (evt.status === 'approved') {
      statusLabel = 'معتمدة ومنشورة 🟢';
      statusClass = 'approved';
    } else if (evt.status === 'rejected') {
      statusLabel = 'مرفوضة 🔴';
      statusClass = 'rejected';
    }

    return `
      <div class="admin-event-card status-${evt.status || 'pending'}">
        <div class="admin-card-top">
          <span class="status-tag ${statusClass}">${statusLabel}</span>
          <span style="font-size: 0.78rem; color: var(--gold-main);">${escapeHtml(evt.town)}</span>
        </div>

        ${evt.poster_url ? `<img src="${evt.poster_url}" class="admin-card-poster" alt="poster">` : ''}

        <div class="admin-card-content">
          <h3>${escapeHtml(evt.title)}</h3>
          
          <div class="admin-card-meta">
            <span><strong>العريس:</strong> ${escapeHtml(evt.groom_name)}</span>
            <span><strong>التاريخ:</strong> ${evt.event_date}</span>
            <span><strong>الموقع:</strong> ${escapeHtml(evt.location_name)}</span>
            ${evt.host_phone ? `<span><strong>هاتف المعلن:</strong> <a href="tel:${evt.host_phone}" style="color:var(--gold-main);">${evt.host_phone}</a></span>` : ''}
          </div>

          <!-- Actions -->
          <div class="admin-card-actions">
            ${evt.status !== 'approved' ? `
              <button class="btn-approve" onclick="updateEventStatus(${evt.id}, 'approved')">
                <i class="fa-solid fa-check"></i> اعتماد ونشر
              </button>
            ` : `
              <button class="btn-reject" onclick="updateEventStatus(${evt.id}, 'rejected')">
                <i class="fa-solid fa-ban"></i> إيقاف النشر
              </button>
            `}
            
            ${evt.status === 'pending' ? `
              <button class="btn-reject" onclick="updateEventStatus(${evt.id}, 'rejected')">
                <i class="fa-solid fa-xmark"></i> رفض
              </button>
            ` : ''}

            <button class="btn-approve" onclick="openEventEditForm(${evt.id})">
              <i class="fa-solid fa-pen"></i> تعديل
            </button>

            <button class="btn-delete" onclick="deleteAdminEvent(${evt.id})" title="حذف نهائي">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>

        </div>
      </div>
    `;
  }).join('');
}

// 3. Status Actions (Approve / Reject / Delete)
async function updateEventStatus(id, newStatus) {
  try {
    const res = await adminFetch(`/api/admin/events/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();

    if (data.success) {
      fetchKPIStats();
      fetchAdminEvents();
    } else {
      alert(data.message || 'حدث خطأ أثناء التحديث');
    }
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  }
}

async function deleteAdminEvent(id) {
  if (!confirm('هل أنت متأكد من حذف هذه المناسبة نهائياً؟ لا يمكن التراجع عن ذلك.')) return;
  try {
    const res = await adminFetch(`/api/admin/events/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchKPIStats();
      fetchAdminEvents();
    }
  } catch (e) {
    alert('تعذر الحذف');
  }
}

// 4. Direct Publish by Admin
async function handleDirectAdd(e) {
  e.preventDefault();
  const btn = document.getElementById('dirSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري النشر...';

  const formData = new FormData();
  formData.append('groom_name', document.getElementById('dirGroom').value);
  formData.append('town', document.getElementById('dirTown').value);
  formData.append('family_clan', document.getElementById('dirClan').value);
  formData.append('event_date', document.getElementById('dirDate').value);
  formData.append('youth_party_date', document.getElementById('dirYouthDate').value);
  formData.append('dinner_time', document.getElementById('dirDinner').value);
  formData.append('location_name', document.getElementById('dirLocation').value);

  const poster = document.getElementById('dirPoster').files[0];
  if (poster) formData.append('poster', poster);

  const audio = document.getElementById('dirAudio').files[0];
  if (audio) formData.append('audio', audio);

  try {
    // The admin JWT is what authorises immediate publishing.
    const res = await adminFetch('/api/events', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      alert('🎉 تم نشر المناسبة بنجاح كمعتمدة مباشرة!');
      document.getElementById('adminDirectAddForm').reset();
      switchAdminTab('tabEvents');
      fetchKPIStats();
      fetchAdminEvents();
    } else {
      alert(data.message || 'حدث خطأ');
    }
  } catch (e) {
    alert('تعذر النشر');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check-double"></i> اعتماد ونشر المناسبة فوراً';
  }
}

// 5. Send Broadcast Notification
async function handleSendBroadcast(e) {
  e.preventDefault();
  const title = document.getElementById('broadcastTitleInput').value.trim();
  const message = document.getElementById('broadcastMessageInput').value.trim();
  const btn = document.getElementById('sendBroadcastBtn');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري البث...';

  try {
    const res = await adminFetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message })
    });
    const data = await res.json();

    if (data.success) {
      alert('📢 تم بث الإشعار بنجاح لجميع شاشات المستخدمين المتصلين!');
      document.getElementById('broadcastMessageInput').value = '';
    } else {
      alert(data.message || 'فشل إرسال البث');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال البث لجميع الشاشات الآن';
  }
}

// 6. Comments Moderation — حجب لا حذف (#20 قصص 26-27-37-39)
async function fetchAdminComments() {
  try {
    const res = await adminFetch('/api/admin/comments');
    const data = await res.json();

    if (data.success) {
      renderAdminComments(data.comments);
    }
  } catch (e) {
    console.error('Comments error:', e);
  }
}

function renderAdminComments(comments) {
  const container = document.getElementById('adminCommentsList');
  if (!container) return;

  if (!comments.length) {
    container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:20px;">لا توجد تعليقات</p>';
    return;
  }

  const STATUS_LABEL = { pending: 'بانتظار المراجعة 🟡', approved: 'ظاهرة 🟢', hidden: 'محجوبة 🔴' };
  const STATUS_CLASS = { pending: 'pending', approved: 'approved', hidden: 'rejected' };

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>المرسل</th>
          <th>الرتبة</th>
          <th>نص التهنئة / الرسالة</th>
          <th>المناسبة</th>
          <th>الحالة</th>
          <th>التاريخ</th>
          <th>الإجراء</th>
        </tr>
      </thead>
      <tbody>
        ${comments.map(c => `
          <tr>
            <td><strong>${escapeHtml(c.sender_name)}</strong></td>
            <td><span style="color:var(--gold-main);">${escapeHtml(c.badge_title || '')}</span></td>
            <td>${escapeHtml(c.message)}</td>
            <td style="font-size:0.8rem; color:var(--text-dim);">${escapeHtml(c.event_title || '')}</td>
            <td>
              <span class="status-tag ${STATUS_CLASS[c.status] || 'pending'}">${STATUS_LABEL[c.status] || c.status}</span>
              ${c.status === 'hidden' && c.moderated_at ? `<div style="font-size:0.72rem; color:var(--text-dim); margin-top:4px;">حجبها المشرف رقم ${c.moderated_by ?? '—'} بتاريخ ${new Date(c.moderated_at).toLocaleString('ar-EG')}</div>` : ''}
            </td>
            <td style="font-size:0.75rem; color:var(--text-dim);">${new Date(c.created_at).toLocaleDateString('ar-EG')}</td>
            <td>
              ${c.status === 'hidden'
                ? `<button class="btn-approve" style="flex:none; padding:8px 12px;" onclick="moderateComment(${c.event_id}, ${c.id}, 'approve')"><i class="fa-solid fa-eye"></i> إظهار</button>`
                : `<button class="btn-delete" onclick="moderateComment(${c.event_id}, ${c.id}, 'reject')" title="حجب الرسالة"><i class="fa-solid fa-eye-slash"></i></button>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * حجب أو رفع حجب عبر PATCH /api/events/:id/congratulations/:cid — نفس مسار
 * `assertCanManageEvent` القائم أصلاً، لا مسار DELETE مُزال. action='reject'
 * يضبط status='hidden' مع moderated_by/moderated_at (حجب لا حذف)، و'approve'
 * يرفعه. الكاتب يبقى يرى رسالته في صفحته ولا يُخطَر (قصة 39).
 */
async function moderateComment(eventId, cid, action) {
  if (action === 'reject' && !confirm('حجب هذه الرسالة؟ ستبقى ظاهرة لكاتبها في صفحته ولا تُحذف نهائياً.')) return;
  try {
    const res = await adminFetch(`/api/events/${eventId}/congratulations/${cid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.success) {
      fetchAdminComments();
      fetchKPIStats();
    } else {
      alert(data.message || 'تعذّر تنفيذ الإجراء');
    }
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  }
}

// 7. Users List
async function fetchAdminUsers() {
  try {
    const res = await adminFetch('/api/admin/users');
    const data = await res.json();

    if (data.success) {
      const container = document.getElementById('adminUsersList');
      container.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الاسم الكامل</th>
              <th>رقم الهاتف</th>
              <th>البلدة / العشيرة</th>
              <th>الرتبة</th>
            </tr>
          </thead>
          <tbody>
            ${data.users.map(u => `
              <tr>
                <td>${u.id}</td>
                <td><strong>${escapeHtml(u.full_name)}</strong></td>
                <td><a href="tel:${u.phone_number}" style="color:var(--gold-main);">${u.phone_number}</a></td>
                <td>${escapeHtml(u.clan_town || '')}</td>
                <td><span style="color:${u.role === 'super_admin' ? 'var(--warn-yellow)' : 'var(--success-green)'}; font-weight:700;">${u.role === 'super_admin' ? '👑 سوبر أدمن' : 'مستخدم'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (e) {
    console.error('Users error:', e);
  }
}

// 8. Occasion Types Management (super_admin only)
async function fetchOccasionTypes() {
  try {
    const res = await adminFetch('/api/admin/occasion-types');
    const data = await res.json();

    // الرمز المخزَّن قد يدّعي super_admin وهو ادّعاء قديم — 403 هنا حقيقة
    // راهنة من الخادم، فتُعرض برسالته العربية بدل شاشة مكسورة أو صمت.
    if (res.status === 403) {
      renderOccasionTypesForbidden(data.message);
      return;
    }

    if (data.success) {
      allOccasionTypes = data.types;
      renderOccasionTypesNotice(data.notice);
      renderOccasionTypesList();
    } else {
      alert(data.message || 'تعذر تحميل أنواع المناسبات');
    }
  } catch (e) {
    console.error('Occasion types error:', e);
  }
}

function renderOccasionTypesNotice(notice) {
  const el = document.getElementById('occasionTypesNotice');
  if (!el) return;
  if (notice) {
    el.style.display = 'block';
    el.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(notice)}`;
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

/*
 * ٤٠٣ هنا سببان لا سبب واحد: `authenticate` ترميه على جلسة منتهية، و
 * `requireSuperAdmin` ترميه على صلاحية ناقصة — بنفس الرمز. لذلك لا يُخفى
 * التبويب هنا: إخفاؤه يجعل انتهاء جلسة عادي (وهو يقع كل مرة ينتهي فيها عمر
 * الرمز) يبدو كأن الميزة اختفت، ويحبس رسالتها في لوحة لم يعد يمكن الوصول
 * إليها أصلاً. الإخفاء الوحيد يبقى عند الدخول حسب الدور. والتمييز بين
 * السببين يقرأه المستخدم من نصّ الخادم نفسه، فلا يطابق العميل عليه.
 */
function renderOccasionTypesForbidden(message) {
  closeOccasionTypeForm();
  const container = document.getElementById('occasionTypesList');
  if (container) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-lock" style="font-size: 2.2rem; color: var(--danger-red); margin-bottom: 10px;"></i>
        <p>${escapeHtml(message || 'صلاحيات المدير العام مطلوبة')}</p>
        <button class="btn-approve" style="flex:none; width:auto; margin-top:14px;" onclick="fetchOccasionTypes()">
          <i class="fa-solid fa-rotate"></i> إعادة المحاولة
        </button>
      </div>
    `;
  }
}

function renderOccasionTypesList() {
  const container = document.getElementById('occasionTypesList');
  if (!container) return;

  if (!allOccasionTypes.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-folder-open" style="font-size: 2.2rem; color: var(--gold-main); margin-bottom: 10px;"></i>
        <p>لا توجد أنواع مناسبات بعد</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>النوع</th>
          <th>النغمة</th>
          <th>الترتيب</th>
          <th>الحالة</th>
          <th>يظهر على النسخ المنشورة؟</th>
          <th>الحقول</th>
          <th>التفاعلات</th>
          <th>المناسبات</th>
          <th>الإجراء</th>
        </tr>
      </thead>
      <tbody>
        ${allOccasionTypes.map(t => `
          <tr>
            <td>
              <span style="display:inline-flex; align-items:center; gap:8px;">
                <span style="width:20px; height:20px; border-radius:6px; display:inline-block; background:${escapeHtml(t.color)}; border:1px solid var(--admin-card-border);"></span>
                <span style="font-size:1.1rem;">${escapeHtml(t.icon)}</span>
                <strong>${escapeHtml(t.name)}</strong>
              </span>
            </td>
            <td>${t.tone === 'solemn' ? 'وقورة' : 'احتفالية'}</td>
            <td>${t.position}</td>
            <td><span class="status-tag ${t.is_active ? 'approved' : 'rejected'}">${t.is_active ? 'نشِط' : 'معطَّل'}</span></td>
            <td><span class="status-tag ${t.legacy_client_supported ? 'approved' : 'pending'}">${t.legacy_client_supported ? 'يظهر' : 'لا يظهر'}</span></td>
            <td>${t.fields.length}</td>
            <td>${t.reactions.length}</td>
            <td>${t.events_count}</td>
            <td style="white-space:nowrap;">
              <button class="btn-approve" style="flex:none; padding:8px 12px;" onclick="openOccasionTypeForm(${t.id})"><i class="fa-solid fa-pen"></i> تعديل</button>
              <button class="btn-delete" onclick="deleteOccasionType(${t.id})" title="حذف">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function openOccasionTypeForm(id) {
  editingOccasionTypeId = id || null;
  const wrapper = document.getElementById('occasionTypeFormWrapper');
  const title = document.getElementById('occasionTypeFormTitle');
  const form = document.getElementById('occasionTypeForm');
  form.reset();

  const type = id ? allOccasionTypes.find(t => t.id === id) : null;

  title.innerHTML = type
    ? `<i class="fa-solid fa-pen"></i> تعديل نوع: ${escapeHtml(type.name)}`
    : `<i class="fa-solid fa-plus"></i> نوع مناسبة جديد`;

  document.getElementById('otId').value = type ? type.id : '';
  document.getElementById('otName').value = type ? type.name : '';
  document.getElementById('otIcon').value = type ? type.icon : '';
  document.getElementById('otColor').value = type ? type.color : '#0369a1';
  document.getElementById('otPosition').value = type ? type.position : 0;
  document.getElementById('otTone').value = type ? type.tone : 'festive';
  document.getElementById('otCongratsLabel').value = type ? type.congratulations_label : '';
  document.getElementById('otBadgeTitle').value = type ? (type.default_badge_title || '') : '';
  document.getElementById('otIsActive').checked = type ? Boolean(type.is_active) : true;
  document.getElementById('otCreatesCollision').checked = type ? Boolean(type.creates_collision) : false;
  document.getElementById('otWarnsOthers').checked = type ? Boolean(type.warns_others) : false;
  document.getElementById('otPremoderate').checked = type ? Boolean(type.premoderate_messages) : false;
  document.getElementById('otShowCongrats').checked = type ? Boolean(type.show_congratulations_count) : true;
  document.getElementById('otShowFollowers').checked = type ? Boolean(type.show_followers_count) : true;
  document.getElementById('otShowViews').checked = type ? Boolean(type.show_views_count) : true;
  // يبدأ مطفأً عمداً عند الإنشاء — لا يظهر على أي تطبيق منشور اليوم إلا بعد
  // إصدار نسخة تدعمه، ولا يُقلَب هنا تلقائياً حتى عند التعديل.
  document.getElementById('otLegacySupported').checked = type ? Boolean(type.legacy_client_supported) : false;

  renderOccasionTypeFieldsEditor(type ? type.fields : []);
  renderOccasionTypeReactionsEditor(type ? type.reactions : []);

  wrapper.style.display = 'block';
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeOccasionTypeForm() {
  editingOccasionTypeId = null;
  const wrapper = document.getElementById('occasionTypeFormWrapper');
  if (wrapper) wrapper.style.display = 'none';
  const form = document.getElementById('occasionTypeForm');
  if (form) form.reset();
}

/** يعرض الحقول الأربعة عشر كلها دوماً، مملوءة من إعداد النوع القائم إن وُجد. */
function renderOccasionTypeFieldsEditor(existingFields) {
  const byKey = {};
  (existingFields || []).forEach(f => { byKey[f.field_key] = f; });

  const container = document.getElementById('occasionTypeFieldsEditor');
  container.innerHTML = OCCASION_FIELDS.map((def, index) => {
    const existing = byKey[def.key];
    const isVisible = existing ? existing.is_visible : def.core;
    const isRequired = existing ? existing.is_required : false;
    const label = existing ? existing.label : def.label;
    const position = existing ? existing.position : index + 1;

    return `
      <div class="ot-field-row" data-field-key="${def.key}">
        <span class="ot-field-key">${escapeHtml(def.label)}${def.core ? ' <span class="ot-core-badge">أساسي</span>' : ''}</span>
        <input type="text" class="ot-field-label" value="${escapeHtml(label)}" placeholder="التسمية">
        <label class="ot-check"><input type="checkbox" class="ot-field-visible" ${isVisible ? 'checked' : ''} ${def.core ? 'disabled' : ''} onchange="handleOccasionFieldVisibilityChange(this)"> ظاهر</label>
        <label class="ot-check"><input type="checkbox" class="ot-field-required" ${isRequired ? 'checked' : ''} onchange="handleOccasionFieldRequiredChange(this)"> إجباري</label>
        <input type="number" class="ot-field-position" value="${position}" step="1">
      </div>
    `;
  }).join('');
}

/** حقل مخفي وإجباري معاً مرفوض — إلغاء «ظاهر» يلغي «إجباري» تلقائياً. */
function handleOccasionFieldVisibilityChange(checkbox) {
  if (!checkbox.checked) {
    const requiredCheckbox = checkbox.closest('.ot-field-row').querySelector('.ot-field-required');
    if (requiredCheckbox) requiredCheckbox.checked = false;
  }
}

/** وسم حقل كإجباري يفرض ظهوره — لا يُسمح بالتركيبة المعاكسة. */
function handleOccasionFieldRequiredChange(checkbox) {
  if (checkbox.checked) {
    const visibleCheckbox = checkbox.closest('.ot-field-row').querySelector('.ot-field-visible');
    if (visibleCheckbox) visibleCheckbox.checked = true;
  }
}

function collectOccasionTypeFields() {
  const rows = document.querySelectorAll('#occasionTypeFieldsEditor .ot-field-row');
  return Array.from(rows).map(row => ({
    field_key: row.dataset.fieldKey,
    label: row.querySelector('.ot-field-label').value.trim(),
    is_visible: row.querySelector('.ot-field-visible').checked,
    is_required: row.querySelector('.ot-field-required').checked,
    position: parseInt(row.querySelector('.ot-field-position').value, 10) || 0
  }));
}

/** قائمة فارغة صالحة تماماً ومقصودة — لا اختيار إلزامي هنا (عزا بلا تفاعلات). */
function renderOccasionTypeReactionsEditor(existingReactions) {
  const selected = new Set(existingReactions || []);
  const container = document.getElementById('occasionTypeReactionsEditor');
  container.innerHTML = Object.keys(REACTION_TYPES_LABELS).map(type => `
    <label class="ot-check ot-reaction-check">
      <input type="checkbox" class="ot-reaction" value="${type}" ${selected.has(type) ? 'checked' : ''}>
      ${REACTION_TYPES_LABELS[type]}
    </label>
  `).join('');
}

function collectOccasionTypeReactions() {
  return Array.from(document.querySelectorAll('#occasionTypeReactionsEditor .ot-reaction:checked')).map(cb => cb.value);
}

async function handleOccasionTypeSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('otSubmitBtn');

  const fields = collectOccasionTypeFields();

  const missingCore = OCCASION_FIELDS.filter(f => f.core).some(coreField => {
    const field = fields.find(f2 => f2.field_key === coreField.key);
    return !field || !field.is_visible;
  });
  if (missingCore) {
    alert('لا يمكن حفظ نوع مناسبة بلا أصحاب المناسبة والبلدة وتاريخ المناسبة ظاهرة');
    return;
  }
  if (fields.some(f => f.is_required && !f.is_visible)) {
    alert('لا يمكن أن يكون حقل إجبارياً وهو مخفي في الوقت نفسه');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  const payload = {
    name: document.getElementById('otName').value.trim(),
    icon: document.getElementById('otIcon').value.trim(),
    color: document.getElementById('otColor').value,
    position: parseInt(document.getElementById('otPosition').value, 10) || 0,
    is_active: document.getElementById('otIsActive').checked,
    tone: document.getElementById('otTone').value,
    congratulations_label: document.getElementById('otCongratsLabel').value.trim(),
    default_badge_title: document.getElementById('otBadgeTitle').value.trim(),
    creates_collision: document.getElementById('otCreatesCollision').checked,
    warns_others: document.getElementById('otWarnsOthers').checked,
    premoderate_messages: document.getElementById('otPremoderate').checked,
    show_congratulations_count: document.getElementById('otShowCongrats').checked,
    show_followers_count: document.getElementById('otShowFollowers').checked,
    show_views_count: document.getElementById('otShowViews').checked,
    legacy_client_supported: document.getElementById('otLegacySupported').checked,
    fields,
    reactions: collectOccasionTypeReactions()
  };

  const id = document.getElementById('otId').value;

  try {
    const res = await adminFetch(id ? `/api/admin/occasion-types/${id}` : '/api/admin/occasion-types', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message || 'تم الحفظ بنجاح');
      closeOccasionTypeForm();
      await fetchOccasionTypes();
    } else {
      alert(data.message || 'حدث خطأ أثناء الحفظ');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> حفظ نوع المناسبة';
  }
}

async function deleteOccasionType(id) {
  if (!confirm('هل أنت متأكد من حذف نوع المناسبة هذا؟ إن وُجدت مناسبات مرتبطة به سيُعطَّل بدلاً من حذفه.')) return;
  try {
    const res = await adminFetch(`/api/admin/occasion-types/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message || (data.success ? 'تم الحذف' : 'حدث خطأ'));
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    // ٤٠٩ عملية نجحت جزئياً على الخادم (تعطيل النوع) رغم فشل الطلب ظاهرياً —
    // القائمة تُعاد تحميلها دائماً كي تعكس الحالة الحقيقية لا رسالة الخطأ وحدها.
    await fetchOccasionTypes();
  }
}

// UI Navigation Helpers
function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active-pane'));
  document.querySelectorAll('.admin-nav-tabs .admin-tab-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.add('active-pane');

  // مطابقة بـdata-tab لا بالفهرس — أزرار جديدة أُضيفت وبعضها مخفيّ حسب الدور،
  // فالفهرس الثابت القديم كان سيكسر بمجرد إضافة تبويب.
  const btn = document.querySelector(`.admin-nav-tabs .admin-tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
}

function filterEventsByStatus(status, btnElement) {
  currentFilterStatus = status;
  if (btnElement) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    btnElement.classList.add('active');
  }
  switchAdminTab('tabEvents');
  renderAdminEvents();
}

function handleAdminEventSearch() {
  searchKeyword = document.getElementById('adminEventSearch').value.trim();
  renderAdminEvents();
}

// ======================================================================
// 8ب. Event Edit — زرّ «تعديل» على بطاقة المناسبة (#43)
//
// النموذج نفسه غير موجود في admin.html — يُبنى ويُدرج ديناميكياً هنا عند أول
// استخدام (ensureEventEditFormMounted) بدل لمس admin.html، ويُلحَق داخل
// #tabEvents تحت قائمة البطاقات، بنفس نمط pane-box في بقية اللوحة.
//
// PATCH /api/events/:id (لا /api/admin/events/:id) — نفس مسار المالك/الأدمن
// المحلي، بلا رفع ملفات (poster_url/audio_url/artist_image_url نصوص عناوين
// لا غير)، ويرسل الفرق فقط: كل حقل غير مُغيَّر يبقى `undefined` ولا يدخل
// الحمولة، لأن الخادم يرفض 400 «لم يتم إرسال أي تعديل» ويترك كل undefined
// كما هو (قيد ٤).
// ======================================================================

function ensureEventEditFormMounted() {
  if (document.getElementById('eventEditFormWrapper')) return;
  const tabEvents = document.getElementById('tabEvents');
  if (!tabEvents) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'pane-box';
  wrapper.id = 'eventEditFormWrapper';
  wrapper.style.display = 'none';
  wrapper.style.marginTop = '20px';

  const criticalHint = '<span style="color:var(--warn-yellow); font-size:0.78rem; margin-inline-start:6px;"><i class="fa-solid fa-triangle-exclamation"></i> حرج — يعيد مناسبة معتمدة إلى المراجعة</span>';

  wrapper.innerHTML = `
    <div class="pane-header">
      <h2 id="eventEditFormTitle"><i class="fa-solid fa-pen"></i> تعديل مناسبة</h2>
      <p>يُرسَل الحقل المتغيّر فقط. الحقول المعلَّمة أدناه حرِجة: تغييرها في مناسبة معتمدة يعيدها إلى قائمة المراجعة حتى تُعتمد ثانيةً.</p>
    </div>

    <div id="eventEditForbiddenNotice" style="display:none; padding:16px; margin-bottom:16px; border-radius:8px; background:var(--surface-sunk); color:var(--danger-red); text-align:center;"></div>

    <form id="eventEditForm" class="admin-form" onsubmit="handleEventEditSubmit(event)">
      <div class="form-row">
        <div class="form-group half">
          <label>العنوان</label>
          <input type="text" id="evtTitle" maxlength="255">
        </div>
        <div class="form-group half">
          <label>العائلة/العشيرة</label>
          <input type="text" id="evtFamilyClan" maxlength="150">
        </div>
      </div>

      <div class="form-group">
        <label>أصحاب المناسبة *</label>
        <div id="evtHonoreesEditor"></div>
        <button type="button" class="btn-approve" style="flex:none; width:auto; margin-top:8px;" onclick="addEventHonoreeRow()">
          <i class="fa-solid fa-plus"></i> إضافة اسم
        </button>
      </div>

      <div class="form-row">
        <div class="form-group half">
          <label>البلدة ${criticalHint}</label>
          <select id="evtTown" onchange="handleEventEditTownChange()">
            ${TOWNS.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group half" id="evtVillageGroup" style="display:none;">
          <label>القرية ${criticalHint}</label>
          <select id="evtVillage"></select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group half">
          <label>وصف المكان (لـ Waze وGoogle Maps) ${criticalHint}</label>
          <input type="text" id="evtLocationName" maxlength="1000">
        </div>
        <div class="form-group half">
          <label>مكان إضافي</label>
          <input type="text" id="evtSecondaryLocation" maxlength="1000">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group half">
          <label>خط العرض (latitude) ${criticalHint}</label>
          <input type="text" id="evtLat" placeholder="مثال: 31.2589">
        </div>
        <div class="form-group half">
          <label>خط الطول (longitude) ${criticalHint}</label>
          <input type="text" id="evtLng" placeholder="مثال: 34.7913">
        </div>
      </div>
      <p style="font-size:0.78rem; color:var(--text-dim); margin-top:-8px;">اختيار قرية يستبدل هذين الحقلين بإحداثياتها تلقائياً ما لم تُعدَّلا هنا صراحةً في نفس الحفظة.</p>

      <div class="form-row">
        <div class="form-group half">
          <label>تاريخ المناسبة ${criticalHint}</label>
          <input type="date" id="evtEventDate">
        </div>
        <div class="form-group half">
          <label>تاريخ الانتهاء ${criticalHint}</label>
          <input type="date" id="evtEventEndDate">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group half">
          <label>سهرة الشباب والدحة</label>
          <input type="date" id="evtYouthPartyDate">
        </div>
        <div class="form-group half">
          <label>وقت العشاء</label>
          <input type="text" id="evtDinnerTime" maxlength="100">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group half">
          <label>رقم التواصل</label>
          <input type="text" id="evtHostPhone" maxlength="30">
        </div>
        <div class="form-group half">
          <label>اسم الفنان</label>
          <input type="text" id="evtArtistName" maxlength="150">
        </div>
      </div>

      <p style="font-size:0.82rem; color:var(--text-dim);">
        <i class="fa-solid fa-circle-info"></i> لا رفع ملفات في هذا النموذج — الحقول أدناه عناوين URL نصّية فقط (رابط صورة أو ملف صوتي مستضاف مسبقاً)، لا منتقي ملفات.
      </p>

      <div class="form-row">
        <div class="form-group half">
          <label>رابط صورة الملصق (URL)</label>
          <input type="text" id="evtPosterUrl" maxlength="2000" placeholder="https://...">
        </div>
        <div class="form-group half">
          <label>رابط صورة الفنان (URL)</label>
          <input type="text" id="evtArtistImageUrl" maxlength="2000" placeholder="https://...">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group half">
          <label>رابط الملف الصوتي (URL)</label>
          <input type="text" id="evtAudioUrl" maxlength="2000" placeholder="https://...">
        </div>
        <div class="form-group half">
          <label>عنوان المقطع الصوتي</label>
          <input type="text" id="evtAudioTitle" maxlength="200">
        </div>
      </div>

      <div id="evtAmendmentsLogWrapper" style="display:none; margin-top:10px;">
        <h3 style="font-size:0.95rem; color:var(--gold-main); margin-bottom:8px;"><i class="fa-solid fa-clock-rotate-left"></i> سجلّ التعديلات</h3>
        <div id="evtAmendmentsLog"></div>
      </div>

      <div style="display:flex; gap:10px; margin-top:16px;">
        <button type="submit" class="admin-btn-primary" id="evtEditSubmitBtn">
          <i class="fa-solid fa-check"></i> حفظ التعديل
        </button>
        <button type="button" class="admin-btn-primary" style="background:var(--surface-sunk); color:var(--text-main);" onclick="closeEventEditForm()">
          إلغاء
        </button>
      </div>
    </form>
  `;

  tabEvents.appendChild(wrapper);
}

/** القرى مصدرها GET /api/towns العام (لا GET /api/admin/villages، خلف requireSuperAdmin — 403 لكل أدمن محلي، قيد ٣). */
async function fetchTownVillages() {
  if (townVillagesFetchAttempted) return;
  townVillagesFetchAttempted = true;
  try {
    const res = await apiFetch('/api/towns');
    const data = await res.json();
    if (data.success) allTownVillages = data.villages || [];
  } catch (e) {
    console.error('Towns/villages fetch error:', e);
  }
}

function renderEventVillageOptions(selectedId) {
  const select = document.getElementById('evtVillage');
  if (!select) return;
  select.innerHTML = '<option value="">— بلا قرية محددة —</option>' + allTownVillages.map(v =>
    `<option value="${v.id}" ${String(v.id) === String(selectedId ?? '') ? 'selected' : ''}>${escapeHtml(v.name)}</option>`
  ).join('');
}

/** إظهار/إخفاء منتقي القرية حسب البلدة — village_id غير مقبول أصلاً إلا ضمن VILLAGES_TOWN (قيد ٣، 400 من الخادم غير ذلك). */
function handleEventEditTownChange() {
  const town = document.getElementById('evtTown').value;
  const group = document.getElementById('evtVillageGroup');
  const select = document.getElementById('evtVillage');
  if (town === VILLAGES_TOWN) {
    group.style.display = '';
  } else {
    group.style.display = 'none';
    select.value = '';
  }
}

function renderEventHonoreesEditor(honorees) {
  const container = document.getElementById('evtHonoreesEditor');
  const rows = (honorees && honorees.length) ? honorees : [{ name: '', role: '' }];
  container.innerHTML = rows.map(h => `
    <div class="ot-field-row" data-honoree-row>
      <input type="text" class="evt-honoree-name" placeholder="الاسم" maxlength="150" value="${escapeHtml(h.name || '')}" style="flex:2;">
      <input type="text" class="evt-honoree-role" placeholder="الصفة (اختياري، مثال: العريس)" maxlength="60" value="${escapeHtml(h.role || '')}" style="flex:2;">
      <button type="button" class="btn-delete" onclick="this.closest('[data-honoree-row]').remove()" title="حذف">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
}

function addEventHonoreeRow() {
  const container = document.getElementById('evtHonoreesEditor');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'ot-field-row';
  row.setAttribute('data-honoree-row', '');
  row.innerHTML = `
    <input type="text" class="evt-honoree-name" placeholder="الاسم" maxlength="150" style="flex:2;">
    <input type="text" class="evt-honoree-role" placeholder="الصفة (اختياري، مثال: العريس)" maxlength="60" style="flex:2;">
    <button type="button" class="btn-delete" onclick="this.closest('[data-honoree-row]').remove()" title="حذف">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  container.appendChild(row);
}

function collectEventHonorees() {
  return Array.from(document.querySelectorAll('#evtHonoreesEditor [data-honoree-row]')).map(row => ({
    name: row.querySelector('.evt-honoree-name').value.trim(),
    role: row.querySelector('.evt-honoree-role').value.trim()
  })).filter(h => h.name);
}

function honoreesEqual(a, b) {
  const listA = a || [];
  const listB = b || [];
  if (listA.length !== listB.length) return false;
  return listA.every((h, i) => h.name === listB[i].name && (h.role || '') === (listB[i].role || ''));
}

/** سجلّ اختياري (المرجّح المذكور في المهمة) — GET /api/events/:id/amendments، نفس حارس الملكية القائم أصلاً. */
function renderEventAmendmentsLog(amendments) {
  const wrapperEl = document.getElementById('evtAmendmentsLogWrapper');
  const listEl = document.getElementById('evtAmendmentsLog');
  if (!wrapperEl || !listEl) return;

  if (!amendments || !amendments.length) {
    wrapperEl.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  wrapperEl.style.display = 'block';
  listEl.innerHTML = amendments.map(a => `
    <div style="padding:8px 10px; border-bottom:1px solid var(--admin-card-border); font-size:0.8rem; color:var(--text-dim);">
      <span class="status-tag ${a.classification === 'critical' ? 'rejected' : 'approved'}" style="font-size:0.7rem;">${a.classification === 'critical' ? 'حرِج' : 'تجميلي'}</span>
      <strong style="color:var(--text-main);">${escapeHtml(a.field)}</strong>:
      ${escapeHtml(a.old_value || '—')} ← ${escapeHtml(a.new_value || '—')}
      <span style="margin-inline-start:6px;">(${escapeHtml(a.changed_by_name || 'غير معروف')} — ${new Date(a.created_at).toLocaleString('ar-EG')})</span>
    </div>
  `).join('');
}

function toDateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

async function openEventEditForm(id) {
  const evt = allAdminEvents.find(e => e.id === id);
  if (!evt) return;

  ensureEventEditFormMounted();
  await fetchTownVillages();

  const wrapper = document.getElementById('eventEditFormWrapper');
  const forbiddenNotice = document.getElementById('eventEditForbiddenNotice');
  const form = document.getElementById('eventEditForm');
  forbiddenNotice.style.display = 'none';
  form.style.display = '';
  form.reset();

  // يجلب أصحاب المناسبة (لا يحملها GET /api/admin/events — SELECT e.* بلا
  // event_honorees) وسجلّ التعديلات معاً. نفس مسار المالك/الأدمن المحلي
  // (assertCanManageEvent) — 403 هنا حقيقة راهنة من الخادم لا تُخفى (نفس نمط
  // fetchOccasionTypes)، ويشمل حالتي "خارج بلداتك" و"الجلسة منتهية" معاً بنص
  // الخادم نفسه فيتميّزان تلقائياً بلا تفريق من العميل.
  let honorees = [{ name: evt.groom_name || '', role: '' }];
  let amendments = [];
  try {
    const [detailRes, amendRes] = await Promise.all([
      adminFetch(`/api/events/${id}`),
      adminFetch(`/api/events/${id}/amendments`)
    ]);
    const detailData = await detailRes.json();

    if (detailRes.status === 403 || detailRes.status === 404) {
      forbiddenNotice.style.display = 'block';
      forbiddenNotice.innerHTML = `<i class="fa-solid fa-lock"></i> ${escapeHtml(detailData.message || 'تعذّر الوصول إلى هذه المناسبة')}`;
      form.style.display = 'none';
      editingEventId = null;
      editingEventOriginal = null;
      wrapper.style.display = 'block';
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (detailData.success && Array.isArray(detailData.event.honorees) && detailData.event.honorees.length) {
      honorees = detailData.event.honorees;
    }
    if (amendRes.ok) {
      const amendData = await amendRes.json();
      if (amendData.success) amendments = amendData.amendments || [];
    }
  } catch (e) {
    console.error('Event detail fetch error:', e);
  }

  editingEventId = id;
  editingEventOriginal = {
    title: evt.title || '',
    family_clan: evt.family_clan || '',
    town: evt.town || '',
    village_id: evt.village_id ?? null,
    location_name: evt.location_name || '',
    secondary_location_name: evt.secondary_location_name || '',
    latitude: evt.latitude != null ? String(evt.latitude) : '',
    longitude: evt.longitude != null ? String(evt.longitude) : '',
    event_date: toDateInputValue(evt.event_date),
    event_end_date: toDateInputValue(evt.event_end_date),
    youth_party_date: toDateInputValue(evt.youth_party_date),
    dinner_time: evt.dinner_time || '',
    poster_url: evt.poster_url || '',
    audio_url: evt.audio_url || '',
    audio_title: evt.audio_title || '',
    host_phone: evt.host_phone || '',
    artist_name: evt.artist_name || '',
    artist_image_url: evt.artist_image_url || '',
    honorees,
    status: evt.status
  };

  document.getElementById('eventEditFormTitle').innerHTML =
    `<i class="fa-solid fa-pen"></i> تعديل مناسبة: ${escapeHtml(evt.title || evt.groom_name || '')}`;

  document.getElementById('evtTitle').value = editingEventOriginal.title;
  document.getElementById('evtFamilyClan').value = editingEventOriginal.family_clan;
  document.getElementById('evtTown').value = editingEventOriginal.town;
  document.getElementById('evtLocationName').value = editingEventOriginal.location_name;
  document.getElementById('evtSecondaryLocation').value = editingEventOriginal.secondary_location_name;
  document.getElementById('evtLat').value = editingEventOriginal.latitude;
  document.getElementById('evtLng').value = editingEventOriginal.longitude;
  document.getElementById('evtEventDate').value = editingEventOriginal.event_date;
  document.getElementById('evtEventEndDate').value = editingEventOriginal.event_end_date;
  document.getElementById('evtYouthPartyDate').value = editingEventOriginal.youth_party_date;
  document.getElementById('evtDinnerTime').value = editingEventOriginal.dinner_time;
  document.getElementById('evtPosterUrl').value = editingEventOriginal.poster_url;
  document.getElementById('evtAudioUrl').value = editingEventOriginal.audio_url;
  document.getElementById('evtAudioTitle').value = editingEventOriginal.audio_title;
  document.getElementById('evtHostPhone').value = editingEventOriginal.host_phone;
  document.getElementById('evtArtistName').value = editingEventOriginal.artist_name;
  document.getElementById('evtArtistImageUrl').value = editingEventOriginal.artist_image_url;

  renderEventVillageOptions(editingEventOriginal.village_id);
  document.getElementById('evtVillage').value = editingEventOriginal.village_id != null ? String(editingEventOriginal.village_id) : '';
  handleEventEditTownChange();

  renderEventHonoreesEditor(editingEventOriginal.honorees);
  renderEventAmendmentsLog(amendments);

  wrapper.style.display = 'block';
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEventEditForm() {
  editingEventId = null;
  editingEventOriginal = null;
  const wrapper = document.getElementById('eventEditFormWrapper');
  if (wrapper) wrapper.style.display = 'none';
}

/**
 * يقارن كل حقل بقيمته الأصلية ويرسل الفرق فقط (قيد ٤) — حمولة فارغة تماماً
 * تعني ألا نداء يُرسَل إطلاقاً، لا نداء بجسم فارغ. حقول التاريخ (لا وقت) تُقارن
 * كنص "YYYY-MM-DD" مباشرة، وvillage_id يُطبَّع null/'' معاً لتفادي فرق زائف.
 */
async function handleEventEditSubmit(e) {
  e.preventDefault();
  if (!editingEventId || !editingEventOriginal) return;

  const town = document.getElementById('evtTown').value;
  const villageRaw = town === VILLAGES_TOWN ? document.getElementById('evtVillage').value : '';

  const current = {
    title: document.getElementById('evtTitle').value.trim(),
    family_clan: document.getElementById('evtFamilyClan').value.trim(),
    town,
    village_id: villageRaw === '' ? null : villageRaw,
    location_name: document.getElementById('evtLocationName').value.trim(),
    secondary_location_name: document.getElementById('evtSecondaryLocation').value.trim(),
    latitude: document.getElementById('evtLat').value.trim(),
    longitude: document.getElementById('evtLng').value.trim(),
    event_date: document.getElementById('evtEventDate').value,
    event_end_date: document.getElementById('evtEventEndDate').value,
    youth_party_date: document.getElementById('evtYouthPartyDate').value,
    dinner_time: document.getElementById('evtDinnerTime').value.trim(),
    poster_url: document.getElementById('evtPosterUrl').value.trim(),
    audio_url: document.getElementById('evtAudioUrl').value.trim(),
    audio_title: document.getElementById('evtAudioTitle').value.trim(),
    host_phone: document.getElementById('evtHostPhone').value.trim(),
    artist_name: document.getElementById('evtArtistName').value.trim(),
    artist_image_url: document.getElementById('evtArtistImageUrl').value.trim()
  };

  const payload = {};
  let touchesCritical = false;

  Object.keys(current).forEach(key => {
    const orig = editingEventOriginal[key];
    const val = current[key];
    // كل الحقول تُقارَن كنصوص: القيم تخرج من عناصر الإدخال نصوصاً أصلاً،
    // و`null` القرية و`''` الحقل الفارغ يجب أن يتساويا وإلا أُرسل تعديل وهمي.
    if (String(orig ?? '') === String(val ?? '')) return;

    payload[key] = key === 'village_id' ? (val === '' || val == null ? null : val) : val;
    if (CRITICAL_AMENDMENT_FIELDS.includes(key)) touchesCritical = true;
  });

  const currentHonorees = collectEventHonorees();
  if (!honoreesEqual(editingEventOriginal.honorees, currentHonorees)) {
    if (!currentHonorees.length) {
      alert('يجب إدخال اسم واحد على الأقل لأصحاب المناسبة');
      return;
    }
    payload.honorees = currentHonorees;
  }

  if (!Object.keys(payload).length) {
    // لا تعديل فعلي — لا نداء يُرسَل إطلاقاً (قيد ٤).
    alert('لم تُجرِ أي تعديل — لا شيء لحفظه');
    return;
  }

  // تحذير صريح قبل الحفظ حين يمسّ التعديل حقلاً حرجاً على مناسبة معتمدة
  // ومنشورة حالياً — لا رسالة بعد وقوع الأمر (قيد ١، أخطر ما في المهمة).
  if (touchesCritical && editingEventOriginal.status === 'approved') {
    const confirmed = confirm(
      '⚠️ هذا التعديل يمسّ حقلاً حرجاً (التاريخ أو المكان) في مناسبة معتمدة ومنشورة حالياً.\n' +
      'حفظه سيعيدها فوراً إلى قائمة المراجعة، وستختفي عن الجمهور حتى تُعتمد مجدداً.\n\n' +
      'هل تريد المتابعة؟'
    );
    if (!confirmed) return;
  }

  const btn = document.getElementById('evtEditSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  try {
    const res = await adminFetch(`/api/events/${editingEventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      // رسالة الخادم كما هي حرفياً — هي من تشرح الحرِج/التجميلي وتحمل تنبيه
      // التعارض مدمَجاً فيها؛ location_warning حقل منفصل فلا يُبتلع (قيد الاستجابة).
      let fullMessage = data.message || 'تم الحفظ بنجاح';
      if (data.location_warning) fullMessage += `\n\n⚠️ ${data.location_warning}`;
      alert(fullMessage);
      closeEventEditForm();
      await fetchAdminEvents();
      await fetchKPIStats();
    } else {
      alert(data.message || 'حدث خطأ أثناء الحفظ');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> حفظ التعديل';
  }
}

// ======================================================================
// 9. Service Providers Directory — admin، مقيَّد ببلداته (قصص 28-30)
// ======================================================================

/** الفئات العامة (بلا حاجة صلاحية) — تملأ قائمة الفئة في نموذج المزوّد لكل الأدوار. */
async function fetchPublicServiceCategories() {
  try {
    const res = await apiFetch('/api/services/categories');
    const data = await res.json();
    if (data.success) allPublicCategories = data.categories;
  } catch (e) {
    console.error('Public categories error:', e);
  }
}

async function fetchAdminServiceProviders() {
  try {
    const res = await adminFetch('/api/admin/service-providers?limit=100');
    const data = await res.json();
    const notice = document.getElementById('providerScopeNotice');

    if (res.status === 403) {
      allServiceProviders = [];
      if (notice) {
        notice.style.display = 'block';
        notice.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(data.message || 'صلاحية غير كافية')}`;
      }
      renderProvidersList();
      return;
    }
    if (notice) { notice.style.display = 'none'; notice.innerHTML = ''; }

    if (data.success) {
      allServiceProviders = data.providers;
      renderProvidersList();
    }
  } catch (e) {
    console.error('Providers error:', e);
  }
}

function renderProvidersList() {
  const container = document.getElementById('providersList');
  if (!container) return;

  if (!allServiceProviders.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-folder-open" style="font-size: 2.2rem; color: var(--gold-main); margin-bottom: 10px;"></i>
        <p>لا يوجد مزوّدو خدمات بعد في بلداتك</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>الاسم</th>
          <th>الفئة</th>
          <th>الهاتف</th>
          <th>البلدات</th>
          <th>الحالة</th>
          <th>الإجراء</th>
        </tr>
      </thead>
      <tbody>
        ${allServiceProviders.map(p => `
          <tr>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${escapeHtml(p.category_name || '')}</td>
            <td><a href="tel:${p.phone}" style="color:var(--gold-main);">${escapeHtml(p.phone)}</a></td>
            <td>${(p.towns || []).map(t => `<span class="town-chip">${escapeHtml(t)}</span>`).join('')}</td>
            <td><span class="status-tag ${p.is_active ? 'approved' : 'rejected'}">${p.is_active ? 'نشِط' : 'معطَّل'}</span></td>
            <td style="white-space:nowrap;">
              <button class="btn-approve" style="flex:none; padding:8px 12px;" onclick="openProviderForm(${p.id})"><i class="fa-solid fa-pen"></i> تعديل</button>
              <button class="btn-delete" onclick="handleDeleteProvider(${p.id})" title="حذف">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/** يحوّل قيمة تاريخ من الخادم إلى صيغة <input type="datetime-local"> — يستخدم للعرض فقط عند التعديل، الحقل مقفل حينها. */
function toDatetimeLocalValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * منتقي البلدات مقصور على ما يملكه المستخدم فعلاً: كل بلدات المنصة لسوبر
 * أدمن، أو الاتحاد المشتق في deriveScopedTowns() لأدمن محلي — لا اختيار خارج
 * هذه القائمة أصلاً، فالخادم يرفض الطلب كاملاً لو حاول عميل معدَّل تمرير بلدة
 * خارجها (services.service.js assertTownsWithinScope).
 */
function openProviderForm(id) {
  const scopedTowns = isSuperAdminRole() ? TOWNS : deriveScopedTowns();
  if (!scopedTowns.length) {
    alert('لا تملك أي بلدة مُسنَدة بعد — تواصل مع السوبر أدمن ليُسنِد لك بلدة قبل إضافة مزوّدين');
    return;
  }

  editingProviderId = id || null;
  const wrapper = document.getElementById('providerFormWrapper');
  const title = document.getElementById('providerFormTitle');
  const form = document.getElementById('providerForm');
  form.reset();

  const provider = id ? allServiceProviders.find(p => p.id === id) : null;

  title.innerHTML = provider
    ? `<i class="fa-solid fa-pen"></i> تعديل: ${escapeHtml(provider.name)}`
    : `<i class="fa-solid fa-plus"></i> مزوّد خدمة جديد`;

  document.getElementById('provId').value = provider ? provider.id : '';
  renderProviderCategoryOptions(provider ? provider.category_id : null);
  document.getElementById('provName').value = provider ? provider.name : '';
  document.getElementById('provPhone').value = provider ? provider.phone : '';
  document.getElementById('provImage').value = provider ? (provider.image_url || '') : '';
  document.getElementById('provDescription').value = provider ? (provider.description || '') : '';
  document.getElementById('provIsActive').checked = provider ? Boolean(provider.is_active) : true;

  // consent_at/consent_channel هما سجل الإذن الأصلي — الخادم لا يقبل تعديلهما
  // إطلاقاً بعد الإنشاء (services.service.js updateProvider)، فيُعرَضان هنا
  // للسياق فقط عند التعديل ويُقفَلان، ويبقيان إلزاميين وقابلين للتحرير عند الإنشاء.
  const consentAtInput = document.getElementById('provConsentAt');
  const consentChannelInput = document.getElementById('provConsentChannel');
  if (provider) {
    consentAtInput.value = toDatetimeLocalValue(provider.consent_at);
    consentChannelInput.value = provider.consent_channel || '';
    consentAtInput.disabled = true;
    consentChannelInput.disabled = true;
  } else {
    consentAtInput.value = '';
    consentChannelInput.value = '';
    consentAtInput.disabled = false;
    consentChannelInput.disabled = false;
  }

  renderProviderTownsPicker(scopedTowns, provider ? provider.towns : []);

  wrapper.style.display = 'block';
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeProviderForm() {
  editingProviderId = null;
  const wrapper = document.getElementById('providerFormWrapper');
  if (wrapper) wrapper.style.display = 'none';
  const form = document.getElementById('providerForm');
  if (form) form.reset();
}

function renderProviderCategoryOptions(selectedId) {
  const select = document.getElementById('provCategory');
  if (!select) return;
  select.innerHTML = allPublicCategories.map(c =>
    `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${c.icon ? c.icon + ' ' : ''}${escapeHtml(c.name)}</option>`
  ).join('');
}

function renderProviderTownsPicker(scopedTowns, selectedTowns) {
  const container = document.getElementById('provTownsPicker');
  if (!container) return;
  const selected = new Set(selectedTowns || []);
  container.innerHTML = scopedTowns.map(town => `
    <label class="ot-check"><input type="checkbox" class="prov-town-check" value="${escapeHtml(town)}" ${selected.has(town) ? 'checked' : ''}> ${escapeHtml(town)}</label>
  `).join('');
}

function collectProviderTowns() {
  return Array.from(document.querySelectorAll('#provTownsPicker .prov-town-check:checked')).map(cb => cb.value);
}

async function handleProviderSubmit(e) {
  e.preventDefault();

  const towns = collectProviderTowns();
  if (!towns.length) {
    alert('اختر بلدة واحدة على الأقل يخدمها المزوّد');
    return;
  }

  const id = document.getElementById('provId').value;
  const payload = {
    category_id: parseInt(document.getElementById('provCategory').value, 10),
    name: document.getElementById('provName').value.trim(),
    phone: document.getElementById('provPhone').value.trim(),
    description: document.getElementById('provDescription').value.trim(),
    image_url: document.getElementById('provImage').value.trim(),
    is_active: document.getElementById('provIsActive').checked,
    towns
  };

  // consent_at/consent_channel إلزاميان عند الإنشاء فقط — الخادم يرفض 400 بلا
  // كليهما (services.routes.js requireConsentAt)، ولا يقبلهما إطلاقاً عند التعديل.
  if (!id) {
    const consentAt = document.getElementById('provConsentAt').value;
    const consentChannel = document.getElementById('provConsentChannel').value;
    if (!consentAt || !consentChannel) {
      alert('تسجيل إذن المزوّد (التاريخ والوسيلة) إلزامي — لا يُنشر مزوّد بلا هذا السجل');
      return;
    }
    payload.consent_at = new Date(consentAt).toISOString();
    payload.consent_channel = consentChannel;
  }

  const btn = document.getElementById('provSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  try {
    const res = await adminFetch(id ? `/api/admin/service-providers/${id}` : '/api/admin/service-providers', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message || 'تم الحفظ بنجاح');
      closeProviderForm();
      await fetchAdminServiceProviders();
      renderScopeBanner();
    } else {
      alert(data.message || 'حدث خطأ أثناء الحفظ');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> حفظ المزوّد';
  }
}

async function handleDeleteProvider(id) {
  if (!confirm('حذف مزوّد الخدمة هذا نهائياً؟')) return;
  try {
    const res = await adminFetch(`/api/admin/service-providers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await fetchAdminServiceProviders();
      renderScopeBanner();
    } else {
      alert(data.message || 'تعذر الحذف');
    }
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  }
}

// ======================================================================
// 10. Villages — سوبر أدمن حصراً (قصص 32-33)
// ======================================================================

async function fetchAdminVillages() {
  try {
    const res = await adminFetch('/api/admin/villages');
    const data = await res.json();
    if (res.status === 403) { renderVillagesForbidden(data.message); return; }
    if (data.success) {
      allVillages = data.villages;
      renderVillagesList();
    }
  } catch (e) {
    console.error('Villages error:', e);
  }
}

function renderVillagesForbidden(message) {
  closeVillageForm();
  const container = document.getElementById('villagesList');
  if (container) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-lock" style="font-size: 2.2rem; color: var(--danger-red); margin-bottom: 10px;"></i>
        <p>${escapeHtml(message || 'صلاحيات المدير العام مطلوبة')}</p>
      </div>
    `;
  }
}

function renderVillagesList() {
  const container = document.getElementById('villagesList');
  if (!container) return;

  if (!allVillages.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-folder-open" style="font-size: 2.2rem; color: var(--gold-main); margin-bottom: 10px;"></i>
        <p>لا توجد قرى بعد</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>الاسم</th>
          <th>خط العرض</th>
          <th>خط الطول</th>
          <th>الترتيب</th>
          <th>الحالة</th>
          <th>مناسبات</th>
          <th>الإجراء</th>
        </tr>
      </thead>
      <tbody>
        ${allVillages.map(v => `
          <tr>
            <td><strong>${escapeHtml(v.name)}</strong></td>
            <td>${v.latitude}</td>
            <td>${v.longitude}</td>
            <td>${v.position}</td>
            <td><span class="status-tag ${v.is_active ? 'approved' : 'rejected'}">${v.is_active ? 'نشِطة' : 'معطَّلة'}</span></td>
            <td>${v.events_count}</td>
            <td style="white-space:nowrap;">
              <button class="btn-approve" style="flex:none; padding:8px 12px;" onclick="openVillageForm(${v.id})"><i class="fa-solid fa-pen"></i> تعديل</button>
              <button class="btn-delete" onclick="handleDeleteVillage(${v.id})" title="تعطيل/حذف">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function openVillageForm(id) {
  editingVillageId = id || null;
  const wrapper = document.getElementById('villageFormWrapper');
  const title = document.getElementById('villageFormTitle');
  const form = document.getElementById('villageForm');
  form.reset();

  const village = id ? allVillages.find(v => v.id === id) : null;

  title.innerHTML = village
    ? `<i class="fa-solid fa-pen"></i> تعديل قرية: ${escapeHtml(village.name)}`
    : `<i class="fa-solid fa-plus"></i> قرية جديدة`;

  document.getElementById('vilId').value = village ? village.id : '';
  document.getElementById('vilName').value = village ? village.name : '';
  document.getElementById('vilPosition').value = village ? village.position : 0;
  document.getElementById('vilLat').value = village ? village.latitude : '';
  document.getElementById('vilLng').value = village ? village.longitude : '';
  document.getElementById('vilIsActive').checked = village ? Boolean(village.is_active) : true;

  wrapper.style.display = 'block';
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeVillageForm() {
  editingVillageId = null;
  const wrapper = document.getElementById('villageFormWrapper');
  if (wrapper) wrapper.style.display = 'none';
  const form = document.getElementById('villageForm');
  if (form) form.reset();
}

/** التحقق من الإحداثيات هنا وقائي فقط — الخادم هو من يفرضها فعلياً (villages.routes.js requireCoordinate). */
async function handleVillageSubmit(e) {
  e.preventDefault();

  const lat = document.getElementById('vilLat').value;
  const lng = document.getElementById('vilLng').value;
  if (lat === '' || lng === '') {
    alert('خط العرض وخط الطول إلزاميان — قرية بلا إحداثيات لن يظهر لها دبّوس صحيح أبداً');
    return;
  }

  const payload = {
    name: document.getElementById('vilName').value.trim(),
    latitude: parseFloat(lat),
    longitude: parseFloat(lng),
    position: parseInt(document.getElementById('vilPosition').value, 10) || 0,
    is_active: document.getElementById('vilIsActive').checked
  };

  const id = document.getElementById('vilId').value;
  const btn = document.getElementById('vilSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  try {
    const res = await adminFetch(id ? `/api/admin/villages/${id}` : '/api/admin/villages', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'تم الحفظ بنجاح');
      closeVillageForm();
      await fetchAdminVillages();
    } else {
      alert(data.message || 'حدث خطأ أثناء الحفظ');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> حفظ القرية';
  }
}

/**
 * الحذف هنا لا يفشل أبداً على الخادم (villages.service.js deleteVillage لا
 * يرمي أي خطأ) — قرية بلا مناسبات تُحذف فعلاً، وأخرى لها مناسبات تُعطَّل بدلاً
 * من ذلك، والرسالتان تصلان بنص الخادم نفسه ضمن استجابة success:true واحدة —
 * فلا داعي هنا لتمييز "فشل" عن "نجاح جزئي" كما في فئات الخدمات أدناه.
 */
async function handleDeleteVillage(id) {
  if (!confirm('حذف هذه القرية؟ إن كانت لها مناسبات مرتبطة سيُعطَّل ظهورها بدلاً من حذفها.')) return;
  try {
    const res = await adminFetch(`/api/admin/villages/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message || (data.success ? 'تم الحفظ' : 'حدث خطأ'));
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    await fetchAdminVillages();
  }
}

// ======================================================================
// 11. Service Categories — سوبر أدمن حصراً (قصة 34)
// ======================================================================

async function fetchAdminServiceCategories() {
  try {
    const res = await adminFetch('/api/admin/service-categories');
    const data = await res.json();
    if (res.status === 403) { renderServiceCategoriesForbidden(data.message); return; }
    if (data.success) {
      allServiceCategories = data.categories;
      renderServiceCategoriesList();
    }
  } catch (e) {
    console.error('Service categories error:', e);
  }
}

function renderServiceCategoriesForbidden(message) {
  closeServiceCategoryForm();
  const container = document.getElementById('serviceCategoriesList');
  if (container) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-lock" style="font-size: 2.2rem; color: var(--danger-red); margin-bottom: 10px;"></i>
        <p>${escapeHtml(message || 'صلاحيات المدير العام مطلوبة')}</p>
      </div>
    `;
  }
}

function renderServiceCategoriesList() {
  const container = document.getElementById('serviceCategoriesList');
  if (!container) return;

  if (!allServiceCategories.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-folder-open" style="font-size: 2.2rem; color: var(--gold-main); margin-bottom: 10px;"></i>
        <p>لا توجد فئات خدمات بعد</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>الفئة</th>
          <th>الترتيب</th>
          <th>الحالة</th>
          <th>مزوّدون</th>
          <th>الإجراء</th>
        </tr>
      </thead>
      <tbody>
        ${allServiceCategories.map(c => `
          <tr>
            <td>
              <span style="display:inline-flex; align-items:center; gap:8px;">
                <span style="width:20px; height:20px; border-radius:6px; display:inline-block; background:${escapeHtml(c.color)}; border:1px solid var(--admin-card-border);"></span>
                <span style="font-size:1.1rem;">${escapeHtml(c.icon)}</span>
                <strong>${escapeHtml(c.name)}</strong>
              </span>
            </td>
            <td>${c.position}</td>
            <td><span class="status-tag ${c.is_active ? 'approved' : 'rejected'}">${c.is_active ? 'نشِطة' : 'معطَّلة'}</span></td>
            <td>${c.providers_count}</td>
            <td style="white-space:nowrap;">
              <button class="btn-approve" style="flex:none; padding:8px 12px;" onclick="openServiceCategoryForm(${c.id})"><i class="fa-solid fa-pen"></i> تعديل</button>
              <button class="btn-delete" onclick="handleDeleteServiceCategory(${c.id})" title="حذف">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function openServiceCategoryForm(id) {
  editingServiceCategoryId = id || null;
  const wrapper = document.getElementById('serviceCategoryFormWrapper');
  const title = document.getElementById('serviceCategoryFormTitle');
  const form = document.getElementById('serviceCategoryForm');
  form.reset();

  const category = id ? allServiceCategories.find(c => c.id === id) : null;

  title.innerHTML = category
    ? `<i class="fa-solid fa-pen"></i> تعديل فئة: ${escapeHtml(category.name)}`
    : `<i class="fa-solid fa-plus"></i> فئة خدمة جديدة`;

  document.getElementById('scId').value = category ? category.id : '';
  document.getElementById('scName').value = category ? category.name : '';
  document.getElementById('scIcon').value = category ? category.icon : '';
  document.getElementById('scColor').value = category ? category.color : '#0369a1';
  document.getElementById('scPosition').value = category ? category.position : 0;
  document.getElementById('scIsActive').checked = category ? Boolean(category.is_active) : true;

  wrapper.style.display = 'block';
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeServiceCategoryForm() {
  editingServiceCategoryId = null;
  const wrapper = document.getElementById('serviceCategoryFormWrapper');
  if (wrapper) wrapper.style.display = 'none';
  const form = document.getElementById('serviceCategoryForm');
  if (form) form.reset();
}

async function handleServiceCategorySubmit(e) {
  e.preventDefault();

  const payload = {
    name: document.getElementById('scName').value.trim(),
    icon: document.getElementById('scIcon').value.trim(),
    color: document.getElementById('scColor').value,
    position: parseInt(document.getElementById('scPosition').value, 10) || 0,
    is_active: document.getElementById('scIsActive').checked
  };

  const id = document.getElementById('scId').value;
  const btn = document.getElementById('scSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  try {
    const res = await adminFetch(id ? `/api/admin/service-categories/${id}` : '/api/admin/service-categories', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'تم الحفظ بنجاح');
      closeServiceCategoryForm();
      await fetchAdminServiceCategories();
      await fetchPublicServiceCategories();
    } else {
      alert(data.message || 'حدث خطأ أثناء الحفظ');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> حفظ الفئة';
  }
}

/**
 * ٤٠٩ محتمل هنا رغم نجاح جزئي على الخادم: فئة لها مزوّدون تُعطَّل فعلاً ثم
 * يُرمى ApiError.conflict بعد التعطيل (services.service.js deleteCategory) —
 * بخلاف deleteVillage التي لا ترمي شيئاً أبداً. لذلك القائمة تُعاد تحميلها
 * دوماً في finally بصرف النظر عن نجاح الطلب ظاهرياً، بنفس نمط deleteOccasionType.
 */
async function handleDeleteServiceCategory(id) {
  if (!confirm('حذف فئة الخدمة هذه؟ إن وُجد مزوّدون مرتبطون بها سيُعطَّل ظهورها بدلاً من حذفها.')) return;
  try {
    const res = await adminFetch(`/api/admin/service-categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message || (data.success ? 'تم الحذف' : 'حدث خطأ'));
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    await fetchAdminServiceCategories();
    await fetchPublicServiceCategories();
  }
}

// ======================================================================
// 12. Admin ↔ Town Assignment — سوبر أدمن حصراً (قصص 31، 36)
// ======================================================================

async function fetchAdminAdmins() {
  try {
    const res = await adminFetch('/api/admin/admins');
    const data = await res.json();
    if (res.status === 403) { renderAdminsForbidden(data.message); return; }
    if (data.success) {
      allAdminsWithTowns = data.admins;
      renderAdminsList();
    }
  } catch (e) {
    console.error('Admins error:', e);
  }
}

function renderAdminsForbidden(message) {
  const container = document.getElementById('adminsList');
  if (container) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-lock" style="font-size: 2.2rem; color: var(--danger-red); margin-bottom: 10px;"></i>
        <p>${escapeHtml(message || 'صلاحيات المدير العام مطلوبة')}</p>
      </div>
    `;
  }
}

/** أدمن بلا أي بلدة مؤشَّر عليه بوضوح — هذا بالضبط الحال الذي لا يرى فيه شيئاً (قصة 36، fail closed). */
function renderAdminsList() {
  const container = document.getElementById('adminsList');
  if (!container) return;

  if (!allAdminsWithTowns.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-folder-open" style="font-size: 2.2rem; color: var(--gold-main); margin-bottom: 10px;"></i>
        <p>لا يوجد حساب بدور "أدمن" بعد</p>
      </div>
    `;
    return;
  }

  container.innerHTML = allAdminsWithTowns.map(a => `
    <div class="pane-box admin-town-assign-row">
      <div class="admin-town-assign-head">
        <div>
          <strong>${escapeHtml(a.full_name)}</strong>
          <span style="color:var(--text-dim); font-size:0.82rem; margin-inline-start:10px;">${escapeHtml(a.phone_number)}</span>
        </div>
        ${a.towns.length === 0
          ? '<span class="status-tag pending"><i class="fa-solid fa-triangle-exclamation"></i> لا يرى شيئاً بعد — بلا بلدة مُسنَدة</span>'
          : `<span class="status-tag approved">${a.towns.length} بلدة/بلدات</span>`}
      </div>
      <div class="provider-towns-picker">
        ${TOWNS.map(town => `
          <label class="ot-check"><input type="checkbox" class="admin-town-check" data-admin-id="${a.id}" value="${escapeHtml(town)}" ${a.towns.includes(town) ? 'checked' : ''}> ${escapeHtml(town)}</label>
        `).join('')}
      </div>
      <button type="button" class="admin-btn-primary occasion-type-new-btn" style="margin-top:14px;" onclick="handleSaveAdminTowns(${a.id})">
        <i class="fa-solid fa-check"></i> حفظ بلدات هذا الأدمن
      </button>
    </div>
  `).join('');
}

async function handleSaveAdminTowns(adminId) {
  const towns = Array.from(document.querySelectorAll(`.admin-town-check[data-admin-id="${adminId}"]:checked`)).map(cb => cb.value);
  try {
    const res = await adminFetch(`/api/admin/admins/${adminId}/towns`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ towns })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'تم تحديث بلدات الأدمن بنجاح');
      await fetchAdminAdmins();
    } else {
      alert(data.message || 'تعذّر الحفظ');
    }
  } catch (e) {
    alert('تعذر الاتصال بالخادم');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
