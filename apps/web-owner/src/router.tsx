import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router"
import { api, ApiError } from "./lib/api"
import { OwnerMasukPage } from "./routes/masuk/page"
import { TotpPage } from "./routes/totp/page"
import { ConsoleShell } from "./shell/console-shell"
import { GeraiPage } from "./routes/gerai/index"
import { PengajuanPage } from "./routes/gerai/pengajuan"
import { GeraiDetailPage } from "./routes/gerai/detail"
import { RingkasanPage } from "./routes/index/page"
import { PengawasanPage } from "./routes/pengawasan/page"
import { SistemPage } from "./routes/sistem/page"
import { TarifPage } from "./routes/tarif/index"
import { TarifGeraiPage } from "./routes/tarif/gerai"

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
        <p className="text-base md:text-sm text-muted-foreground">Alamat yang Anda buka tidak tersedia.</p>
      </div>
    </main>
  )
}

async function loadMe() {
  try {
    const me = await api<OwnerMe>("/auth/me")
    const summary = await api<{ pending: number }>("/gerai/summary").catch(() => ({ pending: 0 }))
    return { me, pending: summary.pending }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      if (err.body.code === "TOTP_REQUIRED") throw redirect({ to: "/totp", search: { mode: "required" } })
      if (err.body.code === "TOTP_ENROL_REQUIRED") throw redirect({ to: "/totp", search: { mode: "enrol" } })
      throw redirect({ to: "/masuk" })
    }
    throw err
  }
}

// Authenticated console layout (aal2 enforced by the API; the loader redirects when it is missing).
const consoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "console",
  loader: loadMe,
  component: function Console() {
    const { me, pending } = consoleRoute.useLoaderData()
    return <ConsoleShell environment={import.meta.env.MODE === "production" && location.hostname === "owner.geraiexpress.com" ? "Produksi" : "Sandbox"} userName={me.user.name} userEmail={me.user.email} pending={pending} />
  },
})

const indexRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/", component: RingkasanPage })
const geraiRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/gerai",
  validateSearch: (s: Record<string, unknown>) => ({ tab: s.tab === "direktori" || s.tab === "domain" ? (s.tab as "direktori" | "domain") : ("pengajuan" as const) }),
  component: GeraiPage,
})
const pengajuanRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/gerai/pengajuan/$id", component: PengajuanPage })
const geraiDetailRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/gerai/$slug", component: GeraiDetailPage })
const tarifRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/tarif", component: TarifPage })
const tarifGeraiRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/tarif/$tenantId", component: TarifGeraiPage })
const pengawasanRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/pengawasan", component: PengawasanPage })
const sistemRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/sistem", component: SistemPage })

const masukRoute = createRoute({ getParentRoute: () => rootRoute, path: "/masuk", component: OwnerMasukPage })
const totpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/totp",
  // `kembali` = where a step-up came from; only same-site relative paths are kept (no open redirect).
  validateSearch: (s: Record<string, unknown>): { mode: "required" | "enrol"; kembali?: string } => ({
    mode: s.mode === "enrol" ? "enrol" : "required",
    kembali: typeof s.kembali === "string" && s.kembali.startsWith("/") && !s.kembali.startsWith("//") && !s.kembali.includes("\\") ? s.kembali : undefined,
  }),
  component: TotpPage,
})

export const routeTree = rootRoute.addChildren([
  consoleRoute.addChildren([indexRoute, geraiRoute, pengajuanRoute, geraiDetailRoute, tarifRoute, tarifGeraiRoute, pengawasanRoute, sistemRoute]),
  masukRoute,
  totpRoute,
])
export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
