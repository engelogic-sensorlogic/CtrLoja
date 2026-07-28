'use strict';

/* ==================================================================
   Inicializacao da interface
   ================================================================== */

(async function iniciar() {
  // Navegacao
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => navegar(b.dataset.view)));
  $('#modalFechar').addEventListener('click', () => Modal.fechar());
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') Modal.fechar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.fechar(); });

  // Informacoes da aplicacao
  App.info = await tentar(window.api.app.info()) || {};
  App.config = await tentar(window.api.config.obter()) || {};
  $('#versaoApp').textContent = `versão ${App.info.versao || '1.0.0'}`;
  $('#marcaSigla').textContent = App.config.loja_sigla || 'UFR';

  const logos = await tentar(window.api.app.logos());
  if (logos && logos.logo1) {
    const img = $('#logoLateral');
    img.src = logos.logo1;
    img.hidden = false;
  }

  // Status inicial do WhatsApp
  const st = await tentar(window.api.whatsapp.status());
  pintarStatusWa(st);

  // Eventos vindos do processo principal
  window.api.on('whatsapp:event', (evt) => {
    if (evt.tipo === 'estado') {
      window.api.whatsapp.status().then((r) => {
        if (r && r.ok) {
          pintarStatusWa(r.data);
          if (typeof App.onWhatsappEvent === 'function') App.onWhatsappEvent(r.data);
        }
      });
    }
    if (evt.tipo === 'envio-progresso' && evt.erro) toast(`Falha no envio: ${evt.erro}`, 'erro');
    if (evt.tipo === 'envio-fim') toast(`Envio finalizado: ${evt.enviados} enviada(s), ${evt.falhas} falha(s).`, evt.falhas ? '' : 'ok');
  });

  window.api.on('agenda:fila-do-dia', (fila) => {
    if (!fila || !fila.total_selecionados) return;
    toast(`${fila.total_selecionados} mensagem(ns) aguardando revisão para hoje.`, '', 9000);
    navegar('agenda');
  });

  window.api.on('app:log', (linha) => console.log(linha));

  // Primeira tela
  await navegar('dashboard');
})();
