## Causa raiz

Suas despesas pessoais "passam de 200 mil" porque o cálculo do dashboard de Saúde Financeira (e, por consequência, o relatório por IA) está somando o **valor total do contrato** das despesas recorrentes em vez do **valor mensal** de cada uma.

Olhando o banco, os 7 lançamentos pessoais pendentes em maio/2026 somam exatamente **R$ 278.906,06**, e estão dominados por três contratos recorrentes com `installments = 999` (que significa "mensal por tempo indeterminado") cujo campo `amount` guarda o valor cheio do contrato:

| Despesa      | amount (DB) | installments | mensal real (amount/installments) |
|--------------|-------------|--------------|------------------------------------|
| Seguro Carro | R$ 169.740,09 | 999 | ~R$ 169,91 |
| Claro        | R$ 49.850,10  | 999 | ~R$ 49,90  |
| Internet     | R$ 44.955,00  | 999 | ~R$ 45,00  |
| Parcela Biz  | R$ 11.532,60  | 45  | ~R$ 256,28 |
| Iphone 13    | R$ 2.120,00   | 5   | R$ 424,00  |
| Roupa anselmo| R$ 680,00     | 5   | R$ 136,00  |
| Lovable      | R$ 28,27      | -   | R$ 28,27   |

Somando os valores **mensais corretos**, o pendente do mês cai de ~R$ 278.906 para ~R$ 1.109.

O resto do app já trata isso certo. Em `src/hooks/useExpenses.ts` o pagamento de uma parcela recorrente faz `originalInstallment = expense.amount / expense.installments`, e a edge function `generate-personal-insights` também divide:
```
const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
const amt = isRec ? Number(e.amount) / Number(e.installments) : Number(e.amount);
```

Mas `src/components/FinancialHealthDashboard.tsx → computeMonthMetrics` soma `e.amount` direto, sem dividir, tanto na despesa paga quanto na pendente, e o mesmo acontece no donut por categoria. Por isso o score, os insights e o prompt enviado para a IA herdam o valor inflado.

## Correção proposta

Aplicar a mesma regra de divisão usada em `useExpenses` e `generate-personal-insights` dentro do `FinancialHealthDashboard`:

1. Em `computeMonthMetrics` (`expense` e `pendingExpense`): se `e.type === "recorrente"` e `e.installments > 1`, usar `e.amount / e.installments`; caso contrário, usar `e.amount`.
2. Aplicar a mesma normalização ao agrupamento por categoria (`map.set(k, ...)`) que alimenta os "Top categorias" exibidos e enviados ao relatório IA.
3. Sem mexer em receitas — o problema é só no lado das despesas recorrentes.

Resultado esperado:
- Score, "gastou mais/menos do que ganhou", "suas despesas subiram/caíram %" e a reserva em meses voltam a refletir o gasto mensal real.
- O relatório por IA passa a receber `current.expense` e `current.pendingExpense` coerentes com o restante do app, evitando recomendações baseadas em "R$ 278 mil de despesa".

Sem mudanças em banco, hooks compartilhados, ou na função de backup. É uma alteração isolada de cálculo no `FinancialHealthDashboard.tsx`.
