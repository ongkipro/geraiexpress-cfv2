// Period presets for dashboards and histories. Same preset set and labels as AdsBookCMS
// (`src/lib/admin-date-filter.ts`), resolved in Asia/Jakarta so "Hari ini" never shifts by 7 hours.
export const DATE_PRESETS = [
  { value: "today", label: "Hari ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "7d", label: "7 hari terakhir" },
  { value: "30d", label: "30 hari terakhir" },
  { value: "this_month", label: "Bulan ini" },
  { value: "last_month", label: "Bulan lalu" },
  { value: "90d", label: "90 hari terakhir" },
] as const

export type DatePreset = (typeof DATE_PRESETS)[number]["value"]
export type Period = { kind: "preset"; preset: DatePreset } | { kind: "custom"; start: string; end: string; interval?: "hour" | "day" | "week" }
export const MAX_RANGE_DAYS = 180
export const DEFAULT_PERIOD: Period = { kind: "preset", preset: "7d" }

/** Default: last 7 days including today — a counter's week (weekday vs weekend) in one view. */
export const DEFAULT_DATE_PRESET: DatePreset = "7d"

const jakarta = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" })
export const todayWib = (now = new Date()) => jakarta.format(now)

export function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function resolvePreset(p: DatePreset, now = new Date()): { start: string; end: string; interval: "hour" | "day" } {
  const t = todayWib(now)
  switch (p) {
    case "today":
      return { start: t, end: t, interval: "hour" }
    case "yesterday": {
      const y = shiftDate(t, -1)
      return { start: y, end: y, interval: "hour" }
    }
    case "7d":
      return { start: shiftDate(t, -6), end: t, interval: "day" }
    case "30d":
      return { start: shiftDate(t, -29), end: t, interval: "day" }
    case "90d":
      return { start: shiftDate(t, -89), end: t, interval: "day" }
    case "this_month":
      return { start: `${t.slice(0, 8)}01`, end: t, interval: "day" }
    case "last_month": {
      const first = `${t.slice(0, 8)}01`
      const lastEnd = shiftDate(first, -1)
      return { start: `${lastEnd.slice(0, 8)}01`, end: lastEnd, interval: "day" }
    }
  }
}

export const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export function daysInclusive(a: string, b: string) {
  const t = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10))
  return Math.round(Math.abs(t(b) - t(a)) / 86_400_000) + 1
}
/** docs/visual/08 §1.4: hour for a single day, day up to 92 days, week beyond. */
export function resolvePeriod(p: Period, now = new Date()) {
  const r = p.kind === "preset" ? resolvePreset(p.preset, now) : { start: p.start, end: p.end, interval: "day" as const }
  const n = daysInclusive(r.start, r.end)
  return { ...r, interval: n === 1 ? ("hour" as const) : n <= 92 ? ("day" as const) : ("week" as const) }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
export const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number)
  return `${d} ${MONTHS[m - 1]}`
}
export const rangeLabel = (start: string, end: string, year = false) => {
  const y = year ? ` ${end.slice(0, 4)}` : ""
  return start === end ? `${shortDate(start)}${y}` : `${shortDate(start)} – ${shortDate(end)}${y}`
}
