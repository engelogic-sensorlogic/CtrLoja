'use strict';

/**
 * Exportacao / importacao do banco de dados.
 *
 * O arquivo .ctrloja e um JSON com todas as tabelas - formato portatil,
 * legivel e independente da versao do SQLite, ideal para levar os dados
 * para outra instalacao do CtrLoja.
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const TABELAS = ['obreiros', 'familiares', 'datas_calendario', 'templates', 'grupos', 'config', 'envios_log'];
const FORMATO = 'ctrloja-backup';
const VERSAO = 1;

function exportar(destino) {
  const conn = db.getConn();
  const dados = {};
  for (const t of TABELAS) dados[t] = conn.prepare(`SELECT * FROM ${t}`).all();

  const pacote = {
    formato: FORMATO,
    versao: VERSAO,
    gerado_em: new Date().toISOString(),
    aplicacao: 'CtrLoja',
    resumo: Object.fromEntries(TABELAS.map((t) => [t, dados[t].length])),
    dados
  };

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(pacote, null, 2), 'utf8');
  return { arquivo: destino, resumo: pacote.resumo };
}

/**
 * @param modo 'substituir' apaga os dados atuais; 'mesclar' preserva o que existe.
 */
function importar(origem, modo = 'substituir') {
  const bruto = fs.readFileSync(origem, 'utf8');
  let pacote;
  try {
    pacote = JSON.parse(bruto);
  } catch {
    throw new Error('Arquivo inválido: não é um backup do CtrLoja (.ctrloja).');
  }
  if (pacote.formato !== FORMATO) throw new Error('Arquivo inválido: formato não reconhecido.');

  const conn = db.getConn();
  const dados = pacote.dados || {};
  const resumo = {};

  const tx = conn.transaction(() => {
    if (modo === 'substituir') {
      conn.prepare('DELETE FROM familiares').run();
      conn.prepare('DELETE FROM obreiros').run();
      conn.prepare('DELETE FROM datas_calendario').run();
      conn.prepare('DELETE FROM grupos').run();
    }

    for (const tabela of TABELAS) {
      const linhas = dados[tabela] || [];
      if (!linhas.length) { resumo[tabela] = 0; continue; }

      const colunas = conn.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
      let inseridos = 0;

      for (const linha of linhas) {
        const cols = colunas.filter((c) => c in linha);
        if (!cols.length) continue;
        const marc = cols.map(() => '?').join(', ');
        const valores = cols.map((c) => linha[c]);
        const verbo = modo === 'mesclar' ? 'INSERT OR IGNORE' : 'INSERT OR REPLACE';
        try {
          conn.prepare(`${verbo} INTO ${tabela} (${cols.join(', ')}) VALUES (${marc})`).run(...valores);
          inseridos += 1;
        } catch (err) {
          console.warn(`[backup] ${tabela}:`, err.message);
        }
      }
      resumo[tabela] = inseridos;
    }
  });

  tx();
  db.config.invalidarCache();
  return { arquivo: origem, modo, resumo, gerado_em: pacote.gerado_em };
}

module.exports = { exportar, importar, TABELAS };
