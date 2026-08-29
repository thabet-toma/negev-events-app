// State Management
let allEvents = [];
let selectedTown = 'الكل';
let searchQuery = '';
let currentAudio = null;
let currentAudioBtn = null;
let currentChatEventId = null;
let socket = null;
let stickerTheme = 'royal-gold';
let leafletMap = null;
let nokootChart = null;

// Auth State
let currentUser = JSON.parse(localStorage.getItem('negev_user') || 'null');
let authToken = localStorage.getItem('negev_token') || null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  setupTownFilters();
  updateAuthUI();
  fetchEvents();
  fetchStories();
  renderStickerCanvas();
  
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('addEventDate');
  if (dateInput) dateInput.value = today;
  
  const nokootDateInput = document.getElementById('nokootDate');
  if (nokootDateInput) nokootDateInput.value = today;
});

// 1. Socket.io Realtime Setup
function initSocket() {
  try {
    socket = io();
    socket.on('new_event_created', (data) => {
      showToast(`🎉 تم نشر مناسبة جديدة في ${data.town}: ${data.title}`);
      fetchEvents();
    });

    socket.on('system_broadcast', (data) => {
      const banner = document.getElementById('broadcastBanner');
      const text = document.getElementById('broadcastText');
      if (banner && text) {
        text.textContent = `${data.title}: ${data.message}`;
        banner.style.display = 'flex';
      }
    });
  } catch (e) {
    console.log('Socket initialization note:', e);
  }
}

function dismissBanner() {
  const banner = document.getElementById('broadcastBanner');
  if (banner) banner.style.display = 'none';
}

