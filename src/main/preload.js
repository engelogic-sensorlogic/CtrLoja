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

  whatsapp: {
    status: () => call('whatsapp:status'),
    conectar: (opts) => call('whatsapp:conectar', opts),
    reiniciar: (visivel) => call('whatsapp:reiniciar', visivel),
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
