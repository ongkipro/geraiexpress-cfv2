import { statusLabel } from "../../lib/status"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react"
import { paramsOf, periodFromParams, previousOf, rangeLabel, type Period } from "@gx/domain/period"
import { PeriodFilter } from "../../components/period-filter/period-filter"
import { api, ApiError } from "../../lib/api"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { rp } from "../kasir/quote-panel"

// Dashboard (PR-18, DEC-213/221, visual 07 `/`, visual 02 §1): owner = period filter → 4 KPI (kiriman, tercatat
// dibayar, belum dibayar, saldo Mengantar aman) + Estimasi Laba / Laba Kas apart → stacked Non-COD/COD chart →
// riwayat → courier performance + Perlu tindakan. Kasir = `Tugas Loket Hari Ini` without money.
interface OwnerData {
  kpi: {
    shipments: number
    shipmentsPrev: number
    nonCod: number
    cod: number
    paidIdr: number
    paidPrevIdr: number
    paidByMethod: { qris: number; tunai: number; transfer: number; deposit: number }
    unpaidCount: number
    unpaidIdr: number
    estimated_margin_idr: number
    cash_profit_idr: number
    cashProfitPending: number
    balance: { synced_balance_idr: number | null; reserve_idr: number; safe_balance_idr: number | null; reserveCount: number; syncedAt: number | null }
  }
  chart: Array<{ bucket: string; nonCod: number; cod: number }>
  recent: Array<{ slug: string; courier: string; recipient: string | null; due: number; payment: string; method: string | null; status: string; at: number }>
  couriers: Array<{ courier: string; shipments: number; delivered: number; rts: number; estimated_margin_idr: number }>
  topSenders: Array<{ id: string; name: string; reseller: boolean; shipments: number }>
  sources: Array<{ channel: string; shipments: number }>
  actions: { unpaid: number; unpaidHold: number; stuck: number; failed: number; variance: number; readyForPickup: number }
}
interface CounterData {
  shift: { id: string; opened_at: number } | null
  today: { shipments: number; unpaid: number }
  actions: { unpaid: number; unpaidHold: number; failed: number; readyForPickup: number }
  drafts: Array<{ slug: string; recipient: string | null; created_at: number }>
}
type Resp = { kind: "owner"; data: OwnerData; period: Period } | { kind: "counter"; data: CounterData; period: Period }

const nf = new Intl.NumberFormat("id-ID")
const short = (n: number) => (Math.abs(n) >= 1_000_000 ? `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt` : rp(n))
const METHOD: Record<string, string> = { qris: "QRIS", tunai: "Tunai", transfer: "Transfer", deposit: "Deposit" }
const CHANNEL: Record<string, string> = { counter_pos: "Input di loket", counter_multi: "Paket Massal", minisite_qr: "QR dari mini-site", api_mcp: "API" }

export function DashboardPage() {
  const w = useWorkspace()
  return isOwner(w) ? <OwnerDashboard /> : <CounterHome name={w.user.name} />
}

