import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { DownloadIcon, PrinterIcon, SearchIcon } from "lucide-react"
import { paramsOf, periodFromParams, resolvePreset, type Period } from "@gx/domain/period"
import { PeriodFilter } from "../../../components/period-filter/period-filter"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../../shell/states"
import { rp } from "../../kasir/quote-panel"
import { PickupQueue } from "../pickup/page"
import { MejaRetur } from "../retur/page"

// `Kiriman` (visual 06 §1, visual 07 `/kiriman`, DEC-213/220): tabs with counts → search + period + courier + print
// filters → table (cards under 768 px) with `Pembayaran` and the `Tandai Lunas` row action. Specialist tabs
// (Pickup, Kendala, Retur, Draf QR) list their INVs here; their own screens arrive with their tasks.
interface Row {
  slug: string
  created_at: number
  courier_code: string
  service_code: string
  awb_number: string | null
  print_count: number
  sender: string | null
  sender_brand: string | null
  recipient: string | null
  recipient_area: string | null
  cod_fee_mode: string
  counter_due_idr: number
  cod_collection_total_idr: number
  counter_payment_status: string
  counter_payment_method: string | null
  status: string
  dispatch_state: string
  estimated_margin_idr?: number | null
}
type Tab = "semua" | "belum-dibayar" | "draf-qr" | "menunggu-saldo" | "pickup" | "kendala" | "retur"
interface ListResp { items: Row[]; nextCursor: string | null; counts: Record<Tab, number> }

const TABS: Array<{ id: Tab | "massal"; label: string }> = [
  { id: "semua", label: "Semua" },
  { id: "belum-dibayar", label: "Belum Dibayar" },
  { id: "draf-qr", label: "Draf QR" },
  { id: "menunggu-saldo", label: "Menunggu Saldo" },
  { id: "pickup", label: "Pickup & Manifest" },
  { id: "massal", label: "Riwayat Massal" },
  { id: "kendala", label: "Kendala & Klaim" },
  { id: "retur", label: "Meja Retur" },
]
const STATUS: Record<string, string> = { ready_for_pickup: "Siap dijemput", in_transit: "Dalam perjalanan", delivered: "Terkirim", undelivery_hold: "Gagal antar", rts_in_transit: "Retur", provider_returned: "Retur diterima", rts_at_gerai: "Retur di gerai", cancelled: "Dibatalkan", lost: "Hilang", handed_to_courier: "Diserahkan ke kurir", provider_unpaid_hold: "Menunggu saldo", draft: "Draf", failed: "Gagal diterbitkan", reconciliation_needed: "Diperiksa" }
const MODE: Record<string, string> = { none: "Non-COD", buyer_bears_fee: "COD", sender_bears_fee: "COD", cod_all_in: "COD", dfod: "COD Ongkir" }
const METHOD: Record<string, string> = { qris: "QRIS", tunai: "Tunai", transfer: "Transfer", deposit: "Deposit" }
const time = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)
const newKey = () => crypto.randomUUID().replace(/-/g, "")

type Search = { tab?: Tab; q?: string; periode?: string; dari?: string; sampai?: string; cetak?: string }

