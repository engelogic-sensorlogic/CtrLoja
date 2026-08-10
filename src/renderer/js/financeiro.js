'use strict';

/* ==================================================================
   Financeiro — Tesouraria e Hospitalaria

   Uma tela só para as duas áreas. Elas têm a mesma forma — entra
   dinheiro, sai dinheiro, sobra um saldo — e o que muda são os rótulos
   e as categorias, declarados em src/main/services/financeiro.js. Duas
   telas quase iguais seriam duas oportunidades de divergir.

   Aqui se lança, se corrige, se acompanha o mês a mês e se importa o
   que o cargo enviou do celular.
   ================================================================== */

const MESES_FIN = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function mesExtensoFin(mes) {
  const [a, m] = String(mes || '').split('-').map(Number);
  return (a && m) ? `${MESES_FIN[m - 1]} de ${a}` : '';
}

function somarMesFin(mes, n) {
  const [a, m] = String(mes).split('-').map(Number);
  const d = new Date(a, (m - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesAtualFin() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hojeFin() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Real com separador de milhar. O sinal vem antes do símbolo. */
function moedaFin(v) {
  const n = Number(v || 0);
  const partes = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '- ' : '') + 'R$ '
    + partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + partes[1];
}

function svgFin(tag, attrs, filhos) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in (attrs || {})) {
    if (attrs[k] === null || attrs[k] === undefined) continue;
    n.setAttribute(k, attrs[k]);
  }
  for (const f of [].concat(filhos || [])) if (f) n.appendChild(f);
  return n;
}

