import { useCallback, useEffect, useState } from "react"
import { Link, useSearch } from "@tanstack/react-router"
import { RefreshCwIcon } from "lucide-react"
import { DataTableShell } from "../../components/admin/data-table"
import { CalloutAlert, MetricCard, MetricGrid, SectionCard, StatusBadge } from "../../components/admin/page"
import { Button } from "../../components/ui/button"
import { Field, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { Separator } from "../../components/ui/separator"
import { api, ApiError } from "../../lib/api"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { rp } from "../kasir/quote-panel"
import { LinkButton } from "../../components/admin/link-button"

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
interface Reserve { slug: string; kind: "retur" | "sengketa"; status: string; amount_idr: number }
interface Finance { summary: Summary; mutations: Mutation[]; profits: Profit[]; discrepancies: Discrepancy[]; shifts: Shift[]; reserve: Reserve[] }

const TABS = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "mutasi", label: "Mutasi Sync" },
  { id: "laba", label: "Laba per INV" },
  { id: "kas", label: "Kas & Shift" },
  { id: "cadangan", label: "Cadangan Retur" },
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
    <div className="flex min-w-0 flex-col gap-6">
      {header}
      {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={`-mt-2 text-base md:text-sm font-medium ${msg.tone === "danger" ? "text-danger" : "text-safe"}`}>{msg.text}</p> : null}
      <MetricGrid>
        <MetricCard label="Saldo Mengantar (sync)" value={s.balance === null ? "Belum tersinkron" : rp(s.balance)} footer="Top-up dilakukan di aplikasi Mengantar" />
        <MetricCard label="Saldo aman tersedia" value={s.safeBalance === null ? "—" : rp(s.safeBalance)} footer={`Cadangan retur ${rp(s.reserve)}`} />
        <MetricCard label="COD menunggu cair" value={rp(s.codWaiting.amount)} footer={`${s.codWaiting.count} INV`} />
        <MetricCard label="Kas loket hari ini" value={rp(s.counterToday.tunai + s.counterToday.qris + s.counterToday.transfer)} footer={`Tunai ${rp(s.counterToday.tunai)} · QRIS ${rp(s.counterToday.qris)} · Transfer ${rp(s.counterToday.transfer)}`} />
      </MetricGrid>
      {s.unpaidHold.count ? (
        <CalloutAlert
          title={`${s.unpaidHold.count} kiriman (${rp(s.unpaidHold.amount)}) menunggu saldo Mengantar`}
          action={<LinkButton variant="outline" size="sm" to="/kiriman" search={{ tab: "menunggu-saldo" } as never}>Lihat kiriman</LinkButton>}
        >
          Isi saldo di aplikasi Mengantar, lalu tekan Sinkronkan Sekarang — resinya diterbitkan otomatis.
        </CalloutAlert>
      ) : null}
      <nav aria-label="Bagian keuangan" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-0.5 rounded-lg bg-slate-100/90 p-1">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link to="/keuangan" search={{ tab: t.id === "ringkasan" ? undefined : t.id } as never} aria-current={t.id === tab ? "page" : undefined} className={`flex h-11 items-center gap-1.5 rounded-md px-3 text-base whitespace-nowrap md:h-8 md:text-sm ${t.id === tab ? "bg-white font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]" : "text-muted-foreground hover:text-slate-900"}`}>
                {t.label}{t.id === "selisih" && d.discrepancies.length ? <span className="rounded-full bg-danger-bg px-1.5 text-xs font-semibold text-danger tabular-nums">{d.discrepancies.length}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "ringkasan" ? (
        <SectionCard id="laba" title="Ringkasan laba" description="30 hari terakhir · dua angka laba tidak pernah dijumlahkan">
          <div className="grid gap-5 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <Figure label="Estimasi Laba" value={rp(s.estimated_margin_idr)} note="Dari selisih tarif saat resi terbit" />
            <Separator orientation="vertical" className="hidden sm:block" />
            <Figure label="Laba Kas" value={rp(s.cash_profit_idr)} note="Sudah lunas dan cocok dengan Mengantar" />
            <Separator orientation="vertical" className="hidden sm:block" />
            <Figure label="Hutang COD ke pengirim" value={rp(s.payableToSenders)} note="Belum dibayarkan ke pengirim" />
          </div>
        </SectionCard>
      ) : null}
      {tab === "mutasi" ? <Mutations rows={d.mutations} /> : null}
      {tab === "laba" ? <Profits rows={d.profits} /> : null}
      {tab === "kas" ? <Shifts rows={d.shifts} /> : null}
      {tab === "cadangan" ? <ReserveList rows={d.reserve} /> : null}
      {tab === "selisih" ? <Discrepancies rows={d.discrepancies} /> : null}
    </div>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl leading-none font-bold tracking-[-0.02em] text-slate-950 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

