'use strict';

/**
 * Integracao com o WhatsApp via whatsapp-web.js.
 *
 * IMPORTANTE: a API oficial (WhatsApp Cloud API) nao permite enviar mensagens
 * para GRUPOS. Por isso o CtrLoja utiliza a automacao do WhatsApp Web, com
 * sessao persistente em disco (LocalAuth) - o QR Code e lido uma unica vez.
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/database');

let Client = null;
let LocalAuth = null;
let QRCode = null;

try {
  ({ Client, LocalAuth } = require('whatsapp-web.js'));
  QRCode = require('qrcode');
} catch (err) {
  console.warn('[whatsapp] Dependencias ainda nao instaladas:', err.message);
}

let cliente = null;
let opcoes = { sessionPath: null, onEvent: () => {} };
let estado = 'desconectado';   // desconectado | iniciando | qr | autenticado | pronto | erro
let ultimoQr = null;
let infoConta = null;
let ultimoErro = null;
let enviando = false;

/* ------------------------------------------------------------------ */

function configure(cfg) {
  opcoes = { ...opcoes, ...cfg };
}

function emitir(tipo, dados = {}) {
  try {
    opcoes.onEvent({ tipo, estado, ...dados });
  } catch { /* ignora */ }
}

function setEstado(novo, dados = {}) {
  estado = novo;
  emitir('estado', dados);
}

function status() {
  return {
    estado,
    qr: ultimoQr,
    conta: infoConta,
    erro: ultimoErro,
    enviando,
    disponivel: !!Client
  };
}

function localizarChrome() {
  const cfgPath = db.config.obter('chrome_path', '');
  if (cfgPath && fs.existsSync(cfgPath)) return cfgPath;
  const candidatos = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return candidatos.find((p) => fs.existsSync(p)) || undefined;
}

/* ------------------------------------------------------------------ */

