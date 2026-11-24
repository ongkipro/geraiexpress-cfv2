import { forwardRef, Fragment, useEffect, useMemo, useState, type ComponentProps, type ForwardedRef, type ReactNode } from "react"
import { Link, useLinkProps, useNavigate } from "@tanstack/react-router"
import { ArrowUpRightIcon, ChevronDownIcon, ChevronRightIcon, CornerDownLeftIcon, GlobeIcon, HelpCircleIcon, LogOutIcon, SearchIcon, UserIcon } from "lucide-react"
import { applyTextSize, storedTextSize, TEXT_SIZE_EVENT, TEXT_SIZES, type TextSize } from "../../shell/workspace"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "../ui/breadcrumb"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog"
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
} from "../ui/dropdown-menu"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar"
import { TooltipProvider } from "../ui/tooltip"
import { Toaster } from "../ui/sonner"
import { cn } from "cn"

// Unified admin shell (DEC-236, DEC-239 — AdsBookCMS / TokoPhi / dashboard-01 surface model). White 256px sidebar
// (48/56px icon rail; a Sheet below 768px) with the brand, an optional quick-action row, grouped menus and a compact
// status card; a white 64px topbar with trigger + breadcrumb (navigation only — the page owns its h1), a ⌘K command
// pill, page actions and the account chip (profile, text size, help, Keluar) on the right; content on a #F6F7F9 canvas.

export interface ShellNavItem {
  key: string
  to: string
  label: string
  icon: typeof UserIcon
  active: boolean
  /** Numeric badge (count) or a node (e.g. a warning icon); both carry their own accessible label. */
  badge?: { content: ReactNode; label: string } | null
  children?: Array<{ to: string; label: string; active: boolean }>
  /** DEC-243: start expanded on every load (primary counter tools), still collapsible by the chevron. */
  defaultOpen?: boolean
}

/**
 * Menu targets may carry a query (`/kiriman?tab=pickup`, DEC-241 sub-trees over tabbed pages). TanStack `Link`
 * wants `{ to, search }`, so split once here; every shell link (tree, breadcrumb, ⌘K) goes through it.
 */
export function linkTo(target: string): { to: string; search?: Record<string, string> } {
  const [to, qs] = target.split("?", 2)
  return qs ? { to: to!, search: Object.fromEntries(new URLSearchParams(qs)) } : { to: to! }
}

/**
 * Shell link: a router link whose `aria-current` is ours. TanStack `Link` marks `/kiriman` active on
 * `/kiriman?tab=retur` (prefix path + subset search) and stamps `aria-current="page"` after every prop, which would
 * announce two current pages in a sub-tree; the shell computes the current entry itself (query-aware, DEC-241).
 */
const NavLink = forwardRef<HTMLAnchorElement, Omit<ComponentProps<"a">, "href" | "target"> & { target: string }>(function NavLink({ target, "aria-current": current, ...rest }, ref) {
  const props = useLinkProps({ ...(linkTo(target) as { to: string }), ...rest }, ref as ForwardedRef<Element>)
  return <a {...props} aria-current={current} data-status={undefined} />
})

export interface ShellNavGroup {
  label: string
  items: ShellNavItem[]
}

export interface Crumb {
  label: string
  to?: string
}

/** One ⌘K command: a page to open (or an action). `keywords` widen matching (e.g. "resi awb"). */
export interface ShellCommand {
  label: string
  description?: string
  group: string
  to: string
  keywords?: string
  icon?: typeof UserIcon
}

