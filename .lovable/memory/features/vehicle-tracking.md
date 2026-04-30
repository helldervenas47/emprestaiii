---
name: Vehicle tracking
description: Per-vehicle live location card with online/offline badge, mini-map and address; backed by configurable provider adapter (Hapolo/Traccar/custom)
type: feature
---
- `tracking_providers` (1 per owner): provider, base_url, auth_type, credential_secret_name, enabled
- `tracking_positions` (1 row per vehicle, upsert): lat/lng, speed_kmh, ignition, address, device_time, online; realtime enabled
- `vehicle_registry.tracker_device_id` holds the device id at the provider
- Edge function `sync-vehicle-tracking` runs every 3 min via pg_cron; uses `adapters.ts` (traccar / hapolo / custom). Hapolo defaults to Traccar API shape since they don't publish public docs — user may need to switch to "custom" if their painel differs.
- Reverse geocoding: Nominatim (`_shared/geocode.ts`), cached 24h or until vehicle moves >50m.
- UI: `VehicleTrackingBlock` inside `VehicleCardList` cards, `VehicleTrackingSettingsCard` in Settings.
- Online window: device_time within 10 min (server) + client recheck every 60s.
