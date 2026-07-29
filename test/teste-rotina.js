'use strict';

/* Testes da rotina de disparo — execute com:  node test/teste-rotina.js */

const path = require('path'), fs = require('fs'), os = require('os');
const Module = require('module');
const raiz = path.join(__dirname, '..', 'src', 'main');

/* WhatsApp simulado: permite controlar o estado e capturar os envios */
const wa = {
  _estado: 'desconectado',
  _enviados: [],
  _conectarChamado: 0,
  status() { return { estado: this._estado, disponivel: true }; },
  conectar() { this._conectarChamado++; return Promise.resolve(); },
  async enviarFila(payload) {
    this._enviados.push(payload);
    const db = require(path.join(raiz, 'db/database.js'));
    if (payload.data) db.envios.marcarDisparo(payload.data, payload.itens.length, payload.itens.length);
    return { enviados: payload.itens.length, falhas: 0 };
  }
};
const origLoad = Module._load;
Module._load = function (req, parent) {
  if (req === './whatsapp' && parent && parent.filename.includes('scheduler')) return wa;
  return origLoad.apply(this, arguments);
};

const db = require(path.join(raiz, 'db/database.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rotina-'));
db.init(tmp);
const scheduler = require(path.join(raiz, 'services/scheduler.js'));
const cal = require(path.join(raiz, 'services/calendario.js'));

let falhas = 0;
const ok = (n, c, e = '') => { console.log((c ? '  OK  ' : 'FALHA ') + n + (e ? ' -> ' + e : '')); if (!c) falhas++; };

