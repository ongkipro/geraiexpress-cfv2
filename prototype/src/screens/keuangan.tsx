import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ledger, rupiah } from "@/data"
import { PageHead } from "./shared"

const cards = [
  { label: "Saldo Mengantar", value: rupiah(915000), note: "Sinkron 2 menit lalu" },
  { label: "Saldo aman dipakai", value: rupiah(840000), note: "Cadangan 3 paket retur Rp75.000" },
  { label: "COD menunggu cair", value: rupiah(4850000), note: "31 resi · perkiraan bersih Rp4,41 jt" },
  { label: "Kas fisik hari ini", value: rupiah(1102000), note: "Tunai Rp762.000 · QRIS Rp340.000" },
]

export function Keuangan() {
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Keuangan">
        <Button>Sinkronkan Sekarang</Button>
      </PageHead>
      <section aria-label="Saldo" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-4">
            <p className="text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-[1.75rem] leading-tight font-bold tabular-nums">{c.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{c.note}</p>
          </div>
        ))}
      </section>
      <div role="status" className="rounded-lg border border-warn bg-warn-bg p-4 text-warn">
        <strong className="font-semibold">1 kiriman menunggu saldo Mengantar</strong> · INV 5N7R3V4 · {rupiah(15200)}. Isi saldo di Mengantar lalu bayar batch.
      </div>
      <Tabs defaultValue="mutasi">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList variant="line">
            {["Ringkasan & Saldo", "Mutasi Sync Mengantar", "Laba per INV", "Kas Loket & Shift", "Cadangan Retur", "Selisih Sync"].map((t, i) => (
              <TabsTrigger key={t} value={i === 1 ? "mutasi" : t}>{t}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu & nomor</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Terkait</TableHead>
              <TableHead className="text-right">Mutasi</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.map((l) => (
              <TableRow key={l.inv}>
                <TableCell>
                  <div>{l.when}</div>
                  <div className="font-mono text-sm text-muted-foreground">{l.inv}</div>
                </TableCell>
                <TableCell>{l.type}</TableCell>
                <TableCell>{l.ref}</TableCell>
                <TableCell className="text-right tabular-nums">{l.amount < 0 ? "−" : "+"}{rupiah(Math.abs(l.amount))}</TableCell>
                <TableCell className="text-right tabular-nums">{rupiah(l.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
