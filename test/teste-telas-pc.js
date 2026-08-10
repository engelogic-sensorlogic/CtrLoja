'use strict';

/* ==================================================================
   Telas do CtrLoja do computador

   Os arquivos de src/renderer/js sao scripts CLASSICOS: todos dividem
   o mesmo escopo global. Um nome declarado duas vezes nao da erro em
   nenhum deles isoladamente - derruba a interface INTEIRA quando o
   navegador os carrega juntos, e a janela abre em branco.

   Este teste carrega os arquivos como o Electron carrega, monta as
   telas com um banco de mentira no lugar do IPC e confere o que cada
   uma apresenta.

   Precisa do jsdom. Sem ele, avisa e passa adiante sem reprovar.

   Execute com:  node --no-warnings test/teste-telas-pc.js
   ================================================================== */

const path = require('path');
const fs = require('fs');
const os = require('os');

const RAIZ = path.join(__dirname, '..');

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
  console.log('\n[PULADO] Telas do computador — o projeto está em unidade de rede.');
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
/* Banco de mentira no lugar do IPC                                    */
/* ------------------------------------------------------------------ */

const resp = (data) => Promise.resolve({ ok: true, data });

/* Canais que NAO devem mais ser chamados por tela nenhuma. Se alguem
   chamar, o erro estoura e o teste reprova - e assim descobrimos codigo
   morto que ficou para tras. */
const proibido = (nome) => () => { throw new Error(nome + ' não deveria mais ser chamado'); };

const api = {
  on: () => {},
  app: { info: () => resp({ versao: '1.0.0', raiz: 'Z:\\projeto' }), logos: () => resp({}), abrirPasta: () => resp({}) },
  config: { obter: () => resp({ loja_nome: 'A∴R∴L∴S∴ União Fraternal Rolandense nº 141', eventos_habilitados: '[]' }), salvar: () => resp({}) },
  cargos: { estado: () => resp([{ cargo: 'chancelaria', definida: true }]), definirSenha: () => resp({}) },
  publicacao: {
    estado: () => resp({
      pasta: 'Z:\\projeto\\mobile\\dados', projeto: 'Z:\\projeto',
      disponivel: true, temGit: true, ultima: null,
      protegidos: ['chancelaria'], resumo: { obreiros: 3 }
    })
  },
  whatsapp: { status: () => resp({ estado: 'desconectado' }) },
  presenca: {
    sessoes: () => resp([{
      data: '2026-08-10', grau: 'Mestre', tipo: 'Magna',
      rotulo: 'Sessão Magna no Grau de Mestre', tem_chamada: true
    }]),
    lista: () => resp({
      data: '2026-08-10', rotulo: 'Sessão Magna no Grau de Mestre',
      itens: [
        { obreiro_id: 1, nome: 'João Carlos de Souza', tratamento: 'Ir.∴', grau: 'Mestre', presente: true },
        { obreiro_id: 2, nome: 'Álvaro de Andrade', tratamento: 'Ir.∴', grau: 'Aprendiz', presente: false }
      ],
      total: 2, presentes: 1, ausentes: 1, percentual: 50, tem_chamada: true
    }),
    estatisticas: () => resp({
      sessoes: [{ data: '2026-08-10', grau: 'Mestre', tipo: 'Magna', rotulo: 'Sessão Magna', total: 2, presentes: 1, ausentes: 1, percentual: 50 }],
      obreiros: [{ obreiro_id: 1, nome: 'João Carlos de Souza', tratamento: 'Ir.∴', grau: 'Mestre', chamadas: 1, presencas: 1, faltas: 0, percentual: 100, ultima_presenca: '2026-08-10' }],
      total_sessoes: 1, media_presentes: 1, percentual_medio: 50,
      melhor: null, pior: null, ultima: null, quadro: 2
    })
  },
  financeiro: {
    areas: () => resp([
      {
        chave: 'tesouraria', nome: 'Tesouraria',
        naturezas: [
          { chave: 'receita', nome: 'Receita', sinal: 1, categorias: ['Mensalidade', 'Outros'] },
          { chave: 'despesa', nome: 'Despesa', sinal: -1, categorias: ['Ágapes', 'Luz', 'Outros'] },
          { chave: 'investimento', nome: 'Investimento', sinal: 0, categorias: ['Aplicação'] }
        ]
      },
      {
        chave: 'hospitalaria', nome: 'Hospitalaria',
        naturezas: [
          { chave: 'receita', nome: 'Receita', sinal: 1, categorias: ['Tronco de Solidariedade'] },
          { chave: 'doacao', nome: 'Doação', sinal: -1, categorias: ['Assistência a Irmão'] }
        ]
      }
    ]),
    extrato: () => resp({
      area: 'tesouraria', area_nome: 'Tesouraria', mes: '2026-08', mes_extenso: 'agosto de 2026',
      naturezas: [
        {
          chave: 'receita', nome: 'Receita', sinal: 1, total: 1550.5, quantidade: 1,
          itens: [{ id: 1, data: '2026-08-05', categoria: 'Mensalidade', descricao: '', valor: 1550.5, origem: 'pc' }],
          categorias: [{ categoria: 'Mensalidade', total: 1550.5, percentual: 100 }]
        },
        {
          chave: 'despesa', nome: 'Despesa', sinal: -1, total: 600.3, quantidade: 1,
          itens: [{ id: 2, data: '2026-08-10', categoria: 'Ágapes', descricao: '', valor: 600.3, origem: 'celular' }],
          categorias: [{ categoria: 'Ágapes', total: 600.3, percentual: 100 }]
        },
        { chave: 'investimento', nome: 'Investimento', sinal: 0, total: 0, quantidade: 0, itens: [], categorias: [] }
      ],
      total_lancamentos: 2, saldo: 950.2, acumulado: 950.2, investido: 0, tem_lancamento: true
    }),
    painel: () => resp({
      area: 'tesouraria', area_nome: 'Tesouraria',
      naturezas: [
        { chave: 'receita', nome: 'Receita', sinal: 1 },
        { chave: 'despesa', nome: 'Despesa', sinal: -1 },
        { chave: 'investimento', nome: 'Investimento', sinal: 0 }
      ],
      serie: [{ mes: '2026-08', mes_extenso: 'agosto de 2026', receita: 1550.5, despesa: 600.3, investimento: 0, saldo: 950.2, acumulado: 950.2 }],
      totais: { receita: 1550.5, despesa: 600.3, investimento: 0 },
      saldo_atual: 950.2, investido: 0, mes: '2026-08', mes_extenso: 'agosto de 2026',
      saldo_mes: 950.2, categorias: {}, tem_dados: true
    }),
    meses: () => resp(['2026-08']),
    salvar: () => resp({ lancamento: { area: 'tesouraria', data: '2026-08-05' } }),
    excluir: () => resp({})
  },

  // Retirados da tela de Configuracoes: ninguem mais pode chamar
  rotina: {
    diagnostico: proibido('rotina:diagnostico'),
    estado: proibido('rotina:estado'),
    log: proibido('rotina:log'),
    executar: proibido('rotina:executar'),
    verificar: proibido('rotina:verificar')
  }
};

