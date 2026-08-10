/* ==================================================================
   CtrLoja Mobile - areas do aplicativo
   ==================================================================

   O aplicativo e distribuido a TODOS os Irmaos da Loja, e por isso se
   divide em dois niveis:

     INICIO      aberto, somente leitura. Todo Irmao ve os eventos do
                 dia, a agenda da Loja e os proximos acontecimentos.
                 Nao ha texto de mensagem nem botao de envio aqui.

     CARGOS      protegidos por senha propria, uma para cada. Dentro do
                 Cargo estao as funcoes de trabalho: disparar mensagens
                 pelo WhatsApp e solicitar inclusao de informacoes.

   A senha da Loja - a que abre o pacote sincronizado - todos possuem,
   entao ela nao serve para separar Cargos. Cada Cargo tem a sua,
   definida no CtrLoja do computador em Configuracoes -> Senhas dos
   Cargos. O que viaja no pacote e so a impressao digital.

   Para ativar um Cargo: preencher "abas" e marcar disponivel: true. As
   tabelas que cada um leva ao celular sao declaradas do outro lado, em
   ferramentas/publicar-dados.js.
   ================================================================== */

(function (raiz) {
  'use strict';

  const AREAS = [
    {
      chave: 'inicio',
      nome: 'Início',
      icone: '🏛',
      descricao: 'Agenda da Loja, aberta a todos os Irmãos',
      publico: true,
      disponivel: true,
      abas: [
        { chave: 'hoje', nome: 'Hoje' },
        { chave: 'proximos', nome: 'Próximos' },
        { chave: 'presenca', nome: 'Presença' },
        { chave: 'financas', nome: 'Finanças' }
      ]
    },
    {
      chave: 'chancelaria',
      nome: 'Chancelaria',
      icone: '✉',
      descricao: 'Agenda, efemérides e mensagens da Loja',
      publico: false,
      disponivel: true,
      abas: [
        { chave: 'mensagens', nome: 'Mensagens' },
        { chave: 'chamada', nome: 'Presença' },
        { chave: 'obreiros', nome: 'Obreiros' },
        { chave: 'solicitar', nome: 'Solicitar' }
      ]
    },
    {
      chave: 'secretaria',
      nome: 'Secretaria',
      icone: '📋',
      descricao: 'Pauta das sessões, balaústres e correspondência',
      publico: false,
      disponivel: true,
      abas: [
        { chave: 'agenda', nome: 'Agenda da Loja' },
        { chave: 'obreiros', nome: 'Obreiros' },
        { chave: 'solicitar', nome: 'Solicitar' }
      ]
    },
    {
      chave: 'tesouraria',
      nome: 'Tesouraria',
      icone: '💰',
      descricao: 'Mensalidades, caixa e prestação de contas',
      publico: false,
      disponivel: true,
      // A area financeira que este cargo movimenta, declarada aqui para
      // que a tela seja a mesma da Hospitalaria, mudando so as
      // categorias - que vivem em src/main/services/financeiro.js.
      areaFinanceira: 'tesouraria',
      abas: [
        { chave: 'extrato', nome: 'Extrato Financeiro' },
        { chave: 'obreiros', nome: 'Obreiros' },
        { chave: 'solicitar', nome: 'Solicitar' }
      ]
    },
    {
      chave: 'hospitalaria',
      nome: 'Hospitalaria',
      icone: '🤝',
      descricao: 'Tronco de solidariedade e assistência aos Irmãos',
      publico: false,
      disponivel: true,
      areaFinanceira: 'hospitalaria',
      abas: [
        { chave: 'extrato', nome: 'Extrato Financeiro' },
        { chave: 'obreiros', nome: 'Obreiros' },
        { chave: 'solicitar', nome: 'Solicitar' }
      ]
    }
  ];

  // Presente em Inicio: sincronizacao e informacoes do aparelho. Fica na
  // area publica de proposito - todo Irmao precisa poder atualizar.
  const ABA_DADOS = { chave: 'dados', nome: 'Dados' };

  const PADRAO = AREAS[0];

  const obter = (chave) => AREAS.find((c) => c.chave === chave) || PADRAO;

  const abasDe = (chave) => {
    const area = obter(chave);
    if (area.publico) return area.abas.concat([ABA_DADOS]);
    return area.disponivel ? area.abas : [];
  };

  /** Chave da configuracao onde vive a impressao digital da senha. */
  const chaveSenha = (chave) => 'senha_cargo_' + chave;

  raiz.CtrLojaCargos = {
    lista: AREAS,
    obter,
    abasDe,
    chaveSenha,
    ABA_DADOS,
    PADRAO: PADRAO.chave
  };
}(typeof self !== 'undefined' ? self : this));
