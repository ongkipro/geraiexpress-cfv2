import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { CheckCircle2Icon, PrinterIcon } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Field, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { api, ApiError } from "../../lib/api"
import { ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { rp } from "../kasir/quote-panel"

// `/kiriman/:slug` checkout (visual 07 §3.2, visual 05 stages 3–6, DEC-220): sender → recipient & contents → locked
// summary → record payment → one primary `Tandai Lunas & Cetak` (or `Simpan & Cetak` for `Bayar nanti`). The server
// owns every amount (frozen quote); the screen never computes money.
type Method = "qris" | "tunai" | "transfer" | "later"
interface Contact { id: string; true_name?: string; name?: string; true_phone?: string; phone?: string; wa_verified_at?: number | null; street_address?: string; subdistrict_name?: string | null; display_brand_name?: string | null }
interface Detail {
  shipment: Record<string, unknown> & { slug: string; status: string; dispatch_state: string; counter_payment_status: string; counter_due_idr: number; awb_number: string | null; courier_code: string; cod_fee_mode: string; publish_shipping_idr: number; packing_addon_idr: number; cod_collection_total_idr: number; sender_cod_payable_idr: number; dispatch_error: string | null; estimated_profit_idr?: number; gerai_shipping_cost_idr?: number; content_declaration_text: string | null; prohibited_ack_at: number | null }
  quote: (Record<string, unknown> & { service_code: string; billable_weight_gram: number; expires_at: number; cod_fee_idr: number }) | null
  sender: Contact | null
  recipient: Contact | null
  receipts: Array<{ id: string; event: string; amount_idr: number; method: string; created_at: number }>
}

const STATE_LABEL: Record<string, string> = {
  draft: "Draf",
  issuing_in_flight: "Sedang diterbitkan",
  reconciliation_needed: "Status belum pasti — sedang diperiksa",
  provider_unpaid_hold: "Menunggu saldo Mengantar",
  issued: "Resi terbit",
  failed: "Gagal diterbitkan",
  cancel_unknown: "Pembatalan belum pasti",
  cancelled: "Dibatalkan",
}
const newKey = () => crypto.randomUUID().replace(/-/g, "")

export function KirimanDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string }
  const w = useWorkspace()
  const owner = isOwner(w)
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api<Detail>(`/shipments/${slug}`)
      .then((x) => {
        setError(null)
        setD(x)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Kiriman tidak dapat dimuat."))
  }, [slug])
  useEffect(load, [load])
  if (error) return <div><PageTitle title={`INV ${slug.toUpperCase()}`} /><ErrorState message={error} onRetry={load} /></div>
  if (!d) return <LoadingState label="Memuat kiriman" rows={5} />
  const s = d.shipment
  const done = ["issued", "provider_unpaid_hold", "cancelled"].includes(s.dispatch_state)
  return (
    <div className="pb-32 md:pb-0">
      <nav aria-label="Breadcrumb" className="mb-2 text-base text-muted-foreground">
        <Link to="/kiriman" className="text-primary underline-offset-4 hover:underline">Kiriman</Link> › INV {slug.toUpperCase()}
      </nav>
      <PageTitle title={`INV ${slug.toUpperCase()}`} description={STATE_LABEL[s.dispatch_state] ?? s.status} />
      {done ? <IssuedView d={d} owner={owner} reload={load} /> : <CheckoutView d={d} owner={owner} reload={load} />}
    </div>
  )
}