// 2. Stories / Snaps Loader
async function fetchStories() {
  try {
    const res = await fetch('/api/stories');
    const data = await res.json();
    const container = document.getElementById('storiesContainer');

    if (data.success && data.stories) {
      container.innerHTML = data.stories.map(s => `
        <div class="story-item" onclick="showToast('📹 جاري فتح قصة: ${escapeHtml(s.title)}')">
          <div class="story-avatar-ring ${s.isLive ? 'live' : ''}">
            <img src="${s.image}" class="story-avatar-img" alt="${escapeHtml(s.title)}">
          </div>
          <span class="story-title">${escapeHtml(s.title)}</span>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error('Stories error:', e);
  }
}

// 3. Fetch Events from API
async function fetchEvents() {
  const container = document.getElementById('eventsContainer');
  try {
    let url = `/api/events?town=${encodeURIComponent(selectedTown)}`;
    if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
    
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      allEvents = data.events;
      renderEvents(allEvents);
    } else {
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>تعذر جلب المناسبات حالياً</p></div>`;
    }
  } catch (err) {
    console.error('Error fetching events:', err);
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>حدث خطأ في الاتصال بالخادم</p></div>`;
  }
}

// 4. Render Event Cards
function renderEvents(events) {
  const container = document.getElementById('eventsContainer');
  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-calendar-xmark"></i>
        <h3>لا توجد مناسبات مسجلة</h3>
        <p>كن أول من يعلن عن مناسبة في ${selectedTown === 'الكل' ? 'منطقة النقب' : selectedTown}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = events.map(evt => {
    const eventDate = new Date(evt.event_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = eventDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let countdownText = '';
    if (diffDays === 0) countdownText = '🔥 اليوم الفرح';
    else if (diffDays === 1) countdownText = '⏳ غداً الفرح';
    else if (diffDays > 1) countdownText = `⏳ باقي ${diffDays} أيام`;
    else countdownText = '✨ مناسبة سابقة';

    const formattedDate = new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(eventDate);

    let wazeUrl = '';
    let mapsUrl = '';
    if (evt.latitude && evt.longitude) {
      wazeUrl = `https://waze.com/ul?ll=${evt.latitude},${evt.longitude}&navigate=yes`;
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${evt.latitude},${evt.longitude}`;
    } else {
      const q = encodeURIComponent(`${evt.location_name} ${evt.town} النقب`);
      wazeUrl = `https://waze.com/ul?q=${q}&navigate=yes`;
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${q}`;
    }

    const audioBlock = evt.audio_url ? `
      <div class="card-audio-player">
        <div class="audio-info-area">
          <div class="wave-bars" id="waveBars-${evt.id}">
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
          </div>
          <div class="audio-text">
            <div class="audio-title">${escapeHtml(evt.audio_title || 'شيلة الفرح والترحيب')}</div>
            <div class="audio-sub">استمع للشيلة أو الترحيب الصوتي</div>
          </div>
        </div>
        <button class="play-audio-btn" onclick="toggleAudio('${evt.audio_url}', this, ${evt.id})" title="تشغيل / إيقاف">
          <i class="fa-solid fa-play"></i>
        </button>
      </div>
    ` : '';

    return `
      <div class="event-card" id="eventCard-${evt.id}">
        <div class="card-header-bar">
          <div class="card-clan-town">
            <span class="town-badge">${escapeHtml(evt.town)}</span>
            <span class="clan-text">${escapeHtml(evt.family_clan || '')}</span>
          </div>
          <span class="countdown-badge">${countdownText}</span>
        </div>

        <div class="card-poster-wrapper">
          <img src="${evt.poster_url}" alt="${escapeHtml(evt.groom_name)}" class="card-poster-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80'">
        </div>

        ${audioBlock}

        <div class="card-body">
          <h2 class="event-main-title">${escapeHtml(evt.title)}</h2>
          
          <div class="event-details-grid">
            <div class="detail-item">
              <i class="fa-solid fa-calendar-day"></i>
              <span><strong>التاريخ:</strong> ${formattedDate}</span>
            </div>
            ${evt.youth_party_date ? `
            <div class="detail-item">
              <i class="fa-solid fa-fire"></i>
              <span><strong>سهرة الشباب والدحة:</strong> ${evt.youth_party_date}</span>
            </div>` : ''}
            <div class="detail-item">
              <i class="fa-solid fa-utensils"></i>
              <span><strong>طعام العشاء:</strong> ${escapeHtml(evt.dinner_time || 'الساعة 8:00 مساءً')}</span>
            </div>
            <div class="detail-item">
              <i class="fa-solid fa-location-dot"></i>
              <span><strong>الموقع:</strong> ${escapeHtml(evt.location_name)}</span>
            </div>
          </div>

          <!-- 1-Click Navigation -->
          <div class="nav-buttons-row">
            <a href="${wazeUrl}" target="_blank" class="waze-btn">
              <i class="fa-brands fa-waze"></i> الملاحة عبر Waze
            </a>
            <a href="${mapsUrl}" target="_blank" class="maps-btn">
              <i class="fa-solid fa-location-arrow"></i> خرائط Google
            </a>
          </div>

          <!-- Quick Reaction Bar -->
          <div class="reaction-bar">
            <button class="reaction-btn" onclick="sendReaction(${evt.id}, 'coffee', this)">
              <span class="emoji">☕</span>
              <span class="react-count">${evt.reactions?.coffee || 0}</span>
            </button>
            <button class="reaction-btn" onclick="sendReaction(${evt.id}, 'horse', this)">
              <span class="emoji">🐎</span>
              <span class="react-count">${evt.reactions?.horse || 0}</span>
            </button>
            <button class="reaction-btn" onclick="sendReaction(${evt.id}, 'fireworks', this)">
              <span class="emoji">🎆</span>
              <span class="react-count">${evt.reactions?.fireworks || 0}</span>
            </button>
            <button class="reaction-btn" onclick="sendReaction(${evt.id}, 'rose', this)">
              <span class="emoji">🌹</span>
              <span class="react-count">${evt.reactions?.rose || 0}</span>
            </button>
            <button class="reaction-btn" onclick="sendReaction(${evt.id}, 'hand', this)">
              <span class="emoji">🤝</span>
              <span class="react-count">${evt.reactions?.hand || 0}</span>
            </button>
          </div>

          <!-- Action Buttons Footer -->
          <div class="card-footer-actions">
            <button class="chat-trigger-btn" onclick="openChatModal(${evt.id})">
              <i class="fa-regular fa-comments"></i> تبريكات ودردشة
            </button>
            <button class="record-nokoot-btn" onclick="quickRecordNokoot('${escapeHtml(evt.groom_name)}', '${evt.event_date}', '${escapeHtml(evt.town)}')">
              <i class="fa-solid fa-wallet"></i> تسجيل نقوط
            </button>
          </div>

        </div>
      </div>
    `;
  }).join('');
}

// 5. Audio Player Controller
function toggleAudio(audioUrl, btnElement, eventId) {
  const waveBars = document.getElementById(`waveBars-${eventId}`);

  if (currentAudio && !currentAudio.paused && currentAudio.src.includes(audioUrl)) {
    currentAudio.pause();
    btnElement.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (waveBars) waveBars.classList.remove('playing');
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    if (currentAudioBtn) currentAudioBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    document.querySelectorAll('.wave-bars').forEach(wb => wb.classList.remove('playing'));
  }

  currentAudio = new Audio(audioUrl);
  currentAudioBtn = btnElement;
  btnElement.innerHTML = '<i class="fa-solid fa-pause"></i>';
  if (waveBars) waveBars.classList.add('playing');

  currentAudio.play().catch(err => {
    console.error('Audio playback error:', err);
    btnElement.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (waveBars) waveBars.classList.remove('playing');
  });

  currentAudio.onended = () => {
    btnElement.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (waveBars) waveBars.classList.remove('playing');
  };
}

// 6. Interactive Leaflet Map for Negev
async function initLeafletMap() {
  const mapElement = document.getElementById('negevEventsMap');
  if (!mapElement) return;

  if (!leafletMap) {
    // Centered on Negev (Beer Sheva / Rahat area)
    leafletMap = L.map('negevEventsMap').setView([31.2858, 34.8431], 10);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(leafletMap);
  }

  try {
    const res = await fetch('/api/map/events');
    const data = await res.json();

    if (data.success && data.points) {
      data.points.forEach(pt => {
        const customIcon = L.divIcon({
          className: 'custom-gold-marker',
          html: `<div style="background:#dfb15b; color:#06150f; font-weight:800; font-size:12px; padding:4px 8px; border-radius:12px; border:2px solid #ffffff; box-shadow:0 4px 10px rgba(0,0,0,0.5); white-space:nowrap;">💍 ${escapeHtml(pt.groom_name)}</div>`,
          iconSize: [80, 30]
        });

        L.marker([pt.latitude, pt.longitude], { icon: customIcon })
          .addTo(leafletMap)
          .bindPopup(`
            <div style="text-align:right; font-family:Tajawal, sans-serif;">
              <h4 style="color:#dfb15b; margin-bottom:4px;">${escapeHtml(pt.title)}</h4>
              <p style="font-size:12px; margin-bottom:4px;"><strong>البلدة:</strong> ${escapeHtml(pt.town)}</p>
              <p style="font-size:12px; margin-bottom:8px;"><strong>التاريخ:</strong> ${pt.event_date}</p>
              <a href="${pt.waze_url}" target="_blank" style="background:#33ccff; color:#000; padding:4px 10px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:12px; display:inline-block;">الملاحة عبر Waze</a>
            </div>
          `);
      });
    }
  } catch (e) {
    console.error('Map points error:', e);
  }

  setTimeout(() => { leafletMap.invalidateSize(); }, 300);
}

// 7. AI Smart Nabati Poetry Generator
function openAIPoemModal() {
  document.getElementById('aiPoemModal').style.display = 'flex';
}

function closeAIPoemModal() {
  document.getElementById('aiPoemModal').style.display = 'none';
}

async function generateAIPoem() {
  const groom = document.getElementById('aiGroomInput').value.trim();
  const clan = document.getElementById('aiClanInput').value.trim();

  try {
    const res = await fetch('/api/ai/generate-poem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groom_name: groom, clan: clan })
    });
    const data = await res.json();

    if (data.success && data.poem) {
      document.getElementById('poemCategory').textContent = data.poem.category;
      document.getElementById('poemLine1').textContent = data.poem.verse1;
      document.getElementById('poemLine2').textContent = data.poem.verse2;
      document.getElementById('aiPoemResult').style.display = 'block';
    }
  } catch (e) {
    alert('حدث خطأ أثناء توليد الأبيات');
  }
}

function copyAIPoem() {
  const line1 = document.getElementById('poemLine1').textContent;
  const line2 = document.getElementById('poemLine2').textContent;
  navigator.clipboard.writeText(`${line1}\n${line2}`).then(() => {
    showToast('✨ تم نسخ أبيات التهنئة بنجاح!');
  });
}

function sharePoemToWhatsApp() {
  const line1 = document.getElementById('poemLine1').textContent;
  const line2 = document.getElementById('poemLine2').textContent;
  const text = encodeURIComponent(`🎉 تهنئة مباركة:\n\n${line1}\n${line2}\n\nعبر تطبيق وموقع مناسبات النقب: ${window.location.origin}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

// 8. AI Card OCR Scanner Simulation
async function simulateAICardScan() {
  showToast('🔍 جاري مسح كرت الدعوة واستخراج البيانات بالذكاء الاصطناعي...');
  
  try {
    const res = await fetch('/api/ai/scan-card', { method: 'POST' });
    const data = await res.json();

    if (data.success && data.extracted) {
      const ext = data.extracted;
      document.getElementById('addGroomName').value = ext.groom_name;
      document.getElementById('addFamily').value = ext.family_clan;
      document.getElementById('addTown').value = ext.town;
      document.getElementById('addEventDate').value = ext.event_date;
      document.getElementById('addDinnerTime').value = ext.dinner_time;
      document.getElementById('addLocationName').value = ext.location_name;

      checkDateCollisionLive();
      showToast(`✅ تم استخراج بيانات كرت ${ext.groom_name} بنجاح! دقة: ${ext.confidence}`);
    }
  } catch (e) {
    alert('تعذر مسح الكرت');
  }
}

// 9. Reactions Controller
async function sendReaction(eventId, type, btnElement) {
  try {
    const res = await fetch(`/api/events/${eventId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reaction_type: type,
        user_identifier: currentUser?.phone_number || 'guest'
      })
    });
    if (res.ok) {
      const countSpan = btnElement.querySelector('.react-count');
      if (countSpan) countSpan.textContent = parseInt(countSpan.textContent || '0') + 1;
      btnElement.style.transform = 'scale(1.25)';
      setTimeout(() => { btnElement.style.transform = 'scale(1)'; }, 200);
    }
  } catch (e) {
    console.error('Reaction error:', e);
  }
}

// 10. Navigation Tabs Switcher
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-tab'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active-tab');

  const navIndex = ['tabHome', 'tabMap', 'tabAdd', 'tabNokoot', 'tabStickers'].indexOf(tabId);
  const navBtns = document.querySelectorAll('.bottom-navbar .nav-btn');
  if (navBtns[navIndex]) navBtns[navIndex].classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabId === 'tabNokoot') loadNokootView();
  else if (tabId === 'tabStickers') renderStickerCanvas();
  else if (tabId === 'tabMap') initLeafletMap();
}

// 11. Town Filter & Search
function setupTownFilters() {
  const pills = document.querySelectorAll('.town-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedTown = pill.dataset.town;
      fetchEvents();
    });
  });
}

function handleSearch() {
  const val = document.getElementById('eventSearchInput').value.trim();
  searchQuery = val;
  const clearBtn = document.getElementById('clearSearchBtn');
  clearBtn.style.display = val ? 'block' : 'none';
  fetchEvents();
}

function clearSearch() {
  document.getElementById('eventSearchInput').value = '';
  searchQuery = '';
  document.getElementById('clearSearchBtn').style.display = 'none';
  fetchEvents();
}

// 12. Add Event & Collision Check
async function checkDateCollisionLive() {
  const date = document.getElementById('addEventDate').value;
  const town = document.getElementById('addTown').value;
  const alertBox = document.getElementById('collisionAlert');

  if (!date) {
    alertBox.style.display = 'none';
    return;
  }

  try {
    const res = await fetch('/api/check-collision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, town })
    });
    const data = await res.json();

    if (data.hasCollision) {
      alertBox.style.display = 'block';
      alertBox.className = 'collision-box warn';
      alertBox.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        <strong>تنبيه تضارب مواعيد:</strong> يوجد بالفعل (${data.count}) مناسبة مسجلة في <strong>${town}</strong> في تاريخ ${date}.
      `;
    } else {
      alertBox.style.display = 'block';
      alertBox.className = 'collision-box safe';
      alertBox.innerHTML = `
        <i class="fa-solid fa-circle-check"></i>
        <strong>الموعد متاح وممتاز:</strong> لا يوجد تضارب في مناسبات <strong>${town}</strong> في هذا اليوم.
      `;
    }
  } catch (e) {
    console.error('Collision check error:', e);
  }
}

async function handleEventSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitEventBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';

  const formData = new FormData();
  formData.append('groom_name', document.getElementById('addGroomName').value);
  formData.append('town', document.getElementById('addTown').value);
  formData.append('family_clan', document.getElementById('addFamily').value);
  formData.append('event_date', document.getElementById('addEventDate').value);
  formData.append('youth_party_date', document.getElementById('addYouthDate').value);
  formData.append('dinner_time', document.getElementById('addDinnerTime').value);
  formData.append('host_phone', document.getElementById('addHostPhone').value);
  formData.append('location_name', document.getElementById('addLocationName').value);
  formData.append('latitude', document.getElementById('addLat').value);
  formData.append('longitude', document.getElementById('addLng').value);

  const posterFile = document.getElementById('addPosterFile').files[0];
  if (posterFile) formData.append('poster', posterFile);

  const audioFile = document.getElementById('addAudioFile').files[0];
  if (audioFile) formData.append('audio', audioFile);

  try {
    const res = await fetch('/api/events', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
      if (data.status === 'pending') {
        alert('✅ تم إرسال طلب إعلان المناسبة بنجاح!\n\nطلبك الآن قيد مراجعة واعتماد الإدارة، وسيتم نشره على التطبيق بعد التحقق خلال دقائق.');
      } else {
        showToast('🎉 تم نشر المناسبة بنجاح!');
      }
      document.getElementById('addEventForm').reset();
      document.getElementById('collisionAlert').style.display = 'none';
      switchTab('tabHome');
      fetchEvents();
    } else {
      alert(data.message || 'حدث خطأ أثناء النشر');
    }
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال طلب إعلان المناسبة للإدارة للمراجعة';
  }
}

// 13. Live Chat & Congratulations Modal
async function openChatModal(eventId) {
  currentChatEventId = eventId;
  const modal = document.getElementById('chatModal');
  modal.style.display = 'flex';

  const hostBar = document.getElementById('chatHostBar');
  const stream = document.getElementById('chatMessagesStream');
  stream.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>جاري جلب التبريكات...</p></div>';

  if (currentUser) {
    document.getElementById('chatSenderName').value = currentUser.full_name;
  }

  try {
    const res = await fetch(`/api/events/${eventId}`);
    const data = await res.json();

    if (data.success) {
      const evt = data.event;
      document.getElementById('chatModalTitle').textContent = `تبريكات: ${evt.groom_name}`;
      document.getElementById('chatModalSubtitle').textContent = `${evt.town} - ${evt.event_date}`;

      if (evt.host_phone) {
        hostBar.style.display = 'flex';
        hostBar.innerHTML = `
          <a href="tel:${evt.host_phone}" class="host-call-btn"><i class="fa-solid fa-phone"></i> اتصال بالمعلن (${evt.host_phone})</a>
          <a href="https://wa.me/972${evt.host_phone.replace(/^0/, '')}" target="_blank" class="host-wa-btn"><i class="fa-brands fa-whatsapp"></i> واتساب المعلن</a>
        `;
      } else {
        hostBar.style.display = 'none';
      }

      renderChatMessages(evt.congratulations);
    }
  } catch (e) {
    console.error('Chat error:', e);
  }
}

function renderChatMessages(congrats) {
  const stream = document.getElementById('chatMessagesStream');
  if (!congrats || congrats.length === 0) {
    stream.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>كن أول المهنئين والمباركين للعريس!</p></div>';
    return;
  }

  stream.innerHTML = congrats.map(c => `
    <div class="chat-bubble">
      <div class="chat-bubble-header">
        <span class="sender-name">${escapeHtml(c.sender_name)}</span>
        <span class="sender-badge">${escapeHtml(c.badge_title || 'مبارك')}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(c.message)}</div>
    </div>
  `).join('');

  stream.scrollTop = stream.scrollHeight;
}

function closeChatModal() {
  document.getElementById('chatModal').style.display = 'none';
  currentChatEventId = null;
}

function insertEmojiToChat(text) {
  const input = document.getElementById('chatInputMessage');
  input.value = (input.value ? input.value + ' ' : '') + text;
  input.focus();
}

async function sendCongratulation(e) {
  e.preventDefault();
  if (!currentChatEventId) return;

  const senderName = document.getElementById('chatSenderName').value.trim();
  const message = document.getElementById('chatInputMessage').value.trim();

  if (!senderName || !message) return;

  try {
    const res = await fetch(`/api/events/${currentChatEventId}/congratulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_name: senderName,
        badge_title: 'مبارك الفرح',
        message: message
      })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('chatInputMessage').value = '';
      openChatModal(currentChatEventId);
    }
  } catch (e) {
    alert('تعذر إرسال التهنئة');
  }
}

// 14. Nokoot Ledger & Financial Chart
function loadNokootView() {
  const lockedView = document.getElementById('nokootLockedView');
  const unlockedView = document.getElementById('nokootUnlockedView');

  if (!authToken || !currentUser) {
    lockedView.style.display = 'block';
    unlockedView.style.display = 'none';
  } else {
    lockedView.style.display = 'none';
    unlockedView.style.display = 'block';
    fetchNokootRecords();
  }
}

async function fetchNokootRecords() {
  try {
    const res = await fetch('/api/nokoot', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('nokootTotalAmount').textContent = `${data.totalAmount.toLocaleString()} ₪`;
      document.getElementById('nokootCount').textContent = data.count;
      document.getElementById('nokootAverage').textContent = `${data.analytics?.averageNokoot || 0} ₪`;

      renderNokootChart(data.analytics?.townBreakdown || {});

      const list = document.getElementById('nokootList');
      if (data.records.length === 0) {
        list.innerHTML = `
          <div class="empty-state" style="padding:20px;">
            <i class="fa-solid fa-wallet"></i>
            <p>لا توجد قيود نقوط مسجلة حتى الآن. اضغط على الزر بالأعلى لتسجيل نقوطك.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = data.records.map(item => `
        <div class="nokoot-item-card">
          <div class="nokoot-item-info">
            <h4>${escapeHtml(item.recipient_name)} (${escapeHtml(item.clan_town || 'النقب')})</h4>
            <div class="nokoot-item-meta">
              <span><i class="fa-regular fa-calendar"></i> ${item.event_date}</span>
              ${item.notes ? ` • <span>${escapeHtml(item.notes)}</span>` : ''}
            </div>
          </div>
          <div class="nokoot-amount-badge">
            <span class="nokoot-amount-val">${item.amount} ₪</span>
            <button class="nokoot-del-btn" onclick="deleteNokoot(${item.id})"><i class="fa-solid fa-trash"></i> حذف</button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error('Nokoot fetch error:', e);
  }
}

function renderNokootChart(townData) {
  const canvas = document.getElementById('nokootChartCanvas');
  if (!canvas) return;

  const labels = Object.keys(townData);
  const values = Object.values(townData);

  if (labels.length === 0) {
    labels.push('لا توجد بيانات');
    values.push(1);
  }

  if (nokootChart) nokootChart.destroy();

  nokootChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ['#dfb15b', '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Tajawal' } }
        }
      }
    }
  });
}

function exportNokootData() {
  fetch('/api/nokoot', { headers: { 'Authorization': `Bearer ${authToken}` } })
    .then(res => res.json())
    .then(data => {
      if (!data.success || !data.records || data.records.length === 0) {
        alert('لا توجد بيانات للتصدير');
        return;
      }
      let csv = 'اسم الشخص,البلدة,المبلغ بالشيكل,التاريخ,ملاحظات\n';
      data.records.forEach(r => {
        csv += `"${r.recipient_name}","${r.clan_town || ''}","${r.amount}","${r.event_date}","${r.notes || ''}"\n`;
      });
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `سجل-النقوط-مناسبات-النقب-${Date.now()}.csv`;
      link.click();
    });
}

function quickRecordNokoot(groomName, eventDate, town) {
  if (!authToken) {
    openAuthModal();
    return;
  }
  document.getElementById('nokootRecipient').value = groomName;
  document.getElementById('nokootDate').value = eventDate;
  document.getElementById('nokootClan').value = town;
  openAddNokootModal();
}

function openAddNokootModal() {
  document.getElementById('addNokootModal').style.display = 'flex';
}

function closeAddNokootModal() {
  document.getElementById('addNokootModal').style.display = 'none';
}

async function handleAddNokoot(e) {
  e.preventDefault();
  const recipient = document.getElementById('nokootRecipient').value;
  const amount = document.getElementById('nokootAmount').value;
  const date = document.getElementById('nokootDate').value;
  const clan = document.getElementById('nokootClan').value;
  const notes = document.getElementById('nokootNotes').value;

  try {
    const res = await fetch('/api/nokoot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        recipient_name: recipient,
        amount: amount,
        event_date: date,
        clan_town: clan,
        notes: notes
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('💰 تم حفظ قيد النقوط بنجاح');
      closeAddNokootModal();
      document.getElementById('addNokootForm').reset();
      fetchNokootRecords();
    }
  } catch (err) {
    alert('حدث خطأ أثناء حفظ النقوط');
  }
}

async function deleteNokoot(id) {
  if (!confirm('هل أنت متأكد من حذف هذا القيد؟')) return;
  try {
    const res = await fetch(`/api/nokoot/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) fetchNokootRecords();
  } catch (e) {
    console.error('Delete error:', e);
  }
}

// 15. Auth Modal & Controller
function openAuthModal() {
  document.getElementById('authModal').style.display = 'flex';
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function switchAuthMode(mode) {
  if (mode === 'login') {
    document.getElementById('authTabLogin').classList.add('active');
    document.getElementById('authTabRegister').classList.remove('active');
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
  } else {
    document.getElementById('authTabLogin').classList.remove('active');
    document.getElementById('authTabRegister').classList.add('active');
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('loginPhone').value.trim();
  const pin = document.getElementById('loginPin').value.trim();

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, pin_code: pin })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('negev_token', authToken);
      localStorage.setItem('negev_user', JSON.stringify(currentUser));
      updateAuthUI();
      closeAuthModal();
      showToast(`مرحباً بك يا ${currentUser.full_name}`);
      loadNokootView();
    } else {
      alert(data.message || 'بيانات الدخول غير صحيحة');
    }
  } catch (err) {
    alert('تعذر تسجيل الدخول');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const clan = document.getElementById('regClan').value.trim();
  const pin = document.getElementById('regPin').value.trim();

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, phone_number: phone, clan_town: clan, pin_code: pin })
    });
    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('negev_token', authToken);
      localStorage.setItem('negev_user', JSON.stringify(currentUser));
      updateAuthUI();
      closeAuthModal();
      showToast(`تم إنشاء حسابك وتفعيل السجل بنجاح!`);
      loadNokootView();
    } else {
      alert(data.message || 'حدث خطأ في التسجيل');
    }
  } catch (err) {
    alert('تعذر إنشاء الحساب');
  }
}

