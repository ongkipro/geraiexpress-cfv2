import { createContext, useContext } from "react"

// Workspace session as served by `GET /api/app/workspace` (already projected per role by the server).
export interface Workspace {
  user: { id: string; name: string; email: string }
  tenant: { id: string; name: string; slug: string; miniSiteHost: string }
  role: "gerai_admin" | "cashier"
  menus: string[]
  badges: { kiriman: number; notifications: number }
  hints: { mengantarWebhook: string | null }
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

export function applyTextSize(size: TextSize) {
  if (size === "normal") delete document.documentElement.dataset.text
  else document.documentElement.dataset.text = size
  try {
    localStorage.setItem("gx-text-size", size)
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

export function storedTextSize(): TextSize {
  try {
    const v = localStorage.getItem("gx-text-size")
    return v === "besar" || v === "sangat-besar" ? v : "normal"
  } catch {
    return "normal"
  }
}
