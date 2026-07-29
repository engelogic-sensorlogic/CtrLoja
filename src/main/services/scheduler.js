'use strict';

/**
 * Rotina diaria de disparo.
 *
 * Alem do horario agendado, a rotina:
 *   - recupera o disparo do dia quando o aplicativo e aberto depois da hora;
 *   - reexecuta assim que o WhatsApp fica pronto, se o envio ficou adiado;
 *   - confere periodicamente, para o caso de o computador ter ficado suspenso.
 */

const cron = require('node-cron');
const db = require('../db/database');
const agenda = require('./agenda');
const whatsapp = require('./whatsapp');
const cal = require('./calendario');

let tarefa = null;
let vigia = null;
let callbacks = { onFila: () => {}, onLog: () => {} };
let executando = false;

let situacao = {
  expressao: null,
  ultima_execucao: null,
  ultimo_resultado: null,
  adiado_por_whatsapp: false,
  proxima_descricao: null
};

const INTERVALO_VIGIA = 5 * 60 * 1000;   // 5 minutos

function log(msg) {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  console.log('[scheduler]', msg);
  try { callbacks.onLog(linha); } catch { /* ignora */ }
}

/* ------------------------------------------------------------------ */
/* Agendamento                                                         */
/* ------------------------------------------------------------------ */

function horaConfigurada() {
  const bruto = String(db.config.obter('disparo_hora', '07:30') || '07:30');
  const [h, m] = bruto.split(':').map((n) => parseInt(n, 10));
  return { h: isNaN(h) ? 7 : h, m: isNaN(m) ? 30 : m };
}

function diasHabilitados() {
  return String(db.config.obter('disparo_dias', '0,1,2,3,4,5,6'))
    .split(',').map((s) => s.trim()).filter((s) => s !== '');
}

function expressaoCron() {
  const { h, m } = horaConfigurada();
  const dias = diasHabilitados().join(',') || '*';
  return `${m} ${h} * * ${dias}`;
}

function hojeEhDiaHabilitado(d = new Date()) {
  const dias = diasHabilitados();
  if (!dias.length) return true;
  return dias.includes(String(d.getDay()));
}

function horarioJaPassou(d = new Date()) {
  const { h, m } = horaConfigurada();
  return (d.getHours() > h) || (d.getHours() === h && d.getMinutes() >= m);
}

/* ------------------------------------------------------------------ */
/* Execucao                                                            */
/* ------------------------------------------------------------------ */

/**
 * @param opts.origem  texto para o log (agendamento, arranque, manual...)
 * @param opts.forcar  ignora o registro de disparo do dia (reenvio manual)
 */
async function executar(opts = {}) {
  const origem = opts.origem || 'agendamento';

  if (executando) { log(`Rotina já em execução (${origem} ignorado).`); return { ignorado: 'em_execucao' }; }
  executando = true;

  try {
    const hoje = cal.hojeISO();
    const modo = db.config.obter('disparo_modo', 'revisao');
    situacao.ultima_execucao = new Date().toLocaleString('pt-BR');

    if (modo === 'manual' && !opts.forcar) {
      situacao.ultimo_resultado = 'Modo manual: rotina automática não executa.';
      log(situacao.ultimo_resultado);
      return { ignorado: 'modo_manual' };
    }

    if (db.envios.jaDisparado(hoje) && !opts.forcar) {
      situacao.ultimo_resultado = `Disparo de ${cal.formatarBR(hoje)} já realizado.`;
      situacao.adiado_por_whatsapp = false;
      log(situacao.ultimo_resultado);
      return { ignorado: 'ja_disparado' };
    }

    const fila = agenda.montarFila(hoje);
    if (!fila.total_selecionados) {
      situacao.ultimo_resultado = `Nenhum evento a comunicar em ${cal.formatarBR(hoje)}.`;
      situacao.adiado_por_whatsapp = false;
      log(situacao.ultimo_resultado);
      return { ignorado: 'sem_eventos' };
    }

    if (modo === 'revisao' && !opts.forcar) {
      situacao.ultimo_resultado = `${fila.total_selecionados} mensagem(ns) aguardando revisão.`;
      log(`${situacao.ultimo_resultado} (${origem})`);
      callbacks.onFila(fila);
      return { revisao: true, total: fila.total_selecionados };
    }

    // Modo 100% automatico (ou execucao manual forcada)
    const st = whatsapp.status();
    if (st.estado !== 'pronto') {
      situacao.adiado_por_whatsapp = true;
      situacao.ultimo_resultado = 'WhatsApp não conectado: disparo adiado, será refeito assim que conectar.';
      log(situacao.ultimo_resultado);

      // Tenta subir a conexao sozinho, se houver sessao gravada
      if (st.disponivel && st.estado === 'desconectado') {
        log('Tentando conectar o WhatsApp automaticamente…');
        whatsapp.conectar().catch((err) => log(`Falha ao conectar: ${err.message}`));
      }
      callbacks.onFila(fila);
      return { adiado: true, motivo: 'whatsapp_desconectado' };
    }

    if (!fila.grupos.length) {
      situacao.ultimo_resultado = 'Nenhum grupo de destino selecionado. Configure na aba WhatsApp.';
      log(situacao.ultimo_resultado);
      return { erro: 'sem_grupos' };
    }

    log(`Disparando ${fila.total_selecionados} mensagem(ns) para ${fila.grupos.length} grupo(s) — origem: ${origem}.`);

    const res = await whatsapp.enviarFila({
      data: hoje,
      itens: fila.itens.filter((i) => i.selecionado),
      mensagem_unica: fila.mensagem_unica,
      grupos: fila.grupos.map((g) => g.id)
    });

    situacao.adiado_por_whatsapp = false;
    situacao.ultimo_resultado = `Disparo concluído: ${res.enviados} enviada(s), ${res.falhas} falha(s).`;
    log(situacao.ultimo_resultado);
    return res;
  } catch (err) {
    situacao.ultimo_resultado = `Erro no disparo: ${err.message}`;
    log(situacao.ultimo_resultado);
    return { erro: err.message };
  } finally {
    executando = false;
  }
}

