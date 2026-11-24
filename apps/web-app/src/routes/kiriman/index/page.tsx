import { courierLabel, statusLabel } from "../../../lib/status"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { DownloadIcon, PrinterIcon, SearchIcon } from "lucide-react"
import { paramsOf, periodFromParams, resolvePreset, type Period } from "@gx/domain/period"
import { PeriodFilter } from "../../../components/period-filter/period-filter"
import { DataTableShell } from "../../../components/admin/data-table"
import { SectionCard, StatusBadge } from "../../../components/admin/page"
import { Button } from "../../../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { Field, FieldLabel } from "../../../components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { api, ApiError } from "../../../lib/api"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../../shell/states"
import { rp } from "../../kasir/quote-panel"
import { PickupQueue } from "../pickup/page"
import { MejaRetur } from "../retur/page"
import { Kendala } from "../kendala/page"
import { AnchorButton, LinkButton } from "../../../components/admin/link-button"

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

// DEC-241: the list keeps only its four status filters; Pickup, Meja Retur and Kendala are workstations of their own
// (sidebar sub-tree under Kiriman), still served on `?tab=` so links and bookmarks keep working.
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "semua", label: "Semua" },
  { id: "belum-dibayar", label: "Belum Dibayar" },
  { id: "draf-qr", label: "Draf QR" },
  { id: "menunggu-saldo", label: "Menunggu Saldo" },
]
const STATION: Partial<Record<Tab, { title: string; description: string }>> = {
  pickup: { title: "Pickup & Surat Jalan", description: "Kelompokkan paket per ekspedisi, cetak surat jalan, dan serahkan ke kurir." },
  retur: { title: "Meja Retur", description: "Paket retur yang kembali ke gerai: terima, kirim kode ambil, lalu serahkan ke pengirim." },
  kendala: { title: "Kendala & Klaim", description: "Paket hilang, rusak, atau tertahan — pantau batas waktu klaim per ekspedisi." },
}
const MODE: Record<string, string> = { none: "Non-COD", buyer_bears_fee: "COD", sender_bears_fee: "COD", cod_all_in: "COD", dfod: "COD Ongkir" }
const METHOD: Record<string, string> = { qris: "QRIS", tunai: "Tunai", transfer: "Transfer", deposit: "Deposit" }
const time = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)
const newKey = () => crypto.randomUUID().replace(/-/g, "")

type Search = { tab?: Tab; q?: string; periode?: string; dari?: string; sampai?: string; cetak?: string; macet?: number | string }
// DEC-251C `Pergerakan`: issued INVs the courier has not scanned for N days (from the last courier event or issue time).
// The URL carries a plain number (`?macet=3`); a string would be JSON-quoted by the router.
const STUCK = [
  { value: "", label: "Semua pergerakan" },
  { value: "2", label: "Macet ≥ 2 hari" },
  { value: "3", label: "Macet ≥ 3 hari" },
  { value: "5", label: "Macet ≥ 5 hari" },
  { value: "7", label: "Macet ≥ 7 hari" },
]

