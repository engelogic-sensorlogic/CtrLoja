'use strict';

/* ==================================================================
   Tesouraria e Hospitalaria: do lançamento ao extrato publicado

   O caminho inteiro:

     PC lança  ->  extrato e saldo  ->  celular lê o mesmo
     celular lança  ->  pacote .financeiro  ->  volta ao PC  ->  grava

   E o mesmo financeiro.js roda dos dois lados: o teste exige que as
   contas do computador e do celular batam centavo por centavo.

   Dinheiro não perdoa erro de arredondamento, então há um bloco só
   para isso.

   Execute com:  node --no-warnings test/teste-financeiro.js
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

const db = require(path.join(DIR_MAIN, 'db', 'database.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'financeiro-'));
db.init(tmp);

const fin = require(path.join(DIR_MAIN, 'services', 'financeiro.js'));
const pacote = require(path.join(DIR_MAIN, 'services', 'financeiro-pacote.js'));

/* ------------------------------------------------------------------ */
/* 1. O que cada cargo movimenta                                       */
/* ------------------------------------------------------------------ */

console.log('== Categorias de cada cargo ==');

ok('Tesouraria: receita, despesa e investimento',
  fin.naturezasDe('tesouraria').map((n) => n.chave).join() === 'receita,despesa,investimento');
ok('Hospitalaria: receita e doação',
  fin.naturezasDe('hospitalaria').map((n) => n.chave).join() === 'receita,doacao');

const recTes = fin.natureza('tesouraria', 'receita').categorias;
ok('receitas da Tesouraria como pedido',
  recTes.join(' | ') === 'Mensalidade | Promoções | Juros de Investimentos | Outros', recTes.join(' | '));

const despTes = fin.natureza('tesouraria', 'despesa').categorias;
for (const c of ['Ágapes', 'Aluguel', 'Internet', 'Água', 'Luz', 'Manutenção do Templo', 'Promoções', 'Outros']) {
  ok(`despesa "${c}" disponível`, despTes.includes(c));
}

const recHosp = fin.natureza('hospitalaria', 'receita').categorias;
ok('receitas da Hospitalaria como pedido',
  recHosp.join(' | ') === 'Tronco de Solidariedade | Promoções | Outros', recHosp.join(' | '));
ok('Hospitalaria tem doações', fin.natureza('hospitalaria', 'doacao').categorias.length > 0);
ok('Hospitalaria NÃO tem despesa nem investimento',
  !fin.natureza('hospitalaria', 'despesa') && !fin.natureza('hospitalaria', 'investimento'));

/* ------------------------------------------------------------------ */
/* 2. Saldo                                                            */
/* ------------------------------------------------------------------ */

console.log('\n== Saldo: entra menos sai ==');

const lancar = (r) => db.financeiro.salvar(r);

lancar({ area: 'tesouraria', natureza: 'receita', categoria: 'Mensalidade', valor: 1200, data: '2026-08-05' });
lancar({ area: 'tesouraria', natureza: 'receita', categoria: 'Promoções', valor: 350.50, data: '2026-08-12' });
lancar({ area: 'tesouraria', natureza: 'despesa', categoria: 'Ágapes', valor: 420.30, data: '2026-08-10' });
lancar({ area: 'tesouraria', natureza: 'despesa', categoria: 'Luz', valor: 180, data: '2026-08-20' });
const aplicacao = lancar({ area: 'tesouraria', natureza: 'investimento', categoria: 'Aplicação', valor: 500, data: '2026-08-25' });

const ago = fin.extratoDoMes('tesouraria', '2026-08');
ok('receitas somadas', ago.naturezas[0].total === 1550.5, String(ago.naturezas[0].total));
ok('despesas somadas', ago.naturezas[1].total === 600.3, String(ago.naturezas[1].total));
ok('saldo do mês', ago.saldo === 950.2, String(ago.saldo));
ok('mês por extenso', ago.mes_extenso === 'agosto de 2026', ago.mes_extenso);

/* Investimento e um caso a parte e vale explicar: o dinheiro nao saiu
   da Loja, so mudou de lugar. Somar como despesa daria a impressao de
   prejuizo onde nao ha. */
ok('investimento NÃO é descontado do saldo', ago.saldo === 1550.5 - 600.3);
ok('investido aparece à parte', ago.investido === 500, String(ago.investido));

