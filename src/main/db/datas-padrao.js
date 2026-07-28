'use strict';

/**
 * Calendario permanente do CtrLoja.
 *
 * tipo: 'fixa'  -> usa dia/mes
 *       'movel' -> usa regra:
 *                  'pascoa+N' / 'pascoa-N'  (N dias em relacao ao Domingo de Pascoa)
 *                  'nth:O,D,M'              (O-esima ocorrencia do dia-da-semana D no mes M;
 *                                            D: 0=domingo ... 6=sabado; O negativo = ultima)
 *
 * categoria: feriado_religioso | data_nacional | efemeride | maconica
 */

module.exports = [
  /* ================= FERIADOS E DATAS RELIGIOSAS ================= */
  { chave: 'rel_ano_novo_reis', categoria: 'feriado_religioso', titulo: 'Dia de Reis (Epifania do Senhor)', tipo: 'fixa', dia: 6, mes: 1 },
  { chave: 'rel_carnaval', categoria: 'feriado_religioso', titulo: 'Carnaval', tipo: 'movel', regra: 'pascoa-47' },
  { chave: 'rel_cinzas', categoria: 'feriado_religioso', titulo: 'Quarta-feira de Cinzas', tipo: 'movel', regra: 'pascoa-46' },
  { chave: 'rel_ramos', categoria: 'feriado_religioso', titulo: 'Domingo de Ramos', tipo: 'movel', regra: 'pascoa-7' },
  { chave: 'rel_sexta_santa', categoria: 'feriado_religioso', titulo: 'Sexta-feira da Paixao', tipo: 'movel', regra: 'pascoa-2' },
  { chave: 'rel_pascoa', categoria: 'feriado_religioso', titulo: 'Domingo de Pascoa', tipo: 'movel', regra: 'pascoa+0' },
  { chave: 'rel_ascensao', categoria: 'feriado_religioso', titulo: 'Ascensao do Senhor', tipo: 'movel', regra: 'pascoa+39' },
  { chave: 'rel_pentecostes', categoria: 'feriado_religioso', titulo: 'Pentecostes', tipo: 'movel', regra: 'pascoa+49' },
  { chave: 'rel_corpus_christi', categoria: 'feriado_religioso', titulo: 'Corpus Christi', tipo: 'movel', regra: 'pascoa+60' },
  { chave: 'rel_santo_antonio', categoria: 'feriado_religioso', titulo: 'Dia de Santo Antonio', tipo: 'fixa', dia: 13, mes: 6 },
  { chave: 'rel_sao_joao_batista', categoria: 'feriado_religioso', titulo: 'Dia de Sao Joao Batista', descricao: 'Padroeiro da Maconaria Universal.', tipo: 'fixa', dia: 24, mes: 6 },
  { chave: 'rel_sao_pedro', categoria: 'feriado_religioso', titulo: 'Dia de Sao Pedro', tipo: 'fixa', dia: 29, mes: 6 },
  { chave: 'rel_assuncao', categoria: 'feriado_religioso', titulo: 'Assuncao de Nossa Senhora', tipo: 'fixa', dia: 15, mes: 8 },
  { chave: 'rel_aparecida', categoria: 'feriado_religioso', titulo: 'Nossa Senhora Aparecida - Padroeira do Brasil', tipo: 'fixa', dia: 12, mes: 10 },
  { chave: 'rel_todos_santos', categoria: 'feriado_religioso', titulo: 'Dia de Todos os Santos', tipo: 'fixa', dia: 1, mes: 11 },
  { chave: 'rel_finados', categoria: 'feriado_religioso', titulo: 'Dia de Finados', tipo: 'fixa', dia: 2, mes: 11 },
  { chave: 'rel_imaculada', categoria: 'feriado_religioso', titulo: 'Imaculada Conceicao', tipo: 'fixa', dia: 8, mes: 12 },
  { chave: 'rel_natal', categoria: 'feriado_religioso', titulo: 'Natal do Senhor', tipo: 'fixa', dia: 25, mes: 12 },
  { chave: 'rel_sao_joao_evangelista', categoria: 'feriado_religioso', titulo: 'Dia de Sao Joao Evangelista', descricao: 'Padroeiro da Maconaria Universal.', tipo: 'fixa', dia: 27, mes: 12 },

  /* ================= DATAS NACIONAIS / COMEMORATIVAS ================= */
  { chave: 'nac_confraternizacao', categoria: 'data_nacional', titulo: 'Confraternizacao Universal - Ano Novo', tipo: 'fixa', dia: 1, mes: 1 },
  { chave: 'nac_mulher', categoria: 'data_nacional', titulo: 'Dia Internacional da Mulher', tipo: 'fixa', dia: 8, mes: 3 },
  { chave: 'nac_agua', categoria: 'data_nacional', titulo: 'Dia Mundial da Agua', tipo: 'fixa', dia: 22, mes: 3 },
  { chave: 'nac_tiradentes', categoria: 'data_nacional', titulo: 'Tiradentes', descricao: 'Martir da Inconfidencia Mineira.', ano_origem: 1792, tipo: 'fixa', dia: 21, mes: 4 },
  { chave: 'nac_descobrimento', categoria: 'data_nacional', titulo: 'Descobrimento do Brasil', ano_origem: 1500, tipo: 'fixa', dia: 22, mes: 4 },
  { chave: 'nac_trabalho', categoria: 'data_nacional', titulo: 'Dia do Trabalho', tipo: 'fixa', dia: 1, mes: 5 },
  { chave: 'nac_maes', categoria: 'data_nacional', titulo: 'Dia das Maes', tipo: 'movel', regra: 'nth:2,0,5' },
  { chave: 'nac_namorados', categoria: 'data_nacional', titulo: 'Dia dos Namorados', tipo: 'fixa', dia: 12, mes: 6 },
  { chave: 'nac_pais', categoria: 'data_nacional', titulo: 'Dia dos Pais', tipo: 'movel', regra: 'nth:2,0,8' },
  { chave: 'nac_independencia', categoria: 'data_nacional', titulo: 'Independencia do Brasil', ano_origem: 1822, tipo: 'fixa', dia: 7, mes: 9 },
  { chave: 'nac_arvore', categoria: 'data_nacional', titulo: 'Dia da Arvore', tipo: 'fixa', dia: 21, mes: 9 },
  { chave: 'nac_criancas', categoria: 'data_nacional', titulo: 'Dia das Criancas', tipo: 'fixa', dia: 12, mes: 10 },
  { chave: 'nac_professor', categoria: 'data_nacional', titulo: 'Dia do Professor', tipo: 'fixa', dia: 15, mes: 10 },
  { chave: 'nac_medico', categoria: 'data_nacional', titulo: 'Dia do Medico', tipo: 'fixa', dia: 18, mes: 10 },
  { chave: 'nac_republica', categoria: 'data_nacional', titulo: 'Proclamacao da Republica', ano_origem: 1889, tipo: 'fixa', dia: 15, mes: 11 },
  { chave: 'nac_bandeira', categoria: 'data_nacional', titulo: 'Dia da Bandeira', tipo: 'fixa', dia: 19, mes: 11 },
  { chave: 'nac_consciencia_negra', categoria: 'data_nacional', titulo: 'Dia da Consciencia Negra', tipo: 'fixa', dia: 20, mes: 11 },
  { chave: 'nac_reveillon', categoria: 'data_nacional', titulo: 'Ultimo dia do ano', tipo: 'fixa', dia: 31, mes: 12 },

  /* ================= EFEMERIDES HISTORICAS GERAIS ================= */
  { chave: 'efe_abolicao', categoria: 'efemeride', titulo: 'Abolicao da Escravatura no Brasil (Lei Aurea)', ano_origem: 1888, tipo: 'fixa', dia: 13, mes: 5 },
  { chave: 'efe_fim_2gm_europa', categoria: 'efemeride', titulo: 'Fim da Segunda Guerra Mundial na Europa', ano_origem: 1945, tipo: 'fixa', dia: 8, mes: 5 },
  { chave: 'efe_revolucao_francesa', categoria: 'efemeride', titulo: 'Revolucao Francesa - Queda da Bastilha', ano_origem: 1789, tipo: 'fixa', dia: 14, mes: 7 },
  { chave: 'efe_independencia_eua', categoria: 'efemeride', titulo: 'Independencia dos Estados Unidos da America', ano_origem: 1776, tipo: 'fixa', dia: 4, mes: 7 },
  { chave: 'efe_homem_lua', categoria: 'efemeride', titulo: 'Chegada do Homem a Lua', ano_origem: 1969, tipo: 'fixa', dia: 20, mes: 7 },
  { chave: 'efe_inicio_2gm', categoria: 'efemeride', titulo: 'Inicio da Segunda Guerra Mundial', ano_origem: 1939, tipo: 'fixa', dia: 1, mes: 9 },
  { chave: 'efe_onu', categoria: 'efemeride', titulo: 'Fundacao da Organizacao das Nacoes Unidas', ano_origem: 1945, tipo: 'fixa', dia: 24, mes: 10 },
  { chave: 'efe_muro_berlim', categoria: 'efemeride', titulo: 'Queda do Muro de Berlim', ano_origem: 1989, tipo: 'fixa', dia: 9, mes: 11 },
  { chave: 'efe_direitos_humanos', categoria: 'efemeride', titulo: 'Declaracao Universal dos Direitos Humanos', ano_origem: 1948, tipo: 'fixa', dia: 10, mes: 12 },
  { chave: 'efe_constituicao_1988', categoria: 'efemeride', titulo: 'Promulgacao da Constituicao Federal do Brasil', ano_origem: 1988, tipo: 'fixa', dia: 5, mes: 10 },

  /* ================= DATAS DA ORDEM MACONICA ================= */
  {
    chave: 'mac_glp_fundacao', categoria: 'maconica',
    titulo: 'Aniversario da Grande Loja Maconica do Estado do Parana - GLP',
    descricao: 'Fundada em 25 de janeiro de 1941, em Curitiba, sob o patrocinio das Lojas Emancipacao, Regeneracao e Libertacao.',
    ano_origem: 1941, tipo: 'fixa', dia: 25, mes: 1
  },
  {
    chave: 'mac_gob_fundacao', categoria: 'maconica',
    titulo: 'Fundacao do Grande Oriente do Brasil',
    descricao: 'Primeira Potencia Maconica brasileira, instalada em 17 de junho de 1822.',
    ano_origem: 1822, tipo: 'fixa', dia: 17, mes: 6
  },
  {
    chave: 'mac_grande_loja_londres', categoria: 'maconica',
    titulo: 'Fundacao da Grande Loja de Londres - Maconaria Especulativa',
    descricao: 'Em 24 de junho de 1717, quatro Lojas reunidas na taverna Goose and Gridiron fundaram a primeira Grande Loja, marco da Maconaria Especulativa moderna.',
    ano_origem: 1717, tipo: 'fixa', dia: 24, mes: 6
  },
  {
    chave: 'mac_dia_do_macom', categoria: 'maconica',
    titulo: 'Dia do Macom',
    descricao: 'Comemorado em 20 de agosto, em memoria da sessao historica de 20 de agosto de 1822, no Rio de Janeiro, quando Joaquim Goncalves Ledo defendeu a Independencia do Brasil.',
    ano_origem: 1822, tipo: 'fixa', dia: 20, mes: 8
  },
  {
    chave: 'mac_solsticio_verao', categoria: 'maconica',
    titulo: 'Solsticio de Verao (Hemisferio Sul) - Sao Joao de Verao',
    descricao: 'Festa solsticial dedicada a Sao Joao Evangelista no Hemisferio Sul.',
    tipo: 'fixa', dia: 21, mes: 12
  },
  {
    chave: 'mac_solsticio_inverno', categoria: 'maconica',
    titulo: 'Solsticio de Inverno (Hemisferio Sul) - Sao Joao de Inverno',
    descricao: 'Festa solsticial dedicada a Sao Joao Batista no Hemisferio Sul.',
    tipo: 'fixa', dia: 21, mes: 6
  },
  {
    chave: 'mac_anderson', categoria: 'maconica',
    titulo: 'Publicacao das Constituicoes de Anderson',
    descricao: 'Em 1723 foram publicadas as Constituicoes de Anderson, base legal da Maconaria moderna.',
    ano_origem: 1723, tipo: 'fixa', dia: 28, mes: 2
  },
  {
    chave: 'mac_cmsb', categoria: 'maconica',
    titulo: 'Fundacao da Confederacao da Maconaria Simbolica do Brasil - CMSB',
    descricao: 'Entidade que congrega as Grandes Lojas Estaduais do Brasil, entre elas a GLP.',
    ano_origem: 1966, tipo: 'fixa', dia: 21, mes: 5
  },
  {
    chave: 'mac_ufr_fundacao', categoria: 'maconica',
    titulo: 'Aniversario da A∴R∴L∴S∴ Uniao Fraternal Rolandense nº 141',
    descricao: 'Fundada em 4 de setembro de 2007, no Oriente de Rolandia - PR, jurisdicionada a Grande Loja Maconica do Estado do Parana, trabalhando no Rito Escoces Antigo e Aceito.',
    ano_origem: 2007, tipo: 'fixa', dia: 4, mes: 9
  }
];
