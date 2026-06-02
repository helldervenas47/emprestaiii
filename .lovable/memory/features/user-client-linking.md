---
name: User-client linking
description: Sub-users can be linked to specific clients; when linked, they only see data (loans, clients, sales, vehicles) for those clients. No links = see all data.
type: feature
---
- Table `user_client_permissions` links user_id to client_id (many-to-many)
- Edge function `admin-manage-user` supports `update_client_links` action and returns `linked_client_ids` in list
- useAuth exposes `linkedClientIds` (null = no filter, array = filter active)
- Index.tsx filters clients, loans (by borrower_id), sales (by customer_name matching client names), payments and installments (by filtered loan ids)
- Expenses are NOT filtered by client link (they're business-wide)
- UserManagement has a "Vincular Clientes" dialog with checkboxes, search, select all/clear
