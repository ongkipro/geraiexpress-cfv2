import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { cn } from "cn"
import { EyeIcon, EyeOffIcon, RefreshCwIcon } from "lucide-react"
import { AreaPicker, type Area } from "../../components/area-picker"
import { WeightInput } from "../../components/weight-input"
import { Button } from "../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { api, ApiError } from "../../lib/api"
import { usePosConfig, type PosConfig } from "../../lib/pos-config"
import { isWeightInBounds } from "@gx/domain/weight"
import { ErrorState, LoadingState } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { CheckboxField, Panel } from "../../components/admin/page"
import { CourierLogo } from "../../components/admin/courier-logo"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"

// Quote form + courier results (visual 05 §2, PR-06, DEC-251A). `useQuoteForm` owns the request (destination, weight,
// COD, options) and the debounced auto-quote; `PackageFields` renders the package card and `CourierResults` the
// full-width, cheapest-first courier table. `Buat Pengiriman` composes them into its 1·2·3 → 4 → 5 screen;
// `Cek Ongkir Cepat` uses `QuotePanel` (no INV). Kasir responses never contain cost or margin.
export type Mode = "none" | "buyer_bears_fee" | "sender_bears_fee" | "cod_all_in" | "dfod"
export interface QuoteCard {
  serviceCode: string
  courierName: string
  courierCode?: string
  name: string
  serviceClass: "regular" | "cargo"
  billableWeightGram: number
  eta: string | null
  dropOffOnly: boolean
  available: boolean
  unavailableReason: string | null
  publishShippingIdr: number
  codFeeIdr: number
  counterDueIdr: number
  codCollectionTotalIdr: number
  senderCodPayableIdr: number
  providerNetShippingIdr?: number
  observedBps?: number | null
  estimatedProfitIdr?: number
}
export interface QuoteRequest {
  destinationAreaId: string
  mode: Mode
  weightGram: number
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  codGoodsIdr?: number
  packingIdr?: number
  serviceFeeIdr?: number
  /** Non-COD goods value sent to Mengantar as `goodsValue` (DEC-238). */
  declaredValueIdr?: number
  /** Dangerous goods: only SiCepat (HALU) and iDexpress carry it (DEC-238). */
  dangerousGoods?: boolean
}
/** Prefill for the quote form (QR pre-booking, `Buat Kiriman dari Tarif Ini`). */
export interface QuoteInitial { area: Area; gram: number; codGoodsIdr: number; mode?: Mode; declaredValueIdr?: number; dangerousGoods?: boolean; dims?: { l: number; w: number; h: number } | null; packingName?: string; serviceFee?: boolean }
interface QuoteResponse { cards: QuoteCard[]; medals: { termurah: string | null; tercepat: string | null; cairTerbesar: string | null } }
type Kind = "non_cod" | "cod_goods" | "cod_shipping"

/** `Rp 12.500`; negatives as `-Rp 2.500`; never `Rp -0`. */
export const rp = (n: number) => (n < 0 ? `-Rp ${(-n).toLocaleString("id-ID")}` : `Rp ${(n === 0 ? 0 : n).toLocaleString("id-ID")}`)
const KINDS: Array<{ id: Kind; label: string; hint: string }> = [
  { id: "non_cod", label: "Non-COD", hint: "Ongkir dibayar di loket." },
  { id: "cod_goods", label: "COD Barang", hint: "Penerima bayar harga barang + ongkir ke kurir." },
  { id: "cod_shipping", label: "COD Ongkir", hint: "Penerima hanya membayar ongkir saat paket tiba." },
]
const COD_FEE_MODES: Array<{ id: Mode; label: string }> = [
  { id: "buyer_bears_fee", label: "Dibayar penerima" },
  { id: "sender_bears_fee", label: "Dipotong pengirim" },
  { id: "cod_all_in", label: "COD all-in" },
]

const kindOf = (m: Mode | undefined, cod: number): Kind => (m === "dfod" ? "cod_shipping" : (m && m !== "none") || cod ? "cod_goods" : "non_cod")
const money = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 9)
  return d ? Number(d).toLocaleString("id-ID") : ""
}
/** Auto-quote waits this long after the last edit (typing a weight never fires one request per digit). */
export const AUTO_QUOTE_MS = 500

