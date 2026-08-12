'use strict';

/**
 * O pacote que leva a chamada do celular de volta ao PC Mestre.
 *
 * O aplicativo do celular NAO escreve no banco da Loja - ele e uma
 * pagina publicada, e o caminho dos dados e de mao unica: PC -> GitHub
 * -> celular. A lista marcada precisa, portanto, voltar por um canal que
 * o proprio Chanceler dispare: um arquivo .presenca ou um bloco de texto
 * enviado pelo WhatsApp.
 *
 * Este arquivo roda NOS DOIS LADOS - o celular monta, o computador le.
 * Por isso nao usa Node nem navegador: nada de Buffer, btoa ou crypto.
 *
 * ---------------------------------------------------------------------
 * Sobre nao cifrar este pacote
 *
 * O conteudo e apenas: uma data, um numero de sessao e uma lista de
 * pares [id do Obreiro, 0 ou 1]. NAO ha nomes, nem datas de nascimento,
 * nem nada que identifique alguem: quem interceptasse a mensagem veria
 * numeros sem significado, porque a correspondencia entre id e nome so
 * existe dentro do pacote cifrado da Loja.
 *
 * Cifrar aqui obrigaria o Chanceler a digitar a senha da Loja no
 * computador a cada chamada importada, sem proteger nada que ja nao
 * esteja protegido. Em lugar da cifra vai uma CONFERENCIA - uma soma de
 * verificacao - que denuncia o pacote truncado ou alterado no caminho,
 * que e o risco real quando o texto passa pelo WhatsApp.
 * ---------------------------------------------------------------------
 */

const FORMATO = 'ctrloja-presenca';
const VERSAO = 1;

const MARCA_INICIO = '-----CTRLOJA-PRESENCA-----';
const MARCA_FIM = '-----FIM-----';

/*
 * Nenhum nome de campo aqui leva SUBLINHADO, e nao e capricho de
 * estilo: o WhatsApp usa _assim_ para grifar em italico e, ao fazer
 * isso, COME os sublinhados do texto. Um pacote com "sessao_data" e
 * "registrado_por" voltaria do WhatsApp com os sublinhados faltando -
 * JSON invalido, lista perdida. Pelo mesmo motivo o texto livre e
 * limpo de * _ ~ antes de entrar no pacote.
 */
