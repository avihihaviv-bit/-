/* Piano Studio service worker — offline app shell (stale-while-revalidate). */
const CACHE_NAME = 'piano-studio-v1';
const CORE = [
  './', './index.html', './manifest.json', './css/app.css', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './js/core/util.js', './js/core/prefs.js', './js/core/schema.js', './js/core/db.js', './js/core/store.js', './js/core/gamification.js',
  './js/core/domain.js', './js/core/notify.js', './js/core/stats.js', './js/core/search.js', './js/core/backup.js',
  './js/ui/icons.js', './js/ui/components.js', './js/ui/charts.js', './js/ui/fx.js',
  './js/views/dashboard.js', './js/views/lessons.js', './js/views/notes.js', './js/views/songs.js', './js/views/courses.js',
  './js/views/tasks.js', './js/views/calendar.js', './js/views/goals.js', './js/views/journey.js', './js/views/achievements.js',
  './js/views/stats.js', './js/views/resources.js', './js/views/journal.js', './js/views/settings.js', './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
