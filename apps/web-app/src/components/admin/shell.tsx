import { useEffect, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, ChevronsUpDownIcon, HelpCircleIcon, LogOutIcon, UserIcon } from "lucide-react"
import { applyTextSize, storedTextSize, TEXT_SIZES, type TextSize } from "../../shell/workspace"
import { Avatar, AvatarFallback } from "../ui/avatar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "../ui/breadcrumb"
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
import { Separator } from "../ui/separator"
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

// Unified admin shell (DEC-236, dashboard-01 + sidebar-07 composition adapted to the comfort contract): one sidebar
// (256px / 56px rail; a Sheet below 768px on both consoles), a 64px SiteHeader with trigger + breadcrumb + toolbar,
// and NavUser in the sidebar footer. Gerai Admin and Super Admin pass their own brand, menus and toolbar.

export interface ShellNavItem {
  key: string
  to: string
  label: string
  icon: typeof UserIcon
  active: boolean
  /** Numeric badge (count) or a node (e.g. a warning icon); both carry their own accessible label. */
  badge?: { content: ReactNode; label: string } | null
  children?: Array<{ to: string; label: string; active: boolean }>
}

export interface Crumb {
  label: string
  to?: string
}

export function AdminShell({
  brand,
  navLabel,
  groupLabel,
  nav,
  user,
  crumbs,
  toolbar,
  children,
  bottomBar,
}: {
  brand: ReactNode
  navLabel: string
  groupLabel?: string
  nav: ShellNavItem[]
  user: NavUserProps
  crumbs: Crumb[]
  toolbar?: ReactNode
  children: ReactNode
  /** Optional phone bottom bar (Gerai counter shortcuts); the main area reserves room for it. */
  bottomBar?: ReactNode
}) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">{brand}</SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              {groupLabel ? <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel> : null}
              <nav aria-label={navLabel}>
                <SidebarMenu>
                  {nav.map((n) => (
                    <NavItem key={n.key} item={n} />
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border">
            <NavUser {...user} />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-card px-2 md:px-4">
            <SidebarTrigger aria-label="Buka atau ciutkan menu" className="size-11 md:size-10" />
            <Separator orientation="vertical" className="mx-1 hidden h-6! md:block" />
            <SiteBreadcrumb crumbs={crumbs} />
            {toolbar ? <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">{toolbar}</div> : null}
          </header>
          <main className={`mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-4 py-6 md:px-6 ${bottomBar ? "pb-24 md:pb-6" : ""}`}>{children}</main>
          {bottomBar}
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  )
}

function NavItem({ item: n }: { item: ShellNavItem }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const close = () => isMobile && setOpenMobile(false)
  // DEC-237: a menu with children is a collapsible tree (sidebar-07); it opens when the section is active and the
  // chevron toggles it without navigating. Without children: a plain link.
  const [open, setOpen] = useState(n.active)
  // Entering the section opens the tree (state adjusted during render, not in an effect).
  const [wasActive, setWasActive] = useState(n.active)
  if (n.active !== wasActive) {
    setWasActive(n.active)
    if (n.active) setOpen(true)
  }
  const button = (
    <SidebarMenuButton isActive={n.active && !n.children?.some((c) => c.active)} tooltip={n.label} render={<Link to={n.to} aria-current={n.active && !n.children?.some((c) => c.active) ? "page" : undefined} onClick={close} />}>
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
      <CollapsibleTrigger
        render={
          <SidebarMenuAction className="top-2! transition-transform data-panel-open:rotate-90 md:top-1.5!" aria-label={`${open ? "Tutup" : "Buka"} submenu ${n.label}`}>
            <ChevronRightIcon aria-hidden />
          </SidebarMenuAction>
        }
      />
      <CollapsibleContent>
        <SidebarMenuSub>
          {n.children.map((c) => (
            <SidebarMenuSubItem key={c.to}>
              <SidebarMenuSubButton isActive={c.active} render={<Link to={c.to} aria-current={c.active ? "page" : undefined} onClick={close} />}>
                <span>{c.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Section → page breadcrumb; the last crumb is the page title (h1) so every console page has one heading level 1. */
function SiteBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const last = crumbs.at(-1)
  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.slice(0, -1).map((c) => (
          <BreadcrumbItem key={c.label} className="hidden md:inline-flex">
            {c.to ? <BreadcrumbLink render={<Link to={c.to} />}>{c.label}</BreadcrumbLink> : <span>{c.label}</span>}
            <BreadcrumbSeparator />
          </BreadcrumbItem>
        ))}
        {last ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="min-w-0 truncate">
              <h1 className="truncate text-lg font-semibold text-foreground md:text-xl md:tracking-[-0.02em]">{last.label}</h1>
            </BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
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
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?"

/** Account block in the sidebar footer: avatar, name, role; menu with profile, text size, help and logout. */
export function NavUser({ name, email, role, status, onLogout, profileTo, helpTo }: NavUserProps) {
  const [textSize, setTextSize] = useState<TextSize>(storedTextSize)
  useEffect(() => applyTextSize(textSize), [textSize])
  const { isMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" aria-label="Menu akun" />}>
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg text-sm font-semibold">{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-base font-medium">{name}</span>
              <span className="truncate text-sm text-muted-foreground">{role}</span>
            </span>
            <ChevronsUpDownIcon aria-hidden className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-base font-medium text-foreground">{name}</span>
                <span className="truncate">{email}</span>
                {status ? <span>{status}</span> : null}
              </DropdownMenuLabel>
              {profileTo ? (
                <DropdownMenuItem render={<Link to={profileTo} />}>
                  <UserIcon aria-hidden /> Profil Saya
                </DropdownMenuItem>
              ) : null}
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
            {helpTo ? (
              <DropdownMenuItem render={<Link to={helpTo} />}>
                <HelpCircleIcon aria-hidden /> Bantuan & Panduan
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onLogout}>
              <LogOutIcon aria-hidden /> Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** Sidebar brand: name + secondary line; hidden on the icon rail except the initial mark. */
export function ShellBrand({ title, subtitle, mark }: { title: string; subtitle: ReactNode; mark: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        {mark}
      </span>
      <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
        <span className="truncate text-base font-semibold">{title}</span>
        <span className="truncate text-sm text-muted-foreground">{subtitle}</span>
      </div>
    </div>
  )
}
