'use strict';

const db = require('../db/database');
const cal = require('./calendario');
const tpl = require('./templates');

const TIPOS_OBREIRO = [
  { campo: 'dt_nascimento', tipo: 'aniversario_obreiro', rotulo: 'Aniversário natalício' },
  { campo: 'dt_iniciacao', tipo: 'iniciacao', rotulo: 'Aniversário de Iniciação' },
  { campo: 'dt_elevacao', tipo: 'elevacao', rotulo: 'Aniversário de Elevação' },
  { campo: 'dt_exaltacao', tipo: 'exaltacao', rotulo: 'Aniversário de Exaltação' },
  { campo: 'dt_remissao', tipo: 'remissao', rotulo: 'Aniversário de Remissão' },
  { campo: 'dt_casamento', tipo: 'casamento', rotulo: 'Aniversário de Casamento' }
];

const ROTULO_CATEGORIA = {
  feriado_religioso: 'Data Religiosa',
  data_nacional: 'Data Nacional',
  efemeride: 'Efeméride Histórica',
  maconica: 'Efeméride Maçônica',
  sessao: 'Sessão da Loja'
};

const ROTULO_TIPO_SESSAO = { Economica: 'Econômica', Magna: 'Magna' };

/* ------------------------------------------------------------------ */

/**
 * Carrega uma unica vez os dados usados na varredura de datas.
 * Sem isto, um periodo de 30 dias releria o banco 30 vezes.
 */
function carregarBase() {
  return {
    obreiros: db.obreiros.listar({ somenteAtivos: true }),
    datas: db.datas.ativas(),
    sessoes: db.sessoes.ativas(),
    titulos: {
      obreiro: tpl.tituloDe('obreiro'),
      cunhada: tpl.tituloDe('cunhada'),
      sobrinho: tpl.tituloDe('sobrinho'),
      sobrinha: tpl.tituloDe('sobrinha')
    }
  };
}

