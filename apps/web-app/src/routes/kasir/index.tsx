import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { CheckCircle2Icon, CheckIcon, CopyIcon, MapPinnedIcon, MessageCircleIcon, PlusIcon, PrinterIcon, QrCodeIcon, RotateCcwIcon } from "lucide-react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Field, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { Textarea } from "../../components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { api, ApiError } from "../../lib/api"
import { PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { CheckboxField, Panel } from "../../components/admin/page"
import { PresetPicker, type MaskPreset } from "../../components/masking/preset-picker"
import { PrintDrawer } from "../../print/drawer"
import { AnchorButton } from "../../components/admin/link-button"
import { PartyPicker, type Contact } from "../kiriman/detail"
import { RecipientForm } from "../kontak/penerima"
import { SenderForm } from "../kontak/pengirim"
import { RiskChip, type RiskBadge } from "../kontak/shared"
import { CourierResults, PackageFields, StepTitle, rp, useQuoteForm, type Mode, type QuoteCard, type QuoteInitial, type QuoteRequest } from "./quote-panel"
import { AreaPicker, type Area } from "../../components/area-picker"
import { PickupChip } from "./pickup-chip"
import { usePosConfig } from "../../lib/pos-config"
import { LinkButton } from "../../components/admin/link-button"
import { CustomerDisplayButton, useCustomerDisplay, type DisplayInput } from "./display-dialog"

// `Buat Pengiriman › Kiriman Satuan` (DEC-251A, supersedes the DEC-237 layout; visual 05): the counter's mental order on
// one screen. Three top cards — `1. Pengirim`, `2. Penerima` (its Mengantar area IS the quote destination; or `Cek
// kecamatan saja dulu` for a walk-in price check), `3. Detail Paket` — then the full-width auto-quoted `4. Pilihan
// Ekspedisi`, then `5. Ringkasan, Pembayaran & Cetak`. One primary freezes the quote (INV), attaches the parties,
// records the payment, issues at Mengantar and opens printing — no page change (TASK-304 guards unchanged).
// `/kiriman/:slug` keeps serving drafts, QR pre-bookings and issued shipments.

interface Claim { slug: string; senderId: string; recipientId: string; destination: { id: string; label: string }; weightGram: number; cod: boolean; codGoodsIdr: number; content: string }
type Method = "qris" | "tunai" | "transfer" | "later"
type Recipient = Contact & { mengantar_area_id?: string | null }
interface Score { state: "ok" | "forbidden" | "limited" | "unavailable" | "invalid"; grade?: string | null; approximate?: boolean; total?: number; rts?: number }
interface Issued { slug: string; state: string; awb: string | null; courier: string; paid: boolean }

const newKey = () => crypto.randomUUID().replace(/-/g, "")
/** Every customer-facing amount the operator confirms (counter due, recipient collection, sender COD payout). */
const amountsOf = (c: QuoteCard) => [c.counterDueIdr, c.codCollectionTotalIdr, c.senderCodPayableIdr].join("|")

/** `Pindai QR / buka INV`: a scanner types the QR URL or INV; a mini-site pre-booking prefills this screen (TASK-501). */
function ScanBox({ onClaim, autoFocus = false }: { onClaim: (c: Claim) => void; autoFocus?: boolean }) {
  const navigate = useNavigate()
  const [code, setCode] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])
  async function go(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setMsg(null)
    const m = /([23456789abcdefghjkmnpqrstvwxyz]{7})\/?$/i.exec(code.trim().replace(/^inv\s*/i, ""))
    if (!m) return setMsg("Kode tidak dikenali. Pindai QR dari pelanggan atau ketik nomor INV.")
    const slug = m[1]!.toLowerCase()
    setPending(true)
    try {
      onClaim(await api<Claim>(`/minisite-drafts/${slug}/claim`, { body: {} }))
    } catch (err) {
      // Not a pre-booking: maybe an existing INV of this gerai.
      if (err instanceof ApiError && (err.body.code === "DRAFT_NOT_FOUND" || err.body.code === "DRAFT_ALREADY_USED")) await navigate({ to: "/kiriman/$slug", params: { slug } })
      else setMsg(err instanceof ApiError ? err.body.message : "Kode tidak bisa dibuka.")
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={go} className="flex w-full flex-col gap-1 sm:w-auto" role="search">
      <div className="flex items-center gap-1.5">
        <label className="relative min-w-0 flex-1 sm:w-72">
          <span className="sr-only">Pindai QR pelanggan atau ketik INV</span>
          <QrCodeIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input ref={inputRef} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Pindai QR atau ketik INV" autoComplete="off" className="pl-8" disabled={pending} />
        </label>
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "Membuka…" : "Buka Draf"}</Button>
      </div>
      {msg ? <p role="alert" className="text-xs text-danger">{msg}</p> : null}
    </form>
  )
}