const STATUS_TEXT: Record<string, string> = { statusPending: "Menunggu", statusExpired: "Kedaluwarsa", statusCleared: "Selesai" }

function Mutations({ rows }: { rows: Mutation[] }) {
  return (
    <SectionCard id="mutasi" title="Mutasi Sync" description="Mutasi saldo dari Mengantar, terbaru di atas">
      <DataTableShell
        caption="Mutasi saldo Mengantar"
        rows={rows}
        rowKey={(m) => m.invoice_id}
        empty={<EmptyState title="Belum ada mutasi" body="Tekan Sinkronkan Sekarang untuk menarik mutasi saldo dari Mengantar." />}
        columns={[
          { key: "waktu", header: "Waktu", cell: (m) => <span className="tabular-nums">{when(m.provider_created_at)}</span> },
          { key: "jenis", header: "Jenis", cell: (m) => <span className="font-medium">{TYPE_LABEL[m.type] ?? `Tipe lain (${m.type})`}</span> },
          { key: "ref", header: "Referensi", className: "whitespace-normal", cell: (m) => <span className="tabular-nums">{m.inv_number ?? m.invoice_id}{m.slugs ? ` · INV ${m.slugs.toUpperCase()}` : ""}</span> },
          { key: "status", header: "Status", cell: (m) => <StatusBadge tone={m.link_state === "unlinked" || m.link_state === "partial" ? "warn" : m.status === "statusCleared" || !m.status ? "safe" : "muted"}>{m.link_state === "unlinked" || m.link_state === "partial" ? "Belum cocok semua" : (STATUS_TEXT[m.status ?? "statusCleared"] ?? m.status)}</StatusBadge> },
          { key: "jumlah", header: "Jumlah", align: "right", cell: (m) => <span className={(m.amount_idr ?? 0) > 0 ? "font-medium text-safe" : "font-medium"}>{m.amount_idr === null ? "—" : `${m.amount_idr > 0 ? "+" : ""}${rp(m.amount_idr)}`}</span> },
          { key: "saldo", header: "Saldo", align: "right", wide: true, cell: (m) => (m.balance_amount_idr === null ? "—" : rp(m.balance_amount_idr)) },
        ]}
        mobile={(m) => (
          <div className="flex flex-col gap-1 text-base md:text-sm">
            <span className="flex justify-between gap-2"><span className="font-medium">{TYPE_LABEL[m.type] ?? `Tipe lain (${m.type})`}</span><span className={`tabular-nums ${(m.amount_idr ?? 0) > 0 ? "font-medium text-safe" : "font-medium"}`}>{m.amount_idr === null ? "—" : `${m.amount_idr > 0 ? "+" : ""}${rp(m.amount_idr)}`}</span></span>
            <span className="text-muted-foreground tabular-nums">{when(m.provider_created_at)} · {m.inv_number ?? m.invoice_id}{m.slugs ? ` · INV ${m.slugs.toUpperCase()}` : ""}</span>
            <span className="text-muted-foreground tabular-nums">Saldo {m.balance_amount_idr === null ? "—" : rp(m.balance_amount_idr)}{m.link_state === "unlinked" || m.link_state === "partial" ? " · belum cocok semua" : ""}</span>
          </div>
        )}
      />
    </SectionCard>
  )
}

