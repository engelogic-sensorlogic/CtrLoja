'use strict';

/* ==================================================================
   Publicar para o celular: o botão do aplicativo e o .bat

   O CtrLoja ganhou um botão "Publicar para o celular" para que ninguém
   precise abrir pasta nem linha de comando. O risco de ter dois
   caminhos é justamente esse: um dia divergirem, e o Irmão receber
   coisa diferente conforme o caminho escolhido.

   Este teste publica pelos DOIS e exige conteúdo idêntico.

   Execute com:  node --no-warnings test/teste-publicacao.js
   ================================================================== */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
const ok = (n, c, e = '') => {
  console.log((c ? '  OK  ' : 'FALHA ') + n + (e ? ' -> ' + e : ''));
  if (!c) falhas++;
};

const db = require(path.join(RAIZ, 'src', 'main', 'db', 'database.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publicacao-'));
db.init(tmp);

const backup = require(path.join(RAIZ, 'src', 'main', 'services', 'backup.js'));
const cripto = require(path.join(RAIZ, 'src', 'main', 'services', 'cripto.js'));
const publicador = require(path.join(RAIZ, 'ferramentas', 'publicar-dados.js'));

const SENHA = 'senha-de-teste-da-loja';

/* ------------------------------------------------------------------ */
/* Cenario                                                             */
/* ------------------------------------------------------------------ */

const o = db.obreiros.salvar({
  nome: 'João Carlos de Souza', tratamento: 'Ir.∴', grau: 'Mestre', situacao: 'Ativo',
  dt_nascimento: '1974-08-10'
});
db.familiares.salvar({ obreiro_id: o.id, parentesco: 'cunhada', nome: 'Maria Helena de Souza' });
db.sessoes.salvar({ data: '2026-08-10', grau: 'Mestre', tipo: 'Magna' });
db.presencas.registrarLista({
  sessao_data: '2026-08-10', origem: 'pc', itens: [{ obreiro_id: o.id, presente: true }]
});
db.grupos.sincronizar([{ id: '1@g.us', nome: 'Grupo Reservado da Loja' }]);
db.envios.registrar({ data_ref: '2026-08-10', evento_tipo: 'x', mensagem: 'envio antigo', status: 'enviado' });
db.config.salvarVarias({
  cnpj: '09.221.964/0001-34',
  senha_cargo_chancelaria: JSON.stringify(cripto.hashSenhaCargo('chanceler-da-ufr-141'))
});

/* ------------------------------------------------------------------ */
/* 1. O botao: publica direto da memoria, sem arquivo em claro         */
/* ------------------------------------------------------------------ */

console.log('== Botão "Publicar para o celular" ==');

const destinoBotao = path.join(tmp, 'pelo-botao');
const r = publicador.publicar({ pacoteBruto: backup.montar(), senha: SENHA, destino: destinoBotao });

ok('gerou o pacote e o arquivo de versão',
  fs.existsSync(path.join(destinoBotao, 'agenda.enc'))
  && fs.existsSync(path.join(destinoBotao, 'versao.json')));
ok('primeira publicação é a versão 1', r.versao === 1, String(r.versao));
ok('informa os cargos protegidos', r.protegidos.join() === 'chancelaria', r.protegidos.join());
ok('informa o que foi publicado', 'obreiros' in r.resumo && 'presencas' in r.resumo);

console.log('\n== O que NÃO sai do computador ==');
const bruto = fs.readFileSync(path.join(destinoBotao, 'agenda.enc'), 'utf8');
ok('nome do Irmão não aparece em claro', !bruto.includes('João Carlos'));
ok('nome da Cunhada não aparece em claro', !bruto.includes('Maria Helena'));
ok('grupo do WhatsApp não foi publicado', !('grupos' in r.resumo) && !bruto.includes('Grupo Reservado'));
ok('histórico de envios não foi publicado', !('envios_log' in r.resumo) && !bruto.includes('envio antigo'));

