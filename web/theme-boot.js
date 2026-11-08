/*
 * الوضع الداكن — تهيئة واحدة مشتركة لصفحات الويب الخمس (تذكرة #179).
 *
 * تُحمَّل في `<head>` **قبل أي نمط** في `index.html` و`admin.html` و`about.html`
 * و`privacy.html` و`delete-account.html`، فلا يُرسم الفاتح لحظةً واحدة لمن اختار
 * الداكن (FOUC). وهي وحدها من يقرأ `localStorage` ويطبّق `data-theme` على
 * `<html>`؛ و`initTheme`/`toggleTheme` في `app.js` يبنيان عليها ولا يكرّران
 * القراءة، فيبقى القرار في مكان واحد.
 *
 * القاعدة: قيمة محفوظة `dark` أو `light` تُطبَّق وحدها وتغلب الجهاز؛ وأي قيمة
 * أخرى — أو غيابها — تُتجاهَل وتُزال السمة، فتحكم `@media (prefers-color-scheme)`
 * في `styles.css` و`admin.css` ولوحات الصفحات الثابتة وحدها.
 *
 * سكربت عادي بلا وحدة ولا خطوة بناء، يعرّف نفسه على `window.NegevTheme` لتقرأه
 * `app.js`. لا يفترض زرّ تبديل ولا `meta theme-color` — كلاهما اختياري، فتعمل
 * الصفحة نفسها في اللوحة وفي صفحات السياسات.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'negev_theme';

  /**
   * لون شريط المتصفّح (‎`<meta name="theme-color">`‎) في الوضعين — نسخة من
   * `--ground` في `web/styles.css`. لا تُقرأ من الأنماط هنا لأن هذا الملف يعمل
   * قبلها؛ واختبار `web-dom` يقارن القيمتين بـ`--ground` فيسقط إن تباعدتا، فلا
   * يعيش لون ثانٍ وحده.
   */
  const THEME_COLORS = { light: '#eef2f6', dark: '#0a1622' };

  /** القيمة المحفوظة إن كانت `dark`/`light` وحدها، وإلا `null`. */
  function saved() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (error) {
      return null; // تخزين معطَّل أو وضع خاص: اتبع الجهاز بدل أن تنكسر الصفحة
    }
  }

  /** ما هو مطبَّق فعلاً على `<html>` — `dark`/`light` أو `null`. */
  function applied() {
    const value = document.documentElement.getAttribute('data-theme');
    return value === 'dark' || value === 'light' ? value : null;
  }

  function systemIsDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /** المظهر الظاهر: المطبَّق إن وُجد، وإلا تفضيل الجهاز. */
  function isDark() {
    const choice = applied();
    return choice ? choice === 'dark' : systemIsDark();
  }

  function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute('content', isDark() ? THEME_COLORS.dark : THEME_COLORS.light);
  }

  /** يطبّق المحفوظ (أو يزيل السمة) — نداءه متكرّر بلا أثر. */
  function apply() {
    const choice = saved();
    if (choice) document.documentElement.setAttribute('data-theme', choice);
    else document.documentElement.removeAttribute('data-theme');
    syncThemeColor();
    return choice;
  }

  /** يثبّت اختياراً صريحاً ويحفظه — يرفض أي قيمة غير `dark`/`light`. */
  function set(theme) {
    if (theme !== 'dark' && theme !== 'light') return null;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // بلا تخزين يبقى الاختيار لهذه الصفحة وحدها — لا نُفشل التبديل من أجله.
    }
    syncThemeColor();
    return theme;
  }

  function toggle() {
    return set(isDark() ? 'light' : 'dark');
  }

  window.NegevTheme = { isDark, apply, toggle };

  // التطبيق الآن — قبل أول رسم وقبل أن تُحلَّل الأنماط.
  apply();

  // تغيّر تفضيل الجهاز والصفحة مفتوحة: الأنماط تتبعه وحدها (استعلام الوسائط)،
  // وهذا يتبع ما لا تعرفه الأنماط — لون شريط المتصفّح وأيقونة زرّ التبديل.
  if (window.matchMedia) {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      syncThemeColor();
      document.dispatchEvent(new CustomEvent('negev:themechange'));
    };
    if (query.addEventListener) query.addEventListener('change', onSystemChange);
    else if (query.addListener) query.addListener(onSystemChange);
  }
})();