function useDashboard(params: Record<string, string>) {
  const [data, setData] = useState<Resp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const qs = new URLSearchParams(params).toString()
  const load = useCallback(() => {
    api<Resp>(`/dashboard${qs ? `?${qs}` : ""}`)
      .then((r) => {
        setError(null)
        setData(r)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Dashboard tidak dapat dimuat."))
  }, [qs])
  useEffect(load, [load])
  return { data, error, load }
}

function OwnerDashboard() {
  const search = useSearch({ strict: false }) as { periode?: string; dari?: string; sampai?: string }
  const navigate = useNavigate()
  // The WIB "today" is read once per mount (a dashboard open across midnight keeps its range until reload).
  const [mountedAt] = useState(() => Date.now())
  const period = useMemo(() => periodFromParams(search, mountedAt), [search, mountedAt])
  const { data, error, load } = useDashboard(paramsOf(period))
  const setPeriod = (p: Period) => void navigate({ to: "/", search: paramsOf(p) as never })
  const header = (
    <PageTitle title="Dashboard">
      <PeriodFilter value={period} onChange={setPeriod} />
    </PageTitle>
  )
  if (error) return <div>{header}<ErrorState message={error} onRetry={load} /></div>
  if (!data || data.kind !== "owner") return <div>{header}<LoadingState label="Memuat dashboard" rows={4} /></div>
  const d = data.data
  const k = d.kpi
  const prev = previousOf(period)
  const vs = `vs ${rangeLabel(prev)}`
  return (
    <div className="pb-24 md:pb-0">
      {header}
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Kiriman" value={`${nf.format(k.shipments)} paket`} delta={pct(k.shipments, k.shipmentsPrev)} vs={vs} sub={`Non-COD ${nf.format(k.nonCod)} · COD ${nf.format(k.cod)}`} />
        <Kpi label="Tercatat dibayar" value={short(k.paidIdr)} delta={pct(k.paidIdr, k.paidPrevIdr)} vs={vs} sub={`Tunai ${short(k.paidByMethod.tunai)} · QRIS ${short(k.paidByMethod.qris)} · Transfer ${short(k.paidByMethod.transfer)}`} />
        <Kpi label="Belum dibayar" value={short(k.unpaidIdr)} sub={`${nf.format(k.unpaidCount)} INV`} to={k.unpaidCount ? "/kiriman" : undefined} tone={k.unpaidCount ? "warn" : undefined} />
        <Kpi label="Saldo Mengantar aman" value={k.balance.safe_balance_idr === null ? "Belum tersinkron" : short(k.balance.safe_balance_idr)} sub={k.balance.synced_balance_idr === null ? "Sinkron saldo aktif setelah Keuangan tersambung" : `Saldo ${short(k.balance.synced_balance_idr)} − cadangan retur ${short(k.balance.reserve_idr)}`} />
      </dl>
      <section aria-labelledby="laba" className="mt-4 grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 md:p-6">
        <h3 id="laba" className="sr-only">Laba</h3>
        <div><p className="text-base text-muted-foreground">Estimasi Laba</p><p className="text-2xl font-semibold tabular-nums">{short(k.estimated_margin_idr)}</p><p className="text-base text-muted-foreground">Dari selisih tarif saat resi terbit</p></div>
        <div><p className="text-base text-muted-foreground">Laba Kas</p><p className="text-2xl font-semibold tabular-nums">{short(k.cash_profit_idr)}</p><p className="text-base text-muted-foreground">{k.cashProfitPending ? `${nf.format(k.cashProfitPending)} INV menunggu rekonsiliasi Mengantar` : "Sudah lunas dan cocok dengan Mengantar"}</p></div>
      </section>
      <Actions a={d.actions} />
      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <section className="rounded-lg border bg-card p-4 md:p-6 xl:col-span-3" aria-labelledby="grafik">
          <Chart period={period} rows={d.chart} />
        </section>
        <section className="rounded-lg border bg-card p-4 md:p-6 xl:col-span-2" aria-labelledby="kurir">
          <h3 id="kurir" className="mb-3 text-lg font-semibold">Performa ekspedisi</h3>
          {d.couriers.length === 0 ? <p className="text-base text-muted-foreground">Belum ada kiriman di periode ini.</p> : (
            <table className="w-full text-base tabular-nums">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 font-medium">Kurir</th><th className="py-2 text-right font-medium">Paket</th><th className="py-2 text-right font-medium">Laba</th><th className="py-2 text-right font-medium">Retur</th></tr></thead>
              <tbody className="divide-y">
                {d.couriers.map((c) => (
                  <tr key={c.courier}><td className="py-2">{c.courier}</td><td className="py-2 text-right">{nf.format(c.shipments)}</td><td className="py-2 text-right">{short(c.estimated_margin_idr)}</td><td className="py-2 text-right">{c.shipments ? `${((c.rts / c.shipments) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <section className="mt-6 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="riwayat">
        <h3 id="riwayat" className="mb-3 text-lg font-semibold">Riwayat pengiriman</h3>
        {d.recent.length === 0 ? (
          <EmptyState title="Belum ada kiriman" body="Kiriman yang resinya sudah terbit di periode ini akan muncul di sini." action={<Link to="/kasir" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground md:h-10">Buat Pengiriman</Link>} />
        ) : (
          <ul className="divide-y">
            {d.recent.map((r) => (
              <li key={r.slug}>
                <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-base hover:bg-muted">
                  <span><span className="font-medium text-primary tabular-nums">INV {r.slug.toUpperCase()}</span> · {r.courier} · {r.recipient ?? "—"}</span>
                  <span className="tabular-nums">{rp(r.due)} · <span className={r.payment === "unpaid" ? "font-medium text-warn" : "text-muted-foreground"}>{r.payment === "paid" ? `Lunas · ${METHOD[r.method ?? ""] ?? r.method}` : r.payment === "unpaid" ? "Belum dibayar" : "Tanpa tagihan"}</span> · {statusLabel(r.status)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border bg-card p-4 md:p-6" aria-labelledby="top">
          <h3 id="top" className="mb-3 text-lg font-semibold">Pengirim teratas</h3>
          {d.topSenders.length === 0 ? <p className="text-base text-muted-foreground">Belum ada data.</p> : (
            <ol className="flex flex-col gap-2 text-base">
              {d.topSenders.map((s, i) => <li key={s.id} className="flex justify-between gap-2"><span>{i + 1}. {s.name}{s.reseller ? " · reseller" : ""}</span><span className="tabular-nums">{nf.format(s.shipments)} paket</span></li>)}
            </ol>
          )}
        </section>
        <section className="rounded-lg border bg-card p-4 md:p-6" aria-labelledby="sumber">
          <h3 id="sumber" className="mb-3 text-lg font-semibold">Sumber order</h3>
          {d.sources.length === 0 ? <p className="text-base text-muted-foreground">Belum ada data.</p> : (
            <ul className="flex flex-col gap-2 text-base">
              {d.sources.map((s) => <li key={s.channel} className="flex justify-between gap-2"><span>{CHANNEL[s.channel] ?? s.channel}</span><span className="tabular-nums">{Math.round((s.shipments / Math.max(1, k.shipments)) * 100)}%</span></li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100))

function Kpi({ label, value, sub, delta, vs, to, tone }: { label: string; value: string; sub?: string; delta?: number | null; vs?: string; to?: string; tone?: "warn" }) {
  const body = (
    <>
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : ""}`}>{value}</dd>
      {delta !== undefined && delta !== null ? (
        <dd className="flex items-center gap-1 text-base tabular-nums">
          {delta >= 0 ? <ArrowUpRightIcon aria-hidden className="size-4 text-safe" /> : <ArrowDownRightIcon aria-hidden className="size-4 text-danger" />}
          <span className={delta >= 0 ? "text-safe" : "text-danger"}>{delta > 0 ? "+" : ""}{delta}%</span> <span className="text-muted-foreground">{vs}</span>
        </dd>
      ) : null}
      {sub ? <dd className="text-base text-muted-foreground tabular-nums">{sub}</dd> : null}
    </>
  )
  return to ? (
    <Link to={to} className="flex flex-col gap-1 rounded-lg border bg-card p-4 hover:bg-muted md:p-6">{body}</Link>
  ) : (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4 md:p-6">{body}</div>
  )
}

function Actions({ a }: { a: OwnerData["actions"] }) {
  const items = ([
    { n: a.unpaid, label: "INV belum dibayar", to: "/kiriman", tone: "warn" },
    { n: a.unpaidHold, label: "Menunggu saldo Mengantar", to: "/kiriman", tone: "danger" },
    { n: a.failed, label: "Gagal diterbitkan", to: "/kiriman", tone: "danger" },
    { n: a.stuck, label: "Tertahan > 48 jam", to: "/kiriman", tone: "warn" },
    { n: a.variance, label: "Selisih kas shift (7 hari)", to: "/kasir/shift", tone: "danger" },
    { n: a.readyForPickup, label: "Siap dijemput kurir", to: "/kiriman", tone: "warn" },
  ] satisfies Array<{ n: number; label: string; to: string; tone: "warn" | "danger" }>).filter((x) => x.n > 0)
  return (
    <section className="mt-6 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="tindakan">
      <h3 id="tindakan" className="mb-3 text-lg font-semibold">Perlu tindakan</h3>
      {items.length === 0 ? <p className="text-base text-muted-foreground">Tidak ada yang perlu ditindaklanjuti sekarang.</p> : (
        <ul className="flex flex-wrap gap-2">
          {items.map((x) => (
            <li key={x.label}><Link to={x.to} className={`inline-flex h-11 items-center gap-2 rounded-lg border-l-4 bg-muted px-4 text-base font-medium md:h-10 ${x.tone === "danger" ? "border-danger" : "border-warn"}`}><span className="tabular-nums">{nf.format(x.n)}</span> {x.label}</Link></li>
          ))}
        </ul>
      )}
    </section>
  )
}

function bucketLabel(p: Period, b: string): string {
  if (p.granularity === "hour") return `${b.slice(11, 13)}.00`
  const [, m, d] = b.split("-")
  return `${Number(d)}/${Number(m)}`
}

function Chart({ period, rows }: { period: Period; rows: OwnerData["chart"] }) {
  const max = Math.max(1, ...rows.map((r) => r.nonCod + r.cod))
  const total = rows.reduce((a, r) => a + r.nonCod + r.cod, 0)
  const unit = period.granularity === "hour" ? "per jam" : period.granularity === "day" ? "per hari" : "per minggu"
  return (
    <figure>
      <h3 id="grafik" className="text-lg font-semibold">Grafik pengiriman</h3>
      <figcaption className="mb-3 text-base text-muted-foreground">{nf.format(total)} paket · {unit} · {rangeLabel(period)}</figcaption>
      <div className="mb-2 flex gap-4 text-base">
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-sm bg-chart-1" /> Non-COD</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-sm bg-chart-2" /> COD</span>
      </div>
      <ol className="flex h-48 items-end gap-px" aria-label="Jumlah kiriman Non-COD dan COD">
        {rows.map((r) => (
          <li key={r.bucket} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${bucketLabel(period, r.bucket)}: Non-COD ${r.nonCod}, COD ${r.cod}`}>
            <span className="sr-only">{`${bucketLabel(period, r.bucket)}: Non-COD ${r.nonCod}, COD ${r.cod}`}</span>
            <span aria-hidden className="block bg-chart-2" style={{ height: `${(r.cod / max) * 100}%` }} />
            <span aria-hidden className="block rounded-b-none bg-chart-1" style={{ height: `${(r.nonCod / max) * 100}%`, minHeight: r.nonCod + r.cod === 0 ? 2 : undefined }} />
          </li>
        ))}
      </ol>
      <div className="mt-2 flex justify-between text-base text-muted-foreground tabular-nums">
        <span>{rows[0] ? bucketLabel(period, rows[0].bucket) : ""}</span>
        <span>{rows.at(-1) ? bucketLabel(period, rows.at(-1)!.bucket) : ""}</span>
      </div>
    </figure>
  )
}

function CounterHome({ name }: { name: string }) {
  const { data, error, load } = useDashboard({})
  if (error) return <div><PageTitle title="Tugas Loket Hari Ini" /><ErrorState message={error} onRetry={load} /></div>
  if (!data || data.kind !== "counter") return <LoadingState label="Memuat tugas loket" />
  const d = data.data
  const tasks: Array<{ n: number; label: string; to: string }> = [
    { n: d.actions.unpaid, label: "INV belum dibayar", to: "/kiriman" },
    { n: d.actions.readyForPickup, label: "Paket siap dijemput kurir", to: "/kiriman" },
    { n: d.actions.unpaidHold, label: "Menunggu saldo Mengantar", to: "/kiriman" },
    { n: d.actions.failed, label: "Gagal diterbitkan", to: "/kiriman" },
  ].filter((x) => x.n > 0)
  return (
    <div className="pb-24 md:pb-0">
      <PageTitle title="Tugas Loket Hari Ini" description={`Halo, ${name}.`} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4 md:p-6">
          <p className="text-base text-muted-foreground">Shift Loket</p>
          <p className="text-xl font-semibold">{d.shift ? "Sedang buka" : "Belum dibuka"}</p>
          <Link to="/kasir/shift" className="text-base text-primary underline-offset-4 hover:underline">{d.shift ? "Lihat laci" : "Buka Shift"}</Link>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4 md:p-6"><p className="text-base text-muted-foreground">Kiriman hari ini</p><p className="text-xl font-semibold tabular-nums">{nf.format(d.today.shipments)} paket</p></div>
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4 md:p-6"><p className="text-base text-muted-foreground">Belum dibayar hari ini</p><p className="text-xl font-semibold tabular-nums">{nf.format(d.today.unpaid)} INV</p></div>
      </div>
      <section className="mt-6 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="tugas">
        <h3 id="tugas" className="mb-3 text-lg font-semibold">Perlu dikerjakan</h3>
        {tasks.length === 0 ? <p className="text-base text-muted-foreground">Semua beres. Mulai kiriman baru dari tombol di bawah.</p> : (
          <ul className="flex flex-wrap gap-2">
            {tasks.map((x) => <li key={x.label}><Link to={x.to} className="inline-flex h-11 items-center gap-2 rounded-lg border-l-4 border-warn bg-muted px-4 text-base font-medium md:h-10"><span className="tabular-nums">{nf.format(x.n)}</span> {x.label}</Link></li>)}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/kasir" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground md:h-10">Buat Pengiriman</Link>
          <Link to="/kasir/cek-resi" className="inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium md:h-10">Cek Resi</Link>
        </div>
      </section>
      {d.drafts.length ? (
        <section className="mt-6 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="draf">
          <h3 id="draf" className="mb-3 text-lg font-semibold">Draf terakhir</h3>
          <ul className="divide-y">
            {d.drafts.map((x) => <li key={x.slug}><Link to="/kiriman/$slug" params={{ slug: x.slug }} className="flex min-h-11 items-center justify-between gap-2 text-base hover:bg-muted"><span className="font-medium text-primary tabular-nums">INV {x.slug.toUpperCase()}</span><span className="text-muted-foreground">{x.recipient ?? "Belum ada penerima"}</span></Link></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