export function AdminShell({
  brand,
  navLabel,
  groups,
  quickActions,
  sidebarStatus,
  user,
  crumbs,
  commands,
  searchPlaceholder = "Cari menu, INV, resi, atau HP…",
  toolbar,
  children,
  bottomBar,
}: {
  brand: ReactNode
  navLabel: string
  groups: ShellNavGroup[]
  /** dashboard-01 `NavMain` quick-create row under the brand (hidden on the icon rail). */
  quickActions?: ReactNode
  /** Compact operational status card at the sidebar foot. */
  sidebarStatus?: ReactNode
  user: NavUserProps
  crumbs: Crumb[]
  commands: ShellCommand[]
  searchPlaceholder?: string
  toolbar?: ReactNode
  children: ReactNode
  /** Optional phone bottom bar (Gerai counter shortcuts); the main area reserves room for it. */
  bottomBar?: ReactNode
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r border-slate-200/80">
          <SidebarHeader className="gap-2 px-3 pt-3 pb-1">
            {brand}
            {quickActions ? <div className="group-data-[collapsible=icon]:hidden">{quickActions}</div> : null}
          </SidebarHeader>
          <SidebarContent className="px-1">
            <nav aria-label={navLabel}>
              {groups.map((g) => (
                <SidebarGroup key={g.label} className="py-1.5">
                  <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
                  <SidebarMenu className="gap-0.5">
                    {g.items.map((n) => (
                      <NavItem key={n.key} item={n} />
                    ))}
                  </SidebarMenu>
                </SidebarGroup>
              ))}
            </nav>
          </SidebarContent>
          {sidebarStatus ? <SidebarFooter className="p-3 group-data-[collapsible=icon]:hidden">{sidebarStatus}</SidebarFooter> : null}
        </Sidebar>
        <SidebarInset data-admin-shell className="min-w-0 bg-background">
          {/* DEC-243 3-zone topbar. ≥ 1024 px it is a 3-column grid (1fr | 260–380 px | 1fr): the breadcrumb lives in
              its own flexible track, so a longer trail never moves the search bar — it sits at the same x on every page.
              The right track holds only what fits beside it: an avatar-only account chip below xl and the labelled
              pills (mini-site, TOTP) from 2xl, so utilities never run into the search (Sol R1 DEC-243 #1). With enlarged
              text below xl the search track narrows to 220–320 px (still fixed per page) so the owner's status icon,
              bell and avatar fit at 125 % (DEC-244). */}
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/95 px-2 backdrop-blur md:px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(240px,360px)_minmax(0,1fr)] lg:gap-4 lg:in-data-text:grid-cols-[minmax(0,1fr)_minmax(200px,300px)_minmax(0,1fr)] xl:in-data-text:grid-cols-[minmax(0,1fr)_minmax(240px,360px)_minmax(0,1fr)]">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="size-11 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:size-9" />
              <span aria-hidden className="hidden h-4 w-px shrink-0 bg-slate-200 md:block" />
              <SiteBreadcrumb crumbs={crumbs} />
            </div>
            <button
              type="button"
              data-shell-search
              onClick={() => setSearchOpen(true)}
              className="group hidden h-9 w-full items-center gap-2.5 rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 text-left text-sm text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-colors hover:border-slate-300 hover:bg-slate-100/70 hover:text-slate-800 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:flex"
            >
              <SearchIcon aria-hidden className="size-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{searchPlaceholder}</span>
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-xs font-medium text-slate-500">{shortcutLabel()}</kbd>
            </button>
            <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1 md:gap-1.5 lg:ml-0">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={searchPlaceholder.replace(/…$/, "")}
                className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:size-9 lg:hidden"
              >
                <SearchIcon aria-hidden className="size-[18px]" />
              </button>
              {toolbar}
              <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-slate-200/80 sm:block" />
              <AccountMenu {...user} />
            </div>
          </header>
          <main className={cn("mx-auto w-full max-w-[1480px] min-w-0 flex-1 px-4 pt-5 pb-8 md:px-6 md:pt-6 xl:px-8", bottomBar && "pb-24 md:pb-8")}>{children}</main>
          {bottomBar}
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} commands={commands} placeholder={searchPlaceholder} />
      <Toaster position="bottom-center" />
    </TooltipProvider>
  )
}