const semFormatacao = (t) => String(t === null || t === undefined ? '' : t)
  .replace(/[*_~`]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* ------------------------------------------------------------------ */

/**
 * Soma de verificacao (FNV-1a de 32 bits) sobre o conteudo que importa.
 *
 * Nao e criptografia e nao pretende ser: serve para perceber que o
 * texto chegou cortado ou remendado. Escolhida por ser curta, de conta
 * simples e igual em qualquer JavaScript - o mesmo numero no celular e
 * no computador, sem depender de biblioteca.
 */
function conferencia(pacote) {
  const base = [
    pacote.data,
    // Os visitantes entram na conta: alterados no caminho, o numero
    // passaria despercebido se ficasse de fora da conferencia.
    'v' + (Number(pacote.visitantes) || 0),
    (pacote.itens || []).map((p) => p[0] + ':' + p[1]).join(',')
  ].join('|');

  let h = 0x811c9dc5;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Monta o pacote a partir da lista marcada na tela.
 *
 * @param {object} dados
 *   data, grau, tipo, loja, chamadaPor,
 *   itens: [{ obreiro_id, presente }]
 */
function montar(dados) {
  const data = dados && (dados.data || dados.sessao_data);
  if (!data) throw new Error('Informe a data da sessão.');

  const itens = ((dados && dados.itens) || [])
    .map((i) => [Number(i.obreiro_id), i.presente ? 1 : 0])
    .filter((p) => Number.isFinite(p[0]) && p[0] > 0)
    .sort((a, b) => a[0] - b[0]);

  if (!itens.length) throw new Error('Nenhum Obreiro na lista de presença.');

  const pacote = {
    formato: FORMATO,
    versao: VERSAO,
    loja: semFormatacao(dados.loja),
    data,
    grau: semFormatacao(dados.grau) || null,
    tipo: semFormatacao(dados.tipo) || null,
    chamadaPor: semFormatacao(dados.chamadaPor || dados.registrado_por) || null,
    geradoEm: new Date().toISOString(),
    total: itens.length,
    presentes: itens.filter((p) => p[1]).length,
    visitantes: Math.max(0, Math.trunc(Number(dados.visitantes) || 0)),
    itens
  };
  pacote.conferencia = conferencia(pacote);
  return pacote;
}

/** Valida a estrutura e a soma de verificacao. Lanca erro explicativo. */
function validar(pacote) {
  if (!pacote || typeof pacote !== 'object') {
    throw new Error('Conteúdo não reconhecido.');
  }
  if (pacote.formato !== FORMATO) {
    throw new Error('Isto não é uma lista de presença do CtrLoja.');
  }
  if (pacote.versao !== VERSAO) {
    throw new Error(`Versão de lista não suportada: ${pacote.versao}. Atualize o CtrLoja.`);
  }
  if (!pacote.data || !/^\d{4}-\d{2}-\d{2}$/.test(pacote.data)) {
    throw new Error('A data da sessão está ausente ou inválida.');
  }
  if (!Array.isArray(pacote.itens) || !pacote.itens.length) {
    throw new Error('A lista de presença veio vazia.');
  }
  if (!pacote.itens.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(Number(p[0])))) {
    throw new Error('A lista de presença veio com formato estranho.');
  }
  if (pacote.conferencia && conferencia(pacote) !== pacote.conferencia) {
    throw new Error(
      'A lista chegou incompleta ou alterada — a conferência não bate.\n'
      + 'Peça para reenviar, de preferência pelo arquivo .presenca.'
    );
  }
  return pacote;
}

/**
 * Bloco de texto para o WhatsApp: um resumo legivel e, abaixo, o pacote
 * entre marcas. Sem nomes - so contagem.
 *
 * O JSON vai numa unica linha e sem asterisco ou sublinhado, que sao os
 * caracteres que o WhatsApp usaria para formatar e acabaria comendo.
 */
function paraTexto(pacote, extenso) {
  const linhas = [
    '*LISTA DE PRESENÇA*',
    pacote.loja || '',
    pacote.grau ? `Sessão ${pacote.tipo || ''} no Grau de ${pacote.grau}`.replace(/\s+/g, ' ').trim() : '',
    `Data: ${extenso || pacote.data}`,
    pacote.chamadaPor ? `Chamada por: ${pacote.chamadaPor}` : '',
    '',
    `Presentes: ${pacote.presentes} de ${pacote.total}`,
    pacote.visitantes ? `Visitantes: ${pacote.visitantes}` : '',
    '',
    'Código para o CtrLoja do computador (não altere):',
    MARCA_INICIO,
    JSON.stringify(pacote),
    MARCA_FIM
  ];
  return linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/**
 * Extrai o pacote de um texto colado (WhatsApp) ou do conteudo de um
 * arquivo .presenca. Aceita as duas formas sem que o usuario precise
 * dizer qual e.
 */
function deTexto(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) throw new Error('Nada foi informado.');

  let json = bruto;
  const i = bruto.indexOf(MARCA_INICIO);
  if (i >= 0) {
    const j = bruto.indexOf(MARCA_FIM, i);
    json = bruto.slice(i + MARCA_INICIO.length, j >= 0 ? j : undefined).trim();
  } else if (bruto[0] !== '{') {
    // Nem marcas nem JSON: tenta achar o primeiro objeto do texto
    const a = bruto.indexOf('{');
    const b = bruto.lastIndexOf('}');
    if (a < 0 || b <= a) {
      throw new Error(
        'Não encontrei a lista no texto colado.\n'
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
      'O código da lista veio quebrado.\n'
      + 'Copie a mensagem inteira ou use o arquivo .presenca.'
    );
  }
  return validar(pacote);
}

/** Nome sugerido para o arquivo salvo. */
function nomeArquivo(pacote) {
  return `presenca-${pacote.data}.presenca`;
}

module.exports = {
  montar, validar, paraTexto, deTexto, conferencia, nomeArquivo, semFormatacao,
  FORMATO, VERSAO, MARCA_INICIO, MARCA_FIM
};
