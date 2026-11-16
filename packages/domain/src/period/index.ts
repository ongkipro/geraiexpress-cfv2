// Period filter resolution (DEC-221, visual 08 §1.4). Days are Asia/Jakarta calendar days (UTC+7, no DST); ranges
// are inclusive day keys `YYYY-MM-DD`, resolved to epoch-ms bounds `[fromMs, toMsExclusive)`.
export const WIB_OFFSET_MS = 7 * 3600_000
const DAY_MS = 86_400_000
export const MAX_SPAN_DAYS = 180

export type Preset = "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "90d"
export const PRESETS: Array<{ id: Preset; label: string; param: string }> = [
  { id: "today", label: "Hari ini", param: "hari-ini" },
  { id: "yesterday", label: "Kemarin", param: "kemarin" },
  { id: "7d", label: "7 hari terakhir", param: "7d" },
  { id: "30d", label: "30 hari terakhir", param: "30d" },
  { id: "this_month", label: "Bulan ini", param: "bulan-ini" },
  { id: "last_month", label: "Bulan lalu", param: "bulan-lalu" },
  { id: "90d", label: "90 hari terakhir", param: "90d" },
]
export const DEFAULT_PRESET: Preset = "7d"

export interface Period {
  preset: Preset | null
  from: string
  to: string
  fromMs: number
  toMs: number
  days: number
  granularity: "hour" | "day" | "week"
}

/** WIB calendar day key for an instant. */
export function wibDay(ms: number): string {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

/** Start of a WIB day key as epoch ms. */
export function wibStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) - WIB_OFFSET_MS
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

function build(from: string, to: string, preset: Preset | null): Period {
  const fromMs = wibStartMs(from)
  const toMs = wibStartMs(addDays(to, 1))
  const days = Math.round((toMs - fromMs) / DAY_MS)
  return { preset, from, to, fromMs, toMs, days, granularity: days <= 2 && (preset === "today" || preset === "yesterday") ? "hour" : days <= 92 ? "day" : "week" }
}

export function resolvePreset(p: Preset, now: number): Period {
  const today = wibDay(now)
  const [y, m] = today.split("-").map(Number) as [number, number]
  switch (p) {
    case "today":
      return build(today, today, p)
    case "yesterday":
      return build(addDays(today, -1), addDays(today, -1), p)
    case "7d":
      return build(addDays(today, -6), today, p)
    case "30d":
      return build(addDays(today, -29), today, p)
    case "90d":
      return build(addDays(today, -89), today, p)
    case "this_month":
      return build(`${today.slice(0, 7)}-01`, today, p)
    case "last_month": {
      const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10)
      const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)
      return build(first, last, p)
    }
  }
}

export type CustomError = "INVALID_DATE" | "FUTURE" | "TOO_LONG"

/** Custom range: swaps reversed ends, refuses future days and spans over 180 days. */
export function resolveCustom(from: string, to: string, now: number): { ok: true; period: Period } | { ok: false; error: CustomError; message: string } {
  if (!isDay(from) || !isDay(to)) return { ok: false, error: "INVALID_DATE", message: "Tanggal tidak valid" }
  const [a, b] = from <= to ? [from, to] : [to, from]
  const today = wibDay(now)
  if (b > today) return { ok: false, error: "FUTURE", message: "Tanggal tidak boleh melewati hari ini" }
  const p = build(a!, b!, null)
  if (p.days > MAX_SPAN_DAYS) return { ok: false, error: "TOO_LONG", message: `Maksimal ${MAX_SPAN_DAYS} hari` }
  return { ok: true, period: p }
}

/** URL search params → period (`?periode=7d` or `?dari=…&sampai=…`); anything invalid → the default preset. */
export function periodFromParams(params: { periode?: string | null; dari?: string | null; sampai?: string | null }, now: number): Period {
  if (params.dari && params.sampai) {
    const c = resolveCustom(params.dari, params.sampai, now)
    if (c.ok) return c.period
  }
  const preset = PRESETS.find((p) => p.param === params.periode)?.id ?? DEFAULT_PRESET
  return resolvePreset(preset, now)
}

export function paramsOf(p: Period): Record<string, string> {
  return p.preset ? { periode: PRESETS.find((x) => x.id === p.preset)!.param } : { dari: p.from, sampai: p.to }
}

/** The previous period of equal length (KPI comparison, visual 08 §1.4). */
export function previousOf(p: Period): Period {
  return build(addDays(p.from, -p.days), addDays(p.from, -1), null)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

/** `8 – 14 Nov 2026`, `1 – 31 Okt 2026`, `28 Okt – 3 Nov 2026`, `14 Nov 2026`. */
export function rangeLabel(p: Pick<Period, "from" | "to">, long = false): string {
  const [fy, fm, fd] = p.from.split("-").map(Number) as [number, number, number]
  const [ty, tm, td] = p.to.split("-").map(Number) as [number, number, number]
  const M = long ? MONTHS_LONG : MONTHS
  const sep = long ? " sampai " : " – "
  if (p.from === p.to) return `${td} ${M[tm - 1]} ${ty}`
  if (fy === ty && fm === tm) return `${fd}${sep}${td} ${M[tm - 1]} ${ty}`
  if (fy === ty) return `${fd} ${M[fm - 1]}${sep}${td} ${M[tm - 1]} ${ty}`
  return `${fd} ${M[fm - 1]} ${fy}${sep}${td} ${M[tm - 1]} ${ty}`
}

/** Bucket key for a chart point at instant `ms` (WIB hour, day, or Monday-start week). */
export function bucketOf(p: Period, ms: number): string {
  const local = new Date(ms + WIB_OFFSET_MS)
  if (p.granularity === "hour") return `${local.toISOString().slice(0, 13)}`
  const day = local.toISOString().slice(0, 10)
  if (p.granularity === "day") return day
  const dow = (local.getUTCDay() + 6) % 7
  return addDays(day, -dow)
}

/** Every bucket key in the period, in order (empty buckets render as zero). */
export function bucketsOf(p: Period): string[] {
  const out: string[] = []
  if (p.granularity === "hour") {
    for (let t = p.fromMs; t < p.toMs; t += 3600_000) out.push(bucketOf(p, t))
    return out
  }
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
    const k = bucketOf(p, wibStartMs(d))
    if (out[out.length - 1] !== k) out.push(k)
  }
  return out
}
