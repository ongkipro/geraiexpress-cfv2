import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { ActivityIcon, CircleCheckIcon, ListTodoIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"

// Operational status icon beside the notification bell (DEC-244, AdsBookCMS `OperationalStatusIcon`). A link to the
// status page, not a popover: one destination that works by keyboard and on a phone. It never polls: one fetch per
// page load, the answer kept in sessionStorage for five minutes, a focused window asks again only after expiry, and
// `Periksa Ulang` hands its fresh answer over through `rememberOpsStatus`. Rendered only for roles allowed to see it
// (Gerai: owner; console: every Super Admin), so other roles never send the request.

export type OpsTone = "healthy" | "setup" | "problem" | "unknown"
export interface OpsIcon {
  tone: OpsTone
  label: string
  count: number
}

const CACHE_MS = 5 * 60_000
const EVENT = "gx:ops-status"

function read(key: string): { at: number; icon: OpsIcon } | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    const v = raw ? (JSON.parse(raw) as { at: number; icon: OpsIcon }) : null
    return v && typeof v.at === "number" && v.icon?.tone ? v : null
  } catch {
    return null
  }
}

/** Store a fresh answer (from the status page's `Periksa Ulang`) and tell any mounted icon. */
export function rememberOpsStatus(cacheKey: string, icon: OpsIcon) {
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), icon }))
  } catch {
    // storage unavailable: the next page load asks again
  }
  window.dispatchEvent(new CustomEvent<{ key: string; icon: OpsIcon }>(EVENT, { detail: { key: cacheKey, icon } }))
}

const TONE: Record<OpsTone, { icon: typeof ActivityIcon; className: string; badge: string }> = {
  problem: { icon: TriangleAlertIcon, className: "text-rose-600 hover:text-rose-700", badge: "bg-danger" },
  setup: { icon: ListTodoIcon, className: "text-amber-600 hover:text-amber-700", badge: "bg-warn" },
  healthy: { icon: CircleCheckIcon, className: "text-emerald-600 hover:text-emerald-700", badge: "" },
  unknown: { icon: ActivityIcon, className: "text-slate-500 hover:text-slate-900", badge: "" },
}

export function OperationalStatusIcon({ to, cacheKey, load, active }: { to: string; cacheKey: string; load: () => Promise<OpsIcon | null>; active?: boolean }) {
  const [icon, setIcon] = useState<OpsIcon | null>(null)
  useEffect(() => {
    let inFlight = false
    const refresh = async () => {
      const cached = read(cacheKey)
      if (cached && Date.now() - cached.at < CACHE_MS) return setIcon(cached.icon)
      if (inFlight) return
      inFlight = true
      try {
        const fresh = await load()
        if (fresh?.tone) {
          rememberOpsStatus(cacheKey, fresh)
          setIcon(fresh)
        }
      } catch {
        // the icon stays neutral; the status page is one click away
      } finally {
        inFlight = false
      }
    }
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; icon: OpsIcon }>).detail
      if (d?.key === cacheKey && d.icon?.tone) setIcon(d.icon)
    }
    void refresh()
    window.addEventListener("focus", refresh)
    window.addEventListener(EVENT, onUpdate)
    return () => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener(EVENT, onUpdate)
    }
    // `load` is a stable module-level function at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])
  const tone = TONE[icon?.tone ?? "unknown"] ?? TONE.unknown
  const Icon = tone.icon
  const label = icon?.label ?? "Status operasional"
  const badge = icon && icon.count > 0 && (icon.tone === "problem" || icon.tone === "setup") ? (icon.count > 9 ? "9+" : String(icon.count)) : null
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      data-status-tone={icon?.tone ?? "loading"}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-lg transition-colors hover:bg-slate-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:size-9",
        tone.className,
        active && "bg-slate-100",
      )}
    >
      <Icon aria-hidden className="size-[18px]" />
      {badge ? (
        <span aria-hidden className={cn("absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-xs leading-none font-semibold text-white tabular-nums ring-2 ring-white", tone.badge)}>
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
