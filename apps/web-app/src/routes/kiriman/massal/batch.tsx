import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { PrinterIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Field, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { AreaPicker, type Area } from "../../../components/area-picker"
import { api, ApiError } from "../../../lib/api"
import { fetchPrint, printPdf, PrintError } from "../../../print/print"
import { ErrorState, LoadingState, PageTitle } from "../../../shell/states"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { rp } from "../../kasir/quote-panel"
import { BATCH_STATE, when, type BulkRow, type BulkView } from "./shared"

// `/kiriman/massal/:batch` (visual 07, spec 03 §1.3 steps 3–6): tabs `Siap` / `Perlu Diperbaiki` with inline fix →
// totals → `Buat n Kiriman` → dispatch progress → one payment for the batch → `Cetak Semua` (≤ 50 per PDF).
const newKey = () => crypto.randomUUID().replace(/-/g, "")
const DISPATCH_LABEL: Record<string, string> = { issued: "Resi terbit", provider_unpaid_hold: "Menunggu saldo", failed: "Perlu tindakan", draft: "Menunggu antrean", issuing_in_flight: "Diterbitkan…", reconciliation_needed: "Diperiksa", cancelled: "Dibatalkan" }

export function BatchPage() {
  const { batch } = useParams({ strict: false }) as { batch: string }
  const w = useWorkspace()
  const owner = isOwner(w)
  const [v, setV] = useState<BulkView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api<BulkView>(`/bulk/${batch}`)
      .then((d) => {
        setError(null)
        setV(d)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Batch tidak dapat dimuat."))
  }, [batch])
  useEffect(load, [load])
  // Checking and dispatch run in the background queue: refresh while they are in progress.
  const busy = v && (v.batch.state === "checking" || v.batch.state === "dispatching")
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [busy, load])
  if (error) return <div><PageTitle title="Paket Massal" /><ErrorState message={error} onRetry={load} /></div>
  if (!v) return <LoadingState label="Memuat batch" />
  const ready = v.rows.filter((r) => r.state === "ready")
  const fix = v.rows.filter((r) => r.state === "needs_fix" || r.state === "pending")
  const created = v.rows.filter((r) => r.state === "created")
  const editable = ["draft", "checking", "ready"].includes(v.batch.state)
  return (
    <div className="pb-24 md:pb-0">
      <nav aria-label="Breadcrumb" className="mb-2 text-base text-muted-foreground"><Link to="/kiriman/massal" className="text-primary underline-offset-4 hover:underline">Riwayat Massal</Link> › {when(v.batch.created_at)}</nav>
      <PageTitle title="Paket Massal" description={`${v.sender ? (v.sender.brand ?? v.sender.name) : "Pengirim"} · ${v.batch.file_name ?? "isian manual"} · ${BATCH_STATE[v.batch.state] ?? v.batch.state}`} />
      <Totals v={v} owner={owner} />
      {editable ? (
        <Tabs defaultValue={fix.length && !ready.length ? "fix" : "ready"} className="mt-6">
          <TabsList aria-label="Status baris">
            <TabsTrigger value="ready">Siap ({ready.length})</TabsTrigger>
            <TabsTrigger value="fix">Perlu Diperbaiki ({fix.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="ready"><ReadyList rows={ready} owner={owner} /></TabsContent>
          <TabsContent value="fix"><FixList batch={batch} rows={fix} onChange={setV} /></TabsContent>
        </Tabs>
      ) : (
        <CreatedList rows={created} />
      )}
      {editable ? <CreateBar batch={batch} n={ready.length} pendingRows={v.rows.some((r) => r.state === "pending")} onDone={setV} /> : null}
      {!editable && v.batch.state !== "cancelled" ? <AfterCreate v={v} reload={load} /> : null}
    </div>
  )
}

function Totals({ v, owner }: { v: BulkView; owner: boolean }) {
  const t = v.totals
  const item = (label: string, value: number) => (
    <div className="flex flex-col"><dt className="text-base text-muted-foreground">{label}</dt><dd className="text-lg font-semibold tabular-nums">{rp(value)}</dd></div>
  )
  return (
    <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-card p-4 md:grid-cols-5 md:p-6">
      {item("Total tagihan loket", t.due)}
      {item("Ongkir", t.ongkir)}
      {item("COD ditagih", t.codCollected)}
      {item("Hak pengirim", t.senderPayable)}
      {owner && t.estimated_margin_idr !== undefined ? item("Perkiraan laba", t.estimated_margin_idr) : null}
    </dl>
  )
}

function ReadyList({ rows, owner }: { rows: BulkRow[]; owner: boolean }) {
  if (!rows.length) return <p className="py-4 text-base text-muted-foreground">Belum ada baris yang siap.</p>
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((r) => (
        <li key={r.row_no} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-base">
          <span><span className="text-muted-foreground tabular-nums">#{r.row_no}</span> <span className="font-medium">{r.recipient_name}</span> · {r.area_label}</span>
          <span className="tabular-nums">{(r.weight_gram ?? 0).toLocaleString("id-ID")} g{r.cod_goods_idr ? ` · COD ${rp(r.cod_collection_total_idr ?? 0)}` : ""} · <span className="font-medium">{rp(r.counter_due_idr ?? 0)}</span>{owner && r.estimated_margin_idr != null ? <span className="text-muted-foreground"> · laba {rp(r.estimated_margin_idr)}</span> : null}</span>
        </li>
      ))}
    </ul>
  )
}

