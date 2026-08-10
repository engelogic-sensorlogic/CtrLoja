'use strict';

/**
 * Driver de banco de dados do CtrLoja.
 *
 * Prioridade:
 *   1. better-sqlite3  -> modulo nativo, usado na versao empacotada (mais rapido)
 *   2. node:sqlite     -> SQLite embutido no Node/Electron, sem compilacao
 *
 * O segundo caminho permite rodar o aplicativo para testes de interface
 * sem precisar do Visual Studio Build Tools instalado.
 */

let Impl = null;
let motor = null;

/* ---------------- 1) better-sqlite3 ---------------- */
/*
 * NAO basta o modulo carregar.
 *
 * O better-sqlite3 e um modulo NATIVO: o JavaScript dele carrega
 * sempre, mas so funciona se o binario .node correspondente tiver sido
 * compilado. Quando falta o binario, o require passa limpo e o erro so
 * estoura la adiante, no primeiro "new Database" - com uma mensagem
 * enorme sobre "bindings file", em plena tela do usuario.
 *
 * Foi o que aconteceu quando o npm passou a bloquear scripts de
 * instalacao por padrao: o pacote ficou instalado pela metade, o
 * require continuou funcionando e a escolha do motor apontou para um
 * driver que nao abria banco nenhum.
 *
 * Por isso a escolha e feita ABRINDO um banco de verdade. Se abrir,
 * serve; se nao, cai para o node:sqlite em silencio, que e o que o
 * usuario espera de uma alternativa.
 */
try {
  const Candidato = require('better-sqlite3');
  const prova = new Candidato(':memory:');
  prova.close();
  Impl = Candidato;
  motor = 'better-sqlite3';
} catch (err) {
  motor = null;
  if (process.env.CTRLOJA_DEBUG) console.log('[db] better-sqlite3 indisponível:', err.message);
}

/* ---------------- 2) node:sqlite ------------------- */
if (!Impl) {
  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (err) {
    throw new Error(
      'Nenhum driver SQLite disponível.\n' +
      'Instale as dependências com "npm install" ou use um Electron com Node 22+ ' +
      '(que possui o módulo node:sqlite embutido).\n' + err.message
    );
  }

  /*
   * O node:sqlite do Node 24 devolve cada linha com PROTOTIPO NULO -
   * objetos criados por Object.create(null), sem toString, sem
   * hasOwnProperty, sem nada herdado. Ate o Node 22 vinham objetos
   * comuns. Os dados sao os mesmos; o que mudou foi a natureza do
   * objeto, e isso quebra de maneiras pouco obvias:
   *
   *   `${linha}`            -> TypeError: Cannot convert object to primitive
   *   linha instanceof Object -> false
   *   linha.hasOwnProperty(...) -> nao existe
   *
   * O better-sqlite3 sempre devolveu objetos comuns. Como o CtrLoja
   * troca de motor conforme o que estiver disponivel, os dois lados
   * precisam entregar a MESMA coisa - senao o programa se comporta
   * diferente conforme a maquina, que e o pior tipo de defeito.
   *
   * A normalizacao acontece aqui, na fronteira com o banco, e nao
   * espalhada pelo codigo.
   */
  const comum = (linha) => (linha ? Object.assign({}, linha) : linha);
  const comuns = (linhas) => (Array.isArray(linhas) ? linhas.map(comum) : linhas);

  /** Adaptador com a mesma superfície de API do better-sqlite3 usada pelo CtrLoja. */
  class AdaptadorNodeSqlite {
    constructor(arquivo) {
      this.db = new DatabaseSync(arquivo);
      this.name = arquivo;
      this.open = true;
    }

    pragma(texto) {
      try { this.db.exec(`PRAGMA ${texto}`); } catch { /* pragmas opcionais */ }
    }

    exec(sql) {
      this.db.exec(sql);
      return this;
    }

    prepare(sql) {
      const st = this.db.prepare(sql);
      return {
        run: (...a) => st.run(...a),
        get: (...a) => comum(st.get(...a)),
        all: (...a) => comuns(st.all(...a))
      };
    }

    /** Transacao simples (sem savepoints aninhados - suficiente para o CtrLoja). */
    transaction(fn) {
      const db = this.db;
      return (...args) => {
        db.exec('BEGIN');
        try {
          const r = fn(...args);
          db.exec('COMMIT');
          return r;
        } catch (err) {
          try { db.exec('ROLLBACK'); } catch { /* ignora */ }
          throw err;
        }
      };
    }

    close() {
      try { this.db.close(); } catch { /* ignora */ }
      this.open = false;
    }
  }

  Impl = AdaptadorNodeSqlite;
  motor = 'node:sqlite';
}

module.exports = Impl;
module.exports.motorAtual = motor;
