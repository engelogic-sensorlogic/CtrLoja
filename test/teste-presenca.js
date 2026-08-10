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

console.log('\n== Datas liberadas para chamada ==');

ok('piso em janeiro de 2026', presenca.DATA_MINIMA === '2026-01-01', presenca.DATA_MINIMA);
ok('aceita o próprio piso', presenca.dataValidaParaChamada('2026-01-01'));
ok('aceita data de recuperação', presenca.dataValidaParaChamada('2026-03-16'));
ok('recusa data anterior ao piso', !presenca.dataValidaParaChamada('2025-12-31'));
ok('recusa ano digitado errado', !presenca.dataValidaParaChamada('1926-08-10'));
ok('recusa data mal formada', !presenca.dataValidaParaChamada('10/08/2026'));
ok('recusa vazio', !presenca.dataValidaParaChamada('') && !presenca.dataValidaParaChamada(null));

/* Chamada lancada em data sem sessao cadastrada precisa continuar
   alcancavel pelo seletor - senao o registro some da vista. */
db.presencas.registrarLista({
  sessao_data: '2026-02-09', origem: 'pc',
  itens: [{ obreiro_id: ids[0], presente: true }]
});
const avulsa = presenca.sessoesParaChamada(200).find((s) => s.data === '2026-02-09');
ok('data sem sessão aparece no seletor depois da chamada', !!avulsa);
ok('e vem marcada como avulsa', avulsa && avulsa.sem_sessao === true && avulsa.tem_chamada === true);
ok('a lista dessa data monta assim mesmo',
  presenca.listaDaSessao('2026-02-09').sem_sessao === true);
db.presencas.limparSessao('2026-02-09');

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
ok('define página A4', /@page[^}]*A4/.test(html));
ok('escapa conteúdo do banco', !/<script/i.test(html));

console.log('\n== Aproveitamento da folha ==');

const margem = (html.match(/@page\s*\{[^}]*margin:\s*([^;]+);/) || [])[1] || '';
ok('margens estreitas em cima e embaixo', /^8mm\s+14mm$/.test(margem.trim()), margem.trim());
ok('laterais preservadas em 14mm', /14mm/.test(margem));

// A altura da linha vem do respiro vertical da celula: 6px de cada lado
// davam ~25px de linha; 8.5px levam a ~30px, os 20% pedidos.
const respiro = Number((html.match(/table\.lista td[^}]*padding:\s*([\d.]+)px/) || [])[1]);
ok('linhas 20% mais altas', respiro === 8.5, respiro + 'px de respiro vertical');
const alturaAntes = 2 * 6 + 13.3;
const alturaAgora = 2 * respiro + 13.3;
ok('conferindo a conta do aumento',
  Math.abs((alturaAgora / alturaAntes - 1) * 100 - 20) < 1.5,
  `${alturaAntes.toFixed(1)}px → ${alturaAgora.toFixed(1)}px (+${((alturaAgora / alturaAntes - 1) * 100).toFixed(0)}%)`);

const larguraRubrica = Number((html.match(/td\.rubrica[^}]*width:\s*(\d+)px/) || [])[1]);
const larguraGrau = Number((html.match(/td\.grau[^}]*width:\s*(\d+)px/) || [])[1]);
ok('coluna Rubrica bem mais larga', larguraRubrica === 260, larguraRubrica + 'px');
ok('coluna Grau enxuta', larguraGrau === 78, larguraGrau + 'px');

// A coluna Obreiro nao tem largura fixa: fica com o que sobra. Numa A4
// com 14mm de margem lateral sobram cerca de 688px de conteudo.
const sobra = 688 - 26 - larguraGrau - larguraRubrica;
ok('ainda sobra espaço confortável para o nome do Irmão', sobra > 280, sobra + 'px para a coluna Obreiro');

console.log('\n== Espaço em branco anulado ==');

ok('tem a área de anulação', /class="anulado"/.test(html));
ok('a área fica entre a relação e a assinatura',
  html.indexOf('class="anulado"') > html.indexOf('<!-- corpo -->')
  && html.indexOf('class="anulado"') < html.indexOf('class="assinatura"'));
ok('é ela que estica e empurra a assinatura', /\.anulado[^}]*flex:\s*1 1 auto/.test(html));
ok('o corpo não disputa esse espaço', /\.corpo[^}]*flex:\s*0 0 auto/.test(html));
ok('desenha o traço diagonal', /\.anulado[^}]*linear-gradient\(to bottom right/.test(html));
ok('diz o que aquele espaço significa', /espaço sem informação/.test(html));
ok('tem altura mínima, mesmo com a folha cheia', /\.anulado[^}]*min-height:\s*14mm/.test(html));

