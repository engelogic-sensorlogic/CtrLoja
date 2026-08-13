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
  /* Margens estreitas em cima e embaixo: a folha e para assinar, e cada
     milimetro poupado no topo cabe mais uma linha da relacao. As
     laterais ficam largas o bastante para a furacao do arquivo. */
  @page { size: A4; margin: 8mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Calibri, Arial, sans-serif;
    color: #10262B; font-size: 10.5pt; margin: 0;
  }

  /* A folha e uma coluna da altura UTIL da pagina - A4 tem 297mm e as
     margens de @page comem 8mm de cada lado, sobrando 281mm.
     Passando de uma pagina, esse valor e recalculado antes de imprimir
     (veja medirPaginas em imprimir()), para que a assinatura desca ao
     pe da ULTIMA folha e nao logo abaixo da tabela. */
  .folha { display: flex; flex-direction: column; min-height: 281mm; }

  /* Uma folga no pe do corpo para que a ultima linha da relacao nunca
     encoste na quebra da pagina. Sem ela a linha fica espremida contra
     a borda e parece cortada. */
  .corpo { flex: 0 0 auto; padding-bottom: 8mm; }

  /* Espaco em branco anulado.
     Pratica corrente em documento que se assina: o vazio entre o fim da
     relacao e a assinatura leva um traco diagonal, deixando claro que
     ali nao falta informacao nem cabe acrescentar nada depois. E este
     elemento, ao esticar, que empurra a assinatura para o rodape. */
  .anulado {
    flex: 1 1 auto; min-height: 14mm;

    /* Sem moldura: o traco diagonal ja diz tudo, e as bordas so
       poluiam a folha. */
    background-image: linear-gradient(to bottom right,
      transparent calc(50% - 0.6px), #A9D4D0 50%, transparent calc(50% + 0.6px));
    position: relative;

    /* NAO deixar partir entre folhas. Sem isto sobrava uma tira de
       poucos pixels no pe da pagina anterior - um risco solto logo
       abaixo da relacao, que parecia defeito de impressao. */
    break-inside: avoid; page-break-inside: avoid;
  }
  .anulado span {
    position: absolute; left: 50%; bottom: 4px; transform: translateX(-50%);
    font-size: 7pt; color: #8FB0AD; letter-spacing: .5px; background: #fff; padding: 0 6px;
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
  /* Linhas 20% mais altas: a rubrica e feita a caneta, e apertado nao
     se assina. 6px de folga viravam 8.5px em cima e embaixo. */
  table.lista td { border: 1px solid #A9D4D0; padding: 8.5px 6px; font-size: 10pt; }
  table.lista tr { page-break-inside: avoid; }
  td.num { width: 26px; text-align: center; color: #4A6168; }
  td.grau { width: 78px; }

  /* O nome do Irmao cede espaco para a rubrica: a coluna Obreiro ocupa
     o que sobra, e sobra menos agora que a rubrica cresceu. */
  td.rubrica { width: 260px; }

  .resumo { display: flex; gap: 10px; margin: 14px 0 6px; }
  .resumo div { flex: 1; border: 1px solid #A9D4D0; border-radius: 4px; padding: 7px; text-align: center; }
  .resumo strong { display: block; font-size: 16pt; color: #008CCC; }
  .resumo span { font-size: 8.5pt; color: #4A6168; text-transform: uppercase; letter-spacing: .5px; }

  .ausentes { margin-top: 14px; page-break-inside: avoid; }
  .ausentes h3 { font-size: 10pt; margin: 0 0 6px; color: #4A6168; }

  /* Assinatura do Chanceler: empurrada ao pe da folha pelo margin-top
     automatico, logo acima do rodape. Fica junta na mesma pagina.

     Os respiros sao generosos de proposito - assina-se a caneta, e o
     traco precisa de espaco em volta para nao encostar no que esta
     acima nem no rodape. */
  .assinatura {
    margin-top: auto; padding-top: 90px; text-align: center;
    page-break-inside: avoid; break-inside: avoid;
  }
  .assinatura .linha {
    border-top: 1px solid #10262B; width: 70mm; margin: 0 auto 8px;
  }
  .assinatura small { font-size: 9.5pt; color: #4A6168; }

  .rodape { margin-top: 10px; border-top: 1px solid #A9D4D0; padding-top: 6px; font-size: 8pt; color: #4A6168; text-align: center; }
</style></head><body>
<div class="folha">
<div class="corpo">

  <div class="topo">
    ${img1 ? `<img src="${img1}" alt="">` : '<div style="width:62px"></div>'}
    <div class="centro">
      <h1>${esc(cfg.loja_nome || 'Loja Maçônica')}</h1>
      <p>${[cfg.potencia, cfg.oriente, cfg.rito].filter(Boolean).map(esc).join(' &middot; ')}</p>
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

</div><!-- corpo -->

  <div class="anulado"><span>espaço sem informação</span></div>

  <div class="assinatura">
    <div class="linha"></div>
    <small>Chanceler</small>
  </div>

  <div class="rodape">
    Documento gerado pelo CtrLoja em ${esc(new Date().toLocaleString('pt-BR'))}
    ${cfg.cnpj ? ' &middot; CNPJ ' + esc(cfg.cnpj) : ''}
  </div>

</div><!-- folha -->
</body></html>`;
}

/* ================================================================== */
/*  Relatorio de frequencia - para o mural da Loja                     */
/* ================================================================== */
/*
 * Documento diferente do anterior no proposito, e por isso no desenho.
 * A lista de presenca e um papel de trabalho, para assinar e arquivar.
 * Este aqui vai para a PAREDE: e lido de pe, a um metro de distancia,
 * por quem passa. Entao tem numeros grandes, barras em vez de colunas
 * de porcentagem e nenhuma linha de assinatura.
 */

/*
 * Sob a barra cabe pouca coisa. Cortar a palavra em quatro letras
 * produzia "Apre" e "Comp", que sao pedacos, nao abreviacoes.
 */
const ABREVIACAO_GRAU = { Aprendiz: 'Apr.', Companheiro: 'Comp.', Mestre: 'Mestre' };
const abreviarGrau = (g) => ABREVIACAO_GRAU[g] || String(g || '');

/**
 * Grafico de barras em SVG, montado como texto - sem biblioteca.
 *
 * Conta PESSOAS, nao porcentagem. Era percentual, e ficaria incoerente
 * empilhar visitantes sobre ele: o visitante nao tem denominador,
 * porque nao pertence ao quadro. Em contagem, a barra responde a
 * pergunta que quem passa diante do mural faz: quantos estiveram no
 * Templo naquela noite.
 */
function graficoSvg(sessoes) {
  const dados = sessoes.slice(-16);
  if (!dados.length) return '';

  const L = 1000, A = 270, base = A - 44, topo = 18, esquerda = 44;
  const passo = (L - esquerda) / dados.length;
  const barra = Math.min(passo * 0.62, 48);

  const maior = Math.max(1, ...dados.map((d) => (d.presentes || 0) + (d.visitantes || 0)));
  const media = dados.reduce((s, d) => s + (d.presentes || 0), 0) / dados.length;
  const alt = (n) => (n / maior) * (base - topo);

  const partes = [];

  const degrau = Math.max(1, Math.ceil(maior / 4));
  for (let n = degrau; n <= maior; n += degrau) {
    const y = base - alt(n);
    partes.push(`<line x1="${esquerda}" y1="${y}" x2="${L}" y2="${y}" stroke="#A9D4D0" stroke-width="1"/>`);
    partes.push(`<text x="${esquerda - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#4A6168">${n}</text>`);
  }

  const yMedia = base - alt(media);
  partes.push(`<line x1="${esquerda}" y1="${yMedia}" x2="${L}" y2="${yMedia}" stroke="#008CCC" stroke-width="2" stroke-dasharray="8 5"/>`);

  dados.forEach((d, i) => {
    const x = esquerda + i * passo + (passo - barra) / 2;
    const hP = Math.max(3, alt(d.presentes || 0));
    const visitantes = d.visitantes || 0;
    const hV = visitantes ? Math.max(3, alt(visitantes)) : 0;
    const cor = (d.presentes || 0) >= media ? '#008CCC' : '#8FC4DA';

    /* Visitantes empilhados por cima, na mesma escala de pessoas. */
    if (visitantes) {
      partes.push(`<rect x="${x}" y="${base - hP - hV}" width="${barra}" height="${hV}" rx="4" fill="#8E44AD"/>`);
      partes.push(`<text x="${x + barra / 2}" y="${base - hP - hV - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="#8E44AD">+${visitantes}</text>`);
    }

    partes.push(`<rect x="${x}" y="${base - hP}" width="${barra}" height="${hP}" rx="4" fill="${cor}"/>`);
    partes.push(`<text x="${x + barra / 2}" y="${base - hP + (hP > 20 ? 16 : -6)}" text-anchor="middle" font-size="13" font-weight="700" fill="${hP > 20 ? '#FFFFFF' : '#10262B'}">${d.presentes}</text>`);
    partes.push(`<text x="${x + barra / 2}" y="${A - 24}" text-anchor="middle" font-size="11" fill="#4A6168">${d.data.slice(8, 10)}/${d.data.slice(5, 7)}</text>`);
    partes.push(`<text x="${x + barra / 2}" y="${A - 10}" text-anchor="middle" font-size="9" fill="#8098A0">${esc(abreviarGrau(d.grau))}</text>`);
  });

  partes.push(`<line x1="${esquerda}" y1="${base}" x2="${L}" y2="${base}" stroke="#10262B" stroke-width="1.5"/>`);

  return `<svg viewBox="0 0 ${L} ${A}" width="100%" xmlns="http://www.w3.org/2000/svg">${partes.join('')}</svg>`;
}

/**
 * @param {object} est   resultado de presenca.estatisticas()
 * @param {object} cfg   configuracoes da Loja
 * @param {object} logos { logo1, logo2 } caminhos em disco
 */
function montarHtmlFrequencia(est, cfg, logos) {
  const img1 = imagemEmbutida(logos && logos.logo1);
  const img2 = imagemEmbutida(logos && logos.logo2);

  const periodo = est.sessoes.length
    ? `de ${dataExtenso(est.sessoes[0].data)} a ${dataExtenso(est.sessoes[est.sessoes.length - 1].data)}`
    : 'sem sessões registradas';

  const faixa = (p) => (p >= 75 ? '#1E8E5A' : (p >= 50 ? '#008CCC' : '#D98324'));

  const linhas = est.obreiros.map((o, n) => `
    <tr>
      <td class="pos">${n + 1}</td>
      <td class="nome">${esc((o.tratamento || '') + ' ' + o.nome)}</td>
      <td class="grau">${esc(o.grau || '')}</td>
      <td class="barra">
        <div class="trilho"><div class="preenche" style="width:${Math.max(2, o.percentual)}%;background:${faixa(o.percentual)}"></div></div>
      </td>
      <td class="pct" style="color:${faixa(o.percentual)}">${o.percentual}%</td>
      <td class="conta">${o.presencas}/${o.chamadas}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Calibri, Arial, sans-serif; color: #10262B; font-size: 11pt; margin: 0; }

  .topo { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #008CCC; padding-bottom: 12px; }
  .topo img { height: 74px; width: auto; }
  .topo .centro { flex: 1; text-align: center; }
  .topo h1 { margin: 0; font-size: 15pt; line-height: 1.3; }
  .topo p { margin: 3px 0 0; font-size: 9.5pt; color: #4A6168; }

  h2 { text-align: center; font-size: 17pt; letter-spacing: 2px; margin: 16px 0 4px; color: #0070A6; }
  .periodo { text-align: center; font-size: 10pt; color: #4A6168; margin-bottom: 16px; }

  .resumo { display: flex; gap: 12px; margin-bottom: 14px; }
  .resumo div { flex: 1; border: 1px solid #A9D4D0; border-radius: 6px; padding: 10px; text-align: center; background: #E3F2F1; }
  .resumo strong { display: block; font-size: 24pt; line-height: 1.1; color: #008CCC; }
  .resumo span { font-size: 8.5pt; color: #4A6168; text-transform: uppercase; letter-spacing: .6px; }

  /* Visitante nao pertence ao quadro: a cor propria evita que alguem
     leia o numero como se fosse frequencia dos nossos. */
  .resumo .visita { background: #F3EAF8; border-color: #D8C2E6; }
  .resumo .visita strong { color: #8E44AD; }

  .visitas { font-size: 9.5pt; color: #4A6168; text-align: center; margin: 0 0 14px; line-height: 1.5; }

  .grafico { border: 1px solid #A9D4D0; border-radius: 6px; padding: 10px 12px 4px; margin-bottom: 8px; }
  .grafico h3 { margin: 0 0 6px; font-size: 11pt; color: #0070A6; }
  .nota { font-size: 8.5pt; color: #4A6168; margin: 0 0 18px; text-align: center; }
  .chave { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: -1px; }
  .chave.azul { background: #008CCC; }
  .chave.roxo { background: #8E44AD; }

  table { width: 100%; border-collapse: collapse; }
  th { background: #C7E6E3; border: 1px solid #A9D4D0; padding: 6px; font-size: 9pt;
       text-align: left; text-transform: uppercase; letter-spacing: .4px; }
  td { border: 1px solid #A9D4D0; padding: 5px 6px; font-size: 10.5pt; }
  tr { page-break-inside: avoid; }
  /* As colunas estreitas cediam largura de menos ao nome, e nomes como
     "Ir∴ Fernando Luiz de Oliveira Aguiar" quebravam em tres linhas.
     Num quadro de mural, uma linha por Irmao. */
  td.pos { width: 28px; text-align: center; color: #4A6168; font-size: 9pt; }
  td.nome { font-weight: 600; white-space: nowrap; }
  td.grau { width: 74px; color: #4A6168; font-size: 9.5pt; }
  td.barra { width: 150px; }
  td.pct { width: 56px; text-align: right; font-weight: 700; }
  td.conta { width: 60px; text-align: center; color: #4A6168; font-size: 9.5pt; }

  .trilho { height: 12px; background: #EDF6F5; border-radius: 6px; overflow: hidden; }
  .preenche { height: 100%; border-radius: 6px; }

  .rodape { margin-top: 14px; border-top: 1px solid #A9D4D0; padding-top: 6px;
            font-size: 8pt; color: #4A6168; text-align: center; }
</style></head><body>

  <div class="topo">
    ${img1 ? `<img src="${img1}" alt="">` : '<div style="width:74px"></div>'}
    <div class="centro">
      <h1>${esc(cfg.loja_nome || 'Loja Maçônica')}</h1>
      <p>${[cfg.potencia, cfg.oriente, cfg.rito].filter(Boolean).map(esc).join(' &middot; ')}</p>
    </div>
    ${img2 ? `<img src="${img2}" alt="">` : '<div style="width:74px"></div>'}
  </div>

  <h2>FREQUÊNCIA DOS OBREIROS</h2>
  <div class="periodo">${esc(periodo)} &middot; ${est.total_sessoes} sessão(ões) com chamada registrada</div>

  <div class="resumo">
    <div><strong>${est.total_sessoes}</strong><span>Sessões</span></div>
    <div><strong>${est.quadro}</strong><span>Obreiros no quadro</span></div>
    <div><strong>${est.media_presentes}</strong><span>Média de presentes</span></div>
    <div><strong>${est.percentual_medio}%</strong><span>Comparecimento médio</span></div>
    <div class="visita"><strong>${est.total_visitantes || 0}</strong><span>Visitantes recebidos</span></div>
  </div>

  ${est.total_visitantes ? `
  <p class="visitas">
    A Loja recebeu <strong>${est.total_visitantes}</strong> visitante(s) em
    ${est.sessoes_com_visita} das ${est.total_sessoes} sessões — média de
    ${est.media_visitantes} por sessão.
    ${est.melhor_visita ? `Mais visitada: ${esc(dataExtenso(est.melhor_visita.data))},
      com ${est.melhor_visita.visitantes}.` : ''}
  </p>` : ''}

  ${est.sessoes.length ? `
  <div class="grafico">
    <h3>Presentes no Templo, sessão a sessão</h3>
    ${graficoSvg(est.sessoes)}
  </div>
  <p class="nota">
    <span class="chave azul"></span> Irmãos do quadro
    &nbsp;&nbsp;<span class="chave roxo"></span> visitantes de outras Lojas
    &nbsp;&middot;&nbsp; a linha tracejada marca a média de presentes do quadro.
  </p>` : ''}

  <table>
    <thead><tr>
      <th>#</th><th>Obreiro</th><th>Grau</th><th>Frequência</th><th>%</th><th>Sessões</th>
    </tr></thead>
    <tbody>
      ${linhas || '<tr><td colspan="6" style="text-align:center;color:#4A6168">Nenhuma chamada registrada ainda.</td></tr>'}
    </tbody>
  </table>

  <div class="rodape">
    ${esc(cfg.loja_nome || '')} &middot; Documento gerado pelo CtrLoja em ${esc(new Date().toLocaleString('pt-BR'))}
  </div>

</body></html>`;
}

/**
 * Gera o PDF no caminho indicado.
 * Recebe o BrowserWindow do Electron por parametro para que este modulo
 * continue testavel sem abrir janela nenhuma.
 */
/* Altura util de uma folha A4 com as margens de 8mm: 281mm em pixels de
   CSS, que valem 1/96 de polegada cada. */
const ALTURA_FOLHA_MM = 281;
const PX_POR_MM = 96 / 25.4;
const ALTURA_FOLHA_PX = ALTURA_FOLHA_MM * PX_POR_MM;

/* Abaixo disto o espaco anulado vira um risco solto em vez de uma area:
   melhor sumir com ele. */
const ALTURA_MINIMA_ANULADO = 30;

/**
 * Quantas folhas tem o PDF gerado.
 *
 * Conta os objetos de pagina direto no arquivo. Poderia ser feito com
 * uma biblioteca de PDF, mas nao vale trazer uma dependencia inteira
 * para contar paginas de um arquivo que nos mesmos acabamos de gerar.
 * O "(?!s)" evita confundir /Type /Page com /Type /Pages, que e a
 * arvore de paginas e aparece uma vez so.
 */
function contarPaginas(pdf) {
  const achados = Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page(?!s)/g);
  return achados ? achados.length : 1;
}

async function imprimir(BrowserWindow, destino, html, opcoes) {
  opcoes = opcoes || {};

  const janela = new BrowserWindow({
    show: false,
    // O JavaScript so e ligado quando ha altura a medir. O HTML e nosso
    // e todo o conteudo do banco vai escapado - nao ha nada de fora
    // para ser executado aqui.
    webPreferences: { offscreen: true, javascript: !!opcoes.medir, sandbox: true }
  });

  try {
    await janela.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    const imprimirAgora = () => janela.webContents.printToPDF({
      pageSize: 'A4',
      landscape: !!opcoes.paisagem,
      printBackground: true,
      margins: { marginType: 'none' }
    });

    let pdf = await imprimirAgora();

    /*
     * A assinatura tem de cair no pe da ULTIMA folha - e sem inventar
     * uma folha a mais so para ela.
     *
     * Quem empurra a assinatura para baixo e a altura do espaco anulado.
     * A primeira tentativa foi calcular essa altura medindo o conteudo,
     * e deu errado: a conta ignorava o espaco DESPERDICADO nas quebras
     * de pagina. Uma tabela que nao cabe no fim da folha pula inteira
     * para a seguinte, e aqueles centimetros vazios nao aparecem em
     * medida nenhuma do documento. O resultado foi uma terceira folha.
     *
     * Agora nao se estima: procura-se. Imprime-se com o espaco anulado
     * no minimo para descobrir de quantas folhas o documento precisa de
     * verdade, e depois busca-se por bisseccao a MAIOR altura que ainda
     * cabe nesse numero de folhas. Sao poucas impressoes, todas rapidas,
     * e o resultado e exato em vez de aproximado.
     */
    if (opcoes.medir) {
      const ajustar = (altura) => janela.webContents.executeJavaScript(
        `(function () {
           var a = document.querySelector('.anulado');
           if (!a) return;
           a.style.flex = '0 0 auto';
           a.style.minHeight = '0';
           a.style.height = ${altura} + 'px';
           a.style.display = ${altura} < ${ALTURA_MINIMA_ANULADO} ? 'none' : '';
         }())`
      );

      await ajustar(0);
      pdf = await imprimirAgora();
      const folhas = contarPaginas(pdf);

      let menor = 0;                                   // cabe, ja conferido
      let maior = folhas * ALTURA_FOLHA_PX;            // certamente nao cabe

      for (let volta = 0; volta < 10 && maior - menor > 4; volta++) {
        const meio = Math.floor((menor + maior) / 2);
        await ajustar(meio);
        const tentativa = await imprimirAgora();
        if (contarPaginas(tentativa) === folhas) {
          menor = meio;
          pdf = tentativa;                             // guarda a melhor ate agora
        } else {
          maior = meio;
        }
      }
    }

    fs.writeFileSync(destino, pdf);
    return { arquivo: destino, bytes: pdf.length, folhas: contarPaginas(pdf) };
  } finally {
    janela.destroy();
  }
}

/** Lista de presenca da sessao, para assinar e arquivar. */
function gerar(BrowserWindow, destino, dados, cfg, logos) {
  // medir: a assinatura tem de cair no pe da ultima folha
  return imprimir(BrowserWindow, destino, montarHtml(dados, cfg, logos), { medir: true });
}

/** Relatorio de frequencia, para imprimir e afixar no mural. */
function gerarFrequencia(BrowserWindow, destino, est, cfg, logos) {
  // Sem assinatura, nada a ancorar: o conteudo flui e pronto.
  return imprimir(BrowserWindow, destino, montarHtmlFrequencia(est, cfg, logos));
}

module.exports = {
  gerar, gerarFrequencia,
  montarHtml, montarHtmlFrequencia, graficoSvg, dataExtenso, abreviarGrau,
  contarPaginas, ALTURA_FOLHA_MM, ALTURA_FOLHA_PX, ALTURA_MINIMA_ANULADO,
  // Reaproveitados por outros documentos, para nao existirem duas
  // maneiras de gerar PDF nem duas de escapar texto do banco.
  imprimir, imagemEmbutida, esc
};
