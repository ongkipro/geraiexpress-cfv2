import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router"
import { AturSandiPage } from "./routes/atur-sandi/page"
import { DaftarAkunPage } from "./routes/daftar-akun/page"
import { LupaSandiPage } from "./routes/lupa-sandi/page"
import { MasukPage } from "./routes/masuk/page"
import { UndanganPage } from "./routes/undangan/page"
import { DaftarPage } from "./routes/daftar/page"
import { DaftarStatusPage } from "./routes/daftar/status"
import { api, ApiError } from "./lib/api"
import { Button } from "./components/ui/button"

// Route table for the app SPA. Feature tasks add their routes under src/routes/** and register them here.
export interface Me {
  user: { id: string; name: string; email: string }
  membership: { tenantId: string; tenantName: string; tenantSlug: string; role: "gerai_admin" | "cashier" } | null
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

// Signed-in home placeholder; the workspace shell replaces it in TASK-301.
function Home() {
  const me = indexRoute.useLoaderData()
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-[440px] flex-col gap-4 rounded-lg border border-border p-6">
        <h1 className="text-[28px] leading-tight font-semibold">Halo, {me.user.name}</h1>
        <p className="text-base text-muted-foreground">
          {me.membership ? `${me.membership.tenantName} · ${me.membership.role === "gerai_admin" ? "Pemilik" : "Kasir"}` : "Akun Anda belum terhubung ke gerai."}
        </p>
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
      return await api<Me>("/auth/me")
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw redirect({ to: "/masuk" })
      throw err
    }
  },
  component: Home,
})
const masukRoute = createRoute({ getParentRoute: () => rootRoute, path: "/masuk", component: MasukPage })
const daftarAkunRoute = createRoute({ getParentRoute: () => rootRoute, path: "/daftar-akun", component: DaftarAkunPage })
const lupaSandiRoute = createRoute({ getParentRoute: () => rootRoute, path: "/lupa-sandi", component: LupaSandiPage })
const aturSandiRoute = createRoute({ getParentRoute: () => rootRoute, path: "/atur-sandi/$token", component: AturSandiPage })
const daftarRoute = createRoute({ getParentRoute: () => rootRoute, path: "/daftar", component: DaftarPage })
const daftarStatusRoute = createRoute({ getParentRoute: () => rootRoute, path: "/daftar/status", component: DaftarStatusPage })
const undanganRoute = createRoute({ getParentRoute: () => rootRoute, path: "/undangan/$token", component: UndanganPage })

export const routeTree = rootRoute.addChildren([indexRoute, masukRoute, daftarAkunRoute, lupaSandiRoute, aturSandiRoute, undanganRoute, daftarRoute, daftarStatusRoute])

export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
