// Minimal service worker for PWA installability + Web Push
// Does NOT cache anything.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Pass-through, no caching
  return;
});

// ---- Web Push ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: 'MalhaGest', body: event.data && event.data.text() }; }
  const title = data.title || 'MalhaGest';
  const body = data.body || '';
  const url = data.url || '/';
  const options = {
    body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: data.tag || 'malhagest-notification',
    renotify: true,
    data: { url, source: data.source || null, ref_id: data.ref_id || null },
    vibrate: [120, 60, 120],
  };
  event.waitUntil((async () => {
    // Badge no ícone do PWA (Android/Windows/macOS). iOS Safari lê do payload nativo.
    try {
      if (typeof data.badge === 'number' && 'setAppBadge' in self.navigator) {
        if (data.badge > 0) {
          await self.navigator.setAppBadge(data.badge);
        } else if ('clearAppBadge' in self.navigator) {
          await self.navigator.clearAppBadge();
        }
      }
    } catch (_) { /* silencioso */ }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      } catch (_) {}
    }
    await self.clients.openWindow(targetUrl);
  })());
});
