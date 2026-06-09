
const APP_VERSION = "3.2.2-geofence";
const CACHE_NAME = `attendance-v${APP_VERSION}`;
const RUNTIME_CACHE = `attendance-runtime-v${APP_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/main.css",
  "./firebase-config.js",
  "./src/app.js",
  "./src/core/firebase.js",
  "./src/core/utils.js",
  "./src/core/i18n.js",
  "./src/core/pwa.js",
  "./src/UI/shell.js",
  "./src/modules/dashboard.js",
  "./src/modules/employees.js",
  "./src/modules/attendance.js",
  "./src/modules/attendance-tools.js",
  "./src/modules/geofence-settings.js",
  "./src/modules/summary.js",
  "./src/modules/calendar.js",
  "./src/modules/leave.js",
  "./src/modules/payroll.js",
  "./src/modules/notifications.js",
  "./src/modules/profile.js",
  "./offline/index.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![CACHE_NAME, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then(clients => clients.forEach(client => client.postMessage({ type: "APP_UPDATED", version: APP_VERSION })))
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then(res => res || caches.match("./offline/index.html")))
    );
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => {
        if (req.destination === "document") return caches.match("./offline/index.html");
      }))
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

self.addEventListener("sync", event => {
  if (event.tag === "attendance-background-sync") {
    event.waitUntil(
      self.clients.matchAll({ type: "window" })
        .then(clients => clients.forEach(client => client.postMessage({ type: "BACKGROUND_SYNC_REQUEST" })))
    );
  }
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Attendance Online", body: event.data?.text() || "มีแจ้งเตือนใหม่" }; }
  const title = data.title || "Attendance Online";
  const options = {
    body: data.body || data.message || "มีแจ้งเตือนใหม่",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-72.png",
    vibrate: [100, 50, 100],
    data: { url: data.url || "./?route=notifications" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./?route=notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
