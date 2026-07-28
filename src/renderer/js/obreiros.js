'use strict';

const SITUACOES = ['Ativo', 'Licenciado', 'Remido', 'Emérito', 'Falecido'];
const GRAUS = ['Aprendiz', 'Companheiro', 'Mestre'];
const TRATAMENTOS = ['Ir.∴', 'Ven.∴Ir.∴', 'M.∴I.∴', 'Ir.∴Ven.∴'];

App.views.obreiros = {
  titulo: 'Obreiros',
  subtitulo: 'Cadastro dos Irmãos, Cunhadas, Sobrinhos e Sobrinhas',

  async render(alvo) {
    acaoTopo('+ Novo Obreiro', () => abrirFormObreiro(null), '');

    const busca = el('input', { type: 'search', placeholder: 'Buscar por nome, CIM ou cargo…' });
    const filtroSit = el('select', {}, [el('option', { value: '', text: 'Todas as situações' })]);
    for (const s of SITUACOES) filtroSit.appendChild(el('option', { value: s, text: s }));

    const corpo = el('div');
    const cartao = el('div', { class: 'cartao' }, [
      el('div', { class: 'linha', style: 'margin-bottom:12px' }, [busca, filtroSit]),
      corpo
    ]);

    alvo.innerHTML = '';
    alvo.appendChild(cartao);

    async function carregar() {
      const lista = await tentar(window.api.obreiros.listar({
        busca: busca.value || undefined,
        situacao: filtroSit.value || undefined
      })) || [];
      pintarTabela(corpo, lista, carregar);
      $('#subtituloView').textContent = `${lista.length} obreiro(s) cadastrado(s)`;
    }

    busca.addEventListener('input', () => { clearTimeout(busca._t); busca._t = setTimeout(carregar, 250); });
    filtroSit.addEventListener('change', carregar);
    await carregar();
  }
};

function pintarTabela(container, lista, recarregar) {
  container.innerHTML = '';
  if (!lista.length) {
    container.appendChild(el('div', { class: 'vazio', text: 'Nenhum obreiro cadastrado. Clique em "+ Novo Obreiro".' }));
    return;
  }

  const tbody = el('tbody');
  for (const o of lista) {
    const fam = o.familiares || [];
    const cunhada = fam.find((f) => f.parentesco === 'cunhada');
    const filhos = fam.filter((f) => f.parentesco !== 'cunhada');

    tbody.appendChild(el('tr', {}, [
      el('td', {}, [
        el('strong', { text: `${o.tratamento || 'Ir.∴'} ${o.nome}` }),
        el('br'),
        el('small', { style: 'color:var(--c-texto-suave)', text: [o.grau, o.cargo, o.cim ? `CIM ${o.cim}` : ''].filter(Boolean).join(' • ') })
      ]),
      el('td', { text: dataBR(o.dt_nascimento) }),
      el('td', { text: dataBR(o.dt_iniciacao) }),
      el('td', {}, [
        cunhada ? el('div', { text: `Cunhada: ${cunhada.nome}` }) : el('small', { style: 'color:var(--c-texto-suave)', text: '—' }),
        filhos.length ? el('small', { style: 'color:var(--c-texto-suave)', text: `${filhos.length} sobrinho(a)(s)` }) : null
      ]),
      el('td', {}, [el('span', { class: 'tag', text: o.situacao || 'Ativo' })]),
      el('td', { class: 'acoes' }, [
        el('button', { class: 'btn pequeno secundario', text: 'Editar', onclick: () => abrirFormObreiro(o.id) }),
        el('span', { text: ' ' }),
        el('button', {
          class: 'btn pequeno perigo', text: 'Excluir',
          onclick: async () => {
            if (!await confirmar(`Excluir o registro de ${o.nome} e todos os seus familiares?`)) return;
            await tentar(window.api.obreiros.excluir(o.id), 'Falha ao excluir');
            toast('Registro excluído.', 'ok');
            recarregar();
          }
        })
      ])
    ]));
  }

  container.appendChild(el('table', {}, [
    el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Obreiro' }),
      el('th', { text: 'Nascimento' }),
      el('th', { text: 'Iniciação' }),
      el('th', { text: 'Família' }),
      el('th', { text: 'Situação' }),
      el('th', { text: '' })
    ])]),
    tbody
  ]));
}

/* ------------------------------------------------------------------ */
/* Formulario                                                          */
/* ------------------------------------------------------------------ */

