'use strict';

/* ==================================================================
   Ciclo completo: publicar no PC  ->  sincronizar no celular

   Sobe um servidor HTTP local, publica o pacote cifrado como o
   publicar-dados.bat faria e exercita o caminho do celular:
   ler versao.json, baixar o pacote, decifrar e montar a agenda.

   Execute com:  node --no-warnings test/teste-sincronizacao.js
   ================================================================== */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const vm = require('vm');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const SENHA_TESTE = 'senha-de-teste-do-ctrloja';

let falhas = 0;
const ok = (n, c, e = '') => {
  console.log((c ? '  OK  ' : 'FALHA ') + n + (e ? ' -> ' + e : ''));
  if (!c) falhas++;
};

/* ------------------------------------------------------------------ */
/* Servidor estatico simples, servindo a raiz do projeto              */
/* ------------------------------------------------------------------ */

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

function subirServidor() {
  return new Promise((resolve) => {
    const servidor = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const arquivo = path.join(RAIZ, rel);
      if (!arquivo.startsWith(RAIZ) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        res.writeHead(404); res.end('nao encontrado'); return;
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
      res.end(fs.readFileSync(arquivo));
    });
    servidor.listen(0, '127.0.0.1', () => resolve(servidor));
  });
}

/* ------------------------------------------------------------------ */

