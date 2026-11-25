// Mengantar area search with a KV cache (TASK-206). KV only caches this public, non-tenant lookup (ADR-0006: never
// routing or tenant data). Keys are the normalised keyword; non-empty values expire after 7 days.
import { MengantarError } from "@gx/mengantar-sdk"
import { emit } from "@gx/telemetry"
import { AppError } from "../http/envelope"
import { isPlaceholderSecret, publicClient } from "../mengantar/factory"

export interface AreaItem {
  id: string
  label: string
  postalCode: string | null
  subdistrict?: string | null
  district?: string | null
  city?: string | null
  province?: string | null
}

const TTL_SECONDS = 7 * 24 * 3600
const EMPTY_TTL_SECONDS = 3600
export const normaliseKeyword = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60)

export async function searchAreas(env: Env, q: string): Promise<{ items: AreaItem[]; cache: "hit" | "miss" | "skip" }> {
  const kw = normaliseKeyword(q)
  if (kw.length < 3) return { items: [], cache: "skip" }
  const key = `area:v2:${kw}`
  const cached = await env.CACHE_KV.get<AreaItem[]>(key, "json")
  if (cached) return { items: cached, cache: "hit" }

  const mock = env.MENGANTAR_PUBLIC_ORIGIN === "mock"
  const readKey = env.MENGANTAR_PUBLIC_READ_KEY?.trim()
  // Mengantar Public API v2 validates the seller key on GET /address/search (403 Not allowed otherwise).
  // Local/test mock mode uses a synthetic key; staging and production require MENGANTAR_PUBLIC_READ_KEY.
  const apiKey = readKey && !isPlaceholderSecret(readKey) ? readKey : mock ? "platform-area-search" : ""
  if (!apiKey) {
    emit("mengantar.public_api", { route: "/address/search", status: 0, outcome: "unconfigured" }, {}, { env: env.GX_ENV, severity: "error" })
    throw new AppError(503, "AREA_SEARCH_UNAVAILABLE", "Pencarian wilayah belum dikonfigurasi. Hubungi admin GeraiExpress.")
  }

  let raw
  try {
    raw = await publicClient(env, apiKey).searchArea(kw)
  } catch (err) {
    if (err instanceof MengantarError) {
      const status = err.status === 401 || err.status === 403 || err.kind === "timeout" || err.kind === "network" ? 503 : 502
      throw new AppError(status, "AREA_SEARCH_FAILED", "Pencarian wilayah sedang bermasalah. Coba lagi sebentar lagi.")
    }
    throw err
  }
  const items = raw.slice(0, 100).map((a) => ({
    id: a._id,
    label: [a.SUBDISTRICT_NAME, a.DISTRICT_NAME, a.CITY_NAME, a.PROVINCE_NAME].filter(Boolean).join(", "),
    postalCode: a.ZIP_CODE ? String(a.ZIP_CODE) : null,
    subdistrict: a.SUBDISTRICT_NAME?.trim() || null,
    district: a.DISTRICT_NAME?.trim() || null,
    city: a.CITY_NAME?.trim() || null,
    province: a.PROVINCE_NAME?.trim() || null,
  }))
  await env.CACHE_KV.put(key, JSON.stringify(items), { expirationTtl: items.length > 0 ? TTL_SECONDS : EMPTY_TTL_SECONDS })
  return { items, cache: "miss" }
}
