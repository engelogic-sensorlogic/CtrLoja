# CtrLoja no celular — instalação e uso

A∴R∴L∴S∴ União Fraternal Rolandense nº 141

O aplicativo do celular serve para **consultar a agenda e enviar as mensagens manualmente**.
Ele monta o texto e entrega ao WhatsApp do próprio aparelho — quem envia é o WhatsApp, pelo
caminho oficial. Não há automação e não há risco de bloqueio da conta.

---

## Publicar uma vez (para usar em qualquer lugar)

Assim o aplicativo passa a ter um **endereço fixo**, instala na tela inicial como qualquer app
e funciona **fora de casa, sem VPN e sem o computador ligado**.

### 1. Ligar o GitHub Pages

1. Abra https://github.com/engelogic-sensorlogic/CtrLoja
2. **Settings** → menu lateral **Pages**
3. Em *Build and deployment* → *Source*: **Deploy from a branch**
4. *Branch*: **main** · pasta **/ (root)** → **Save**
5. Aguarde de 1 a 3 minutos

Pronto. O endereço passa a ser:

```
https://engelogic-sensorlogic.github.io/CtrLoja/mobile/
```

### 2. Instalar no celular

1. Abra o endereço acima no **Chrome** do celular
2. Menu (⋮) → **Instalar aplicativo** (ou *Adicionar à tela inicial*)
3. O ícone do esquadro e compasso aparece junto dos outros aplicativos

A partir daí você abre pelo ícone, sem digitar endereço.

### 3. Carregar os dados

**No computador**, sempre que alterar o cadastro:

```bat
publicar-dados.bat      :: gera o pacote CIFRADO em mobile\dados\
publicar-github.bat     :: envia ao repositório
```

**No celular**: aba **Dados** → **Buscar atualizações**. Na primeira vez ele pede a senha
combinada entre os Irmãos; depois disso o aparelho lembra.

O aplicativo consulta antes um arquivo de poucos bytes com a versão publicada. Se nada mudou,
ele avisa e não baixa nada.

> Também é possível carregar um arquivo `.ctrloja` à mão, pelo botão abaixo do Sincronizar.

---

## Segurança dos dados publicados

O pacote vai ao repositório **cifrado com AES-256**, com chave derivada da senha por PBKDF2
(310 mil iterações). Quem abrir o arquivo sem a senha vê apenas texto embaralhado.

| Vai cifrado | Nem chega a sair do computador |
|-------------|--------------------------------|
| Obreiros, famílias, datas | Histórico de envios |
| Calendário e sessões | Grupos do WhatsApp |
| Modelos de mensagem | Configurações internas e CNPJ |

A senha é combinada **de viva voz na Loja** e não aparece em lugar nenhum do código nem desta
documentação. Maiúsculas e espaços sobrando não importam.

Cuidados que valem lembrar:

- **Senha curta ou previsível é o elo fraco.** A cifra é forte; a senha é que decide.
  Palavras óbvias do vocabulário maçônico são as primeiras que alguém tentaria.
- Ao trocar a senha, republique com `publicar-dados.bat` e avise os Irmãos: os aparelhos
  vão pedir a nova na sincronização seguinte.
- A sincronização exige **HTTPS**. Pelo GitHub Pages funciona; pelo endereço de IP da rede
  local, não — o navegador não libera a criptografia fora de contexto seguro.

---

## O que fica público e o que não fica

| Vai para o GitHub Pages | Fica só no seu celular |
|-------------------------|------------------------|
| O código do aplicativo (já é público no repositório) | Nomes dos Irmãos, das Cunhadas e dos Sobrinhos |
| Layout, ícones, modelos de fábrica | Datas de nascimento, iniciação, casamento |
| — | Sessões programadas e grupos do WhatsApp |

**Os dados da Loja nunca são publicados.** Eles entram no aplicativo pelo arquivo que você
carrega e ficam no armazenamento do próprio aparelho. Se perder o celular, use a opção
*Apagar os dados deste celular* de outro modo — ou simplesmente saiba que os dados estão
protegidos pela senha de bloqueio do aparelho.

> Se preferir que nem o código fique público, a alternativa é servir a pasta pelo **Web Station
> do seu NAS** com HTTPS. Funciona igual, mas exige a VPN ligada quando estiver fora.

---

## Funciona sem internet?

Sim. Depois da primeira abertura, o aplicativo fica guardado no aparelho e os dados também.
Você pode consultar a agenda e montar as mensagens sem sinal. A internet só é necessária para
o WhatsApp de fato enviar.

---

## Emojis aparecendo como losango com "?"

Alguns aparelhos não têm a fonte de um emoji específico e mostram um quadrado no lugar —
foi o caso do 🏛️ (prédio clássico) usado na convocação de sessão.

Três pontos:

1. **É só exibição.** O caractere enviado ao WhatsApp está correto; cada aparelho o desenha
   com a fonte que tiver. O WhatsApp usa a própria fonte de emojis e costuma mostrar certo.
