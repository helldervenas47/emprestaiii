## Contexto

Hoje o reconhecimento dos juros em contratos parcelados está **inconsistente entre telas**:

- **Dashboard / Contador** (`useDashboardMetrics.ts` e `AccountantReport.tsx`) já aplicam distribuição proporcional por parcela via `ratio = juros_total / total_com_juros`, MAS aplicam um "ajuste de quitação" na última parcela: `interestByPaymentId[lastId] += realProfit - allocatedInterest`. Em contratos parcelados normais o resíduo deveria ser zero; hoje ele acumula por conta de arredondamentos, `originalAmount` vs `amount` (renegociação) e do próximo item ↓.
- **Extrato (`account_ledger`)**: parcelas 1..n-1 (`addPayment`) gravam o pagamento **sem** metadata `interest_amount` / `principal_amount`. Somente na **quitação** (`payOffLoan`) é gravado `interest_amount = payAmount − (loan.amount − principalPaidBefore)`, que joga **todo o juros restante na última linha do extrato**.
- **ClientLoanHistory** calcula `principalPaid = principal − remainingAmount`, misturando "saldo total restante" com "principal pago", o que também concentra juros na última fase do contrato.

Resultado: relatórios por período/PDF/telegram e Extrato mostram os juros concentrados no último pagamento, e não pró-rata a cada parcela paga.

## Objetivo

Em contratos **parcelados** (`installments > 1`), cada pagamento deve reconhecer **apenas a fração de juros daquela parcela** (`juros_total / n`, ou pró-rata pelo valor daquela parcela quando o cronograma tem parcelas variáveis). Contratos de **parcela única** permanecem inalterados. Somatório de juros ao longo do contrato = juros contratados, sem duplicidade nem perda.

## Fórmula única (fonte de verdade)

Para uma parcela de valor `installmentAmount` em contrato com `principal` e `totalWithInterest`:

```text
ratio         = 1 - principal / totalWithInterest        (0 se principal ≥ total)
interestPart  = round2( installmentAmount * ratio )
principalPart = round2( installmentAmount - interestPart )
```

Ajuste de fechamento **apenas na última parcela real (`newPaid === installments`) do contrato parcelado**, para absorver centavos de arredondamento (não para carregar juros suprimidos):

```text
if (newPaid === installments):
  interestPart  = totalInterest - somaJurosParcelasAnteriores
  principalPart = installmentAmount - interestPart
```

Pagamentos avulsos continuam com as regras atuais:
- `installment_number = 0` ou `-2` → 100% juros
- `installment_number = -3` (amortização) → 0% juros
- `installment_number = -1` (parcial) → mantém a alocação atual "juros primeiro" (não é parcela do cronograma)
- Contrato com `installments = 1` → mantém comportamento atual (quitação).

## Mudanças

### 1. `src/hooks/useLoans.ts`

- Criar helper `splitInstallmentInterest(loan, installmentAmount, newPaid, priorPayments)` que retorna `{ interestPart, principalPart }` aplicando a fórmula acima (e o ajuste de fechamento só quando `newPaid === installments`).
- **`addPayment`** (parcela regular): passar `extraMetadata: { interest_amount, principal_amount }` para `recordPaymentLedgerSplit`. A descrição continua "Parcela X/N recebida...".
- **`payOffLoan`** (quitação): substituir o cálculo atual (linhas 936–940) por:
  - Se `loan.installments === 1`: manter comportamento atual (todo o excedente do principal é juros).
  - Se `installments > 1`: calcular `interestPart` da parcela final via helper (garante que somatório = juros contratado; qualquer "bônus/desconto de quitação" fica em `principalPart` — não infla juros do período).
- **`addPartialPayment`** (`installment_number = -1`): manter comportamento atual (juros-primeiro por saldo remanescente).

### 2. `src/components/dashboard/useDashboardMetrics.ts`

- Substituir o bloco 254–291 pela mesma fórmula pró-rata parcela-a-parcela (usando o `installmentAmount` real do pagamento e `ratio` do contrato). Manter os casos especiais `installmentNumber ∈ {0, -1, -2, -3}` como estão.
- **Remover** o "ajuste de quitação" nas linhas 297–317 para contratos parcelados. Manter apenas uma reconciliação de centavos (`|diff| < 0.02`) ainda no último pagamento, para não sacrificar precisão do somatório. Diferenças maiores (acordos com desconto/bônus) deixam de virar "juros do último mês" e passam a ser tratadas como principal.

### 3. `src/components/AccountantReport.tsx`

- Mesma substituição: usar a fórmula pró-rata por parcela. Ajustar as `reason` strings (`"Parcela X: juros = installmentAmount × ratio"`) para refletir a nova regra.
- Manter reconciliação de centavos ≤ R$ 0,02.

### 4. `src/components/ClientLoanHistory.tsx` (linhas 238–263)

- Substituir por: `interestReceived = Σ (payment.amount × ratio_do_contrato)` para pagamentos regulares + 100% para `installmentNumber === 0`/`-2` + 0% para `-3` + pró-rata do `-1`. Para contratos `paid`, manter `interestReceived = totalInterest` (comportamento atual).

### 5. Backfill (somente visual, sem migração de dados)

- Nenhuma alteração no schema. Pagamentos antigos são reprocessados **em runtime** pela nova fórmula (a metadata `interest_amount` no `account_ledger` é opcional; consumidores continuam recalculando). Extratos antigos aparecem corrigidos automaticamente.

## Validação

Adicionar testes em `src/hooks/__tests__/loanInterestAllocation.test.ts` cobrindo:

- Contrato 1000 principal, 20% total, 2 parcelas → 100 + 100 = 200.
- Contrato 1000 principal, 20% total, 6 parcelas → 6 × 33,33 = 200 (última parcela absorve o centavo residual).
- Contrato 1000 principal, 20% total, 12 parcelas → soma = 200 exatamente.
- Contrato 1 parcela → juros = 200 na única parcela (regra antiga preservada).
- Pagamento parcial (`-1`): juros-primeiro respeitando saldo do contrato.
- Quitação antecipada de contrato parcelado com desconto (payAmount < remaining) → juros ≤ juros contratado, resto vira principal (não infla).

Rodar `bun test`, olhar o card "Juros Recebidos" no Dashboard e o Extrato em um contrato de 6 parcelas de teste — cada parcela deve mostrar a fração de juros; nenhum "salto" na última.

## Fora de escopo

- Alterar o schema do `account_ledger` (colunas dedicadas para juros/principal).
- Reprocessar/regravar lançamentos antigos no banco — não é necessário, pois a alocação é recalculada em runtime.
- Alterar regras de comissão de gestor, multa de atraso, ou juros pendentes do ciclo (`interest_partial`).