/** Local COD history (this gerai) + Mengantar receiver score (all sellers, A..E-) for the chosen recipient. */
function RecipientRisk({ phone }: { phone: string }) {
  const [local, setLocal] = useState<{ badge: RiskBadge; delivered: number; rts: number; rtsBps: number | null } | null>(null)
  const [score, setScore] = useState<Score | null>(null)
  useEffect(() => {
    let alive = true
    api<{ badge: { badge: RiskBadge; delivered: number; rts: number; rtsBps: number | null } }>(`/contacts/risk-badge?phone=${encodeURIComponent(phone)}`).then((r) => alive && setLocal(r.badge)).catch(() => undefined)
    api<Score>(`/contacts/receiver-score?phone=${encodeURIComponent(phone)}`).then((r) => alive && setScore(r)).catch(() => alive && setScore({ state: "unavailable" }))
    return () => {
      alive = false
    }
  }, [phone])
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {local ? <RiskChip badge={local.badge} delivered={local.delivered} rts={local.rts} rtsBps={local.rtsBps} /> : null}
      {score?.state === "ok" ? (
        <Badge variant="outline" className="gap-1.5 border-slate-200 bg-white text-slate-700">
          Skor Mengantar <strong className="text-slate-900 tabular-nums">{score.grade ? `${score.approximate ? "≈" : ""}${score.grade}` : "belum ada"}</strong>
          {score.grade ? <span className="text-muted-foreground tabular-nums">· {score.total} COD, {score.rts} retur</span> : null}
        </Badge>
      ) : score?.state === "forbidden" ? (
        <span className="text-xs text-muted-foreground">Skor Mengantar belum aktif untuk akun ini.</span>
      ) : score?.state === "limited" ? (
        <span className="text-xs text-muted-foreground">Batas cek skor Mengantar hari ini habis.</span>
      ) : null}
    </div>
  )
}

/** The chosen contact as a provenance card (name, phone, WA / area check), with `Ganti`. */
function ChosenParty({ c, kind, destinationId, onClear, onChange, locked = false }: { c: Contact; kind: "senders" | "recipients"; destinationId: string | null; onClear: () => void; onChange: (c: Contact) => void; locked?: boolean }) {
  const r = c as Recipient
  const areaMismatch = kind === "recipients" && destinationId && r.mengantar_area_id && r.mengantar_area_id !== destinationId
  const phone = c.true_phone ?? c.phone ?? ""
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-slate-900">{c.display_brand_name ? `${c.display_brand_name} · ${c.true_name}` : (c.true_name ?? c.name)}</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">{phone}{c.subdistrict_name ? ` · ${c.subdistrict_name}` : ""}</span>
          {kind === "recipients" && c.street_address ? <span className="line-clamp-2 text-xs text-muted-foreground">{c.street_address}</span> : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={locked}>Ganti</Button>
      </div>
      {kind === "senders" ? (c.wa_verified_at ? <span className="flex items-center gap-1.5 text-xs font-medium text-safe"><CheckCircle2Icon aria-hidden className="size-3.5" />WhatsApp terverifikasi di loket</span> : <VerifySender c={c} onVerified={onChange} />) : null}
      {areaMismatch ? <p role="alert" className="text-xs font-medium text-danger">Kecamatan penerima berbeda dengan tujuan ongkir. Cek ongkir ulang ke kecamatan penerima.</p> : null}
      {kind === "recipients" && phone ? <RecipientRisk phone={phone} /> : null}
    </div>
  )
}

