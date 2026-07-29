'use strict';

/**
 * Rotina diaria de disparo.
 *
 * Alem do horario agendado, a rotina:
 *   - recupera o disparo do dia quando o aplicativo e aberto depois da hora;
 *   - reexecuta assim que o WhatsApp fica pronto, se o envio ficou adiado;
 *   - confere periodicamente, para o caso de o computador ter ficado suspenso.
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const db = require('../db/database');
const agenda = require('./agenda');
const whatsapp = require('./whatsapp');
const cal = require('./calendario');

let tarefa = null;
let vigia = null;
let callbacks = { onFila: () => {}, onLog: () => {} };
let executando = false;
let arquivoLog = null;
const memoriaLog = [];

let situacao = {
  expressao: null,
  ultima_execucao: null,
  ultimo_resultado: null,
  adiado_por_whatsapp: false,
  proxima_descricao: null
};

const INTERVALO_VIGIA = 5 * 60 * 1000;   // 5 minutos

/**
 * Registro da rotina.
 *
 * O disparo acontece sem ninguem olhando; sem um registro em arquivo nao ha
 * como saber depois por que uma mensagem saiu - ou por que nao saiu.
 */
function configurarLog(pastaUserData) {
  try {
    const pasta = path.join(pastaUserData, 'logs');
    fs.mkdirSync(pasta, { recursive: true });
    arquivoLog = path.join(pasta, 'rotina.log');

    // Evita crescimento indefinido: acima de 1 MB, mantem so o final
    if (fs.existsSync(arquivoLog) && fs.statSync(arquivoLog).size > 1024 * 1024) {
      const texto = fs.readFileSync(arquivoLog, 'utf8');
      fs.writeFileSync(arquivoLog, texto.slice(-200 * 1024), 'utf8');
    }
  } catch (err) {
    console.warn('[scheduler] não foi possível preparar o registro:', err.message);
  }
}

function log(msg) {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  console.log('[scheduler]', msg);

  memoriaLog.push(linha);
  if (memoriaLog.length > 400) memoriaLog.shift();

  if (arquivoLog) {
    try { fs.appendFileSync(arquivoLog, linha + '\n', 'utf8'); } catch { /* ignora */ }
  }
  try { callbacks.onLog(linha); } catch { /* ignora */ }
}

