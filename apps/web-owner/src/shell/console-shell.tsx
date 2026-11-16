import { Outlet, useRouterState } from "@tanstack/react-router"
import { ActivityIcon, LayoutDashboardIcon, ShieldCheckIcon, StoreIcon, TagIcon } from "lucide-react"
import { AdminShell, ShellBrand, type Crumb, type ShellNavItem } from "@shared/components/admin/shell"
import { StatusBadge } from "@shared/components/admin/page"
import { api } from "../lib/api"

// Super Admin shell (visual 07 §2, DEC-209, DEC-236): the same AdminShell as Gerai Admin — 5 menus, breadcrumb title,
// environment + TOTP status in the header, NavUser (with text size) in the sidebar footer, a Sheet menu on phones.
// No "+ Kiriman Baru": Super Admin never creates or pays shipments.
const NAV = [
  { to: "/", label: "Ringkasan", icon: LayoutDashboardIcon },
  { to: "/gerai", label: "Gerai", icon: StoreIcon },
  { to: "/tarif", label: "Tarif & Kurir", icon: TagIcon },
  { to: "/pengawasan", label: "Pengawasan", icon: ActivityIcon },
  { to: "/sistem", label: "Sistem & Audit", icon: ShieldCheckIcon },
] as const

const DETAIL: Array<[RegExp, string]> = [
  [/^\/gerai\/pengajuan\//, "Detail Pengajuan"],
  [/^\/gerai\/[^/]+$/, "Detail Gerai"],
  [/^\/tarif\/[^/]+$/, "Tarif Gerai"],
]

function crumbsOf(path: string): Crumb[] {
  const section = NAV.find((n) => (n.to === "/" ? path === "/" : path === n.to || path.startsWith(`${n.to}/`)))
  if (!section) return [{ label: "Konsol" }]
  const detail = DETAIL.find(([re]) => re.test(path))?.[1]
  return detail ? [{ label: section.label, to: section.to }, { label: detail }] : [{ label: section.label }]
}

async function logout() {
  await api("/auth/logout", { body: {} }).catch(() => undefined)
  window.location.assign("/masuk")
}

export function ConsoleShell({ environment, userName, userEmail, pending }: { environment: "Produksi" | "Sandbox"; userName: string; userEmail: string; pending: number }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const nav: ShellNavItem[] = NAV.map((n) => ({
    key: n.to,
    to: n.to,
    label: n.label,
    icon: n.icon,
    active: n.to === "/" ? path === "/" : path === n.to || path.startsWith(`${n.to}/`),
    badge: n.to === "/gerai" && pending > 0 ? { content: pending, label: `${pending} pengajuan baru` } : null,
  }))
  return (
    <AdminShell
      brand={<ShellBrand mark="G" title="GeraiExpress" subtitle={`Konsol Platform · ${environment}`} />}
      navLabel="Menu Super Admin"
      nav={nav}
      user={{ name: userName, email: userEmail, role: "Super Admin", status: "TOTP aktif", onLogout: logout }}
      crumbs={crumbsOf(path)}
      toolbar={
        <>
          <StatusBadge tone={environment === "Produksi" ? "danger" : "muted"}>{environment}</StatusBadge>
          <StatusBadge tone="safe" className="hidden sm:inline-flex">
            TOTP aktif
          </StatusBadge>
        </>
      }
    >
      <Outlet />
    </AdminShell>
  )
}
