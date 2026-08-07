'use strict';

/* ==================================================================
   Lista de presenca: da chamada no celular ao registro no PC Mestre

   O caminho inteiro, sem atalho:

     PC monta a chamada -> celular marca -> pacote .presenca
       -> volta ao PC -> grava -> estatisticas
       -> publica -> celular le o relatorio

   E o mesmo presenca.js roda dos dois lados: o teste exige que as
   contas do computador e do celular batam numero a numero.

   Execute com:  node --no-warnings test/teste-presenca.js
   ================================================================== */

const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

const RAIZ = path.join(__dirname, '..');
const DIR_MAIN = path.join(RAIZ, 'src', 'main');

let falhas = 0;
const ok = (n, c, e = '') => {
  console.log((c ? '  OK  ' : 'FALHA ') + n + (e ? ' -> ' + e : ''));
  if (!c) falhas++;
};

/* ------------------------------------------------------------------ */
/* Cenario                                                             */
/* ------------------------------------------------------------------ */

const db = require(path.join(DIR_MAIN, 'db', 'database.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'presenca-'));
db.init(tmp);

const presenca = require(path.join(DIR_MAIN, 'services', 'presenca.js'));
const pacoteMod = require(path.join(DIR_MAIN, 'services', 'presenca-pacote.js'));
const pdf = require(path.join(DIR_MAIN, 'services', 'presenca-pdf.js'));

const IRMAOS = [
  ['João Carlos de Souza', 'Mestre'],
  ['Álvaro de Andrade', 'Aprendiz'],
  ['Bento Ribeiro', 'Companheiro'],
  ['Carlos Eduardo Lima', 'Mestre'],
  ['zacarias barbosa', 'Mestre']
];
const ids = IRMAOS.map(([nome, grau]) => db.obreiros.salvar({
  nome, grau, tratamento: 'Ir.∴', situacao: 'Ativo', dt_nascimento: '1980-01-01'
}).id);

// Um Adormecido, que não pode entrar na chamada
const dormindo = db.obreiros.salvar({
  nome: 'Antônio Adormecido', grau: 'Mestre', tratamento: 'Ir.∴', situacao: 'Adormecido'
}).id;

const SESSOES = [
  ['2026-08-03', 'Aprendiz', 'Economica'],
  ['2026-08-10', 'Mestre', 'Magna'],
  ['2026-08-17', 'Aprendiz', 'Economica']
];
for (const [data, grau, tipo] of SESSOES) db.sessoes.salvar({ data, grau, tipo, hora: '20:00' });

/* ------------------------------------------------------------------ */
/* 1. A chamada de uma sessao                                          */
/* ------------------------------------------------------------------ */

console.log('== Montagem da chamada ==');

const lista = presenca.listaDaSessao('2026-08-10');
ok('sessão reconhecida', lista.rotulo === 'Sessão Magna no Grau de Mestre', lista.rotulo);
ok('traz os Obreiros ativos', lista.total === 5, String(lista.total));
ok('Adormecido fora da chamada', !lista.itens.some((i) => i.obreiro_id === dormindo));
ok('ninguém marcado antes da chamada', lista.presentes === 0 && lista.tem_chamada === false);
ok('hora da sessão veio junto', lista.hora === '20:00');

const paraChamada = presenca.sessoesParaChamada(10);
ok('sessões listadas da mais recente para a mais antiga',
  paraChamada[0].data === '2026-08-17', paraChamada.map((s) => s.data).join(' '));
ok('nenhuma com chamada ainda', paraChamada.every((s) => !s.tem_chamada));

/* ------------------------------------------------------------------ */
/* 2. O pacote que volta do celular                                    */
/* ------------------------------------------------------------------ */

console.log('\n== Pacote gerado no celular ==');

// Compareceram os três primeiros do cadastro - por id, para o teste ser
// determinístico (a lista de chamada vem ordenada por NOME)
const PRESENTES = [ids[0], ids[1], ids[2]];
const marcados = lista.itens.map((i) => ({
  obreiro_id: i.obreiro_id,
  presente: PRESENTES.includes(i.obreiro_id)
}));

const pct = pacoteMod.montar({
  data: '2026-08-10',
  grau: 'Mestre', tipo: 'Magna',
  loja: 'A∴R∴L∴S∴ União Fraternal Rolandense nº 141',
  chamadaPor: 'Ir∴ Chanceler',
  itens: marcados
});

ok('formato declarado', pct.formato === 'ctrloja-presenca' && pct.versao === 1);
ok('contagem correta', pct.presentes === 3 && pct.total === 5);
ok('itens em forma compacta', Array.isArray(pct.itens[0]) && pct.itens[0].length === 2);

const textoPct = JSON.stringify(pct);
ok('NENHUM nome de Irmão vai no pacote',
  !IRMAOS.some(([nome]) => textoPct.includes(nome)), 'só ids e 0/1');
ok('a conferência acompanha o pacote', typeof pct.conferencia === 'string' && pct.conferencia.length === 8);

/* --- ida e volta pelo WhatsApp --- */

console.log('\n== Volta pelo WhatsApp ==');

const mensagem = pacoteMod.paraTexto(pct, '10 de agosto de 2026');
ok('mensagem legível traz a contagem', /Presentes: 3 de 5/.test(mensagem));
ok('mensagem NÃO traz nomes', !IRMAOS.some(([nome]) => mensagem.includes(nome)));
ok('mensagem tem as marcas de início e fim',
  mensagem.includes(pacoteMod.MARCA_INICIO) && mensagem.includes(pacoteMod.MARCA_FIM));
ok('o código vai numa linha só',
  mensagem.split('\n').filter((l) => l.trim().startsWith('{')).length === 1);
// O WhatsApp usa * _ ~ para formatar e COME esses caracteres do texto.
// Se algum sobrasse dentro do código, a lista voltaria quebrada.
const trecho = mensagem.slice(mensagem.indexOf(pacoteMod.MARCA_INICIO));
ok('sem asterisco, sublinhado ou til no código — o WhatsApp comeria',
  !/[*_~]/.test(trecho), (trecho.match(/[*_~]/g) || []).join(''));

ok('texto livre é limpo de formatação',
  pacoteMod.montar({
    data: '2026-08-10', chamadaPor: 'Ir_Fulano *da* Silva~',
    itens: [{ obreiro_id: 1, presente: true }]
  }).chamadaPor === 'Ir Fulano da Silva');

const devolta = pacoteMod.deTexto(mensagem);
ok('pacote recuperado do texto', JSON.stringify(devolta) === JSON.stringify(pct));

// O Irmão encaminha e o WhatsApp acrescenta cabeçalho de reencaminhado
const encaminhada = 'Mensagem encaminhada\n\n' + mensagem + '\n\nEnviado do meu celular';
ok('sobrevive a texto colado em volta',
  JSON.stringify(pacoteMod.deTexto(encaminhada)) === JSON.stringify(pct));

// Arquivo .presenca puro
ok('lê também o arquivo .presenca',
  JSON.stringify(pacoteMod.deTexto(JSON.stringify(pct, null, 2))) === JSON.stringify(pct));

console.log('\n== Pacote danificado é recusado ==');

const cortada = mensagem.slice(0, mensagem.length - 40);
try { pacoteMod.deTexto(cortada); ok('mensagem truncada é recusada', false); }
catch (e) { ok('mensagem truncada é recusada', /quebrado|incompleta|não encontrei/i.test(e.message), e.message.split('\n')[0]); }

const adulterado = JSON.parse(JSON.stringify(pct));
const faltou = adulterado.itens.findIndex((p) => p[1] === 0);
adulterado.itens[faltou][1] = 1;                  // marca presente quem faltou
try { pacoteMod.validar(adulterado); ok('lista alterada é detectada', false); }
catch (e) { ok('lista alterada é detectada', /conferência não bate/i.test(e.message)); }

const trocaData = JSON.parse(JSON.stringify(pct));
trocaData.data = '2026-08-17';
try { pacoteMod.validar(trocaData); ok('troca de data é detectada', false); }
catch (e) { ok('troca de data é detectada', /conferência não bate/i.test(e.message)); }

try { pacoteMod.deTexto('bom dia irmãos'); ok('texto sem lista é recusado', false); }
catch (e) { ok('texto sem lista é recusado', /não encontrei a lista/i.test(e.message)); }

/* ------------------------------------------------------------------ */
/* 3. Gravacao no PC Mestre                                            */
/* ------------------------------------------------------------------ */

console.log('\n== Gravação no PC Mestre ==');

const gravado = db.presencas.registrarLista({
  sessao_data: pct.data,
  origem: 'celular',
  registrado_por: pct.chamadaPor,
  itens: pct.itens.map(([id, p]) => ({ obreiro_id: id, presente: !!p }))
});
ok('gravou 3 presentes e 2 ausentes', gravado.presentes === 3 && gravado.ausentes === 2);

const depois = presenca.listaDaSessao('2026-08-10');
ok('a chamada aparece na sessão', depois.tem_chamada === true && depois.presentes === 3);
ok('percentual calculado', depois.percentual === 60, String(depois.percentual));

// Reenviar a mesma lista nao pode duplicar
db.presencas.registrarLista({
  sessao_data: pct.data, origem: 'celular',
  itens: pct.itens.map(([id, p]) => ({ obreiro_id: id, presente: !!p }))
});
ok('reenviar não duplica', db.presencas.porSessao('2026-08-10').length === 5);

// Correcao pelo PC: um Irmao chegou atrasado
db.presencas.registrarLista({
  sessao_data: '2026-08-10', origem: 'pc',
  itens: [{ obreiro_id: ids[3], presente: true }]
});
ok('correção pelo PC sobrepõe o celular', presenca.listaDaSessao('2026-08-10').presentes === 4);

// Obreiro que nao existe: ignora sem quebrar
const comIntruso = db.presencas.registrarLista({
  sessao_data: '2026-08-10', origem: 'celular',
  itens: [{ obreiro_id: 99999, presente: true }, { obreiro_id: ids[0], presente: true }]
});
ok('id desconhecido é ignorado, não quebra', comIntruso.ignorados === 1 && comIntruso.presentes === 1);

/* ------------------------------------------------------------------ */
/* 4. Estatisticas                                                     */
/* ------------------------------------------------------------------ */

console.log('\n== Estatísticas ==');

// Mais duas chamadas, para haver serie historica
db.presencas.registrarLista({
  sessao_data: '2026-08-03', origem: 'pc',
  itens: ids.map((id, n) => ({ obreiro_id: id, presente: n < 5 }))          // todos
});
db.presencas.registrarLista({
  sessao_data: '2026-08-17', origem: 'pc',
  itens: ids.map((id, n) => ({ obreiro_id: id, presente: n < 2 }))          // dois
});

const est = presenca.estatisticas({});
ok('três sessões com chamada', est.total_sessoes === 3, String(est.total_sessoes));
ok('série em ordem cronológica',
  est.sessoes.map((s) => s.data).join() === '2026-08-03,2026-08-10,2026-08-17');
ok('média de presentes', est.media_presentes === 3.7, String(est.media_presentes));
ok('melhor sessão é a de 3 de agosto', est.melhor.data === '2026-08-03');
ok('pior sessão é a de 17 de agosto', est.pior.data === '2026-08-17');
ok('última sessão é a mais recente', est.ultima.data === '2026-08-17');

const joao = est.obreiros.find((o) => o.nome === 'João Carlos de Souza');
ok('João esteve nas três', joao.presencas === 3 && joao.chamadas === 3 && joao.percentual === 100);

const zacarias = est.obreiros.find((o) => o.nome === 'zacarias barbosa');
ok('Zacarias só na primeira', zacarias.presencas === 1 && zacarias.percentual === 33.3,
  String(zacarias.percentual));

ok('lista ordenada do mais assíduo ao menos',
  est.obreiros[0].percentual >= est.obreiros[est.obreiros.length - 1].percentual);
ok('Adormecido fora das estatísticas', !est.obreiros.some((o) => o.nome === 'Antônio Adormecido'));

const historico = presenca.historicoDoObreiro(ids[4]);
ok('histórico individual em ordem', historico.map((h) => h.data).join() === '2026-08-03,2026-08-10,2026-08-17');
ok('histórico marca presença e falta',
  historico[0].presente === true && historico[2].presente === false);

// Quem entrou depois nao e cobrado pelas sessoes anteriores
const novato = db.obreiros.salvar({ nome: 'Recém Iniciado', grau: 'Aprendiz', tratamento: 'Ir.∴', situacao: 'Ativo' }).id;
db.presencas.registrarLista({
  sessao_data: '2026-08-17', origem: 'pc', itens: [{ obreiro_id: novato, presente: true }]
});
const estNovo = presenca.estatisticas({});
const rec = estNovo.obreiros.find((o) => o.nome === 'Recém Iniciado');
ok('recém-chegado só responde pelas sessões dele',
  rec.chamadas === 1 && rec.percentual === 100, `${rec.presencas}/${rec.chamadas}`);

/* ------------------------------------------------------------------ */
/* 5. Sessao sem chamada nao e sessao com zero                         */
/* ------------------------------------------------------------------ */

console.log('\n== Sessão sem chamada ==');

db.sessoes.salvar({ data: '2026-08-24', grau: 'Aprendiz', tipo: 'Economica' });
const estDepois = presenca.estatisticas({});
ok('sessão sem chamada não entra na estatística',
  estDepois.total_sessoes === 3 && !estDepois.sessoes.some((s) => s.data === '2026-08-24'));
ok('mas aparece para ser chamada',
  presenca.sessoesParaChamada(10).some((s) => s.data === '2026-08-24' && !s.tem_chamada));
ok('a média não foi diluída por ela', estDepois.media_presentes === estNovo.media_presentes);

/* ------------------------------------------------------------------ */
/* 6. Celular e PC calculam igual                                      */
/* ------------------------------------------------------------------ */

console.log('\n== Celular e PC: mesmas contas ==');

const backup = path.join(tmp, 'export.ctrloja');
require(path.join(DIR_MAIN, 'services', 'backup.js')).exportar(backup);
const pacoteApp = JSON.parse(fs.readFileSync(backup, 'utf8'));

ok('as presenças vão no pacote publicado',
  Array.isArray(pacoteApp.dados.presencas) && pacoteApp.dados.presencas.length > 0,
  String((pacoteApp.dados.presencas || []).length));

const dadosMobile = require(path.join(RAIZ, 'mobile', 'js', 'dados.js'));
const bancoMobile = dadosMobile.criarBanco(pacoteApp);

const carregarOriginal = Module._load;
Module._load = function (pedido, pai) {
  if (pai && /src[\\/]main[\\/]services/.test(pai.filename) && /db[\\/]database$/.test(pedido)) {
    return bancoMobile;
  }
  return carregarOriginal.apply(this, arguments);
};
delete require.cache[require.resolve(path.join(DIR_MAIN, 'services', 'presenca.js'))];
const presencaMobile = require(path.join(DIR_MAIN, 'services', 'presenca.js'));
Module._load = carregarOriginal;

const estPc = presenca.estatisticas({});
const estCel = presencaMobile.estatisticas({});

ok('mesmo total de sessões', estPc.total_sessoes === estCel.total_sessoes);
ok('mesma média', estPc.media_presentes === estCel.media_presentes);
ok('mesmo comparecimento médio', estPc.percentual_medio === estCel.percentual_medio);
ok('mesma série, sessão a sessão',
  JSON.stringify(estPc.sessoes) === JSON.stringify(estCel.sessoes));
ok('mesma frequência, Irmão a Irmão',
  JSON.stringify(estPc.obreiros) === JSON.stringify(estCel.obreiros));

const listaPc = presenca.listaDaSessao('2026-08-10');
const listaCel = presencaMobile.listaDaSessao('2026-08-10');
ok('mesma lista de chamada', JSON.stringify(listaPc) === JSON.stringify(listaCel));
ok('mesma ordem de Obreiros',
  listaPc.itens.map((i) => i.nome).join() === listaCel.itens.map((i) => i.nome).join());

/* ------------------------------------------------------------------ */
/* 7. Folha em PDF                                                     */
/* ------------------------------------------------------------------ */

console.log('\n== Folha para arquivo (PDF) ==');

const cfg = db.config.obterTodas();
const html = pdf.montarHtml(presenca.listaDaSessao('2026-08-10'), cfg, {});

ok('traz o nome da Loja', html.includes(cfg.loja_nome || 'Loja'));
ok('traz o título do documento', /LISTA DE PRESENÇA/.test(html));
ok('traz a data por extenso', /10 de agosto de 2026/.test(html));
ok('traz grau e tipo da sessão', /Magna/.test(html) && /Mestre/.test(html));
ok('lista os presentes', /João Carlos de Souza/.test(html));
ok('separa os ausentes', /Ausentes \(/.test(html));
ok('tem espaço de rubrica', /rubrica/i.test(html));
ok('tem as assinaturas de fechamento',
  /Chanceler/.test(html) && /Venerável Mestre/.test(html));
ok('define página A4', /@page[^}]*A4/.test(html));
ok('escapa conteúdo do banco', !/<script/i.test(html));

ok('data por extenso do módulo', pdf.dataExtenso('2026-08-10') === '10 de agosto de 2026');

/* ------------------------------------------------------------------ */

console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'CICLO DA LISTA DE PRESENÇA VALIDADO'));
process.exit(falhas ? 1 : 0);
