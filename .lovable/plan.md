## Causa

No relatório de Inadimplência Acumulada, o contrato parcelado do Darlan Machado (3x, 1 paga) tem:

- Parcela #1 (29/04) — paga
- Parcela #2 (09/05) — vencida, mas no mês atual
- Parcela #3 (16/05) — futura
- `loans.due_date` = 2026-04-29 (não foi avançada após o pagamento da #1)

A regra atual filtra parcelas com `dueDate < início do mês atual`. Como a única parcela vencida (#2) é de 09/05, a lista filtrada fica vazia. Aí o código cai no **fallback**, que usa `loan.due_date` diretamente. Como `loan.due_date` ainda aponta para 29/04 (mês anterior), o contrato é exibido como vencido em 29/04 com ~12 dias de atraso e valor igual ao saldo restante do contrato.

O fallback foi pensado para empréstimos **sem schedule** (ex.: parcela única). Quando o contrato é parcelado e tem schedules, ele nunca deveria ser usado — basta confiar no que está em `loan_installments`.

## Correção proposta

Aplicar a mesma regra em dois lugares:

1. **`src/components/AccumulatedDelinquencyReport.tsx`** — bloco de fallback (linhas ~140–160).
2. **`supabase/functions/telegram-accumulated-delinquency-summary/index.ts`** — função `buildAccumulatedDelinquencyItems` (bloco equivalente após o `continue;`).

Mudança em ambos:

- Só executar o fallback quando o contrato **não possuir nenhum registro em `loan_installments`** (`schedules.length === 0`).
- Quando o contrato tem schedules e nenhuma parcela vencida em meses anteriores, simplesmente sair sem emitir linha.

### Resultado esperado

- Darlan Machado deixa de aparecer no relatório de inadimplência acumulada (a única parcela em atraso, 09/05, é do mês corrente).
- Empréstimos parcelados sem nenhuma parcela vencida antes do mês atual nunca mais geram linha de fallback.
- Empréstimos de parcela única continuam funcionando como hoje (caem no fallback porque `schedules.length === 0`).

Nenhuma mudança em UI, schema ou lógica de pagamentos — apenas a condição que dispara o fallback.