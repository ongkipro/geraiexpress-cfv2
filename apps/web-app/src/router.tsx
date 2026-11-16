import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router"
import { AturSandiPage } from "./routes/atur-sandi/page"
import { DaftarAkunPage } from "./routes/daftar-akun/page"
import { LupaSandiPage } from "./routes/lupa-sandi/page"
import { MasukPage } from "./routes/masuk/page"
import { UndanganPage } from "./routes/undangan/page"
import { DaftarPage } from "./routes/daftar/page"
import { DaftarStatusPage } from "./routes/daftar/status"
import { PengaturanMengantarPage } from "./routes/pengaturan/mengantar/page"
import { PengaturanEkspedisiPage } from "./routes/pengaturan/ekspedisi/page"
import type { ReactNode } from "react"
import { api, ApiError } from "./lib/api"
import { AppShell } from "./shell/app-shell"
import { ComingSoon, ErrorState, Forbidden } from "./shell/states"
import { useWorkspace, WorkspaceContext, type Workspace } from "./shell/workspace"
import { DashboardPage } from "./routes/index/page"
import { NotifikasiPage } from "./routes/notifikasi/page"
import { PengirimPage } from "./routes/kontak/pengirim"
import { PenerimaPage } from "./routes/kontak/penerima"
import { KasirPage } from "./routes/kasir/index"
import { CekCepatPage } from "./routes/kasir/cek-cepat"
import { KirimanDetailPage } from "./routes/kiriman/detail"
import { LabelPrivasiPage } from "./routes/pengaturan/label-privasi/page"
import { CetakMassalPage } from "./routes/kiriman/cetak-massal/page"

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

// Authenticated workspace layout (TASK-301): loads the projected workspace once; 401 → /masuk, no gerai yet →
// /daftar/status. Feature pages render inside the shell.
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "workspace",
  loader: async () => {
    try {
      return await api<Workspace>("/workspace")
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw redirect({ to: "/masuk" })
      if (err instanceof ApiError && err.status === 403 && err.body.code === "NO_MEMBERSHIP") throw redirect({ to: "/daftar/status" })
      throw err
    }
  },
  errorComponent: WorkspaceError,
  component: function Workspace() {
    const w = workspaceRoute.useLoaderData()
    return (
      <WorkspaceContext.Provider value={w}>
        <AppShell />
      </WorkspaceContext.Provider>
    )
  },
})

function WorkspaceError() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-[440px] flex-col gap-3">
        <ErrorState message="Ruang kerja tidak dapat dimuat. Periksa koneksi lalu coba lagi." onRetry={() => window.location.reload()} />
      </div>
    </main>
  )
}

/** Owner-only page guard (the API refuses too; this only avoids a dead screen for a Kasir). */
function ownerOnly(Page: () => ReactNode) {
  return function OwnerOnly() {
    const w = useWorkspace()
    return w.role === "gerai_admin" ? <Page /> : <Forbidden />
  }
}

const indexRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/", component: DashboardPage })
const notifikasiRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/notifikasi", component: NotifikasiPage })
const pengaturanMengantarRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/mengantar", component: ownerOnly(PengaturanMengantarPage) })
const labelPrivasiRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/label-privasi", component: ownerOnly(LabelPrivasiPage) })
const pengaturanEkspedisiRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/ekspedisi", component: ownerOnly(PengaturanEkspedisiPage) })
const soonPage = (title: string, body: string, task: string) => () => <ComingSoon title={title} body={body} task={task} />
const kasirRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kasir", component: KasirPage })
const cekCepatRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kasir/cek-cepat", component: CekCepatPage })
const cetakMassalRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman/cetak-massal", component: CetakMassalPage })
const kirimanDetailRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman/$slug", component: KirimanDetailPage })
const kasirSubRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kasir/$sub", component: soonPage("Buat Pengiriman", "Bagian ini sedang disiapkan.", "TASK-303..308") })
const kirimanRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman", component: soonPage("Kiriman", "Daftar kiriman dengan pencarian, filter dan ekspor sedang disiapkan.", "TASK-311") })
const pengirimRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kontak/pengirim", component: PengirimPage })
const penerimaRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kontak/penerima", component: PenerimaPage })
const keuanganRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/keuangan", component: ownerOnly(soonPage("Keuangan", "Saldo Mengantar, mutasi dan laba per INV sedang disiapkan.", "TASK-401")) })
const pengaturanRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan", component: soonPage("Pengaturan", "Menu pengaturan lengkap sedang disiapkan. Ekspedisi Aktif dan Mengantar sudah bisa dibuka.", "TASK-310") })
const akunRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/akun", component: soonPage("Akun Saya", "Profil, kata sandi dan sesi aktif sedang disiapkan.", "TASK-310") })
const bantuanRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/bantuan", component: soonPage("Bantuan & Panduan", "Panduan penggunaan sedang disiapkan. Butuh bantuan sekarang? Hubungi bantuan@geraiexpress.com.", "TASK-310") })
const comingSoonRoutes = [kasirRoute, cekCepatRoute, cetakMassalRoute, kirimanDetailRoute, kasirSubRoute, kirimanRoute, pengirimRoute, penerimaRoute, keuanganRoute, pengaturanRoute, akunRoute, bantuanRoute] as const

const masukRoute = createRoute({ getParentRoute: () => rootRoute, path: "/masuk", component: MasukPage })
const daftarAkunRoute = createRoute({ getParentRoute: () => rootRoute, path: "/daftar-akun", component: DaftarAkunPage })
const lupaSandiRoute = createRoute({ getParentRoute: () => rootRoute, path: "/lupa-sandi", component: LupaSandiPage })
const aturSandiRoute = createRoute({ getParentRoute: () => rootRoute, path: "/atur-sandi/$token", component: AturSandiPage })
const daftarRoute = createRoute({ getParentRoute: () => rootRoute, path: "/daftar", component: DaftarPage })
const daftarStatusRoute = createRoute({ getParentRoute: () => rootRoute, path: "/daftar/status", component: DaftarStatusPage })
const undanganRoute = createRoute({ getParentRoute: () => rootRoute, path: "/undangan/$token", component: UndanganPage })

export const routeTree = rootRoute.addChildren([
  workspaceRoute.addChildren([indexRoute, notifikasiRoute, pengaturanMengantarRoute, pengaturanEkspedisiRoute, labelPrivasiRoute, ...comingSoonRoutes]),
  masukRoute,
  daftarAkunRoute,
  lupaSandiRoute,
  aturSandiRoute,
  undanganRoute,
  daftarRoute,
  daftarStatusRoute,
])

export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