export function KirimanPage() {
  const w = useWorkspace()
  const owner = isOwner(w)
  const search = useSearch({ strict: false }) as Search
  const navigate = useNavigate()
  const [mountedAt] = useState(() => Date.now())
  const tab: Tab = search.tab ?? "semua"
  const period = useMemo(() => (search.periode || (search.dari && search.sampai) ? periodFromParams(search, mountedAt) : resolvePreset("30d", mountedAt)), [search, mountedAt])
  const [q, setQ] = useState(search.q ?? "")
  const [data, setData] = useState<ListResp | null>(null)
  const [more, setMore] = useState<Row[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const qs = useMemo(() => new URLSearchParams({ tab, ...(search.q ? { q: search.q } : {}), ...(search.cetak ? { cetak: search.cetak } : {}), ...paramsOf(period) }).toString(), [tab, search.q, search.cetak, period])
  const load = useCallback(() => {
    api<ListResp>(`/shipments?${qs}`)
      .then((d) => {
        setError(null)
        setData(d)
        setMore([])
        setCursor(d.nextCursor)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Daftar kiriman tidak dapat dimuat."))
  }, [qs])
  useEffect(load, [load])
  const go = (p: Partial<Search>) => void navigate({ to: "/kiriman", search: { ...search, ...p } as never })
  async function loadMore() {
    if (!cursor) return
    const d = await api<ListResp>(`/shipments?${qs}&cursor=${encodeURIComponent(cursor)}`)
    setMore((m) => [...m, ...d.items])
    setCursor(d.nextCursor)
  }
  async function markPaid(r: Row) {
    setMsg(null)
    const res = await fetch(`/api/app/shipments/${r.slug}/payment`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": newKey() }, body: JSON.stringify({ method: "qris" }) })
    const j = (await res.json()) as { ok: boolean; error?: { message: string } }
    setMsg(j.ok ? { tone: "safe", text: `INV ${r.slug.toUpperCase()} ditandai lunas (QRIS).` } : { tone: "danger", text: j.error!.message })
    if (j.ok) load()
  }
  const rows = [...(data?.items ?? []), ...more]
  const exportHref = `/api/app/shipments-export.csv?${qs}`
  const filtered = !!(search.q || search.cetak)
  return (
    <div className="min-w-0 pb-24 md:pb-0">
      <PageTitle title="Kiriman">
        <div className="flex flex-wrap gap-2">
          <Link to="/kasir/multi" className="inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium md:h-10">Paket Massal</Link>
          <Link to="/kiriman/cetak-massal" className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-base font-medium md:h-10"><PrinterIcon aria-hidden className="size-4" /> Cetak Resi Massal</Link>
          {owner ? <a href={exportHref} className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-base font-medium md:h-10"><DownloadIcon aria-hidden className="size-4" /> Ekspor CSV</a> : null}
        </div>
      </PageTitle>
      <nav aria-label="Status kiriman" className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => {
            const active = t.id === tab
            const count = t.id === "massal" ? null : data?.counts[t.id]
            const cls = `flex h-11 items-center gap-2 rounded-md px-4 text-base md:h-10 ${active ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`
            return (
              <li key={t.id}>
                {t.id === "massal" ? (
                  <Link to="/kiriman/massal" className={cls}>{t.label}</Link>
                ) : (
                  <Link to="/kiriman" search={{ ...search, tab: t.id === "semua" ? undefined : t.id } as never} aria-current={active ? "page" : undefined} className={cls}>
                    {t.label}{count !== undefined && count !== null ? <span className="tabular-nums text-muted-foreground">({count})</span> : null}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <form role="search" className="relative min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }) }}>
          <label htmlFor="cari-kiriman" className="sr-only">Cari INV, resi, nama, atau HP</label>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="cari-kiriman" type="search" className="pl-9" placeholder="Cari INV, resi, nama, atau HP" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <PeriodFilter value={period} onChange={(p: Period) => go({ periode: undefined, dari: undefined, sampai: undefined, ...paramsOf(p) })} />
        <div role="group" aria-label="Status cetak" className="flex gap-1">
          {(["semua", "belum", "sudah"] as const).map((c) => (
            <Button key={c} variant={(search.cetak ?? "semua") === c ? "default" : "outline"} aria-pressed={(search.cetak ?? "semua") === c} onClick={() => go({ cetak: c === "semua" ? undefined : c })}>{c === "semua" ? "Semua" : c === "belum" ? "Belum Cetak" : "Sudah Cetak"}</Button>
          ))}
        </div>
      </div>
      {tab === "pickup" ? <PickupQueue /> : null}
      {tab === "retur" ? <MejaRetur /> : null}
      {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={`mb-4 border-l-4 py-1 pl-3 text-base font-medium ${msg.tone === "danger" ? "border-danger text-danger" : "border-safe text-safe"}`}>{msg.text}</p> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : !data ? <LoadingState label="Memuat kiriman" rows={5} /> : rows.length === 0 ? (
        filtered ? (
          <EmptyState title="Tidak ada yang cocok" body="Tidak ada kiriman dengan pencarian atau filter ini." action={<Button variant="outline" onClick={() => { setQ(""); go({ q: undefined, cetak: undefined }) }}>Hapus Filter</Button>} />
        ) : (
          <EmptyState title="Belum ada kiriman di sini" body="Kiriman yang resinya terbit akan muncul di daftar ini." action={<Link to="/kasir" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground md:h-10">Buat Pengiriman</Link>} />
        )
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
          <table className="w-full text-base">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 font-medium">INV</th>
                <th className="px-4 py-3 font-medium">Kurir & resi</th>
                <th className="px-4 py-3 font-medium">Pengirim → Penerima</th>
                <th className="px-4 py-3 text-right font-medium">Tagihan</th>
                <th className="px-4 py-3 font-medium">Pembayaran</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.slug} className="align-top">
                  <td className="px-4 py-3"><Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {r.slug.toUpperCase()}</Link><span className="block text-muted-foreground tabular-nums">{time(r.created_at)}</span></td>
                  <td className="px-4 py-3">{r.courier_code}<span className="block text-muted-foreground tabular-nums">{r.awb_number ?? "Resi belum terbit"}{r.print_count ? ` · ${r.print_count}× cetak` : ""}</span></td>
                  <td className="px-4 py-3">{r.sender_brand ?? r.sender ?? "—"}<span className="block text-muted-foreground">→ {r.recipient ?? "—"}{r.recipient_area ? ` (${r.recipient_area.split(",")[0]})` : ""}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{rp(r.counter_due_idr)}<span className="block text-muted-foreground">{MODE[r.cod_fee_mode] ?? r.cod_fee_mode}{r.cod_collection_total_idr ? ` ${rp(r.cod_collection_total_idr)}` : ""}</span>{owner && r.estimated_margin_idr != null ? <span className="block text-muted-foreground">laba {rp(r.estimated_margin_idr)}</span> : null}</td>
                  <td className="px-4 py-3"><Payment r={r} /></td>
                  <td className="px-4 py-3">{STATUS[r.dispatch_state === "issued" ? r.status : r.dispatch_state] ?? r.status}</td>
                  <td className="px-4 py-3 text-right">{r.counter_payment_status === "unpaid" && r.dispatch_state !== "cancelled" ? <Button variant="outline" onClick={() => markPaid(r)}>Tandai Lunas</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.slug} className="rounded-lg border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {r.slug.toUpperCase()}</Link>
                  <span className="text-base text-muted-foreground tabular-nums">{time(r.created_at)}</span>
                </div>
                <p className="text-base">{r.courier_code} · <span className="tabular-nums">{r.awb_number ?? "Resi belum terbit"}</span></p>
                <p className="text-base text-muted-foreground">{r.sender_brand ?? r.sender ?? "—"} → {r.recipient ?? "—"}</p>
                <p className="text-base tabular-nums">{rp(r.counter_due_idr)} · <Payment r={r} /> · {STATUS[r.dispatch_state === "issued" ? r.status : r.dispatch_state] ?? r.status}</p>
                {r.counter_payment_status === "unpaid" && r.dispatch_state !== "cancelled" ? <Button variant="outline" className="mt-2" onClick={() => markPaid(r)}>Tandai Lunas</Button> : null}
              </li>
            ))}
          </ul>
          {cursor ? <div className="mt-4"><Button variant="outline" onClick={loadMore}>Muat Lebih Banyak</Button></div> : null}
        </>
      )}
    </div>
  )
}

function Payment({ r }: { r: Row }) {
  if (r.counter_payment_status === "paid") return <span>Lunas · {METHOD[r.counter_payment_method ?? ""] ?? r.counter_payment_method}</span>
  if (r.counter_payment_status === "unpaid") return <span className="font-medium text-warn">Belum dibayar</span>
  if (r.counter_payment_status === "voided") return <span className="text-muted-foreground">Dibatalkan</span>
  return <span className="text-muted-foreground">Tanpa tagihan</span>
}