App.views.financeiro = {
  titulo: 'Financeiro',
  subtitulo: 'Tesouraria e Hospitalaria — lançamentos, extrato e prestação de contas',

  async render(alvo) {
    const painel = el('div');
    alvo.innerHTML = '';
    alvo.appendChild(painel);

    const areas = await tentar(window.api.financeiro.areas()) || [];
    if (!areas.length) {
      painel.innerHTML = '<div class="vazio">Não foi possível carregar as áreas financeiras.</div>';
      return;
    }

    let areaAtual = App.financeiroArea || areas[0].chave;
    let mesAtual = App.financeiroMes || mesAtualFin();

    acaoTopo('📥 Importar do celular', () => abrirImportacao(), '');

    const area = () => areas.find((a) => a.chave === areaAtual) || areas[0];

    async function carregar() {
      App.financeiroArea = areaAtual;
      App.financeiroMes = mesAtual;
      painel.innerHTML = '<div class="vazio">Carregando…</div>';

      const [extrato, quadro] = await Promise.all([
        tentar(window.api.financeiro.extrato(areaAtual, mesAtual)),
        tentar(window.api.financeiro.painel(areaAtual, 12))
      ]);

      painel.innerHTML = '';
      painel.appendChild(abas());
      if (!extrato) return;
      painel.appendChild(cartaoLancar(extrato));
      painel.appendChild(cartaoExtrato(extrato));
      if (quadro && quadro.tem_dados) painel.appendChild(cartaoEvolucao(quadro));
    }

    /* ---------------------------------------------------------------- */

    function abas() {
      const barra = el('div', { class: 'linha compacta', style: 'margin-bottom:14px' });
      for (const a of areas) {
        barra.appendChild(el('button', {
          class: 'btn' + (a.chave === areaAtual ? '' : ' secundario'),
          text: a.nome,
          onclick: () => { areaAtual = a.chave; carregar(); }
        }));
      }
      return barra;
    }

    /* ---------------- novo lançamento ---------------- */

    function cartaoLancar(extrato) {
      const naturezas = area().naturezas;

      const selNat = el('select', {});
      for (const n of naturezas) selNat.appendChild(el('option', { value: n.chave, text: n.nome }));

      const selCat = el('select', {});
      const pintarCat = () => {
        const n = naturezas.find((x) => x.chave === selNat.value) || naturezas[0];
        selCat.innerHTML = '';
        for (const c of n.categorias) selCat.appendChild(el('option', { value: c, text: c }));
      };
      selNat.addEventListener('change', pintarCat);
      pintarCat();

      const inData = el('input', { type: 'date', value: extrato.mes + '-01' });
      const inValor = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0,00' });
      const inDesc = el('input', { type: 'text', placeholder: 'Descrição (opcional)' });
      const inQuem = el('input', { type: 'text', placeholder: 'Lançado por (opcional)' });

      const campo = (rot, inp) => el('label', { class: 'campo' }, [el('span', { text: rot }), inp]);

      return el('div', { class: 'cartao' }, [
        el('h3', { text: 'Novo lançamento — ' + area().nome }),
        el('div', { class: 'linha' }, [
          campo('Natureza', selNat), campo('Categoria', selCat),
          campo('Data', inData), campo('Valor (R$)', inValor)
        ]),
        el('div', { class: 'linha' }, [campo('Descrição', inDesc), campo('Lançado por', inQuem)]),
        el('div', { class: 'linha compacta' }, [
          el('button', {
            class: 'btn', text: '＋ Lançar',
            onclick: async () => {
              const valor = Number(inValor.value);
              if (!inData.value) { toast('Informe a data.', 'erro'); return; }
              if (!Number.isFinite(valor) || valor <= 0) { toast('Informe um valor maior que zero.', 'erro'); return; }

              const r = await tentar(window.api.financeiro.salvar({
                area: areaAtual, natureza: selNat.value, categoria: selCat.value,
                descricao: inDesc.value.trim() || null, valor,
                data: inData.value, registrado_por: inQuem.value.trim() || null
              }), 'Falha ao lançar');
              if (!r) return;

              toast('Lançamento gravado.', 'ok');
              mesAtual = r.lancamento.data.slice(0, 7);
              carregar();
            }
          })
        ])
      ]);
    }

    /* ---------------- extrato do mês ---------------- */

    function cartaoExtrato(extrato) {
      const card = el('div', { class: 'cartao' }, [
        el('div', { class: 'linha compacta', style: 'align-items:center;margin-bottom:10px' }, [
          el('button', { class: 'btn secundario', text: '‹', onclick: () => { mesAtual = somarMesFin(mesAtual, -1); carregar(); } }),
          el('h3', {
            style: 'flex:1;text-align:center;margin:0;text-transform:capitalize',
            text: extrato.mes_extenso
          }),
          el('button', { class: 'btn secundario', text: '›', onclick: () => { mesAtual = somarMesFin(mesAtual, 1); carregar(); } })
        ])
      ]);

      if (mesAtual !== mesAtualFin()) {
        card.appendChild(el('div', { class: 'linha compacta', style: 'margin-bottom:10px' }, [
          el('button', { class: 'btn secundario', text: 'Voltar para o mês atual', onclick: () => { mesAtual = mesAtualFin(); carregar(); } })
        ]));
      }

      const destaque = (valor, rotulo, cor) => el('div', {
        style: `flex:1;border:1px solid var(--c-borda);border-radius:8px;padding:12px;text-align:center;background:${cor || 'var(--c-acento-suave)'}`
      }, [
        el('div', { style: 'font-size:21px;font-weight:700', text: moedaFin(valor) }),
        el('div', { style: 'font-size:11.5px;color:var(--c-texto-suave);margin-top:2px', text: rotulo })
      ]);

      const linha = el('div', { class: 'linha', style: 'margin-bottom:14px' });
      for (const n of extrato.naturezas) linha.appendChild(destaque(n.total, n.nome, '#F1F8F7'));
      linha.appendChild(destaque(extrato.saldo, 'Saldo do mês',
        extrato.saldo < 0 ? '#FBE9E7' : '#EAF7F0'));
      linha.appendChild(destaque(extrato.acumulado, 'Acumulado', '#E3F2F1'));
      card.appendChild(linha);

      if (!extrato.tem_lancamento) {
        card.appendChild(el('div', { class: 'vazio', text: 'Nenhum lançamento neste mês.' }));
        return card;
      }

      for (const n of extrato.naturezas) {
        if (!n.itens.length) continue;

        const corpo = el('tbody');
        for (const i of n.itens) {
          corpo.appendChild(el('tr', {}, [
            el('td', { style: 'width:96px', text: i.data.split('-').reverse().join('/') }),
            el('td', { style: 'width:190px;font-weight:600', text: i.categoria || 'Outros' }),
            el('td', { text: i.descricao || '' }),
            el('td', {
              style: 'width:70px;color:var(--c-texto-suave);font-size:12px',
              text: i.origem === 'celular' ? '📱 celular' : ''
            }),
            el('td', { style: 'width:120px;text-align:right;font-weight:700', text: moedaFin(i.valor) }),
            el('td', { style: 'width:40px;text-align:center' }, [
              el('button', {
                class: 'btn secundario', style: 'padding:2px 8px', text: '🗑',
                onclick: async () => {
                  if (!await confirmar(`Excluir o lançamento de ${moedaFin(i.valor)} em ${i.categoria || 'Outros'}?`)) return;
                  const r = await tentar(window.api.financeiro.excluir(i.id), 'Falha ao excluir');
                  if (r) { toast('Lançamento excluído.', 'ok'); carregar(); }
                }
              })
            ])
          ]));
        }

        card.appendChild(el('h3', {
          style: 'font-size:14px;margin:16px 0 6px',
          text: `${n.nome} — ${moedaFin(n.total)}`
        }));
        card.appendChild(el('table', {}, [corpo]));
      }

      return card;
    }

    /* ---------------- evolução ---------------- */

    function cartaoEvolucao(quadro) {
      const card = el('div', { class: 'cartao' }, [el('h3', { text: 'Movimento mês a mês' })]);

      const dados = quadro.serie.slice(-12);
      const entram = quadro.naturezas.filter((n) => n.sinal > 0).map((n) => n.chave);
      const saem = quadro.naturezas.filter((n) => n.sinal < 0).map((n) => n.chave);
      const soma = (p, chaves) => chaves.reduce((s, c) => s + (Number(p[c]) || 0), 0);
      const maior = Math.max(1, ...dados.map((p) => Math.max(soma(p, entram), soma(p, saem))));

      const L = 900, A = 250, base = A - 40, topo = 16, esq = 70;
      const passo = (L - esq) / dados.length;
      const barra = Math.min(passo * 0.32, 34);

      const g = svgFin('svg', { viewBox: `0 0 ${L} ${A}`, style: 'width:100%;height:auto;display:block' });

      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const y = base - f * (base - topo);
        g.appendChild(svgFin('line', { x1: esq, y1: y, x2: L, y2: y, stroke: '#A9D4D0', 'stroke-width': 1, opacity: '.6' }));
        g.appendChild(svgFin('text', { x: esq - 6, y: y + 4, 'text-anchor': 'end', 'font-size': '9', fill: '#4A6168' },
          [document.createTextNode(moedaFin(maior * f))]));
      }

      dados.forEach((p, i) => {
        const meio = esq + i * passo + passo / 2;
        const alt = (v) => Math.max(2, (v / maior) * (base - topo));
        const hE = alt(soma(p, entram));
        const hS = alt(soma(p, saem));

        const rE = svgFin('rect', { x: meio - barra - 2, y: base - hE, width: barra, height: hE, rx: 3, fill: '#1E8E5A' });
        rE.appendChild(svgFin('title', {}, [document.createTextNode(`${p.mes_extenso}\nEntradas: ${moedaFin(soma(p, entram))}`)]));
        g.appendChild(rE);

        const rS = svgFin('rect', { x: meio + 2, y: base - hS, width: barra, height: hS, rx: 3, fill: '#D98324' });
        rS.appendChild(svgFin('title', {}, [document.createTextNode(`${p.mes_extenso}\nSaídas: ${moedaFin(soma(p, saem))}`)]));
        g.appendChild(rS);

        g.appendChild(svgFin('text', { x: meio, y: A - 22, 'text-anchor': 'middle', 'font-size': '9', fill: '#4A6168' },
          [document.createTextNode(p.mes.slice(5) + '/' + p.mes.slice(2, 4))]));
        g.appendChild(svgFin('text', {
          x: meio, y: A - 8, 'text-anchor': 'middle', 'font-size': '9',
          fill: p.saldo < 0 ? '#C0392B' : '#1E8E5A', 'font-weight': '600'
        }, [document.createTextNode(moedaFin(p.saldo))]));
      });

      g.appendChild(svgFin('line', { x1: esq, y1: base, x2: L, y2: base, stroke: '#10262B', 'stroke-width': 1 }));
      card.appendChild(g);

      card.appendChild(el('p', {
        style: 'font-size:12px;color:var(--c-texto-suave);margin:8px 0 0',
        html: '<span style="color:#1E8E5A">■</span> entradas &nbsp; '
          + '<span style="color:#D98324">■</span> saídas &nbsp;·&nbsp; '
          + 'o valor abaixo de cada par é o saldo do mês. '
          + `Saldo acumulado: <strong>${moedaFin(quadro.saldo_atual)}</strong>`
          + (quadro.investido ? ` &nbsp;·&nbsp; investido: <strong>${moedaFin(quadro.investido)}</strong>` : '')
      }));

      return card;
    }

    /* ---------------- importação do celular ---------------- */

    function abrirImportacao() {
      const colado = el('textarea', {
        rows: '7', style: 'width:100%;font-family:Consolas,monospace;font-size:12px',
        placeholder: 'Cole aqui a mensagem recebida pelo WhatsApp, inteira, incluindo as linhas com traços…'
      });

      Modal.abrir({
        titulo: 'Importar lançamento do celular',
        largura: '760px',
        corpo: el('div', {}, [
          el('p', {
            style: 'font-size:13px;color:var(--c-texto-suave);line-height:1.6;margin-top:0',
            text: 'O celular não grava no cadastro: o lançamento feito lá chega aqui por arquivo '
              + 'ou pelo WhatsApp. Nada é gravado antes de você conferir.'
          }),
          el('div', { class: 'linha compacta', style: 'margin-bottom:14px' }, [
            el('button', {
              class: 'btn', text: '📂 Abrir arquivo .financeiro',
              onclick: async () => {
                const r = await tentar(window.api.financeiro.lerPacote('arquivo'), 'Falha ao ler o arquivo');
                if (r && !r.cancelado) { Modal.fechar(); conferir(r); }
              }
            })
          ]),
          el('label', { class: 'campo' }, [el('span', { text: 'ou cole o texto do WhatsApp' }), colado])
        ]),
        botoes: [
          { texto: 'Cancelar', classe: 'secundario' },
          {
            texto: 'Ler texto colado',
            classe: '',
            acao: async () => {
              if (!colado.value.trim()) { toast('Cole a mensagem recebida.', 'erro'); return; }
              const r = await tentar(window.api.financeiro.lerPacote('texto', colado.value), 'Falha ao ler o lançamento');
              if (!r || r.cancelado) return;
              Modal.fechar();
              conferir(r);
            }
          }
        ]
      });
    }

    function conferir(r) {
      const p = r.pacote;
      const corpo = el('tbody');
      for (const i of p.itens) {
        corpo.appendChild(el('tr', {}, [
          el('td', { style: 'width:96px', text: i.data.split('-').reverse().join('/') }),
          el('td', { style: 'width:120px;font-weight:600', text: i.natureza }),
          el('td', { style: 'width:180px', text: i.categoria || 'Outros' }),
          el('td', { text: i.descricao || '' }),
          el('td', { style: 'width:120px;text-align:right;font-weight:700', text: moedaFin(i.valor) })
        ]));
      }

      Modal.abrir({
        titulo: 'Conferir antes de gravar',
        largura: '780px',
        corpo: el('div', {}, [
          el('div', { class: 'aviso info' }, [
            el('div', { html: `<strong>${esc(r.area_nome)}</strong> — ${p.total} lançamento(s), somando <strong>${moedaFin(r.total)}</strong>` }),
            p.lancadoPor ? el('div', { text: 'Lançado por ' + p.lancadoPor }) : null
          ]),
          r.desconhecidas ? el('div', {
            class: 'aviso', style: 'border-color:#F0BDB5;background:#FBE9E7',
            text: `${r.desconhecidas} lançamento(s) têm natureza que esta área não movimenta e serão recusados.`
          }) : null,
          el('div', { style: 'max-height:46vh;overflow:auto;margin-top:10px' }, [el('table', {}, [corpo])])
        ]),
        botoes: [
          { texto: 'Cancelar', classe: 'secundario' },
          {
            texto: '💾 Gravar lançamentos',
            classe: '',
            acao: async () => {
              const gravado = await tentar(window.api.financeiro.importar(p), 'Falha ao gravar');
              if (!gravado) return;
              Modal.fechar();
              toast(`${gravado.gravados} lançamento(s) gravados.`, 'ok', 6000);
              areaAtual = p.area;
              mesAtual = p.itens[0].data.slice(0, 7);
              carregar();
            }
          }
        ]
      });
    }

    await carregar();
  }
};
