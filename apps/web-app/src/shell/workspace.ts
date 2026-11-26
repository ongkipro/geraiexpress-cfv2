import { createContext, useContext } from "react"

// Workspace session as served by `GET /api/app/workspace` (already projected per role by the server).
export interface Workspace {
  user: { id: string; name: string; email: string }
  tenant: { id: string; name: string; slug: string; miniSiteHost: string; logoUrl?: string | null }
  role: "gerai_admin" | "cashier"
  menus: string[]
  badges: { kiriman: number; notifications: number }
  hints: { mengantarWebhook: string | null; sandboxTools?: boolean }
  demo?: boolean
  tenants: Array<{ id: string; name: string; slug: string }>
}

export const WorkspaceContext = createContext<Workspace | null>(null)

export function useWorkspace(): Workspace {
  const w = useContext(WorkspaceContext)
  if (!w) throw new Error("useWorkspace outside the workspace shell")
  return w
}

export const isOwner = (w: Workspace) => w.role === "gerai_admin"

/** Text size steps (visual 01): scales the root rem only; browser zoom is never locked. */
export const TEXT_SIZES = [
  { id: "normal", label: "Normal (100%)" },
  { id: "besar", label: "Besar (112%)" },
  { id: "sangat-besar", label: "Sangat Besar (125%)" },
] as const
export type TextSize = (typeof TEXT_SIZES)[number]["id"]

/** The sidebar counter status (shift, label format) listens for this after a mutation that changes it. */
export const COUNTER_STATUS_EVENT = "gx:counter-status"
export const refreshCounterStatus = () => window.dispatchEvent(new Event(COUNTER_STATUS_EVENT))
export const TENANT_LOGO_EVENT = "gx:tenant-logo"
export const refreshTenantLogo = (url: string | null) => window.dispatchEvent(new CustomEvent(TENANT_LOGO_EVENT, { detail: url }))
export const TEXT_SIZE_EVENT = "gx:text-size"
export const SHELL_WIDE_COOKIE = "gx_wide"
export const SHELL_WIDE_EVENT = "gx:shell-wide"
const WIDE_COOKIE_VAL = /(?:^|;\s*)gx_wide=([01])(?:;|$)/

export function applyTextSize(size: TextSize) {
  if (size === "normal") delete document.documentElement.dataset.text
  else document.documentElement.dataset.text = size
  try {
    localStorage.setItem("gx-text-size", size)
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TEXT_SIZE_EVENT, { detail: size }))
}

export function storedTextSize(): TextSize {
  try {
    const v = localStorage.getItem("gx-text-size")
    return v === "besar" || v === "sangat-besar" ? v : "normal"
  } catch {
    return "normal"
  }
}

export function storedShellWide(): boolean {
  if (typeof document === "undefined") return false
  try {
    const m = WIDE_COOKIE_VAL.exec(document.cookie)
    if (m) return m[1] === "1"
  } catch {
    // cookie unreadable: fall back to SSR attribute
  }
  return document.documentElement.dataset.shellWide === "1"
}

export function syncShellWideDom(wide: boolean) {
  if (typeof document === "undefined") return
  if (wide) document.documentElement.dataset.shellWide = "1"
  else delete document.documentElement.dataset.shellWide
}

export function applyShellWide(wide: boolean) {
  syncShellWideDom(wide)
  if (typeof document === "undefined") return
  try {
    // Host-only cookie (never Domain=...): keeps app. and owner. isolated and never leaks to *.geraimitra.com.
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : ""
    document.cookie = `${SHELL_WIDE_COOKIE}=${wide ? "1" : "0"}; path=/; max-age=31536000; samesite=lax${secure}`
  } catch {
    // cookie unavailable: the choice lasts for this page only
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SHELL_WIDE_EVENT, { detail: wide }))
}
