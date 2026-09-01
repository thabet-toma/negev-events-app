let adminToken = localStorage.getItem('negev_admin_token') || null;
let allAdminEvents = [];
let currentFilterStatus = 'all';
let searchKeyword = '';
let allOccasionTypes = [];
let editingOccasionTypeId = null;

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

  // مسارات /api/admin/occasion-types خلف requireSuperAdmin وحده — الدور
  // المخزَّن ادّعاءٌ محلي قد يكون قديماً، ولذا يُتحقّق منه فعلياً أيضاً في
  // fetchOccasionTypes عبر معالجة 403 لا افتراضه صحيحاً هنا فقط.
  const isSuperAdmin = localStorage.getItem('negev_admin_role') === 'super_admin';
  const occasionTypesTabBtn = document.getElementById('tabOccasionTypesBtn');
  if (occasionTypesTabBtn) occasionTypesTabBtn.style.display = isSuperAdmin ? 'flex' : 'none';

  loadAdminDashboard();
}

// 2. Load Dashboard Stats & Events
async function loadAdminDashboard() {
  const tasks = [
    fetchKPIStats(),
    fetchAdminEvents(),
    fetchAdminComments(),
    fetchAdminUsers()
  ];
  if (localStorage.getItem('negev_admin_role') === 'super_admin') {
    tasks.push(fetchOccasionTypes());
  }
  await Promise.all(tasks);
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

// 6. Comments Moderation
async function fetchAdminComments() {
  try {
    const res = await adminFetch('/api/admin/comments');
    const data = await res.json();

    if (data.success) {
      const container = document.getElementById('adminCommentsList');
      if (data.comments.length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:20px;">لا توجد تعليقات</p>';
        return;
      }

      container.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>المرسل</th>
              <th>الرتبة</th>
              <th>نص التهنئة / الرسالة</th>
              <th>التاريخ</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            ${data.comments.map(c => `
              <tr>
                <td><strong>${escapeHtml(c.sender_name)}</strong></td>
                <td><span style="color:var(--gold-main);">${escapeHtml(c.badge_title || '')}</span></td>
                <td>${escapeHtml(c.message)}</td>
                <td style="font-size:0.75rem; color:var(--text-dim);">${new Date(c.created_at).toLocaleDateString('ar-EG')}</td>
                <td>
                  <button class="btn-delete" onclick="deleteAdminComment(${c.id})" title="حذف التعليق">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (e) {
    console.error('Comments error:', e);
  }
}

async function deleteAdminComment(id) {
  if (!confirm('حذف هذا التعليق نهائياً؟')) return;
  try {
    const res = await adminFetch(`/api/admin/comments/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchAdminComments();
      fetchKPIStats();
    }
  } catch (e) {
    alert('تعذر الحذف');
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
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.add('active-pane');

  const tabIndex = ['tabEvents', 'tabDirectAdd', 'tabBroadcast', 'tabComments', 'tabUsers', 'tabOccasionTypes'].indexOf(tabId);
  const btns = document.querySelectorAll('.admin-nav-tabs .admin-tab-btn');
  if (btns[tabIndex]) btns[tabIndex].classList.add('active');
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
