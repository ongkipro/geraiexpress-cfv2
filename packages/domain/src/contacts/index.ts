// Contact rules (spec 01 §2.2, spec 03 §1 item 3): phone normalisation to `08…`, address sanity, and the local COD
// risk badge computed from this gerai's own delivered/RTS counters.

/** `+62 812-3456-7890`, `62812…`, `0812…`, `812…` → `0812…`; null when it is not an Indonesian mobile number. */
export function normalizePhone08(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let d = raw.replace(/[\s\-().]/g, "")
  if (d.startsWith("+")) d = d.slice(1)
  if (!/^\d+$/.test(d)) return null
  if (d.startsWith("62")) d = `0${d.slice(2)}`
  else if (d.startsWith("8")) d = `0${d}`
  return /^08\d{8,12}$/.test(d) ? d : null
}

/** `08…` → `628…` for wa.me links. */
export const waNumber = (phone08: string) => `62${phone08.slice(1)}`

/** Rejects URLs and markup; requires at least two words in a street line (anti fake address, spec 03 §1 item 3). */
export function validStreet(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim().replace(/\s+/g, " ")
  if (s.length < 5 || s.length > 200) return null
  if (/https?:\/\/|www\.|<[^>]*>|[<>{}]/i.test(s)) return null
  return s.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length >= 2 ? s : null
}

/** Free text names/notes: no markup, trimmed, bounded. */
export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim().replace(/\s+/g, " ")
  if (!s || s.length > max || /<[^>]*>|https?:\/\//i.test(s)) return null
  return s
}

export type RiskBadge = "baru" | "hijau" | "kuning" | "merah"

/** Thresholds (spec 03 §1 item 3): no history → `baru`; RTS ≤ 20 % hijau, ≤ 40 % kuning, above → merah. */
export function riskBadge(delivered: number, rts: number): { badge: RiskBadge; rtsBps: number | null } {
  const total = delivered + rts
  if (total <= 0) return { badge: "baru", rtsBps: null }
  const rtsBps = Math.floor((rts * 10_000) / total)
  return { badge: rtsBps <= 2000 ? "hijau" : rtsBps <= 4000 ? "kuning" : "merah", rtsBps }
}
