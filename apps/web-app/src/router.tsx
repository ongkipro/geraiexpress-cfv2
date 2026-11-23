import { lazy, Suspense, type ComponentType, type ReactNode } from "react"
import { createRootRoute, createRoute, createRouter, Link, Outlet, redirect } from "@tanstack/react-router"
import { api, ApiError } from "./lib/api"
import { AppShell } from "./shell/app-shell"
import { ErrorState, Forbidden } from "./shell/states"
import { useWorkspace, WorkspaceContext, type Workspace } from "./shell/workspace"
import { Skeleton } from "./components/ui/skeleton"
import { DashboardPage } from "./routes/index/page"
import { KasirPage } from "./routes/kasir/index"
import { KirimanPage } from "./routes/kiriman/index/page"
import { MasukPage } from "./routes/masuk/page"

// Route-level code splitting for secondary screens so auth, Kasir POS, and Dashboard load fast on 4G counter phones.
function lazyPage<K extends string>(loader: () => Promise<Record<K, ComponentType>>, key: K) {
  const Comp = lazy<ComponentType>(() => loader().then((m) => ({ default: m[key] })))
  return function LazyRoute() {
    return (
      <Suspense fallback={<div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat halaman"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>}>
        <Comp />
      </Suspense>
    )
  }
}

const AturSandiPage = lazyPage(() => import("./routes/atur-sandi/page"), "AturSandiPage")
const DaftarAkunPage = lazyPage(() => import("./routes/daftar-akun/page"), "DaftarAkunPage")
const LupaSandiPage = lazyPage(() => import("./routes/lupa-sandi/page"), "LupaSandiPage")
const UndanganPage = lazyPage(() => import("./routes/undangan/page"), "UndanganPage")
const DaftarPage = lazyPage(() => import("./routes/daftar/page"), "DaftarPage")
const DaftarStatusPage = lazyPage(() => import("./routes/daftar/status"), "DaftarStatusPage")
const PengaturanMengantarPage = lazyPage(() => import("./routes/pengaturan/mengantar/page"), "PengaturanMengantarPage")
const PengaturanEkspedisiPage = lazyPage(() => import("./routes/pengaturan/ekspedisi/page"), "PengaturanEkspedisiPage")
const NotifikasiPage = lazyPage(() => import("./routes/notifikasi/page"), "NotifikasiPage")
const PengirimPage = lazyPage(() => import("./routes/kontak/pengirim"), "PengirimPage")
const PenerimaPage = lazyPage(() => import("./routes/kontak/penerima"), "PenerimaPage")
const CekCepatPage = lazyPage(() => import("./routes/kasir/cek-cepat"), "CekCepatPage")
const ShiftPage = lazyPage(() => import("./routes/kasir/shift"), "ShiftPage")
const PaketMassalPage = lazyPage(() => import("./routes/kasir/multi/page"), "PaketMassalPage")
const CekResiPage = lazyPage(() => import("./routes/kasir/cek-resi/page"), "CekResiPage")
const RiwayatMassalPage = lazyPage(() => import("./routes/kiriman/massal/history"), "RiwayatMassalPage")
const BatchPage = lazyPage(() => import("./routes/kiriman/massal/batch"), "BatchPage")
const ManifestPage = lazyPage(() => import("./routes/kiriman/pickup/page"), "ManifestPage")
const KeuanganPage = lazyPage(() => import("./routes/keuangan/page"), "KeuanganPage")
const PengaturanIndexPage = lazyPage(() => import("./routes/pengaturan/index/shared"), "PengaturanIndexPage")
const StatusPage = lazyPage(() => import("./routes/status/page"), "StatusPage")
const ProfilGeraiPage = lazyPage(() => import("./routes/pengaturan/profil/page"), "ProfilGeraiPage")
const DataUsahaPage = lazyPage(() => import("./routes/pengaturan/data-usaha/page"), "DataUsahaPage")
const PrinterPage = lazyPage(() => import("./routes/pengaturan/printer/page"), "PrinterPage")
const PackingPage = lazyPage(() => import("./routes/pengaturan/packing/page"), "PackingPage")
const AnggotaPage = lazyPage(() => import("./routes/pengaturan/anggota/page"), "AnggotaPage")
const ApiMcpPage = lazyPage(() => import("./routes/pengaturan/api-mcp/page"), "ApiMcpPage")
const MiniSitePage = lazyPage(() => import("./routes/pengaturan/mini-site/page"), "MiniSitePage")
const AkunPage = lazyPage(() => import("./routes/akun/page"), "AkunPage")
const BantuanPage = lazyPage(() => import("./routes/bantuan/page"), "BantuanPage")
const KirimanDetailPage = lazyPage(() => import("./routes/kiriman/detail"), "KirimanDetailPage")
const LabelPrivasiPage = lazyPage(() => import("./routes/pengaturan/label-privasi/page"), "LabelPrivasiPage")
const CetakMassalPage = lazyPage(() => import("./routes/kiriman/cetak-massal/page"), "CetakMassalPage")
const LayarPelangganPage = lazyPage(() => import("./routes/kasir/layar-pelanggan"), "LayarPelangganPage")

// Route table for the app SPA. Feature tasks add their routes under src/routes/** and register them here.
export interface Me {
  user: { id: string; name: string; email: string }
  membership: { tenantId: string; tenantName: string; tenantSlug: string; role: "gerai_admin" | "cashier" } | null
}

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound })

