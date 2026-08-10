'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('./driver');

const DATAS_PADRAO = require('./datas-padrao');
const TEMPLATES_PADRAO = require('./templates-padrao');

let conn = null;
let dbPath = null;

const CONFIG_PADRAO = {
  loja_nome: 'A∴R∴L∴S∴ União Fraternal Rolandense nº 141',
  loja_sigla: 'UFR',
  loja_numero: '141',
  potencia: 'Grande Loja Maçônica do Estado do Paraná - GLP',
  oriente: 'Oriente de Rolândia - PR',
  rito: 'R∴E∴A∴A∴',
  fundacao_loja: '2007-09-04',
  dia_reuniao: 'Segunda-feira',
  hora_reuniao: '20:00',
  templo: 'Templo na Chácara Água Limpa — Estrada Rolândia / Caramuru',
  cnpj: '09.221.964/0001-34',
  titulo_obreiro: 'Ir.∴',
  titulo_cunhada: 'Cunhada',
  titulo_sobrinho: 'Sobrinho',
  titulo_sobrinha: 'Sobrinha',
  wa_autoconectar: '1',               // reconecta o WhatsApp ao abrir o app
  disparo_modo: 'revisao',            // revisao | automatico | manual
  disparo_hora: '07:30',
  disparo_dias: '1,2,3,4,5,6,0',      // dias da semana habilitados
  intervalo_envio_ms: '4000',         // pausa entre mensagens
  agrupar_mensagens: '0',             // 1 = uma unica mensagem por dia
  antecedencia_aviso: '7',            // dias de antecedencia no painel "proximos"
  eventos_habilitados: JSON.stringify([
    'aniversario_obreiro', 'aniversario_cunhada', 'aniversario_sobrinho', 'aniversario_sobrinha',
    'iniciacao', 'elevacao', 'exaltacao', 'remissao', 'casamento',
    'feriado_religioso', 'data_nacional', 'efemeride', 'maconica', 'sessao'
  ])
};

/* ------------------------------------------------------------------ */
/* Inicializacao                                                       */
/* ------------------------------------------------------------------ */

function init(userDataPath) {
  const pasta = path.join(userDataPath, 'dados');
  fs.mkdirSync(pasta, { recursive: true });
  dbPath = path.join(pasta, 'ctrloja.db');

  conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  conn.exec(schema);

  migrar();
  semearConfig();
  semearTemplates();
  semearDatas();

  return conn;
}

