// ─────────────────────────────────────────────────────────────────────────────
// BAPyC · Service Worker — soporte offline (la app funciona sin internet)
//
// Estrategia:
//   · App shell (HTML/CSS/JS/JSON/manifest): precache en install → cache-first.
//   · Google Fonts: stale-while-revalidate (usa lo cacheado, refresca en segundo plano).
// Al publicar una versión nueva, sube CACHE_VERSION para invalidar el cache viejo.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = "bapyc-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/engine.js",
  "./js/app.js",
  "./styles.css",
  "./data/banco_dinamico_bapyc.v2.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // No fallar la instalación si algún asset opcional aún no existe.
      Promise.allSettled(SHELL.map((url) => cache.add(url))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isFont =
    url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com";

  if (isFont) {
    // stale-while-revalidate
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => { cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // App shell: cache-first, con fallback a red (y refresco del cache).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    }),
  );
});