function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-3 text-center">
        <h1 className="text-[28px] leading-tight font-semibold">Halaman tidak ditemukan</h1>
        <p className="text-base md:text-sm text-muted-foreground">Alamat yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Link to="/" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground md:h-9 md:text-sm">Kembali ke Dashboard</Link>
          <Link to="/masuk" className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-base font-medium text-slate-900 md:h-9 md:text-sm">Halaman Masuk</Link>
        </div>
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
const kasirRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kasir", component: KasirPage })
const cekCepatRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kasir/cek-cepat", component: CekCepatPage })
const cetakMassalRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman/cetak-massal", component: CetakMassalPage })
const kirimanDetailRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman/$slug", component: KirimanDetailPage })
const shiftRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kasir/shift", component: ShiftPage })
const multiRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kasir/multi", component: PaketMassalPage })
const cekResiRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kasir/cek-resi", component: CekResiPage })
const riwayatMassalRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman/massal", component: RiwayatMassalPage })
const batchRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman/massal/$batch", component: BatchPage })
const profilRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/profil", component: ownerOnly(ProfilGeraiPage) })
const dataUsahaRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/data-usaha", component: ownerOnly(DataUsahaPage) })
const printerRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/printer", component: PrinterPage })
const packingRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/packing", component: ownerOnly(PackingPage) })
const anggotaRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/anggota", component: ownerOnly(AnggotaPage) })
const manifestRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman/pickup/$batch", component: ManifestPage })
const miniSiteRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/mini-site", component: ownerOnly(MiniSitePage) })
const apiMcpRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan/api-mcp", component: ownerOnly(ApiMcpPage) })
const kirimanRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kiriman", component: KirimanPage })
const pengirimRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kontak/pengirim", component: PengirimPage })
const penerimaRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/kontak/penerima", component: PenerimaPage })
const keuanganRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/keuangan", component: ownerOnly(KeuanganPage) })
const pengaturanRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/pengaturan", component: PengaturanIndexPage })
const akunRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/akun", component: AkunPage })
const bantuanRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/bantuan", component: BantuanPage })
const statusRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/status", component: ownerOnly(StatusPage) })
const featureRoutes = [miniSiteRoute, apiMcpRoute, manifestRoute, profilRoute, dataUsahaRoute, printerRoute, packingRoute, anggotaRoute, kasirRoute, cekCepatRoute, shiftRoute, multiRoute, cekResiRoute, riwayatMassalRoute, batchRoute, cetakMassalRoute, kirimanDetailRoute, kirimanRoute, pengirimRoute, penerimaRoute, keuanganRoute, pengaturanRoute, akunRoute, bantuanRoute, statusRoute] as const

const masukRoute = createRoute({ getParentRoute: () => rootRoute, path: "/masuk", component: MasukPage })
// DEC-250 Sol R1: an applicant who already has an app session but no gerai continues on `/daftar` — from the auth
// switcher, the brand `Daftar Gerai` CTA or a typed URL — instead of being sent back to account creation.
const daftarAkunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/daftar-akun",
  beforeLoad: async () => {
    const me = await api<Me>("/auth/me").catch(() => null)
    if (me && !me.membership) throw redirect({ to: "/daftar" })
  },
  component: DaftarAkunPage,
})
const lupaSandiRoute = createRoute({ getParentRoute: () => rootRoute, path: "/lupa-sandi", component: LupaSandiPage })
const aturSandiRoute = createRoute({ getParentRoute: () => rootRoute, path: "/atur-sandi/$token", component: AturSandiPage })
const daftarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/daftar",
  beforeLoad: async () => {
    const me = await api<Me>("/auth/me").catch(() => null)
    if (!me) throw redirect({ to: "/daftar-akun" })
  },
  component: DaftarPage,
})
const daftarStatusRoute = createRoute({ getParentRoute: () => rootRoute, path: "/daftar/status", component: DaftarStatusPage })
const undanganRoute = createRoute({ getParentRoute: () => rootRoute, path: "/undangan/$token", component: UndanganPage })
// TASK-701: the paired customer display needs no sign-in, so it lives outside the workspace shell (spec 03 §5.5).
const layarPelangganRoute = createRoute({ getParentRoute: () => rootRoute, path: "/kasir/layar-pelanggan", component: LayarPelangganPage })

export const routeTree = rootRoute.addChildren([
  workspaceRoute.addChildren([indexRoute, notifikasiRoute, pengaturanMengantarRoute, pengaturanEkspedisiRoute, labelPrivasiRoute, ...featureRoutes]),
  masukRoute,
  daftarAkunRoute,
  lupaSandiRoute,
  aturSandiRoute,
  undanganRoute,
  daftarRoute,
  daftarStatusRoute,
  layarPelangganRoute,
])

export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
