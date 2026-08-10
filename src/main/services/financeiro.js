'use strict';

/**
 * Extrato da Tesouraria e da Hospitalaria.
 *
 * Este arquivo roda NOS DOIS LADOS - no CtrLoja do computador, sobre o
 * SQLite, e no aplicativo do celular, sobre o pacote sincronizado. E o
 * mesmo mecanismo da agenda e da presenca: o modulo so conversa com a
 * interface de dados, nunca com o banco diretamente.
 *
 * As duas areas tem a mesma forma - entra dinheiro, sai dinheiro, sobra
 * um saldo - e o que muda sao os rotulos e as categorias. Por isso vive
 * tudo aqui, com a diferenca declarada numa tabela so, em vez de dois
 * conjuntos de codigo quase iguais que um dia divergiriam.
 */

const db = require('../db/database');

/* ------------------------------------------------------------------ */
/* O que cada cargo lanca                                              */
/* ------------------------------------------------------------------ */

const AREAS = {
  tesouraria: {
    chave: 'tesouraria',
    nome: 'Tesouraria',
    // A ordem aqui e a ordem que aparece na tela, dos dois lados.
    naturezas: [
      {
        chave: 'receita', nome: 'Receita', sinal: 1,
        categorias: ['Mensalidade', 'Promoções', 'Juros de Investimentos', 'Outros']
      },
      {
        chave: 'despesa', nome: 'Despesa', sinal: -1,
        categorias: ['Ágapes', 'Aluguel', 'Internet', 'Água', 'Luz',
          'Manutenção do Templo', 'Promoções', 'Outros']
      },
      {
        // Investimento nao e despesa: o dinheiro continua sendo da Loja,
        // so mudou de lugar. Por isso fica fora do saldo e e mostrado
        // a parte.
        chave: 'investimento', nome: 'Investimento', sinal: 0,
        categorias: ['Aplicação', 'Resgate', 'Outros']
      }
    ]
  },

  hospitalaria: {
    chave: 'hospitalaria',
    nome: 'Hospitalaria',
    naturezas: [
      {
        chave: 'receita', nome: 'Receita', sinal: 1,
        categorias: ['Tronco de Solidariedade', 'Promoções', 'Outros']
      },
      {
        chave: 'doacao', nome: 'Doação', sinal: -1,
        categorias: ['Assistência a Irmão', 'Assistência a Família',
          'Entidade Assistencial', 'Outros']
      }
    ]
  }
};

const area = (chave) => AREAS[chave] || AREAS.tesouraria;
const naturezasDe = (chave) => area(chave).naturezas;
const natureza = (chaveArea, chaveNat) =>
  naturezasDe(chaveArea).find((n) => n.chave === chaveNat) || null;

/* ------------------------------------------------------------------ */
/* Auxiliares                                                          */
/* ------------------------------------------------------------------ */

/* Dinheiro em ponto flutuante acumula erro de arredondamento: somar
   0,1 com 0,2 nao da exatamente 0,3. Toda soma passa por aqui. */
const arredondar = (v) => Math.round((Number(v) || 0) * 100) / 100;

const mesDe = (data) => String(data || '').slice(0, 7);

const hojeISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const mesAtual = () => hojeISO().slice(0, 7);

/** '2026-08' -> 'agosto de 2026' */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function mesExtenso(mes) {
  const [a, m] = String(mes || '').split('-').map(Number);
  if (!a || !m) return '';
  return `${MESES[m - 1]} de ${a}`;
}

