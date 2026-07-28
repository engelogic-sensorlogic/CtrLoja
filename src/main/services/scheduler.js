'use strict';

const cron = require('node-cron');
const db = require('../db/database');
const agenda = require('./agenda');
const whatsapp = require('./whatsapp');
const cal = require('./calendario');

let tarefa = null;
let callbacks = { onFila: () => {}, onLog: () => {} };

function log(msg) {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  console.log('[scheduler]', msg);
  try { callbacks.onLog(linha); } catch { /* ignora */ }
}

function expressaoCron() {
  const hora = db.config.obter('disparo_hora', '07:30');
  const [h, m] = String(hora).split(':').map((n) => parseInt(n, 10));
  const dias = String(db.config.obter('disparo_dias', '0,1,2,3,4,5,6'))
    .split(',').map((s) => s.trim()).filter(Boolean).join(',') || '*';
  return `${isNaN(m) ? 30 : m} ${isNaN(h) ? 7 : h} * * ${dias}`;
}

async function executar() {
  const hoje = cal.hojeISO();
  const modo = db.config.obter('disparo_modo', 'revisao');

  if (modo === 'manual') { log('Modo manual: rotina automática ignorada.'); return; }

  const fila = agenda.montarFila(hoje);
  if (!fila.total_selecionados) { log(`Nenhum evento a comunicar em ${cal.formatarBR(hoje)}.`); return; }

  if (db.envios.jaDisparado(hoje)) { log(`Disparo de ${cal.formatarBR(hoje)} já executado. Ignorando.`); return; }

  if (modo === 'revisao') {
    log(`${fila.total_selecionados} evento(s) aguardando revisão para ${cal.formatarBR(hoje)}.`);
    callbacks.onFila(fila);
    return;
  }

  // modo automatico
  try {
    const st = whatsapp.status();
    if (st.estado !== 'pronto') {
      log('WhatsApp não está conectado. Disparo automático adiado.');
      callbacks.onFila(fila);
      return;
    }
    const res = await whatsapp.enviarFila({
      data: hoje,
      itens: fila.itens.filter((i) => i.selecionado),
      mensagem_unica: fila.mensagem_unica,
      grupos: fila.grupos.map((g) => g.id)
    });
    log(`Disparo automático concluído: ${res.enviados} enviada(s), ${res.falhas} falha(s).`);
  } catch (err) {
    log(`Erro no disparo automático: ${err.message}`);
  }
}

function start(cbs = {}) {
  callbacks = { ...callbacks, ...cbs };
  reagendar();
}

function reagendar() {
  stop();
  const exp = expressaoCron();
  if (!cron.validate(exp)) { log(`Expressão de agendamento inválida: ${exp}`); return; }
  tarefa = cron.schedule(exp, executar, { timezone: 'America/Sao_Paulo' });
  log(`Rotina diária agendada (${exp}).`);
}

function stop() {
  if (tarefa) { tarefa.stop(); tarefa = null; }
}

module.exports = { start, stop, reagendar, executar, expressaoCron };
