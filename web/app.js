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

// Publish-form location picker (#20 step 6)
let locationPickerMap = null;
let locationPickerMarker = null;
let pickerPinPlacedByUser = false;
let townCoordinates = {};
let townsList = [];
const NEGEV_NEUTRAL_CENTER = [31.2858, 34.8431];

// Publish form — occasion type drives the rest of the form (#20 step 9)
let occasionTypesCache = null;
let selectedOccasionType = null;
let myEventsCache = [];

// Write actions (publish, congratulate) require login; browsing never does.
// Set right before openAuthModal() so a successful login/register can pick
// back up exactly what the visitor was trying to do (#20 step 9).
let pendingIntent = null;

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
  initAppDownload();
  
  const today = new Date().toISOString().split('T')[0];

  const nokootDateInput = document.getElementById('nokootDate');
  if (nokootDateInput) nokootDateInput.value = today;
});

// 0. Android app download entry
//
// كل الحقائق تأتي من ‎GET /api/app/version‎ — الرابط والإصدار — والحجم من
// ترويسة الملف نفسه. لا شيء مثبَّت هنا، فإصدار نسخة جديدة يبقى تغيير متغيّر
// بيئة على الخادم دون لمس الواجهة.
async function initAppDownload() {
  const btn = document.getElementById('appDownloadBtn');
  if (!btn) return;

  // ملف APK لا يعمل على iOS إطلاقاً. عرضه لمستخدم آيفون وعدٌ كاذب، فنخفيه.
  // على سطح المكتب نُبقيه: الزائر قد ينزّله لينقله إلى هاتفه، ووسم «أندرويد»
  // في النص يمنع اللبس.
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return;

  try {
    const res = await apiFetch('/api/app/version');
    if (!res.ok) return;

    const data = await res.json();
    // الإعلان معطَّل (متغيرات فارغة) → لا يظهر شيء. لا زر بلا وجهة.
    if (!data.success || !data.apk_url) return;

    btn.href = data.apk_url;
    btn.title = data.latest_version
      ? `تطبيق مناسبات النقب — الإصدار ${data.latest_version}`
      : 'تطبيق مناسبات النقب لأجهزة أندرويد';

    const size = await fetchDownloadSize(data.apk_url);
    if (size) {
      const label = document.getElementById('appDownloadSize');
      label.textContent = size;
      label.hidden = false;
    }

    btn.hidden = false;
  } catch (e) {
    // الخادم متوقف أو النداء فشل: الزائر لا يرى زراً ولا خطأ.
    console.debug('App download entry unavailable:', e);
  }
}

/** حجم الملف من ترويسة HEAD — يعود فارغاً بهدوء إن تعذّر. */
async function fetchDownloadSize(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const bytes = parseInt(res.headers.get('content-length'), 10);
    if (!bytes || Number.isNaN(bytes)) return '';
    return `${Math.round(bytes / (1024 * 1024))} م.ب`;
  } catch (e) {
    return '';
  }
}

