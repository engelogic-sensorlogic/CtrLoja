'use strict';

const db = require('../db/database');
const cal = require('./calendario');

/* ------------------------------------------------------------------ */
/* Motor de renderizacao (mini-mustache)                               */
/* ------------------------------------------------------------------ */

/**
 * Suporta:
 *   {{variavel}}                  -> substituicao simples
 *   {{#variavel}}...{{/variavel}} -> bloco exibido se a variavel tiver valor
 *   {{^variavel}}...{{/variavel}} -> bloco exibido se a variavel estiver vazia
 */
function renderizar(corpo, ctx = {}) {
  if (!corpo) return '';
  let out = String(corpo);

  const preenchido = (v) => !(v === null || v === undefined || v === '' || v === 0 || v === false);

  // blocos condicionais (ate 3 niveis de aninhamento resolvidos por repeticao)
  for (let i = 0; i < 3; i++) {
    out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
      (_m, chave, bloco) => (preenchido(ctx[chave]) ? bloco : ''));
    out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
      (_m, chave, bloco) => (preenchido(ctx[chave]) ? '' : bloco));
  }

  // substituicoes simples
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, chave) => {
    const v = ctx[chave];
    return v === null || v === undefined ? '' : String(v);
  });

  // limpeza: espacos duplicados e linhas em branco excedentes
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------------------------------------------------ */
/* Contexto padrao                                                     */
/* ------------------------------------------------------------------ */

