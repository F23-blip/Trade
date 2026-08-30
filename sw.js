// Service worker — rende la pagina "installabile" su Android/Chrome e
// disponibile anche offline. Non mette MAI in cache le chiamate verso
// Apps Script: i dati del portafoglio devono sempre essere quelli freschi
// (o la copia in localStorage gestita da index.html), mai una versione
// vecchia dalla cache del service worker.
//
// IMPORTANTE: ogni volta che cambi index.html in modo sostanziale, cambia
// anche CACHE_NAME qui sotto (es. v2 -> v3). È quello che fa scattare
// l'aggiornamento del service worker nei browser/app già installate —
// altrimenti l'app resta "congelata" sulla versione con cui è stata
// installata, anche disinstallando e reinstallando l'icona (l'icona è
// solo una scorciatoia, la cache resta legata al sito, non a quella).

const CACHE_NAME = 'portafoglio-tr-v3';
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

  // Mai intercettare le chiamate ad Apps Script: sempre in rete, dati freschi.
  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    return;
  }

  const richiestaHTML = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (richiestaHTML) {
    // Network-first: prova sempre a prendere l'ultima versione online;
    // se non c'è rete, usa la copia salvata (per l'uso offline).
    event.respondWith(
      fetch(event.request)
        .then((risposta) => {
          const copia = risposta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          return risposta;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Asset statici (manifest, icone): cache-first, con fallback alla rete.
  event.respondWith(
    caches.match(event.request).then((risposta) => risposta || fetch(event.request))
  );
});
