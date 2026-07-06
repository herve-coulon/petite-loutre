// PWA : service worker, invite d'installation, persistance du stockage.
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/** Demande au navigateur de ne pas purger la sauvegarde (best effort). */
export function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) {}
}

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Gère le bouton "Installer" (Android/desktop) et l'astuce iOS.
 * @param {HTMLElement} btn bouton installer
 * @param {HTMLElement} hint ligne d'astuce iOS
 */
export function setupInstall(btn, hint) {
  if (isStandalone()) return; // déjà installée

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.classList.remove('hidden');
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) {}
    deferred = null;
    btn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => btn.classList.add('hidden'));

  if (isIOS()) hint.classList.remove('hidden');
}
