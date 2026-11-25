import { isInIndonesia } from "@gx/domain/geo"

export interface GeocodePoint {
  lat: number
  lng: number
  label: string
}

export interface GeocodeResult {
  point: GeocodePoint | null
  candidates: GeocodePoint[]
}

const LOCAL_CITIES: Array<{ re: RegExp; point: GeocodePoint }> = [
  { re: /bandung|coblong|dago|antapani|buahbatu|cicendo/i, point: { lat: -6.8915, lng: 107.6107, label: "" } },
  { re: /surabaya|gubeng|wonokromo|rungkut/i, point: { lat: -7.2575, lng: 112.7521, label: "" } },
  { re: /yogyakarta|jogja|sleman|bantul/i, point: { lat: -7.7956, lng: 110.3695, label: "" } },
  { re: /semarang|tembalang|banyumanik/i, point: { lat: -6.9667, lng: 110.4167, label: "" } },
  { re: /medan|sunggal|helvetia/i, point: { lat: 3.5952, lng: 98.6722, label: "" } },
  { re: /makassar|panakkukang|rappocini/i, point: { lat: -5.1477, lng: 119.4327, label: "" } },
  { re: /denpasar|badung|kuta|bali/i, point: { lat: -8.6705, lng: 115.2126, label: "" } },
  { re: /tangerang|bsd|serpong|ciputat/i, point: { lat: -6.2886, lng: 106.7179, label: "" } },
  { re: /bekasi|cikarang|tambun/i, point: { lat: -6.2383, lng: 106.9756, label: "" } },
  { re: /depok|margonda|cinere/i, point: { lat: -6.4025, lng: 106.7942, label: "" } },
  { re: /bogor|cibinong|sentul/i, point: { lat: -6.5971, lng: 106.806, label: "" } },
]

/** Builds progressively broader fallback queries for comma-separated Indonesian addresses. */
export function buildGeocodeQueries(q: string): string[] {
  const parts = q
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  const queries = [q]
  if (parts.length >= 3) {
    const withoutFirst = parts.slice(1).join(", ")
    if (withoutFirst.length >= 3 && !queries.includes(withoutFirst)) queries.push(withoutFirst)
  }
  if (parts.length >= 4) {
    const tailTwo = parts.slice(-2).join(", ")
    if (tailTwo.length >= 3 && !queries.includes(tailTwo)) queries.push(tailTwo)
  }
  return queries
}

async function queryNominatim(q: string, fetcher: typeof fetch): Promise<GeocodePoint[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=id&limit=5&q=${encodeURIComponent(q)}`
  const res = await fetcher(url, {
    headers: {
      "user-agent": "GeraiExpress/2.0 (https://geraiexpress.com)",
      accept: "application/json",
      "accept-language": "id,en",
    },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) return []
  const arr = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>
  if (!Array.isArray(arr)) return []
  const seen = new Set<string>()
  const out: GeocodePoint[] = []
  for (const item of arr) {
    const lat = item?.lat ? Math.round(Number(item.lat) * 1e6) / 1e6 : NaN
    const lng = item?.lon ? Math.round(Number(item.lon) * 1e6) / 1e6 : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInIndonesia(lat, lng)) continue
    const dedupKey = `${lat},${lng}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    out.push({ lat, lng, label: item?.display_name?.trim() || q })
  }
  return out
}

/**
 * KV-cached Indonesian Nominatim forward geocoder.
 * Stores a wrapped `{ point, candidates }` envelope under `geocode:v2:` so a KV cache miss (`null`)
 * is never mistaken for a cached negative lookup.
 */
export async function geocodeIndonesia(
  env: Pick<Env, "GX_ENV" | "CACHE_KV">,
  rawQuery: string,
  waitUntil?: (p: Promise<unknown>) => void,
  fetcher: typeof fetch = fetch,
): Promise<GeocodeResult> {
  const q = rawQuery.trim().replace(/\s+/g, " ").slice(0, 160)
  if (q.length < 3) return { point: null, candidates: [] }

  if (env.GX_ENV === "local") {
    const matched = LOCAL_CITIES.find((c) => c.re.test(q))
    const point: GeocodePoint = matched
      ? { lat: matched.point.lat, lng: matched.point.lng, label: q }
      : { lat: -6.2297, lng: 106.8576, label: q }
    return { point, candidates: [point] }
  }

  const key = `geocode:v2:${q.toLowerCase()}`
  const cached = await env.CACHE_KV.get<GeocodeResult>(key, "json").catch(() => null)
  if (cached && typeof cached === "object" && "point" in cached && Array.isArray(cached.candidates)) {
    return cached
  }

  try {
    let candidates: GeocodePoint[] = []
    for (const candidateQuery of buildGeocodeQueries(q)) {
      candidates = await queryNominatim(candidateQuery, fetcher)
      if (candidates.length > 0) break
    }
    const result: GeocodeResult = { point: candidates[0] ?? null, candidates }
    const ttl = result.point ? 7 * 86_400 : 3_600
    const write = env.CACHE_KV.put(key, JSON.stringify(result), { expirationTtl: ttl }).catch(() => undefined)
    if (waitUntil) waitUntil(write)
    else await write
    return result
  } catch {
    return { point: null, candidates: [] }
  }
}
