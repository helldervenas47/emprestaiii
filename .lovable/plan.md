

# Plano: Incluir pagamentos de juros no "Total a Receber"

## Resumo

Adicionar os pagamentos de juros já recebidos (`installmentNumber === 0`) ao cálculo do "Total a Receber" nos cards de empréstimos. Nenhum outro tipo de pagamento (parcelas ou pagamentos parciais) entra neste cálculo.

## Fórmula atualizada

```
Total a Receber = total do contrato + multa/juros de atraso + pagamentos de juros recebidos
```

Onde "pagamentos de juros recebidos" = soma de todos os `payments` com `installmentNumber === 0` para aquele empréstimo.

## O que muda

### `src/components/LoanList.tsx`

1. **Card do empréstimo (linha ~780)**: Calcular a soma dos pagamentos com `installmentNumber === 0` e somar ao `total + lateFees`
2. **Card expandido (linha ~1272+)**: Mesmo ajuste no segundo bloco de renderização de cards
3. Adicionar variável `interestPaymentsReceived` ao lado de `lateFees` nos dois blocos de cálculo (linhas ~200 e ~1272)

## Arquivos alterados
- `src/components/LoanList.tsx`

