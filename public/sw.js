// Minimal service worker for PWA installability
// Does NOT cache anything — only exists to satisfy Chrome's install criteria

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests — no caching
  return;
});