/** Mengantar courier rules worth seeing before choosing (check-shipping-fee v2.0.0 limits; DEC-238). */
const RULES: Record<string, { cod?: string; any?: string }> = {
  pos: { cod: "COD: terkirim ≥ 82%, maks. Rp2 jt", any: "jemput butuh titik koordinat" },
  anteraja: { cod: "COD maks. Rp2 jt", any: "selalu dijemput · maks. 50 kg" },
  Sap: { cod: "COD maks. Rp2 jt" },
  spx: { any: "maks. 50 kg" },
  lion: { cod: "COD min. Rp10 rb" },
  JTEco: { any: "ekonomis darat & laut · tanpa cargo/DG" },
}
const courierRule = (code: string, cod: boolean) => {
  const r = RULES[code]
  return [cod ? r?.cod : null, r?.any].filter(Boolean).join(" · ")
}
/**
 * `JNE REG` → `REG` (the courier column already shows the courier). When the catalog name IS the courier name
 * (`J&T Express`), the service class names the row instead of repeating the courier.
 */
const serviceOf = (c: QuoteCard) => {
  const rest = c.courierName && c.name.startsWith(c.courierName) ? c.name.slice(c.courierName.length).replace(/^[\s·–-]+/, "") : c.name
  return rest || (c.serviceClass === "cargo" ? "Cargo" : "Reguler")
}

/** Step heading inside a POS card: numbered dot + 14/16px title. */
export function StepTitle({ n, title, id, action }: { n: number; title: string; id?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-slate-950 md:text-base">
        <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
        {title}
      </h2>
      {action}
    </div>
  )
}

export interface QuoteHooks {
  /** Run the quote automatically once the request is complete (`Buat Pengiriman`, `Cek Ongkir Cepat`). */
  auto: boolean
  onQuoted?: (req: QuoteRequest, cards: QuoteCard[]) => void
  /** The form no longer matches the last quoted request (edited, re-quoting, or the quote failed). */
  onStale?: () => void
  /** Customer-display labels (TASK-701): the destination area label and the packing item's name. */
  onForm?: (f: { areaLabel: string | null; packingName: string }) => void
}

/**
 * The quote request and its lifecycle. A selection is valid only while the form equals the last quoted request; an
 * answer to a superseded request never publishes (Sol R2-A). Auto-quote fires `AUTO_QUOTE_MS` after the last edit
 * once the destination is a Mengantar area id, the weight is at least 10 g and (COD Barang) the goods price is at least
 * Rp10.000. A request that was already quoted or attempted is never sent again by the timer, so switching the
 * Reguler/Cargo tab or the owner's margin view costs no request; `Hitung Ulang` always re-sends.
 */
