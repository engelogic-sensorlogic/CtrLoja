/* ==================================================================
   CtrLoja Mobile - decifra o pacote publicado
   ==================================================================

   Le o mesmo envelope produzido por src/main/services/cripto.js, usando
   a Web Crypto API do navegador. A senha e digitada uma vez e a chave
   derivada fica guardada no aparelho.

   ATENCAO: crypto.subtle so existe em contexto seguro - HTTPS ou
   localhost. Servido por HTTP simples (endereco de IP na rede local) o
   navegador nao disponibiliza a API, e o aplicativo avisa em vez de
   falhar sem explicacao.
   ================================================================== */

(function (raiz) {
  'use strict';

  const FORMATO = 'ctrloja-cifrado';
  const VERSAO = 1;
  const TAM_TAG = 16;

  const disponivel = () => !!(raiz.crypto && raiz.crypto.subtle);

  /* A senha e combinada de viva voz na Loja: espaco sobrando e maiuscula
     nao podem atrapalhar. Esta normalizacao e IDENTICA a do desktop em
     src/main/services/cripto.js - se as duas divergirem, o arquivo nao
     abre no celular. O teste test/teste-cripto.js cobre isso. */
  function normalizarSenha(senha) {
    if (typeof senha !== 'string') throw new Error('Informe a senha da Loja.');
    const limpa = senha.trim().toLowerCase();
    if (limpa.length < 4) throw new Error('A senha precisa ter pelo menos 4 caracteres.');
    return limpa;
  }

  function paraBytes(b64) {
    const bruto = atob(b64);
    const saida = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
    return saida;
  }

  function exigirContextoSeguro() {
    if (disponivel()) return;
    throw new Error(
      'Este navegador não libera a criptografia porque a página não está em HTTPS.\n\n'
      + 'Abra o aplicativo pelo endereço publicado (https://…) em vez do endereço '
      + 'de IP da rede local.'
    );
  }

  /** Deriva a chave AES a partir da senha, no mesmo formato do desktop. */
  async function derivarChave(senha, sal, iteracoes) {
    const base = await raiz.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']
    );
    return raiz.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  }

  /**
   * Decifra o envelope e devolve o objeto original.
   * @param envelope objeto lido do arquivo .enc
   * @param senha    senha combinada entre os Irmãos
   */
  async function decifrar(envelope, senha) {
    exigirContextoSeguro();

    if (!envelope || envelope.formato !== FORMATO) {
      throw new Error('Arquivo inválido: não é um pacote cifrado do CtrLoja.');
    }
    if (envelope.versao !== VERSAO) {
      throw new Error(`Versão de criptografia não suportada: ${envelope.versao}.`);
    }
    const chaveTexto = normalizarSenha(senha);

    const sal = paraBytes(envelope.kdf.sal);
    const iv = paraBytes(envelope.cifra.iv);
    const conteudo = paraBytes(envelope.dados);

    if (conteudo.length <= TAM_TAG) throw new Error('Arquivo cifrado incompleto.');

    const chave = await derivarChave(chaveTexto, sal, envelope.kdf.iteracoes || 310000);

    let aberto;
    try {
      // A Web Crypto espera o selo de autenticidade no fim do bloco,
      // que e exatamente como o desktop grava.
      aberto = await raiz.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, chave, conteudo);
    } catch {
      throw new Error('Senha incorreta ou arquivo corrompido.');
    }

    return JSON.parse(new TextDecoder().decode(aberto));
  }

  /** Impressao digital, para comparar com a publicada e evitar baixar a toa. */
  async function impressao(texto) {
    exigirContextoSeguro();
    const bytes = new TextEncoder().encode(texto);
    const hash = await raiz.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /* ---------------- senhas dos Cargos ---------------- */
  /*
     A senha da Loja abre o pacote e todos os Irmaos a tem. Cada Cargo
     tem a sua, e o que viaja no pacote e apenas a impressao digital
     (PBKDF2-SHA256 com sal proprio) - nunca a senha. A conta feita aqui
     e a MESMA de src/main/services/cripto.js; test/teste-cripto.js prova
     que as duas concordam.
  */
  const FORMATO_SENHA = 'ctrloja-senha-cargo';

  async function derivarBits(senha, sal, iteracoes) {
    const base = await raiz.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']
    );
    return raiz.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' }, base, 256
    );
  }

  /** Confere a senha digitada contra a impressao publicada pelo computador. */
  async function conferirSenhaCargo(envelope, senha) {
    exigirContextoSeguro();
    if (!envelope || envelope.formato !== FORMATO_SENHA) return false;

    let limpa;
    try { limpa = normalizarSenha(senha); } catch { return false; }

    const sal = paraBytes(envelope.sal);
    const esperado = paraBytes(envelope.hash);
    const bits = new Uint8Array(await derivarBits(limpa, sal, envelope.iteracoes || 310000));

    if (bits.length !== esperado.length) return false;
    // Percorre tudo sempre, sem sair no primeiro byte diferente.
    let diferenca = 0;
    for (let i = 0; i < bits.length; i++) diferenca |= bits[i] ^ esperado[i];
    return diferenca === 0;
  }

  raiz.CtrLojaCripto = {
    decifrar, impressao, disponivel, normalizarSenha,
    conferirSenhaCargo, FORMATO, FORMATO_SENHA, VERSAO
  };
}(typeof self !== 'undefined' ? self : this));
