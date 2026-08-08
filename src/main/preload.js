'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const call = (canal, ...args) => ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld('api', {
  app: {
    info: () => call('app:info'),
    logos: () => call('app:logos'),
    abrirPasta: (p) => call('app:abrir-pasta', p)
  },

  obreiros: {
    listar: (filtro) => call('obreiros:listar', filtro),
    obter: (id) => call('obreiros:obter', id),
    salvar: (r) => call('obreiros:salvar', r),
    excluir: (id) => call('obreiros:excluir', id)
  },

  familiares: {
    listar: (obreiroId) => call('familiares:listar', obreiroId),
    salvar: (r) => call('familiares:salvar', r),
    excluir: (id) => call('familiares:excluir', id)
  },

  datas: {
    listar: (filtro) => call('datas:listar', filtro),
    salvar: (r) => call('datas:salvar', r),
    excluir: (id) => call('datas:excluir', id),
    restaurarPadrao: () => call('datas:restaurar-padrao')
  },

  agenda: {
    doDia: (iso) => call('agenda:do-dia', iso),
    periodo: (ini, fim) => call('agenda:periodo', ini, fim),
    mes: (ano, mes) => call('agenda:mes', ano, mes),
    proximos: (dias) => call('agenda:proximos', dias),
    fila: (iso) => call('agenda:fila', iso)
  },

  sessoes: {
    listar: (filtro) => call('sessoes:listar', filtro),
    mes: (ano, mes) => call('sessoes:mes', ano, mes),
    salvar: (r) => call('sessoes:salvar', r),
    excluir: (id) => call('sessoes:excluir', id),
    excluirPorData: (data) => call('sessoes:excluir-data', data),
    opcoes: () => call('sessoes:opcoes')
  },

  templates: {
    listar: () => call('templates:listar'),
    salvar: (r) => call('templates:salvar', r),
    restaurarPadrao: () => call('templates:restaurar-padrao'),
    variaveis: () => call('templates:variaveis'),
    preview: (corpo, chave) => call('templates:preview', corpo, chave)
  },

  config: {
    obter: () => call('config:obter'),
    salvar: (mapa) => call('config:salvar', mapa)
  },

  publicacao: {
    estado: () => call('publicacao:estado'),
    publicar: (senha) => call('publicacao:publicar', senha),
    abrirGithub: () => call('publicacao:abrir-github')
  },

  cargos: {
    estado: () => call('cargos:estado'),
    definirSenha: (cargo, senha) => call('cargos:definir-senha', cargo, senha)
  },

  presenca: {
    lista: (data) => call('presenca:lista', data),
    sessoes: (limite) => call('presenca:sessoes', limite),
    estatisticas: (filtro) => call('presenca:estatisticas', filtro),
    historicoObreiro: (id, filtro) => call('presenca:historico-obreiro', id, filtro),
    salvar: (reg) => call('presenca:salvar', reg),
    limpar: (data) => call('presenca:limpar', data),
    lerPacote: (origem, conteudo) => call('presenca:ler-pacote', origem, conteudo),
    exportarPdf: (data) => call('presenca:exportar-pdf', data)
  },

  rotina: {
    estado: () => call('rotina:estado'),
    executar: (forcar) => call('rotina:executar', forcar),
    verificar: () => call('rotina:verificar'),
    log: (limite) => call('rotina:log', limite),
    diagnostico: () => call('rotina:diagnostico')
  },

  whatsapp: {
    status: () => call('whatsapp:status'),
    conectar: (opts) => call('whatsapp:conectar', opts),
    reiniciar: () => call('whatsapp:reiniciar'),
    desconectar: () => call('whatsapp:desconectar'),
    limparSessao: () => call('whatsapp:limpar-sessao'),
    diagnostico: () => call('whatsapp:diagnostico'),
    grupos: () => call('whatsapp:grupos'),
    gruposSalvos: () => call('whatsapp:grupos-salvos'),
    salvarGrupos: (lista) => call('whatsapp:salvar-grupos', lista),
    enviar: (payload) => call('whatsapp:enviar', payload),
    teste: (texto, destino) => call('whatsapp:teste', texto, destino)
  },

  log: {
    listar: (filtro) => call('log:listar', filtro),
    limpar: (antesDe) => call('log:limpar', antesDe)
  },

  backup: {
    exportar: () => call('backup:exportar'),
    importar: (modo) => call('backup:importar', modo)
  },

  on: (canal, cb) => {
    const permitidos = ['whatsapp:event', 'agenda:fila-do-dia', 'app:log'];
    if (!permitidos.includes(canal)) return () => {};
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on(canal, handler);
    return () => ipcRenderer.removeListener(canal, handler);
  }
});
