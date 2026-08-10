'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const db = require('./db/database');
const agenda = require('./services/agenda');
const templates = require('./services/templates');
const backup = require('./services/backup');
const scheduler = require('./services/scheduler');
const whatsapp = require('./services/whatsapp');
const cripto = require('./services/cripto');
const presenca = require('./services/presenca');
const presencaPacote = require('./services/presenca-pacote');
const presencaPdf = require('./services/presenca-pdf');
const convitePdf = require('./services/convite-pdf');

const isDev = process.argv.includes('--dev');

// Atalho de inicializacao do Windows abre minimizado, para nao atrapalhar
// quem acabou de ligar o computador. A rotina de disparo roda normalmente.
const iniciarMinimizado = process.argv.includes('--minimizado');

let mainWindow = null;

/* ------------------------------------------------------------------ */
/* Compatibilidade: execucao a partir de unidade de rede / mapeada     */
/*                                                                     */
/* Quando o aplicativo roda de um caminho UNC (\\servidor\...) ou de   */
/* uma unidade mapeada (Z:\, Y:\...), o processo de GPU do Chromium    */
/* nao consegue iniciar e o Electron aborta com:                       */
/*   "GPU process launch failed: error_code=18"                        */
/*   "GPU process isn't usable. Goodbye."                              */
/* Desligar a aceleracao por hardware e o sandbox resolve.             */
/* ------------------------------------------------------------------ */

function caminhoArriscado() {
  const p = app.getAppPath();
  if (/^\\\\/.test(p)) return true;                    // UNC
  const unidade = (p.match(/^([A-Za-z]):/) || [])[1];
  if (!unidade) return false;
  return unidade.toUpperCase() !== 'C';                // qualquer unidade fora de C:
}

if (process.platform === 'win32' &&
    (process.argv.includes('--sem-gpu') || caminhoArriscado())) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-sandbox');

  // ATENCAO: NAO acrescentar --disable-software-rasterizer nem
  // --disable-gpu-compositing aqui.
  //
  // Com a GPU ja desligada logo acima, o primeiro tira TAMBEM o desenho
  // por software (SwiftShader) e o segundo tira a composicao da tela.
  // Sem ninguem para desenhar, o Chromium nunca entrega o primeiro
  // quadro - e a janela ou abre vazia, ou nao chega a aparecer, sempre
  // sem erro nenhum no console. Os dois casos ja aconteceram aqui.
  console.log('[ctrloja] Modo compatibilidade gráfica ativado (unidade de rede/mapeada).');
}

/* ------------------------------------------------------------------ */
/* Janela principal                                                    */
/* ------------------------------------------------------------------ */

