'use strict';

/* ==================================================================
   Telas do aplicativo do celular

   Abre o index.html num navegador de mentira (jsdom) e percorre a
   interface como um Irmao faria:

     - Inicio e publico: mostra os eventos e a Agenda do Dia, mas NAO
       pode oferecer texto de mensagem nem botao de envio;
     - o Cargo com senha aparece trancado;
     - a senha certa destrava, a errada nao;
     - destravado, a Chancelaria oferece o disparo e o pedido.

   O teste so roda se o jsdom estiver disponivel. Nao e dependencia do
   programa: quando falta, avisa e passa adiante, sem reprovar o build.

   Execute com:  node --no-warnings test/teste-telas-celular.js
   ================================================================== */

const path = require('path');
const fs = require('fs');
const os = require('os');

const RAIZ = path.join(__dirname, '..');
const SENHA_CARGO = 'chanceler-da-ufr-141';

let falhas = 0;
const ok = (n, c, e = '') => {
  console.log((c ? '  OK  ' : 'FALHA ') + n + (e ? ' -> ' + e : ''));
  if (!c) falhas++;
};

/*
 * O jsdom sao centenas de arquivos. Lidos de unidade mapeada, ou por
 * VPN, o simples require leva minutos e parece travamento. Nessas
 * condicoes o teste se declara pulado em vez de segurar a bateria.
 */
if (process.env.CTRLOJA_SEM_JSDOM === '1') {
  console.log('\n[PULADO] Telas do celular — o projeto está em unidade de rede.');
  console.log('         Rode a bateria do disco local para incluir este teste.\n');
  process.exit(0);
}

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  try {
    ({ JSDOM } = require(path.join(os.tmpdir(), 'node_modules', 'jsdom')));
  } catch {
    console.log('\n[PULADO] jsdom não está instalado neste computador.');
    console.log('         Para rodar este teste:  npm install --no-save jsdom\n');
    process.exit(0);
  }
}

/* ------------------------------------------------------------------ */
/* 1. Pacote de dados, montado como o publicar-dados.js faria          */
/* ------------------------------------------------------------------ */

const db = require(path.join(RAIZ, 'src', 'main', 'db', 'database.js'));
const cripto = require(path.join(RAIZ, 'src', 'main', 'services', 'cripto.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telas-'));
db.init(tmp);

const o = db.obreiros.salvar({
  nome: 'João Carlos de Souza', tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Ativo',
  dt_nascimento: '1974-08-10', dt_iniciacao: '2014-08-10'
});
db.familiares.salvar({ obreiro_id: o.id, parentesco: 'cunhada', nome: 'Maria Helena de Souza', dt_nascimento: '1978-08-10' });

// Segundo Obreiro ativo e um Adormecido: a chamada tem de trazer dois
const o2 = db.obreiros.salvar({
  nome: 'Bento Ribeiro', tratamento: 'Ir.∴', grau: 'Aprendiz', situacao: 'Ativo',
  dt_nascimento: '1985-04-02'
});
db.obreiros.salvar({
  nome: 'Antônio Adormecido', tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Adormecido'
});

db.sessoes.salvar({
  data: '2026-08-10', grau: 'Aprendiz', tipo: 'Economica', hora: '20:00',
  agenda_dia: '1. Abertura dos trabalhos\n2. Leitura do balaústre\n3. Encerramento'
});
db.config.salvarVarias({
  senha_cargo_chancelaria: JSON.stringify(cripto.hashSenhaCargo(SENHA_CARGO))
});

// Uma sessão anterior já com chamada, para o relatório ter o que mostrar
db.sessoes.salvar({ data: '2026-08-03', grau: 'Aprendiz', tipo: 'Economica' });
db.presencas.registrarLista({
  sessao_data: '2026-08-03', origem: 'pc',
  itens: [{ obreiro_id: o.id, presente: true }, { obreiro_id: o2.id, presente: false }]
});

const arquivo = path.join(tmp, 'export.ctrloja');
require(path.join(RAIZ, 'src', 'main', 'services', 'backup.js')).exportar(arquivo);
const pacote = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

