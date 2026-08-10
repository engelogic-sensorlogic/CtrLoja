'use strict';

/**
 * Folha de convite: como instalar o aplicativo no celular.
 *
 * Nao existe programa que se mande ao celular e instale sozinho o
 * atalho - um .exe e do Windows, e nem um aplicativo Android criaria
 * atalho para um site sem ser, ele proprio, um aplicativo publicado na
 * loja.
 *
 * O que resolve de verdade e o QR Code: o Irmao aponta a camera, o
 * navegador abre e o proprio Chrome oferece "Instalar aplicativo". Dois
 * toques, sem digitar endereco.
 *
 * Esta folha e para imprimir e levar a sessao. O mesmo modulo monta o
 * convite em texto, para mandar no grupo do WhatsApp.
 */

const QRCode = require('qrcode');
const { imprimir, imagemEmbutida, esc } = require('./presenca-pdf');

const ENDERECO_PADRAO = 'https://engelogic-sensorlogic.github.io/CtrLoja/mobile/';

/** Imagem do QR Code embutida na folha, sem depender de arquivo. */
function gerarQr(endereco) {
  return QRCode.toDataURL(endereco, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 900,
    color: { dark: '#10262B', light: '#FFFFFF' }
  });
}

/**
 * Convite em texto, para o grupo do WhatsApp.
 *
 * A senha da Loja NAO entra aqui, de proposito: ela e combinada de viva
 * voz em sessao. Mandar a senha no mesmo lugar em que se manda o
 * endereco anularia a razao de o pacote ser cifrado.
 */
