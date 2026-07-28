# Roteiro de teste da integração com o WhatsApp

CtrLoja — A∴R∴L∴S∴ União Fraternal Rolandense nº 141

> Siga na ordem. Cada etapa só deve ser feita depois que a anterior estiver funcionando.

---

## Antes de começar

| Requisito | Observação |
|-----------|------------|
| Celular com o WhatsApp da Loja | O aparelho precisa ficar **com internet** enquanto o CtrLoja envia |
| Internet no PC | A primeira execução baixa componentes adicionais |
| **Um grupo de teste** | Crie no WhatsApp um grupo só seu (ou com 1 Irmão de confiança) chamado, por exemplo, **"CtrLoja — Testes"** |

> **Nunca faça os primeiros testes no grupo oficial da Loja.** Só aponte para o grupo real depois que tudo estiver validado.

---

## Etapa 1 — Instalar o modo completo

Feche o CtrLoja e dê **duplo clique** em:

```
rodar-completo.bat
```

(equivale a `rodar.bat completo` no prompt)

A primeira execução baixa a biblioteca de integração (alguns minutos). Nas próximas vezes é imediato.

**Como saber que deu certo:** na aba **WhatsApp** não aparece mais o aviso amarelo de "modo interface", e sim o botão **Conectar WhatsApp**.

---

## Etapa 2 — Conectar a conta (QR Code)

1. Abra a aba **WhatsApp** → **Conectar WhatsApp**
2. Aguarde de 10 a 40 segundos até o QR Code aparecer
3. No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho**
4. Aponte a câmera para o QR Code na tela

**Como saber que deu certo:** a etiqueta na barra lateral fica verde — *WhatsApp conectado* — e aparece o número/nome da conta.

> O QR só é lido **uma vez**. A sessão fica gravada em `%APPDATA%\CtrLoja\wa-session`.

---

## Etapa 3 — Teste sem risco: mensagem para você mesmo

Ainda na aba WhatsApp, clique em **🧪 Teste para mim mesmo**.

O CtrLoja envia uma mensagem para a sua própria conversa ("Mensagem para mim mesmo"), sem tocar em nenhum grupo.

**Como saber que deu certo:** a mensagem chega no celular em poucos segundos, com o negrito e o itálico corretamente formatados.

Se falhar aqui, **pare** e resolva antes de continuar — o problema é de conexão, não de configuração da agenda.

---

## Etapa 4 — Escolher o grupo de destino

1. Clique em **Atualizar lista de grupos** — o CtrLoja lê os grupos da conta
2. Marque **apenas o grupo de teste**
3. Clique em **Salvar seleção**

---

## Etapa 5 — Teste no grupo

Clique em **Teste nos grupos selecionados** e confirme.

**Como saber que deu certo:** a mensagem aparece no grupo de teste.

---

## Etapa 6 — Teste de ponta a ponta com um evento real

Agora se testa o caminho completo: agenda → modelo → mensagem → grupo.

1. Aba **Obreiros** → **+ Novo Obreiro**
2. Preencha:
   - Nome: `TESTE — Irmão Fictício`
   - **Nascimento: use a data de HOJE**, mudando só o ano (ex.: 1980, mês e dia de hoje)
   - Adicione um familiar: **Cunhada**, nome `TESTE — Cunhada`, também com a data de hoje
3. Salve
4. Aba **Agenda** — os dois eventos devem aparecer, com as mensagens já montadas e a idade calculada
5. Revise o texto (pode editar direto na caixa)
6. Clique em **📤 Enviar aos grupos selecionados** e confirme

**Como saber que deu certo:** as duas mensagens chegam no grupo de teste, com os títulos corretos — *Ir∴* e *Cunhada*.

7. Aba **Histórico** — confira os registros com status *enviado*
8. **Apague o obreiro de teste** ao final

---

## Etapa 7 — Testar as datas do calendário

Na aba **Agenda**, mude a data de referência para conferir mensagens de efemérides sem precisar esperar:

| Data | O que deve aparecer |
|------|---------------------|
| `04/09` | Aniversário da UFR nº 141 |
| `20/08` | Dia do Maçom |
| `24/06` | São João Batista + Grande Loja de Londres + Solstício |
| `25/01` | Aniversário da GLP |
| `07/09` | Independência do Brasil |

Só **visualize** — não envie, para não poluir o grupo.

---

## Etapa 8 — Colocar em produção

Depois que tudo estiver validado:

1. Aba **WhatsApp** → marque o **grupo oficial da Loja** e salve a seleção
2. Aba **Configurações** → confira:
   - **Modo:** *Automático com revisão prévia* (recomendado no início)
   - **Horário:** ex. `07:30`
   - **Tipos de evento habilitados:** desmarque o que não quiser publicar
3. Deixe o CtrLoja aberto no computador — no horário definido ele monta a fila e avisa

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| QR Code não aparece | Sem internet no PC | Verifique a conexão e use *Reiniciar conexão* |
| Fica em "autenticando" e não conclui | Celular sem internet | Verifique o aparelho e reconecte |
| "WhatsApp não conectado" ao enviar | Sessão caiu | Aba WhatsApp → Conectar novamente |
| Desconecta sozinho com frequência | Sessão removida no celular | Confira em *Aparelhos conectados* se o CtrLoja continua lá |
| Mensagem sai sem negrito | Asteriscos removidos do modelo | Use `*texto*` para negrito e `_texto_` para itálico |
| Erro de GPU ao abrir | Projeto em unidade de rede | Use `rodar.bat local` |
| App diz "Conectado" mas não lista grupos | Sessão inconsistente | Clique em **🩺 Diagnóstico** e, se preciso, **Limpar sessão e reconectar** |
| "A sessão foi encerrada no celular" | O CtrLoja foi removido em *Aparelhos conectados* | **Limpar sessão e reconectar** |

---

## Cuidados importantes

- **Volume:** o WhatsApp pode bloquear contas que disparam muitas mensagens em sequência. O CtrLoja já espera 4 segundos entre envios (ajustável em Configurações). Evite reduzir esse intervalo.
- **Conta:** prefira usar o número institucional da Loja, não o seu pessoal.
- **Duplicidade:** o CtrLoja registra o disparo do dia e avisa se você tentar enviar de novo na mesma data.
- **Backup:** antes de mexer em muita coisa, faça *Configurações → Exportar banco de dados*.