function resolveAppRoot() {
  // Em desenvolvimento: raiz do projeto. Empacotado: pasta do executavel.
  return app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..', '..');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#C7E6E3',
    show: false,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  /*
   * A janela nasce escondida e aparece no 'ready-to-show', que so
   * dispara quando o Chromium entrega o PRIMEIRO QUADRO desenhado.
   *
   * Em maquina sem aceleracao grafica - que e o nosso caso ao rodar de
   * unidade mapeada - esse primeiro quadro as vezes demora demais ou
   * nao chega nunca. A janela entao fica invisivel para sempre, sem
   * erro nenhum no console: o aplicativo parece simplesmente nao abrir.
   *
   * Por isso a exibicao tem uma rede de seguranca: passados 5 segundos,
   * a janela aparece de qualquer maneira. Melhor uma janela que pinta
   * com meio segundo de atraso do que um aplicativo que nunca abre.
   */
  let jaMostrada = false;
  const mostrar = (motivo) => {
    if (jaMostrada || !mainWindow || mainWindow.isDestroyed()) return;
    jaMostrada = true;
    clearTimeout(redeDeSeguranca);
    if (motivo) console.log(`[ctrloja] Janela exibida (${motivo}).`);
    if (iniciarMinimizado) {
      mainWindow.minimize();
      mainWindow.showInactive();
    } else {
      mainWindow.show();
    }
  };

  const redeDeSeguranca = setTimeout(
    () => mostrar('tempo esgotado — sem aceleração gráfica'),
    5000
  );

  mainWindow.once('ready-to-show', () => mostrar(null));

  /* Falhas que antes passavam caladas */
  mainWindow.webContents.on('did-fail-load', (_e, codigo, descricao, url) => {
    console.error(`[ctrloja] Falha ao carregar a interface (${codigo}): ${descricao} — ${url}`);
    mostrar('após falha de carregamento');
  });
  mainWindow.webContents.on('render-process-gone', (_e, detalhe) => {
    console.error('[ctrloja] O processo da interface terminou:', detalhe.reason);
  });
  mainWindow.webContents.on('preload-error', (_e, arquivo, erro) => {
    console.error('[ctrloja] Erro no preload:', arquivo, erro.message);
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => {
    clearTimeout(redeDeSeguranca);
    mainWindow = null;
  });
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/* ------------------------------------------------------------------ */
/* Conexao automatica do WhatsApp no arranque                          */
/*                                                                     */
/* Sem isto, o disparo 100% automatico nunca acontece depois de fechar  */
/* e reabrir o aplicativo: a rotina roda, encontra o WhatsApp           */
/* desconectado e adia o envio indefinidamente.                        */
/* ------------------------------------------------------------------ */

function autoConectarWhatsApp(sessionPath) {
  if (db.config.obter('wa_autoconectar', '1') !== '1') return;

  const temSessao = fs.existsSync(path.join(sessionPath, 'credenciais', 'creds.json'));
  if (!temSessao) {
    console.log('[ctrloja] Sem sessão gravada: aguardando leitura do QR Code.');
    return;
  }

  // Pequena folga para a janela terminar de abrir
  setTimeout(() => {
    console.log('[ctrloja] Reconectando o WhatsApp automaticamente…');
    whatsapp.conectar().catch((err) => console.error('[ctrloja] Falha na conexão automática:', err.message));
  }, 3000);
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

app.whenReady().then(() => {
  db.init(app.getPath('userData'));

  const sessionPath = path.join(app.getPath('userData'), 'wa-session');

  whatsapp.configure({
    sessionPath,
    onEvent: (evt) => {
      send('whatsapp:event', evt);
      // Retoma o disparo automatico que ficou adiado por falta de conexao
      if (evt.tipo === 'estado' && evt.estado === 'pronto') {
        scheduler.aoWhatsappPronto().catch(() => {});
      }
    }
  });

  scheduler.start({
    userData: app.getPath('userData'),
    onFila: (fila) => send('agenda:fila-do-dia', fila),
    onLog: (msg) => send('app:log', msg)
  });

  console.log('[ctrloja] Abrindo a janela principal…');
  createWindow();
  autoConectarWhatsApp(sessionPath);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  // Sem este catch, uma falha no arranque encerrava o aplicativo em
  // silencio: nenhuma janela, nenhuma mensagem, nada para investigar.
  console.error('\n[ctrloja] FALHA AO INICIAR:', err && err.stack ? err.stack : err, '\n');
});

app.on('window-all-closed', () => {
  scheduler.stop();
  whatsapp.destroy().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});

/* ------------------------------------------------------------------ */
/* IPC - utilitarios                                                   */
/* ------------------------------------------------------------------ */

function handle(channel, fn) {
  ipcMain.handle(channel, async (_evt, ...args) => {
    try {
      const data = await fn(...args);
      return { ok: true, data };
    } catch (err) {
      console.error(`[IPC ${channel}]`, err);
      return { ok: false, error: err.message || String(err) };
    }
  });
}

/* ------------------------------------------------------------------ */
/* IPC - Aplicacao                                                     */
/* ------------------------------------------------------------------ */

handle('app:info', () => ({
  versao: app.getVersion(),
  userData: app.getPath('userData'),
  raiz: resolveAppRoot(),
  bancoPath: db.getPath()
}));

handle('app:logos', () => {
  const raiz = resolveAppRoot();
  const exts = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
  const achar = (base) => {
    for (const ext of exts) {
      const p = path.join(raiz, base + ext);
      if (fs.existsSync(p)) return 'file:///' + p.replace(/\\/g, '/');
    }
    return null;
  };
  return { logo1: achar('Logo1'), logo2: achar('Logo2') };
});

handle('app:abrir-pasta', (p) => shell.openPath(p));

/* ------------------------------------------------------------------ */
/* IPC - Obreiros e familiares                                         */
/* ------------------------------------------------------------------ */

handle('obreiros:listar', (filtro) => db.obreiros.listar(filtro));
handle('obreiros:obter', (id) => db.obreiros.obter(id));
handle('obreiros:salvar', (registro) => db.obreiros.salvar(registro));
handle('obreiros:excluir', (id) => db.obreiros.excluir(id));

handle('familiares:listar', (obreiroId) => db.familiares.listar(obreiroId));
handle('familiares:salvar', (registro) => db.familiares.salvar(registro));
handle('familiares:excluir', (id) => db.familiares.excluir(id));

/* ------------------------------------------------------------------ */
/* IPC - Calendario permanente                                         */
/* ------------------------------------------------------------------ */

handle('datas:listar', (filtro) => db.datas.listar(filtro));
handle('datas:salvar', (registro) => db.datas.salvar(registro));
handle('datas:excluir', (id) => db.datas.excluir(id));
handle('datas:restaurar-padrao', () => db.datas.restaurarPadrao());

/* ------------------------------------------------------------------ */
/* IPC - Agenda                                                        */
/* ------------------------------------------------------------------ */

handle('agenda:do-dia', (isoDate) => agenda.eventosDoDia(isoDate));
handle('agenda:periodo', (ini, fim) => agenda.eventosDoPeriodo(ini, fim));
handle('agenda:mes', (ano, mes) => agenda.eventosDoMes(ano, mes));
handle('agenda:proximos', (dias) => agenda.proximosEventos(dias || 30));
handle('agenda:fila', (isoDate) => agenda.montarFila(isoDate));

/* ------------------------------------------------------------------ */
/* IPC - Sessoes da Loja (Agenda da Loja)                              */
/* ------------------------------------------------------------------ */

handle('sessoes:listar', (filtro) => db.sessoes.listar(filtro));
handle('sessoes:mes', (ano, mes) => agenda.sessoesDoMes(ano, mes));
handle('sessoes:salvar', (registro) => db.sessoes.salvar(registro));
handle('sessoes:excluir', (id) => db.sessoes.excluir(id));
handle('sessoes:excluir-data', (data) => db.sessoes.excluirPorData(data));
handle('sessoes:opcoes', () => ({ graus: db.GRAUS_SESSAO, tipos: db.TIPOS_SESSAO }));

/* ------------------------------------------------------------------ */
/* IPC - Templates                                                     */
/* ------------------------------------------------------------------ */

handle('templates:listar', () => db.templates.listar());
handle('templates:salvar', (registro) => db.templates.salvar(registro));
handle('templates:restaurar-padrao', () => db.templates.restaurarPadrao());
handle('templates:variaveis', () => templates.variaveisDisponiveis());
handle('templates:preview', (corpo, chave) => templates.preview(corpo, chave));

/* ------------------------------------------------------------------ */
/* IPC - Configuracoes                                                 */
/* ------------------------------------------------------------------ */

handle('config:obter', () => db.config.obterTodas());
handle('config:salvar', (mapa) => {
  db.config.salvarVarias(mapa);
  scheduler.reagendar();
  return db.config.obterTodas();
});

/* ------------------------------------------------------------------ */
/* IPC - Lista de presenca                                             */
/* ------------------------------------------------------------------ */

handle('presenca:lista', (data) => presenca.listaDaSessao(data));
handle('presenca:sessoes', (limite) => presenca.sessoesParaChamada(limite));
handle('presenca:estatisticas', (filtro) => presenca.estatisticas(filtro || {}));
handle('presenca:historico-obreiro', (id, filtro) => presenca.historicoDoObreiro(id, filtro || {}));

handle('presenca:salvar', (reg) => {
  const r = db.presencas.registrarLista(Object.assign({ origem: 'pc' }, reg));
  return Object.assign(r, { lista: presenca.listaDaSessao(reg.sessao_data) });
});

handle('presenca:limpar', (data) => {
  db.presencas.limparSessao(data);
  return presenca.listaDaSessao(data);
});

/**
 * Le a lista vinda do celular - do arquivo .presenca ou do texto colado
 * do WhatsApp - e devolve o que MUDARIA, sem gravar nada. Quem grava e o
 * canal presenca:salvar, depois de o usuario conferir na tela.
 */
handle('presenca:ler-pacote', async (origem, conteudo) => {
  let texto = conteudo;

  if (origem === 'arquivo') {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar lista de presença',
      properties: ['openFile'],
      filters: [
        { name: 'Lista de presença', extensions: ['presenca', 'json', 'txt'] },
        { name: 'Todos', extensions: ['*'] }
      ]
    });
    if (res.canceled) return { cancelado: true };
    texto = fs.readFileSync(res.filePaths[0], 'utf8');
  }

  const pacote = presencaPacote.deTexto(texto);

  // Traduz os ids em nomes para que a conferência na tela seja legível
  const nomes = new Map(db.obreiros.listar({}).map((o) => [o.id, o]));
  const anterior = new Map(db.presencas.porSessao(pacote.data)
    .map((p) => [p.obreiro_id, !!Number(p.presente)]));

  const itens = pacote.itens.map(([id, presente]) => {
    const o = nomes.get(id);
    return {
      obreiro_id: id,
      nome: o ? o.nome : null,
      tratamento: o ? (o.tratamento || '') : '',
      grau: o ? (o.grau || '') : '',
      presente: !!presente,
      desconhecido: !o,
      mudou: anterior.has(id) ? anterior.get(id) !== !!presente : true
    };
  });

  const sessao = db.sessoes.obterPorData(pacote.data);

  return {
    cancelado: false,
    pacote,
    itens,
    sessao: sessao || null,
    ja_existia: anterior.size > 0,
    desconhecidos: itens.filter((i) => i.desconhecido).length,
    mudancas: itens.filter((i) => i.mudou).length
  };
});

/** Caminhos dos logotipos da Loja, usados nos dois documentos. */
function logosDaLoja() {
  const raiz = resolveAppRoot();
  const exts = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
  const achar = (base) => {
    for (const ext of exts) {
      const p = path.join(raiz, base + ext);
      if (fs.existsSync(p)) return p;
    }
    return null;
  };
  return { logo1: achar('Logo1'), logo2: achar('Logo2') };
}

async function ondeSalvarPdf(titulo, sugestao) {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: titulo,
    defaultPath: path.join(app.getPath('documents'), sugestao),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  return res.canceled ? null : res.filePath;
}

handle('presenca:exportar-pdf', async (data) => {
  const lista = presenca.listaDaSessao(data);
  if (!lista.itens.length) throw new Error('Não há Obreiros no quadro para esta sessão.');

  const destino = await ondeSalvarPdf('Exportar lista de presença em PDF', `Lista de Presenca - ${data}.pdf`);
  if (!destino) return { cancelado: true };

  const r = await presencaPdf.gerar(
    BrowserWindow, destino, lista, db.config.obterTodas(), logosDaLoja()
  );
  return Object.assign({ cancelado: false }, r);
});

handle('presenca:exportar-pdf-frequencia', async (filtro) => {
  const est = presenca.estatisticas(filtro || {});
  if (!est.total_sessoes) {
    throw new Error('Nenhuma chamada registrada ainda — não há frequência para relatar.');
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const destino = await ondeSalvarPdf('Exportar relatório de frequência', `Frequencia dos Obreiros - ${hoje}.pdf`);
  if (!destino) return { cancelado: true };

  const r = await presencaPdf.gerarFrequencia(
    BrowserWindow, destino, est, db.config.obterTodas(), logosDaLoja()
  );
  return Object.assign({ cancelado: false }, r);
});

/* ------------------------------------------------------------------ */
/* IPC - Publicar para o celular                                       */
/* ------------------------------------------------------------------ */
/*
 * O mesmo trabalho do publicar-dados.bat, feito de dentro do programa
 * para que ninguem precise abrir pasta nem linha de comando.
 *
 * Roda no processo principal, sem abrir outro processo: e a MESMA
 * funcao que o .bat chama, entao os dois caminhos nao podem divergir.
 */

/*
 * A pasta ferramentas/ NAO entra no instalador (veja "files" no
 * package.json): publicar so faz sentido no computador onde o projeto
 * CtrLoja e mantido.
 *
 * Por isso o modulo e carregado sob demanda e com rede de protecao. Um
 * require solto aqui em cima derrubaria o aplicativo INSTALADO logo na
 * abertura, antes de qualquer janela - e sem mensagem util.
 */
let publicadorCache;
function carregarPublicador() {
  if (publicadorCache !== undefined) return publicadorCache;
  // Vem SEMPRE de dentro do aplicativo - inclusive do pacote instalado,
  // que agora leva o publicar-dados.js junto. Buscar na pasta do projeto
  // faria a versao do programa depender do que ha no disco do usuario.
  try {
    publicadorCache = require(path.join(__dirname, '..', '..', 'ferramentas', 'publicar-dados.js'));
  } catch (err) {
    console.log('[ctrloja] Publicação para o celular indisponível:', err.message);
    publicadorCache = null;
  }
  return publicadorCache;
}

/** Cargos com senha definida, sem depender do publicador. */
function cargosComSenha() {
  const cfg = db.config.obterTodas();
  return Object.keys(cfg)
    .filter((c) => c.startsWith('senha_cargo_') && cfg[c])
    .map((c) => c.slice('senha_cargo_'.length));
}

/** A pasta serve para publicar? Precisa ter o aplicativo do celular. */
function pastaDeProjeto(p) {
  if (!p) return false;
  const limpa = String(p).replace(/[\\/]+$/, '');
  return fs.existsSync(path.join(limpa, 'mobile'))
    && fs.existsSync(path.join(limpa, 'mobile', 'index.html'));
}

/**
 * Pasta do PROJETO - que nem sempre e a pasta de onde o aplicativo roda.
 *
 * Sao tres origens, nesta ordem:
 *
 *  1. a escolhida pelo usuario em Configuracoes. E o caso do aplicativo
 *     INSTALADO: ele nao traz o aplicativo do celular dentro de si, e
 *     nem poderia gravar em Arquivos de Programas. O Irmao aponta a
 *     pasta do projeto - normalmente um clone do repositorio - e a
 *     publicacao passa a funcionar como no computador principal;
 *
 *  2. a informada pelo rodar.bat, quando o projeto esta em unidade
 *     mapeada e o aplicativo roda de uma copia local descartavel;
 *
 *  3. a propria pasta de execucao, que e o caso comum em desenvolvimento.
 */
function pastaProjeto() {
  const escolhida = db.config.obter('pasta_publicacao', '');
  if (escolhida && pastaDeProjeto(escolhida)) return String(escolhida).replace(/[\\/]+$/, '');

  const informada = process.env.CTRLOJA_PROJETO;
  if (informada) {
    const limpa = informada.replace(/[\\/]+$/, '');
    // So aceita se for mesmo um projeto CtrLoja - variavel velha no
    // ambiente nao pode mandar o pacote para um lugar qualquer.
    if (fs.existsSync(path.join(limpa, 'package.json')) && pastaDeProjeto(limpa)) return limpa;
    console.warn(`[ctrloja] CTRLOJA_PROJETO ignorado (não parece um projeto CtrLoja): ${informada}`);
  }

  return resolveAppRoot();
}

/** Onde gravar: a pasta mobile/dados do projeto. */
function pastaPublicacao() {
  return path.join(pastaProjeto(), 'mobile', 'dados');
}

handle('publicacao:estado', () => {
  const pasta = pastaPublicacao();
  const arq = path.join(pasta, 'versao.json');
  let info = null;
  try {
    if (fs.existsSync(arq)) info = JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch { info = null; }

  const projeto = pastaProjeto();

  return {
    pasta,
    projeto,
    // A pasta do aplicativo do celular nao vem dentro do instalador -
    // ela e apontada pelo Irmao em Configuracoes.
    disponivel: !!carregarPublicador() && pastaDeProjeto(projeto),
    escolhida: db.config.obter('pasta_publicacao', '') || null,
    endereco: db.config.obter('endereco_app', '') || convitePdf.ENDERECO_PADRAO,
    // Ha repositorio para enviar? Sem ele, o botao do GitHub nao aparece.
    temGit: fs.existsSync(path.join(projeto, '.git'))
      && fs.existsSync(path.join(projeto, 'publicar-github.bat')),
    ultima: info,
    protegidos: cargosComSenha(),
    resumo: backup.montar().resumo
  };
});

/**
 * Aponta a pasta do projeto CtrLoja - a que tem o aplicativo do celular
 * dentro. Sem isto, o programa instalado nao teria onde publicar.
 */
handle('publicacao:escolher-pasta', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Onde fica a pasta do projeto CtrLoja?',
    properties: ['openDirectory'],
    message: 'Escolha a pasta que contém a subpasta "mobile" — normalmente a cópia do repositório.'
  });
  if (res.canceled) return { cancelado: true };

  const escolhida = res.filePaths[0];
  if (!pastaDeProjeto(escolhida)) {
    throw new Error(
      'Esta pasta não contém o aplicativo do celular:\n' + escolhida + '\n\n'
      + 'Escolha a pasta do projeto CtrLoja — a que tem, dentro dela, uma subpasta "mobile".'
    );
  }

  db.config.salvarVarias({ pasta_publicacao: escolhida });
  return { cancelado: false, pasta: escolhida };
});