async function abrirFormObreiro(id) {
  const reg = id ? await tentar(window.api.obreiros.obter(id)) : null;
  const dados = reg || { tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Ativo', ativo: 1, familiares: [] };
  let familiares = (dados.familiares || []).map((f) => ({ ...f }));

  const campo = (rotulo, input) => el('label', { class: 'campo' }, [el('span', { text: rotulo }), input]);
  const txt = (nome, valor, extra = {}) => el('input', { type: 'text', name: nome, value: valor || '', ...extra });
  const dt = (nome, valor) => el('input', { type: 'date', name: nome, value: (valor || '').slice(0, 10) });
  const sel = (nome, opcoes, valor) => {
    const s = el('select', { name: nome });
    for (const o of opcoes) s.appendChild(el('option', { value: o, text: o, selected: o === valor }));
    return s;
  };

  const form = el('form', { id: 'formObreiro' });

  form.appendChild(el('div', { class: 'linha' }, [
    campo('Tratamento', sel('tratamento', TRATAMENTOS, dados.tratamento)),
    el('div', { style: 'flex:3' }, [campo('Nome completo do Obreiro *', txt('nome', dados.nome, { required: true, placeholder: 'Nome do Irmão' }))])
  ]));

  form.appendChild(el('div', { class: 'linha' }, [
    campo('Grau', sel('grau', GRAUS, dados.grau)),
    campo('Situação', sel('situacao', SITUACOES, dados.situacao)),
    campo('CIM / Matrícula', txt('cim', dados.cim)),
    campo('Cargo na Loja', txt('cargo', dados.cargo, { placeholder: 'Ex.: Venerável Mestre' }))
  ]));

  form.appendChild(el('div', { class: 'linha' }, [
    campo('Celular', txt('celular', dados.celular, { placeholder: '(43) 90000-0000' })),
    campo('E-mail', txt('email', dados.email))
  ]));

  form.appendChild(el('h3', { style: 'margin:16px 0 8px;font-size:14px;color:var(--c-acento-escuro)', text: 'Datas do Obreiro' }));
  form.appendChild(el('div', { class: 'linha' }, [
    campo('Nascimento', dt('dt_nascimento', dados.dt_nascimento)),
    campo('Iniciação (Aprendiz)', dt('dt_iniciacao', dados.dt_iniciacao)),
    campo('Elevação (Companheiro)', dt('dt_elevacao', dados.dt_elevacao))
  ]));
  form.appendChild(el('div', { class: 'linha' }, [
    campo('Exaltação (Mestre)', dt('dt_exaltacao', dados.dt_exaltacao)),
    campo('Remissão', dt('dt_remissao', dados.dt_remissao)),
    campo('Casamento', dt('dt_casamento', dados.dt_casamento))
  ]));

  form.appendChild(campo('Observações', el('textarea', { name: 'observacoes', style: 'min-height:60px' }, [dados.observacoes || ''])));

  /* --------- Familiares --------- */
  form.appendChild(el('h3', { style: 'margin:16px 0 8px;font-size:14px;color:var(--c-acento-escuro)', text: 'Família — Cunhada, Sobrinhos e Sobrinhas' }));

  const listaFam = el('div');
  const excluirPendentes = [];

  function pintarFam() {
    listaFam.innerHTML = '';
    if (!familiares.length) {
      listaFam.appendChild(el('div', { class: 'vazio', style: 'padding:12px', text: 'Nenhum familiar cadastrado.' }));
    }
    familiares.forEach((f, i) => {
      const selP = el('select', {}, []);
      for (const [v, r] of [['cunhada', 'Cunhada (esposa)'], ['sobrinho', 'Sobrinho (filho)'], ['sobrinha', 'Sobrinha (filha)']]) {
        selP.appendChild(el('option', { value: v, text: r, selected: f.parentesco === v }));
      }
      selP.addEventListener('change', () => { f.parentesco = selP.value; });

      const inNome = el('input', { type: 'text', value: f.nome || '', placeholder: 'Nome completo' });
      inNome.addEventListener('input', () => { f.nome = inNome.value; });

      const inData = el('input', { type: 'date', value: (f.dt_nascimento || '').slice(0, 10) });
      inData.addEventListener('change', () => { f.dt_nascimento = inData.value; });

      listaFam.appendChild(el('div', { class: 'linha', style: 'margin-bottom:6px' }, [
        el('div', { style: 'flex:0 0 170px' }, [selP]),
        el('div', { style: 'flex:3' }, [inNome]),
        el('div', { style: 'flex:0 0 160px' }, [inData]),
        el('button', {
          type: 'button', class: 'btn pequeno perigo', text: '✕', style: 'flex:0 0 auto',
          onclick: () => {
            const alvo = familiares[i];
            if (alvo.id) excluirPendentes.push(alvo.id);
            familiares.splice(i, 1);
            pintarFam();
          }
        })
      ]));
    });
  }

  pintarFam();

  form.appendChild(listaFam);
  form.appendChild(el('button', {
    type: 'button', class: 'btn secundario pequeno', text: '+ Adicionar familiar', style: 'margin-top:6px',
    onclick: () => { familiares.push({ parentesco: 'sobrinho', nome: '', dt_nascimento: '' }); pintarFam(); }
  }));

  Modal.abrir({
    titulo: id ? 'Editar Obreiro' : 'Novo Obreiro',
    corpo: form,
    botoes: [
      { texto: 'Cancelar', classe: 'secundario', acao: () => Modal.fechar() },
      {
        texto: 'Salvar',
        classe: '',
        acao: async () => {
          const fd = new FormData(form);
          const registro = { id: id || undefined };
          for (const [k, v] of fd.entries()) registro[k] = v;
          if (!registro.nome || !registro.nome.trim()) { toast('Informe o nome do Obreiro.', 'erro'); return; }

          const salvo = await tentar(window.api.obreiros.salvar(registro), 'Falha ao salvar obreiro');
          if (!salvo) return;

          for (const idExc of excluirPendentes) await tentar(window.api.familiares.excluir(idExc));

          for (const f of familiares) {
            if (f._excluir || !f.nome || !f.nome.trim()) continue;
            await tentar(window.api.familiares.salvar({
              id: f.id, obreiro_id: salvo.id, parentesco: f.parentesco,
              nome: f.nome.trim(), dt_nascimento: f.dt_nascimento || null
            }), 'Falha ao salvar familiar');
          }

          Modal.fechar();
          toast('Registro salvo com sucesso.', 'ok');
          recarregarView();
        }
      }
    ]
  });
}
