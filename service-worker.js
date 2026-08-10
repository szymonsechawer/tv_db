// tv_db - service worker: cache the app shell so it opens instantly offline.
// Network calls to TMDb (api.themoviedb.org) always go to the network - never cached.
const CACHE_NAME = "tv-db-shell-v2.5.0";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/config.js",
  "./js/utils.js",
  "./js/storage.js",
  "./js/tmdb.js",
  "./js/dialogs.js",
  "./js/tables.js",
  "./js/item-dialog.js",
  "./js/notes.js",
  "./js/search.js",
  "./js/stats.js",
  "./js/settings.js",
  "./js/tabs.js",
  "./js/main.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept TMDb API / image CDN calls - always live network.
  if (url.hostname.includes("themoviedb.org")) return;
  if (event.request.method !== "GET") return;

  // App shell: cache-first, fall back to network, and refresh cache in background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
