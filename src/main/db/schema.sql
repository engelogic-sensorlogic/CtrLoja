-- ===================================================================
-- CtrLoja - Esquema do banco de dados local (SQLite)
-- Loja Maconica Uniao Fraternal Rolandense - UFR / GLP
-- ===================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Obreiros (Irmaos) --------------------------------------------------
CREATE TABLE IF NOT EXISTS obreiros (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT    NOT NULL,
  tratamento      TEXT    DEFAULT 'Ir.∴',      -- Ir.'., Ven.'.Ir.'., M.'.I.'. etc.
  grau            TEXT    DEFAULT 'Mestre',    -- Aprendiz | Companheiro | Mestre
  cim             TEXT,                        -- Cadastro/CIM
  cargo           TEXT,                        -- Cargo atual na Loja
  situacao        TEXT    DEFAULT 'Ativo',     -- Ativo | Remido | Emerito | Licenciado | Falecido
  celular         TEXT,
  email           TEXT,
  dt_nascimento   TEXT,                        -- YYYY-MM-DD
  dt_iniciacao    TEXT,
  dt_elevacao     TEXT,
  dt_exaltacao    TEXT,
  dt_remissao     TEXT,
  dt_casamento    TEXT,
  observacoes     TEXT,
  ativo           INTEGER DEFAULT 1,
  criado_em       TEXT    DEFAULT (datetime('now','localtime')),
  atualizado_em   TEXT    DEFAULT (datetime('now','localtime'))
);

-- Familiares: Cunhada (esposa), Sobrinho / Sobrinha (filhos) ---------
CREATE TABLE IF NOT EXISTS familiares (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  obreiro_id      INTEGER NOT NULL REFERENCES obreiros(id) ON DELETE CASCADE,
  parentesco      TEXT    NOT NULL,            -- cunhada | sobrinho | sobrinha
  nome            TEXT    NOT NULL,
  dt_nascimento   TEXT,
  celular         TEXT,
  observacoes     TEXT,
  ativo           INTEGER DEFAULT 1,
  criado_em       TEXT    DEFAULT (datetime('now','localtime')),
  atualizado_em   TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_familiares_obreiro ON familiares(obreiro_id);

-- Calendario permanente ----------------------------------------------
CREATE TABLE IF NOT EXISTS datas_calendario (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chave           TEXT    UNIQUE,
  categoria       TEXT    NOT NULL,            -- feriado_religioso | data_nacional | efemeride | maconica
  titulo          TEXT    NOT NULL,
  descricao       TEXT,
  tipo            TEXT    NOT NULL DEFAULT 'fixa',  -- fixa | movel
  dia             INTEGER,
  mes             INTEGER,
  regra           TEXT,                        -- pascoa+60 | nth:2,0,5 (n-esima ocorrencia, diaSemana, mes)
  ano_origem      INTEGER,                     -- ano do fato historico (para "ha X anos")
  template_chave  TEXT,                        -- template especifico (opcional)
  enviar          INTEGER DEFAULT 1,           -- entra na fila de disparo?
  padrao          INTEGER DEFAULT 0,           -- item de fabrica
  ativo           INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_datas_mes_dia ON datas_calendario(mes, dia);

-- Modelos de mensagem -------------------------------------------------
CREATE TABLE IF NOT EXISTS templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chave           TEXT    UNIQUE NOT NULL,
  titulo          TEXT    NOT NULL,
  descricao       TEXT,
  corpo           TEXT    NOT NULL,
  padrao          INTEGER DEFAULT 0,
  ativo           INTEGER DEFAULT 1,
  atualizado_em   TEXT    DEFAULT (datetime('now','localtime'))
);

-- Grupos do WhatsApp --------------------------------------------------
CREATE TABLE IF NOT EXISTS grupos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id           TEXT    UNIQUE NOT NULL,     -- 1234567890-1234567890@g.us
  nome            TEXT    NOT NULL,
  selecionado     INTEGER DEFAULT 0,
  atualizado_em   TEXT    DEFAULT (datetime('now','localtime'))
);

-- Configuracoes -------------------------------------------------------
CREATE TABLE IF NOT EXISTS config (
  chave           TEXT PRIMARY KEY,
  valor           TEXT
);

