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

// Gerai workspace shell (visual 07 §1, DEC-213/225, DEC-236, DEC-239): the shared AdminShell — 6 menus in three groups
// (Keuangan owner only), `+ Kiriman Baru` + `Scan QR` as the sidebar quick-action row, counter status at the sidebar
// foot; topbar = breadcrumb, ⌘K, mini-site link, QR, notifications and the account chip. Phones keep the 5-item
// counter bottom bar, whose `Lainnya` opens the same sidebar Sheet.
const NAV = [
  { key: "dashboard", to: "/", label: "Dashboard", icon: HomeIcon },
  {
    key: "buat-pengiriman",
    to: "/kasir",
    label: "Buat Pengiriman",
    icon: PackageIcon,
    // DEC-237: one job per screen; the order-creation tools are a sidebar tree, not a tab bar on /kasir.
    children: [
      { to: "/kasir", label: "Kiriman Satuan" },
      { to: "/kasir/multi", label: "Paket Massal (CSV)" },
      { to: "/kasir/cek-cepat", label: "Cek Ongkir Cepat" },
      { to: "/kasir/cek-resi", label: "Cek Resi" },
      { to: "/kasir/shift", label: "Shift Loket" },
    ],
  },
  { key: "kiriman", to: "/kiriman", label: "Kiriman", icon: TruckIcon },
  { key: "kontak", to: "/kontak/pengirim", label: "Kontak", icon: ContactIcon, children: [{ to: "/kontak/pengirim", label: "Pengirim" }, { to: "/kontak/penerima", label: "Penerima" }] },
  { key: "keuangan", to: "/keuangan", label: "Keuangan", icon: WalletIcon },
  { key: "pengaturan", to: "/pengaturan", label: "Pengaturan", icon: SettingsIcon },
] as const

const SECTIONS: Array<[RegExp, Crumb[]]> = [
  [/^\/$/, [{ label: "Dashboard" }]],
  [/^\/kasir\/multi/, [{ label: "Buat Pengiriman", to: "/kasir" }, { label: "Paket Massal (CSV)" }]],
  [/^\/kasir\/cek-cepat/, [{ label: "Buat Pengiriman", to: "/kasir" }, { label: "Cek Ongkir Cepat" }]],
  [/^\/kasir\/cek-resi/, [{ label: "Buat Pengiriman", to: "/kasir" }, { label: "Cek Resi" }]],
  [/^\/kasir\/shift/, [{ label: "Buat Pengiriman", to: "/kasir" }, { label: "Shift Loket" }]],
  [/^\/kasir$/, [{ label: "Buat Pengiriman", to: "/kasir" }, { label: "Kiriman Satuan" }]],
  [/^\/kasir/, [{ label: "Buat Pengiriman" }]],
  [/^\/kiriman\/massal/, [{ label: "Kiriman", to: "/kiriman" }, { label: "Riwayat Massal" }]],
  [/^\/kiriman\/cetak-massal/, [{ label: "Kiriman", to: "/kiriman" }, { label: "Cetak Resi Massal" }]],
  [/^\/kiriman\/pickup/, [{ label: "Kiriman", to: "/kiriman" }, { label: "Pickup & Manifest" }]],
  [/^\/kiriman\/[a-z0-9]{7}$/, [{ label: "Kiriman", to: "/kiriman" }, { label: "Detail Kiriman" }]],
  [/^\/kiriman/, [{ label: "Kiriman" }]],
  [/^\/kontak\/pengirim/, [{ label: "Kontak", to: "/kontak/pengirim" }, { label: "Pengirim" }]],
  [/^\/kontak\/penerima/, [{ label: "Kontak", to: "/kontak/pengirim" }, { label: "Penerima" }]],
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

function crumbsOf(path: string): Crumb[] {
  const found = SECTIONS.find(([re]) => re.test(path))?.[1] ?? [{ label: "GeraiExpress" }]
  const sub = /^\/pengaturan\/([a-z-]+)/.exec(path)?.[1]
  return sub && SETTINGS_TITLE[sub] ? [found[0]!, { label: SETTINGS_TITLE[sub]! }] : found
}

/** `+ Kiriman Baru` is primary only on Dashboard, /kasir and /kiriman (visual 07 §1.1). */
const primaryCta = (path: string) => path === "/" || path === "/kasir" || path === "/kiriman"

function isActive(path: string, to: string) {
  if (to === "/") return path === "/"
  const base = to.startsWith("/kontak") ? "/kontak" : to
  return path === base || path.startsWith(`${base}/`)
}

async function logout() {
  await api("/auth/logout", { body: {} }).catch(() => undefined)
  window.location.assign("/masuk")
}

/** Sidebar groups (DEC-239): Utama · Operasional · Administrasi; Keuangan only for the owner (`w.menus`). */
const GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: "Utama", keys: ["dashboard", "buat-pengiriman"] },
  { label: "Operasional", keys: ["kiriman", "kontak"] },
  { label: "Administrasi", keys: ["keuangan", "pengaturan"] },
]

