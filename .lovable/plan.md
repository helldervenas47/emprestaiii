

# Plano: Adicionar "Pendente de Recebimento" ao Dashboard

## Problema

O card "Pendente de Recebimento" foi adicionado ao componente `DashboardCards.tsx`, mas esse componente **não é renderizado em nenhum lugar**. O dashboard real usa o componente `DashboardOverview.tsx`, que tem sua própria lista de cards (linha 626-633).

## Solução

Adicionar o card "Pendente de Recebimento" na lista de cards do `DashboardOverview.tsx`, entre "Total a Receber" e "Lucro Estimado".

### Alterações em `src/components/DashboardOverview.tsx`

1. **No `useMemo` do portfolio** (~linha 186): calcular `pendingReceivable` como a soma de `remainingAmount` dos empréstimos ativos
2. **Na lista de cards** (linha 628-629): inserir o novo item entre "Total a Receber" e "Lucro Estimado":
   ```
   { label: "Pendente de Recebimento", value: formatCurrency(portfolio.pendingReceivable), color: "text-orange-500", ... }
   ```

## Arquivo alterado
- `src/components/DashboardOverview.tsx`

