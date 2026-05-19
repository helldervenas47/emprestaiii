## Diagnóstico

Para o Nubank (final 9982), ciclo `2026-05`:

- `opening_amount` = R$ 1.796,94 (saldo inicial / fatura anterior).
- 2 despesas no ciclo (R$ 424,00 + R$ 181,86 = R$ 605,86).
- `total` esperado da fatura = **R$ 2.402,80**.
- Nenhum lançamento `account_ledger` com `kind = credit_card_invoice_payment` para esse cartão.

Lendo `src/components/CreditCardInvoice.tsx`, a lógica de pagamento já calcula `paymentRemaining = total` (compras + opening) quando o ciclo ainda não foi lançado no extrato, e o `recordLedger` é chamado com `ledgerAmount = newPaidTotal − ledgerPaid`. Em teoria deveria debitar os R$ 2.402,80.

Existem 3 fragilidades que explicam o sintoma "saldo inicial não é debitado":

1. **Consulta do ledger já existente usa `metadata->>credit_card_id` sem `user_id`** — em alguns ambientes PostgREST devolve 0 linhas e o cálculo de `ledgerAmount` fica certo por acidente; em outros pode somar valores de outros usuários/cartões. A consulta deve ser escopada por `user_id` e ainda usar `kind` correto.

2. **Quando o usuário marca itens como pagos antes** (manualmente, ou via app de despesas) e depois abre "Pagar fatura", `paidTotal = paidItemsTotal` (sem opening), mas o input vem pré-preenchido com `total`. Se o usuário ajustar manualmente para o valor que aparece como "Restante" (que é o `total` inteiro só quando `!ledgerHandled`), o resultado é certo. Mas hoje o diálogo mostra três blocos confusos (Total / Já pago / Restante) sem explicitar o componente "Saldo inicial". Visualmente o usuário acredita estar pagando só as compras.

3. **Quando `isFull`, o `upsertOpening` mantém `[PAGA]` + `[LEDGER]`, mas a lista de cartões em outros componentes (`useAccountBalance` → `creditCardInvoiceExtraPaid`) só desconsidera ciclos que têm `[LEDGER]`.** Se o `recordLedger` falhar silenciosamente (rede, RLS), o opening fica marcado como `[LEDGER]` sem o débito ter sido lançado — e o saldo "some" sem nunca ter sido debitado. Hoje o `try/catch` engole o erro do `recordLedger`.

## Mudanças propostas

### 1. Tornar o pagamento atômico e à prova de falha silenciosa
Em `src/components/CreditCardInvoice.tsx`, no handler do botão "Confirmar pagamento":

- Lançar primeiro o `recordLedger` (débito na conta). Só depois aplicar `updateExpense` nos itens e `upsertOpening` com `[PAGA] [LEDGER] [PAID_DATE]`.
- Se o `recordLedger` falhar, abortar com toast e **não** marcar o opening como `[LEDGER]`, evitando o estado fantasma.
- Escopar a consulta de ledger anterior por `user_id` (via `get_data_owner_id` / hook `useDataOwner`) e por `category = 'expense'` para evitar colisão.

### 2. Deixar explícito que o saldo inicial está sendo pago
Reformatar o resumo no `Dialog` de pagamento para mostrar o detalhamento:

```text
Compras do ciclo   R$ 605,86
Saldo inicial      R$ 1.796,94
─────────────────────────────
Total da fatura    R$ 2.402,80
Já pago            R$ 0,00
Restante           R$ 2.402,80
```

Mantém o input com o valor restante já preenchido.

### 3. Garantir que o débito sempre cobre o opening quando `isFull`
Ao calcular `ledgerAmount`, usar `Math.max(ledgerAmount, openingAmount − openingAlreadyInLedger)` quando `openingPaidFlag` está sendo marcado pela primeira vez. Isso protege casos em que `paidItemsTotal` foi marcado em outro fluxo e o `newPaidTotal − ledgerPaid` daria um valor que ignora o opening.

### 4. Pequeno ajuste em `creditCardInvoiceTotals.ts`
Adicionar guard em `creditCardInvoiceExtraPaid`: se `[LEDGER]` está presente mas **não existe nenhum** `account_ledger` correspondente (verificação opcional via prop futura), continuar somando o extra — fora do escopo desta task, mas deixar nota no código para investigação.

## Resultado esperado

- Botão "Pagar fatura" do Nubank 05/2026 mostra `R$ 2.402,80` com breakdown.
- Ao confirmar, é criado **1 lançamento no extrato** de `R$ 2.402,80` (categoria `expense`, wallet escolhida).
- Saldo em Conta cai exatamente R$ 2.402,80.
- Histórico de Pagamentos do cartão registra a fatura paga com valor total correto.
- Se a inserção falhar, o opening permanece em aberto e o usuário vê o erro.

## Arquivos a alterar

- `src/components/CreditCardInvoice.tsx` — reordenar o fluxo de pagamento, ajustar consulta de ledger, redesenhar o resumo do diálogo.
- (Opcional) `src/lib/creditCardInvoiceTotals.ts` — comentário/guard sobre estado fantasma.
