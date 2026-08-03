# CtrLoja

**Gestor de Agenda e Comunicação Maçônica**
A∴R∴L∴S∴ União Fraternal Rolandense — **UFR** · Grande Loja Maçônica do Estado do Paraná — **GLP**

Aplicativo desktop (Windows) que mantém a agenda da Loja e dispara automaticamente as mensagens
de felicitação e as efemérides nos grupos de WhatsApp escolhidos, usando modelos de texto editáveis
e a terminologia maçônica correta (Ir∴, Cunhada, Sobrinho, Sobrinha).

---

## Recursos

- **Cadastro de Obreiros** com Nascimento, Iniciação, Elevação, Exaltação, Remissão e Casamento
- **Família do Obreiro**: Cunhada (esposa) e Sobrinhos / Sobrinhas (filhos), com data de nascimento
- **Calendário permanente**: feriados religiosos, datas nacionais, efemérides históricas gerais e
  datas históricas da Ordem Maçônica (fixas e móveis, com cálculo de Páscoa e de datas do tipo
  "2º domingo de maio")
- **Modelos de mensagem editáveis** com variáveis e pré-visualização em tempo real
- **Integração com o WhatsApp** por QR Code, com envio para um ou mais **grupos** selecionados
- **Disparo diário** em três modos: automático com revisão prévia, 100% automático ou manual
- **Banco de dados local SQLite**, com **exportação/importação** para replicar em outros computadores
- **Histórico de envios** completo
- Tema visual da Loja: `#C7E6E3` · `#008CCC` · `#FFFFFF` · `#000000`

---

## Por que WhatsApp Web e não a API oficial

A **WhatsApp Cloud API** (oficial, da Meta) **não permite enviar mensagens para grupos** — apenas para
contatos individuais que iniciaram conversa. Como o requisito do CtrLoja é publicar nos grupos da Loja,
o aplicativo usa o **Baileys**, que fala o protocolo multi-device do WhatsApp diretamente por
WebSocket — o mesmo mecanismo dos aparelhos conectados. Não abre navegador, não depende do
Chrome e não quebra quando o WhatsApp Web muda de versão. A sessão fica persistente em disco:
o QR Code é lido **uma única vez**.

> O celular pareado precisa permanecer com acesso à internet.

---

## Requisitos

| Item | Versão |
|------|--------|
| Windows | 10 ou 11 (x64) |
| Node.js | 20 LTS ou superior (apenas para compilar) |
| Inno Setup | 7.x (apenas para gerar o instalador) |

---

## Executar para testes

Basta dar dois cliques no **`rodar.bat`**:

| Comando | O que faz |
|---------|-----------|
| `rodar.bat` | **Modo padrão.** Instala tudo, inclusive a integração com o WhatsApp, sem compilar o módulo nativo do banco (usa o SQLite embutido no Electron). |
| **`rodar-completo.bat`** | O mesmo, executando do disco local e tentando compilar o `better-sqlite3`. |
| `rodar.bat local` | Copia o projeto para uma pasta local e roda de lá. Use quando o projeto estiver em unidade de rede/mapeada. |
| `rodar.bat testes` | Executa apenas os testes automatizados. |

No modo interface o aplicativo usa o **SQLite embutido no Electron** (`node:sqlite`), portanto
**não é necessário ter o Visual Studio Build Tools instalado**. Quando o `better-sqlite3`
estiver compilado, o CtrLoja o utiliza automaticamente por ser mais rápido.

### Instalação manual (equivalente)

```bat
git clone https://github.com/engelogic-sensorlogic/CtrLoja.git
cd CtrLoja
npm install --omit=optional
npm start
```

## Geração do instalador

```bat
build.bat            :: processo completo (recomendado)
build.bat app        :: apenas empacota (dist\win-unpacked)
build.bat setup      :: apenas compila o instalador (installer\CtrLoja.iss)
build.bat limpar     :: remove dist, node_modules e installer\Output
```

O `build.bat` executa, em ordem: localiza o Node.js, confere o ícone, instala **todas**
as dependências (inclusive o Baileys), prepara o módulo nativo, **roda os testes
automatizados** (build é interrompido se algum falhar), empacota, **verifica se a
integração do WhatsApp entrou no pacote** e compila o instalador.

Saídas:

- `dist\win-unpacked\CtrLoja.exe` — aplicativo empacotado
- `installer\Output\CtrLoja-Setup-1.0.0.exe` — instalador

**O instalador é autônomo.** O computador de destino não precisa de Node.js, navegador
ou qualquer pré-requisito: o Electron, o banco de dados e a integração com o WhatsApp
vão dentro do pacote.

