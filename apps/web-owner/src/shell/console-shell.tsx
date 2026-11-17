import { Outlet, useRouterState } from "@tanstack/react-router"
import { ActivityIcon, LayoutDashboardIcon, ShieldCheckIcon, StoreIcon, TagIcon } from "lucide-react"
import { AdminShell, ShellBrand, SidebarStatusCard, type Crumb, type ShellCommand, type ShellNavGroup, type ShellNavItem } from "@shared/components/admin/shell"
import { StatusBadge } from "@shared/components/admin/page"
import { api } from "../lib/api"

// Super Admin shell (visual 07 §2, DEC-209, DEC-236, DEC-239, DEC-241): the same AdminShell as Gerai Admin — 5 menus in
// three groups, each with a sub-tree mirroring its page tabs (`?tab=`), breadcrumb + ⌘K + environment/TOTP pills +
// account chip in the topbar, environment card at the sidebar foot. No "+ Kiriman Baru": Super Admin never creates or
// pays shipments.
type NavChild = { to: string; label: string }
const NAV: Array<{ to: string; label: string; icon: typeof StoreIcon; children?: NavChild[] }> = [
  { to: "/", label: "Ringkasan", icon: LayoutDashboardIcon },
  {
    to: "/gerai",
    label: "Gerai",
    icon: StoreIcon,
    children: [
      { to: "/gerai", label: "Pengajuan Baru" },
      { to: "/gerai?tab=direktori", label: "Direktori Gerai" },
      { to: "/gerai?tab=domain", label: "Domain Mitra" },
    ],
  },
  {
    to: "/tarif",
    label: "Tarif & Kurir",
    icon: TagIcon,
    children: [
      { to: "/tarif", label: "Diskon & Cashback" },
      { to: "/tarif?tab=permintaan", label: "Permintaan Mengantar" },
      { to: "/tarif?tab=kebijakan", label: "Kebijakan Diskon" },
    ],
  },
  {
    to: "/pengawasan",
    label: "Pengawasan",
    icon: ActivityIcon,
    children: [
      { to: "/pengawasan", label: "Pantauan Kiriman" },
      { to: "/pengawasan?tab=risiko", label: "Radar Risiko COD" },
    ],
  },
  {
    to: "/sistem",
    label: "Sistem & Audit",
    icon: ShieldCheckIcon,
    children: [
      { to: "/sistem", label: "Kesehatan Integrasi" },
      { to: "/sistem?tab=audit", label: "Log Audit" },
      { to: "/sistem?tab=admin", label: "Akses Admin" },
      { to: "/sistem?tab=profil", label: "Profil Perusahaan" },
    ],
  },
]

const DETAIL: Array<[RegExp, string]> = [
  [/^\/gerai\/pengajuan\//, "Detail Pengajuan"],
  [/^\/gerai\/[^/]+$/, "Detail Gerai"],
  [/^\/tarif\/[^/]+$/, "Tarif Gerai"],
]

const sectionOf = (path: string) => NAV.find((n) => (n.to === "/" ? path === "/" : path === n.to || path.startsWith(`${n.to}/`)))

/** The sub-tree entry for this URL: `?tab=x` children on their tab, the plain child on the section root otherwise. */
function activeChild(children: NavChild[], path: string, tab: string | undefined): NavChild | undefined {
  return children.find((c) => c.to === `${path}?tab=${tab}`) ?? children.find((c) => c.to === path && !children.some((x) => x.to === `${path}?tab=${tab}`))
}

function crumbsOf(path: string, tab: string | undefined): Crumb[] {
  const section = sectionOf(path)
  if (!section) return [{ label: "Konsol" }]
  const detail = DETAIL.find(([re]) => re.test(path))?.[1]
  if (detail) return [{ label: section.label, to: section.to }, { label: detail }]
  const child = section.children ? activeChild(section.children, path, tab) : undefined
  return child ? [{ label: section.label, to: section.to }, { label: child.label }] : [{ label: section.label }]
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

const KEYWORDS: Record<string, string> = {
  "/gerai": "approve daftar setujui",
  "/gerai?tab=direktori": "cari gerai tenant",
  "/gerai?tab=domain": "custom domain ssl",
  "/pengawasan?tab=risiko": "rts retur risiko",
  "/sistem?tab=audit": "audit log riwayat",
}
const COMMANDS: ShellCommand[] = NAV.flatMap((n) => {
  const group = GROUPS.find((g) => g.to.includes(n.to))!.label
  return n.children ? n.children.map((c) => ({ label: c.label, description: n.label, group, to: c.to, icon: n.icon, keywords: KEYWORDS[c.to] })) : [{ label: n.label, group, to: n.to, icon: n.icon }]
})

export function ConsoleShell({ environment, userName, userEmail, pending }: { environment: "Produksi" | "Sandbox"; userName: string; userEmail: string; pending: number }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const rawTab = useRouterState({ select: (s) => (s.location.search as { tab?: unknown }).tab })
  const tab = typeof rawTab === "string" ? rawTab : undefined
  const section = sectionOf(path)
  const item = (n: (typeof NAV)[number]): ShellNavItem => {
    const on = section === n && n.children ? activeChild(n.children, path, tab) : undefined
    return {
      key: n.to,
      to: n.to,
      label: n.label,
      icon: n.icon,
      active: section === n,
      badge: n.to === "/gerai" && pending > 0 ? { content: pending, label: `${pending} pengajuan baru` } : null,
      children: n.children?.map((c) => ({ ...c, active: c === on })),
    }
  }
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
      crumbs={crumbsOf(path, tab)}
      toolbar={
        <>
          {/* With Ukuran Teks enlarged the badge waits for xl so it never runs into the search at 1024 px (Sol R3);
              the environment stays in the brand subtitle and the sidebar status block. */}
          <StatusBadge tone={environment === "Produksi" ? "danger" : "muted"} className="in-data-text:hidden xl:in-data-text:inline-flex">{environment}</StatusBadge>
          {/* TOTP state also sits in the sidebar status block and the account menu; the topbar repeats it only where
              the right track has room (DEC-243 grid header, Sol R1 #1). */}
          <StatusBadge tone="safe" className="hidden 2xl:inline-flex">
            TOTP aktif
          </StatusBadge>
        </>
      }
    >
      <Outlet />
    </AdminShell>
  )
}