(async () => {
  /* ---- 1. Banco de teste e publicacao ---- */

  const db = require(path.join(RAIZ, 'src', 'main', 'db', 'database.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sinc-'));
  db.init(tmp);

  const o = db.obreiros.salvar({
    nome: 'João Carlos de Souza', tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Ativo',
    dt_nascimento: '1974-08-03', dt_iniciacao: '2014-08-03'
  });
  db.familiares.salvar({ obreiro_id: o.id, parentesco: 'cunhada', nome: 'Maria Helena de Souza', dt_nascimento: '1978-08-03' });
  db.sessoes.salvar({ data: '2026-08-10', grau: 'Aprendiz', tipo: 'Economica', agenda_dia: '1. Abertura' });
  db.grupos.sincronizar([{ id: '111@g.us', nome: 'Grupo Reservado da Loja' }]);
  db.envios.registrar({ data_ref: '2026-08-03', evento_tipo: 'x', mensagem: 'envio antigo', status: 'enviado' });

  const backup = path.join(tmp, 'origem.ctrloja');
  require(path.join(RAIZ, 'src', 'main', 'services', 'backup.js')).exportar(backup);

  console.log('== Publicação ==');
  execFileSync(process.execPath, [path.join(RAIZ, 'ferramentas', 'publicar-dados.js'), backup], {
    cwd: RAIZ, env: { ...process.env, CTRLOJA_SENHA: SENHA_TESTE }, stdio: 'pipe'
  });

  const dirDados = path.join(RAIZ, 'mobile', 'dados');
  ok('agenda.enc gerado', fs.existsSync(path.join(dirDados, 'agenda.enc')));
  ok('versao.json gerado', fs.existsSync(path.join(dirDados, 'versao.json')));

  const bruto = fs.readFileSync(path.join(dirDados, 'agenda.enc'), 'utf8');
  ok('nenhum nome em claro no arquivo publicado',
    !/João Carlos|Maria Helena|Grupo Reservado|envio antigo/.test(bruto));

  /* ---- 2. Servidor e ambiente de navegador ---- */

  const servidor = await subirServidor();
  const BASE = `http://127.0.0.1:${servidor.address().port}/mobile/`;

  const self = { crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, console, URL };
  vm.createContext(self);
  self.self = self;
  self.fetch = (u, o2) => fetch(new URL(u, BASE).href, o2);

  for (const arq of ['js/cargos.js', 'js/cripto.js', 'js/dados.js', 'js/nucleo.js']) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'mobile', arq), 'utf8'), self);
  }

  /* ---- 3. Estrutura de cargos ---- */

  console.log('\n== Cargos ==');
  const cargos = self.CtrLojaCargos;
  ok('quatro cargos declarados', cargos.lista.length === 4, cargos.lista.map((c) => c.nome).join(', '));
  ok('apenas a Chancelaria implementada',
    cargos.lista.filter((c) => c.disponivel).map((c) => c.chave).join() === 'chancelaria');
  ok('Chancelaria: Hoje, Próximos, Obreiros e Dados',
    cargos.abasDe('chancelaria').map((a) => a.chave).join() === 'hoje,proximos,obreiros,dados');
  for (const c of ['secretaria', 'tesouraria', 'hospitalaria']) {
    ok(`${c} mostra apenas Dados`, cargos.abasDe(c).map((a) => a.chave).join() === 'dados');
  }

  /* ---- 4. Sincronizacao ---- */

  console.log('\n== Sincronização ==');
  const info = await self.fetch('dados/versao.json').then((r) => r.json());
  ok('versao.json é legível sem senha', info.formato === 'ctrloja-versao', 'versão ' + info.versao);
  ok('versao.json não expõe conteúdo', !/João|Maria|1974/.test(JSON.stringify(info)));
  ok('traz a impressão digital', typeof info.impressao === 'string' && info.impressao.length === 64);

  const envelope = await self.fetch('dados/' + info.arquivo).then((r) => r.json());
  const pacote = await self.CtrLojaCripto.decifrar(envelope, SENHA_TESTE);
  ok('pacote decifrado', pacote.formato === 'ctrloja-backup');
  ok('cargos declarados no pacote', JSON.stringify(pacote.cargos) === '["chancelaria"]');

  console.log('\n== O que NÃO foi publicado ==');
  ok('grupos do WhatsApp ficaram no PC', !pacote.dados.grupos);
  ok('histórico de envios ficou no PC', !pacote.dados.envios_log);
  const chaves = (pacote.dados.config || []).map((c) => c.chave);
  ok('configurações internas ficaram no PC',
    !chaves.includes('cnpj') && !chaves.includes('wa_autoconectar') && !chaves.includes('disparo_modo'),
    chaves.length + ' chaves publicadas');
  ok('configurações usadas nas mensagens vieram',
    chaves.includes('loja_nome') && chaves.includes('titulo_obreiro'));

  /* ---- 5. Agenda a partir do pacote sincronizado ---- */

  console.log('\n== Agenda com os dados sincronizados ==');
  const banco = self.CtrLojaDados.criarBanco(pacote);
  const nucleo = await self.CtrLojaNucleo.montar(banco);
  const fila = nucleo.agenda.montarFila('2026-08-03');
  ok('eventos do dia calculados', fila.total >= 2, fila.total + ' evento(s)');
  ok('mensagens sem variável pendente', fila.itens.every((i) => !/\{\{/.test(i.mensagem || '')));
  ok('título maçônico correto', fila.itens.some((i) => i.titulo_pessoa === 'Cunhada'));

  /* ---- 6. Senha: maiúsculas e espaços não importam ---- */

  console.log('\n== Senha ==');
  const variantes = [SENHA_TESTE.toUpperCase(), '  ' + SENHA_TESTE + '  ', SENHA_TESTE.replace('s', 'S')];
  for (const v of variantes) {
    const p = await self.CtrLojaCripto.decifrar(envelope, v);
    ok(`aceita "${v.slice(0, 12)}…"`, p.formato === 'ctrloja-backup');
  }
  try { await self.CtrLojaCripto.decifrar(envelope, 'outra-senha'); ok('recusa senha errada', false); }
  catch (e) { ok('recusa senha errada', /incorreta|corrompido/i.test(e.message)); }

  /* ---- 7. Nada a baixar quando não há novidade ---- */

  console.log('\n== Detecção de novidade ==');
  const info2 = await self.fetch('dados/versao.json?t=2').then((r) => r.json());
  ok('mesma impressão quando nada mudou', info.impressao === info2.impressao);

  servidor.close();

  // Limpa os artefatos de teste para não irem ao repositório
  for (const f of ['agenda.enc', 'versao.json']) {
    const p = path.join(dirDados, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'CICLO PUBLICAR → SINCRONIZAR VALIDADO'));
  process.exit(falhas ? 1 : 0);
})().catch((err) => {
  console.error('\n[ERRO]', err.message);
  process.exit(1);
});