function mensagem(cfg, endereco) {
  return [
    '*AGENDA DA LOJA NO CELULAR*',
    cfg.loja_nome || '',
    '',
    'Meus Irmãos, o aplicativo da nossa Loja já está disponível.',
    'Nele vocês acompanham os eventos do dia, a Agenda da Loja, os próximos',
    'acontecimentos e o relatório de presença.',
    '',
    '1) Abra este endereço no Chrome do celular:',
    endereco || ENDERECO_PADRAO,
    '',
    '2) No menu do navegador, toque em *Instalar aplicativo*',
    '   (em alguns aparelhos: _Adicionar à tela inicial_).',
    '',
    '3) Abra o aplicativo, vá em *Dados* e toque em *Buscar atualizações*.',
    '   Será pedida a senha combinada entre nós em sessão.',
    '',
    'Os dados ficam guardados apenas no seu aparelho.',
    'T∴F∴A∴'
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/* ------------------------------------------------------------------ */

function montarHtml(endereco, qr, cfg, logos) {
  const img1 = imagemEmbutida(logos && logos.logo1);
  const img2 = imagemEmbutida(logos && logos.logo2);

  const passo = (n, titulo, texto) => `
    <li>
      <div class="n">${n}</div>
      <div class="t"><strong>${titulo}</strong><span>${texto}</span></div>
    </li>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Calibri, Arial, sans-serif; color: #10262B; font-size: 11pt; margin: 0; }

  .topo { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #008CCC; padding-bottom: 12px; }
  .topo img { height: 70px; width: auto; }
  .topo .centro { flex: 1; text-align: center; }
  .topo h1 { margin: 0; font-size: 14pt; line-height: 1.3; }
  .topo p { margin: 3px 0 0; font-size: 9.5pt; color: #4A6168; }

  h2 { text-align: center; font-size: 19pt; letter-spacing: 1.5px; margin: 20px 0 4px; color: #0070A6; }
  .chamada { text-align: center; font-size: 11pt; color: #4A6168; margin: 0 0 18px; }

  .qr { text-align: center; margin: 0 0 10px; }
  .qr img { width: 68mm; height: 68mm; border: 1px solid #A9D4D0; border-radius: 8px; padding: 5px; }

  .endereco {
    text-align: center; font-family: Consolas, "Courier New", monospace;
    font-size: 11.5pt; color: #0070A6; word-break: break-all;
    background: #E3F2F1; border: 1px solid #A9D4D0; border-radius: 6px;
    padding: 9px 12px; margin: 0 auto 20px; max-width: 150mm;
  }

  ol { list-style: none; padding: 0; margin: 0; max-width: 160mm; margin-left: auto; margin-right: auto; }
  li { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 13px; }
  li .n {
    flex: 0 0 26px; height: 26px; border-radius: 50%; background: #008CCC; color: #fff;
    text-align: center; line-height: 26px; font-weight: 700; font-size: 12pt;
  }
  li .t strong { display: block; font-size: 11.5pt; }
  li .t span { display: block; font-size: 10pt; color: #4A6168; line-height: 1.45; margin-top: 2px; }

  .nota {
    max-width: 160mm; margin: 18px auto 0; background: #FFF8E6; border: 1px solid #E8D9A8;
    border-radius: 6px; padding: 10px 13px; font-size: 9.5pt; color: #6B5A2B; line-height: 1.5;
  }

  .rodape { margin-top: 20px; border-top: 1px solid #A9D4D0; padding-top: 6px;
            font-size: 8pt; color: #4A6168; text-align: center; }
</style></head><body>

  <div class="topo">
    ${img1 ? `<img src="${img1}" alt="">` : '<div style="width:70px"></div>'}
    <div class="centro">
      <h1>${esc(cfg.loja_nome || 'Loja Maçônica')}</h1>
      <p>${[cfg.potencia, cfg.oriente, cfg.rito].filter(Boolean).map(esc).join(' &middot; ')}</p>
    </div>
    ${img2 ? `<img src="${img2}" alt="">` : '<div style="width:70px"></div>'}
  </div>

  <h2>A AGENDA DA LOJA NO SEU CELULAR</h2>
  <p class="chamada">Aponte a câmera do celular para o código abaixo</p>

  <div class="qr"><img src="${qr}" alt="QR Code"></div>
  <div class="endereco">${esc(endereco)}</div>

  <ol>
    ${passo(1, 'Aponte a câmera para o código',
    'O celular reconhece sozinho e oferece abrir o endereço. Não havendo leitura automática, '
    + 'digite o endereço acima no navegador Chrome.')}
    ${passo(2, 'Instale na tela inicial',
    'No menu do Chrome — os três pontinhos — toque em <strong>Instalar aplicativo</strong>. '
    + 'Em alguns aparelhos aparece como <em>Adicionar à tela inicial</em>. '
    + 'O ícone da Loja fica junto dos outros aplicativos.')}
    ${passo(3, 'Carregue a agenda',
    'Abra o aplicativo, vá na aba <strong>Dados</strong> e toque em <strong>Buscar atualizações</strong>. '
    + 'Será pedida a senha combinada entre os Irmãos em sessão. Só na primeira vez.')}
  </ol>

  <div class="nota">
    <strong>Sobre a senha.</strong> Ela é combinada de viva voz em sessão e não está escrita
    nesta folha nem em lugar nenhum do aplicativo. É ela que abre os dados dos Irmãos e das
    famílias, que viajam cifrados. Sem a senha, o arquivo publicado não passa de texto embaralhado.
    <br><br>
    <strong>Os dados ficam no seu aparelho.</strong> Nada é enviado para fora, e as mensagens
    saem pelo seu próprio WhatsApp.
  </div>

  <div class="rodape">
    ${esc(cfg.loja_nome || '')} &middot; Folha gerada pelo CtrLoja em ${esc(new Date().toLocaleString('pt-BR'))}
  </div>

</body></html>`;
}

/** Gera a folha em PDF, pronta para imprimir e distribuir. */
async function gerar(BrowserWindow, destino, endereco, cfg, logos) {
  const alvo = endereco || ENDERECO_PADRAO;
  const qr = await gerarQr(alvo);
  return imprimir(BrowserWindow, destino, montarHtml(alvo, qr, cfg, logos));
}

module.exports = { gerar, montarHtml, mensagem, gerarQr, ENDERECO_PADRAO };