/** ⌘K commands: every menu the role sees, plus the counter tasks operators type for. */
function commandsFor(menus: string[]): ShellCommand[] {
  const out: ShellCommand[] = []
  for (const n of NAV) {
    if (!menus.includes(n.key)) continue
    const group = GROUPS.find((g) => g.keys.includes(n.key))?.label ?? "Menu"
    if ("children" in n) for (const c of n.children) out.push({ label: c.label, description: n.label, group, to: c.to, icon: n.icon })
    else out.push({ label: n.label, group, to: n.to, icon: n.icon })
  }
  out.push(
    { label: "Lacak INV, AWB atau HP", description: "Cek Resi", group: "Tugas", to: "/kasir/cek-resi", keywords: "cari resi awb inv lacak", icon: SearchIcon },
    { label: "Pickup & Manifest", description: "Kiriman", group: "Tugas", to: "/kiriman?tab=pickup", keywords: "jemput kurir surat jalan", icon: TruckIcon },
    { label: "Meja Retur", description: "Kiriman", group: "Tugas", to: "/kiriman?tab=retur", keywords: "retur rts kembali", icon: TruckIcon },
    { label: "Notifikasi", group: "Tugas", to: "/notifikasi", icon: BellIcon },
  )
  return out
}

/** Sidebar foot: the counter's own state (open shift, label printer format). */
function CounterStatus() {
  const [shift, setShift] = useState<"open" | "closed" | null>(null)
  const [format, setFormat] = useState<Format | null>(null)
  useEffect(() => {
    const load = () => {
      api<{ shift: { state: string } | null }>("/shift").then((v) => setShift(v.shift ? "open" : "closed")).catch(() => setShift(null))
      api<{ format: Format }>("/print/settings").then((s) => setFormat(s.format)).catch(() => setFormat(null))
    }
    load()
    // Opening/closing a shift or saving the label format refreshes this block (no stale "Belum dibuka").
    window.addEventListener(COUNTER_STATUS_EVENT, load)
    return () => window.removeEventListener(COUNTER_STATUS_EVENT, load)
  }, [])
  return (
    <SidebarStatusCard
      title="Status loket"
      rows={[
        { label: "Shift", value: shift === "open" ? "Buka" : shift === "closed" ? "Belum dibuka" : "—", tone: shift === "open" ? "safe" : shift === "closed" ? "warn" : "muted" },
        { label: "Label", value: format ? FORMAT_LABEL[format] : "—", tone: format ? "safe" : "muted" },
      ]}
    />
  )
}

export function AppShell() {
  const w = useWorkspace()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  // Commit flows own the bottom of the phone screen (their checkout bar); the menu stays in the header Sheet.
  const commitFlow = path === "/kasir" || /^\/kiriman\/[a-z0-9]{7}$/.test(path) || /^\/kasir\/(multi|shift)/.test(path) || /^\/kiriman\/(pickup|retur)\//.test(path)
  const item = (n: (typeof NAV)[number]): ShellNavItem => ({
    key: n.key,
    to: n.to,
    label: n.label,
    icon: n.icon,
    active: isActive(path, n.to),
    badge:
      n.key === "kiriman" && w.badges.kiriman > 0
        ? { content: w.badges.kiriman, label: `${w.badges.kiriman} kiriman perlu tindakan` }
        : n.key === "pengaturan" && w.hints.mengantarWebhook
          ? { content: <TriangleAlertIcon className="size-4 text-warn" aria-hidden />, label: "Webhook Mengantar belum aktif" }
          : null,
    children: "children" in n ? n.children.map((c) => ({ ...c, active: c.to === "/kasir" ? path === "/kasir" : path.startsWith(c.to) })) : undefined,
  })
  const groups: ShellNavGroup[] = GROUPS.map((g) => ({ label: g.label, items: NAV.filter((n) => g.keys.includes(n.key) && w.menus.includes(n.key)).map(item) })).filter((g) => g.items.length)
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
      sidebarStatus={<CounterStatus />}
      navLabel="Menu utama"
      groups={groups}
      commands={commands}
      user={{ name: w.user.name, email: w.user.email, role: w.role === "gerai_admin" ? "Pemilik" : "Kasir", onLogout: logout, profileTo: "/akun", helpTo: "/bantuan" }}
      crumbs={crumbsOf(path)}
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
      <BottomLink to="/kasir" label="Buat" icon={PackageIcon} active={path.startsWith("/kasir")} />
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
