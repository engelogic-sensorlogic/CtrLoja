'use strict';

const CATEGORIAS = [
  ['', 'Todas as categorias'],
  ['maconica', 'Ordem Maçônica'],
  ['feriado_religioso', 'Religiosas'],
  ['data_nacional', 'Nacionais / Comemorativas'],
  ['efemeride', 'Efemérides Históricas']
];

App.views.calendario = {
  titulo: 'Calendário Permanente',
  subtitulo: 'Datas religiosas, nacionais, efemérides históricas e da Ordem Maçônica',

  async render(alvo) {
    acaoTopo('+ Nova data', () => abrirFormData(null), '');
    acaoTopo('Restaurar padrão de fábrica', async () => {
      if (!await confirmar('Isto sobrescreve as datas padrão do sistema com os valores originais. As datas criadas por você não serão afetadas. Continuar?')) return;
      await tentar(window.api.datas.restaurarPadrao(), 'Falha ao restaurar');
      toast('Datas padrão restauradas.', 'ok');
      recarregarView();
    });

    const filtro = el('select');
    for (const [v, r] of CATEGORIAS) filtro.appendChild(el('option', { value: v, text: r }));
    const busca = el('input', { type: 'search', placeholder: 'Buscar data…' });

    const corpo = el('div');
    alvo.innerHTML = '';
    alvo.appendChild(el('div', { class: 'cartao' }, [
      el('div', { class: 'linha', style: 'margin-bottom:12px' }, [busca, filtro]),
      corpo
    ]));

    async function carregar() {
      const lista = await tentar(window.api.datas.listar({
        categoria: filtro.value || undefined,
        busca: busca.value || undefined
      })) || [];
      pintar(corpo, lista, carregar);
      $('#subtituloView').textContent = `${lista.length} data(s) no calendário permanente`;
    }

    filtro.addEventListener('change', carregar);
    busca.addEventListener('input', () => { clearTimeout(busca._t); busca._t = setTimeout(carregar, 250); });
    await carregar();
  }
};

function descricaoRegra(d) {
  if (d.tipo === 'movel') {
    const m = String(d.regra || '').match(/^pascoa\s*([+-])\s*(\d+)$/i);
    if (m) return `Móvel — Páscoa ${m[1]} ${m[2]} dia(s)`;
    const n = String(d.regra || '').match(/^nth:\s*(-?\d+)\s*,\s*(\d)\s*,\s*(\d{1,2})$/i);
    if (n) {
      const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
      const ord = Number(n[1]) < 0 ? 'último' : `${n[1]}º`;
      return `Móvel — ${ord} ${dias[Number(n[2])]} de ${MESES_LONGO[Number(n[3]) - 1]}`;
    }
    return `Móvel — ${d.regra || '(regra não definida)'}`;
  }
  return d.dia && d.mes ? `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}` : '—';
}

function pintar(container, lista, recarregar) {
  container.innerHTML = '';
  if (!lista.length) { container.appendChild(el('div', { class: 'vazio', text: 'Nenhuma data encontrada.' })); return; }

  const tbody = el('tbody');
  for (const d of lista) {
    const chkEnviar = el('input', { type: 'checkbox', style: 'width:auto', checked: !!d.enviar });
    chkEnviar.addEventListener('change', async () => {
      await tentar(window.api.datas.salvar({ ...d, enviar: chkEnviar.checked ? 1 : 0 }), 'Falha ao atualizar');
    });

    const chkAtivo = el('input', { type: 'checkbox', style: 'width:auto', checked: !!d.ativo });
    chkAtivo.addEventListener('change', async () => {
      await tentar(window.api.datas.salvar({ ...d, ativo: chkAtivo.checked ? 1 : 0 }), 'Falha ao atualizar');
    });

    tbody.appendChild(el('tr', {}, [
      el('td', { text: descricaoRegra(d), style: 'white-space:nowrap' }),
      el('td', {}, [
        el('strong', { text: d.titulo }),
        d.descricao ? el('div', {}, [el('small', { style: 'color:var(--c-texto-suave)', text: d.descricao })]) : null
      ]),
      el('td', {}, [el('span', { class: `tag ${d.categoria}`, text: rotuloCategoria(d.categoria) })]),
      el('td', { text: d.ano_origem || '—' }),
      el('td', { style: 'text-align:center' }, [chkAtivo]),
      el('td', { style: 'text-align:center' }, [chkEnviar]),
      el('td', { class: 'acoes' }, [
        el('button', { class: 'btn pequeno secundario', text: 'Editar', onclick: () => abrirFormData(d) }),
        el('span', { text: ' ' }),
        d.padrao ? null : el('button', {
          class: 'btn pequeno perigo', text: 'Excluir',
          onclick: async () => {
            if (!await confirmar(`Excluir a data "${d.titulo}"?`)) return;
            await tentar(window.api.datas.excluir(d.id), 'Falha ao excluir');
            recarregar();
          }
        })
      ])
    ]));
  }

  container.appendChild(el('table', {}, [
    el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Data' }), el('th', { text: 'Título' }), el('th', { text: 'Categoria' }),
      el('th', { text: 'Ano' }), el('th', { text: 'Ativa' }), el('th', { text: 'Enviar' }), el('th', { text: '' })
    ])]),
    tbody
  ]));
}