function eventosDoDia(isoData, base) {
  const data = cal.ehISOValido(isoData) ? isoData : cal.hojeISO();
  const eventos = [];

  if (!base) base = carregarBase();
  const { obreiros, titulos } = base;

  for (const o of obreiros) {
    // Obreiro Adormecido: nem ele nem a familia entram nos disparos
    const adormecido = String(o.situacao || '').toLowerCase() !== 'ativo';
    const cunhada = (o.familiares || []).find((f) => f.parentesco === 'cunhada' && f.ativo);

    for (const def of TIPOS_OBREIRO) {
      const dataOriginal = o[def.campo];
      if (!cal.mesmoDiaMes(dataOriginal, data)) continue;
      eventos.push({
        id: `obr-${o.id}-${def.tipo}`,
        tipo: def.tipo,
        rotulo: def.rotulo,
        categoria: 'obreiro',
        data,
        data_original: dataOriginal,
        anos: cal.anosDecorridos(dataOriginal, data),
        nome: o.nome,
        titulo_pessoa: o.tratamento || titulos.obreiro,
        obreiro_id: o.id,
        obreiro_nome: o.nome,
        obreiro_titulo: o.tratamento || titulos.obreiro,
        conjuge: cunhada ? cunhada.nome : '',
        celular: o.celular || '',
        bloqueado: adormecido,
        motivo_bloqueio: adormecido ? 'Obreiro Adormecido — eventos não são comunicados' : null
      });
    }

    for (const f of o.familiares || []) {
      if (!f.ativo) continue;
      if (!cal.mesmoDiaMes(f.dt_nascimento, data)) continue;
      const tipo = `aniversario_${f.parentesco}`;
      eventos.push({
        id: `fam-${f.id}`,
        tipo,
        rotulo: `Aniversário natalício (${f.parentesco})`,
        categoria: 'familiar',
        data,
        data_original: f.dt_nascimento,
        anos: cal.anosDecorridos(f.dt_nascimento, data),
        nome: f.nome,
        titulo_pessoa: titulos[f.parentesco] || '',
        obreiro_id: o.id,
        obreiro_nome: o.nome,
        obreiro_titulo: o.tratamento || titulos.obreiro,
        celular: f.celular || '',
        bloqueado: adormecido,
        motivo_bloqueio: adormecido ? 'Obreiro Adormecido — eventos da família não são comunicados' : null
      });
    }
  }

  // Calendario permanente
  const { ano } = cal.partes(data);
  for (const d of base.datas) {
    const iso = cal.resolverDataCalendario(d, ano);
    if (iso !== data) continue;
    eventos.push({
      id: `cal-${d.id}`,
      tipo: d.template_chave || d.categoria,
      rotulo: ROTULO_CATEGORIA[d.categoria] || 'Data do calendário',
      categoria: d.categoria,
      data,
      data_original: d.ano_origem ? `${d.ano_origem}-${String(d.mes || 1).padStart(2, '0')}-${String(d.dia || 1).padStart(2, '0')}` : null,
      anos: d.ano_origem ? ano - d.ano_origem : null,
      evento: d.titulo,
      nome: d.titulo,
      descricao: d.descricao || '',
      ano_origem: d.ano_origem,
      template_chave: d.template_chave || d.categoria,
      bloqueado: !d.enviar,
      motivo_bloqueio: d.enviar ? null : 'Data marcada como "não enviar"'
    });
  }

  // Sessoes da Loja (Agenda da Loja)
  const sessao = (base.sessoes || []).find((x) => x.data === data);
  if (sessao) {
    const cfg = db.config.obterTodas();
    eventos.push({
      id: `ses-${sessao.id}`,
      tipo: 'sessao',
      rotulo: `Sessão ${ROTULO_TIPO_SESSAO[sessao.tipo] || sessao.tipo} no Grau de ${sessao.grau}`,
      categoria: 'sessao',
      data,
      evento: `Sessão ${ROTULO_TIPO_SESSAO[sessao.tipo] || sessao.tipo}`,
      nome: `Sessão ${ROTULO_TIPO_SESSAO[sessao.tipo] || sessao.tipo} — Grau de ${sessao.grau}`,
      grau: sessao.grau,
      tipo_sessao: ROTULO_TIPO_SESSAO[sessao.tipo] || sessao.tipo,
      agenda_dia: sessao.agenda_dia || '',
      hora_sessao: sessao.hora || cfg.hora_reuniao || '',
      local_sessao: sessao.local || cfg.templo || '',
      especial: !!sessao.especial,
      template_chave: 'sessao',
      bloqueado: !sessao.enviar,
      motivo_bloqueio: sessao.enviar ? null : 'Sessão marcada como "não enviar"'
    });
  }

  const ordem = { sessao: -1, obreiro: 0, familiar: 1, maconica: 2, feriado_religioso: 3, data_nacional: 4, efemeride: 5 };
  eventos.sort((a, b) => (ordem[a.categoria] ?? 9) - (ordem[b.categoria] ?? 9));
  return eventos;
}

function eventosDoPeriodo(isoInicio, isoFim) {
  const res = [];
  const base = carregarBase();
  let atual = isoInicio;
  let guarda = 0;
  while (atual <= isoFim && guarda < 800) {
    const evts = eventosDoDia(atual, base);
    if (evts.length) res.push({ data: atual, eventos: evts });
    atual = cal.somarDias(atual, 1);
    guarda += 1;
  }
  return res;
}

function eventosDoMes(ano, mes) {
  const ultimo = new Date(ano, mes, 0).getDate();
  return eventosDoPeriodo(cal.paraISO(ano, mes, 1), cal.paraISO(ano, mes, ultimo));
}

function proximosEventos(dias = 30) {
  const hoje = cal.hojeISO();
  return eventosDoPeriodo(hoje, cal.somarDias(hoje, dias));
}

/* ------------------------------------------------------------------ */
/* Agenda da Loja - sessoes                                            */
/* ------------------------------------------------------------------ */

const DIAS_SEMANA_NUM = {
  domingo: 0, 'segunda-feira': 1, segunda: 1, 'terca-feira': 2, terca: 2, 'terça-feira': 2, terça: 2,
  'quarta-feira': 3, quarta: 3, 'quinta-feira': 4, quinta: 4, 'sexta-feira': 5, sexta: 5,
  sabado: 6, 'sábado': 6
};

