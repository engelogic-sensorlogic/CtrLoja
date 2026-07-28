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
try {
  Impl = require('better-sqlite3');
  motor = 'better-sqlite3';
} catch { /* segue para o proximo */ }

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
        get: (...a) => st.get(...a),
        all: (...a) => st.all(...a)
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
