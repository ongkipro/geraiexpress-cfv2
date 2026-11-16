import { Link } from "@tanstack/react-router"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { PageTitle } from "../../shell/states"

// Dashboard frame (TASK-301): owner and Kasir variants; KPIs, charts and the period filter arrive with TASK-309.
export function DashboardPage() {
  const w = useWorkspace()
  if (!isOwner(w)) {
    return (
      <div>
        <PageTitle title="Tugas Loket Hari Ini" description={`Halo, ${w.user.name}.`} />
        <section className="rounded-lg border bg-card p-6">
          <p className="text-base">Mulai kiriman baru dari tombol <strong>Kiriman Baru</strong> atau pindai QR pelanggan.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/kasir" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground md:h-10">Buat Pengiriman</Link>
            <Link to="/kasir/$sub" params={{ sub: "shift" }} className="inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium md:h-10">Shift Loket</Link>
          </div>
        </section>
      </div>
    )
  }
  return (
    <div>
      <PageTitle title="Dashboard" description={`Selamat datang, ${w.user.name}.`} />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border bg-card p-6">
          <h3 className="text-lg font-semibold">Mulai melayani</h3>
          <p className="mt-2 text-base text-muted-foreground">Buat kiriman pertama dari loket, atau atur ekspedisi yang tampil di kasir.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/kasir" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground md:h-10">Buat Pengiriman</Link>
            <Link to="/pengaturan/ekspedisi" className="inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium md:h-10">Ekspedisi Aktif</Link>
          </div>
        </section>
        <section className="rounded-lg border bg-card p-6">
          <h3 className="text-lg font-semibold">Akun Mengantar</h3>
          <p className="mt-2 text-base text-muted-foreground">Hubungkan kabar status kiriman agar Dashboard selalu terbaru.</p>
          <div className="mt-4"><Link to="/pengaturan/mengantar" className="inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium md:h-10">Pengaturan Mengantar</Link></div>
        </section>
      </div>
    </div>
  )
}
