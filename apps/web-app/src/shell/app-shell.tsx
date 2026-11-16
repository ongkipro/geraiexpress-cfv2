import { useEffect, useState } from "react"
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { BellIcon, ChevronDownIcon, ContactIcon, HomeIcon, LogOutIcon, MenuIcon, PackageIcon, PlusIcon, QrCodeIcon, SearchIcon, SettingsIcon, TruckIcon, WalletIcon, MoreHorizontalIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "../components/ui/sidebar"
import { TooltipProvider } from "../components/ui/tooltip"
import { api } from "../lib/api"
import { applyTextSize, storedTextSize, TEXT_SIZES, useWorkspace, type TextSize } from "./workspace"

// Gerai workspace shell (visual 07 §1, DEC-213/225): 6 menus (Keuangan owner only), header with search, notifications,
// account menu, `Scan QR` and `+ Kiriman Baru`; phones get a 5-item bottom bar and a `Lainnya` sheet.
interface NavItem {
  key: string
  to: string
  label: string
  short?: string
  icon: typeof HomeIcon
  children?: Array<{ to: string; label: string }>
}

const NAV: NavItem[] = [
  { key: "dashboard", to: "/", label: "Dashboard", short: "Beranda", icon: HomeIcon },
  { key: "buat-pengiriman", to: "/kasir", label: "Buat Pengiriman", short: "Buat", icon: PackageIcon },
  { key: "kiriman", to: "/kiriman", label: "Kiriman", icon: TruckIcon },
  { key: "kontak", to: "/kontak/pengirim", label: "Kontak", icon: ContactIcon, children: [{ to: "/kontak/pengirim", label: "Pengirim" }, { to: "/kontak/penerima", label: "Penerima" }] },
  { key: "keuangan", to: "/keuangan", label: "Keuangan", icon: WalletIcon },
  { key: "pengaturan", to: "/pengaturan", label: "Pengaturan", icon: SettingsIcon },
]

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "Dashboard"],
  [/^\/kasir/, "Buat Pengiriman"],
  [/^\/kiriman/, "Kiriman"],
  [/^\/kontak\/pengirim/, "Kontak › Pengirim"],
  [/^\/kontak\/penerima/, "Kontak › Penerima"],
  [/^\/keuangan/, "Keuangan"],
  [/^\/pengaturan/, "Pengaturan"],
  [/^\/notifikasi/, "Notifikasi"],
  [/^\/akun/, "Akun Saya"],
  [/^\/bantuan/, "Bantuan & Panduan"],
]

/** `+ Kiriman Baru` is primary only on Dashboard, /kasir and /kiriman (visual 07 §1.1). */
const primaryCta = (path: string) => path === "/" || path === "/kasir" || path === "/kiriman"

function isActive(path: string, to: string) {
  if (to === "/") return path === "/"
  const base = to.startsWith("/kontak") ? "/kontak" : to
  return path === base || path.startsWith(`${base}/`)
}

