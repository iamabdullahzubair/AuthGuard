// Service Worker for AuthGuard Authenticator PWA
const CACHE_NAME = 'authguard-v1';
const ASSETS_TO_CACHE = [
  '/pwa/',
  '/pwa/index.html',
  '/pwa/src/styles.css',
  '/pwa/src/app.js',
  '/pwa/src/crypto.js',
  '/pwa/src/db.js',
  '/pwa/src/push.js',
  '/pwa/src/totp.js',
  '/pwa/src/scanner.js',
  '/pwa/public/manifest.json',
  '/pwa/public/icons/icon-192.png',
  '/pwa/public/icons/icon-512.png',
  '/pwa/public/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Some assets could not be precached during install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Cache-falling-back-to-network for shell, bypass for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always network for /api/ calls
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/pwa/index.html');
          }
        });
      })
  );
});

// Push notification received
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  let pushData = {
    title: 'Login Approval Request',
    body: 'A login request was initiated. Match number on screen.',
    data: {},
  };

  if (event.data) {
    try {
      pushData = event.data.json();
    } catch {
      pushData.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: pushData.body || 'A login request requires your approval.',
    icon: '/pwa/public/icons/icon-192.png',
    badge: '/pwa/public/icons/icon-192.png',
    tag: pushData.data?.requestId ? `approval-${pushData.data.requestId}` : 'auth-push',
    renotify: true,
    requireInteraction: true,
    data: pushData.data || {},
    actions: [
      { action: 'open', title: 'Open Authenticator' }
    ],
  };

  // Broadcast to open clients if app is currently visible in foreground
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        client.postMessage({
          type: 'PUSH_LOGIN_REQUEST',
          payload: pushData.data,
        });
      }
      return self.registration.showNotification(pushData.title || 'Login Approval Request', notificationOptions);
    })
  );
});

// Notification click handler: opens PWA to approval screen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const requestId = notifData.requestId || '';
  const targetUrl = requestId ? `/pwa/?request_id=${requestId}` : '/pwa/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (requestId) {
            client.postMessage({
              type: 'PUSH_LOGIN_REQUEST',
              payload: notifData,
            });
          }
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