// Sem moldura: só o traço. As bordas poluíam a folha.
ok('sem moldura em volta', !/\.anulado\s*\{[^}]*border:/.test(html));

// Partindo entre folhas, sobrava uma tira solta no pé da página anterior.
ok('nunca se parte entre folhas',
  /\.anulado[^}]*break-inside:\s*avoid/.test(html)
  && /\.anulado[^}]*page-break-inside:\s*avoid/.test(html));
ok('o corpo tem folga antes da quebra de página',
  /\.corpo[^}]*padding-bottom:\s*8mm/.test(html));

console.log('\n== Contagem de folhas do PDF gerado ==');

/*
 * A altura do espaço anulado é procurada por bissecção, e quem diz se
 * uma tentativa serve é a contagem de folhas do PDF recém-impresso.
 * Se esta contagem errar, o documento ganha uma folha em branco ou a
 * assinatura sobe para o meio da página.
 */
const folhaFalsa = (n) => Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type /Pages /Count ' + n + '>>endobj\n'
  + Array.from({ length: n }, (_, i) => `${i + 2} 0 obj<</Type /Page /Parent 1 0 R>>endobj\n`).join('')
);

ok('conta uma folha', pdf.contarPaginas(folhaFalsa(1)) === 1);
ok('conta duas folhas', pdf.contarPaginas(folhaFalsa(2)) === 2);
ok('conta doze folhas', pdf.contarPaginas(folhaFalsa(12)) === 12);
ok('não confunde /Pages com /Page', pdf.contarPaginas(folhaFalsa(3)) === 3,
  'a árvore /Type /Pages não pode entrar na conta');
ok('aceita variação de espaço', pdf.contarPaginas(Buffer.from('/Type/Page x /Type  /Page y')) === 2);
ok('arquivo sem página nenhuma conta como uma', pdf.contarPaginas(Buffer.from('%PDF-1.4')) === 1);

ok('a conta da folha bate com A4 menos as margens',
  Math.round(pdf.ALTURA_FOLHA_MM) === 281 && Math.abs(pdf.ALTURA_FOLHA_PX - 1062) < 2,
  `${pdf.ALTURA_FOLHA_MM}mm = ${pdf.ALTURA_FOLHA_PX.toFixed(0)}px`);
ok('há um piso para o espaço anulado não virar risco solto',
  pdf.ALTURA_MINIMA_ANULADO >= 20, pdf.ALTURA_MINIMA_ANULADO + 'px');

console.log('\n== Assinatura: só o Chanceler ==');
ok('assina o Chanceler', /<small>Chanceler<\/small>/.test(html));
ok('NÃO pede assinatura do Secretário', !/Secretário/.test(html));
ok('NÃO pede assinatura do Venerável', !/Venerável/.test(html));
ok('uma única linha de assinatura',
  (html.match(/class="linha"/g) || []).length === 1,
  String((html.match(/class="linha"/g) || []).length));

// A folha vira uma coluna flexivel de altura util da pagina e a
// assinatura recebe margin-top:auto - e isso que a empurra para baixo.
ok('a folha ocupa a altura útil da página', /\.folha[^}]*min-height:\s*281mm/.test(html));
ok('a folha é uma coluna flexível', /\.folha[^}]*flex-direction:\s*column/.test(html));
ok('a assinatura é empurrada para baixo', /\.assinatura[^}]*margin-top:\s*auto/.test(html));

const respiroAcima = Number((html.match(/\.assinatura\s*\{[^}]*padding-top:\s*(\d+)px/) || [])[1]);
const respiroAbaixo = Number((html.match(/\.assinatura \.linha[^}]*margin:\s*0 auto (\d+)px/) || [])[1]);
ok('respiro triplo acima do traço', respiroAcima === 90, respiroAcima + 'px (era 30px)');
ok('respiro duplo entre o traço e o rótulo', respiroAbaixo === 8, respiroAbaixo + 'px (era 4px)');
ok('a assinatura não se parte entre folhas', /\.assinatura[^}]*break-inside:\s*avoid/.test(html));
ok('assinatura vem depois do corpo',
  html.indexOf('class="assinatura"') > html.indexOf('<!-- corpo -->'));
ok('assinatura fica logo acima do rodapé',
  html.indexOf('class="assinatura"') < html.indexOf('class="rodape"'));