function Profits({ rows }: { rows: Profit[] }) {
  return (
    <SectionCard id="laba-inv" title="Laba per INV" description="Estimasi saat resi terbit dan Laba Kas setelah cocok dengan Mengantar">
      <DataTableShell
        caption="Laba per INV"
        rows={rows}
        rowKey={(p) => p.slug}
        empty={<EmptyState title="Belum ada kiriman" body="Laba per INV muncul setelah resi terbit." />}
        columns={[
          { key: "inv", header: "INV", cell: (p) => <Link to="/kiriman/$slug" params={{ slug: p.slug }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {p.slug.toUpperCase()}</Link> },
          { key: "terbit", header: "Terbit", cell: (p) => <span className="tabular-nums">{when(p.issued_at)}</span> },
          { key: "estimasi", header: "Estimasi", align: "right", cell: (p) => rp(p.estimated_margin_idr ?? 0) },
          { key: "kas", header: "Laba Kas", align: "right", cell: (p) => (p.reconciled && p.cash_profit_idr !== null ? rp(p.cash_profit_idr) : <span className="text-muted-foreground">menunggu</span>) },
          { key: "catatan", header: "Catatan", wide: true, cell: (p) => (p.quote_drift ? <StatusBadge tone="warn">Berbeda dari perkiraan</StatusBadge> : <span className="text-muted-foreground">—</span>) },
        ]}
      />
    </SectionCard>
  )
}

function Shifts({ rows }: { rows: Shift[] }) {
  return (
    <SectionCard id="kas" title="Kas & Shift" description="Shift Loket kasir dan selisih laci">
      <DataTableShell
        caption="Shift loket"
        rows={rows}
        rowKey={(x) => x.id}
        empty={<EmptyState title="Belum ada shift" body="Shift Loket yang dibuka kasir akan muncul di sini." />}
        columns={[
          { key: "buka", header: "Dibuka", cell: (x) => <span className="tabular-nums">{when(x.opened_at)}</span> },
          { key: "tutup", header: "Ditutup", cell: (x) => (x.closed_at ? <span className="tabular-nums">{when(x.closed_at)}</span> : <StatusBadge tone="primary">Masih buka</StatusBadge>) },
          { key: "seharusnya", header: "Seharusnya", align: "right", cell: (x) => (x.state === "closed" ? rp(x.expected_cash_idr ?? 0) : "—") },
          { key: "dihitung", header: "Dihitung", align: "right", cell: (x) => (x.state === "closed" ? rp(x.counted_cash_idr ?? 0) : "—") },
          { key: "selisih", header: "Selisih", align: "right", cell: (x) => (x.variance_idr ? <span className="font-medium text-danger">{rp(Math.abs(x.variance_idr))} ({x.variance_idr > 0 ? "lebih" : "kurang"})</span> : "—") },
        ]}
      />
    </SectionCard>
  )
}

function Discrepancies({ rows }: { rows: Discrepancy[] }) {
  const [closing, setClosing] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [done, setDone] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const open = rows.filter((x) => !done.has(x.id))
  if (!open.length) return <EmptyState title="Tidak ada selisih" body="Semua mutasi Mengantar cocok dengan kiriman gerai." />
  async function resolve(id: string) {
    setError(null)
    try {
      await api(`/finance/discrepancies/${id}/resolve`, { body: { reason } })
      setDone((d) => new Set(d).add(id))
      setClosing(null)
      setReason("")
    } catch (e) {
      setError(e instanceof ApiError ? e.body.message : "Gagal menyelesaikan selisih.")
    }
  }
  return (
    <SectionCard id="selisih" title="Selisih Sync" description="Mutasi Mengantar yang belum cocok dengan kiriman gerai" flush>
    <ul className="divide-y">
      {open.map((x) => (
        <li key={x.id} className="flex flex-col gap-2 px-4 py-3 text-base md:text-sm md:px-6">
          <span className="font-medium">{KIND_LABEL[x.kind] ?? "Selisih"}{x.shipment_slug && !x.shipment_slug.startsWith("#") ? <> · <Link to="/kiriman/$slug" params={{ slug: x.shipment_slug }} className="text-primary underline-offset-4 hover:underline tabular-nums">INV {x.shipment_slug.toUpperCase()}</Link></> : null}</span>
          <span className="text-muted-foreground">{x.detail}{x.expected_idr !== null || x.actual_idr !== null ? ` · perkiraan ${x.expected_idr === null ? "—" : rp(x.expected_idr)}, tercatat ${x.actual_idr === null ? "—" : rp(x.actual_idr)}` : ""} · {when(x.created_at)}</span>
          {closing === x.id ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor={`alasan-${x.id}`}>Alasan (dicatat)</FieldLabel>
                <Input id={`alasan-${x.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
              </Field>
              <Button variant="outline" onClick={() => setClosing(null)}>Batal</Button>
              <Button disabled={reason.trim().length < 5} onClick={() => resolve(x.id)}>Tandai Selesai</Button>
            </div>
          ) : (
            <div><Button variant="outline" onClick={() => { setClosing(x.id); setReason("") }}>Tandai Selesai</Button></div>
          )}
          {closing === x.id && error ? <p role="alert" className="text-danger">{error}</p> : null}
        </li>
      ))}
    </ul>
    </SectionCard>
  )
}

function ReserveList({ rows }: { rows: Reserve[] }) {
  return (
    <SectionCard id="cadangan" title="Cadangan Retur" description="Saldo yang ditahan untuk retur atau sengketa">
      <DataTableShell
        caption="Cadangan retur"
        rows={rows}
        rowKey={(r) => `${r.kind}-${r.slug}`}
        empty={<EmptyState title="Tidak ada cadangan" body="Saldo tidak ditahan untuk retur atau sengketa saat ini." />}
        columns={[
          { key: "inv", header: "INV", cell: (r) => <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {r.slug.toUpperCase()}</Link> },
          { key: "jenis", header: "Jenis", cell: (r) => (r.kind === "retur" ? "Retur (ongkir + perkiraan biaya retur)" : "Penyesuaian berat/tujuan") },
          { key: "jumlah", header: "Jumlah", align: "right", cell: (r) => <span className="font-medium">{rp(r.amount_idr)}</span> },
        ]}
      />
    </SectionCard>
  )
}