export function useQuoteForm(initial: QuoteInitial | undefined, hooks: QuoteHooks) {
  const w = useWorkspace()
  const owner = isOwner(w)
  const pos: PosConfig | null = usePosConfig()
  const [kind, setKind] = useState<Kind>(kindOf(initial?.mode, initial?.codGoodsIdr ?? 0))
  // Packing and the counter fee travel with a `Cek Ongkir Cepat` handoff (same request, DEC-237).
  const [feeMode, setFeeMode] = useState<Mode>(initial?.mode && !["none", "dfod"].includes(initial.mode) ? initial.mode : "buyer_bears_fee")
  const [area, setArea] = useState<Area | null>(initial?.area ?? null)
  const [gram, setGram] = useState(initial?.gram ?? 1000)
  const [dims, setDims] = useState(initial?.dims ? { l: String(initial.dims.l), w: String(initial.dims.w), h: String(initial.dims.h) } : { l: "", w: "", h: "" })
  const [goods, setGoods] = useState(initial?.codGoodsIdr ? initial.codGoodsIdr.toLocaleString("id-ID") : "")
  const [declared, setDeclared] = useState(initial?.declaredValueIdr ? initial.declaredValueIdr.toLocaleString("id-ID") : "")
  const [dg, setDg] = useState(initial?.dangerousGoods === true)
  const [tab, setTab] = useState<"regular" | "cargo">("regular")
  // The owner's margin view starts from Printer & Struk › `showCommission` until the owner toggles it on this screen.
  const [marginOverride, setMarginOverride] = useState<boolean | null>(null)
  // Owner defaults from Pengaturan › Packing & Biaya / Printer & Struk (DEC-225): packing catalogue, counter fee.
  const [packing, setPacking] = useState<string>(initial?.packingName ?? "")
  const [serviceFee, setServiceFee] = useState(initial?.serviceFee ?? true)
  const showMargin = marginOverride ?? pos?.showCommission === true
  const toggleMargin = () => setMarginOverride(!showMargin)
  const packingIdr = pos?.packingItems.find((i) => i.name === packing)?.priceIdr ?? 0
  const hooksRef = useRef(hooks)
  useLayoutEffect(() => {
    hooksRef.current = hooks
  })
  useEffect(() => {
    hooksRef.current.onForm?.({ areaLabel: area?.label ?? null, packingName: packing })
  }, [area?.label, packing])
  // Biaya Layanan Loket applies to Non-COD and COD Ongkir only (never COD Barang).
  const feeAllowed = kind !== "cod_goods"
  const serviceFeeIdr = feeAllowed && serviceFee && pos?.serviceFeeIdr ? pos.serviceFeeIdr : 0
  const [data, setData] = useState<QuoteResponse | null>(null)
  const [req, setReq] = useState<QuoteRequest | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mode: Mode = kind === "non_cod" ? "none" : kind === "cod_shipping" ? "dfod" : feeMode

  // The request the form describes right now; a selection is valid only while it equals the last quoted one.
  const current: QuoteRequest = { destinationAreaId: area?.id ?? "", mode, weightGram: gram }
  const dimL = Number(dims.l)
  const dimW = Number(dims.w)
  const dimH = Number(dims.h)
  // Only include dimensions once all three sides are positive so typing P/L/T never fires a premature 422.
  if (dimL > 0 && dimW > 0 && dimH > 0) Object.assign(current, { lengthCm: dimL, widthCm: dimW, heightCm: dimH })
  if (kind === "cod_goods") current.codGoodsIdr = Number(goods.replace(/\D/g, ""))
  if (kind === "non_cod" && declared) current.declaredValueIdr = Number(declared.replace(/\D/g, ""))
  if (dg) current.dangerousGoods = true
  if (packingIdr) current.packingIdr = packingIdr
  if (serviceFeeIdr) current.serviceFeeIdr = serviceFeeIdr
  const currentKey = JSON.stringify(current)
  const quotedKey = req ? JSON.stringify(req) : null
  const stale = quotedKey !== null && quotedKey !== currentKey
  // Tell the parent once per edit that the selection no longer matches the form (it drops it).
  useEffect(() => {
    if (stale) hooksRef.current.onStale?.()
  }, [stale, currentKey])

  // Only the latest submit may publish, and only while the form still describes its request.
  const generation = useRef(0)
  const lastSubmit = useRef(0)
  const attempted = useRef<string | null>(null)
  // The auto-quote timer re-reads these when it fires (Sol R1-5), and a manual submit cancels it.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keys = useRef({ current: "", quoted: null as string | null })
  // Editing the form supersedes any quote still in flight; a different request also forgets the attempted key, so
  // going A → B → back to A while A was in flight re-quotes A (its answer was discarded as superseded).
  useEffect(() => {
    generation.current++
    if (attempted.current && attempted.current !== currentKey) attempted.current = null
  }, [currentKey])
  const volumetricGram = dims.l && dims.w && dims.h ? (Number(dims.l) * Number(dims.w) * Number(dims.h)) / 6 : 0
  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const mine = ++generation.current
    lastSubmit.current = mine
    setLoading(true)
    setError(null)
    setErrors({})
    hooksRef.current.onStale?.()
    const body = current
    attempted.current = JSON.stringify(body)
    try {
      const r = await api<QuoteResponse>("/quotes", { body })
      // Superseded by an edit or a newer submit: publish nothing.
      if (mine !== generation.current) return
      setData(r)
      setReq(body)
      hooksRef.current.onQuoted?.(body, r.cards)
      // Auto-Cargo: a Non-COD parcel of 5 kg or more (actual or volumetric) opens the Cargo tab when cargo is offered.
      const cargoOffered = r.cards.some((c) => c.serviceClass === "cargo" && c.available)
      setTab(mode === "none" && (gram >= 5000 || volumetricGram >= 5000) && cargoOffered ? "cargo" : "regular")
    } catch (err) {
      if (mine !== generation.current) return
      if (err instanceof ApiError) {
        setErrors(err.body.field_errors)
        setError(Object.keys(err.body.field_errors).length ? null : err.body.message)
      } else setError("Cek ongkir gagal. Coba lagi.")
      setData(null)
      setReq(null)
    } finally {
      if (mine === lastSubmit.current) setLoading(false)
    }
  }

  /** Forget the destination and every result of it (another recipient, `Ganti`): section 4 and 5 go back to empty. */
  function clearQuoteDestination() {
    generation.current++
    attempted.current = null
    setArea(null)
    setData(null)
    setReq(null)
    setErrors({})
    setError(null)
    hooksRef.current.onStale?.()
  }

  // Same 10–100,000 g bounds as the Worker (Sol R1-2): a cleared or out-of-range weight is never quoted.
  const ready = /^[0-9a-f]{24}$/.test(current.destinationAreaId) && isWeightInBounds(gram) && (kind !== "cod_goods" || (current.codGoodsIdr ?? 0) >= 10_000)
  useLayoutEffect(() => {
    keys.current = { current: currentKey, quoted: quotedKey }
  })
  useEffect(() => {
    if (!hooks.auto || !pos || !ready || currentKey === quotedKey || currentKey === attempted.current) return
    const key = currentKey
    timer.current = setTimeout(() => {
      timer.current = null
      // Re-check when it fires: a manual `Cek Ongkir` (or an edit) in the meantime already covers this request.
      if (keys.current.current !== key || keys.current.quoted === key || attempted.current === key) return
      void submit()
    }, AUTO_QUOTE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hooks.auto, pos, ready, currentKey, quotedKey])

  const inTab = data?.cards.filter((c) => c.serviceClass === tab) ?? []
  // Cheapest first among the available services; the ones that do not qualify (with their reason) at the bottom.
  const cards = [...inTab].sort((a, b) => Number(b.available) - Number(a.available) || (a.available && b.available ? a.publishShippingIdr - b.publishShippingIdr : 0))
  const counts = { regular: data?.cards.filter((c) => c.serviceClass === "regular" && c.available).length ?? 0, cargo: data?.cards.filter((c) => c.serviceClass === "cargo" && c.available).length ?? 0 }

  return {
    owner, pos, kind, setKind, feeMode, setFeeMode, area, setArea, gram, setGram, dims, setDims, goods, setGoods, declared, setDeclared, dg, setDg,
    tab, setTab, showMargin, toggleMargin, packing, setPacking, serviceFee, setServiceFee, feeAllowed, mode,
    data, req, errors, error, loading, stale, ready, submit, cards, counts, clearQuoteDestination,
  }
}
export type QuoteForm = ReturnType<typeof useQuoteForm>

