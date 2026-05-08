# Plano: Área "Receitas e Despesas"

## Objetivo
Renomear a aba atual "Despesas" para "Receitas e Despesas" e adicionar sub-abas, sendo "Despesas" a estrutura existente intacta e "Receitas" uma nova área completa de gestão.

## Estrutura

```
Receitas e Despesas
├── Receitas (NOVO)
└── Despesas (existente: Empresariais + Pessoais)
```

## Etapas

### 1. Renomear aba e adicionar sub-abas
- Em `src/pages/Index.tsx`, renomear o label da aba "Despesas" para "Receitas e Despesas".
- Dentro do conteúdo, envolver o conteúdo atual em um `<Tabs>` com dois triggers: "Receitas" e "Despesas".
- A sub-aba "Despesas" mantém exatamente o conteúdo atual (ExpenseList empresariais + PersonalExpenseList pessoais), sem alterações.

### 2. Backend (Lovable Cloud)
Criar tabela `incomes` via migration:
- campos: descrição, valor, categoria, client_id (opcional), origem (texto), payment_method_id, data_recebimento, status (`pending`|`received`|`overdue`), observação, recorrência (`once`|`weekly`|`monthly`|`yearly`), parent_id (para recorrência), user_id
- RLS: políticas baseadas em `get_data_owner_id(auth.uid())` (mesmo padrão das demais tabelas multi-usuário)
- Trigger `updated_at`

Tabela `income_categories` (similar a personal_expense_categories) — opcional, ou usar campo texto livre + lista pré-definida.

### 3. Hook `useIncomes`
- CRUD completo
- Filtros, busca, ordenação
- Cálculo de totais (mês atual, mês anterior, previsto)
- Realtime subscription

### 4. Componente `IncomeList` (nova sub-aba)
Layout inspirado em apps financeiros modernos:

**Topo — Card "Saldo em Conta"**
- Saldo atual (vem de `getBalances()` já existente)
- Entradas do mês (receitas recebidas + pagamentos de empréstimos)
- Saídas do mês (despesas pagas)
- Saldo previsto (atual + pendentes - despesas pendentes)
- Comparação % com mês anterior
- Indicador visual (positivo/neutro/negativo) com cor semântica

**Dashboard de gráficos** (recharts já no projeto)
- Receitas por período (linha)
- Receitas por categoria (pizza)
- Recebidas vs Pendentes (barras)
- Evolução mensal
- Top 5 fontes de receita
- Projeção financeira

**Lista de receitas**
- Filtros: status, categoria, período, forma de pagamento
- Busca em tempo real
- Ordenação por data/valor/status
- Ações: editar inline, duplicar, marcar como recebido, excluir, ações em lote
- Badges de status com cores semânticas
- Cadastro rápido + dialog completo

### 5. Componente `IncomeForm`
Dialog com todos os campos. Quando recorrente, gerar instâncias futuras (lógica similar a credit card installments).

### 6. Integração financeira
- Receita marcada como "recebida" → `recordLedger({direction:"in", category:"other", ...})` para refletir no saldo automaticamente.
- Reverter ao cancelar/excluir via `removeLedgerByRef`.
- Card "Saldo em Conta" inclui pagamentos de empréstimos (já no ledger via category `payment`) e despesas pagas — somando do `account_ledger` para o mês corrente.

## Arquivos
**Novos**
- `supabase/migrations/<timestamp>_incomes.sql`
- `src/hooks/useIncomes.ts`
- `src/components/IncomeList.tsx`
- `src/components/IncomeForm.tsx`
- `src/components/IncomeBalanceCard.tsx`
- `src/components/IncomeDashboard.tsx`

**Editados**
- `src/pages/Index.tsx` (renomear aba + sub-abas)

## Detalhes técnicos
- Design tokens semânticos do `index.css` (sem cores hard-coded)
- shadcn `Tabs`, `Card`, `Dialog`, `Select`, `Popover` + Calendar
- recharts para gráficos
- Animações com classes existentes do Tailwind/`tailwindcss-animate`
- Mobile-first com `overflow-x-hidden` no container principal
- Realtime via canal Supabase na tabela `incomes`
