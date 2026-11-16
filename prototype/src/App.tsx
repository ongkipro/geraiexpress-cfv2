import * as React from "react"
import {
  BanknoteIcon,
  BoxIcon,
  ChevronDownIcon,
  HomeIcon,
  LogOutIcon,
  PlusIcon,
  PrinterIcon,
  QrCodeIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
  MenuIcon,
  BellIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
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
} from "@/components/ui/dropdown-menu"
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
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Dashboard } from "@/screens/dashboard"
import { Pos } from "@/screens/pos"
import { Kiriman } from "@/screens/kiriman"
import { Pengirim } from "@/screens/kontak"
import { Keuangan } from "@/screens/keuangan"
import { Pengaturan } from "@/screens/pengaturan"
import { AdminRingkasan } from "@/screens/admin"

type Role = "owner" | "kasir"

// Hash routing keeps the prototype dependency-free: #/kiriman, #/kasir/baru?role=kasir&dir=b
function useHashRoute() {
  const read = () => {
    const [path, query = ""] = window.location.hash.replace(/^#/, "").split("?")
    return { path: path || "/", params: new URLSearchParams(query) }
  }
  const [route, setRoute] = React.useState(read)
  React.useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return route
}

const gerai = [
  { path: "/", label: "Dashboard", icon: HomeIcon },
  { path: "/kasir", label: "Buat Pengiriman", icon: ReceiptIcon },
  { path: "/kiriman", label: "Kiriman", icon: BoxIcon, badge: 22 },
  { path: "/kontak/pengirim", label: "Kontak", icon: UsersIcon, sub: [{ path: "/kontak/pengirim", label: "Pengirim" }, { path: "/kontak/penerima", label: "Penerima" }] },
  { path: "/keuangan", label: "Keuangan", icon: BanknoteIcon, ownerOnly: true },
  { path: "/pengaturan", label: "Pengaturan", icon: SettingsIcon },
]

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/kasir": "Buat Pengiriman",
  "/kiriman": "Kiriman",
  "/kontak/pengirim": "Kontak › Pengirim",
  "/kontak/penerima": "Kontak › Penerima",
  "/keuangan": "Keuangan",
  "/pengaturan": "Pengaturan",
}
const titleFor = (p: string) => titles[p] ?? (p.startsWith("/pengaturan/") ? "Pengaturan" : undefined)

