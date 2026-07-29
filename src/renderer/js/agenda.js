'use strict';

App.views.agenda = {
  titulo: 'Agenda e Disparo',
  subtitulo: 'Revise as mensagens do dia antes de enviar aos grupos',

  async render(alvo) {
    alvo.innerHTML = '';

    const seletorData = el('input', { type: 'date', value: hojeISO(), style: 'max-width:180px' });
    const painel = el('div');

    const barra = el('div', { class: 'cartao' }, [
      el('div', { class: 'linha' }, [
        el('label', { class: 'campo', style: 'flex:0 0 200px' }, [el('span', { text: 'Data de referência' }), seletorData]),
        el('div', { style: 'flex:0 0 auto' }, [
          el('button', { class: 'btn secundario', text: '◀ Dia anterior', onclick: () => mover(-1) }),
          el('span', { text: ' ' }),
          el('button', { class: 'btn secundario', text: 'Hoje', onclick: () => { seletorData.value = hojeISO(); carregar(); } }),
          el('span', { text: ' ' }),
          el('button', { class: 'btn secundario', text: 'Próximo dia ▶', onclick: () => mover(1) })
        ]),
        el('div', { style: 'flex:1' }),
        el('div', { style: 'flex:0 0 auto' }, [
          el('button', { class: 'btn secundario', text: '📆 Ver mês', onclick: () => verMes(seletorData.value) }),
          el('span', { text: ' ' }),
          el('button', {
            class: 'btn', text: '🏛 Agenda da Loja',
            onclick: () => {
              const [a, m] = seletorData.value.split('-').map(Number);
              App.sessoesAno = a;
              App.sessoesMes = m;
              navegar('sessoes');
            }
          })
        ])
      ])
    ]);

    alvo.appendChild(barra);
    alvo.appendChild(painel);

    function mover(n) {
      const d = new Date(seletorData.value + 'T12:00:00');
      d.setDate(d.getDate() + n);
      seletorData.value = d.toISOString().slice(0, 10);
      carregar();
    }

    seletorData.addEventListener('change', carregar);

    async function carregar() {
      painel.innerHTML = '<div class="vazio">Carregando…</div>';
      const fila = await tentar(window.api.agenda.fila(seletorData.value), 'Falha ao montar a agenda');
      if (!fila) { painel.innerHTML = ''; return; }
      pintarFila(painel, fila, carregar);
    }

    await carregar();
  }
};

function pintarFila(painel, fila, recarregar) {
  painel.innerHTML = '';

  const cab = el('div', { class: 'cartao' }, [
    el('h3', { html: `${esc(fila.data_extenso)} <span class="contagem">${fila.total} evento(s), ${fila.total_selecionados} selecionado(s)</span>` })
  ]);

  if (fila.ja_disparado) {
    cab.appendChild(el('div', { class: 'aviso', text: 'Atenção: já existe registro de disparo para esta data. Um novo envio irá duplicar as mensagens no grupo.' }));
  }

  if (!fila.grupos.length) {
    cab.appendChild(el('div', { class: 'aviso', html: 'Nenhum grupo de destino selecionado. Acesse a aba <strong>WhatsApp</strong> para escolher os grupos.' }));
  } else {
    cab.appendChild(el('div', { class: 'aviso info', html: `Destino: <strong>${fila.grupos.map((g) => esc(g.nome)).join(', ')}</strong>` }));
  }

  painel.appendChild(cab);

  if (!fila.total) {
    painel.appendChild(el('div', { class: 'cartao' }, [el('div', { class: 'vazio', text: 'Nenhum evento nesta data.' })]));
    return;
  }

  const estado = fila.itens.map((i) => ({ ...i }));

  /* --------- Modo agrupado --------- */
  if (fila.agrupar && fila.mensagem_unica) {
    const ta = el('textarea', { class: 'fila-msg', style: 'min-height:320px' }, [fila.mensagem_unica]);
    painel.appendChild(el('div', { class: 'cartao' }, [
      el('h3', { text: 'Mensagem única do dia (modo agrupado)' }),
      ta
    ]));
    painel.appendChild(barraEnvio(async () => ({
      data: fila.data, itens: [], mensagem_unica: ta.value, grupos: fila.grupos.map((g) => g.id)
    }), fila, recarregar));
    return;
  }

  /* --------- Modo individual --------- */
  for (const item of estado) {
    const chk = el('input', { type: 'checkbox', style: 'width:auto', checked: item.selecionado });
    chk.addEventListener('change', () => {
      item.selecionado = chk.checked;
      bloco.classList.toggle('desativado', !chk.checked);
    });

    const ta = el('textarea', { class: 'fila-msg' }, [item.mensagem || '']);
    ta.addEventListener('input', () => { item.mensagem = ta.value; });

    const bloco = el('div', { class: `fila-item ${item.selecionado ? '' : 'desativado'}` }, [
      el('div', { class: 'fila-cab' }, [
        chk,
        el('strong', { text: `${item.titulo_pessoa ? item.titulo_pessoa + ' ' : ''}${item.nome || item.evento || ''}` }),
        el('span', { class: `tag ${item.categoria}`, text: item.rotulo || '' }),
        item.motivo_bloqueio ? el('small', { style: 'color:var(--c-alerta)', text: item.motivo_bloqueio }) : null
      ]),
      ta
    ]);
    painel.appendChild(bloco);
  }

  painel.appendChild(barraEnvio(async () => ({
    data: fila.data,
    itens: estado.filter((i) => i.selecionado).map((i) => ({
      id: i.id, tipo: i.tipo, nome: i.nome || i.evento, mensagem: i.mensagem
    })),
    grupos: fila.grupos.map((g) => g.id)
  }), fila, recarregar));
}

