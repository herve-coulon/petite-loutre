/* Service worker : jeu 100% hors-ligne après la première visite.
   ⚠️ Incrémenter VERSION à chaque mise en production. */
const VERSION = 'v2.4.0';
const CACHE = 'loutre-' + VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/style.css',
  './src/main.js',
  './src/constants.js',
  './src/state.js',
  './src/sim.js',
  './src/sprites.js',
  './src/accessories.js',
  './src/achievements.js',
  './src/skins.js',
  './src/battle.js',
  './src/quests.js',
  './src/mood.js',
  './src/photocard.js',
  './src/minigame.js',
  './src/render.js',
  './src/audio.js',
  './src/ui.js',
  './src/pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navigation : réseau d'abord (pour récupérer les mises à jour), cache en secours.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets : cache d'abord, réseau en secours (puis mise en cache).
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && new URL(req.url).origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
