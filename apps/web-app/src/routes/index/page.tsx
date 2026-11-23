import { courierLabel, statusLabel } from "../../lib/status"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { ArrowRightIcon, BanknoteIcon, ChevronRightIcon, CircleCheckIcon, PackageIcon, ReceiptIcon, TrendingUpIcon, WalletIcon } from "lucide-react"
import { paramsOf, periodFromParams, previousOf, rangeLabel, type Period } from "@gx/domain/period"
import { PeriodFilter } from "../../components/period-filter/period-filter"
import { api, ApiError } from "../../lib/api"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { AdminBarChart } from "../../components/admin/bar-chart"
import { DataTableShell } from "../../components/admin/data-table"
import { EmptyState, ErrorState, LoadingState, MetricCard, MetricGrid, PageHeader, SectionCard, ShareBar, StatusBadge, type StatusTone } from "../../components/admin/page"
import { Badge } from "../../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { rp } from "../kasir/quote-panel"
import { LinkButton } from "../../components/admin/link-button"
import { linkTo } from "../../components/admin/shell"

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
  /** Still served by the API; Shift Loket UI is deferred (DEC-241, TASK-704). */
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
  const [loadedQs, setLoadedQs] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const gen = useRef(0)
  const qs = new URLSearchParams(params).toString()
  const load = useCallback(() => {
    const mine = ++gen.current
    api<Resp>(`/dashboard${qs ? `?${qs}` : ""}`)
      .then((r) => {
        if (mine !== gen.current) return
        setError(null)
        setData(r)
        setLoadedQs(qs)
      })
      .catch((e) => {
        if (mine !== gen.current) return
        setError(e instanceof ApiError ? e.body.message : "Dashboard tidak dapat dimuat.")
        setLoadedQs(qs)
      })
  }, [qs])
  useEffect(load, [load])
  const loading = loadedQs !== qs && !error
  return { data, error, loading, load }
}