/**
 * Recuperacao: o aplicativo pode ter sido aberto depois do horario, ou o
 * computador pode ter ficado suspenso quando o cron deveria ter disparado.
 */
async function verificarPendencia(origem = 'verificação') {
  const modo = db.config.obter('disparo_modo', 'revisao');
  if (modo === 'manual') return;
  if (!hojeEhDiaHabilitado()) return;
  if (!horarioJaPassou()) return;
  if (db.envios.jaDisparado(cal.hojeISO())) return;
  await executar({ origem });
}

/** Chamado quando o WhatsApp fica pronto: refaz o disparo que ficou adiado. */
async function aoWhatsappPronto() {
  if (!situacao.adiado_por_whatsapp) return;
  log('WhatsApp conectado: retomando o disparo adiado.');
  await executar({ origem: 'reconexão do WhatsApp' });
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

function start(cbs = {}) {
  callbacks = { ...callbacks, ...cbs };
  reagendar();

  // Recuperacao no arranque, com folga para o WhatsApp conectar
  setTimeout(() => verificarPendencia('abertura do aplicativo').catch(() => {}), 20000);

  if (vigia) clearInterval(vigia);
  vigia = setInterval(() => verificarPendencia('verificação periódica').catch(() => {}), INTERVALO_VIGIA);
}

function reagendar() {
  if (tarefa) { tarefa.stop(); tarefa = null; }

  const exp = expressaoCron();
  situacao.expressao = exp;

  if (!cron.validate(exp)) {
    log(`Expressão de agendamento inválida: ${exp}`);
    situacao.proxima_descricao = 'agendamento inválido';
    return;
  }

  tarefa = cron.schedule(exp, () => { executar({ origem: 'agendamento' }).catch(() => {}); });

  const { h, m } = horaConfigurada();
  const modo = db.config.obter('disparo_modo', 'revisao');
  const rotuloModo = { revisao: 'com revisão prévia', automatico: '100% automático', manual: 'manual' }[modo] || modo;
  situacao.proxima_descricao = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} — modo ${rotuloModo}`;
  log(`Rotina diária agendada (${exp}) — modo ${rotuloModo}.`);
}

function stop() {
  if (tarefa) { tarefa.stop(); tarefa = null; }
  if (vigia) { clearInterval(vigia); vigia = null; }
}

function estadoRotina() {
  return {
    ...situacao,
    executando,
    modo: db.config.obter('disparo_modo', 'revisao'),
    hoje_habilitado: hojeEhDiaHabilitado(),
    horario_ja_passou: horarioJaPassou(),
    ja_disparado_hoje: db.envios.jaDisparado(cal.hojeISO())
  };
}

module.exports = {
  start, stop, reagendar, executar, verificarPendencia, aoWhatsappPronto,
  expressaoCron, estadoRotina
};
