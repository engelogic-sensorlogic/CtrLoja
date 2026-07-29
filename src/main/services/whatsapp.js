'use strict';

/**
 * Integracao com o WhatsApp via Baileys.
 *
 * Por que Baileys e nao a API oficial:
 *   a WhatsApp Cloud API (oficial, da Meta) NAO permite enviar mensagens para
 *   GRUPOS - apenas para contatos individuais que iniciaram a conversa. Como o
 *   CtrLoja precisa publicar nos grupos da Loja, usamos o protocolo multi-device.
 *
 * Por que Baileys e nao whatsapp-web.js:
 *   o whatsapp-web.js automatiza a pagina web dentro de um Chrome controlado.
 *   Alem de pesado (puppeteer + Chromium), quebra a cada mudanca interna do
 *   WhatsApp Web. O Baileys fala o protocolo direto por WebSocket: sem
 *   navegador, sem pagina, arranque rapido e muito mais estavel.
 *
 * A sessao (credenciais) fica em disco; o QR Code e lido uma unica vez.
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Carregamento tardio das bibliotecas                                 */
/* ------------------------------------------------------------------ */

let BLY = null;      // modulo Baileys
let QRCode = null;

const INSTALADO = (() => {
  try {
    require.resolve('baileys');
    return true;
  } catch {
    console.log('[ctrloja] Biblioteca "baileys" ausente: execute "npm install" '
      + 'na pasta do aplicativo para habilitar o envio pelo WhatsApp.');
    return false;
  }
})();

/** Baileys 7 e um modulo ESM: precisa de import() dinamico a partir do CommonJS. */
async function carregarBiblioteca() {
  if (BLY) return BLY;
  if (!INSTALADO) {
    throw new Error('Biblioteca "baileys" não instalada. Execute "rodar-completo.bat" na pasta do aplicativo.');
  }
  const t0 = Date.now();
  BLY = await import('baileys');
  QRCode = require('qrcode');
  console.log(`[whatsapp] Baileys carregado em ${Date.now() - t0} ms.`);
  return BLY;
}

/** Logger silencioso no formato esperado pelo Baileys. */
function criarLogger() {
  const vazio = () => {};
  const base = {
    level: 'silent',
    trace: vazio, debug: vazio, info: vazio, warn: vazio, error: vazio, fatal: vazio
  };
  base.child = () => base;
  return base;
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

let sock = null;
let opcoes = { sessionPath: null, onEvent: () => {} };
let estado = 'desconectado';   // desconectado | iniciando | qr | conectando | pronto | erro
let ultimoQr = null;
let infoConta = null;
let ultimoErro = null;
let enviando = false;
let progresso = null;
let conectando = false;
let encerrandoDeProposito = false;
let tentativasReconexao = 0;

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
    progresso,
    disponivel: INSTALADO,
    motor: 'baileys'
  };
}

/* ------------------------------------------------------------------ */
/* Conexao                                                             */
/* ------------------------------------------------------------------ */

async function encerrarSocket() {
  const antigo = sock;
  sock = null;
  infoConta = null;
  ultimoQr = null;
  progresso = null;
  if (!antigo) return;
  encerrandoDeProposito = true;
  try {
    antigo.ev.removeAllListeners?.('connection.update');
    antigo.ev.removeAllListeners?.('creds.update');
  } catch { /* ignora */ }
  try {
    antigo.end?.(new Error('Encerrado pelo CtrLoja'));
  } catch { /* ignora */ }
  await dormir(300);
  encerrandoDeProposito = false;
}

/**
 * @param opts.reiniciar   derruba a conexao atual antes de abrir outra
 * @param opts.silencioso  nao troca o estado para "iniciando" (uso interno)
 */
async function conectar(opts = {}) {
  const bly = await carregarBiblioteca();

  if (sock && !opts.reiniciar) return status();
  if (conectando && !opts.reiniciar) return status();

  if (sock) {
    setEstado('iniciando');
    emitir('carregando', { message: 'Encerrando a conexão anterior…' });
    await encerrarSocket();
  }

  conectando = true;
  ultimoErro = null;
  progresso = null;
  if (!opts.silencioso) setEstado('iniciando');

  try {
    fs.mkdirSync(opcoes.sessionPath, { recursive: true });

    const { state, saveCreds } = await bly.useMultiFileAuthState(
      path.join(opcoes.sessionPath, 'credenciais')
    );

    let versao;
    try {
      ({ version: versao } = await bly.fetchLatestBaileysVersion());
    } catch {
      versao = undefined;   // Baileys usa a versao embutida
    }

    const logger = criarLogger();

    sock = bly.makeWASocket({
      version: versao,
      auth: {
        creds: state.creds,
        keys: bly.makeCacheableSignalKeyStore(state.keys, logger)
      },
      logger,
      browser: bly.Browsers.appropriate('CtrLoja'),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false
    });

    const meuSock = sock;
    const atual = () => sock === meuSock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
      if (!atual()) return;
      const { connection, lastDisconnect, qr } = u;

      if (qr) {
        try {
          ultimoQr = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
        } catch {
          ultimoQr = null;
        }
        setEstado('qr', { qr: ultimoQr });
      }

      if (connection === 'connecting') {
        progresso = { message: 'Negociando conexão com o WhatsApp…' };
        if (estado !== 'qr') setEstado('conectando');
      }

      if (connection === 'open') {
        tentativasReconexao = 0;
        ultimoQr = null;
        progresso = null;
        const eu = sock.user || {};
        const numero = String(eu.id || '').split(':')[0].split('@')[0];
        infoConta = { numero, nome: eu.name || eu.notify || '' };
        setEstado('pronto', { conta: infoConta });
      }

      if (connection === 'close') {
        const codigo = lastDisconnect?.error?.output?.statusCode;
        const RAZAO = bly.DisconnectReason;

        if (encerrandoDeProposito) return;

        if (codigo === RAZAO.loggedOut || codigo === RAZAO.forbidden) {
          sock = null;
          infoConta = null;
          ultimoErro = 'A sessão foi encerrada no celular. Use "Limpar sessão e reconectar" e leia o QR Code novamente.';
          setEstado('desconectado', { erro: ultimoErro });
          return;
        }

        // Reconexao automatica com espera progressiva
        if (tentativasReconexao < 5) {
          tentativasReconexao += 1;
          const espera = Math.min(2000 * tentativasReconexao, 10000);
          progresso = { message: `Reconectando… (tentativa ${tentativasReconexao} de 5)` };
          setEstado('conectando');
          sock = null;
          await dormir(espera);
          conectar({ reiniciar: false, silencioso: true }).catch(() => {});
        } else {
          sock = null;
          ultimoErro = 'Não foi possível manter a conexão com o WhatsApp após 5 tentativas. '
            + 'Verifique a internet do computador e do celular e use "Reiniciar conexão".';
          setEstado('erro', { erro: ultimoErro });
        }
      }
    });
  } catch (err) {
    sock = null;
    ultimoErro = err.message || String(err);
    setEstado('erro', { erro: ultimoErro });
  } finally {
    conectando = false;
  }

  return status();
}

