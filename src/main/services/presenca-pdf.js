'use strict';

/**
 * Lista de presenca em PDF, para o arquivo fisico da Loja.
 *
 * O PDF sai pelo proprio Electron: uma janela invisivel recebe o HTML e
 * o Chromium o converte. Nao entra nenhuma biblioteca nova no projeto,
 * e o resultado e exatamente o que se ve na tela - fontes, acentos e os
 * sinais maconicos inclusive.
 *
 * A folha e desenhada para ser ASSINADA: cada Irmao presente tem a sua
 * linha com espaco para rubrica, e o rodape traz os campos do Chanceler
 * e do Veneravel. E um documento de arquivo, nao um relatorio de tela.
 */

const fs = require('fs');
const path = require('path');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dataExtenso(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

const esc = (t) => String(t === null || t === undefined ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Le a imagem do disco e devolve embutida, para o PDF nao depender do arquivo. */
function imagemEmbutida(caminho) {
  try {
    if (!caminho || !fs.existsSync(caminho)) return null;
    const ext = path.extname(caminho).toLowerCase();
    const tipo = ext === '.svg' ? 'image/svg+xml'
      : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
        : ext === '.webp' ? 'image/webp' : 'image/png';
    return `data:${tipo};base64,` + fs.readFileSync(caminho).toString('base64');
  } catch {
    return null;
  }
}

/**
 * Monta o HTML da folha.
 *
 * @param {object} dados  lista vinda de presenca.listaDaSessao()
 * @param {object} cfg    configuracoes da Loja
 * @param {object} logos  { logo1, logo2 } caminhos em disco
 */
function montarHtml(dados, cfg, logos) {
  const img1 = imagemEmbutida(logos && logos.logo1);
  const img2 = imagemEmbutida(logos && logos.logo2);

  const presentes = dados.itens.filter((i) => i.presente);
  const ausentes = dados.itens.filter((i) => !i.presente);

  const linhaAssinatura = (i, n) => `
    <tr>
      <td class="num">${n}</td>
      <td class="nome">${esc((i.tratamento || '') + ' ' + i.nome)}</td>
      <td class="grau">${esc(i.grau || '')}</td>
      <td class="rubrica"></td>
    </tr>`;

  const linhaAusente = (i, n) => `
    <tr>
      <td class="num">${n}</td>
      <td class="nome">${esc((i.tratamento || '') + ' ' + i.nome)}</td>
      <td class="grau">${esc(i.grau || '')}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Calibri, Arial, sans-serif;
    color: #10262B; font-size: 10.5pt; margin: 0;
  }

  .topo { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #008CCC; padding-bottom: 10px; }
  .topo img { height: 62px; width: auto; }
  .topo .centro { flex: 1; text-align: center; }
  .topo h1 { margin: 0; font-size: 13.5pt; line-height: 1.3; }
  .topo p { margin: 2px 0 0; font-size: 9pt; color: #4A6168; }

  h2 { text-align: center; font-size: 12pt; letter-spacing: 1px; margin: 14px 0 10px; }

  .sessao { background: #E3F2F1; border: 1px solid #A9D4D0; border-radius: 4px; padding: 8px 12px; margin-bottom: 12px; }
  .sessao table { width: 100%; border-collapse: collapse; }
  .sessao td { padding: 2px 0; font-size: 10pt; }
  .sessao td.r { font-weight: 600; width: 92px; color: #4A6168; }

  table.lista { width: 100%; border-collapse: collapse; }
  table.lista th {
    background: #C7E6E3; border: 1px solid #A9D4D0; padding: 5px 6px;
    font-size: 9pt; text-align: left; text-transform: uppercase; letter-spacing: .4px;
  }
  table.lista td { border: 1px solid #A9D4D0; padding: 6px; font-size: 10pt; }
  table.lista tr { page-break-inside: avoid; }
  td.num { width: 26px; text-align: center; color: #4A6168; }
  td.grau { width: 90px; }
  td.rubrica { width: 165px; }

  .resumo { display: flex; gap: 10px; margin: 14px 0 6px; }
  .resumo div { flex: 1; border: 1px solid #A9D4D0; border-radius: 4px; padding: 7px; text-align: center; }
  .resumo strong { display: block; font-size: 16pt; color: #008CCC; }
  .resumo span { font-size: 8.5pt; color: #4A6168; text-transform: uppercase; letter-spacing: .5px; }

  .ausentes { margin-top: 14px; page-break-inside: avoid; }
  .ausentes h3 { font-size: 10pt; margin: 0 0 6px; color: #4A6168; }

  .assinaturas { margin-top: 26px; display: flex; gap: 40px; page-break-inside: avoid; }
  .assinaturas div { flex: 1; text-align: center; }
  .assinaturas .linha { border-top: 1px solid #10262B; margin-bottom: 4px; height: 34px; }
  .assinaturas small { font-size: 9pt; color: #4A6168; }

  .rodape { margin-top: 16px; border-top: 1px solid #A9D4D0; padding-top: 6px; font-size: 8pt; color: #4A6168; text-align: center; }
</style></head><body>

  <div class="topo">
    ${img1 ? `<img src="${img1}" alt="">` : '<div style="width:62px"></div>'}
    <div class="centro">
      <h1>${esc(cfg.loja_nome || 'Loja Maçônica')}</h1>
      <p>${esc([cfg.potencia, cfg.oriente, cfg.rito].filter(Boolean).join(' &middot; '))}</p>
    </div>
    ${img2 ? `<img src="${img2}" alt="">` : '<div style="width:62px"></div>'}
  </div>

  <h2>LISTA DE PRESENÇA</h2>

  <div class="sessao"><table>
    <tr><td class="r">Data</td><td>${esc(dataExtenso(dados.data))}</td>
        <td class="r">Hora</td><td>${esc(dados.hora || cfg.hora_reuniao || '')}</td></tr>
    <tr><td class="r">Sessão</td><td>${esc(dados.tipo || '')}</td>
        <td class="r">Grau</td><td>${esc(dados.grau || '')}</td></tr>
    <tr><td class="r">Local</td><td colspan="3">${esc(dados.local || cfg.templo || '')}</td></tr>
  </table></div>

  <div class="resumo">
    <div><strong>${dados.total}</strong><span>Quadro</span></div>
    <div><strong>${presentes.length}</strong><span>Presentes</span></div>
    <div><strong>${ausentes.length}</strong><span>Ausentes</span></div>
    <div><strong>${dados.percentual}%</strong><span>Comparecimento</span></div>
  </div>

  <table class="lista">
    <thead><tr><th>#</th><th>Obreiro</th><th>Grau</th><th>Rubrica</th></tr></thead>
    <tbody>
      ${presentes.length
    ? presentes.map((i, n) => linhaAssinatura(i, n + 1)).join('')
    : '<tr><td colspan="4" style="text-align:center;color:#4A6168">Nenhuma presença registrada.</td></tr>'}
    </tbody>
  </table>

  ${ausentes.length ? `
  <div class="ausentes">
    <h3>Ausentes (${ausentes.length})</h3>
    <table class="lista">
      <thead><tr><th>#</th><th>Obreiro</th><th>Grau</th></tr></thead>
      <tbody>${ausentes.map((i, n) => linhaAusente(i, n + 1)).join('')}</tbody>
    </table>
  </div>` : ''}

  <div class="assinaturas">
    <div><div class="linha"></div><small>Chanceler</small></div>
    <div><div class="linha"></div><small>Secretário</small></div>
    <div><div class="linha"></div><small>Venerável Mestre</small></div>
  </div>

  <div class="rodape">
    Documento gerado pelo CtrLoja em ${esc(new Date().toLocaleString('pt-BR'))}
    ${cfg.cnpj ? ' &middot; CNPJ ' + esc(cfg.cnpj) : ''}
  </div>

</body></html>`;
}

/**
 * Gera o PDF no caminho indicado.
 * Recebe o BrowserWindow do Electron por parametro para que este modulo
 * continue testavel sem abrir janela nenhuma.
 */
async function gerar(BrowserWindow, destino, dados, cfg, logos) {
  const html = montarHtml(dados, cfg, logos);

  const janela = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false, sandbox: true }
  });

  try {
    await janela.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await janela.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' }
    });
    fs.writeFileSync(destino, pdf);
    return { arquivo: destino, bytes: pdf.length };
  } finally {
    janela.destroy();
  }
}

module.exports = { gerar, montarHtml, dataExtenso };
