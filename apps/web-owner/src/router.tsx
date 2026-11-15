import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router"
import { api, ApiError } from "./lib/api"
import { OwnerMasukPage } from "./routes/masuk/page"
import { TotpPage } from "./routes/totp/page"
import { ConsoleShell } from "./shell/console-shell"
import { GeraiPage } from "./routes/gerai/index"
import { PengajuanPage } from "./routes/gerai/pengajuan"
import { GeraiDetailPage } from "./routes/gerai/detail"
import { PlaceholderPage } from "./routes/placeholder"

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

async function loadMe() {
  try {
    const me = await api<OwnerMe>("/auth/me")
    const summary = await api<{ pending: number }>("/gerai/summary").catch(() => ({ pending: 0 }))
    return { me, pending: summary.pending }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw redirect(err.body.code === "TOTP_REQUIRED" ? { to: "/totp", search: { mode: "required" } } : { to: "/masuk" })
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
    return <ConsoleShell environment={import.meta.env.MODE === "production" && location.hostname === "owner.geraiexpress.com" ? "Produksi" : "Sandbox"} userName={me.user.name} pending={pending} />
  },
})

const indexRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/", component: () => <PlaceholderPage title="Ringkasan" body="Ringkasan jaringan (gerai aktif, kiriman, pengajuan, kesehatan sinkron dan relay)." /> })
const geraiRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/gerai",
  validateSearch: (s: Record<string, unknown>) => ({ tab: s.tab === "direktori" || s.tab === "domain" ? (s.tab as "direktori" | "domain") : ("pengajuan" as const) }),
  component: GeraiPage,
})
const pengajuanRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/gerai/pengajuan/$id", component: PengajuanPage })
const geraiDetailRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/gerai/$slug", component: GeraiDetailPage })
const tarifRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/tarif", component: () => <PlaceholderPage title="Tarif & Kurir" body="Diskon dan cashback per gerai × kurir, katalog kurir, dan kebijakan diskon." /> })
const pengawasanRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/pengawasan", component: () => <PlaceholderPage title="Pengawasan" body="Pantauan kiriman dan sinkron lintas gerai, serta radar risiko COD." /> })
const sistemRoute = createRoute({ getParentRoute: () => consoleRoute, path: "/sistem", component: () => <PlaceholderPage title="Sistem & Audit" body="Kesehatan integrasi dan relay, log audit, akses admin, profil perusahaan." /> })

const masukRoute = createRoute({ getParentRoute: () => rootRoute, path: "/masuk", component: OwnerMasukPage })
const totpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/totp",
  validateSearch: (s: Record<string, unknown>) => ({ mode: s.mode === "enrol" ? ("enrol" as const) : ("required" as const) }),
  component: TotpPage,
})

export const routeTree = rootRoute.addChildren([
  consoleRoute.addChildren([indexRoute, geraiRoute, pengajuanRoute, geraiDetailRoute, tarifRoute, pengawasanRoute, sistemRoute]),
  masukRoute,
  totpRoute,
])
export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