/* ------------------------------------------------------------------ */

function abrirFormData(d) {
  const dados = d || { categoria: 'maconica', tipo: 'fixa', enviar: 1, ativo: 1 };
  const campo = (rot, inp) => el('label', { class: 'campo' }, [el('span', { text: rot }), inp]);

  const inTitulo = el('input', { type: 'text', value: dados.titulo || '' });
  const inDescricao = el('textarea', { style: 'min-height:70px' }, [dados.descricao || '']);
  const selCat = el('select');
  for (const [v, r] of CATEGORIAS.slice(1)) selCat.appendChild(el('option', { value: v, text: r, selected: dados.categoria === v }));

  const selTipo = el('select');
  selTipo.appendChild(el('option', { value: 'fixa', text: 'Fixa (dia e mês)', selected: dados.tipo === 'fixa' }));
  selTipo.appendChild(el('option', { value: 'movel', text: 'Móvel (regra de cálculo)', selected: dados.tipo === 'movel' }));

  const inDia = el('input', { type: 'number', min: 1, max: 31, value: dados.dia || '' });
  const inMes = el('input', { type: 'number', min: 1, max: 12, value: dados.mes || '' });
  const inRegra = el('input', { type: 'text', value: dados.regra || '', placeholder: 'pascoa+60  |  nth:2,0,5' });
  const inAno = el('input', { type: 'number', value: dados.ano_origem || '', placeholder: 'Ex.: 1717' });

  const boxFixa = el('div', { class: 'linha' }, [campo('Dia', inDia), campo('Mês', inMes)]);
  const boxMovel = el('div', {}, [
    campo('Regra de cálculo', inRegra),
    el('div', { class: 'aviso info', html: '<strong>pascoa+N</strong> ou <strong>pascoa-N</strong>: N dias em relação ao Domingo de Páscoa (ex.: <code>pascoa+60</code> = Corpus Christi).<br><strong>nth:O,D,M</strong>: O-ésima ocorrência do dia D (0=domingo … 6=sábado) no mês M (ex.: <code>nth:2,0,5</code> = 2º domingo de maio, Dia das Mães). Use O = -1 para a última ocorrência.' })
  ]);

  function alternar() {
    boxFixa.style.display = selTipo.value === 'fixa' ? '' : 'none';
    boxMovel.style.display = selTipo.value === 'movel' ? '' : 'none';
  }
  selTipo.addEventListener('change', alternar);

  const corpo = el('div', {}, [
    campo('Título *', inTitulo),
    campo('Descrição (usada na mensagem)', inDescricao),
    el('div', { class: 'linha' }, [campo('Categoria', selCat), campo('Tipo', selTipo), campo('Ano do fato histórico', inAno)]),
    boxFixa, boxMovel
  ]);
  alternar();

  Modal.abrir({
    titulo: d ? 'Editar data do calendário' : 'Nova data no calendário',
    corpo,
    botoes: [
      { texto: 'Cancelar', classe: 'secundario' },
      {
        texto: 'Salvar', classe: '',
        acao: async () => {
          if (!inTitulo.value.trim()) { toast('Informe o título da data.', 'erro'); return; }
          const reg = {
            id: dados.id, chave: dados.chave,
            titulo: inTitulo.value.trim(),
            descricao: inDescricao.value.trim(),
            categoria: selCat.value,
            tipo: selTipo.value,
            dia: selTipo.value === 'fixa' ? Number(inDia.value) || null : null,
            mes: selTipo.value === 'fixa' ? Number(inMes.value) || null : null,
            regra: selTipo.value === 'movel' ? inRegra.value.trim() : null,
            ano_origem: Number(inAno.value) || null,
            enviar: dados.enviar === undefined ? 1 : dados.enviar,
            ativo: dados.ativo === undefined ? 1 : dados.ativo
          };
          const ok = await tentar(window.api.datas.salvar(reg), 'Falha ao salvar data');
          if (!ok) return;
          Modal.fechar();
          toast('Data salva.', 'ok');
          recarregarView();
        }
      }
    ]
  });
}
