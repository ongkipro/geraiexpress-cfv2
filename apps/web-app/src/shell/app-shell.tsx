import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { ArrowUpRightIcon, BellIcon, ContactIcon, HomeIcon, MoreHorizontalIcon, PackageIcon, PlusIcon, QrCodeIcon, SearchIcon, SettingsIcon, TriangleAlertIcon, TruckIcon, WalletIcon } from "lucide-react"
import { AdminShell, ShellBrand, SidebarStatusCard, type Crumb, type ShellCommand, type ShellNavGroup, type ShellNavItem } from "../components/admin/shell"
import { FORMAT_LABEL, type Format } from "../print/print"
import { CalloutAlert } from "../components/admin/page"
import { Button } from "../components/ui/button"
import { useSidebar } from "../components/ui/sidebar"
import { api } from "../lib/api"
import { COUNTER_STATUS_EVENT, useWorkspace } from "./workspace"
import { LinkButton } from "../components/admin/link-button"

// Gerai workspace shell (visual 07 §1, DEC-213/225, DEC-236, DEC-239, DEC-241): the shared AdminShell — menus in three
// groups (Keuangan owner only), `+ Kiriman Baru` + `Scan QR` as the sidebar quick-action row, counter status at the
// sidebar foot; topbar = breadcrumb, ⌘K, mini-site link, QR, notifications and the account chip. Phones keep the
// 5-item counter bottom bar, whose `Lainnya` opens the same sidebar Sheet.
//
// DEC-241 taxonomy: a top-level menu is a job (create, check, operate, administer); its sub-tree lists the screens of
// that job, including the specialist tabs of a page (`/kiriman?tab=pickup`). Pengaturan stays one entry — its ten
// pages have their own left rail. `Shift Loket` is deferred to post-launch (TASK-704): no menu, command or status row.
type NavChild = { to: string; label: string }
type NavDef = { key: string; menu: string; to: string; label: string; icon: typeof HomeIcon; children?: NavChild[] }
const NAV: NavDef[] = [
  { key: "dashboard", menu: "dashboard", to: "/", label: "Dashboard", icon: HomeIcon },
  {
    key: "buat-pengiriman",
    menu: "buat-pengiriman",
    to: "/kasir",
    label: "Buat Pengiriman",
    icon: PackageIcon,
    children: [
      { to: "/kasir", label: "Kiriman Satuan" },
      { to: "/kasir/multi", label: "Paket Massal" },
    ],
  },
  {
    // Same audience as Buat Pengiriman (owner and Kasir), so it follows that menu key instead of a new server key.
    key: "cek",
    menu: "buat-pengiriman",
    to: "/kasir/cek-cepat",
    label: "Cek Ongkir & Resi",
    icon: SearchIcon,
    children: [
      { to: "/kasir/cek-cepat", label: "Cek Ongkir" },
      { to: "/kasir/cek-resi", label: "Cek Resi" },
    ],
  },
  {
    key: "kiriman",
    menu: "kiriman",
    to: "/kiriman",
    label: "Kiriman",
    icon: TruckIcon,
    children: [
      { to: "/kiriman", label: "Daftar Kiriman" },
      { to: "/kiriman?tab=pickup", label: "Pickup & Surat Jalan" },
      { to: "/kiriman/cetak-massal", label: "Cetak Resi Massal" },
      { to: "/kiriman/massal", label: "Riwayat Massal" },
      { to: "/kiriman?tab=retur", label: "Meja Retur" },
      { to: "/kiriman?tab=kendala", label: "Kendala & Klaim" },
    ],
  },
  { key: "kontak", menu: "kontak", to: "/kontak/pengirim", label: "Kontak", icon: ContactIcon, children: [{ to: "/kontak/pengirim", label: "Data Pengirim" }, { to: "/kontak/penerima", label: "Data Penerima" }] },
  {
    key: "keuangan",
    menu: "keuangan",
    to: "/keuangan",
    label: "Keuangan",
    icon: WalletIcon,
    children: [
      { to: "/keuangan", label: "Ringkasan & Saldo" },
      { to: "/keuangan?tab=mutasi", label: "Mutasi Mengantar" },
      { to: "/keuangan?tab=laba", label: "Laba per Kiriman" },
      { to: "/keuangan?tab=cadangan", label: "Cadangan Retur" },
      { to: "/keuangan?tab=selisih", label: "Selisih Sync" },
    ],
  },
  { key: "pengaturan", menu: "pengaturan", to: "/pengaturan", label: "Pengaturan", icon: SettingsIcon },
]

