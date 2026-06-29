/* Poker Ride service worker — offline-first (cache first) */
var CACHE = "poker-ride-v7";

/* Core assets that must be cached for the app to run offline.
   Includes finish-line.html and the scanning library so the
   finish-line laptop works at campsites with no WiFi. */
var CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./finish-line.html",
  "./lib/jsQR.min.js"
];

/* Optional assets — cached if present, but a 404 must not break install. */
var OPTIONAL = [
  "./lib/qrcode.min.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(CORE).then(function () {
        // add optional files one by one, ignoring failures
        return Promise.all(OPTIONAL.map(function (url) {
          return cache.add(url).catch(function () { return null; });
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // cache same-origin successful responses for next time
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // offline navigation fallback
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});
