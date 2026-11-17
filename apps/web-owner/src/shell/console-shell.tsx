import { Outlet, useRouterState } from "@tanstack/react-router"
import { ActivityIcon, LayoutDashboardIcon, ShieldCheckIcon, StoreIcon, TagIcon } from "lucide-react"
import { AdminShell, ShellBrand, SidebarStatusCard, type Crumb, type ShellCommand, type ShellNavGroup, type ShellNavItem } from "@shared/components/admin/shell"
import { StatusBadge } from "@shared/components/admin/page"
import { api } from "../lib/api"

// Super Admin shell (visual 07 §2, DEC-209, DEC-236, DEC-239): the same AdminShell as Gerai Admin — 5 menus in three
// groups, breadcrumb + ⌘K + environment/TOTP pills + account chip in the topbar, environment card at the sidebar foot.
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

/** Sidebar groups (DEC-239): Platform · Tata Kelola · Sistem. */
const GROUPS: Array<{ label: string; to: string[] }> = [
  { label: "Platform", to: ["/", "/gerai"] },
  { label: "Tata Kelola", to: ["/tarif", "/pengawasan"] },
  { label: "Sistem", to: ["/sistem"] },
]

const COMMANDS: ShellCommand[] = [
  ...NAV.map((n) => ({ label: n.label, group: GROUPS.find((g) => g.to.includes(n.to))!.label, to: n.to, icon: n.icon })),
  { label: "Pengajuan gerai baru", description: "Gerai", group: "Tugas", to: "/gerai", keywords: "approve daftar setujui", icon: StoreIcon },
  { label: "Direktori gerai", description: "Gerai", group: "Tugas", to: "/gerai?tab=direktori", keywords: "cari gerai tenant", icon: StoreIcon },
  { label: "Domain Mitra", description: "Gerai", group: "Tugas", to: "/gerai?tab=domain", keywords: "custom domain ssl", icon: StoreIcon },
  { label: "Radar Risiko COD", description: "Pengawasan", group: "Tugas", to: "/pengawasan?tab=risiko", keywords: "rts retur risiko", icon: ActivityIcon },
  { label: "Log Audit", description: "Sistem & Audit", group: "Tugas", to: "/sistem?tab=audit", keywords: "audit log riwayat", icon: ShieldCheckIcon },
]

export function ConsoleShell({ environment, userName, userEmail, pending }: { environment: "Produksi" | "Sandbox"; userName: string; userEmail: string; pending: number }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const item = (n: (typeof NAV)[number]): ShellNavItem => ({
    key: n.to,
    to: n.to,
    label: n.label,
    icon: n.icon,
    active: n.to === "/" ? path === "/" : path === n.to || path.startsWith(`${n.to}/`),
    badge: n.to === "/gerai" && pending > 0 ? { content: pending, label: `${pending} pengajuan baru` } : null,
  })
  const groups: ShellNavGroup[] = GROUPS.map((g) => ({ label: g.label, items: NAV.filter((n) => g.to.includes(n.to)).map(item) }))
  return (
    <AdminShell
      brand={<ShellBrand mark="G" title="GeraiExpress" subtitle={`Konsol Platform · ${environment}`} />}
      navLabel="Menu Super Admin"
      groups={groups}
      commands={COMMANDS}
      sidebarStatus={
        <SidebarStatusCard
          title="Lingkungan"
          rows={[
            { label: "Mengantar", value: environment, tone: environment === "Produksi" ? "warn" : "muted" },
            { label: "Sesi", value: "TOTP aktif", tone: "safe" },
          ]}
        />
      }
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
