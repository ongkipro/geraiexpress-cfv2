import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { rupiah, shipments } from "@/data"
import { PageHead, Section, StatusBadge } from "./shared"

const kpis = [
  { label: "Kiriman bulan ini", value: "412 paket", note: "18% lebih banyak dari Oktober" },
  { label: "Uang masuk di loket", value: rupiah(9840000), note: "Tunai Rp6,1 jt · QRIS Rp3,7 jt" },
  { label: "Laba bersih", value: rupiah(2190500), note: "Rp1,98 jt sudah cocok dengan Mengantar" },
  { label: "Saldo Mengantar aman", value: rupiah(840000), note: "Rp915.000 dikurangi cadangan 3 retur" },
]

const couriers = [
  { name: "J&T EZ", count: 168, profit: 840000, rts: "1,8%" },
  { name: "SiCepat REG", count: 112, profit: 590000, rts: "2,6%" },
  { name: "JNE REG", count: 84, profit: 480000, rts: "1,2%" },
  { name: "Lion Parcel", count: 48, profit: 280500, rts: "6,2%" },
]

export function Dashboard({ role, href }: { role: "owner" | "kasir"; href: (p: string) => string }) {
  if (role === "kasir") return <KasirHome href={href} />
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Ringkasan Gerai">
        <Button variant="outline">Hari ini</Button>
        <Button variant="outline">7 hari</Button>
        <Button variant="outline" aria-pressed className="border-primary bg-accent text-sidebar-accent-foreground">
          Bulan ini (WIB)
        </Button>
      </PageHead>

      <section aria-label="Angka utama" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-4">
            <p className="text-base text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-[1.75rem] leading-tight font-bold tabular-nums">{k.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{k.note}</p>
          </div>
        ))}
      </section>

      <Section title="Perlu tindakan hari ini">
        <ul className="flex flex-wrap gap-2">
          <li><Button variant="outline" render={<a href={href("/kiriman")} />} nativeButton={false}>18 siap pickup · J&T 16.00</Button></li>
          <li><Button variant="outline" render={<a href={href("/kiriman")} />} nativeButton={false}>2 tidak bergerak &gt; 48 jam</Button></li>
          <li><Button variant="outline" render={<a href={href("/kiriman")} />} nativeButton={false}>2 paket di Meja Retur</Button></li>
          <li><Button variant="outline" render={<a href={href("/kiriman")} />} nativeButton={false}>1 menunggu saldo</Button></li>
        </ul>
      </Section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Section title="Performa ekspedisi" aside={<span className="text-sm text-muted-foreground">Bulan ini</span>}>
          <div className="-mx-4 overflow-x-auto px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ekspedisi</TableHead>
                <TableHead className="text-right">Paket</TableHead>
                <TableHead className="text-right">Laba</TableHead>
                <TableHead className="text-right">Retur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {couriers.map((c) => (
                <TableRow key={c.name}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{rupiah(c.profit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.rts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Section>
        <Section title="Pengirim teratas">
          <ol className="flex flex-col divide-y">
            {[["Toko Hijab Nisa", 94], ["Kopi Gunung Bandung", 61], ["Bpk Hendra Wijaya", 29]].map(([n, c], i) => (
              <li key={n} className="flex items-center justify-between py-3">
                <span>{i + 1}. {n}</span>
                <span className="tabular-nums text-muted-foreground">{c} paket</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  )
}

function KasirHome({ href }: { href: (p: string) => string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Tugas Loket Hari Ini" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-muted-foreground">Shift aktif</p>
          <p className="mt-1 text-xl font-semibold">Pagi · dibuka 08.00</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-muted-foreground">Siap pickup</p>
          <p className="mt-1 text-xl font-semibold">18 paket · J&T jam 16.00</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-muted-foreground">Meja Retur</p>
          <p className="mt-1 text-xl font-semibold">2 paket belum diambil</p>
        </div>
      </div>
      <Section title="Kiriman terakhir" aside={<a className="text-primary underline-offset-4 hover:underline" href={href("/kiriman")}>Lihat semua</a>}>
        <ul className="flex flex-col divide-y">
          {shipments.slice(0, 4).map((s) => (
            <li key={s.inv} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="font-mono font-medium">INV {s.inv}</span>
              <span>{s.courier} · {s.recipient}</span>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
