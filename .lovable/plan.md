

## Problema

O componente `OverdueLoans` usa `calculateInstallment()` para calcular o valor exibido, ignorando o `remaining_amount` real do banco. Quando houve pagamentos parciais, os valores divergem.

## Solução

Alterar a função `getInstallmentAmount` em `src/components/OverdueLoans.tsx` para usar `loan.remainingAmount` quando disponível, em vez de recalcular pela fórmula.

## Alteração

**Arquivo: `src/components/OverdueLoans.tsx`**

- Na função `getInstallmentAmount`, priorizar `loan.remainingAmount` quando existir e for > 0
- Para empréstimos com 1 parcela (parcela única), usar diretamente o `remainingAmount`
- Para empréstimos parcelados com múltiplas parcelas, manter a lógica de schedule mas usar `remainingAmount` como fallback
- Atualizar o `totalAmount` nos cards de resumo para refletir os valores corretos

Lógica proposta:
```
function getInstallmentAmount(loan, schedules):
  // Para parcela única, usar remaining_amount diretamente
  if loan.installments === 1 e loan.remainingAmount > 0:
    return loan.remainingAmount
  
  // Para parcelado, tentar schedule primeiro
  schedule = encontrar no schedules
  if schedule: return schedule.amount
  
  // Fallback: cálculo original
  return calculateInstallment(...)
```

## Impacto

- Os cards de "Empréstimos Atrasados" e "Vencendo Hoje" mostrarão valores corretos
- As mensagens WhatsApp também usarão os valores corretos

