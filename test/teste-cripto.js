'use strict';

/* ==================================================================
   Criptografia: o desktop cifra, o navegador decifra

   O teste exercita os DOIS lados de verdade:
     - src/main/services/cripto.js  usa o crypto do Node
     - mobile/js/cripto.js          usa a Web Crypto API

   O Node 22 expõe a mesma Web Crypto do navegador em globalThis.crypto,
   então o código do celular roda aqui sem adaptação.

   Execute com:  node --no-warnings test/teste-cripto.js
   ================================================================== */

const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const criptoDesktop = require(path.join(RAIZ, 'src', 'main', 'services', 'cripto.js'));

let falhas = 0;
const ok = (n, c, e = '') => {
  console.log((c ? '  OK  ' : 'FALHA ') + n + (e ? ' -> ' + e : ''));
  if (!c) falhas++;
};

/* Carrega o módulo do celular num contexto de "navegador" */
const self = { crypto: globalThis.crypto, TextEncoder, TextDecoder, atob };
vm.createContext(self);
self.self = self;
vm.runInContext(
  fs.readFileSync(path.join(RAIZ, 'mobile', 'js', 'cripto.js'), 'utf8'),
  self
);
const criptoMobile = self.CtrLojaCripto;

(async () => {
  console.log('== Módulos ==');
  ok('desktop expõe cifrar/decifrar',
    typeof criptoDesktop.cifrar === 'function' && typeof criptoDesktop.decifrar === 'function');
  ok('celular expõe decifrar', typeof criptoMobile.decifrar === 'function');
  ok('Web Crypto disponível no teste', criptoMobile.disponivel() === true);

  const SENHA = 'UniaoFraternal141';

  /* ---------------- ida e volta ---------------- */

  console.log('\n== Desktop cifra → celular decifra ==');

  const original = {
    formato: 'ctrloja-backup',
    gerado_em: new Date().toISOString(),
    dados: {
      obreiros: [
        { id: 1, nome: 'João Carlos de Souza', tratamento: 'Ir.∴', dt_nascimento: '1974-09-04' },
        { id: 2, nome: 'Álvaro de Andrade', tratamento: 'Ir.∴', dt_nascimento: '1990-03-21' }
      ],
      familiares: [{ id: 1, obreiro_id: 1, parentesco: 'cunhada', nome: 'Maria Helena' }],
      config: [{ chave: 'loja_nome', valor: 'A∴R∴L∴S∴ União Fraternal Rolandense nº 141' }]
    }
  };

  const envelope = criptoDesktop.cifrar(original, SENHA);

  ok('envelope tem o formato esperado', envelope.formato === 'ctrloja-cifrado' && envelope.versao === 1);
  ok('algoritmos declarados',
    envelope.kdf.algoritmo === 'PBKDF2-SHA256' && envelope.cifra.algoritmo === 'AES-256-GCM');
  ok('iterações conforme recomendação OWASP', envelope.kdf.iteracoes >= 310000, String(envelope.kdf.iteracoes));

  const texto = JSON.stringify(envelope);
  ok('nome do Irmão NÃO aparece em claro', texto.indexOf('João Carlos') === -1);
  ok('nome da Loja NÃO aparece em claro', texto.indexOf('União Fraternal') === -1);
  ok('nenhum dado legível no arquivo', !/Maria Helena|Álvaro|1974-09-04/.test(texto));

  const aberto = await criptoMobile.decifrar(envelope, SENHA);
  ok('celular recuperou o conteúdo íntegro', JSON.stringify(aberto) === JSON.stringify(original));
  ok('acentos e sinais maçônicos preservados',
    aberto.dados.config[0].valor === original.dados.config[0].valor,
    aberto.dados.config[0].valor);

  /* ---------------- volta pelo desktop ---------------- */

  console.log('\n== Desktop também decifra o que cifrou ==');
  const abertoDesktop = criptoDesktop.decifrar(envelope, SENHA);
  ok('ida e volta no desktop', JSON.stringify(abertoDesktop) === JSON.stringify(original));

  /* ---------------- senha errada ---------------- */

  console.log('\n== Senha errada é recusada ==');
  try {
    await criptoMobile.decifrar(envelope, 'senhaErrada123');
    ok('celular recusa senha errada', false);
  } catch (e) {
    ok('celular recusa senha errada', /Senha incorreta|corrompido/i.test(e.message), e.message);
  }
  try {
    criptoDesktop.decifrar(envelope, 'senhaErrada123');
    ok('desktop recusa senha errada', false);
  } catch (e) {
    ok('desktop recusa senha errada', /Senha incorreta|corrompido/i.test(e.message), e.message);
  }

  /* ---------------- adulteração ---------------- */

  console.log('\n== Arquivo adulterado é detectado ==');
  const adulterado = JSON.parse(JSON.stringify(envelope));
  const bytes = Buffer.from(adulterado.dados, 'base64');
  bytes[10] = bytes[10] ^ 0xFF;                      // vira um bit no meio do conteúdo
  adulterado.dados = bytes.toString('base64');
  try {
    await criptoMobile.decifrar(adulterado, SENHA);
    ok('celular detecta adulteração', false);
  } catch (e) {
    ok('celular detecta adulteração', /corrompido|incorreta/i.test(e.message));
  }
  try {
    criptoDesktop.decifrar(adulterado, SENHA);
    ok('desktop detecta adulteração', false);
  } catch (e) {
    ok('desktop detecta adulteração', /corrompido|incorreta/i.test(e.message));
  }

  /* ---------------- sal e IV nunca se repetem ---------------- */

  console.log('\n== Cada publicação gera material novo ==');
  const e1 = criptoDesktop.cifrar(original, SENHA);
  const e2 = criptoDesktop.cifrar(original, SENHA);
  ok('sal diferente a cada vez', e1.kdf.sal !== e2.kdf.sal);
  ok('IV diferente a cada vez', e1.cifra.iv !== e2.cifra.iv);
  ok('mesmo conteúdo gera cifras diferentes', e1.dados !== e2.dados);

  /* ---------------- validações ---------------- */

  console.log('\n== Validações ==');
  try { criptoDesktop.cifrar(original, 'abc'); ok('recusa senha curta demais', false); }
  catch (e) { ok('recusa senha curta demais', /4 caracteres/.test(e.message)); }

  try { await criptoMobile.decifrar({ formato: 'outra-coisa' }, SENHA); ok('recusa arquivo estranho', false); }
  catch (e) { ok('recusa arquivo estranho', /não é um pacote cifrado/i.test(e.message)); }

  try { await criptoMobile.decifrar(envelope, ''); ok('exige a senha', false); }
  catch (e) { ok('exige a senha', /4 caracteres|Informe a senha/i.test(e.message), e.message); }

  /* ---------------- senha da Loja: maiúsculas não importam ---------------- */

  console.log('\n== Senha combinada de viva voz ==');
  const envMisto = criptoDesktop.cifrar(original, '  Senha-Da-Loja  ');
  for (const variante of ['senha-da-loja', 'SENHA-DA-LOJA', 'Senha-Da-Loja', '   senha-da-loja   ']) {
    const p = await criptoMobile.decifrar(envMisto, variante);
    ok(`celular abre com "${variante.trim()}"`, p.dados.obreiros.length === 2);
  }
  ok('desktop e celular normalizam igual',
    criptoDesktop.normalizarSenha('  ABC-def  ') === criptoMobile.normalizarSenha('  ABC-def  '),
    criptoDesktop.normalizarSenha('  ABC-def  '));
  ok('senha curta é sinalizada como fraca', criptoDesktop.senhaFraca('booz') === true);
  ok('senha longa não é sinalizada', criptoDesktop.senhaFraca('booz-ufr-141-rolandia') === false);

  /* ---------------- senhas dos Cargos ---------------- */

  console.log('\n== Senha de Cargo: o computador define, o celular confere ==');

  const envCargo = criptoDesktop.hashSenhaCargo('  Chanceler-UFR-141  ');
  const textoCargo = JSON.stringify(envCargo);

  ok('formato declarado', envCargo.formato === 'ctrloja-senha-cargo' && envCargo.versao === 1);
  ok('mesmo algoritmo do pacote',
    envCargo.algoritmo === 'PBKDF2-SHA256' && envCargo.iteracoes >= 310000);
  ok('a senha NAO aparece na impressão digital',
    !/chanceler/i.test(textoCargo) && !/141/.test(textoCargo.replace(/"iteracoes":\d+/, '')));
  ok('sal diferente a cada definição',
    criptoDesktop.hashSenhaCargo('mesma-senha').sal !== criptoDesktop.hashSenhaCargo('mesma-senha').sal);

  ok('desktop aceita a senha certa', criptoDesktop.conferirSenhaCargo(envCargo, 'chanceler-ufr-141') === true);
  ok('desktop recusa a senha errada', criptoDesktop.conferirSenhaCargo(envCargo, 'chanceler-ufr-142') === false);
  ok('desktop recusa senha vazia', criptoDesktop.conferirSenhaCargo(envCargo, '') === false);
  ok('desktop recusa envelope estranho',
    criptoDesktop.conferirSenhaCargo({ formato: 'outra-coisa' }, 'chanceler-ufr-141') === false);

  for (const variante of ['chanceler-ufr-141', 'CHANCELER-UFR-141', '  Chanceler-UFR-141 ']) {
    ok(`celular aceita "${variante.trim()}"`, await criptoMobile.conferirSenhaCargo(envCargo, variante) === true);
  }
  ok('celular recusa a senha errada', await criptoMobile.conferirSenhaCargo(envCargo, 'outra-senha') === false);
  ok('celular recusa senha vazia', await criptoMobile.conferirSenhaCargo(envCargo, '') === false);
  ok('celular recusa envelope nulo', await criptoMobile.conferirSenhaCargo(null, 'x') === false);

  // Um Cargo nao pode ser aberto com a senha de outro
  const envOutro = criptoDesktop.hashSenhaCargo('tesouraria-141');
  ok('senha de um Cargo não abre outro',
    await criptoMobile.conferirSenhaCargo(envOutro, 'chanceler-ufr-141') === false);

  // A senha da Loja tambem nao serve de atalho
  ok('senha da Loja não abre o Cargo',
    await criptoMobile.conferirSenhaCargo(envCargo, SENHA) === false);

  const tCargo = Date.now();
  await criptoMobile.conferirSenhaCargo(envCargo, 'tentativa-errada');
  ok('conferência em tempo aceitável no celular', Date.now() - tCargo < 3000, (Date.now() - tCargo) + ' ms');

  /* ---------------- impressão digital ---------------- */

  console.log('\n== Impressão digital (detecta novidade) ==');
  const h1 = criptoDesktop.impressao(JSON.stringify(original));
  const h2 = await criptoMobile.impressao(JSON.stringify(original));
  ok('desktop e celular calculam a mesma impressão', h1 === h2, h1.slice(0, 16) + '…');
  const h3 = criptoDesktop.impressao(JSON.stringify({ ...original, extra: 1 }));
  ok('conteúdo diferente muda a impressão', h1 !== h3);

  /* ---------------- volume real ---------------- */

  console.log('\n== Desempenho com uma Loja inteira ==');
  const grande = { formato: 'ctrloja-backup', dados: { obreiros: [], familiares: [] } };
  for (let i = 0; i < 80; i++) {
    grande.dados.obreiros.push({
      id: i, nome: `Irmão de Teste Número ${i}`, tratamento: 'Ir.∴',
      dt_nascimento: '1970-01-01', dt_iniciacao: '2010-01-01', observacoes: 'x'.repeat(200)
    });
    grande.dados.familiares.push({ id: i, obreiro_id: i, parentesco: 'cunhada', nome: `Cunhada ${i}` });
  }
  let t = Date.now();
  const envGrande = criptoDesktop.cifrar(grande, SENHA);
  const tCifra = Date.now() - t;
  t = Date.now();
  const abertoGrande = await criptoMobile.decifrar(envGrande, SENHA);
  const tDecifra = Date.now() - t;

  ok('80 obreiros: ida e volta correta',
    abertoGrande.dados.obreiros.length === 80 && abertoGrande.dados.obreiros[79].nome === 'Irmão de Teste Número 79');
  console.log(`      cifrar: ${tCifra} ms | decifrar: ${tDecifra} ms | arquivo: ${Math.round(JSON.stringify(envGrande).length / 1024)} KB`);
  ok('tempo aceitável para um celular', tDecifra < 3000, tDecifra + ' ms');

  console.log('\n' + (falhas ? ('FALHAS: ' + falhas) : 'CRIPTOGRAFIA VALIDADA NOS DOIS LADOS'));
  process.exit(falhas ? 1 : 0);
})();
