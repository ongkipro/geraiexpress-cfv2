// Mengantar area search with a KV cache (TASK-206). KV only caches this public, non-tenant lookup (ADR-0006: never
// routing or tenant data). Keys are the normalised keyword; values expire after 7 days.
import { publicClient } from "../mengantar/factory"

export interface AreaItem {
  id: string
  label: string
  postalCode: string | null
}

const TTL_SECONDS = 7 * 24 * 3600
export const normaliseKeyword = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60)

export async function searchAreas(env: Env, q: string): Promise<{ items: AreaItem[]; cache: "hit" | "miss" | "skip" }> {
  const kw = normaliseKeyword(q)
  if (kw.length < 3) return { items: [], cache: "skip" }
  const key = `area:v1:${kw}`
  const cached = await env.CACHE_KV.get<AreaItem[]>(key, "json")
  if (cached) return { items: cached, cache: "hit" }
  // Area search needs no seller key (Mengantar does not validate it on this route); a placeholder keeps the path valid.
  const raw = await publicClient(env, "platform-area-search").searchArea(kw)
  const items = raw.slice(0, 20).map((a) => ({ id: a._id, label: [a.SUBDISTRICT_NAME, a.DISTRICT_NAME, a.CITY_NAME, a.PROVINCE_NAME].filter(Boolean).join(", "), postalCode: a.ZIP_CODE ? String(a.ZIP_CODE) : null }))
  await env.CACHE_KV.put(key, JSON.stringify(items), { expirationTtl: TTL_SECONDS })
  return { items, cache: "miss" }
}