const aberto = cripto.decifrar(JSON.parse(bruto), SENHA);
ok('abre de volta com a senha da Loja', aberto.dados.obreiros[0].nome === 'João Carlos de Souza');
ok('as presenças foram junto', (aberto.dados.presencas || []).length === 1);
const chaves = (aberto.dados.config || []).map((c) => c.chave);
ok('CNPJ ficou no computador', !chaves.includes('cnpj'));
ok('impressão da senha do cargo foi publicada', chaves.includes('senha_cargo_chancelaria'));
ok('a senha do cargo não viaja em texto', !bruto.includes('chanceler-da-ufr-141')
  && !JSON.stringify(aberto).includes('chanceler-da-ufr-141'));

const r2 = publicador.publicar({ pacoteBruto: backup.montar(), senha: SENHA, destino: destinoBotao });
ok('publicar de novo incrementa a versão', r2.versao === 2, String(r2.versao));
ok('cada publicação gera cifra nova',
  fs.readFileSync(path.join(destinoBotao, 'agenda.enc'), 'utf8') !== bruto);

/* ------------------------------------------------------------------ */
/* 2. O .bat: mesmo resultado, outro caminho                           */
/* ------------------------------------------------------------------ */

console.log('\n== O botão e o publicar-dados.bat concordam ==');

const destinoBat = path.join(tmp, 'pelo-bat');
const backupArq = path.join(tmp, 'origem.ctrloja');
backup.exportar(backupArq);

execFileSync(process.execPath, [
  path.join(RAIZ, 'ferramentas', 'publicar-dados.js'), backupArq, '--destino', destinoBat
], { cwd: RAIZ, env: { ...process.env, CTRLOJA_SENHA: SENHA }, stdio: 'pipe' });

const vBotao = JSON.parse(fs.readFileSync(path.join(destinoBotao, 'versao.json'), 'utf8'));
const vBat = JSON.parse(fs.readFileSync(path.join(destinoBat, 'versao.json'), 'utf8'));

ok('mesmo formato de versao.json',
  Object.keys(vBotao).join() === Object.keys(vBat).join(), Object.keys(vBat).join());
ok('mesmos cargos declarados', JSON.stringify(vBotao.cargos) === JSON.stringify(vBat.cargos));

const abertoBotao = cripto.decifrar(JSON.parse(fs.readFileSync(path.join(destinoBotao, 'agenda.enc'), 'utf8')), SENHA);
const abertoBat = cripto.decifrar(JSON.parse(fs.readFileSync(path.join(destinoBat, 'agenda.enc'), 'utf8')), SENHA);

// A hora da geração muda a cada chamada; o resto tem de ser igual.
delete abertoBotao.gerado_em;
delete abertoBat.gerado_em;
ok('MESMO conteúdo publicado pelos dois caminhos',
  JSON.stringify(abertoBotao) === JSON.stringify(abertoBat));
ok('mesmas tabelas nos dois',
  Object.keys(abertoBotao.dados).join() === Object.keys(abertoBat.dados).join(),
  Object.keys(abertoBat.dados).join());

/* ------------------------------------------------------------------ */
/* 3. Recusas                                                          */
/* ------------------------------------------------------------------ */

console.log('\n== Recusas ==');

try {
  publicador.publicar({ pacoteBruto: backup.montar(), senha: 'abc', destino: destinoBotao });
  ok('recusa senha curta demais', false);
} catch (e) {
  ok('recusa senha curta demais', /4 caracteres/.test(e.message));
}

try {
  publicador.publicar({ pacoteBruto: backup.montar(), senha: '', destino: destinoBotao });
  ok('recusa senha vazia', false);
} catch (e) {
  ok('recusa senha vazia', /senha/i.test(e.message));
}

// Senha de cargo gravada fora do formato de impressao digital: nao publica
db.config.salvarVarias({ senha_cargo_tesouraria: 'senha-em-texto-puro' });
try {
  publicador.publicar({ pacoteBruto: backup.montar(), senha: SENHA, destino: destinoBotao });
  ok('recusa senha de cargo em texto puro', false);
} catch (e) {
  ok('recusa senha de cargo em texto puro', /impressão digital/i.test(e.message), e.message.split('\n')[0]);
}

console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'PUBLICAÇÃO PELO APLICATIVO VALIDADA'));
process.exit(falhas ? 1 : 0);
