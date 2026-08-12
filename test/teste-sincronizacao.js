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

const PREFIXO_DADOS = 'mobile/dados/';

/**
 * Serve a raiz do projeto, MENOS mobile/dados/, que vem da pasta
 * temporaria do teste. Assim o pacote de verdade - o que voce publicou
 * com o publicar-dados.bat - nunca e tocado por uma rodada de testes.
 */
function subirServidor(dirDados) {
  return new Promise((resolve) => {
    const servidor = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const arquivo = rel.startsWith(PREFIXO_DADOS)
        ? path.join(dirDados, rel.slice(PREFIXO_DADOS.length))
        : path.join(RAIZ, rel);
      const permitido = arquivo.startsWith(RAIZ) || arquivo.startsWith(dirDados);
      if (!permitido || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
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

  // Senha do Cargo definida no computador, como faz a tela de Configurações
  const criptoPC = require(path.join(RAIZ, 'src', 'main', 'services', 'cripto.js'));
  const SENHA_CHANCELARIA = 'chanceler-da-ufr-141';
  db.config.salvarVarias({
    senha_cargo_chancelaria: JSON.stringify(criptoPC.hashSenhaCargo(SENHA_CHANCELARIA))
  });

  const backup = path.join(tmp, 'origem.ctrloja');
  require(path.join(RAIZ, 'src', 'main', 'services', 'backup.js')).exportar(backup);

  console.log('== Publicação ==');

  // Publica numa pasta temporaria: o pacote de verdade em mobile/dados/
  // nao pode ser sobrescrito nem apagado por uma rodada de testes.
  const dirDados = path.join(tmp, 'publicado');
  execFileSync(process.execPath, [
    path.join(RAIZ, 'ferramentas', 'publicar-dados.js'), backup, '--destino', dirDados
  ], { cwd: RAIZ, env: { ...process.env, CTRLOJA_SENHA: SENHA_TESTE }, stdio: 'pipe' });

  ok('publicou fora da pasta do repositório',
    !fs.existsSync(path.join(RAIZ, 'mobile', 'dados', 'agenda.enc'))
    || fs.readFileSync(path.join(RAIZ, 'mobile', 'dados', 'agenda.enc'), 'utf8')
      !== fs.readFileSync(path.join(dirDados, 'agenda.enc'), 'utf8'));
  ok('agenda.enc gerado', fs.existsSync(path.join(dirDados, 'agenda.enc')));
  ok('versao.json gerado', fs.existsSync(path.join(dirDados, 'versao.json')));

  const bruto = fs.readFileSync(path.join(dirDados, 'agenda.enc'), 'utf8');
  ok('nenhum nome em claro no arquivo publicado',
    !/João Carlos|Maria Helena|Grupo Reservado|envio antigo/.test(bruto));

  /* ---- 2. Servidor e ambiente de navegador ---- */

  const servidor = await subirServidor(dirDados);
  const BASE = `http://127.0.0.1:${servidor.address().port}/mobile/`;

  const self = { crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, console, URL };
  vm.createContext(self);
  self.self = self;
  self.fetch = (u, o2) => fetch(new URL(u, BASE).href, o2);

  for (const arq of ['js/cargos.js', 'js/cripto.js', 'js/dados.js', 'js/nucleo.js']) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'mobile', arq), 'utf8'), self);
  }

  /* ---- 3. Estrutura de cargos ---- */

  console.log('\n== Áreas: Início público + quatro Cargos ==');
  const cargos = self.CtrLojaCargos;
  ok('Início e mais quatro Cargos', cargos.lista.length === 5, cargos.lista.map((c) => c.nome).join(', '));
  ok('Início é a área padrão e é pública',
    cargos.PADRAO === 'inicio' && cargos.obter('inicio').publico === true);
  ok('nenhum Cargo é público',
    cargos.lista.filter((c) => c.chave !== 'inicio').every((c) => c.publico === false));

  ok('Início: Hoje, Próximos, Presença, Finanças e Dados',
    cargos.abasDe('inicio').map((a) => a.chave).join() === 'hoje,proximos,presenca,financas,dados',
    cargos.abasDe('inicio').map((a) => a.chave).join());
  ok('Início não tem disparo, nem Obreiros, nem a chamada, nem lançamento',
    !cargos.abasDe('inicio').some((a) => ['mensagens', 'obreiros', 'chamada', 'extrato'].includes(a.chave)));

  ok('Chancelaria: Mensagens, Semana, Presença, Obreiros e Solicitar',
    cargos.abasDe('chancelaria').map((a) => a.chave).join() === 'mensagens,semana,chamada,obreiros,solicitar',
    cargos.abasDe('chancelaria').map((a) => a.chave).join());
  ok('Secretaria: Agenda da Loja, Obreiros e Solicitar',
    cargos.abasDe('secretaria').map((a) => a.chave).join() === 'agenda,obreiros,solicitar',
    cargos.abasDe('secretaria').map((a) => a.chave).join());

  for (const c of ['tesouraria', 'hospitalaria']) {
    ok(`${c}: Extrato Financeiro, Obreiros e Solicitar`,
      cargos.abasDe(c).map((a) => a.chave).join() === 'extrato,obreiros,solicitar',
      cargos.abasDe(c).map((a) => a.chave).join());
  }

  ok('os quatro Cargos estão implementados',
    cargos.lista.filter((c) => c.disponivel).length === 5,
    cargos.lista.filter((c) => c.disponivel).map((c) => c.chave).join());

  /* Obreiros e Solicitar sao iguais em todo cargo: e o combinado, e e o
     que impede cada um de criar a sua propria versao da mesma coisa. */
  for (const c of ['chancelaria', 'secretaria', 'tesouraria', 'hospitalaria']) {
    const abas = cargos.abasDe(c).map((a) => a.chave);
    ok(`${c} traz Obreiros e Solicitar`, abas.includes('obreiros') && abas.includes('solicitar'));
  }

  ok('só quem movimenta dinheiro declara área financeira',
    cargos.obter('tesouraria').areaFinanceira === 'tesouraria'
    && cargos.obter('hospitalaria').areaFinanceira === 'hospitalaria'
    && !cargos.obter('secretaria').areaFinanceira
    && !cargos.obter('chancelaria').areaFinanceira);

  ok('a chave da senha segue o padrão publicado',
    cargos.chaveSenha('chancelaria') === 'senha_cargo_chancelaria');

  /* ---- 4. Sincronizacao ---- */

  console.log('\n== Sincronização ==');
  const info = await self.fetch('dados/versao.json').then((r) => r.json());
  ok('versao.json é legível sem senha', info.formato === 'ctrloja-versao', 'versão ' + info.versao);
  ok('versao.json não expõe conteúdo', !/João|Maria|1974/.test(JSON.stringify(info)));
  ok('traz a impressão digital', typeof info.impressao === 'string' && info.impressao.length === 64);

  const envelope = await self.fetch('dados/' + info.arquivo).then((r) => r.json());
  const pacote = await self.CtrLojaCripto.decifrar(envelope, SENHA_TESTE);
  ok('pacote decifrado', pacote.formato === 'ctrloja-backup');
  ok('os quatro cargos declarados no pacote',
    JSON.stringify(pacote.cargos) === '["chancelaria","secretaria","tesouraria","hospitalaria"]',
    JSON.stringify(pacote.cargos));

  console.log('\n== O que NÃO foi publicado ==');
  ok('grupos do WhatsApp ficaram no PC', !pacote.dados.grupos);
  ok('histórico de envios ficou no PC', !pacote.dados.envios_log);
  ok('os lançamentos financeiros foram publicados', 'financeiro' in pacote.dados);
  ok('os visitantes foram publicados', 'visitantes' in pacote.dados);
  const chaves = (pacote.dados.config || []).map((c) => c.chave);
  ok('configurações internas ficaram no PC',
    !chaves.includes('cnpj') && !chaves.includes('wa_autoconectar') && !chaves.includes('disparo_modo'),
    chaves.length + ' chaves publicadas');
  ok('configurações usadas nas mensagens vieram',
    chaves.includes('loja_nome') && chaves.includes('titulo_obreiro'));

  /* ---- 4b. Senha do Cargo: viaja como impressão, nunca em texto ---- */

  console.log('\n== Senha do Cargo no pacote publicado ==');
  const linhaSenha = (pacote.dados.config || []).find((c) => c.chave === 'senha_cargo_chancelaria');
  ok('impressão da senha da Chancelaria foi publicada', !!linhaSenha);
  ok('a senha do Cargo NÃO viaja em texto',
    !bruto.includes(SENHA_CHANCELARIA) && !JSON.stringify(pacote).includes(SENHA_CHANCELARIA));

  const envSenha = JSON.parse(linhaSenha.valor);
  ok('formato de impressão digital', envSenha.formato === 'ctrloja-senha-cargo');
  ok('celular destrava com a senha certa',
    await self.CtrLojaCripto.conferirSenhaCargo(envSenha, SENHA_CHANCELARIA.toUpperCase()) === true);
  ok('celular recusa a senha errada',
    await self.CtrLojaCripto.conferirSenhaCargo(envSenha, 'chanceler-da-ufr-142') === false);
  ok('a senha da Loja não destrava o Cargo',
    await self.CtrLojaCripto.conferirSenhaCargo(envSenha, SENHA_TESTE) === false);
  ok('Cargo sem senha definida não tem impressão publicada',
    !(pacote.dados.config || []).some((c) => c.chave === 'senha_cargo_tesouraria'));

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

  // Nada a limpar: tudo foi gravado na pasta temporária do teste.

  console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'CICLO PUBLICAR → SINCRONIZAR VALIDADO'));
  process.exit(falhas ? 1 : 0);
})().catch((err) => {
  console.error('\n[ERRO]', err.message);
  process.exit(1);
});
