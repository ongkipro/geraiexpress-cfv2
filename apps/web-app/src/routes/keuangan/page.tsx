import { useCallback, useEffect, useState } from "react"
import { Link, useSearch } from "@tanstack/react-router"
import { RefreshCwIcon } from "lucide-react"
import { Button } from "../../components/ui/button"
import { api, ApiError } from "../../lib/api"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { rp } from "../kasir/quote-panel"

// `Keuangan` (visual 06 §3, visual 07 `/keuangan`, spec 09; owner only — the API refuses Kasir): synced balance,
// Saldo Aman, COD waiting, counter cash → tabs Ringkasan · Mutasi Sync · Laba per INV · Kas & Shift · Selisih Sync.
interface Summary {
  balance: number | null
  safeBalance: number | null
  reserve: number
  codWaiting: { count: number; amount: number }
  counterToday: { tunai: number; qris: number; transfer: number }
  unpaidHold: { count: number; amount: number }
  payableToSenders: number
  estimated_margin_idr: number
  cash_profit_idr: number
  lastSync: { at: number | null; status: string | null; error: string | null }
}
interface Mutation { invoice_id: string; inv_number: string | null; type: string; status: string | null; amount_idr: number | null; balance_amount_idr: number | null; provider_created_at: number | null; description: string | null; link_state: string; slugs: string | null }
interface Profit { slug: string; issued_at: number; cod_fee_mode: string; estimated_margin_idr: number | null; cash_profit_idr: number | null; reconciled: boolean; quote_drift: number }
interface Discrepancy { id: string; kind: string; invoice_id: string; shipment_slug: string | null; expected_idr: number | null; actual_idr: number | null; detail: string | null; created_at: number }
interface Shift { id: string; opened_at: number; closed_at: number | null; variance_idr: number | null; expected_cash_idr: number | null; counted_cash_idr: number | null; state: string }
interface Finance { summary: Summary; mutations: Mutation[]; profits: Profit[]; discrepancies: Discrepancy[]; shifts: Shift[] }

const TABS = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "mutasi", label: "Mutasi Sync" },
  { id: "laba", label: "Laba per INV" },
  { id: "kas", label: "Kas & Shift" },
  { id: "selisih", label: "Selisih Sync" },
] as const
type Tab = (typeof TABS)[number]["id"]
const TYPE_LABEL: Record<string, string> = { typeAddBalance: "Top-up saldo", typePayment: "Pembayaran", typeReconciliation: "COD cair", typeRefund: "Klaim disetujui", typeWithdraw: "Penarikan ke bank" }
const KIND_LABEL: Record<string, string> = { unknown_type: "Tipe belum dikenali", unmatched: "Tidak cocok dengan INV", cod_credit_differs: "COD cair berbeda", debit_differs: "Potongan berbeda", adjustment: "Penyesuaian berat/tujuan", balance_gap: "Saldo berjalan tidak cocok" }
const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms) : "—")
const ago = (ms: number | null) => {
  if (!ms) return "belum pernah"
  const m = Math.round((Date.now() - ms) / 60_000)
  return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : `${Math.round(m / 60)} jam lalu`
}

