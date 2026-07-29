'use strict';

const TIPOS_EVENTO = [
  ['aniversario_obreiro', 'Aniversário do Obreiro'],
  ['aniversario_cunhada', 'Aniversário da Cunhada'],
  ['aniversario_sobrinho', 'Aniversário do Sobrinho'],
  ['aniversario_sobrinha', 'Aniversário da Sobrinha'],
  ['iniciacao', 'Aniversário de Iniciação'],
  ['elevacao', 'Aniversário de Elevação'],
  ['exaltacao', 'Aniversário de Exaltação'],
  ['remissao', 'Aniversário de Remissão'],
  ['casamento', 'Aniversário de Casamento'],
  ['feriado_religioso', 'Datas Religiosas'],
  ['data_nacional', 'Datas Nacionais / Comemorativas'],
  ['efemeride', 'Efemérides Históricas'],
  ['maconica', 'Efemérides Maçônicas'],
  ['sessao', 'Sessões da Loja (Agenda da Loja)']
];

const DIAS_SEMANA_CFG = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];

App.views.config = {
  titulo: 'Configurações',
  subtitulo: 'Identificação da Loja, títulos, disparo e banco de dados',

  async render(alvo) {
    const cfg = await tentar(window.api.config.obter()) || {};
    App.config = cfg;
    const info = App.info || {};

    const campo = (rot, inp, dica) => el('label', { class: 'campo' }, [
      el('span', { text: rot }), inp,
      dica ? el('small', { style: 'color:var(--c-texto-suave);font-size:11px', text: dica }) : null
    ]);
    const txt = (nome, valor, ph) => el('input', { type: 'text', name: nome, value: valor || '', placeholder: ph || '' });

    /* --------- Identificação --------- */
    const cardLoja = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Identificação da Loja' }),
      campo('Nome da Loja', txt('loja_nome', cfg.loja_nome)),
      el('div', { class: 'linha' }, [
        campo('Sigla', txt('loja_sigla', cfg.loja_sigla)),
        campo('Numeral', txt('loja_numero', cfg.loja_numero)),
        campo('Potência', txt('potencia', cfg.potencia)),
        campo('Oriente', txt('oriente', cfg.oriente))
      ]),
      el('div', { class: 'linha' }, [
        campo('Rito', txt('rito', cfg.rito)),
        campo('Data de fundação', el('input', { type: 'date', name: 'fundacao_loja', value: (cfg.fundacao_loja || '').slice(0, 10) })),
        campo('Dia das sessões', txt('dia_reuniao', cfg.dia_reuniao)),
        campo('Horário', txt('hora_reuniao', cfg.hora_reuniao))
      ]),
      el('div', { class: 'linha' }, [
        campo('Templo', txt('templo', cfg.templo)),
        campo('CNPJ', txt('cnpj', cfg.cnpj))
      ])
    ]);

    /* --------- Títulos maçônicos --------- */
    const cardTitulos = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Títulos maçônicos usados nas mensagens' }),
      el('div', { class: 'linha' }, [
        campo('Obreiro', txt('titulo_obreiro', cfg.titulo_obreiro), 'Padrão: Ir.∴'),
        campo('Esposa', txt('titulo_cunhada', cfg.titulo_cunhada), 'Padrão: Cunhada'),
        campo('Filho', txt('titulo_sobrinho', cfg.titulo_sobrinho), 'Padrão: Sobrinho'),
        campo('Filha', txt('titulo_sobrinha', cfg.titulo_sobrinha), 'Padrão: Sobrinha')
      ])
    ]);

    /* --------- Disparo --------- */
    const selModo = el('select', { name: 'disparo_modo' });
    for (const [v, r] of [['revisao', 'Automático com revisão prévia'], ['automatico', '100% automático'], ['manual', 'Somente manual']]) {
      selModo.appendChild(el('option', { value: v, text: r, selected: cfg.disparo_modo === v }));
    }

    const diasSel = String(cfg.disparo_dias || '').split(',');
    const boxDias = el('div', { class: 'linha compacta' });
    const checksDias = [];
    for (const [v, r] of DIAS_SEMANA_CFG) {
      const c = el('input', { type: 'checkbox', value: v, checked: diasSel.includes(v), style: 'width:auto' });
      checksDias.push(c);
      boxDias.appendChild(el('label', { style: 'display:flex;align-items:center;gap:4px;font-size:12.5px' }, [c, el('span', { text: r })]));
    }

    const chkAgrupar = el('input', { type: 'checkbox', style: 'width:auto', checked: cfg.agrupar_mensagens === '1' });
    const chkAutoConectar = el('input', { type: 'checkbox', style: 'width:auto', checked: (cfg.wa_autoconectar || '1') === '1' });

    const habilitados = (() => { try { return JSON.parse(cfg.eventos_habilitados || '[]'); } catch { return []; } })();
    const boxEventos = el('div', { class: 'lista-check', style: 'max-height:230px' });
    const checksEventos = [];
    for (const [v, r] of TIPOS_EVENTO) {
      const c = el('input', { type: 'checkbox', value: v, checked: habilitados.includes(v) });
      checksEventos.push(c);
      boxEventos.appendChild(el('label', {}, [c, el('span', { text: r })]));
    }

    const cardDisparo = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Rotina de disparo' }),
      el('div', { class: 'linha' }, [
        campo('Modo', selModo),
        campo('Horário', el('input', { type: 'time', name: 'disparo_hora', value: cfg.disparo_hora || '07:30' })),
        campo('Intervalo entre mensagens (ms)', el('input', { type: 'number', name: 'intervalo_envio_ms', value: cfg.intervalo_envio_ms || '4000', min: 1000, step: 500 })),
        campo('Antecedência do painel (dias)', el('input', { type: 'number', name: 'antecedencia_aviso', value: cfg.antecedencia_aviso || '30', min: 1 }))
      ]),
      el('label', { class: 'campo' }, [el('span', { text: 'Dias da semana em que a rotina roda' }), boxDias]),
      el('label', { style: 'display:flex;align-items:center;gap:8px;margin:10px 0' }, [
        chkAgrupar, el('span', { text: 'Agrupar todos os eventos do dia em uma única mensagem' })
      ]),
      el('label', { style: 'display:flex;align-items:center;gap:8px;margin:10px 0' }, [
        chkAutoConectar, el('span', { text: 'Conectar o WhatsApp automaticamente ao abrir o aplicativo (necessário para o disparo 100% automático)' })
      ])
    ]);

    /* --------- Situação da rotina --------- */
    const boxRotina = el('div');
    const cardRotina = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Situação da rotina de disparo' }),
      boxRotina,
      el('div', { class: 'linha compacta', style: 'margin-top:12px' }, [
        el('button', { class: 'btn secundario', text: '🔄 Atualizar', onclick: () => pintarRotina() }),
        el('button', {
          class: 'btn secundario', text: '📋 Ver registro da rotina',
          onclick: async () => {
            const r = await tentar(window.api.rotina.log(300), 'Falha ao ler o registro');
            if (!r) return;
            Modal.abrir({
              titulo: 'Registro da rotina de disparo',
              largura: '900px',
              corpo: el('div', {}, [
                el('p', { style: 'font-size:12px;color:var(--c-texto-suave);margin:0 0 8px', text: r.arquivo || '' }),
                el('pre', {
                  style: 'white-space:pre-wrap;font-size:12px;line-height:1.5;max-height:60vh;overflow:auto;'
                    + 'background:#F7FCFC;border:1px solid var(--c-borda);border-radius:8px;padding:10px;margin:0',
                  text: r.linhas.length ? r.linhas.join('\n') : '(sem registros ainda)'
                })
              ]),
              botoes: [{ texto: 'Fechar', classe: 'secundario' }]
            });
          }
        }),
        el('button', {
          class: 'btn secundario', text: '🔎 Verificar pendência',
          onclick: async () => {
            const r = await tentar(window.api.rotina.verificar(), 'Falha na verificação');
            if (r && !r.executou) toast(`Rotina não disparou: ${r.motivo}`, '', 8000);
            else if (r) toast('Rotina executada.', 'ok');
            pintarRotina();
          }
        }),
        el('button', {
          class: 'btn', text: '▶ Executar rotina agora',
          onclick: async () => {
            const r = await tentar(window.api.rotina.executar(false), 'Falha ao executar a rotina');
            if (r) toast('Rotina executada. Veja o resultado abaixo.', 'ok');
            pintarRotina();
          }
        }),
        el('button', {
          class: 'btn perigo', text: '⚠ Forçar disparo (mesmo já enviado)',
          onclick: async () => {
            if (!await confirmar('Isto envia as mensagens de hoje AGORA, ignorando o registro de disparo. Pode duplicar mensagens no grupo. Confirma?')) return;
            const r = await tentar(window.api.rotina.executar(true), 'Falha ao forçar o disparo');
            if (r) toast('Disparo forçado executado.', 'ok');
            pintarRotina();
          }
        })
      ])
    ]);

    async function pintarRotina() {
      const e = await tentar(window.api.rotina.estado()) || {};
      const sim = (v) => (v ? 'sim' : 'não');
      const rotuloModo = { revisao: 'Automático com revisão prévia', automatico: '100% automático', manual: 'Somente manual' }[e.modo] || e.modo;

      const linhas = [
        ['Modo atual', rotuloModo],
        ['Próxima execução', e.proxima_descricao || '—'],
        ['Expressão do agendador', e.expressao || '—'],
        ['Hoje é dia habilitado', sim(e.hoje_habilitado)],
        ['Horário de hoje já passou', sim(e.horario_ja_passou)],
        ['Já disparado hoje', sim(e.ja_disparado_hoje)],
        ['Aguardando conexão do WhatsApp', sim(e.adiado_por_whatsapp)],
        ['Última execução', e.ultima_execucao || '—'],
        ['Último resultado', e.ultimo_resultado || '—']
      ];

      const tbody = el('tbody');
      for (const [k, v] of linhas) {
        tbody.appendChild(el('tr', {}, [
          el('td', { style: 'font-weight:600;width:250px', text: k }),
          el('td', { text: v })
        ]));
      }

      boxRotina.innerHTML = '';
      boxRotina.appendChild(el('table', {}, [tbody]));

      if (e.modo === 'automatico' && App.waStatus.estado !== 'pronto') {
        boxRotina.appendChild(el('div', {
          class: 'aviso', style: 'margin-top:10px',
          html: 'O modo <strong>100% automático</strong> exige o WhatsApp conectado. '
            + 'O aplicativo precisa ficar aberto no horário do disparo.'
        }));
      }
    }

    const cardEventos = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Tipos de evento habilitados para envio' }),
      boxEventos
    ]);

    /* --------- Banco de dados --------- */
    const cardBanco = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Banco de dados' }),
      el('p', { style: 'font-size:12.5px;color:var(--c-texto-suave)', text: `Arquivo local: ${info.bancoPath || ''}` }),
      el('div', { class: 'linha compacta' }, [
        el('button', {
          class: 'btn', text: '⬇ Exportar banco de dados',
          onclick: async () => {
            const r = await tentar(window.api.backup.exportar(), 'Falha ao exportar');
            if (r && !r.cancelado) toast(`Backup salvo em ${r.arquivo}`, 'ok', 7000);
          }
        }),
        el('button', {
          class: 'btn secundario', text: '⬆ Importar (substituir)',
          onclick: async () => {
            if (!await confirmar('A importação irá SUBSTITUIR os obreiros, familiares, grupos e calendário atuais. Deseja continuar?')) return;
            const r = await tentar(window.api.backup.importar('substituir'), 'Falha ao importar');
            if (r && !r.cancelado) { toast('Importação concluída.', 'ok'); recarregarView(); }
          }
        }),
        el('button', {
          class: 'btn secundario', text: '⬆ Importar (mesclar)',
          onclick: async () => {
            const r = await tentar(window.api.backup.importar('mesclar'), 'Falha ao importar');
            if (r && !r.cancelado) { toast('Importação concluída.', 'ok'); recarregarView(); }
          }
        })
      ]),
      el('div', { class: 'aviso info', style: 'margin-top:12px', html: 'Use <strong>Exportar</strong> para gerar um arquivo <code>.ctrloja</code> e levar os dados para outra instalação do programa em outro computador.' })
    ]);

    /* --------- Montagem --------- */
    const form = el('form', { id: 'formConfig' }, [cardLoja, cardTitulos, cardDisparo, cardEventos]);

    alvo.innerHTML = '';
    alvo.appendChild(form);
    alvo.appendChild(cardRotina);
    alvo.appendChild(cardBanco);
    await pintarRotina();

    acaoTopo('Salvar configurações', async () => {
      const fd = new FormData(form);
      const mapa = {};
      for (const [k, v] of fd.entries()) mapa[k] = v;
      mapa.disparo_dias = checksDias.filter((c) => c.checked).map((c) => c.value).join(',') || '0,1,2,3,4,5,6';
      mapa.agrupar_mensagens = chkAgrupar.checked ? '1' : '0';
      mapa.wa_autoconectar = chkAutoConectar.checked ? '1' : '0';
      mapa.eventos_habilitados = JSON.stringify(checksEventos.filter((c) => c.checked).map((c) => c.value));

      const novo = await tentar(window.api.config.salvar(mapa), 'Falha ao salvar configurações');
      if (novo) { App.config = novo; toast('Configurações salvas.', 'ok'); pintarRotina(); }
    }, '');
  }
};
