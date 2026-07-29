'use strict';

/* ==================================================================
   Agenda da Loja — programação das sessões
   Mostra apenas os dias de sessão (segundas-feiras, por padrão) e as
   datas adicionais cadastradas para eventos especiais.
   ================================================================== */

const GRAUS_SESSAO = ['Aprendiz', 'Companheiro', 'Mestre'];
const TIPOS_SESSAO = [['Economica', 'Econômica'], ['Magna', 'Magna']];

const PAUTA_MODELO =
`1. Abertura dos Trabalhos
2. Leitura e aprovação do Balaústre
3. Expediente
4. Instrução do Grau
5. Palavra a bem da Ordem
6. Encerramento`;

App.views.sessoes = {
  titulo: 'Agenda da Loja',
  subtitulo: 'Programação das sessões — grau, tipo e ordem do dia',

  async render(alvo) {
    const hoje = new Date();
    let ano = App.sessoesAno || hoje.getFullYear();
    let mes = App.sessoesMes || (hoje.getMonth() + 1);

    acaoTopo('← Voltar para a Agenda', () => navegar('agenda'));
    acaoTopo('+ Data adicional', () => novaDataAdicional(), '');

    const painel = el('div');
    alvo.innerHTML = '';
    alvo.appendChild(painel);

    async function carregar() {
      App.sessoesAno = ano;
      App.sessoesMes = mes;
      painel.innerHTML = '<div class="vazio">Carregando…</div>';

      const dados = await tentar(window.api.sessoes.mes(ano, mes), 'Falha ao carregar as sessões');
      if (!dados) { painel.innerHTML = ''; return; }

      painel.innerHTML = '';
      painel.appendChild(barraMes());

      const cadastradas = dados.linhas.filter((l) => l.sessao).length;
      $('#subtituloView').textContent =
        `${MESES_LONGO[mes - 1]} de ${ano} — ${dados.linhas.length} data(s), ${cadastradas} sessão(ões) cadastrada(s)`;

      if (!dados.linhas.length) {
        painel.appendChild(el('div', { class: 'cartao' }, [
          el('div', { class: 'vazio', text: 'Nenhum dia de sessão neste mês.' })
        ]));
        return;
      }

      for (const linha of dados.linhas) painel.appendChild(cartaoSessao(linha, carregar));
    }

    function barraMes() {
      const selMes = el('select', { style: 'max-width:170px' });
      MESES_LONGO.forEach((m, i) => {
        selMes.appendChild(el('option', { value: String(i + 1), text: m, selected: (i + 1) === mes }));
      });
      selMes.addEventListener('change', () => { mes = Number(selMes.value); carregar(); });

      const inAno = el('input', { type: 'number', value: String(ano), min: 2000, max: 2100, style: 'max-width:110px' });
      inAno.addEventListener('change', () => { ano = Number(inAno.value) || ano; carregar(); });

      const mover = (n) => {
        let m = mes + n;
        let a = ano;
        if (m < 1) { m = 12; a -= 1; }
        if (m > 12) { m = 1; a += 1; }
        mes = m; ano = a;
        carregar();
      };

      return el('div', { class: 'cartao' }, [
        el('div', { class: 'linha compacta' }, [
          el('button', { class: 'btn secundario', text: '◀', onclick: () => mover(-1) }),
          selMes,
          inAno,
          el('button', { class: 'btn secundario', text: '▶', onclick: () => mover(1) }),
          el('button', {
            class: 'btn secundario', text: 'Mês atual',
            onclick: () => { const h = new Date(); ano = h.getFullYear(); mes = h.getMonth() + 1; carregar(); }
          })
        ])
      ]);
    }

    async function novaDataAdicional() {
      const inData = el('input', { type: 'date', value: hojeISO() });
      Modal.abrir({
        titulo: 'Nova data adicional',
        corpo: el('div', {}, [
          el('label', { class: 'campo' }, [
            el('span', { text: 'Data do evento especial (fora do dia de sessão)' }),
            inData
          ]),
          el('div', {
            class: 'aviso info',
            html: 'Use para Sessões Magnas, visitas, comemorações e demais eventos que não caem no dia habitual. '
              + 'Depois de criada, a data aparece nesta tela junto com as sessões regulares.'
          })
        ]),
        botoes: [
          { texto: 'Cancelar', classe: 'secundario' },
          {
            texto: 'Criar', classe: '',
            acao: async () => {
              if (!inData.value) { toast('Escolha a data.', 'erro'); return; }
              const nova = await tentar(window.api.sessoes.salvar({
                data: inData.value, grau: 'Mestre', tipo: 'Magna', especial: 1, enviar: 1, ativo: 1
              }), 'Falha ao criar a data');
              if (!nova) return;
              Modal.fechar();
              const [a, m] = inData.value.split('-').map(Number);
              ano = a; mes = m;
              toast('Data adicional criada. Preencha os dados abaixo.', 'ok');
              carregar();
            }
          }
        ]
      });
    }

    await carregar();
  }
};

/* ------------------------------------------------------------------ */

