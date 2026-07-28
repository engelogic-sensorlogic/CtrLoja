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
  disparo_modo: 'revisao',            // revisao | automatico | manual
  disparo_hora: '07:30',
  disparo_dias: '1,2,3,4,5,6,0',      // dias da semana habilitados
  intervalo_envio_ms: '4000',         // pausa entre mensagens
  agrupar_mensagens: '0',             // 1 = uma unica mensagem por dia
  antecedencia_aviso: '7',            // dias de antecedencia no painel "proximos"
  eventos_habilitados: JSON.stringify([
    'aniversario_obreiro', 'aniversario_cunhada', 'aniversario_sobrinho', 'aniversario_sobrinha',
    'iniciacao', 'elevacao', 'exaltacao', 'remissao', 'casamento',
    'feriado_religioso', 'data_nacional', 'efemeride', 'maconica'
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

  semearConfig();
  semearTemplates();
  semearDatas();

  return conn;
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
  config, obreiros, familiares, datas, templates, grupos, envios,
  CONFIG_PADRAO
};