/** Dia da semana das sessoes, conforme configurado (padrao: segunda-feira). */
function diaDaSessao() {
  const bruto = String(db.config.obter('dia_reuniao', 'Segunda-feira') || '')
    .trim().toLowerCase();
  const n = DIAS_SEMANA_NUM[bruto];
  return n === undefined ? 1 : n;
}

/**
 * Pauta do mes na Agenda da Loja: todos os dias de sessao do mes
 * (segundas-feiras, por padrao) somados as datas adicionais ja cadastradas.
 */
function sessoesDoMes(ano, mes) {
  const dow = diaDaSessao();
  const ultimo = new Date(ano, mes, 0).getDate();
  const primeiroISO = cal.paraISO(ano, mes, 1);
  const ultimoISO = cal.paraISO(ano, mes, ultimo);

  const salvas = db.sessoes.listar({ de: primeiroISO, ate: ultimoISO });
  const porData = Object.fromEntries(salvas.map((s) => [s.data, s]));

  const linhas = [];

  for (let d = 1; d <= ultimo; d++) {
    const iso = cal.paraISO(ano, mes, d);
    if (cal.paraData(iso).getDay() !== dow) continue;
    linhas.push({
      data: iso,
      data_extenso: cal.formatarExtenso(iso, true),
      regular: true,
      sessao: porData[iso] || null
    });
    delete porData[iso];
  }

  // Datas adicionais (eventos especiais fora do dia de sessao)
  for (const s of Object.values(porData)) {
    linhas.push({
      data: s.data,
      data_extenso: cal.formatarExtenso(s.data, true),
      regular: false,
      sessao: s
    });
  }

  linhas.sort((a, b) => a.data.localeCompare(b.data));
  return { ano, mes, dia_semana: dow, linhas };
}

/* ------------------------------------------------------------------ */
/* Fila de disparo                                                     */
/* ------------------------------------------------------------------ */

function tiposHabilitados() {
  try {
    const bruto = db.config.obter('eventos_habilitados', '[]');
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/**
 * Monta a fila de mensagens do dia, ja renderizadas e prontas para revisao.
 */
function montarFila(isoData) {
  const data = cal.ehISOValido(isoData) ? isoData : cal.hojeISO();
  const habilitados = tiposHabilitados();
  const eventos = eventosDoDia(data);
  const grupos = db.grupos.selecionados();
  const agrupar = db.config.obter('agrupar_mensagens', '0') === '1';

  const itens = eventos.map((e) => {
    const habilitado = habilitados.includes(e.tipo) || habilitados.includes(e.categoria);
    return {
      ...e,
      mensagem: tpl.montarMensagem(e),
      selecionado: habilitado && !e.bloqueado,
      motivo_bloqueio: e.bloqueado
        ? e.motivo_bloqueio
        : (habilitado ? null : 'Tipo de evento desativado nas configurações')
    };
  });

  let mensagemUnica = null;
  if (agrupar && itens.some((i) => i.selecionado)) {
    const cabecalho = db.templates.obter('cabecalho_diario');
    const head = cabecalho ? tpl.renderizar(cabecalho.corpo, tpl.contextoBase(data)) : '';
    mensagemUnica = [head, ...itens.filter((i) => i.selecionado).map((i) => i.mensagem)]
      .filter(Boolean)
      .join('\n\n———————————————\n\n');
  }

  return {
    data,
    data_extenso: cal.formatarExtenso(data, true),
    agrupar,
    mensagem_unica: mensagemUnica,
    grupos: grupos.map((g) => ({ id: g.wa_id, nome: g.nome })),
    itens,
    total: itens.length,
    total_selecionados: itens.filter((i) => i.selecionado).length,
    ja_disparado: db.envios.jaDisparado(data)
  };
}

module.exports = {
  carregarBase, eventosDoDia, eventosDoPeriodo, eventosDoMes, proximosEventos, montarFila,
  sessoesDoMes, diaDaSessao, TIPOS_OBREIRO
};