function cartaoSessao(linha, recarregar) {
  const s = linha.sessao;
  const existe = !!s;

  const [, m, d] = linha.data.split('-');

  const selGrau = el('select');
  for (const g of GRAUS_SESSAO) {
    selGrau.appendChild(el('option', { value: g, text: g, selected: (s ? s.grau : 'Aprendiz') === g }));
  }

  const selTipo = el('select');
  for (const [v, r] of TIPOS_SESSAO) {
    selTipo.appendChild(el('option', { value: v, text: r, selected: (s ? s.tipo : 'Economica') === v }));
  }

  const inHora = el('input', { type: 'time', value: (s && s.hora) || App.config.hora_reuniao || '20:00' });
  const inLocal = el('input', { type: 'text', value: (s && s.local) || '', placeholder: App.config.templo || 'Local padrão da Loja' });
  const taPauta = el('textarea', {
    style: 'min-height:150px;font-size:13px',
    placeholder: 'Agenda do Dia (ordem do dia). Deixe em branco para enviar a convocação sem a pauta.'
  }, [(s && s.agenda_dia) || '']);

  const chkEnviar = el('input', { type: 'checkbox', style: 'width:auto', checked: s ? !!s.enviar : true });

  const corpo = el('div', { style: existe ? '' : 'display:none' }, [
    el('div', { class: 'linha' }, [
      el('label', { class: 'campo' }, [el('span', { text: 'Grau' }), selGrau]),
      el('label', { class: 'campo' }, [el('span', { text: 'Tipo de sessão' }), selTipo]),
      el('label', { class: 'campo' }, [el('span', { text: 'Horário' }), inHora]),
      el('div', { style: 'flex:2' }, [
        el('label', { class: 'campo' }, [el('span', { text: 'Local (vazio = Templo padrão)' }), inLocal])
      ])
    ]),
    el('label', { class: 'campo' }, [el('span', { text: 'Agenda do Dia' }), taPauta]),
    el('div', { class: 'linha compacta' }, [
      el('button', {
        class: 'btn', text: 'Salvar sessão',
        onclick: async () => {
          const ok = await tentar(window.api.sessoes.salvar({
            data: linha.data,
            grau: selGrau.value,
            tipo: selTipo.value,
            hora: inHora.value || null,
            local: inLocal.value.trim() || null,
            agenda_dia: taPauta.value.trim() || null,
            especial: linha.regular ? 0 : 1,
            enviar: chkEnviar.checked ? 1 : 0,
            ativo: 1
          }), 'Falha ao salvar a sessão');
          if (ok) { toast('Sessão salva.', 'ok'); recarregar(); }
        }
      }),
      el('button', {
        class: 'btn secundario', text: 'Usar pauta modelo',
        onclick: () => { taPauta.value = PAUTA_MODELO; }
      }),
      el('button', {
        class: 'btn secundario', text: '👁 Pré-visualizar mensagem',
        onclick: () => previaSessao(linha.data)
      }),
      existe ? el('button', {
        class: 'btn perigo', text: 'Remover',
        onclick: async () => {
          if (!await confirmar(`Remover a sessão de ${dataBR(linha.data)}?`)) return;
          await tentar(window.api.sessoes.excluirPorData(linha.data), 'Falha ao remover');
          toast('Sessão removida.', 'ok');
          recarregar();
        }
      }) : null
    ])
  ]);

  const btnAbrir = el('button', {
    class: 'btn pequeno secundario',
    text: existe ? 'Recolher' : '+ Programar sessão',
    onclick: () => {
      const aberto = corpo.style.display !== 'none';
      corpo.style.display = aberto ? 'none' : '';
      btnAbrir.textContent = aberto ? '+ Programar sessão' : 'Recolher';
    }
  });

  const resumo = existe
    ? `Sessão ${TIPOS_SESSAO.find(([v]) => v === s.tipo)?.[1] || s.tipo} no Grau de ${s.grau}`
      + `${s.hora ? ' — ' + s.hora : ''}${s.agenda_dia ? '' : ' • sem pauta definida'}`
    : 'Sem programação';

  return el('div', { class: 'cartao', style: 'padding:12px 16px' }, [
    el('div', { class: 'linha compacta', style: 'align-items:center;gap:14px' }, [
      el('div', { class: 'evento-data', style: 'flex:0 0 62px' }, [
        el('span', { class: 'd', text: d }),
        el('span', { class: 'm', text: MESES_CURTO[Number(m) - 1] })
      ]),
      el('div', { style: 'flex:1' }, [
        el('strong', { text: linha.data_extenso }),
        el('br'),
        el('small', { style: 'color:var(--c-texto-suave)', text: resumo })
      ]),
      linha.regular
        ? el('span', { class: 'tag', text: 'Dia de sessão' })
        : el('span', { class: 'tag maconica', text: 'Data adicional' }),
      existe ? el('label', { style: 'display:flex;align-items:center;gap:6px;font-size:12px' }, [
        chkEnviar, el('span', { text: 'Enviar' })
      ]) : null,
      btnAbrir
    ]),
    corpo
  ]);
}

async function previaSessao(data) {
  const eventos = await tentar(window.api.agenda.doDia(data), 'Falha ao gerar a prévia') || [];
  const sessao = eventos.find((e) => e.tipo === 'sessao');
  if (!sessao) {
    toast('Salve a sessão antes de pré-visualizar.', 'erro');
    return;
  }
  const fila = await tentar(window.api.agenda.fila(data));
  const item = (fila && fila.itens || []).find((i) => i.tipo === 'sessao');

  Modal.abrir({
    titulo: `Mensagem da sessão de ${dataBR(data)}`,
    corpo: el('pre', {
      class: 'fila-msg',
      style: 'border:1px solid var(--c-borda);border-radius:8px;margin:0',
      text: item ? item.mensagem : '(não foi possível montar a mensagem)'
    }),
    botoes: [{ texto: 'Fechar', classe: 'secundario' }]
  });
}