console.log('\n== Repartição por categoria ==');
ok('categorias ordenadas da maior', ago.naturezas[0].categorias[0].categoria === 'Mensalidade');
ok('percentual calculado', ago.naturezas[0].categorias[0].percentual === 77.4,
  String(ago.naturezas[0].categorias[0].percentual));
ok('percentuais somam cerca de 100',
  Math.abs(ago.naturezas[0].categorias.reduce((s, c) => s + c.percentual, 0) - 100) < 0.2);

/* ------------------------------------------------------------------ */
/* 3. Centavos                                                         */
/* ------------------------------------------------------------------ */

console.log('\n== Centavos não se perdem ==');

lancar({ area: 'hospitalaria', natureza: 'receita', categoria: 'Tronco de Solidariedade', valor: 0.1, data: '2026-08-05' });
lancar({ area: 'hospitalaria', natureza: 'receita', categoria: 'Outros', valor: 0.2, data: '2026-08-06' });

const hosp = fin.extratoDoMes('hospitalaria', '2026-08');
ok('0,10 + 0,20 dá exatamente 0,30', hosp.naturezas[0].total === 0.3, String(hosp.naturezas[0].total));
ok('em JavaScript puro daria 0,30000000000000004', 0.1 + 0.2 !== 0.3);

lancar({ area: 'hospitalaria', natureza: 'doacao', categoria: 'Assistência a Irmão', valor: 0.05, data: '2026-08-07' });
ok('saldo com três casas de origem fecha certo',
  fin.extratoDoMes('hospitalaria', '2026-08').saldo === 0.25,
  String(fin.extratoDoMes('hospitalaria', '2026-08').saldo));

console.log('\n== As áreas não se misturam ==');
ok('Tesouraria não vê lançamento da Hospitalaria',
  ago.naturezas.every((n) => n.itens.every((i) => i.area === 'tesouraria')));
ok('Hospitalaria não tem investido', hosp.investido === null);

/* ------------------------------------------------------------------ */
/* 4. Mês a mês                                                        */
/* ------------------------------------------------------------------ */

console.log('\n== Série mensal e acumulado ==');

lancar({ area: 'tesouraria', natureza: 'receita', categoria: 'Mensalidade', valor: 1300, data: '2026-09-05' });
lancar({ area: 'tesouraria', natureza: 'despesa', categoria: 'Aluguel', valor: 800, data: '2026-09-08' });

const serie = fin.serieMensal('tesouraria');
ok('um ponto por mês com movimento', serie.length === 2, serie.map((p) => p.mes).join());
ok('em ordem cronológica', serie[0].mes === '2026-08' && serie[1].mes === '2026-09');
ok('saldo de setembro', serie[1].saldo === 500, String(serie[1].saldo));
ok('acumulado soma os meses', serie[1].acumulado === 1450.2, String(serie[1].acumulado));

/* Mes sem lancamento nao vira ponto zerado: ele nao houve, e inventar
   zeros achataria o grafico e mentiria sobre a Loja. */
ok('mês sem movimento não vira ponto zerado',
  !serie.some((p) => p.mes === '2026-07'));

const quadro = fin.painel('tesouraria');
ok('painel traz o saldo atual', quadro.saldo_atual === 1450.2, String(quadro.saldo_atual));
ok('painel declara as naturezas', quadro.naturezas.length === 3);
ok('painel traz a repartição do mês', !!quadro.categorias.receita);
ok('navegação de mês anda para trás', fin.somarMes('2026-01', -1) === '2025-12');
ok('navegação de mês vira o ano', fin.somarMes('2026-12', 1) === '2027-01');

/* ------------------------------------------------------------------ */
/* 5. Do celular de volta ao PC                                        */
/* ------------------------------------------------------------------ */

console.log('\n== Pacote gerado no celular ==');

const pct = pacote.montar({
  area: 'tesouraria',
  loja: 'A∴R∴L∴S∴ União Fraternal Rolandense nº 141',
  lancadoPor: 'Ir∴ Tesoureiro',
  itens: [
    { data: '2026-10-05', natureza: 'receita', categoria: 'Mensalidade', descricao: 'Outubro', valor: 1400 },
    { data: '2026-10-09', natureza: 'despesa', categoria: 'Internet', descricao: '', valor: 120.90 }
  ]
});

ok('formato declarado', pct.formato === 'ctrloja-financeiro' && pct.versao === 1);
ok('dois lançamentos', pct.total === 2);
ok('a conferência acompanha', typeof pct.conferencia === 'string' && pct.conferencia.length === 8);

