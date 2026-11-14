import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { rupiah, senders } from "@/data"
import { PageHead } from "./shared"

export function Pengirim({ role }: { role: "owner" | "kasir" }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Pengirim">
        <Button>Tambah Pengirim</Button>
      </PageHead>
      <label className="sr-only" htmlFor="cari-pengirim">Cari pengirim</label>
      <Input id="cari-pengirim" className="max-w-md" placeholder="Cari nama, toko, atau HP" />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pengirim asli</TableHead>
              <TableHead>Tercetak sebagai</TableHead>
              <TableHead>Preset</TableHead>
              <TableHead className="text-right">Kiriman</TableHead>
              {role === "owner" ? <TableHead className="text-right">Deposit</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {senders.map((s) => (
              <TableRow key={s.name}>
                <TableCell>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {s.phone} · {s.verified ? "WA terverifikasi" : "WA belum diverifikasi"}
                  </div>
                </TableCell>
                <TableCell>{s.brand}</TableCell>
                <TableCell>{s.preset}</TableCell>
                <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                {role === "owner" ? <TableCell className="text-right tabular-nums">{s.deposit ? rupiah(s.deposit) : "–"}</TableCell> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