/** Counter WhatsApp check (spec 03 Path B step 2) without leaving the POS: test message → sender confirms. */
function VerifySender({ c, onVerified }: { c: Contact; onVerified: (c: Contact) => void }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const digits = (c.true_phone ?? "").replace(/\D/g, "")
  const phone = digits ? `62${digits.replace(/^(62|0)/, "")}` : ""
  async function verify() {
    if (pending) return
    setPending(true)
    setMsg(null)
    try {
      onVerified((await api<{ item: Contact }>(`/contacts/senders/${c.id}/verify-wa`, { body: {} })).item)
    } catch (err) {
      setMsg(err instanceof ApiError ? err.body.message : "Verifikasi gagal. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 pt-2">
      <p className="text-xs text-muted-foreground">WhatsApp belum diverifikasi (wajib untuk COD dan label masking). Kirim pesan uji, lalu tanyakan ke pengirim.</p>
      <div className="flex flex-wrap gap-1.5">
        {phone ? (
          <AnchorButton variant="outline" size="sm" href={`https://wa.me/${phone}?text=${encodeURIComponent("Halo, ini pesan uji dari gerai untuk memastikan nomor WhatsApp Anda aktif.")}`} target="_blank" rel="noreferrer">
            <MessageCircleIcon aria-hidden /> Kirim pesan uji
          </AnchorButton>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={verify} disabled={pending}>{pending ? "Memverifikasi…" : "Pengirim sudah menerima"}</Button>
      </div>
      {msg ? <p role="alert" className="text-xs text-danger">{msg}</p> : null}
    </div>
  )
}

function PartyStep({ kind, value, onPick, onUpdate, error, destination, n, initialArea, locked = false, children }: { kind: "senders" | "recipients"; value: Contact | null; onPick: (c: Contact | null) => void; onUpdate?: (c: Contact) => void; error?: string; destination: QuoteRequest | null; n: number; initialArea?: Area | null; locked?: boolean; children?: ReactNode }) {
  const w = useWorkspace()
  const [adding, setAdding] = useState(false)
  const label = kind === "senders" ? "Pengirim" : "Penerima"
  const lockedRef = useRef(locked)
  useLayoutEffect(() => {
    lockedRef.current = locked
  })
  // Sol R3: the form's POST already returns the full contact — picked at once, no second GET (so no window in which the
  // sheet is closed but a pick is still coming). Never picked while a press is pending.
  function saved(item?: Contact) {
    setAdding(false)
    if (item && !lockedRef.current) onPick(item)
  }
  // Supervisor pre-review: each opening or closing of the sheet is a new generation; a save from a sheet that was
  // closed (Escape / X) and maybe reopened answers to an old generation and neither closes the new sheet nor picks.
  const sheetGen = useRef(0)
  const [sheetId, setSheetId] = useState(0)
  function setSheet(open: boolean) {
    sheetGen.current++
    setSheetId(sheetGen.current)
    setAdding(open)
  }
  function savedIf(id: number, item?: Contact) {
    if (id !== sheetGen.current) return
    saved(item)
  }
  return (
    <Panel className="flex min-w-0 flex-col gap-3" aria-labelledby={`pihak-${kind}`}>
      <StepTitle n={n} id={`pihak-${kind}`} title={label} action={<Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => setSheet(true)} aria-label={`${label} baru`}><PlusIcon aria-hidden /> Baru</Button>} />
      {value ? <ChosenParty c={value} kind={kind} destinationId={destination?.destinationAreaId ?? null} onClear={() => onPick(null)} onChange={onUpdate ?? onPick} locked={locked} /> : <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0"><PartyPicker kind={kind} value={value} onPick={onPick} limit={4} /></fieldset>}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      {children}
      <Sheet open={adding} onOpenChange={setSheet}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>{label} baru</SheetTitle></SheetHeader>
          {adding ? (kind === "senders" ? <SenderForm key={sheetId} sender={null} owner={isOwner(w)} onSaved={(item) => savedIf(sheetId, item)} /> : <RecipientForm key={sheetId} recipient={null} canArchive={false} onSaved={(item) => savedIf(sheetId, item)} initialArea={initialArea ?? null} />) : null}
        </SheetContent>
      </Sheet>
    </Panel>
  )
}

export function KasirPage() {
  const w = useWorkspace()
  const owner = isOwner(w)
  const navigate = useNavigate()
  // The claim and the round live outside the screen: `Kiriman Baru` / a scanned QR remount a fresh screen while the
  // customer display (TASK-701) keeps its pairing and channel here.
  const [claim, setClaim] = useState<Claim | null>(null)
  const [round, setRound] = useState(0)
  const [displayInput, setDisplayInput] = useState<DisplayInput>({ kind: "idle" })
  const display = useCustomerDisplay(w.tenant.slug, displayInput)
  const displayButton = <CustomerDisplayButton display={display} owner={owner} />
  return (
    <KasirScreen
      key={`${claim?.slug ?? "baru"}-${round}`}
      claim={claim}
      displayButton={displayButton}
      onDisplay={setDisplayInput}
      onClaim={(c) => {
        setClaim(c)
        setRound((n) => n + 1)
      }}
      onReset={() => {
        // Clear any stale Cek Ongkir Cepat query params so `Kiriman Baru` opens truly blank.
        void navigate({ to: "/kasir", search: {}, replace: true })
        setClaim(null)
        setRound((n) => n + 1)
      }}
    />
  )
}

function KasirScreen({ claim, displayButton, onDisplay, onClaim, onReset }: { claim: Claim | null; displayButton: ReactNode; onDisplay: (d: DisplayInput) => void; onClaim: (c: Claim) => void; onReset: () => void }) {
  const w = useWorkspace()
  const owner = isOwner(w)
  const pos = usePosConfig()
  const search = useSearch({ strict: false }) as Record<string, unknown>
  // `Buat Kiriman dari Tarif Ini` (Cek Ongkir Cepat) prefills the form and preselects the service (once).
  const q = (k: string) => (search[k] === undefined ? undefined : String(search[k]))
  const fromQuick: QuoteInitial | undefined = q("tujuan")
    ? {
        area: { id: q("tujuan")!, label: q("wilayah") ?? "", postalCode: null },
        gram: Number(q("berat")) || 1000,
        codGoodsIdr: Number(q("cod")) || 0,
        mode: (q("mode") as Mode | undefined) ?? "none",
        declaredValueIdr: Number(q("nilai")) || 0,
        dangerousGoods: q("dg") === "1",
        dims: q("dim") ? (([l, ww, h]) => ({ l: l!, w: ww!, h: h! }))(q("dim")!.split("x").map(Number)) : null,
        packingName: q("packing") ?? "",
        serviceFee: q("biaya") !== "0",
      }
    : undefined
  const preselect = useRef<string | undefined>(!claim ? q("layanan") : undefined)
  const [sel, setSel] = useState<{ req: QuoteRequest; card: QuoteCard } | null>(null)
  const [sender, setSender] = useState<Contact | null>(null)
  const [recipient, setRecipient] = useState<Contact | null>(null)
  const [claimLoadError, setClaimLoadError] = useState<string | null>(null)
  const [content, setContent] = useState(claim?.content ?? "")
  const [qty, setQty] = useState("1")
  const [note, setNote] = useState("")
  const [ack, setAck] = useState(false)
  const [preset, setPreset] = useState<MaskPreset>("standar_gerai")
  const [method, setMethod] = useState<Method>("qris")
  const [cash, setCash] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // The INV this screen froze (kept across a failed attempt so a retry never allocates twice).
  // `card` is the server's frozen card: once an INV exists it is the only source of the amounts on screen and paid.
  const [frozen, setFrozen] = useState<{ slug: string; sig: string; paid: boolean; payKey: string; card: QuoteCard } | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [prints, setPrints] = useState(0)
  // Labels the customer display shows (TASK-701): destination area and packing name from the quote form.
  const [form, setForm] = useState<{ areaLabel: string | null; packingName: string }>({ areaLabel: null, packingName: "" })
  // Sol R1-1: every invalidation (an edit that stales the quote, another recipient, `Ganti`) bumps this; a freeze
  // answer that arrives after it never republishes the checkout (no `setFrozen` / `setSel` from a superseded press).
  const checkoutGen = useRef(0)
  const invalidate = () => {
    checkoutGen.current++
    setSel(null)
  }
  const initial = claim ? { area: { id: claim.destination.id, label: claim.destination.label, postalCode: null }, gram: claim.weightGram, codGoodsIdr: claim.codGoodsIdr } : fromQuick
  const f = useQuoteForm(initial, {
    auto: true,
    onStale: invalidate,
    onForm: setForm,
    onQuoted: (req, cards) => {
      const want = preselect.current
      preselect.current = undefined
      const keep = want ? cards.find((c) => c.available && c.serviceCode === want) : undefined
      setSel(keep ? { req, card: frozen && frozen.sig === JSON.stringify([req, keep.serviceCode]) ? frozen.card : keep } : null)
    },
  })
  // `Cek kecamatan saja dulu`: a walk-in price check before any recipient (pre-opened from Cek Ongkir Cepat).
  const [areaOnly, setAreaOnly] = useState(!!fromQuick && !claim)

  // A QR pre-booking brings its parties (the content is set where the claim is taken).
  useEffect(() => {
    if (!claim) return
    let alive = true
    Promise.all([
      api<{ item: Contact }>(`/contacts/senders/${claim.senderId}`),
      api<{ item: Contact }>(`/contacts/recipients/${claim.recipientId}`),
    ])
      .then(([s, r]) => {
        if (!alive) return
        setClaimLoadError(null)
        setSender(s.item)
        setRecipient(r.item)
      })
      .catch(() => {
        if (alive) setClaimLoadError("Data pengirim/penerima dari draf QR gagal dimuat. Pilih ulang pengirim dan penerima.")
      })
    return () => {
      alive = false
    }
  }, [claim])
  // The chosen recipient's Mengantar area is the quote destination: no second district entry, no area mismatch.
  const recipientArea = (recipient as Recipient | null)?.mengantar_area_id ?? null
  // Choosing another recipient (or `Ganti`) never keeps the previous recipient's district and rates: a recipient without
  // a Mengantar area, or none at all outside the walk-in district mode, empties sections 4 and 5.
  // Sol R2-2: a sender change (picked, added, `Ganti`) also supersedes a press in flight.
  function pickSender(c: Contact | null) {
    checkoutGen.current++
    setPreset("standar_gerai")
    setSender(c)
  }
  function pickRecipient(c: Contact | null) {
    checkoutGen.current++
    if (c) setAreaOnly(false)
    if ((c && !(c as Recipient).mengantar_area_id) || (!c && !areaOnly)) f.clearQuoteDestination()
    setRecipient(c)
  }
  const setArea = f.setArea
  useEffect(() => {
    if (recipient && recipientArea) setArea({ id: recipientArea, label: recipient.subdistrict_name ?? "", postalCode: (recipient as Recipient & { postal_code?: string | null }).postal_code ?? null })
  }, [recipient, recipientArea, setArea])

  const card = sel?.card ?? null
  const due = card?.counterDueIdr ?? 0
  const cod = sel ? sel.req.mode !== "none" : false
  const payNow = due > 0 && method !== "later"
  const cashNum = Number(cash.replace(/\D/g, ""))
  const sig = sel ? JSON.stringify([sel.req, sel.card.serviceCode]) : ""
  const locked = !!frozen && (frozen.paid || !!claim) && frozen.sig !== sig

  // Layar Pelanggan (spec 03 §5.5): only ids and amounts; the server rebuilds the state (and `paid` from the INV).
  const displayInput: DisplayInput = issued
    ? { kind: "paid", slug: issued.slug }
    : card && sel
      ? {
          // Ids, not display text (Sol R1 F1): the server names the service and the area.
          kind: "checkout",
          serviceCode: card.serviceCode,
          eta: card.eta,
          billableWeightGram: card.billableWeightGram,
          destinationAreaId: sel.req.destinationAreaId,
          destinationLabel: form.areaLabel,
          method: due > 0 ? method : null,
          lines: [
            ...(cod ? [] : [{ kind: "ongkir", amountIdr: card.publishShippingIdr }]),
            ...(sel.req.packingIdr ? [{ kind: "packing", amountIdr: sel.req.packingIdr, name: form.packingName }] : []),
            ...(sel.req.serviceFeeIdr ? [{ kind: "layanan", amountIdr: sel.req.serviceFeeIdr }] : []),
          ],
          totalIdr: due,
          codCollectionIdr: cod ? card.codCollectionTotalIdr : null,
          senderPayoutIdr: cod && sel.req.mode !== "dfod" ? card.senderCodPayableIdr : null,
        }
      : { kind: "idle" }
  const displayKey = JSON.stringify(displayInput)
  useEffect(() => {
    onDisplay(JSON.parse(displayKey) as DisplayInput)
  }, [displayKey, onDisplay])

  const priceChanged = (c: QuoteCard) =>
    new ApiError(409, {
      code: "PRICE_CHANGED",
      message: `Ongkir yang terkunci berbeda: bayar di loket ${rp(c.counterDueIdr)}${c.codCollectionTotalIdr ? `, ditagih ke penerima ${rp(c.codCollectionTotalIdr)}, cair ke pengirim ${rp(c.senderCodPayableIdr)}` : ""}. Periksa ringkasan lalu tekan lagi.`,
      field_errors: {},
    })

  async function submit() {
    if (pending || !sel) return
    setPending(true)
    setErrors({})
    setMsg(null)
    let inv = frozen
    const gen = checkoutGen.current
    // A press superseded while it waited (the quote went stale, the recipient changed) stops without touching state.
    const superseded = () => {
      if (gen === checkoutGen.current) return false
      setMsg("Data kiriman berubah saat diproses. Periksa ringkasan lalu tekan lagi.")
      return true
    }
    try {
      // Sol R1-1: both parties, and a recipient in the quoted district, before any INV, payment or dispatch.
      if (!sender) throw new ApiError(422, { code: "NOT_READY", message: "Pilih pengirim dulu.", field_errors: { senderId: "Pilih pengirim." } })
      if (!recipient) throw new ApiError(422, { code: "NOT_READY", message: "Pilih penerima dulu.", field_errors: { recipientId: "Pilih penerima." } })
      const toArea = (recipient as Recipient).mengantar_area_id
      // Sol R2-1: strict — a recipient without a Mengantar district is completed first, never paid for.
      if (!toArea) throw new ApiError(422, { code: "NOT_READY", message: "Lengkapi kecamatan penerima di Kontak dulu.", field_errors: { recipientId: "Penerima ini belum punya kecamatan Mengantar." } })
      if (toArea !== sel.req.destinationAreaId) throw new ApiError(422, { code: "NOT_READY", message: "Kecamatan penerima berbeda dengan tujuan ongkir. Cek ongkir ulang ke kecamatan penerima.", field_errors: { recipientId: "Kecamatan penerima berbeda dengan tujuan ongkir." } })
      // COD and label masking need a counter-verified WhatsApp: say so before any money is recorded.
      if (sender && !sender.wa_verified_at && (cod || preset !== "standar_gerai")) {
        throw new ApiError(422, { code: "NOT_READY", message: "Verifikasi WhatsApp pengirim dulu (tombol di kartu pengirim).", field_errors: { senderId: "Kiriman COD atau label masking butuh WhatsApp pengirim yang sudah diverifikasi." } })
      }
      // Validate package contents & safety acknowledgement before allocating an INV slug on the server.
      const preErrors: Record<string, string> = {}
      if (!content.trim()) preErrors.content = "Isi deskripsi paket terlebih dahulu."
      if (!ack) preErrors.prohibitedAck = "Centang pernyataan isi paket bukan barang terlarang."
      if (Object.keys(preErrors).length) {
        throw new ApiError(422, { code: "NOT_READY", message: "Lengkapi isi paket dan centang pernyataan barang terlarang dulu.", field_errors: preErrors })
      }
      if (!inv || inv.sig !== sig) {
        if (inv && (inv.paid || claim)) throw new ApiError(409, { code: "LOCKED", message: `Pembayaran atau kode QR sudah tercatat di INV ${inv.slug.toUpperCase()}. Lanjutkan di halaman kiriman.`, field_errors: {} })
        const r = await api<{ slug: string; card: QuoteCard }>("/quotes/freeze", { body: { ...sel.req, serviceCode: sel.card.serviceCode, ...(claim ? { slug: claim.slug } : {}) } })
        if (superseded()) return
        const nextSig = JSON.stringify([sel.req, r.card.serviceCode])
        inv = { slug: r.slug, sig: nextSig, paid: false, payKey: newKey(), card: r.card }
        setFrozen(inv)
        setSel({ req: sel.req, card: r.card })
        // The server re-priced at freeze: the frozen card is the truth. If any confirmed amount changed, show the new
        // amounts and stop — the next press pays exactly what is on screen.
        if (amountsOf(r.card) !== amountsOf(sel.card)) throw priceChanged(r.card)
      } else {
        // Same request and service as the frozen INV: what is on screen must be the frozen card (a re-selected or
        // re-quoted card from before the freeze may differ) — otherwise restore it and ask again.
        if (amountsOf(sel.card) !== amountsOf(inv.card)) {
          setSel({ req: sel.req, card: inv.card })
          throw priceChanged(inv.card)
        }
        // A retry after a lost response: the INV may already be issued or held — show it, never re-send parties.
        const cur = await api<{ shipment: { dispatch_state: string; awb_number: string | null; counter_payment_status: string } }>(`/shipments/${inv.slug}`)
        if (superseded()) return
        if (["issued", "provider_unpaid_hold", "issuing_in_flight", "reconciliation_needed"].includes(cur.shipment.dispatch_state)) {
          const d = await api<{ state: string; awb: string | null }>(`/shipments/${inv.slug}/dispatch`, { body: {} })
          setIssued({ slug: inv.slug, state: d.state, awb: d.awb, courier: sel.card.name, paid: cur.shipment.counter_payment_status === "paid" })
          return
        }
        if (cur.shipment.counter_payment_status === "paid") inv = { ...inv, paid: true }
      }
      await api(`/shipments/${inv.slug}/parties`, { body: { senderId: sender?.id, recipientId: recipient?.id, content, prohibitedAck: ack, maskPreset: preset, quantity: Number(qty) || 1, deliveryInstruction: note } })
      if (superseded()) return
      if (payNow && !inv.paid) {
        const res = await fetch(`/api/app/shipments/${inv.slug}/payment`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": inv.payKey }, body: JSON.stringify({ method, cashReceivedIdr: method === "tunai" ? cashNum : undefined }) })
        const j = (await res.json().catch(() => null)) as { ok: boolean; error?: { code: string; message: string; field_errors: Record<string, string> } } | null
        if (!j) throw new ApiError(res.status, { code: "BAD_RESPONSE", message: "Respons server tidak valid saat mencatat pembayaran. Coba lagi.", field_errors: {} })
        if (!j.ok) throw new ApiError(res.status, { code: j.error?.code ?? "PAYMENT_FAILED", message: j.error?.message ?? "Pembayaran gagal dicatat.", field_errors: j.error?.field_errors ?? {} })
        inv = { ...inv, paid: true }
        setFrozen(inv)
      }
      const d = await api<{ state: string; awb: string | null }>(`/shipments/${inv.slug}/dispatch`, { body: {} })
      setIssued({ slug: inv.slug, state: d.state, awb: d.awb, courier: sel.card.name, paid: inv.paid })
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.body.field_errors)
        setMsg(err.body.message)
      } else setMsg("Gagal memproses. Coba lagi.")
    } finally {
      setPending(false)
    }
  }

  if (issued) return <IssuedPanel issued={issued} prints={prints} onPrinted={() => setPrints((n) => n + 1)} onNew={onReset} actions={displayButton} />

  const alreadyPaid = !!(frozen?.paid && frozen.sig === sig)
  const needPay = payNow && !alreadyPaid
  const primary = alreadyPaid ? "Terbitkan Resi & Cetak" : needPay ? `Tandai Lunas & Cetak · ${rp(due)}` : due > 0 ? "Simpan & Cetak (belum dibayar)" : "Simpan & Cetak"
  const cashShort = needPay && method === "tunai" && cashNum < due
  const disabled = pending || !sel || locked || cashShort
  const pickedArea = recipient && recipientArea ? null : areaOnly || (recipient && !recipientArea)

  return (
    <div className="flex flex-col gap-4 pb-28 lg:pb-0">
      <PageTitle title="Kiriman Satuan" description={<span className="flex flex-col items-start gap-2"><span>Buat resi dari meja kasir dalam satu layar.</span><PickupChip outlet={pos?.outlet} owner={owner} loaded={pos !== null} /></span>}>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-start">
          <ScanBox onClaim={onClaim} autoFocus={q("scan") === "1"} />
          {displayButton}
        </div>
      </PageTitle>
      {claim ? (
        <p role="status" className="rounded-lg border border-primary/20 bg-accent px-3 py-2 text-sm text-slate-700">Kiriman dari rumah <span className="font-semibold tabular-nums">INV {claim.slug.toUpperCase()}</span>: tujuan, berat, pengirim dan penerima sudah terisi. Timbang ulang paket, lalu pilih ekspedisi.</p>
      ) : null}
      {claimLoadError ? <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{claimLoadError}</p> : null}

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <PartyStep n={1} kind="senders" value={sender} onPick={pickSender} onUpdate={(v) => setSender((cur) => (cur?.id === v.id ? v : cur))} error={errors.senderId} destination={sel?.req ?? null} locked={pending}>
          {/* The label preset belongs to the sender (masking needs a verified WhatsApp). */}
          <PresetPicker key={sender?.id ?? "none"} value={preset} onChange={setPreset} cod={cod} reseller={sender?.sender_kind === "reseller_dropship"} preview={{ sender: sender?.true_name ?? "Pengirim", brand: sender?.display_brand_name ?? null, outlet: w.tenant.name, recipientPhone: recipient?.phone ?? null }} />
          {errors.maskPreset ? <p role="alert" className="text-xs text-danger">{errors.maskPreset}</p> : null}
        </PartyStep>
        <PartyStep n={2} kind="recipients" value={recipient} onPick={pickRecipient} error={errors.recipientId} destination={sel?.req ?? null} initialArea={recipient ? null : f.area} locked={pending}>
          {pickedArea ? (
            <div data-area-only className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              {recipient && !recipientArea ? <p className="text-xs text-warn">Penerima ini belum punya kecamatan Mengantar. Pilih kecamatan tujuan.</p> : null}
              <AreaPicker label="Kecamatan tujuan" value={f.area} onChange={f.setArea} error={f.errors.destinationAreaId} />
              {!recipient ? <p className="text-xs text-muted-foreground">Tarif muncul di bagian 4. Setelah pelanggan setuju, pilih atau tambah penerima di kecamatan ini.</p> : null}
            </div>
          ) : !recipient ? (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setAreaOnly(true)}>
              <MapPinnedIcon aria-hidden /> Cek kecamatan tujuan saja dulu
            </Button>
          ) : null}
        </PartyStep>
        <Panel className="flex min-w-0 flex-col gap-3" aria-labelledby="paket-judul">
          <StepTitle n={3} id="paket-judul" title="Detail Paket" />
          <PackageFields
            f={f}
            disclosure
            extraFilled={!!note}
            extra={
              <Field data-invalid={errors.deliveryInstruction ? true : undefined}>
                <FieldLabel htmlFor="instruksi">Instruksi kurir / patokan (opsional)</FieldLabel>
                <Textarea id="instruksi" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Contoh: Titip ke satpam, rumah pagar hijau" />
                {errors.deliveryInstruction ? <FieldError>{errors.deliveryInstruction}</FieldError> : null}
              </Field>
            }
          >
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <Field data-invalid={errors.content ? true : undefined}>
                <FieldLabel htmlFor="isi">Isi paket</FieldLabel>
                <Input id="isi" value={content} onChange={(e) => setContent(e.target.value)} maxLength={100} placeholder="Contoh: Pakaian" />
                {errors.content ? <FieldError>{errors.content}</FieldError> : null}
              </Field>
              <Field data-invalid={errors.quantity ? true : undefined}>
                <FieldLabel htmlFor="jumlah">Jumlah barang</FieldLabel>
                <Input id="jumlah" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 3))} className="tabular-nums" />
                {errors.quantity ? <FieldError>{errors.quantity}</FieldError> : null}
              </Field>
            </div>
          </PackageFields>
        </Panel>
      </div>

      <CourierResults
        f={f}
        n={4}
        empty="Pilih penerima (atau cek kecamatan saja) dan isi berat — ongkir semua ekspedisi muncul otomatis di sini."
        select={{
          selected: card?.serviceCode ?? null,
          onSelect: (req, c) => {
            if (pending) return
            setSel({ req, card: frozen && frozen.sig === JSON.stringify([req, c.serviceCode]) ? frozen.card : c })
          },
        }}
      />

      <Panel className="flex flex-col gap-4" aria-labelledby="ringkasan-judul">
        <StepTitle n={5} id="ringkasan-judul" title="Ringkasan, Pembayaran & Cetak" action={frozen ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums">INV {frozen.slug.toUpperCase()}</span> : null} />
        {card && sel ? (
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{card.name}{form.areaLabel ? <span className="font-normal text-muted-foreground"> · ke {form.areaLabel}</span> : null}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">Berat ditagih {(card.billableWeightGram / 1000).toLocaleString("id-ID")} kg{card.eta ? ` · ${card.eta}` : ""}</span>
                </span>
              </div>
              <dl className="flex flex-col gap-1.5 text-sm tabular-nums">
                <Row label="Ongkir publish" value={rp(card.publishShippingIdr)} />
                {sel.req.packingIdr ? <Row label="Packing" value={rp(sel.req.packingIdr)} /> : null}
                {sel.req.serviceFeeIdr ? <Row label="Biaya layanan loket" value={rp(sel.req.serviceFeeIdr)} /> : null}
                {cod ? (
                  <>
                    <Row label="Ditagih kurir ke penerima" value={rp(card.codCollectionTotalIdr)} />
                    {sel.req.mode !== "dfod" ? <Row label="Estimasi cair ke pengirim" value={rp(card.senderCodPayableIdr)} /> : null}
                  </>
                ) : null}
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-dashed border-slate-300 pt-2.5">
                  <dt className="text-sm font-semibold text-slate-900">Bayar di loket</dt>
                  <dd className="text-2xl font-bold text-slate-950">{rp(due)}</dd>
                </div>
              </dl>
              {owner && card.providerNetShippingIdr !== undefined ? (
                <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs tabular-nums">
                  <div><dt className="text-muted-foreground">Modal Mengantar</dt><dd className="text-sm font-medium text-slate-800">{rp(card.providerNetShippingIdr)}</dd></div>
                  <div><dt className="text-muted-foreground">Estimasi laba</dt><dd className="text-sm font-semibold text-safe">{rp(card.estimatedProfitIdr ?? 0)}</dd></div>
                </dl>
              ) : null}
            </div>
            <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
              {alreadyPaid ? (
                <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">Pembayaran sudah tercatat lunas di INV {frozen!.slug.toUpperCase()}. Tekan tombol di bawah untuk menerbitkan resi.</p>
              ) : due > 0 ? (
                <div className="flex flex-col gap-2.5">
                  <ToggleGroup value={[method]} onValueChange={(v) => v[0] && setMethod(v[0] as Method)} variant="outline" aria-label="Cara bayar" className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4">
                    <ToggleGroupItem value="qris" className="w-full">QRIS gerai</ToggleGroupItem>
                    <ToggleGroupItem value="tunai" className="w-full">Tunai</ToggleGroupItem>
                    <ToggleGroupItem value="transfer" className="w-full">Transfer</ToggleGroupItem>
                    <ToggleGroupItem value="later" className="w-full">Bayar nanti</ToggleGroupItem>
                  </ToggleGroup>
                  {method === "tunai" ? (
                    <Field data-invalid={errors.cashReceivedIdr ? true : undefined}>
                      <FieldLabel htmlFor="uang">Uang diterima</FieldLabel>
                      <Input id="uang" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} className="tabular-nums" />
                      <div className="flex flex-wrap gap-1.5">
                        {[due, Math.ceil(due / 10000) * 10000, Math.ceil(due / 50000) * 50000, 100000].filter((v, i, a) => v >= due && a.indexOf(v) === i).slice(0, 3).map((v) => (
                          <button key={v} type="button" onClick={() => setCash(v.toLocaleString("id-ID"))} className="h-11 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-600 tabular-nums hover:bg-slate-50 md:h-9 md:text-xs">
                            {v === due ? "Uang pas" : rp(v)}
                          </button>
                        ))}
                      </div>
                      {cashNum >= due ? <p className="text-sm font-medium text-safe tabular-nums">Kembalian {rp(cashNum - due)}</p> : <p className="text-xs text-muted-foreground">Masukkan uang diterima atau tekan Uang pas untuk melanjutkan.</p>}
                      {errors.cashReceivedIdr ? <FieldError>{errors.cashReceivedIdr}</FieldError> : null}
                    </Field>
                  ) : null}
                  {method === "qris" || method === "transfer" ? <p className="text-xs text-muted-foreground">Pastikan dana sudah masuk ke rekening/QRIS gerai sebelum menandai lunas.</p> : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Tidak ada yang dibayar di loket.</p>
              )}
              <CheckboxField checked={ack} onCheckedChange={setAck}>
                Isi paket bukan barang terlarang atau berbahaya
              </CheckboxField>
              {errors.prohibitedAck ? <p role="alert" className="text-xs text-danger">{errors.prohibitedAck}</p> : null}
              {frozen ? <p className="text-xs text-muted-foreground tabular-nums">INV {frozen.slug.toUpperCase()}{frozen.paid ? " · pembayaran tercatat" : " · draf"} · <Link to="/kiriman/$slug" params={{ slug: frozen.slug }} className="font-medium text-primary underline-offset-4 hover:underline">Buka halaman kiriman</Link></p> : null}
              {locked ? <p role="alert" className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">Ongkir berubah setelah INV {frozen!.slug.toUpperCase()} dibayar atau dipakai kode QR. Lanjutkan di halaman kiriman.</p> : null}
              {msg ? <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{msg}</p> : null}
              <Button className="hidden w-full lg:inline-flex" size="lg" onClick={submit} disabled={disabled}>
                <PrinterIcon aria-hidden /> {pending ? "Memproses…" : primary}
              </Button>
            </fieldset>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Cek ongkir lalu pilih ekspedisi. Rincian biaya muncul di sini.</p>
        )}
      </Panel>
      {card ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-slate-200/80 bg-white/95 p-3 backdrop-blur lg:hidden">
          <span className="flex flex-col text-sm tabular-nums"><span className="text-xs text-muted-foreground">Bayar di loket</span><strong className="text-base md:text-sm">{rp(due)}</strong></span>
          <Button className="flex-1" size="lg" onClick={submit} disabled={disabled}>
            {pending ? "Memproses…" : alreadyPaid ? "Terbitkan & Cetak" : needPay ? "Tandai Lunas & Cetak" : "Simpan & Cetak"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  )
}

function IssuedPanel({ issued, prints, onPrinted, onNew, actions }: { issued: Issued; prints: number; onPrinted: () => void; onNew: () => void; actions?: ReactNode }) {
  const ok = issued.state === "issued"
  const [copied, setCopied] = useState(false)
  function copyAwb() {
    if (!issued.awb) return
    navigator.clipboard?.writeText(issued.awb).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => undefined,
    )
  }
  return (
    <div>
      <PageTitle title="Kiriman Satuan" description={`INV ${issued.slug.toUpperCase()}`}>{actions}</PageTitle>
      <Panel className="flex max-w-2xl flex-col gap-3">
        {ok ? (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold md:text-base text-safe"><CheckCircle2Icon aria-hidden className="size-5" /> Resi terbit</p>
            <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
              <span>{issued.courier} · AWB <strong className="font-mono">{issued.awb}</strong></span>
              {issued.awb ? (
                <Button type="button" variant="outline" size="sm" onClick={copyAwb}>
                  {copied ? <><CheckIcon aria-hidden /> Tersalin</> : <><CopyIcon aria-hidden /> Salin Resi</>}
                </Button>
              ) : null}
            </div>
            <p className="text-sm font-medium">{issued.paid ? "LUNAS" : "BELUM DIBAYAR"}</p>
            <div><PrintDrawer slug={issued.slug} printCount={prints} firstPrintedAt={null} onPrinted={onPrinted} /></div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold md:text-base text-warn">{issued.state === "provider_unpaid_hold" ? "Menunggu saldo Mengantar" : "Status penerbitan sedang dipastikan"}</p>
            <p className="text-sm">Kiriman sudah tercatat. Lanjutkan di halaman kiriman; jangan buat ulang kiriman ini.</p>
          </>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={onNew}><RotateCcwIcon aria-hidden /> Kiriman Baru</Button>
          <LinkButton variant="outline" to={`/kiriman/${issued.slug}`}>Buka INV {issued.slug.toUpperCase()}</LinkButton>
        </div>
      </Panel>
    </div>
  )
}