function OwnerDashboard() {
  const search = useSearch({ strict: false }) as { periode?: string; dari?: string; sampai?: string }
  const navigate = useNavigate()
  // The WIB "today" is read once per mount (a dashboard open across midnight keeps its range until reload).
  const [mountedAt] = useState(() => Date.now())
  const period = useMemo(() => periodFromParams(search, mountedAt), [search, mountedAt])
  const { data, error, loading, load } = useDashboard(paramsOf(period))
  const setPeriod = (p: Period) => void navigate({ to: "/", search: paramsOf(p) as never })
  const header = (
    <PageHeader title="Dashboard" description={`Periode ${rangeLabel(period)} · WIB${loading && data ? " · Memperbarui…" : ""}`}>
      <PeriodFilter value={period} onChange={setPeriod} />
    </PageHeader>
  )
  if (error) return <div>{header}<ErrorState message={error} onRetry={load} /></div>
  if (!data || data.kind !== "owner") return <div>{header}<LoadingState label="Memuat dashboard" rows={4} /></div>
  const d = data.data
  const k = d.kpi
  const vs = `vs ${rangeLabel(previousOf(period))}`
  const shipTrend = pct(k.shipments, k.shipmentsPrev)
  const paidTrend = pct(k.paidIdr, k.paidPrevIdr)
  const paidFooter = [
    `Tunai ${short(k.paidByMethod.tunai)}`,
    `QRIS ${short(k.paidByMethod.qris)}`,
    `Transfer ${short(k.paidByMethod.transfer)}`,
    ...(k.paidByMethod.deposit ? [`Deposit ${short(k.paidByMethod.deposit)}`] : []),
  ].join(" · ")
  return (
    <div className={`flex flex-col gap-4 md:gap-5 ${loading ? "opacity-75 transition-opacity" : ""}`}>
      {header}
      {/* One KPI strip (TokoPhi money strip): volume, money in, money owed, safe balance and the two profit figures —
          Estimasi Laba and Laba Kas stay two separate tiles, never summed. */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard icon={PackageIcon} label="Kiriman" value={`${nf.format(k.shipments)} paket`} trend={shipTrend === null ? null : { value: shipTrend, label: vs }} footer={`Non-COD ${nf.format(k.nonCod)} · COD ${nf.format(k.cod)}`} />
        <MetricCard icon={BanknoteIcon} label="Tercatat dibayar" value={short(k.paidIdr)} trend={paidTrend === null ? null : { value: paidTrend, label: vs }} footer={paidFooter} />
        <MetricCard icon={ReceiptIcon} label="Belum dibayar" value={short(k.unpaidIdr)} footer={`${nf.format(k.unpaidCount)} INV menunggu pembayaran`} to={k.unpaidCount ? "/kiriman?tab=belum-dibayar" : undefined} tone={k.unpaidCount ? "warn" : undefined} />
        <MetricCard
          icon={WalletIcon}
          label="Saldo Mengantar aman"
          value={k.balance.safe_balance_idr === null ? "Belum sinkron" : short(k.balance.safe_balance_idr)}
          footer={k.balance.synced_balance_idr === null ? "Aktif setelah Keuangan tersambung" : `Saldo ${short(k.balance.synced_balance_idr)} − retur ${short(k.balance.reserve_idr)}`}
        />
        <MetricCard icon={TrendingUpIcon} label="Estimasi Laba" value={short(k.estimated_margin_idr)} footer="Selisih tarif saat resi terbit" />
        <MetricCard icon={CircleCheckIcon} label="Laba Kas" value={short(k.cash_profit_idr)} footer={k.cashProfitPending ? `${nf.format(k.cashProfitPending)} INV belum direkonsiliasi` : "Cocok dengan tagihan Mengantar"} />
      </div>
      <div className="grid gap-4 md:gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <SectionCard
          id="grafik"
          title="Grafik pengiriman"
          description={`${nf.format(d.chart.reduce((a, r) => a + r.nonCod + r.cod, 0))} paket · ${period.granularity === "hour" ? "per jam" : period.granularity === "day" ? "per hari" : "per minggu"}`}
        >
          <AdminBarChart
            data={d.chart}
            xKey="bucket"
            stacked
            series={[
              { key: "nonCod", label: "Non-COD", color: "var(--chart-1)" },
              { key: "cod", label: "COD", color: "var(--chart-2)" },
            ]}
            xLabel={(b) => bucketLabel(period, String(b))}
            caption={`Jumlah kiriman Non-COD dan COD ${rangeLabel(period)}`}
          />
        </SectionCard>
        <Actions a={d.actions} />
      </div>
      <div className="grid gap-4 md:gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <SectionCard
          id="riwayat"
          title="Riwayat pengiriman"
          description="Kiriman terbaru di periode ini"
          action={
            <LinkButton variant="outline" size="sm" to="/kiriman">
              Semua <ArrowRightIcon aria-hidden data-icon="inline-end" />
            </LinkButton>
          }
          flush
        >
          <DataTableShell
            bare
            caption="Riwayat pengiriman"
            rows={d.recent}
            rowKey={(r) => r.slug}
            empty={<EmptyState title="Belum ada kiriman" body="Kiriman yang resinya sudah terbit di periode ini akan muncul di sini." action={<LinkButton to="/kasir">Buat Pengiriman</LinkButton>} />}
            columns={[
              { key: "inv", header: "INV", cell: (r) => <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-medium text-primary tabular-nums underline-offset-4 hover:underline">INV {r.slug.toUpperCase()}</Link> },
              { key: "kurir", header: "Ekspedisi", cell: (r) => courierLabel(r.courier) },
              { key: "penerima", header: "Penerima", cell: (r) => r.recipient ?? "—", wide: true },
              { key: "tagihan", header: "Tagihan", align: "right", cell: (r) => rp(r.due) },
              { key: "bayar", header: "Pembayaran", cell: (r) => <PaymentBadge payment={r.payment} method={r.method} /> },
              { key: "status", header: "Status", cell: (r) => <StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge> },
            ]}
            mobile={(r) => (
              <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="flex flex-col gap-1.5 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-primary tabular-nums">INV {r.slug.toUpperCase()}</span>
                  <span className="tabular-nums">{rp(r.due)}</span>
                </span>
                <span className="text-muted-foreground">{r.courier} · {r.recipient ?? "—"}</span>
                <span className="flex flex-wrap gap-2">
                  <PaymentBadge payment={r.payment} method={r.method} />
                  <StatusBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusBadge>
                </span>
              </Link>
            )}
          />
        </SectionCard>
        <SectionCard id="kurir" title="Performa ekspedisi" description="Paket, laba dan retur per kurir" flush>
          {d.couriers.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground md:px-5">Belum ada kiriman di periode ini.</p>
          ) : (
            <Table>
              <caption className="sr-only">Performa ekspedisi</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 md:pl-5">Kurir</TableHead>
                  <TableHead className="text-right">Paket</TableHead>
                  <TableHead className="text-right">Laba</TableHead>
                  <TableHead className="pr-4 text-right md:pr-5">Retur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.couriers.map((c) => (
                  <TableRow key={c.courier}>
                    <TableCell className="pl-4 font-medium md:pl-6">{c.courier}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(c.shipments)}</TableCell>
                    <TableCell className="text-right tabular-nums">{short(c.estimated_margin_idr)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums md:pr-6">{c.shipments ? `${((c.rts / c.shipments) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <SectionCard id="top" title="Pengirim teratas" description="Berdasarkan jumlah paket di periode ini">
          {d.topSenders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {d.topSenders.map((s, i) => (
                <ShareBar key={s.id} label={`${i + 1}. ${s.name}${s.reseller ? " · reseller" : ""}`} value={s.shipments} total={Math.max(1, d.topSenders[0]!.shipments)} suffix={`${nf.format(s.shipments)} paket`} />
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard id="sumber" title="Sumber order" description="Bagian dari seluruh kiriman periode ini">
          {d.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {d.sources.map((s) => (
                <ShareBar key={s.channel} label={CHANNEL[s.channel] ?? s.channel} value={s.shipments} total={Math.max(1, k.shipments)} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100))

const statusTone = (s: string): StatusTone =>
  ["delivered", "rts_returned_to_sender"].includes(s) ? "safe" : ["undelivery_hold", "lost", "cancelled", "failed"].includes(s) ? "danger" : ["draft", "provider_unpaid_hold"].includes(s) ? "warn" : "primary"

function PaymentBadge({ payment, method }: { payment: string; method: string | null }) {
  if (payment === "paid") {
    const m = method ? METHOD[method] ?? method : null
    return <StatusBadge tone="safe">{m ? `Lunas · ${m}` : "Lunas"}</StatusBadge>
  }
  if (payment === "unpaid") return <StatusBadge tone="warn">Belum dibayar</StatusBadge>
  return <StatusBadge tone="muted">Tanpa tagihan</StatusBadge>
}

/** `Perlu tindakan` (AdsBookCMS "Action needed"): one row per open queue with its count; a quiet line when none. */
function Actions({ a }: { a: OwnerData["actions"] }) {
  const items = ([
    { n: a.unpaid, label: "INV belum dibayar", to: "/kiriman?tab=belum-dibayar", tone: "warn" },
    { n: a.unpaidHold, label: "Menunggu saldo Mengantar", to: "/kiriman?tab=menunggu-saldo", tone: "danger" },
    { n: a.failed, label: "Gagal diterbitkan", to: "/kiriman?tab=kendala", tone: "danger" },
    { n: a.stuck, label: "Tertahan > 48 jam", to: "/kiriman?tab=kendala", tone: "warn" },
    { n: a.variance, label: "Shift dengan selisih kas", to: "/kasir/shift", tone: "danger" },
    { n: a.readyForPickup, label: "Siap dijemput kurir", to: "/kiriman?tab=pickup", tone: "warn" },
  ] satisfies Array<{ n: number; label: string; to: string; tone: StatusTone }>).filter((x) => x.n > 0)
  return (
    <SectionCard id="tindakan" title="Perlu tindakan" description={items.length ? `${nf.format(items.length)} antrean terbuka` : "Semua antrean beres"}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-safe">
          <CircleCheckIcon aria-hidden className="size-4" /> Tidak ada yang perlu ditindaklanjuti sekarang.
        </p>
      ) : (
        <ul className="-mx-2 -my-1 flex flex-col">
          {items.map((x) => (
            <li key={x.label}>
              <Link {...(linkTo(x.to) as { to: string })} className="group flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-10">
                <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${x.tone === "danger" ? "bg-danger" : "bg-warn"}`} />
                <span className="min-w-0 flex-1 truncate text-slate-700">{x.label}</span>
                <span className={`text-base font-semibold tabular-nums ${x.tone === "danger" ? "text-danger" : "text-warn"}`}>{nf.format(x.n)}</span>
                <ChevronRightIcon aria-hidden className="size-4 text-slate-300 group-hover:text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function bucketLabel(p: Period, b: string): string {
  if (p.granularity === "hour") return `${b.slice(11, 13)}.00`
  const [, m, d] = b.split("-")
  return `${Number(d)}/${Number(m)}`
}

function CounterHome({ name }: { name: string }) {
  const { data, error, load } = useDashboard({})
  if (error) return <div><PageHeader title="Tugas Loket Hari Ini" /><ErrorState message={error} onRetry={load} /></div>
  if (!data || data.kind !== "counter") return <LoadingState label="Memuat tugas loket" />
  const d = data.data
  const tasks: Array<{ n: number; label: string; to: string; tone: "warn" | "danger" }> = (
    [
      { n: d.actions.unpaid, label: "INV belum dibayar", to: "/kiriman?tab=belum-dibayar", tone: "warn" },
      { n: d.actions.readyForPickup, label: "Paket siap dijemput kurir", to: "/kiriman?tab=pickup", tone: "warn" },
      { n: d.actions.unpaidHold, label: "Menunggu saldo Mengantar", to: "/kiriman?tab=menunggu-saldo", tone: "danger" },
      { n: d.actions.failed, label: "Gagal diterbitkan", to: "/kiriman?tab=kendala", tone: "danger" },
    ] as const
  ).filter((x) => x.n > 0)
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHeader title="Tugas Loket Hari Ini" description={`Halo, ${name}.`}>
        <LinkButton to="/kasir">Buat Pengiriman</LinkButton>
        <LinkButton variant="outline" to="/kasir/cek-resi">Cek Resi</LinkButton>
      </PageHeader>
      <MetricGrid cols={3}>
        <MetricCard label="Kiriman hari ini" value={`${nf.format(d.today.shipments)} paket`} footer="Semua INV yang dibuat hari ini (WIB)" />
        <MetricCard label="Belum dibayar hari ini" value={`${nf.format(d.today.unpaid)} INV`} footer="Tagih sebelum resi diserahkan" to={d.today.unpaid ? "/kiriman?tab=belum-dibayar" : undefined} tone={d.today.unpaid ? "warn" : undefined} />
        <MetricCard label="Siap dijemput kurir" value={`${nf.format(d.actions.readyForPickup)} paket`} footer="Serahkan lewat Pickup & Surat Jalan" to="/kiriman?tab=pickup" />
      </MetricGrid>
      <SectionCard id="tugas" title="Perlu dikerjakan">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Semua beres. Mulai kiriman baru dari tombol Buat Pengiriman.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tasks.map((x) => (
              <li key={x.label}>
                <LinkButton variant="outline" className="gap-2" {...(linkTo(x.to) as { to: string })}>
                  <span aria-hidden className={`size-2 rounded-full ${x.tone === "danger" ? "bg-danger" : "bg-warn"}`} />
                  <span className="font-semibold tabular-nums">{nf.format(x.n)}</span> {x.label}
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {d.drafts.length ? (
        <SectionCard id="draf" title="Draf terakhir" description="INV yang belum diterbitkan">
          <DataTableShell
            caption="Draf terakhir"
            rows={d.drafts}
            rowKey={(x) => x.slug}
            columns={[
              { key: "inv", header: "INV", cell: (x) => <Link to="/kiriman/$slug" params={{ slug: x.slug }} className="font-medium text-primary tabular-nums underline-offset-4 hover:underline">INV {x.slug.toUpperCase()}</Link> },
              { key: "penerima", header: "Penerima", cell: (x) => x.recipient ?? "Belum ada penerima" },
              { key: "status", header: "Status", cell: () => <Badge variant="outline">Draf</Badge> },
            ]}
          />
        </SectionCard>
      ) : null}
    </div>
  )
}
