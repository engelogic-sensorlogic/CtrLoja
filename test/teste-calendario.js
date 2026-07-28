'use strict';

/* Testes automatizados do CtrLoja — execute com:  npm test  */

const path=require('path');
const Module=require('module');
const raiz = path.join(__dirname, '..', 'src', 'main');

// stub do banco
const cfg={loja_nome:'A∴R∴L∴S∴ União Fraternal Rolandense nº 000',loja_sigla:'UFR',
 potencia:'Grande Loja Maçônica do Estado do Paraná - GLP',oriente:'Oriente de Rolândia - PR',
 titulo_obreiro:'Ir.∴',titulo_cunhada:'Cunhada',titulo_sobrinho:'Sobrinho',titulo_sobrinha:'Sobrinha'};
const TPL=require(path.join(raiz,'db/templates-padrao.js'));
const stub={config:{obterTodas:()=>cfg,obter:(k,d)=>cfg[k]??d},
 templates:{obter:(c)=>TPL.find(t=>t.chave===c)}};
const orig=Module._load;
Module._load=function(req,parent,isMain){
  if(req.endsWith('db/database')||req==='../db/database') return stub;
  return orig.apply(this,arguments);
};

const cal=require(path.join(raiz,'services/calendario.js'));
const tpl=require(path.join(raiz,'services/templates.js'));
const DATAS=require(path.join(raiz,'db/datas-padrao.js'));

let falhas=0;
function ok(nome,cond,extra=''){ console.log((cond?'  OK  ':'FALHA ')+nome+(extra?' -> '+extra:'')); if(!cond)falhas++; }

console.log('== Pascoa ==');
ok('Pascoa 2024 = 2024-03-31', cal.pascoa(2024)==='2024-03-31', cal.pascoa(2024));
ok('Pascoa 2025 = 2025-04-20', cal.pascoa(2025)==='2025-04-20', cal.pascoa(2025));
ok('Pascoa 2026 = 2026-04-05', cal.pascoa(2026)==='2026-04-05', cal.pascoa(2026));
ok('Pascoa 2027 = 2027-03-28', cal.pascoa(2027)==='2027-03-28', cal.pascoa(2027));

console.log('== Datas moveis 2026 ==');
const acha=c=>DATAS.find(d=>d.chave===c);
ok('Carnaval 2026 = 17/02', cal.resolverDataCalendario(acha('rel_carnaval'),2026)==='2026-02-17', cal.resolverDataCalendario(acha('rel_carnaval'),2026));
ok('Sexta-feira Santa 2026 = 03/04', cal.resolverDataCalendario(acha('rel_sexta_santa'),2026)==='2026-04-03', cal.resolverDataCalendario(acha('rel_sexta_santa'),2026));
ok('Corpus Christi 2026 = 04/06', cal.resolverDataCalendario(acha('rel_corpus_christi'),2026)==='2026-06-04', cal.resolverDataCalendario(acha('rel_corpus_christi'),2026));
ok('Dia das Maes 2026 = 10/05', cal.resolverDataCalendario(acha('nac_maes'),2026)==='2026-05-10', cal.resolverDataCalendario(acha('nac_maes'),2026));
ok('Dia dos Pais 2026 = 09/08', cal.resolverDataCalendario(acha('nac_pais'),2026)==='2026-08-09', cal.resolverDataCalendario(acha('nac_pais'),2026));
ok('Natal fixo 2026 = 25/12', cal.resolverDataCalendario(acha('rel_natal'),2026)==='2026-12-25');

console.log('== Idades e coincidencia ==');
ok('anos 1974-07-28 -> 2026-07-28 = 52', cal.anosDecorridos('1974-07-28','2026-07-28')===52);
ok('anos 1974-07-29 -> 2026-07-28 = 51', cal.anosDecorridos('1974-07-29','2026-07-28')===51);
ok('29/02 comemorado em 28/02 (ano comum)', cal.mesmoDiaMes('2000-02-29','2026-02-28')===true);
ok('29/02 nao duplica em ano bissexto', cal.mesmoDiaMes('2000-02-29','2028-02-28')===false);
ok('29/02 casa com 29/02 bissexto', cal.mesmoDiaMes('2000-02-29','2028-02-29')===true);
ok('resolver 29/02 em ano comum -> 28/02', cal.resolverDataCalendario({tipo:'fixa',dia:29,mes:2},2026)==='2026-02-28');
ok('ultima sexta de marco 2026 = 27/03', cal.nthDiaSemana(2026,3,5,-1)==='2026-03-27', cal.nthDiaSemana(2026,3,5,-1));

console.log('== Todas as datas padrao resolvem ==');
let semData=DATAS.filter(d=>!cal.resolverDataCalendario(d,2026));
ok('nenhuma data padrao sem resolucao', semData.length===0, semData.map(d=>d.chave).join(','));
ok('total de datas padrao', DATAS.length>=45, String(DATAS.length));
const chaves=DATAS.map(d=>d.chave);
ok('sem chaves duplicadas', new Set(chaves).size===chaves.length);

console.log('== Renderizacao de modelos ==');
const r1=tpl.renderizar('{{titulo}} {{nome}}{{#idade}} — {{idade}} anos{{/idade}}',{titulo:'Ir.∴',nome:'João',idade:52});
ok('bloco condicional preenchido', r1==='Ir.∴ João — 52 anos', r1);
const r2=tpl.renderizar('{{titulo}} {{nome}}{{#idade}} — {{idade}} anos{{/idade}}',{titulo:'Ir.∴',nome:'João'});
ok('bloco condicional vazio', r2==='Ir.∴ João', r2);
const r3=tpl.renderizar('{{^idade}}sem idade{{/idade}}',{});
ok('bloco invertido', r3==='sem idade', r3);

const evt={data:'2026-07-28',tipo:'aniversario_obreiro',titulo_pessoa:'Ir.∴',nome:'João Carlos de Souza',anos:52};
const msg=tpl.montarMensagem(evt);
ok('mensagem sem variavel pendente', !/\{\{|\}\}/.test(msg));
ok('mensagem contem nome', msg.includes('João Carlos de Souza'));
ok('mensagem contem loja', msg.includes('União Fraternal Rolandense'));

const evtCas={data:'2026-11-10',tipo:'casamento',titulo_pessoa:'Ir.∴',nome:'João',conjuge:'Maria',anos:25,data_original:'2001-11-10'};
const msgCas=tpl.montarMensagem(evtCas);
ok('casamento com 25º e data', msgCas.includes('25º')&&msgCas.includes('10/11/2001'));

console.log('== Todos os modelos renderizam ==');
for(const t of TPL){
  const p=tpl.preview(t.corpo,t.chave);
  ok('modelo '+t.chave, p.length>0 && !/\{\{/.test(p));
}

console.log('\n'+(falhas?('FALHAS: '+falhas):'TODOS OS TESTES PASSARAM'));
process.exit(falhas?1:0);
