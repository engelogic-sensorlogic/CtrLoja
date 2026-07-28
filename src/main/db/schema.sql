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

-- Controle para evitar disparo duplicado no mesmo dia ------------------
CREATE TABLE IF NOT EXISTS controle_disparo (
  data_ref        TEXT PRIMARY KEY,
  executado_em    TEXT,
  qtd_eventos     INTEGER,
  qtd_enviados    INTEGER
);