function saudacaoPorHora(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function contextoBase(isoData) {
  const cfg = db.config.obterTodas();
  return {
    loja: cfg.loja_nome || '',
    loja_sigla: cfg.loja_sigla || '',
    potencia: cfg.potencia || '',
    oriente: cfg.oriente || '',
    saudacao: saudacaoPorHora(),
    data: cal.formatarBR(isoData),
    data_iso: isoData,
    data_extenso: cal.formatarExtenso(isoData, false),
    data_extenso_completa: cal.formatarExtenso(isoData, true),
    dia_semana: cal.diaSemana(isoData),
    ano: cal.partes(isoData).ano
  };
}

/* ------------------------------------------------------------------ */
/* Titulos maconicos                                                   */
/* ------------------------------------------------------------------ */

function tituloDe(tipoPessoa) {
  const cfg = db.config.obterTodas();
  switch (tipoPessoa) {
    case 'obreiro': return cfg.titulo_obreiro || 'Ir.∴';
    case 'cunhada': return cfg.titulo_cunhada || 'Cunhada';
    case 'sobrinho': return cfg.titulo_sobrinho || 'Sobrinho';
    case 'sobrinha': return cfg.titulo_sobrinha || 'Sobrinha';
    default: return '';
  }
}

/* ------------------------------------------------------------------ */
/* Montagem da mensagem a partir de um evento da agenda                */
/* ------------------------------------------------------------------ */

function montarContexto(evento) {
  const base = contextoBase(evento.data);
  return {
    ...base,
    tipo: evento.tipo,
    titulo: evento.titulo_pessoa || '',
    nome: evento.nome || '',
    primeiro_nome: (evento.nome || '').trim().split(/\s+/)[0] || '',
    idade: evento.anos || '',
    anos: evento.anos || '',
    anos_ordinal: evento.anos ? cal.ordinal(evento.anos) : '',
    data_evento: evento.data_original ? cal.formatarBR(evento.data_original) : '',
    data_evento_extenso: evento.data_original ? cal.formatarExtenso(evento.data_original, false) : '',
    obreiro_nome: evento.obreiro_nome || '',
    obreiro_titulo: evento.obreiro_titulo || '',
    conjuge: evento.conjuge || '',
    evento: evento.evento || evento.descricao_curta || '',
    descricao: evento.descricao || '',
    ano_origem: evento.ano_origem || '',
    categoria: evento.categoria || ''
  };
}

function montarMensagem(evento) {
  const chave = evento.template_chave || evento.tipo;
  const tpl = db.templates.obter(chave);
  if (!tpl) return `[Modelo "${chave}" não encontrado ou inativo]`;
  return renderizar(tpl.corpo, montarContexto(evento));
}

/* ------------------------------------------------------------------ */
/* Apoio a interface                                                   */
/* ------------------------------------------------------------------ */

function variaveisDisponiveis() {
  return [
    { v: '{{loja}}', d: 'Nome completo da Loja' },
    { v: '{{loja_sigla}}', d: 'Sigla da Loja (UFR)' },
    { v: '{{potencia}}', d: 'Potência (GLP)' },
    { v: '{{oriente}}', d: 'Oriente' },
    { v: '{{saudacao}}', d: 'Bom dia / Boa tarde / Boa noite (conforme o horário)' },
    { v: '{{titulo}}', d: 'Título da pessoa: Ir.∴, Cunhada, Sobrinho, Sobrinha' },
    { v: '{{nome}}', d: 'Nome completo da pessoa homenageada' },
    { v: '{{primeiro_nome}}', d: 'Primeiro nome da pessoa' },
    { v: '{{idade}}', d: 'Idade que completa (aniversário natalício)' },
    { v: '{{anos}}', d: 'Anos completos do evento (iniciação, casamento, etc.)' },
    { v: '{{anos_ordinal}}', d: 'Anos em forma ordinal (25º)' },
    { v: '{{data}}', d: 'Data do dia (dd/mm/aaaa)' },
    { v: '{{data_extenso}}', d: 'Data do dia por extenso' },
    { v: '{{data_extenso_completa}}', d: 'Data por extenso com dia da semana' },
    { v: '{{dia_semana}}', d: 'Dia da semana' },
    { v: '{{data_evento}}', d: 'Data original do evento (dd/mm/aaaa)' },
    { v: '{{data_evento_extenso}}', d: 'Data original por extenso' },
    { v: '{{obreiro_titulo}}', d: 'Título do Obreiro vinculado (para familiares)' },
    { v: '{{obreiro_nome}}', d: 'Nome do Obreiro vinculado (para familiares)' },
    { v: '{{conjuge}}', d: 'Nome da Cunhada (aniversário de casamento)' },
    { v: '{{evento}}', d: 'Título da data comemorativa / efeméride' },
    { v: '{{descricao}}', d: 'Descrição da data comemorativa / efeméride' },
    { v: '{{ano_origem}}', d: 'Ano do fato histórico' },
    { v: '{{#campo}}...{{/campo}}', d: 'Bloco exibido somente se o campo tiver valor' },
    { v: '{{^campo}}...{{/campo}}', d: 'Bloco exibido somente se o campo estiver vazio' }
  ];
}

const EXEMPLOS = {
  aniversario_obreiro: { titulo_pessoa: 'Ir.∴', nome: 'João Carlos de Souza', anos: 52, tipo: 'aniversario_obreiro' },
  aniversario_cunhada: { titulo_pessoa: 'Cunhada', nome: 'Maria Helena de Souza', anos: 48, obreiro_titulo: 'Ir.∴', obreiro_nome: 'João Carlos de Souza' },
  aniversario_sobrinho: { titulo_pessoa: 'Sobrinho', nome: 'Pedro Henrique de Souza', anos: 14, obreiro_titulo: 'Ir.∴', obreiro_nome: 'João Carlos de Souza' },
  aniversario_sobrinha: { titulo_pessoa: 'Sobrinha', nome: 'Ana Clara de Souza', anos: 9, obreiro_titulo: 'Ir.∴', obreiro_nome: 'João Carlos de Souza' },
  iniciacao: { titulo_pessoa: 'Ir.∴', nome: 'João Carlos de Souza', anos: 12, data_original: '2014-03-18' },
  elevacao: { titulo_pessoa: 'Ir.∴', nome: 'João Carlos de Souza', anos: 11, data_original: '2015-05-20' },
  exaltacao: { titulo_pessoa: 'Ir.∴', nome: 'João Carlos de Souza', anos: 10, data_original: '2016-08-11' },
  remissao: { titulo_pessoa: 'Ir.∴', nome: 'João Carlos de Souza', anos: 5, data_original: '2021-09-02' },
  casamento: { titulo_pessoa: 'Ir.∴', nome: 'João Carlos de Souza', conjuge: 'Maria Helena de Souza', anos: 25, data_original: '2001-11-10' },
  feriado_religioso: { evento: 'Dia de São João Batista', descricao: 'Padroeiro da Maçonaria Universal.' },
  data_nacional: { evento: 'Independência do Brasil', descricao: 'Proclamada por D. Pedro I às margens do Ipiranga.', ano_origem: 1822 },
  efemeride: { evento: 'Revolução Francesa - Queda da Bastilha', descricao: 'Marco dos ideais de Liberdade, Igualdade e Fraternidade.', ano_origem: 1789 },
  maconica: { evento: 'Dia do Maçom', descricao: 'Em memória da sessão histórica de 20 de agosto de 1822.', ano_origem: 1822 },
  cabecalho_diario: {}
};

function preview(corpo, chave) {
  const exemplo = EXEMPLOS[chave] || EXEMPLOS.aniversario_obreiro;
  const evento = { data: cal.hojeISO(), tipo: chave, ...exemplo };
  return renderizar(corpo, montarContexto(evento));
}

module.exports = {
  renderizar, montarMensagem, montarContexto, contextoBase,
  tituloDe, variaveisDisponiveis, preview, saudacaoPorHora
};
