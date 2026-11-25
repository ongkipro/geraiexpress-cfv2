import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, CheckIcon, ClockIcon, CopyIcon, ExternalLinkIcon, MapPinIcon, PackageIcon, PrinterIcon, RefreshCwIcon, RotateCcwIcon, TruckIcon, UserIcon, UserPlusIcon } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { api, ApiError } from "../../lib/api"
import { courierLabel, statusLabel } from "../../lib/status"
import { ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { rp } from "../kasir/quote-panel"
import { PresetPicker, PRESET_LABEL, type MaskPreset } from "../../components/masking/preset-picker"
import { PrintDrawer } from "../../print/drawer"
import { CheckboxField, Panel, SectionCard, StatusBadge, type StatusTone } from "../../components/admin/page"
import { LinkButton } from "../../components/admin/link-button"

// `/kiriman/:slug` checkout & INV detail (visual 07 §3.2, visual 05 stages 3–6, DEC-220): sender → recipient & contents
// → locked summary → payment → live Mengantar sync + checkpoint timeline + print + cancel.
type Method = "qris" | "tunai" | "transfer" | "later"
export interface Contact { id: string; true_name?: string; name?: string; true_phone?: string; phone?: string; wa_verified_at?: number | null; street_address?: string; true_street?: string | null; subdistrict_name?: string | null; true_area_label?: string | null; postal_code?: string | null; true_postal_code?: string | null; display_brand_name?: string | null; sender_kind?: string }
interface ShipmentEvent {
  source: string
  raw_category: string | null
  mapped_status: string | null
  status_text: string | null
  event_at: number
  event_at_text: string | null
}
interface Detail {
  shipment: Record<string, unknown> & { slug: string; status: string; dispatch_state: string; counter_payment_status: string; counter_payment_method?: string | null; counter_due_idr: number; awb_number: string | null; courier_code: string; cod_fee_mode: string; publish_shipping_idr: number; packing_addon_idr: number; cod_collection_total_idr: number; sender_cod_payable_idr: number; dispatch_error: string | null; estimated_profit_idr?: number; gerai_shipping_cost_idr?: number; content_declaration_text: string | null; prohibited_ack_at: number | null; mask_preset: MaskPreset; mask_snapshot_json: string | null; created_at?: number; issued_at?: number | null; last_polled_at?: number | null; provider_status_conflict_at?: number | null }
  quote: (Record<string, unknown> & { service_code: string; billable_weight_gram: number; expires_at: number; cod_fee_idr: number }) | null
  sender: Contact | null
  recipient: Contact | null
  receipts: Array<{ id: string; event: string; amount_idr: number; method: string; created_at: number }>
  events: ShipmentEvent[]
  preflight?: { balance_sufficient: boolean | null; synced_balance_idr?: number | null; estimated_debit_idr?: number | null }
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
const METHOD_NAME: Record<string, string> = { qris: "QRIS", tunai: "Tunai", transfer: "Transfer", deposit: "Deposit" }
const EVENT_SOURCE: Record<string, string> = { webhook: "Webhook Mengantar", poll: "Sync Mengantar", local: "Loket Gerai" }
const fmtWib = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)
const statusTone = (dispatchState: string, status: string): StatusTone => {
  if (dispatchState === "cancelled" || status === "cancelled") return "muted"
  if (dispatchState !== "issued") return "warn"
  if (status === "delivered") return "safe"
  if (status.startsWith("rts_") || status === "provider_returned" || status === "undelivery_hold" || status === "lost") return "danger"
  return "primary"
}
const newKey = () => crypto.randomUUID().replace(/-/g, "")

export function KirimanDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string }
  const w = useWorkspace()
  const owner = isOwner(w)
  const [d, setD] = useState<Detail | null>(null)
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null)
  const [errState, setErrState] = useState<{ slug: string; msg: string } | null>(null)
  const gen = useRef(0)
  const load = useCallback(() => {
    const mine = ++gen.current
    api<Detail>(`/shipments/${slug}`)
      .then((x) => {
        if (mine !== gen.current) return
        setErrState(null)
        setD(x)
        setLoadedSlug(slug)
      })
      .catch((e) => {
        if (mine !== gen.current) return
        setErrState({ slug, msg: e instanceof ApiError ? e.body.message : "Kiriman tidak dapat dimuat." })
        setLoadedSlug(slug)
      })
  }, [slug])
  useEffect(() => {
    load()
    const g = gen
    return () => { g.current++ }
  }, [load])
  const error = errState?.slug === slug ? errState.msg : null
  if (error) return <div><PageTitle title={`INV ${slug.toUpperCase()}`} /><ErrorState message={error} onRetry={load} /></div>
  if (!d || loadedSlug !== slug) return <div><PageTitle title={`INV ${slug.toUpperCase()}`} /><LoadingState label="Memuat kiriman" rows={5} /></div>
  const s = d.shipment
  const done = ["issued", "provider_unpaid_hold", "cancelled", "reconciliation_needed", "cancel_unknown"].includes(s.dispatch_state)
  const headlineStatus = s.dispatch_state === "issued" ? statusLabel(s.status) : (STATE_LABEL[s.dispatch_state] ?? statusLabel(s.status))
  return (
    <div className="pb-32 md:pb-0">
      <div className="mb-2 flex items-center">
        <Link to="/kiriman" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-slate-900 md:min-h-8">
          <ArrowLeftIcon aria-hidden className="size-4" /> Kembali ke Daftar Kiriman
        </Link>
      </div>
      <PageTitle
        title={`INV ${slug.toUpperCase()}`}
        description={`${headlineStatus}${s.created_at ? ` · Dibuat ${fmtWib(Number(s.created_at))} WIB` : ""}`}
      >
        <StatusBadge tone={statusTone(s.dispatch_state, s.status)}>{headlineStatus}</StatusBadge>
      </PageTitle>
      {done ? <IssuedView key={s.slug} d={d} owner={owner} reload={load} /> : <CheckoutView key={s.slug} d={d} owner={owner} reload={load} />}
    </div>
  )
}

