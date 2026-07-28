'use strict';

App.views.modelos = {
  titulo: 'Modelos de Mensagem',
  subtitulo: 'Textos editáveis usados no disparo automático',

  async render(alvo) {
    acaoTopo('Restaurar textos de fábrica', async () => {
      if (!await confirmar('Todos os modelos voltarão ao texto original de fábrica. As alterações que você fez serão perdidas. Continuar?')) return;
      await tentar(window.api.templates.restaurarPadrao(), 'Falha ao restaurar');
      toast('Modelos restaurados.', 'ok');
      recarregarView();
    });

    const [lista, variaveis] = await Promise.all([
      tentar(window.api.templates.listar()) || [],
      tentar(window.api.templates.variaveis()) || []
    ]);

    alvo.innerHTML = '';

    const abas = el('div', { class: 'abas' });
    const editorBox = el('div');

    let atual = (lista || [])[0];

    function selecionar(t) {
      atual = t;
      $$('.aba', abas).forEach((b) => b.classList.toggle('ativa', b.dataset.chave === t.chave));
      pintarEditor(t);
    }

    for (const t of lista || []) {
      abas.appendChild(el('button', {
        class: 'aba', 'data-chave': t.chave, text: t.titulo,
        onclick: () => selecionar(t)
      }));
    }

    function pintarEditor(t) {
      editorBox.innerHTML = '';

      const ta = el('textarea', { style: 'min-height:330px;font-size:13.5px' }, [t.corpo || '']);
      const previa = el('pre', { class: 'fila-msg', style: 'min-height:330px;margin:0;border:1px solid var(--c-borda);border-radius:8px' });

      async function atualizarPrevia() {
        const txt = await tentar(window.api.templates.preview(ta.value, t.chave));
        previa.textContent = txt || '';
      }
      ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(atualizarPrevia, 320); });

      const varsHtml = (variaveis || [])
        .map((v) => `<div><code data-v="${esc(v.v)}">${esc(v.v)}</code> — ${esc(v.d)}</div>`).join('');

      const varsBox = el('div', { class: 'var-lista', html: varsHtml });
      varsBox.addEventListener('click', (ev) => {
        const code = ev.target.closest('code');
        if (!code) return;
        const v = code.dataset.v;
        const pos = ta.selectionStart;
        ta.value = ta.value.slice(0, pos) + v + ta.value.slice(ta.selectionEnd);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = pos + v.length;
        atualizarPrevia();
      });

      editorBox.appendChild(el('div', { class: 'grade c2' }, [
        el('div', { class: 'cartao' }, [
          el('h3', { text: `Modelo: ${t.titulo}` }),
          t.descricao ? el('p', { style: 'margin-top:-6px;color:var(--c-texto-suave);font-size:12px', text: t.descricao }) : null,
          ta,
          el('div', { class: 'linha compacta', style: 'margin-top:10px' }, [
            el('button', {
              class: 'btn', text: 'Salvar modelo',
              onclick: async () => {
                const ok = await tentar(window.api.templates.salvar({
                  chave: t.chave, titulo: t.titulo, descricao: t.descricao, corpo: ta.value, ativo: 1
                }), 'Falha ao salvar');
                if (ok) { t.corpo = ta.value; toast('Modelo salvo.', 'ok'); }
              }
            }),
            el('button', { class: 'btn secundario', text: 'Atualizar prévia', onclick: atualizarPrevia })
          ])
        ]),
        el('div', { class: 'cartao' }, [
          el('h3', { text: 'Prévia com dados de exemplo' }),
          previa,
          el('h3', { style: 'margin-top:16px', text: 'Variáveis disponíveis (clique para inserir)' }),
          varsBox
        ])
      ]));

      atualizarPrevia();
    }

    alvo.appendChild(abas);
    alvo.appendChild(editorBox);
    if (atual) selecionar(atual);
    else alvo.appendChild(el('div', { class: 'vazio', text: 'Nenhum modelo cadastrado.' }));
  }
};