function barraEnvio(montarPayload, fila, recarregar) {
  const btn = el('button', { class: 'btn sucesso', text: '📤 Enviar aos grupos selecionados' });

  btn.addEventListener('click', async () => {
    if (App.waStatus.estado !== 'pronto') { toast('Conecte o WhatsApp antes de enviar.', 'erro'); return; }
    const payload = await montarPayload();
    const qtd = payload.mensagem_unica ? 1 : payload.itens.length;
    if (!qtd) { toast('Nenhuma mensagem selecionada.', 'erro'); return; }
    if (!payload.grupos.length) { toast('Nenhum grupo de destino selecionado.', 'erro'); return; }
    if (!await confirmar(`Enviar ${qtd} mensagem(ns) para ${payload.grupos.length} grupo(s)?`, 'Confirmar envio')) return;

    btn.disabled = true;
    btn.textContent = 'Enviando…';
    const res = await tentar(window.api.whatsapp.enviar(payload), 'Falha no envio');
    btn.disabled = false;
    btn.textContent = '📤 Enviar aos grupos selecionados';
    if (res) {
      toast(`Envio concluído: ${res.enviados} enviada(s), ${res.falhas} falha(s).`, res.falhas ? '' : 'ok');
      recarregar();
    }
  });

  return el('div', { class: 'cartao', style: 'position:sticky;bottom:0' }, [
    el('div', { class: 'linha compacta' }, [
      btn,
      el('button', { class: 'btn secundario', text: 'Recarregar', onclick: recarregar })
    ])
  ]);
}

/* ------------------------------------------------------------------ */

async function verMes(isoRef) {
  const [ano, mes] = isoRef.split('-').map(Number);
  const dados = await tentar(window.api.agenda.mes(ano, mes), 'Falha ao carregar o mês') || [];

  const corpo = el('div');
  if (!dados.length) corpo.appendChild(el('div', { class: 'vazio', text: 'Nenhum evento neste mês.' }));

  for (const dia of dados) {
    corpo.appendChild(el('h4', {
      style: 'margin:14px 0 4px;color:var(--c-acento-escuro);font-size:13px',
      text: dataExtenso(dia.data)
    }));
    for (const e of dia.eventos) {
      corpo.appendChild(el('div', { style: 'padding:4px 0;border-bottom:1px solid var(--c-borda);font-size:13px' }, [
        el('span', { class: `tag ${e.categoria}`, text: rotuloCategoria(e.categoria) }),
        el('span', { text: `  ${e.titulo_pessoa ? e.titulo_pessoa + ' ' : ''}${e.nome || e.evento || ''} — ${e.rotulo || ''}` })
      ]));
    }
  }

  Modal.abrir({
    titulo: `Agenda de ${MESES_LONGO[mes - 1]} de ${ano}`,
    corpo,
    botoes: [{ texto: 'Fechar', classe: 'secundario' }]
  });
}
