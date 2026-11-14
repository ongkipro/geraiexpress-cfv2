import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { rupiah, shipments } from "@/data"
import { PageHead, StatusBadge } from "./shared"

const tabs = [
  ["semua", "Semua", 412],
  ["draf", "Draf QR", 5],
  ["saldo", "Menunggu Saldo", 1],
  ["pickup", "Pickup & Manifest", 18],
  ["kendala", "Kendala & Klaim", 3],
  ["retur", "Meja Retur", 2],
] as const

export function Kiriman({ role, href }: { role: "owner" | "kasir"; href: (p: string) => string }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Kiriman">
        <Button variant="outline" render={<a href={href("/kasir")} />} nativeButton={false}>Multi-Paket</Button>
        {role === "owner" ? <Button variant="outline">Ekspor CSV</Button> : null}
      </PageHead>

      <Tabs defaultValue="semua">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList variant="line">
            {tabs.map(([v, l, n]) => (
              <TabsTrigger key={v} value={v}>
                {l} <span className="tabular-nums text-muted-foreground">{n}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="cari-kiriman">Cari kiriman</label>
        <Input id="cari-kiriman" className="max-w-md" placeholder="Cari INV, AWB, nama, atau HP" />
      </div>

      {/* Desktop table */}
      <div className="hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>INV</TableHead>
              <TableHead>Ekspedisi & AWB</TableHead>
              <TableHead>Pengirim → Penerima</TableHead>
              <TableHead className="text-right">Tagihan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead><span className="sr-only">Aksi</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((s) => (
              <TableRow key={s.inv}>
                <TableCell>
                  <div className="font-mono font-medium">{s.inv}</div>
                  <div className="text-sm text-muted-foreground">{s.time}</div>
                </TableCell>
                <TableCell>
                  <div>{s.courier}</div>
                  <div className="font-mono text-sm text-muted-foreground">{s.awb ?? "AWB tertunda"}</div>
                </TableCell>
                <TableCell>
                  <div>{s.sender}{s.masked ? " · dropship" : ""}</div>
                  <div className="text-sm text-muted-foreground">{s.recipient}</div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="tabular-nums">{rupiah(s.total)}</div>
                  <div className="text-sm text-muted-foreground">{s.mode}</div>
                </TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm">{s.status === "menunggu-saldo" ? "Bayar" : "Detail"}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {shipments.map((s) => (
          <li key={s.inv} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold">INV {s.inv}</span>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-2">{s.courier} · {s.recipient}</p>
            <p className="text-muted-foreground">{s.mode} · <span className="tabular-nums">{rupiah(s.total)}</span></p>
          </li>
        ))}
      </ul>
    </div>
  )
}
