'use strict';

async function mostrarDiagnostico() {
  const d = await tentar(window.api.whatsapp.diagnostico(), 'Falha ao gerar diagnóstico');
  if (!d) return;

  const sn = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const linhas = [
    ['Estado interno', d.estado],
    ['Conta', d.conta ? `${d.conta.nome || ''} (+${d.conta.numero || ''})` : '—'],
    ['Conexão ativa', d.temCliente ? 'sim' : 'não'],
    ['Motor', sn(d.motor)],
    ['Biblioteca', sn(d.versaoBiblioteca)],
    ['Pasta da sessão', sn(d.sessao)],
    ['Credenciais gravadas', d.credenciaisGravadas ? 'sim' : 'não'],
    ['Último erro', sn(d.erro)]
  ];

  const tbody = el('tbody');
  for (const [k, v] of linhas) {
    tbody.appendChild(el('tr', {}, [
      el('td', { style: 'font-weight:600;width:210px', text: k }),
      el('td', { style: 'word-break:break-all;white-space:pre-wrap', text: v })
    ]));
  }

  Modal.abrir({
    titulo: 'Diagnóstico da conexão',
    corpo: el('div', {}, [
      el('table', {}, [tbody]),
      el('div', {
        class: 'aviso info', style: 'margin-top:12px',
        html: 'O CtrLoja conversa com o WhatsApp pelo protocolo oficial de aparelhos conectados '
          + '(multi-device), sem abrir navegador. Se as credenciais existem mas a conexão não abre, '
          + 'verifique a internet do computador e do celular.'
      })
    ]),
    botoes: [{ texto: 'Fechar', classe: 'secundario' }]
  });
}

