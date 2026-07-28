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
} catch {
  console.log('[ctrloja] Modo interface: integração com o WhatsApp não instalada '
    + '(use "rodar.bat completo" para habilitar o envio real).');
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

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

/* ---------------- Listagem de grupos ---------------- */

/** Caminho 1: API normal da biblioteca. */
async function gruposViaApi() {
  const chats = await cliente.getChats();
  return chats
    .filter((c) => c.isGroup)
    .map((c) => ({
      id: c.id && c.id._serialized ? c.id._serialized : String(c.id),
      nome: c.name || '(sem nome)'
    }));
}

/**
 * Caminho 2: leitura direta do Store do WhatsApp Web.
 * Usado quando o getChats() falha por causa de mudancas internas do
 * WhatsApp (o erro tipico e uma mensagem minificada de uma letra so).
 */
async function gruposViaStore() {
  if (!cliente.pupPage) throw new Error('Página do WhatsApp Web indisponível.');
  return cliente.pupPage.evaluate(() => {
    const saida = [];
    const vistos = new Set();

    const registrar = (id, nome) => {
      if (!id || typeof id !== 'string' || !id.endsWith('@g.us')) return;
      if (vistos.has(id)) return;
      vistos.add(id);
      saida.push({ id, nome: nome || id });
    };

    const idDe = (obj) => {
      if (!obj) return null;
      if (typeof obj === 'string') return obj;
      if (obj._serialized) return obj._serialized;
      if (typeof obj.toString === 'function') return obj.toString();
      return null;
    };

    try {
      const store = window.Store || {};

      if (store.Chat && typeof store.Chat.getModelsArray === 'function') {
        for (const c of store.Chat.getModelsArray()) {
          registrar(idDe(c.id), c.formattedTitle || c.name || (c.contact && c.contact.name));
        }
      }

      if (store.GroupMetadata && typeof store.GroupMetadata.getModelsArray === 'function') {
        for (const g of store.GroupMetadata.getModelsArray()) {
          registrar(idDe(g.id), g.subject);
        }
      }
    } catch (e) {
      return { erro: e && e.message ? e.message : String(e) };
    }

    return saida;
  });
}

const descreverErro = (err) => {
  const m = (err && err.message ? err.message : String(err)).trim();
  // Mensagens minificadas do WhatsApp Web (ex.: "r", "Evaluation failed: r")
  if (m.length <= 3 || /^Evaluation failed:\s*\w{1,3}$/i.test(m)) {
    return `o WhatsApp Web recusou a consulta (código interno "${m}")`;
  }
  return m;
};

async function listarGrupos() {
  exigirPronto();

  const tentativas = [];
  let grupos = null;

  for (let i = 1; i <= 3 && !grupos; i++) {
    try {
      const r = await gruposViaApi();
      if (r && r.length) grupos = r;
      else if (r) tentativas.push(`tentativa ${i}: nenhuma conversa retornada`);
    } catch (err) {
      tentativas.push(`tentativa ${i} (API): ${descreverErro(err)}`);
      console.error('[whatsapp] getChats falhou:', err);
    }

    if (!grupos) {
      try {
        const r = await gruposViaStore();
        if (r && r.erro) tentativas.push(`tentativa ${i} (Store): ${r.erro}`);
        else if (r && r.length) grupos = r;
      } catch (err) {
        tentativas.push(`tentativa ${i} (Store): ${descreverErro(err)}`);
        console.error('[whatsapp] leitura do Store falhou:', err);
      }
    }

    if (!grupos && i < 3) {
      emitir('carregando', { message: `Sincronizando conversas… (tentativa ${i + 1} de 3)` });
      await dormir(4000);
    }
  }

  if (!grupos || !grupos.length) {
    const detalhe = tentativas.length ? `\n\nDetalhes: ${tentativas.join(' | ')}` : '';
    throw new Error(
      'Não foi possível ler a lista de grupos.\n\n' +
      'O que costuma resolver:\n' +
      '1) Abra o WhatsApp no celular e deixe-o com internet;\n' +
      '2) Envie ou receba uma mensagem em cada grupo desejado — grupos sem ' +
      'atividade recente podem não ter sido sincronizados ainda;\n' +
      '3) Aguarde 1 minuto e clique novamente em "Atualizar lista de grupos";\n' +
      '4) Se persistir, use Desconectar e conecte de novo pelo QR Code.' +
      detalhe
    );
  }

  grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  db.grupos.sincronizar(grupos);
  return db.grupos.listar();
}

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

/**
 * Envia uma mensagem de teste.
 * @param texto   conteudo (opcional)
 * @param destino 'eu' = envia para o proprio numero conectado (mais seguro)
 *                'grupos' = envia para os grupos selecionados
 */
async function enviarTeste(texto, destino = 'grupos') {
  exigirPronto();

  const msg = texto || (
    '✅ *CtrLoja* — mensagem de teste.\n\n' +
    'A integração com o WhatsApp está funcionando corretamente.\n\n' +
    '_A∴R∴L∴S∴ União Fraternal Rolandense nº 141_'
  );

  if (destino === 'eu') {
    const proprio = cliente.info?.wid?._serialized;
    if (!proprio) throw new Error('Não foi possível identificar o número conectado.');
    await enviarMensagem(proprio, msg);
    return { enviados: 1, destino: 'você mesmo' };
  }

  const destinos = db.grupos.selecionados().map((g) => g.wa_id);
  if (!destinos.length) throw new Error('Selecione ao menos um grupo antes de enviar o teste.');
  for (const d of destinos) {
    await enviarMensagem(d, msg);
    await dormir(1500);
  }
  return { enviados: destinos.length, destino: `${destinos.length} grupo(s)` };
}

module.exports = {
  configure, status, conectar, desconectar, destroy,
  listarGrupos, enviarFila, enviarTeste, enviarMensagem
};