const texto = pacote.paraTexto(pct);
ok('mensagem traz o resumo legível', /1\.400,00|1400,00/.test(texto) || /R\$/.test(texto));
ok('mensagem tem as marcas', texto.includes(pacote.MARCA_INICIO) && texto.includes(pacote.MARCA_FIM));
ok('o código vai numa linha só',
  texto.split('\n').filter((l) => l.trim().startsWith('{')).length === 1);

/* O WhatsApp come * _ ~ ao formatar. Um sublinhado no meio do JSON
   voltaria como texto invalido - foi o que ja quebrou no pacote de
   presenca, e a licao vale aqui. */
const trecho = texto.slice(texto.indexOf(pacote.MARCA_INICIO));
ok('sem asterisco, sublinhado ou til no código', !/[*_~]/.test(trecho),
  (trecho.match(/[*_~]/g) || []).join(''));

ok('texto livre é limpo de formatação',
  pacote.montar({
    area: 'tesouraria', lancadoPor: 'Ir_Fulano *da* Silva~',
    itens: [{ data: '2026-10-05', natureza: 'receita', categoria: 'Outros', valor: 10 }]
  }).lancadoPor === 'Ir Fulano da Silva');

console.log('\n== Ida e volta ==');
ok('pacote recuperado do texto', JSON.stringify(pacote.deTexto(texto)) === JSON.stringify(pct));
ok('sobrevive a texto colado em volta',
  JSON.stringify(pacote.deTexto('Encaminhada\n\n' + texto + '\n\nEnviado do meu celular')) === JSON.stringify(pct));
ok('lê também o arquivo .financeiro',
  JSON.stringify(pacote.deTexto(JSON.stringify(pct, null, 2))) === JSON.stringify(pct));
ok('nome de arquivo com área e mês',
  pacote.nomeArquivo(pct) === 'financeiro-tesouraria-2026-10.financeiro', pacote.nomeArquivo(pct));

console.log('\n== Pacote danificado é recusado ==');

try { pacote.deTexto(texto.slice(0, texto.length - 40)); ok('mensagem truncada recusada', false); }
catch (e) { ok('mensagem truncada recusada', /quebrado|não encontrei/i.test(e.message)); }

const trocado = JSON.parse(JSON.stringify(pct));
trocado.itens[0].valor = 14000;
try { pacote.validar(trocado); ok('valor alterado é detectado', false); }
catch (e) { ok('valor alterado é detectado', /conferência não bate/i.test(e.message)); }

const semValor = JSON.parse(JSON.stringify(pct));
semValor.itens[0].valor = 0;
try { pacote.validar(semValor); ok('valor zerado é recusado', false); }
catch (e) { ok('valor zerado é recusado', /valor inválido|conferência/i.test(e.message)); }

try {
  pacote.montar({ area: 'tesouraria', itens: [{ data: '05/10/2026', natureza: 'receita', valor: 10 }] });
  ok('data mal formada é recusada', false);
} catch (e) { ok('data mal formada é recusada', /Nenhum lançamento válido/.test(e.message)); }

console.log('\n== Gravação no PC Mestre ==');

const r = db.financeiro.salvarVarios(pct.itens, {
  area: pct.area, origem: 'celular', registrado_por: pct.lancadoPor
});
ok('gravou os dois', r.gravados === 2);

const out = fin.extratoDoMes('tesouraria', '2026-10');
ok('extrato de outubro monta', out.saldo === 1279.1, String(out.saldo));
ok('origem registrada como celular',
  out.naturezas[0].itens.every((i) => i.origem === 'celular'));
ok('quem lançou ficou guardado',
  out.naturezas[0].itens[0].registrado_por === 'Ir∴ Tesoureiro');

/* ------------------------------------------------------------------ */
/* 6. Correção pelo PC                                                 */
/* ------------------------------------------------------------------ */

console.log('\n== Correção e exclusão ==');

const antes = db.financeiro.todos({ area: 'tesouraria' }).length;
db.financeiro.salvar({ id: aplicacao.id, area: 'tesouraria', natureza: 'investimento', categoria: 'Resgate', valor: 250, data: '2026-08-25' });
ok('editar não duplica', db.financeiro.todos({ area: 'tesouraria' }).length === antes);
ok('valor corrigido', db.financeiro.obter(aplicacao.id).valor === 250);