### Ícone

`build/icon.ico` (esquadro e compasso sobre fundo azul, nos tamanhos 16 a 256 px) é usado em:

- janela do aplicativo e barra de tarefas
- arquivo do instalador (`CtrLoja-Setup-1.0.0.exe`)
- atalho da Área de Trabalho, do Menu Iniciar e da inicialização do Windows
- lista de programas instalados do Windows

---

## Modelos de mensagem: do aplicativo para o código-fonte

Os textos são editados na tela **Modelos**, dentro do aplicativo, e ficam gravados no banco
local. Para que o **instalador** já nasça com os textos definitivos da Loja, execute:

```bat
sincronizar-modelos.bat
```

Ele lê os modelos do banco em uso e regrava `src/main/db/templates-padrao.js`, mostrando o que
mudou e guardando uma cópia de segurança do arquivo anterior. Depois é só `git commit` e `build.bat`.

Também aceita um backup como origem:

```bat
sincronizar-modelos.bat "C:\caminho\CtrLoja-backup.ctrloja"
```

> Instalações existentes **não** têm seus textos sobrescritos — o seed só preenche modelos que
> ainda não existem. Para voltar aos textos de fábrica, use *Restaurar textos de fábrica* na tela Modelos.

---

## Rotina de disparo

| Modo | Comportamento |
|------|---------------|
| Automático com revisão prévia | No horário, monta a fila e abre a Agenda para você conferir e enviar |
| 100% automático | Envia sozinho, sem intervenção |
| Somente manual | Só dispara quando você clicar |

O modo 100% automático exige o aplicativo **aberto** e o WhatsApp **conectado**. Para isso:

- o instalador já marca **Iniciar o CtrLoja junto com o Windows**, e o atalho de inicialização
  abre o programa **minimizado** (`--minimizado`), sem atrapalhar quem acabou de ligar o computador;

- a opção *Conectar o WhatsApp automaticamente ao abrir* vem ligada;
- se o aplicativo abrir depois do horário, a rotina **recupera** o disparo do dia;
- se o WhatsApp ainda não estiver pronto, o envio fica pendente e é **refeito assim que conectar**;
- uma verificação a cada 5 minutos cobre o caso de o computador ter ficado suspenso;
- o registro de disparo do dia impede envio duplicado.

Em *Configurações → Situação da rotina de disparo* você acompanha o estado e pode usar
**Executar rotina agora** para testar sem esperar o horário.

---

## Aplicativo do celular (PWA)

Em `mobile/` há uma versão para celular, **somente consulta e disparo manual**. Ela monta a
mensagem e entrega o texto pronto ao WhatsApp do próprio aparelho — quem envia é o WhatsApp,
pelo caminho oficial. Sem automação, sem servidor, sem VPN.

**Os dados vêm do arquivo `.ctrloja`** exportado pelo desktop (Configurações → Exportar banco de
dados) e ficam guardados **apenas no celular**. Nada é publicado.

O detalhe que sustenta tudo: o app do celular **não tem cópia da lógica**. Ele carrega
`calendario.js`, `templates.js` e `agenda.js` do próprio `src/` do desktop e os executa no
navegador. A mensagem nasce do mesmo código nos dois lados, e `test/teste-mobile.js` compara os
dois caminhos byte a byte.

### Como servir

O app precisa ser servido por HTTP (não abre por `file://`), **a partir da raiz do projeto**,
porque busca os módulos em `../src/main/services/`.

| Forma | Comando / endereço | Observação |
|-------|--------------------|------------|
| Teste na rede local | `python -m http.server 8080` na raiz, depois `http://<ip-do-pc>:8080/mobile/` | Sem HTTPS: não instala como app nem abre a folha de compartilhamento; o botão Enviar cai no `wa.me` |
| GitHub Pages | Publicar o repositório; acessar `/CtrLoja/mobile/` | HTTPS grátis, instala na tela inicial. **Só o código é publicado — os dados nunca** |
| Synology Web Station | Pasta do projeto + HTTPS do DSM | Fica tudo na sua rede |

### Uso no celular

1. Abrir o endereço e, no menu do navegador, **Instalar aplicativo** / *Adicionar à tela inicial*
2. **Carregar o arquivo `.ctrloja`** exportado do computador
3. Aba **Hoje**: mensagens prontas, botão **Enviar** abre o WhatsApp com o texto
4. Ao alterar o cadastro no computador, exportar de novo e recarregar em **Dados**

---

## Logotipos

