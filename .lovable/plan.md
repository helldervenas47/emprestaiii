## Contexto

A infraestrutura de backup já existe parcialmente:
- `daily-backup` (edge function) — gera snapshot JSON de ~42 tabelas e envia ao Google Drive
- `restore-backup` (edge function) — restaura JSON do Drive ou de upload, modos `merge`/`replace`
- `RestoreBackupDialog.tsx` — já permite upload de JSON e modo "substituir tudo"
- `BackupExport.tsx` — exporta CSVs por entidade

O que falta para atender o pedido:

1. **Download direto do JSON completo** (hoje só vai para o Drive).
2. **Promover a UI de importação JSON** (hoje só aparece dentro do diálogo de restaurar, escondido).
3. **Exclusão total de dados** com confirmação por frase exata e log de auditoria — não existe.

---

## 1. Exportação completa (download de pacote único)

**Nova edge function `export-full-backup`** (baseada em `daily-backup`):
- Autentica o JWT do usuário, resolve `owner_id` via `get_data_owner_id`.
- Bloqueia se não for o próprio dono (sub-contas não exportam).
- Coleta as mesmas ~42 tabelas que o `daily-backup` usa, mais validação extra:
  - Conta linhas por tabela antes e depois da serialização.
  - Inclui `__meta` com: versão (`3`), `owner_id`, `member_user_ids`, `generated_at`, `app_version`, `table_counts`, `checksum` (SHA-256 do JSON sem o próprio campo).
- Retorna o JSON com `Content-Disposition: attachment; filename="empresta-ai-backup-YYYY-MM-DD-<owner8>.json"`.

**Frontend (`BackupExport.tsx`)**, novo cartão no topo:
- Botão **"Baixar backup completo (JSON)"** — chama a função via `fetch` (não `invoke`, para preservar streaming) com `Authorization: Bearer <session.access_token>`, faz `URL.createObjectURL(blob)` e dispara o download.
- Toast com tamanho do arquivo e total de registros após sucesso.
- Mostra erros/inconsistências retornados no `__meta`.

## 2. Importação de backup (UI promovida)

- No `BackupExport.tsx`, adicionar botão **"Restaurar backup completo (JSON)"** ao lado do botão de download, que abre o `RestoreBackupDialog` existente já com `source = "upload"` selecionado.
- No `restore-backup`:
  - Validar `__meta.version` — aceitar `2` e `3`, rejeitar outras com mensagem clara.
  - Validar `checksum` quando presente (versão 3).
  - Retornar no `summary` totais esperados × inseridos para cada tabela, destacando divergências.
  - Manter modos `merge`/`replace` atuais.
- O dialog já exibe o relatório por tabela; vou enriquecer com a coluna "Esperado" quando vier do snapshot.

## 3. Exclusão total dos dados

### Migração

Criar tabela `system_audit_logs` (genérica, não confundir com `accountant_audit_logs`):

```text
system_audit_logs
  id uuid PK
  user_id uuid NOT NULL          -- quem executou
  owner_id uuid NOT NULL         -- dono dos dados afetados
  action text NOT NULL            -- ex: 'wipe_all_data', 'restore_backup', 'export_backup'
  details jsonb NOT NULL default '{}'
  ip text
  user_agent text
  created_at timestamptz default now()
```
- `GRANT SELECT, INSERT ON ... TO authenticated` + `GRANT ALL TO service_role`.
- RLS: `SELECT` apenas pelo próprio owner; `INSERT` apenas via service_role (edge function).

### Nova edge function `wipe-all-data`

- Autentica o JWT, exige `owner_id === auth.uid()` (só o dono apaga).
- Body obriga `{ confirmation: "EXCLUIR TODOS OS DADOS" }` — se diferente, retorna 400.
- Usa `SERVICE_ROLE` para deletar, na ordem inversa de dependência, todas as linhas das tabelas listadas no `restore-backup` (mesma lista) onde `owner_col = ownerId`, contando linhas removidas.
- Apaga também: `backup_history`, arquivos do Storage privado do usuário (`boleto-attachments` com pasta `<ownerId>/`), `user_telegram_bots`, integrações sensíveis pertencentes ao owner.
- **Não** apaga: `auth.users`, `subscriptions`, `user_roles`, `user_owner`, `profiles` (perfil é necessário para o usuário continuar usando o app).
- Após apagar, insere registro em `system_audit_logs` com `action='wipe_all_data'`, `details={ deleted_counts, source: 'self_service' }`, IP e user-agent do request.
- Retorna `{ ok: true, deleted_counts, audit_log_id }`.

### Frontend — novo componente `WipeAllDataCard.tsx`

Exibido em `Settings.tsx` numa seção "Zona de perigo" com borda destrutiva, no fim da página, **apenas para `role === 'admin'`**.

Fluxo:
1. Aviso vermelho explicando que a ação é irreversível e lista o que será apagado.
2. Botão **"Excluir todos os dados"** abre `Dialog` (etapa 1):
   - Texto detalhado + checkbox "Compreendo que esta ação é permanente".
   - Input de confirmação: usuário precisa digitar literalmente `EXCLUIR TODOS OS DADOS`.
   - Botão "Continuar" só habilita quando ambos preenchidos.
3. Etapa 2 — segundo `Dialog` de confirmação final ("Tem certeza absoluta? Os dados serão removidos agora."), com botão "Excluir definitivamente" e contador regressivo de 5 segundos antes de habilitar.
4. Após confirmar, chama `wipe-all-data`, mostra loader, exibe relatório por tabela (igual ao do restore) e força `signOut({scope:'local'})` ao final, redirecionando para `/auth`.

## Detalhes técnicos

- Lista de tabelas é fonte única — vou extraí-la para `supabase/functions/_shared/backup-tables.ts` e importar em `daily-backup`, `restore-backup`, `export-full-backup`, `wipe-all-data`. Evita drift.
- Checksum: `SHA-256` do JSON canonical-stringified menos o campo `__meta.checksum`.
- O download usa `fetch` direto na URL `${VITE_SUPABASE_URL}/functions/v1/export-full-backup` porque `supabase.functions.invoke` consome a resposta como JSON e não permite baixar blob com `Content-Disposition` adequado.
- `wipe-all-data` é `verify_jwt = false` por padrão (Lovable Cloud), mas valida JWT em código como as outras funções já fazem.

## Arquivos afetados

- **Novos:** `supabase/functions/export-full-backup/index.ts`, `supabase/functions/wipe-all-data/index.ts`, `supabase/functions/_shared/backup-tables.ts`, `src/components/WipeAllDataCard.tsx`, migração SQL `system_audit_logs`.
- **Editados:** `supabase/functions/daily-backup/index.ts` e `restore-backup/index.ts` (usar lista compartilhada + versão 3 + checksum), `src/components/BackupExport.tsx` (botões de download/restore JSON), `src/components/RestoreBackupDialog.tsx` (coluna "esperado"), `src/components/Settings.tsx` (incluir `WipeAllDataCard`).

## Fora do escopo

- Migração entre projetos Supabase distintos (IDs de `auth.users` continuam pertencendo ao projeto original — o backup é por owner, e a restauração só funciona dentro do mesmo `owner_id`). Para mover entre contas diferentes seria necessário re-mapear IDs, o que reescreveria toda a referência cruzada. Posso adicionar isso numa segunda iteração se for o objetivo.
