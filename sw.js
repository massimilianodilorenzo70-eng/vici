/* sw.js — l'app funziona anche offline con gli ultimi dati scaricati.
 * Quando cambi i file dell'app incrementa CACHE_NAME. */
const CACHE_NAME = "vici-v1.1";
const ASSETS = [
  "./", "./index.html", "./manifest.json", "./css/style.css", "./js/app.js",
  "./icons/logo.svg", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) =>
    c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Rete prima (dati sempre freschi), copia salvata solo se la rete manca.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && new URL(e.request.url).origin === location.origin) {
        const copia = r.clone();
        const chiave = e.request.url.split("?")[0];
        caches.open(CACHE_NAME).then((c) => c.put(chiave, copia));
      }
      return r;
    }).catch(() => caches.match(e.request.url.split("?")[0]))
  );
});