(async () => {
  const hoje = cal.hojeISO();
  const { ano, mes, dia } = cal.partes(hoje);

  // Obreiro que faz aniversario hoje + grupo selecionado
  db.obreiros.salvar({ nome: 'Irmão da Rotina', tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Ativo',
    dt_nascimento: `1980-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` });
  db.grupos.sincronizar([{ id: '111-222@g.us', nome: 'Grupo Oficial UFR' }]);
  db.grupos.salvarSelecao(['111-222@g.us']);

  console.log('== Expressao do agendador ==');
  db.config.salvar('disparo_hora', '07:30');
  db.config.salvar('disparo_dias', '1,2,3,4,5,6,0');
  scheduler.reagendar();
  ok('cron montado corretamente', scheduler.expressaoCron() === '30 7 * * 1,2,3,4,5,6,0', scheduler.expressaoCron());
  db.config.salvar('disparo_hora', '20:05');
  ok('respeita hora com minutos', scheduler.expressaoCron() === '5 20 * * 1,2,3,4,5,6,0', scheduler.expressaoCron());
  db.config.salvar('disparo_dias', '1');
  ok('respeita dias selecionados', scheduler.expressaoCron() === '5 20 * * 1', scheduler.expressaoCron());
  db.config.salvar('disparo_dias', '0,1,2,3,4,5,6');

  console.log('== Modo manual nao dispara ==');
  db.config.salvar('disparo_modo', 'manual');
  wa._estado = 'pronto'; wa._enviados = [];
  let r = await scheduler.executar({ origem: 'teste' });
  ok('ignora no modo manual', r.ignorado === 'modo_manual');
  ok('nada enviado', wa._enviados.length === 0);

  console.log('== Modo revisao entrega a fila, nao envia ==');
  db.config.salvar('disparo_modo', 'revisao');
  let filaRecebida = null;
  scheduler.start({ onFila: (f) => { filaRecebida = f; }, onLog: () => {} });
  wa._enviados = [];
  r = await scheduler.executar({ origem: 'teste' });
  ok('sinaliza revisao', r.revisao === true);
  ok('fila entregue a interface', !!filaRecebida && filaRecebida.total_selecionados > 0);
  ok('nada enviado sem aprovacao', wa._enviados.length === 0);

  console.log('== Modo 100% automatico ENVIA ==');
  db.config.salvar('disparo_modo', 'automatico');
  wa._estado = 'pronto'; wa._enviados = [];
  r = await scheduler.executar({ origem: 'teste' });
  ok('enviou de verdade', wa._enviados.length === 1, String(wa._enviados.length));
  ok('quantidade coerente', r.enviados >= 1, JSON.stringify(r));
  ok('grupo de destino correto', wa._enviados[0].grupos[0] === '111-222@g.us');
  ok('data de referencia enviada', wa._enviados[0].data === hoje);
  ok('registrou o disparo do dia', db.envios.jaDisparado(hoje) === true);

  console.log('== Nao duplica no mesmo dia ==');
  wa._enviados = [];
  r = await scheduler.executar({ origem: 'teste' });
  ok('segundo disparo bloqueado', r.ignorado === 'ja_disparado' && wa._enviados.length === 0);

  console.log('== Forcar reenvio ==');
  wa._enviados = [];
  r = await scheduler.executar({ origem: 'teste', forcar: true });
  ok('forcar reenvia', wa._enviados.length === 1);

  console.log('== WhatsApp desconectado: adia e tenta conectar ==');
  db.getConn().prepare('DELETE FROM controle_disparo').run();
  wa._estado = 'desconectado'; wa._enviados = []; wa._conectarChamado = 0;
  r = await scheduler.executar({ origem: 'teste' });
  ok('marca como adiado', r.adiado === true && r.motivo === 'whatsapp_desconectado');
  ok('nada enviado', wa._enviados.length === 0);
  ok('tentou conectar sozinho', wa._conectarChamado === 1, String(wa._conectarChamado));
  ok('estado reflete a espera', scheduler.estadoRotina().adiado_por_whatsapp === true);

  console.log('== Retoma quando o WhatsApp fica pronto ==');
  wa._estado = 'pronto';
  await scheduler.aoWhatsappPronto();
  ok('enviou ao reconectar', wa._enviados.length === 1, String(wa._enviados.length));
  ok('deixou de estar adiado', scheduler.estadoRotina().adiado_por_whatsapp === false);

  console.log('== Recuperacao ao abrir o app apos o horario ==');
  db.getConn().prepare('DELETE FROM controle_disparo').run();
  db.config.salvar('disparo_hora', '00:01');   // horario que ja passou hoje
  wa._enviados = [];
  await scheduler.verificarPendencia('teste de arranque');
  ok('recupera o disparo perdido', wa._enviados.length === 1, String(wa._enviados.length));

  console.log('== Nao antecipa antes da hora ==');
  db.getConn().prepare('DELETE FROM controle_disparo').run();
  db.config.salvar('disparo_hora', '23:59');
  wa._enviados = [];
  await scheduler.verificarPendencia('teste antes da hora');
  const agora = new Date();
  const antesDas2359 = !(agora.getHours() === 23 && agora.getMinutes() >= 59);
  ok('aguarda o horario', antesDas2359 ? wa._enviados.length === 0 : true, String(wa._enviados.length));

  console.log('== Dia da semana desabilitado ==');
  db.getConn().prepare('DELETE FROM controle_disparo').run();
  db.config.salvar('disparo_hora', '00:01');
  const outroDia = (new Date().getDay() + 3) % 7;
  db.config.salvar('disparo_dias', String(outroDia));
  wa._enviados = [];
  await scheduler.verificarPendencia('teste dia desabilitado');
  ok('nao dispara em dia desabilitado', wa._enviados.length === 0);
  db.config.salvar('disparo_dias', '0,1,2,3,4,5,6');

  console.log('== Sem grupo selecionado ==');
  db.getConn().prepare('DELETE FROM controle_disparo').run();
  db.grupos.salvarSelecao([]);
  wa._enviados = [];
  r = await scheduler.executar({ origem: 'teste' });
  ok('avisa a falta de grupo', r.erro === 'sem_grupos' && wa._enviados.length === 0, JSON.stringify(r));
  db.grupos.salvarSelecao(['111-222@g.us']);

  console.log('== Painel de situacao ==');
  const est = scheduler.estadoRotina();
  ok('traz o modo', est.modo === 'automatico');
  ok('traz a expressao', !!est.expressao);
  ok('traz o ultimo resultado', !!est.ultimo_resultado);

  scheduler.stop();
  console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'TODOS OS TESTES DA ROTINA PASSARAM'));
  process.exit(falhas ? 1 : 0);
})();