/**
 * `3. Detail Paket`: the shipment kind (with its one-line meaning), weight, the caller's contents fields, COD price and
 * fee, then the options. With `disclosure` the options sit in `+ Ukuran P×L×T, Packing & Opsi Lain`, opened by itself
 * whenever one of them holds a value (a QR draft or a Cek Ongkir handoff).
 */
export function PackageFields({ f, disclosure, children, extra, extraFilled = false }: { f: QuoteForm; disclosure: boolean; children?: ReactNode; extra?: ReactNode; extraFilled?: boolean }) {
  const { pos } = f
  const hasOptionError = !!(f.errors.declaredValueIdr || f.errors.dims)
  const filled = !!(f.dims.l || f.dims.w || f.dims.h || f.packing || f.dg || (f.kind === "non_cod" && f.declared) || (f.feeAllowed && pos?.serviceFeeIdr && !f.serviceFee) || extraFilled || hasOptionError)
  // Opens by itself while an option holds a value or error; once the operator toggles it, their choice wins.
  const [openChoice, setOpen] = useState<boolean | null>(null)
  const open = hasOptionError ? true : (openChoice ?? filled)
  const options = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field data-invalid={f.errors.dims ? true : undefined}>
        <FieldLabel>Ukuran P × L × T (cm, opsional)</FieldLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {(["l", "w", "h"] as const).map((k, i) => (
            <Input key={k} aria-label={["Panjang", "Lebar", "Tinggi"][i]} placeholder={["P", "L", "T"][i]} inputMode="numeric" maxLength={3} value={f.dims[k]} onChange={(e) => f.setDims({ ...f.dims, [k]: e.target.value.replace(/\D/g, "").slice(0, 3) })} className="tabular-nums" />
          ))}
        </div>
        {f.errors.dims ? <FieldError>{f.errors.dims}</FieldError> : null}
      </Field>
      {pos && pos.packingItems.length ? (
        <Field>
          <FieldLabel htmlFor="packing">Packing (opsional)</FieldLabel>
          <Select
            items={[{ value: "", label: "Tanpa packing" }, ...pos.packingItems.map((i) => ({ value: i.name, label: `${i.name} (+${rp(i.priceIdr)})` }))]}
            value={f.packing}
            onValueChange={(v) => f.setPacking((v as string | null) ?? "")}
          >
            <SelectTrigger id="packing" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {/* Name left, price right (DEC-244); the trigger shows the plain `items` label. */}
                <SelectItem value="">
                  <span className="truncate">Tanpa packing</span>
                  <span className="ml-auto pl-3 text-xs font-medium text-muted-foreground tabular-nums">Rp0</span>
                </SelectItem>
                {pos.packingItems.map((i) => (
                  <SelectItem key={i.name} value={i.name}>
                    <span className="truncate">{i.name}</span>
                    <span className="ml-auto pl-3 text-xs font-medium text-muted-foreground tabular-nums">+{rp(i.priceIdr)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {f.kind === "non_cod" ? (
        <Field data-invalid={f.errors.declaredValueIdr ? true : undefined}>
          <FieldLabel htmlFor="nilai-barang">Nilai barang (opsional)</FieldLabel>
          <Input id="nilai-barang" inputMode="numeric" value={f.declared} onChange={(e) => f.setDeclared(money(e.target.value))} className="tabular-nums" placeholder="0" />
          <FieldDescription>Wajib Anteraja, Pos, SPX (Rp1.000–Rp10 jt).{Number(f.declared.replace(/\D/g, "")) >= 500_000 ? " Di atas Rp500.000: tawarkan asuransi." : ""}</FieldDescription>
          {f.errors.declaredValueIdr ? <FieldError>{f.errors.declaredValueIdr}</FieldError> : null}
        </Field>
      ) : null}
      <div className="flex flex-col gap-1 sm:col-span-2">
        <CheckboxField checked={f.dg} onCheckedChange={f.setDg}>
          Barang berbahaya (DG) <span className="text-xs text-muted-foreground">· baterai, cairan, parfum — hanya SiCepat & iDexpress</span>
        </CheckboxField>
        {pos?.serviceFeeIdr && f.feeAllowed ? (
          <CheckboxField checked={f.serviceFee} onCheckedChange={f.setServiceFee}>
            Biaya layanan loket {rp(pos.serviceFeeIdr)}
          </CheckboxField>
        ) : null}
      </div>
      {extra ? <div className="sm:col-span-2">{extra}</div> : null}
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <ToggleGroup value={[f.kind]} onValueChange={(v) => v[0] && f.setKind(v[0] as Kind)} variant="outline" spacing={0} aria-label="Jenis pembayaran ongkir" className="grid w-full grid-cols-3">
          {KINDS.map((k) => (
            <ToggleGroupItem key={k.id} value={k.id} className="w-full px-1.5 text-center leading-tight whitespace-normal">{k.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p data-kind-hint className="text-xs text-muted-foreground">{KINDS.find((k) => k.id === f.kind)!.hint}</p>
      </div>
      <WeightInput gram={f.gram} onChange={f.setGram} error={f.errors.weightGram} />
      {children}
      {f.kind === "cod_goods" ? (
        <div className="grid gap-4">
          <Field data-invalid={f.errors.codGoodsIdr ? true : undefined}>
            <FieldLabel htmlFor="harga-barang">Harga barang (COD)</FieldLabel>
            <Input id="harga-barang" inputMode="numeric" value={f.goods} onChange={(e) => f.setGoods(money(e.target.value))} className="tabular-nums" placeholder="Minimal Rp10.000" />
            {f.errors.codGoodsIdr ? <FieldError>{f.errors.codGoodsIdr}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel>Biaya COD</FieldLabel>
            <ToggleGroup value={[f.feeMode]} onValueChange={(v) => v[0] && f.setFeeMode(v[0] as Mode)} variant="outline" spacing={0} aria-label="Biaya COD" className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-0">
              {COD_FEE_MODES.map((m) => (
                <ToggleGroupItem key={m.id} value={m.id} className="w-full px-2 text-center whitespace-normal">{m.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </div>
      ) : null}
      {disclosure ? (
        <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="group rounded-lg border border-slate-200">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-sm font-medium text-slate-700 hover:text-slate-950 md:min-h-9 [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="group-open:hidden">+</span>
            <span aria-hidden className="hidden group-open:inline">−</span>
            Ukuran P×L×T, Packing & Opsi Lain
          </summary>
          <div className="border-t border-slate-200 p-3">{options}</div>
        </details>
      ) : (
        options
      )}
    </div>
  )
}

const COLS = "md:grid-cols-[minmax(0,10.5rem)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,7.5rem)_5.5rem]"
const COLS_MARGIN = "md:grid-cols-[minmax(0,9.5rem)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,7.25rem)_minmax(0,8.25rem)_5.25rem]"
const COLS_CHOOSE = "md:grid-cols-[minmax(0,10rem)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,8rem)_auto]"
const COLS_CHOOSE_MARGIN = "md:grid-cols-[minmax(0,9.5rem)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,7.5rem)_minmax(0,8.5rem)_auto]"

/**
 * `4. Pilihan Ekspedisi`: a compact horizontal control bar (title, destination, Reguler/Cargo tabs, `Cek Ongkir` /
 * `Hitung Ulang`, owner margin toggle) above a full-width cheapest-first courier table from 768px (stacked rows below).
 * `select` is the POS mode — each row is a radio (`aria-checked`, arrows move and select); otherwise each row is a list
 * item with the `onChoose` button.
 */
export function CourierResults({
  f,
  n,
  select,
  onChoose,
  chooseLabel,
  footer,
  empty,
}: {
  f: QuoteForm
  n: number
  select?: { selected: string | null; onSelect: (req: QuoteRequest, card: QuoteCard) => void }
  onChoose?: (req: QuoteRequest, card: QuoteCard, form: { area: Area | null; packingName: string; serviceFee: boolean }) => Promise<void> | void
  chooseLabel?: string
  footer?: ReactNode
  empty: string
}) {
  const [choosing, setChoosing] = useState<string | null>(null)
  const { data, req, stale, cards, counts, mode, owner } = f
  const margin = owner && f.showMargin
  const cols = onChoose ? (margin ? COLS_CHOOSE_MARGIN : COLS_CHOOSE) : margin ? COLS_MARGIN : COLS
  return (
    <Panel className="flex flex-col gap-4" aria-labelledby="pilih-ekspedisi">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <StepTitle n={n} title="Pilihan Ekspedisi" id="pilih-ekspedisi" />
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
              <span className="shrink-0 text-muted-foreground">Tujuan:</span>
              <span className="truncate font-medium text-slate-900">{f.area?.label || "Belum dipilih"}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {owner && data ? (
              <Button type="button" variant="ghost" size="sm" onClick={f.toggleMargin} aria-pressed={f.showMargin} aria-label={f.showMargin ? "Sembunyikan modal" : "Lihat modal & margin"} className="text-muted-foreground">
                {f.showMargin ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />} Laba pemilik
              </Button>
            ) : null}
            <Button type="button" variant={data ? "outline" : "default"} size="sm" onClick={() => void f.submit()} disabled={f.loading}>
              {data ? <RefreshCwIcon aria-hidden /> : null}
              {f.loading ? "Menghitung…" : data ? "Hitung Ulang" : "Cek Ongkir"}
            </Button>
          </div>
        </div>
        {data ? (
          <ToggleGroup value={[f.tab]} onValueChange={(v) => v[0] && f.setTab(v[0] as typeof f.tab)} variant="outline" spacing={0} aria-label="Kategori layanan" className="grid w-full grid-cols-2 sm:inline-grid sm:w-auto">
            <ToggleGroupItem value="regular" className="gap-1.5 px-3">Reguler <span className="text-xs opacity-80 tabular-nums">({counts.regular})</span></ToggleGroupItem>
            <ToggleGroupItem value="cargo" className="gap-1.5 px-3">Cargo ≥ 5 kg <span className="text-xs opacity-80 tabular-nums">({counts.cargo})</span></ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
          {f.loading && !data ? <LoadingState label="Menghitung ongkir semua ekspedisi" rows={4} /> : f.error ? <ErrorState message={f.error} onRetry={() => void f.submit()} /> : !data ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-muted-foreground">{empty}</p>
          ) : (
            <>
              {stale ? (
                <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
                  {f.ready ? "Data paket berubah — ongkir dihitung ulang otomatis. Pilih ekspedisi lagi setelah tarif baru tampil." : "Data paket berubah. Lengkapi data lalu tekan Cek Ongkir lagi sebelum memilih ekspedisi."}
                </p>
              ) : null}
              {cards.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada layanan pada kategori ini.</p> : (
                <>
                  <div aria-hidden className={cn("hidden gap-3 border-b border-slate-200 px-3 pb-2 text-xs font-medium text-muted-foreground md:grid", cols)}>
                    <span>Ekspedisi</span>
                    <span>Layanan</span>
                    <span>Estimasi & berat tagih</span>
                    <span className="text-right">Tarif publik</span>
                    {margin ? <span className="text-right">Modal & laba</span> : null}
                    <span className="text-right">Aksi</span>
                  </div>
                  <div
                    role={select ? "radiogroup" : "list"}
                    aria-label={select ? "Pilih ekspedisi" : "Daftar ekspedisi"}
                    className={cn("flex flex-col gap-1.5", f.loading && "opacity-60")}
                    onKeyDown={(e) => {
                      if (!select || !req || stale || f.loading || !["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return
                      e.preventDefault()
                      // WAI-ARIA radio group: arrows move from the FOCUSED row (wrapping) and select it.
                      const ok = cards.filter((x) => x.available)
                      const focusedCode = (document.activeElement as HTMLElement | null)?.id?.replace(/^kurir-/, "")
                      const at = ok.findIndex((x) => x.serviceCode === focusedCode)
                      const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1
                      const next = ok[at < 0 ? (step > 0 ? 0 : ok.length - 1) : (at + step + ok.length) % ok.length]
                      if (next) {
                        select.onSelect(req, next)
                        document.getElementById(`kurir-${next.serviceCode}`)?.focus()
                      }
                    }}
                  >
                    {cards.map((c) => {
                      // Sol R1-5: rows act only on a settled, current quote (never while a refresh is loading).
                      const selectable = !!select && c.available && !!req && !stale && !f.loading
                      const checked = select?.selected === c.serviceCode
                      // One tab stop per group: the selected row when it is in THIS category, else the first available.
                      const tabStop = cards.find((x) => x.available && x.serviceCode === select?.selected)?.serviceCode ?? cards.find((x) => x.available)?.serviceCode
                      const medal = data.medals.termurah === c.serviceCode ? "Termurah" : data.medals.tercepat === c.serviceCode ? "Tercepat" : data.medals.cairTerbesar === c.serviceCode ? "Cair terbesar" : null
                      const rule = courierRule(c.serviceCode, mode !== "none")
                      return (
                        <div
                          key={c.serviceCode}
                          id={`kurir-${c.serviceCode}`}
                          role={select ? "radio" : "listitem"}
                          aria-checked={select ? checked : undefined}
                          aria-label={select ? `${c.name}${c.available ? `, ${rp(mode === "none" ? c.publishShippingIdr : c.codCollectionTotalIdr)}, ${c.eta ?? ""}` : ", tidak tersedia"}` : undefined}
                          aria-describedby={select ? `kurir-${c.serviceCode}-info` : undefined}
                          aria-disabled={select && !selectable ? true : undefined}
                          tabIndex={selectable ? (tabStop === c.serviceCode ? 0 : -1) : undefined}
                          onClick={selectable ? () => select!.onSelect(req!, c) : undefined}
                          onKeyDown={selectable ? (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), select!.onSelect(req!, c)) : undefined}
                          className={cn(
                            "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-14",
                            cols,
                            selectable && "cursor-pointer hover:border-slate-300 hover:bg-slate-50/70",
                            checked ? "border-primary bg-accent/60 hover:border-primary hover:bg-accent/60" : "border-slate-200 bg-white",
                            !c.available && "bg-slate-50/60",
                          )}
                        >
                          {/* Ekspedisi. The name is printed beside it: the logo is decorative (cargo/ECO share their courier's logo). */}
                          <span className="flex min-w-0 items-center gap-2.5">
                            <CourierLogo code={c.courierCode ?? c.serviceCode} name={c.courierName || c.name} decorative className={cn(!c.available && "opacity-50")} />
                            <span className={cn("truncate text-sm font-medium text-slate-900", !c.available && "text-muted-foreground")}>{c.courierName || c.name}</span>
                          </span>
                          {/* Layanan, its badges and the courier rule; on phones the price sits at the row end. */}
                          <span className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-800">
                              <span className="truncate">{serviceOf(c)}</span>
                              {c.available && medal ? <span className="rounded-full bg-safe-bg px-1.5 py-px text-xs font-semibold text-safe">{medal}</span> : null}
                              {c.available && c.dropOffOnly ? <span className="rounded-full bg-slate-100 px-1.5 py-px text-xs font-medium text-slate-600">Antar sendiri</span> : null}
                            </span>
                            {c.available && rule ? <span className="w-fit rounded-md bg-warn-bg px-1.5 py-0.5 text-xs text-warn">{rule}</span> : null}
                          </span>
                          {/* Rules and refusal reasons wrap (never truncated) and describe the radio for assistive tech. */}
                          <span id={`kurir-${c.serviceCode}-info`} className={cn("text-xs text-muted-foreground tabular-nums", c.available ? "" : "col-span-2 md:col-span-3")}>
                            {c.available ? [c.eta ?? "—", `tagih ${(c.billableWeightGram / 1000).toLocaleString("id-ID")} kg`, c.dropOffOnly ? "antar ke agen ekspedisi" : null].filter(Boolean).join(" · ") : c.unavailableReason}
                          </span>
                          {c.available ? (
                            <span className="col-start-2 row-start-1 flex flex-col items-end text-right tabular-nums md:col-start-auto md:row-start-auto">
                              {mode === "none" ? (
                                <span className="text-sm font-semibold text-slate-950">{rp(c.publishShippingIdr)}</span>
                              ) : (
                                <>
                                  <span className="text-sm font-semibold text-slate-950">{rp(c.codCollectionTotalIdr)}</span>
                                  <span className="text-xs text-muted-foreground">ongkir {rp(c.publishShippingIdr)} + COD {rp(c.codFeeIdr)}</span>
                                  {mode !== "dfod" ? <span className="text-xs text-muted-foreground">cair {rp(c.senderCodPayableIdr)}</span> : null}
                                </>
                              )}
                            </span>
                          ) : null}
                          {margin && c.available ? (
                            <span className="col-span-2 text-xs text-muted-foreground tabular-nums md:col-span-1 md:text-right">
                              {c.providerNetShippingIdr !== undefined ? (
                                <>
                                  Modal {rp(c.providerNetShippingIdr)}{typeof c.observedBps === "number" ? ` · ${(c.observedBps / 100).toLocaleString("id-ID")}%` : ""}
                                  <span className="block font-medium text-safe">Laba {rp(c.estimatedProfitIdr ?? 0)}</span>
                                </>
                              ) : null}
                            </span>
                          ) : margin ? <span className="hidden md:block" /> : null}
                          {select ? (
                            c.available ? (
                              <span aria-hidden className={cn("col-span-2 inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-xs font-medium md:col-span-1 md:justify-self-end", checked ? "border-primary bg-primary text-primary-foreground" : "border-slate-200 bg-white text-slate-700", !selectable && "opacity-50")}>
                                {checked ? "✓ Dipilih" : "Pilih"}
                              </span>
                            ) : null
                          ) : onChoose && c.available && req && !stale ? (
                            <Button type="button" size="sm" variant="outline" className="col-span-2 w-full md:col-span-1 md:w-auto md:justify-self-end" disabled={choosing !== null || f.loading} onClick={async () => { setChoosing(c.serviceCode); try { await onChoose(req, c, { area: f.area, packingName: f.packing, serviceFee: f.serviceFee }) } finally { setChoosing(null) } }}>
                              {choosing === c.serviceCode ? "Memproses…" : (chooseLabel ?? "Pilih")}
                            </Button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
          {footer}
      </div>
    </Panel>
  )
}

/** `Cek Ongkir Cepat`: destination + package in one compact form, then the same courier table (no INV, no parties). */
export function QuotePanel({ onChoose, chooseLabel, footer, initial }: { onChoose?: (req: QuoteRequest, card: QuoteCard, form: { area: Area | null; packingName: string; serviceFee: boolean }) => Promise<void> | void; chooseLabel?: string; footer?: ReactNode; initial?: QuoteInitial }) {
  const f = useQuoteForm(initial, { auto: true })
  return (
    <div className="flex flex-col gap-4">
      <Panel as="form" onSubmit={f.submit} className="flex flex-col gap-4" noValidate>
        <StepTitle n={1} title="Tujuan & spesifikasi paket" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-6">
          <AreaPicker label="Kecamatan tujuan" value={f.area} onChange={f.setArea} error={f.errors.destinationAreaId} />
          <PackageFields f={f} disclosure={false} />
        </div>
      </Panel>
      <CourierResults f={f} n={2} onChoose={onChoose} chooseLabel={chooseLabel} footer={footer} empty="Pilih kecamatan tujuan dan isi berat — ongkir semua ekspedisi muncul otomatis." />
    </div>
  )
}