// 1. Socket.io Realtime Setup
function initSocket() {
  try {
    socket = io(API_BASE || undefined);
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
    const res = await apiFetch('/api/stories');
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
    
    const res = await apiFetch(url);
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
    const res = await apiFetch('/api/map/events');
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

// 6b. Interactive map picker for the publish form (#20 step 6)
//
// خط الطول وخط العرض لا يُكتَبان يدوياً بعد اليوم — المستخدم يسحب دبّوساً فوق
// موقع القاعة الفعلي على الخريطة. زر «موقعي الآن» يوسّط الخريطة فقط ولا يحفظ
// أي نقطة: من يملأ هذا النموذج غالباً في بيته قبل أسابيع من المناسبة، لا في
// القاعة نفسها، فموقعه الحالي ليس موقع المناسبة.

/** يجلب مراكز البلدات وقائمة البلدات نفسها من الخادم مرة واحدة فقط. */
async function loadTownCoordinates() {
  if (Object.keys(townCoordinates).length) return;
  try {
    const res = await apiFetch('/api/towns');
    const data = await res.json();
    if (data.success) {
      if (data.town_coordinates) townCoordinates = data.town_coordinates;
      if (data.towns) townsList = data.towns.filter(t => t !== 'الكل');
    }
  } catch (e) {
    console.error('Town coordinates error:', e);
  }
}

/** يملأ قائمة بلدات منسدلة من townsList (مجلوبة من الخادم، لا قائمة مثبَّتة). */
function populateTownSelect(selectId, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = townsList.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if (selectedValue) select.value = selectedValue;
}

function setPickerCoordinates(lat, lng) {
  document.getElementById('addLat').value = lat != null ? lat : '';
  document.getElementById('addLng').value = lng != null ? lng : '';
}

/** يضع الدبّوس على نقطة (أو ينقله إن كان موضوعاً أصلاً) ويملأ الحقلين المخفيَّين. */
function placePickerMarker(lat, lng) {
  if (!locationPickerMap) return;

  if (locationPickerMarker) {
    locationPickerMarker.setLatLng([lat, lng]);
  } else {
    locationPickerMarker = L.marker([lat, lng], { draggable: true }).addTo(locationPickerMap);
    locationPickerMarker.on('dragend', () => {
      const pos = locationPickerMarker.getLatLng();
      pickerPinPlacedByUser = true;
      setPickerCoordinates(pos.lat, pos.lng);
    });
  }
  setPickerCoordinates(lat, lng);
}

/** يزيل الدبّوس الحالي بلا استبدال — يُستعمَل عند تفريغ النموذج بعد النشر. */
function clearPickerMarker() {
  if (locationPickerMarker && locationPickerMap) {
    locationPickerMap.removeLayer(locationPickerMarker);
  }
  locationPickerMarker = null;
  pickerPinPlacedByUser = false;
  setPickerCoordinates(null, null);
}

/**
 * يوسّط الخريطة على مركز البلدة المختارة، ويضع دبّوساً افتراضياً هناك ما دام
 * المستخدم لم يحرّك الدبّوس بنفسه بعد — أول تحريك يدوي (سحب أو نقر) يوقف هذا
 * التتبّع التلقائي نهائياً حتى لا يمحو تصحيحاً تعمّده المستخدم. «القرى
 * والتجمعات» بلا مركز معروف عمداً (#20 step 6, decision ٨): الخريطة تُفتح على
 * منظر عام للنقب بلا دبّوس، والمستخدم مطالَب بوضعه بنفسه.
 */
function recenterLocationPicker() {
  if (!locationPickerMap) return;
  const town = document.getElementById('addTown').value;
  const coords = townCoordinates[town];

  if (coords) {
    locationPickerMap.setView([coords.lat, coords.lng], 14);
    if (!pickerPinPlacedByUser) placePickerMarker(coords.lat, coords.lng);
  } else {
    locationPickerMap.setView(NEGEV_NEUTRAL_CENTER, 9);
  }
}

async function initLocationPickerMap() {
  const mapElement = document.getElementById('addLocationPickerMap');
  if (!mapElement) return;

  await loadTownCoordinates();

  if (!locationPickerMap) {
    locationPickerMap = L.map('addLocationPickerMap').setView(NEGEV_NEUTRAL_CENTER, 9);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(locationPickerMap);

    locationPickerMap.on('click', e => {
      pickerPinPlacedByUser = true;
      placePickerMarker(e.latlng.lat, e.latlng.lng);
    });

    // موقع المتصفح يتطلّب سياقاً آمناً (HTTPS، أو localhost أثناء التطوير) —
    // خارج ذلك يفشل باستمرار، فزر معطوب أسوأ من زر غائب (#20 step 6, decision ٧).
    const locateBtn = document.getElementById('useMyLocationBtn');
    if (locateBtn && window.isSecureContext && navigator.geolocation) {
      locateBtn.style.display = 'inline-flex';
    }
  }

  recenterLocationPicker();
  setTimeout(() => { locationPickerMap.invalidateSize(); }, 300);
}

/**
 * «موقعي الآن» يوسّط الخريطة فقط — لا يضع دبّوساً ولا يُرسِل أي إحداثية إلى
 * الخادم أبداً (#20 step 6, decision ٣). مهلة صريحة على `getCurrentPosition`
 * حتى لا يُعلَّق الزر إلى الأبد (افتراض المتصفح بلا مهلة).
 */
function centerPickerOnMyLocation() {
  if (!window.isSecureContext || !navigator.geolocation) return;

  const btn = document.getElementById('useMyLocationBtn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تحديد موقعك...';

  navigator.geolocation.getCurrentPosition(
    position => {
      locationPickerMap.setView([position.coords.latitude, position.coords.longitude], 15);
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    },
    () => {
      // رمز الخطأ 1 (PERMISSION_DENIED) يجمع ثلاث حالات: رفض المستخدم، سياق
      // غير آمن، وحجب بسياسة الأذونات — لا فرق بينها من هنا، فالرسالة تصدق
      // على الثلاث معاً بدل تخمين أيّها وقع.
      alert('تعذّر تحديد موقعك — يمكنك سحب الدبّوس يدوياً إلى موقع القاعة على الخريطة.');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
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
    const res = await apiFetch('/api/ai/generate-poem', {
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
    const res = await apiFetch('/api/ai/scan-card', { method: 'POST' });
    const data = await res.json();

    if (data.success && data.extracted) {
      const ext = data.extracted;
      // النموذج لم يعد يملك حقل «اسم العريس» مستقلاً — أول صاحب مناسبة في
      // القائمة الديناميكية هو ما يُملأ الآن (#20 step 9).
      const firstHonoreeName = document.querySelector('#addHonoreesList .honoree-row .honoree-name');
      if (firstHonoreeName) firstHonoreeName.value = ext.groom_name;
      const familyInput = document.getElementById('addFamily');
      if (familyInput) familyInput.value = ext.family_clan;
      const townInput = document.getElementById('addTown');
      if (townInput) townInput.value = ext.town;
      const dateInput = document.getElementById('addEventDate');
      if (dateInput) dateInput.value = ext.event_date;
      const dinnerInput = document.getElementById('addDinnerTime');
      if (dinnerInput) dinnerInput.value = ext.dinner_time;
      const locationInput = document.getElementById('addLocationName');
      if (locationInput) locationInput.value = ext.location_name;

      checkDateCollisionLive();
      recenterLocationPicker();
      showToast(`✅ تم استخراج بيانات كرت ${ext.groom_name} بنجاح! دقة: ${ext.confidence}`);
    }
  } catch (e) {
    alert('تعذر مسح الكرت');
  }
}

// 9. Reactions Controller
async function sendReaction(eventId, type, btnElement) {
  try {
    const res = await apiFetch(`/api/events/${eventId}/react`, {
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
//
// «إعلان مناسبة» هو أول لحظة كتابة، فالدخول يُطلَب هنا فقط — القراءة (باقي
// التبويبات) تبقى مفتوحة بلا حساب (#20 step 9). طلب الدخول يحفظ النيّة
// (pendingIntent) ليعود الزائر لهذا التبويب نفسه بعد الدخول، لا أن يضيع طلبه.
function switchTab(tabId) {
  if (tabId === 'tabAdd' && !requireAuth({ type: 'publish' })) return;

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
  else if (tabId === 'tabAdd') {
    if (!occasionTypesCache) initPublishForm();
    fetchMyEvents();
  }
}

/**
 * يحرس أي فعل كتابة (نشر، تبريك). زائر بلا حساب يُحوَّل إلى شاشة الدخول
 * الموجودة أصلاً بدل شاشة جديدة، ونيّته (pendingIntent) تُستأنف تلقائياً بعد
 * نجاح الدخول أو التسجيل — القراءة نفسها لا تمرّ من هنا أبداً (#20 step 9).
 */
function requireAuth(intent) {
  if (currentUser && authToken) return true;
  pendingIntent = intent;
  showToast('🔒 يرجى تسجيل الدخول أو إنشاء حساب أولاً للمتابعة');
  openAuthModal();
  return false;
}

/** يُستدعى بعد نجاح الدخول/التسجيل — يعيد الزائر إلى ما كان يحاول فعله بالضبط. */
function resumePendingIntent() {
  if (!pendingIntent) return;
  const intent = pendingIntent;
  pendingIntent = null;

  if (intent.type === 'publish') {
    switchTab('tabAdd');
  } else if (intent.type === 'congratulate') {
    // نافذة التبريكات لم تُغلَق أصلاً — فقط اسم المرسِل يُحدَّث الآن بعد الدخول.
    const senderInput = document.getElementById('chatSenderName');
    if (senderInput && currentUser) senderInput.value = currentUser.full_name;
  }
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

// 12. Occasion Type Picker & Dynamic Publish Form (#20 step 9)
//
// النموذج لم يعد ثابتاً — نوع المناسبة (من GET /api/occasion-types، لا قائمة
// مكتوبة هنا) يقرّر أي الحقول تظهر، بأي تسمية، وأيّها إجباري. أضف الخادم
// نوعاً جديداً غداً فسيظهر هنا بلا أي تغيير في هذا الملف.

/** يجلب أنواع المناسبات مرة واحدة فقط ويخزّنها. */
async function loadOccasionTypes() {
  if (occasionTypesCache) return occasionTypesCache;
  try {
    const res = await apiFetch('/api/occasion-types');
    const data = await res.json();
    occasionTypesCache = (data.success && data.types) ? data.types : [];
  } catch (e) {
    console.error('Occasion types error:', e);
    occasionTypesCache = [];
  }
  return occasionTypesCache;
}

/** يبني منتقي الأنواع (خطوة أولى في النموذج) ويختار أول نوع نشِط تلقائياً. */
async function initPublishForm() {
  await loadTownCoordinates();
  const picker = document.getElementById('occasionTypePicker');
  const types = await loadOccasionTypes();

  if (!types.length) {
    picker.innerHTML = '<p class="location-picker-hint">لا توجد أنواع مناسبات متاحة حالياً</p>';
    return;
  }

  picker.innerHTML = types.map(t => `
    <button type="button" class="town-pill occasion-type-pill" data-type-id="${t.id}" onclick="selectOccasionType(${t.id})">
      ${t.icon ? escapeHtml(t.icon) + ' ' : ''}${escapeHtml(t.name)}
    </button>
  `).join('');

  selectOccasionType(types[0].id);
}

function selectOccasionType(typeId) {
  const type = occasionTypesCache.find(t => t.id === typeId);
  if (!type) return;

  document.querySelectorAll('#occasionTypePicker .occasion-type-pill').forEach(pill => {
    pill.classList.toggle('active', Number(pill.dataset.typeId) === typeId);
  });

  renderOccasionForm(type);
}

/** يبني بقية النموذج من حقول هذا النوع تحديداً — الظاهر فقط، بتسميته هو. */
function renderOccasionForm(type) {
  selectedOccasionType = type;
  const orderedFields = [...type.fields].sort((a, b) => a.position - b.position);
  const uploadFields = orderedFields.filter(f => f.field_key === 'poster_url' || f.field_key === 'audio_url');
  const otherFields = orderedFields.filter(f => f.field_key !== 'poster_url' && f.field_key !== 'audio_url');

  const container = document.getElementById('dynamicFormFields');
  let html = otherFields.map(renderFieldHtml).join('');
  if (uploadFields.length) {
    html += `<div class="upload-section">${uploadFields.map(renderFieldHtml).join('')}</div>`;
  }
  container.innerHTML = html;

  const fieldsByKey = {};
  for (const f of type.fields) fieldsByKey[f.field_key] = f;

  if (fieldsByKey.town) populateTownSelect('addTown');

  const dateInput = document.getElementById('addEventDate');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  if (fieldsByKey.honorees) addHonoreeRow('addHonoreesList');

  // الخريطة مرتبطة بعنصر DOM أُعيد إنشاؤه للتو — أي مرجع قديم لها أصبح ميتاً.
  locationPickerMap = null;
  locationPickerMarker = null;
  pickerPinPlacedByUser = false;
  if (fieldsByKey.location_name) initLocationPickerMap();

  document.getElementById('collisionAlert').style.display = 'none';
}

/** حقول المناسبة المعروفة (server/src/constants.js) — كل نوع يختار الظاهر منها فقط، هذا الجدول لا يخترع حقلاً جديداً. */
function renderFieldHtml(field) {
  const req = field.is_required ? ' *' : '';
  const label = escapeHtml(field.label);

  switch (field.field_key) {
    case 'honorees':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <div id="addHonoreesList"></div>
          <button type="button" class="add-nokoot-btn" style="margin-top:6px;" onclick="addHonoreeRow('addHonoreesList')">
            <i class="fa-solid fa-plus"></i> إضافة اسم
          </button>
        </div>`;
    case 'town':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <select id="addTown" onchange="checkDateCollisionLive(); recenterLocationPicker();"></select>
        </div>`;
    case 'event_date':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="date" id="addEventDate" onchange="checkDateCollisionLive()">
        </div>`;
    case 'event_end_date':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="date" id="addEventEndDate" onchange="checkDateCollisionLive()">
        </div>`;
    case 'youth_party_date':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="date" id="addYouthDate">
        </div>`;
    case 'dinner_time':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="addDinnerTime" placeholder="مثال: 7:30 مساءً">
        </div>`;
    case 'host_phone':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="tel" id="addHostPhone" placeholder="05XXXXXXXX">
        </div>`;
    case 'title':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="addTitle" placeholder="اتركه فارغاً ليُولَّد تلقائياً">
        </div>`;
    case 'family_clan':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="addFamily" placeholder="مثال: آل الأطرش">
        </div>`;
    case 'location_name':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="addLocationName" placeholder="مثال: ديوان آل فلان بالقرب من الدوار الشرقي">
        </div>
        <div class="form-group">
          <div class="location-picker-toolbar">
            <label>حدّد الموقع على الخريطة</label>
            <button type="button" id="useMyLocationBtn" class="use-location-btn" onclick="centerPickerOnMyLocation()" style="display:none;">
              <i class="fa-solid fa-location-crosshairs"></i> موقعي الآن (لتوسيط الخريطة فقط)
            </button>
          </div>
          <div id="addLocationPickerMap" class="location-picker-map"></div>
          <p class="location-picker-hint">اسحب الدبّوس إلى الموقع الصحيح، أو انقر على المكان على الخريطة</p>
          <input type="hidden" id="addLat">
          <input type="hidden" id="addLng">
        </div>`;
    case 'secondary_location_name':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="addSecondaryLocationName" placeholder="مكان إضافي (اختياري)">
        </div>`;
    case 'poster_url':
      return `
        <div class="upload-box">
          <i class="fa-solid fa-image upload-icon"></i>
          <h4>${label}${req}</h4>
          <p>اختر صورة من الهاتف</p>
          <input type="file" id="addPosterFile" accept="image/*">
        </div>`;
    case 'audio_url':
      return `
        <div class="upload-box audio-upload">
          <i class="fa-solid fa-music upload-icon"></i>
          <h4>${label}${req}</h4>
          <p>أرفق شيلة أو مقطعاً صوتياً (MP3/M4A)</p>
          <input type="file" id="addAudioFile" accept="audio/*">
        </div>`;
    case 'audio_title':
      return `
        <div class="form-group">
          <label>${label}${req}</label>
          <input type="text" id="addAudioTitle" placeholder="مثال: شيلة الترحيب">
        </div>`;
    default:
      return '';
  }
}

// أصحاب المناسبة ١..N — مُدخل ديناميكي مشترك بين نموذج النشر ونافذة التعديل.
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

// 13. Add Event & Collision Check
async function checkDateCollisionLive() {
  const dateInput = document.getElementById('addEventDate');
  const townInput = document.getElementById('addTown');
  const alertBox = document.getElementById('collisionAlert');
  if (!dateInput || !alertBox) return;

  const date = dateInput.value;
  const town = townInput ? townInput.value : null;
  const endDateInput = document.getElementById('addEventEndDate');

  if (!date) {
    alertBox.style.display = 'none';
    return;
  }

  try {
    const res = await apiFetch('/api/check-collision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        town,
        event_end_date: endDateInput ? endDateInput.value : undefined,
        occasion_type_id: selectedOccasionType ? selectedOccasionType.id : undefined
      })
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
  if (!requireAuth({ type: 'publish' })) return;

  const type = selectedOccasionType;
  if (!type) {
    alert('يرجى اختيار نوع المناسبة أولاً');
    return;
  }

  const fieldsByKey = {};
  for (const f of type.fields) fieldsByKey[f.field_key] = f;
  const labelOf = key => (fieldsByKey[key] && fieldsByKey[key].label) || key;

  const honorees = collectHonorees('addHonoreesList');
  if (!honorees.length) {
    alert(`${labelOf('honorees')} مطلوب`);
    return;
  }

  const town = document.getElementById('addTown').value;
  const eventDate = document.getElementById('addEventDate').value;
  if (!eventDate) {
    alert(`${labelOf('event_date')} مطلوب`);
    return;
  }

  // نفس تحقّق الإجبارية الذي يطبّقه الخادم من إعداد النوع نفسه — قبل الإرسال
  // لا بعده، برسالة تحمل تسمية الحقل في هذا النوع تحديداً.
  const textFieldGetters = {
    title: () => document.getElementById('addTitle')?.value.trim(),
    family_clan: () => document.getElementById('addFamily')?.value.trim(),
    location_name: () => document.getElementById('addLocationName')?.value.trim(),
    secondary_location_name: () => document.getElementById('addSecondaryLocationName')?.value.trim(),
    event_end_date: () => document.getElementById('addEventEndDate')?.value,
    youth_party_date: () => document.getElementById('addYouthDate')?.value,
    dinner_time: () => document.getElementById('addDinnerTime')?.value.trim(),
    host_phone: () => document.getElementById('addHostPhone')?.value.trim(),
    audio_title: () => document.getElementById('addAudioTitle')?.value.trim(),
    poster_url: () => document.getElementById('addPosterFile')?.files[0],
    audio_url: () => document.getElementById('addAudioFile')?.files[0]
  };

  for (const [key, field] of Object.entries(fieldsByKey)) {
    if (!field.is_required || key === 'honorees' || key === 'town' || key === 'event_date') continue;
    const getter = textFieldGetters[key];
    const value = getter ? getter() : null;
    if (!value) {
      alert(`${field.label} مطلوب`);
      return;
    }
  }

  const btn = document.getElementById('submitEventBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';

  const formData = new FormData();
  formData.append('occasion_type_id', type.id);
  appendHonoreesToFormData(formData, honorees);
  formData.append('town', town);
  formData.append('event_date', eventDate);

  const latInput = document.getElementById('addLat');
  const lngInput = document.getElementById('addLng');
  if (latInput && latInput.value) formData.append('latitude', latInput.value);
  if (lngInput && lngInput.value) formData.append('longitude', lngInput.value);

  if (fieldsByKey.title) formData.append('title', document.getElementById('addTitle').value);
  if (fieldsByKey.family_clan) formData.append('family_clan', document.getElementById('addFamily').value);
  if (fieldsByKey.location_name) formData.append('location_name', document.getElementById('addLocationName').value);
  if (fieldsByKey.secondary_location_name) formData.append('secondary_location_name', document.getElementById('addSecondaryLocationName').value);
  if (fieldsByKey.event_end_date) formData.append('event_end_date', document.getElementById('addEventEndDate').value);
  if (fieldsByKey.youth_party_date) formData.append('youth_party_date', document.getElementById('addYouthDate').value);
  if (fieldsByKey.dinner_time) formData.append('dinner_time', document.getElementById('addDinnerTime').value);
  if (fieldsByKey.host_phone) formData.append('host_phone', document.getElementById('addHostPhone').value);
  if (fieldsByKey.audio_title) formData.append('audio_title', document.getElementById('addAudioTitle').value);

  if (fieldsByKey.poster_url) {
    const posterFile = document.getElementById('addPosterFile').files[0];
    if (posterFile) formData.append('poster', posterFile);
  }
  if (fieldsByKey.audio_url) {
    const audioFile = document.getElementById('addAudioFile').files[0];
    if (audioFile) formData.append('audio', audioFile);
  }

  try {
    const res = await apiFetch('/api/events', { method: 'POST', body: formData, auth: true });
    const data = await res.json();

    if (data.success) {
      if (data.status === 'pending') {
        alert('✅ تم إرسال طلب إعلان المناسبة بنجاح!\n\nطلبك الآن قيد مراجعة واعتماد الإدارة، وسيتم نشره على التطبيق بعد التحقق خلال دقائق.');
      } else {
        showToast('🎉 تم نشر المناسبة بنجاح!');
      }
      // تنبيه ليّن من الخادم — البلدة والإحداثيات كما اختارها المستخدم بالضبط،
      // هذا إعلام لا رفض، والنشر أعلاه مضى فعلاً (#20 step 6, decision ٦).
      if (data.location_warning) {
        alert(`⚠️ ${data.location_warning.message}`);
      }
      document.getElementById('addEventForm').reset();
      document.getElementById('collisionAlert').style.display = 'none';
      clearPickerMarker();
      const honoreesList = document.getElementById('addHonoreesList');
      if (honoreesList) {
        honoreesList.innerHTML = '';
        addHonoreeRow('addHonoreesList');
      }
      fetchMyEvents();
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

// 14. "مناسباتي" — ownership & editing (#20 step 9)
const MY_EVENT_STATUS_LABELS = { approved: 'منشورة', pending: 'قيد المراجعة', rejected: 'مرفوضة' };

async function fetchMyEvents() {
  const container = document.getElementById('myEventsList');
  if (!container || !currentUser || !authToken) return;

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>جاري جلب مناسباتك...</p></div>';

  try {
    const res = await apiFetch('/api/my-events', { auth: true });
    const data = await res.json();
    if (!data.success) {
      container.innerHTML = '<div class="empty-state"><p>تعذر جلب مناسباتك</p></div>';
      return;
    }
    myEventsCache = data.events;
    renderMyEvents(myEventsCache);
  } catch (e) {
    console.error('My events error:', e);
    container.innerHTML = '<div class="empty-state"><p>تعذر جلب مناسباتك</p></div>';
  }
}

function renderMyEvents(events) {
  const container = document.getElementById('myEventsList');
  if (!events || !events.length) {
    container.innerHTML = '<div class="empty-state"><p>لم تنشر أي مناسبة بعد</p></div>';
    return;
  }

  container.innerHTML = events.map(evt => `
    <div class="event-card">
      <div class="card-header-bar">
        <div class="card-clan-town">
          <span class="town-badge">${escapeHtml(evt.town)}</span>
          <span class="clan-text">${escapeHtml(evt.occasion_type?.name || '')}</span>
        </div>
        <span class="status-tag ${evt.status}">${MY_EVENT_STATUS_LABELS[evt.status] || evt.status}</span>
      </div>
      <div class="card-body">
        <h2 class="event-main-title">${escapeHtml(evt.title || evt.groom_name)}</h2>
        <div class="detail-item">
          <i class="fa-solid fa-calendar-day"></i>
          <span>${evt.event_date}</span>
        </div>
        <button class="record-nokoot-btn" style="width:100%; margin-top:10px;" onclick="openEditEventModal(${evt.id})">
          <i class="fa-solid fa-pen"></i> تعديل
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * يطبّق إعداد النوع على نموذج التعديل الثابت: يخفي ما لا يخصّ هذا النوع
 * ويعيد تسمية ما يبقى بتسميته فيه. بدون هذا يعرض تعديلُ عزاءٍ حقلَ «سهرة
 * الشباب والدحة» — وهو نفس الأذى الذي بُني نموذج النشر كلّه لتجنّبه.
 */
function applyOccasionTypeToEditForm(evt) {
  const EDIT_FIELD_INPUTS = {
    honorees: 'editHonoreesList',
    title: 'editTitle',
    town: 'editTown',
    family_clan: 'editFamily',
    event_date: 'editEventDate',
    event_end_date: 'editEventEndDate',
    youth_party_date: 'editYouthDate',
    location_name: 'editLocationName',
    secondary_location_name: 'editSecondaryLocationName',
    dinner_time: 'editDinnerTime',
    host_phone: 'editHostPhone'
  };

  const typeId = evt.occasion_type && evt.occasion_type.id;
  const type = occasionTypesCache.find(t => t.id === typeId);

  const fieldsByKey = {};
  if (type) for (const f of type.fields) fieldsByKey[f.field_key] = f;

  for (const [fieldKey, elementId] of Object.entries(EDIT_FIELD_INPUTS)) {
    const el = document.getElementById(elementId);
    if (!el) continue;
    const group = el.closest('.form-group');
    if (!group) continue;

    // نوع غير معروف للواجهة (نسخة أقدم من الأنواع) — أظهر كل شيء بدل إخفاء
    // حقل يحمل بيانات حقيقية.
    const field = type ? fieldsByKey[fieldKey] : { label: null, is_required: false };
    if (!field) {
      group.style.display = 'none';
      continue;
    }

    group.style.display = '';
    const label = group.querySelector('label');
    if (label && field.label) label.textContent = field.label + (field.is_required ? ' *' : '');
  }
}

function openEditEventModal(eventId) {
  const evt = myEventsCache.find(e => e.id === eventId);
  if (!evt) return;

  document.getElementById('editEventId').value = evt.id;
  document.getElementById('editTitle').value = evt.title || '';
  document.getElementById('editFamily').value = evt.family_clan || '';
  populateTownSelect('editTown', evt.town);
  document.getElementById('editEventDate').value = evt.event_date || '';
  document.getElementById('editEventEndDate').value = evt.event_end_date || '';
  document.getElementById('editYouthDate').value = evt.youth_party_date || '';
  document.getElementById('editLocationName').value = evt.location_name || '';
  document.getElementById('editSecondaryLocationName').value = evt.secondary_location_name || '';
  document.getElementById('editDinnerTime').value = evt.dinner_time || '';
  document.getElementById('editHostPhone').value = evt.host_phone || '';

  const honoreesList = document.getElementById('editHonoreesList');
  honoreesList.innerHTML = '';
  const honorees = (evt.honorees && evt.honorees.length) ? evt.honorees : [{ name: evt.groom_name || '', role: '' }];
  honorees.forEach(h => addHonoreeRow('editHonoreesList', h.name, h.role || ''));

  applyOccasionTypeToEditForm(evt);
  document.getElementById('editEventModal').style.display = 'flex';
}

function closeEditEventModal() {
  document.getElementById('editEventModal').style.display = 'none';
}

async function handleEventEditSubmit(e) {
  e.preventDefault();
  const eventId = document.getElementById('editEventId').value;

  const honorees = collectHonorees('editHonoreesList');
  if (!honorees.length) {
    alert('يجب إدخال اسم واحد على الأقل لأصحاب المناسبة');
    return;
  }

  const payload = {
    title: document.getElementById('editTitle').value,
    family_clan: document.getElementById('editFamily').value,
    town: document.getElementById('editTown').value,
    event_date: document.getElementById('editEventDate').value,
    event_end_date: document.getElementById('editEventEndDate').value,
    youth_party_date: document.getElementById('editYouthDate').value,
    location_name: document.getElementById('editLocationName').value,
    secondary_location_name: document.getElementById('editSecondaryLocationName').value,
    dinner_time: document.getElementById('editDinnerTime').value,
    host_phone: document.getElementById('editHostPhone').value,
    honorees
  };

  try {
    const res = await apiFetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      // الرسالة تفرّق أصلاً بين التجميلي والحرِج — نعرضها كما هي، ونضيف تنبيه
      // الموقع إن جاء (#20 step 9).
      alert(data.message + (data.location_warning ? `\n\n⚠️ ${data.location_warning.message}` : ''));
      closeEditEventModal();
      fetchMyEvents();
    } else {
      alert(data.message || 'حدث خطأ أثناء حفظ التعديل');
    }
  } catch (err) {
    alert('تعذر حفظ التعديل — تحقق من الاتصال بالخادم');
  }
}

// 15. Live Chat & Congratulations Modal
async function openChatModal(eventId) {
  currentChatEventId = eventId;
  const modal = document.getElementById('chatModal');
  modal.style.display = 'flex';

  const hostBar = document.getElementById('chatHostBar');
  const stream = document.getElementById('chatMessagesStream');
  stream.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>جاري جلب التبريكات...</p></div>';

  const senderInput = document.getElementById('chatSenderName');
  if (currentUser) {
    senderInput.value = currentUser.full_name;
  } else {
    senderInput.value = '';
    senderInput.placeholder = 'سجّل الدخول لإرسال تبريكة';
  }

  try {
    const res = await apiFetch(`/api/events/${eventId}`);
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
  // التبريك فعل كتابة كالنشر — خلف authenticate على الخادم أيضاً، والاسم يُبنى
  // من الحساب لا من الحقل (#20 step 9).
  if (!requireAuth({ type: 'congratulate', eventId: currentChatEventId })) return;

  const message = document.getElementById('chatInputMessage').value.trim();
  if (!message) return;

  try {
    const res = await apiFetch(`/api/events/${currentChatEventId}/congratulate`, {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('chatInputMessage').value = '';
      openChatModal(currentChatEventId);
    } else {
      alert(data.message || 'تعذر إرسال التهنئة');
    }
  } catch (e) {
    alert('تعذر إرسال التهنئة');
  }
}

// 16. Nokoot Ledger & Financial Chart
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
    const res = await apiFetch('/api/nokoot', { auth: true });
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
  apiFetch('/api/nokoot', { auth: true })
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
    const res = await apiFetch('/api/nokoot', {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
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
    const res = await apiFetch(`/api/nokoot/${id}`, { method: 'DELETE', auth: true });
    if (res.ok) fetchNokootRecords();
  } catch (e) {
    console.error('Delete error:', e);
  }
}

// 17. Auth Modal & Controller
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
    const res = await apiFetch('/api/auth/login', {
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
      resumePendingIntent();
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
    const res = await apiFetch('/api/auth/register', {
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
      resumePendingIntent();
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

// 18. Sticker Canvas Studio
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
