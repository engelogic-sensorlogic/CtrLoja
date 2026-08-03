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

1. No computador: **CtrLoja → Configurações → Exportar banco de dados**
2. Leve o arquivo `.ctrloja` para o celular (WhatsApp para si mesmo, e-mail, Drive, cabo)
3. No app: aba **Dados** → **Carregar novo arquivo**

Repita esse passo sempre que alterar o cadastro no computador.

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

## Atualizações do aplicativo

Quando eu alterar o código e você publicar no GitHub, o celular pega a nova versão sozinho na
próxima vez que abrir com internet. Não é preciso reinstalar.