function Summary({ d, owner }: { d: Detail; owner: boolean }) {
  const s = d.shipment
  const cod = s.cod_fee_mode !== "none"
  return (
    <section className="rounded-lg border bg-card p-4 md:p-6" aria-labelledby="ringkasan">
      <h3 id="ringkasan" className="mb-3 text-lg font-semibold">Ringkasan (terkunci)</h3>
      <dl className="flex flex-col gap-2 text-base tabular-nums">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Ekspedisi</dt><dd>{s.courier_code} · {d.quote?.service_code}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Berat ditagih</dt><dd>{((d.quote?.billable_weight_gram ?? 0) / 1000).toLocaleString("id-ID")} kg</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Ongkir</dt><dd>{rp(s.publish_shipping_idr)}</dd></div>
        {s.packing_addon_idr ? <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Packing</dt><dd>{rp(s.packing_addon_idr)}</dd></div> : null}
        {cod ? (
          <>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Ditagih kurir ke penerima</dt><dd>{rp(s.cod_collection_total_idr)}</dd></div>
            {s.cod_fee_mode !== "dfod" ? <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cair ke pengirim</dt><dd>{rp(s.sender_cod_payable_idr)}</dd></div> : null}
          </>
        ) : null}
        <div className="flex justify-between gap-3 border-t pt-2 text-lg font-semibold"><dt>Bayar di loket</dt><dd>{rp(s.counter_due_idr)}</dd></div>
        {owner && typeof s.estimated_profit_idr === "number" ? <div className="flex justify-between gap-3 text-muted-foreground"><dt>Estimasi laba</dt><dd>{rp(s.estimated_profit_idr)}</dd></div> : null}
      </dl>
    </section>
  )
}

