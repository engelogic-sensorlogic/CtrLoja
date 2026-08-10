/* ==================================================================
   CtrLoja Mobile — service worker
   ==================================================================

   Guarda o aplicativo no aparelho para funcionar sem internet.
   Os dados da Loja não passam por aqui: ficam no armazenamento local.

   ESTRATÉGIA: rede primeiro, cache como reserva.

   A versão anterior fazia o contrário — cache primeiro — e o resultado
   foi o aplicativo nunca se atualizar: o celular continuava servindo o
   index.html antigo, que nem sequer carregava os arquivos novos.
   Com rede primeiro, havendo internet o aparelho sempre pega a versão
   publicada; sem internet, usa a última que guardou.
   ================================================================== */

const VERSAO = 'ctrloja-mobile-v8';

const ARQUIVOS = [
  './',
  './index.html',
  './css/estilo.css',
  './js/cargos.js',
  './js/cripto.js',
  './js/dados.js',
  './js/nucleo.js',
  './js/app.js',
  './manifest.json',
  './icons/icone-192.png',
  './icons/icone-512.png',
  // Módulos reaproveitados do desktop — é o que garante mensagens iguais
  '../src/main/services/calendario.js',
  '../src/main/services/templates.js',
  '../src/main/services/agenda.js',
  '../src/main/services/presenca.js',
  '../src/main/services/presenca-pacote.js',
  '../src/main/services/financeiro.js',
  '../src/main/services/financeiro-pacote.js'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then((cache) => cache.addAll(ARQUIVOS))
      .catch(() => { /* sem rede na instalação: segue assim mesmo */ })
      .then(() => self.skipWaiting())
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
  const req = evento.request;
  if (req.method !== 'GET') return;

  // O pacote de dados é sempre buscado direto pelo aplicativo, com
  // controle próprio de versão. O service worker não se mete.
  if (req.url.indexOf('/dados/') >= 0) return;

  evento.respondWith(
    fetch(req)
      .then((resp) => {
        // Guarda a cópia mais recente para quando faltar internet
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req).then((guardado) => {
        if (guardado) return guardado;
        // Navegação sem rede e sem cópia: entrega a página inicial
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Sem conexão e sem cópia local.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }))
  );
});

/* Permite ao aplicativo forçar a troca de versão sem fechar o app. */
self.addEventListener('message', (evento) => {
  if (evento.data === 'atualizar-agora') self.skipWaiting();
});
