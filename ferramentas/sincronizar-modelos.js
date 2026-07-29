'use strict';

/**
 * Traz os modelos de mensagem editados no aplicativo de volta para o
 * codigo-fonte (src/main/db/templates-padrao.js).
 *
 * A partir dai, toda instalacao nova - e o instalador gerado pelo build.bat -
 * ja nasce com os textos definitivos da Loja.
 *
 * Uso:
 *   node ferramentas/sincronizar-modelos.js
 *   node ferramentas/sincronizar-modelos.js "C:\\caminho\\ctrloja.db"
 *   node ferramentas/sincronizar-modelos.js "C:\\caminho\\backup.ctrloja"
 *
 * Ou simplesmente dois cliques em  sincronizar-modelos.bat
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const RAIZ = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'src', 'main', 'db', 'templates-padrao.js');

/* ------------------------------------------------------------------ */

function localizarBanco(argumento) {
  if (argumento) {
    if (!fs.existsSync(argumento)) throw new Error(`Arquivo não encontrado: ${argumento}`);
    return argumento;
  }

  const candidatos = [
    // Windows
    path.join(process.env.APPDATA || '', 'CtrLoja', 'dados', 'ctrloja.db'),
    // Linux / macOS (uso em desenvolvimento)
    path.join(os.homedir(), '.config', 'CtrLoja', 'dados', 'ctrloja.db'),
    path.join(os.homedir(), 'Library', 'Application Support', 'CtrLoja', 'dados', 'ctrloja.db')
  ];

  const achado = candidatos.find((p) => p && fs.existsSync(p));
  if (!achado) {
    throw new Error(
      'Banco de dados do CtrLoja não encontrado.\n' +
      'Procurei em:\n  ' + candidatos.filter(Boolean).join('\n  ') + '\n\n' +
      'Informe o caminho manualmente:\n' +
      '  node ferramentas/sincronizar-modelos.js "C:\\caminho\\ctrloja.db"\n' +
      'ou exporte um backup pelo aplicativo e passe o arquivo .ctrloja.'
    );
  }
  return achado;
}

/** Le os modelos de um banco SQLite ou de um backup .ctrloja (JSON). */
function lerModelos(arquivo) {
  if (/\.(ctrloja|json)$/i.test(arquivo)) {
    const pacote = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const lista = pacote && pacote.dados && pacote.dados.templates;
    if (!Array.isArray(lista)) throw new Error('O arquivo não contém a tabela de modelos.');
    return lista.filter((t) => t.ativo === undefined || t.ativo);
  }

  const Database = require(path.join(RAIZ, 'src', 'main', 'db', 'driver.js'));
  const conn = new Database(arquivo);
  const linhas = conn.prepare(
    'SELECT chave, titulo, descricao, corpo FROM templates WHERE ativo = 1 ORDER BY id'
  ).all();
  if (typeof conn.close === 'function') conn.close();
  return linhas;
}

/** Escapa o texto para dentro de uma template literal do JavaScript. */
function escapar(texto) {
  return String(texto || '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function aspas(texto) {
  return `'${String(texto || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function gerarArquivo(modelos) {
  const blocos = modelos.map((t) => (
    `  {
    chave: ${aspas(t.chave)},
    titulo: ${aspas(t.titulo)},
    descricao: ${aspas(t.descricao)},
    corpo:
\`${escapar(t.corpo)}\`
  }`
  ));

  return `'use strict';

/**
 * Modelos de mensagem de fabrica.
 *
 * ATENCAO: este arquivo e gerado por  ferramentas/sincronizar-modelos.js
 * a partir dos modelos editados dentro do aplicativo. Prefira editar os
 * textos na tela "Modelos" e rodar a ferramenta novamente, em vez de
 * alterar este arquivo a mao.
 *
 * Gerado em: ${new Date().toLocaleString('pt-BR')}
 * Total de modelos: ${modelos.length}
 */

module.exports = [
${blocos.join(',\n\n')}
];
`;
}

/* ------------------------------------------------------------------ */

function principal() {
  console.log('\n===================================================================');
  console.log('  CtrLoja - Sincronizacao dos modelos de mensagem');
  console.log('===================================================================\n');

  const origem = localizarBanco(process.argv[2]);
  console.log(`Origem : ${origem}`);
  console.log(`Destino: ${DESTINO}\n`);

  const modelos = lerModelos(origem);
  if (!modelos.length) throw new Error('Nenhum modelo encontrado na origem.');

  // Comparacao com o que ja existe no codigo-fonte
  let anteriores = [];
  try {
    delete require.cache[require.resolve(DESTINO)];
    anteriores = require(DESTINO);
  } catch { /* primeira execucao */ }

  const antes = Object.fromEntries(anteriores.map((t) => [t.chave, t.corpo]));
  const alterados = [];
  const novos = [];

  for (const t of modelos) {
    if (!(t.chave in antes)) novos.push(t.chave);
    else if (antes[t.chave] !== t.corpo) alterados.push(t.chave);
  }
  const removidos = Object.keys(antes).filter((c) => !modelos.some((t) => t.chave === c));

  console.log(`Modelos lidos    : ${modelos.length}`);
  console.log(`Alterados        : ${alterados.length ? alterados.join(', ') : '(nenhum)'}`);
  console.log(`Novos            : ${novos.length ? novos.join(', ') : '(nenhum)'}`);
  console.log(`Fora do codigo   : ${removidos.length ? removidos.join(', ') : '(nenhum)'}`);

  if (!alterados.length && !novos.length && !removidos.length) {
    console.log('\nO codigo-fonte ja esta igual ao aplicativo. Nada a fazer.\n');
    return;
  }

  // Copia de seguranca do arquivo anterior
  if (fs.existsSync(DESTINO)) {
    const bkp = DESTINO.replace(/\.js$/, '.anterior.js');
    fs.copyFileSync(DESTINO, bkp);
    console.log(`\nCopia de seguranca: ${path.basename(bkp)}`);
  }

  fs.writeFileSync(DESTINO, gerarArquivo(modelos), 'utf8');

  // Validacao: o arquivo gerado precisa carregar e bater com a origem
  delete require.cache[require.resolve(DESTINO)];
  const verificacao = require(DESTINO);
  const iguais = verificacao.length === modelos.length
    && modelos.every((t) => {
      const v = verificacao.find((x) => x.chave === t.chave);
      return v && v.corpo === t.corpo;
    });

  if (!iguais) {
    throw new Error('O arquivo gerado não confere com a origem. Nada foi perdido: veja o arquivo .anterior.js');
  }

  console.log(`\nOK: ${modelos.length} modelo(s) gravados e conferidos em templates-padrao.js`);
  console.log('\nProximos passos:');
  console.log('  1) git add -A && git commit -m "Modelos de mensagem atualizados"');
  console.log('  2) build.bat  -> o instalador ja sai com estes textos\n');
}

try {
  principal();
} catch (err) {
  console.error(`\n[ERRO] ${err.message}\n`);
  process.exit(1);
}