handle('publicacao:esquecer-pasta', () => {
  db.config.salvarVarias({ pasta_publicacao: '' });
  return { pasta: pastaProjeto() };
});

/* ---- Convite: como o Irmão instala o aplicativo no celular ---- */

const enderecoDoApp = () => db.config.obter('endereco_app', '') || convitePdf.ENDERECO_PADRAO;

handle('publicacao:salvar-endereco', (endereco) => {
  const limpo = String(endereco || '').trim();
  if (limpo && !/^https:\/\//i.test(limpo)) {
    throw new Error(
      'O endereço precisa começar com https://\n\n'
      + 'Sem conexão segura o navegador não libera a criptografia, e o Sincronizar não funciona.'
    );
  }
  db.config.salvarVarias({ endereco_app: limpo });
  return { endereco: enderecoDoApp() };
});

handle('publicacao:convite-texto', () => ({
  texto: convitePdf.mensagem(db.config.obterTodas(), enderecoDoApp()),
  endereco: enderecoDoApp()
}));

handle('publicacao:convite-pdf', async () => {
  const destino = await ondeSalvarPdf(
    'Salvar a folha de instalação', 'Instalar o CtrLoja no celular.pdf'
  );
  if (!destino) return { cancelado: true };

  const r = await convitePdf.gerar(
    BrowserWindow, destino, enderecoDoApp(), db.config.obterTodas(), logosDaLoja()
  );
  return Object.assign({ cancelado: false }, r);
});

