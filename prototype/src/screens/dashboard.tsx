import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DateRangeFilter } from "@/components/date-range-filter"
import { daily, rupiah, shipments } from "@/data"
import { DEFAULT_PERIOD, rangeLabel, resolvePeriod, shortDate, type Period } from "@/lib/date-range"
import { PageHead, PaidBadge, Section, StatusBadge } from "./shared"

const chartConfig = {
  nonCod: { label: "Non-COD", color: "var(--chart-1)" },
  cod: { label: "COD", color: "var(--chart-2)" },
} satisfies ChartConfig

const couriers = [
  { name: "J&T EZ", count: 168, profit: 840000, rts: "1,8%" },
  { name: "SiCepat REG", count: 112, profit: 590000, rts: "2,6%" },
  { name: "JNE REG", count: 84, profit: 480000, rts: "1,2%" },
  { name: "Lion Parcel", count: 48, profit: 280500, rts: "6,2%" },
]

// Sample hourly split for "Hari ini" / "Kemarin" (08.00–20.00 counter hours).
const hourly = Array.from({ length: 13 }, (_, i) => ({ date: `${String(8 + i).padStart(2, "0")}.00`, nonCod: [1, 2, 3, 4, 3, 2, 2, 3, 4, 5, 3, 2, 1][i], cod: [0, 1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 1, 0][i] }))

export function Dashboard({ role, href }: { role: "owner" | "kasir"; href: (p: string) => string }) {
  const [period, setPeriod] = React.useState<Period>(DEFAULT_PERIOD)
  if (role === "kasir") return <KasirHome href={href} />

  const r = resolvePeriod(period, new Date("2026-11-14T07:00:00Z"))
  const inRange = daily.filter((d) => d.date >= r.start && d.date <= r.end)
  const rows =
    r.interval === "hour"
      ? hourly
      : r.interval === "day"
        ? inRange.map((d) => ({ ...d, date: shortDate(d.date) }))
        : Array.from({ length: Math.ceil(inRange.length / 7) }, (_, w) => {
            const wk = inRange.slice(w * 7, w * 7 + 7)
            return { date: `mg ${shortDate(wk[0].date)}`, nonCod: wk.reduce((a, d) => a + d.nonCod, 0), cod: wk.reduce((a, d) => a + d.cod, 0) }
          })
  const total = rows.reduce((a, d) => a + d.nonCod + d.cod, 0)
  const cod = rows.reduce((a, d) => a + d.cod, 0)
  const unpaid = shipments.filter((s) => !s.paid)

  const kpis = [
    { label: "Kiriman", value: `${total} paket`, note: `Non-COD ${total - cod} · COD ${cod}` },
    { label: "Tercatat dibayar", value: rupiah(total * 26500), note: "QRIS 58% · Tunai 34% · Transfer 8%" },
    { label: "Belum dibayar", value: rupiah(unpaid.reduce((a, s) => a + s.total, 0)), note: `${unpaid.length} INV · tagih sebelum pickup` },
    { label: "Saldo Mengantar aman", value: rupiah(840000), note: "Rp915.000 dikurangi cadangan 3 retur" },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Ringkasan Gerai">
        <DateRangeFilter value={period} onChange={setPeriod} />
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

      <Section title="Grafik pengiriman" aside={<span className="text-sm text-muted-foreground">{rangeLabel(r.start, r.end)} · per {r.interval === "hour" ? "jam" : r.interval === "day" ? "hari" : "minggu"}</span>}>
        <figure>
          <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
            <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="nonCod" stackId="a" fill="var(--color-nonCod)" isAnimationActive={false} />
              <Bar dataKey="cod" stackId="a" fill="var(--color-cod)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
          <figcaption className="mt-2 text-sm text-muted-foreground">
            {total} paket dalam periode ini, {cod} di antaranya COD. Data contoh.
          </figcaption>
        </figure>
      </Section>

      <Section
        title="Riwayat pengiriman"
        aside={
          <a className="text-primary underline-offset-4 hover:underline" href={href("/kiriman")}>
            Lihat semua
          </a>
        }
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>INV</TableHead>
                <TableHead>Ekspedisi</TableHead>
                <TableHead>Penerima</TableHead>
                <TableHead className="text-right">Tagihan</TableHead>
                <TableHead>Pembayaran</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((s) => (
                <TableRow key={s.inv}>
                  <TableCell>
                    <div className="font-mono font-medium">{s.inv}</div>
                    <div className="text-sm text-muted-foreground">{s.time}</div>
                  </TableCell>
                  <TableCell>{s.courier}</TableCell>
                  <TableCell>{s.recipient}</TableCell>
                  <TableCell className="text-right tabular-nums">{rupiah(s.total)}</TableCell>
                  <TableCell><PaidBadge paid={s.paid} /></TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Section title="Performa ekspedisi" aside={<span className="text-sm text-muted-foreground">{rangeLabel(r.start, r.end)}</span>}>
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
        <Section title="Perlu tindakan">
          <ul className="flex flex-col divide-y">
            <li className="flex items-center justify-between gap-2 py-3"><span>Siap pickup · J&T 16.00</span><Button variant="outline" size="sm" render={<a href={href("/kiriman")} />} nativeButton={false}>18 paket</Button></li>
            <li className="flex items-center justify-between gap-2 py-3"><span>INV belum dibayar</span><Button variant="outline" size="sm" render={<a href={href("/kiriman")} />} nativeButton={false}>{unpaid.length} INV</Button></li>
            <li className="flex items-center justify-between gap-2 py-3"><span>Tidak bergerak &gt; 48 jam</span><Button variant="outline" size="sm" render={<a href={href("/kiriman")} />} nativeButton={false}>2 paket</Button></li>
            <li className="flex items-center justify-between gap-2 py-3"><span>Paket di Meja Retur</span><Button variant="outline" size="sm" render={<a href={href("/kiriman")} />} nativeButton={false}>2 paket</Button></li>
          </ul>
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
          <p className="text-muted-foreground">Belum dibayar</p>
          <p className="mt-1 text-xl font-semibold">1 INV · tagih sebelum pickup</p>
        </div>
      </div>
      <Section title="Kiriman terakhir" aside={<a className="text-primary underline-offset-4 hover:underline" href={href("/kiriman")}>Lihat semua</a>}>
        <ul className="flex flex-col divide-y">
          {shipments.slice(0, 4).map((s) => (
            <li key={s.inv} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="font-mono font-medium">INV {s.inv}</span>
              <span>{s.courier} · {s.recipient}</span>
              <span className="flex gap-2"><PaidBadge paid={s.paid} /><StatusBadge status={s.status} /></span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