/* ------------------------------------------------------------------ */
/* Carregamento                                                        */
/* ------------------------------------------------------------------ */

const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, 'src', 'renderer', 'index.html'), 'utf8'), {
  url: 'file:///app/', runScripts: 'outside-only', pretendToBeVisual: true
});
const janela = dom.window;
janela.api = api;

// A ordem e a mesma do index.html. O boot.js fica de fora: ele so
// dispara a navegacao inicial, que aqui nao interessa.
const ORDEM = ['app', 'dashboard', 'obreiros', 'agenda', 'sessoes', 'presenca',
  'financeiro', 'calendario', 'modelos', 'whatsapp', 'historico', 'config'];

/*
 * O renderizador não enxerga os módulos do processo principal, então o
 * piso da chamada aparece escrito nos dois lugares. Número repetido é
 * número que um dia diverge - e a tela passaria a oferecer datas que o
 * programa recusa na hora de gravar, sem explicação para o usuário.
 */
console.log('== Constantes repetidas entre processos ==');

const pisoServico = (fs.readFileSync(path.join(RAIZ, 'src', 'main', 'services', 'presenca.js'), 'utf8')
  .match(/DATA_MINIMA\s*=\s*'([^']+)'/) || [])[1];
const pisoTela = (fs.readFileSync(path.join(RAIZ, 'src', 'renderer', 'js', 'presenca.js'), 'utf8')
  .match(/DATA_MINIMA\s*=\s*'([^']+)'/) || [])[1];

ok('o serviço declara o piso da chamada', !!pisoServico, pisoServico);
ok('a tela declara o mesmo piso', pisoServico === pisoTela, `serviço ${pisoServico} · tela ${pisoTela}`);

console.log('\n== Carregamento dos arquivos da interface ==');