function FixList({ batch, rows, onChange }: { batch: string; rows: BulkRow[]; onChange: (v: BulkView) => void }) {
  if (!rows.length) return <p className="py-4 text-base text-muted-foreground">Semua baris sudah benar.</p>
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card">
      {rows.map((r) => <FixRow key={r.row_no} batch={batch} r={r} onChange={onChange} />)}
    </ul>
  )
}

function FixRow({ batch, r, onChange }: { batch: string; r: BulkRow; onChange: (v: BulkView) => void }) {
  const [cells, setCells] = useState<Record<string, string>>(r.raw)
  const [area, setArea] = useState<Area | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const set = (k: string, val: string) => setCells((c) => ({ ...c, [k]: val }))
  async function save(remove = false) {
    setPending(true)
    setMsg(null)
    try {
      onChange(await api<BulkView>(`/bulk/${batch}/rows/${r.row_no}`, { body: remove ? { remove: true } : { cells, areaId: area?.id, areaLabel: area?.label } }))
    } catch (e) {
      setMsg(e instanceof ApiError ? e.body.message : "Gagal menyimpan baris.")
    } finally {
      setPending(false)
    }
  }
  if (r.state === "pending") return <li className="px-4 py-3 text-base text-muted-foreground">#{r.row_no} {r.recipient_name ?? r.raw.name} · sedang diperiksa…</li>
  return (
    <li className="flex flex-col gap-3 p-4">
      <p className="text-base"><span className="text-muted-foreground tabular-nums">#{r.row_no}</span> <span className="font-medium">{r.recipient_name ?? (r.raw.name || "Tanpa nama")}</span></p>
      <ul className="flex flex-col gap-1">
        {r.errors.map((e) => <li key={e} className="border-l-4 border-danger pl-3 text-base font-medium text-danger">{e}</li>)}
      </ul>
      {r.candidates.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-medium">Pilih kecamatan yang benar</legend>
          <div role="radiogroup" aria-label={`Kecamatan baris ${r.row_no}`} className="flex flex-col gap-2">
            {r.candidates.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={area?.id === c.id} onClick={() => setArea({ id: c.id, label: c.label, postalCode: null })} className={`min-h-11 rounded-lg border px-3 py-2 text-left text-base ${area?.id === c.id ? "border-primary bg-primary/10 font-medium" : "border-input"}`}>{c.label}</button>
            ))}
          </div>
        </fieldset>
      ) : r.errors.some((e) => e.startsWith("Kecamatan")) ? (
        <AreaPicker label="Cari kecamatan tujuan" value={area} onChange={setArea} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Field><FieldLabel htmlFor={`fn${r.row_no}`}>Nama penerima</FieldLabel><Input id={`fn${r.row_no}`} value={cells.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field><FieldLabel htmlFor={`fp${r.row_no}`}>No HP</FieldLabel><Input id={`fp${r.row_no}`} inputMode="tel" value={cells.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field><FieldLabel htmlFor={`fa${r.row_no}`}>Alamat</FieldLabel><Input id={`fa${r.row_no}`} value={cells.street ?? ""} onChange={(e) => set("street", e.target.value)} /></Field>
        <Field><FieldLabel htmlFor={`fb${r.row_no}`}>Berat (gram)</FieldLabel><Input id={`fb${r.row_no}`} inputMode="numeric" className="tabular-nums" value={cells.weightGram ?? ""} onChange={(e) => set("weightGram", e.target.value.replace(/\D/g, ""))} /></Field>
      </div>
      {msg ? <p role="alert" className="text-base text-danger">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => save(false)}>Simpan & Periksa</Button>
        <Button variant="ghost" disabled={pending} onClick={() => save(true)}>Hapus baris</Button>
      </div>
    </li>
  )
}

function CreateBar({ batch, n, pendingRows, onDone }: { batch: string; n: number; pendingRows: boolean; onDone: (v: BulkView) => void }) {
  const [ack, setAck] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function create() {
    setPending(true)
    setMsg(null)
    try {
      onDone(await api<BulkView>(`/bulk/${batch}/create`, { body: { prohibitedAck: ack } }))
    } catch (e) {
      setMsg(e instanceof ApiError ? e.body.message : "Gagal membuat kiriman.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-lg border bg-card p-4 md:p-6">
      <label className="flex min-h-11 items-center gap-3 text-base">
        <input type="checkbox" className="size-5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        Isi semua paket bukan barang terlarang
      </label>
      {pendingRows ? <p className="text-base text-muted-foreground">Masih memeriksa sebagian baris…</p> : null}
      {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base font-medium text-danger">{msg}</p> : null}
      <div><Button size="lg" disabled={pending || n === 0 || !ack} onClick={create}>{pending ? "Membuat…" : `Buat ${n} Kiriman`}</Button></div>
    </div>
  )
}

function CreatedList({ rows }: { rows: BulkRow[] }) {
  return (
    <ul className="mt-6 divide-y rounded-lg border bg-card">
      {rows.map((r) => (
        <li key={r.row_no} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-base">
          <span>
            <Link to="/kiriman/$slug" params={{ slug: r.shipment_slug! }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {r.shipment_slug!.toUpperCase()}</Link> · {r.recipient_name} · {r.area_label}
          </span>
          <span className="tabular-nums">
            {r.awb_number ? <span className="font-medium">{r.awb_number}</span> : <span className={r.dispatch_state === "failed" ? "font-medium text-danger" : "text-muted-foreground"}>{DISPATCH_LABEL[r.dispatch_state ?? ""] ?? r.dispatch_state}</span>}
            {r.dispatch_error && r.dispatch_state !== "issued" ? <span className="block text-danger">{r.dispatch_error}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

function AfterCreate({ v, reload }: { v: BulkView; reload: () => void }) {
  const [method, setMethod] = useState<"qris" | "tunai" | "transfer">("qris")
  const [cash, setCash] = useState("")
  const [key] = useState(newKey)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  const issued = v.rows.filter((r) => r.awb_number).map((r) => r.shipment_slug!)
  const unissued = v.rows.filter((r) => r.state === "created" && !r.awb_number && r.dispatch_state !== "cancelled")
  const paid = v.batch.counter_payment_status === "paid"
  async function pay() {
    setPending(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/app/bulk/${v.batch.id}/pay`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ method, cashReceivedIdr: method === "tunai" ? Number(cash.replace(/\D/g, "")) : undefined }) })
      const j = (await res.json()) as { ok: boolean; data?: { totalIdr: number; changeIdr: number | null }; error?: { message: string } }
      if (!j.ok) setMsg({ tone: "danger", text: j.error!.message })
      else {
        setMsg({ tone: "safe", text: `Lunas ${rp(j.data!.totalIdr)}${j.data!.changeIdr ? ` · kembalian ${rp(j.data!.changeIdr)}` : ""}.` })
        reload()
      }
    } finally {
      setPending(false)
    }
  }
  async function printAll() {
    setMsg(null)
    try {
      // Larger batches split automatically into PDFs of at most 50 labels.
      for (let i = 0; i < issued.length; i += 50) printPdf((await fetchPrint({ slugs: issued.slice(i, i + 50), format: "label_10x15_with_stub" })).blob)
      reload()
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof PrintError ? e.message : "Gagal menyiapkan label." })
    }
  }
  async function cancelUnissued() {
    try {
      const r = await api<{ cancelled: number; skipped: number }>(`/bulk/${v.batch.id}/cancel-unissued`, { body: {} })
      setMsg({ tone: "safe", text: `${r.cancelled} kiriman dibatalkan${r.skipped ? `, ${r.skipped} dilewati (sudah dibayar — batalkan pembayarannya dulu)` : ""}.` })
      reload()
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.body.message : "Gagal membatalkan." })
    }
  }
  return (
    <div className="mt-6 flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6">
      <p className="text-base font-medium">{v.batch.state === "dispatching" ? `Menerbitkan resi… ${issued.length} dari ${v.rows.filter((r) => r.state === "created").length}` : `${issued.length} resi terbit`}</p>
      {paid ? (
        <p className="text-base text-safe font-medium">Batch sudah lunas{v.batch.change_idr ? ` · kembalian ${rp(v.batch.change_idr)}` : ""}.</p>
      ) : v.batch.counter_payment_status === "not_required" || v.totals.due === 0 ? (
        <p className="text-base font-medium">Tidak ada pembayaran di loket untuk batch ini (semua COD).</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <ToggleGroup value={[method]} onValueChange={(x) => x[0] && setMethod(x[0] as typeof method)} variant="outline" aria-label="Cara bayar">
            <ToggleGroupItem value="qris">QRIS gerai</ToggleGroupItem>
            <ToggleGroupItem value="tunai">Tunai</ToggleGroupItem>
            <ToggleGroupItem value="transfer">Transfer</ToggleGroupItem>
          </ToggleGroup>
          {method === "tunai" ? <Field><FieldLabel htmlFor="uang">Uang diterima</FieldLabel><Input id="uang" inputMode="numeric" className="w-40 tabular-nums" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} /></Field> : null}
          <Button size="lg" disabled={pending || (method === "tunai" && !cash)} onClick={pay}>Tandai Lunas {rp(v.totals.due)}</Button>
        </div>
      )}
      {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={`border-l-4 py-1 pl-3 text-base font-medium ${msg.tone === "danger" ? "border-danger text-danger" : "border-safe text-safe"}`}>{msg.text}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={issued.length === 0} onClick={printAll}><PrinterIcon aria-hidden /> Cetak Semua ({issued.length})</Button>
        {unissued.length ? <Button variant="ghost" onClick={cancelUnissued}>Batalkan yang Belum Terbit ({unissued.length})</Button> : null}
      </div>
    </div>
  )
}
