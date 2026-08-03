'use strict';

/* ==================================================================
   Prova de equivalencia: desktop x celular

   Monta a mesma agenda pelos dois caminhos e exige resultado IDENTICO:

     desktop -> SQLite  -> agenda.js
     celular -> .ctrloja -> mobile/js/dados.js -> agenda.js  (o mesmo arquivo)

   Se algum dia a mensagem do celular divergir da do computador, este
   teste falha antes de a diferenca chegar ao grupo da Loja.

   Execute com:  node --no-warnings test/teste-mobile.js
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
/* 1. Lado desktop: banco real, dados de teste e exportacao            */
/* ------------------------------------------------------------------ */

const db = require(path.join(DIR_MAIN, 'db', 'database.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-'));
db.init(tmp);

const backup = require(path.join(DIR_MAIN, 'services', 'backup.js'));
const agendaDesktop = require(path.join(DIR_MAIN, 'services', 'agenda.js'));

// Cenario com um pouco de tudo, para o teste ter o que comparar
const o1 = db.obreiros.salvar({
  nome: 'João Carlos de Souza', tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Ativo',
  dt_nascimento: '1974-09-04', dt_iniciacao: '2014-09-04', dt_exaltacao: '2016-09-04',
  dt_casamento: '2001-09-04'
});
db.familiares.salvar({ obreiro_id: o1.id, parentesco: 'cunhada', nome: 'Maria Helena de Souza', dt_nascimento: '1978-09-04' });
db.familiares.salvar({ obreiro_id: o1.id, parentesco: 'sobrinho', nome: 'Pedro Henrique de Souza', dt_nascimento: '2010-09-04' });
db.familiares.salvar({ obreiro_id: o1.id, parentesco: 'sobrinha', nome: 'Ana Clara de Souza', dt_nascimento: '2015-03-21' });

// Obreiro Adormecido: nada dele pode sair em nenhum dos dois lados
const o2 = db.obreiros.salvar({
  nome: 'Antônio Adormecido', tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Adormecido',
  dt_nascimento: '1970-09-04'
});
db.familiares.salvar({ obreiro_id: o2.id, parentesco: 'cunhada', nome: 'Esposa do Adormecido', dt_nascimento: '1972-09-04' });

