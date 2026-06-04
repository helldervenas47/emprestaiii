# Módulo de Garantia (contratos de venda)

Novo módulo dentro de cada contrato de venda (`sales`) para abrir e gerenciar processos de garantia, com integração ao estoque (`products` + `stock_movements`) e rastreabilidade completa.

## Backend (Supabase)

### Novas tabelas

**`warranty_cases`** — uma garantia por contrato (pode haver várias por venda)
- `id uuid pk`, `user_id uuid` (dono dos dados), `sale_id uuid fk sales`, `opened_by uuid` (auth.uid do criador)
- `status text` enum lógico: `aberta | em_analise | aguardando_produto | produto_recebido | produto_substituido | concluida | cancelada`
- `reason text`, `notes text`
- `opened_at timestamptz default now()`, `closed_at timestamptz null`
- `created_at`, `updated_at`
- RLS por `user_id = get_data_owner_id(auth.uid())` (mesmo padrão das outras tabelas)

**`warranty_items`** — itens da venda incluídos na garantia
- `id uuid pk`, `warranty_case_id uuid fk`, `user_id uuid`
- `product_id uuid null` (quando a venda tem produto cadastrado), `product_name text` (snapshot)
- `quantity numeric` (qtd em garantia)
- Validação no client: `quantity ≤ qty vendida − qty já em garantia (em casos não cancelados)`

**`warranty_movements`** — entradas/saídas de estoque por garantia
- `id uuid pk`, `warranty_case_id uuid fk`, `warranty_item_id uuid fk`, `user_id uuid`, `performed_by uuid`
- `direction text`: `in` (retorno ao estoque) | `out` (envio de substituição)
- `product_id uuid`, `quantity numeric`, `notes text`, `created_at`

**`warranty_attachments`** — anexos do processo
- `id`, `warranty_case_id`, `user_id`, `file_path text`, `file_name text`, `mime_type text`, `size_bytes int`, `uploaded_by`, `created_at`
- Bucket privado `warranty-attachments` em Storage com RLS pelo prefixo `{user_id}/...`

**`warranty_history`** — log de alterações (status, observações, responsável)
- `id`, `warranty_case_id`, `user_id`, `actor_id uuid`, `event text` (`created|status_changed|note_added|item_added|movement_added|attachment_added|reopened|closed`), `from_value text`, `to_value text`, `payload jsonb`, `created_at`
- Preenchido pela aplicação a cada ação (mais simples e portátil que triggers)

Todas as tabelas: GRANT para `authenticated` + `service_role`, RLS habilitado, policies `USING (user_id = get_data_owner_id(auth.uid()))`.

### Integração com estoque
- Ao inserir um `warranty_movement`:
  - `direction = in`: insere `stock_movements` com `type = 'entrada'`, `reason = 'Garantia (retorno) — venda #<sale_id>'` e atualiza `products.stock += quantity`.
  - `direction = out`: bloqueia se `products.stock < quantity` (toast de erro). Insere `stock_movements` com `type = 'saida'` e atualiza `products.stock -= quantity`.
- Movimentação só permitida quando o item da garantia tem `product_id` (produto cadastrado).

## Frontend

### Componentes novos (em `src/components/warranty/`)
- `WarrantySection.tsx` — bloco dentro do detalhe da venda, lista todas as garantias do contrato + botão "Abrir garantia".
- `WarrantyDialog.tsx` — criar/editar caso, escolher itens da venda com `qty vendida / em garantia / disponível`, motivo, observações.
- `WarrantyDetailDialog.tsx` — status (Select com os 7 estados), timeline do `warranty_history`, lista de movimentações, anexos.
- `WarrantyMovementDialog.tsx` — registrar entrada/saída de estoque ligada a um item.
- `WarrantyAttachments.tsx` — upload/listagem/download dos anexos do bucket.

### Hooks
- `useWarrantyCases(saleId?)`, `useWarrantyItems(caseId)`, `useWarrantyMovements(caseId)`, `useWarrantyHistory(caseId)`, `useWarrantyAttachments(caseId)`.
- Cada mutação grava também a linha correspondente em `warranty_history`.

### Integração na UI existente
- `SaleEditForm.tsx` / detalhe da venda em `SalesLedger.tsx`: adicionar aba/seção "Garantia" mostrando `WarrantySection`.
- Badge com contador de garantias abertas no card da venda.

### Regras de validação (client + RLS)
- Qtd em garantia por item ≤ qtd vendida no contrato − soma das garantias não canceladas para o mesmo `product_id`/linha da venda.
- Saída de estoque exige `products.stock ≥ quantity`.
- Apenas o dono dos dados (`get_data_owner_id`) vê/edita; `actor_id` armazena quem alterou para o histórico.

### Visual
Reaproveita `Card`, `Dialog`, `Badge`, `Select`, `Table`, `Tabs`, `Timeline` (lista) do design system já usado em `SalesLedger` e `LoanList` — sem cores novas, apenas tokens semânticos existentes (`primary`, `warning`, `success`, `muted`).

## Entrega em etapas
1. Migration: tabelas + RLS + GRANTs + bucket `warranty-attachments` + policies de storage.
2. Hooks e tipos TS.
3. Componentes e integração no detalhe da venda.
4. Movimentações de estoque + escrita no histórico.
5. Anexos.

## Perguntas rápidas antes de codar
- Os anexos devem ser **privados** (visíveis só ao dono) — confirma?
- A garantia precisa funcionar também para vendas **sem produto cadastrado** (apenas texto livre)? Nesse caso ela existe mas não mexe no estoque.
- O histórico/responsável deve mostrar o e-mail do usuário (vindo de `profiles`) ou apenas o ID?