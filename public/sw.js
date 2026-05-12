/* Sprout service worker.
 * Strategy:
 *   - Navigation requests: network-first with a cache fallback, and
 *     /offline as a last resort when both fail.
 *   - Static assets (.js / .css / .svg / .png / .ico / .woff2): stale-
 *     while-revalidate — serve from cache instantly, update in the
 *     background.
 *   - API routes and cross-origin requests are never cached. They
 *     always go to the network.
 */

const CACHE_NAME = "sprout-shell-v1";
const OFFLINE_URL = "/offline";

const APP_SHELL = [
  "/",
  "/home",
  "/portfolio",
  "/settings",
  "/activity",
  "/offline",
  "/theme-init.js",
  "/icon.svg",
  "/icon-maskable.svg",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Don't fail the whole install if one pre-cache entry 404s.
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch(() => {
              /* skip — dev routes may not exist yet */
            })
          )
        )
      )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // Navigation requests — network-first, cache fallback, offline last.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        })
    );
    return;
  }

  // Static assets — stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Everything else passes through to the network.
});