ok('assinatura não se parte entre páginas', /\.assinatura[^}]*page-break-inside:\s*avoid/.test(html));

ok('data por extenso do módulo', pdf.dataExtenso('2026-08-10') === '10 de agosto de 2026');

/* ------------------------------------------------------------------ */
/* 8. Relatorio de frequencia para o mural                             */
/* ------------------------------------------------------------------ */

console.log('\n== Relatório de frequência (mural) ==');

const estMural = presenca.estatisticas({});
const mural = pdf.montarHtmlFrequencia(estMural, cfg, {});

ok('traz o nome da Loja', mural.includes(cfg.loja_nome || 'Loja'));
ok('título próprio, não é lista de presença',
  /FREQUÊNCIA DOS OBREIROS/.test(mural) && !/LISTA DE PRESENÇA/.test(mural));
ok('declara o período coberto', /de \d+ de \w+ de \d{4} a \d+ de \w+ de \d{4}/.test(mural));

ok('mostra os números da Loja',
  mural.includes('>Sessões<') && mural.includes('>Obreiros no quadro<')
  && mural.includes('>Média de presentes<') && mural.includes('>Comparecimento médio<'));

ok('desenha o gráfico em SVG', /<svg[^>]*viewBox/.test(mural));
ok('o gráfico tem uma barra por sessão',
  (mural.match(/<rect /g) || []).length === estMural.sessoes.length,
  `${(mural.match(/<rect /g) || []).length} barras para ${estMural.sessoes.length} sessões`);
ok('o gráfico marca a média', /stroke-dasharray/.test(mural));
ok('o gráfico traz a régua de porcentagem', /&gt;|>25%</.test(mural) || mural.includes('>25%<'));

ok('lista todos os Irmãos com frequência',
  estMural.obreiros.every((o) => mural.includes(o.nome)));
ok('mostra presenças sobre chamadas', /\d+\/\d+/.test(mural));
ok('desenha a barra de proporção de cada Irmão',
  (mural.match(/class="preenche"/g) || []).length === estMural.obreiros.length);

ok('NÃO tem linha de assinatura — é documento de mural',
  !/assinatura/i.test(mural) && !/Chanceler/.test(mural));
ok('define página A4', /@page[^}]*A4/.test(mural));
ok('escapa conteúdo do banco', !/<script/i.test(mural));

console.log('\n== Defeitos encontrados no PDF impresso ==');

/* O separador do cabecalho ia dentro do esc() e chegava ao papel como
   "&middot;" escrito por extenso, em vez do ponto do meio. */
for (const [rotulo, doc] of [['lista de presença', html], ['relatório do mural', mural]]) {
  ok(`${rotulo}: separador não vaza como texto`, !/&amp;middot;/.test(doc));
  ok(`${rotulo}: cabeçalho traz o separador de verdade`, /&middot;/.test(doc));
}

/* "Aprendiz" cortado em quatro letras virava "Apre" embaixo da barra. */
const rotulosGrafico = [...mural.matchAll(/font-size="9" fill="#8098A0">([^<]*)</g)].map((m) => m[1]);
ok('grau abreviado, não cortado',
  !rotulosGrafico.some((r) => /^(Apre|Comp|Mest)$/.test(r)),
  rotulosGrafico.join(' | '));

/* Nome do Irmao em uma linha so: a coluna cedia largura de menos. */
ok('a coluna do nome não deixa quebrar', /td\.nome[^}]*white-space:\s*nowrap/.test(mural));
const larguras = ['pos', 'grau', 'barra', 'pct', 'conta']
  .map((c) => Number((mural.match(new RegExp('td\\.' + c + '[^}]*width:\\s*(\\d+)px')) || [])[1]));
const sobraNome = 688 - larguras.reduce((a, b) => a + b, 0);
ok('sobra largura para o nome do Irmão', sobraNome > 300, sobraNome + 'px para a coluna Obreiro');

/* O grafico sozinho, sem dados, nao pode quebrar */
ok('gráfico vazio não quebra', pdf.graficoSvg([]) === '');
ok('gráfico com uma sessão só funciona',
  /<svg/.test(pdf.graficoSvg([{ data: '2026-08-10', percentual: 60, presentes: 3, grau: 'Mestre' }])));

/* ------------------------------------------------------------------ */

console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'CICLO DA LISTA DE PRESENÇA VALIDADO'));
process.exit(falhas ? 1 : 0);
