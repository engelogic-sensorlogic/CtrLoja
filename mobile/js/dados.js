/* ==================================================================
   CtrLoja Mobile - camada de dados sobre o arquivo .ctrloja
   ==================================================================

   O aplicativo do celular nao tem SQLite. Este modulo devolve um objeto
   com a MESMA interface do banco do desktop (src/main/db/database.js),
   lendo do pacote .ctrloja exportado pelo CtrLoja.

   Com isso, os modulos calendario.js, templates.js e agenda.js do
   desktop rodam aqui SEM NENHUMA ALTERACAO - o que garante que a
   mensagem gerada no celular seja identica a do computador.

   Somente leitura: o celular nao altera cadastro.
   ================================================================== */

(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.CtrLojaDados = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- utilidades ---------------- */

  const verdadeiro = (v) => v === 1 || v === true || v === '1';

  /* --------------------------------------------------------------
     As ordenacoes abaixo imitam o SQLite do desktop, e nao a
     ordenacao "bonita" do portugues. Isso e proposital: a ordem dos
     obreiros define a ordem dos blocos na mensagem agrupada, entao
     qualquer diferenca faria o celular gerar um texto diferente do
     computador. O teste test/teste-mobile.js cobre exatamente isso.
     -------------------------------------------------------------- */

  /** Colacao BINARY do SQLite (comparacao por ponto de codigo). */
  const bin = (a, b) => {
    const x = a === null || a === undefined ? '' : String(a);
    const y = b === null || b === undefined ? '' : String(b);
    return x < y ? -1 : (x > y ? 1 : 0);
  };

  /** COLLATE NOCASE do SQLite: dobra apenas as letras ASCII a-z. */
  const chaveNocase = (s) => (s === null || s === undefined ? '' : String(s))
    .replace(/[a-z]/g, (c) => c.toUpperCase());
  const nocase = (a, b) => bin(chaveNocase(a), chaveNocase(b));

  /** ORDER BY nome COLLATE NOCASE */
  const porNome = (a, b) => nocase(a.nome, b.nome);

  /** ORDER BY parentesco, nome  (usado por obreiros.listar) */
  const porParentescoNome = (a, b) => bin(a.parentesco, b.parentesco) || bin(a.nome, b.nome);

  /** ORDER BY CASE parentesco WHEN 'cunhada' THEN 0 ELSE 1 END, dt_nascimento */
  const porCunhadaPrimeiro = (a, b) => {
    const peso = (f) => (f.parentesco === 'cunhada' ? 0 : 1);
    return (peso(a) - peso(b)) || bin(a.dt_nascimento, b.dt_nascimento);
  };

  function validarPacote(pacote) {
    if (!pacote || typeof pacote !== 'object') {
      throw new Error('Arquivo inválido: conteúdo não reconhecido.');
    }
    if (pacote.formato !== 'ctrloja-backup') {
      throw new Error('Arquivo inválido: não é um backup do CtrLoja (.ctrloja).');
    }
    if (!pacote.dados) throw new Error('Arquivo inválido: sem dados.');
    return pacote;
  }

  /* ---------------- banco somente leitura ---------------- */

  function criarBanco(pacoteBruto) {
    const pacote = validarPacote(pacoteBruto);
    const d = pacote.dados;

    const tabela = (nome) => (Array.isArray(d[nome]) ? d[nome] : []);

    const linhasConfig = tabela('config');
    const mapaConfig = {};
    for (const l of linhasConfig) mapaConfig[l.chave] = l.valor;

    const config = {
      obterTodas() { return Object.assign({}, mapaConfig); },
      obter(chave, padrao) {
        return mapaConfig[chave] !== undefined ? mapaConfig[chave] : (padrao === undefined ? null : padrao);
      }
    };

    const obreiros = {
      listar(filtro) {
        filtro = filtro || {};
        let lista = tabela('obreiros').slice();

        if (filtro.busca) {
          const t = String(filtro.busca).toLowerCase();
          lista = lista.filter((o) =>
            String(o.nome || '').toLowerCase().indexOf(t) >= 0 ||
            String(o.cim || '').toLowerCase().indexOf(t) >= 0 ||
            String(o.cargo || '').toLowerCase().indexOf(t) >= 0);
        }
        if (filtro.situacao) lista = lista.filter((o) => o.situacao === filtro.situacao);
        if (filtro.somenteAtivos) lista = lista.filter((o) => verdadeiro(o.ativo));

        lista.sort(porNome);

        const familiares = tabela('familiares');
        return lista.map((o) => Object.assign({}, o, {
          familiares: familiares
            .filter((f) => f.obreiro_id === o.id && verdadeiro(f.ativo))
            .sort(porParentescoNome)
        }));
      },

      obter(id) {
        const o = tabela('obreiros').find((x) => x.id === id);
        if (!o) return null;
        return Object.assign({}, o, {
          familiares: tabela('familiares').filter((f) => f.obreiro_id === id).sort(porCunhadaPrimeiro)
        });
      }
    };

    const datas = {
      ativas() { return tabela('datas_calendario').filter((x) => verdadeiro(x.ativo)); },
      listar(filtro) {
        filtro = filtro || {};
        let lista = tabela('datas_calendario').slice();
        if (filtro.categoria) lista = lista.filter((x) => x.categoria === filtro.categoria);
        if (filtro.somenteAtivos) lista = lista.filter((x) => verdadeiro(x.ativo));
        return lista.sort((a, b) =>
          bin(a.categoria, b.categoria) ||
          (a.mes || 0) - (b.mes || 0) ||
          (a.dia || 0) - (b.dia || 0) ||
          bin(a.titulo, b.titulo));
      }
    };

    const sessoes = {
      ativas() { return tabela('sessoes').filter((s) => verdadeiro(s.ativo)); },
      listar(filtro) {
        filtro = filtro || {};
        let lista = tabela('sessoes').slice();
        if (filtro.de) lista = lista.filter((s) => s.data >= filtro.de);
        if (filtro.ate) lista = lista.filter((s) => s.data <= filtro.ate);
        if (filtro.somenteAtivas) lista = lista.filter((s) => verdadeiro(s.ativo));
        return lista.sort((a, b) => bin(a.data, b.data));
      },
      obterPorData(data) { return tabela('sessoes').find((s) => s.data === data) || undefined; }
    };

    /* A ordenacao repete a do SQLite (ORDER BY sessao_data, obreiro_id)
       para que a estatistica saia igual nos dois lados. */
    const presencas = {
      todas() {
        return tabela('presencas').slice()
          .sort((a, b) => bin(a.sessao_data, b.sessao_data) || (a.obreiro_id - b.obreiro_id));
      },
      porSessao(data) {
        return tabela('presencas').filter((p) => p.sessao_data === data)
          .sort((a, b) => a.obreiro_id - b.obreiro_id);
      },
      porObreiro(obreiroId) {
        return tabela('presencas').filter((p) => p.obreiro_id === Number(obreiroId))
          .sort((a, b) => bin(a.sessao_data, b.sessao_data));
      },
      datasComChamada() {
        const vistas = [];
        for (const p of tabela('presencas')) {
          if (vistas.indexOf(p.sessao_data) < 0) vistas.push(p.sessao_data);
        }
        return vistas.sort(bin);
      },
      temChamada(data) {
        return tabela('presencas').some((p) => p.sessao_data === data);
      },
      // No celular a gravacao acontece na tela, nao no banco: a lista
      // marcada volta ao computador pelo arquivo .presenca.
      registrarLista() { throw new Error('O celular não grava presença; envie a lista ao computador.'); },
      limparSessao() { /* somente leitura */ }
    };

    const templates = {
      obter(chave) {
        return tabela('templates').find((t) => t.chave === chave && verdadeiro(t.ativo));
      },
      listar() { return tabela('templates').slice(); }
    };

    const grupos = {
      listar() { return tabela('grupos').slice().sort(porNome); },
      selecionados() { return tabela('grupos').filter((g) => verdadeiro(g.selecionado)); }
    };

    const envios = {
      // O controle de disparo e do computador; no celular o envio e sempre
      // manual, entao nada fica bloqueado por "ja disparado hoje".
      jaDisparado() { return false; },
      listar() { return tabela('envios_log').slice(); },
      registrar() { /* somente leitura */ },
      marcarDisparo() { /* somente leitura */ }
    };

    return {
      config, obreiros, datas, sessoes, presencas, templates, grupos, envios,
      resumo: {
        gerado_em: pacote.gerado_em || null,
        obreiros: tabela('obreiros').length,
        familiares: tabela('familiares').length,
        datas: tabela('datas_calendario').length,
        sessoes: tabela('sessoes').length,
        modelos: tabela('templates').length,
        chamadas: presencas.datasComChamada().length
      }
    };
  }

  return { criarBanco: criarBanco, validarPacote: validarPacote };
}));