function Summary({ d, owner }: { d: Detail; owner: boolean }) {
  const s = d.shipment
  const cod = s.cod_fee_mode !== "none"
  return (
    <SectionCard id="ringkasan" title="Ringkasan (terkunci)">
      <dl className="flex flex-col gap-2 text-base md:text-sm tabular-nums">
        <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Ekspedisi</dt><dd>{courierLabel(s.courier_code)} · {d.quote?.service_code}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Berat ditagih</dt><dd>{((d.quote?.billable_weight_gram ?? 0) / 1000).toLocaleString("id-ID")} kg</dd></div>
        {Number(s.item_quantity ?? 1) > 1 ? <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Jumlah barang</dt><dd>{String(s.item_quantity)}</dd></div> : null}
        {d.quote && Number(d.quote.declared_value_idr ?? 0) > 0 ? <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Nilai barang</dt><dd>{rp(Number(d.quote.declared_value_idr))}</dd></div> : null}
        {d.quote && Number(d.quote.is_dangerous_goods ?? 0) === 1 ? <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Barang berbahaya</dt><dd>Ya (DG)</dd></div> : null}
        {s.delivery_instruction ? <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Instruksi kurir</dt><dd className="text-right">{String(s.delivery_instruction)}</dd></div> : null}
        <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Ongkir</dt><dd>{rp(s.publish_shipping_idr)}</dd></div>
        {s.packing_addon_idr ? <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Packing</dt><dd>{rp(s.packing_addon_idr)}</dd></div> : null}
        {cod ? (
          <>
            <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Ditagih kurir ke penerima</dt><dd>{rp(s.cod_collection_total_idr)}</dd></div>
            {s.cod_fee_mode !== "dfod" ? <div className="flex justify-between gap-3"><dt className="text-xs text-muted-foreground">Cair ke pengirim</dt><dd>{rp(s.sender_cod_payable_idr)}</dd></div> : null}
          </>
        ) : null}
        <div className="flex justify-between gap-3 border-t pt-2 text-sm font-semibold md:text-base"><dt>Bayar di loket</dt><dd>{rp(s.counter_due_idr)}</dd></div>
        {owner && typeof s.estimated_profit_idr === "number" ? <div className="flex justify-between gap-3 text-muted-foreground"><dt>Estimasi laba</dt><dd>{rp(s.estimated_profit_idr)}</dd></div> : null}
      </dl>
    </SectionCard>
  )
}

