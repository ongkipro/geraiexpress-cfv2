import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { ActivityIcon, LayoutDashboardIcon, ShieldCheckIcon, StoreIcon, TagIcon } from "lucide-react"
import { Button } from "@shared/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@shared/components/ui/sidebar"
import { TooltipProvider } from "@shared/components/ui/tooltip"
import { api } from "../lib/api"

// Super Admin shell (visual 07 §2): 5 menus, environment chip, no "+ Kiriman Baru" (DEC-209).
const NAV = [
  { to: "/", label: "Ringkasan", icon: LayoutDashboardIcon },
  { to: "/gerai", label: "Gerai", icon: StoreIcon },
  { to: "/tarif", label: "Tarif & Kurir", icon: TagIcon },
  { to: "/pengawasan", label: "Pengawasan", icon: ActivityIcon },
  { to: "/sistem", label: "Sistem & Audit", icon: ShieldCheckIcon },
] as const

const TITLES: Record<string, string> = { "/": "Ringkasan", "/gerai": "Gerai", "/tarif": "Tarif & Kurir", "/pengawasan": "Pengawasan", "/sistem": "Sistem & Audit" }

export function ConsoleShell({ environment, userName, pending }: { environment: "Produksi" | "Sandbox"; userName: string; pending: number }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const section = "/" + (path.split("/")[1] ?? "")
  const title = TITLES[section] ?? "Konsol"
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex flex-col gap-1 px-2 py-2 group-data-[collapsible=icon]:hidden">
              <span className="font-semibold">GeraiExpress · Super Admin</span>
              <span className={`w-fit rounded-md border px-2 text-sm font-medium ${environment === "Produksi" ? "border-danger text-danger" : "border-border text-muted-foreground"}`}>{environment}</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <nav aria-label="Menu Super Admin">
                <SidebarMenu>
                  {NAV.map((n) => {
                    const active = n.to === "/" ? path === "/" : path === n.to || path.startsWith(`${n.to}/`)
                    return (
                      <SidebarMenuItem key={n.to}>
                        <SidebarMenuButton isActive={active} tooltip={n.label} render={<Link to={n.to} aria-current={active ? "page" : undefined} />}>
                          <n.icon />
                          <span>{n.label}</span>
                          {n.to === "/gerai" && pending > 0 ? (
                            <span className="ml-auto rounded-full bg-muted px-2 text-sm tabular-nums" aria-label={`${pending} pengajuan baru`}>
                              {pending}
                            </span>
                          ) : null}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4">
            <SidebarTrigger aria-label="Ciutkan menu" />
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-[-0.02em]">{title}</h1>
            <span className="ml-auto hidden text-sm text-muted-foreground sm:inline">{userName} · TOTP aktif</span>
            <Button
              variant="outline"
              onClick={async () => {
                await api("/auth/logout", { body: {} }).catch(() => undefined)
                window.location.assign("/masuk")
              }}
            >
              Keluar
            </Button>
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
