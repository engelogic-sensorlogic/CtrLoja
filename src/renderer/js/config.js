'use strict';

const TIPOS_EVENTO = [
  ['aniversario_obreiro', 'Aniversário do Obreiro'],
  ['aniversario_cunhada', 'Aniversário da Cunhada'],
  ['aniversario_sobrinho', 'Aniversário do Sobrinho'],
  ['aniversario_sobrinha', 'Aniversário da Sobrinha'],
  ['iniciacao', 'Aniversário de Iniciação'],
  ['elevacao', 'Aniversário de Elevação'],
  ['exaltacao', 'Aniversário de Exaltação'],
  ['remissao', 'Aniversário de Remissão'],
  ['casamento', 'Aniversário de Casamento'],
  ['feriado_religioso', 'Datas Religiosas'],
  ['data_nacional', 'Datas Nacionais / Comemorativas'],
  ['efemeride', 'Efemérides Históricas'],
  ['maconica', 'Efemérides Maçônicas'],
  ['sessao', 'Sessões da Loja (Agenda da Loja)']
];

const DIAS_SEMANA_CFG = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];

App.views.config = {
  titulo: 'Configurações',
  subtitulo: 'Identificação da Loja, títulos, disparo e banco de dados',

  async render(alvo) {
    const cfg = await tentar(window.api.config.obter()) || {};
    App.config = cfg;
    const info = App.info || {};

    const campo = (rot, inp, dica) => el('label', { class: 'campo' }, [
      el('span', { text: rot }), inp,
      dica ? el('small', { style: 'color:var(--c-texto-suave);font-size:11px', text: dica }) : null
    ]);
    const txt = (nome, valor, ph) => el('input', { type: 'text', name: nome, value: valor || '', placeholder: ph || '' });

    /* --------- Identificação --------- */
    const cardLoja = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Identificação da Loja' }),
      campo('Nome da Loja', txt('loja_nome', cfg.loja_nome)),
      el('div', { class: 'linha' }, [
        campo('Sigla', txt('loja_sigla', cfg.loja_sigla)),
        campo('Numeral', txt('loja_numero', cfg.loja_numero)),
        campo('Potência', txt('potencia', cfg.potencia)),
        campo('Oriente', txt('oriente', cfg.oriente))
      ]),
      el('div', { class: 'linha' }, [
        campo('Rito', txt('rito', cfg.rito)),
        campo('Data de fundação', el('input', { type: 'date', name: 'fundacao_loja', value: (cfg.fundacao_loja || '').slice(0, 10) })),
        campo('Dia das sessões', txt('dia_reuniao', cfg.dia_reuniao)),
        campo('Horário', txt('hora_reuniao', cfg.hora_reuniao))
      ]),
      el('div', { class: 'linha' }, [
        campo('Templo', txt('templo', cfg.templo)),
        campo('CNPJ', txt('cnpj', cfg.cnpj))
      ])
    ]);

    /* --------- Títulos maçônicos --------- */
    const cardTitulos = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Títulos maçônicos usados nas mensagens' }),
      el('div', { class: 'linha' }, [
        campo('Obreiro', txt('titulo_obreiro', cfg.titulo_obreiro), 'Padrão: Ir.∴'),
        campo('Esposa', txt('titulo_cunhada', cfg.titulo_cunhada), 'Padrão: Cunhada'),
        campo('Filho', txt('titulo_sobrinho', cfg.titulo_sobrinho), 'Padrão: Sobrinho'),
        campo('Filha', txt('titulo_sobrinha', cfg.titulo_sobrinha), 'Padrão: Sobrinha')
      ])
    ]);

    /* --------- Disparo --------- */
    const selModo = el('select', { name: 'disparo_modo' });
    for (const [v, r] of [['revisao', 'Automático com revisão prévia'], ['automatico', '100% automático'], ['manual', 'Somente manual']]) {
      selModo.appendChild(el('option', { value: v, text: r, selected: cfg.disparo_modo === v }));
    }

    const diasSel = String(cfg.disparo_dias || '').split(',');
    const boxDias = el('div', { class: 'linha compacta' });
    const checksDias = [];
    for (const [v, r] of DIAS_SEMANA_CFG) {
      const c = el('input', { type: 'checkbox', value: v, checked: diasSel.includes(v), style: 'width:auto' });
      checksDias.push(c);
      boxDias.appendChild(el('label', { style: 'display:flex;align-items:center;gap:4px;font-size:12.5px' }, [c, el('span', { text: r })]));
    }

    const chkAgrupar = el('input', { type: 'checkbox', style: 'width:auto', checked: cfg.agrupar_mensagens === '1' });
    const chkAutoConectar = el('input', { type: 'checkbox', style: 'width:auto', checked: (cfg.wa_autoconectar || '1') === '1' });

    const habilitados = (() => { try { return JSON.parse(cfg.eventos_habilitados || '[]'); } catch { return []; } })();
    const boxEventos = el('div', { class: 'lista-check', style: 'max-height:230px' });
    const checksEventos = [];
    for (const [v, r] of TIPOS_EVENTO) {
      const c = el('input', { type: 'checkbox', value: v, checked: habilitados.includes(v) });
      checksEventos.push(c);
      boxEventos.appendChild(el('label', {}, [c, el('span', { text: r })]));
    }

    const cardDisparo = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Rotina de disparo' }),
      el('div', { class: 'linha' }, [
        campo('Modo', selModo),
        campo('Horário', el('input', { type: 'time', name: 'disparo_hora', value: cfg.disparo_hora || '07:30' })),
        campo('Intervalo entre mensagens (ms)', el('input', { type: 'number', name: 'intervalo_envio_ms', value: cfg.intervalo_envio_ms || '4000', min: 1000, step: 500 })),
        campo('Antecedência do painel (dias)', el('input', { type: 'number', name: 'antecedencia_aviso', value: cfg.antecedencia_aviso || '30', min: 1 }))
      ]),
      el('label', { class: 'campo' }, [el('span', { text: 'Dias da semana em que a rotina roda' }), boxDias]),
      el('label', { style: 'display:flex;align-items:center;gap:8px;margin:10px 0' }, [
        chkAgrupar, el('span', { text: 'Agrupar todos os eventos do dia em uma única mensagem' })
      ]),
      el('label', { style: 'display:flex;align-items:center;gap:8px;margin:10px 0' }, [
        chkAutoConectar, el('span', { text: 'Conectar o WhatsApp automaticamente ao abrir o aplicativo (necessário para o disparo 100% automático)' })
      ])
    ]);


    const cardEventos = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Tipos de evento habilitados para envio' }),
      boxEventos
    ]);

    /* --------- Banco de dados --------- */
    const cardBanco = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Banco de dados' }),
      el('p', { style: 'font-size:12.5px;color:var(--c-texto-suave)', text: `Arquivo local: ${info.bancoPath || ''}` }),
      el('div', { class: 'linha compacta' }, [
        el('button', {
          class: 'btn', text: '⬇ Exportar banco de dados',
          onclick: async () => {
            const r = await tentar(window.api.backup.exportar(), 'Falha ao exportar');
            if (r && !r.cancelado) toast(`Backup salvo em ${r.arquivo}`, 'ok', 7000);
          }
        }),
        el('button', {
          class: 'btn secundario', text: '⬆ Importar (substituir)',
          onclick: async () => {
            if (!await confirmar('A importação irá SUBSTITUIR os obreiros, familiares, grupos e calendário atuais. Deseja continuar?')) return;
            const r = await tentar(window.api.backup.importar('substituir'), 'Falha ao importar');
            if (r && !r.cancelado) { toast('Importação concluída.', 'ok'); recarregarView(); }
          }
        }),
        el('button', {
          class: 'btn secundario', text: '⬆ Importar (mesclar)',
          onclick: async () => {
            const r = await tentar(window.api.backup.importar('mesclar'), 'Falha ao importar');
            if (r && !r.cancelado) { toast('Importação concluída.', 'ok'); recarregarView(); }
          }
        })
      ]),
      el('div', { class: 'aviso info', style: 'margin-top:12px', html: 'Use <strong>Exportar</strong> para gerar um arquivo <code>.ctrloja</code> e levar os dados para outra instalação do programa em outro computador.' })
    ]);

    /* --------- Senhas dos Cargos (aplicativo do celular) --------- */
    /*
       Fica FORA do formulário de propósito: estes campos não podem
       entrar no FormData e virar configuração gravada em texto.
       O que se grava é só a impressão digital da senha.
    */
    const CARGOS_APP = [
      ['chancelaria', 'Chancelaria', 'Agenda, efemérides e mensagens'],
      ['secretaria', 'Secretaria', 'Balaústres, presenças e correspondência'],
      ['tesouraria', 'Tesouraria', 'Mensalidades, caixa e prestação de contas'],
      ['hospitalaria', 'Hospitalaria', 'Tronco de beneficência e assistência']
    ];

    const boxCargos = el('div');

    async function pintarCargos() {
      const estado = await tentar(window.api.cargos.estado()) || [];
      const mapa = {};
      for (const e of estado) mapa[e.cargo] = e.definida;

      boxCargos.innerHTML = '';
      const tbody = el('tbody');

      for (const [chave, nome, descricao] of CARGOS_APP) {
        const definida = !!mapa[chave];
        const entrada = el('input', {
          type: 'password', placeholder: definida ? 'digite para trocar…' : 'defina uma senha…',
          autocomplete: 'new-password'
        });

        const aplicar = async () => {
          const valor = entrada.value.trim();
          if (valor.length < 4) { toast('A senha precisa ter pelo menos 4 caracteres.', 'erro'); return; }
          const r = await tentar(window.api.cargos.definirSenha(chave, valor), 'Falha ao definir a senha');
          if (!r) return;
          entrada.value = '';
          toast(`Senha da ${nome} definida.`, 'ok');
          if (r.fraca) toast('Senha curta. Prefira algo com 10 caracteres ou mais.', '', 7000);
          pintarCargos();
        };

        entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); aplicar(); } });

        tbody.appendChild(el('tr', {}, [
          el('td', { style: 'width:150px' }, [
            el('div', { style: 'font-weight:600', text: nome }),
            el('small', { style: 'color:var(--c-texto-suave)', text: descricao })
          ]),
          el('td', {
            style: `width:110px;font-weight:600;color:${definida ? 'var(--c-ok)' : 'var(--c-erro)'}`,
            text: definida ? '🔒 protegido' : '🔓 aberto'
          }),
          el('td', {}, [entrada]),
          el('td', { style: 'width:210px' }, [
            el('div', { class: 'linha compacta' }, [
              el('button', { class: 'btn', text: definida ? 'Trocar' : 'Definir', onclick: aplicar }),
              definida ? el('button', {
                class: 'btn secundario', text: 'Remover',
                onclick: async () => {
                  if (!await confirmar(`Remover a senha da ${nome}? O cargo ficará aberto a qualquer Irmão que tenha o aplicativo.`)) return;
                  const r = await tentar(window.api.cargos.definirSenha(chave, ''), 'Falha ao remover');
                  if (r) { toast(`Senha da ${nome} removida.`, 'ok'); pintarCargos(); }
                }
              }) : null
            ])
          ])
        ]));
      }

      boxCargos.appendChild(el('table', {}, [tbody]));
    }

    const cardCargos = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Senhas dos Cargos — aplicativo do celular' }),
      el('p', {
        style: 'font-size:12.5px;color:var(--c-texto-suave);line-height:1.6;margin-top:0',
        html: 'A <strong>senha da Loja</strong> abre a agenda e todos os Irmãos a possuem — ela não separa o que é de cada Cargo. '
          + 'Cada Cargo tem a sua senha, entregue apenas ao oficial que o ocupa. '
          + 'Sem senha definida, o Cargo fica aberto no celular de qualquer Irmão.'
      }),
      boxCargos,
      el('div', { class: 'aviso info', style: 'margin-top:12px' , html:
        'A senha não é guardada em lugar nenhum: grava-se apenas a sua <strong>impressão digital</strong>. '
        + 'Nem este programa consegue mostrá-la de volta — só trocar ou remover. '
        + 'Depois de definir, publique com <code>publicar-dados.bat</code> para que os celulares recebam.' })
    ]);

    /* --------- Publicar para o celular --------- */
    /*
       O mesmo que o publicar-dados.bat fazia, agora sem sair do
       programa: ninguém precisa abrir pasta nem linha de comando.
       Fica FORA do formulário — a senha não pode virar configuração.
    */
    const boxPublicacao = el('div');

    async function pintarPublicacao() {
      const e = await tentar(window.api.publicacao.estado());
      boxPublicacao.innerHTML = '';
      if (!e) return;

      const escolherPasta = async () => {
        const r = await tentar(window.api.publicacao.escolherPasta(), 'Falha ao escolher a pasta');
        if (r && !r.cancelado) {
          toast('Pasta do projeto definida.', 'ok');
          pintarPublicacao();
        }
      };

      if (!e.disponivel) {
        boxPublicacao.appendChild(el('div', {
          class: 'aviso',
          html: 'Falta apontar <strong>onde fica o projeto CtrLoja</strong> neste computador — '
            + 'a pasta que contém, dentro dela, a subpasta <code>mobile</code>. '
            + 'Normalmente é a cópia do repositório.'
            + (e.escolhida ? '<br><br>A pasta guardada não serve mais: <code>' + esc(e.escolhida) + '</code>' : '')
        }));
        boxPublicacao.appendChild(el('div', { class: 'linha compacta' }, [
          el('button', { class: 'btn', text: '📂 Escolher a pasta do projeto', onclick: escolherPasta })
        ]));
        return;
      }

      boxPublicacao.appendChild(el('div', {
        class: e.ultima ? 'aviso info' : 'aviso',
        style: 'font-size:13px',
        text: e.ultima
          ? `Última publicação: versão ${e.ultima.versao}, em `
            + `${new Date(e.ultima.gerado_em).toLocaleString('pt-BR')} — `
            + `${(e.ultima.bytes / 1024).toFixed(1)} KB cifrados.`
          : 'Nada publicado ainda. O aplicativo do celular não tem dados para sincronizar.'
      }));

      boxPublicacao.appendChild(el('div', {
        style: 'font-size:12.5px;color:var(--c-texto-suave);margin:8px 0',
        text: 'Cargos com senha: ' + (e.protegidos.length ? e.protegidos.join(', ') : 'nenhum — os cargos ficam abertos no celular')
      }));

      // Onde grava, dito com todas as letras: rodando da copia local, a
      // pasta do projeto NAO e a pasta de onde o aplicativo executa.
      boxPublicacao.appendChild(el('div', {
        style: 'font-size:12px;color:var(--c-texto-suave);margin-bottom:10px',
        html: 'Publica em <code>' + esc(e.pasta) + '</code>'
      }));

      // O convite usa o mesmo endereço guardado na configuração
      if (e.endereco && !campoEndereco.value) campoEndereco.value = e.endereco;

      if (!e.temGit) {
        boxPublicacao.appendChild(el('div', {
          class: 'aviso', style: 'font-size:12.5px',
          html: 'Esta pasta não é um repositório Git, então o envio ao GitHub não aparece aqui. '
            + 'O pacote é gravado normalmente; envie depois pelo <code>publicar-github.bat</code> '
            + 'na pasta do projeto.'
        }));
      }

      boxPublicacao.appendChild(el('div', { class: 'linha compacta' }, [
        el('button', { class: 'btn', text: '📲 Publicar para o celular', onclick: () => pedirSenhaEPublicar(e) }),
        el('button', {
          class: 'btn secundario', text: '📂 Abrir a pasta publicada',
          onclick: () => window.api.app.abrirPasta(e.pasta)
        }),
        el('button', { class: 'btn secundario', text: '🔀 Trocar a pasta do projeto', onclick: escolherPasta })
      ]));
    }

    function pedirSenhaEPublicar(estado) {
      const senha = el('input', { type: 'password', placeholder: 'Senha da Loja', autocomplete: 'off' });
      const repetir = el('input', { type: 'password', placeholder: 'Repita a senha', autocomplete: 'off' });

      Modal.abrir({
        titulo: 'Publicar dados para o aplicativo do celular',
        largura: '620px',
        corpo: el('div', {}, [
          el('p', {
            style: 'font-size:13px;color:var(--c-texto-suave);line-height:1.6;margin-top:0',
            html: 'Os dados vão <strong>cifrados</strong> com esta senha. Use a MESMA que os Irmãos '
              + 'digitam no celular ao sincronizar — se trocar, todos terão de digitar a nova.'
          }),
          el('label', { class: 'campo' }, [el('span', { text: 'Senha da Loja' }), senha]),
          el('label', { class: 'campo' }, [el('span', { text: 'Repita a senha' }), repetir]),
          el('div', {
            class: 'aviso', style: 'font-size:12.5px',
            html: 'Isto grava o pacote na pasta do projeto. Para os Irmãos receberem, falta ainda '
              + '<strong>enviar ao GitHub</strong> — o botão aparece ao final.'
          })
        ]),
        botoes: [
          { texto: 'Cancelar', classe: 'secundario' },
          {
            texto: '📲 Publicar',
            classe: '',
            acao: async () => {
              if (senha.value.trim().length < 4) { toast('A senha precisa ter pelo menos 4 caracteres.', 'erro'); return; }
              if (senha.value !== repetir.value) { toast('As senhas não conferem.', 'erro'); return; }

              const r = await tentar(window.api.publicacao.publicar(senha.value), 'Falha ao publicar');
              if (!r) return;

              Modal.fechar();
              mostrarResultado(r, estado);
              pintarPublicacao();
            }
          }
        ]
      });
    }

    function mostrarResultado(r, estado) {
      const linhas = el('tbody');
      for (const [t, n] of Object.entries(r.resumo || {})) {
        linhas.appendChild(el('tr', {}, [
          el('td', { style: 'width:220px;font-weight:600', text: t }),
          el('td', { text: String(n) })
        ]));
      }

      Modal.abrir({
        titulo: 'Publicado com sucesso',
        largura: '620px',
        corpo: el('div', {}, [
          el('div', {
            class: 'aviso info',
            html: `Versão <strong>${r.versao}</strong> gerada — ${(r.bytes / 1024).toFixed(1)} KB cifrados.<br>`
              + 'Conferido: o arquivo abre com a senha e nenhum nome ficou em claro.'
          }),
          !r.protegidos.length ? el('div', {
            class: 'aviso',
            text: 'Nenhum cargo tem senha definida — no celular eles ficam abertos a qualquer Irmão. '
              + 'Defina acima, em Senhas dos Cargos, e publique de novo.'
          }) : null,
          el('p', { style: 'font-size:13px;margin:14px 0 6px;font-weight:600', text: 'Conteúdo publicado' }),
          el('table', {}, [linhas]),
          el('div', {
            class: 'aviso', style: 'margin-top:14px',
            html: (estado && estado.temGit)
              ? '<strong>Falta um passo:</strong> os Irmãos só recebem depois que isto for enviado '
                + 'ao GitHub. O botão abaixo abre a janela de envio, que vai pedir uma descrição do que mudou.'
              : '<strong>Falta um passo:</strong> os Irmãos só recebem depois que isto for enviado ao '
                + 'GitHub. Rode o <code>publicar-github.bat</code> na pasta do projeto.'
          })
        ]),
        botoes: [
          { texto: (estado && estado.temGit) ? 'Depois' : 'Fechar', classe: 'secundario' },
          (estado && estado.temGit) ? {
            texto: '🚀 Enviar ao GitHub agora',
            classe: '',
            acao: async () => {
              const r2 = await tentar(window.api.publicacao.abrirGithub(), 'Falha ao abrir o publicar-github.bat');
              if (!r2) return;
              Modal.fechar();
              toast('Janela de envio aberta. Descreva o que mudou e tecle ENTER.', 'ok', 8000);
            }
          } : null
        ].filter(Boolean)
      });
    }

    /* --------- Convite para os Irmãos --------- */
    /*
       Não existe programa que se mande ao celular e instale o atalho
       sozinho. O que resolve é o QR Code: o Irmão aponta a câmera e o
       próprio navegador oferece instalar.
    */
    const campoEndereco = el('input', {
      type: 'text', placeholder: 'https://…',
      style: 'font-family:Consolas,monospace;font-size:12.5px'
    });

    const cardConvite = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Convidar os Irmãos para instalar no celular' }),
      el('p', {
        style: 'font-size:12.5px;color:var(--c-texto-suave);line-height:1.6;margin-top:0',
        text: 'A folha traz um QR Code grande: o Irmão aponta a câmera, o navegador abre e '
          + 'oferece instalar o aplicativo. Leve impressa à sessão, ou mande o convite pelo grupo.'
      }),
      el('label', { class: 'campo' }, [
        el('span', { text: 'Endereço do aplicativo publicado' }),
        campoEndereco,
        el('small', {
          style: 'color:var(--c-texto-suave);font-size:11px',
          text: 'Precisa ser https:// — sem conexão segura o navegador não libera a criptografia.'
        })
      ]),
      el('div', { class: 'linha compacta' }, [
        el('button', {
          class: 'btn', text: '🖨 Folha de instalação (PDF)',
          onclick: async () => {
            const s = await tentar(window.api.publicacao.salvarEndereco(campoEndereco.value), 'Endereço inválido');
            if (!s) return;
            const r = await tentar(window.api.publicacao.convitePdf(), 'Falha ao gerar a folha');
            if (r && !r.cancelado) toast(`Folha salva em ${r.arquivo}`, 'ok', 8000);
          }
        }),
        el('button', {
          class: 'btn secundario', text: '💬 Copiar convite para o WhatsApp',
          onclick: async () => {
            const s = await tentar(window.api.publicacao.salvarEndereco(campoEndereco.value), 'Endereço inválido');
            if (!s) return;
            const r = await tentar(window.api.publicacao.conviteTexto(), 'Falha ao montar o convite');
            if (!r) return;
            try {
              await navigator.clipboard.writeText(r.texto);
              toast('Convite copiado. Cole no grupo da Loja.', 'ok', 6000);
            } catch (err) {
              Modal.abrir({
                titulo: 'Convite para o grupo da Loja',
                largura: '640px',
                corpo: el('pre', {
                  style: 'white-space:pre-wrap;font-size:13px;line-height:1.5;background:#F7FCFC;'
                    + 'border:1px solid var(--c-borda);border-radius:8px;padding:12px;margin:0',
                  text: r.texto
                }),
                botoes: [{ texto: 'Fechar', classe: 'secundario' }]
              });
            }
          }
        })
      ]),
      el('div', {
        class: 'aviso info', style: 'margin-top:12px;font-size:12.5px',
        html: 'A <strong>senha da Loja não vai</strong> na folha nem no convite — ela é combinada '
          + 'de viva voz em sessão. Mandá-la junto do endereço anularia a razão de o pacote ser cifrado.'
      })
    ]);

    const cardPublicacao = el('div', { class: 'cartao' }, [
      el('h3', { text: 'Publicar para o aplicativo do celular' }),
      el('p', {
        style: 'font-size:12.5px;color:var(--c-texto-suave);line-height:1.6;margin-top:0',
        text: 'Sempre que alterar Obreiros, sessões, modelos, presenças ou as senhas dos Cargos, '
          + 'publique para que os celulares recebam. Os dados vão cifrados; sem a senha, '
          + 'o arquivo no repositório não passa de texto embaralhado.'
      }),
      boxPublicacao
    ]);

    /* --------- Montagem --------- */
    const form = el('form', { id: 'formConfig' }, [cardLoja, cardTitulos, cardDisparo, cardEventos]);

    const avisoPendente = el('div', {
      class: 'aviso', style: 'display:none',
      text: 'Há alterações não salvas. Clique em "Salvar configurações" para que passem a valer.'
    });

    let alterado = false;
    function marcarPendencia() {
      avisoPendente.style.display = alterado ? '' : 'none';
      btnSalvarRodape.classList.toggle('perigo', alterado);
      btnSalvarRodape.textContent = alterado ? '💾 Salvar configurações (pendente)' : '💾 Salvar configurações';
    }

    const btnSalvarRodape = el('button', { class: 'btn', text: '💾 Salvar configurações', onclick: () => salvarConfig() });

    form.addEventListener('input', () => { alterado = true; marcarPendencia(); });
    form.addEventListener('change', () => { alterado = true; marcarPendencia(); });

    form.appendChild(el('div', { class: 'cartao' }, [
      avisoPendente,
      el('div', { class: 'linha compacta' }, [btnSalvarRodape])
    ]));

    alvo.innerHTML = '';
    alvo.appendChild(form);
    alvo.appendChild(cardCargos);
    alvo.appendChild(cardPublicacao);
    alvo.appendChild(cardConvite);
    alvo.appendChild(cardBanco);
    await pintarCargos();
    await pintarPublicacao();

    async function salvarConfig() {
      const fd = new FormData(form);
      const mapa = {};
      for (const [k, v] of fd.entries()) mapa[k] = v;
      mapa.disparo_dias = checksDias.filter((c) => c.checked).map((c) => c.value).join(',') || '0,1,2,3,4,5,6';
      mapa.agrupar_mensagens = chkAgrupar.checked ? '1' : '0';
      mapa.wa_autoconectar = chkAutoConectar.checked ? '1' : '0';
      mapa.eventos_habilitados = JSON.stringify(checksEventos.filter((c) => c.checked).map((c) => c.value));

      const novo = await tentar(window.api.config.salvar(mapa), 'Falha ao salvar configurações');
      if (novo) {
        App.config = novo;
        alterado = false;
        marcarPendencia();
        toast('Configurações salvas.', 'ok');
      }
    }

    acaoTopo('💾 Salvar configurações', salvarConfig, '');
  }
};
