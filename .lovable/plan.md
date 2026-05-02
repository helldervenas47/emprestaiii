## Problema

No contrato do Leo Cardoso, ao pagar a parcela 1 (renegociada para R$ 300 com multa de R$ 30), o sistema registra apenas R$ 280. Isso ocorre porque `addPayment` em `src/hooks/useLoans.ts` ignora o cronograma individual de parcelas (`loan_installments`) e divide o saldo total igualmente entre as parcelas restantes (840 ÷ 3 = 280), perdendo a multa aplicada na parcela 1.

A renegociação grava corretamente a parcela 1 com R$ 300 em `loan_installments`, mas o pagamento usa um cálculo paralelo que não consulta essa tabela.

## Correção

Em `src/hooks/useLoans.ts`, dentro de `addPayment` (linhas ~304-309), priorizar o valor do cronograma para a parcela que está sendo paga.

Nova ordem de prioridade para `installmentAmount`:
1. **Valor da parcela atual no cronograma** (`installmentSchedules.find(s => s.loanId === loanId && s.installmentNumber === loan.paidInstallments + 1)`) — fonte de verdade quando existe (cobre renegociações, parcelas customizadas e fluxos diários/semanais).
2. `loan.customInstallmentValue` se > 0 (fallback existente).
3. `remaining / remainingInstallments` (fallback de cálculo médio).

Se for usado o valor do cronograma, `newRemaining` deve ser calculado como `max(0, remaining - installmentAmount)` (já é assim) — a soma das parcelas do cronograma já bate com `remaining_amount`, então o saldo final fecha corretamente.

Se for a última parcela (`newPaid >= installments`), forçar `installmentAmount = remaining` para evitar arredondamentos deixarem centavos pendurados.

## Verificação manual após o fix

- Pagar parcela 1 do Leo Cardoso deve registrar R$ 300 (não 280), saldo passa para R$ 540.
- Parcela 2 e 3 devem continuar registrando R$ 270 cada.
- Contratos sem renegociação (parcelas iguais) seguem registrando o valor padrão.

## Arquivo afetado
- `src/hooks/useLoans.ts` (função `addPayment`, ~linhas 304-311)
