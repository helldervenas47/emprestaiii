import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchPosition, type AdapterContext } from "./adapters.ts";
import { reverseGeocode, distanceMeters } from "../_shared/geocode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ONLINE_WINDOW_MIN = 10;
const ADDR_REFRESH_HOURS = 24;
const ADDR_MOVE_THRESHOLD_M = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const ownerFilter = url.searchParams.get("owner_id"); // optional manual trigger

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Load active providers
  let providersQ = admin.from("tracking_providers").select("*").eq("enabled", true);
  if (ownerFilter) providersQ = providersQ.eq("owner_id", ownerFilter);
  const { data: providers, error: pErr } = await providersQ;
  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result: Record<string, { ok: number; failed: number; errors: string[] }> = {};

  for (const prov of providers ?? []) {
    const ownerId = prov.owner_id as string;
    result[ownerId] = { ok: 0, failed: 0, errors: [] };

    const credential = Deno.env.get(prov.credential_secret_name);
    if (!credential) {
      result[ownerId].errors.push(`Secret ${prov.credential_secret_name} ausente`);
      await admin.from("tracking_providers")
        .update({ last_sync_error: `Secret ${prov.credential_secret_name} ausente`, last_sync_at: new Date().toISOString() })
        .eq("id", prov.id);
      continue;
    }

    const ctx: AdapterContext = {
      baseUrl: prov.base_url,
      authType: prov.auth_type,
      credential,
    };

    // 2. Vehicles for this owner with a device id
    const { data: vehicles, error: vErr } = await admin
      .from("vehicle_registry")
      .select("id, tracker_device_id")
      .eq("user_id", ownerId)
      .not("tracker_device_id", "is", null)
      .neq("tracker_device_id", "");

    if (vErr) {
      result[ownerId].errors.push(vErr.message);
      continue;
    }

    // Existing positions for caching (address + last coords)
    const vehicleIds = (vehicles ?? []).map((v) => v.id);
    const { data: existing } = vehicleIds.length
      ? await admin.from("tracking_positions").select("*").in("vehicle_id", vehicleIds)
      : { data: [] as any[] };
    const existingMap = new Map((existing ?? []).map((p: any) => [p.vehicle_id, p]));

    for (const v of vehicles ?? []) {
      try {
        const pos = await fetchPosition(prov.provider, ctx, v.tracker_device_id!);
        if (!pos) { result[ownerId].failed++; continue; }

        const prev: any = existingMap.get(v.id);
        let address = prev?.address ?? null;
        let address_cached_at = prev?.address_cached_at ?? null;

        const needsAddress =
          !address ||
          !address_cached_at ||
          (new Date().getTime() - new Date(address_cached_at).getTime() > ADDR_REFRESH_HOURS * 3600 * 1000) ||
          (prev && distanceMeters(prev.latitude, prev.longitude, pos.latitude, pos.longitude) > ADDR_MOVE_THRESHOLD_M);

        if (needsAddress) {
          const newAddr = await reverseGeocode(pos.latitude, pos.longitude);
          if (newAddr) {
            address = newAddr;
            address_cached_at = new Date().toISOString();
          }
        }

        const deviceTimeMs = new Date(pos.device_time).getTime();
        const online = (Date.now() - deviceTimeMs) < ONLINE_WINDOW_MIN * 60 * 1000;

        const { error: upErr } = await admin.from("tracking_positions").upsert({
          vehicle_id: v.id,
          owner_id: ownerId,
          latitude: pos.latitude,
          longitude: pos.longitude,
          speed_kmh: pos.speed_kmh,
          ignition: pos.ignition,
          address,
          address_cached_at,
          device_time: pos.device_time,
          online,
          raw: pos.raw,
          updated_at: new Date().toISOString(),
        }, { onConflict: "vehicle_id" });

        if (upErr) throw upErr;
        result[ownerId].ok++;
      } catch (e: any) {
        result[ownerId].failed++;
        result[ownerId].errors.push(`${v.tracker_device_id}: ${e?.message ?? e}`);
      }
    }

    await admin.from("tracking_providers")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: result[ownerId].errors.length ? result[ownerId].errors.slice(0, 3).join(" | ") : null,
      })
      .eq("id", prov.id);
  }

  return new Response(JSON.stringify({ result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
