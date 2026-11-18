import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { cn } from "cn"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { AreaPicker, type Area } from "../../components/area-picker"
import { WeightInput } from "../../components/weight-input"
import { Button } from "../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { api, ApiError } from "../../lib/api"
import { ErrorState, LoadingState } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { CheckboxField, Panel } from "../../components/admin/page"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"

// Quote form + courier cards (visual 05 §2, PR-06). Used by `Cek Ongkir Cepat` (no INV) and by `Buat Pengiriman`
// (choosing a card freezes the quote and allocates the INV). Kasir responses never contain cost or margin.
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
interface PosConfig { packingItems: Array<{ name: string; priceIdr: number }>; serviceFeeIdr: number | null; showCommission: boolean }
interface QuoteResponse { cards: QuoteCard[]; medals: { termurah: string | null; tercepat: string | null; cairTerbesar: string | null } }

/** `Rp 12.500`; negatives as `-Rp 2.500`; never `Rp -0`. */
export const rp = (n: number) => (n < 0 ? `-Rp ${(-n).toLocaleString("id-ID")}` : `Rp ${(n === 0 ? 0 : n).toLocaleString("id-ID")}`)
const COD_FEE_MODES: Array<{ id: Mode; label: string }> = [
  { id: "buyer_bears_fee", label: "Dibayar penerima" },
  { id: "sender_bears_fee", label: "Dipotong dari pengirim" },
  { id: "cod_all_in", label: "COD all-in" },
]

const kindOf = (m: Mode | undefined, cod: number) => (m === "dfod" ? "cod_shipping" : (m && m !== "none") || cod ? "cod_goods" : "non_cod")
const money = (v: string) => (v.replace(/\D/g, "") ? Number(v.replace(/\D/g, "")).toLocaleString("id-ID") : "")

/**
 * `select`: the POS mode (DEC-237) — a card button marks the courier chosen on this screen (`aria-pressed`) instead
 * of leaving it; `autoQuote` runs the quote once on mount (prefilled from `Cek Ongkir Cepat`).
 */
/** Mengantar courier rules worth seeing before choosing (check-shipping-fee v2.0.0 limits; DEC-238). */
const RULES: Record<string, { cod?: string; any?: string }> = {
  pos: { cod: "COD: terkirim ≥ 82%, maks. Rp2 jt", any: "jemput butuh titik koordinat" },
  anteraja: { cod: "COD maks. Rp2 jt", any: "selalu dijemput · maks. 50 kg" },
  Sap: { cod: "COD maks. Rp2 jt" },
  spx: { any: "maks. 50 kg" },
  lion: { cod: "COD min. Rp10 rb" },
  JTEco: { any: "ekonomis · tanpa cargo/DG" },
}
const courierRule = (code: string, cod: boolean) => {
  const r = RULES[code]
  return [cod ? r?.cod : null, r?.any].filter(Boolean).join(" · ")
}
const CODE: Record<string, string> = { JNE: "JNE", SiCepat: "SCP", Sap: "SAP", iDexpress: "IDE", JT: "J&T", lion: "LION", anteraja: "ATR", pos: "POS", spx: "SPX", ninja: "NJV" }
/** Short courier mark for the row badge (cargo/ECO share their courier's mark). */
const courierCode = (c: { serviceCode: string; courierCode?: string }) => CODE[c.courierCode ?? ""] ?? CODE[c.serviceCode] ?? c.serviceCode.slice(0, 4).toUpperCase()

/** Step heading inside a POS card: numbered dot + 14/16px title. */
export function StepTitle({ n, title, id }: { n: number; title: string; id?: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-slate-950 md:text-base">
      <span aria-hidden className="grid size-5 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
      {title}
    </h2>
  )
}

