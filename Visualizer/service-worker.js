const CACHE_NAME = "neurolab-pro-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./engine.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./Images/Signal.png",
  "./Images/neurolab_Overview.png",
  // Fonts
  "./assets/fonts/JetBrainsMono-300.ttf",
  "./assets/fonts/JetBrainsMono-400.ttf",
  "./assets/fonts/JetBrainsMono-500.ttf",
  "./assets/fonts/JetBrainsMono-700.ttf",
  "./assets/fonts/Syne-400.ttf",
  "./assets/fonts/Syne-600.ttf",
  "./assets/fonts/Syne-700.ttf",
  "./assets/fonts/Syne-800.ttf",
  // CDN
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});