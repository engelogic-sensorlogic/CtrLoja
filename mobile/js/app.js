/* ==================================================================
   CtrLoja Mobile — interface
   ==================================================================

   O aplicativo e distribuido a todos os Irmaos da Loja e se divide em
   dois niveis:

     INICIO   aberto, somente leitura. Eventos do dia, agenda da Loja e
              os proximos acontecimentos. Sem texto de mensagem e sem
              botao de envio.

     CARGOS   protegidos por senha propria. Dentro deles ficam as
              funcoes de trabalho: disparar as mensagens e solicitar a
              inclusao de informacoes.

   O disparo e sempre MANUAL: o aplicativo monta a mensagem e entrega o
   texto pronto ao WhatsApp do proprio aparelho. Quem envia e o
   WhatsApp, pelo caminho oficial - nao ha automacao, nao ha risco de
   bloqueio da conta.

   Os dados vem do pacote cifrado publicado pelo CtrLoja do computador e
   ficam guardados apenas neste celular.
   ================================================================== */

(function () {
  'use strict';

  // Aparece na aba Dados. Serve para conferir, de olho, se o aparelho
  // esta mesmo com a ultima versao publicada do aplicativo.
  const VERSAO_APP = '2026.08.09-5';

  const CHAVE = 'ctrloja.pacote';
  const CHAVE_VERSAO = 'ctrloja.versao';
  const CHAVE_SENHA = 'ctrloja.senha';
  const CHAVE_DESTRAVADOS = 'ctrloja.destravados';
  const ORIGEM_DADOS = 'dados/';
  const MESES_CURTO = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const app = {
    pacote: null,
    banco: null,
    nucleo: null,
    area: 'inicio',
    aba: 'hoje',
    data: hojeISO(),
    versao: null,
    sincronizando: false,
    conferindo: false,
    // Chamada em andamento: sessão escolhida, marcações e quem a faz
    chamadaData: null,
    chamadaMarcados: null,
    chamadaPor: '',
    // Mês aberto no extrato de cada área, e quem está lançando
    extratoMes: {},
    lancadoPor: ''
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

  /* ---------------- trancas dos Cargos ---------------- */
  /*
     A senha de cada Cargo e conferida contra a impressao digital que
     veio no pacote. O destravamento vale enquanto o aplicativo estiver
     aberto (sessionStorage): fechou, tranca de novo.

     Sejamos francos sobre o alcance: os dados ja estao no aparelho
     depois de sincronizados. A senha do Cargo e a tranca da porta, nao
     um cofre - ela impede que quem pegue o celular use as funcoes do
     Cargo, que e o problema real.
  */

  function destravados() {
    try { return new Set(JSON.parse(sessionStorage.getItem(CHAVE_DESTRAVADOS) || '[]')); }
    catch { return new Set(); }
  }

  function gravarDestravados(conjunto) {
    try { sessionStorage.setItem(CHAVE_DESTRAVADOS, JSON.stringify([...conjunto])); }
    catch { /* aparelho sem sessionStorage: a tranca vale só nesta tela */ }
  }

  /** Impressao digital publicada para o Cargo, ou null se nao ha senha. */
  function envelopeSenha(chaveArea) {
    if (!app.banco) return null;
    const cfg = app.banco.config.obterTodas();
    const bruto = cfg[CtrLojaCargos.chaveSenha(chaveArea)];
    if (!bruto) return null;
    try {
      const env = JSON.parse(bruto);
      return env && env.formato === CtrLojaCripto.FORMATO_SENHA ? env : null;
    } catch { return null; }
  }

  function liberado(chaveArea) {
    const area = CtrLojaCargos.obter(chaveArea);
    if (area.publico) return true;
    if (!envelopeSenha(chaveArea)) return true;      // sem senha definida: aberto
    return destravados().has(chaveArea);
  }

  function trancar(chaveArea) {
    const c = destravados();
    c.delete(chaveArea);
    gravarDestravados(c);
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
        app.area = 'inicio';
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

  /* --- navegacao de data, usada em Inicio e na Chancelaria --- */
  function linhaData() {
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
    return caixa;
  }

  /* --- cartao de evento --- */

  function cabecalhoEvento(item, mostrarData) {
    const iso = item.data || '';
    return el('div', { class: 'evento-topo' }, [
      mostrarData && iso ? el('div', { class: 'evento-data' }, [
        el('span', { class: 'd', text: iso.slice(8, 10) }),
        el('span', { class: 'm', text: MESES_CURTO[Number(iso.slice(5, 7)) - 1] })
      ]) : null,
      el('div', { class: 'evento-info' }, [
        el('strong', { text: (item.titulo_pessoa ? item.titulo_pessoa + ' ' : '') + (item.nome || item.evento || '') }),
        el('small', {
          text: (item.categoria === 'obreiro' || item.categoria === 'familiar')
            ? `${item.rotulo || ''}${item.anos !== null && item.anos !== undefined ? ' — ' + item.anos + ' ano(s)' : ''}`
            : (item.rotulo || '')
        })
      ]),
      el('span', { class: 'tag ' + item.categoria, text: rotuloCategoria(item.categoria) })
    ]);
  }

  /**
   * Cartao para a area publica: informa, nao age.
   * Nada de texto de mensagem nem de botao de envio - isso e do Cargo.
   */
  function cartaoLeitura(item, mostrarData) {
    const bloco = el('div', { class: 'evento leitura' }, [cabecalhoEvento(item, mostrarData)]);

    if (item.categoria === 'sessao') {
      bloco.classList.add('com-detalhe');
      const detalhes = [
        item.hora_sessao ? 'Às ' + item.hora_sessao : null,
        item.local_sessao || null
      ].filter(Boolean).join(' · ');

      if (detalhes) bloco.appendChild(el('div', { class: 'sessao-detalhe', text: detalhes }));

      const pauta = String(item.agenda_dia || '').trim();
      bloco.appendChild(pauta
        ? el('div', { class: 'pauta' }, [
          el('h4', { text: 'Agenda do Dia' }),
          el('pre', { text: pauta })
        ])
        : el('div', { class: 'sessao-detalhe', style: 'font-style:italic', text: 'Agenda do dia ainda não publicada.' }));
    }

    return bloco;
  }

  /** Cartao para dentro do Cargo: traz o texto pronto e os botoes. */
  function cartaoAcao(item, mostrarData) {
    const bloco = el('div', { class: 'evento' + (item.bloqueado ? ' bloqueado' : '') }, [
      cabecalhoEvento(item, mostrarData)
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

  /* --- Inicio: Hoje (somente leitura) --- */

  function telaHojePublico() {
    const caixa = linhaData();
    const fila = app.nucleo.agenda.montarFila(app.data);

    caixa.appendChild(el('div', { class: 'aviso info', text: dataExtenso(app.data) + ' — ' + fila.total + ' evento(s)' }));

    if (!fila.total) {
      caixa.appendChild(el('div', { class: 'cartao' }, [
        el('div', { class: 'vazio', text: 'Nenhum evento nesta data.' })
      ]));
      return caixa;
    }

    for (const item of fila.itens) caixa.appendChild(cartaoLeitura(item, false));
    return caixa;
  }

  /* --- Proximos (lista) --- */

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

    const abaDia = CtrLojaCargos.obter(app.area).publico ? 'hoje' : 'mensagens';

    for (const dia of lista) {
      for (const evt of dia.eventos) {
        const cartao = el('div', { class: 'evento lista' + (evt.bloqueado ? ' bloqueado' : '') }, [
          cabecalhoEvento(Object.assign({}, evt, { data: dia.data }), true)
        ]);
        cartao.addEventListener('click', () => { app.data = dia.data; app.aba = abaDia; pintar(); });
        caixa.appendChild(cartao);
      }
    }
    return caixa;
  }

  /* --- Chancelaria: Mensagens (com disparo) --- */

  function telaMensagens() {
    const caixa = linhaData();
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

    for (const item of fila.itens) caixa.appendChild(cartaoAcao(item, false));
    return caixa;
  }

  /* --- Chancelaria: Obreiros --- */

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

    const busca = el('input', { type: 'search', placeholder: 'Buscar Irmão…', class: 'busca' });
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

  /* --- Gráficos, desenhados à mão em SVG --- */
  /*
     Nenhuma biblioteca: o aplicativo precisa abrir sem internet e um
     gráfico de barras é meia dúzia de retângulos. Menos peso, menos
     dependência e o desenho combina com as cores da Loja.
  */

  function svg(tag, attrs, filhos) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in (attrs || {})) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      n.setAttribute(k, attrs[k]);
    }
    for (const f of [].concat(filhos || [])) if (f) n.appendChild(f);
    return n;
  }

  /** Barras verticais: comparecimento sessão a sessão. */
  function graficoSessoes(linhas) {
    const dados = linhas.slice(-12);              // últimas doze cabem na tela
    if (!dados.length) return null;

    const L = 300, A = 132, base = A - 22, topo = 12;
    const largura = L / dados.length;
    const barra = Math.min(largura * 0.6, 26);

    const g = svg('svg', { viewBox: `0 0 ${L} ${A}`, class: 'grafico', role: 'img' });

    // Linha da média, para dar referência ao olho
    const media = dados.reduce((s, d) => s + d.percentual, 0) / dados.length;
    const yMedia = base - (media / 100) * (base - topo);
    g.appendChild(svg('line', {
      x1: 0, y1: yMedia, x2: L, y2: yMedia,
      stroke: 'var(--c-acento)', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: '.5'
    }));

    dados.forEach((d, i) => {
      const altura = Math.max(2, (d.percentual / 100) * (base - topo));
      const x = i * largura + (largura - barra) / 2;
      g.appendChild(svg('rect', {
        x, y: base - altura, width: barra, height: altura, rx: 3,
        fill: d.percentual >= media ? 'var(--c-acento)' : '#8FC4DA'
      }));
      g.appendChild(svg('text', {
        x: x + barra / 2, y: base - altura - 3, 'text-anchor': 'middle',
        'font-size': '8', fill: 'var(--c-texto-suave)'
      }, [document.createTextNode(String(d.presentes))]));
      g.appendChild(svg('text', {
        x: x + barra / 2, y: A - 6, 'text-anchor': 'middle',
        'font-size': '8', fill: 'var(--c-texto-suave)'
      }, [document.createTextNode(d.data.slice(8, 10) + '/' + d.data.slice(5, 7))]));
    });

    return g;
  }

  /** Barra horizontal de proporção, usada na frequência de cada Irmão. */
  function barraPercentual(pct) {
    const fora = el('div', { class: 'barra' });
    fora.appendChild(el('div', {
      class: 'barra-dentro' + (pct >= 75 ? ' boa' : (pct >= 50 ? ' media' : ' baixa')),
      style: 'width:' + Math.max(2, Math.min(100, pct)) + '%'
    }));
    return fora;
  }

  /* --- Início: relatório de presença, aberto a todos --- */

  function telaPresencaPublica() {
    const caixa = el('div');
    const est = app.nucleo.presenca.estatisticas({});

    if (!est.total_sessoes) {
      caixa.appendChild(el('div', { class: 'cartao' }, [
        el('div', { class: 'vazio', text: 'Nenhuma chamada registrada ainda.' })
      ]));
      caixa.appendChild(el('div', {
        class: 'aviso info',
        text: 'A lista de presença é feita pela Chancelaria durante a sessão. '
          + 'Assim que for enviada ao computador e publicada, o relatório aparece aqui.'
      }));
      return caixa;
    }

    caixa.appendChild(el('div', { class: 'metricas', style: 'margin-bottom:12px' }, [
      el('div', { class: 'metrica' }, [
        el('div', { class: 'valor', text: String(est.total_sessoes) }),
        el('div', { class: 'rotulo', text: 'Sessões' })
      ]),
      el('div', { class: 'metrica' }, [
        el('div', { class: 'valor', text: String(est.media_presentes) }),
        el('div', { class: 'rotulo', text: 'Média presentes' })
      ]),
      el('div', { class: 'metrica' }, [
        el('div', { class: 'valor', text: est.percentual_medio + '%' }),
        el('div', { class: 'rotulo', text: 'Comparecimento' })
      ])
    ]));

    const grafico = graficoSessoes(est.sessoes);
    if (grafico) {
      caixa.appendChild(el('div', { class: 'cartao' }, [
        el('h2', { text: 'Comparecimento por sessão' }),
        grafico,
        el('p', {
          class: 'legenda',
          text: 'Cada barra é uma sessão; o número acima é quantos Irmãos compareceram. '
            + 'A linha tracejada marca a média do período.'
        })
      ]));
    }

    if (est.ultima) {
      const u = est.ultima;
      caixa.appendChild(el('div', { class: 'cartao' }, [
        el('h2', { text: 'Última sessão com chamada' }),
        el('div', { class: 'item-lista' }, [
          el('strong', { text: dataExtenso(u.data) }),
          el('small', { text: u.rotulo || '' }),
          el('small', { text: `${u.presentes} presentes de ${u.total} — ${u.percentual}%` })
        ])
      ]));
    }

    const lista = el('div', { class: 'cartao' }, [el('h2', { text: 'Frequência dos Irmãos' })]);
    for (const o of est.obreiros) {
      lista.appendChild(el('div', { class: 'item-lista' }, [
        el('div', { class: 'freq-topo' }, [
          el('strong', { text: (o.tratamento || '') + ' ' + o.nome }),
          el('span', { class: 'freq-pct', text: o.percentual + '%' })
        ]),
        barraPercentual(o.percentual),
        el('small', { text: `${o.presencas} presenças em ${o.chamadas} sessões` })
      ]));
    }
    caixa.appendChild(lista);

    return caixa;
  }

  /* --- Chancelaria: fazer a chamada --- */
  /*
     O celular não grava no banco da Loja. A lista marcada aqui vira um
     pacote que o Chanceler manda ao PC Mestre - por arquivo ou pelo
     WhatsApp - e é lá que ela entra no cadastro.
  */

  function telaChamada() {
    const caixa = el('div');
    const sessoes = app.nucleo.presenca.sessoesParaChamada(60);

    if (!sessoes.length) {
      caixa.appendChild(el('div', { class: 'cartao' }, [
        el('div', { class: 'vazio', text: 'Nenhuma sessão cadastrada na Agenda da Loja.' })
      ]));
      return caixa;
    }

    if (!app.chamadaData || !sessoes.some((s) => s.data === app.chamadaData)) {
      // Abre na sessão mais próxima de hoje, que é quase sempre a de agora
      const hoje = hojeISO();
      const passadas = sessoes.filter((s) => s.data <= hoje);
      app.chamadaData = (passadas[0] || sessoes[sessoes.length - 1]).data;
      app.chamadaMarcados = null;
    }

    const seletor = el('select', { class: 'campo-largo' });
    for (const s of sessoes) {
      seletor.appendChild(el('option', {
        value: s.data,
        selected: s.data === app.chamadaData,
        text: `${s.data.slice(8, 10)}/${s.data.slice(5, 7)}/${s.data.slice(0, 4)} — ${s.rotulo}`
          + (s.tem_chamada ? '  ✓' : '')
      }));
    }
    seletor.addEventListener('change', () => {
      app.chamadaData = seletor.value;
      app.chamadaMarcados = null;
      pintar();
    });

    const lista = app.nucleo.presenca.listaDaSessao(app.chamadaData);

    // Marcações desta tela; partem do que já veio registrado
    if (!app.chamadaMarcados) {
      app.chamadaMarcados = {};
      for (const i of lista.itens) app.chamadaMarcados[i.obreiro_id] = i.presente;
    }

    const responsavel = el('input', {
      type: 'text', class: 'campo-largo', placeholder: 'Quem está fazendo a chamada',
      value: app.chamadaPor || ''
    });
    responsavel.addEventListener('input', () => { app.chamadaPor = responsavel.value; });

    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Lista de Presença' }),
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Sessão' }), seletor]),
      el('div', { class: 'sessao-resumo' }, [
        el('div', { text: dataExtenso(app.chamadaData) }),
        el('strong', { text: lista.rotulo || 'Sessão sem grau definido' }),
        lista.hora ? el('small', { text: 'Às ' + lista.hora }) : null
      ]),
      lista.tem_chamada
        ? el('div', { class: 'aviso info', text: 'Esta sessão já tem chamada registrada. Reenviar substitui a anterior.' })
        : null,
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Chamada feita por' }), responsavel])
    ]));

    /* --- contador e marcação em massa --- */

    const contador = el('div', { class: 'contador' });
    const cartaoLista = el('div', { class: 'cartao' });

    function atualizarContador() {
      const marcados = lista.itens.filter((i) => app.chamadaMarcados[i.obreiro_id]).length;
      contador.innerHTML = '';
      contador.appendChild(el('strong', { text: `${marcados} de ${lista.total} presentes` }));
      contador.appendChild(el('span', {
        text: lista.total ? Math.round((marcados / lista.total) * 100) + '%' : '0%'
      }));
    }

    caixa.appendChild(el('div', { class: 'cartao' }, [
      contador,
      el('div', { class: 'linha-botoes' }, [
        el('button', {
          class: 'btn secundario', text: '✓ Marcar todos',
          onclick: () => {
            for (const i of lista.itens) app.chamadaMarcados[i.obreiro_id] = true;
            pintarItens(); atualizarContador();
          }
        }),
        el('button', {
          class: 'btn secundario', text: '✗ Desmarcar todos',
          onclick: () => {
            for (const i of lista.itens) app.chamadaMarcados[i.obreiro_id] = false;
            pintarItens(); atualizarContador();
          }
        })
      ])
    ]));

    function pintarItens() {
      cartaoLista.innerHTML = '';
      if (!lista.itens.length) {
        cartaoLista.appendChild(el('div', { class: 'vazio', text: 'Nenhum Obreiro ativo no quadro.' }));
        return;
      }
      for (const i of lista.itens) {
        const marca = el('input', { type: 'checkbox', class: 'marca' });
        marca.checked = !!app.chamadaMarcados[i.obreiro_id];
        marca.addEventListener('change', () => {
          app.chamadaMarcados[i.obreiro_id] = marca.checked;
          linha.classList.toggle('presente', marca.checked);
          atualizarContador();
        });

        const linha = el('label', { class: 'chamada-item' + (marca.checked ? ' presente' : '') }, [
          marca,
          el('div', { class: 'chamada-nome' }, [
            el('strong', { text: (i.tratamento || '') + ' ' + i.nome }),
            el('small', { text: i.grau || '' })
          ])
        ]);
        cartaoLista.appendChild(linha);
      }
    }

    pintarItens();
    atualizarContador();
    caixa.appendChild(cartaoLista);

    /* --- fechamento: volta ao PC Mestre --- */

    function montarPacote() {
      const cfg = app.banco.config.obterTodas();
      return app.nucleo.presencaPacote.montar({
        data: app.chamadaData,
        grau: lista.grau,
        tipo: lista.tipo,
        loja: cfg.loja_nome || '',
        chamadaPor: (app.chamadaPor || '').trim() || null,
        itens: lista.itens.map((i) => ({
          obreiro_id: i.obreiro_id,
          presente: !!app.chamadaMarcados[i.obreiro_id]
        }))
      });
    }

    function baixarArquivo() {
      try {
        const pacote = montarPacote();
        const nome = app.nucleo.presencaPacote.nomeArquivo(pacote);
        const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: nome });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        aviso('Arquivo ' + nome + ' salvo. Leve-o ao computador e use Importar presença.', 'ok', 8000);
      } catch (err) {
        aviso(err.message || 'Falha ao gerar o arquivo.', 'erro', 7000);
      }
    }

    function enviarWhatsApp() {
      try {
        const pacote = montarPacote();
        enviarPeloWhatsApp(app.nucleo.presencaPacote.paraTexto(pacote, dataExtenso(pacote.data)));
      } catch (err) {
        aviso(err.message || 'Falha ao montar a mensagem.', 'erro', 7000);
      }
    }

    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Enviar ao PC Mestre' }),
      el('p', {
        style: 'font-size:13px;color:var(--c-texto-suave);line-height:1.55;margin-top:0',
        text: 'O celular não grava no cadastro da Loja. A lista vai ao computador por um '
          + 'destes caminhos, e lá é importada e publicada de volta a todos.'
      }),
      el('button', { class: 'btn zap largo', text: '📤 Enviar pelo WhatsApp', onclick: enviarWhatsApp }),
      el('div', { style: 'height:8px' }),
      el('button', { class: 'btn secundario largo', text: '💾 Salvar arquivo .presenca', onclick: baixarArquivo }),
      el('p', {
        class: 'legenda',
        text: 'O arquivo é o caminho mais seguro: nada se perde se a mensagem for cortada. '
          + 'O WhatsApp é o mais rápido quando você está no Templo.'
      })
    ]));

    return caixa;
  }

  /* --- Dinheiro --- */

  /* Formata em real. O separador de milhar é aplicado só na parte
     inteira — mexer na cadeia inteira acabaria comendo os centavos. */
  const moeda = (v) => {
    const n = Number(v || 0);
    const partes = Math.abs(n).toFixed(2).split('.');
    const inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '- ' : '') + 'R$ ' + inteiro + ',' + partes[1];
  };

  /* --- Gráfico financeiro: barras de entrada e saída por mês --- */

  function graficoFinanceiro(serie, naturezas) {
    const dados = serie.slice(-8);
    if (!dados.length) return null;

    const entram = naturezas.filter((n) => n.sinal > 0).map((n) => n.chave);
    const saem = naturezas.filter((n) => n.sinal < 0).map((n) => n.chave);
    const soma = (p, chaves) => chaves.reduce((s, c) => s + (Number(p[c]) || 0), 0);

    const maior = Math.max(1, ...dados.map((p) => Math.max(soma(p, entram), soma(p, saem))));

    const L = 300, A = 130, base = A - 20, topo = 10;
    const passo = L / dados.length;
    const barra = Math.min(passo * 0.3, 14);

    const g = svg('svg', { viewBox: `0 0 ${L} ${A}`, class: 'grafico' });

    dados.forEach((p, i) => {
      const meio = i * passo + passo / 2;
      const alt = (v) => Math.max(1, (v / maior) * (base - topo));

      const hE = alt(soma(p, entram));
      const hS = alt(soma(p, saem));

      g.appendChild(svg('rect', {
        x: meio - barra - 1, y: base - hE, width: barra, height: hE, rx: 2, fill: 'var(--c-ok)'
      }));
      g.appendChild(svg('rect', {
        x: meio + 1, y: base - hS, width: barra, height: hS, rx: 2, fill: '#D98324'
      }));
      g.appendChild(svg('text', {
        x: meio, y: A - 6, 'text-anchor': 'middle', 'font-size': '8', fill: 'var(--c-texto-suave)'
      }, [document.createTextNode(p.mes.slice(5) + '/' + p.mes.slice(2, 4))]));
    });

    g.appendChild(svg('line', {
      x1: 0, y1: base, x2: L, y2: base, stroke: 'var(--c-borda)', 'stroke-width': 1
    }));
    return g;
  }

  function legendaFinanceira(naturezas) {
    const item = (cor, nome) => el('span', { class: 'legenda-item' }, [
      el('i', { style: 'background:' + cor }), document.createTextNode(nome)
    ]);
    return el('div', { class: 'legenda-cores' }, [
      item('var(--c-ok)', naturezas.filter((n) => n.sinal > 0).map((n) => n.nome).join(' / ')),
      item('#D98324', naturezas.filter((n) => n.sinal < 0).map((n) => n.nome).join(' / '))
    ]);
  }

  /* --- Secretaria: Agenda da Loja --- */
  /*
     A mesma lista de Próximos, mas só das sessões: é a pauta que o
     Secretário acompanha. Daqui ele pede ao computador a inclusão ou a
     correção da ordem do dia, e avisa os Irmãos de mudança de última
     hora — sem escrever no cadastro, que continua sendo do PC Mestre.
  */

  function telaAgendaSecretaria(area) {
    const caixa = el('div');
    const hoje = hojeISO();
    const sessoes = app.banco.sessoes.listar({ de: hoje, somenteAtivas: true });

    caixa.appendChild(el('div', { class: 'aviso info', text: 'Próximas sessões programadas' }));

    if (!sessoes.length) {
      caixa.appendChild(el('div', { class: 'cartao' }, [
        el('div', { class: 'vazio', text: 'Nenhuma sessão programada daqui em diante.' })
      ]));
    }

    const ROTULO_TIPO = { Economica: 'Econômica', Magna: 'Magna' };

    for (const s of sessoes) {
      const pauta = String(s.agenda_dia || '').trim();
      const bloco = el('div', { class: 'evento leitura com-detalhe' }, [
        el('div', { class: 'evento-topo' }, [
          el('div', { class: 'evento-data' }, [
            el('span', { class: 'd', text: s.data.slice(8, 10) }),
            el('span', { class: 'm', text: MESES_CURTO[Number(s.data.slice(5, 7)) - 1] })
          ]),
          el('div', { class: 'evento-info' }, [
            el('strong', { text: `Sessão ${ROTULO_TIPO[s.tipo] || s.tipo} — Grau de ${s.grau}` }),
            el('small', { text: [s.hora ? 'Às ' + s.hora : null, s.local].filter(Boolean).join(' · ') })
          ]),
          el('span', { class: 'tag sessao', text: 'Sessão' })
        ])
      ]);

      bloco.appendChild(pauta
        ? el('div', { class: 'pauta' }, [
          el('h4', { text: 'Agenda do Dia' }),
          el('pre', { text: pauta })
        ])
        : el('div', { class: 'sessao-detalhe', style: 'font-style:italic', text: 'Ordem do dia ainda não lançada.' }));

      caixa.appendChild(bloco);
    }

    /* --- pedidos ao PC Mestre e aviso aos Irmãos --- */

    const selSessao = el('select', { class: 'campo-largo' });
    for (const s of sessoes) {
      selSessao.appendChild(el('option', {
        value: s.data,
        text: `${s.data.slice(8, 10)}/${s.data.slice(5, 7)} — ${ROTULO_TIPO[s.tipo] || s.tipo}, Grau de ${s.grau}`
      }));
    }

    const texto = el('textarea', {
      class: 'campo-largo', rows: '5',
      placeholder: 'Descreva a ordem do dia, ou o que deve ser corrigido nela'
    });
    const assina = el('input', { type: 'text', class: 'campo-largo', placeholder: 'Seu nome' });

    const escolhida = () => sessoes.find((s) => s.data === selSessao.value) || sessoes[0] || null;

    function pedidoDePauta() {
      const cfg = app.banco.config.obterTodas();
      const s = escolhida();
      const linhas = [
        '*PEDIDO — SECRETARIA*',
        cfg.loja_nome || '',
        '',
        'Assunto: Agenda do Dia'
      ];
      if (s) {
        linhas.push('Sessão: ' + dataExtenso(s.data));
        linhas.push(`${ROTULO_TIPO[s.tipo] || s.tipo}, Grau de ${s.grau}`);
      }
      if (assina.value.trim()) linhas.push('Solicitante: ' + assina.value.trim());
      if (texto.value.trim()) linhas.push('', texto.value.trim());
      linhas.push('', '_Enviado pelo CtrLoja em ' + dataExtenso(hojeISO()) + '_');
      return linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
    }

    function avisoAosIrmaos() {
      const cfg = app.banco.config.obterTodas();
      const s = escolhida();
      const linhas = ['*ALTERAÇÃO NA PAUTA*', cfg.loja_nome || ''];
      if (s) {
        linhas.push('');
        linhas.push('Sessão de ' + dataExtenso(s.data));
        linhas.push(`${ROTULO_TIPO[s.tipo] || s.tipo}, Grau de ${s.grau}`);
      }
      if (texto.value.trim()) linhas.push('', texto.value.trim());
      linhas.push('', 'T∴F∴A∴');
      return linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
    }

    const cartao = el('div', { class: 'cartao' }, [
      el('h2', { text: 'Pauta da sessão' }),
      el('p', {
        style: 'font-size:13px;color:var(--c-texto-suave);line-height:1.55;margin-top:0',
        text: 'A ordem do dia é lançada no computador da Loja. Daqui você pede a inclusão ou a '
          + 'correção, e avisa os Irmãos quando algo muda em cima da hora.'
      }),
      sessoes.length ? el('label', { class: 'campo-mobile' }, [el('span', { text: 'Sessão' }), selSessao]) : null,
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Seu nome' }), assina]),
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Ordem do dia ou correção' }), texto]),
      el('button', {
        class: 'btn largo', text: '📤 Pedir ao computador da Loja',
        onclick: () => {
          if (!texto.value.trim()) { aviso('Escreva a ordem do dia ou o que deve mudar.', 'erro'); return; }
          if (!assina.value.trim()) { aviso('Informe o seu nome.', 'erro'); return; }
          enviarPeloWhatsApp(pedidoDePauta());
        }
      }),
      el('div', { style: 'height:8px' }),
      el('button', {
        class: 'btn zap largo', text: '📣 Avisar os Irmãos da alteração',
        onclick: () => {
          if (!texto.value.trim()) { aviso('Escreva o que mudou na pauta.', 'erro'); return; }
          enviarPeloWhatsApp(avisoAosIrmaos());
        }
      }),
      el('p', {
        class: 'legenda',
        text: 'O primeiro botão fala com quem lança no cadastro. O segundo fala com a Loja inteira — '
          + 'use para mudança de última hora, antes da sessão.'
      })
    ]);

    caixa.appendChild(cartao);
    return caixa;
  }

  /* --- Tesouraria e Hospitalaria: Extrato Financeiro --- */
  /*
     Uma tela só para os dois cargos. Eles têm a mesma forma — entra
     dinheiro, sai dinheiro, sobra um saldo — e o que muda são os
     rótulos e as categorias, que vêm declarados do lado do computador,
     em src/main/services/financeiro.js. Duas telas quase iguais seriam
     duas oportunidades de divergir.

     O celular não grava no cadastro: o lançamento vira um pacote que
     volta ao PC Mestre por arquivo ou pelo WhatsApp.
  */

  function telaExtrato(area) {
    const chaveArea = area.areaFinanceira;
    const caixa = el('div');
    const fin = app.nucleo.financeiro;

    if (!app.extratoMes[chaveArea]) app.extratoMes[chaveArea] = fin.mesAtual();
    const mes = app.extratoMes[chaveArea];
    const extrato = fin.extratoDoMes(chaveArea, mes);
    const naturezas = fin.naturezasDe(chaveArea);

    /* --- navegação por mês --- */

    caixa.appendChild(el('div', { class: 'linha-data' }, [
      el('button', {
        class: 'btn secundario', style: 'flex:0 0 46px', text: '‹',
        onclick: () => { app.extratoMes[chaveArea] = fin.somarMes(mes, -1); pintar(); }
      }),
      el('div', { class: 'mes-atual', text: extrato.mes_extenso }),
      el('button', {
        class: 'btn secundario', style: 'flex:0 0 46px', text: '›',
        onclick: () => { app.extratoMes[chaveArea] = fin.somarMes(mes, 1); pintar(); }
      })
    ]));

    if (mes !== fin.mesAtual()) {
      caixa.appendChild(el('button', {
        class: 'btn secundario largo', style: 'margin-bottom:12px', text: 'Voltar para o mês atual',
        onclick: () => { app.extratoMes[chaveArea] = fin.mesAtual(); pintar(); }
      }));
    }

    /* --- saldo em destaque --- */

    caixa.appendChild(el('div', { class: 'saldo' + (extrato.saldo < 0 ? ' negativo' : '') }, [
      el('div', { class: 'rotulo', text: 'Saldo do mês' }),
      el('div', { class: 'valor', text: moeda(extrato.saldo) }),
      el('div', { class: 'acumulado', text: 'Acumulado até aqui: ' + moeda(extrato.acumulado) }),
      extrato.investido !== null && extrato.investido > 0
        ? el('div', { class: 'acumulado', text: 'Investido: ' + moeda(extrato.investido) })
        : null
    ]));

    /* --- lançamentos por natureza --- */

    for (const n of extrato.naturezas) {
      const cartao = el('div', { class: 'cartao' }, [
        el('div', { class: 'natureza-topo' }, [
          el('h2', { text: n.nome + (n.quantidade ? ` (${n.quantidade})` : '') }),
          el('span', {
            class: 'natureza-total' + (n.sinal < 0 ? ' saida' : (n.sinal > 0 ? ' entrada' : '')),
            text: moeda(n.total)
          })
        ])
      ]);

      if (!n.itens.length) {
        cartao.appendChild(el('div', { class: 'vazio', text: 'Nenhum lançamento neste mês.' }));
      } else {
        for (const i of n.itens) {
          cartao.appendChild(el('div', { class: 'item-lista' }, [
            el('div', { class: 'freq-topo' }, [
              el('strong', { text: i.categoria || 'Outros' }),
              el('span', { class: 'freq-pct', text: moeda(i.valor) })
            ]),
            el('small', {
              text: [i.data.slice(8, 10) + '/' + i.data.slice(5, 7), i.descricao].filter(Boolean).join(' — ')
            })
          ]));
        }

        if (n.categorias.length > 1) {
          const rep = el('div', { style: 'margin-top:10px' });
          for (const c of n.categorias) {
            rep.appendChild(el('div', { style: 'margin-bottom:6px' }, [
              el('div', { class: 'freq-topo' }, [
                el('small', { text: c.categoria }),
                el('small', { text: c.percentual + '%' })
              ]),
              barraPercentual(c.percentual)
            ]));
          }
          cartao.appendChild(rep);
        }
      }
      caixa.appendChild(cartao);
    }

    /* --- novo lançamento, que volta ao PC Mestre --- */

    const selNatureza = el('select', { class: 'campo-largo' });
    for (const n of naturezas) {
      selNatureza.appendChild(el('option', { value: n.chave, text: n.nome }));
    }

    const selCategoria = el('select', { class: 'campo-largo' });
    const pintarCategorias = () => {
      const n = fin.natureza(chaveArea, selNatureza.value);
      selCategoria.innerHTML = '';
      for (const c of (n ? n.categorias : [])) {
        selCategoria.appendChild(el('option', { value: c, text: c }));
      }
    };
    selNatureza.addEventListener('change', pintarCategorias);
    pintarCategorias();

    const campoData = el('input', { type: 'date', class: 'campo-largo', value: hojeISO() });
    const campoValor = el('input', {
      type: 'number', class: 'campo-largo', step: '0.01', min: '0', placeholder: '0,00', inputmode: 'decimal'
    });
    const campoDescricao = el('input', { type: 'text', class: 'campo-largo', placeholder: 'Descrição (opcional)' });
    const campoQuem = el('input', {
      type: 'text', class: 'campo-largo', placeholder: 'Quem está lançando',
      value: app.lancadoPor || ''
    });
    campoQuem.addEventListener('input', () => { app.lancadoPor = campoQuem.value; });

    function montarPacote() {
      const cfg = app.banco.config.obterTodas();
      return app.nucleo.financeiroPacote.montar({
        area: chaveArea,
        loja: cfg.loja_nome || '',
        lancadoPor: (campoQuem.value || '').trim() || null,
        itens: [{
          data: campoData.value,
          natureza: selNatureza.value,
          categoria: selCategoria.value,
          descricao: campoDescricao.value,
          valor: Number(String(campoValor.value).replace(',', '.'))
        }]
      });
    }

    const conferirCampos = () => {
      if (!campoData.value) { aviso('Informe a data do lançamento.', 'erro'); return false; }
      const v = Number(String(campoValor.value).replace(',', '.'));
      if (!Number.isFinite(v) || v <= 0) { aviso('Informe um valor maior que zero.', 'erro'); return false; }
      return true;
    };

    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Novo lançamento' }),
      el('p', {
        style: 'font-size:13px;color:var(--c-texto-suave);line-height:1.55;margin-top:0',
        text: 'O celular não grava no cadastro da Loja. O lançamento vai ao computador, é '
          + 'conferido lá e volta publicado a todos os Irmãos.'
      }),
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Natureza' }), selNatureza]),
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Categoria' }), selCategoria]),
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Data' }), campoData]),
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Valor (R$)' }), campoValor]),
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Descrição' }), campoDescricao]),
      el('label', { class: 'campo-mobile' }, [el('span', { text: 'Lançado por' }), campoQuem]),

      el('button', {
        class: 'btn zap largo', text: '📤 Enviar pelo WhatsApp',
        onclick: () => {
          if (!conferirCampos()) return;
          try { enviarPeloWhatsApp(app.nucleo.financeiroPacote.paraTexto(montarPacote())); }
          catch (err) { aviso(err.message || 'Falha ao montar o lançamento.', 'erro', 7000); }
        }
      }),
      el('div', { style: 'height:8px' }),
      el('button', {
        class: 'btn secundario largo', text: '💾 Salvar arquivo .financeiro',
        onclick: () => {
          if (!conferirCampos()) return;
          try {
            const pacote = montarPacote();
            const nome = app.nucleo.financeiroPacote.nomeArquivo(pacote);
            const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = el('a', { href: url, download: nome });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            aviso('Arquivo ' + nome + ' salvo. Leve-o ao computador e importe.', 'ok', 8000);
          } catch (err) {
            aviso(err.message || 'Falha ao gerar o arquivo.', 'erro', 7000);
          }
        }
      }),
      el('p', {
        class: 'legenda',
        text: 'O arquivo é o caminho mais seguro: nada se perde se a mensagem for cortada.'
      })
    ]));

    return caixa;
  }

  /* --- Início: situação financeira, aberta a todos --- */

  function blocoFinanceiroPublico(chaveArea) {
    const fin = app.nucleo.financeiro;
    const p = fin.painel(chaveArea, 8);
    const bloco = el('section', { class: 'grupo' });

    bloco.appendChild(el('h2', { class: 'grupo-titulo', text: p.area_nome }));

    if (!p.tem_dados) {
      bloco.appendChild(el('div', { class: 'cartao' }, [
        el('div', { class: 'vazio', text: 'Nenhum lançamento registrado ainda.' })
      ]));
      return bloco;
    }

    bloco.appendChild(el('div', { class: 'saldo' + (p.saldo_atual < 0 ? ' negativo' : '') }, [
      el('div', { class: 'rotulo', text: 'Saldo atual' }),
      el('div', { class: 'valor', text: moeda(p.saldo_atual) }),
      el('div', { class: 'acumulado', text: 'Movimento de ' + p.mes_extenso + ': ' + moeda(p.saldo_mes) }),
      p.investido ? el('div', { class: 'acumulado', text: 'Investido: ' + moeda(p.investido) }) : null
    ]));

    const metricas = el('div', { class: 'metricas', style: 'margin-bottom:12px' });
    for (const n of p.naturezas) {
      if (!n.sinal) continue;
      metricas.appendChild(el('div', { class: 'metrica' }, [
        el('div', { class: 'valor', style: 'font-size:15px', text: moeda(p.totais[n.chave]) }),
        el('div', { class: 'rotulo', text: n.nome + ' (total)' })
      ]));
    }
    bloco.appendChild(metricas);

    const g = graficoFinanceiro(p.serie, p.naturezas);
    if (g) {
      bloco.appendChild(el('div', { class: 'cartao' }, [
        el('h2', { text: 'Movimento mês a mês' }),
        g,
        legendaFinanceira(p.naturezas)
      ]));
    }

    /* Repartição do mês por categoria — sem lançamento a lançamento */
    for (const n of p.naturezas) {
      const cats = p.categorias[n.chave] || [];
      if (!n.sinal || !cats.length) continue;

      const cartao = el('div', { class: 'cartao' }, [
        el('h2', { text: n.nome + ' de ' + p.mes_extenso })
      ]);
      for (const c of cats) {
        cartao.appendChild(el('div', { class: 'item-lista' }, [
          el('div', { class: 'freq-topo' }, [
            el('strong', { text: c.categoria }),
            el('span', { class: 'freq-pct', text: moeda(c.total) })
          ]),
          barraPercentual(c.percentual),
          el('small', { text: c.percentual + '% do total' })
        ]));
      }
      bloco.appendChild(cartao);
    }

    return bloco;
  }

  function telaFinancasPublicas() {
    const caixa = el('div');
    caixa.appendChild(el('div', {
      class: 'aviso info',
      text: 'Situação financeira da Loja, como prestada em sessão. '
        + 'Os lançamentos individuais ficam com a Tesouraria e a Hospitalaria.'
    }));
    caixa.appendChild(blocoFinanceiroPublico('tesouraria'));
    caixa.appendChild(el('hr', { class: 'divisor' }));
    caixa.appendChild(blocoFinanceiroPublico('hospitalaria'));
    return caixa;
  }

  /* --- Solicitar inclusão --- */
  /*
     O aplicativo do celular nao escreve no banco da Loja: o cadastro e
     um so, e fica no computador. O que se faz aqui e montar um pedido
     bem formado e entregar ao WhatsApp, para que o Irmao escolha a quem
     enviar. Quem recebe lanca no CtrLoja e republica.
  */

  const ASSUNTOS = [
    ['obreiro', 'Inclusão de Obreiro'],
    ['cunhada', 'Inclusão de Cunhada'],
    ['sobrinho', 'Inclusão de Sobrinho(a)'],
    ['data', 'Correção / inclusão de data'],
    ['sessao', 'Agenda de sessão'],
    ['outro', 'Outro assunto']
  ];

  function telaSolicitar(area) {
    const caixa = el('div');

    const selAssunto = el('select', { class: 'campo-largo' });
    for (const [v, r] of ASSUNTOS) selAssunto.appendChild(el('option', { value: v, text: r }));

    const solicitante = el('input', { type: 'text', class: 'campo-largo', placeholder: 'Seu nome' });
    const refNome = el('input', { type: 'text', class: 'campo-largo', placeholder: 'Nome completo de quem o pedido trata' });
    const refData = el('input', { type: 'date', class: 'campo-largo' });
    const detalhe = el('textarea', { class: 'campo-largo', rows: '4', placeholder: 'Descreva o que precisa ser incluído ou corrigido' });

    const rotulo = (t, campo) => el('label', { class: 'campo-mobile' }, [el('span', { text: t }), campo]);

    function montarTexto() {
      const cfg = app.banco.config.obterTodas();
      const nomeAssunto = (ASSUNTOS.find((a) => a[0] === selAssunto.value) || [])[1] || '';
      const linhas = [
        '*PEDIDO — ' + area.nome.toUpperCase() + '*',
        cfg.loja_nome || '',
        '',
        'Assunto: ' + nomeAssunto
      ];
      if (solicitante.value.trim()) linhas.push('Solicitante: ' + solicitante.value.trim());
      if (refNome.value.trim()) linhas.push('Refere-se a: ' + refNome.value.trim());
      if (refData.value) linhas.push('Data: ' + dataExtenso(refData.value));
      if (detalhe.value.trim()) linhas.push('', detalhe.value.trim());
      linhas.push('', '_Enviado pelo CtrLoja em ' + dataExtenso(hojeISO()) + '_');
      return linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
    }

    const previa = el('pre', { class: 'mensagem' });
    const atualizarPrevia = () => { previa.textContent = montarTexto(); };

    for (const c of [selAssunto, solicitante, refNome, refData, detalhe]) {
      c.addEventListener('input', atualizarPrevia);
      c.addEventListener('change', atualizarPrevia);
    }

    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Solicitar inclusão' }),
      el('p', {
        style: 'font-size:13px;color:var(--c-texto-suave);line-height:1.55;margin-top:0',
        text: 'O cadastro fica no computador da Loja. Preencha abaixo e envie: '
          + 'o texto sai pronto pelo seu WhatsApp, para quem você escolher.'
      }),
      rotulo('Assunto', selAssunto),
      rotulo('Seu nome', solicitante),
      rotulo('Nome de quem o pedido trata', refNome),
      rotulo('Data relacionada', refData),
      rotulo('Detalhes', detalhe)
    ]));

    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Como o pedido vai chegar' }),
      previa,
      el('div', { class: 'acoes' }, [
        el('button', {
          class: 'btn zap', text: '📤 Enviar pedido',
          onclick: () => {
            if (!solicitante.value.trim()) { aviso('Informe o seu nome para que saibam quem pediu.', 'erro'); return; }
            if (!detalhe.value.trim() && !refNome.value.trim()) { aviso('Descreva o pedido.', 'erro'); return; }
            enviarPeloWhatsApp(montarTexto());
          }
        }),
        el('button', { class: 'btn secundario', text: 'Copiar', onclick: () => copiar(montarTexto()) })
      ])
    ]));

    atualizarPrevia();
    return caixa;
  }

  /* --- Dados --- */

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

    /* Trancas em uso nesta sessão */
    const abertos = [...destravados()].filter((c) => CtrLojaCargos.obter(c).chave === c);
    if (abertos.length) {
      caixa.appendChild(el('div', { class: 'cartao' }, [
        el('h2', { text: 'Cargos destravados agora' }),
        el('p', {
          style: 'font-size:13px;color:var(--c-texto-suave);line-height:1.5;margin-top:0',
          text: 'O destravamento vale enquanto o aplicativo estiver aberto.'
        }),
        el('div', { class: 'linha-botoes' }, abertos.map((c) => el('button', {
          class: 'btn secundario', text: '🔒 Trancar ' + CtrLojaCargos.obter(c).nome,
          onclick: () => { trancar(c); aviso(CtrLojaCargos.obter(c).nome + ' trancada.', 'ok'); pintar(); }
        })))
      ]));
    }

    caixa.appendChild(el('div', { class: 'cartao' }, [
      el('h2', { text: 'Versão do aplicativo' }),
      el('div', { class: 'item-lista' }, [
        el('strong', { text: VERSAO_APP }),
        el('small', { text: 'Se o computador publicou uma versão mais nova e esta não mudou, use o botão abaixo.' })
      ]),
      el('button', {
        class: 'btn secundario largo', style: 'margin-top:10px',
        text: '♻ Forçar atualização do aplicativo',
        onclick: async () => {
          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const r2 of regs) await r2.unregister();
            }
            if (window.caches) {
              const chaves = await caches.keys();
              for (const c of chaves) await caches.delete(c);
            }
            aviso('Cache limpo. Recarregando…', 'ok');
            /*
               location.reload(true) nao serve mais: o argumento foi
               abandonado pelos navegadores e a pagina volta do cache
               do mesmo jeito. Recarregar por um endereco novo obriga
               a buscar tudo de novo, que e o que se quer aqui.
            */
            setTimeout(() => {
              const base = location.href.split('?')[0].split('#')[0];
              location.replace(base + '?atualizado=' + Date.now());
            }, 900);
          } catch (err) {
            aviso('Não foi possível limpar: ' + err.message, 'erro');
          }
        }
      }),
      el('p', {
        style: 'font-size:12px;color:var(--c-texto-suave);margin:10px 0 0;line-height:1.5',
        text: 'Isto apaga apenas os arquivos do aplicativo guardados no navegador. '
          + 'A agenda sincronizada não é perdida.'
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
          try { sessionStorage.removeItem(CHAVE_DESTRAVADOS); } catch { /* nada */ }
          app.pacote = null; app.banco = null; app.nucleo = null; app.versao = null;
          app.area = 'inicio'; app.aba = 'hoje';
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

  /* --- Cadeado do Cargo --- */

  function telaTrancada(area) {
    const senha = el('input', {
      type: 'password', class: 'campo-largo',
      placeholder: 'Senha da ' + area.nome, autocomplete: 'off'
    });

    const botao = el('button', {
      class: 'btn largo', text: app.conferindo ? 'Conferindo…' : '🔓 Destravar',
      disabled: app.conferindo
    });

    async function tentar() {
      if (app.conferindo) return;
      const valor = senha.value;
      if (!valor) { aviso('Digite a senha do cargo.', 'erro'); return; }

      app.conferindo = true;
      botao.disabled = true;
      botao.textContent = 'Conferindo…';

      try {
        const certa = await CtrLojaCripto.conferirSenhaCargo(envelopeSenha(area.chave), valor);
        if (!certa) {
          aviso('Senha incorreta para a ' + area.nome + '.', 'erro');
          senha.value = '';
          senha.focus();
          return;
        }
        const c = destravados();
        c.add(area.chave);
        gravarDestravados(c);
        app.aba = (CtrLojaCargos.abasDe(area.chave)[0] || {}).chave || 'dados';
        aviso(area.nome + ' destravada.', 'ok');
        pintar();
      } catch (err) {
        aviso(err.message || 'Não foi possível conferir a senha.', 'erro', 8000);
      } finally {
        app.conferindo = false;
        botao.disabled = false;
        botao.textContent = '🔓 Destravar';
      }
    }

    botao.addEventListener('click', tentar);
    senha.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); tentar(); } });

    return el('div', { class: 'cartao importar' }, [
      el('div', { class: 'cadeado', text: '🔒' }),
      el('h2', { text: area.nome }),
      el('p', { text: area.descricao }),
      senha,
      botao,
      el('p', {
        style: 'font-size:12.5px;color:var(--c-texto-suave);margin:16px 0 0;line-height:1.55',
        text: 'Cada cargo tem a sua senha, entregue ao oficial que o ocupa. '
          + 'A agenda da Loja continua aberta a todos os Irmãos em Início.'
      })
    ]);
  }

  function telaEmConstrucao(area) {
    return el('div', { class: 'cartao importar' }, [
      el('div', { style: 'font-size:46px;margin-bottom:10px', text: area.icone }),
      el('h2', { text: area.nome }),
      el('p', { text: area.descricao }),
      el('div', { class: 'aviso info', style: 'text-align:left' }, [
        document.createTextNode('Este cargo ainda não tem telas próprias. Use o pedido abaixo '
          + 'para solicitar informações ou providências ao oficial responsável.')
      ])
    ]);
  }

  /* ---------------- desenho ---------------- */

  function pintar() {
    const alvo = $('#conteudo');
    alvo.innerHTML = '';

    if (!app.banco) { alvo.appendChild(telaImportar()); return; }

    pintarAreas();
    pintarAbas();

    const area = CtrLojaCargos.obter(app.area);

    try {
      if (!liberado(area.chave)) {
        alvo.appendChild(telaTrancada(area));
      } else if (app.aba === 'dados') {
        alvo.appendChild(telaDados());
      } else if (app.aba === 'solicitar') {
        if (!area.disponivel) alvo.appendChild(telaEmConstrucao(area));
        alvo.appendChild(telaSolicitar(area));
      } else if (app.aba === 'proximos') {
        alvo.appendChild(telaProximos());
      } else if (app.aba === 'hoje') {
        alvo.appendChild(telaHojePublico());
      } else if (app.aba === 'mensagens') {
        alvo.appendChild(telaMensagens());
      } else if (app.aba === 'presenca') {
        alvo.appendChild(telaPresencaPublica());
      } else if (app.aba === 'financas') {
        alvo.appendChild(telaFinancasPublicas());
      } else if (app.aba === 'chamada') {
        alvo.appendChild(telaChamada());
      } else if (app.aba === 'agenda') {
        alvo.appendChild(telaAgendaSecretaria(area));
      } else if (app.aba === 'extrato') {
        alvo.appendChild(telaExtrato(area));
      } else if (app.aba === 'obreiros') {
        alvo.appendChild(telaObreiros());
      } else {
        alvo.appendChild(telaEmConstrucao(area));
      }
    } catch (err) {
      alvo.appendChild(el('div', { class: 'aviso erro', text: 'Erro ao montar a tela: ' + err.message }));
    }
    window.scrollTo(0, 0);
  }

  function pintarAreas() {
    const barra = $('#cargos');
    barra.innerHTML = '';
    for (const a of CtrLojaCargos.lista) {
      const trancado = !a.publico && !!envelopeSenha(a.chave) && !destravados().has(a.chave);
      barra.appendChild(el('button', {
        class: 'cargo' + (a.chave === app.area ? ' ativo' : '')
          + (a.publico ? ' publico' : '')
          + (a.disponivel ? '' : ' indisponivel'),
        text: `${a.icone} ${a.nome}${trancado ? ' 🔒' : ''}`,
        onclick: () => {
          app.area = a.chave;
          const abas = CtrLojaCargos.abasDe(a.chave);
          app.aba = (abas[0] || {}).chave || 'dados';
          pintar();
        }
      }));
    }
  }

  function pintarAbas() {
    const barra = $('#abas');
    const area = CtrLojaCargos.obter(app.area);
    const abas = liberado(area.chave) ? CtrLojaCargos.abasDe(app.area) : [];

    barra.innerHTML = '';
    barra.hidden = abas.length < 2;
    if (abas.length < 2) return;

    for (const a of abas) {
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
