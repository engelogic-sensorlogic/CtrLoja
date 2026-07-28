'use strict';

/**
 * Utilitarios de data - modulo puro (sem dependencia de Electron ou banco).
 * Todas as datas trafegam em texto ISO 'YYYY-MM-DD' para evitar problemas
 * de fuso horario.
 */

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

const DIAS_SEMANA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'
];

/* ---------------------- conversao basica -------------------------- */

function hojeISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function paraISO(ano, mes, dia) {
  const p = (n) => String(n).padStart(2, '0');
  return `${ano}-${p(mes)}-${p(dia)}`;
}

/** Converte 'YYYY-MM-DD' em Date local (meio-dia evita salto de fuso). */
function paraData(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, m - 1, d, 12, 0, 0);
}

function partes(iso) {
  const [ano, mes, dia] = String(iso).split('-').map(Number);
  return { ano, mes, dia };
}

function somarDias(iso, dias) {
  const d = paraData(iso);
  d.setDate(d.getDate() + dias);
  return hojeISO(d);
}

function ehISOValido(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''));
}

/* ---------------------- formatacao -------------------------------- */

function formatarBR(iso) {
  if (!ehISOValido(iso)) return '';
  const { ano, mes, dia } = partes(iso);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

function formatarExtenso(iso, comDiaSemana = true) {
  if (!ehISOValido(iso)) return '';
  const { ano, mes, dia } = partes(iso);
  const ds = DIAS_SEMANA[paraData(iso).getDay()];
  const base = `${dia} de ${MESES[mes - 1]} de ${ano}`;
  return comDiaSemana ? `${ds}, ${base}` : base;
}

function diaSemana(iso) {
  return DIAS_SEMANA[paraData(iso).getDay()];
}

function ordinal(n) {
  return `${n}º`;
}

/* ---------------------- calculos ---------------------------------- */

/** Domingo de Pascoa (algoritmo de Meeus/Gauss - calendario gregoriano). */
function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return paraISO(ano, mes, dia);
}

/**
 * N-esima ocorrencia de um dia da semana em um mes.
 * @param ordem  1..5 ou -1 para a ultima ocorrencia
 * @param dow    0=domingo ... 6=sabado
 */
function nthDiaSemana(ano, mes, dow, ordem) {
  if (ordem < 0) {
    const ultimo = new Date(ano, mes, 0).getDate();
    for (let d = ultimo; d >= 1; d--) {
      if (new Date(ano, mes - 1, d, 12).getDay() === dow) return paraISO(ano, mes, d);
    }
    return null;
  }
  let cont = 0;
  const ultimo = new Date(ano, mes, 0).getDate();
  for (let d = 1; d <= ultimo; d++) {
    if (new Date(ano, mes - 1, d, 12).getDay() === dow) {
      cont += 1;
      if (cont === ordem) return paraISO(ano, mes, d);
    }
  }
  return null;
}

/**
 * Resolve a data de um item do calendario permanente para um ano especifico.
 * Retorna 'YYYY-MM-DD' ou null.
 */
function resolverDataCalendario(item, ano) {
  if (!item) return null;
  if (item.tipo === 'movel' && item.regra) {
    const regra = String(item.regra).trim();

    const mPascoa = regra.match(/^pascoa\s*([+-])\s*(\d+)$/i);
    if (mPascoa) {
      const sinal = mPascoa[1] === '-' ? -1 : 1;
      return somarDias(pascoa(ano), sinal * Number(mPascoa[2]));
    }

    const mNth = regra.match(/^nth:\s*(-?\d+)\s*,\s*(\d)\s*,\s*(\d{1,2})$/i);
    if (mNth) {
      return nthDiaSemana(ano, Number(mNth[3]), Number(mNth[2]), Number(mNth[1]));
    }
    return null;
  }
  if (item.dia && item.mes) {
    // 29 de fevereiro em ano comum -> 28 de fevereiro
    const ultimo = new Date(ano, item.mes, 0).getDate();
    const dia = Math.min(item.dia, ultimo);
    return paraISO(ano, item.mes, dia);
  }
  return null;
}

/** Anos completos entre a data original e a data de referencia. */
function anosDecorridos(isoOriginal, isoRef) {
  if (!ehISOValido(isoOriginal) || !ehISOValido(isoRef)) return null;
  const o = partes(isoOriginal);
  const r = partes(isoRef);
  let anos = r.ano - o.ano;
  if (r.mes < o.mes || (r.mes === o.mes && r.dia < o.dia)) anos -= 1;
  return anos;
}

/** Verifica se dia/mes de uma data coincidem com a data de referencia. */
function mesmoDiaMes(isoOriginal, isoRef) {
  if (!ehISOValido(isoOriginal) || !ehISOValido(isoRef)) return false;
  const o = partes(isoOriginal);
  const r = partes(isoRef);
  if (o.mes === r.mes && o.dia === r.dia) return true;
  // 29/02 comemorado em 28/02 nos anos comuns
  if (o.mes === 2 && o.dia === 29 && r.mes === 2 && r.dia === 28) {
    const bissexto = new Date(r.ano, 2, 0).getDate() === 29;
    return !bissexto;
  }
  return false;
}

module.exports = {
  MESES, DIAS_SEMANA,
  hojeISO, paraISO, paraData, partes, somarDias, ehISOValido,
  formatarBR, formatarExtenso, diaSemana, ordinal,
  pascoa, nthDiaSemana, resolverDataCalendario, anosDecorridos, mesmoDiaMes
};
