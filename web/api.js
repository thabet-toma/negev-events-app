/*
 * عميل API موحّد لكل نداءات الواجهة.
 *
 * كل نداء يمر من هنا حتى يبقى عنوان الخادم في مكان واحد (config.js)، ويُرفق
 * رمز الدخول بشكل صريح فقط حيث كان مُرفقاً من قبل — إرفاقه في كل مكان يغيّر
 * سلوك المراجعة في POST /api/events.
 */

const API_BASE = (window.NEGEV_CONFIG && window.NEGEV_CONFIG.apiBase) || '';

/** يبني عنواناً مطلقاً لمسار في الخادم. */
function apiUrl(path) {
  return API_BASE + path;
}

/**
 * نداء للخادم.
 * options.auth: أرفق رمز الدخول (افتراضياً لا).
 * options.tokenKey: مفتاح الرمز في localStorage — رمز الموقع أو رمز الإدارة.
 */
async function apiFetch(path, options = {}) {
  const { auth = false, tokenKey = 'negev_token', headers = {}, ...rest } = options;
  // يُعلن هذا العميل نفسه حديثاً فيرى كل أنواع المناسبات — القيمة نفسها غير
  // مقروءة على الخادم، وجودها فقط هو ما يهم (#20 خطوة 10).
  const finalHeaders = { 'X-App-Version': 'web', ...headers };

  if (auth) {
    const token = localStorage.getItem(tokenKey);
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(apiUrl(path), { ...rest, headers: finalHeaders });
  // 401 = جلسة الموقع انتهت أو رمزها غير صالح (403 صار «غير مسموح» وحده) —
  // معالجة مركزية واحدة لكل نداء يحمل رمز الموقع، كما يفعل adminFetch أدناه
  // لرمز اللوحة. نداء بلا auth لا يخصّ الجلسة فلا يلمسها.
  if (auth && tokenKey === 'negev_token' && res.status === 401) {
    if (typeof window !== 'undefined' && typeof window.handleSessionExpired === 'function') {
      window.handleSessionExpired();
    }
  }
  return res;
}

/** نداء يحمل رمز الإدارة. */
async function adminFetch(path, options = {}) {
  const res = await apiFetch(path, { ...options, auth: true, tokenKey: 'negev_admin_token' });
  if (res.status === 401) {
    if (typeof window !== 'undefined' && typeof window.handleAdminSessionExpired === 'function') {
      window.handleAdminSessionExpired();
    }
  }
  return res;
}
