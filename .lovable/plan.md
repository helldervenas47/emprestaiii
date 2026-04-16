

## Objetivo
Adicionar 3 comandos no bot do Telegram para consulta e gestão rápida de despesas pessoais.

## Comandos

**`/saldo`** — Total gasto no mês corrente + breakdown por categoria com % do orçamento (se houver `personal_budgets`).
```
💰 Gastos de Abril
Total: R$ 1.234,56

📂 Por categoria:
🟢 Alimentação: R$ 320,00 / R$ 800,00 (40%)
🟡 Transporte: R$ 180,00 / R$ 200,00 (90%)
🔴 Lazer: R$ 250,00 / R$ 200,00 (125%)
⚪ Outros: R$ 484,56 (sem orçamento)
```

**`/ultimas`** — Últimas 5 despesas pessoais (ordem desc por `paid_date`/`created_at`).
```
🧾 Últimas despesas
1. R$ 45,00 — Uber (Transporte) — 16/04
2. R$ 230,00 — Mercado (Alimentação) — 15/04
...
```

**`/apagar`** — Apaga a despesa pessoal mais recente do usuário, mostrando confirmação do que foi removido.
```
🗑️ Despesa removida:
R$ 45,00 — Uber (Transporte) — 16/04
```
Se não houver despesas: `ℹ️ Nenhuma despesa para apagar.`

## Mudanças

**Apenas 1 arquivo**: `supabase/functions/telegram-process/index.ts`
- Antes do bloco que chama a IA, adicionar 3 branches `if` para `/saldo`, `/ultimas`, `/apagar` (case-insensitive, suportando `@botname`).
- Atualizar `HELP_TEXT` para listar os novos comandos.
- Sem mudanças de schema, sem novas funções/migrações.

## Detalhes técnicos
- Mês corrente: filtrar `expenses` por `scope='personal'`, `user_id=link.user_id`, `paid_date` (ou `due_date`) começando com `YYYY-MM` atual em timezone local (usar `new Date().toISOString().slice(0,7)`).
- Orçamentos: ler `personal_budgets` por `user_id` e cruzar por `category`. Ícone: 🟢 <70%, 🟡 70–99%, 🔴 ≥100%, ⚪ sem orçamento.
- `/ultimas`: `select * from expenses where scope='personal' and user_id=? order by coalesce(paid_date, due_date) desc, created_at desc limit 5`.
- `/apagar`: mesmo critério de ordenação, pega o primeiro, `delete` por `id`, responde com o que foi removido.
- Formatação de moeda: `Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })`.
- Datas exibidas no formato `DD/MM`.

## Fora de escopo
- `/desfazer` com janela de tempo, undo de múltiplas, edição de despesa — não solicitado.

