// Accorde la couleur de la barre système (meta theme-color) au mode clair/sombre.
// Externalisé depuis index.html (v3.90.1) : la CSP `script-src 'self'` refusait
// le script inline (« Refused to execute inline script ») à chaque chargement.
(function () {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const tc = document.querySelector('meta[name="theme-color"]');
  function syncThemeColor(e) { if (tc) tc.content = e.matches ? '#0d1117' : '#22334C'; }
  syncThemeColor(mq);
  mq.addEventListener('change', syncThemeColor);
})();
