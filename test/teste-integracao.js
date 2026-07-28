'use strict';

/* Testes automatizados do CtrLoja — execute com:  npm test  */

const path=require('path'), fs=require('fs'), os=require('os');
const Module=require('module');
const {DatabaseSync}=require('node:sqlite');
const raiz = path.join(__dirname, '..', 'src', 'main');

// Shim minimo de better-sqlite3 sobre node:sqlite (apenas para teste)
class Shim{
  constructor(f){ this.db=new DatabaseSync(f); }
  pragma(p){ try{this.db.exec('PRAGMA '+p);}catch(e){} }
  exec(s){ this.db.exec(s); }
  prepare(s){ const st=this.db.prepare(s);
    return { run:(...a)=>st.run(...a), get:(...a)=>st.get(...a), all:(...a)=>st.all(...a) }; }
  transaction(fn){ return (...a)=>{ this.db.exec('BEGIN'); try{ const r=fn(...a); this.db.exec('COMMIT'); return r;}catch(e){ this.db.exec('ROLLBACK'); throw e; } }; }
}
const orig=Module._load;
Module._load=function(req){ if(req==='better-sqlite3') return Shim; return orig.apply(this,arguments); };

const db=require(path.join(raiz,'db/database.js'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ctrloja-'));
db.init(tmp);

let falhas=0; const ok=(n,c,e='')=>{console.log((c?'  OK  ':'FALHA ')+n+(e?' -> '+e:'')); if(!c)falhas++;};

console.log('== Seeds ==');
ok('config semeada', Object.keys(db.config.obterTodas()).length>=12);
ok('templates semeados', db.templates.listar().length===14, String(db.templates.listar().length));
ok('datas semeadas', db.datas.listar().length===56, String(db.datas.listar().length));

console.log('== CRUD obreiro ==');
const o=db.obreiros.salvar({nome:'João Carlos de Souza',tratamento:'Ir.∴',grau:'Mestre',situacao:'Ativo',
  dt_nascimento:'1974-07-28',dt_iniciacao:'2014-07-28',dt_exaltacao:'2016-07-28',dt_casamento:'2001-07-28',celular:'43999990000'});
ok('obreiro criado', o && o.id>0);
db.familiares.salvar({obreiro_id:o.id,parentesco:'cunhada',nome:'Maria Helena de Souza',dt_nascimento:'1978-07-28'});
db.familiares.salvar({obreiro_id:o.id,parentesco:'sobrinho',nome:'Pedro Henrique de Souza',dt_nascimento:'2012-07-28'});
db.familiares.salvar({obreiro_id:o.id,parentesco:'sobrinha',nome:'Ana Clara de Souza',dt_nascimento:'2017-01-15'});
ok('3 familiares', db.familiares.listar(o.id).length===3);
const o2=db.obreiros.salvar({id:o.id,nome:'João Carlos de Souza',cargo:'Venerável Mestre',tratamento:'Ven.∴Ir.∴',grau:'Mestre',situacao:'Ativo',dt_nascimento:'1974-07-28',dt_iniciacao:'2014-07-28',dt_exaltacao:'2016-07-28',dt_casamento:'2001-07-28'});
ok('obreiro atualizado', o2.cargo==='Venerável Mestre');

console.log('== Agenda ==');
const agenda=require(path.join(raiz,'services/agenda.js'));
const ev=agenda.eventosDoDia('2026-07-28');
const tipos=ev.map(e=>e.tipo).sort();
console.log('   tipos:',tipos.join(', '));
ok('aniversario obreiro', tipos.includes('aniversario_obreiro'));
ok('iniciacao (12 anos)', ev.find(e=>e.tipo==='iniciacao')?.anos===12);
ok('exaltacao (10 anos)', ev.find(e=>e.tipo==='exaltacao')?.anos===10);
ok('casamento (25 anos)', ev.find(e=>e.tipo==='casamento')?.anos===25);
ok('conjuge no casamento', ev.find(e=>e.tipo==='casamento')?.conjuge==='Maria Helena de Souza');
ok('cunhada', ev.find(e=>e.tipo==='aniversario_cunhada')?.anos===48);
ok('sobrinho', ev.find(e=>e.tipo==='aniversario_sobrinho')?.anos===14);
ok('sobrinha nao aparece hoje', !tipos.includes('aniversario_sobrinha'));
ok('titulo sobrinho correto', ev.find(e=>e.tipo==='aniversario_sobrinho')?.titulo_pessoa==='Sobrinho');

const evNatal=agenda.eventosDoDia('2026-12-25');
ok('Natal no calendario', evNatal.some(e=>/Natal/.test(e.evento||'')));
const evCorpus=agenda.eventosDoDia('2026-06-04');
ok('Corpus Christi (movel)', evCorpus.some(e=>/Corpus/.test(e.evento||'')));
const evMacom=agenda.eventosDoDia('2026-08-20');
ok('Dia do Macom', evMacom.some(e=>/Ma[cç]om/.test(e.evento||'')));

console.log('== Fila de disparo ==');
db.grupos.sincronizar([{id:'1234-5678@g.us',nome:'Loja UFR - Oficial'},{id:'9999-1111@g.us',nome:'Cunhadas UFR'}]);
db.grupos.salvarSelecao(['1234-5678@g.us']);
const fila=agenda.montarFila('2026-07-28');
ok('fila com itens', fila.itens.length===ev.length, String(fila.itens.length));
ok('todos selecionados', fila.total_selecionados===fila.itens.length);
ok('grupo destino', fila.grupos.length===1 && fila.grupos[0].nome==='Loja UFR - Oficial');
ok('mensagens sem variavel pendente', fila.itens.every(i=>!/\{\{/.test(i.mensagem)));
console.log('\n--- exemplo de mensagem ---\n'+fila.itens[0].mensagem+'\n---------------------------');

console.log('== Tipo desabilitado ==');
db.config.salvar('eventos_habilitados', JSON.stringify(['aniversario_obreiro']));
const fila2=agenda.montarFila('2026-07-28');
ok('apenas 1 selecionado', fila2.total_selecionados===1, String(fila2.total_selecionados));
db.config.salvar('eventos_habilitados', JSON.stringify(['aniversario_obreiro','aniversario_cunhada','aniversario_sobrinho','aniversario_sobrinha','iniciacao','elevacao','exaltacao','remissao','casamento','feriado_religioso','data_nacional','efemeride','maconica']));

console.log('== Modo agrupado ==');
db.config.salvar('agrupar_mensagens','1');
const fila3=agenda.montarFila('2026-07-28');
ok('mensagem unica gerada', !!fila3.mensagem_unica && fila3.mensagem_unica.includes('AGENDA DE'));
db.config.salvar('agrupar_mensagens','0');

console.log('== Backup exportar/importar ==');
const backup=require(path.join(raiz,'services/backup.js'));
const arq=path.join(tmp,'bkp.ctrloja');
const exp=backup.exportar(arq);
ok('arquivo gerado', fs.existsSync(arq));
ok('resumo obreiros=1', exp.resumo.obreiros===1);
db.obreiros.excluir(o.id);
ok('obreiro removido', db.obreiros.listar().length===0);
const imp=backup.importar(arq,'substituir');
ok('obreiro restaurado', db.obreiros.listar().length===1);
ok('familiares restaurados', db.familiares.listar(db.obreiros.listar()[0].id).length===3);

console.log('== Log de envios ==');
db.envios.registrar({data_ref:'2026-07-28',evento_tipo:'aniversario_obreiro',evento_titulo:'João',destino_id:'1234-5678@g.us',destino_nome:'Loja UFR',mensagem:'teste',status:'enviado'});
ok('log gravado', db.envios.listar({de:'2026-01-01',ate:'2026-12-31'}).length>=1);
db.envios.marcarDisparo('2026-07-28',7,7);
ok('controle de disparo', db.envios.jaDisparado('2026-07-28')===true);
ok('outro dia nao disparado', db.envios.jaDisparado('2026-07-29')===false);

console.log('\n'+(falhas?('FALHAS: '+falhas):'TODOS OS TESTES DE INTEGRACAO PASSARAM'));
process.exit(falhas?1:0);
