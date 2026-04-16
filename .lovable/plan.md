

## Objetivo
Após cada despesa registrada no Telegram (texto / foto / áudio), enviar a mensagem de confirmação com **botões inline**:
- **🗑️ Apagar** — remove a despesa imediatamente.
- **📂 Mudar categoria** — abre teclado com as categorias disponíveis. Ao escolher uma, atualiza a categoria da despesa.

## Como funciona

### 1. Mensagem de confirmação
Em vez de `tgSend(...)`, usar `tgSendWithKeyboard(...)` que envia `reply_markup.inline_keyboard`. Cada botão tem `callback_data` codificando ação + ID da despesa:

```
del:<expense_id>
cat:<expense_id>            ← abre lista de categorias
setcat:<expense_id>:<cat>   ← define categoria
```

Limite do Telegram: `callback_data` ≤ 64 bytes. UUID v4 (36 chars) + prefixo + categoria curta cabe.

### 2. Captura de callback queries
- Atualizar `telegram-poll`: incluir `'callback_query'` em `allowed_updates` e armazenar essas updates.
  - Hoje rows são filtrados por `u.message`. Adicionar branch para `u.callback_query` salvando `chat_id = callback_query.message.chat.id`, `text = null`, `raw_update` completo.
- Atualizar `telegram-process`: detectar `raw_update.callback_query` e tratar antes do fluxo normal de mensagens.

### 3. Handler de callback
No início do loop de processamento, se `raw_update.callback_query` existir:
1. Extrair `data` (string) e `id` (callback_query.id), e `message_id` para editar/responder.
2. Sempre responder primeiro com `answerCallbackQuery` (Telegram exige — remove "loading" do botão).
3. Verificar vínculo do chat → `telegram_links`. Se não vinculado, ignora.
4. Roteamento por prefixo:
   - `del:<id>` → `delete from expenses where id=? and user_id=?` → editar mensagem original com ✅ "Despesa removida".
   - `cat:<id>` → `editMessageReplyMarkup` para mostrar grade de categorias (botões `setcat:<id>:<cat>`).
   - `setcat:<id>:<cat>` → `update expenses set category=?` → editar mensagem original incluindo nova categoria + remover teclado.

### 4. Funções helper (em `telegram-process`)
- `tgSendWithKeyboard(chatId, text, keyboard, ...)` — POST `/sendMessage` com `reply_markup`.
- `tgEditMessage(chatId, messageId, text, keyboard?, ...)` — POST `/editMessageText`.
- `tgEditReplyMarkup(chatId, messageId, keyboard, ...)` — POST `/editMessageReplyMarkup`.
- `tgAnswerCallback(callbackId, text?, ...)` — POST `/answerCallbackQuery`.
- `buildExpenseKeyboard(expenseId)` → `[[{text:"📂 Mudar categoria", callback_data:`cat:${id}`}, {text:"🗑️ Apagar", callback_data:`del:${id}`}]]`
- `buildCategoryKeyboard(expenseId)` → grid 2 colunas com todas `CATEGORIES` + botão "❌ Cancelar" (`canc:<id>`).

### 5. Substituições nos 3 pontos de confirmação
Substituir as 3 chamadas `tgSend(... "✅/📸/🎤 ... Despesa registrada/extraída ..." ...)` por `tgSendWithKeyboard(...)` passando `buildExpenseKeyboard(data.id)`. Para isso, capturar o `id` do `.insert(...).select("id").single()`.

## Mudanças

**2 arquivos:**

1. `supabase/functions/telegram-poll/index.ts`
   - `allowed_updates: ['message', 'callback_query']`
   - Mapeamento de `rows`: aceitar callback_query (chat_id de `callback_query.message.chat.id`).

2. `supabase/functions/telegram-process/index.ts`
   - Novos helpers de keyboard / edit / callback acima.
   - Branch `if (raw_update.callback_query) { ... continue; }` no topo do loop.
   - Trocar 3 envios de confirmação por versão com keyboard, capturando `id` do insert.

## Detalhes técnicos
- `callback_data` máx 64 bytes: `setcat:<uuid>:<categoria>` — categorias longas como "Alimentação" + UUID + prefixo dão ~55 bytes. OK. Se algum extrapolar no futuro → trunca.
- `editMessageText` exige texto diferente do anterior (Telegram retorna erro se igual). Sempre incluir prefixo "✏️" ou "🗑️" para garantir mudança.
- Mensagem após apagar: substituímos o texto por `🗑️ *Despesa removida.*` (sem keyboard).
- `answerCallbackQuery` deve ser chamado mesmo em erro, senão o botão fica eternamente em loading.

## Sem alterações
- Schema do banco.
- UI do app, outros comandos, fluxo de orçamento.
- Hooks/tabelas existentes.

## Fora de escopo
- Botão "✏️ editar valor" — só categoria + apagar.
- Confirmação dupla antes de apagar — clique único deleta direto (alinhado com `/apagar`).
- Histórico/undo após apagar.

