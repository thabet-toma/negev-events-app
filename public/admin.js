let adminToken = localStorage.getItem('negev_admin_token') || null;
let allAdminEvents = [];
let currentFilterStatus = 'all';
let searchKeyword = '';

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
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, pin_code: pin })
    });
    const data = await res.json();

    if (data.success) {
      adminToken = data.token;
      localStorage.setItem('negev_admin_token', adminToken);
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
  loadAdminDashboard();
}

// 2. Load Dashboard Stats & Events
async function loadAdminDashboard() {
  await Promise.all([
    fetchKPIStats(),
    fetchAdminEvents(),
    fetchAdminComments(),
    fetchAdminUsers()
  ]);
}

async function fetchKPIStats() {
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
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
    const res = await fetch('/api/admin/events', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
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

        <img src="${evt.poster_url}" class="admin-card-poster" alt="poster" onerror="this.src='https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80'">

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
    const res = await fetch(`/api/admin/events/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
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
    const res = await fetch(`/api/admin/events/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
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
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
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
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
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
    const res = await fetch('/api/admin/comments', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
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
    const res = await fetch(`/api/admin/comments/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
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
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
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

// UI Navigation Helpers
function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active-pane'));
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.add('active-pane');

  const tabIndex = ['tabEvents', 'tabDirectAdd', 'tabBroadcast', 'tabComments', 'tabUsers'].indexOf(tabId);
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