/** Kiriman tabs that are views of the list (Daftar Kiriman); the other tabs are their own sub-tree entries. */
const LIST_TABS = new Set(["semua", "belum-dibayar", "draf-qr", "menunggu-saldo"])

/**
 * Query-aware sub-tree matching (TokoPhi `activeChild`): a child with `?tab=x` is active only on that tab; a plain
 * child is active on its path when no sibling claims the current tab. Detail pages fall back to their section.
 */
export function activeChild(children: NavChild[], path: string, tab: string | undefined): string | null {
  const exact = children.find((c) => c.to.includes("?") && c.to === `${path}?tab=${tab}`)
  if (exact) return exact.to
  const plain = children.find((c) => !c.to.includes("?") && c.to === path)
  if (plain && (path !== "/kiriman" || !tab || LIST_TABS.has(tab))) return plain.to
  // The manifest screen of a pickup batch belongs to Pickup & Surat Jalan.
  if (path.startsWith("/kiriman/pickup/")) return children.find((c) => c.to === "/kiriman?tab=pickup")?.to ?? null
  const prefix = children.filter((c) => !c.to.includes("?") && c.to !== "/kasir" && path.startsWith(`${c.to}/`)).sort((a, b) => b.to.length - a.to.length)[0]
  return prefix?.to ?? null
}

/** Which top-level menu owns the path (`/kasir/cek-*` belongs to Cek Ongkir & Resi, not Buat Pengiriman). */
export function sectionOf(path: string): string | null {
  if (path === "/") return "dashboard"
  if (/^\/kasir\/cek-(cepat|resi)/.test(path)) return "cek"
  if (path.startsWith("/kasir")) return "buat-pengiriman"
  if (path.startsWith("/kiriman")) return "kiriman"
  if (path.startsWith("/kontak")) return "kontak"
  if (path.startsWith("/keuangan")) return "keuangan"
  if (path.startsWith("/pengaturan")) return "pengaturan"
  return null
}

const SECTIONS: Array<[RegExp, Crumb[]]> = [
  [/^\/$/, [{ label: "Dashboard" }]],
  [/^\/kasir\/multi/, [{ label: "Buat Pengiriman", to: "/kasir" }, { label: "Paket Massal" }]],
  [/^\/kasir\/cek-cepat/, [{ label: "Cek Ongkir & Resi", to: "/kasir/cek-cepat" }, { label: "Cek Ongkir" }]],
  [/^\/kasir\/cek-resi/, [{ label: "Cek Ongkir & Resi", to: "/kasir/cek-cepat" }, { label: "Cek Resi" }]],
  [/^\/kasir\/shift/, [{ label: "Shift Loket" }]],
  [/^\/kasir$/, [{ label: "Buat Pengiriman", to: "/kasir" }, { label: "Kiriman Satuan" }]],
  [/^\/kasir/, [{ label: "Buat Pengiriman" }]],
  [/^\/kiriman\/massal/, [{ label: "Kiriman", to: "/kiriman" }, { label: "Riwayat Massal" }]],
  [/^\/kiriman\/cetak-massal/, [{ label: "Kiriman", to: "/kiriman" }, { label: "Cetak Resi Massal" }]],
  [/^\/kiriman\/pickup/, [{ label: "Kiriman", to: "/kiriman" }, { label: "Pickup & Surat Jalan", to: "/kiriman?tab=pickup" }, { label: "Surat Jalan" }]],
  [/^\/kiriman\/[a-z0-9]{7}$/, [{ label: "Kiriman", to: "/kiriman" }, { label: "Detail Kiriman" }]],
  [/^\/kiriman/, [{ label: "Kiriman" }]],
  [/^\/kontak\/pengirim/, [{ label: "Kontak", to: "/kontak/pengirim" }, { label: "Data Pengirim" }]],
  [/^\/kontak\/penerima/, [{ label: "Kontak", to: "/kontak/pengirim" }, { label: "Data Penerima" }]],
  [/^\/keuangan/, [{ label: "Keuangan" }]],
  [/^\/pengaturan\/.+/, [{ label: "Pengaturan", to: "/pengaturan" }, { label: "Detail Pengaturan" }]],
  [/^\/pengaturan/, [{ label: "Pengaturan" }]],
  [/^\/notifikasi/, [{ label: "Notifikasi" }]],
  [/^\/akun/, [{ label: "Akun Saya" }]],
  [/^\/bantuan/, [{ label: "Bantuan & Panduan" }]],
]