function PartyPicker({ kind, value, onPick }: { kind: "senders" | "recipients"; value: Contact | null; onPick: (c: Contact) => void }) {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<Contact[]>([])
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => api<{ items: Contact[] }>(`/contacts/${kind}?q=${encodeURIComponent(q)}`).then((r) => alive && setItems(r.items.slice(0, 6))).catch(() => undefined), 200)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q, kind])
  const label = kind === "senders" ? "Pengirim" : "Penerima"
  return (
    <div className="flex flex-col gap-2">
      <Input aria-label={`Cari ${label.toLowerCase()}`} placeholder={`Cari ${label.toLowerCase()} (nama atau nomor HP)`} value={q} onChange={(e) => setQ(e.target.value)} type="search" />
      <ul className="flex flex-col divide-y border-y" aria-label={`Pilihan ${label.toLowerCase()}`}>
        {items.map((c) => (
          <li key={c.id}>
            <button type="button" aria-pressed={value?.id === c.id} onClick={() => onPick(c)} className={`flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-base ${value?.id === c.id ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}>
              <span>{c.display_brand_name ?? c.true_name ?? c.name}</span>
              <span className="text-muted-foreground tabular-nums">{c.true_phone ?? c.phone}{c.subdistrict_name ? ` · ${c.subdistrict_name}` : ""}{kind === "senders" ? (c.wa_verified_at ? " · WA terverifikasi" : " · WA belum diverifikasi") : ""}</span>
            </button>
          </li>
        ))}
        {items.length === 0 ? <li className="px-3 py-2 text-base text-muted-foreground">Tidak ada. Tambah lewat menu Kontak.</li> : null}
      </ul>
    </div>
  )
}

function CheckoutView({ d, owner, reload }: { d: Detail; owner: boolean; reload: () => void }) {
  const s = d.shipment
  const [sender, setSender] = useState<Contact | null>(d.sender)
  const [recipient, setRecipient] = useState<Contact | null>(d.recipient)
  const [content, setContent] = useState(s.content_declaration_text ?? "")
  const [ack, setAck] = useState(!!s.prohibited_ack_at)
  const [method, setMethod] = useState<Method>(s.counter_payment_status === "not_required" ? "later" : "qris")
  const [cash, setCash] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(s.dispatch_error)
  const [pending, setPending] = useState(false)
  const [payKey] = useState(newKey)
  const due = s.counter_due_idr
  const needPay = s.counter_payment_status === "unpaid" && method !== "later"
  const cashNum = Number(cash.replace(/\D/g, ""))

  async function submit() {
    if (pending) return
    setPending(true)
    setErrors({})
    setMsg(null)
    try {
      await api(`/shipments/${s.slug}/parties`, { body: { senderId: sender?.id, recipientId: recipient?.id, content, prohibitedAck: ack } })
      if (needPay) {
        const res = await fetch(`/api/app/shipments/${s.slug}/payment`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": payKey }, body: JSON.stringify({ method, cashReceivedIdr: method === "tunai" ? cashNum : undefined }) })
        const j = (await res.json()) as { ok: boolean; error?: { message: string; field_errors: Record<string, string> } }
        if (!j.ok) throw new ApiError(res.status, { code: "PAYMENT", message: j.error!.message, field_errors: j.error!.field_errors })
      }
      await api(`/shipments/${s.slug}/dispatch`, { body: {} })
      reload()
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.body.field_errors)
        setMsg(err.body.message)
      } else setMsg("Gagal memproses. Coba lagi.")
      reload()
    } finally {
      setPending(false)
    }
  }

  const primary = needPay ? `Tandai Lunas & Cetak · ${rp(due)}` : s.counter_payment_status === "unpaid" ? "Simpan & Cetak (belum dibayar)" : "Simpan & Cetak"
  const busy = s.dispatch_state === "issuing_in_flight" || s.dispatch_state === "reconciliation_needed"
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="pengirim">
          <h3 id="pengirim" className="text-lg font-semibold">3. Pengirim</h3>
          <PartyPicker kind="senders" value={sender} onPick={setSender} />
          {errors.senderId ? <p role="alert" className="text-base text-danger">{errors.senderId}</p> : null}
        </section>
        <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="penerima">
          <h3 id="penerima" className="text-lg font-semibold">4. Penerima & isi paket</h3>
          <PartyPicker kind="recipients" value={recipient} onPick={setRecipient} />
          {errors.recipientId ? <p role="alert" className="text-base text-danger">{errors.recipientId}</p> : null}
          <Field data-invalid={errors.content ? true : undefined}>
            <FieldLabel htmlFor="isi">Isi paket</FieldLabel>
            <Input id="isi" value={content} onChange={(e) => setContent(e.target.value)} maxLength={100} placeholder="Contoh: Pakaian" />
            {errors.content ? <FieldError>{errors.content}</FieldError> : null}
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-base">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-5" />
            Isi paket bukan barang terlarang atau berbahaya
          </label>
          {errors.prohibitedAck ? <p role="alert" className="text-base text-danger">{errors.prohibitedAck}</p> : null}
        </section>
      </div>
      <div className="flex flex-col gap-6">
        <Summary d={d} owner={owner} />
        <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="bayar">
          <h3 id="bayar" className="text-lg font-semibold">5. Catat pembayaran</h3>
          {s.counter_payment_status === "not_required" ? (
            <p className="text-base text-muted-foreground">Tidak ada yang dibayar di loket.</p>
          ) : (
            <>
              <ToggleGroup value={[method]} onValueChange={(v) => v[0] && setMethod(v[0] as Method)} variant="outline" aria-label="Cara bayar" className="w-full flex-wrap">
                <ToggleGroupItem value="qris">QRIS gerai</ToggleGroupItem>
                <ToggleGroupItem value="tunai">Tunai</ToggleGroupItem>
                <ToggleGroupItem value="transfer">Transfer</ToggleGroupItem>
                <ToggleGroupItem value="later">Bayar nanti</ToggleGroupItem>
              </ToggleGroup>
              {method === "tunai" ? (
                <Field data-invalid={errors.cashReceivedIdr ? true : undefined}>
                  <FieldLabel htmlFor="uang">Uang diterima</FieldLabel>
                  <Input id="uang" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} className="tabular-nums" />
                  {cashNum >= due ? <p className="text-base tabular-nums">Kembalian {rp(cashNum - due)}</p> : null}
                </Field>
              ) : null}
              {method === "qris" || method === "transfer" ? <p className="text-base text-muted-foreground">Pastikan dana sudah masuk ke rekening/QRIS gerai sebelum menandai lunas.</p> : null}
            </>
          )}
          {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base font-medium text-danger">{msg}</p> : null}
          {busy ? <p role="status" className="text-base text-warn">Status penerbitan sedang dipastikan ke Mengantar. Jangan buat ulang kiriman ini.</p> : null}
          <Button className="hidden md:inline-flex" size="lg" onClick={submit} disabled={pending || busy || (method === "tunai" && cashNum < due)}>
            <PrinterIcon aria-hidden /> {pending ? "Memproses…" : primary}
          </Button>
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-card p-3 md:hidden">
        <span className="flex flex-col text-base tabular-nums"><span className="text-muted-foreground">Total</span><strong>{rp(due)}</strong></span>
        <Button className="flex-1" size="lg" onClick={submit} disabled={pending || busy || (method === "tunai" && cashNum < due)}>
          {pending ? "Memproses…" : needPay ? "Tandai Lunas & Cetak" : "Simpan & Cetak"}
        </Button>
      </div>
    </div>
  )
}

function IssuedView({ d, owner, reload }: { d: Detail; owner: boolean; reload: () => void }) {
  const s = d.shipment
  const [msg, setMsg] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const act = async (fn: () => Promise<unknown>) => {
    setPending(true)
    setMsg(null)
    try {
      await fn()
      reload()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Gagal. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6">
        {s.dispatch_state === "issued" ? (
          <>
            <p className="flex items-center gap-2 text-lg font-semibold text-safe"><CheckCircle2Icon aria-hidden className="size-6" /> Resi terbit</p>
            <p className="text-base tabular-nums">{s.courier_code} · AWB <strong className="font-mono">{s.awb_number}</strong>{s.sorting_code ? ` · Kode sortir ${String(s.sorting_code)}` : ""}</p>
            <p className="text-base">{s.counter_payment_status === "paid" ? "LUNAS" : s.counter_payment_status === "unpaid" ? "BELUM DIBAYAR" : "Tidak ada tagihan loket"}</p>
            <p className="text-base text-muted-foreground">Cetak label tersedia setelah modul cetak aktif.</p>
          </>
        ) : s.dispatch_state === "provider_unpaid_hold" ? (
          <>
            <p className="text-lg font-semibold text-warn">Menunggu saldo Mengantar</p>
            <p className="text-base">Kiriman sudah tercatat di Mengantar tetapi resi belum terbit karena saldo kurang. Isi saldo, lalu tekan tombol di bawah. Label belum bisa dicetak.</p>
            <div><Button onClick={() => act(() => api(`/shipments/${s.slug}/pay-unpaid`, { body: {} }))} disabled={pending}>Bayar ke Mengantar & Terbitkan Resi</Button></div>
          </>
        ) : (
          <p className="text-lg font-semibold">Kiriman dibatalkan</p>
        )}
        {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base font-medium text-danger">{msg}</p> : null}
        {s.dispatch_state !== "cancelled" ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <Field>
              <FieldLabel htmlFor="alasan-batal">Alasan pembatalan</FieldLabel>
              <Input id="alasan-batal" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            </Field>
            <div className="flex flex-wrap gap-2">
              {s.counter_payment_status === "paid" && owner ? (
                <Button variant="outline" disabled={pending || reason.trim().length < 3} onClick={() => act(() => fetch(`/api/app/shipments/${s.slug}/payment`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": newKey() }, body: JSON.stringify({ op: "void_payment", reason }) }))}>
                  Batalkan Pembayaran
                </Button>
              ) : null}
              <Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => act(() => api(`/shipments/${s.slug}/cancel`, { body: { reason } }))}>Batalkan Kiriman</Button>
            </div>
          </div>
        ) : null}
      </section>
      <Summary d={d} owner={owner} />
    </div>
  )
}