handle('publicacao:publicar', (senha) => {
  if (!senha) throw new Error('Informe a senha da Loja.');

  const publicador = carregarPublicador();
  if (!publicador) {
    throw new Error(
      'Esta instalação não traz as ferramentas de publicação.\n'
      + 'Publique a partir do computador onde o projeto CtrLoja está.'
    );
  }

  const pasta = pastaPublicacao();
  if (!fs.existsSync(path.dirname(pasta))) {
    throw new Error(
      'A pasta do aplicativo do celular não foi encontrada em:\n'
      + pastaProjeto() + '\n\n'
      + 'A publicação só funciona no computador onde o projeto CtrLoja está.'
    );
  }

  return publicador.publicar({
    pacoteBruto: backup.montar(),
    senha,
    destino: pasta
  });
});

/**
 * Abre o publicar-github.bat numa janela de comando. Ele pede a
 * mensagem do commit, que e coisa de quem publica - nao faz sentido
 * automatizar e mandar sempre a mesma descricao.
 */
handle('publicacao:abrir-github', async () => {
  const projeto = pastaProjeto();
  const bat = path.join(projeto, 'publicar-github.bat');

  if (!fs.existsSync(bat)) {
    throw new Error('O publicar-github.bat não foi encontrado em:\n' + projeto);
  }
  if (!fs.existsSync(path.join(projeto, '.git'))) {
    throw new Error(
      'Esta pasta não é um repositório Git:\n' + projeto + '\n\n'
      + 'O envio ao GitHub só funciona na pasta original do projeto.'
    );
  }

  const erro = await shell.openPath(bat);
  if (erro) throw new Error(erro);
  return { arquivo: bat, projeto };
});