/** Move um mês para frente ou para trás: '2026-08' + 1 -> '2026-09' */
function somarMes(mes, n) {
  const [a, m] = String(mes).split('-').map(Number);
  const d = new Date(a, (m - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const lancamentos = (chaveArea) =>
  db.financeiro.todos({ area: chaveArea }).filter((l) => Number(l.ativo) !== 0);

/* ------------------------------------------------------------------ */
/* Extrato de um mes                                                   */
/* ------------------------------------------------------------------ */

/**
 * Extrato do mes pedido, com os totais por natureza e por categoria.
 *
 * @param {string} chaveArea  tesouraria | hospitalaria
 * @param {string} mes        'YYYY-MM'; vazio = mes corrente
 */
function extratoDoMes(chaveArea, mes) {
  const a = area(chaveArea);
  const alvo = mes || mesAtual();
  const todos = lancamentos(a.chave);
  const doMes = todos.filter((l) => mesDe(l.data) === alvo);

  const porNatureza = {};
  for (const n of a.naturezas) {
    const itens = doMes.filter((l) => l.natureza === n.chave);
    const total = arredondar(itens.reduce((s, l) => s + Number(l.valor || 0), 0));

    // Reparticao por categoria, da maior para a menor
    const categorias = {};
    for (const l of itens) {
      const c = l.categoria || 'Outros';
      categorias[c] = arredondar((categorias[c] || 0) + Number(l.valor || 0));
    }

    porNatureza[n.chave] = {
      chave: n.chave,
      nome: n.nome,
      sinal: n.sinal,
      total,
      quantidade: itens.length,
      itens: itens.slice().sort((x, y) => (x.data < y.data ? -1 : (x.data > y.data ? 1 : x.id - y.id))),
      categorias: Object.keys(categorias)
        .map((c) => ({
          categoria: c,
          total: categorias[c],
          percentual: total ? Math.round((categorias[c] / total) * 1000) / 10 : 0
        }))
        .sort((x, y) => y.total - x.total)
    };
  }

  /* O saldo soma o que entra e desconta o que sai. Investimento tem
     sinal zero: o dinheiro nao saiu da Loja, so mudou de lugar. */
  const saldo = arredondar(
    a.naturezas.reduce((s, n) => s + n.sinal * porNatureza[n.chave].total, 0)
  );

  // Acumulado: tudo o que houve ate o fim deste mes
  const ateAqui = todos.filter((l) => mesDe(l.data) <= alvo);
  const acumulado = arredondar(
    a.naturezas.reduce((s, n) =>
      s + n.sinal * ateAqui.filter((l) => l.natureza === n.chave)
        .reduce((t, l) => t + Number(l.valor || 0), 0), 0)
  );

  // Investimento nao entra no saldo, mas a Loja precisa saber quanto tem
  const investido = a.naturezas.some((n) => n.chave === 'investimento')
    ? arredondar(ateAqui.filter((l) => l.natureza === 'investimento')
      .reduce((t, l) => t + Number(l.valor || 0), 0))
    : null;

  return {
    area: a.chave,
    area_nome: a.nome,
    mes: alvo,
    mes_extenso: mesExtenso(alvo),
    naturezas: a.naturezas.map((n) => porNatureza[n.chave]),
    total_lancamentos: doMes.length,
    saldo,
    acumulado,
    investido,
    tem_lancamento: doMes.length > 0
  };
}

/* ------------------------------------------------------------------ */
/* Serie historica, para os graficos                                   */
/* ------------------------------------------------------------------ */

/**
 * Um ponto por mes com movimento, em ordem cronologica.
 * Mes sem lancamento nenhum nao vira ponto zerado - ele simplesmente
 * nao houve, e inventar zeros distorceria a leitura do grafico.
 */
function serieMensal(chaveArea, limite) {
  const a = area(chaveArea);
  const todos = lancamentos(a.chave);

  const meses = [];
  for (const l of todos) {
    const m = mesDe(l.data);
    if (m && meses.indexOf(m) < 0) meses.push(m);
  }
  meses.sort();

  let corrente = 0;
  const linhas = meses.map((m) => {
    const doMes = todos.filter((l) => mesDe(l.data) === m);
    const ponto = { mes: m, mes_extenso: mesExtenso(m) };

    for (const n of a.naturezas) {
      ponto[n.chave] = arredondar(
        doMes.filter((l) => l.natureza === n.chave)
          .reduce((s, l) => s + Number(l.valor || 0), 0)
      );
    }
    ponto.saldo = arredondar(a.naturezas.reduce((s, n) => s + n.sinal * ponto[n.chave], 0));
    corrente = arredondar(corrente + ponto.saldo);
    ponto.acumulado = corrente;
    return ponto;
  });

  return limite ? linhas.slice(-limite) : linhas;
}

/**
 * Painel da area: o que a tela Início mostra a todos os Irmãos e o que
 * o cargo vê no alto do seu extrato.
 */
function painel(chaveArea, limite) {
  const a = area(chaveArea);
  const serie = serieMensal(a.chave, limite || 12);
  const ultimo = serie.length ? serie[serie.length - 1] : null;
  const extrato = extratoDoMes(a.chave, ultimo ? ultimo.mes : mesAtual());

  const totais = {};
  for (const n of a.naturezas) {
    totais[n.chave] = arredondar(
      lancamentos(a.chave).filter((l) => l.natureza === n.chave)
        .reduce((s, l) => s + Number(l.valor || 0), 0)
    );
  }

  return {
    area: a.chave,
    area_nome: a.nome,
    naturezas: a.naturezas.map((n) => ({ chave: n.chave, nome: n.nome, sinal: n.sinal })),
    serie,
    totais,
    saldo_atual: extrato.acumulado,
    investido: extrato.investido,
    mes: extrato.mes,
    mes_extenso: extrato.mes_extenso,
    saldo_mes: extrato.saldo,
    categorias: extrato.naturezas.reduce((mapa, n) => {
      mapa[n.chave] = n.categorias;
      return mapa;
    }, {}),
    tem_dados: serie.length > 0
  };
}

/** Meses disponíveis para navegar, do mais recente para o mais antigo. */
function mesesDisponiveis(chaveArea) {
  const meses = db.financeiro.mesesComLancamento
    ? db.financeiro.mesesComLancamento(chaveArea)
    : serieMensal(chaveArea).map((p) => p.mes).reverse();

  const agora = mesAtual();
  if (meses.indexOf(agora) < 0) meses.unshift(agora);
  return meses;
}

module.exports = {
  AREAS,
  area,
  naturezasDe,
  natureza,
  extratoDoMes,
  serieMensal,
  painel,
  mesesDisponiveis,
  mesExtenso,
  somarMes,
  mesAtual,
  arredondar
};