/** `limit`: how many recent/matching contacts to list (the POS cards show 4, DEC-251A). */
export function PartyPicker({
  kind,
  value,
  onPick,
  onCreateNew,
  disabled = false,
  limit = 6,
}: {
  kind: "senders" | "recipients"
  value: Contact | null
  onPick: (c: Contact) => void
  /** Opens the quick-create popup prefilled with the current search query when no contact matches. */
  onCreateNew?: (query: string) => void
  disabled?: boolean
  limit?: number
}) {
  const [q, setQ] = useState("")
  const key = `${kind}:${limit}:${q}`
  const [res, setRes] = useState<{ key: string; items: Contact[]; err: string | null }>({ key: "", items: [], err: null })
  const items = res.items
  const loading = res.key !== key
  const err = res.key === key ? res.err : null
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      api<{ items: Contact[] }>(`/contacts/${kind}?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (!alive) return
          setRes({ key, items: r.items.slice(0, limit), err: null })
        })
        .catch((e) => {
          if (!alive) return
          setRes({ key, items: [], err: e instanceof ApiError ? e.body.message : "Daftar kontak gagal dimuat." })
        })
    }, 200)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q, kind, limit, key])
  const label = kind === "senders" ? "Pengirim" : "Penerima"
  const trimmedQ = q.trim()
  const shortQ = trimmedQ.length > 26 ? `${trimmedQ.slice(0, 26)}…` : trimmedQ
  return (
    <div className="flex flex-col gap-2">
      <Input aria-label={`Cari ${label.toLowerCase()}`} placeholder={`Cari ${label.toLowerCase()} (nama atau nomor HP)`} value={q} onChange={(e) => setQ(e.target.value)} type="search" />
      <ul className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label={`Pilihan ${label.toLowerCase()}`}>
        {items.map((c) => (
          <li key={c.id}>
            <button type="button" aria-pressed={value?.id === c.id} onClick={() => onPick(c)} className={`flex min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-base transition-colors md:text-sm ${value?.id === c.id ? "bg-primary/10 font-medium" : "hover:bg-slate-50"}`}>
              <span className="w-full truncate font-medium text-slate-900">{c.display_brand_name ?? c.true_name ?? c.name}</span>
              <span className="w-full truncate text-xs text-muted-foreground tabular-nums">{c.true_phone ?? c.phone}{c.subdistrict_name ? ` · ${c.subdistrict_name}${c.postal_code ? ` ${c.postal_code}` : ""}` : ""}{kind === "senders" ? (c.wa_verified_at ? " · WA terverifikasi" : " · WA belum diverifikasi") : ""}</span>
            </button>
          </li>
        ))}
        {err ? (
          <li className="px-3 py-2.5 text-base md:text-sm text-danger">{err}</li>
        ) : loading ? (
          <li className="px-3 py-2.5 text-base md:text-sm text-muted-foreground">Memuat {label.toLowerCase()}…</li>
        ) : items.length === 0 ? (
          <li className="flex flex-col gap-2 bg-slate-50/75 px-3.5 py-3">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-slate-800">
                {trimmedQ
                  ? `Data ${label.toLowerCase()} “${shortQ}” belum tercatat di gerai.`
                  : `Belum ada data ${label.toLowerCase()} tersimpan.`}
              </p>
              <p className="text-xs text-muted-foreground">
                {onCreateNew
                  ? "Klik tombol di bawah untuk langsung menambahkan data baru."
                  : `Tambahkan dulu melalui tombol + ${label} Baru atau menu Kontak.`}
              </p>
            </div>
            {onCreateNew ? (
              <Button
                type="button"
                size="sm"
                disabled={disabled}
                onClick={() => onCreateNew(trimmedQ)}
                className="w-full justify-center"
              >
                <UserPlusIcon aria-hidden />
                {trimmedQ ? `Daftarkan “${shortQ}” Sekarang` : `Daftarkan ${label} Pertama`}
              </Button>
            ) : null}
          </li>
        ) : null}
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
  const [preset, setPreset] = useState<MaskPreset>(s.mask_preset ?? "standar_gerai")
  const w = useWorkspace()
  const [method, setMethod] = useState<Method>(s.counter_payment_status === "not_required" ? "later" : "qris")
  const [cash, setCash] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(s.dispatch_error)
  const [pending, setPending] = useState(false)
  const [payKey] = useState(newKey)
  const due = s.counter_due_idr
  const alreadyPaid = s.counter_payment_status === "paid"
  const needPay = s.counter_payment_status === "unpaid" && method !== "later"
  const cashNum = Number(cash.replace(/\D/g, ""))

  async function submit() {
    if (pending) return
    setPending(true)
    setErrors({})
    setMsg(null)
    try {
      await api(`/shipments/${s.slug}/parties`, { body: { senderId: sender?.id, recipientId: recipient?.id, content, prohibitedAck: ack, maskPreset: preset } })
      if (needPay) {
        const res = await fetch(`/api/app/shipments/${s.slug}/payment`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": payKey }, body: JSON.stringify({ method, cashReceivedIdr: method === "tunai" ? cashNum : undefined }) })
        const j = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string; field_errors: Record<string, string> } } | null
        if (!j?.ok) throw new ApiError(res.status, { code: "PAYMENT", message: j?.error?.message ?? "Pembayaran gagal dicatat.", field_errors: j?.error?.field_errors ?? {} })
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

  const primary = alreadyPaid ? "Terbitkan Resi & Cetak" : needPay ? `Tandai Lunas & Cetak · ${rp(due)}` : s.counter_payment_status === "unpaid" ? "Simpan & Cetak (belum dibayar)" : "Simpan & Cetak"
  const busy = s.dispatch_state === "issuing_in_flight" || s.dispatch_state === "reconciliation_needed"
  const cashShort = needPay && method === "tunai" && cashNum < due
  return (
    <div className="grid gap-4 md:gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-4 md:gap-5">
        <SectionCard id="pengirim" title="Pengirim">
          <div className="flex flex-col gap-3">
          <PartyPicker kind="senders" value={sender} onPick={setSender} />
          {errors.senderId ? <p role="alert" className="text-base md:text-sm text-danger">{errors.senderId}</p> : null}
          <PresetPicker value={preset} onChange={setPreset} cod={s.cod_fee_mode !== "none"} reseller={sender?.sender_kind === "reseller_dropship"} preview={{ sender: sender?.true_name ?? "Pengirim", brand: sender?.display_brand_name ?? null, outlet: w.tenant.name, recipientPhone: recipient?.phone ?? null }} />
          {errors.maskPreset ? <p role="alert" className="text-base md:text-sm text-danger">{errors.maskPreset}</p> : null}
        </div>
        </SectionCard>
        <SectionCard id="penerima" title="Penerima & isi paket">
          <div className="flex flex-col gap-3">
          <PartyPicker kind="recipients" value={recipient} onPick={setRecipient} />
          {errors.recipientId ? <p role="alert" className="text-base md:text-sm text-danger">{errors.recipientId}</p> : null}
          <Field data-invalid={errors.content ? true : undefined}>
            <FieldLabel htmlFor="isi">Isi paket</FieldLabel>
            <Input id="isi" value={content} onChange={(e) => setContent(e.target.value)} maxLength={100} placeholder="Contoh: Pakaian" />
            {errors.content ? <FieldError>{errors.content}</FieldError> : null}
          </Field>
          <CheckboxField checked={ack} onCheckedChange={setAck}>
            Isi paket bukan barang terlarang atau berbahaya
          </CheckboxField>
          {errors.prohibitedAck ? <p role="alert" className="text-base md:text-sm text-danger">{errors.prohibitedAck}</p> : null}
        </div>
        </SectionCard>
      </div>
      <div className="flex flex-col gap-4 md:gap-5">
        <Summary d={d} owner={owner} />
        <SectionCard id="bayar" title="Pembayaran loket">
          <div className="flex flex-col gap-3">
          {alreadyPaid ? (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">Pembayaran sudah tercatat lunas. Tekan tombol di bawah untuk menerbitkan resi.</p>
          ) : s.counter_payment_status === "not_required" ? (
            <p className="text-base md:text-sm text-muted-foreground">Tidak ada yang dibayar di loket.</p>
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
                  {cashNum >= due ? <p className="text-base md:text-sm font-medium text-safe tabular-nums">Kembalian {rp(cashNum - due)}</p> : <FieldDescription>Masukkan uang diterima minimal {rp(due)}.</FieldDescription>}
                </Field>
              ) : null}
              {method === "qris" || method === "transfer" ? <p className="text-base md:text-sm text-muted-foreground">Pastikan dana sudah masuk ke rekening/QRIS gerai sebelum menandai lunas.</p> : null}
            </>
          )}
          {d.preflight?.balance_sufficient === false ? (
            <p role="status" className="border-l-4 border-warn py-1 pl-3 text-base md:text-sm font-medium">
              {owner && d.preflight.synced_balance_idr != null && d.preflight.estimated_debit_idr != null
                ? `Saldo Mengantar tercatat ${rp(d.preflight.synced_balance_idr)}, estimasi debet ${rp(d.preflight.estimated_debit_idr)}. Kiriman akan disimpan sebagai Menunggu Saldo sampai saldo diisi.`
                : "Saldo pengiriman gerai belum mencukupi untuk menerbitkan resi sekarang. Kiriman akan disimpan sebagai Menunggu Saldo — silakan beri tahu pemilik gerai."}
            </p>
          ) : null}
          {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base md:text-sm font-medium text-danger">{msg}</p> : null}
          {busy ? <p role="status" className="text-base md:text-sm text-warn">Status penerbitan sedang dipastikan ke Mengantar. Jangan buat ulang kiriman ini.</p> : null}
          <Button className="hidden md:inline-flex" size="lg" onClick={submit} disabled={pending || busy || cashShort}>
            <PrinterIcon aria-hidden /> {pending ? "Memproses…" : primary}
          </Button>
        </div>
        </SectionCard>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-card p-3 md:hidden">
        <span className="flex flex-col text-base md:text-sm tabular-nums"><span className="text-muted-foreground">Total</span><strong>{rp(due)}</strong></span>
        <Button className="flex-1" size="lg" onClick={submit} disabled={pending || busy || cashShort}>
          {pending ? "Memproses…" : alreadyPaid ? "Terbitkan & Cetak" : needPay ? "Tandai Lunas & Cetak" : "Simpan & Cetak"}
        </Button>
      </div>
    </div>
  )
}

function ShipmentProgress({ dispatchState, status }: { dispatchState: string; status: string }) {
  const isCancelled = dispatchState === "cancelled" || status === "cancelled"
  const isRts = status.startsWith("rts_") || status === "provider_returned"
  const isHold = status === "undelivery_hold" || status === "lost"
  const steps = [
    { key: "created", label: "Dibuat & Resi", icon: PackageIcon },
    { key: "pickup", label: "Pickup Kurir", icon: TruckIcon },
    { key: "transit", label: "Dalam Perjalanan", icon: ClockIcon },
    { key: "final", label: isRts ? "Retur" : isHold ? "Kendala Antar" : "Terkirim", icon: isRts ? RotateCcwIcon : isHold ? AlertTriangleIcon : CheckCircle2Icon },
  ]
  let reached = 0
  if (dispatchState === "issued") {
    if (status === "ready_for_pickup") reached = 1
    else if (status === "handed_to_courier") reached = 2
    else if (status === "in_transit") reached = 3
    else if (status === "delivered" || isRts || isHold) reached = 4
  }
  if (isCancelled) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-muted-foreground">
        Kiriman ini telah <strong className="text-slate-900">dibatalkan</strong> dan tidak diproses oleh ekspedisi.
      </div>
    )
  }
  return (
    <ol aria-label="Tahapan proses pengiriman" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {steps.map((st, idx) => {
        const active = idx + 1 === reached
        const doneStep = idx + 1 < reached || (idx === 3 && status === "delivered")
        const isDangerStep = idx === 3 && (isRts || isHold)
        const Icon = st.icon
        return (
          <li
            key={st.key}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium ${
              isDangerStep
                ? "border-danger/40 bg-danger-bg text-danger"
                : doneStep
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : active
                    ? "border-primary/40 bg-accent/60 text-slate-950"
                    : "border-slate-200/80 bg-slate-50/70 text-muted-foreground"
            }`}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{st.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function IssuedView({ d, owner, reload }: { d: Detail; owner: boolean; reload: () => void }) {
  const s = d.shipment
  const w = useWorkspace()
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmKind, setConfirmKind] = useState<"void" | "cancel" | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [payMethod, setPayMethod] = useState<"qris" | "tunai" | "transfer">("qris")
  const [payCash, setPayCash] = useState("")
  const [payErr, setPayErr] = useState<string | null>(null)
  const [payKey, setPayKey] = useState(newKey)
  const payCashNum = Number(payCash.replace(/\D/g, ""))

  const act = async (fn: () => Promise<unknown>, okText?: string) => {
    if (pending) return
    setPending(true)
    setMsg(null)
    try {
      await fn()
      setReason("")
      if (okText) setMsg({ tone: "safe", text: okText })
      reload()
    } catch (err) {
      setMsg({ tone: "danger", text: err instanceof ApiError ? err.body.message : "Gagal. Coba lagi." })
    } finally {
      setPending(false)
    }
  }
  async function syncNow() {
    if (syncing) return
    setSyncing(true)
    setMsg(null)
    try {
      const r = await api<{ synced: boolean; changed: boolean; status: string; eventsAdded: number; note?: string }>(`/shipments/${s.slug}/sync`, { body: {} })
      if (!r.synced) setMsg({ tone: "danger", text: r.note ?? "Sinkronisasi status ke Mengantar belum berhasil." })
      else if (r.changed || r.eventsAdded > 0) setMsg({ tone: "safe", text: `Status disinkronkan dari Mengantar: ${statusLabel(r.status)} (${r.eventsAdded} checkpoint baru).` })
      else setMsg({ tone: "safe", text: r.note ?? `Status terbaru di Mengantar: ${statusLabel(r.status)}.` })
      reload()
    } catch (err) {
      setMsg({ tone: "danger", text: err instanceof ApiError ? err.body.message : "Gagal menyinkronkan status dari Mengantar." })
    } finally {
      setSyncing(false)
    }
  }
  async function confirmPay() {
    if (pending) return
    setPending(true)
    setPayErr(null)
    setMsg(null)
    try {
      const res = await fetch(`/api/app/shipments/${s.slug}/payment`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": payKey },
        body: JSON.stringify({ method: payMethod, cashReceivedIdr: payMethod === "tunai" ? payCashNum : undefined }),
      })
      const j = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null
      if (!j?.ok) {
        setPayErr(j?.error?.message ?? "Pembayaran gagal dicatat.")
        return
      }
      setPayOpen(false)
      setPayCash("")
      setPayKey(newKey())
      setMsg({ tone: "safe", text: `INV ${s.slug.toUpperCase()} ditandai lunas (${METHOD_NAME[payMethod] ?? payMethod}).` })
      reload()
    } catch {
      setPayErr("Koneksi terputus saat mencatat pembayaran.")
    } finally {
      setPending(false)
    }
  }
  function copyAwb() {
    if (!s.awb_number) return
    navigator.clipboard?.writeText(s.awb_number).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => undefined,
    )
  }

  let printedSenderName: string | null = null
  let printedSenderPhone: string | null = null
  if (s.mask_snapshot_json) {
    try {
      const snap = JSON.parse(s.mask_snapshot_json) as { sender?: { name?: string; phone?: string } }
      printedSenderName = snap.sender?.name ?? null
      printedSenderPhone = snap.sender?.phone ?? null
    } catch {
      // ignore invalid JSON
    }
  }
  const isRts = s.status.startsWith("rts_") || s.status === "provider_returned"
  const isIssue = s.status === "undelivery_hold" || s.status === "lost" || !!s.provider_status_conflict_at
  const events = d.events ?? []

  return (
    <div className="grid gap-4 md:gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-4 md:gap-5">
        <Panel className="flex flex-col gap-4">
          {s.dispatch_state === "issued" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold md:text-base text-safe">
                  <CheckCircle2Icon aria-hidden className="size-5" /> Resi terbit · {statusLabel(s.status)}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
                  <RefreshCwIcon aria-hidden className={syncing ? "animate-spin" : ""} /> {syncing ? "Menyinkronkan…" : "Sinkronkan Status"}
                </Button>
              </div>
              <ShipmentProgress dispatchState={s.dispatch_state} status={s.status} />
              <div className="flex flex-wrap items-center gap-2 text-base md:text-sm tabular-nums">
                <span>{courierLabel(s.courier_code)} · AWB <strong className="font-mono">{s.awb_number}</strong>{s.sorting_code ? ` · Kode sortir ${String(s.sorting_code)}` : ""}</span>
                {s.awb_number ? (
                  <Button type="button" variant="outline" size="sm" onClick={copyAwb}>
                    {copied ? <><CheckIcon aria-hidden /> Tersalin</> : <><CopyIcon aria-hidden /> Salin Resi</>}
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge tone={s.counter_payment_status === "paid" ? "safe" : s.counter_payment_status === "unpaid" ? "warn" : "muted"}>
                  {s.counter_payment_status === "paid"
                    ? `LUNAS${s.counter_payment_method ? ` · ${METHOD_NAME[String(s.counter_payment_method)] ?? String(s.counter_payment_method)}` : ""}`
                    : s.counter_payment_status === "unpaid"
                      ? "BELUM DIBAYAR"
                      : "Tanpa tagihan loket"}
                </StatusBadge>
                {s.counter_payment_status === "unpaid" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => { setPayErr(null); setPayCash(""); setPayOpen(true) }}>
                    Tandai Lunas
                  </Button>
                ) : null}
                {isRts ? (
                  <LinkButton variant="outline" size="sm" to="/kiriman" search={{ tab: "retur" } as never}>
                    <RotateCcwIcon aria-hidden data-icon="inline-start" /> Buka Meja Retur
                  </LinkButton>
                ) : null}
                {isIssue ? (
                  <LinkButton variant="outline" size="sm" to="/kiriman" search={{ tab: "kendala" } as never}>
                    <AlertTriangleIcon aria-hidden data-icon="inline-start" /> Buka Kendala &amp; Klaim
                  </LinkButton>
                ) : null}
              </div>
              {s.mask_preset && s.mask_preset !== "standar_gerai" ? <Reveal slug={s.slug} preset={s.mask_preset} /> : null}
              {["buyer_bears_fee", "sender_bears_fee", "cod_all_in"].includes(s.cod_fee_mode) ? <CodPayout d={d} owner={owner} reload={reload} /> : null}
              <div><PrintDrawer slug={s.slug} printCount={Number(s.print_count ?? 0)} firstPrintedAt={(s.first_printed_at as number | null) ?? null} onPrinted={reload} /></div>
              {owner && w.hints.sandboxTools ? <SimulateStatus slug={s.slug} reload={reload} /> : null}
            </>
          ) : s.dispatch_state === "provider_unpaid_hold" ? (
            <>
              <p className="text-sm font-semibold md:text-base text-warn">Menunggu saldo Mengantar</p>
              <p className="text-base md:text-sm">Kiriman sudah tercatat di Mengantar tetapi resi belum terbit karena saldo kurang. Isi saldo, lalu tekan tombol di bawah. Label belum bisa dicetak.</p>
              <div><Button onClick={() => act(() => api(`/shipments/${s.slug}/pay-unpaid`, { body: {} }), "Pembayaran ke Mengantar berhasil dan resi diterbitkan.")} disabled={pending}>{pending ? "Memproses…" : "Bayar ke Mengantar & Terbitkan Resi"}</Button></div>
            </>
          ) : s.dispatch_state === "reconciliation_needed" || s.dispatch_state === "cancel_unknown" ? (
            <>
              <p className="text-sm font-semibold md:text-base text-warn">{STATE_LABEL[s.dispatch_state]}</p>
              <p className="text-base md:text-sm text-muted-foreground">Status kiriman di Mengantar perlu dipastikan ulang agar tidak terjadi pengiriman ganda.</p>
              <div>
                <Button onClick={() => act(() => api(`/shipments/${s.slug}/reconcile`, { body: {} }), "Pemeriksaan status ke Mengantar selesai.")} disabled={pending}>
                  <RefreshCwIcon aria-hidden className={pending ? "animate-spin" : ""} /> {pending ? "Memeriksa…" : "Periksa Status ke Mengantar"}
                </Button>
              </div>
            </>
          ) : (
            <ShipmentProgress dispatchState={s.dispatch_state} status={s.status} />
          )}
          {msg ? (
            <p role={msg.tone === "danger" ? "alert" : "status"} className={`border-l-4 py-1 pl-3 text-base md:text-sm font-medium ${msg.tone === "danger" ? "border-danger text-danger" : "border-safe text-safe"}`}>
              {msg.text}
            </p>
          ) : null}
          {s.dispatch_state !== "cancelled" ? (
            <div className="flex flex-col gap-2 border-t pt-4">
              <Field>
                <FieldLabel htmlFor="alasan-batal">Alasan pembatalan</FieldLabel>
                <Input id="alasan-batal" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Contoh: pengirim batal kirim" />
                <FieldDescription>Minimal 3 karakter untuk mengaktifkan tombol pembatalan.</FieldDescription>
              </Field>
              <div className="flex flex-wrap gap-2">
                {s.counter_payment_status === "paid" ? (
                  <Button variant="outline" disabled={pending || reason.trim().length < 3} onClick={() => setConfirmKind("void")}>
                    Batalkan Pembayaran
                  </Button>
                ) : null}
                <Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => setConfirmKind("cancel")}>Batalkan Kiriman</Button>
              </div>
            </div>
          ) : null}
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2">
          <SectionCard
            id="info-pengirim"
            title="Pengirim"
            action={
              d.sender ? (
                <Link to="/kontak/pengirim/$id" params={{ id: d.sender.id }} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Riwayat <ExternalLinkIcon aria-hidden className="size-3" />
                </Link>
              ) : null
            }
          >
            {d.sender ? (
              <div className="flex flex-col gap-1 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-slate-950">
                  <UserIcon aria-hidden className="size-4 text-muted-foreground" />
                  {d.sender.display_brand_name ?? d.sender.true_name}
                </p>
                {d.sender.display_brand_name ? <p className="text-xs text-muted-foreground">Pengirim asli: {d.sender.true_name}</p> : null}
                <p className="text-muted-foreground tabular-nums">{d.sender.true_phone}</p>
                {d.sender.true_area_label ? <p className="text-xs text-muted-foreground">{d.sender.true_area_label}</p> : null}
              </div>
            ) : (
              <div className="flex flex-col gap-1 text-sm">
                <p className="font-semibold text-slate-950">{printedSenderName ?? "Pengirim disamarkan"}</p>
                {printedSenderPhone ? <p className="text-muted-foreground tabular-nums">{printedSenderPhone}</p> : null}
                <p className="text-xs text-muted-foreground">Preset label: {PRESET_LABEL[s.mask_preset] ?? s.mask_preset}. Gunakan “Lihat Pengirim Asli” di atas jika perlu verifikasi.</p>
              </div>
            )}
          </SectionCard>

          <SectionCard
            id="info-penerima"
            title="Penerima"
            action={
              d.recipient ? (
                <Link to="/kontak/penerima/$id" params={{ id: d.recipient.id }} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Riwayat <ExternalLinkIcon aria-hidden className="size-3" />
                </Link>
              ) : null
            }
          >
            {d.recipient ? (
              <div className="flex flex-col gap-1 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-slate-950">
                  <UserIcon aria-hidden className="size-4 text-muted-foreground" />
                  {d.recipient.name}
                </p>
                <p className="text-muted-foreground tabular-nums">{d.recipient.phone}</p>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPinIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {d.recipient.street_address}
                    {d.recipient.subdistrict_name ? `, ${d.recipient.subdistrict_name}` : ""}
                    {d.recipient.postal_code ? ` ${d.recipient.postal_code}` : ""}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Data penerima belum tercatat.</p>
            )}
          </SectionCard>
        </div>

        <SectionCard
          id="checkpoint-pengiriman"
          title="Riwayat Proses & Checkpoint"
          description={s.last_polled_at ? `Sinkron terakhir ${fmtWib(Number(s.last_polled_at))} WIB` : "Riwayat pergerakan paket dari pickup sampai terkirim atau retur"}
          action={
            s.dispatch_state === "issued" ? (
              <Button type="button" variant="ghost" size="sm" onClick={syncNow} disabled={syncing}>
                <RefreshCwIcon aria-hidden className={syncing ? "animate-spin" : ""} /> Perbarui
              </Button>
            ) : null
          }
        >
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada checkpoint dari ekspedisi. Klik <strong>Sinkronkan Status</strong> untuk menarik status terbaru dari Mengantar.
            </p>
          ) : (
            <ol className="relative flex flex-col gap-3 border-l border-slate-200 pl-4">
              {events.map((ev, idx) => (
                <li key={`${ev.event_at}-${idx}`} className="relative flex flex-col gap-0.5 text-sm">
                  <span
                    aria-hidden
                    className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-white ${idx === 0 ? "bg-primary" : "bg-slate-300"}`}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {ev.status_text || (ev.mapped_status ? statusLabel(ev.mapped_status) : ev.raw_category) || "Pembaruan status"}
                    </span>
                    {ev.mapped_status ? (
                      <StatusBadge tone={statusTone("issued", ev.mapped_status)}>{statusLabel(ev.mapped_status)}</StatusBadge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {fmtWib(ev.event_at)} WIB · {EVENT_SOURCE[ev.source] ?? ev.source}
                    {ev.raw_category && ev.status_text && ev.raw_category !== ev.status_text ? ` (${ev.raw_category})` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      <div className="flex flex-col gap-4 md:gap-5">
        <Summary d={d} owner={owner} />
        {d.receipts.length > 0 ? (
          <SectionCard id="riwayat-bayar" title="Riwayat Pembayaran Loket">
            <ul className="divide-y divide-slate-100 text-sm">
              {d.receipts.map((rc) => {
                const isVoid = rc.event === "void_payment" || rc.event === "void"
                const isPayout = rc.event === "sender_cod_payout"
                const isVoidPayout = rc.event === "void_sender_payout"
                const methodLabel = METHOD_NAME[rc.method] ?? rc.method
                const title = isVoid
                  ? "Pembatalan (Void)"
                  : isPayout
                    ? `Pencairan COD · ${methodLabel}`
                    : isVoidPayout
                      ? "Batal Pencairan COD"
                      : `Lunas · ${methodLabel}`
                const tone = isVoid || isVoidPayout ? "text-danger" : isPayout ? "text-primary" : "text-safe"
                const prefix = isVoid || isPayout ? "-" : ""
                return (
                  <li key={rc.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0 tabular-nums">
                    <div>
                      <span className="font-medium">{title}</span>
                      <span className="block text-xs text-muted-foreground">{fmtWib(rc.created_at)} WIB</span>
                    </div>
                    <span className={`font-semibold ${tone}`}>
                      {prefix}{rp(rc.amount_idr)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </SectionCard>
        ) : null}
      </div>

      <Dialog open={payOpen} onOpenChange={(o) => !o && !pending && setPayOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tandai Lunas INV {s.slug.toUpperCase()}</DialogTitle>
            <DialogDescription>Pilih metode pembayaran loket sebesar <strong className="tabular-nums">{rp(s.counter_due_idr)}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <ToggleGroup value={[payMethod]} onValueChange={(v) => v[0] && setPayMethod(v[0] as typeof payMethod)} variant="outline" aria-label="Metode pembayaran" className="grid w-full grid-cols-3 gap-1.5">
              <ToggleGroupItem value="qris" className="w-full">QRIS</ToggleGroupItem>
              <ToggleGroupItem value="tunai" className="w-full">Tunai</ToggleGroupItem>
              <ToggleGroupItem value="transfer" className="w-full">Transfer</ToggleGroupItem>
            </ToggleGroup>
            {payMethod === "tunai" ? (
              <Field>
                <FieldLabel htmlFor="detail-pay-cash">Uang diterima</FieldLabel>
                <Input id="detail-pay-cash" inputMode="numeric" className="tabular-nums" value={payCash} onChange={(e) => setPayCash(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} />
                {payCashNum >= s.counter_due_idr ? <p className="text-sm font-medium text-safe tabular-nums">Kembalian {rp(payCashNum - s.counter_due_idr)}</p> : <FieldDescription>Minimal {rp(s.counter_due_idr)}.</FieldDescription>}
              </Field>
            ) : null}
            {payErr ? <p role="alert" className="text-sm font-medium text-danger">{payErr}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setPayOpen(false)}>Batal</Button>
            <Button disabled={pending || (payMethod === "tunai" && payCashNum < s.counter_due_idr)} onClick={confirmPay}>{pending ? "Menyimpan…" : "Simpan Lunas"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmKind !== null} onOpenChange={(o) => !o && !pending && setConfirmKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmKind === "void" ? "Batalkan pembayaran loket?" : `Batalkan kiriman INV ${s.slug.toUpperCase()}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind === "void"
                ? `Pembayaran INV ${s.slug.toUpperCase()} akan di-void dengan alasan “${reason.trim()}”.`
                : `Kiriman INV ${s.slug.toUpperCase()} akan dibatalkan di Mengantar dan tidak dapat diterbitkan ulang dengan resi yang sama. Alasan: “${reason.trim()}”.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                const kind = confirmKind
                setConfirmKind(null)
                if (kind === "void") {
                  void act(async () => {
                    const res = await fetch(`/api/app/shipments/${s.slug}/payment`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": newKey() }, body: JSON.stringify({ op: "void_payment", reason }) })
                    const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: { code: string; message: string; field_errors: Record<string, string> } } | null
                    if (!j?.ok) throw new ApiError(res.status, j?.error ?? { code: "UNKNOWN", message: "Pembatalan pembayaran gagal.", field_errors: {} })
                  }, "Pembayaran berhasil dibatalkan (void).")
                } else if (kind === "cancel") {
                  void act(() => api(`/shipments/${s.slug}/cancel`, { body: { reason } }), "Kiriman berhasil dibatalkan.")
                }
              }}
            >
              {confirmKind === "void" ? "Ya, Batalkan Pembayaran" : "Ya, Batalkan Kiriman"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Sandbox only (DEC-238): Mengantar `POST /order/simulation` moves this order without a real courier update. */
function SimulateStatus({ slug, reload }: { slug: string; reload: () => void }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const go = async (status: "ON DELIVERY" | "DELIVERED" | "RTS") => {
    setPending(true)
    setMsg(null)
    try {
      await api("/dev/simulate-status", { body: { slug, status } })
      reload()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Simulasi gagal.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <p className="text-base md:text-sm font-medium">Simulasi status (sandbox)</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => go("ON DELIVERY")}>Sedang diantar</Button>
        <Button variant="outline" disabled={pending} onClick={() => go("DELIVERED")}>Terkirim</Button>
        <Button variant="outline" disabled={pending} onClick={() => go("RTS")}>Retur</Button>
      </div>
      {msg ? <p role="alert" className="text-base md:text-sm text-danger">{msg}</p> : null}
    </div>
  )
}

function Reveal({ slug, preset }: { slug: string; preset: MaskPreset }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [who, setWho] = useState<{ name: string; phone: string; brand: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  if (who) return <p className="rounded-lg bg-muted px-3 py-2 text-base md:text-sm">Pengirim asli: <strong>{who.name}</strong> · {who.phone}{who.brand ? ` (toko ${who.brand})` : ""}</p>
  if (!open) return <div><Button variant="outline" onClick={() => setOpen(true)}>Lihat Pengirim Asli</Button> <span className="text-base md:text-sm text-muted-foreground">Label: {PRESET_LABEL[preset]}</span></div>
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (pending) return
        setPending(true)
        setError(null)
        try {
          setWho(await api(`/shipments/${slug}/reveal-sender`, { body: { reason } }))
        } catch (err) {
          setError(err instanceof ApiError ? err.body.message : "Gagal.")
        } finally {
          setPending(false)
        }
      }}
      className="flex flex-col gap-2 border-t pt-3"
      noValidate
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="alasan-buka">Alasan membuka data pengirim asli (dicatat)</FieldLabel>
        <Input id="alasan-buka" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        {error ? <FieldError>{error}</FieldError> : <FieldDescription>Minimal 5 karakter.</FieldDescription>}
      </Field>
      <div className="flex gap-2"><Button type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Membuka…" : "Buka"}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Batal</Button></div>
    </form>
  )
}

function CodPayout({ d, owner, reload }: { d: Detail; owner: boolean; reload: () => void }) {
  const s = d.shipment
  const payable = Number(s.sender_cod_payable_idr ?? 0)
  const paid = Number((s as Record<string, unknown>).sender_cod_paid_idr ?? 0)
  const settled = (s as Record<string, unknown>).cod_credit_settled === true
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<"tunai" | "transfer">("tunai")
  const [override, setOverride] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [key, setKey] = useState(newKey)
  const remaining = payable - paid
  const canPay = settled || owner
  async function pay() {
    if (pending || !canPay) return
    setPending(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/app/shipments/${s.slug}/cod-payout`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ amountIdr: Number(amount.replace(/\D/g, "")), method, override: settled ? undefined : override }) })
      const j = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null
      if (!j?.ok) setMsg(j?.error?.message ?? "Pencairan COD gagal dicatat.")
      else {
        // A partial payout is done: the next one is a new money event with its own key.
        setKey(newKey())
        setAmount("")
        setOverride("")
        reload()
      }
    } catch {
      setMsg("Koneksi terputus saat mencatat pencairan COD. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-base md:text-sm font-medium tabular-nums">Hak COD pengirim {rp(payable)} · sudah dibayar {rp(paid)} · sisa {rp(remaining)}</p>
      {remaining > 0 ? (
        <>
          {!settled ? <p className="text-base md:text-sm text-muted-foreground">Dana COD belum masuk ke saldo Mengantar.{owner ? " Pemilik bisa bayar lebih dulu dengan alasan." : " Hanya pemilik gerai yang dapat mencairkan sebelum dana masuk."}</p> : null}
          {canPay ? (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <Field><FieldLabel htmlFor="cair">Nominal pencairan</FieldLabel><Input id="cair" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} className="w-40 tabular-nums" /></Field>
                <ToggleGroup value={[method]} onValueChange={(v) => v[0] && setMethod(v[0] as "tunai" | "transfer")} variant="outline" aria-label="Cara pencairan">
                  <ToggleGroupItem value="tunai">Tunai</ToggleGroupItem>
                  <ToggleGroupItem value="transfer">Transfer</ToggleGroupItem>
                </ToggleGroup>
              </div>
              {!settled && owner ? <Field><FieldLabel htmlFor="lebih-dulu">Alasan bayar sebelum cair</FieldLabel><Input id="lebih-dulu" value={override} onChange={(e) => setOverride(e.target.value)} maxLength={200} /></Field> : null}
              <div><Button variant="outline" onClick={pay} disabled={pending || !amount || (!settled && override.trim().length < 5)}>{pending ? "Memproses…" : "Cairkan ke Pengirim"}</Button></div>
            </>
          ) : null}
        </>
      ) : null}
      {msg ? <p role="alert" className="text-base md:text-sm text-danger">{msg}</p> : null}
    </div>
  )
}