export function AppShell() {
  const w = useWorkspace()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const [more, setMore] = useState(false)
  const [textSize, setTextSize] = useState<TextSize>(storedTextSize)
  useEffect(() => applyTextSize(textSize), [textSize])
  const nav = NAV.filter((n) => w.menus.includes(n.key))
  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? "GeraiExpress"
  const commitFlow = /^\/kiriman\/[a-z0-9]{7}$/.test(path) || /^\/kasir\/(multi|shift)/.test(path) || /^\/kiriman\/(pickup|retur)\//.test(path)

  async function logout() {
    await api("/auth/logout", { body: {} }).catch(() => undefined)
    window.location.assign("/masuk")
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex flex-col gap-1 px-2 py-2 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-base font-semibold">{w.tenant.name}</span>
              <a href={`https://${w.tenant.miniSiteHost}`} target="_blank" rel="noreferrer" className="truncate text-sm text-muted-foreground underline-offset-4 hover:underline">
                {w.tenant.miniSiteHost}
              </a>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <nav aria-label="Menu utama">
                <SidebarMenu>
                  {nav.map((n) => {
                    const active = isActive(path, n.to)
                    return (
                      <SidebarMenuItem key={n.key}>
                        <SidebarMenuButton isActive={active} tooltip={n.label} render={<Link to={n.to} aria-current={active ? "page" : undefined} />}>
                          <n.icon />
                          <span>{n.label}</span>
                        </SidebarMenuButton>
                        {n.key === "kiriman" && w.badges.kiriman > 0 ? <SidebarMenuBadge aria-label={`${w.badges.kiriman} kiriman perlu tindakan`}>{w.badges.kiriman}</SidebarMenuBadge> : null}
                        {n.key === "pengaturan" && w.hints.mengantarWebhook ? (
                          <SidebarMenuBadge aria-label="Webhook Mengantar belum aktif"><TriangleAlertIcon className="size-4 text-warn" aria-hidden /></SidebarMenuBadge>
                        ) : null}
                        {n.children && active ? (
                          <SidebarMenuSub>
                            {n.children.map((c) => (
                              <SidebarMenuSubItem key={c.to}>
                                <SidebarMenuSubButton isActive={path.startsWith(c.to)} render={<Link to={c.to} aria-current={path.startsWith(c.to) ? "page" : undefined} />}>
                                  <span>{c.label}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        ) : null}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border">
            <p className="px-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
              {w.role === "gerai_admin" ? "Pemilik" : "Kasir"} · {w.user.name}
            </p>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-card px-2 md:px-4">
            <SidebarTrigger aria-label="Buka atau ciutkan menu" className="hidden md:inline-flex" />
            <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Buka menu" onClick={() => setMore(true)}>
              <MenuIcon aria-hidden />
            </Button>
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-[-0.02em]">{title}</h1>
            <Button variant="outline" className="hidden h-10 w-64 justify-start gap-2 text-muted-foreground lg:inline-flex" onClick={() => navigate({ to: "/kasir/$sub", params: { sub: "cek-resi" } })}>
              <SearchIcon aria-hidden /> Cari INV / AWB / HP
            </Button>
            <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Cari INV, AWB atau HP" onClick={() => navigate({ to: "/kasir/$sub", params: { sub: "cek-resi" } })}>
              <SearchIcon aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-lg" aria-label="Pindai QR" className="md:hidden" onClick={() => navigate({ to: "/kasir" })}>
              <QrCodeIcon aria-hidden />
            </Button>
            <Link to="/notifikasi" aria-label={w.badges.notifications ? `Notifikasi, ${w.badges.notifications} belum dibaca` : "Notifikasi"} className="relative inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted md:size-10">
              <BellIcon aria-hidden className="size-5" />
              {w.badges.notifications ? (
                <span className="absolute top-1 right-1 min-w-5 rounded-full bg-danger px-1 text-center text-sm leading-5 font-semibold text-white tabular-nums" aria-hidden>
                  {w.badges.notifications > 9 ? "9+" : w.badges.notifications}
                </span>
              ) : null}
            </Link>
            <Button variant="outline" className="hidden md:inline-flex" onClick={() => navigate({ to: "/kasir" })}>
              <QrCodeIcon aria-hidden /> Scan QR
            </Button>
            {!/^\/kiriman\/[a-z0-9]{7}$/.test(path) ? (
              <Button variant={primaryCta(path) ? "default" : "outline"} className="hidden md:inline-flex" onClick={() => navigate({ to: "/kasir" })}>
                <PlusIcon aria-hidden /> Kiriman Baru
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="hidden gap-1 md:inline-flex" aria-label="Menu akun" />}>
                <span className="max-w-32 truncate">{w.user.name}</span>
                <ChevronDownIcon aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{w.user.email}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate({ to: "/akun" })}>Profil Saya</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Ukuran Teks</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={textSize} onValueChange={(v) => setTextSize(v as TextSize)}>
                    {TEXT_SIZES.map((t) => (
                      <DropdownMenuRadioItem key={t.id} value={t.id}>
                        {t.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/bantuan" })}>Bantuan & Panduan</DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>
                  <LogOutIcon aria-hidden /> Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className={`mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6 ${commitFlow ? "" : "pb-24 md:pb-6"}`}>
            {w.hints.mengantarWebhook && path === "/" ? (
              <p role="status" className="mb-4 border-l-4 border-warn py-1 pl-3 text-base font-medium text-warn">
                Webhook Mengantar belum aktif. Status kiriman tetap diperbarui setiap jam.{" "}
                <Link to="/pengaturan/mengantar" className="underline underline-offset-4">Atur sekarang</Link>
              </p>
            ) : null}
            <Outlet />
          </main>
          {!commitFlow ? (
            <nav aria-label="Menu bawah" className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 border-t bg-card md:hidden">
              <BottomLink to="/" label="Beranda" icon={HomeIcon} active={path === "/"} />
              <BottomLink to="/kasir" label="Buat" icon={PackageIcon} active={path.startsWith("/kasir")} />
              <Link to="/kasir" aria-label="Kiriman Baru" className="flex items-center justify-center">
                <span className={`flex size-14 items-center justify-center rounded-full ${primaryCta(path) ? "bg-primary text-primary-foreground" : "border-2 border-primary bg-card text-primary"}`}>
                  <PlusIcon aria-hidden className="size-6" />
                </span>
              </Link>
              <BottomLink to="/kiriman" label="Kiriman" icon={TruckIcon} active={path.startsWith("/kiriman")} badge={w.badges.kiriman} />
              <button type="button" onClick={() => setMore(true)} className={`flex flex-col items-center justify-center gap-0.5 text-sm ${more ? "text-primary" : "text-muted-foreground"}`}>
                <MoreHorizontalIcon aria-hidden className="size-6" />
                Lainnya
              </button>
            </nav>
          ) : null}
          <Sheet open={more} onOpenChange={setMore}>
            <SheetContent side="left" className="w-80">
              <SheetHeader>
                <SheetTitle>{w.tenant.name}</SheetTitle>
              </SheetHeader>
              <nav aria-label="Menu lainnya" className="flex flex-col px-2">
                {[
                  { to: "/", label: "Dashboard", show: true },
                  { to: "/kasir", label: "Buat Pengiriman", show: true },
                  { to: "/kiriman", label: "Kiriman", show: true },
                  { to: "/kontak/pengirim", label: "Kontak › Pengirim", show: true },
                  { to: "/kontak/penerima", label: "Kontak › Penerima", show: true },
                  { to: "/keuangan", label: "Keuangan", show: w.menus.includes("keuangan") },
                  { to: "/pengaturan", label: "Pengaturan", show: true },
                  { to: "/akun", label: "Akun Saya", show: true },
                  { to: "/bantuan", label: "Bantuan & Panduan", show: true },
                ]
                  .filter((x) => x.show)
                  .map((x) => (
                    <Link key={x.to} to={x.to} onClick={() => setMore(false)} className="flex h-11 items-center rounded-lg px-3 text-base hover:bg-muted" aria-current={isActive(path, x.to) ? "page" : undefined}>
                      {x.label}
                    </Link>
                  ))}
                <button type="button" onClick={logout} className="flex h-11 items-center gap-2 rounded-lg px-3 text-left text-base text-danger hover:bg-muted">
                  <LogOutIcon aria-hidden className="size-5" /> Keluar
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
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