-- Log de envios -------------------------------------------------------
CREATE TABLE IF NOT EXISTS envios_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  data_ref        TEXT,                        -- data do evento (YYYY-MM-DD)
  evento_tipo     TEXT,
  evento_titulo   TEXT,
  destino_id      TEXT,
  destino_nome    TEXT,
  mensagem        TEXT,
  status          TEXT,                        -- enviado | erro | cancelado
  erro            TEXT,
  enviado_em      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_envios_data ON envios_log(data_ref);

-- Agenda da Loja: sessoes -------------------------------------------
CREATE TABLE IF NOT EXISTS sessoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  data            TEXT    NOT NULL UNIQUE,     -- YYYY-MM-DD
  grau            TEXT    DEFAULT 'Aprendiz',  -- Aprendiz | Companheiro | Mestre
  tipo            TEXT    DEFAULT 'Economica', -- Economica | Magna
  agenda_dia      TEXT,                        -- ordem do dia / pauta
  hora            TEXT,                        -- vazio = usa o horario padrao da Loja
  local           TEXT,                        -- vazio = usa o Templo padrao
  especial        INTEGER DEFAULT 0,           -- 1 = data adicional fora do dia de sessao
  observacoes     TEXT,
  enviar          INTEGER DEFAULT 1,
  ativo           INTEGER DEFAULT 1,
  criado_em       TEXT    DEFAULT (datetime('now','localtime')),
  atualizado_em   TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sessoes_data ON sessoes(data);

-- Lista de presenca dos Obreiros nas sessoes --------------------------
-- Uma linha por Obreiro por sessao. A ausencia de linha significa que a
-- chamada daquela sessao ainda nao foi feita; presente = 0 e falta
-- registrada. A chave unica permite reenviar a mesma lista sem duplicar.
CREATE TABLE IF NOT EXISTS presencas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_data     TEXT    NOT NULL,             -- YYYY-MM-DD, casa com sessoes.data
  obreiro_id      INTEGER NOT NULL REFERENCES obreiros(id) ON DELETE CASCADE,
  presente        INTEGER DEFAULT 0,            -- 1 = presente | 0 = ausente
  origem          TEXT,                         -- celular | pc
  registrado_por  TEXT,                         -- quem fez a chamada
  registrado_em   TEXT    DEFAULT (datetime('now','localtime')),
  UNIQUE(sessao_data, obreiro_id)
);
CREATE INDEX IF NOT EXISTS idx_presencas_sessao ON presencas(sessao_data);
CREATE INDEX IF NOT EXISTS idx_presencas_obreiro ON presencas(obreiro_id);

-- Lancamentos financeiros: Tesouraria e Hospitalaria ------------------
-- Uma tabela so para as duas areas. Elas tem a mesma forma - entra
-- dinheiro, sai dinheiro, sobra um saldo - e o que muda sao os rotulos:
-- na Tesouraria sai como Despesa, na Hospitalaria como Doacao. Duas
-- tabelas iguais seriam duas oportunidades de divergir.
CREATE TABLE IF NOT EXISTS financeiro (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  area            TEXT    NOT NULL,          -- tesouraria | hospitalaria
  natureza        TEXT    NOT NULL,          -- receita | despesa | investimento | doacao
  categoria       TEXT,                      -- Mensalidade, Agapes, Tronco de Solidariedade...
  descricao       TEXT,
  valor           REAL    NOT NULL DEFAULT 0,
  data            TEXT    NOT NULL,          -- YYYY-MM-DD
  origem          TEXT,                      -- celular | pc
  registrado_por  TEXT,
  observacoes     TEXT,
  ativo           INTEGER DEFAULT 1,
  criado_em       TEXT    DEFAULT (datetime('now','localtime')),
  atualizado_em   TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_financeiro_area_data ON financeiro(area, data);
CREATE INDEX IF NOT EXISTS idx_financeiro_data ON financeiro(data);

-- Controle para evitar disparo duplicado no mesmo dia ------------------
CREATE TABLE IF NOT EXISTS controle_disparo (
  data_ref        TEXT PRIMARY KEY,
  executado_em    TEXT,
  qtd_eventos     INTEGER,
  qtd_enviados    INTEGER
);
