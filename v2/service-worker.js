// v2.7 Stable Rebase from v2.6
const CACHE='attendance-v2-7-stable-20260605';
const FILES=['./','./index.html','./styles.css','./app.js','./firebase-config.js','./manifest.webmanifest','./assets/icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).catch(()=>{}));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
