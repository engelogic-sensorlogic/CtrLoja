'use strict';

App.views.historico = {
  titulo: 'Histórico de Envios',
  subtitulo: 'Registro de todas as mensagens disparadas',

  async render(alvo) {
    const hoje = new Date();
    const de = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1).toISOString().slice(0, 10);

    const inDe = el('input', { type: 'date', value: de });
    const inAte = el('input', { type: 'date', value: hojeISO() });
    const selStatus = el('select', {}, [
      el('option', { value: '', text: 'Todos os status' }),
      el('option', { value: 'enviado', text: 'Enviados' }),
      el('option', { value: 'erro', text: 'Com erro' })
    ]);

    const corpo = el('div');
    alvo.innerHTML = '';
    alvo.appendChild(el('div', { class: 'cartao' }, [
      el('div', { class: 'linha', style: 'margin-bottom:12px' }, [
        el('label', { class: 'campo' }, [el('span', { text: 'De' }), inDe]),
        el('label', { class: 'campo' }, [el('span', { text: 'Até' }), inAte]),
        el('label', { class: 'campo' }, [el('span', { text: 'Status' }), selStatus]),
        el('div', {}, [el('button', { class: 'btn secundario', text: 'Filtrar', onclick: () => carregar() })])
      ]),
      corpo
    ]));

    async function carregar() {
      const lista = await tentar(window.api.log.listar({
        de: inDe.value, ate: inAte.value, status: selStatus.value || undefined, limite: 500
      })) || [];

      corpo.innerHTML = '';
      if (!lista.length) { corpo.appendChild(el('div', { class: 'vazio', text: 'Nenhum envio registrado no período.' })); return; }

      const tbody = el('tbody');
      for (const l of lista) {
        tbody.appendChild(el('tr', {}, [
          el('td', { text: l.enviado_em || '', style: 'white-space:nowrap' }),
          el('td', { text: dataBR(l.data_ref) }),
          el('td', { text: l.evento_titulo || l.evento_tipo || '' }),
          el('td', { text: l.destino_nome || '' }),
          el('td', {}, [el('span', {
            class: 'tag', style: l.status === 'erro' ? 'background:#FBE9E7;color:#C0392B;border-color:#F0BDB5' : '',
            text: l.status
          })]),
          el('td', { class: 'acoes' }, [
            el('button', {
              class: 'btn pequeno secundario', text: 'Ver',
              onclick: () => Modal.abrir({
                titulo: l.evento_titulo || 'Mensagem enviada',
                corpo: el('pre', { class: 'fila-msg', style: 'border:1px solid var(--c-borda);border-radius:8px', text: l.mensagem || '' }),
                botoes: [{ texto: 'Fechar', classe: 'secundario' }]
              })
            })
          ])
        ]));
      }

      corpo.appendChild(el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Enviado em' }), el('th', { text: 'Data do evento' }), el('th', { text: 'Evento' }),
          el('th', { text: 'Grupo' }), el('th', { text: 'Status' }), el('th', { text: '' })
        ])]),
        tbody
      ]));

      $('#subtituloView').textContent = `${lista.length} registro(s)`;
    }

    await carregar();
  }
};
