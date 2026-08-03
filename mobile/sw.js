/* ==================================================================
   CtrLoja Mobile — service worker
   Guarda o aplicativo no aparelho para funcionar sem internet.
   Os dados da Loja não passam por aqui: ficam no armazenamento local.
   ================================================================== */

const VERSAO = 'ctrloja-mobile-v1';

const ARQUIVOS = [
  './',
  './index.html',
  './css/estilo.css',
  './js/dados.js',
  './js/nucleo.js',
  './js/app.js',
  './manifest.json',
  './icons/icone-192.png',
  './icons/icone-512.png',
  // Módulos reaproveitados do desktop — é o que garante mensagens iguais
  '../src/main/services/calendario.js',
  '../src/main/services/templates.js',
  '../src/main/services/agenda.js'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then((cache) => cache.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;

  // Rede primeiro para os módulos do desktop: assim uma correção feita
  // no computador chega ao celular na próxima vez que houver internet.
  const ehModulo = evento.request.url.indexOf('/src/main/services/') >= 0;

  if (ehModulo) {
    evento.respondWith(
      fetch(evento.request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(evento.request, copia));
          return resp;
        })
        .catch(() => caches.match(evento.request))
    );
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then((cacheado) => cacheado || fetch(evento.request))
  );
});