async function reiniciar() {
  tentativasReconexao = 0;
  return conectar({ reiniciar: true });
}

/** Encerra a sessao no WhatsApp (exige novo QR Code na proxima conexao). */
async function desconectar() {
  if (sock) {
    try { await Promise.race([sock.logout(), dormir(8000)]); } catch { /* ignora */ }
  }
  await encerrarSocket();
  setEstado('desconectado');
  return status();
}

/** Apaga as credenciais gravadas - a proxima conexao pedira o QR Code. */
async function limparSessao() {
  await encerrarSocket();
  try {
    fs.rmSync(opcoes.sessionPath, { recursive: true, force: true });
    fs.mkdirSync(opcoes.sessionPath, { recursive: true });
  } catch (err) {
    throw new Error(`Não foi possível apagar a sessão: ${err.message}`);
  }
  ultimoErro = null;
  tentativasReconexao = 0;
  setEstado('desconectado');
  return status();
}

async function destroy() {
  await encerrarSocket();
}

function exigirPronto() {
  if (!sock || estado !== 'pronto') {
    throw new Error('WhatsApp não conectado. Abra a aba WhatsApp e leia o QR Code.');
  }
}

/* ------------------------------------------------------------------ */
/* Diagnostico                                                         */
/* ------------------------------------------------------------------ */

async function diagnostico() {
  let versaoLib = null;
  try { versaoLib = require('baileys/package.json').version; } catch { /* ignora */ }

  let credenciais = false;
  try {
    credenciais = fs.existsSync(path.join(opcoes.sessionPath, 'credenciais', 'creds.json'));
  } catch { /* ignora */ }

  return {
    estado,
    conta: infoConta,
    temCliente: !!sock,
    motor: 'Baileys (protocolo multi-device, sem navegador)',
    versaoBiblioteca: versaoLib,
    sessao: opcoes.sessionPath,
    credenciaisGravadas: credenciais,
    erro: ultimoErro
  };
}

/* ------------------------------------------------------------------ */
/* Grupos                                                              */
/* ------------------------------------------------------------------ */

async function listarGrupos() {
  exigirPronto();

  let mapa;
  try {
    mapa = await sock.groupFetchAllParticipating();
  } catch (err) {
    throw new Error(
      'Não foi possível ler a lista de grupos.\n\n'
      + `Detalhe técnico: ${err.message || err}\n\n`
      + 'Verifique se o celular está com internet e tente novamente em alguns segundos.'
    );
  }

  const grupos = Object.values(mapa || {})
    .map((g) => ({
      id: g.id,
      nome: g.subject || '(sem nome)'
    }))
    .filter((g) => g.id);

  if (!grupos.length) {
    throw new Error(
      'Nenhum grupo encontrado nesta conta.\n\n'
      + 'Confirme que o número conectado (+' + (infoConta?.numero || '') + ') participa de algum grupo. '
      + 'Se você acabou de criar o grupo de testes, aguarde alguns segundos e tente novamente.'
    );
  }

  grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  db.grupos.sincronizar(grupos);
  return db.grupos.listar();
}

/* ------------------------------------------------------------------ */
/* Envio                                                               */
/* ------------------------------------------------------------------ */

async function enviarMensagem(jid, texto) {
  exigirPronto();
  await sock.sendMessage(jid, { text: texto });
}

/**
 * Envia a fila revisada.
 * payload = { data, itens: [{id, tipo, nome, mensagem}], grupos: [jid], mensagem_unica }
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
 * @param destino 'eu' = envia para o proprio numero (mais seguro para testes)
 *                'grupos' = envia para os grupos selecionados
 */
async function enviarTeste(texto, destino = 'grupos') {
  exigirPronto();

  const msg = texto || (
    '✅ *CtrLoja* — mensagem de teste.\n\n'
    + 'A integração com o WhatsApp está funcionando corretamente.\n\n'
    + '_A∴R∴L∴S∴ União Fraternal Rolandense nº 141_'
  );

  if (destino === 'eu') {
    const numero = infoConta?.numero;
    if (!numero) throw new Error('Não foi possível identificar o número conectado.');
    await enviarMensagem(`${numero}@s.whatsapp.net`, msg);
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
  configure, status, conectar, reiniciar, desconectar, limparSessao, destroy,
  listarGrupos, enviarFila, enviarTeste, enviarMensagem, diagnostico
};
