'use strict';

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
          html: 'A biblioteca <strong>whatsapp-web.js</strong> não está instalada. Execute <code>npm install</code> na pasta do aplicativo.'
        }));
        return;
      }

      const rotulo = { desconectado: 'Desconectado', iniciando: 'Iniciando o navegador…', qr: 'Aguardando leitura do QR Code', autenticado: 'Autenticado, carregando…', pronto: 'Conectado', erro: 'Erro' }[st.estado] || st.estado;
      boxConexao.appendChild(el('p', {}, [el('strong', { text: `Estado: ${rotulo}` })]));

      if (st.conta && st.conta.numero) {
        boxConexao.appendChild(el('p', { style: 'color:var(--c-texto-suave);font-size:13px', text: `Conta: ${st.conta.nome || ''} (+${st.conta.numero})` }));
      }
      if (st.erro) boxConexao.appendChild(el('div', { class: 'aviso', text: st.erro }));

      if (st.estado === 'qr' && st.qr) {
        boxConexao.appendChild(el('div', { class: 'qr-area' }, [
          el('img', { src: st.qr, alt: 'QR Code' }),
          el('p', { style: 'font-size:12.5px;color:var(--c-texto-suave)', text: 'No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → aponte para o QR acima.' })
        ]));
      }

      const acoes = el('div', { class: 'linha compacta', style: 'margin-top:12px' });
      if (st.estado === 'pronto') {
        acoes.appendChild(el('button', {
          class: 'btn secundario', text: 'Atualizar lista de grupos',
          onclick: async () => { await carregarGrupos(true); }
        }));
        acoes.appendChild(el('button', {
          class: 'btn secundario', text: 'Enviar mensagem de teste',
          onclick: async () => {
            const res = await tentar(window.api.whatsapp.teste(), 'Falha no teste');
            if (res) toast(`Teste enviado para ${res.enviados} grupo(s).`, 'ok');
          }
        }));
        acoes.appendChild(el('button', {
          class: 'btn perigo', text: 'Desconectar',
          onclick: async () => {
            if (!await confirmar('Desconectar a conta? Será necessário ler o QR Code novamente.')) return;
            await tentar(window.api.whatsapp.desconectar());
            pintarConexao();
          }
        }));
      } else {
        acoes.appendChild(el('button', {
          class: 'btn', text: st.estado === 'desconectado' || st.estado === 'erro' ? 'Conectar WhatsApp' : 'Reiniciar conexão',
          onclick: async () => {
            toast('Iniciando conexão… isso pode levar alguns segundos.');
            await tentar(window.api.whatsapp.conectar(), 'Falha ao conectar');
            pintarConexao();
          }
        }));
      }
      boxConexao.appendChild(acoes);

      boxConexao.appendChild(el('div', {
        class: 'aviso info', style: 'margin-top:14px',
        html: 'A sessão fica salva no computador — o QR Code só precisa ser lido na primeira vez. Mantenha o celular com internet: o WhatsApp Web depende do aparelho pareado.'
      }));
    }

    async function carregarGrupos(daNuvem = false) {
      boxGrupos.innerHTML = '';
      boxGrupos.appendChild(el('h3', { text: 'Grupos de destino' }));

      let lista;
      if (daNuvem) {
        toast('Buscando grupos no WhatsApp…');
        lista = await tentar(window.api.whatsapp.grupos(), 'Falha ao listar grupos');
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
