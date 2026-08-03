/* ==================================================================
   CtrLoja Mobile - carregador dos modulos do desktop
   ==================================================================

   Os arquivos calendario.js, templates.js e agenda.js sao escritos no
   formato CommonJS (require / module.exports), proprio do Node. O
   navegador nao entende esse formato.

   Em vez de manter copias adaptadas - que um dia divergiriam do
   desktop - este carregador busca os arquivos ORIGINAIS e os executa
   fornecendo um require() proprio. Assim o celular usa exatamente o
   mesmo codigo do computador, sem nenhuma copia.

   O require() devolve o banco somente leitura do celular quando o
   modulo pede '../db/database'.
   ================================================================== */

(function (raiz) {
  'use strict';

  const BASE = '../src/main/services/';

  // Ordem importa: cada modulo so pode ser carregado depois dos seus.
  const MODULOS = [
    { nome: 'calendario', arquivo: 'calendario.js' },
    { nome: 'templates', arquivo: 'templates.js' },
    { nome: 'agenda', arquivo: 'agenda.js' }
  ];

  let cacheFontes = null;

  async function baixarFontes() {
    if (cacheFontes) return cacheFontes;
    const fontes = {};
    for (const m of MODULOS) {
      const resp = await fetch(BASE + m.arquivo, { cache: 'no-cache' });
      if (!resp.ok) {
        throw new Error(`Não foi possível carregar ${m.arquivo} (${resp.status}). `
          + 'O aplicativo precisa ser servido junto da pasta src do CtrLoja.');
      }
      fontes[m.nome] = await resp.text();
    }
    cacheFontes = fontes;
    return fontes;
  }

  /**
   * Monta os modulos do desktop ligados ao banco informado.
   * @param banco objeto criado por CtrLojaDados.criarBanco()
   */
  async function montar(banco) {
    const fontes = await baixarFontes();
    const registro = {};

    const requerer = (pedido) => {
      if (/db\/database$/.test(pedido)) return banco;
      if (/\.\/calendario$/.test(pedido)) return registro.calendario;
      if (/\.\/templates$/.test(pedido)) return registro.templates;
      if (/\.\/agenda$/.test(pedido)) return registro.agenda;
      throw new Error(`Módulo não disponível no celular: ${pedido}`);
    };

    for (const m of MODULOS) {
      const module = { exports: {} };
      // eslint-disable-next-line no-new-func
      const executar = new Function('require', 'module', 'exports', fontes[m.nome]);
      executar(requerer, module, module.exports);
      registro[m.nome] = module.exports;
    }

    return registro;
  }

  raiz.CtrLojaNucleo = { montar: montar };
}(typeof self !== 'undefined' ? self : this));