2. Confira como ficou **depois de enviar**, na conversa do WhatsApp — é o que os Irmãos verão.
3. Se ainda assim não gostar do resultado, troque o emoji no modelo pelo desktop
   (**Modelos → Sessão da Loja**) e rode o `sincronizar-modelos.bat`. Símbolos como
   `⚜` e `📅` costumam ter suporte mais amplo que `🏛️`.

---

## Como o aplicativo se divide

O aplicativo é entregue a **todos os Irmãos** da Loja, e por isso tem dois níveis.

### Início — aberto, somente leitura

Todo Irmão que sincronizou vê:

- os **eventos do dia** e a **Agenda do Dia** da sessão, quando houver;
- os **próximos 30 dias**, em lista, tocando para abrir a data.

Aqui não há texto de mensagem pronto nem botão de envio, e a relação de Obreiros com datas de
nascimento e nomes de família **não aparece**. É uma tela de consulta.

### Cargos — protegidos por senha

**Chancelaria**, **Secretaria**, **Tesouraria** e **Hospitalaria**. Dentro do Cargo é que ficam
as funções de trabalho: **disparar as mensagens** pelo WhatsApp, consultar a **relação de
Obreiros** e **solicitar inclusão** de informações.

Hoje só a Chancelaria tem telas próprias. As outras já aparecem na barra e oferecem o pedido de
inclusão; as demais funções entram conforme forem definidas.

---

## Senhas dos Cargos

A **senha da Loja** abre a agenda sincronizada — todos os Irmãos a possuem. Ela não serve,
portanto, para separar o que é de cada Cargo. Cada Cargo tem **a sua senha**, entregue apenas ao
oficial que o ocupa.

**Para definir**, no CtrLoja do computador: **Configurações → Senhas dos Cargos**. Depois rode o
`publicar-dados.bat` para que os celulares recebam.

O que viaja no pacote **não é a senha**, e sim a sua **impressão digital** (PBKDF2-SHA256 com sal
próprio). Nem o programa consegue mostrar de volta uma senha já definida — só trocar ou remover.
Assim, um Irmão que abriu o pacote com a senha da Loja continua sem conseguir ler a senha de um
Cargo que não é o dele.

O destravamento vale **enquanto o aplicativo estiver aberto**. Fechou, tranca de novo. Na aba
**Dados** há o botão para trancar antes disso.

Vale ser franco sobre o alcance: depois de sincronizados, os dados já estão no aparelho. A senha
do Cargo é a **tranca da porta**, não um cofre — ela impede que quem pegue o celular use as
funções do Cargo, que é o problema real. Cargo sem senha definida fica aberto a qualquer Irmão.

---

## Lista de Presença

**Fazer a chamada** — Chancelaria → aba **Presença**. Escolha a sessão, informe quem está fazendo
a chamada e toque no nome de cada Irmão presente. O contador acompanha ao vivo. Irmão
**Adormecido não aparece** na chamada, do mesmo modo que não recebe mensagem.

**Mandar ao PC Mestre** — o celular não grava no cadastro da Loja, então a lista volta por um
destes caminhos:

| Caminho | Quando usar |
|---------|-------------|
| **📤 WhatsApp** | No Templo, na hora. Mais rápido. |
| **💾 Arquivo `.presenca`** | Mais seguro: nada se perde se a mensagem for cortada. |

**Importar no computador** — tela **Presença** → **📥 Importar do celular**. Abre o arquivo ou
aceita o texto colado do WhatsApp. Antes de gravar, o CtrLoja mostra nome por nome o que vai
mudar. Nada entra no cadastro sem o seu aceite.

A mensagem do WhatsApp leva um código com uma **conferência**: se o texto chegar cortado ou
alterado, o computador recusa e pede o reenvio, em vez de gravar uma lista errada. O código não
contém nome nenhum — só números de cadastro e presente/ausente.

**Relatório** — na tela **Início**, aberta a todos os Irmãos: comparecimento sessão a sessão em
gráfico e a frequência de cada um. No computador, a mesma coisa com mais detalhe, e o
**PDF para arquivo físico** com o logo da Loja, data, grau, tipo de sessão e espaço para rubrica.

Uma regra atravessa tudo: **sessão sem chamada não é sessão com zero presentes**. Sessões que
ninguém chamou ficam fora das estatísticas, para não derrubar a média da Loja.

---

## Solicitar inclusão

O cadastro da Loja é um só e fica no computador; o celular não escreve nele. Dentro de qualquer
Cargo, a aba **Solicitar** monta um pedido bem formado — assunto, solicitante, a quem se refere,
data e detalhes — e entrega ao WhatsApp para você escolher o destinatário. Quem recebe lança no
CtrLoja e republica.

---

## Testar no computador antes de publicar

```bat
testar-celular.bat
```

Abre o aplicativo do celular em `http://localhost:8123/mobile/`. Por ser **localhost**, o
navegador libera a criptografia e tudo funciona igual ao endereço publicado — inclusive o
Sincronizar e as senhas dos Cargos. Abrir o `index.html` com duplo clique **não** funciona.

---

## Atualizações do aplicativo

Quando eu alterar o código e você publicar no GitHub, o celular pega a nova versão sozinho na
próxima vez que abrir com internet. Não é preciso reinstalar.