const SETTINGS_TITLE: Record<string, string> = {
  profil: "Profil Gerai",
  "mini-site": "Mini-Site",
  "data-usaha": "Data Usaha",
  ekspedisi: "Ekspedisi Aktif",
  printer: "Printer & Struk",
  "label-privasi": "Label & Privasi",
  packing: "Packing & Biaya",
  anggota: "Anggota",
  mengantar: "Mengantar",
  "api-mcp": "API & MCP",
}

/** Breadcrumb; on tabbed sections (Kiriman, Keuangan) the active sub-tree entry is the second crumb. */
function crumbsOf(path: string, tab: string | undefined): Crumb[] {
  const found = SECTIONS.find(([re]) => re.test(path))?.[1] ?? [{ label: "GeraiExpress" }]
  const sub = /^\/pengaturan\/([a-z-]+)/.exec(path)?.[1]
  if (sub && SETTINGS_TITLE[sub]) return [found[0]!, { label: SETTINGS_TITLE[sub]! }]
  const tabbed = NAV.find((n) => (path === "/kiriman" || path === "/keuangan") && n.to === path)
  if (tabbed?.children) {
    const c = tabbed.children.find((x) => x.to === activeChild(tabbed.children!, path, tab))
    if (c) return [{ label: tabbed.label, to: tabbed.to }, { label: c.label }]
  }
  return found
}

/** `+ Kiriman Baru` is primary only on Dashboard, /kasir and /kiriman (visual 07 §1.1). */
const primaryCta = (path: string) => path === "/" || path === "/kasir" || path === "/kiriman"

async function logout() {
  await api("/auth/logout", { body: {} }).catch(() => undefined)
  window.location.assign("/masuk")
}

/** Sidebar groups (DEC-239/241): Utama · Operasional · Administrasi; visibility follows the server's `w.menus`. */
const GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: "Utama", keys: ["dashboard", "buat-pengiriman", "cek"] },
  { label: "Operasional", keys: ["kiriman", "kontak"] },
  { label: "Administrasi", keys: ["keuangan", "pengaturan"] },
]

/** ⌘K commands: every menu and sub-tree screen the role sees, plus the counter tasks operators type for. */
export function commandsFor(menus: string[]): ShellCommand[] {
  const out: ShellCommand[] = []
  for (const n of NAV) {
    if (!menus.includes(n.menu)) continue
    const group = GROUPS.find((g) => g.keys.includes(n.key))?.label ?? "Menu"
    if (n.children) for (const c of n.children) out.push({ label: c.label, description: n.label, group, to: c.to, icon: n.icon })
    else out.push({ label: n.label, group, to: n.to, icon: n.icon })
  }
  out.push(
    { label: "Lacak INV, AWB atau HP", description: "Cek Resi", group: "Tugas", to: "/kasir/cek-resi", keywords: "cari resi awb inv lacak", icon: SearchIcon },
    { label: "Notifikasi", group: "Tugas", to: "/notifikasi", icon: BellIcon },
  )
  return out
}

