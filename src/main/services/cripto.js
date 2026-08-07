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

/**
 * A senha da Loja e combinada de viva voz entre os Irmaos, entao nao faz
 * sentido cobrar exatidao de maiusculas nem tolerar espaco sobrando. A
 * normalizacao abaixo e IDENTICA a de mobile/js/cripto.js - qualquer
 * diferenca entre as duas impediria o celular de abrir o arquivo.
 */
function normalizarSenha(senha) {
  if (typeof senha !== 'string') throw new Error('Informe a senha da Loja.');
  const limpa = senha.trim().toLowerCase();
  if (limpa.length < 4) throw new Error('A senha precisa ter pelo menos 4 caracteres.');
  return limpa;
}

/** Senha curta ou previsivel: alerta, mas nao impede. A decisao e da Loja. */
function senhaFraca(senha) {
  const limpa = String(senha || '').trim().toLowerCase();
  return limpa.length < 10;
}

function derivarChave(senha, sal, iteracoes) {
  return crypto.pbkdf2Sync(Buffer.from(senha, 'utf8'), sal, iteracoes, 32, 'sha256');
}

/**
 * Cifra um objeto JavaScript.
 * @returns {object} envelope pronto para virar JSON e ser versionado no git
 */
function cifrar(objeto, senha) {
  const chaveTexto = normalizarSenha(senha);

  const sal = crypto.randomBytes(TAM_SAL);
  const iv = crypto.randomBytes(TAM_IV);
  const chave = derivarChave(chaveTexto, sal, ITERACOES);

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
  const chaveTexto = normalizarSenha(senha);

  const sal = Buffer.from(envelope.kdf.sal, 'base64');
  const iv = Buffer.from(envelope.cifra.iv, 'base64');
  const conteudo = Buffer.from(envelope.dados, 'base64');

  if (conteudo.length <= TAM_TAG) throw new Error('Arquivo cifrado incompleto.');

  const parte = conteudo.subarray(0, conteudo.length - TAM_TAG);
  const tag = conteudo.subarray(conteudo.length - TAM_TAG);

  const chave = derivarChave(chaveTexto, sal, envelope.kdf.iteracoes || ITERACOES);
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

/* ------------------------------------------------------------------ */
/*  Senhas dos Cargos                                                  */
/* ------------------------------------------------------------------ */
/*
 * A senha da Loja abre o pacote e TODOS os Irmaos a possuem. Ela nao
 * serve, portanto, para separar o que e de cada Cargo.
 *
 * Cada Cargo tem a sua senha, definida pelo Veneravel no computador. O
 * que viaja no pacote publicado NAO e a senha, e sim a sua impressao
 * digital: PBKDF2-SHA256 com sal proprio. Assim, mesmo um Irmao que
 * abriu o pacote com a senha da Loja - e portanto ve todo o conteudo -
 * nao consegue ler a senha de um Cargo que nao e o dele.
 *
 * Vale ser honesto sobre o alcance disto: os dados ja estao no aparelho
 * depois de sincronizados, entao a senha do Cargo e uma tranca da porta,
 * nao um cofre. Ela impede o uso indevido das funcoes do Cargo por quem
 * pega o celular, o que e exatamente o problema que se quer resolver.
 */

const FORMATO_SENHA = 'ctrloja-senha-cargo';

/**
 * Impressao digital de uma senha de Cargo, para guardar na configuracao.
 * @returns {object} envelope sem nada que permita recuperar a senha
 */
function hashSenhaCargo(senha) {
  const limpa = normalizarSenha(senha);
  const sal = crypto.randomBytes(TAM_SAL);
  const hash = crypto.pbkdf2Sync(Buffer.from(limpa, 'utf8'), sal, ITERACOES, 32, 'sha256');
  return {
    formato: FORMATO_SENHA,
    versao: 1,
    algoritmo: 'PBKDF2-SHA256',
    iteracoes: ITERACOES,
    sal: sal.toString('base64'),
    hash: hash.toString('base64')
  };
}

/** Confere a senha digitada contra a impressao guardada. */
function conferirSenhaCargo(envelope, senha) {
  if (!envelope || envelope.formato !== FORMATO_SENHA) return false;
  let limpa;
  try { limpa = normalizarSenha(senha); } catch { return false; }

  const sal = Buffer.from(envelope.sal, 'base64');
  const esperado = Buffer.from(envelope.hash, 'base64');
  const obtido = crypto.pbkdf2Sync(
    Buffer.from(limpa, 'utf8'), sal, envelope.iteracoes || ITERACOES, esperado.length, 'sha256'
  );
  // Comparacao de tempo constante: nao entrega, pelo relogio, quantos
  // caracteres iniciais estavam certos.
  return crypto.timingSafeEqual(obtido, esperado);
}

module.exports = {
  cifrar, decifrar, impressao, normalizarSenha, senhaFraca,
  hashSenhaCargo, conferirSenhaCargo,
  FORMATO, FORMATO_SENHA, VERSAO, ITERACOES
};
