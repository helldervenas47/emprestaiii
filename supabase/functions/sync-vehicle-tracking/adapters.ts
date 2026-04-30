// Provider adapters for vehicle tracking.
// Each adapter receives a device id and returns the latest position,
// or null if not found / not supported.

export interface DevicePosition {
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  ignition: boolean | null;
  device_time: string; // ISO
  raw?: unknown;
}

export interface AdapterContext {
  baseUrl: string;
  authType: "basic" | "bearer";
  credential: string; // token or "user:pass"
}

function authHeader(ctx: AdapterContext): Record<string, string> {
  if (ctx.authType === "basic") {
    const encoded = btoa(ctx.credential);
    return { Authorization: `Basic ${encoded}` };
  }
  return { Authorization: `Bearer ${ctx.credential}` };
}

// Traccar — well-documented REST API.
// GET /api/positions?deviceId=X returns latest by default.
async function traccarFetch(ctx: AdapterContext, deviceId: string): Promise<DevicePosition | null> {
  const url = `${ctx.baseUrl.replace(/\/$/, "")}/api/positions?deviceId=${encodeURIComponent(deviceId)}`;
  const resp = await fetch(url, { headers: { ...authHeader(ctx), Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Traccar ${resp.status}: ${await resp.text()}`);
  const arr = await resp.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;
  // Pick most recent
  const p = arr.reduce((a: any, b: any) =>
    new Date(a.deviceTime || a.fixTime || 0) > new Date(b.deviceTime || b.fixTime || 0) ? a : b
  );
  return {
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    speed_kmh: p.speed != null ? Number(p.speed) * 1.852 : null, // knots → km/h
    ignition: p.attributes?.ignition ?? null,
    device_time: p.deviceTime || p.fixTime || new Date().toISOString(),
    raw: p,
  };
}

// Hapolo — no public API documentation. Treat as a generic Traccar-compatible
// endpoint by default; if Hapolo's painel exposes a different schema, the
// "custom" adapter or a future hapolo-specific implementation can be plugged in.
async function hapoloFetch(ctx: AdapterContext, deviceId: string): Promise<DevicePosition | null> {
  // Hapolo white-label often runs on top of Traccar / Suntech-like backends.
  // We try the Traccar shape first; users can swap to "custom" if their
  // instance uses something else.
  return traccarFetch(ctx, deviceId);
}

// Generic custom: expects GET {baseUrl}/{deviceId} returning JSON
// { latitude, longitude, speed_kmh?, ignition?, device_time? }
async function customFetch(ctx: AdapterContext, deviceId: string): Promise<DevicePosition | null> {
  const url = `${ctx.baseUrl.replace(/\/$/, "")}/${encodeURIComponent(deviceId)}`;
  const resp = await fetch(url, { headers: { ...authHeader(ctx), Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Custom ${resp.status}: ${await resp.text()}`);
  const p = await resp.json();
  if (p == null || p.latitude == null || p.longitude == null) return null;
  return {
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    speed_kmh: p.speed_kmh != null ? Number(p.speed_kmh) : null,
    ignition: p.ignition ?? null,
    device_time: p.device_time || new Date().toISOString(),
    raw: p,
  };
}

export async function fetchPosition(
  provider: string,
  ctx: AdapterContext,
  deviceId: string,
): Promise<DevicePosition | null> {
  switch (provider) {
    case "traccar": return traccarFetch(ctx, deviceId);
    case "hapolo": return hapoloFetch(ctx, deviceId);
    case "custom": return customFetch(ctx, deviceId);
    default: throw new Error(`Provider desconhecido: ${provider}`);
  }
}
