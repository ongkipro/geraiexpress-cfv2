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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
export const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number)
  return `${d} ${MONTHS[m - 1]}`
}
export const rangeLabel = (start: string, end: string) => (start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`)
