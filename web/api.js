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
function apiFetch(path, options = {}) {
  const { auth = false, tokenKey = 'negev_token', headers = {}, ...rest } = options;
  // يُعلن هذا العميل نفسه حديثاً فيرى كل أنواع المناسبات — القيمة نفسها غير
  // مقروءة على الخادم، وجودها فقط هو ما يهم (#20 خطوة 10).
  const finalHeaders = { 'X-App-Version': 'web', ...headers };

  if (auth) {
    const token = localStorage.getItem(tokenKey);
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  return fetch(apiUrl(path), { ...rest, headers: finalHeaders });
}

/** نداء يحمل رمز الإدارة. */
function adminFetch(path, options = {}) {
  return apiFetch(path, { ...options, auth: true, tokenKey: 'negev_admin_token' });
}
