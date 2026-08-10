'use strict';

/**
 * Lista de presenca: montagem da chamada e estatisticas.
 *
 * Este arquivo roda NOS DOIS LADOS - no CtrLoja do computador, sobre o
 * SQLite, e no aplicativo do celular, sobre o pacote sincronizado. E o
 * mesmo mecanismo ja usado pela agenda: o modulo so conversa com a
 * interface de dados, nunca com o banco diretamente.
 *
 * Por isso, nada aqui pode depender de SQL, de Node ou de navegador.
 *
 * Uma regra atravessa o arquivo inteiro: sessao SEM chamada registrada
 * nao e sessao com zero presentes. Nao ter havido chamada e um estado
 * diferente de ninguem ter comparecido, e misturar os dois estragaria
 * toda a estatistica da Loja.
 */

const db = require('../db/database');

const ROTULO_TIPO = { Economica: 'Econômica', Magna: 'Magna' };

/* ------------------------------------------------------------------ */
/* Auxiliares                                                          */
/* ------------------------------------------------------------------ */

/*
 * "Ativo" aqui e a SITUACAO do Obreiro na Loja - Ativo ou Adormecido -
 * e nao a coluna 'ativo' do cadastro, que marca registro excluido. O
 * filtro somenteAtivos do banco olha a coluna; quem esta Adormecido
 * passaria por ele. E a mesma distincao que a agenda faz para nao
 * mandar mensagem a quem esta Adormecido.
 */
const ativo = (o) => String(o.situacao || '').trim().toLowerCase() === 'ativo';

/** Obreiros que entram na chamada: cadastro vivo E situacao Ativo. */
const quadroAtivo = () => db.obreiros.listar({ somenteAtivos: true }).filter(ativo);

function porcentagem(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 1000) / 10;      // uma casa decimal
}

function rotuloSessao(s) {
  if (!s) return '';
  return `Sessão ${ROTULO_TIPO[s.tipo] || s.tipo} no Grau de ${s.grau}`;
}

/** Presencas agrupadas por data da sessao. */
function agruparPorSessao() {
  const mapa = new Map();
  for (const p of db.presencas.todas()) {
    if (!mapa.has(p.sessao_data)) mapa.set(p.sessao_data, []);
    mapa.get(p.sessao_data).push(p);
  }
  return mapa;
}

/* ------------------------------------------------------------------ */
/* A chamada de uma sessao                                             */
/* ------------------------------------------------------------------ */

/**
 * Monta a lista de chamada de uma sessao: todos os Obreiros ativos, com
 * a marcacao ja registrada quando houver.
 *
 * Obreiro Adormecido nao entra na chamada - do mesmo modo que nao recebe
 * mensagem. Mas se ele constava numa chamada antiga, aquele registro
 * continua valendo para o historico.
 */
function listaDaSessao(data) {
  const sessao = db.sessoes.obterPorData(data) || null;
  const marcados = new Map();
  for (const p of db.presencas.porSessao(data)) marcados.set(p.obreiro_id, !!Number(p.presente));

  const itens = quadroAtivo().map((o) => ({
    obreiro_id: o.id,
    nome: o.nome,
    tratamento: o.tratamento || '',
    grau: o.grau || '',
    presente: marcados.has(o.id) ? marcados.get(o.id) : false,
    ja_registrado: marcados.has(o.id)
  }));

  const presentes = itens.filter((i) => i.presente).length;

  return {
    data,
    sessao,
    rotulo: rotuloSessao(sessao),
    sem_sessao: !sessao,
    grau: sessao ? sessao.grau : null,
    tipo: sessao ? (ROTULO_TIPO[sessao.tipo] || sessao.tipo) : null,
    hora: sessao ? sessao.hora : null,
    local: sessao ? sessao.local : null,
    agenda_dia: sessao ? sessao.agenda_dia : null,
    itens,
    total: itens.length,
    presentes,
    ausentes: itens.length - presentes,
    percentual: porcentagem(presentes, itens.length),
    tem_chamada: marcados.size > 0
  };
}

/*
 * Data mais antiga em que se admite lancar chamada.
 *
 * A Loja esta recuperando o historico de 2026, entao a chamada precisa
 * aceitar datas para tras - mas nao qualquer uma: sem um piso, um erro
 * de digitacao no seletor de data criaria registro em 1926 e a
 * estatistica sairia deformada sem ninguem entender por que.
 */
const DATA_MINIMA = '2026-01-01';

const dataValidaParaChamada = (data) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) && data >= DATA_MINIMA;

/**
 * Datas disponiveis para chamada, da mais recente para a mais antiga.
 *
 * Junta duas origens: as sessoes programadas na Agenda da Loja e as
 * datas que JA tem chamada registrada. A segunda importa - lancada uma
 * chamada em data sem sessao cadastrada, aquela data tem de continuar
 * alcancavel pelo seletor, senao o registro some da vista.
 */
function sessoesParaChamada(limite) {
  const comChamada = db.presencas.datasComChamada
    ? db.presencas.datasComChamada()
    : [...agruparPorSessao().keys()];

  const porData = new Map();

  for (const s of db.sessoes.listar({ somenteAtivas: true })) {
    if (!dataValidaParaChamada(s.data)) continue;
    porData.set(s.data, {
      data: s.data,
      grau: s.grau,
      tipo: ROTULO_TIPO[s.tipo] || s.tipo,
      rotulo: rotuloSessao(s),
      sem_sessao: false,
      tem_chamada: comChamada.indexOf(s.data) >= 0
    });
  }

  for (const data of comChamada) {
    if (!dataValidaParaChamada(data) || porData.has(data)) continue;
    porData.set(data, {
      data,
      grau: null,
      tipo: null,
      rotulo: 'Chamada avulsa',
      sem_sessao: true,
      tem_chamada: true
    });
  }

  return [...porData.values()]
    .sort((a, b) => (a.data < b.data ? 1 : (a.data > b.data ? -1 : 0)))
    .slice(0, limite || 200);
}

