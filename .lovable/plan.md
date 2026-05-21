# Módulo de Controle de Estoque

Integra estoque com Vendas e Receitas/Despesas, com movimentações registradas em histórico e sincronização em tempo real.

## O que será criado

### 1. Nova tabela `stock_movements` (Lovable Cloud)
Registra TODAS as movimentações de estoque:
- `type`: `entrada_manual` | `compra` | `venda` | `ajuste`
- `product_id`, `product_name` (snapshot)
- `quantity` (positivo = entrada, negativo = saída)
- `unit_cost` e `total_value` (para compras)
- `expense_id` (vínculo com a despesa gerada quando for compra)
- `sale_id` (vínculo com a venda quando for saída)
- `notes`, `created_at`, `user_id`, `owner_id`
- RLS por `owner_id` via `get_data_owner_id`
- Realtime habilitado

### 2. Novo hook `useStockMovements`
- Lista movimentações do owner
- `addManualEntry(productId, qty, notes)` → grava movimento + soma estoque
- `addPurchase(productId, qty, unitCost, notes, paymentMethod)` → grava movimento + soma estoque + cria despesa automática (categoria "Compra de mercadoria", já paga, debita saldo)
- Subscription realtime em `stock_movements`

### 3. Integração com vendas existentes
- Em `useProducts.addSale`: além de já reduzir o estoque, gravar 1 movimento `venda` por venda (com `sale_id`).
- Em `useProducts.deleteSale`: registrar movimento `ajuste` reverso ou marcar a venda como cancelada (estorno do estoque já existe).
- Bloqueio de venda quando `stock <= 0`:
  - Em `SaleForm`, desabilitar produto sem estoque e mostrar badge "Sem estoque"
  - Validação no submit: se `quantity > stock`, exibe toast e impede gravação
  - Alerta visual (badge amarelo) quando `stock <= 5`

### 4. Integração com Receitas/Despesas
- Compra gera automaticamente uma despesa via `useExpenses.addExpense`:
  - `category`: "Compra de mercadoria"
  - `amount`: `qty * unitCost`
  - `paid`: true, `paidAt`: agora
  - `description`: `Compra: <produto> x<qty>`
  - `scope`: "business"
- O saldo financeiro do mês é debitado automaticamente (já que despesas pagas entram no fluxo existente).
- Se a compra/movimento for excluído, a despesa vinculada também é removida.

### 5. UI nova na aba Vendas
Dentro de `ProductSalesView`, adicionar duas novas sub-abas ao lado das atuais:
- **Estoque**: lista de produtos com coluna de estoque atual, ações:
  - Botão "Entrada manual" (modal: produto, quantidade, observação)
  - Botão "Registrar compra" (modal: produto, quantidade, custo unitário, método de pagamento, observação)
  - Indicador visual de estoque baixo / zerado
- **Histórico de estoque**: tabela de `stock_movements` ordenada por data desc, com filtros por produto/tipo, mostrando tipo, produto, quantidade (+/-), valor, data/hora.

### 6. Sincronização realtime
- Subscription em `products`, `sales`, `stock_movements` já existente ou adicionada.
- Qualquer alteração propaga para todas as telas abertas.

## Detalhes técnicos

- Migration cria `stock_movements` com índices em `(owner_id, created_at desc)` e `(product_id)`.
- Atualizações de estoque continuam feitas a partir do hook (optimistic) e gravadas no banco. A coluna `products.stock` permanece como cache do agregado.
- Para idempotência, vendas/compras inserem o movimento na mesma operação que o INSERT principal e usam o `id` retornado para vínculo.
- Categoria "Compra de mercadoria" será criada automaticamente em `personal_expense_categories`/categoria de despesa caso não exista (ou usada como string livre, conforme o padrão atual do `useExpenses`).
- i18n: todos os textos em pt-BR.

## Arquivos afetados (estimativa)

- novo: `src/hooks/useStockMovements.ts`
- novo: `src/components/StockEntryForm.tsx`
- novo: `src/components/StockPurchaseForm.tsx`
- novo: `src/components/StockMovementsHistory.tsx`
- novo: `src/components/StockManager.tsx` (aba container)
- edit: `src/hooks/useProducts.ts` (gravar movimento na venda/cancelamento, expor helper)
- edit: `src/components/SaleForm.tsx` (bloqueio sem estoque, alerta baixo)
- edit: `src/components/ProductSalesView.tsx` (novas sub-abas Estoque/Histórico)
- migration: criar tabela + RLS + realtime

## Confirmar antes de implementar

1. Pode criar a tabela `stock_movements` no backend? (sim/não)
2. A compra deve gerar uma **despesa "paga" automaticamente** (debitando saldo na hora) ou apenas registrar e deixar o usuário marcar como paga depois?
3. Quando o estoque chegar a zero: **bloquear venda** ou apenas **avisar** e permitir prosseguir?
