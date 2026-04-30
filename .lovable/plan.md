# Rastreamento de veículos no card

Adicionar um card de rastreio em cada veículo de `VehicleCardList` com mini-mapa, status online/offline, velocidade, ignição, endereço e "atualizado há X min". Atualização automática a cada 3 minutos via Edge Function agendada + botão de refresh manual.

## Importante sobre a Hapolo

A Hapolo não publica API REST pública. Para a integração funcionar você precisa pedir ao suporte deles:
- URL base da API (ex.: `https://api.hapolo.site/...` ou painel white-label)
- Credenciais (usuário/senha **ou** token Bearer)
- Endpoint de listagem de dispositivos e endpoint de última posição

Como isso pode variar, vou construir um **adaptador trocável**: a integração já fica pronta pra Hapolo, Traccar e "HTTP custom". Você escolhe o provedor e cola as credenciais nas configurações.

## Como vai funcionar

```text
Hapolo / Traccar / API custom
            │  (Edge Function busca a cada 3 min via cron)
            ▼
   tracking_positions  ◄── tracking_providers (config + secret)
            │  (realtime + select)
            ▼
   Card do veículo (mini-mapa Leaflet + status)
```

## Mudanças no banco

Nova tabela `tracking_providers` (1 por owner, guarda URL/credenciais cifradas como secret name):
- `id`, `owner_id`, `provider` (`hapolo` | `traccar` | `custom`), `base_url`, `auth_type` (`basic` | `bearer`), `credential_secret_name`, `enabled`, `created_at`

Nova coluna em `vehicle_registry`:
- `tracker_device_id text` — ID do dispositivo no provedor (ex.: IMEI ou ID interno)

Nova tabela `tracking_positions` (última posição por veículo, sobrescrita a cada poll):
- `vehicle_id` (PK, FK), `owner_id`, `latitude`, `longitude`, `speed_kmh`, `ignition` (bool), `address` (text, cache), `device_time` (timestamptz), `online` (bool, calculado: `device_time > now() - 10min`), `updated_at`
- RLS: select/update somente quando `owner_id = get_data_owner_id(auth.uid())`
- Habilitar realtime na publicação `supabase_realtime`

## Edge Function: `sync-vehicle-tracking`

- Roda a cada 3 minutos via `pg_cron` + `pg_net`.
- Para cada `tracking_providers` ativo: lê o secret de credenciais, chama o adaptador correto (`hapolo.ts` / `traccar.ts` / `custom.ts`) e faz upsert em `tracking_positions` para os veículos que têm `tracker_device_id`.
- Logs de erro por veículo, não derruba o batch inteiro.
- Também invocável manualmente (botão "Atualizar agora" no card).

Geocoding reverso: usa Nominatim (OpenStreetMap, gratuito, com cache de 24h em `tracking_positions.address` — só re-busca se a posição mudou >50m). User-Agent identificado conforme exigido pelo Nominatim.

## UI

**Configurações → novo card "Rastreamento veicular"** (`VehicleTrackingSettingsCard.tsx`):
- Select de provedor (Hapolo / Traccar / Custom)
- Inputs: URL base, tipo de auth, campo de credencial (vai pra `add_secret`)
- Botão "Testar conexão" (chama edge function em modo dry-run)

**Em cada veículo de `VehicleCardList`**, novo bloco expansível "Rastreamento":
- Campo `tracker_device_id` (editável)
- Quando preenchido + posição existir:
  - Badge verde "Online" / cinza "Offline" baseado em `online`
  - Mini-mapa Leaflet 100% width × 160px com pino na posição
  - Linha de stats: 🚗 `speed_kmh` km/h · 🔑 Ignição ligada/desligada · 📍 endereço · ⏱ "há 2 min"
  - Botão refresh manual

Realtime: hook `useVehicleTracking` assina `tracking_positions` filtrando por `owner_id` e atualiza os cards sem reload.

## Dependências novas
- `leaflet` + `react-leaflet` (mini-mapa, ~40KB gz, tiles do OpenStreetMap gratuitos)

## Arquivos

**Criar:**
- `supabase/functions/sync-vehicle-tracking/index.ts`
- `supabase/functions/sync-vehicle-tracking/adapters/hapolo.ts`
- `supabase/functions/sync-vehicle-tracking/adapters/traccar.ts`
- `supabase/functions/sync-vehicle-tracking/adapters/custom.ts`
- `supabase/functions/_shared/geocode.ts`
- `src/components/VehicleTrackingSettingsCard.tsx`
- `src/components/VehicleTrackingBlock.tsx` (mini-mapa + status, usado dentro do card)
- `src/hooks/useVehicleTracking.ts`
- `src/hooks/useTrackingProvider.ts`
- Migration: tabelas + coluna + RLS + realtime
- SQL de cron (via insert tool, não migration)

**Editar:**
- `src/components/VehicleCardList.tsx` — embute `VehicleTrackingBlock`
- `src/hooks/useVehicleRegistry.ts` — incluir `tracker_device_id`
- `src/components/Settings.tsx` — adicionar card em "Notificações e integrações" ou nova seção "Veículos"
- `supabase/config.toml` — registrar a nova função

## Limitações honestas

- **Sem credenciais reais da Hapolo o adaptador não funciona** — a infra fica pronta, mas você precisa pedir API + token a eles. Se eles não fornecerem, a saída é migrar os dispositivos pra um Traccar self-hosted (que já tem adaptador pronto neste plano).
- Nominatim tem limite de 1 req/s — com sync a cada 3 min e cache de endereço, ficamos bem abaixo.
- Não inclui histórico de rotas, cerca virtual ou bloqueio remoto (escopo do v1: localização + status).
