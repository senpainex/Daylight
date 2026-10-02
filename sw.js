const CACHE_NAME = "daylight-pocket-v10";
const ASSETS = ["./mobile.html", "./mobile.css", "./mobile-auth.css", "./mobile-ai.css", "./conferbot.css", "./mobile.js", "./mobile-ai.js", "./mobile-auth.js", "./manifest.webmanifest", "./daylight-icon.svg", "./index.html", "./site.css", "./portable.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.endsWith("/firebase-config.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => event.request.mode === "navigate" ? caches.match("./mobile.html") : Response.error())));
});