/** Ajustes de esquema/dados entre versoes do CtrLoja. */
function migrar() {
  // Situacao do Obreiro passou a ter apenas Ativo e Adormecido
  try {
    conn.prepare("UPDATE obreiros SET situacao = 'Adormecido' WHERE situacao IS NOT NULL AND situacao <> 'Ativo' AND situacao <> 'Adormecido'").run();
    conn.prepare("UPDATE obreiros SET situacao = 'Ativo' WHERE situacao IS NULL OR situacao = ''").run();
  } catch (err) {
    console.warn('[db] migração de situação:', err.message);
  }

  // Tipos de evento criados depois da instalacao precisam entrar na lista
  // ja gravada do usuario - o seed usa INSERT OR IGNORE e nao a atualizaria.
  try {
    const linha = conn.prepare("SELECT valor FROM config WHERE chave = 'eventos_habilitados'").get();
    if (linha && linha.valor) {
      const atuais = JSON.parse(linha.valor);
      if (Array.isArray(atuais)) {
        const novos = ['sessao'].filter((t) => !atuais.includes(t));
        if (novos.length) {
          conn.prepare("UPDATE config SET valor = ? WHERE chave = 'eventos_habilitados'")
            .run(JSON.stringify([...atuais, ...novos]));
          console.log(`[db] tipos de evento adicionados às configurações: ${novos.join(', ')}`);
        }
      }
    }
  } catch (err) {
    console.warn('[db] migração de eventos habilitados:', err.message);
  }

  // No resumo diario, a linha "AGENDA DE <data>" anuncia a pauta da Loja:
  // deve sair apenas quando existe sessao com Agenda do Dia preenchida.
  // Aqui a linha do modelo ja gravado passa a ser condicional.
  try {
    const t = conn.prepare("SELECT corpo FROM templates WHERE chave = 'cabecalho_diario'").get();
    if (t && t.corpo && /AGENDA DE/i.test(t.corpo) && !/\{\{#tem_pauta\}\}/.test(t.corpo)) {
      const novo = t.corpo.split('\n')
        .map((linha) => (/AGENDA DE/i.test(linha)
          ? `{{#tem_pauta}}${linha.trim()}{{/tem_pauta}}`
          : linha))
        .join('\n');
      conn.prepare("UPDATE templates SET corpo = ? WHERE chave = 'cabecalho_diario'").run(novo);
      console.log('[db] cabeçalho diário: linha "AGENDA DE" passou a depender da pauta do dia.');
    }
  } catch (err) {
    console.warn('[db] migração do cabeçalho diário:', err.message);
  }
}

function getConn() {
  if (!conn) throw new Error('Banco de dados nao inicializado.');
  return conn;
}

function getPath() {
  return dbPath;
}

/* ------------------------------------------------------------------ */
/* Seeds                                                               */
/* ------------------------------------------------------------------ */

function semearConfig() {
  const ins = conn.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
  const tx = conn.transaction(() => {
    for (const [k, v] of Object.entries(CONFIG_PADRAO)) ins.run(k, String(v));
  });
  tx();
}

function semearTemplates(forcar = false) {
  const ins = conn.prepare(`
    INSERT INTO templates (chave, titulo, descricao, corpo, padrao, ativo)
    VALUES (@chave, @titulo, @descricao, @corpo, 1, 1)
    ON CONFLICT(chave) DO UPDATE SET
      titulo = excluded.titulo,
      descricao = excluded.descricao,
      corpo = CASE WHEN @forcar = 1 THEN excluded.corpo ELSE templates.corpo END
  `);
  const tx = conn.transaction(() => {
    for (const t of TEMPLATES_PADRAO) {
      ins.run({ descricao: '', ...t, forcar: forcar ? 1 : 0 });
    }
  });
  tx();
}

function semearDatas(forcar = false) {
  const ins = conn.prepare(`
    INSERT INTO datas_calendario
      (chave, categoria, titulo, descricao, tipo, dia, mes, regra, ano_origem, enviar, padrao, ativo)
    VALUES
      (@chave, @categoria, @titulo, @descricao, @tipo, @dia, @mes, @regra, @ano_origem, @enviar, 1, 1)
    ON CONFLICT(chave) DO UPDATE SET
      categoria  = CASE WHEN @forcar = 1 THEN excluded.categoria  ELSE datas_calendario.categoria  END,
      titulo     = CASE WHEN @forcar = 1 THEN excluded.titulo     ELSE datas_calendario.titulo     END,
      descricao  = CASE WHEN @forcar = 1 THEN excluded.descricao  ELSE datas_calendario.descricao  END,
      tipo       = CASE WHEN @forcar = 1 THEN excluded.tipo       ELSE datas_calendario.tipo       END,
      dia        = CASE WHEN @forcar = 1 THEN excluded.dia        ELSE datas_calendario.dia        END,
      mes        = CASE WHEN @forcar = 1 THEN excluded.mes        ELSE datas_calendario.mes        END,
      regra      = CASE WHEN @forcar = 1 THEN excluded.regra      ELSE datas_calendario.regra      END,
      ano_origem = CASE WHEN @forcar = 1 THEN excluded.ano_origem ELSE datas_calendario.ano_origem END
  `);
  const tx = conn.transaction(() => {
    for (const d of DATAS_PADRAO) {
      ins.run({
        descricao: '', dia: null, mes: null, regra: null, ano_origem: null, enviar: 1,
        ...d,
        forcar: forcar ? 1 : 0
      });
    }
  });
  tx();
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

/* As configuracoes sao lidas a cada mensagem renderizada; manter em memoria
   evita centenas de consultas ao montar a agenda de um mes inteiro. */
let cacheConfig = null;

const config = {
  obterTodas() {
    if (!cacheConfig) {
      const linhas = getConn().prepare('SELECT chave, valor FROM config').all();
      cacheConfig = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
    }
    return { ...cacheConfig };
  },
  obter(chave, padrao = null) {
    const todas = config.obterTodas();
    return todas[chave] !== undefined ? todas[chave] : padrao;
  },
  salvar(chave, valor) {
    getConn()
      .prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      .run(chave, valor === null || valor === undefined ? '' : String(valor));
    cacheConfig = null;
  },
  invalidarCache() { cacheConfig = null; },
  salvarVarias(mapa) {
    const tx = getConn().transaction(() => {
      for (const [k, v] of Object.entries(mapa || {})) config.salvar(k, v);
    });
    tx();
  }
};

/* ------------------------------------------------------------------ */
/* Obreiros                                                            */
/* ------------------------------------------------------------------ */

const CAMPOS_OBREIRO = [
  'nome', 'tratamento', 'grau', 'cim', 'cargo', 'situacao', 'celular', 'email',
  'dt_nascimento', 'dt_iniciacao', 'dt_elevacao', 'dt_exaltacao', 'dt_remissao',
  'dt_casamento', 'observacoes', 'ativo'
];

const obreiros = {
  listar(filtro = {}) {
    let sql = 'SELECT * FROM obreiros WHERE 1 = 1';
    const p = [];
    if (filtro.busca) {
      sql += ' AND (nome LIKE ? OR cim LIKE ? OR cargo LIKE ?)';
      const t = `%${filtro.busca}%`;
      p.push(t, t, t);
    }
    if (filtro.situacao) { sql += ' AND situacao = ?'; p.push(filtro.situacao); }
    if (filtro.somenteAtivos) sql += ' AND ativo = 1';
    sql += ' ORDER BY nome COLLATE NOCASE';
    const lista = getConn().prepare(sql).all(...p);
    const fam = getConn().prepare('SELECT * FROM familiares WHERE obreiro_id = ? AND ativo = 1 ORDER BY parentesco, nome');
    return lista.map((o) => ({ ...o, familiares: fam.all(o.id) }));
  },

  obter(id) {
    const o = getConn().prepare('SELECT * FROM obreiros WHERE id = ?').get(id);
    if (!o) return null;
    o.familiares = familiares.listar(id);
    return o;
  },

  salvar(reg) {
    const dados = {};
    for (const c of CAMPOS_OBREIRO) dados[c] = reg[c] === undefined || reg[c] === '' ? null : reg[c];
    if (!dados.nome) throw new Error('O nome do Obreiro é obrigatório.');
    if (dados.ativo === null) dados.ativo = 1;

    if (reg.id) {
      const sets = CAMPOS_OBREIRO.map((c) => `${c} = @${c}`).join(', ');
      getConn()
        .prepare(`UPDATE obreiros SET ${sets}, atualizado_em = datetime('now','localtime') WHERE id = @id`)
        .run({ ...dados, id: reg.id });
      return obreiros.obter(reg.id);
    }
    const cols = CAMPOS_OBREIRO.join(', ');
    const vals = CAMPOS_OBREIRO.map((c) => `@${c}`).join(', ');
    const r = getConn().prepare(`INSERT INTO obreiros (${cols}) VALUES (${vals})`).run(dados);
    return obreiros.obter(r.lastInsertRowid);
  },

  excluir(id) {
    getConn().prepare('DELETE FROM obreiros WHERE id = ?').run(id);
    return true;
  }
};

/* ------------------------------------------------------------------ */
/* Familiares                                                          */
/* ------------------------------------------------------------------ */

const familiares = {
  listar(obreiroId) {
    return getConn()
      .prepare('SELECT * FROM familiares WHERE obreiro_id = ? ORDER BY CASE parentesco WHEN \'cunhada\' THEN 0 ELSE 1 END, dt_nascimento')
      .all(obreiroId);
  },

  salvar(reg) {
    if (!reg.nome) throw new Error('O nome do familiar é obrigatório.');
    if (!['cunhada', 'sobrinho', 'sobrinha'].includes(reg.parentesco)) {
      throw new Error('Parentesco inválido. Use cunhada, sobrinho ou sobrinha.');
    }
    const dados = {
      obreiro_id: reg.obreiro_id,
      parentesco: reg.parentesco,
      nome: reg.nome,
      dt_nascimento: reg.dt_nascimento || null,
      celular: reg.celular || null,
      observacoes: reg.observacoes || null,
      ativo: reg.ativo === undefined ? 1 : reg.ativo
    };
    if (reg.id) {
      getConn().prepare(`
        UPDATE familiares SET parentesco = @parentesco, nome = @nome, dt_nascimento = @dt_nascimento,
        celular = @celular, observacoes = @observacoes, ativo = @ativo,
        atualizado_em = datetime('now','localtime') WHERE id = @id
      `).run({ ...dados, id: reg.id });
      return getConn().prepare('SELECT * FROM familiares WHERE id = ?').get(reg.id);
    }
    const r = getConn().prepare(`
      INSERT INTO familiares (obreiro_id, parentesco, nome, dt_nascimento, celular, observacoes, ativo)
      VALUES (@obreiro_id, @parentesco, @nome, @dt_nascimento, @celular, @observacoes, @ativo)
    `).run(dados);
    return getConn().prepare('SELECT * FROM familiares WHERE id = ?').get(r.lastInsertRowid);
  },

  excluir(id) {
    getConn().prepare('DELETE FROM familiares WHERE id = ?').run(id);
    return true;
  }
};

/* ------------------------------------------------------------------ */
/* Calendario permanente                                               */
/* ------------------------------------------------------------------ */

const datas = {
  listar(filtro = {}) {
    let sql = 'SELECT * FROM datas_calendario WHERE 1 = 1';
    const p = [];
    if (filtro.categoria) { sql += ' AND categoria = ?'; p.push(filtro.categoria); }
    if (filtro.busca) { sql += ' AND (titulo LIKE ? OR descricao LIKE ?)'; p.push(`%${filtro.busca}%`, `%${filtro.busca}%`); }
    if (filtro.somenteAtivos) sql += ' AND ativo = 1';
    sql += ' ORDER BY categoria, mes, dia, titulo';
    return getConn().prepare(sql).all(...p);
  },

  ativas() {
    return getConn().prepare('SELECT * FROM datas_calendario WHERE ativo = 1').all();
  },

  salvar(reg) {
    const dados = {
      chave: reg.chave || `usr_${Date.now()}`,
      categoria: reg.categoria || 'efemeride',
      titulo: reg.titulo,
      descricao: reg.descricao || '',
      tipo: reg.tipo || 'fixa',
      dia: reg.dia || null,
      mes: reg.mes || null,
      regra: reg.regra || null,
      ano_origem: reg.ano_origem || null,
      template_chave: reg.template_chave || null,
      enviar: reg.enviar === undefined ? 1 : reg.enviar,
      ativo: reg.ativo === undefined ? 1 : reg.ativo
    };
    if (!dados.titulo) throw new Error('O título da data é obrigatório.');
    if (reg.id) {
      getConn().prepare(`
        UPDATE datas_calendario SET categoria=@categoria, titulo=@titulo, descricao=@descricao,
        tipo=@tipo, dia=@dia, mes=@mes, regra=@regra, ano_origem=@ano_origem,
        template_chave=@template_chave, enviar=@enviar, ativo=@ativo WHERE id=@id
      `).run({ ...dados, id: reg.id });
      return getConn().prepare('SELECT * FROM datas_calendario WHERE id = ?').get(reg.id);
    }
    const r = getConn().prepare(`
      INSERT INTO datas_calendario
        (chave, categoria, titulo, descricao, tipo, dia, mes, regra, ano_origem, template_chave, enviar, padrao, ativo)
      VALUES
        (@chave, @categoria, @titulo, @descricao, @tipo, @dia, @mes, @regra, @ano_origem, @template_chave, @enviar, 0, @ativo)
    `).run(dados);
    return getConn().prepare('SELECT * FROM datas_calendario WHERE id = ?').get(r.lastInsertRowid);
  },

  excluir(id) {
    getConn().prepare('DELETE FROM datas_calendario WHERE id = ?').run(id);
    return true;
  },

  restaurarPadrao() {
    semearDatas(true);
    return datas.listar();
  }
};

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const templates = {
  listar() {
    return getConn().prepare('SELECT * FROM templates ORDER BY id').all();
  },
  obter(chave) {
    return getConn().prepare('SELECT * FROM templates WHERE chave = ? AND ativo = 1').get(chave);
  },
  salvar(reg) {
    if (!reg.chave) throw new Error('Chave do modelo é obrigatória.');
    getConn().prepare(`
      INSERT INTO templates (chave, titulo, descricao, corpo, padrao, ativo)
      VALUES (@chave, @titulo, @descricao, @corpo, 0, @ativo)
      ON CONFLICT(chave) DO UPDATE SET
        titulo = excluded.titulo, descricao = excluded.descricao, corpo = excluded.corpo,
        ativo = excluded.ativo, atualizado_em = datetime('now','localtime')
    `).run({
      chave: reg.chave,
      titulo: reg.titulo || reg.chave,
      descricao: reg.descricao || '',
      corpo: reg.corpo || '',
      ativo: reg.ativo === undefined ? 1 : reg.ativo
    });
    return templates.obter(reg.chave);
  },
  restaurarPadrao() {
    semearTemplates(true);
    return templates.listar();
  }
};

/* ------------------------------------------------------------------ */
/* Sessoes da Loja (Agenda da Loja)                                    */
/* ------------------------------------------------------------------ */

const GRAUS_SESSAO = ['Aprendiz', 'Companheiro', 'Mestre'];
const TIPOS_SESSAO = ['Economica', 'Magna'];

const sessoes = {
  listar(filtro = {}) {
    let sql = 'SELECT * FROM sessoes WHERE 1 = 1';
    const p = [];
    if (filtro.de) { sql += ' AND data >= ?'; p.push(filtro.de); }
    if (filtro.ate) { sql += ' AND data <= ?'; p.push(filtro.ate); }
    if (filtro.somenteAtivas) sql += ' AND ativo = 1';
    sql += ' ORDER BY data';
    return getConn().prepare(sql).all(...p);
  },

  ativas() {
    return getConn().prepare('SELECT * FROM sessoes WHERE ativo = 1').all();
  },

  obterPorData(data) {
    return getConn().prepare('SELECT * FROM sessoes WHERE data = ?').get(data);
  },

  salvar(reg) {
    if (!reg.data) throw new Error('A data da sessão é obrigatória.');
    const dados = {
      data: reg.data,
      grau: GRAUS_SESSAO.includes(reg.grau) ? reg.grau : 'Aprendiz',
      tipo: TIPOS_SESSAO.includes(reg.tipo) ? reg.tipo : 'Economica',
      agenda_dia: reg.agenda_dia || null,
      hora: reg.hora || null,
      local: reg.local || null,
      especial: reg.especial ? 1 : 0,
      observacoes: reg.observacoes || null,
      enviar: reg.enviar === undefined ? 1 : (reg.enviar ? 1 : 0),
      ativo: reg.ativo === undefined ? 1 : (reg.ativo ? 1 : 0)
    };
    getConn().prepare(`
      INSERT INTO sessoes (data, grau, tipo, agenda_dia, hora, local, especial, observacoes, enviar, ativo)
      VALUES (@data, @grau, @tipo, @agenda_dia, @hora, @local, @especial, @observacoes, @enviar, @ativo)
      ON CONFLICT(data) DO UPDATE SET
        grau = excluded.grau, tipo = excluded.tipo, agenda_dia = excluded.agenda_dia,
        hora = excluded.hora, local = excluded.local, especial = excluded.especial,
        observacoes = excluded.observacoes, enviar = excluded.enviar, ativo = excluded.ativo,
        atualizado_em = datetime('now','localtime')
    `).run(dados);
    return sessoes.obterPorData(dados.data);
  },

  excluir(id) {
    getConn().prepare('DELETE FROM sessoes WHERE id = ?').run(id);
    return true;
  },

  excluirPorData(data) {
    getConn().prepare('DELETE FROM sessoes WHERE data = ?').run(data);
    return true;
  }
};

/* ------------------------------------------------------------------ */
/* Lista de presenca                                                   */
/* ------------------------------------------------------------------ */
/*
 * Uma linha por Obreiro por sessao. Nao havendo NENHUMA linha para uma
 * data, a chamada daquela sessao ainda nao foi feita - o que e bem
 * diferente de "ninguem compareceu". As estatisticas so consideram as
 * sessoes que tiveram chamada.
 */

const presencas = {
  /** Todas as linhas, para publicar ao celular e para as estatisticas. */
  todas() {
    return getConn().prepare('SELECT * FROM presencas ORDER BY sessao_data, obreiro_id').all();
  },

  porSessao(data) {
    return getConn().prepare('SELECT * FROM presencas WHERE sessao_data = ? ORDER BY obreiro_id').all(data);
  },

  porObreiro(obreiroId) {
    return getConn().prepare('SELECT * FROM presencas WHERE obreiro_id = ? ORDER BY sessao_data').all(obreiroId);
  },

  /** Datas de sessao que ja tiveram chamada registrada. */
  datasComChamada() {
    return getConn().prepare('SELECT DISTINCT sessao_data FROM presencas ORDER BY sessao_data').all()
      .map((l) => l.sessao_data);
  },

  temChamada(data) {
    return !!getConn().prepare('SELECT 1 FROM presencas WHERE sessao_data = ? LIMIT 1').get(data);
  },

  /**
   * Grava a chamada inteira de uma sessao, de uma vez.
   * Reenviar a mesma lista nao duplica: a chave unica atualiza a linha.
   *
   * @param {object} reg { sessao_data, itens:[{obreiro_id, presente}], origem, registrado_por }
   * @returns {object} quantos ficaram presentes e ausentes
   */
  registrarLista(reg) {
    if (!reg || !reg.sessao_data) throw new Error('Informe a data da sessão.');
    const itens = Array.isArray(reg.itens) ? reg.itens : [];
    if (!itens.length) throw new Error('A lista de presença está vazia.');

    const validos = new Set(
      getConn().prepare('SELECT id FROM obreiros').all().map((o) => o.id)
    );

    const gravar = getConn().prepare(`
      INSERT INTO presencas (sessao_data, obreiro_id, presente, origem, registrado_por)
      VALUES (@sessao_data, @obreiro_id, @presente, @origem, @registrado_por)
      ON CONFLICT(sessao_data, obreiro_id) DO UPDATE SET
        presente = excluded.presente,
        origem = excluded.origem,
        registrado_por = excluded.registrado_por,
        registrado_em = datetime('now','localtime')
    `);

    let presentes = 0;
    let ausentes = 0;
    let ignorados = 0;

    const tx = getConn().transaction(() => {
      for (const i of itens) {
        const id = Number(i.obreiro_id);
        // Obreiro que nao existe mais neste banco: ignora em vez de quebrar
        if (!validos.has(id)) { ignorados++; continue; }
        const presente = i.presente ? 1 : 0;
        gravar.run({
          sessao_data: reg.sessao_data,
          obreiro_id: id,
          presente,
          origem: reg.origem || 'pc',
          registrado_por: reg.registrado_por || null
        });
        if (presente) presentes++; else ausentes++;
      }
    });
    tx();

    return { sessao_data: reg.sessao_data, presentes, ausentes, ignorados };
  },

  limparSessao(data) {
    getConn().prepare('DELETE FROM presencas WHERE sessao_data = ?').run(data);
    return true;
  }
};

/* ------------------------------------------------------------------ */
/* Lancamentos financeiros                                             */
/* ------------------------------------------------------------------ */

const AREAS_FINANCEIRAS = ['tesouraria', 'hospitalaria'];
const NATUREZAS = ['receita', 'despesa', 'investimento', 'doacao'];

const financeiro = {
  /** Tudo, para publicar ao celular e para o acumulado. */
  todos(filtro = {}) {
    let sql = 'SELECT * FROM financeiro WHERE ativo = 1';
    const p = [];
    if (filtro.area) { sql += ' AND area = ?'; p.push(filtro.area); }
    if (filtro.de) { sql += ' AND data >= ?'; p.push(filtro.de); }
    if (filtro.ate) { sql += ' AND data <= ?'; p.push(filtro.ate); }
    sql += ' ORDER BY data, id';
    return getConn().prepare(sql).all(...p);
  },

  obter(id) {
    return getConn().prepare('SELECT * FROM financeiro WHERE id = ?').get(id);
  },

  /** Meses que tem lancamento, do mais novo para o mais antigo. */
  mesesComLancamento(area) {
    let sql = "SELECT DISTINCT substr(data, 1, 7) AS mes FROM financeiro WHERE ativo = 1";
    const p = [];
    if (area) { sql += ' AND area = ?'; p.push(area); }
    sql += ' ORDER BY mes DESC';
    return getConn().prepare(sql).all(...p).map((l) => l.mes);
  },

  salvar(reg) {
    if (!reg || !reg.area || !AREAS_FINANCEIRAS.includes(reg.area)) {
      throw new Error('Área desconhecida: informe tesouraria ou hospitalaria.');
    }
    if (!NATUREZAS.includes(reg.natureza)) {
      throw new Error('Natureza desconhecida: ' + reg.natureza);
    }
    if (!reg.data || !/^\d{4}-\d{2}-\d{2}$/.test(reg.data)) {
      throw new Error('Informe a data do lançamento.');
    }
    const valor = Number(reg.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      throw new Error('O valor precisa ser um número igual ou maior que zero.');
    }

    const dados = {
      area: reg.area,
      natureza: reg.natureza,
      categoria: reg.categoria || null,
      descricao: reg.descricao || null,
      // Guardado em centavos arredondados: dinheiro nao sofre com o
      // arredondamento binario se for tratado com duas casas na entrada.
      valor: Math.round(valor * 100) / 100,
      data: reg.data,
      origem: reg.origem || 'pc',
      registrado_por: reg.registrado_por || null,
      observacoes: reg.observacoes || null,
      ativo: reg.ativo === undefined ? 1 : (reg.ativo ? 1 : 0)
    };

    /* O id vai separado: a instrucao de INSERT nao o declara, e tanto o
       node:sqlite quanto o better-sqlite3 recusam parametro nomeado que
       a instrucao nao espera. */
    const id = reg.id ? Number(reg.id) : null;

    if (id) {
      getConn().prepare(`
        UPDATE financeiro SET
          area = @area, natureza = @natureza, categoria = @categoria,
          descricao = @descricao, valor = @valor, data = @data,
          origem = @origem, registrado_por = @registrado_por,
          observacoes = @observacoes, ativo = @ativo,
          atualizado_em = datetime('now','localtime')
        WHERE id = @id
      `).run(Object.assign({ id }, dados));
      return financeiro.obter(id);
    }

    const r = getConn().prepare(`
      INSERT INTO financeiro (area, natureza, categoria, descricao, valor, data, origem, registrado_por, observacoes, ativo)
      VALUES (@area, @natureza, @categoria, @descricao, @valor, @data, @origem, @registrado_por, @observacoes, @ativo)
    `).run(dados);
    return financeiro.obter(Number(r.lastInsertRowid));
  },

  /** Grava vários de uma vez - é assim que chega o pacote do celular. */
  salvarVarios(lista, extras) {
    const itens = Array.isArray(lista) ? lista : [];
    if (!itens.length) throw new Error('Nenhum lançamento informado.');

    let gravados = 0;
    const tx = getConn().transaction(() => {
      for (const i of itens) {
        financeiro.salvar(Object.assign({}, i, extras || {}));
        gravados++;
      }
    });
    tx();
    return { gravados };
  },

  excluir(id) {
    getConn().prepare('DELETE FROM financeiro WHERE id = ?').run(id);
    return true;
  }
};

/* ------------------------------------------------------------------ */
/* Grupos do WhatsApp                                                  */
/* ------------------------------------------------------------------ */

const grupos = {
  listar() {
    return getConn().prepare('SELECT * FROM grupos ORDER BY nome COLLATE NOCASE').all();
  },
  selecionados() {
    return getConn().prepare('SELECT * FROM grupos WHERE selecionado = 1').all();
  },
  sincronizar(listaWa) {
    const ins = getConn().prepare(`
      INSERT INTO grupos (wa_id, nome, selecionado) VALUES (?, ?, 0)
      ON CONFLICT(wa_id) DO UPDATE SET nome = excluded.nome, atualizado_em = datetime('now','localtime')
    `);
    const tx = getConn().transaction(() => { for (const g of listaWa) ins.run(g.id, g.nome); });
    tx();
    return grupos.listar();
  },
  salvarSelecao(ids) {
    const tx = getConn().transaction(() => {
      getConn().prepare('UPDATE grupos SET selecionado = 0').run();
      const up = getConn().prepare('UPDATE grupos SET selecionado = 1 WHERE wa_id = ?');
      for (const id of ids || []) up.run(id);
    });
    tx();
    return grupos.listar();
  }
};

/* ------------------------------------------------------------------ */
/* Log de envios e controle de disparo                                 */
/* ------------------------------------------------------------------ */

const envios = {
  registrar(reg) {
    getConn().prepare(`
      INSERT INTO envios_log (data_ref, evento_tipo, evento_titulo, destino_id, destino_nome, mensagem, status, erro)
      VALUES (@data_ref, @evento_tipo, @evento_titulo, @destino_id, @destino_nome, @mensagem, @status, @erro)
    `).run({
      data_ref: reg.data_ref || null,
      evento_tipo: reg.evento_tipo || null,
      evento_titulo: reg.evento_titulo || null,
      destino_id: reg.destino_id || null,
      destino_nome: reg.destino_nome || null,
      mensagem: reg.mensagem || null,
      status: reg.status || 'enviado',
      erro: reg.erro || null
    });
  },
  listar(filtro = {}) {
    let sql = 'SELECT * FROM envios_log WHERE 1 = 1';
    const p = [];
    if (filtro.de) { sql += ' AND data_ref >= ?'; p.push(filtro.de); }
    if (filtro.ate) { sql += ' AND data_ref <= ?'; p.push(filtro.ate); }
    if (filtro.status) { sql += ' AND status = ?'; p.push(filtro.status); }
    sql += ' ORDER BY id DESC LIMIT ?';
    p.push(filtro.limite || 300);
    return getConn().prepare(sql).all(...p);
  },
  limpar(antesDe) {
    getConn().prepare('DELETE FROM envios_log WHERE data_ref < ?').run(antesDe);
    return true;
  },
  jaDisparado(dataRef) {
    return !!getConn().prepare('SELECT 1 FROM controle_disparo WHERE data_ref = ?').get(dataRef);
  },
  marcarDisparo(dataRef, qtdEventos, qtdEnviados) {
    getConn().prepare(`
      INSERT INTO controle_disparo (data_ref, executado_em, qtd_eventos, qtd_enviados)
      VALUES (?, datetime('now','localtime'), ?, ?)
      ON CONFLICT(data_ref) DO UPDATE SET
        executado_em = excluded.executado_em,
        qtd_eventos = excluded.qtd_eventos,
        qtd_enviados = excluded.qtd_enviados
    `).run(dataRef, qtdEventos, qtdEnviados);
  }
};

module.exports = {
  init, getConn, getPath,
  config, obreiros, familiares, datas, templates, sessoes, presencas, financeiro, grupos, envios,
  CONFIG_PADRAO, GRAUS_SESSAO, TIPOS_SESSAO, AREAS_FINANCEIRAS, NATUREZAS
};
