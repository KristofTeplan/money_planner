// Money Plan service worker: keeps the app working offline.
// Bump VERSION whenever app files change so phones pick up the update.
var VERSION = "mp-1.0.0";
var APP_CACHE = "app-" + VERSION;
var FONT_CACHE = "fonts-v1";
var APP_FILES = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(APP_CACHE).then(function (c) { return c.addAll(APP_FILES); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== APP_CACHE && k !== FONT_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (event) {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(FONT_CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App pages: always answer with the cached app shell so it opens offline.
  if (req.mode === "navigate") {
    event.respondWith(caches.match("./index.html").then(function (hit) { return hit || fetch(req); }));
    return;
  }

  event.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