export default function App() {
  const { path, params } = useHashRoute()
  const role = (params.get("role") as Role) || "owner"
  const dir = params.get("dir") || "a"
  const [text, setText] = React.useState("normal")

  React.useEffect(() => {
    document.documentElement.dataset.direction = dir
  }, [dir])
  React.useEffect(() => {
    document.documentElement.dataset.text = text
  }, [text])

  const q = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...(role !== "owner" ? { role } : {}), ...(dir !== "a" ? { dir } : {}), ...extra })
    const s = p.toString()
    return s ? `?${s}` : ""
  }
  const href = (to: string) => `#${to}${q()}`

  if (path.startsWith("/admin")) return <AdminShell href={href} />

  const onPos = path === "/kasir/baru"
  const primaryHeader = ["/", "/kasir", "/kiriman"].includes(path)
  const items = gerai.filter((i) => !(i.ownerOnly && role === "kasir"))
  const blocked = path === "/keuangan" && role === "kasir"

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" render={<a href={href("/")} />}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-foreground" aria-hidden>
                    BJ
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate font-semibold">Berkah Jaya</span>
                    <span className="truncate text-sm text-muted-foreground">berkahjaya.geraimitra.com</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <nav aria-label="Menu utama">
                <SidebarMenu>
                  {items.map((it) => {
                    const active = it.sub ? path.startsWith("/kontak") : path === it.path || (it.path !== "/" && path.startsWith(it.path + "/"))
                    return (
                      <SidebarMenuItem key={it.label}>
                        <SidebarMenuButton isActive={active} tooltip={it.label} render={<a href={href(it.path)} aria-current={active ? "page" : undefined} />}>
                          <it.icon />
                          <span>{it.label}</span>
                          {it.sub ? <ChevronDownIcon className="ml-auto" /> : null}
                        </SidebarMenuButton>
                        {it.badge ? <SidebarMenuBadge aria-label={`${it.badge} perlu tindakan`}>{it.badge}</SidebarMenuBadge> : null}
                        {it.sub ? (
                          <SidebarMenuSub>
                            {it.sub.map((s) => (
                              <SidebarMenuSubItem key={s.path}>
                                <SidebarMenuSubButton isActive={path === s.path} render={<a href={href(s.path)} />}>
                                  <span>{s.label}</span>
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
            <div className="flex flex-col gap-1 px-2 py-1 text-sm group-data-[collapsible=icon]:hidden">
              <span className="flex items-center gap-2">
                <PrinterIcon className="size-5 text-safe" aria-hidden />
                <span>Printer 100 mm siap</span>
              </span>
              <span className="text-muted-foreground">Shift Pagi · Ani</span>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4">
            <SidebarTrigger className="hidden md:inline-flex" aria-label="Ciutkan menu" />
            <MobileMenu href={href} items={items} />
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-[-0.02em]">{onPos ? "Kiriman › INV 8K4M2P7" : titleFor(path) ?? "Buat Pengiriman"}</h1>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" className="hidden w-72 justify-start text-muted-foreground lg:inline-flex" aria-label="Cari INV, AWB, atau nomor HP">
                <SearchIcon data-icon="inline-start" />
                Cari INV / AWB / HP
                <kbd className="ml-auto text-sm text-muted-foreground">Ctrl K</kbd>
              </Button>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Cari">
                <SearchIcon />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Notifikasi, 3 baru">
                <BellIcon />
              </Button>
              <Button variant="outline" className="hidden sm:inline-flex">
                <QrCodeIcon data-icon="inline-start" />
                Scan QR
              </Button>
              {!onPos ? (
                <Button variant={primaryHeader ? "default" : "outline"} className="hidden sm:inline-flex" render={<a href={href("/kasir/baru")} />} nativeButton={false}>
                  <PlusIcon data-icon="inline-start" />
                  Kiriman Baru
                </Button>
              ) : null}
              <AccountMenu role={role} text={text} setText={setText} q={q} path={path} />
            </div>
          </header>

          <main className="flex-1 px-4 py-6 pb-24 md:px-6 md:pb-6">
            <p className="mb-4 text-sm text-muted-foreground">Prototipe · data contoh · arah {dir.toUpperCase()} · peran {role === "owner" ? "Pemilik Gerai" : "Kasir"}</p>
            {blocked ? (
              <div role="alert" className="max-w-xl rounded-lg border bg-card p-6">
                <h2 className="text-lg font-semibold">Menu ini khusus pemilik gerai</h2>
                <p className="mt-2 text-muted-foreground">Keuangan hanya bisa dibuka oleh Gerai Admin. Minta akses ke pemilik gerai bila diperlukan.</p>
              </div>
            ) : (
              <Screen path={path} role={role} href={href} />
            )}
          </main>

          {!onPos ? <BottomBar href={href} path={path} primary={primaryHeader} /> : null}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function Screen({ path, role, href }: { path: string; role: Role; href: (p: string) => string }) {
  switch (path) {
    case "/":
      return <Dashboard role={role} href={href} />
    case "/kasir":
    case "/kasir/baru":
      return <Pos role={role} />
    case "/kiriman":
      return <Kiriman role={role} href={href} />
    case "/kontak/pengirim":
    case "/kontak/penerima":
      return <Pengirim role={role} />
    case "/keuangan":
      return <Keuangan />
    case "/pengaturan":
      return <Pengaturan role={role} item={null} href={href} />
    default:
      if (path.startsWith("/pengaturan/")) return <Pengaturan role={role} item={path.split("/")[2]} href={href} />
      return <p>Halaman tidak ditemukan.</p>
  }
}

function AccountMenu({ role, text, setText, q, path }: { role: Role; text: string; setText: (v: string) => void; q: (e?: Record<string, string>) => string; path: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2" />}>
        <span className="flex size-9 items-center justify-center rounded-full bg-muted font-medium" aria-hidden>
          A
        </span>
        <span className="hidden md:inline">Ani</span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ukuran teks</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={text} onValueChange={(v) => setText(String(v))}>
            <DropdownMenuRadioItem value="normal">Normal (100%)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="besar">Besar (112%)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="sangat-besar">Sangat Besar (125%)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Lihat sebagai (prototipe)</DropdownMenuLabel>
          <DropdownMenuItem render={<a href={`#${path}${q({ role: role === "owner" ? "kasir" : "owner" })}`} />}>
            {role === "owner" ? "Kasir" : "Pemilik Gerai"}
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="#/admin" />}>
            <ShieldCheckIcon />
            Super Admin
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOutIcon />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileMenu({ href, items }: { href: (p: string) => string; items: typeof gerai }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu" />}>
        <MenuIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {items.flatMap((i) => (i.sub ? i.sub.map((s) => ({ ...s, label: `Kontak › ${s.label}` })) : [i])).map((i) => (
          <DropdownMenuItem key={i.path + i.label} render={<a href={href(i.path)} />}>
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BottomBar({ href, path, primary }: { href: (p: string) => string; path: string; primary: boolean }) {
  const item = (to: string, label: string, Icon: typeof HomeIcon) => {
    const active = to === "/" ? path === "/" : path.startsWith(to)
    return (
      <a href={href(to)} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-sm ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}>
        <Icon className="size-6" aria-hidden />
        {label}
      </a>
    )
  }
  return (
    <nav aria-label="Navigasi bawah" className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center border-t bg-card px-1 md:hidden">
      {item("/", "Beranda", HomeIcon)}
      {item("/kasir", "Buat", ReceiptIcon)}
      <a href={href("/kasir/baru")} aria-label="Kiriman Baru" className={`mx-1 flex size-14 shrink-0 items-center justify-center rounded-full ${primary ? "bg-primary text-primary-foreground" : "border-2 border-primary bg-card text-primary"}`}>
        <PlusIcon className="size-7" aria-hidden />
      </a>
      {item("/kiriman", "Kiriman", BoxIcon)}
      {item("/pengaturan", "Lainnya", MenuIcon)}
    </nav>
  )
}

function AdminShell({ href }: { href: (p: string) => string }) {
  const nav = ["Ringkasan", "Gerai", "Tarif & Kurir", "Pengawasan", "Sistem & Audit"]
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex flex-col gap-1 px-2 py-2 group-data-[collapsible=icon]:hidden">
              <span className="font-semibold">GeraiExpress · Super Admin</span>
              <span className="w-fit rounded-md border border-danger px-2 text-sm font-medium text-danger">Produksi</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <nav aria-label="Menu Super Admin">
                <SidebarMenu>
                  {nav.map((n, i) => (
                    <SidebarMenuItem key={n}>
                      <SidebarMenuButton isActive={i === 0} tooltip={n} render={<a href="#/admin" aria-current={i === 0 ? "page" : undefined} />}>
                        {i === 4 ? <ShieldCheckIcon /> : <HomeIcon />}
                        <span>{n}</span>
                      </SidebarMenuButton>
                      {n === "Gerai" ? <SidebarMenuBadge aria-label="3 pengajuan baru">3</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-card px-4">
            <SidebarTrigger aria-label="Ciutkan menu" />
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Ringkasan</h1>
            <span className="ml-auto text-sm text-muted-foreground">TOTP aktif · 12 mnt</span>
            <Button variant="outline" render={<a href={href("/")} />} nativeButton={false}>
              Ke tampilan gerai
            </Button>
          </header>
          <main className="px-4 py-6 md:px-6">
            <p className="mb-4 text-sm text-muted-foreground">Prototipe · data contoh</p>
            <AdminRingkasan />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