function NavItem({ item: n }: { item: ShellNavItem }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const close = () => isMobile && setOpenMobile(false)
  // DEC-237: a menu with children is a collapsible tree (sidebar-07); it opens when the section is active and the
  // chevron toggles it without navigating. Without children: a plain link.
  const [open, setOpen] = useState(n.defaultOpen ?? n.active)
  // Entering the section opens the tree (state adjusted during render, not in an effect).
  const [wasActive, setWasActive] = useState(n.active)
  if (n.active !== wasActive) {
    setWasActive(n.active)
    if (n.active) setOpen(true)
  }
  const self = n.active && !n.children?.some((c) => c.active)
  const button = (
    <SidebarMenuButton
      isActive={n.active}
      tooltip={n.label}
      className="relative data-active:bg-accent data-active:text-primary"
      render={<NavLink target={n.to} aria-current={self ? "page" : undefined} onClick={close} />}
    >
      {n.active ? <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r-full bg-primary group-data-[collapsible=icon]:hidden" /> : null}
      <n.icon aria-hidden />
      <span>{n.label}</span>
    </SidebarMenuButton>
  )
  if (!n.children?.length) {
    return (
      <SidebarMenuItem>
        {button}
        {n.badge ? <SidebarMenuBadge aria-label={n.badge.label}>{n.badge.content}</SidebarMenuBadge> : null}
      </SidebarMenuItem>
    )
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuItem />}>
      {button}
      {n.badge ? <SidebarMenuBadge className="right-7" aria-label={n.badge.label}>{n.badge.content}</SidebarMenuBadge> : null}
      <CollapsibleTrigger
        render={
          <SidebarMenuAction className="top-2! text-slate-400 transition-transform data-panel-open:rotate-90 md:top-1!" aria-label={`${open ? "Tutup" : "Buka"} submenu ${n.label}`}>
            <ChevronRightIcon aria-hidden />
          </SidebarMenuAction>
        }
      />
      <CollapsibleContent>
        <SidebarMenuSub className="mr-0 gap-0.5 border-slate-200/90 py-1">
          {n.children.map((c) => (
            <SidebarMenuSubItem key={c.to}>
              <SidebarMenuSubButton isActive={c.active} className="data-active:bg-transparent data-active:font-medium data-active:text-primary" render={<NavLink target={c.to} aria-current={c.active ? "page" : undefined} onClick={close} />}>
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", c.active ? "bg-primary" : "bg-slate-300")} />
                <span>{c.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** `⌘K` on Apple devices, `Ctrl K` elsewhere (the shortcut accepts both). */
function shortcutLabel() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"
}

/** Section → page breadcrumb (navigation, not a title): muted parents, the current page darker, 14px. */
function SiteBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const last = crumbs.at(-1)
  return (
    <Breadcrumb className="min-w-0 shrink" aria-label="Lokasi halaman">
      <BreadcrumbList className="flex-nowrap gap-1 text-sm sm:gap-1.5">
        {/* Item and separator are sibling <li>s (DEC-243): a separator nested inside an item is invalid HTML. */}
        {crumbs.slice(0, -1).map((c) => (
          <Fragment key={c.label}>
            <BreadcrumbItem className="hidden md:inline-flex">
              {c.to ? <BreadcrumbLink className="text-muted-foreground hover:text-slate-900" render={<NavLink target={c.to} />}>{c.label}</BreadcrumbLink> : <span className="text-muted-foreground">{c.label}</span>}
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:inline-flex" />
          </Fragment>
        ))}
        {last ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="min-w-0 truncate font-medium text-slate-900">{last.label}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** ⌘K command palette (AdsBookCMS pattern on base-nova Dialog): filter as you type, arrows + Enter, Esc closes. */
function CommandPalette({ open, onOpenChange, commands, placeholder }: { open: boolean; onOpenChange: (o: boolean) => void; commands: ShellCommand[]; placeholder: string }) {
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const [cursor, setCursor] = useState(0)
  const results = useMemo(() => {
    const raw = q.trim()
    const t = raw.toLowerCase()
    const matched = t ? commands.filter((c) => `${c.label} ${c.description ?? ""} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(t)) : commands
    const hasTrack = commands.some((c) => c.to === "/kasir/cek-resi")
    const looksLikeTracking = raw.length >= 4 && !/\s{2,}/.test(raw) && (/\d/.test(raw) || /^inv\s+\S+/i.test(raw))
    if (hasTrack && looksLikeTracking) {
      return [
        ...matched,
        { label: `Lacak “${raw}” di Cek Resi`, description: "Cari nomor INV, resi kurir, atau HP penerima", group: "Lacak Cepat", to: `/kasir/cek-resi?q=${encodeURIComponent(raw)}`, icon: SearchIcon },
      ]
    }
    return matched
  }, [q, commands])
  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setQ("")
      setCursor(0)
    }
  }
  const go = (c: ShellCommand | undefined) => {
    if (!c) return
    close(false)
    void navigate(linkTo(c.to) as { to: string })
  }
  // Keep the keyboard-active option visible inside the scrolling list (focus stays on the input).
  useEffect(() => {
    if (open) document.getElementById(`cmdk-${cursor}`)?.scrollIntoView({ block: "nearest" })
  }, [cursor, open])
  const groups = [...new Set(results.map((r) => r.group))]
  let index = -1
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Cari menu</DialogTitle>
        <DialogDescription className="sr-only">Ketik nama menu atau tugas, lalu tekan Enter.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-slate-200 px-3">
          <SearchIcon aria-hidden className="size-4 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setCursor(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, results.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (e.key === "Enter") {
                e.preventDefault()
                go(results[cursor])
              }
            }}
            role="combobox"
            aria-expanded
            aria-controls="cmdk-list"
            aria-activedescendant={results[cursor] ? `cmdk-${cursor}` : undefined}
            aria-label="Cari menu atau tugas"
            placeholder={placeholder}
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
        <div id="cmdk-list" role="listbox" aria-label="Hasil" className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
          {results.length === 0 ? <p className="px-3 py-10 text-center text-sm text-muted-foreground">Tidak ada menu yang cocok.</p> : null}
          {groups.map((g) => (
            <div key={g} role="group" aria-label={g} className="mb-1">
              <p className="px-2 pt-2 pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{g}</p>
              {results
                .filter((r) => r.group === g)
                .map((c) => {
                  index++
                  const i = index
                  const Icon = c.icon
                  return (
                    <div
                      key={`${c.to}-${c.label}`}
                      id={`cmdk-${i}`}
                      role="option"
                      aria-selected={i === cursor}
                      onMouseMove={() => setCursor(i)}
                      onClick={() => go(c)}
                      className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2", i === cursor ? "bg-slate-100" : "")}
                    >
                      {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{c.label}</span>
                        {c.description ? <span className="block truncate text-xs text-muted-foreground">{c.description}</span> : null}
                      </span>
                      {i === cursor ? <CornerDownLeftIcon aria-hidden className="size-3.5 text-slate-400" /> : null}
                    </div>
                  )
                })}
            </div>
          ))}
        </div>
        <div className="hidden items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-muted-foreground sm:flex">
          <span>↑↓ pilih · Enter buka</span>
          <span>Esc tutup</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export interface NavUserProps {
  name: string
  email: string
  role: string
  /** Extra status line (e.g. TOTP active on Super Admin). */
  status?: ReactNode
  onLogout: () => void
  profileTo?: string
  helpTo?: string
  /** DEC-244: public pages opened in a new tab (Gerai: `Halaman Publik Gerai`). The console has none (DEC-246). */
  externalLinks?: Array<{ label: string; sublabel?: string; href: string; icon?: typeof UserIcon }>
  /** Breakpoint from which the chip shows name + role (DEC-243/244: the console's busier right track waits for 2xl). */
  labelFrom?: "xl" | "2xl"
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?"

/** Top-right account chip (AdsBookCMS / TokoPhi): avatar + name/role; menu with profile, text size, help and Keluar. */
export function AccountMenu({ name, email, role, status, onLogout, profileTo, helpTo, externalLinks, labelFrom = "xl" }: NavUserProps) {
  const [textSize, setTextSize] = useState<TextSize>(storedTextSize)
  useEffect(() => applyTextSize(textSize), [textSize])
  useEffect(() => {
    const onSync = (e: Event) => {
      const next = (e as CustomEvent<TextSize>).detail
      if (next && next !== textSize) setTextSize(next)
    }
    window.addEventListener(TEXT_SIZE_EVENT, onSync)
    return () => window.removeEventListener(TEXT_SIZE_EVENT, onSync)
  }, [textSize])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu akun"
        className={cn("flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-transparent py-0.5 pr-1 pl-1 text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:border-slate-200 data-popup-open:bg-slate-100 md:min-h-9 md:min-w-0", labelFrom === "2xl" ? "2xl:pr-2" : "xl:pr-2")}
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white md:size-7">
          {initials(name)}
        </span>
        {/* Name + role only at normal text size: with Ukuran Teks enlarged (root rem 18/20 px) the labelled chip no
            longer fits beside the fixed-width search (Sol R2 DEC-243), so the chip stays avatar-only. */}
        <span className={cn("hidden min-w-0 flex-col text-left leading-tight in-data-text:hidden!", labelFrom === "2xl" ? "2xl:flex" : "xl:flex")}>
          <span className="max-w-32 truncate text-xs font-semibold text-slate-900">{name}</span>
          <span className="text-xs text-slate-500">{role}</span>
        </span>
        <ChevronDownIcon aria-hidden className={cn("hidden size-3.5 text-slate-400 in-data-text:hidden!", labelFrom === "2xl" ? "2xl:block" : "xl:block")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="truncate text-sm font-semibold text-slate-900">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
            <span className="text-xs text-muted-foreground">
              {role}
              {status ? <> · {status}</> : null}
            </span>
          </DropdownMenuLabel>
          {externalLinks?.map((l) => {
            const Icon = l.icon ?? GlobeIcon
            return (
              <DropdownMenuItem key={l.href} render={<a href={l.href} target="_blank" rel="noreferrer" />} className="items-start">
                <Icon aria-hidden className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{l.label}</span>
                  {l.sublabel ? <span className="truncate text-xs text-muted-foreground">{l.sublabel}</span> : null}
                </span>
                <ArrowUpRightIcon aria-hidden className="mt-0.5 size-3.5 text-muted-foreground" />
                <span className="sr-only">(buka di tab baru)</span>
              </DropdownMenuItem>
            )
          })}
          {profileTo ? (
            <DropdownMenuItem render={<Link to={profileTo} />}>
              <UserIcon aria-hidden /> Profil Saya
            </DropdownMenuItem>
          ) : null}
          {helpTo ? (
            <DropdownMenuItem render={<Link to={helpTo} />}>
              <HelpCircleIcon aria-hidden /> Bantuan & Panduan
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Ukuran Teks</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={textSize} onValueChange={(v) => setTextSize(v as TextSize)}>
            {TEXT_SIZES.map((t) => (
              <DropdownMenuRadioItem key={t.id} value={t.id}>
                {t.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <LogOutIcon aria-hidden /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Sidebar brand: rounded-xl mark + name + secondary line; only the mark on the icon rail. */
export function ShellBrand({ title, subtitle, mark, logoSrc }: { title: string; subtitle: ReactNode; mark: string; logoSrc?: string }) {
  return (
    <div className="flex h-12 items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      {/* Console: the GeraiExpress logo (DEC-244), frameless and sized to the two-line title stack (DEC-246). Gerai
          workspace: the tenant's own initial (white-label, DEC-202). */}
      {logoSrc ? (
        <img src={logoSrc} alt="" aria-hidden className="h-7 w-auto shrink-0 group-data-[collapsible=icon]:h-5" />
      ) : (
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground group-data-[collapsible=icon]:size-8">
          {mark}
        </span>
      )}
      <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold tracking-tight text-slate-950">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </div>
  )
}

/** Compact status card for the sidebar foot: label/value rows with a status dot each. */
export function SidebarStatusCard({ title, rows, link }: { title: string; rows: Array<{ label: string; value: ReactNode; tone: "safe" | "warn" | "muted" }>; link?: { to: string; label: string } }) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <div className="border-t border-slate-200/80 px-2 pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</p>
        {link ? (
          <Link to={link.to} onClick={() => isMobile && setOpenMobile(false)} className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline md:min-h-6">
            {link.label}
          </Link>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-700">
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", r.tone === "safe" ? "bg-safe" : r.tone === "warn" ? "bg-warn" : "bg-slate-400")} />
              <span className="truncate">{r.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