db.financeiro.excluir(aplicacao.id);
ok('excluir remove', db.financeiro.todos({ area: 'tesouraria' }).length === antes - 1);
ok('extrato reflete a exclusão', fin.extratoDoMes('tesouraria', '2026-08').investido === 0);

/* ------------------------------------------------------------------ */
/* 7. Celular e PC calculam igual                                      */
/* ------------------------------------------------------------------ */

console.log('\n== Celular e PC: mesmas contas ==');

const arquivo = path.join(tmp, 'export.ctrloja');
require(path.join(DIR_MAIN, 'services', 'backup.js')).exportar(arquivo);
const pacoteApp = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

ok('os lançamentos vão no pacote publicado',
  Array.isArray(pacoteApp.dados.financeiro) && pacoteApp.dados.financeiro.length > 0,
  String((pacoteApp.dados.financeiro || []).length));

const dadosMobile = require(path.join(RAIZ, 'mobile', 'js', 'dados.js'));
const bancoMobile = dadosMobile.criarBanco(pacoteApp);

const carregarOriginal = Module._load;
Module._load = function (pedido, pai) {
  if (pai && /src[\\/]main[\\/]services/.test(pai.filename) && /db[\\/]database$/.test(pedido)) {
    return bancoMobile;
  }
  return carregarOriginal.apply(this, arguments);
};
delete require.cache[require.resolve(path.join(DIR_MAIN, 'services', 'financeiro.js'))];
const finMobile = require(path.join(DIR_MAIN, 'services', 'financeiro.js'));
Module._load = carregarOriginal;

for (const area of ['tesouraria', 'hospitalaria']) {
  ok(`${area}: mesmo extrato do mês`,
    JSON.stringify(fin.extratoDoMes(area, '2026-08')) === JSON.stringify(finMobile.extratoDoMes(area, '2026-08')));
  ok(`${area}: mesma série mensal`,
    JSON.stringify(fin.serieMensal(area)) === JSON.stringify(finMobile.serieMensal(area)));
  ok(`${area}: mesmo painel`,
    JSON.stringify(fin.painel(area)) === JSON.stringify(finMobile.painel(area)));
}

ok('o celular NÃO grava lançamento', (() => {
  try { bancoMobile.financeiro.salvar({}); return false; } catch { return true; }
})());

/* ------------------------------------------------------------------ */
/* 8. Cargos do celular                                                */
/* ------------------------------------------------------------------ */

console.log('\n== Abas dos cargos ==');

const vm = require('vm');
const ctx = { self: null };
vm.createContext(ctx);
ctx.self = ctx;
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'mobile', 'js', 'cargos.js'), 'utf8'), ctx);
const cargos = ctx.CtrLojaCargos;

ok('Secretaria: Agenda da Loja, Obreiros e Solicitar',
  cargos.abasDe('secretaria').map((a) => a.nome).join(', ') === 'Agenda da Loja, Obreiros, Solicitar',
  cargos.abasDe('secretaria').map((a) => a.nome).join(', '));
ok('Tesouraria: Extrato Financeiro, Obreiros e Solicitar',
  cargos.abasDe('tesouraria').map((a) => a.nome).join(', ') === 'Extrato Financeiro, Obreiros, Solicitar',
  cargos.abasDe('tesouraria').map((a) => a.nome).join(', '));
ok('Hospitalaria com as mesmas abas da Tesouraria',
  cargos.abasDe('hospitalaria').map((a) => a.chave).join() === cargos.abasDe('tesouraria').map((a) => a.chave).join());
ok('Início ganhou a aba Finanças',
  cargos.abasDe('inicio').map((a) => a.chave).join() === 'hoje,proximos,presenca,financas,dados',
  cargos.abasDe('inicio').map((a) => a.chave).join());

ok('cada cargo financeiro sabe a área que movimenta',
  cargos.obter('tesouraria').areaFinanceira === 'tesouraria'
  && cargos.obter('hospitalaria').areaFinanceira === 'hospitalaria');
ok('Secretaria não movimenta dinheiro', !cargos.obter('secretaria').areaFinanceira);
ok('todos os cargos continuam protegidos',
  cargos.lista.filter((c) => c.chave !== 'inicio').every((c) => c.publico === false));

console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'CICLO FINANCEIRO VALIDADO'));
process.exit(falhas ? 1 : 0);
