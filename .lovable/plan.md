

## Objetivo
Disparar um alerta **imediato** no Telegram para o usuário sempre que, ao registrar uma despesa pessoal (texto / foto / áudio via bot), uma categoria do mês cruzar 100% do `personal_budgets`. Sem esperar o resumo diário das 19h e sem duplicar alertas no mesmo mês.

## Como funciona

1. Após qualquer `INSERT` bem-sucedido em `expenses` no `telegram-process` (texto, foto ou áudio), chamar uma função `checkBudgetAndAlert(admin, userId, chatId, category)`.
2. Essa função:
   a. Lê o orçamento da categoria em `personal_budgets`. Se não houver ou for ≤ 0 → ignora.
   b. Soma todas as despesas pessoais pagas do mês corrente (`YYYY-MM`) naquela categoria.
   c. Se total ≥ orçamento (≥ 100%):
      - Verifica em `personal_budget_alerts` se já existe `(user_id, category, month=YYYY-MM, alert_type='exceeded')`.
      - Se **não existir**: insere o registro e envia mensagem no Telegram:
        ```
        🚨 *Orçamento estourado!*
        
        📂 Lazer
        💸 Gasto: R$ 250,00 / R$ 200,00 (125%)
        
        Você ultrapassou o limite mensal desta categoria.
        ```
      - Se já existir: não envia (evita spam — só 1 alerta por categoria/mês).
3. Como o alerta é por `(user, category, month)`, despesas seguintes na mesma categoria no mesmo mês não disparam de novo. No próximo mês reseta naturalmente (chave inclui `month`).

## Mudanças

**Apenas 1 arquivo**: `supabase/functions/telegram-process/index.ts`

### Adicionar função `checkBudgetAndAlert`
Logo após `handleApagar`. Recebe `(admin, userId, chatId, category)`, faz a verificação e envia o alerta usando `tgSend` (chaves Lovable/Telegram já disponíveis no escopo do request).

### Chamar nos 3 pontos de insert
Após cada `await admin.from("expenses").insert(...)` bem-sucedido (sem `insErr`):
- Bloco texto livre
- Bloco foto/comprovante
- Bloco áudio/voz

A chamada é `await checkBudgetAndAlert(admin, link.user_id, chatId, finalCategory, LOVABLE_API_KEY, TELEGRAM_API_KEY)` onde `finalCategory` é a categoria efetivamente salva (já normalizada para "Outros" se inválida).

## Detalhes técnicos
- Tabela `personal_budget_alerts` já existe, com chave lógica `(user_id, category, month, alert_type)`. Vamos usar `alert_type='exceeded'`.
- Mês: `new Date().toISOString().slice(0,7)` — mesmo formato usado no `handleSaldo` (consistência).
- Soma do mês: filtrar despesas com `paid=true` e `paid_date` (fallback `due_date`) começando com `YYYY-MM`. Mesma lógica do `/saldo`.
- Idempotência: `select` por `(user_id, category, month)` antes de inserir; se já houver linha com `alert_type='exceeded'`, não envia.
- Alerta "Outros" sem orçamento: pulado naturalmente (não há linha em `personal_budgets`).

## Sem alterações
- Schema (`personal_budget_alerts` já existe e tem RLS para service_role).
- UI / outros bots / resumo diário (continuam funcionando independente).
- Demais comandos.

## Fora de escopo
- Alertas a 70% / 90% (apenas 100%). Pode ser próximo passo se desejado.
- Alertas para despesas criadas pela UI do app (apenas via Telegram). O `notify-budget-overrun` existente já cuida do resumo geral; aqui é o canal Telegram em tempo real.
- Botão inline "ver detalhes" — mensagem só de texto.

