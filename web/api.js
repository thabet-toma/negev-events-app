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

/**
 * رفع ملف صورة مباشرةً إلى Cloudinary بتوقيع أصدره خادمنا (ADR-0008).
 *
 * النداء الوحيد هنا الذي لا يمرّ عبر apiFetch، وعمداً: الوجهة خدمة طرف ثالث
 * لا خادمنا (upload.upload_url يأتي من الخادم لا من config.js)، ولا يجوز أن
 * يصلها رمز دخولنا ولا ترويسة X-App-Version — والتوقيع نفسه هو التفويض.
 * تُرسَل الحقول الموقَّعة كما أعادها الخادم حرفياً، لا أقلّ ولا أكثر، وإلا
 * رفضت Cloudinary التوقيع. يعيد جسم ردّها (public_id، version، signature، …)
 * أو يرمي Error برسالة عربية.
 */
async function uploadToCloudinary(upload, file) {
  if (!upload || !upload.upload_url) throw new Error('تعذّر تجهيز رفع الصورة — حاول مرة أخرى');
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', upload.api_key);
  form.append('timestamp', upload.timestamp);
  form.append('public_id', upload.public_id);
  form.append('allowed_formats', upload.allowed_formats);
  form.append('signature', upload.signature);

  let res;
  try {
    res = await fetch(upload.upload_url, { method: 'POST', body: form });
  } catch (e) {
    throw new Error('تعذّر رفع الصورة — تحقّق من الاتصال وحاول مرة أخرى');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || !data || data.error || !data.public_id) {
    // تفصيل Cloudinary إنجليزي — للسجلّ فقط؛ المستخدم يرى رسالة عربية.
    if (data && data.error) console.warn('Cloudinary upload error:', data.error.message);
    throw new Error('رفضت خدمة الصور هذا الملف — تأكّد أنه صورة (JPG أو PNG أو WEBP) وحاول مرة أخرى');
  }
  return data;
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
