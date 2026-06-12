# Permissões granulares por papel

Hoje os papéis existem (`admin`, `gerente`, `operador`, `visualizador`) mas não há matriz de permissões editável — o acesso fica espalhado em verificações ad-hoc por `role`. Esta entrega cria uma matriz "papel × módulo × ação" persistida no banco, editável pelo admin, aplicada automaticamente a todos os usuários do papel e auditada.

## Modelo de dados (migration)

```text
role_permissions
├── id uuid PK
├── role text                     -- admin | gerente | operador | visualizador
├── module text                   -- "loans", "clients", "expenses", "incomes", "reports", ...
├── can_view bool default false
├── can_create bool default false
├── can_edit bool default false
├── can_delete bool default false
├── updated_at timestamptz
└── unique (role, module)

role_permissions_audit
├── id uuid PK
├── role text
├── module text
├── before jsonb                  -- {view,create,edit,delete}
├── after jsonb
├── changed_by uuid               -- auth.uid()
└── changed_at timestamptz default now()
```

RLS: leitura para `authenticated`; escrita só para `has_role(auth.uid(),'admin')`. Trigger `BEFORE UPDATE` registra diff em `role_permissions_audit`. Seed inicial: `admin` = todas as ações em todos os módulos; demais papéis com o set atual já em uso (view-only para `visualizador`, etc).

Função SECURITY DEFINER:
`public.has_permission(_user uuid, _module text, _action text) returns bool` — lê o papel do usuário em `user_roles` e consulta `role_permissions`. É essa função que substitui os `role = 'admin'` espalhados nas policies.

## Backend / RLS

- Reescrever policies das tabelas sensíveis (`loans`, `clients`, `expenses`, `incomes`, `payments`, `payrolls`, etc.) para usar `has_permission(auth.uid(), '<module>', '<action>')` no lugar de checagens hard-coded por role. Como `has_permission` lê uma tabela única e indexada por (role, module), trocar a permissão no admin reflete imediatamente para todos os usuários do papel — sem precisar tocar em cada conta.
- Manter `has_role` para casos puramente administrativos (gestão de planos, billing).

## Frontend

Novo módulo **Administração → Papéis & Permissões**:

- Tela `src/components/admin/RolePermissionsMatrix.tsx`
  - Tabs por papel (Admin, Gerente, Operador, Visualizador).
  - Tabela "Módulo × Ver / Criar / Editar / Excluir" com switches.
  - Botão **Salvar alterações** → upsert em `role_permissions` (uma chamada por linha alterada). Toast de sucesso e refresh do cache.
  - Aba **Histórico**: lista `role_permissions_audit` com papel, módulo, antes/depois, usuário e data.
- Hook `src/hooks/useRolePermissions.ts`
  - `usePermissions()` retorna `{ can(module, action) }` baseado no papel do usuário logado, com cache via React Query e realtime em `role_permissions`.
- Aplicar `can(...)` nos pontos de UI que hoje escondem botões por role (criar empréstimo, editar despesa, excluir cliente, etc.). Botões desabilitados/ocultos quando `can=false`.

## Auditoria

- Trigger SQL já cobre quem/quando/o-que mudou.
- UI de histórico paginada (50 por vez), filtro por papel e período.

## Módulos cobertos (lista inicial)

`loans`, `clients`, `payments`, `expenses`, `incomes`, `payrolls`, `reports`, `products`, `sales`, `credit_cards`, `users_admin`, `settings`. Lista mantida em `src/lib/permissionModules.ts` para facilitar adicionar novos.

## Passos de execução

1. Migration: tabelas + RLS + trigger de auditoria + seed + função `has_permission`.
2. Reescrever policies das tabelas-alvo para usar `has_permission`.
3. Hook + matriz na UI de Administração.
4. Substituir checagens por role no frontend pelos `can(...)`.
5. Smoke test: alterar permissão de "gerente → expenses → can_delete=false" e validar que usuários gerente perdem o botão e o DELETE é rejeitado pela policy.
