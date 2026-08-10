'use strict';

/* ==================================================================
   Presença — chamada das sessões, importação e estatísticas

   Três coisas convivem nesta tela:

     1. a CHAMADA de uma sessão, que pode ser feita aqui mesmo ou vir
        marcada do celular;
     2. a IMPORTAÇÃO do que o Chanceler enviou — arquivo .presenca ou o
        texto colado do WhatsApp — sempre com conferência antes de gravar;
     3. o PANORAMA da Loja: comparecimento ao longo do tempo e a
        frequência de cada Irmão.

   Os gráficos são desenhados em SVG à mão. Nenhuma biblioteca: são
   retângulos, e o aplicativo já é pesado o bastante.
   ================================================================== */

const MESES_PRESENCA = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dataExtensoPresenca(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).split('-').map(Number);
  return `${d} de ${MESES_PRESENCA[m - 1]} de ${a}`;
}

function svgEl(tag, attrs, filhos) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in (attrs || {})) {
    if (attrs[k] === null || attrs[k] === undefined) continue;
    n.setAttribute(k, attrs[k]);
  }
  for (const f of [].concat(filhos || [])) if (f) n.appendChild(f);
  return n;
}

App.views.presenca = {
  titulo: 'Presença',
  subtitulo: 'Lista de chamada das sessões, importação do celular e frequência dos Obreiros',

  async render(alvo) {
    const painel = el('div');
    alvo.innerHTML = '';
    alvo.appendChild(painel);

    let sessoes = await tentar(window.api.presenca.sessoes(120)) || [];
    let dataAtual = App.presencaData
      && sessoes.some((s) => s.data === App.presencaData)
      ? App.presencaData
      : (sessoes[0] || {}).data || null;

    acaoTopo('📥 Importar do celular', () => abrirImportacao(), '');

    async function carregar() {
      App.presencaData = dataAtual;
      painel.innerHTML = '<div class="vazio">Carregando…</div>';

      const [lista, est] = await Promise.all([
        dataAtual ? tentar(window.api.presenca.lista(dataAtual)) : Promise.resolve(null),
        tentar(window.api.presenca.estatisticas({}))
      ]);

      painel.innerHTML = '';
      painel.appendChild(cartaoChamada(lista));
      painel.appendChild(cartaoPanorama(est));
      painel.appendChild(cartaoFrequencia(est));
    }

    /* ---------------------------------------------------------------- */
    /* 1. Chamada da sessão                                              */
    /* ---------------------------------------------------------------- */

    function cartaoChamada(lista) {
      const card = el('div', { class: 'cartao' }, [el('h3', { text: 'Lista de chamada' })]);

      if (!sessoes.length) {
        card.appendChild(el('div', {
          class: 'aviso',
          html: 'Nenhuma sessão cadastrada. Programe as sessões em <strong>Agenda da Loja</strong> '
            + 'antes de fazer a chamada.'
        }));
        return card;
      }

      const sel = el('select', { style: 'max-width:420px' });
      for (const s of sessoes) {
        sel.appendChild(el('option', {
          value: s.data,
          selected: s.data === dataAtual,
          text: `${s.data.slice(8, 10)}/${s.data.slice(5, 7)}/${s.data.slice(0, 4)} — ${s.rotulo}`
            + (s.tem_chamada ? '   ✓ chamada feita' : '')
        }));
      }
      sel.addEventListener('change', () => { dataAtual = sel.value; carregar(); });

      card.appendChild(el('label', { class: 'campo' }, [el('span', { text: 'Sessão' }), sel]));

      if (!lista) return card;

      card.appendChild(el('div', { class: 'aviso info', style: 'margin-top:4px' }, [
        el('div', {
          html: `<strong>${esc(dataExtensoPresenca(lista.data))}</strong> — ${esc(lista.rotulo || 'sessão sem grau definido')}`
            + (lista.tem_chamada ? '' : ' &middot; <em>chamada ainda não registrada</em>')
        })
      ]));

      /* --- marcação --- */

      const marcados = {};
      for (const i of lista.itens) marcados[i.obreiro_id] = i.presente;

      const contador = el('div', {
        style: 'font-weight:600;color:var(--c-acento-escuro);margin:10px 0 6px'
      });

      const atualizar = () => {
        const n = lista.itens.filter((i) => marcados[i.obreiro_id]).length;
        contador.textContent = `${n} presentes de ${lista.total}`
          + (lista.total ? `  (${Math.round((n / lista.total) * 100)}%)` : '');
      };

      const corpo = el('tbody');
      for (const i of lista.itens) {
        const chk = el('input', { type: 'checkbox', style: 'width:auto' });
        chk.checked = i.presente;
        const tr = el('tr', {}, [
          el('td', { style: 'width:40px;text-align:center' }, [chk]),
          el('td', { style: 'font-weight:600', text: (i.tratamento || '') + ' ' + i.nome }),
          el('td', { style: 'width:120px;color:var(--c-texto-suave)', text: i.grau || '' })
        ]);
        chk.addEventListener('change', () => {
          marcados[i.obreiro_id] = chk.checked;
          tr.style.background = chk.checked ? '#EAF7F0' : '';
          atualizar();
        });
        tr.style.background = chk.checked ? '#EAF7F0' : '';
        corpo.appendChild(tr);
      }
      atualizar();

      card.appendChild(contador);
      card.appendChild(el('div', { class: 'linha compacta', style: 'margin-bottom:8px' }, [
        el('button', {
          class: 'btn secundario', text: '✓ Marcar todos',
          onclick: () => {
            for (const c of corpo.querySelectorAll('input')) { c.checked = true; c.dispatchEvent(new Event('change')); }
          }
        }),
        el('button', {
          class: 'btn secundario', text: '✗ Desmarcar todos',
          onclick: () => {
            for (const c of corpo.querySelectorAll('input')) { c.checked = false; c.dispatchEvent(new Event('change')); }
          }
        })
      ]));

      if (!lista.itens.length) {
        card.appendChild(el('div', { class: 'vazio', text: 'Nenhum Obreiro ativo no quadro.' }));
      } else {
        card.appendChild(el('table', {}, [corpo]));
      }

      const responsavel = el('input', {
        type: 'text', placeholder: 'Quem fez a chamada (opcional)', style: 'max-width:320px'
      });
      card.appendChild(el('label', { class: 'campo', style: 'margin-top:12px' }, [
        el('span', { text: 'Registrado por' }), responsavel
      ]));

      card.appendChild(el('div', { class: 'linha compacta', style: 'margin-top:10px' }, [
        el('button', {
          class: 'btn', text: '💾 Gravar chamada',
          onclick: async () => {
            const r = await tentar(window.api.presenca.salvar({
              sessao_data: lista.data,
              registrado_por: responsavel.value.trim() || null,
              itens: lista.itens.map((i) => ({ obreiro_id: i.obreiro_id, presente: !!marcados[i.obreiro_id] }))
            }), 'Falha ao gravar a chamada');
            if (!r) return;
            toast(`Chamada gravada: ${r.presentes} presentes, ${r.ausentes} ausentes.`, 'ok', 6000);
            sessoes = await tentar(window.api.presenca.sessoes(120)) || sessoes;
            carregar();
          }
        }),
        el('button', {
          class: 'btn secundario', text: '📄 Exportar PDF para arquivo',
          onclick: async () => {
            const r = await tentar(window.api.presenca.exportarPdf(lista.data), 'Falha ao gerar o PDF');
            if (r && !r.cancelado) toast(`PDF salvo em ${r.arquivo}`, 'ok', 8000);
          }
        }),
        lista.tem_chamada ? el('button', {
          class: 'btn perigo', text: '🗑 Apagar esta chamada',
          onclick: async () => {
            if (!await confirmar(`Apagar a chamada de ${dataExtensoPresenca(lista.data)}? `
              + 'Os registros desta sessão serão removidos.')) return;
            const r = await tentar(window.api.presenca.limpar(lista.data), 'Falha ao apagar');
            if (!r) return;
            toast('Chamada apagada.', 'ok');
            sessoes = await tentar(window.api.presenca.sessoes(120)) || sessoes;
            carregar();
          }
        }) : null
      ]));

      return card;
    }

    /* ---------------------------------------------------------------- */
    /* 2. Panorama da Loja                                               */
    /* ---------------------------------------------------------------- */

    function cartaoPanorama(est) {
      const card = el('div', { class: 'cartao' }, [el('h3', { text: 'Comparecimento ao longo do tempo' })]);

      if (!est || !est.total_sessoes) {
        card.appendChild(el('div', { class: 'vazio', text: 'Nenhuma chamada registrada ainda.' }));
        return card;
      }

      card.appendChild(el('div', { class: 'linha', style: 'margin-bottom:14px' }, [
        metrica(est.total_sessoes, 'Sessões com chamada'),
        metrica(est.media_presentes, 'Média de presentes'),
        metrica(est.percentual_medio + '%', 'Comparecimento médio'),
        metrica(est.quadro, 'Obreiros no quadro')
      ]));

      card.appendChild(graficoBarras(est.sessoes));

      const detalhe = [];
      if (est.melhor) detalhe.push(`Maior comparecimento: ${dataExtensoPresenca(est.melhor.data)} — ${est.melhor.presentes} de ${est.melhor.total} (${est.melhor.percentual}%)`);
      if (est.pior) detalhe.push(`Menor: ${dataExtensoPresenca(est.pior.data)} — ${est.pior.presentes} de ${est.pior.total} (${est.pior.percentual}%)`);
      if (detalhe.length) {
        card.appendChild(el('p', {
          style: 'font-size:12.5px;color:var(--c-texto-suave);line-height:1.6;margin:12px 0 0',
          text: detalhe.join('  ·  ')
        }));
      }

      return card;
    }

    function metrica(valor, rotulo) {
      return el('div', {
        style: 'flex:1;background:var(--c-acento-suave);border:1px solid #B9E0F2;border-radius:8px;padding:12px;text-align:center'
      }, [
        el('div', { style: 'font-size:26px;font-weight:700;color:var(--c-acento)', text: String(valor) }),
        el('div', { style: 'font-size:11.5px;color:var(--c-texto-suave);margin-top:2px', text: rotulo })
      ]);
    }

    /** Barras verticais, uma por sessão, com a linha da média. */
    function graficoBarras(linhas) {
      const dados = linhas.slice(-24);
      const L = 900, A = 240, base = A - 34, topo = 16;
      const larg = L / Math.max(dados.length, 1);
      const barra = Math.min(larg * 0.62, 34);

      const g = svgEl('svg', {
        viewBox: `0 0 ${L} ${A}`, style: 'width:100%;height:auto;display:block'
      });

      // Réguas de 25 em 25 por cento
      for (const pct of [25, 50, 75, 100]) {
        const y = base - (pct / 100) * (base - topo);
        g.appendChild(svgEl('line', {
          x1: 26, y1: y, x2: L, y2: y, stroke: '#A9D4D0', 'stroke-width': 1, opacity: '.6'
        }));
        g.appendChild(svgEl('text', {
          x: 22, y: y + 3, 'text-anchor': 'end', 'font-size': '9', fill: '#4A6168'
        }, [document.createTextNode(pct + '%')]));
      }

      const media = dados.reduce((s, d) => s + d.percentual, 0) / (dados.length || 1);
      const yM = base - (media / 100) * (base - topo);
      g.appendChild(svgEl('line', {
        x1: 26, y1: yM, x2: L, y2: yM,
        stroke: '#008CCC', 'stroke-width': 1.5, 'stroke-dasharray': '6 4'
      }));

      dados.forEach((d, i) => {
        const alt = Math.max(2, (d.percentual / 100) * (base - topo));
        const x = 26 + i * ((L - 26) / dados.length) + (((L - 26) / dados.length) - barra) / 2;

        const ret = svgEl('rect', {
          x, y: base - alt, width: barra, height: alt, rx: 3,
          fill: d.percentual >= media ? '#008CCC' : '#8FC4DA'
        });
        ret.appendChild(svgEl('title', {}, [document.createTextNode(
          `${dataExtensoPresenca(d.data)}\n${d.rotulo || ''}\n${d.presentes} de ${d.total} (${d.percentual}%)`
        )]));
        g.appendChild(ret);

        g.appendChild(svgEl('text', {
          x: x + barra / 2, y: base - alt - 4, 'text-anchor': 'middle',
          'font-size': '10', fill: '#10262B', 'font-weight': '600'
        }, [document.createTextNode(String(d.presentes))]));

        g.appendChild(svgEl('text', {
          x: x + barra / 2, y: A - 16, 'text-anchor': 'middle', 'font-size': '9', fill: '#4A6168'
        }, [document.createTextNode(d.data.slice(8, 10) + '/' + d.data.slice(5, 7))]));
      });

      g.appendChild(svgEl('line', { x1: 26, y1: base, x2: L, y2: base, stroke: '#10262B', 'stroke-width': 1 }));

      const caixa = el('div');
      caixa.appendChild(g);
      caixa.appendChild(el('p', {
        style: 'font-size:12px;color:var(--c-texto-suave);margin:6px 0 0',
        text: 'Cada barra é uma sessão com chamada registrada; o número acima é quantos Irmãos '
          + 'compareceram. A linha tracejada marca a média do período. Passe o mouse para ver o detalhe.'
      }));
      return caixa;
    }

    /* ---------------------------------------------------------------- */
    /* 3. Frequência por Obreiro                                         */
    /* ---------------------------------------------------------------- */

    function cartaoFrequencia(est) {
      const card = el('div', { class: 'cartao' }, [el('h3', { text: 'Frequência dos Obreiros' })]);

      if (!est || !est.obreiros.length) {
        card.appendChild(el('div', { class: 'vazio', text: 'Sem dados de frequência ainda.' }));
        return card;
      }

      card.appendChild(el('div', { class: 'linha compacta', style: 'margin-bottom:12px' }, [
        el('button', {
          class: 'btn', text: '📄 Exportar relatório para o mural',
          onclick: async () => {
            const r = await tentar(window.api.presenca.exportarPdfFrequencia({}), 'Falha ao gerar o relatório');
            if (r && !r.cancelado) toast(`Relatório salvo em ${r.arquivo}`, 'ok', 8000);
          }
        })
      ]));
      card.appendChild(el('p', {
        style: 'font-size:12px;color:var(--c-texto-suave);margin:0 0 12px',
        text: 'Gera um PDF com o gráfico de comparecimento e a frequência de cada Irmão, '
          + 'pronto para imprimir e afixar no mural da Loja.'
      }));

      const corpo = el('tbody');
      for (const o of est.obreiros) {
        const cor = o.percentual >= 75 ? 'var(--c-ok)'
          : (o.percentual >= 50 ? 'var(--c-acento)' : '#D98324');

        const barra = el('div', {
          style: 'height:9px;background:var(--c-fundo-claro);border-radius:5px;overflow:hidden;min-width:120px'
        }, [
          el('div', {
            style: `height:100%;border-radius:5px;background:${cor};width:${Math.max(2, o.percentual)}%`
          })
        ]);

        corpo.appendChild(el('tr', {}, [
          el('td', { style: 'font-weight:600', text: (o.tratamento || '') + ' ' + o.nome }),
          el('td', { style: 'width:110px;color:var(--c-texto-suave)', text: o.grau || '' }),
          el('td', { style: 'width:210px' }, [barra]),
          el('td', { style: `width:70px;text-align:right;font-weight:700;color:${cor}`, text: o.percentual + '%' }),
          el('td', {
            style: 'width:150px;color:var(--c-texto-suave);font-size:12.5px',
            text: `${o.presencas} de ${o.chamadas}`
          }),
          el('td', {
            style: 'width:130px;color:var(--c-texto-suave);font-size:12.5px',
            text: o.ultima_presenca ? 'Última: ' + o.ultima_presenca.split('-').reverse().join('/') : 'sem presença'
          })
        ]));
      }

      card.appendChild(el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Obreiro' }), el('th', { text: 'Grau' }),
          el('th', { text: 'Frequência' }), el('th', { text: '%' }),
          el('th', { text: 'Presenças' }), el('th', { text: 'Última' })
        ])]),
        corpo
      ]));

      card.appendChild(el('p', {
        style: 'font-size:12px;color:var(--c-texto-suave);margin:10px 0 0;line-height:1.6',
        text: 'O denominador é por Obreiro, não da Loja: quem entrou no quadro depois não é '
          + 'cobrado pelas sessões anteriores a ele.'
      }));

      return card;
    }

    /* ---------------------------------------------------------------- */
    /* Importação do celular                                             */
    /* ---------------------------------------------------------------- */

    function abrirImportacao() {
      const colado = el('textarea', {
        rows: '7', style: 'width:100%;font-family:Consolas,monospace;font-size:12px',
        placeholder: 'Cole aqui a mensagem recebida pelo WhatsApp, inteira, incluindo as linhas com traços…'
      });

      Modal.abrir({
        titulo: 'Importar lista de presença do celular',
        largura: '760px',
        corpo: el('div', {}, [
          el('p', {
            style: 'font-size:13px;color:var(--c-texto-suave);line-height:1.6;margin-top:0',
            text: 'O celular não grava no cadastro: a lista marcada durante a sessão chega aqui por '
              + 'arquivo ou pelo WhatsApp. Nada é gravado antes de você conferir.'
          }),
          el('div', { class: 'linha compacta', style: 'margin-bottom:14px' }, [
            el('button', {
              class: 'btn', text: '📂 Abrir arquivo .presenca',
              onclick: async () => {
                const r = await tentar(window.api.presenca.lerPacote('arquivo'), 'Falha ao ler o arquivo');
                if (r && !r.cancelado) { Modal.fechar(); conferir(r); }
              }
            })
          ]),
          el('label', { class: 'campo' }, [
            el('span', { text: 'ou cole o texto do WhatsApp' }), colado
          ])
        ]),
        botoes: [
          { texto: 'Cancelar', classe: 'secundario' },
          {
            texto: 'Ler texto colado',
            classe: '',
            acao: async () => {
              if (!colado.value.trim()) { toast('Cole a mensagem recebida.', 'erro'); return; }
              const r = await tentar(window.api.presenca.lerPacote('texto', colado.value), 'Falha ao ler a lista');
              if (!r || r.cancelado) return;      // o erro já foi mostrado; o modal fica aberto
              Modal.fechar();
              conferir(r);
            }
          }
        ]
      });
    }

    /** Mostra o que vai mudar e só grava depois do aceite. */
    function conferir(r) {
      const p = r.pacote;
      const presentes = r.itens.filter((i) => i.presente);

      const corpo = el('tbody');
      for (const i of r.itens) {
        corpo.appendChild(el('tr', {}, [
          el('td', {
            style: `width:34px;text-align:center;font-size:15px;color:${i.presente ? 'var(--c-ok)' : 'var(--c-texto-suave)'}`,
            text: i.presente ? '✓' : '·'
          }),
          el('td', {
            style: i.desconhecido ? 'color:var(--c-erro)' : 'font-weight:600',
            text: i.desconhecido
              ? `Obreiro nº ${i.obreiro_id} — não existe neste cadastro`
              : (i.tratamento || '') + ' ' + i.nome
          }),
          el('td', {
            style: 'width:120px;color:var(--c-texto-suave);font-size:12.5px',
            text: i.mudou ? 'muda' : ''
          })
        ]));
      }

      Modal.abrir({
        titulo: 'Conferir antes de gravar',
        largura: '760px',
        corpo: el('div', {}, [
          el('div', { class: 'aviso info' }, [
            el('div', { html: `<strong>${esc(dataExtensoPresenca(p.data))}</strong>`
              + (p.grau ? ` — Sessão ${esc(p.tipo || '')} no Grau de ${esc(p.grau)}` : '') }),
            el('div', { text: `${presentes.length} presentes de ${r.itens.length}` }),
            p.chamadaPor ? el('div', { text: 'Chamada feita por ' + p.chamadaPor }) : null,
            !r.sessao ? el('div', {
              style: 'color:var(--c-erro)',
              text: 'Atenção: não há sessão cadastrada nesta data na Agenda da Loja.'
            }) : null
          ]),

          r.ja_existia ? el('div', {
            class: 'aviso',
            text: 'Esta sessão já tinha chamada registrada. Gravar substitui a anterior.'
          }) : null,

          r.desconhecidos ? el('div', {
            class: 'aviso', style: 'border-color:#F0BDB5;background:#FBE9E7',
            text: `${r.desconhecidos} Obreiro(s) da lista não existem neste cadastro e serão ignorados. `
              + 'Isso acontece quando o celular está com uma publicação antiga.'
          }) : null,

          el('div', { style: 'max-height:46vh;overflow:auto;margin-top:10px' }, [
            el('table', {}, [corpo])
          ])
        ]),
        botoes: [
          { texto: 'Cancelar', classe: 'secundario' },
          {
            texto: '💾 Gravar chamada',
            classe: '',
            acao: async () => {
              const gravado = await tentar(window.api.presenca.salvar({
                sessao_data: p.data,
                origem: 'celular',
                registrado_por: p.chamadaPor,
                itens: r.itens.map((i) => ({ obreiro_id: i.obreiro_id, presente: i.presente }))
              }), 'Falha ao gravar a chamada');
              if (!gravado) return;

              Modal.fechar();
              toast(`Chamada de ${dataExtensoPresenca(p.data)} gravada: `
                + `${gravado.presentes} presentes.`, 'ok', 7000);

              dataAtual = p.data;
              sessoes = await tentar(window.api.presenca.sessoes(120)) || sessoes;
              carregar();
            }
          }
        ]
      });
    }

    await carregar();
  }
};
