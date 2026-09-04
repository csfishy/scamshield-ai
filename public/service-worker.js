/* global self, caches */

const WORKER_VERSION = "next-v1";
const STATIC_CACHE = `scamshield-static-${WORKER_VERSION}`;
const DOCUMENT_CACHE = `scamshield-document-${WORKER_VERSION}`;
const KNOWN_APP_CACHE_PREFIXES = [
  "offline-cache-",
  "scamshield-static-",
  "scamshield-document-",
];
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              KNOWN_APP_CACHE_PREFIXES.some((prefix) =>
                key.startsWith(prefix),
              ) &&
              key !== STATIC_CACHE &&
              key !== DOCUMENT_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: "window" });
      windows.forEach((client) =>
        client.postMessage({
          type: "SCAMSHIELD_UPDATE_READY",
          version: WORKER_VERSION,
        }),
      );
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    PRECACHE_URLS.includes(url.pathname)
  );
}

async function cacheStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function navigate(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response.ok && url.pathname === "/" && !url.search) {
      const cache = await caches.open(DOCUMENT_CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    const documentCache = await caches.open(DOCUMENT_CACHE);
    return (
      (await documentCache.match("/")) ||
      (await caches.match("/offline.html")) ||
      Response.error()
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/analyze") return;
  if (isStaticAsset(url)) {
    event.respondWith(cacheStatic(request));
    return;
  }
  if (request.mode === "navigate") event.respondWith(navigate(request));
});
