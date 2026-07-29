'use strict';

/**
 * Confere o conteudo do pacote gerado pelo electron-builder.
 *
 * Le o cabecalho do app.asar diretamente - sem depender de nenhuma
 * ferramenta externa, o que evita falso negativo quando a maquina esta
 * sem internet ou o "npx asar" nao consegue se instalar.
 *
 * Uso:
 *   node ferramentas/verificar-pacote.js [caminho\app.asar]
 *
 * Sai com codigo 1 se faltar algo essencial.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PADRAO = path.join(RAIZ, 'dist', 'win-unpacked', 'resources', 'app.asar');

/* ------------------------------------------------------------------ */

/**
 * Formato do asar: 4 inteiros de 32 bits e, em seguida, o cabecalho JSON
 * com a arvore completa de arquivos.
 */
function lerCabecalhoAsar(arquivo) {
  const fd = fs.openSync(arquivo, 'r');
  try {
    const cab = Buffer.alloc(16);
    fs.readSync(fd, cab, 0, 16, 0);

    const tamanhoJson = cab.readUInt32LE(12);
    if (!tamanhoJson || tamanhoJson > 200 * 1024 * 1024) {
      throw new Error('cabeçalho do asar em formato inesperado');
    }

    const buf = Buffer.alloc(tamanhoJson);
    fs.readSync(fd, buf, 0, tamanhoJson, 16);
    return JSON.parse(buf.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

/** Caminha na arvore do asar: existe('node_modules/baileys') */
function existe(arvore, caminho) {
  let no = arvore;
  for (const parte of caminho.split('/')) {
    if (!no || !no.files || !no.files[parte]) return false;
    no = no.files[parte];
  }
  return true;
}

function contar(no) {
  if (!no || !no.files) return 1;
  return Object.values(no.files).reduce((n, f) => n + contar(f), 0);
}

/* ------------------------------------------------------------------ */

const alvo = process.argv[2] || PADRAO;

console.log('\n===================================================================');
console.log('  CtrLoja - Verificacao do pacote gerado');
console.log('===================================================================\n');

if (!fs.existsSync(alvo)) {
  console.error(`[ERRO] Pacote nao encontrado: ${alvo}`);
  process.exit(1);
}

let arvore;
try {
  arvore = lerCabecalhoAsar(alvo);
} catch (err) {
  console.error(`[ERRO] Nao foi possivel ler o pacote: ${err.message}`);
  process.exit(1);
}

console.log(`Pacote : ${alvo}`);
console.log(`Tamanho: ${(fs.statSync(alvo).size / 1024 / 1024).toFixed(1)} MB`);
console.log(`Arquivos: ${contar(arvore)}\n`);

const OBRIGATORIOS = [
  ['node_modules/baileys', 'Integracao com o WhatsApp (Baileys)'],
  ['node_modules/qrcode', 'Geracao do QR Code'],
  ['node_modules/node-cron', 'Agendador da rotina de disparo'],
  ['src/main/main.js', 'Processo principal'],
  ['src/main/preload.js', 'Ponte com a interface'],
  ['src/main/db/schema.sql', 'Esquema do banco de dados'],
  ['src/main/db/templates-padrao.js', 'Modelos de mensagem'],
  ['src/main/db/datas-padrao.js', 'Calendario permanente'],
  ['src/main/services/whatsapp.js', 'Servico do WhatsApp'],
  ['src/main/services/scheduler.js', 'Rotina de disparo'],
  ['src/renderer/index.html', 'Interface'],
  ['src/renderer/js/sessoes.js', 'Agenda da Loja']
];

let faltando = 0;
for (const [caminho, descricao] of OBRIGATORIOS) {
  const ok = existe(arvore, caminho);
  if (!ok) faltando += 1;
  console.log(`  ${ok ? 'OK  ' : 'FALTA'}  ${descricao.padEnd(38)} ${caminho}`);
}

console.log('');

if (faltando) {
  console.error(`[ERRO] ${faltando} item(ns) essencial(is) fora do pacote.\n`);
  process.exit(1);
}

console.log('Pacote completo: aplicativo, banco e integracao com o WhatsApp.\n');
process.exit(0);