const declarados = new Map();
for (const nome of ORDEM) {
  const fonte = fs.readFileSync(path.join(RAIZ, 'src', 'renderer', 'js', nome + '.js'), 'utf8');
  for (const m of fonte.matchAll(/^(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (declarados.has(m[1])) {
      ok(`nome "${m[1]}" declarado duas vezes`, false, `${declarados.get(m[1])}.js e ${nome}.js`);
    }
    declarados.set(m[1], nome);
  }
}
ok('nenhum nome declarado em dois arquivos', falhas === 0, declarados.size + ' nomes no escopo global');

const fonteJunta = ORDEM
  .map((n) => fs.readFileSync(path.join(RAIZ, 'src', 'renderer', 'js', n + '.js'), 'utf8'))
  .join('\n;\n');

let App = null;
try {
  janela.eval(fonteJunta + '\n;window.__App = App;');
  App = janela.__App;
  ok('os arquivos carregam juntos, como no Electron', true);
} catch (err) {
  ok('os arquivos carregam juntos, como no Electron', false, err.message);
  console.log('\nFALHAS: ' + falhas);
  process.exit(1);
}

const telas = Object.keys(App.views);
const itensMenu = [...janela.document.querySelectorAll('.nav-item')].map((b) => b.dataset.view);

ok('todas as telas registradas', telas.length === 11, telas.join(', '));
ok('cada item do menu tem uma tela', itensMenu.every((v) => telas.includes(v)), itensMenu.join(', '));
ok('cada tela tem um item no menu', telas.every((v) => itensMenu.includes(v)));
ok('a tela Presença está no menu', itensMenu.includes('presenca'));
ok('a tela Financeiro está no menu', itensMenu.includes('financeiro'));

/* ------------------------------------------------------------------ */

const montar = async (nome) => {
  const alvo = janela.document.createElement('div');
  janela.document.body.appendChild(alvo);
  await App.views[nome].render(alvo);
  return alvo;
};

(async () => {
  /* ---------------- Configuracoes ---------------- */

  console.log('\n== Configurações ==');
  let alvo;
  try {
    alvo = await montar('config');
    ok('montou sem erro', true);
  } catch (err) {
    ok('montou sem erro', false, err.message);
    console.log('\nFALHAS: ' + falhas);
    process.exit(1);
  }

  const texto = alvo.textContent;

  ok('cartão "O disparo automático vai funcionar?" foi retirado', !/vai funcionar/i.test(texto));
  ok('cartão "Situação da rotina de disparo" foi retirado', !/Situação da rotina/i.test(texto));
  ok('nenhum canal de rotina foi chamado', true);   // teria lançado erro

  for (const secao of ['Identificação da Loja', 'Títulos maçônicos', 'Rotina de disparo',
    'Tipos de evento', 'Senhas dos Cargos', 'Publicar para o aplicativo do celular', 'Banco de dados']) {
    ok(`"${secao}" continua`, texto.includes(secao));
  }

  ok('diz em que pasta publica', /mobile.dados/.test(texto));
  ok('mostra quais cargos têm senha', /chancelaria/i.test(texto));

  /* ---------------- Presenca ---------------- */

  console.log('\n== Presença ==');
  try {
    alvo = await montar('presenca');
    ok('montou sem erro', true);
  } catch (err) {
    ok('montou sem erro', false, err.message);
  }

  const t2 = alvo.textContent;
  ok('traz a lista de chamada', /Lista de chamada/.test(t2));
  ok('traz o panorama da Loja', /Comparecimento ao longo do tempo/.test(t2));
  ok('traz a frequência dos Obreiros', /Frequência dos Obreiros/.test(t2));

  ok('botão do PDF da lista de presença', /Exportar PDF para arquivo/.test(t2));
  ok('botão do relatório para o mural', /Exportar relatório para o mural/.test(t2));
  ok('explica para que serve o relatório do mural', /afixar no mural/.test(t2));

  ok('desenha o gráfico de comparecimento', !!alvo.querySelector('svg'));
  ok('uma caixa de marcação por Obreiro',
    alvo.querySelectorAll('input[type=checkbox]').length === 2,
    String(alvo.querySelectorAll('input[type=checkbox]').length));

  /* ---------------- Financeiro ---------------- */

  console.log('\n== Financeiro ==');
  try {
    alvo = await montar('financeiro');
    ok('montou sem erro', true);
  } catch (err) {
    ok('montou sem erro', false, err.message);
  }

  const t3 = alvo.textContent;
  ok('oferece as duas áreas', /Tesouraria/.test(t3) && /Hospitalaria/.test(t3));
  ok('traz o formulário de lançamento', /Novo lançamento/.test(t3));
  ok('mostra o mês por extenso', /agosto de 2026/.test(t3));
  ok('mostra saldo e acumulado', /Saldo do mês/.test(t3) && /Acumulado/.test(t3));
  ok('formata em real', /R\$/.test(t3));
  ok('separa milhar e centavos', /1\.550,50/.test(t3), (t3.match(/R\$ [\d.,]+/g) || []).slice(0, 3).join(' '));
  ok('marca o que veio do celular', /celular/.test(t3));
  ok('desenha o gráfico de movimento', !!alvo.querySelector('svg'));
  ok('as categorias acompanham a natureza escolhida',
    alvo.querySelectorAll('select').length >= 2);

  console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'TELAS DO COMPUTADOR VALIDADAS'));
  process.exit(falhas ? 1 : 0);
})();