async function conectar() {
  if (!Client) throw new Error('Biblioteca whatsapp-web.js não instalada. Execute "npm install" na pasta do aplicativo.');
  if (cliente) return status();

  fs.mkdirSync(opcoes.sessionPath, { recursive: true });
  ultimoErro = null;
  setEstado('iniciando');

  cliente = new Client({
    authStrategy: new LocalAuth({ clientId: 'ctrloja', dataPath: opcoes.sessionPath }),
    puppeteer: {
      headless: true,
      executablePath: localizarChrome(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    }
  });

  cliente.on('qr', async (qr) => {
    try {
      ultimoQr = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
    } catch {
      ultimoQr = null;
    }
    setEstado('qr', { qr: ultimoQr });
  });

  cliente.on('loading_screen', (percent, message) => emitir('carregando', { percent, message }));

  cliente.on('authenticated', () => {
    ultimoQr = null;
    setEstado('autenticado');
  });

  cliente.on('auth_failure', (msg) => {
    ultimoErro = `Falha de autenticação: ${msg}`;
    setEstado('erro', { erro: ultimoErro });
  });

  cliente.on('ready', async () => {
    ultimoQr = null;
    try {
      infoConta = {
        numero: cliente.info?.wid?.user || '',
        nome: cliente.info?.pushname || ''
      };
    } catch { infoConta = null; }
    setEstado('pronto', { conta: infoConta });
  });

  cliente.on('disconnected', (motivo) => {
    infoConta = null;
    cliente = null;
    setEstado('desconectado', { motivo });
  });

  cliente.initialize().catch((err) => {
    ultimoErro = err.message || String(err);
    cliente = null;
    setEstado('erro', { erro: ultimoErro });
  });

  return status();
}

async function desconectar() {
  if (!cliente) { setEstado('desconectado'); return status(); }
  try { await cliente.logout(); } catch { /* ignora */ }
  try { await cliente.destroy(); } catch { /* ignora */ }
  cliente = null;
  infoConta = null;
  ultimoQr = null;
  setEstado('desconectado');
  return status();
}

async function destroy() {
  if (!cliente) return;
  try { await cliente.destroy(); } catch { /* ignora */ }
  cliente = null;
}

function exigirPronto() {
  if (!cliente || estado !== 'pronto') {
    throw new Error('WhatsApp não conectado. Abra a aba WhatsApp e leia o QR Code.');
  }
}

/* ------------------------------------------------------------------ */

async function listarGrupos() {
  exigirPronto();
  const chats = await cliente.getChats();
  const grupos = chats
    .filter((c) => c.isGroup)
    .map((c) => ({ id: c.id._serialized, nome: c.name || '(sem nome)' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  db.grupos.sincronizar(grupos);
  return db.grupos.listar();
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function enviarMensagem(waId, texto) {
  exigirPronto();
  await cliente.sendMessage(waId, texto);
}

/**
 * Envia a fila revisada.
 * payload = { data, itens: [{id, tipo, nome, mensagem}], grupos: [waId], mensagem_unica }
 */
async function enviarFila(payload = {}) {
  exigirPronto();
  if (enviando) throw new Error('Já existe um envio em andamento.');

  const destinos = (payload.grupos && payload.grupos.length)
    ? payload.grupos
    : db.grupos.selecionados().map((g) => g.wa_id);

  if (!destinos.length) throw new Error('Nenhum grupo selecionado para envio.');

  const nomePorId = Object.fromEntries(db.grupos.listar().map((g) => [g.wa_id, g.nome]));
  const intervalo = Number(db.config.obter('intervalo_envio_ms', '4000')) || 4000;
  const dataRef = payload.data || null;

  const mensagens = payload.mensagem_unica
    ? [{ id: 'resumo', tipo: 'resumo_diario', nome: 'Resumo do dia', mensagem: payload.mensagem_unica }]
    : (payload.itens || []).filter((i) => i.mensagem && i.mensagem.trim());

  if (!mensagens.length) throw new Error('Nenhuma mensagem selecionada para envio.');

  enviando = true;
  emitir('envio-inicio', { total: mensagens.length * destinos.length });

  let enviados = 0;
  let falhas = 0;

  try {
    for (const msg of mensagens) {
      for (const destino of destinos) {
        try {
          await enviarMensagem(destino, msg.mensagem);
          enviados += 1;
          db.envios.registrar({
            data_ref: dataRef,
            evento_tipo: msg.tipo,
            evento_titulo: msg.nome || msg.evento || '',
            destino_id: destino,
            destino_nome: nomePorId[destino] || destino,
            mensagem: msg.mensagem,
            status: 'enviado'
          });
          emitir('envio-progresso', { enviados, falhas, destino: nomePorId[destino] || destino, titulo: msg.nome });
        } catch (err) {
          falhas += 1;
          db.envios.registrar({
            data_ref: dataRef,
            evento_tipo: msg.tipo,
            evento_titulo: msg.nome || msg.evento || '',
            destino_id: destino,
            destino_nome: nomePorId[destino] || destino,
            mensagem: msg.mensagem,
            status: 'erro',
            erro: err.message || String(err)
          });
          emitir('envio-progresso', { enviados, falhas, erro: err.message });
        }
        await dormir(intervalo);
      }
    }
  } finally {
    enviando = false;
  }

  if (dataRef) db.envios.marcarDisparo(dataRef, mensagens.length, enviados);
  emitir('envio-fim', { enviados, falhas });
  return { enviados, falhas, destinos: destinos.length };
}

async function enviarTeste(texto) {
  exigirPronto();
  const destinos = db.grupos.selecionados().map((g) => g.wa_id);
  if (!destinos.length) throw new Error('Selecione ao menos um grupo antes de enviar o teste.');
  const msg = texto || '✅ *CtrLoja* — mensagem de teste. A integração com o WhatsApp está funcionando.';
  for (const d of destinos) {
    await enviarMensagem(d, msg);
    await dormir(1500);
  }
  return { enviados: destinos.length };
}

module.exports = {
  configure, status, conectar, desconectar, destroy,
  listarGrupos, enviarFila, enviarTeste, enviarMensagem
};
