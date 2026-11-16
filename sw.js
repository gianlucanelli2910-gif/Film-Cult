const CACHE_VERSION = "film-cult-v5";
const CACHE_NAME = `${CACHE_VERSION}-runtime`;
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (path) => {
      try {
        const response = await fetch(new Request(new URL(path, self.registration.scope), { cache: "reload" }));
        if (response.ok) await cache.put(new URL(path, self.registration.scope), response);
      } catch (_) {
        // Un singolo asset non deve impedire l'installazione del service worker.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("film-cult-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;

  const isPage = request.mode === "navigate" || request.destination === "document" || url.pathname.endsWith(".html");
  if (isPage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: "no-cache" });
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        const cached = await cache.match(request) || await cache.match(new URL("./index.html", self.registration.scope));
        return cached || new Response("Connessione assente. Riprova.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  // Risorse statiche: usa subito la cache e aggiorna in background.
  const refreshPromise = (async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  })();
  event.waitUntil(refreshPromise.catch(() => {}));
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try { return await refreshPromise; }
    catch (_) { return new Response("", { status: 504 }); }
  })());
});
