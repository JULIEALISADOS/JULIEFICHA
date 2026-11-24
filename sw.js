const CACHE_NAME = 'julie-app-v18.7';
// 19-nov: la instalacion ya no falla si falta UN archivo (antes addAll() cancelaba todo) y no recarga la pagina en medio de una ficha.
const ASSETS = [
  'index.html',
  'style.css?v=9.2',
  'js/config.js', 'js/db.js', 'js/db-local.js', 'js/otp.js', 'js/garantia.js', 'js/garantias-ui.js', 'js/historia-ui.js', 'js/pixel-propio.js', 'js/ui.js', 'js/signature.js', 'js/pdf.js', 'js/sanitize.js', 'js/app.js?v=10.2',
  'manifest.json',
  'logo.png',
  'guia_cabello_tecnico_completa_julie_es_1774539016850.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@400;700&family=Outfit:wght@300;400;600;700&display=swap',
  'https://unpkg.com/lucide@1.50.0/dist/umd/lucide.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.allSettled(ASSETS.map(a => cache.add(a))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
    ])
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nada de la base de datos ni de los archivos privados pasa por la cache
  if (url.hostname.endsWith('supabase.co')) return;
  if (req.headers.has('range')) return; // videos: que los sirva la red
  if (req.mode === 'navigate' || req.destination === 'style' || req.destination === 'script') {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(caches.match(req).then(response => response || fetch(req)));
});
