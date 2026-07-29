'use strict';

/**
 * Modelos de mensagem de fabrica.
 * Todos podem ser editados na tela "Modelos de Mensagem" do aplicativo.
 * Variaveis disponiveis: ver src/main/services/templates.js
 */

module.exports = [
  {
    chave: 'aniversario_obreiro',
    titulo: 'Aniversario do Obreiro (Irmao)',
    descricao: 'Disparado na data de nascimento do Obreiro.',
    corpo:
`*{{loja}}*
_{{oriente}}_

{{saudacao}}, meus Irmãos!

Hoje o Grande Arquiteto do Universo nos concede a alegria de celebrar o aniversário natalício do nosso estimado {{titulo}} *{{nome}}*{{#idade}}, que completa {{idade}} anos{{/idade}}.

Que o G∴A∴D∴U∴ derrame sobre ele e sobre toda a sua família luz, saúde e paz, e que seus passos permaneçam firmes no caminho da Virtude.

Parabéns, meu Irmão! Receba o nosso Tríplice Fraternal Abraço.

*T∴F∴A∴*`
  },

  {
    chave: 'aniversario_cunhada',
    titulo: 'Aniversario da Cunhada (esposa do Obreiro)',
    descricao: 'Disparado na data de nascimento da esposa do Obreiro.',
    corpo:
`*{{loja}}*
_{{oriente}}_

{{saudacao}}, meus Irmãos!

Hoje é dia de festa: comemoramos o aniversário da nossa querida {{titulo}} *{{nome}}*{{#idade}}, que completa {{idade}} anos{{/idade}}, esposa do {{obreiro_titulo}} {{obreiro_nome}}.

Que o Grande Arquiteto do Universo a abençoe com saúde, alegria e realizações, retribuindo todo o carinho com que sustenta o nosso Irmão em sua jornada maçônica.

Parabéns, Cunhada! Nossos mais sinceros votos de felicidade.

*T∴F∴A∴*`
  },

  {
    chave: 'aniversario_sobrinho',
    titulo: 'Aniversario do Sobrinho (filho do Obreiro)',
    descricao: 'Disparado na data de nascimento do filho do Obreiro.',
    corpo:
`*{{loja}}*
_{{oriente}}_

{{saudacao}}, meus Irmãos!

Comemoramos hoje o aniversário do nosso {{titulo}} *{{nome}}*{{#idade}}, que completa {{idade}} anos{{/idade}}, filho do {{obreiro_titulo}} {{obreiro_nome}}.

Que o Grande Arquiteto do Universo o ilumine e o proteja sempre, e que este novo ano de vida seja repleto de saúde, estudos abençoados e muitas alegrias.

Parabéns, Sobrinho!

*T∴F∴A∴*`
  },

  {
    chave: 'aniversario_sobrinha',
    titulo: 'Aniversario da Sobrinha (filha do Obreiro)',
    descricao: 'Disparado na data de nascimento da filha do Obreiro.',
    corpo:
`*{{loja}}*
_{{oriente}}_

{{saudacao}}, meus Irmãos!

Comemoramos hoje o aniversário da nossa {{titulo}} *{{nome}}*{{#idade}}, que completa {{idade}} anos{{/idade}}, filha do {{obreiro_titulo}} {{obreiro_nome}}.

Que o Grande Arquiteto do Universo a ilumine e a proteja sempre, e que este novo ano de vida seja repleto de saúde, estudos abençoados e muitas alegrias.

Parabéns, Sobrinha!

*T∴F∴A∴*`
  },

  {
    chave: 'iniciacao',
    titulo: 'Aniversario de Iniciacao (Grau de Aprendiz)',
    descricao: 'Disparado na data de Iniciacao do Obreiro.',
    corpo:
`*{{loja}}*
_{{oriente}}_

Meus Irmãos,

Hoje celebramos {{anos_ordinal}} aniversário de Iniciação do {{titulo}} *{{nome}}*, ocorrida em {{data_evento}}.

Naquele dia ele deixou as trevas do mundo profano e recebeu a Luz, iniciando o desbaste da sua Pedra Bruta.

Parabéns, meu Irmão, pela caminhada e pela perseverança na Arte Real!

*T∴F∴A∴*`
  },

  {
    chave: 'elevacao',
    titulo: 'Aniversario de Elevacao (Grau de Companheiro)',
    descricao: 'Disparado na data de Elevacao do Obreiro.',
    corpo:
`*{{loja}}*
_{{oriente}}_

Meus Irmãos,

Hoje recordamos {{anos_ordinal}} aniversário de Elevação ao Grau de Companheiro do {{titulo}} *{{nome}}*, ocorrida em {{data_evento}}.

Que o estudo e o trabalho continuem conduzindo seus passos rumo ao aperfeiçoamento.

Parabéns, meu Irmão!

*T∴F∴A∴*`
  },

  {
    chave: 'exaltacao',
    titulo: 'Aniversario de Exaltacao (Grau de Mestre)',
    descricao: 'Disparado na data de Exaltacao do Obreiro.',
    corpo:
`*{{loja}}*
_{{oriente}}_

Meus Irmãos,

Hoje celebramos {{anos_ordinal}} aniversário de Exaltação ao Sublime Grau de Mestre Maçom do {{titulo}} *{{nome}}*, ocorrida em {{data_evento}}.

Que a Acácia permaneça sempre viva em seu coração e que sua Mestria siga edificando o Templo da Virtude.

Parabéns, meu Irmão!

*T∴F∴A∴*`
  },

  {
    chave: 'remissao',
    titulo: 'Aniversario de Remissao',
    descricao: 'Disparado na data de Remissao do Obreiro.',
    corpo:
`*{{loja}}*
_{{oriente}}_

Meus Irmãos,

Hoje registramos {{anos_ordinal}} aniversário da Remissão do {{titulo}} *{{nome}}*, concedida em {{data_evento}}, em justo reconhecimento aos anos de dedicação e serviço prestados à nossa Augusta e Respeitável Loja.

Nossa gratidão e nosso respeito, meu Irmão!

*T∴F∴A∴*`
  },

  {
    chave: 'casamento',
    titulo: 'Aniversario de Casamento',
    descricao: 'Disparado na data de casamento do Obreiro com a Cunhada.',
    corpo:
`*{{loja}}*
_{{oriente}}_

Meus Irmãos,

Hoje o {{titulo}} *{{nome}}* e a Cunhada *{{conjuge}}* comemoram {{anos_ordinal}} aniversário de casamento, celebrado em {{data_evento}}.

Que o Grande Arquiteto do Universo continue abençoando essa união com amor, harmonia e saúde por muitos anos.

Parabéns ao casal!

*T∴F∴A∴*`
  },

  {
    chave: 'feriado_religioso',
    titulo: 'Data Religiosa',
    descricao: 'Modelo para feriados e datas religiosas do calendario permanente.',
    corpo:
`*{{loja}}*
_{{oriente}}_

Meus Irmãos,

Hoje, {{data_extenso}}, celebramos *{{evento}}*.

{{descricao}}

Que a fé e a fraternidade que nos unem em torno do Livro da Lei nos inspirem neste dia.

*T∴F∴A∴*`
  },

  {
    chave: 'data_nacional',
    titulo: 'Data Comemorativa Nacional',
    descricao: 'Modelo para datas comemorativas e civicas nacionais.',
    corpo:
`*{{loja}}*
_{{oriente}}_

Meus Irmãos,

Hoje, {{data_extenso}}, o Brasil celebra *{{evento}}*.

{{descricao}}

Que os princípios da Liberdade, Igualdade e Fraternidade sigam orientando os nossos passos como cidadãos e como Maçons.

*T∴F∴A∴*`
  },

  {
    chave: 'efemeride',
    titulo: 'Efemeride Historica',
    descricao: 'Modelo para acontecimentos historicos em geral.',
    corpo:
`*{{loja}}*
_{{oriente}}_

📜 *EFEMÉRIDE - {{data_extenso}}*

*{{evento}}*{{#ano_origem}} ({{ano_origem}}){{/ano_origem}}

{{descricao}}

Conhecer a História é iluminar o presente.

*T∴F∴A∴*`
  },

  {
    chave: 'maconica',
    titulo: 'Data Historica da Ordem Maconica',
    descricao: 'Modelo para efemerides da Ordem Maconica.',
    corpo:
`*{{loja}}*
_{{oriente}}_

⚜️ *EFEMÉRIDE MAÇÔNICA - {{data_extenso}}*

*{{evento}}*{{#ano_origem}} ({{ano_origem}}){{/ano_origem}}

{{descricao}}

Que a memória da nossa Ordem fortaleça a Corrente de União que nos envolve.

*T∴F∴A∴*`
  },

  {
    chave: 'sessao',
    titulo: 'Sessao da Loja (Agenda da Loja)',
    descricao: 'Disparado no dia da sessao, com grau, tipo e ordem do dia.',
    corpo:
`*{{loja}}*
_{{oriente}}_

🏛️ *CONVOCAÇÃO — SESSÃO {{tipo_sessao}}*

Meus Irmãos,

Estão convocados para a Sessão *{{tipo_sessao}}* no *Grau de {{grau}}*, hoje, {{data_extenso}}{{#hora_sessao}}, às *{{hora_sessao}}*{{/hora_sessao}}.

{{#local_sessao}}📍 {{local_sessao}}{{/local_sessao}}

{{#agenda_dia}}*ORDEM DO DIA*
{{agenda_dia}}{{/agenda_dia}}

Contamos com a presença de todos.

*T∴F∴A∴*`
  },

  {
    chave: 'cabecalho_diario',
    titulo: 'Cabecalho do resumo diario (opcional)',
    descricao: 'Usado quando a opcao "agrupar eventos do dia em uma unica mensagem" esta ativa.',
    corpo:
`*{{loja}}*
_{{oriente}}_

📅 *AGENDA DE {{data_extenso}}*
`
  }
];