App.views.whatsapp = {
  titulo: 'WhatsApp',
  subtitulo: 'Conexão da conta e seleção dos grupos de destino',

  async render(alvo) {
    alvo.innerHTML = '';

    const boxConexao = el('div', { class: 'cartao' });
    const boxGrupos = el('div', { class: 'cartao' });
    alvo.appendChild(el('div', { class: 'grade c2' }, [boxConexao, boxGrupos]));

    async function pintarConexao() {
      const st = await tentar(window.api.whatsapp.status()) || { estado: 'desconectado' };
      pintarStatusWa(st);

      boxConexao.innerHTML = '';
      boxConexao.appendChild(el('h3', { text: 'Conexão' }));

      if (!st.disponivel) {
        boxConexao.appendChild(el('div', {
          class: 'aviso',
          html: 'Você está no <strong>modo interface</strong>: a biblioteca de integração com o WhatsApp não foi instalada.<br><br>'
            + 'Todo o restante do aplicativo funciona normalmente. Para habilitar o envio real, feche o programa e execute '
            + '<code>rodar-completo.bat</code> na pasta do aplicativo.'
        }));
        return;
      }

      const rotulo = {
        desconectado: 'Desconectado',
        iniciando: 'Iniciando…',
        qr: 'Aguardando leitura do QR Code',
        conectando: 'Conectando…',
        pronto: 'Conectado',
        erro: 'Erro'
      }[st.estado] || st.estado;

      boxConexao.appendChild(el('p', {}, [el('strong', { text: `Estado: ${rotulo}` })]));

      if (st.progresso && st.estado !== 'pronto') {
        boxConexao.appendChild(el('p', {
          style: 'color:var(--c-texto-suave);font-size:12.5px;margin-top:-6px',
          text: st.progresso.message || 'carregando…'
        }));
      }

      if (st.conta && st.conta.numero) {
        boxConexao.appendChild(el('p', {
          style: 'color:var(--c-texto-suave);font-size:13px',
          text: `Conta: ${st.conta.nome || ''} (+${st.conta.numero})`
        }));
      }

      if (st.erro) {
        boxConexao.appendChild(el('div', { class: 'aviso', style: 'white-space:pre-wrap', text: st.erro }));
      }

      if (st.estado === 'qr' && st.qr) {
        boxConexao.appendChild(el('div', { class: 'qr-area' }, [
          el('img', { src: st.qr, alt: 'QR Code' }),
          el('p', {
            style: 'font-size:12.5px;color:var(--c-texto-suave)',
            text: 'No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → aponte para o QR acima.'
          })
        ]));
      }

      const acoes = el('div', { class: 'linha compacta', style: 'margin-top:12px' });

      if (st.estado === 'pronto') {
        acoes.appendChild(el('button', {
          class: 'btn secundario', text: 'Atualizar lista de grupos',
          onclick: async () => { await carregarGrupos(true); }
        }));
        acoes.appendChild(el('button', {
          class: 'btn sucesso', text: '🧪 Teste para mim mesmo',
          onclick: async () => {
            const res = await tentar(window.api.whatsapp.teste(null, 'eu'), 'Falha no teste');
            if (res) toast('Teste enviado para o seu próprio WhatsApp. Confira a conversa com você mesmo.', 'ok', 7000);
          }
        }));
        acoes.appendChild(el('button', {
          class: 'btn secundario', text: 'Teste nos grupos selecionados',
          onclick: async () => {
            if (!await confirmar('Isto envia uma mensagem de teste REAL nos grupos selecionados. Confirma?')) return;
            const res = await tentar(window.api.whatsapp.teste(null, 'grupos'), 'Falha no teste');
            if (res) toast(`Teste enviado para ${res.enviados} grupo(s).`, 'ok');
          }
        }));
        acoes.appendChild(el('button', { class: 'btn secundario', text: '🩺 Diagnóstico', onclick: mostrarDiagnostico }));
        acoes.appendChild(el('button', {
          class: 'btn perigo', text: 'Desconectar',
          onclick: async () => {
            if (!await confirmar('Desconectar a conta? Será necessário ler o QR Code novamente.')) return;
            await tentar(window.api.whatsapp.desconectar());
            pintarConexao();
          }
        }));
      } else {
        const ocioso = st.estado === 'desconectado' || st.estado === 'erro';

        acoes.appendChild(el('button', {
          class: 'btn', text: ocioso ? 'Conectar WhatsApp' : 'Reiniciar conexão',
          onclick: async (ev) => {
            const btn = ev.currentTarget;
            btn.disabled = true;
            btn.textContent = ocioso ? 'Conectando…' : 'Reiniciando…';
            if (ocioso) await tentar(window.api.whatsapp.conectar(), 'Falha ao conectar');
            else await tentar(window.api.whatsapp.reiniciar(), 'Falha ao reiniciar');
            pintarConexao();
          }
        }));

        acoes.appendChild(el('button', { class: 'btn secundario', text: '🩺 Diagnóstico', onclick: mostrarDiagnostico }));

        acoes.appendChild(el('button', {
          class: 'btn perigo', text: 'Limpar sessão e reconectar',
          onclick: async () => {
            if (!await confirmar('A sessão salva será apagada e será necessário ler o QR Code novamente. Continuar?')) return;
            await tentar(window.api.whatsapp.limparSessao(), 'Falha ao limpar a sessão');
            await tentar(window.api.whatsapp.conectar(), 'Falha ao conectar');
            pintarConexao();
          }
        }));
      }

      boxConexao.appendChild(acoes);

      boxConexao.appendChild(el('div', {
        class: 'aviso info', style: 'margin-top:14px',
        html: 'A sessão fica salva no computador — o QR Code só precisa ser lido na primeira vez. '
          + 'Mantenha o celular com internet.'
      }));
    }

    async function carregarGrupos(daNuvem = false) {
      boxGrupos.innerHTML = '';
      boxGrupos.appendChild(el('h3', { text: 'Grupos de destino' }));

      let lista;
      if (daNuvem) {
        toast('Buscando grupos no WhatsApp…', '', 6000);
        const r = await window.api.whatsapp.grupos();
        if (r && r.ok) {
          lista = r.data;
          toast(`${(lista || []).length} grupo(s) encontrado(s).`, 'ok');
        } else {
          lista = await tentar(window.api.whatsapp.gruposSalvos());
          Modal.abrir({
            titulo: 'Não foi possível listar os grupos',
            corpo: el('pre', {
              style: 'white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.55;margin:0',
              text: (r && r.error) || 'Erro desconhecido.'
            }),
            botoes: [
              { texto: 'Fechar', classe: 'secundario' },
              { texto: 'Tentar novamente', classe: '', acao: () => { Modal.fechar(); carregarGrupos(true); } }
            ]
          });
        }
      } else {
        lista = await tentar(window.api.whatsapp.gruposSalvos());
      }
      lista = lista || [];

      if (!lista.length) {
        boxGrupos.appendChild(el('div', {
          class: 'vazio',
          text: 'Nenhum grupo carregado. Conecte o WhatsApp e clique em "Atualizar lista de grupos".'
        }));
        return;
      }

      const caixa = el('div', { class: 'lista-check' });
      const checks = [];
      for (const g of lista) {
        const c = el('input', { type: 'checkbox', value: g.wa_id, checked: !!g.selecionado });
        checks.push(c);
        caixa.appendChild(el('label', {}, [c, el('span', { text: g.nome })]));
      }
      boxGrupos.appendChild(caixa);

      boxGrupos.appendChild(el('div', { class: 'linha compacta', style: 'margin-top:12px' }, [
        el('button', {
          class: 'btn', text: 'Salvar seleção',
          onclick: async () => {
            const ids = checks.filter((c) => c.checked).map((c) => c.value);
            await tentar(window.api.whatsapp.salvarGrupos(ids), 'Falha ao salvar');
            toast(`${ids.length} grupo(s) selecionado(s).`, 'ok');
          }
        }),
        el('button', { class: 'btn secundario', text: 'Marcar todos', onclick: () => checks.forEach((c) => { c.checked = true; }) }),
        el('button', { class: 'btn secundario', text: 'Desmarcar todos', onclick: () => checks.forEach((c) => { c.checked = false; }) })
      ]));
    }

    App.onWhatsappEvent = () => { if (App.viewAtual === 'whatsapp') pintarConexao(); };

    await pintarConexao();
    await carregarGrupos(false);
  }
};