export function KirimanPage() {
  const w = useWorkspace()
  const owner = isOwner(w)
  const search = useSearch({ strict: false }) as Search
  const navigate = useNavigate()
  const [mountedAt] = useState(() => Date.now())
  const rawTab = search.tab
  const validTab = rawTab && (TABS.some((t) => t.id === rawTab) || rawTab in STATION) ? rawTab : "semua"
  const tab: Tab = validTab
  const period = useMemo(() => (search.periode || (search.dari && search.sampai) ? periodFromParams(search, mountedAt) : resolvePreset("30d", mountedAt)), [search, mountedAt])
  const searchQ = search.q ?? ""
  const [prevSearchQ, setPrevSearchQ] = useState(searchQ)
  const [q, setQ] = useState(searchQ)
  if (prevSearchQ !== searchQ) {
    setPrevSearchQ(searchQ)
    setQ(searchQ)
  }
  const [data, setData] = useState<ListResp | null>(null)
  const [loadedQs, setLoadedQs] = useState<string | null>(null)
  const [more, setMore] = useState<Row[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [errState, setErrState] = useState<{ qs: string; msg: string } | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [payRow, setPayRow] = useState<Row | null>(null)
  const [payMethod, setPayMethod] = useState<"qris" | "tunai" | "transfer">("qris")
  const [payCash, setPayCash] = useState("")
  const [paying, setPaying] = useState(false)
  const [payErr, setPayErr] = useState<string | null>(null)
  const [payKey, setPayKey] = useState(newKey)
  const station = STATION[tab]
  const macet = STUCK.some((o) => o.value && o.value === String(search.macet ?? "")) ? String(search.macet) : ""
  const qs = useMemo(() => new URLSearchParams({ tab, ...(search.q ? { q: search.q } : {}), ...(search.cetak ? { cetak: search.cetak } : {}), ...(macet ? { macet } : {}), ...paramsOf(period) }).toString(), [tab, search.q, search.cetak, macet, period])
  // Only the latest request may paint: an earlier (e.g. unfiltered) response that resolves after a search must not
  // overwrite the filtered list.
  const gen = useRef(0)
  const load = useCallback(() => {
    const mine = ++gen.current
    if (station) return
    api<ListResp>(`/shipments?${qs}`)
      .then((d) => {
        if (mine !== gen.current) return
        setErrState(null)
        setData(d)
        setLoadedQs(qs)
        setMore([])
        setCursor(d.nextCursor)
      })
      .catch((e) => {
        if (mine !== gen.current) return
        setErrState({ qs, msg: e instanceof ApiError ? e.body.message : "Daftar kiriman tidak dapat dimuat." })
        setLoadedQs(qs)
      })
  }, [qs, station])
  useEffect(() => {
    load()
    const g = gen
    return () => { g.current++ }
  }, [load])
  const error = errState?.qs === qs ? errState.msg : null
  const refreshing = !station && data !== null && loadedQs !== qs && !error
  const go = (p: Partial<Search>) => void navigate({ to: "/kiriman", search: { ...search, ...p } as never })
  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    // Sol R1-9: a page that answers after the filters changed (e.g. `macet`) belongs to the old list — drop it.
    const mine = gen.current
    try {
      const d = await api<ListResp>(`/shipments?${qs}&cursor=${encodeURIComponent(cursor)}`)
      if (mine !== gen.current) return
      setMore((m) => [...m, ...d.items])
      setCursor(d.nextCursor)
    } catch (e) {
      if (mine === gen.current) setMsg({ tone: "danger", text: e instanceof ApiError ? e.body.message : "Gagal memuat halaman berikutnya." })
    } finally {
      setLoadingMore(false)
    }
  }
  function openPayDialog(r: Row) {
    setPayRow(r)
    setPayMethod("qris")
    setPayCash("")
    setPayErr(null)
    setPayKey(newKey())
  }
  const payCashNum = Number(payCash.replace(/\D/g, ""))
  async function confirmPay() {
    if (!payRow || paying) return
    setPaying(true)
    setPayErr(null)
    setMsg(null)
    try {
      const res = await fetch(`/api/app/shipments/${payRow.slug}/payment`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": payKey },
        body: JSON.stringify({ method: payMethod, cashReceivedIdr: payMethod === "tunai" ? payCashNum : undefined }),
      })
      const j = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null
      if (!j?.ok) {
        setPayErr(j?.error?.message ?? "Pembayaran gagal dicatat. Coba lagi.")
        return
      }
      const mLabel = METHOD[payMethod] ?? payMethod
      setMsg({ tone: "safe", text: `INV ${payRow.slug.toUpperCase()} ditandai lunas (${mLabel}).` })
      setPayRow(null)
      load()
    } catch {
      setPayErr("Koneksi terputus saat mencatat pembayaran. Coba lagi.")
    } finally {
      setPaying(false)
    }
  }
  const rows = [...(data?.items ?? []), ...more]
  const exportHref = `/api/app/shipments-export.csv?${qs}`
  const filtered = !!(search.q || search.cetak || macet)
  if (station) {
    return (
      <div className="min-w-0">
        <PageTitle title={station.title} description={station.description} />
        {tab === "pickup" ? <PickupQueue /> : tab === "retur" ? <MejaRetur /> : <Kendala />}
      </div>
    )
  }
  return (
    <div className={`min-w-0 ${refreshing ? "opacity-75 transition-opacity" : ""}`}>
      <PageTitle title="Kiriman">
        <LinkButton variant="outline" to="/kasir/multi">Paket Massal</LinkButton>
        <LinkButton variant="outline" to="/kiriman/cetak-massal"><PrinterIcon aria-hidden data-icon="inline-start" /> Cetak Resi Massal</LinkButton>
        {owner ? <AnchorButton variant="outline" href={exportHref}><DownloadIcon aria-hidden data-icon="inline-start" /> Ekspor CSV</AnchorButton> : null}
      </PageTitle>
      <nav aria-label="Status kiriman" className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-0.5 rounded-lg bg-slate-100/90 p-1">
          {TABS.map((t) => {
            const active = t.id === tab
            const count = data?.counts[t.id]
            const cls = `flex h-11 items-center gap-1.5 rounded-md px-3 text-base whitespace-nowrap md:h-8 md:text-sm ${active ? "bg-white font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]" : "text-muted-foreground hover:text-slate-900"}`
            return (
              <li key={t.id}>
                <Link to="/kiriman" search={{ ...search, tab: t.id === "semua" ? undefined : t.id } as never} aria-current={active ? "page" : undefined} className={cls}>
                  {t.label}{count !== undefined && count !== null ? <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-slate-100 text-slate-600" : "text-muted-foreground"}`}>{count}</span> : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <form role="search" className="flex min-w-0 flex-1 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }) }}>
          <div className="relative min-w-0 flex-1">
            <label htmlFor="cari-kiriman" className="sr-only">Cari INV, resi, nama, atau HP</label>
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="cari-kiriman" type="search" className="pl-9" placeholder="Cari INV, resi, nama, atau HP" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button type="submit" variant="outline">Cari</Button>
        </form>
        <PeriodFilter value={period} onChange={(p: Period) => go({ periode: undefined, dari: undefined, sampai: undefined, ...paramsOf(p) })} />
        <ToggleGroup aria-label="Status cetak" variant="outline" className="flex-wrap" value={[search.cetak ?? "semua"]} onValueChange={(v) => v[0] && go({ cetak: v[0] === "semua" ? undefined : (v[0] as "belum" | "sudah") })}>
          {(["semua", "belum", "sudah"] as const).map((c) => (
            <ToggleGroupItem key={c} value={c}>{c === "semua" ? "Semua" : c === "belum" ? "Belum Cetak" : "Sudah Cetak"}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select items={STUCK} value={macet} onValueChange={(v) => go({ macet: v ? Number(v) : undefined })}>
          <SelectTrigger aria-label="Pergerakan paket" data-stuck-filter className={`w-full sm:w-44 ${macet ? "border-warn/60 text-warn" : ""}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STUCK.map((o) => (
                <SelectItem key={o.value || "semua"} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={`mb-4 text-base md:text-sm font-medium ${msg.tone === "danger" ? "text-danger" : "text-safe"}`}>{msg.text}</p> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : !data ? <LoadingState label="Memuat kiriman" rows={5} /> : rows.length === 0 ? (
        filtered ? (
          <EmptyState title="Tidak ada yang cocok" body="Tidak ada kiriman dengan pencarian atau filter ini." action={<Button variant="outline" onClick={() => { setQ(""); go({ q: undefined, cetak: undefined, macet: undefined }) }}>Hapus Filter</Button>} />
        ) : (
          <EmptyState title="Belum ada kiriman di sini" body="Kiriman yang resinya terbit akan muncul di daftar ini." action={<LinkButton to="/kasir">Buat Pengiriman</LinkButton>} />
        )
      ) : (
        <SectionCard id="daftar-kiriman" title="Daftar kiriman" description={`${rows.length} kiriman ditampilkan`} flush>
          <DataTableShell
            bare
            caption="Daftar kiriman"
            rows={rows}
            rowKey={(r) => r.slug}
            footer={cursor ? <Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Memuat…" : "Muat Lebih Banyak"}</Button> : undefined}
            columns={[
              { key: "inv", header: "INV", cell: (r) => <><Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {r.slug.toUpperCase()}</Link><span className="block text-xs text-muted-foreground tabular-nums">{time(r.created_at)}</span></> },
              { key: "kurir", header: "Kurir & resi", cell: (r) => <>{courierLabel(r.courier_code)}<span className="block text-xs text-muted-foreground tabular-nums">{r.awb_number ?? "Resi belum terbit"}{r.print_count ? ` · ${r.print_count}× cetak` : ""}</span></> },
              { key: "pihak", header: "Pengirim → Penerima", wide: true, className: "whitespace-normal", cell: (r) => <>{r.sender_brand ?? r.sender ?? "—"}<span className="block text-xs text-muted-foreground">→ {r.recipient ?? "—"}{r.recipient_area ? ` (${r.recipient_area.split(",")[0]})` : ""}</span></> },
              { key: "tagihan", header: "Tagihan", align: "right", cell: (r) => <>{rp(r.counter_due_idr)}<span className="block text-xs text-muted-foreground">{MODE[r.cod_fee_mode] ?? r.cod_fee_mode}{r.cod_collection_total_idr ? ` ${rp(r.cod_collection_total_idr)}` : ""}</span>{owner && r.estimated_margin_idr != null ? <span className="block text-xs text-muted-foreground">laba {rp(r.estimated_margin_idr)}</span> : null}</> },
              { key: "bayar", header: "Pembayaran", cell: (r) => <Payment r={r} /> },
              { key: "status", header: "Status", cell: (r) => <StatusBadge tone={r.dispatch_state === "issued" ? "primary" : r.dispatch_state === "cancelled" ? "muted" : "warn"}>{statusLabel(r.dispatch_state === "issued" ? r.status : r.dispatch_state)}</StatusBadge> },
              { key: "aksi", header: <span className="sr-only">Aksi</span>, align: "right", cell: (r) => (r.counter_payment_status === "unpaid" && r.dispatch_state !== "cancelled" ? <Button variant="outline" size="sm" onClick={() => openPayDialog(r)}>Tandai Lunas</Button> : null) },
            ]}
            mobile={(r) => (
              <div className="flex flex-col gap-1.5 text-base md:text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {r.slug.toUpperCase()}</Link>
                  <span className="text-xs text-muted-foreground tabular-nums">{time(r.created_at)}</span>
                </div>
                <p>{courierLabel(r.courier_code)} · <span className="tabular-nums">{r.awb_number ?? "Resi belum terbit"}</span></p>
                <p className="text-xs text-muted-foreground">{r.sender_brand ?? r.sender ?? "—"} → {r.recipient ?? "—"}</p>
                <p className="flex flex-wrap items-center gap-2 tabular-nums">{rp(r.counter_due_idr)} <Payment r={r} /> <StatusBadge tone={r.dispatch_state === "issued" ? "primary" : r.dispatch_state === "cancelled" ? "muted" : "warn"}>{statusLabel(r.dispatch_state === "issued" ? r.status : r.dispatch_state)}</StatusBadge></p>
                {r.counter_payment_status === "unpaid" && r.dispatch_state !== "cancelled" ? <Button variant="outline" className="mt-1 w-fit" onClick={() => openPayDialog(r)}>Tandai Lunas</Button> : null}
              </div>
            )}
          />
        </SectionCard>
      )}
      <Dialog open={payRow !== null} onOpenChange={(o) => !o && !paying && setPayRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tandai Lunas {payRow ? `INV ${payRow.slug.toUpperCase()}` : ""}</DialogTitle>
            <DialogDescription>Pilih metode pembayaran yang diterima di loket sebesar <strong className="tabular-nums">{payRow ? rp(payRow.counter_due_idr) : ""}</strong>.</DialogDescription>
          </DialogHeader>
          {payRow ? (
            <div className="flex flex-col gap-3">
              <ToggleGroup value={[payMethod]} onValueChange={(v) => v[0] && setPayMethod(v[0] as typeof payMethod)} variant="outline" aria-label="Metode pembayaran" className="grid w-full grid-cols-3 gap-1.5">
                <ToggleGroupItem value="qris" className="w-full">QRIS</ToggleGroupItem>
                <ToggleGroupItem value="tunai" className="w-full">Tunai</ToggleGroupItem>
                <ToggleGroupItem value="transfer" className="w-full">Transfer</ToggleGroupItem>
              </ToggleGroup>
              {payMethod === "tunai" ? (
                <Field>
                  <FieldLabel htmlFor="pay-dialog-cash">Uang diterima</FieldLabel>
                  <Input id="pay-dialog-cash" inputMode="numeric" className="tabular-nums" value={payCash} onChange={(e) => setPayCash(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} />
                  <div className="flex flex-wrap gap-1.5">
                    {[payRow.counter_due_idr, Math.ceil(payRow.counter_due_idr / 50000) * 50000, 100000].filter((v, i, a) => v >= payRow.counter_due_idr && a.indexOf(v) === i).slice(0, 3).map((v) => (
                      <button key={v} type="button" onClick={() => setPayCash(v.toLocaleString("id-ID"))} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 tabular-nums hover:bg-slate-50 md:h-9 md:px-2.5 md:text-xs">
                        {v === payRow.counter_due_idr ? "Uang pas" : rp(v)}
                      </button>
                    ))}
                  </div>
                  {payCashNum >= payRow.counter_due_idr ? <p className="text-sm font-medium text-safe tabular-nums">Kembalian {rp(payCashNum - payRow.counter_due_idr)}</p> : <p className="text-xs text-muted-foreground">Masukkan uang diterima atau klik Uang pas.</p>}
                </Field>
              ) : null}
              {payErr ? <p role="alert" className="text-sm font-medium text-danger">{payErr}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={paying} onClick={() => setPayRow(null)}>Batal</Button>
            <Button disabled={paying || !payRow || (payMethod === "tunai" && payCashNum < payRow.counter_due_idr)} onClick={confirmPay}>{paying ? "Menyimpan…" : "Simpan Lunas"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Payment({ r }: { r: Row }) {
  if (r.counter_payment_status === "paid") {
    const m = r.counter_payment_method ? METHOD[r.counter_payment_method] ?? r.counter_payment_method : null
    return <StatusBadge tone="safe">{m ? `Lunas · ${m}` : "Lunas"}</StatusBadge>
  }
  if (r.counter_payment_status === "unpaid") return <StatusBadge tone="warn">Belum dibayar</StatusBadge>
  if (r.counter_payment_status === "voided") return <StatusBadge tone="muted">Dibatalkan</StatusBadge>
  return <StatusBadge tone="muted">Tanpa tagihan</StatusBadge>
}
