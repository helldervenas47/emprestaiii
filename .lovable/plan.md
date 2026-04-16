

# Plano: Campo "Total a Receber" nos empréstimos

## Resumo

Adicionar um campo visual "Total a Receber" na criação, edição e nos cards de empréstimos. O cálculo será: **Valor emprestado + Juros total + Juros/Multa de atraso (se houver)**.

## O que muda

### 1. Formulário de Criação (`LoanForm.tsx`)
- Adicionar campo somente leitura **"Total a Receber"** abaixo dos campos de valor/juros
- Cálculo: `amount + totalInterest` (já existe como variável `totalAmount` na linha 75)
- Exibir formatado em R$

### 2. Formulário de Edição (`LoanList.tsx` - modo editing)
- Adicionar campo somente leitura **"Total a Receber"** no grid de edição
- Cálculo: `parseFloat(form.amount) + parseFloat(form.interestValue) * parseFloat(form.installments)`
- Atualiza automaticamente quando valor, juros ou parcelas mudam

### 3. Card do Empréstimo (`LoanList.tsx` - grid "Emprestado / Total a Receber")
- O campo **"Total a Receber"** (linha 778) já existe, mas usa `total` (que é `calculateTotalWithInterest`)
- Alterar para incluir juros de atraso e multa: `total + lateFees` (onde `lateFees = lateInterestTotal + penaltyTotal`, já calculado na linha 227)

## Detalhes técnicos

- **LoanForm.tsx**: Exibir `totalAmount` (linha 75) como campo read-only no formulário
- **LoanList.tsx card**: Trocar `formatCurrency(total)` (linha 779) por `formatCurrency(total + lateFees)` para incluir multa/juros de atraso
- **LoanList.tsx edit form**: Computar total a receber dinamicamente a partir dos campos do formulário de edição

## Arquivos alterados
- `src/components/LoanForm.tsx`
- `src/components/LoanList.tsx`

