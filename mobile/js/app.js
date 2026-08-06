/* ==================================================================
   CtrLoja Mobile — interface
   ==================================================================

   Somente consulta e disparo MANUAL: o aplicativo monta a mensagem e
   entrega o texto pronto ao WhatsApp do proprio aparelho. Quem envia e
   o WhatsApp, pelo caminho oficial — nao ha automacao, nao ha risco de
   bloqueio da conta.

   Os dados vem do arquivo .ctrloja exportado pelo CtrLoja do computador
   e ficam guardados apenas neste celular.
   ================================================================== */

(function () {
  'use strict';

  const CHAVE = 'ctrloja.pacote';
  const CHAVE_VERSAO = 'ctrloja.versao';
  const CHAVE_SENHA = 'ctrloja.senha';
  const ORIGEM_DADOS = 'dados/';
  const MESES_CURTO = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const app = {
    pacote: null,
    banco: null,
    nucleo: null,
    cargo: 'chancelaria',
    aba: 'hoje',
    data: hojeISO(),
    versao: null,
    sincronizando: false
  };

  /* ---------------- utilidades ---------------- */

  const $ = (s) => document.querySelector(s);

  function hojeISO(d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function somarDias(iso, n) {
    const [a, m, d] = iso.split('-').map(Number);
    const dt = new Date(a, m - 1, d, 12);
    dt.setDate(dt.getDate() + n);
    return hojeISO(dt);
  }

  function dataExtenso(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return `${d} de ${MESES_LONGO[m - 1]} de ${a}`;
  }

  function el(tag, attrs, filhos) {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const f of [].concat(filhos || [])) {
      if (f === null || f === undefined || f === false) continue;
      n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
    }
    return n;
  }

  function aviso(msg, tipo, ms) {
    const t = el('div', { class: 'toast ' + (tipo || ''), text: msg });
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), ms || 4000);
  }

  const rotuloCategoria = (c) => ({
    obreiro: 'Obreiro', familiar: 'Família', maconica: 'Maçônica',
    feriado_religioso: 'Religiosa', data_nacional: 'Nacional',
    efemeride: 'Efeméride', sessao: 'Sessão'
  })[c] || c;

  /* ---------------- envio pelo WhatsApp ---------------- */

  /**
   * Entrega o texto ao WhatsApp do aparelho. A escolha do grupo e o
   * envio acontecem dentro do proprio WhatsApp.
   */
  async function enviarPeloWhatsApp(texto) {
    // 1) Folha de compartilhamento do Android (permite escolher o grupo)
    if (navigator.share) {
      try {
        await navigator.share({ text: texto });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;   // usuário cancelou
      }
    }
    // 2) Link direto do WhatsApp
    try {
      window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
      return;
    } catch (err) { /* segue para a área de transferência */ }
    // 3) Último recurso
    copiar(texto);
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      aviso('Mensagem copiada. Cole no grupo do WhatsApp.', 'ok');
    } catch (err) {
      const ta = el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); aviso('Mensagem copiada.', 'ok'); }
      catch (e) { aviso('Não foi possível copiar neste aparelho.', 'erro'); }
      ta.remove();
    }
  }

  /* ---------------- dados ---------------- */

  function guardar(pacote) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(pacote));
      return true;
    } catch (err) {
      aviso('Os dados foram carregados, mas não couberam na memória do navegador. '
        + 'Serão perdidos ao fechar o aplicativo.', 'erro', 8000);
      return false;
    }
  }

  async function usarPacote(pacote, guardarTambem) {
    app.banco = CtrLojaDados.criarBanco(pacote);
    app.nucleo = await CtrLojaNucleo.montar(app.banco);
    app.pacote = pacote;
    if (guardarTambem) guardar(pacote);

    const cfg = app.banco.config.obterTodas();
    $('#tituloLoja').textContent = cfg.loja_nome || 'CtrLoja';
    $('#subtituloLoja').textContent = cfg.oriente || '';
    $('#abas').hidden = false;
    $('#cargos').hidden = false;
  }

  /* ---------------- sincronização com o repositório ---------------- */

  function versaoGuardada() {
    try { return JSON.parse(localStorage.getItem(CHAVE_VERSAO) || 'null'); }
    catch { return null; }
  }

  /**
   * Busca a novidade publicada pelo computador.
   *
   * Primeiro lê o versao.json, que tem poucos bytes: se a impressão
   * digital for a mesma já guardada, nada é baixado. Só havendo novidade
   * é que vem o pacote cifrado.
   */
  async function sincronizar(forcar) {
    if (app.sincronizando) return;
    app.sincronizando = true;
    pintar();

    try {
      if (!CtrLojaCripto.disponivel()) {
        throw new Error(
          'A sincronização exige conexão segura (HTTPS).\n\n'
          + 'Abra o aplicativo pelo endereço publicado, não pelo endereço de IP da rede local.'
        );
      }

      const resp = await fetch(ORIGEM_DADOS + 'versao.json?t=' + Date.now(), { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(resp.status === 404
          ? 'Nenhum dado publicado ainda. No computador, use o publicar-dados.bat e depois o publicar-github.bat.'
          : `Não foi possível consultar o servidor (${resp.status}).`);
      }
      const info = await resp.json();
      if (info.formato !== 'ctrloja-versao') throw new Error('Resposta inesperada do servidor.');

      const atual = versaoGuardada();
      if (!forcar && atual && atual.impressao === info.impressao) {
        aviso('Você já está com a versão mais recente (nº ' + info.versao + ').', 'ok');
        return;
      }

      const respDados = await fetch(ORIGEM_DADOS + info.arquivo + '?v=' + info.versao, { cache: 'no-store' });
      if (!respDados.ok) throw new Error(`Não foi possível baixar os dados (${respDados.status}).`);
      const envelope = await respDados.json();

      let senha = localStorage.getItem(CHAVE_SENHA);
      if (!senha) {
        senha = prompt('Senha da Loja\n\n(combinada entre os Irmãos; maiúsculas não importam)');
        if (!senha) { aviso('Sincronização cancelada.', ''); return; }
      }

      let pacote;
      try {
        pacote = await CtrLojaCripto.decifrar(envelope, senha);
      } catch (err) {
        localStorage.removeItem(CHAVE_SENHA);      // senha guardada não serve mais
        throw err;
      }

      CtrLojaDados.validarPacote(pacote);
      await usarPacote(pacote, true);

      localStorage.setItem(CHAVE_SENHA, senha);
      localStorage.setItem(CHAVE_VERSAO, JSON.stringify(info));
      app.versao = info;

      aviso(`Atualizado para a versão ${info.versao} — ${app.banco.resumo.obreiros} obreiro(s).`, 'ok', 6000);
    } catch (err) {
      aviso(err.message || 'Falha ao sincronizar.', 'erro', 9000);
    } finally {
      app.sincronizando = false;
      pintar();
    }
  }

  function lerArquivo(file) {
    const leitor = new FileReader();
    leitor.onload = async () => {
      try {
        const pacote = JSON.parse(leitor.result);
        CtrLojaDados.validarPacote(pacote);
        await usarPacote(pacote, true);
        app.aba = 'hoje';
        pintar();
        aviso('Dados carregados. ' + app.banco.resumo.obreiros + ' obreiro(s).', 'ok');
      } catch (err) {
        aviso(err.message || 'Não foi possível ler o arquivo.', 'erro', 7000);
      }
    };
    leitor.onerror = () => aviso('Falha ao ler o arquivo.', 'erro');
    leitor.readAsText(file);
  }

  /* ---------------- telas ---------------- */

  function telaImportar() {
    return el('div', { class: 'cartao importar' }, [
      el('img', { src: 'icons/icone-192.png', alt: '' }),
      el('h2', { text: 'Carregue a agenda da Loja' }),
      el('p', {
        html: 'Toque em <strong>Sincronizar</strong> para baixar a agenda publicada pela Loja. '
          + 'Será pedida a senha combinada entre os Irmãos.<br><br>'
          + 'Os dados ficam somente neste aparelho.'
      }),
      el('button', {
        class: 'btn largo', text: app.sincronizando ? 'Sincronizando…' : '🔄 Sincronizar agora',
        disabled: app.sincronizando, onclick: () => sincronizar(true)
      }),
      el('p', { style: 'font-size:12.5px;color:var(--c-texto-suave);margin:16px 0 8px', text: 'ou, se você tem o arquivo em mãos:' }),
      el('button', {
        class: 'btn secundario largo', text: '📂 Carregar arquivo .ctrloja',
        onclick: () => $('#arquivo').click()
      })
    ]);
  }

  function cartaoEvento(item, mostrarData) {
    const iso = item.data;
    const dia = iso.slice(8, 10);
    const mes = MESES_CURTO[Number(iso.slice(5, 7)) - 1];

    const detalhe = (item.categoria === 'obreiro' || item.categoria === 'familiar')
      ? `${item.rotulo || ''}${item.anos !== null && item.anos !== undefined ? ' — ' + item.anos + ' ano(s)' : ''}`
      : (item.rotulo || '');

    const bloco = el('div', { class: 'evento' + (item.bloqueado ? ' bloqueado' : '') }, [
      el('div', { class: 'evento-topo' }, [
        mostrarData ? el('div', { class: 'evento-data' }, [
          el('span', { class: 'd', text: dia }),
          el('span', { class: 'm', text: mes })
        ]) : null,
        el('div', { class: 'evento-info' }, [
          el('strong', { text: (item.titulo_pessoa ? item.titulo_pessoa + ' ' : '') + (item.nome || item.evento || '') }),
          el('small', { text: detalhe })
        ]),
        el('span', { class: 'tag ' + item.categoria, text: rotuloCategoria(item.categoria) })
      ])
    ]);

    if (item.bloqueado) {
      bloco.appendChild(el('div', { class: 'mensagem', style: 'font-style:italic', text: item.motivo_bloqueio || 'Não é comunicado.' }));
      return bloco;
    }

    bloco.appendChild(el('pre', { class: 'mensagem', text: item.mensagem || '' }));
    bloco.appendChild(el('div', { class: 'acoes' }, [
      el('button', { class: 'btn zap', text: '📤 Enviar', onclick: () => enviarPeloWhatsApp(item.mensagem) }),
      el('button', { class: 'btn secundario', text: 'Copiar', onclick: () => copiar(item.mensagem) })
    ]));
    return bloco;
  }

  function telaHoje() {
    const caixa = el('div');

    const seletor = el('input', { type: 'date', value: app.data });
    seletor.addEventListener('change', () => { app.data = seletor.value || hojeISO(); pintar(); });

    caixa.appendChild(el('div', { class: 'linha-data' }, [
      el('button', { class: 'btn secundario', style: 'flex:0 0 46px', text: '‹', onclick: () => { app.data = somarDias(app.data, -1); pintar(); } }),
      seletor,
      el('button', { class: 'btn secundario', style: 'flex:0 0 46px', text: '›', onclick: () => { app.data = somarDias(app.data, 1); pintar(); } })
    ]));

    if (app.data !== hojeISO()) {
      caixa.appendChild(el('button', {
        class: 'btn secundario largo', style: 'margin-bottom:12px',
        text: 'Voltar para hoje', onclick: () => { app.data = hojeISO(); pintar(); }
      }));
    }

    const fila = app.nucleo.agenda.montarFila(app.data);

    caixa.appendChild(el('div', { class: 'aviso info', text: dataExtenso(app.data) + ' — ' + fila.total + ' evento(s)' }));

    if (!fila.total) {
      caixa.appendChild(el('div', { class: 'cartao' }, [
        el('div', { class: 'vazio', text: 'Nenhum evento nesta data.' })
      ]));
      return caixa;
    }

    // Mensagem única, quando o computador está configurado para agrupar
    if (fila.agrupar && fila.mensagem_unica) {
      caixa.appendChild(el('div', { class: 'evento' }, [
        el('div', { class: 'evento-topo' }, [
          el('div', { class: 'evento-info' }, [
            el('strong', { text: 'Mensagem única do dia' }),
            el('small', { text: 'modo agrupado, como no computador' })
          ]),
          el('span', { class: 'tag', text: 'Agrupada' })
        ]),
        el('pre', { class: 'mensagem', text: fila.mensagem_unica }),
        el('div', { class: 'acoes' }, [
          el('button', { class: 'btn zap', text: '📤 Enviar', onclick: () => enviarPeloWhatsApp(fila.mensagem_unica) }),
          el('button', { class: 'btn secundario', text: 'Copiar', onclick: () => copiar(fila.mensagem_unica) })
        ])
      ]));
      caixa.appendChild(el('div', { class: 'aviso', text: 'Abaixo, os mesmos eventos separados — caso prefira enviar um a um.' }));
    }

    for (const item of fila.itens) caixa.appendChild(cartaoEvento(item, false));
    return caixa;
  }

  function telaProximos() {
    const caixa = el('div');
    const dias = 30;
    const inicio = hojeISO();
    const lista = app.nucleo.agenda.eventosDoPeriodo(inicio, somarDias(inicio, dias));

    caixa.appendChild(el('div', { class: 'aviso info', text: 'Próximos ' + dias + ' dias' }));

    if (!lista.length) {
      caixa.appendChild(el('div', { class: 'cartao' }, [el('div', { class: 'vazio', text: 'Nenhum evento no período.' })]));
      return caixa;
    }

    for (const dia of lista) {
      for (const evt of dia.eventos) {
        const cartao = el('div', { class: 'evento' + (evt.bloqueado ? ' bloqueado' : '') }, [
          el('div', { class: 'evento-topo' }, [
            el('div', { class: 'evento-data' }, [
              el('span', { class: 'd', text: dia.data.slice(8, 10) }),
              el('span', { class: 'm', text: MESES_CURTO[Number(dia.data.slice(5, 7)) - 1] })
            ]),
            el('div', { class: 'evento-info' }, [
              el('strong', { text: (evt.titulo_pessoa ? evt.titulo_pessoa + ' ' : '') + (evt.nome || evt.evento || '') }),
              el('small', { text: evt.rotulo || '' })
            ]),
            el('span', { class: 'tag ' + evt.categoria, text: rotuloCategoria(evt.categoria) })
          ])
        ]);
        cartao.addEventListener('click', () => { app.data = dia.data; app.aba = 'hoje'; pintar(); });
        caixa.appendChild(cartao);
      }
    }
    return caixa;
  }

  function telaObreiros() {
    const caixa = el('div');
    const lista = app.banco.obreiros.listar({ somenteAtivos: true });

    const cunhadas = lista.reduce((n, o) => n + o.familiares.filter((f) => f.parentesco === 'cunhada').length, 0);
    const sobrinhos = lista.reduce((n, o) => n + o.familiares.filter((f) => f.parentesco !== 'cunhada').length, 0);

    caixa.appendChild(el('div', { class: 'metricas', style: 'margin-bottom:12px' }, [
      el('div', { class: 'metrica' }, [el('div', { class: 'valor', text: String(lista.length) }), el('div', { class: 'rotulo', text: 'Obreiros' })]),
      el('div', { class: 'metrica' }, [el('div', { class: 'valor', text: String(cunhadas) }), el('div', { class: 'rotulo', text: 'Cunhadas' })]),
      el('div', { class: 'metrica' }, [el('div', { class: 'valor', text: String(sobrinhos) }), el('div', { class: 'rotulo', text: 'Sobrinhos(as)' })])
    ]));

    const busca = el('input', { type: 'search', placeholder: 'Buscar Irmão…', style: 'width:100%;padding:11px;font-size:15px;font-family:inherit;border:1px solid var(--c-borda);border-radius:10px;margin-bottom:12px' });
    caixa.appendChild(busca);

    const cartao = el('div', { class: 'cartao' });
    caixa.appendChild(cartao);

    function pintarLista() {
      const termo = busca.value.trim().toLowerCase();
      const filtrados = termo ? lista.filter((o) => o.nome.toLowerCase().indexOf(termo) >= 0) : lista;
      cartao.innerHTML = '';

      if (!filtrados.length) {
        cartao.appendChild(el('div', { class: 'vazio', text: 'Nenhum Irmão encontrado.' }));
        return;
      }

      for (const o of filtrados) {
        const datas = [];
        if (o.dt_nascimento) datas.push('Nasc. ' + o.dt_nascimento.slice(8, 10) + '/' + o.dt_nascimento.slice(5, 7));
        if (o.dt_iniciacao) datas.push('Inic. ' + o.dt_iniciacao.slice(8, 10) + '/' + o.dt_iniciacao.slice(5, 7));
        if (o.dt_casamento) datas.push('Casam. ' + o.dt_casamento.slice(8, 10) + '/' + o.dt_casamento.slice(5, 7));

        const fam = o.familiares.map((f) => f.nome).join(', ');
        cartao.appendChild(el('div', { class: 'item-lista' }, [
          el('strong', { text: (o.tratamento || '') + ' ' + o.nome }),
          el('small', { text: [o.grau, o.situacao].filter(Boolean).join(' • ') + (datas.length ? ' — ' + datas.join(' | ') : '') }),
          fam ? el('small', { text: 'Família: ' + fam }) : null
        ]));
      }
    }

    busca.addEventListener('input', pintarLista);
    pintarLista();
    return caixa;
  }

  function telaDados() {
    const caixa = el('div');
    const r = app.banco.resumo;
    const gerado = r.gerado_em ? new Date(r.gerado_em).toLocaleString('pt-BR') : '—';

    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Dados carregados neste celular' }),
      el('div', { class: 'item-lista' }, [el('strong', { text: 'Exportado em' }), el('small', { text: gerado })]),
      el('div', { class: 'item-lista' }, [el('strong', { text: r.obreiros + ' obreiros' }), el('small', { text: r.familiares + ' familiares' })]),
      el('div', { class: 'item-lista' }, [el('strong', { text: r.datas + ' datas no calendário' }), el('small', { text: r.sessoes + ' sessões programadas' })]),
      el('div', { class: 'item-lista' }, [el('strong', { text: r.modelos + ' modelos de mensagem' })])
    ]));

    const v = app.versao || versaoGuardada();
    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Sincronizar com a Loja' }),
      el('p', {
        style: 'font-size:13.5px;color:var(--c-texto-suave);line-height:1.5;margin-top:0',
        text: v
          ? `Você está na versão ${v.versao}, publicada em ${new Date(v.gerado_em).toLocaleString('pt-BR')}.`
          : 'Ainda não sincronizou com o repositório da Loja.'
      }),
      el('button', {
        class: 'btn largo', text: app.sincronizando ? 'Sincronizando…' : '🔄 Buscar atualizações',
        disabled: app.sincronizando, onclick: () => sincronizar(false)
      }),
      el('div', { style: 'height:8px' }),
      el('button', {
        class: 'btn secundario largo', text: '📂 Carregar arquivo .ctrloja',
        onclick: () => $('#arquivo').click()
      })
    ]));

    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Privacidade' }),
      el('p', {
        style: 'font-size:13.5px;color:var(--c-texto-suave);line-height:1.5;margin:0 0 14px',
        text: 'Os dados dos Irmãos e de suas famílias ficam guardados apenas neste aparelho. '
          + 'O arquivo publicado pela Loja é cifrado: sem a senha, não passa de texto embaralhado. '
          + 'As mensagens saem pelo seu WhatsApp, sem automação.'
      }),
      el('button', {
        class: 'btn secundario largo', text: '🗑 Apagar os dados deste celular',
        onclick: () => {
          if (!confirm('Apagar a agenda guardada neste celular? Você precisará carregar o arquivo novamente.')) return;
          localStorage.removeItem(CHAVE);
          localStorage.removeItem(CHAVE_VERSAO);
          localStorage.removeItem(CHAVE_SENHA);
          app.pacote = null; app.banco = null; app.nucleo = null; app.versao = null;
          $('#abas').hidden = true;
          $('#cargos').hidden = true;
          $('#tituloLoja').textContent = 'CtrLoja';
          $('#subtituloLoja').textContent = 'Agenda da Loja no seu celular';
          pintar();
          aviso('Dados apagados deste aparelho.', 'ok');
        }
      })
    ]));

    return caixa;
  }

  function telaEmConstrucao(cargo) {
    return el('div', { class: 'cartao importar' }, [
      el('div', { style: 'font-size:46px;margin-bottom:10px', text: cargo.icone }),
      el('h2', { text: cargo.nome }),
      el('p', { text: cargo.descricao }),
      el('div', { class: 'aviso info', style: 'text-align:left' },
        [document.createTextNode('Este cargo ainda não tem funções no aplicativo. '
          + 'A estrutura já está pronta: as telas entram aqui conforme forem definidas.')])
    ]);
  }

  /* ---------------- desenho ---------------- */

  function pintar() {
    const alvo = $('#conteudo');
    alvo.innerHTML = '';

    if (!app.banco) { alvo.appendChild(telaImportar()); return; }

    pintarCargos();
    pintarAbas();

    const cargo = CtrLojaCargos.obter(app.cargo);

    try {
      if (app.aba === 'dados') alvo.appendChild(telaDados());
      else if (!cargo.disponivel) alvo.appendChild(telaEmConstrucao(cargo));
      else if (app.aba === 'hoje') alvo.appendChild(telaHoje());
      else if (app.aba === 'proximos') alvo.appendChild(telaProximos());
      else if (app.aba === 'obreiros') alvo.appendChild(telaObreiros());
      else alvo.appendChild(telaEmConstrucao(cargo));
    } catch (err) {
      alvo.appendChild(el('div', { class: 'aviso erro', text: 'Erro ao montar a tela: ' + err.message }));
    }
    window.scrollTo(0, 0);
  }

  function pintarCargos() {
    const barra = $('#cargos');
    barra.innerHTML = '';
    for (const c of CtrLojaCargos.lista) {
      barra.appendChild(el('button', {
        class: 'cargo' + (c.chave === app.cargo ? ' ativo' : '') + (c.disponivel ? '' : ' indisponivel'),
        text: `${c.icone} ${c.nome}`,
        onclick: () => {
          app.cargo = c.chave;
          const abas = CtrLojaCargos.abasDe(c.chave);
          app.aba = abas[0].chave;
          pintar();
        }
      }));
    }
  }

  function pintarAbas() {
    const barra = $('#abas');
    barra.innerHTML = '';
    for (const a of CtrLojaCargos.abasDe(app.cargo)) {
      barra.appendChild(el('button', {
        class: 'aba' + (a.chave === app.aba ? ' ativa' : ''),
        text: a.nome,
        onclick: () => { app.aba = a.chave; pintar(); }
      }));
    }
  }

  /* ---------------- início ---------------- */

  document.addEventListener('DOMContentLoaded', async () => {
    $('#arquivo').addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (f) lerArquivo(f);
      ev.target.value = '';
    });

    app.versao = versaoGuardada();

    const guardado = localStorage.getItem(CHAVE);
    if (guardado) {
      try {
        await usarPacote(JSON.parse(guardado), false);
      } catch (err) {
        aviso('Os dados guardados não puderam ser lidos: ' + err.message, 'erro', 7000);
      }
    }
    pintar();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });
}());
