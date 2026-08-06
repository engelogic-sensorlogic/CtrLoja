/* ==================================================================
   CtrLoja Mobile - Cargos da Loja
   ==================================================================

   A navegacao do aplicativo se organiza por Cargo. Cada um declara aqui
   as suas abas; a interface se monta a partir desta lista.

   Hoje so a Chancelaria esta implementada - e ela concentra tudo o que
   foi construido ate agora. Secretaria, Tesouraria e Hospitalaria ja
   aparecem na barra, marcadas como em construcao, para que a estrutura
   nao precise ser remexida quando cada uma for entrando.

   Para ativar um cargo: preencher "abas" e marcar disponivel: true.
   As tabelas que cada cargo leva ao celular sao declaradas do outro
   lado, em ferramentas/publicar-dados.js.
   ================================================================== */

(function (raiz) {
  'use strict';

  const CARGOS = [
    {
      chave: 'chancelaria',
      nome: 'Chancelaria',
      icone: '✉',
      descricao: 'Agenda, efemérides e mensagens da Loja',
      disponivel: true,
      abas: [
        { chave: 'hoje', nome: 'Hoje' },
        { chave: 'proximos', nome: 'Próximos' },
        { chave: 'obreiros', nome: 'Obreiros' }
      ]
    },
    {
      chave: 'secretaria',
      nome: 'Secretaria',
      icone: '📋',
      descricao: 'Balaústres, presenças e correspondência',
      disponivel: false,
      abas: []
    },
    {
      chave: 'tesouraria',
      nome: 'Tesouraria',
      icone: '💰',
      descricao: 'Mensalidades, caixa e prestação de contas',
      disponivel: false,
      abas: []
    },
    {
      chave: 'hospitalaria',
      nome: 'Hospitalaria',
      icone: '🤝',
      descricao: 'Tronco de beneficência e assistência aos Irmãos',
      disponivel: false,
      abas: []
    }
  ];

  // Presente em todos os cargos: sincronização e informações do aparelho.
  const ABA_DADOS = { chave: 'dados', nome: 'Dados' };

  const obter = (chave) => CARGOS.find((c) => c.chave === chave) || CARGOS[0];

  const abasDe = (chave) => {
    const cargo = obter(chave);
    return cargo.disponivel ? cargo.abas.concat([ABA_DADOS]) : [ABA_DADOS];
  };

  raiz.CtrLojaCargos = { lista: CARGOS, obter, abasDe, ABA_DADOS };
}(typeof self !== 'undefined' ? self : this));
