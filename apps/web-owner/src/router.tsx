import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router"
import { Button } from "@shared/components/ui/button"
import { api, ApiError } from "./lib/api"
import { OwnerMasukPage } from "./routes/masuk/page"
import { TotpPage } from "./routes/totp/page"

export interface OwnerMe {
  user: { id: string; name: string; email: string }
  aal: "aal2"
  totpRecentUntil: number
  sessionExpiresAt: number
}

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound })

function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-[440px] flex-col gap-2 text-center">
        <h1 className="text-[28px] leading-tight font-semibold">Halaman tidak ditemukan</h1>
        <p className="text-base text-muted-foreground">Alamat yang Anda buka tidak tersedia.</p>
      </div>
    </main>
  )
}

// Console home placeholder; the five-menu shell arrives with TASK-203.
function Home() {
  const me = indexRoute.useLoaderData()
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-[440px] flex-col gap-4 rounded-lg border border-border p-6">
        <h1 className="text-[28px] leading-tight font-semibold">Halo, {me.user.name}</h1>
        <p className="text-base text-muted-foreground">TOTP aktif. Konsol Super Admin sedang disiapkan.</p>
        <Button
          variant="outline"
          size="lg"
          onClick={async () => {
            await api("/auth/logout", { body: {} }).catch(() => undefined)
            window.location.assign("/masuk")
          }}
        >
          Keluar
        </Button>
      </div>
    </main>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async () => {
    try {
      return await api<OwnerMe>("/auth/me")
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect(err.body.code === "TOTP_REQUIRED" ? { to: "/totp", search: { mode: "required" } } : { to: "/masuk" })
      }
      throw err
    }
  },
  component: Home,
})
const masukRoute = createRoute({ getParentRoute: () => rootRoute, path: "/masuk", component: OwnerMasukPage })
const totpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/totp",
  validateSearch: (s: Record<string, unknown>) => ({ mode: s.mode === "enrol" ? ("enrol" as const) : ("required" as const) }),
  component: TotpPage,
})

export const routeTree = rootRoute.addChildren([indexRoute, masukRoute, totpRoute])
export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
