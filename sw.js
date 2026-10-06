/* sw.js — l'app funziona anche offline con gli ultimi dati scaricati.
 * A ogni rilascio aumenta CACHE_NAME insieme a VERSIONE in js/app.js e in
 * versione.json: all'apertura l'app vede la versione nuova e si aggiorna. */
const CACHE_NAME = "vici-v3.2.1";
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

// Rete prima (file e dati sempre freschi), copia salvata solo se la rete
// manca. "no-cache" fa ricontrollare al server anche i file che il browser
// terrebbe in memoria per qualche minuto (GitHub Pages li tiene 10 minuti).
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const stessoSito = new URL(e.request.url).origin === location.origin;
  const richiesta = stessoSito ? new Request(e.request, { cache: "no-cache" }) : e.request;
  e.respondWith(
    fetch(richiesta).then((r) => {
      if (r.ok && stessoSito) {
        const copia = r.clone();
        const chiave = e.request.url.split("?")[0];
        caches.open(CACHE_NAME).then((c) => c.put(chiave, copia));
      }
      return r;
    }).catch(() => caches.match(e.request.url.split("?")[0]))
  );
});