// Só o que o celular recebe de verdade
for (const fora of ['grupos', 'envios_log', 'controle_disparo']) delete pacote.dados[fora];

/* ------------------------------------------------------------------ */
/* 2. Navegador de mentira                                             */
/* ------------------------------------------------------------------ */

(async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, 'mobile', 'index.html'), 'utf8'), {
    url: 'https://exemplo.test/mobile/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });

  const janela = dom.window;

  // O que o navegador de verdade oferece e o jsdom não traz.
  // O crypto do jsdom é somente-leitura: substitui-se a propriedade.
  Object.defineProperty(janela, 'crypto', { value: globalThis.crypto, configurable: true });
  janela.TextEncoder = TextEncoder;
  janela.TextDecoder = TextDecoder;
  /* O núcleo busca os módulos do desktop por fetch. Aqui eles vêm do
     disco, que é o mesmo conteúdo que o servidor entregaria. Qualquer
     outro endereço (o pacote de dados, por exemplo) responde 404: o
     teste não fala com a rede. */
  janela.fetch = async (url) => {
    const alvo = path.join(RAIZ, 'mobile', String(url).split('?')[0]);
    const dentro = path.resolve(alvo).startsWith(path.resolve(RAIZ));
    if (!dentro || !fs.existsSync(alvo)) {
      return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
    }
    const conteudo = fs.readFileSync(alvo, 'utf8');
    return { ok: true, status: 200, text: async () => conteudo, json: async () => JSON.parse(conteudo) };
  };
  janela.localStorage.setItem('ctrloja.pacote', JSON.stringify(pacote));

  const carregar = (rel) => janela.eval(fs.readFileSync(path.join(RAIZ, 'mobile', rel), 'utf8'));
  for (const arq of ['js/cargos.js', 'js/cripto.js', 'js/dados.js', 'js/nucleo.js', 'js/app.js']) carregar(arq);

  janela.document.dispatchEvent(new janela.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 250));

  const doc = janela.document;
  const texto = () => doc.querySelector('#conteudo').textContent;
  const botoes = () => [...doc.querySelectorAll('#conteudo button')].map((b) => b.textContent.trim());
  const areas = () => [...doc.querySelectorAll('#cargos .cargo')].map((b) => b.textContent.trim());
  const abas = () => [...doc.querySelectorAll('#abas .aba')].map((b) => b.textContent.trim());
  const clicar = (el2) => el2.dispatchEvent(new janela.Event('click', { bubbles: true }));
  const clicarArea = (nome) => clicar([...doc.querySelectorAll('#cargos .cargo')].find((b) => b.textContent.includes(nome)));
  const clicarAba = (nome) => clicar([...doc.querySelectorAll('#abas .aba')].find((b) => b.textContent.trim() === nome));

  console.log('== Abertura ==');
  ok('dados guardados foram carregados', !!janela.document.querySelector('#cargos').children.length);
  ok('cabeçalho traz o nome da Loja',
    /Rolandense|CtrLoja/.test(doc.querySelector('#tituloLoja').textContent),
    doc.querySelector('#tituloLoja').textContent);
  ok('a barra abre em Início e mais quatro Cargos', areas().length === 5, areas().join(' | '));
  ok('Início vem selecionado', doc.querySelector('#cargos .cargo.ativo').textContent.includes('Início'));
  ok('Cargo com senha aparece com cadeado',
    areas().some((a) => a.includes('Chancelaria') && a.includes('🔒')), areas().join(' | '));

  /* ---- Início: só leitura ---- */

  console.log('\n== Início: aberto a todos, somente leitura ==');
  ok('abas de Início: Hoje, Próximos, Presença e Dados',
    abas().join() === 'Hoje,Próximos,Presença,Dados', abas().join(' | '));

  // Vai para o dia da sessão
  doc.querySelector('#conteudo input[type=date]').value = '2026-08-10';
  clicar(doc.querySelector('#conteudo input[type=date]'));
  doc.querySelector('#conteudo input[type=date]').dispatchEvent(new janela.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));

  ok('mostra os eventos do dia', /João Carlos|Maria Helena/.test(texto()));
  ok('mostra a Agenda do Dia da sessão',
    /Agenda do Dia/.test(texto()) && /Leitura do balaústre/.test(texto()));
  ok('mostra hora e local da sessão', /20:00/.test(texto()));

  ok('NÃO oferece botão de envio', !botoes().some((b) => /Enviar/i.test(b)), botoes().join(' | '));
  ok('NÃO oferece botão de copiar', !botoes().some((b) => /Copiar/i.test(b)));
  ok('NÃO mostra o texto pronto da mensagem', !doc.querySelector('#conteudo pre.mensagem'));

  clicarAba('Próximos');
  await new Promise((r) => setTimeout(r, 60));
  ok('Próximos lista os eventos do período', /Próximos 30 dias/.test(texto()));
  ok('Próximos também não oferece envio', !botoes().some((b) => /Enviar/i.test(b)));

  /* ---- Chancelaria: trancada ---- */

  console.log('\n== Chancelaria: trancada ==');
  clicarArea('Chancelaria');
  await new Promise((r) => setTimeout(r, 60));

  ok('apresenta o cadeado', !!doc.querySelector('#conteudo .cadeado'));
  ok('pede a senha do cargo', !!doc.querySelector('#conteudo input[type=password]'));
  ok('não exibe abas enquanto trancada', abas().length === 0);
  ok('nenhum dado de Irmão aparece na tela trancada', !/João Carlos/.test(texto()));

  const campo = doc.querySelector('#conteudo input[type=password]');
  const botaoDestravar = [...doc.querySelectorAll('#conteudo button')].find((b) => /Destravar/.test(b.textContent));

  campo.value = 'senha-errada-mesmo';
  clicar(botaoDestravar);
  await new Promise((r) => setTimeout(r, 400));
  ok('senha errada não destrava', !!doc.querySelector('#conteudo .cadeado'));

  doc.querySelector('#conteudo input[type=password]').value = SENHA_CARGO.toUpperCase();
  clicar([...doc.querySelectorAll('#conteudo button')].find((b) => /Destravar/.test(b.textContent)));
  await new Promise((r) => setTimeout(r, 500));

  /* ---- Chancelaria: destravada ---- */

  console.log('\n== Chancelaria: destravada ==');
  ok('a senha certa destrava', !doc.querySelector('#conteudo .cadeado'));
  ok('abas do cargo aparecem',
    abas().join() === 'Mensagens,Presença,Obreiros,Solicitar', abas().join(' | '));
  ok('o cadeado sai da barra',
    !areas().find((a) => a.includes('Chancelaria')).includes('🔒'));

  doc.querySelector('#conteudo input[type=date]').value = '2026-08-10';
  doc.querySelector('#conteudo input[type=date]').dispatchEvent(new janela.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));

  ok('agora sim mostra o texto pronto', !!doc.querySelector('#conteudo pre.mensagem'));
  ok('agora sim oferece o envio', botoes().some((b) => /Enviar/i.test(b)));
  ok('mensagem sem variável pendente',
    ![...doc.querySelectorAll('#conteudo pre.mensagem')].some((p) => /\{\{/.test(p.textContent)));

  clicarAba('Obreiros');
  await new Promise((r) => setTimeout(r, 60));
  ok('relação de Obreiros só dentro do cargo', /João Carlos de Souza/.test(texto()));

  /* ---- marcador: os blocos de presença vêm depois de Solicitar ---- */
  const presencaChancelaria = async () => {
  console.log('\n== Lista de presença (Chancelaria) ==');
  clicarAba('Presença');
  await new Promise((r) => setTimeout(r, 80));

  const marcas = [...doc.querySelectorAll('#conteudo input[type=checkbox]')];
  ok('uma caixa de marcação por Obreiro do quadro', marcas.length === 2, String(marcas.length));
  ok('Adormecido não entra na chamada', !/Antônio Adormecido/.test(texto()));
  ok('mostra a sessão escolhida', !!doc.querySelector('#conteudo .sessao-resumo'));
  ok('traz o contador de presentes', /presentes/.test(texto()));

  // A sessão pode abrir com chamada já registrada; parte-se de tudo limpo
  clicar([...doc.querySelectorAll('#conteudo button')].find((b) => /Desmarcar todos/.test(b.textContent)));
  await new Promise((r) => setTimeout(r, 40));
  ok('desmarcar todos zera o contador', /0 de 2 presentes/.test(texto()),
    (texto().match(/\d+ de \d+ presentes/) || [''])[0]);

  const marca = doc.querySelector('#conteudo input[type=checkbox]');
  marca.checked = true;
  marca.dispatchEvent(new janela.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 40));
  ok('contador acompanha a marcação', /1 de 2 presentes/.test(texto()),
    (texto().match(/\d+ de \d+ presentes/) || [''])[0]);
  ok('linha marcada fica destacada', !!doc.querySelector('#conteudo .chamada-item.presente'));

  clicar([...doc.querySelectorAll('#conteudo button')].find((b) => /Marcar todos/.test(b.textContent)));
  await new Promise((r) => setTimeout(r, 40));
  ok('marcar todos preenche a lista', /2 de 2 presentes/.test(texto()),
    (texto().match(/\d+ de \d+ presentes/) || [''])[0]);

  ok('oferece envio ao PC pelos dois caminhos',
    botoes().some((b) => /WhatsApp/.test(b)) && botoes().some((b) => /\.presenca/.test(b)),
    botoes().join(' | '));
  };

  const presencaPublica = async () => {
  console.log('\n== Relatório de presença (Início) ==');
  clicarArea('Início');
  await new Promise((r) => setTimeout(r, 60));
  clicarAba('Presença');
  await new Promise((r) => setTimeout(r, 80));

  ok('relatório desenha o gráfico', !!doc.querySelector('#conteudo svg.grafico'));
  ok('mostra a frequência dos Irmãos', /Frequência dos Irmãos/.test(texto()));
  ok('mostra a barra de proporção', !!doc.querySelector('#conteudo .barra-dentro'));
  ok('relatório NÃO permite marcar presença',
    !doc.querySelector('#conteudo input[type=checkbox]'));
  ok('relatório não oferece envio', !botoes().some((b) => /Enviar|WhatsApp/i.test(b)));
  };

  clicarAba('Solicitar');
  await new Promise((r) => setTimeout(r, 60));
  ok('formulário de pedido montado', !!doc.querySelector('#conteudo select') && !!doc.querySelector('#conteudo textarea'));

  const previa = doc.querySelector('#conteudo pre.mensagem');
  ok('prévia do pedido já vem preenchida', !!previa && /PEDIDO — CHANCELARIA/.test(previa.textContent),
    previa ? previa.textContent.split('\n')[0] : '');

  const detalhe = doc.querySelector('#conteudo textarea');
  detalhe.value = 'Incluir a data de casamento do Ir∴ Fulano.';
  detalhe.dispatchEvent(new janela.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  ok('prévia acompanha o que foi digitado',
    /Incluir a data de casamento/.test(doc.querySelector('#conteudo pre.mensagem').textContent));

  await presencaChancelaria();
  await presencaPublica();

  /* ---- Volta a Início ---- */

  console.log('\n== Volta para Início ==');
  clicarArea('Início');
  await new Promise((r) => setTimeout(r, 60));
  clicarAba('Hoje');
  await new Promise((r) => setTimeout(r, 60));
  ok('Início continua sem envio', !botoes().some((b) => /Enviar/i.test(b)));
  ok('Início continua sem texto de mensagem', !doc.querySelector('#conteudo pre.mensagem'));

  console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'TELAS DO CELULAR VALIDADAS'));
  process.exit(falhas ? 1 : 0);
})().catch((err) => {
  console.error('\n[ERRO]', err && err.stack ? err.stack : err);
  process.exit(1);
});
