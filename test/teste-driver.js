'use strict';

/* ==================================================================
   O driver entrega sempre a mesma coisa

   O CtrLoja usa o better-sqlite3 quando ele está compilado e o
   node:sqlite quando não está. São dois motores, e o programa não pode
   se comportar diferente conforme a máquina — esse é o pior tipo de
   defeito, o que só aparece no computador do outro.

   Este teste nasceu de um caso real: o Node 24 passou a devolver as
   linhas do node:sqlite com PROTÓTIPO NULO. Os dados eram os mesmos,
   mas os objetos não tinham toString nem hasOwnProperty, e a bateria
   inteira quebrou numa máquina que só havia atualizado o Node.

   Execute com:  node --no-warnings test/teste-driver.js
   ================================================================== */

const path = require('path');
const fs = require('fs');
const os = require('os');

const RAIZ = path.join(__dirname, '..');
const Database = require(path.join(RAIZ, 'src', 'main', 'db', 'driver.js'));

let falhas = 0;
const ok = (n, c, e = '') => {
  console.log((c ? '  OK  ' : 'FALHA ') + n + (e ? ' -> ' + e : ''));
  if (!c) falhas++;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'driver-'));
const conn = new Database(path.join(tmp, 'teste.db'));

console.log('== Motor em uso ==');
console.log('   ' + (Database.motorAtual || 'desconhecido') + '  ·  Node ' + process.version);

conn.exec(`
  CREATE TABLE obreiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    grau TEXT,
    ativo INTEGER DEFAULT 1,
    observacoes TEXT
  );
`);

const inserir = conn.prepare('INSERT INTO obreiros (nome, grau, observacoes) VALUES (?, ?, ?)');
inserir.run('João Carlos de Souza', 'Mestre', null);
inserir.run('Álvaro de Andrade', 'Aprendiz', 'com acento e ∴');

/* ------------------------------------------------------------------ */

console.log('\n== As linhas são objetos comuns ==');

const um = conn.prepare('SELECT * FROM obreiros WHERE id = ?').get(1);
const todos = conn.prepare('SELECT * FROM obreiros ORDER BY id').all();

ok('get() devolve algo', !!um);
ok('all() devolve a lista', Array.isArray(todos) && todos.length === 2, String(todos.length));

/* O protótipo nulo é o que quebrou tudo na atualização do Node. */
ok('get(): a linha herda de Object', um instanceof Object);
ok('all(): toda linha herda de Object', todos.every((l) => l instanceof Object));
ok('a linha tem hasOwnProperty', typeof um.hasOwnProperty === 'function');
ok('a linha tem toString', typeof um.toString === 'function');

let interpolou = true;
try { String(`${um}`); } catch { interpolou = false; }
ok('a linha pode entrar num texto sem lançar erro', interpolou);

ok('Object.keys funciona', Object.keys(um).join() === 'id,nome,grau,ativo,observacoes', Object.keys(um).join());
ok('o espalhamento preserva tudo', JSON.stringify({ ...um }) === JSON.stringify(um));

console.log('\n== O conteúdo continua intacto ==');
ok('texto com acento e sinal maçônico', todos[1].nome === 'Álvaro de Andrade');
ok('observação com ∴ preservada', todos[1].observacoes === 'com acento e ∴');
ok('número continua número', typeof um.id === 'number' && um.id === 1);
ok('nulo continua nulo', um.observacoes === null);
ok('inteiro do banco chega inteiro', um.ativo === 1);

console.log('\n== Nada encontrado não vira objeto vazio ==');
const nada = conn.prepare('SELECT * FROM obreiros WHERE id = ?').get(999);
ok('get() sem resultado é vazio, não um objeto', nada === undefined || nada === null, String(nada));
ok('all() sem resultado é lista vazia',
  conn.prepare('SELECT * FROM obreiros WHERE id > 999').all().length === 0);

console.log('\n== Transação ==');
const gravarVarios = conn.transaction((nomes) => {
  for (const n of nomes) inserir.run(n, 'Mestre', null);
  return nomes.length;
});
ok('transação grava tudo', gravarVarios(['A', 'B']) === 2);
ok('as linhas novas estão lá', conn.prepare('SELECT * FROM obreiros').all().length === 4);

try {
  conn.transaction(() => {
    inserir.run('Não deve ficar', 'Mestre', null);
    throw new Error('falha proposital');
  })();
  ok('transação desfaz ao dar erro', false);
} catch {
  ok('transação desfaz ao dar erro',
    conn.prepare('SELECT * FROM obreiros').all().length === 4);
}

if (typeof conn.close === 'function') conn.close();

/* ------------------------------------------------------------------ */
/* Escolha do motor                                                    */
/* ------------------------------------------------------------------ */
/*
 * O better-sqlite3 e um modulo NATIVO: o JavaScript dele carrega
 * sempre, mas so funciona com o binario .node compilado. Havendo o
 * pacote sem o binario - foi o que o npm passou a produzir ao bloquear
 * scripts de instalacao - o require passa limpo e o erro so estoura no
 * primeiro "new Database", com uma parede de texto sobre "bindings
 * file" na cara do usuario.
 *
 * A escolha do motor tem de ABRIR um banco para decidir. Estes casos
 * garantem isso.
 */

console.log('\n== Escolha do motor ==');

const Modulo = require('module');
const caminhoDriver = require.resolve(path.join(RAIZ, 'src', 'main', 'db', 'driver.js'));
const carregarOriginal = Modulo._load;

function motorEscolhidoQuando(fingirBetterSqlite) {
  Modulo._load = function (pedido) {
    if (pedido === 'better-sqlite3') return fingirBetterSqlite();
    return carregarOriginal.apply(this, arguments);
  };
  delete require.cache[caminhoDriver];
  const escolhido = require(caminhoDriver).motorAtual;
  Modulo._load = carregarOriginal;
  delete require.cache[caminhoDriver];
  return escolhido;
}

ok('sem o pacote instalado, cai para o node:sqlite',
  motorEscolhidoQuando(() => { throw new Error('Cannot find module'); }) === 'node:sqlite');

ok('pacote sem o binário compilado, cai para o node:sqlite',
  motorEscolhidoQuando(() => class {
    constructor() { throw new Error('Could not locate the bindings file'); }
  }) === 'node:sqlite',
  'o require passa, mas abrir o banco falha');

ok('pacote inteiro e funcionando, usa o better-sqlite3',
  motorEscolhidoQuando(() => class { close() { /* abre e fecha */ } }) === 'better-sqlite3');

console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'DRIVER VALIDADO'));
process.exit(falhas ? 1 : 0);
