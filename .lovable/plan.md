# Empréstimo com 2 formas de pagamento

## Objetivo
Na criação (e edição) de um empréstimo, permitir dividir o desembolso em até 2 formas de pagamento diferentes, mantendo a soma exata igual ao valor do empréstimo. O comportamento atual com 1 forma única continua intocado.

## Modelo de dados
Adicionar coluna `payment_method_split` (JSONB) na tabela `loans`, no formato:
```
{ "parts": [
  { "payment_method_id": "uuid-1", "amount": 500 },
  { "payment_method_id": "uuid-2", "amount": 300 }
] }
```
- `null` quando há apenas uma forma (mantém `payment_method_id` simples).
- A soma das `amount` precisa bater com `loans.amount` (validado no frontend).

## Backend / lógica (`src/hooks/useLoans.ts`)
1. Estender `Loan` (`src/types/loan.ts`) com `paymentSplit?: PaymentSplit | null`.
2. `addLoan`: aceitar `paymentSplit`, persistir em `payment_method_split`, e ao aplicar o débito do desembolso usar a função existente `applyPaymentBalance(amount, paymentMethodId, split, -1)` que já entende splits — basta passar o split.
3. `updateLoan`: aceitar mudança de `paymentSplit`. Se mudar (forma ou valores), reverter movimentação anterior e reaplicar com a nova divisão. Mantém o saldo coerente.
4. Quando `paymentSplit` está presente, ignorar `payment_method_id` no débito (a coluna fica preenchida apenas com a 1ª forma para retrocompatibilidade de leitura).
5. Mapeamento de leitura inclui `paymentSplit` no objeto `Loan`.

## UI — Criação (`src/components/LoanForm.tsx`)
- Manter `PaymentMethodPicker` atual como "Forma 1".
- Botão "+ Adicionar 2ª forma de pagamento" abaixo (expansão dinâmica).
- Quando a 2ª forma é ativada:
  - Aparecem dois campos de valor (Forma 1 / Forma 2), pré-preenchidos com 50/50 do valor do empréstimo.
  - Selecionar a 2ª forma com um segundo `PaymentMethodPicker`.
  - Ao alterar um valor, o outro recalcula automaticamente para manter a soma = total.
  - Botão "Remover 2ª forma" para voltar ao modo padrão.
- Validações no submit:
  - Soma exata = valor do empréstimo (tolerância de 1 centavo).
  - Nenhum valor negativo ou zero.
  - As duas formas não podem ser iguais.
  - Mensagens via `toast.error` no padrão atual.

## UI — Edição
Adicionar o mesmo seletor com expansão na tela de edição existente do empréstimo (procurar `LoanEditForm`/dialog atual de edição). Mesmas validações.

## Exibição em outros pontos
1. **Resumo do contrato gerado** (`src/lib/generateContract.ts`): se houver split, listar as duas formas com valores; senão manter texto atual.
2. **Visualização do empréstimo** (cards/listas em `src/components` que mostram a forma de pagamento — buscar `paymentMethodId` em `LoanList`/cards): renderizar duas linhas/badges quando split existir.
3. **Relatórios** (`src/components/DetailedReport.tsx`, `AccountantReport.tsx`, `loanReportPdf.ts`): mostrar as duas formas separadamente nas seções de detalhamento de empréstimo.
4. **Extrato financeiro** (`src/components/FinancialStatement.tsx` e `src/lib/ledger.ts`): o débito do desembolso já é gravado em `account_ledger`. Como `applyPaymentBalance` com split já cria uma entrada por forma, o extrato exibirá automaticamente cada forma como linha separada — verificar e ajustar rótulo se necessário (ex: "Empréstimo a João — Pix" / "Empréstimo a João — Dinheiro").
5. **Extrato da aba Receitas e Despesas** (`LedgerView`/`IncomeList`/`ExpenseList` se aplicável): garantir que o lançamento aparece desmembrado por forma de pagamento.

## Tipos Supabase
Após a migration, `src/integrations/supabase/types.ts` é regenerado automaticamente — ler `payment_method_split` como `Json | null`.

## Arquivos previstos
- migration nova (coluna `payment_method_split`)
- `src/types/loan.ts`
- `src/hooks/useLoans.ts`
- `src/components/LoanForm.tsx`
- componente de edição do empréstimo (a confirmar nome após inspeção)
- `src/lib/generateContract.ts`
- componentes de exibição: `LoanList`/cards, `DetailedReport.tsx`, `AccountantReport.tsx`, `FinancialStatement.tsx`, `loanReportPdf.ts`
- pequeno componente reutilizável `LoanPaymentSplitEditor` para evitar duplicação entre criar/editar

## Mobile
- A 2ª forma só aparece após o usuário clicar em "+ Adicionar 2ª forma de pagamento" — nada extra polui a tela no caso comum (1 forma).
- Layout dos dois campos de valor em grid de 2 colunas compacto.

## Confirmação
Posso prosseguir com a migration e implementação descritas acima?
