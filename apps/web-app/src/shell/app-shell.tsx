import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { BellIcon, ContactIcon, HomeIcon, MoreHorizontalIcon, PackageIcon, PlusIcon, QrCodeIcon, SearchIcon, SettingsIcon, TriangleAlertIcon, TruckIcon, WalletIcon } from "lucide-react"
import { AdminShell, ShellBrand, type Crumb, type ShellNavItem } from "../components/admin/shell"
import { CalloutAlert } from "../components/admin/page"
import { Button } from "../components/ui/button"
import { useSidebar } from "../components/ui/sidebar"
import { api } from "../lib/api"
import { useWorkspace } from "./workspace"
import { LinkButton } from "../components/admin/link-button"

// Gerai workspace shell (visual 07 §1, DEC-213/225, DEC-236): the shared AdminShell with 6 menus (Keuangan owner only),
// a breadcrumb title, search / notifications / `Scan QR` / `+ Kiriman Baru` in the header, NavUser in the sidebar
// footer; phones keep the 5-item counter bottom bar, whose `Lainnya` opens the same sidebar Sheet.
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

export function AppShell() {
  const w = useWorkspace()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  // Commit flows own the bottom of the phone screen (their checkout bar); the menu stays in the header Sheet.
  const commitFlow = path === "/kasir" || /^\/kiriman\/[a-z0-9]{7}$/.test(path) || /^\/kasir\/(multi|shift)/.test(path) || /^\/kiriman\/(pickup|retur)\//.test(path)
  const nav: ShellNavItem[] = NAV.filter((n) => w.menus.includes(n.key)).map((n) => ({
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
  }))

  const toolbar = (
    <>
      <Button variant="outline" className="hidden w-64 justify-start text-muted-foreground lg:inline-flex" onClick={() => navigate({ to: "/kasir/$sub", params: { sub: "cek-resi" } })}>
        <SearchIcon aria-hidden data-icon="inline-start" /> Cari INV / AWB / HP
      </Button>
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Cari INV, AWB atau HP" onClick={() => navigate({ to: "/kasir/$sub", params: { sub: "cek-resi" } })}>
        <SearchIcon aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Pindai QR" className="md:hidden" onClick={() => navigate({ to: "/kasir" })}>
        <QrCodeIcon aria-hidden />
      </Button>
      <LinkButton variant="ghost"
        size="icon"
        className="relative"
        aria-label={w.badges.notifications ? `Notifikasi, ${w.badges.notifications} belum dibaca` : "Notifikasi"} to="/notifikasi">
        <BellIcon aria-hidden />
        {w.badges.notifications ? (
          <span className="absolute top-0.5 right-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-sm leading-5 font-semibold text-white tabular-nums" aria-hidden>
            {w.badges.notifications > 9 ? "9+" : w.badges.notifications}
          </span>
        ) : null}
      </LinkButton>
      <Button variant="outline" className="hidden md:inline-flex" onClick={() => navigate({ to: "/kasir" })}>
        <QrCodeIcon aria-hidden data-icon="inline-start" /> Scan QR
      </Button>
      {!/^\/kiriman\/[a-z0-9]{7}$/.test(path) ? (
        <Button variant={primaryCta(path) ? "default" : "outline"} className="hidden md:inline-flex" onClick={() => navigate({ to: "/kasir" })}>
          <PlusIcon aria-hidden data-icon="inline-start" /> Kiriman Baru
        </Button>
      ) : null}
    </>
  )

  return (
    <AdminShell
      brand={
        <ShellBrand
          mark={w.tenant.name.slice(0, 1).toUpperCase()}
          title={w.tenant.name}
          subtitle={
            <a href={`https://${w.tenant.miniSiteHost}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              {w.tenant.miniSiteHost}
            </a>
          }
        />
      }
      navLabel="Menu utama"
      nav={nav}
      user={{ name: w.user.name, email: w.user.email, role: w.role === "gerai_admin" ? "Pemilik" : "Kasir", onLogout: logout, profileTo: "/akun", helpTo: "/bantuan" }}
      crumbs={crumbsOf(path)}
      toolbar={toolbar}
      bottomBar={commitFlow ? undefined : <BottomBar path={path} kiriman={w.badges.kiriman} />}
    >
      {w.hints.mengantarWebhook && path === "/" ? (
        <div className="mb-6">
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
    <nav aria-label="Menu bawah" className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 border-t bg-card md:hidden">
      <BottomLink to="/" label="Beranda" icon={HomeIcon} active={path === "/"} />
      <BottomLink to="/kasir" label="Buat" icon={PackageIcon} active={path.startsWith("/kasir")} />
      <Link to="/kasir" aria-label="Kiriman Baru" className="flex items-center justify-center">
        <span className={`flex size-14 items-center justify-center rounded-full ${primaryCta(path) ? "bg-primary text-primary-foreground" : "border-2 border-primary bg-card text-primary"}`}>
          <PlusIcon aria-hidden className="size-6" />
        </span>
      </Link>
      <BottomLink to="/kiriman" label="Kiriman" icon={TruckIcon} active={path.startsWith("/kiriman")} badge={kiriman} />
      <button type="button" onClick={() => setOpenMobile(true)} aria-expanded={openMobile} className={`flex flex-col items-center justify-center gap-0.5 text-sm ${openMobile ? "text-primary" : "text-muted-foreground"}`}>
        <MoreHorizontalIcon aria-hidden className="size-6" />
        Lainnya
      </button>
    </nav>
  )
}

function BottomLink({ to, label, icon: Icon, active, badge }: { to: string; label: string; icon: typeof HomeIcon; active: boolean; badge?: number }) {
  return (
    <Link to={to} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-0.5 text-sm ${active ? "font-medium text-primary" : "text-muted-foreground"}`}>
      <Icon aria-hidden className="size-6" />
      {label}
      {badge ? <span className="absolute top-1 right-[22%] min-w-5 rounded-full bg-danger px-1 text-center text-sm leading-5 text-white tabular-nums">{badge}</span> : null}
    </Link>
  )
}