export function QuotePanel({
  onChoose,
  chooseLabel,
  footer,
  initial,
  select,
  autoQuote,
  onQuoted,
  onStale,
  onForm,
}: {
  onChoose?: (req: QuoteRequest, card: QuoteCard, form: { area: Area | null; packingName: string; serviceFee: boolean }) => Promise<void> | void
  chooseLabel?: string
  footer?: ReactNode
  initial?: QuoteInitial
  select?: { selected: string | null; onSelect: (req: QuoteRequest, card: QuoteCard) => void }
  autoQuote?: boolean
  onQuoted?: (req: QuoteRequest, cards: QuoteCard[]) => void
  /** The form no longer matches the last quoted request (edited, re-quoting, or the quote failed). */
  onStale?: () => void
  /** Customer-display labels (TASK-701): the destination area label and the packing item's name. */
  onForm?: (f: { areaLabel: string | null; packingName: string }) => void
}) {
  const w = useWorkspace()
  const owner = isOwner(w)
  const [kind, setKind] = useState<"non_cod" | "cod_goods" | "cod_shipping">(kindOf(initial?.mode, initial?.codGoodsIdr ?? 0))
  // Packing and the counter fee travel with a `Cek Ongkir Cepat` handoff (same request, DEC-237).
  const [feeMode, setFeeMode] = useState<Mode>(initial?.mode && !["none", "dfod"].includes(initial.mode) ? initial.mode : "buyer_bears_fee")
  const [area, setArea] = useState<Area | null>(initial?.area ?? null)
  const [gram, setGram] = useState(initial?.gram ?? 1000)
  const [dims, setDims] = useState(initial?.dims ? { l: String(initial.dims.l), w: String(initial.dims.w), h: String(initial.dims.h) } : { l: "", w: "", h: "" })
  const [goods, setGoods] = useState(initial?.codGoodsIdr ? initial.codGoodsIdr.toLocaleString("id-ID") : "")
  const [declared, setDeclared] = useState(initial?.declaredValueIdr ? initial.declaredValueIdr.toLocaleString("id-ID") : "")
  const [dg, setDg] = useState(initial?.dangerousGoods === true)
  const [tab, setTab] = useState<"regular" | "cargo">("regular")
  const [showMargin, setShowMargin] = useState(false)
  // Owner defaults from Pengaturan › Packing & Biaya / Printer & Struk (DEC-225): packing catalogue, counter fee.
  const [pos, setPos] = useState<PosConfig | null>(null)
  const [packing, setPacking] = useState<string>(initial?.packingName ?? "")
  const [serviceFee, setServiceFee] = useState(initial?.serviceFee ?? true)
  useEffect(() => {
    api<PosConfig>("/pos-config")
      .then((c) => {
        setPos(c)
        if (c.showCommission) setShowMargin(true)
      })
      .catch(() => setPos({ packingItems: [], serviceFeeIdr: null, showCommission: false }))
  }, [])
  const packingIdr = pos?.packingItems.find((i) => i.name === packing)?.priceIdr ?? 0
  useEffect(() => {
    onForm?.({ areaLabel: area?.label ?? null, packingName: packing })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area?.label, packing])
  // Biaya Layanan Loket applies to Non-COD and COD Ongkir only (never COD Barang).
  const feeAllowed = kind !== "cod_goods"
  const serviceFeeIdr = feeAllowed && serviceFee && pos?.serviceFeeIdr ? pos.serviceFeeIdr : 0
  const [data, setData] = useState<QuoteResponse | null>(null)
  const [req, setReq] = useState<QuoteRequest | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [choosing, setChoosing] = useState<string | null>(null)
  const mode: Mode = kind === "non_cod" ? "none" : kind === "cod_shipping" ? "dfod" : feeMode

  // The request the form describes right now; a selection is valid only while it equals the last quoted one.
  const current: QuoteRequest = { destinationAreaId: area?.id ?? "", mode, weightGram: gram }
  if (dims.l || dims.w || dims.h) Object.assign(current, { lengthCm: Number(dims.l), widthCm: Number(dims.w), heightCm: Number(dims.h) })
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
    if (stale) onStale?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, currentKey])

  // Only the latest submit may publish, and only while the form still describes its request (an answer to a request
  // the operator has since edited must never restore a selection — Sol R2-A).
  const generation = useRef(0)
  const lastSubmit = useRef(0)
  // Editing the form supersedes any quote still in flight.
  useEffect(() => {
    generation.current++
  }, [currentKey])
  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const mine = ++generation.current
    lastSubmit.current = mine
    setLoading(true)
    setError(null)
    setErrors({})
    onStale?.()
    const body = current
    try {
      const r = await api<QuoteResponse>("/quotes", { body })
      // Superseded by an edit or a newer submit: publish nothing (the stale warning stays until Cek Ongkir again).
      if (mine !== generation.current) return
      setData(r)
      setReq(body)
      onQuoted?.(body, r.cards)
      if (gram >= 5000 && mode === "none") setTab("cargo")
      else setTab("regular")
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

  // Prefilled from `Cek Ongkir Cepat`: run the quote once (the form stays editable).
  const autoRan = useRef(!(autoQuote === true && initial?.area))
  useEffect(() => {
    if (autoRan.current || !pos) return
    autoRan.current = true
    void submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  const cards = data?.cards.filter((c) => c.serviceClass === tab) ?? []
  const counts = { regular: data?.cards.filter((c) => c.serviceClass === "regular" && c.available).length ?? 0, cargo: data?.cards.filter((c) => c.serviceClass === "cargo" && c.available).length ?? 0 }

  return (
    <div className="flex flex-col gap-4">
      <Panel as="form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <StepTitle n={1} title="Tujuan & spesifikasi paket" />
        <ToggleGroup value={[kind]} onValueChange={(v) => v[0] && setKind(v[0] as typeof kind)} variant="outline" spacing={0} aria-label="Jenis pembayaran ongkir" className="grid w-full grid-cols-3">
          <ToggleGroupItem value="non_cod" className="w-full">Non-COD</ToggleGroupItem>
          <ToggleGroupItem value="cod_goods" className="w-full">COD Barang</ToggleGroupItem>
          <ToggleGroupItem value="cod_shipping" className="w-full">COD Ongkir</ToggleGroupItem>
        </ToggleGroup>
        <AreaPicker label="Kecamatan tujuan" value={area} onChange={setArea} error={errors.destinationAreaId} />
        <WeightInput gram={gram} onChange={setGram} error={errors.weightGram} />
        <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={errors.dims ? true : undefined}>
          <FieldLabel>Ukuran P × L × T (cm, opsional)</FieldLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {(["l", "w", "h"] as const).map((k, i) => (
              <Input key={k} aria-label={["Panjang", "Lebar", "Tinggi"][i]} placeholder={["P", "L", "T"][i]} inputMode="numeric" value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: e.target.value.replace(/\D/g, "") })} className="tabular-nums" />
            ))}
          </div>
          {errors.dims ? <FieldError>{errors.dims}</FieldError> : null}
        </Field>
        {kind === "cod_goods" ? (
          <>
            <Field data-invalid={errors.codGoodsIdr ? true : undefined}>
              <FieldLabel htmlFor="harga-barang">Harga barang (COD)</FieldLabel>
              <Input id="harga-barang" inputMode="numeric" value={goods} onChange={(e) => setGoods(money(e.target.value))} className="tabular-nums" />
              {errors.codGoodsIdr ? <FieldError>{errors.codGoodsIdr}</FieldError> : null}
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel>Biaya COD</FieldLabel>
              <ToggleGroup value={[feeMode]} onValueChange={(v) => v[0] && setFeeMode(v[0] as Mode)} variant="outline" spacing={0} aria-label="Biaya COD" className="grid w-full grid-cols-3">
                {COD_FEE_MODES.map((m) => (
                  <ToggleGroupItem key={m.id} value={m.id} className="w-full px-1.5">{m.label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          </>
        ) : null}
        {kind === "cod_shipping" ? <p className="self-end pb-2 text-sm text-muted-foreground">Ongkir dibayar penerima saat paket tiba.</p> : null}
        {kind === "non_cod" ? (
          <Field data-invalid={errors.declaredValueIdr ? true : undefined}>
            <FieldLabel htmlFor="nilai-barang">Nilai barang (opsional)</FieldLabel>
            <Input id="nilai-barang" inputMode="numeric" value={declared} onChange={(e) => setDeclared(money(e.target.value))} className="tabular-nums" placeholder="0" />
            <FieldDescription>Wajib Anteraja, Pos, SPX (Rp1.000–Rp10 jt).{Number(declared.replace(/\D/g, "")) >= 500_000 ? " Di atas Rp500.000: tawarkan asuransi." : ""}</FieldDescription>
            {errors.declaredValueIdr ? <FieldError>{errors.declaredValueIdr}</FieldError> : null}
          </Field>
        ) : null}
        {pos && pos.packingItems.length ? (
          <Field>
            <FieldLabel htmlFor="packing">Packing (opsional)</FieldLabel>
            <Select
              items={[{ value: "", label: "Tanpa packing" }, ...pos.packingItems.map((i) => ({ value: i.name, label: `${i.name} (+${rp(i.priceIdr)})` }))]}
              value={packing}
              onValueChange={(v) => setPacking((v as string | null) ?? "")}
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
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <CheckboxField checked={dg} onCheckedChange={setDg}>
            Barang berbahaya (DG) <span className="text-xs text-muted-foreground">· baterai, cairan, parfum — hanya SiCepat & iDexpress</span>
          </CheckboxField>
          {pos?.serviceFeeIdr && feeAllowed ? (
            <CheckboxField checked={serviceFee} onCheckedChange={setServiceFee}>
              Biaya layanan loket {rp(pos.serviceFeeIdr)}
            </CheckboxField>
          ) : null}
        </div>
        <div className="flex justify-end"><Button type="submit" disabled={loading} className="w-full sm:w-auto">{loading ? "Menghitung…" : "Cek Ongkir"}</Button></div>
      </Panel>

      {loading ? <LoadingState label="Menghitung ongkir semua ekspedisi" rows={4} /> : error ? <ErrorState message={error} /> : data ? (
        <Panel className="flex flex-col gap-4" aria-labelledby="pilih-ekspedisi">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StepTitle n={2} title="Pilih layanan ekspedisi" id="pilih-ekspedisi" />
            <div className="flex items-center gap-1.5">
              <ToggleGroup value={[tab]} onValueChange={(v) => v[0] && setTab(v[0] as typeof tab)} variant="outline" spacing={0} size="sm" aria-label="Kategori layanan">
                <ToggleGroupItem value="regular">Reguler ({counts.regular})</ToggleGroupItem>
                <ToggleGroupItem value="cargo">Cargo ≥ 5 kg ({counts.cargo})</ToggleGroupItem>
              </ToggleGroup>
              {owner ? (
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setShowMargin((v) => !v)} aria-pressed={showMargin} aria-label={showMargin ? "Sembunyikan modal" : "Lihat modal & margin"} className="text-muted-foreground">
                  {showMargin ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
                </Button>
              ) : null}
            </div>
          </div>
          {stale ? <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">Data paket berubah. Tekan Cek Ongkir lagi sebelum memilih ekspedisi.</p> : null}
          {cards.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada layanan pada kategori ini.</p> : (
            // DEC-239: compact selectable rows (radio semantics; the whole row is the hit area), ~56px each, so six
            // couriers fit without scrolling. Cek Ongkir Cepat keeps a small action button at the row end instead.
            <div
              role={select ? "radiogroup" : "list"}
              aria-label={select ? "Pilih ekspedisi" : "Daftar ekspedisi"}
              className="flex flex-col gap-1.5"
              onKeyDown={(e) => {
                if (!select || !req || stale || !["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return
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
                const selectable = !!select && c.available && !!req && !stale
                const checked = select?.selected === c.serviceCode
                // One tab stop per group: the selected row when it is in THIS category, else the first available one.
                const tabStop = cards.find((x) => x.available && x.serviceCode === select?.selected)?.serviceCode ?? cards.find((x) => x.available)?.serviceCode
                const firstFocusable = tabStop === c.serviceCode
                const medal = data.medals.termurah === c.serviceCode ? "Termurah" : data.medals.tercepat === c.serviceCode ? "Tercepat" : data.medals.cairTerbesar === c.serviceCode ? "Cair terbesar" : null
                return (
                  <div
                    key={c.serviceCode}
                    id={`kurir-${c.serviceCode}`}
                    role={select ? "radio" : "listitem"}
                    aria-checked={select ? checked : undefined}
                    aria-label={select ? `${c.name}${c.available ? `, ${rp(mode === "none" ? c.publishShippingIdr : c.codCollectionTotalIdr)}, ${c.eta ?? ""}` : ", tidak tersedia"}` : undefined}
                    aria-describedby={select ? `kurir-${c.serviceCode}-info` : undefined}
                    aria-disabled={select && !selectable ? true : undefined}
                    tabIndex={selectable ? (firstFocusable ? 0 : -1) : undefined}
                    onClick={selectable ? () => select!.onSelect(req!, c) : undefined}
                    onKeyDown={selectable ? (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), select!.onSelect(req!, c)) : undefined}
                    className={cn(
                      "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-nowrap",
                      selectable && "cursor-pointer hover:border-slate-300 hover:bg-slate-50/70",
                      checked ? "border-primary bg-accent/60 hover:border-primary hover:bg-accent/60" : "border-slate-200 bg-white",
                      !c.available && "bg-slate-50/60",
                    )}
                  >
                    {select ? (
                      <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-primary" : "border-slate-300", !c.available && "opacity-40")}>
                        {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
                      </span>
                    ) : null}
                    <span aria-hidden className={cn("grid h-7 w-11 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600", !c.available && "opacity-50")}>
                      {courierCode(c)}
                    </span>
                    <span className="flex min-w-[8rem] flex-1 flex-col gap-0.5">
                      <span className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-slate-900", !c.available && "text-muted-foreground")}>
                        <span className="truncate">{c.name}</span>
                        {c.available && medal ? <span className="rounded-full bg-emerald-500/12 px-1.5 py-px text-xs font-semibold text-emerald-700">{medal}</span> : null}
                        {c.available && c.dropOffOnly ? <span className="rounded-full bg-slate-100 px-1.5 py-px text-xs font-medium text-slate-600">Antar ke agen</span> : null}
                      </span>
                      {/* Rules and refusal reasons wrap (never truncated) and describe the radio for assistive tech. */}
                      <span id={`kurir-${c.serviceCode}-info`} className="text-xs text-muted-foreground">
                        {c.available
                          ? [`${c.eta ?? "—"}`, `tagih ${(c.billableWeightGram / 1000).toLocaleString("id-ID")} kg`, courierRule(c.serviceCode, mode !== "none"), c.dropOffOnly ? "antar ke agen ekspedisi" : null].filter(Boolean).join(" · ")
                          : c.unavailableReason}
                        {c.available && mode !== "none" ? <span className="block tabular-nums">Ongkir {rp(c.publishShippingIdr)} + biaya COD {rp(c.codFeeIdr)}</span> : null}
                      </span>
                      {owner && showMargin && c.available && c.providerNetShippingIdr !== undefined ? (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Modal {rp(c.providerNetShippingIdr)}{typeof c.observedBps === "number" ? ` · diskon ${(c.observedBps / 100).toLocaleString("id-ID")}%` : ""} · laba <span className="font-medium text-safe">{rp(c.estimatedProfitIdr ?? 0)}</span>
                        </span>
                      ) : null}
                    </span>
                    {c.available ? (
                      <span className="flex shrink-0 flex-col items-end text-right tabular-nums">
                        {mode === "none" ? (
                          <span className="text-sm font-semibold text-slate-950">{rp(c.publishShippingIdr)}</span>
                        ) : (
                          <>
                            <span className="text-sm font-semibold text-slate-950">{rp(c.codCollectionTotalIdr)}</span>
                            <span className="text-xs text-muted-foreground">{mode !== "dfod" ? `cair ${rp(c.senderCodPayableIdr)}` : `ongkir ${rp(c.publishShippingIdr)}`}</span>
                          </>
                        )}
                      </span>
                    ) : null}
                    {onChoose && c.available && req && !stale ? (
                      <Button type="button" size="sm" variant="outline" className="w-full shrink-0 sm:w-auto" disabled={choosing !== null} onClick={async () => { setChoosing(c.serviceCode); try { await onChoose(req, c, { area, packingName: packing, serviceFee }) } finally { setChoosing(null) } }}>
                        {choosing === c.serviceCode ? "Memproses…" : (chooseLabel ?? "Pilih")}
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
          {footer}
        </Panel>
      ) : null}
    </div>
  )
}
