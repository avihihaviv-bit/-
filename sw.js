const CACHE_NAME = 'maslul-v3';
const CORE_ASSETS = ['./', './index.html', './core.js', './features.js', './features.css', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(CORE_ASSETS); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(request, fallbackUrl) {
  return fetch(request).then(function (response) {
    if (response && response.ok) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
    }
    return response;
  }).catch(function () {
    return caches.match(request).then(function (cached) { return cached || (fallbackUrl ? caches.match(fallbackUrl) : undefined); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // never cache the AI coach endpoint
  if (url.origin === self.location.origin && url.pathname.indexOf('/api/') === 0) return;

  if (req.mode === 'navigate' || req.destination === 'document') {
    // app shell: network-first so a deploy reaches the phone on the next open, cached copy when offline
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }
  if (url.origin === self.location.origin) {
    // our own JS/CSS/icons: network-first too, so code updates never get stuck behind an old cache
    event.respondWith(networkFirst(req));
    return;
  }
  // third-party (fonts): cache-first, refreshed in the background
  event.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (response) {
        if (response && (response.ok || response.type === 'opaque')) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});

// tapping a notification focuses the app
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