/** Sidebar foot: the counter's own state — label format and the Mengantar connection (DEC-241: no shift row). */
function CounterStatus({ owner }: { owner: boolean }) {
  const [format, setFormat] = useState<Format | null>(null)
  const [hook, setHook] = useState<{ sellerId: string | null; webhookState: string | null } | null>(null)
  useEffect(() => {
    const load = () => {
      api<{ format: Format }>("/print/settings").then((s) => setFormat(s.format)).catch(() => setFormat(null))
      if (owner) api<{ sellerId: string | null; webhookState: string | null }>("/settings/mengantar").then(setHook).catch(() => setHook(null))
    }
    load()
    // Saving the label format (or a settings page) refreshes this block.
    window.addEventListener(COUNTER_STATUS_EVENT, load)
    return () => window.removeEventListener(COUNTER_STATUS_EVENT, load)
  }, [owner])
  const mengantar = !hook ? { value: "—", tone: "muted" as const } : !hook.sellerId ? { value: "Belum terhubung", tone: "warn" as const } : hook.webhookState === "active" ? { value: "Terhubung", tone: "safe" as const } : { value: "Webhook belum aktif", tone: "warn" as const }
  return (
    <SidebarStatusCard
      title="Status loket"
      rows={[
        { label: "Label", value: format ? FORMAT_LABEL[format] : "—", tone: format ? "safe" : "muted" },
        ...(owner ? [{ label: "Mengantar", ...mengantar }] : []),
      ]}
    />
  )
}

export function AppShell() {
  const w = useWorkspace()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const tab = useRouterState({ select: (s) => (s.location.search as { tab?: unknown }).tab })
  const tabStr = typeof tab === "string" ? tab : undefined
  const navigate = useNavigate()
  // Commit flows own the bottom of the phone screen (their checkout bar); the menu stays in the header Sheet.
  const commitFlow = path === "/kasir" || /^\/kiriman\/[a-z0-9]{7}$/.test(path) || /^\/kasir\/(multi|shift)/.test(path) || /^\/kiriman\/(pickup|retur)\//.test(path)
  const section = sectionOf(path)
  const item = (n: NavDef): ShellNavItem => ({
    key: n.key,
    to: n.to,
    label: n.label,
    icon: n.icon,
    active: section === n.key,
    badge:
      n.key === "kiriman" && w.badges.kiriman > 0
        ? { content: w.badges.kiriman, label: `${w.badges.kiriman} kiriman perlu tindakan` }
        : n.key === "pengaturan" && w.hints.mengantarWebhook
          ? { content: <TriangleAlertIcon className="size-4 text-warn" aria-hidden />, label: "Webhook Mengantar belum aktif" }
          : null,
    children: n.children
      ? (() => {
          const on = section === n.key ? activeChild(n.children, path, tabStr) : null
          return n.children.map((c) => ({ ...c, active: c.to === on }))
        })()
      : undefined,
  })
  const groups: ShellNavGroup[] = GROUPS.map((g) => ({ label: g.label, items: NAV.filter((n) => g.keys.includes(n.key) && w.menus.includes(n.menu)).map(item) })).filter((g) => g.items.length)
  const commands = useMemo(() => commandsFor(w.menus), [w.menus])

  const toolbar = (
    <>
      <a href={`https://${w.tenant.miniSiteHost}`} target="_blank" rel="noreferrer" className="hidden h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-slate-100 hover:text-slate-900 xl:inline-flex">
        Lihat Mini-Site <ArrowUpRightIcon aria-hidden className="size-3.5" />
      </a>
      <span aria-hidden className="mx-1 hidden h-5 w-px bg-slate-200 xl:block" />
      <Button variant="ghost" size="icon" aria-label="Pindai QR" className="text-muted-foreground" onClick={() => navigate({ to: "/kasir" })}>
        <QrCodeIcon aria-hidden />
      </Button>
      <LinkButton variant="ghost" size="icon" className="relative text-muted-foreground" aria-label={w.badges.notifications ? `Notifikasi, ${w.badges.notifications} belum dibaca` : "Notifikasi"} to="/notifikasi">
        <BellIcon aria-hidden />
        {w.badges.notifications ? (
          <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-xs leading-none font-semibold text-white tabular-nums ring-2 ring-white" aria-hidden>
            {w.badges.notifications > 9 ? "9+" : w.badges.notifications}
          </span>
        ) : null}
      </LinkButton>
    </>
  )

  return (
    <AdminShell
      brand={
        <ShellBrand
          mark={w.tenant.name.slice(0, 1).toUpperCase()}
          title={w.tenant.name}
          subtitle={w.tenant.miniSiteHost}
        />
      }
      quickActions={
        !/^\/kiriman\/[a-z0-9]{7}$/.test(path) ? (
          <div className="flex items-center gap-1.5">
            <Button variant={primaryCta(path) ? "default" : "outline"} className="flex-1" onClick={() => navigate({ to: "/kasir" })}>
              <PlusIcon aria-hidden data-icon="inline-start" /> Kiriman Baru
            </Button>
            <Button variant="outline" size="icon" aria-label="Scan QR" onClick={() => navigate({ to: "/kasir" })}>
              <QrCodeIcon aria-hidden />
            </Button>
          </div>
        ) : null
      }
      sidebarStatus={<CounterStatus owner={w.role === "gerai_admin"} />}
      navLabel="Menu utama"
      groups={groups}
      commands={commands}
      user={{ name: w.user.name, email: w.user.email, role: w.role === "gerai_admin" ? "Pemilik" : "Kasir", onLogout: logout, profileTo: "/akun", helpTo: "/bantuan" }}
      crumbs={crumbsOf(path, tabStr)}
      toolbar={toolbar}
      bottomBar={commitFlow ? undefined : <BottomBar path={path} kiriman={w.badges.kiriman} />}
    >
      {w.hints.mengantarWebhook && path === "/" ? (
        <div className="mb-5">
          <CalloutAlert title="Webhook Mengantar belum aktif" action={<LinkButton variant="outline" size="sm" to="/pengaturan/mengantar">Atur sekarang</LinkButton>}>
            Status kiriman tetap diperbarui setiap jam.
          </CalloutAlert>
        </div>
      ) : null}
      <Outlet />
    </AdminShell>
  )
}

