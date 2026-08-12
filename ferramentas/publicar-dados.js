'use strict';

/**
 * Publica os dados da Loja para o aplicativo do celular.
 *
 *   banco do PC  ->  filtra  ->  cifra  ->  mobile/dados/agenda.enc
 *
 * O arquivo cifrado vai para o repositorio publico; sem a senha, e texto
 * embaralhado. Junto vai um versao.json em claro, com apenas o numero da
 * versao e a impressao digital - o celular usa esses poucos bytes para
 * saber se ha novidade antes de baixar o pacote inteiro.
 *
 * Uso:
 *   node ferramentas/publicar-dados.js
 *   node ferramentas/publicar-dados.js --senha "MinhaSenha"
 *   node ferramentas/publicar-dados.js "C:\caminho\backup.ctrloja"
 *
 * Ou dois cliques em  publicar-dados.bat
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const RAIZ = path.join(__dirname, '..');
const cripto = require(path.join(RAIZ, 'src', 'main', 'services', 'cripto.js'));

const DESTINO_PADRAO = path.join(RAIZ, 'mobile', 'dados');
const ARQ_DADOS = 'agenda.enc';
const ARQ_VERSAO = 'versao.json';

// Onde gravar. So muda com --destino, usado pelos testes automatizados
// para nao encostarem no pacote de verdade que voce publicou.
let DESTINO = DESTINO_PADRAO;

/* ------------------------------------------------------------------ */
/* O que o celular precisa - e apenas isso                             */
/* ------------------------------------------------------------------ */

// Cada cargo declara as tabelas que leva para o celular. Hoje so a
// Chancelaria esta implementada; Secretaria, Tesouraria e Hospitalaria
// entram aqui conforme forem construidas.
const CARGOS = {
  chancelaria: ['obreiros', 'familiares', 'datas_calendario', 'sessoes', 'templates', 'presencas', 'visitantes'],
  secretaria: ['obreiros', 'familiares', 'sessoes'],
  tesouraria: ['obreiros', 'financeiro'],
  hospitalaria: ['obreiros', 'financeiro']
};

// Historico de envios e grupos do WhatsApp ficam no computador: o celular
// nao usa e nao ha razao para publicar.
const TABELAS_FORA = ['envios_log', 'grupos', 'controle_disparo'];

// Da configuracao vai so o que aparece nas mensagens ou na tela.
const CONFIG_PUBLICADA = [
  'loja_nome', 'loja_sigla', 'loja_numero', 'potencia', 'oriente', 'rito',
  'fundacao_loja', 'dia_reuniao', 'hora_reuniao', 'templo',
  'titulo_obreiro', 'titulo_cunhada', 'titulo_sobrinho', 'titulo_sobrinha',
  'agrupar_mensagens', 'eventos_habilitados'
];

// As senhas dos Cargos tambem vao - mas apenas como IMPRESSAO DIGITAL.
// A verificacao logo abaixo recusa publicar qualquer coisa que nao esteja
// nesse formato, para que um dia ninguem publique senha em texto por engano.
const PREFIXO_SENHA_CARGO = 'senha_cargo_';

function conferirSenhasCargo(linhas) {
  for (const l of linhas) {
    if (!String(l.chave || '').startsWith(PREFIXO_SENHA_CARGO)) continue;
    if (!l.valor) continue;
    let env = null;
    try { env = JSON.parse(l.valor); } catch { env = null; }
    if (!env || env.formato !== cripto.FORMATO_SENHA || !env.hash || !env.sal) {
      throw new Error(
        `A configuração "${l.chave}" não está no formato de impressão digital. `
        + 'Nada foi publicado. Redefina a senha desse Cargo em Configurações.'
      );
    }
  }
}

/* ------------------------------------------------------------------ */

function localizarBanco(argumento) {
  if (argumento) {
    if (!fs.existsSync(argumento)) throw new Error(`Arquivo não encontrado: ${argumento}`);
    return argumento;
  }
  const candidatos = [
    path.join(process.env.APPDATA || '', 'CtrLoja', 'dados', 'ctrloja.db'),
    path.join(os.homedir(), '.config', 'CtrLoja', 'dados', 'ctrloja.db')
  ];
  const achado = candidatos.find((p) => p && fs.existsSync(p));
  if (!achado) {
    throw new Error(
      'Banco de dados do CtrLoja não encontrado.\n'
      + 'Informe o caminho ou exporte um backup pelo aplicativo:\n'
      + '  node ferramentas/publicar-dados.js "C:\\caminho\\backup.ctrloja"'
    );
  }
  return achado;
}

