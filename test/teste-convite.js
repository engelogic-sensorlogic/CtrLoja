'use strict';

/* ==================================================================
   Convite: como o Irmão instala o aplicativo no celular

   Não existe programa que se mande ao aparelho e instale o atalho
   sozinho. O que resolve é o QR Code: aponta-se a câmera, o navegador
   abre e ele mesmo oferece instalar.

   O teste cuida de duas coisas: que a folha e a mensagem digam o que
   precisam dizer, e — principalmente — que a SENHA DA LOJA nunca
   apareça em nenhuma das duas. Ela é combinada de viva voz; mandá-la
   junto do endereço anularia a razão de o pacote ser cifrado.

   Execute com:  node --no-warnings test/teste-convite.js
   ================================================================== */

const path = require('path');

const RAIZ = path.join(__dirname, '..');
const convite = require(path.join(RAIZ, 'src', 'main', 'services', 'convite-pdf.js'));

let falhas = 0;
const ok = (n, c, e = '') => {
  console.log((c ? '  OK  ' : 'FALHA ') + n + (e ? ' -> ' + e : ''));
  if (!c) falhas++;
};

const CFG = {
  loja_nome: 'A∴R∴L∴S∴ União Fraternal Rolandense nº 141',
  potencia: 'Grande Loja Maçônica do Estado do Paraná - GLP',
  oriente: 'Oriente de Rolândia - PR',
  rito: 'R∴E∴A∴A∴',
  cnpj: '09.221.964/0001-34'
};

const ENDERECO = 'https://engelogic-sensorlogic.github.io/CtrLoja/mobile/';

/* ------------------------------------------------------------------ */

console.log('== Convite para o grupo do WhatsApp ==');

const msg = convite.mensagem(CFG, ENDERECO);

ok('traz o nome da Loja', msg.includes('União Fraternal'));
ok('traz o endereço do aplicativo', msg.includes(ENDERECO));
ok('ensina a instalar na tela inicial', /Instalar aplicativo/.test(msg));
ok('ensina a sincronizar', /Buscar atualizações/.test(msg));
ok('diz que os dados ficam no aparelho', /apenas no seu aparelho/.test(msg));
ok('usa o endereço padrão quando nenhum é informado',
  convite.mensagem(CFG, null).includes(convite.ENDERECO_PADRAO));

console.log('\n== O que o convite NÃO pode conter ==');
ok('nenhuma senha escrita', !/senha da loja é|senha:|booz/i.test(msg));
ok('avisa que a senha é combinada em sessão', /combinada entre nós em sessão/.test(msg));
ok('sem dados de Irmão nenhum', !/Ir\.∴ [A-Z]/.test(msg));

/* ------------------------------------------------------------------ */

(async () => {
  console.log('\n== Folha de instalação (PDF) ==');

  const qr = await convite.gerarQr(ENDERECO);
  ok('gera a imagem do QR Code', /^data:image\/png;base64,/.test(qr));
  ok('QR de tamanho razoável para impressão', qr.length > 2000, Math.round(qr.length / 1024) + ' KB');

  const html = convite.montarHtml(ENDERECO, qr, CFG, {});

  ok('embute o QR na folha, sem depender de arquivo', html.includes(qr.slice(0, 60)));
  ok('mostra o endereço por extenso', html.includes(ENDERECO));
  ok('traz o nome da Loja', html.includes('União Fraternal'));
  ok('traz a potência e o oriente', /GLP/.test(html) && /Rolândia/.test(html));
  ok('traz os três passos numerados', (html.match(/class="n"/g) || []).length === 3);
  ok('manda apontar a câmera', /Aponte a câmera/.test(html));
  ok('cita o Chrome', /Chrome/.test(html));
  ok('define página A4', /@page[^}]*A4/.test(html));

  // O mesmo defeito que ja apareceu nos outros documentos
  ok('separador do cabeçalho não vaza como texto',
    !/&amp;middot;/.test(html) && /&middot;/.test(html));

  console.log('\n== A senha não vai impressa ==');
  ok('nenhuma senha na folha', !/booz/i.test(html));
  ok('explica que a senha não está ali', /não está escrita/.test(html));
  ok('escapa conteúdo do banco', !/<script/i.test(html));

  // Nome de Loja com caractere perigoso nao pode virar marcacao
  const htmlBravo = convite.montarHtml(ENDERECO, qr, { loja_nome: '<img src=x onerror=1>' }, {});
  ok('nome de Loja com HTML é escapado',
    htmlBravo.includes('&lt;img') && !htmlBravo.includes('<img src=x'));

  console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'CONVITE VALIDADO'));
  process.exit(falhas ? 1 : 0);
})().catch((err) => {
  console.error('\n[ERRO]', err && err.stack ? err.stack : err);
  process.exit(1);
});
