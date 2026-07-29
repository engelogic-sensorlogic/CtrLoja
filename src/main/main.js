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
  app.commandLine.appendSwitch('disable-software-rasterizer');
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
  mainWindow.once('ready-to-show', () => {
    if (iniciarMinimizado) {
      mainWindow.minimize();
      mainWindow.showInactive();
    } else {
      mainWindow.show();
    }
  });
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => { mainWindow = null; });
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

  createWindow();
  autoConectarWhatsApp(sessionPath);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
/* IPC - Rotina de disparo                                             */
/* ------------------------------------------------------------------ */

handle('rotina:estado', () => scheduler.estadoRotina());
handle('rotina:executar', (forcar) => scheduler.executar({ origem: 'execução manual', forcar: !!forcar }));
handle('rotina:verificar', () => scheduler.verificarPendencia('verificação manual', false));
handle('rotina:log', (limite) => scheduler.lerLog(limite || 200));

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
