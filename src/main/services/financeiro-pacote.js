'use strict';

/**
 * O pacote que leva os lancamentos do celular de volta ao PC Mestre.
 *
 * Mesmo molde do .presenca, e pelo mesmo motivo: o aplicativo do
 * celular e uma pagina publicada e nao escreve no banco da Loja. O
 * caminho dos dados e de mao unica, entao o Tesoureiro dispara a volta
 * por um arquivo .financeiro ou por um bloco de texto no WhatsApp.
 *
 * Roda NOS DOIS LADOS - o celular monta, o computador le. Nada de Node
 * nem de navegador aqui dentro.
 *
 * ---------------------------------------------------------------------
 * Sobre nao cifrar
 *
 * Diferente da presenca, aqui HA conteudo legivel: valores e descricoes.
 * Mas nao ha nome de Irmao, e o destino e o WhatsApp do proprio
 * Tesoureiro ou o computador da Loja - os mesmos lugares por onde a
 * prestacao de contas ja circula em sessao.
 *
 * O que se protege e a INTEGRIDADE: uma conferencia denuncia o pacote
 * truncado ou alterado no caminho, que e o risco real quando o texto
 * passa pelo WhatsApp. Valor lancado errado por mensagem cortada seria
 * pior do que valor lido por quem nao devia.
 * ---------------------------------------------------------------------
 */

const FORMATO = 'ctrloja-financeiro';
const VERSAO = 1;

const MARCA_INICIO = '-----CTRLOJA-FINANCEIRO-----';
const MARCA_FIM = '-----FIM-----';

/*
 * Nenhum nome de campo leva SUBLINHADO: o WhatsApp usa _assim_ para
 * grifar em italico e come os sublinhados do texto, o que deixaria o
 * JSON invalido. Pelo mesmo motivo o texto livre e limpo de * _ ~.
 * A licao veio do pacote de presenca, onde isso quebrou de verdade.
 */
const semFormatacao = (t) => String(t === null || t === undefined ? '' : t)
  .replace(/[*_~`]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;

/* ------------------------------------------------------------------ */

/** Soma de verificacao (FNV-1a de 32 bits). Nao e criptografia. */
function conferencia(pacote) {
  const base = [
    pacote.area,
    (pacote.itens || [])
      .map((i) => [i.data, i.natureza, i.categoria, i.valor].join(':'))
      .join('|')
  ].join('#');

  let h = 0x811c9dc5;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Monta o pacote a partir dos lancamentos digitados na tela.
 *
 * @param {object} dados
 *   area, loja, lancadoPor,
 *   itens: [{ data, natureza, categoria, descricao, valor }]
 */
function montar(dados) {
  if (!dados || !dados.area) throw new Error('Informe a área do lançamento.');

  const itens = ((dados && dados.itens) || [])
    .map((i) => ({
      data: String(i.data || '').slice(0, 10),
      natureza: semFormatacao(i.natureza),
      categoria: semFormatacao(i.categoria),
      descricao: semFormatacao(i.descricao),
      valor: centavos(i.valor)
    }))
    .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.data) && i.natureza && i.valor > 0);

  if (!itens.length) {
    throw new Error('Nenhum lançamento válido: confira a data, a natureza e o valor.');
  }

  const pacote = {
    formato: FORMATO,
    versao: VERSAO,
    loja: semFormatacao(dados.loja),
    area: semFormatacao(dados.area),
    lancadoPor: semFormatacao(dados.lancadoPor) || null,
    geradoEm: new Date().toISOString(),
    total: itens.length,
    itens
  };
  pacote.conferencia = conferencia(pacote);
  return pacote;
}

/** Valida a estrutura e a soma de verificacao. */
function validar(pacote) {
  if (!pacote || typeof pacote !== 'object') throw new Error('Conteúdo não reconhecido.');
  if (pacote.formato !== FORMATO) {
    throw new Error('Isto não é um lançamento financeiro do CtrLoja.');
  }
  if (pacote.versao !== VERSAO) {
    throw new Error(`Versão não suportada: ${pacote.versao}. Atualize o CtrLoja.`);
  }
  if (!pacote.area) throw new Error('O pacote não diz de que área é.');
  if (!Array.isArray(pacote.itens) || !pacote.itens.length) {
    throw new Error('O pacote veio sem lançamento nenhum.');
  }
  for (const i of pacote.itens) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(i.data || ''))) {
      throw new Error('Há lançamento com data inválida no pacote.');
    }
    if (!Number.isFinite(Number(i.valor)) || Number(i.valor) <= 0) {
      throw new Error('Há lançamento com valor inválido no pacote.');
    }
  }
  if (pacote.conferencia && conferencia(pacote) !== pacote.conferencia) {
    throw new Error(
      'O lançamento chegou incompleto ou alterado — a conferência não bate.\n'
      + 'Peça para reenviar, de preferência pelo arquivo .financeiro.'
    );
  }
  return pacote;
}

const dinheiro = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

/**
 * Bloco de texto para o WhatsApp: resumo legivel e, abaixo, o pacote
 * entre marcas, numa linha so e sem caractere que o WhatsApp formate.
 */
function paraTexto(pacote) {
  const soma = (nat) => pacote.itens
    .filter((i) => i.natureza === nat)
    .reduce((s, i) => s + Number(i.valor || 0), 0);

  const naturezas = [];
  for (const i of pacote.itens) {
    if (naturezas.indexOf(i.natureza) < 0) naturezas.push(i.natureza);
  }

  const linhas = [
    '*LANÇAMENTO FINANCEIRO*',
    pacote.loja || '',
    'Área: ' + pacote.area,
    pacote.lancadoPor ? 'Lançado por: ' + pacote.lancadoPor : '',
    '',
    `${pacote.total} lançamento(s):`
  ];
  for (const n of naturezas) linhas.push(`  ${n}: ${dinheiro(soma(n))}`);

  linhas.push(
    '',
    'Código para o CtrLoja do computador (não altere):',
    MARCA_INICIO,
    JSON.stringify(pacote),
    MARCA_FIM
  );

  return linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** Extrai o pacote de um texto colado ou do conteudo de um arquivo. */
function deTexto(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) throw new Error('Nada foi informado.');

  let json = bruto;
  const i = bruto.indexOf(MARCA_INICIO);
  if (i >= 0) {
    const j = bruto.indexOf(MARCA_FIM, i);
    json = bruto.slice(i + MARCA_INICIO.length, j >= 0 ? j : undefined).trim();
  } else if (bruto[0] !== '{') {
    const a = bruto.indexOf('{');
    const b = bruto.lastIndexOf('}');
    if (a < 0 || b <= a) {
      throw new Error(
        'Não encontrei o lançamento no texto colado.\n'
        + 'Copie a mensagem inteira, incluindo as linhas com traços.'
      );
    }
    json = bruto.slice(a, b + 1);
  }

  let pacote;
  try {
    pacote = JSON.parse(json);
  } catch {
    throw new Error(
      'O código do lançamento veio quebrado.\n'
      + 'Copie a mensagem inteira ou use o arquivo .financeiro.'
    );
  }
  return validar(pacote);
}

function nomeArquivo(pacote) {
  const mes = (pacote.itens[0] || {}).data || '';
  return `financeiro-${pacote.area}-${mes.slice(0, 7)}.financeiro`;
}

module.exports = {
  montar, validar, paraTexto, deTexto, conferencia, nomeArquivo,
  semFormatacao, dinheiro,
  FORMATO, VERSAO, MARCA_INICIO, MARCA_FIM
};