/** Phone counter bar (visual 07 §1.2): Beranda · Buat · + · Kiriman · Lainnya (opens the sidebar Sheet). */
function BottomBar({ path, kiriman }: { path: string; kiriman: number }) {
  const { setOpenMobile, openMobile } = useSidebar()
  return (
    <nav aria-label="Menu bawah" className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 border-t border-slate-200/80 bg-white/95 backdrop-blur md:hidden">
      <BottomLink to="/" label="Beranda" icon={HomeIcon} active={path === "/"} />
      <BottomLink to="/kasir" label="Buat" icon={PackageIcon} active={sectionOf(path) === "buat-pengiriman"} />
      <Link to="/kasir" aria-label="Kiriman Baru" className="flex items-center justify-center">
        <span className={`flex size-12 items-center justify-center rounded-full ${primaryCta(path) ? "bg-primary text-primary-foreground" : "border-2 border-primary bg-card text-primary"}`}>
          <PlusIcon aria-hidden className="size-6" />
        </span>
      </Link>
      <BottomLink to="/kiriman" label="Kiriman" icon={TruckIcon} active={path.startsWith("/kiriman")} badge={kiriman} />
      <button type="button" onClick={() => setOpenMobile(true)} aria-expanded={openMobile} className={`flex flex-col items-center justify-center gap-0.5 text-xs ${openMobile ? "font-medium text-primary" : "text-muted-foreground"}`}>
        <MoreHorizontalIcon aria-hidden className="size-5" />
        Lainnya
      </button>
    </nav>
  )
}

function BottomLink({ to, label, icon: Icon, active, badge }: { to: string; label: string; icon: typeof HomeIcon; active: boolean; badge?: number }) {
  return (
    <Link to={to} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-0.5 text-xs ${active ? "font-medium text-primary" : "text-muted-foreground"}`}>
      <Icon aria-hidden className="size-5" />
      {label}
      {badge ? <span className="absolute top-1.5 right-[24%] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-xs leading-none font-semibold text-white tabular-nums ring-2 ring-white">{badge}</span> : null}
    </Link>
  )
}