/* ------------------------------------------------------------------ */
/* IPC - Senhas dos Cargos (usadas no aplicativo do celular)           */
/* ------------------------------------------------------------------ */
/*
 * A senha NUNCA e guardada. Grava-se apenas a sua impressao digital,
 * que e o que viaja no pacote publicado. Nem esta tela consegue mostrar
 * de volta uma senha ja definida - so trocar ou remover.
 */

const CARGOS_APP = ['chancelaria', 'secretaria', 'tesouraria', 'hospitalaria'];
const chaveSenhaCargo = (c) => 'senha_cargo_' + c;

handle('cargos:estado', () => {
  const cfg = db.config.obterTodas();
  return CARGOS_APP.map((c) => {
    let env = null;
    try { env = JSON.parse(cfg[chaveSenhaCargo(c)] || 'null'); } catch { env = null; }
    return { cargo: c, definida: !!(env && env.formato === cripto.FORMATO_SENHA) };
  });
});

handle('cargos:definir-senha', (cargo, senha) => {
  if (!CARGOS_APP.includes(cargo)) throw new Error('Cargo desconhecido: ' + cargo);

  // Texto vazio remove a senha e deixa o cargo aberto no celular.
  if (!senha) {
    db.config.salvarVarias({ [chaveSenhaCargo(cargo)]: '' });
    return { cargo, definida: false };
  }

  const envelope = cripto.hashSenhaCargo(senha);
  db.config.salvarVarias({ [chaveSenhaCargo(cargo)]: JSON.stringify(envelope) });
  return { cargo, definida: true, fraca: cripto.senhaFraca(senha) };
});