function lerLog(limite = 200) {
  if (arquivoLog && fs.existsSync(arquivoLog)) {
    try {
      const linhas = fs.readFileSync(arquivoLog, 'utf8').split('\n').filter(Boolean);
      return { arquivo: arquivoLog, linhas: linhas.slice(-limite) };
    } catch { /* cai para a memoria */ }
  }
  return { arquivo: arquivoLog, linhas: memoriaLog.slice(-limite) };
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
    const paraEnviar = fila.total_para_envio !== undefined ? fila.total_para_envio : fila.total_selecionados;

    if (!paraEnviar) {
      situacao.ultimo_resultado = (fila.agrupar && fila.total_selecionados)
        ? `Modo agrupado: nenhum evento com conteúdo próprio em ${cal.formatarBR(hoje)}. Nada foi enviado.`
        : `Nenhum evento a comunicar em ${cal.formatarBR(hoje)}.`;
      situacao.adiado_por_whatsapp = false;
      log(situacao.ultimo_resultado);
      return { ignorado: 'sem_eventos' };
    }

    if (modo === 'revisao' && !opts.forcar) {
      situacao.ultimo_resultado = `${paraEnviar} mensagem(ns) aguardando revisão.`;
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

    log(`Disparando ${paraEnviar} mensagem(ns)${fila.agrupar ? ' (modo agrupado)' : ''} `
      + `para ${fila.grupos.length} grupo(s) — origem: ${origem}.`);

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
async function verificarPendencia(origem = 'verificação', silencioso = true) {
  const modo = db.config.obter('disparo_modo', 'revisao');
  const { h, m } = horaConfigurada();
  const horario = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const recusar = (motivo) => {
    if (!silencioso) log(`Verificação (${origem}): ${motivo}`);
    return { executou: false, motivo };
  };

  if (modo === 'manual') return recusar('modo manual — a rotina não dispara sozinha.');
  if (!hojeEhDiaHabilitado()) return recusar('hoje não é um dia habilitado nas configurações.');
  if (!horarioJaPassou()) return recusar(`ainda não são ${horario} — aguardando o horário.`);
  if (db.envios.jaDisparado(cal.hojeISO())) return recusar('o disparo de hoje já foi realizado.');

  await executar({ origem });
  return { executou: true };
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
  if (cbs.userData) configurarLog(cbs.userData);

  log('===== CtrLoja iniciado =====');
  reagendar();

  // Recuperacao no arranque, com folga para o WhatsApp conectar
  setTimeout(() => verificarPendencia('abertura do aplicativo', false).catch(() => {}), 25000);

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

/**
 * Checklist do disparo, sem enviar nada.
 * Responde objetivamente: o que falta para a rotina automatica funcionar?
 */
function diagnosticoDisparo() {
  const hoje = cal.hojeISO();
  const modo = db.config.obter('disparo_modo', 'revisao');
  const { h, m } = horaConfigurada();
  const horario = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const st = whatsapp.status();
  const grupos = db.grupos.selecionados();

  let fila = { total: 0, total_selecionados: 0, itens: [] };
  try { fila = agenda.montarFila(hoje); } catch { /* ignora */ }

  const bloqueadosPorTipo = fila.itens.filter(
    (i) => !i.selecionado && /desativado nas configurações/i.test(i.motivo_bloqueio || '')
  ).length;

  const itens = [
    {
      chave: 'modo',
      rotulo: 'Modo de disparo gravado',
      ok: modo === 'automatico',
      valor: { revisao: 'Automático com revisão prévia', automatico: '100% automático', manual: 'Somente manual' }[modo] || modo,
      dica: modo === 'automatico'
        ? null
        : 'Selecione "100% automático" em Configurações e clique em SALVAR CONFIGURAÇÕES. Sem salvar, a escolha não vale.'
    },
    {
      chave: 'dia',
      rotulo: 'Hoje é dia habilitado',
      ok: hojeEhDiaHabilitado(),
      valor: hojeEhDiaHabilitado() ? 'sim' : 'não',
      dica: hojeEhDiaHabilitado() ? null : 'Marque o dia da semana em "Dias da semana em que a rotina roda".'
    },
    {
      chave: 'horario',
      rotulo: 'Horário programado',
      ok: true,
      valor: `${horario} — ${horarioJaPassou() ? 'já passou hoje' : 'ainda não chegou'}`,
      dica: null
    },
    {
      chave: 'whatsapp',
      rotulo: 'WhatsApp conectado',
      ok: st.estado === 'pronto',
      valor: st.estado,
      dica: st.estado === 'pronto' ? null : 'Conecte na aba WhatsApp. O modo automático exige a conexão ativa no horário.'
    },
    {
      chave: 'grupos',
      rotulo: 'Grupos de destino salvos',
      ok: grupos.length > 0,
      valor: grupos.length ? grupos.map((g) => g.nome).join(', ') : 'nenhum',
      dica: grupos.length ? null : 'Na aba WhatsApp, marque os grupos e clique em SALVAR SELEÇÃO.'
    },
    {
      chave: 'eventos',
      rotulo: 'Eventos na data de hoje',
      ok: fila.total > 0,
      valor: `${fila.total} evento(s)`,
      dica: fila.total ? null : 'Não há nada a comunicar hoje. Isto não é erro: a rotina só envia quando existe evento.'
    },
    {
      chave: 'selecionados',
      rotulo: 'Eventos liberados para envio',
      ok: fila.total_selecionados > 0,
      valor: `${fila.total_selecionados} de ${fila.total}`,
      dica: fila.total_selecionados
        ? null
        : (bloqueadosPorTipo
          ? `${bloqueadosPorTipo} evento(s) bloqueado(s) por tipo desativado em "Tipos de evento habilitados para envio".`
          : 'Nenhum evento liberado. Verifique Obreiros Adormecidos e datas marcadas como "não enviar".')
    },
    {
      chave: 'ja_disparado',
      rotulo: 'Disparo de hoje ainda não realizado',
      ok: !db.envios.jaDisparado(hoje),
      valor: db.envios.jaDisparado(hoje) ? 'já disparado hoje' : 'pendente',
      dica: db.envios.jaDisparado(hoje)
        ? 'A rotina não repete o disparo no mesmo dia. Use "Forçar disparo" se precisar reenviar.'
        : null
    }
  ];

  const pendencias = itens.filter((i) => !i.ok && i.dica);

  return {
    data: hoje,
    modo,
    itens,
    pronto: pendencias.length === 0,
    resumo: pendencias.length
      ? `Faltam ${pendencias.length} ponto(s): ${pendencias.map((p) => p.rotulo).join('; ')}.`
      : 'Tudo pronto: a rotina automática vai disparar no horário.'
  };
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
  expressaoCron, estadoRotina, diagnosticoDisparo, lerLog, log
};
