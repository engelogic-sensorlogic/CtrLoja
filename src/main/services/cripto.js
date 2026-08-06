'use strict';

/**
 * Criptografia do pacote publicado.
 *
 * O arquivo com os dados da Loja vai para um repositorio publico. Ele
 * carrega nomes e datas de nascimento de Irmaos, Cunhadas e de filhos
 * menores - conteudo que nao pode ficar aberto na internet.
 *
 * Aqui o pacote e cifrado com AES-256-GCM, usando chave derivada de uma
 * senha por PBKDF2. O que sobe ao GitHub e texto embaralhado, inutil sem
 * a senha, que os Irmaos combinam pessoalmente.
 *
 * O MESMO formato e lido pelo navegador em mobile/js/cripto.js, usando a
 * Web Crypto API. O teste test/teste-cripto.js prova a ida e a volta.
 */

const crypto = require('crypto');

const FORMATO = 'ctrloja-cifrado';
const VERSAO = 1;

// Recomendacao do OWASP para PBKDF2-SHA256. Em um celular fica em torno
// de 0,2 s - incomodo aceitavel, ja que so ocorre ao sincronizar.
const ITERACOES = 310000;
const TAM_SAL = 16;
const TAM_IV = 12;      // padrao do GCM
const TAM_TAG = 16;

/* ------------------------------------------------------------------ */

function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }
  return senha;
}

function derivarChave(senha, sal, iteracoes) {
  return crypto.pbkdf2Sync(Buffer.from(senha, 'utf8'), sal, iteracoes, 32, 'sha256');
}

/**
 * Cifra um objeto JavaScript.
 * @returns {object} envelope pronto para virar JSON e ser versionado no git
 */
function cifrar(objeto, senha) {
  validarSenha(senha);

  const sal = crypto.randomBytes(TAM_SAL);
  const iv = crypto.randomBytes(TAM_IV);
  const chave = derivarChave(senha, sal, ITERACOES);

  const cifrador = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const texto = Buffer.from(JSON.stringify(objeto), 'utf8');
  const parte = Buffer.concat([cifrador.update(texto), cifrador.final()]);
  const tag = cifrador.getAuthTag();

  // O navegador espera o selo de autenticidade colado ao final do bloco,
  // que e como a Web Crypto API entrega e consome o AES-GCM.
  const conteudo = Buffer.concat([parte, tag]);

  return {
    formato: FORMATO,
    versao: VERSAO,
    kdf: {
      algoritmo: 'PBKDF2-SHA256',
      iteracoes: ITERACOES,
      sal: sal.toString('base64')
    },
    cifra: {
      algoritmo: 'AES-256-GCM',
      iv: iv.toString('base64')
    },
    dados: conteudo.toString('base64')
  };
}

/**
 * Decifra um envelope gerado por cifrar().
 * Lanca erro claro quando a senha esta errada ou o arquivo foi adulterado.
 */
function decifrar(envelope, senha) {
  if (!envelope || envelope.formato !== FORMATO) {
    throw new Error('Arquivo inválido: não é um pacote cifrado do CtrLoja.');
  }
  if (envelope.versao !== VERSAO) {
    throw new Error(`Versão de criptografia não suportada: ${envelope.versao}.`);
  }
  validarSenha(senha);

  const sal = Buffer.from(envelope.kdf.sal, 'base64');
  const iv = Buffer.from(envelope.cifra.iv, 'base64');
  const conteudo = Buffer.from(envelope.dados, 'base64');

  if (conteudo.length <= TAM_TAG) throw new Error('Arquivo cifrado incompleto.');

  const parte = conteudo.subarray(0, conteudo.length - TAM_TAG);
  const tag = conteudo.subarray(conteudo.length - TAM_TAG);

  const chave = derivarChave(senha, sal, envelope.kdf.iteracoes || ITERACOES);
  const decifrador = crypto.createDecipheriv('aes-256-gcm', chave, iv);
  decifrador.setAuthTag(tag);

  let texto;
  try {
    texto = Buffer.concat([decifrador.update(parte), decifrador.final()]);
  } catch {
    // O GCM nao distingue senha errada de arquivo alterado: em ambos os
    // casos o selo nao confere.
    throw new Error('Senha incorreta ou arquivo corrompido.');
  }

  return JSON.parse(texto.toString('utf8'));
}

/** Impressao digital do conteudo, para o celular saber se ha novidade. */
function impressao(texto) {
  return crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
}

module.exports = { cifrar, decifrar, impressao, FORMATO, VERSAO, ITERACOES };
