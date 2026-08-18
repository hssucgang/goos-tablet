// Offline cache for the production tablet. Only ever active when the app is
// served over http(s) - a browser will not run a service worker for a page
// opened straight off local storage, which is fine because a local file is
// already offline.
var CACHE = 'goos-tablet-3.10.0';
var SHELL = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () {});
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k === CACHE ? null : caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

// THE PAGE ITSELF IS NETWORK FIRST; everything else is cache first.
//
// Cache-first on the page was a trap: after a new version was uploaded, the
// tablet served the OLD app from cache for that whole session while the new
// worker installed quietly in the background. The new app only appeared on
// the NEXT open - so "open it once with signal" was not enough, and a fix
// that had definitely shipped looked like it had not. Now, with signal, the
// page is fetched fresh; with no signal it falls straight back to the cached
// copy, so the commissary still works offline.
/* Tapping the timer notification brings the app forward instead of opening a
   second copy - a duplicate tab would have its own idea of the batch, which
   is the one thing worse than a missed alarm. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true})
    .then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var isPage = e.request.mode === 'navigate' ||
               /index\.html($|\?)/.test(e.request.url) ||
               /\/$/.test(new URL(e.request.url).pathname);
  if (isPage) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || caches.match('index.html');
        });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