// Nomes com acento e ordenacao delicada
db.obreiros.salvar({ nome: 'Álvaro de Andrade', tratamento: 'Ir.∴', grau: 'Aprendiz', situacao: 'Ativo', dt_nascimento: '1990-09-04' });
db.obreiros.salvar({ nome: 'zacarias barbosa', tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Ativo', dt_nascimento: '1985-09-04' });

db.sessoes.salvar({ data: '2026-09-07', grau: 'Mestre', tipo: 'Magna', hora: '20:00',
  agenda_dia: '1. Abertura\n2. Exaltação do Ir∴ Fulano\n3. Encerramento' });
db.sessoes.salvar({ data: '2026-09-14', grau: 'Aprendiz', tipo: 'Economica' });   // sem pauta

db.grupos.sincronizar([{ id: '111-222@g.us', nome: 'Loja UFR — Oficial' }]);
db.grupos.salvarSelecao(['111-222@g.us']);

const arquivo = path.join(tmp, 'export.ctrloja');
backup.exportar(arquivo);
const pacote = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

console.log('== Pacote .ctrloja ==');
ok('formato reconhecido', pacote.formato === 'ctrloja-backup');
for (const t of ['obreiros', 'familiares', 'datas_calendario', 'templates', 'sessoes', 'grupos', 'config']) {
  ok(`tabela ${t} presente`, Array.isArray(pacote.dados[t]) && pacote.dados[t].length > 0, String((pacote.dados[t] || []).length));
}

/* ------------------------------------------------------------------ */
/* 2. Lado celular: mesmo agenda.js, mas sobre o .ctrloja              */
/* ------------------------------------------------------------------ */

const dadosMobile = require(path.join(RAIZ, 'mobile', 'js', 'dados.js'));
const bancoMobile = dadosMobile.criarBanco(pacote);

console.log('\n== Camada de dados do celular ==');
ok('banco montado a partir do arquivo', !!bancoMobile && !!bancoMobile.config);
ok('resumo confere', bancoMobile.resumo.obreiros === 4, JSON.stringify(bancoMobile.resumo));

// Carrega uma SEGUNDA instancia de agenda.js/templates.js, desta vez
// com o banco do celular no lugar do SQLite. Os arquivos sao os mesmos.
const caminhoDb = path.join(DIR_MAIN, 'db', 'database.js');
const carregarOriginal = Module._load;
Module._load = function (pedido, pai) {
  if (pai && /src[\\/]main[\\/]services/.test(pai.filename) && /db[\\/]database$/.test(pedido)) {
    return bancoMobile;
  }
  return carregarOriginal.apply(this, arguments);
};

for (const m of ['services/agenda.js', 'services/templates.js', 'services/calendario.js']) {
  delete require.cache[require.resolve(path.join(DIR_MAIN, m))];
}
const agendaMobile = require(path.join(DIR_MAIN, 'services', 'agenda.js'));
Module._load = carregarOriginal;

ok('agenda.js reaproveitado sem alteração', typeof agendaMobile.montarFila === 'function');

/* ------------------------------------------------------------------ */
/* 3. Comparacao dia a dia                                             */
/* ------------------------------------------------------------------ */

console.log('\n== Mensagens: desktop x celular ==');

const DIAS = [
  ['2026-09-04', 'aniversários + iniciação + exaltação + casamento + fundação da UFR'],
  ['2026-09-07', 'Independência do Brasil + sessão Magna com pauta'],
  ['2026-09-14', 'sessão sem pauta'],
  ['2026-03-21', 'aniversário de sobrinha'],
  ['2026-12-25', 'Natal'],
  ['2026-06-04', 'Corpus Christi (data móvel)'],
  ['2026-05-10', 'Dia das Mães (2º domingo)'],
  ['2026-02-11', 'dia sem nenhum evento']
];

for (const [dia, descricao] of DIAS) {
  const a = agendaDesktop.montarFila(dia);
  const b = agendaMobile.montarFila(dia);

  const limpa = (f) => JSON.stringify({
    total: f.total,
    selecionados: f.total_selecionados,
    para_envio: f.total_para_envio,
    itens: f.itens.map((i) => ({
      tipo: i.tipo, nome: i.nome, evento: i.evento, anos: i.anos,
      titulo: i.titulo_pessoa, bloqueado: i.bloqueado, selecionado: i.selecionado,
      mensagem: i.mensagem
    })),
    unica: f.mensagem_unica
  });

  ok(`${dia} — ${descricao}`, limpa(a) === limpa(b),
    limpa(a) === limpa(b) ? '' : `desktop=${a.total} itens / celular=${b.total} itens`);
}

/* ------------------------------------------------------------------ */
/* 4. Regras de negocio preservadas no celular                         */
/* ------------------------------------------------------------------ */

console.log('\n== Regras preservadas ==');

const fila04 = agendaMobile.montarFila('2026-09-04');
ok('Adormecido não é comunicado',
  fila04.itens.filter((i) => /Adormecido/.test(i.nome || '') || /Adormecido/.test(i.obreiro_nome || ''))
    .every((i) => i.bloqueado === true));
ok('títulos maçônicos corretos',
  fila04.itens.some((i) => i.titulo_pessoa === 'Ir.∴') &&
  fila04.itens.some((i) => i.titulo_pessoa === 'Cunhada') &&
  fila04.itens.some((i) => i.titulo_pessoa === 'Sobrinho'));
const aniv = fila04.itens.find((i) => i.tipo === 'aniversario_obreiro' && /João Carlos/.test(i.nome));
ok('idade calculada igual', aniv && aniv.anos === 52, aniv ? String(aniv.anos) : 'não encontrado');
ok('nenhuma variável pendente', fila04.itens.every((i) => !/\{\{/.test(i.mensagem || '')));

const ordemDesktop = db.obreiros.listar({ somenteAtivos: true }).map((o) => o.nome);
const ordemMobile = bancoMobile.obreiros.listar({ somenteAtivos: true }).map((o) => o.nome);
ok('ordem alfabética idêntica (acentos incluídos)',
  JSON.stringify(ordemDesktop) === JSON.stringify(ordemMobile),
  ordemMobile.join(' | '));

const famDesktop = db.obreiros.listar({ somenteAtivos: true })[0].familiares.map((f) => f.nome);
const famMobile = bancoMobile.obreiros.listar({ somenteAtivos: true })[0].familiares.map((f) => f.nome);
ok('ordem dos familiares idêntica', JSON.stringify(famDesktop) === JSON.stringify(famMobile), famMobile.join(' | '));

console.log('\n== Modo agrupado ==');
db.config.salvar('agrupar_mensagens', '1');
const bancoMobile2 = dadosMobile.criarBanco(JSON.parse(fs.readFileSync(
  (backup.exportar(path.join(tmp, 'e2.ctrloja')), path.join(tmp, 'e2.ctrloja')), 'utf8')));

Module._load = function (pedido, pai) {
  if (pai && /src[\\/]main[\\/]services/.test(pai.filename) && /db[\\/]database$/.test(pedido)) {
    return bancoMobile2;
  }
  return carregarOriginal.apply(this, arguments);
};
for (const m of ['services/agenda.js', 'services/templates.js']) {
  delete require.cache[require.resolve(path.join(DIR_MAIN, m))];
}
const agendaMobile2 = require(path.join(DIR_MAIN, 'services', 'agenda.js'));
Module._load = carregarOriginal;

for (const dia of ['2026-09-04', '2026-09-07', '2026-09-14']) {
  const a = agendaDesktop.montarFila(dia);
  const b = agendaMobile2.montarFila(dia);
  ok(`agrupado ${dia}`, a.mensagem_unica === b.mensagem_unica,
    a.mensagem_unica === b.mensagem_unica ? '' : 'mensagem única diferente');
}
db.config.salvar('agrupar_mensagens', '0');

console.log('\n== Arquivo inválido é recusado ==');
try { dadosMobile.criarBanco({ qualquer: 'coisa' }); ok('recusa arquivo estranho', false); }
catch (e) { ok('recusa arquivo estranho', /não é um backup|inválido/i.test(e.message), e.message); }
try { dadosMobile.criarBanco(null); ok('recusa conteúdo vazio', false); }
catch (e) { ok('recusa conteúdo vazio', true); }

console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'CELULAR E DESKTOP GERAM EXATAMENTE AS MESMAS MENSAGENS'));
process.exit(falhas ? 1 : 0);