/** Le do banco SQLite ou de um backup .ctrloja e devolve o pacote bruto. */
function lerPacote(origem) {
  if (/\.(ctrloja|json)$/i.test(origem)) {
    const p = JSON.parse(fs.readFileSync(origem, 'utf8'));
    if (p.formato !== 'ctrloja-backup') throw new Error('Arquivo não é um backup do CtrLoja.');
    return p;
  }
  const Database = require(path.join(RAIZ, 'src', 'main', 'db', 'driver.js'));
  const conn = new Database(origem);
  const dados = {};
  const tabelas = conn.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all();
  for (const t of tabelas) dados[t.name] = conn.prepare(`SELECT * FROM ${t.name}`).all();
  if (typeof conn.close === 'function') conn.close();
  return { formato: 'ctrloja-backup', gerado_em: new Date().toISOString(), dados };
}

/** Deixa passar apenas o que o celular usa. */
function filtrar(pacote, cargos) {
  const permitidas = new Set();
  for (const c of cargos) for (const t of (CARGOS[c] || [])) permitidas.add(t);

  const dados = {};
  for (const [tabela, linhas] of Object.entries(pacote.dados || {})) {
    if (TABELAS_FORA.includes(tabela)) continue;
    if (tabela === 'config') {
      dados.config = (linhas || []).filter((l) =>
        CONFIG_PUBLICADA.includes(l.chave)
        || (String(l.chave || '').startsWith(PREFIXO_SENHA_CARGO) && l.valor));
      conferirSenhasCargo(dados.config);
      continue;
    }
    if (!permitidas.has(tabela)) continue;
    dados[tabela] = linhas || [];
  }

  return {
    formato: 'ctrloja-backup',
    gerado_em: new Date().toISOString(),
    cargos,
    dados
  };
}

/** Pergunta a senha sem mostrar na tela. */
function perguntarSenha(rotulo) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const escrever = rl._writeToOutput ? rl._writeToOutput.bind(rl) : null;
    rl._writeToOutput = function (txt) {
      if (rl.stdoutMuted) rl.output.write('*');
      else if (escrever) escrever(txt);
      else rl.output.write(txt);
    };
    rl.question(rotulo, (resposta) => {
      rl.stdoutMuted = false;
      rl.output.write('\n');
      rl.close();
      resolve(resposta);
    });
    rl.stdoutMuted = true;
  });
}

function lerVersaoAtual(destino) {
  const arq = path.join(destino || DESTINO, ARQ_VERSAO);
  if (!fs.existsSync(arq)) return 0;
  try { return Number(JSON.parse(fs.readFileSync(arq, 'utf8')).versao) || 0; }
  catch { return 0; }
}

/* ------------------------------------------------------------------ */
/* O trabalho em si                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cifra e grava o pacote. Usada pela linha de comando E pelo botao
 * "Publicar para o celular" dentro do CtrLoja - por isso nao imprime
 * nada nem pergunta nada: recebe tudo pronto e devolve o resultado.
 *
 * @param {object} opcoes { pacoteBruto, senha, destino }
 * @returns {object} info da publicacao, igual a gravada no versao.json
 */
function publicar(opcoes) {
  const destino = opcoes.destino || DESTINO;
  const pacote = filtrar(opcoes.pacoteBruto, Object.keys(CARGOS));

  const envelope = cripto.cifrar(pacote, opcoes.senha);
  const textoEnvelope = JSON.stringify(envelope, null, 2);

  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, ARQ_DADOS), textoEnvelope, 'utf8');

  const info = {
    formato: 'ctrloja-versao',
    versao: lerVersaoAtual(destino) + 1,
    gerado_em: pacote.gerado_em,
    arquivo: ARQ_DADOS,
    bytes: Buffer.byteLength(textoEnvelope, 'utf8'),
    impressao: cripto.impressao(textoEnvelope),
    cargos: pacote.cargos
  };
  fs.writeFileSync(path.join(destino, ARQ_VERSAO), JSON.stringify(info, null, 2) + '\n', 'utf8');

  /* --- conferencias: o arquivo abre de volta e nada vazou em claro --- */

  const conferido = cripto.decifrar(
    JSON.parse(fs.readFileSync(path.join(destino, ARQ_DADOS), 'utf8')), opcoes.senha
  );
  if (JSON.stringify(conferido) !== JSON.stringify(pacote)) {
    throw new Error('O arquivo gravado não confere com a origem. Nada foi publicado.');
  }

  const nomes = (pacote.dados.obreiros || []).map((o) => o.nome).filter(Boolean);
  const vazou = nomes.find((n) => textoEnvelope.indexOf(n) >= 0);
  if (vazou) throw new Error(`Falha de segurança: "${vazou}" aparece em claro no arquivo.`);

  return Object.assign({ destino, resumo: resumoDe(pacote), protegidos: cargosProtegidos(pacote) }, info);
}

