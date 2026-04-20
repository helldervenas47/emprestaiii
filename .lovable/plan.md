
Plano: Modo Offline com Dexie + Fila de Sincronização

## Escopo
Cobrir **despesas**, **clientes** e **empréstimos** (+ `loan_installments` e `payments` por dependência) com leitura offline e fila de escrita que sincroniza ao reconectar. Conflito = last-write-wins.

## Arquitetura

```text
UI (hooks)
   │
   ▼
offlineSync layer ──► IndexedDB (Dexie)
   │                    ├── tables_cache (espelho)
   │                    └── pending_mutations (fila)
   │
   ▼ (quando online)
Supabase
```

## Mudanças

### 1. Dependência
- Adicionar `dexie` ao `package.json`.

### 2. Camada offline (novos arquivos)
- `src/lib/offline/db.ts` — schema Dexie:
  - `clients`, `expenses`, `loans`, `loan_installments`, `payments` (espelhos)
  - `pending_mutations` `{id, table, op: insert|update|delete, payload, recordId, createdAt, retries, lastError}`
  - `meta` `{key, value}` (ex: `lastSync:expenses`)
- `src/lib/offline/sync.ts`:
  - `cacheRows(table, rows)` — popula espelho
  - `enqueueMutation(...)` — adiciona à fila + aplica no espelho local
  - `flushQueue()` — drena FIFO chamando Supabase; em sucesso remove; em erro de rede mantém; em erro lógico (RLS, dup) descarta + log
  - `getPendingCount()` / hook `usePendingCount()`
  - Listeners: `online`, foco da janela, retry exponencial
- `src/lib/offline/status.ts` — hook `useOnlineStatus()` (true/false) baseado em `navigator.onLine` + ping leve opcional.

### 3. Hooks adaptados
Modificar `useClients`, `useExpenses`, `useLoans` para:
- **Fetch**: tentar Supabase → on success cachear no Dexie; on fail carregar do Dexie.
- **Mutações**: se online → caminho atual + cachear; se offline → atualização otimista (já existe) + `enqueueMutation`.
- IDs temporários (`crypto.randomUUID()`) já usados; manter mapeamento `tempId → realId` para que mutações subsequentes do mesmo registro funcionem offline (rewrite do `recordId` na fila quando o insert é confirmado).

### 4. UI
- `src/components/OfflineBadge.tsx` — badge fixo top (canto) "Modo offline" quando `!online`. Sumir quando online.
- Renderizado no `App.tsx` (junto com Toasters).
- `src/components/PendingSyncCard.tsx` em **Settings**:
  - Mostra contador de pendências por tabela
  - Botão "Sincronizar agora" → `flushQueue()`
  - Toast de progresso/sucesso
- Toast automático "X alterações sincronizadas" quando fila esvazia ao voltar online.

### 5. Estratégia de conflito (last-write-wins)
- Inserts: sempre vencem (UUID novo, sem colisão).
- Updates: enviam payload bruto; servidor sobrescreve. Se Supabase devolver erro de RLS, descartar + toast "alteração descartada".
- Deletes: replay direto; se já apagado no servidor, ignorar erro 404.
- Realtime ao voltar online: refetch completo das tabelas afetadas após `flushQueue()` para reconciliar.

### 6. Limitações documentadas
- Auth precisa estar logado antes de ficar offline (sessão em cache do Supabase).
- Service worker do PWA já está desabilitado em iframe — testes offline reais só no app publicado/instalado.
- Outras tabelas (sales, products, credit_cards, etc.) continuam online-only.

## Arquivos a criar
- `src/lib/offline/db.ts`
- `src/lib/offline/sync.ts`
- `src/lib/offline/status.ts`
- `src/components/OfflineBadge.tsx`
- `src/components/PendingSyncCard.tsx`

## Arquivos a editar
- `package.json` (adicionar `dexie`)
- `src/hooks/useClients.ts`
- `src/hooks/useExpenses.ts`
- `src/hooks/useLoans.ts`
- `src/App.tsx` (mount OfflineBadge)
- `src/components/Settings.tsx` (mount PendingSyncCard)

## Sem mudanças no banco
Tudo client-side. Nenhuma migration necessária.
