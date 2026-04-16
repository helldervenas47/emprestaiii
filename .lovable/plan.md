

## Objetivo
Adicionar um botão **"✏️ Editar valor"** ao keyboard de cada despesa registrada via Telegram. Ao clicar, o bot pede o novo valor por mensagem; a próxima mensagem numérica do usuário atualiza o valor da despesa.

## Como funciona

1. Novo botão no `buildExpenseKeyboard`: `[✏️ Editar valor] [📂 Mudar categoria] [🗑️ Apagar]` (3 botões em linha — cabe bem).
2. Clique em `✏️ Editar valor` (`callback_data: edit:<expenseId>`):
   - `answerCallbackQuery` com toast "Envie o novo valor".
   - Cria/atualiza um registro em nova tabela `telegram_pending_edits` com `(chat_id, expense_id, message_id, expires_at)` (TTL 5min).
   - Edita a mensagem original adicionando `_✏️ Aguardando novo valor..._` (sem keyboard, para não confundir).
3. Próxima mensagem do chat:
   - **Antes** do parser AI normal de despesa: verificar se há `telegram_pending_edits` ativo (não expirado) para esse `chat_id`.
   - Se sim: tenta parsear o texto como número (regex `^\s*R?\$?\s*([\d.,]+)\s*$` aceita `45`, `45,90`, `R$ 45.90`, `1.234,56`).
   - Se número válido: `update expenses set amount=? where id=? and user_id=?`, deletar o `pending_edit`, editar mensagem original com novo valor + restaurar keyboard, enviar reply curto "✅ Valor atualizado". Disparar `checkBudgetAndAlert`.
   - Se não for número válido: enviar "❌ Não entendi o valor. Envie só o número (ex: `45,90`) ou `/cancelar` para sair." (não consome o pending — usuário pode tentar de novo). Se enviar `/cancelar`, deleta pending e responde "✏️ Edição cancelada."
4. Pendings expirados (>5min) são ignorados e limpos no fluxo.

## Mudanças

### 1. Migração SQL — nova tabela `telegram_pending_edits`
```sql
create table public.telegram_pending_edits (
  chat_id bigint primary key,
  expense_id uuid not null,
  user_id uuid not null,
  message_id bigint not null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);
alter table public.telegram_pending_edits enable row level security;
create policy "Service role manages pending edits"
  on public.telegram_pending_edits for all
  using (auth.role() = 'service_role');
```

Chave primária `chat_id` garante que só haja 1 edição pendente por chat (clicar de novo substitui).

### 2. `supabase/functions/telegram-process/index.ts`
- `buildExpenseKeyboard(id)`: adicionar botão `✏️ Editar valor` (`edit:<id>`) — 1ª linha sozinho, 2ª linha com os outros 2, para evitar truncamento em telas pequenas.
- Handler de callback: novo branch `data.startsWith("edit:")`:
  - Upsert em `telegram_pending_edits` com `expires_at = now + 5min`.
  - `tgEditMessage` com texto original + sufixo `\n\n_✏️ Aguardando novo valor..._`, sem keyboard. Como não temos o texto original facilmente, usaremos uma abordagem mais simples: enviar uma **nova mensagem** "✏️ *Editar valor*\nEnvie o novo valor (ex: `45,90`) ou `/cancelar`." e remover só o keyboard da mensagem original via `editMessageReplyMarkup` com `inline_keyboard: []`.
- No início do loop de mensagens **texto** (após callback handler, antes do parser AI):
  - `select * from telegram_pending_edits where chat_id = ?`
  - Se existir e não expirado:
    - `/cancelar` → delete pending + send "✏️ Edição cancelada." + restaurar keyboard original via `editMessageReplyMarkup` (precisamos do `expense_id` que está no pending) + `continue`.
    - Senão tentar parse numérico. Se válido → update expense amount, delete pending, editar a mensagem original (`message_id` do pending) substituindo só o keyboard de volta + tgSend "✅ Valor atualizado para *R$ X*", `checkBudgetAndAlert`. `continue`.
    - Se inválido → tgSend "❌ Não entendi o valor..." e **continue** (não processa como despesa nova).
  - Se expirado → delete pending e segue fluxo normal.
- Helper `parseAmount(text)`: regex + conversão pt-BR (`.` milhar, `,` decimal). Retorna `number | null`.

## Detalhes técnicos
- `callback_data` `edit:<uuid>` = ~41 bytes, OK.
- Não precisamos editar o texto original da mensagem (mantém histórico legível); só removemos/recolocamos o keyboard.
- Idempotência: PK em `chat_id` garante upsert simples; clicar 2x em editar substitui o pending sem erro.
- Limite por chat: só uma edição pendente por vez (suficiente — usuário não está editando 2 despesas ao mesmo tempo no chat).
- TTL 5min: se usuário esqueceu, próxima mensagem volta a ser tratada como despesa nova.

## Sem alterações
- Schema das outras tabelas, UI do app, fluxo de orçamento, outros comandos.

## Fora de escopo
- Editar descrição/data/categoria via texto (categoria já tem botão dedicado).
- Histórico de edições.
- Múltiplas edições simultâneas no mesmo chat.

