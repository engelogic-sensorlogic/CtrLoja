'use strict';

App.views.dashboard = {
  titulo: 'Painel',
  subtitulo: '',

  async render(alvo) {
    const [logos, obreiros, hoje, proximos, config] = await Promise.all([
      tentar(window.api.app.logos()),
      tentar(window.api.obreiros.listar({ somenteAtivos: true })) || [],
      tentar(window.api.agenda.doDia(hojeISO())) || [],
      tentar(window.api.agenda.proximos(30)) || [],
      tentar(window.api.config.obter()) || {}
    ]);

    App.config = config || {};
    const lista = obreiros || [];
    const eventosHoje = hoje || [];
    const prox = proximos || [];

    const familiares = lista.reduce((n, o) => n + (o.familiares || []).length, 0);
    const cunhadas = lista.reduce((n, o) => n + (o.familiares || []).filter((f) => f.parentesco === 'cunhada').length, 0);
    const sobrinhos = familiares - cunhadas;

    $('#subtituloView').textContent = `${dataExtenso(hojeISO())} — ${config.oriente || ''}`;

    alvo.innerHTML = '';

    /* --------- Cabecalho com logotipos --------- */
    const logosBox = el('div', { class: 'hero-logos' });
    for (const [chave, dica] of [['logo1', 'Logo1<br>(Loja UFR)'], ['logo2', 'Logo2<br>(Maçonaria)']]) {
      if (logos && logos[chave]) logosBox.appendChild(el('img', { src: logos[chave], alt: chave }));
      else logosBox.appendChild(el('div', { class: 'hero-placeholder', html: dica }));
    }

    alvo.appendChild(el('div', { class: 'hero' }, [
      logosBox,
      el('div', { class: 'hero-txt' }, [
        el('h2', { text: config.loja_nome || 'União Fraternal Rolandense' }),
        el('p', { text: config.potencia || '' }),
        el('p', { text: config.oriente || '' })
      ])
    ]));

    /* --------- Metricas --------- */
    const metrica = (valor, rotulo) => el('div', { class: 'cartao metrica' }, [
      el('div', { class: 'valor', text: String(valor) }),
      el('div', { class: 'rotulo', text: rotulo })
    ]);

    alvo.appendChild(el('div', { class: 'grade c4' }, [
      metrica(lista.length, 'Obreiros cadastrados'),
      metrica(cunhadas, 'Cunhadas'),
      metrica(sobrinhos, 'Sobrinhos e Sobrinhas'),
      metrica(eventosHoje.length, 'Eventos hoje')
    ]));

    /* --------- Eventos de hoje --------- */
    const cardHoje = el('div', { class: 'cartao' }, [
      el('h3', { html: `Eventos de hoje <span class="contagem">${eventosHoje.length} registro(s)</span>` })
    ]);

    if (!eventosHoje.length) {
      cardHoje.appendChild(el('div', { class: 'vazio', text: 'Nenhum evento para a data de hoje.' }));
    } else {
      for (const e of eventosHoje) cardHoje.appendChild(itemEvento(e));
      cardHoje.appendChild(el('div', { class: 'linha compacta', style: 'margin-top:12px' }, [
        el('button', { class: 'btn', text: 'Revisar e enviar', onclick: () => navegar('agenda') })
      ]));
    }

    /* --------- Proximos eventos --------- */
    const dias = Number(config.antecedencia_aviso || 30);
    const proxFiltrados = prox.filter((d) => d.data !== hojeISO()).slice(0, 12);
    const cardProx = el('div', { class: 'cartao' }, [
      el('h3', { html: `Próximos eventos <span class="contagem">até ${dias} dias</span>` })
    ]);
    if (!proxFiltrados.length) {
      cardProx.appendChild(el('div', { class: 'vazio', text: 'Nenhum evento nos próximos dias.' }));
    } else {
      for (const dia of proxFiltrados) {
        for (const e of dia.eventos) cardProx.appendChild(itemEvento(e, dia.data));
      }
    }

    alvo.appendChild(el('div', { class: 'grade c2' }, [cardHoje, cardProx]));

    /* --------- Avisos de configuracao --------- */
    const pendencias = [];
    if (!lista.length) pendencias.push('Cadastre os Obreiros na aba <strong>Obreiros</strong>.');
    if (App.waStatus.estado !== 'pronto') pendencias.push('Conecte o WhatsApp na aba <strong>WhatsApp</strong> (leitura do QR Code).');
    if (!logos || (!logos.logo1 && !logos.logo2)) {
      pendencias.push(`Coloque os arquivos <strong>Logo1</strong> e <strong>Logo2</strong> (png/jpg) na pasta raiz do aplicativo: <code>${esc(App.info.raiz || '')}</code>`);
    }
    if (pendencias.length) {
      alvo.appendChild(el('div', { class: 'cartao' }, [
        el('h3', { text: 'Pendências de configuração' }),
        el('ul', { html: pendencias.map((p) => `<li>${p}</li>`).join('') })
      ]));
    }
  }
};

function itemEvento(e, dataForcada) {
  const iso = dataForcada || e.data;
  const [, m, d] = iso.split('-');
  const detalhe = e.categoria === 'obreiro' || e.categoria === 'familiar'
    ? `${e.rotulo}${e.anos !== null && e.anos !== undefined ? ` — ${e.anos} ano(s)` : ''}${e.obreiro_nome && e.categoria === 'familiar' ? ` • ${e.obreiro_titulo} ${e.obreiro_nome}` : ''}`
    : (e.descricao || e.rotulo || '');

  return el('div', { class: 'evento-item' }, [
    el('div', { class: 'evento-data' }, [
      el('span', { class: 'd', text: d }),
      el('span', { class: 'm', text: MESES_CURTO[Number(m) - 1] })
    ]),
    el('div', { class: 'evento-info' }, [
      el('strong', { text: `${e.titulo_pessoa ? e.titulo_pessoa + ' ' : ''}${e.nome || e.evento || ''}` }),
      el('small', { text: detalhe })
    ]),
    el('span', { class: `tag ${e.categoria}`, text: rotuloCategoria(e.categoria) })
  ]);
}

function rotuloCategoria(c) {
  return {
    obreiro: 'Obreiro',
    familiar: 'Família',
    maconica: 'Maçônica',
    feriado_religioso: 'Religiosa',
    data_nacional: 'Nacional',
    efemeride: 'Efeméride',
    sessao: 'Sessão'
  }[c] || c;
}
