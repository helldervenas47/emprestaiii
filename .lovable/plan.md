## Backup diário automático no Google Drive

Snapshot completo dos dados de cada usuário enviado todo dia para uma pasta no Google Drive (sua conta, conectada via conector nativo do Lovable).

## Como vai funcionar

1. **Conector Google Drive** ligado ao projeto (você autoriza uma vez sua conta Google).
2. **Edge function `daily-backup`**: para cada `owner_id`, lê todas as tabelas relevantes e gera um JSON único.
3. **Upload no Drive** em `Backups Empresta.aí / {nome ou e-mail do usuário}/{YYYY-MM-DD}.json`.
4. **Agendamento `pg_cron`** roda a função todo dia às 03:00.
5. **Retenção**: mantém últimos 30 backups por usuário, apaga mais antigos.
6. **UI em Configurações → Backup**:
   - Status: "Backup automático: ativo · último em DD/MM HH:MM"
   - Botão "Gerar backup agora"
   - Lista dos últimos backups com link direto para abrir no Drive
   - Toggle on/off por usuário

## O que será criado

**Banco**
- `account_settings.auto_backup_enabled boolean default true`
- `account_settings.last_auto_backup_at timestamptz`
- `account_settings.last_auto_backup_drive_url text`
- Tabela `backup_history` (id, owner_id, created_at, drive_file_id, drive_url, size_bytes, status, error)
- Job `pg_cron` diário chamando a edge function

**Edge functions**
- `daily-backup` — modo agendado (todos os usuários ativos) e modo on-demand (usuário autenticado)
- `list-backups` — lê `backup_history` do usuário

**Frontend**
- `src/components/BackupExport.tsx` — novo bloco "Backup automático no Google Drive"
- Hook `useAutoBackups.ts`

## Detalhes técnicos

- Snapshot em JSON (formato fiel; reimportação manual já existe pela tela atual).
- Tabelas incluídas: loans, payments, clients, sales, expenses, incomes, monthly_goals, payment_methods, piggy_banks, products, vehicles, credit_cards, notes — confirmar lista final na implementação.
- Edge function usa `service_role` para ler dados de todos os owners no modo agendado; on-demand valida JWT.
- Upload no Drive via gateway `https://connector-gateway.lovable.dev/google_drive/...` com `multipart` upload.
- Estrutura da pasta criada na primeira execução; `folder_id` cacheado em `account_settings`.

## Limitações importantes

- **Todos os backups vão para a sua conta Google** (do dono do app), não para a conta de cada usuário final. Se quiser que cada usuário receba na própria conta, é preciso OAuth por usuário (fluxo bem mais complexo) — não está incluso aqui.
- Não é point-in-time recovery do banco, é snapshot lógico diário.
- Restauração automática a partir de um backup do Drive não está inclusa nesta entrega; o usuário pode baixar o JSON e usar "Importar" manualmente (precisa do importador JSON, que adiciono se ainda não existir).

## Pré-requisitos antes de implementar

- Conectar o Google Drive ao projeto (vou te chamar o seletor de conexão na hora).
- Confirmar se quer 30 dias de retenção e horário 03:00 (BRT).