function updateAuthUI() {
  const label = document.getElementById('userAuthLabel');
  const btn = document.getElementById('userAuthBtn');
  if (currentUser) {
    if (currentUser.role === 'super_admin' || currentUser.phone_number === '0500000000') {
      label.innerHTML = `👑 لوحة الإدارة`;
      btn.onclick = () => { window.location.href = '/admin.html'; };
      btn.style.borderColor = 'var(--gold-primary)';
      btn.style.background = 'rgba(223, 177, 91, 0.25)';
    } else {
      label.textContent = currentUser.full_name.split(' ')[0];
      btn.onclick = () => { switchTab('tabNokoot'); };
    }
  } else {
    label.textContent = 'تسجيل الدخول';
    btn.onclick = () => { openAuthModal(); };
  }
}

// 16. Sticker Canvas Studio
function setStickerTheme(theme) {
  stickerTheme = theme;
  document.querySelectorAll('.theme-pill').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  renderStickerCanvas();
}

function renderStickerCanvas() {
  const canvas = document.getElementById('stickerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  const sender = document.getElementById('stickerSenderName').value || 'أخوك أحمد';
  const phrase = document.getElementById('stickerPhrase').value || 'ألف ألف مبارك يا عريس';

  if (stickerTheme === 'royal-gold') {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#061a12');
    grad.addColorStop(1, '#020b08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#dfb15b';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    ctx.strokeStyle = 'rgba(223, 177, 91, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(24, 24, width - 48, height - 48);
  } else if (stickerTheme === 'bedouin-green') {
    ctx.fillStyle = '#0a2e20';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, width - 36, height - 36);
  } else {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, width - 36, height - 36);
  }

  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🌙 ✨ ☕', width / 2, 70);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px Tajawal, sans-serif';
  ctx.fillText(phrase, width / 2, 160);

  ctx.fillStyle = '#dfb15b';
  ctx.font = 'bold 28px Amiri, Tajawal, serif';
  ctx.fillText(`تهنئة خاصة من: ${sender}`, width / 2, 240);

  ctx.fillStyle = 'rgba(223, 177, 91, 0.7)';
  ctx.font = '14px Tajawal, sans-serif';
  ctx.fillText('مناسبات وأعراس النقب • دياركم عامرة', width / 2, 340);
}

function downloadStickerImage() {
  const canvas = document.getElementById('stickerCanvas');
  const link = document.createElement('a');
  link.download = `تهنئة-مناسبات-النقب-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function shareStickerToWhatsApp() {
  const sender = document.getElementById('stickerSenderName').value || 'أخوكم';
  const phrase = document.getElementById('stickerPhrase').value;
  const text = encodeURIComponent(`🎉 ${phrase}\nتهنئة خاصة من: ${sender}\n\nعبر تطبيق وموقع مناسبات النقب: ${window.location.origin}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.style.cssText = `
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: #dfb15b;
    color: #06150f;
    font-weight: 800;
    padding: 10px 22px;
    border-radius: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    z-index: 9999;
    font-family: Tajawal, sans-serif;
    font-size: 0.86rem;
    animation: fadeIn 0.2s;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3500);
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
