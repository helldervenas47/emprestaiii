## Restaurar backup do Google Drive no app

Hoje o backup automático **gera** o JSON e envia pro Drive, mas o app não tem como **importar de volta**. A importação atual só aceita CSV por entidade. Vou adicionar um fluxo dedicado de restauração.

## Como vai funcionar (UX)

Em **Configurações → Backup**, dentro do card "Backup automático no Google Drive":

1. Botão **"Restaurar backup"** abre um diálogo com duas opções:
   - **Selecionar do histórico** — lista os backups recentes do Drive (já existe a lista) com botão "Restaurar" em cada um.
   - **Enviar arquivo JSON** — upload manual de um `.json` que o usuário baixou do Drive.
2. Antes de restaurar, mostra confirmação clara com:
   - Data do backup, tamanho, quantas linhas por tabela
   - Modo: **Mesclar** (default — só insere o que falta, não toca em nada existente) ou **Substituir** (apaga tudo do owner e reinsere — exige digitar "RESTAURAR" para confirmar)
3. Durante a restauração: barra de progresso por tabela, e ao final um resumo (X linhas restauradas, Y ignoradas por já existirem, Z erros).

## O que será criado

**Edge function `restore-backup`**
- Recebe `{ source: "drive" | "upload", driveFileId?, jsonContent?, mode: "merge" | "replace" }`
- Valida JWT do usuário e descobre `owner_id` real (via `get_data_owner_id`)
- Se `source=drive`: baixa o arquivo do Drive via gateway (`GET /drive/v3/files/{id}?alt=media`) e valida que o `__meta.owner_id` do JSON bate com o owner do usuário autenticado (segurança — impede restaurar backup de outro)
- Para cada tabela do snapshot:
   - **merge**: `upsert` por `id` com `onConflict: 'id', ignoreDuplicates: true` — preserva o que já existe
   - **replace**: `delete` filtrando pelo `ownerCol` do owner, depois `insert` em lote
- Respeita ordem de tabelas para evitar quebrar foreign keys (clientes antes de empréstimos, empréstimos antes de pagamentos/parcelas, etc.)
- Retorna resumo `{ table: { inserted, skipped, errors } }`

**Frontend**
- `RestoreBackupDialog.tsx` — novo diálogo com as duas opções, preview, escolha de modo e confirmação
- Botão "Restaurar backup" no `AutoBackupCard.tsx`
- Após sucesso, dispara recarga dos hooks (invalidar caches de loans/clients/etc) e toast

**Sem mudanças de schema** — o JSON do backup já contém `id` e todos os campos.

## Detalhes técnicos / segurança

- Restauração só pode acontecer para o **próprio owner** do usuário logado. O `owner_id` do JSON é checado contra `get_data_owner_id(auth.uid())`. Tentativa de restaurar backup de outro retorna 403.
- Modo **replace** é destrutivo: a função roda dentro de uma sequência de deletes ordenados (filhos antes de pais) e exige confirmação textual no frontend.
- Modo **merge** é seguro e idempotente: usa `upsert` ignorando conflitos por `id`. Útil para "restaurar dados perdidos sem mexer no que está atual".
- Se o JSON tiver tabelas que não existem mais no schema atual, são ignoradas com aviso no resumo.
- Tamanho do arquivo: backups grandes (>5MB) são processados em chunks de 500 linhas por tabela.

## Limitações

- Restaurar **não recria usuários nem auth** — só os dados do owner. Login, perfis em `auth.users`, senhas, sessões: nada disso é mexido.
- Tabelas relacionadas a Telegram/WhatsApp **não fazem parte** da restauração no modo replace (evita duplicar mensagens, links, bots) — só são restauradas em merge.
- Não restaura arquivos de storage (logos, branding) — só dados tabulares.
