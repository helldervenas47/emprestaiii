## Por que o botão não aparece hoje

Em `src/components/BackupExport.tsx`, todas as seções (Empréstimos, Clientes, Vendas, Despesas…) possuem `fileRef` + `onImportFile`. A seção **Pagamentos** (linhas 199–211) está com ambos `null`, e o grid de cards só renderiza o botão "Importar" quando os dois existem. Foi deixado assim de propósito porque cada `Payment` pertence a um `Loan` (`loanId`), e importar pagamentos sem o empréstimo correspondente criaria registros órfãos.

## O que vou implementar

Adicionar o botão Importar na seção Pagamentos, vinculando cada linha do CSV a um empréstimo existente (sem criar empréstimos faltantes).

### Mudanças

1. **`src/components/BackupExport.tsx`**
   - Criar `paymentFileRef` e `importPaymentsFromCSV(csv)` parseando os mesmos cabeçalhos exportados: `ID Empréstimo`, `Valor`, `Data`, `Nº Parcela`, `Data Vencimento Anterior`.
   - Trocar `fileRef: null` / `onImportFile: null` da seção Pagamentos por handlers reais.
   - O handler chama `onImportPayments(parsed)` (nova prop) e mostra toast com:
     - quantos foram importados,
     - quantos foram ignorados por `loanId` inexistente.
   - Adicionar `onImportPayments` à interface `BackupExportProps`.

2. **`src/pages/Index.tsx`**
   - Passar `onImportPayments` no objeto `backup`. A implementação:
     - Para cada linha, valida se existe `loan` em `loans` com aquele `loanId`. Se não existir, acumula no contador "ignorados".
     - Para parcelas válidas, chama `addPartialPayment(loanId, amount, date, …)` (já exposto por `useLoans`), processando em lotes de 5 igual ao `onImportLoans`.
   - Sem migração de banco — usa as APIs/RLS existentes.

### Comportamento e validações
- CSV exportado pelo próprio sistema é o formato de entrada de referência.
- Linhas com `loanId` vazio ou que não bate com nenhum empréstimo do usuário → ignoradas, contadas no toast final ("X importados, Y ignorados — empréstimo não encontrado").
- Linhas com valor inválido (≤ 0 ou NaN) → também ignoradas.
- Não cria novos empréstimos automaticamente.
- Não duplica deduplicação por `(loanId, date, installmentNumber)` neste primeiro passo (pode ser adicionado depois se necessário).

### Fora de escopo
- Migrações de banco.
- Criar empréstimos faltantes a partir do CSV de pagamentos.
- Mudar o formato do CSV exportado.
