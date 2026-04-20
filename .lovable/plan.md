
User asks if it's possible to open a map to see where the session is located. Currently the ActiveSessionsCard shows city/region/country text from ip-api.com but no map link.

Plan: add a clickable "Ver no mapa" link/button next to the location info that opens Google Maps in a new tab with the location query (city, region, country) — or coordinates if we fetch lat/lon from ip-api.

Better: extend `manage-sessions` edge function to also request `lat,lon` from ip-api (already free, just add fields) and store in the geo object. Then the frontend renders a small "Ver no mapa" link using `https://www.google.com/maps?q=lat,lon` (more precise) with fallback to text query.

## Plan

**1. `supabase/functions/manage-sessions/index.ts`**
- Update the `fields` query param of ip-api to include `lat,lon`: `fields=status,country,city,regionName,lat,lon`
- Include `lat` and `lon` in the returned geo object

**2. `src/components/ActiveSessionsCard.tsx`**
- Extend `SessionItem.geo` type with optional `lat?: number; lon?: number`
- Next to the location line (MapPin), add an external link button "Ver no mapa" that opens:
  - `https://www.google.com/maps?q=${lat},${lon}` if coords exist
  - else `https://www.google.com/maps?q=${encodeURIComponent("city, region, country")}`
- Open in new tab (`target="_blank" rel="noopener noreferrer"`), with an `ExternalLink` icon
- Only show when there's any geo info

**Notes / limitations to mention to user:**
- Localização vem do IP via ip-api.com — é aproximada (geralmente cidade do provedor de internet, não endereço exato). VPN/4G/proxy pode mostrar outra cidade.
- Não dá para ter localização precisa (GPS) sem pedir permissão ao dispositivo no momento do login, o que não é prático para sessões já existentes.
