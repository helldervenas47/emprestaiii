

## Plano: Script SQL parametrizado para troca de UUIDs

### Contexto
Após criar os usuários no Supabase externo, os novos UUIDs serão diferentes dos originais. Todas as 16 tabelas referenciam `user_id`, então é preciso atualizar cada uma delas.

### O que será gerado
Um arquivo SQL (`/mnt/documents/trocar_uuids.sql`) com:

1. **Variáveis declaradas** para cada usuário — basta preencher o novo UUID:
   - Helder Venas: `ba365726-d9b1-430d-b3c5-e05ac1816aad` → `NOVO_UUID`
   - Mariana Alves: `2a936eda-4002-4af6-8e7c-4fe5a69c5831` → `NOVO_UUID`
   - Renan Mota: `212547eb-42bb-4650-9d70-3028b71a117a` → `NOVO_UUID`

2. **Desabilita RLS e triggers** temporariamente em todas as tabelas

3. **UPDATE em todas as 16 tabelas** trocando `user_id` antigo pelo novo:
   - `profiles`, `user_roles`, `user_owner` (tanto `user_id` quanto `owner_id`), `user_tab_permissions`, `user_client_permissions`
   - `clients`, `loans`, `payments`, `loan_installments`, `sales`, `expenses`, `products`
   - `balance`, `vehicle_balance`, `vehicle_registry`, `locador_info`

4. **Reabilita RLS e triggers**

### Como usar
1. Crie os 3 usuários no Authentication do Supabase externo
2. Copie os novos UUIDs gerados
3. Substitua os placeholders no script
4. Execute no SQL Editor do Supabase

### Detalhes técnicos
- Usa bloco `DO $$ ... $$` com variáveis PL/pgSQL para facilitar a substituição
- Trata `user_owner.owner_id` separadamente (o admin Helder é o owner dos sub-usuários)
- Script idempotente — pode rodar mais de uma vez sem erro

