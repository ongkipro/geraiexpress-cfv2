import { cn } from "cn"

// Official courier logos beside courier names in the gerai workspace (DEC-247). The nine SVGs live once in
// `public/couriers/` (the brand host serves them at `/couriers/*`); the app host only serves `/assets/*` and root
// files (apps/worker/src/assets/spa.ts), so the workspace bundles the same files as hashed `/assets/*.svg` here.
const FILES = import.meta.glob<string>("../../../public/couriers/*.svg", { eager: true, query: "?url&no-inline", import: "default" })
const LOGO: Record<string, string> = Object.fromEntries(Object.entries(FILES).map(([path, url]) => [path.replace(/^.*\/(\w+)\.svg$/, "$1"), url]))

/** The nine active Mengantar couriers. No key is a prefix of another, so prefix matching is unambiguous. */
export const COURIER_KEYS = ["jne", "jt", "sicepat", "sap", "lion", "anteraja", "idexpress", "pos", "spx"] as const
export type CourierKey = (typeof COURIER_KEYS)[number]

/**
 * Logo file for a catalog courier/service code (`JT`, `JTEco`, `SapCargo`, `SAPCargo`, `iDexpressCargo`) or a catalog
 * display name (`J&T Express`, `SAP Cargo`, `Pos Indonesia`). Only picks a logo: an unknown value gets none.
 */
export function courierKey(value: string | null | undefined): CourierKey | null {
  const s = (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return COURIER_KEYS.find((k) => s.startsWith(k)) ?? null
}

/** Initials for the fallback tile: `Ninja Xpress` → `NX`, `ninja` → `NI`. */
export function courierInitials(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const s = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "").slice(0, 2)
  return s.toUpperCase() || "?"
}

const SIZE = {
  sm: { box: "h-8 w-16 px-1.5 py-1", w: 64, h: 32, text: "text-xs" },
  lg: { box: "h-12 w-24 px-2 py-1.5", w: 96, h: 48, text: "text-base" },
} as const

/**
 * Fixed-size logo tile (no layout shift). `decorative` when the courier name is already printed beside it (`alt=""`);
 * otherwise the tile is named `Logo <name>`. `code` is preferred over `name` to pick the file.
 */
export function CourierLogo({ code, name, decorative = false, size = "sm", className }: { code?: string | null; name: string; decorative?: boolean; size?: keyof typeof SIZE; className?: string }) {
  const key = courierKey(code) ?? courierKey(name)
  const src = key ? LOGO[key] : undefined
  const z = SIZE[size]
  const label = `Logo ${name}`
  return (
    <span
      data-courier-logo={key ?? "fallback"}
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white", z.box, className)}
      {...(src ? {} : decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
    >
      {src ? (
        <img src={src} alt={decorative ? "" : label} width={z.w} height={z.h} loading="lazy" decoding="async" draggable={false} className="size-full min-h-0 min-w-0 object-contain" />
      ) : (
        <span className={cn("font-semibold text-slate-600", z.text)}>{courierInitials(name)}</span>
      )}
    </span>
  )
}