/* ------------------------------------------------------------------ */
/* IPC - Rotina de disparo                                             */
/* ------------------------------------------------------------------ */

handle('rotina:estado', () => scheduler.estadoRotina());
handle('rotina:executar', (forcar) => scheduler.executar({ origem: 'execução manual', forcar: !!forcar }));
handle('rotina:verificar', () => scheduler.verificarPendencia('verificação manual', false));
handle('rotina:log', (limite) => scheduler.lerLog(limite || 200));
handle('rotina:diagnostico', () => scheduler.diagnosticoDisparo());

/* ------------------------------------------------------------------ */
/* IPC - WhatsApp                                                      */
/* ------------------------------------------------------------------ */

handle('whatsapp:status', () => whatsapp.status());
handle('whatsapp:conectar', (opts) => whatsapp.conectar(opts));
handle('whatsapp:reiniciar', () => whatsapp.reiniciar());
handle('whatsapp:desconectar', () => whatsapp.desconectar());
handle('whatsapp:limpar-sessao', () => whatsapp.limparSessao());
handle('whatsapp:diagnostico', () => whatsapp.diagnostico());
handle('whatsapp:grupos', () => whatsapp.listarGrupos());
handle('whatsapp:grupos-salvos', () => db.grupos.listar());
handle('whatsapp:salvar-grupos', (lista) => db.grupos.salvarSelecao(lista));
handle('whatsapp:enviar', (payload) => whatsapp.enviarFila(payload));
handle('whatsapp:teste', (texto, destino) => whatsapp.enviarTeste(texto, destino));

/* ------------------------------------------------------------------ */
/* IPC - Log de envios                                                 */
/* ------------------------------------------------------------------ */

handle('log:listar', (filtro) => db.envios.listar(filtro));
handle('log:limpar', (antesDe) => db.envios.limpar(antesDe));

/* ------------------------------------------------------------------ */
/* IPC - Backup / migracao entre computadores                          */
/* ------------------------------------------------------------------ */

handle('backup:exportar', async () => {
  const sugestao = `CtrLoja-backup-${new Date().toISOString().slice(0, 10)}.ctrloja`;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar banco de dados',
    defaultPath: path.join(app.getPath('documents'), sugestao),
    filters: [{ name: 'Backup CtrLoja', extensions: ['ctrloja'] }]
  });
  if (res.canceled) return { cancelado: true };
  return backup.exportar(res.filePath);
});

handle('backup:importar', async (modo) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar banco de dados',
    properties: ['openFile'],
    filters: [
      { name: 'Backup CtrLoja', extensions: ['ctrloja', 'json', 'db'] },
      { name: 'Todos', extensions: ['*'] }
    ]
  });
  if (res.canceled) return { cancelado: true };
  return backup.importar(res.filePaths[0], modo || 'substituir');
});
