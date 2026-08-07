'use strict';

/* ==================================================================
   Servidor local para testar o aplicativo do celular no proprio PC

   Por que existe:
     A sincronizacao cifrada usa a Web Crypto API, que o navegador so
     libera em "contexto seguro" - HTTPS ou localhost. Abrir o
     index.html com duplo clique (file://) NAO funciona, e pelo IP da
     rede local tambem nao. Servindo em http://localhost o navegador
     considera seguro e tudo funciona igual ao GitHub Pages.

   Serve a RAIZ do projeto, nao a pasta mobile: o aplicativo busca os
   modulos reaproveitados em ../src/main/services/.

   Uso:  node ferramentas/servidor-celular.js [porta]
   ================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PORTA = Number(process.argv[2]) || 8123;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.enc': 'application/octet-stream',
  '.ctrloja': 'application/json; charset=utf-8'
};

const servidor = http.createServer((req, resp) => {
  let caminho;
  try {
    caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    resp.writeHead(400).end('Endereco invalido.');
    return;
  }

  if (caminho === '/') caminho = '/mobile/';
  if (caminho.endsWith('/')) caminho += 'index.html';

  const alvo = path.join(RAIZ, path.normalize(caminho).replace(/^[\\/]+/, ''));

  // Ninguem sai da pasta do projeto
  if (!alvo.startsWith(RAIZ)) {
    resp.writeHead(403).end('Fora do projeto.');
    return;
  }

  fs.readFile(alvo, (erro, conteudo) => {
    if (erro) {
      console.log('  404  ' + caminho);
      resp.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      resp.end('Nao encontrado: ' + caminho);
      return;
    }
    console.log('  200  ' + caminho);
    resp.writeHead(200, {
      'Content-Type': TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream',
      // Em teste nao queremos brigar com cache nenhum
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    });
    resp.end(conteudo);
  });
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[ERRO] A porta ${PORTA} ja esta em uso.`);
    console.error(`       Tente outra:  node ferramentas/servidor-celular.js ${PORTA + 1}\n`);
  } else {
    console.error('\n[ERRO] ' + e.message + '\n');
  }
  process.exit(1);
});

servidor.listen(PORTA, '127.0.0.1', () => {
  const url = `http://localhost:${PORTA}/mobile/`;
  console.log('');
  console.log('===================================================================');
  console.log('  CtrLoja - aplicativo do celular rodando no PC');
  console.log('===================================================================');
  console.log('');
  console.log('  Endereco: ' + url);
  console.log('');
  console.log('  Por ser localhost, a criptografia funciona e o botao');
  console.log('  Sincronizar abre o pacote de mobile\\dados\\.');
  console.log('');
  console.log('  Para encerrar: feche esta janela ou tecle Ctrl+C.');
  console.log('');
  console.log('-------------------------------------------------------------------');

  if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], () => {});
  }
});