export function KeuanganPage() {
  const search = useSearch({ strict: false }) as { tab?: Tab }
  const tab: Tab = search.tab ?? "ringkasan"
  const [d, setD] = useState<Finance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const load = useCallback(() => {
    api<Finance>("/finance")
      .then((x) => {
        setError(null)
        setD(x)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Keuangan tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  async function sync() {
    setSyncing(true)
    setMsg(null)
    try {
      const r = await api<{ rows: number; newRows: number; error: string | null }>("/finance/sync", { body: {} })
      setMsg(r.error ? { tone: "danger", text: "Mengantar belum bisa dihubungi. Coba lagi sebentar lagi." } : { tone: "safe", text: `Sinkron selesai: ${r.newRows} mutasi baru.` })
      load()
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.body.message : "Sinkronisasi gagal." })
    } finally {
      setSyncing(false)
    }
  }
  const header = (
    <PageTitle title="Keuangan" description={d ? `Sync terakhir: ${ago(d.summary.lastSync.at)}${d.summary.lastSync.status === "error" ? " (gagal)" : ""}` : undefined}>
      <Button onClick={sync} disabled={syncing}><RefreshCwIcon aria-hidden className={syncing ? "animate-spin" : ""} /> {syncing ? "Menyinkronkan…" : "Sinkronkan Sekarang"}</Button>
    </PageTitle>
  )
  if (error) return <div>{header}<ErrorState message={error} onRetry={load} /></div>
  if (!d) return <div>{header}<LoadingState label="Memuat keuangan" rows={4} /></div>
  const s = d.summary
  return (
    <div className="min-w-0 pb-24 md:pb-0">
      {header}
      {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={`mb-4 border-l-4 py-1 pl-3 text-base font-medium ${msg.tone === "danger" ? "border-danger text-danger" : "border-safe text-safe"}`}>{msg.text}</p> : null}
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Saldo Mengantar (sync)" value={s.balance === null ? "Belum tersinkron" : rp(s.balance)} sub="Top-up dilakukan di aplikasi Mengantar" />
        <Card label="Saldo aman tersedia" value={s.safeBalance === null ? "—" : rp(s.safeBalance)} sub={`Cadangan retur ${rp(s.reserve)}`} />
        <Card label="COD menunggu cair" value={rp(s.codWaiting.amount)} sub={`${s.codWaiting.count} INV`} />
        <Card label="Kas loket hari ini" value={rp(s.counterToday.tunai + s.counterToday.qris + s.counterToday.transfer)} sub={`Tunai ${rp(s.counterToday.tunai)} · QRIS ${rp(s.counterToday.qris)} · Transfer ${rp(s.counterToday.transfer)}`} />
      </dl>
      {s.unpaidHold.count ? (
        <p className="mt-4 border-l-4 border-warn py-1 pl-3 text-base font-medium">{s.unpaidHold.count} kiriman ({rp(s.unpaidHold.amount)}) menunggu saldo Mengantar. Top-up saldo, lalu buka INV-nya dan pilih Bayar Batch.</p>
      ) : null}
      <nav aria-label="Bagian keuangan" className="-mx-4 my-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link to="/keuangan" search={{ tab: t.id === "ringkasan" ? undefined : t.id } as never} aria-current={t.id === tab ? "page" : undefined} className={`flex h-11 items-center gap-2 rounded-md px-4 text-base md:h-10 ${t.id === tab ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
                {t.label}{t.id === "selisih" && d.discrepancies.length ? <span className="tabular-nums text-danger">({d.discrepancies.length})</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "ringkasan" ? (
        <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3 md:p-6" aria-label="Ringkasan laba">
          <div><p className="text-base text-muted-foreground">Estimasi Laba</p><p className="text-2xl font-semibold tabular-nums">{rp(s.estimated_margin_idr)}</p><p className="text-base text-muted-foreground">Dari selisih tarif saat resi terbit (30 hari)</p></div>
          <div><p className="text-base text-muted-foreground">Laba Kas</p><p className="text-2xl font-semibold tabular-nums">{rp(s.cash_profit_idr)}</p><p className="text-base text-muted-foreground">Sudah lunas dan cocok dengan Mengantar (30 hari)</p></div>
          <div><p className="text-base text-muted-foreground">Hutang COD ke pengirim</p><p className="text-2xl font-semibold tabular-nums">{rp(s.payableToSenders)}</p><p className="text-base text-muted-foreground">Belum dibayarkan ke pengirim</p></div>
        </section>
      ) : null}
      {tab === "mutasi" ? <Mutations rows={d.mutations} /> : null}
      {tab === "laba" ? <Profits rows={d.profits} /> : null}
      {tab === "kas" ? <Shifts rows={d.shifts} /> : null}
      {tab === "selisih" ? <Discrepancies rows={d.discrepancies} /> : null}
    </div>
  )
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4 md:p-6">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-base text-muted-foreground tabular-nums">{sub}</dd>
    </div>
  )
}

function Mutations({ rows }: { rows: Mutation[] }) {
  if (!rows.length) return <EmptyState title="Belum ada mutasi" body="Tekan Sinkronkan Sekarang untuk menarik mutasi saldo dari Mengantar." />
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((m) => (
        <li key={m.invoice_id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-base">
          <span className="min-w-0">
            <span className="font-medium">{TYPE_LABEL[m.type] ?? `Tipe lain (${m.type})`}</span>{m.status && m.status !== "statusCleared" ? <span className="text-muted-foreground"> · {m.status === "statusPending" ? "menunggu" : m.status === "statusExpired" ? "kedaluwarsa" : m.status}</span> : null}
            <span className="block text-muted-foreground tabular-nums">{when(m.provider_created_at)} · {m.inv_number ?? m.invoice_id}{m.slugs ? ` · INV ${m.slugs.toUpperCase()}` : ""}{m.link_state === "unlinked" || m.link_state === "partial" ? " · belum cocok semua" : ""}</span>
          </span>
          <span className="text-right tabular-nums">
            <span className={(m.amount_idr ?? 0) < 0 ? "font-medium" : "font-medium text-safe"}>{m.amount_idr === null ? "—" : `${m.amount_idr > 0 ? "+" : ""}${rp(m.amount_idr)}`}</span>
            <span className="block text-muted-foreground">Saldo {m.balance_amount_idr === null ? "—" : rp(m.balance_amount_idr)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Profits({ rows }: { rows: Profit[] }) {
  if (!rows.length) return <EmptyState title="Belum ada kiriman" body="Laba per INV muncul setelah resi terbit." />
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((p) => (
        <li key={p.slug} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-base">
          <span><Link to="/kiriman/$slug" params={{ slug: p.slug }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {p.slug.toUpperCase()}</Link> <span className="text-muted-foreground">· {when(p.issued_at)}{p.quote_drift ? " · berbeda dari perkiraan" : ""}</span></span>
          <span className="tabular-nums">Estimasi {rp(p.estimated_margin_idr ?? 0)} · Laba Kas {p.reconciled && p.cash_profit_idr !== null ? rp(p.cash_profit_idr) : <span className="text-muted-foreground">menunggu</span>}</span>
        </li>
      ))}
    </ul>
  )
}

function Shifts({ rows }: { rows: Shift[] }) {
  if (!rows.length) return <EmptyState title="Belum ada shift" body="Shift Loket yang dibuka kasir akan muncul di sini." />
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((x) => (
        <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-base tabular-nums">
          <span>{when(x.opened_at)} → {x.closed_at ? when(x.closed_at) : "masih buka"}</span>
          <span>{x.state === "closed" ? `Seharusnya ${rp(x.expected_cash_idr ?? 0)} · dihitung ${rp(x.counted_cash_idr ?? 0)}` : ""}{x.variance_idr ? <span className="font-medium text-danger"> · selisih {rp(Math.abs(x.variance_idr))} ({x.variance_idr > 0 ? "lebih" : "kurang"})</span> : null}</span>
        </li>
      ))}
    </ul>
  )
}

function Discrepancies({ rows }: { rows: Discrepancy[] }) {
  if (!rows.length) return <EmptyState title="Tidak ada selisih" body="Semua mutasi Mengantar cocok dengan kiriman gerai." />
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((x) => (
        <li key={x.id} className="flex flex-col gap-1 px-4 py-3 text-base">
          <span className="font-medium">{KIND_LABEL[x.kind] ?? x.kind}{x.shipment_slug && !x.shipment_slug.startsWith("#") ? <> · <Link to="/kiriman/$slug" params={{ slug: x.shipment_slug }} className="text-primary underline-offset-4 hover:underline tabular-nums">INV {x.shipment_slug.toUpperCase()}</Link></> : null}</span>
          <span className="text-muted-foreground">{x.detail}{x.expected_idr !== null || x.actual_idr !== null ? ` · perkiraan ${x.expected_idr === null ? "—" : rp(x.expected_idr)}, tercatat ${x.actual_idr === null ? "—" : rp(x.actual_idr)}` : ""} · {when(x.created_at)}</span>
        </li>
      ))}
    </ul>
  )
}