/* ------------------------------------------------------------------ */
/* Estatisticas                                                        */
/* ------------------------------------------------------------------ */

/**
 * Comparecimento sessao a sessao, apenas das que tiveram chamada.
 * Vem em ordem cronologica: e assim que o grafico precisa.
 */
function comparecimentoPorSessao(filtro) {
  filtro = filtro || {};
  const porSessao = agruparPorSessao();
  const linhas = [];

  for (const [data, registros] of porSessao) {
    if (filtro.de && data < filtro.de) continue;
    if (filtro.ate && data > filtro.ate) continue;

    const s = db.sessoes.obterPorData(data);
    const presentes = registros.filter((p) => Number(p.presente)).length;

    linhas.push({
      data,
      grau: s ? s.grau : null,
      tipo: s ? (ROTULO_TIPO[s.tipo] || s.tipo) : null,
      rotulo: rotuloSessao(s),
      total: registros.length,
      presentes,
      ausentes: registros.length - presentes,
      percentual: porcentagem(presentes, registros.length)
    });
  }

  linhas.sort((a, b) => (a.data < b.data ? -1 : (a.data > b.data ? 1 : 0)));
  return linhas;
}

/**
 * Frequencia de cada Obreiro: em quantas chamadas ele constou e em
 * quantas esteve presente.
 *
 * O denominador e por Obreiro, nao da Loja: quem foi iniciado no meio do
 * ano nao pode ser cobrado pelas sessoes anteriores a ele.
 */
function frequenciaPorObreiro(filtro) {
  filtro = filtro || {};
  const nomes = new Map();
  for (const o of db.obreiros.listar({})) nomes.set(o.id, o);

  const contagem = new Map();
  for (const p of db.presencas.todas()) {
    if (filtro.de && p.sessao_data < filtro.de) continue;
    if (filtro.ate && p.sessao_data > filtro.ate) continue;

    if (!contagem.has(p.obreiro_id)) contagem.set(p.obreiro_id, { chamadas: 0, presencas: 0, ultima: null });
    const c = contagem.get(p.obreiro_id);
    c.chamadas++;
    if (Number(p.presente)) {
      c.presencas++;
      if (!c.ultima || p.sessao_data > c.ultima) c.ultima = p.sessao_data;
    }
  }

  const linhas = [];
  for (const [id, c] of contagem) {
    const o = nomes.get(id);
    if (!o) continue;                       // Obreiro excluido do cadastro
    if (filtro.somenteAtivos && !ativo(o)) continue;

    linhas.push({
      obreiro_id: id,
      nome: o.nome,
      tratamento: o.tratamento || '',
      grau: o.grau || '',
      situacao: o.situacao || '',
      chamadas: c.chamadas,
      presencas: c.presencas,
      faltas: c.chamadas - c.presencas,
      ultima_presenca: c.ultima,
      percentual: porcentagem(c.presencas, c.chamadas)
    });
  }

  // Do mais assíduo para o menos; empate resolvido pelo nome
  linhas.sort((a, b) => (b.percentual - a.percentual)
    || (b.presencas - a.presencas)
    || (a.nome < b.nome ? -1 : (a.nome > b.nome ? 1 : 0)));

  return linhas;
}

/** Painel completo: o que as telas do PC e do celular desenham. */
function estatisticas(filtro) {
  filtro = filtro || {};
  const sessoes = comparecimentoPorSessao(filtro);
  const obreiros = frequenciaPorObreiro(Object.assign({ somenteAtivos: true }, filtro));

  const totalPresencas = sessoes.reduce((n, s) => n + s.presentes, 0);
  const totalLugares = sessoes.reduce((n, s) => n + s.total, 0);

  const media = sessoes.length
    ? Math.round((totalPresencas / sessoes.length) * 10) / 10
    : 0;

  const ordenadas = sessoes.slice().sort((a, b) => b.percentual - a.percentual);

  return {
    sessoes,
    obreiros,
    total_sessoes: sessoes.length,
    media_presentes: media,
    percentual_medio: porcentagem(totalPresencas, totalLugares),
    melhor: ordenadas[0] || null,
    pior: ordenadas.length > 1 ? ordenadas[ordenadas.length - 1] : null,
    ultima: sessoes.length ? sessoes[sessoes.length - 1] : null,
    quadro: quadroAtivo().length
  };
}

/**
 * Frequencia de um Obreiro sessao a sessao, para o detalhe individual.
 */
function historicoDoObreiro(obreiroId, filtro) {
  filtro = filtro || {};
  const id = Number(obreiroId);
  const linhas = db.presencas.todas()
    .filter((p) => p.obreiro_id === id)
    .filter((p) => (!filtro.de || p.sessao_data >= filtro.de) && (!filtro.ate || p.sessao_data <= filtro.ate))
    .map((p) => {
      const s = db.sessoes.obterPorData(p.sessao_data);
      return {
        data: p.sessao_data,
        presente: !!Number(p.presente),
        grau: s ? s.grau : null,
        tipo: s ? (ROTULO_TIPO[s.tipo] || s.tipo) : null
      };
    });

  linhas.sort((a, b) => (a.data < b.data ? -1 : (a.data > b.data ? 1 : 0)));
  return linhas;
}

module.exports = {
  DATA_MINIMA,
  dataValidaParaChamada,
  listaDaSessao,
  sessoesParaChamada,
  comparecimentoPorSessao,
  frequenciaPorObreiro,
  historicoDoObreiro,
  estatisticas,
  rotuloSessao,
  ROTULO_TIPO
};
