

## Objetivo

Na aba **Despesas**, criar duas sub-abas:
1. **Despesas Empresa** (renomeação da atual, mantém todos os dados)
2. **Despesas Pessoais** (nova área, com categorias e métricas inspiradas em apps de finanças pessoais — Mobills, Organizze, Wallet)

## Como diferenciar empresa vs pessoal

Vou adicionar uma coluna `scope text` (`'business' | 'personal'`) na tabela `expenses`, default `'business'` para preservar os dados atuais. As despesas de veículos continuam sendo identificadas pela categoria (já existe esse filtro) e ficam dentro de "Empresa".

### Migração SQL
```sql
ALTER TABLE public.expenses ADD COLUMN scope text NOT NULL DEFAULT 'business';
```

## Categorias pessoais (inspiradas nos melhores apps)

Lista padrão, com ícone e cor para cada uma:
- Moradia (aluguel, condomínio, IPTU)
- Alimentação (mercado, restaurante, delivery)
- Transporte (combustível, Uber, transporte público)
- Saúde (plano, farmácia, consultas)
- Educação (cursos, livros, mensalidade)
- Lazer (streaming, cinema, viagens)
- Compras (vestuário, eletrônicos)
- Contas (luz, água, internet, telefone)
- Cartão de Crédito
- Assinaturas
- Pets
- Presentes/Doações
- Outros

## Componentes

### 1. `PersonalExpenseForm.tsx` (novo)
Formulário inspirado em apps pessoais:
- Descrição
- Valor
- Categoria (lista pessoal acima, com ícones)
- Forma de pagamento (Dinheiro, Pix, Débito, Crédito) — campo informativo, salvo em `notes`
- Tipo: Fixa / Recorrente (parcelada)
- Data de vencimento
- Observações
- Define `scope: 'personal'` ao chamar `addExpense`

### 2. `PersonalExpenseList.tsx` (novo)
Reusa muita lógica de `ExpenseList` mas com layout focado em finanças pessoais:

**Cards de resumo (mensais):**
- Gasto do mês (total pago)
- A pagar no mês (pendente)
- Atrasado
- **Média diária** (gasto / dia atual do mês) — métrica clássica de apps pessoais
- **Projeção do mês** (gasto atual + média × dias restantes)

**Gráfico de gastos por categoria** (donut/barras):
- Mostra distribuição percentual das despesas do mês por categoria
- Top 5 categorias destacadas, resto agrupado em "Outros"
- Usar `recharts` (já existe no projeto via `chart.tsx`)

**Filtros:**
- Mês (já igual ao existente)
- Busca
- Pendentes / Pagas / Atrasadas / Todas
- Filtro por categoria (chips clicáveis)

**Lista de despesas:**
- Mesmo padrão do `ExpenseList` (botão Pagar com seleção de data, editar, excluir, estornar)
- Badge da categoria com cor

### 3. Alterar `src/pages/Index.tsx`
Na aba `expenses`, adicionar `Tabs` com:
- "Despesas Empresa" → renderiza `ExpenseList` com `nonVehicleExpenses` filtradas por `scope==='business'`
- "Despesas Pessoais" → renderiza `PersonalExpenseList` com expenses filtradas por `scope==='personal'`

Estado `expenseSubTab: 'business' | 'personal'` controla qual formulário abrir ao clicar em "+ Nova Despesa" no header.

### 4. Alterar `src/hooks/useExpenses.ts`
- `fetchExpenses`: mapear novo campo `scope`
- `addExpense`: aceitar `scope` opcional (default `'business'`) e passar para o INSERT
- Tipo `Expense`: adicionar `scope?: 'business' | 'personal'`

### 5. Alterar `src/components/ExpenseForm.tsx`
Aceitar prop `scope` e passar para `onAdd`. Sem mudança visual.

## Layout das sub-abas

Mesmo padrão pílula usado em ProductSalesView (Vendas/Streaming):
```text
┌─────────────────────────────────────┐
│ [🏢 Despesas Empresa] [👤 Pessoais] │
└─────────────────────────────────────┘
```

## Arquivos a criar/alterar

**Criar:**
- Migração SQL (coluna `scope`)
- `src/components/PersonalExpenseForm.tsx`
- `src/components/PersonalExpenseList.tsx` (com gráfico de categorias e métricas)

**Alterar:**
- `src/types/loan.ts` — adicionar `scope` ao tipo `Expense`
- `src/integrations/supabase/types.ts` — auto-atualizado pela migração
- `src/hooks/useExpenses.ts` — mapear/inserir `scope`
- `src/components/ExpenseForm.tsx` — aceitar prop `scope`
- `src/pages/Index.tsx` — adicionar sub-abas, estado `expenseSubTab`, abrir form correto, filtrar por scope

## Observação

Despesas existentes mantêm todos os dados em "Despesas Empresa" (default `business` na migração). A sub-aba "Despesas Pessoais" inicia vazia — o usuário começa a cadastrar a partir de agora.

