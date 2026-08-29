// Service worker minimo — serve solo a rendere la pagina "installabile"
// su Android/Chrome e a farla aprire subito anche con rete instabile.
// Non mette MAI in cache le chiamate verso Apps Script: i dati del
// portafoglio devono sempre essere quelli freschi (o la copia in
// localStorage gestita da index.html), mai una versione vecchia dalla
// cache del service worker.

const CACHE_NAME = 'portafoglio-tr-v1';
const FILE_DA_CACHARE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILE_DA_CACHARE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomi) =>
      Promise.all(nomi.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Mai intercettare le chiamate ad Apps Script (script.google.com):
  // devono sempre andare in rete, dati sempre freschi.
  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    return;
  }

  // Per tutto il resto (la pagina stessa, manifest, icone): cache-first,
  // con fallback alla rete se manca in cache.
  event.respondWith(
    caches.match(event.request).then((risposta) => risposta || fetch(event.request))
  );
});
