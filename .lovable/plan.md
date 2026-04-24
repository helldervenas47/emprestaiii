
# Como configurar o Assistente Financeiro do WhatsApp

Aqui está o passo a passo para deixar o assistente respondendo no seu WhatsApp. A infraestrutura já está pronta no app — falta só conectar ao painel da Whatsmiau e autorizar seu número.

## Passo 1 — Abrir o card do Assistente no app

1. Vá em **Relatórios** (no menu principal)
2. Aba **Cobrança WhatsApp**
3. Role até o card **"Assistente Financeiro WhatsApp"** (ícone de robô 🤖)

## Passo 2 — Autorizar seu número

No card, na seção **"Adicionar número autorizado"**:

1. Digite seu telefone com **DDD** (ex: `11999999999`) — o `+55` é adicionado automaticamente
2. Apelido é opcional (ex: "Meu celular")
3. Clique em **Autorizar**

⚠️ Só números nessa lista conseguem conversar com a IA. Mantenha curto por segurança (você pediu modo só-admin).

## Passo 3 — Copiar a URL do Webhook

Ainda no card, há uma caixa cinza no topo com a **URL do Webhook**:

```
https://tovwnqbjeaecwtymbncy.supabase.co/functions/v1/whatsapp-assistant-webhook
```

Clique no botão de **copiar** (ícone 📋) ao lado.

## Passo 4 — Configurar o Webhook na Whatsmiau

1. Acesse o painel da **Whatsmiau / Evolution API** (onde sua instância de WhatsApp está)
2. Entre na sua **instância conectada**
3. Procure o menu **"Webhook"** (ou Configurações → Webhook)
4. Configure:
   - **URL**: cole a URL copiada no passo 3
   - **Eventos**: marque **`messages.upsert`** (mensagem recebida)
   - **Webhook by Events**: pode deixar desativado (mandamos tudo pra mesma URL)
   - **Salvar**

## Passo 5 — Testar

Pelo seu WhatsApp (do número autorizado), envie uma mensagem para o **número da sua instância Whatsmiau** (não para você mesmo). Exemplos:

- "Quanto tenho a receber esse mês?"
- "Quais contratos estão vencidos?"
- "Qual meu lucro de hoje?"
- "Mostra os 5 maiores devedores"

A IA responde em alguns segundos com base nos seus dados reais (contratos, pagamentos, despesas, metas).

## Se não funcionar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Bot não responde nada | Webhook não chegou | Verifique no painel Whatsmiau se o evento `messages.upsert` está ativo e a URL está correta |
| "Número não autorizado" | Número diferente do cadastrado | Confira se o DDD+número no card bate com o que você usa no WhatsApp |
| Resposta com erro | Cobrança ainda com URL errada | A URL base da Whatsmiau (cobrança) ainda precisa ser corrigida — ver pendência anterior |
| Mensagem chega mas IA falha | Limite de IA / token | Veja logs da função `whatsapp-assistant-webhook` |

## Observação

O assistente usa a **mesma instância Whatsmiau** já cadastrada no app — não precisa criar instância nova. Ele só **lê mensagens recebidas** e **responde** usando a API que já está conectada.

Se quiser, depois posso:
- Adicionar comandos rápidos (ex: `/resumo`, `/vencidos`)
- Adicionar log visual das conversas no app
- Permitir que clientes consultem o próprio contrato
