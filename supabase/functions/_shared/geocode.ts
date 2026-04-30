// Reverse geocoding using Nominatim (OpenStreetMap, free).
// Rate limit: 1 request/second, identifying User-Agent required.

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=pt-BR`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "EmprestAI/1.0 (vehicle tracking)",
        "Accept": "application/json",
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.address) return data?.display_name ?? null;
    const a = data.address;
    const parts = [
      [a.road, a.house_number].filter(Boolean).join(", "),
      a.suburb || a.neighbourhood,
      a.city || a.town || a.village,
      a.state,
    ].filter(Boolean);
    return parts.join(" - ");
  } catch (_e) {
    return null;
  }
}

// Haversine distance in meters
export function distanceMeters(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