Coloque na **pasta raiz do aplicativo** (a mesma do `CtrLoja.exe`, ou a raiz do projeto em modo
desenvolvimento) os dois arquivos:

| Arquivo | Conteúdo |
|---------|----------|
| `Logo1.png` | Logotipo da Loja U∴F∴R∴ |
| `Logo2.png` | Logotipo da Maçonaria |

Extensões aceitas: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`.
Eles são exibidos no painel inicial e o `Logo1` também aparece na barra lateral.

---

## Estrutura do projeto

```
CtrLoja/
├─ build.bat                    Script de compilação e empacotamento
├─ installer/CtrLoja.iss        Script do Inno Setup 7
├─ build/icon.ico               Ícone do aplicativo
├─ Logo1.* / Logo2.*            Logotipos da Loja (fornecidos pelo usuário)
└─ src/
   ├─ main/                     Processo principal (Electron)
   │  ├─ main.js                Janela, ciclo de vida e canais IPC
   │  ├─ preload.js             Ponte segura com a interface
   │  ├─ db/
   │  │  ├─ schema.sql          Esquema do banco SQLite
   │  │  ├─ database.js         Camada de acesso a dados
   │  │  ├─ datas-padrao.js     Calendário permanente de fábrica
   │  │  └─ templates-padrao.js Modelos de mensagem de fábrica
   │  └─ services/
   │     ├─ calendario.js       Cálculo de datas (Páscoa, datas móveis, idades)
   │     ├─ agenda.js           Motor de eventos e montagem da fila do dia
   │     ├─ templates.js        Renderização das mensagens
   │     ├─ whatsapp.js         Integração Baileys (protocolo multi-device)
   │     ├─ scheduler.js        Rotina diária (node-cron)
   │     └─ backup.js           Exportação / importação do banco
   └─ renderer/                 Interface (HTML/CSS/JS)
```

---

## Onde ficam os dados

| Conteúdo | Local |
|----------|-------|
| Banco de dados | `%APPDATA%\CtrLoja\dados\ctrloja.db` |
| Sessão do WhatsApp | `%APPDATA%\CtrLoja\wa-session\` |

**Migrar para outro computador:** Configurações → *Exportar banco de dados* gera um arquivo
`.ctrloja`. Na nova instalação, use *Importar (substituir)* ou *Importar (mesclar)*.

---

## Variáveis dos modelos de mensagem

| Variável | Descrição |
|----------|-----------|
| `{{loja}}` `{{loja_sigla}}` `{{potencia}}` `{{oriente}}` | Identificação da Loja |
| `{{saudacao}}` | Bom dia / Boa tarde / Boa noite conforme o horário |
| `{{titulo}}` | Ir∴, Cunhada, Sobrinho ou Sobrinha |
| `{{nome}}` `{{primeiro_nome}}` | Nome da pessoa homenageada |
| `{{idade}}` | Idade que completa (aniversário natalício) |
| `{{anos}}` `{{anos_ordinal}}` | Anos completos do evento (ex.: `25` / `25º`) |
| `{{data}}` `{{data_extenso}}` `{{dia_semana}}` | Data do dia |
| `{{data_evento}}` `{{data_evento_extenso}}` | Data original do evento |
| `{{obreiro_titulo}}` `{{obreiro_nome}}` | Obreiro vinculado (mensagens de familiares) |
| `{{conjuge}}` | Nome da Cunhada (aniversário de casamento) |
| `{{evento}}` `{{descricao}}` `{{ano_origem}}` | Datas comemorativas e efemérides |
| `{{#campo}}…{{/campo}}` | Bloco exibido apenas se o campo tiver valor |
| `{{^campo}}…{{/campo}}` | Bloco exibido apenas se o campo estiver vazio |

Formatação do WhatsApp: `*negrito*`, `_itálico_`, `~tachado~`, ``` `mono` ```.

---

## Regras de datas móveis (calendário)

| Regra | Significado | Exemplo |
|-------|-------------|---------|
| `pascoa+N` / `pascoa-N` | N dias em relação ao Domingo de Páscoa | `pascoa+60` = Corpus Christi |
| `nth:O,D,M` | O-ésima ocorrência do dia D (0=domingo…6=sábado) no mês M | `nth:2,0,5` = 2º domingo de maio |
| `nth:-1,D,M` | Última ocorrência do dia D no mês M | `nth:-1,5,3` = última sexta de março |

---

## Licença

MIT — veja [LICENSE](LICENSE).

Desenvolvido por **Engelogic / SensorLogic** — Mario Cezar Paiva.