const resumoDe = (pacote) => Object.fromEntries(
  Object.entries(pacote.dados).map(([t, linhas]) => [t, linhas.length])
);

const cargosProtegidos = (pacote) => (pacote.dados.config || [])
  .filter((l) => String(l.chave || '').startsWith(PREFIXO_SENHA_CARGO) && l.valor)
  .map((l) => l.chave.slice(PREFIXO_SENHA_CARGO.length));

/* ------------------------------------------------------------------ */

async function principal() {
  console.log('\n===================================================================');
  console.log('  CtrLoja - Publicar dados para o aplicativo do celular');
  console.log('===================================================================\n');

  const args = process.argv.slice(2);
  const iSenha = args.indexOf('--senha');
  let senha = iSenha >= 0 ? args[iSenha + 1] : (process.env.CTRLOJA_SENHA || null);

  const iDestino = args.indexOf('--destino');
  const destinoArg = iDestino >= 0 ? args[iDestino + 1] : null;
  if (destinoArg) DESTINO = path.resolve(destinoArg);

  const origemArg = args.find((a) => !a.startsWith('--') && a !== senha && a !== destinoArg);

  const origem = localizarBanco(origemArg);
  console.log(`Origem : ${origem}`);

  const bruto = lerPacote(origem);
  const pacote = filtrar(bruto, Object.keys(CARGOS));

  console.log('\nConteúdo a publicar:');
  for (const [t, linhas] of Object.entries(pacote.dados)) {
    console.log(`  ${String(linhas.length).padStart(4)}  ${t}`);
  }
  const fora = Object.keys(bruto.dados || {}).filter((t) => !(t in pacote.dados));
  if (fora.length) console.log(`\nFica no computador: ${fora.join(', ')}`);

  const protegidos = cargosProtegidos(pacote);
  console.log('\nCargos com senha definida: ' + (protegidos.length ? protegidos.join(', ') : 'nenhum'));
  if (!protegidos.length) {
    console.log('  [AVISO] Sem senha, os Cargos ficam abertos no celular de qualquer Irmao.');
    console.log('          Defina em Configuracoes -> Senhas dos Cargos.');
  }

  if (!senha) {
    console.log('\nA senha protege os dados dos Irmãos e das famílias no repositório público.');
    console.log('Use a MESMA senha combinada com os Irmãos que usam o aplicativo.\n');
    senha = await perguntarSenha('Senha da Loja: ');
    const conferir = await perguntarSenha('Repita a senha: ');
    if (senha !== conferir) throw new Error('As senhas não conferem.');
  }

  // Daqui para baixo e o mesmo caminho que o botao dentro do CtrLoja
  // percorre. Uma funcao so, para nao existirem dois jeitos de publicar
  // que um dia possam divergir.
  const info = publicar({ pacoteBruto: bruto, senha, destino: DESTINO });

  console.log(`\nPublicado em ${path.relative(RAIZ, DESTINO) || DESTINO}/`);
  console.log(`  ${ARQ_DADOS}    ${(info.bytes / 1024).toFixed(1)} KB  (cifrado)`);
  console.log(`  ${ARQ_VERSAO}   versão ${info.versao}`);
  console.log(`\nConferido: o arquivo abre com a senha e nenhum nome ficou em claro.`);
  console.log('\nPróximo passo: publicar-github.bat  ->  o celular verá a novidade ao Sincronizar.\n');
}

/* Executado direto pelo .bat: roda. Carregado pelo CtrLoja: so exporta. */
if (require.main === module) {
  principal().catch((err) => {
    console.error(`\n[ERRO] ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  publicar, filtrar, cargosProtegidos, resumoDe,
  CARGOS, CONFIG_PUBLICADA, DESTINO_PADRAO, ARQ_DADOS, ARQ_VERSAO
};
