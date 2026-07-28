'use strict';

/* ==================================================================
   Nucleo da interface: utilitarios, roteador, modal e notificacoes
   ================================================================== */

const App = {
  views: {},
  viewAtual: null,
  config: {},
  info: {},
  waStatus: { estado: 'desconectado' }
};

/* ---------------------- Utilitarios ------------------------------ */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function el(tag, attrs = {}, filhos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const f of [].concat(filhos)) {
    if (f === null || f === undefined || f === false) continue;
    n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
  }
  return n;
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const MESES_CURTO = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dataBR(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function dataExtenso(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES_LONGO[m - 1]} de ${a}`;
}

/** Executa uma chamada IPC tratando o envelope {ok, data, error}. */
async function chamar(promessa, msgErro = 'Falha na operação') {
  const r = await promessa;
  if (!r || !r.ok) {
    toast(`${msgErro}: ${r ? r.error : 'sem resposta'}`, 'erro');
    throw new Error(r ? r.error : 'sem resposta');
  }
  return r.data;
}

/** Igual a chamar(), mas retorna null em vez de lancar excecao. */
async function tentar(promessa, msgErro) {
  try { return await chamar(promessa, msgErro); } catch { return null; }
}

/* ---------------------- Notificacoes ----------------------------- */

function toast(msg, tipo = '', ms = 4200) {
  const t = el('div', { class: `toast ${tipo}`, text: msg });
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------------------- Modal ------------------------------------ */

const Modal = {
  abrir({ titulo, corpo, botoes = [], largura }) {
    $('#modalTitulo').textContent = titulo || '';
    const c = $('#modalCorpo');
    c.innerHTML = '';
    c.appendChild(typeof corpo === 'string' ? el('div', { html: corpo }) : corpo);
    if (largura) $('.modal-caixa').style.width = largura;

    const r = $('#modalRodape');
    r.innerHTML = '';
    for (const b of botoes) {
      r.appendChild(el('button', {
        class: `btn ${b.classe || 'secundario'}`,
        text: b.texto,
        onclick: () => b.acao ? b.acao() : Modal.fechar()
      }));
    }
    $('#modal').classList.remove('oculto');
  },
  fechar() {
    $('#modal').classList.add('oculto');
    $('.modal-caixa').style.width = '';
  }
};

function confirmar(mensagem, titulo = 'Confirmação') {
  return new Promise((resolve) => {
    Modal.abrir({
      titulo,
      corpo: el('p', { text: mensagem }),
      botoes: [
        { texto: 'Cancelar', classe: 'secundario', acao: () => { Modal.fechar(); resolve(false); } },
        { texto: 'Confirmar', classe: 'perigo', acao: () => { Modal.fechar(); resolve(true); } }
      ]
    });
  });
}

/* ---------------------- Roteador --------------------------------- */

async function navegar(nome) {
  const view = App.views[nome];
  if (!view) return;
  App.viewAtual = nome;

  $$('.nav-item').forEach((b) => b.classList.toggle('ativo', b.dataset.view === nome));
  $('#tituloView').textContent = view.titulo || nome;
  $('#subtituloView').textContent = view.subtitulo || '';
  $('#topoAcoes').innerHTML = '';
  const alvo = $('#view');
  alvo.innerHTML = '<div class="vazio">Carregando…</div>';

  try {
    await view.render(alvo);
  } catch (err) {
    alvo.innerHTML = `<div class="cartao"><h3>Erro ao carregar</h3><p>${esc(err.message)}</p></div>`;
  }
}

function recarregarView() {
  if (App.viewAtual) navegar(App.viewAtual);
}

function acaoTopo(texto, acao, classe = 'secundario') {
  $('#topoAcoes').appendChild(el('button', { class: `btn ${classe}`, text: texto, onclick: acao }));
}

/* ---------------------- Status do WhatsApp ----------------------- */

const ROTULO_ESTADO = {
  desconectado: 'WhatsApp desconectado',
  iniciando: 'WhatsApp iniciando…',
  qr: 'Aguardando leitura do QR',
  autenticado: 'WhatsApp autenticando…',
  pronto: 'WhatsApp conectado',
  erro: 'WhatsApp com erro'
};

function pintarStatusWa(st) {
  App.waStatus = st || { estado: 'desconectado' };
  const pill = $('#statusWa');
  const e = App.waStatus.estado;
  pill.textContent = ROTULO_ESTADO[e] || e;
  pill.className = 'status-pill ' + (e === 'pronto' ? 'on' : (e === 'erro' || e === 'desconectado' ? 'off' : 'warn'));
}
