// PWA : service worker, invite d'installation, persistance du stockage.
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  // Y avait-il déjà un SW aux commandes ? (sinon c'est le tout premier install :
  // on ne veut pas recharger dans ce cas-là).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;

  // Le SW fait skipWaiting()+clients.claim() : dès qu'une nouvelle version est
  // installée elle prend le contrôle, ce qui déclenche 'controllerchange'.
  // On recharge alors UNE fois pour servir les nouveaux fichiers automatiquement
  // (le jeu sauvegarde en continu : le reload est indolore).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // Une version déjà en attente d'un précédent chargement ? On l'active.
      if (reg.waiting && hadController) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      // Cherche une mise à jour au lancement, puis toutes les heures.
      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
  });
}

/** Demande au navigateur de ne pas purger la sauvegarde (best effort). */
export function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) {}
}

/** L'app tourne-t-elle en mode installé (écran d'accueil) plutôt qu'en onglet ? */
export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}
/** iPhone / iPad (y compris iPadOS 13+ qui se présente comme un Mac tactile). */
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
