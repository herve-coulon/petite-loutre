/* Service worker : jeu 100% hors-ligne après la première visite.
   ⚠️ Incrémenter VERSION à chaque mise en production. */
const VERSION = 'v3.49.0';
const CACHE = 'loutre-' + VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/fonts.css',
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
  './src/level.js',
  './src/streak.js',
  './src/share.js',
  './src/events.js',
  './src/mood.js',
  './src/story.js',
  './src/seasons.js',
  './src/items.js',
  './src/personality.js',
  './src/world.js',
  './src/gang.js',
  './src/tilemap.js',
  './assets/tileset.png',
  './src/seasonpass.js',
  './src/push.js',
  './src/photocard.js',
  './src/minigame.js',
  './src/toboggan.js',
  './src/render.js',
  './src/audio.js',
  './src/music.js',
  './src/ambient.js',
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

// La page peut demander d'activer tout de suite une version en attente.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---------------- Rappels push (v3.0) ---------------- */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(data.title || 'Ma Petite Loutre 🦦', {
    body: data.body || '',
    tag: data.tag || 'loutre',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png'
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // ⚠️ Toujours lire dans NOTRE cache versionné (caches.open(CACHE).match),
  // jamais caches.match global : pendant une mise à jour, deux caches
  // coexistent et le match global fabriquait des pages mélangées
  // (index.html neuf + main.js ancien -> boutons visibles mais morts).

  // Navigation : cache immédiat (lancement instantané), mise à jour en arrière-plan.
  // La nouvelle version s'affiche au lancement suivant — le rattrapage hors-ligne
  // du jeu rend ce léger différé invisible pour le joueur.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then((c) => c.match('./index.html')).then((hit) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put('./index.html', copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      })
    );
    return;
  }

  // Assets : cache (de cette version) d'abord, réseau en secours (puis mise en cache).
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req)).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && new URL(req.url).origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
