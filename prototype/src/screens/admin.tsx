import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHead, Section } from "./shared"

const kpis = [
  { label: "Gerai aktif", value: "48", note: "46 terhubung ke Mengantar" },
  { label: "Kiriman hari ini", value: "1.840", note: "Non-COD 1.120 · COD 720" },
  { label: "Pengajuan baru", value: "3", note: "Menunggu ditinjau" },
  { label: "Relay & sinkron", value: "Sehat", note: "Relay terakhir dicek 1 menit lalu" },
]

export function AdminRingkasan() {
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Ringkasan jaringan" />
      <section aria-label="Angka utama" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-4">
            <p className="text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-[1.75rem] leading-tight font-bold tabular-nums">{k.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{k.note}</p>
          </div>
        ))}
      </section>
      <Section title="Perlu perhatian">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gerai</TableHead>
              <TableHead>Masalah</TableHead>
              <TableHead>Sejak</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow><TableCell>berkahjaya</TableCell><TableCell>1 kiriman menunggu saldo</TableCell><TableCell>13.50</TableCell></TableRow>
            <TableRow><TableCell>kopisuka</TableCell><TableCell>Webhook belum aktif · status dari polling</TableCell><TableCell>Kemarin</TableCell></TableRow>
            <TableRow><TableCell>sinarmas-cell</TableCell><TableCell>Data perusahaan belum lengkap (4 kolom)</TableCell><TableCell>—</TableCell></TableRow>
          </TableBody>
        </Table>
      </Section>
      <p className="text-muted-foreground">Super Admin hanya memantau. Membuat, membayar, atau membatalkan kiriman dilakukan oleh gerai.</p>
    </div>
  )
}
