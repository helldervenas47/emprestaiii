

## Plano: Scripts para importar CSVs de perfis e permissões

O problema é que as tabelas `profiles`, `user_roles`, `user_owner`, `user_tab_permissions` e `user_client_permissions` têm RLS ativo e dependem de usuários no `auth.users`. Para importar via CSV, você precisa:

### O que será gerado

Um arquivo com scripts SQL para executar **antes** e **depois** da importação dos CSVs no Supabase externo:

**Script PRÉ-importação:**
- Desabilita RLS em todas as tabelas problemáticas
- Desabilita o trigger `handle_new_user` (que tenta criar perfil automaticamente e causa conflito)

**Script PÓS-importação:**
- Reabilita RLS em todas as tabelas
- Reabilita o trigger `handle_new_user`

### Ordem de importação obrigatória
1. Primeiro: crie os usuários no Authentication do Supabase (com os mesmos UUIDs)
2. Depois rode o script PRÉ-importação no SQL Editor
3. Importe os CSVs nesta ordem: `profiles` → `user_roles` → `user_owner` → `user_tab_permissions` → `user_client_permissions`
4. Rode o script PÓS-importação

### Alternativa mais simples
Gerar um script SQL com `INSERT INTO` direto para essas 5 tabelas, usando os dados já exportados — assim você só precisa colar no SQL Editor sem precisar importar CSV.

### Implementação
- Consultar os dados atuais dessas 5 tabelas
- Gerar arquivo SQL com os INSERTs prontos + controle de RLS/triggers
- Salvar em `/mnt/documents/import_perfis_permissoes.sql`

