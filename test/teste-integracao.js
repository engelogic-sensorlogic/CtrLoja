'use strict';

/* Testes automatizados do CtrLoja — execute com:  npm test  */

const path=require('path'), fs=require('fs'), os=require('os');
const raiz = path.join(__dirname, '..', 'src', 'main');

// O driver do CtrLoja usa better-sqlite3 quando disponivel e, na ausencia dele,
// o modulo node:sqlite embutido no Node 22+ / Electron 37+. Nada a configurar aqui.

const db=require(path.join(raiz,'db/database.js'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ctrloja-'));
db.init(tmp);

let falhas=0; const ok=(n,c,e='')=>{console.log((c?'  OK  ':'FALHA ')+n+(e?' -> '+e:'')); if(!c)falhas++;};

console.log('== Seeds ==');
ok('config semeada', Object.keys(db.config.obterTodas()).length>=12);
ok('templates semeados', db.templates.listar().length===15, String(db.templates.listar().length));
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
db.config.salvar('eventos_habilitados', JSON.stringify(['aniversario_obreiro','aniversario_cunhada','aniversario_sobrinho','aniversario_sobrinha','iniciacao','elevacao','exaltacao','remissao','casamento','feriado_religioso','data_nacional','efemeride','maconica','sessao']));

console.log('== Modo agrupado ==');
db.config.salvar('agrupar_mensagens','1');
const fila3=agenda.montarFila('2026-07-28');
ok('mensagem unica gerada', !!fila3.mensagem_unica && /União Fraternal Rolandense/.test(fila3.mensagem_unica));
ok('sem pauta no dia, sem linha AGENDA DE', !/AGENDA DE/.test(fila3.mensagem_unica));
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

console.log('== Dados da Loja UFR ==');
const cfgUFR = db.config.obterTodas();
ok('nome da Loja com numeral 141', /141/.test(cfgUFR.loja_nome), cfgUFR.loja_nome);
ok('rito configurado', !!cfgUFR.rito, cfgUFR.rito);
ok('fundacao 2007-09-04', cfgUFR.fundacao_loja==='2007-09-04', cfgUFR.fundacao_loja);
const evUFR = agenda.eventosDoDia('2026-09-04');
ok('aniversario da UFR na agenda', evUFR.some(e=>/Uniao Fraternal Rolandense/i.test(e.evento||'')));
ok('19 anos de fundacao em 2026', evUFR.find(e=>/Uniao Fraternal/i.test(e.evento||''))?.anos===19);
ok('mensagem da UFR renderiza', /141/.test(agenda.montarFila('2026-09-04').itens.find(i=>/Uniao Fraternal/i.test(i.evento||'')).mensagem));

console.log('== Driver SQLite ==');
const drv = require(path.join(raiz,'db/driver.js'));
ok('motor identificado', ['better-sqlite3','node:sqlite'].includes(drv.motorAtual), drv.motorAtual);


/* ================= Novas regras: Adormecido e Agenda da Loja ================= */
console.log('== Obreiro Adormecido ==');
const oAd = db.obreiros.salvar({ nome:'Irmão Adormecido', tratamento:'Ir.∴', grau:'Mestre', situacao:'Adormecido',
  dt_nascimento:'1970-03-10', dt_iniciacao:'2005-03-10' });
db.familiares.salvar({ obreiro_id:oAd.id, parentesco:'cunhada', nome:'Cunhada do Adormecido', dt_nascimento:'1972-03-10' });
db.familiares.salvar({ obreiro_id:oAd.id, parentesco:'sobrinha', nome:'Sobrinha do Adormecido', dt_nascimento:'2008-03-10' });

const evAd = agenda.eventosDoDia('2026-03-10');
ok('eventos do adormecido aparecem na agenda', evAd.length >= 4, String(evAd.length));
ok('todos bloqueados', evAd.every(e => e.bloqueado === true));
ok('familia tambem bloqueada', evAd.filter(e=>e.categoria==='familiar').every(e=>e.bloqueado===true));
const filaAd = agenda.montarFila('2026-03-10');
ok('nenhum selecionado para disparo', filaAd.total_selecionados === 0, String(filaAd.total_selecionados));
ok('motivo informado', /Adormecido/.test(filaAd.itens[0].motivo_bloqueio || ''));

db.obreiros.salvar({ id:oAd.id, nome:'Irmão Adormecido', tratamento:'Ir.∴', grau:'Mestre', situacao:'Ativo',
  dt_nascimento:'1970-03-10', dt_iniciacao:'2005-03-10' });
const filaAtivo = agenda.montarFila('2026-03-10');
ok('ao reativar volta a disparar', filaAtivo.total_selecionados >= 4, String(filaAtivo.total_selecionados));

console.log('== Migracao de situacoes antigas ==');
db.getConn().prepare("UPDATE obreiros SET situacao='Falecido' WHERE id=?").run(oAd.id);
db.getConn().prepare("UPDATE obreiros SET situacao='Adormecido' WHERE situacao NOT IN ('Ativo','Adormecido')").run();
ok('situacao legada vira Adormecido', db.obreiros.obter(oAd.id).situacao === 'Adormecido');

console.log('== Migracao: novo tipo de evento entra na lista salva ==');
db.config.salvar('eventos_habilitados', JSON.stringify(['aniversario_obreiro','maconica']));
db.init(tmp);   // simula a abertura do app apos a atualizacao
const habAgora = JSON.parse(db.config.obter('eventos_habilitados'));
ok('sessao adicionada automaticamente', habAgora.includes('sessao'), habAgora.join(','));
ok('nao apaga as escolhas do usuario', habAgora.includes('aniversario_obreiro') && !habAgora.includes('casamento'));
db.config.salvar('eventos_habilitados', JSON.stringify(['aniversario_obreiro','aniversario_cunhada','aniversario_sobrinho','aniversario_sobrinha','iniciacao','elevacao','exaltacao','remissao','casamento','feriado_religioso','data_nacional','efemeride','maconica','sessao']));

console.log('== Agenda da Loja (sessoes) ==');
// julho/2026: segundas-feiras = 6, 13, 20, 27
const pauta = agenda.sessoesDoMes(2026, 7);
ok('so os dias de sessao', pauta.linhas.length === 4, String(pauta.linhas.length));
ok('todas em segunda-feira', pauta.linhas.every(l => new Date(l.data+'T12:00:00').getDay() === 1));
ok('datas corretas', pauta.linhas.map(l=>l.data).join(',') === '2026-07-06,2026-07-13,2026-07-20,2026-07-27',
   pauta.linhas.map(l=>l.data).join(','));
ok('nenhuma programada ainda', pauta.linhas.every(l => l.sessao === null));

db.sessoes.salvar({ data:'2026-07-13', grau:'Companheiro', tipo:'Magna', hora:'20:00',
  agenda_dia:'1. Abertura\n2. Elevacao do Ir. Fulano\n3. Encerramento' });
const pauta2 = agenda.sessoesDoMes(2026, 7);
ok('sessao aparece na pauta do mes', !!pauta2.linhas.find(l=>l.data==='2026-07-13').sessao);

const evSes = agenda.eventosDoDia('2026-07-13');
const ses = evSes.find(e=>e.tipo==='sessao');
ok('sessao entra na agenda do dia', !!ses);
ok('grau e tipo no evento', ses.grau==='Companheiro' && ses.tipo_sessao==='Magna');
const filaSes = agenda.montarFila('2026-07-13');
const itemSes = filaSes.itens.find(i=>i.tipo==='sessao');
ok('mensagem da sessao montada', !!itemSes && !/\{\{/.test(itemSes.mensagem));
ok('mensagem cita grau', /Grau de Companheiro/.test(itemSes.mensagem));
ok('mensagem cita tipo', /SESSÃO MAGNA/i.test(itemSes.mensagem));
ok('mensagem traz a pauta', /Elevacao do Ir\. Fulano/.test(itemSes.mensagem));
ok('sessao selecionada para envio', itemSes.selecionado === true);
console.log('\n--- mensagem da sessao ---\n'+itemSes.mensagem+'\n--------------------------');

console.log('== Sessao sem pauta (convocacao padrao) ==');
db.sessoes.salvar({ data:'2026-07-20', grau:'Aprendiz', tipo:'Economica' });
const itemSemPauta = agenda.montarFila('2026-07-20').itens.find(i=>i.tipo==='sessao');
ok('gera mensagem mesmo sem pauta', !!itemSemPauta && itemSemPauta.selecionado===true);
ok('omite o bloco ORDEM DO DIA', !/ORDEM DO DIA/.test(itemSemPauta.mensagem));
ok('mantem grau e horario', /Grau de Aprendiz/.test(itemSemPauta.mensagem) && /20:00/.test(itemSemPauta.mensagem));

console.log('== Data adicional fora da segunda ==');
db.sessoes.salvar({ data:'2026-07-25', grau:'Mestre', tipo:'Magna', especial:1, agenda_dia:'Sessão Magna de Aniversário' });
const pauta3 = agenda.sessoesDoMes(2026, 7);
ok('data adicional entra na pauta', pauta3.linhas.length === 5, String(pauta3.linhas.length));
const extra = pauta3.linhas.find(l=>l.data==='2026-07-25');
ok('marcada como nao regular', extra && extra.regular === false);
ok('ordem cronologica mantida', pauta3.linhas.map(l=>l.data).join(',') ===
   '2026-07-06,2026-07-13,2026-07-20,2026-07-25,2026-07-27');
ok('sabado tambem gera evento', agenda.eventosDoDia('2026-07-25').some(e=>e.tipo==='sessao'));

console.log('== Sessao marcada como nao enviar ==');
db.sessoes.salvar({ data:'2026-07-06', grau:'Mestre', tipo:'Economica', enviar:0 });
const bloq = agenda.montarFila('2026-07-06').itens.find(i=>i.tipo==='sessao');
ok('respeita o nao enviar', bloq && bloq.selecionado===false && /não enviar/.test(bloq.motivo_bloqueio||''));

console.log('== Backup inclui sessoes ==');
const arq2 = path.join(tmp,'bkp2.ctrloja');
const exp2 = backup.exportar(arq2);
ok('sessoes exportadas', exp2.resumo.sessoes === 4, String(exp2.resumo.sessoes));
db.sessoes.excluirPorData('2026-07-13');
ok('sessao removida', !db.sessoes.obterPorData('2026-07-13'));
backup.importar(arq2,'substituir');
ok('sessao restaurada pelo backup', !!db.sessoes.obterPorData('2026-07-13'));

console.log('== Modo agrupado: so eventos com conteudo ==');
db.config.salvar('agrupar_mensagens', '1');

// dia com sessao SEM pauta + aniversario
db.sessoes.salvar({ data: '2026-07-27', grau: 'Aprendiz', tipo: 'Economica' });   // segunda, sem pauta
const oAgr = db.obreiros.salvar({ nome: 'Irmão do Agrupado', tratamento: 'Ir.∴', grau: 'Mestre',
  situacao: 'Ativo', dt_nascimento: '1975-07-27' });
let fAgr = agenda.montarFila('2026-07-27');
ok('sessao sem pauta fica fora', fAgr.itens.some(i => i.tipo === 'sessao' && /sem Agenda do Dia/.test(i.fora_do_agrupamento || '')));
ok('mensagem unica existe (tem o aniversario)', !!fAgr.mensagem_unica);
ok('mensagem nao traz a convocacao', !/CONVOCAÇÃO/.test(fAgr.mensagem_unica));
ok('mensagem traz o aniversariante', /Irmão do Agrupado/.test(fAgr.mensagem_unica));

console.log('== Cabecalho da Loja aparece uma vez so ==');
const ocorrencias = (fAgr.mensagem_unica.match(/União Fraternal Rolandense/g) || []).length;
ok('nome da Loja nao se repete', ocorrencias === 1, String(ocorrencias));
const chanc = (fAgr.mensagem_unica.match(/Esta Chancelaria informa/g) || []).length;
ok('linha fixa do cabecalho nao se repete', chanc <= 1, String(chanc));
ok('sem sessao com pauta: nao traz AGENDA DE', !/AGENDA DE/.test(fAgr.mensagem_unica));
console.log('\n--- mensagem agrupada ---\n' + fAgr.mensagem_unica + '\n-------------------------');

console.log('== Dia so com sessao sem pauta: nada a enviar ==');
db.obreiros.excluir(oAgr.id);
fAgr = agenda.montarFila('2026-07-27');
ok('ha evento selecionado', fAgr.total_selecionados === 1, String(fAgr.total_selecionados));
ok('mas nao ha mensagem agrupada', fAgr.mensagem_unica === null);
ok('total para envio zerado', fAgr.total_para_envio === 0, String(fAgr.total_para_envio));

console.log('== Sessao COM pauta volta a entrar ==');
db.sessoes.salvar({ data: '2026-07-27', grau: 'Aprendiz', tipo: 'Economica', agenda_dia: '1. Abertura\n2. Instrucao' });
fAgr = agenda.montarFila('2026-07-27');
ok('sessao com pauta entra', !!fAgr.mensagem_unica && /Instrucao/.test(fAgr.mensagem_unica));
ok('total para envio = 1', fAgr.total_para_envio === 1);

console.log('== Modo individual nao muda ==');
db.config.salvar('agrupar_mensagens', '0');
db.sessoes.salvar({ data: '2026-07-27', grau: 'Aprendiz', tipo: 'Economica' });   // volta sem pauta
const fInd = agenda.montarFila('2026-07-27');
const sesInd = fInd.itens.find(i => i.tipo === 'sessao');
ok('sessao sem pauta continua sendo enviada avulsa', sesInd.selecionado === true && !sesInd.fora_do_agrupamento);
ok('convocacao mantem o cabecalho da Loja', /União Fraternal Rolandense/.test(sesInd.mensagem));

console.log('== Utilitarios de conteudo ==');
const tplMod = require(path.join(raiz, 'services/templates.js'));
const cabTeste = ['*A∴R∴L∴S∴ União Fraternal Rolandense nº 141*', '_Oriente de Rolândia - PR_', 'Esta Chancelaria informa ...'];
ok('detecta bloco vazio', tplMod.temConteudo('*A∴R∴L∴S∴ União Fraternal Rolandense nº 141*\n_Oriente de Rolândia - PR_\n\n*T∴F∴A∴*') === false);
ok('detecta bloco com texto', tplMod.temConteudo('*A∴R∴L∴S∴ União Fraternal Rolandense nº 141*\n\nParabéns!') === true);
ok('remove linha fixa do cabecalho diario', tplMod.removerCabecalhoLoja('Esta Chancelaria informa ...\n\nTexto útil', cabTeste) === 'Texto útil');
ok('remove cabecalho', tplMod.removerCabecalhoLoja('*A∴R∴L∴S∴ União Fraternal Rolandense nº 141*\n_Oriente de Rolândia - PR_\n\nTexto').startsWith('Texto'));

console.log('== Cabecalho AGENDA DE so com pauta ==');
db.config.salvar('agrupar_mensagens', '1');
db.sessoes.excluirPorData('2026-07-27');
const oCab = db.obreiros.salvar({ nome: 'Irmão do Cabecalho', tratamento: 'Ir.∴', grau: 'Mestre',
  situacao: 'Ativo', dt_nascimento: '1975-07-27' });

let fc = agenda.montarFila('2026-07-27');
ok('sem sessao: sem linha AGENDA DE', !/AGENDA DE/.test(fc.mensagem_unica || ''), (fc.mensagem_unica||'').split('\n').slice(0,6).join(' | '));
ok('sem separador logo apos o cabecalho', !/Chancelaria[\s\S]{0,40}———/.test(fc.mensagem_unica || ''));
ok('mensagem tem o aniversario', /Irmão do Cabecalho/.test(fc.mensagem_unica || ''));
console.log('\n--- sem pauta ---\n' + fc.mensagem_unica + '\n------------------');

db.sessoes.salvar({ data: '2026-07-27', grau: 'Mestre', tipo: 'Magna', agenda_dia: '1. Abertura\n2. Balaustre' });
fc = agenda.montarFila('2026-07-27');
ok('com pauta: linha AGENDA DE presente', /AGENDA DE/.test(fc.mensagem_unica || ''));
ok('pauta aparece na mensagem', /Balaustre/.test(fc.mensagem_unica || ''));
const seps = (fc.mensagem_unica.match(/\n———————————————\n/g) || []).length;
ok('um separador entre os dois eventos', seps === 1, String(seps));
console.log('\n--- com pauta ---\n' + fc.mensagem_unica + '\n------------------');

db.sessoes.excluirPorData('2026-07-27');
db.obreiros.excluir(oCab.id);
db.config.salvar('agrupar_mensagens', '0');

console.log('== Migracao do cabecalho ja gravado ==');
db.templates.salvar({ chave: 'cabecalho_diario', titulo: 'Cabecalho', descricao: '',
  corpo: '{{loja}}\n{{oriente}}\n\n📅 AGENDA DE {{data_extenso}}' });
db.init(tmp);   // simula reabertura do app
const cabMigrado = db.templates.obter('cabecalho_diario').corpo;
ok('linha ficou condicional', /\{\{#tem_pauta\}\}.*AGENDA DE.*\{\{\/tem_pauta\}\}/.test(cabMigrado), cabMigrado.replace(/\n/g,' | '));
db.init(tmp);
ok('migracao nao duplica', (db.templates.obter('cabecalho_diario').corpo.match(/tem_pauta/g) || []).length === 2);

console.log('\n'+(falhas?('FALHAS: '+falhas):'TODOS OS TESTES DE INTEGRACAO PASSARAM'));
process.exit(falhas?1:0);
