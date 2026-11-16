import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { AreaPicker, type Area } from "../../components/area-picker"
import { WeightInput } from "../../components/weight-input"
import { Badge } from "../../components/ui/badge"
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
  pos: { cod: "COD Pos: syarat tingkat terkirim ≥ 82%, maks. Rp2.000.000", any: "Jemput butuh titik koordinat gerai" },
  anteraja: { cod: "COD maks. Rp2.000.000", any: "Selalu dijemput · maks. 50 kg" },
  Sap: { cod: "COD maks. Rp2.000.000" },
  spx: { any: "Maks. 50 kg" },
  lion: { cod: "COD min. Rp10.000" },
  JTEco: { any: "Ekonomis · tidak untuk cargo/DG" },
}
function CourierRules({ code, cod }: { code: string; cod: boolean }) {
  const r = RULES[code]
  const text = [cod ? r?.cod : null, r?.any].filter(Boolean).join(" · ")
  return text ? <span className="text-sm text-muted-foreground">{text}</span> : null
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
    <div className="flex flex-col gap-6">
      <Panel as="form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <h3 className="text-lg font-semibold">1. Tujuan & berat</h3>
        <ToggleGroup value={[kind]} onValueChange={(v) => v[0] && setKind(v[0] as typeof kind)} variant="outline" aria-label="Jenis pembayaran ongkir" className="w-full flex-wrap">
          <ToggleGroupItem value="non_cod">Non-COD</ToggleGroupItem>
          <ToggleGroupItem value="cod_goods">COD Barang</ToggleGroupItem>
          <ToggleGroupItem value="cod_shipping">COD Ongkir</ToggleGroupItem>
        </ToggleGroup>
        <AreaPicker label="Kecamatan tujuan" value={area} onChange={setArea} error={errors.destinationAreaId} />
        <WeightInput gram={gram} onChange={setGram} error={errors.weightGram} />
        <Field data-invalid={errors.dims ? true : undefined}>
          <FieldLabel>Ukuran paket (opsional, cm)</FieldLabel>
          <div className="flex items-center gap-2">
            {(["l", "w", "h"] as const).map((k, i) => (
              <span key={k} className="flex items-center gap-2">
                {i > 0 ? <span aria-hidden>×</span> : null}
                <Input aria-label={["Panjang", "Lebar", "Tinggi"][i]} inputMode="numeric" value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: e.target.value.replace(/\D/g, "") })} className="w-20 tabular-nums" />
              </span>
            ))}
          </div>
          {errors.dims ? <FieldError>{errors.dims}</FieldError> : null}
        </Field>
        {kind === "cod_goods" ? (
          <>
            <Field data-invalid={errors.codGoodsIdr ? true : undefined}>
              <FieldLabel htmlFor="harga-barang">Harga barang (COD)</FieldLabel>
              <Input id="harga-barang" inputMode="numeric" value={goods} onChange={(e) => setGoods(money(e.target.value))} className="w-48 tabular-nums" />
              {errors.codGoodsIdr ? <FieldError>{errors.codGoodsIdr}</FieldError> : null}
            </Field>
            <ToggleGroup value={[feeMode]} onValueChange={(v) => v[0] && setFeeMode(v[0] as Mode)} variant="outline" aria-label="Biaya COD" className="w-full flex-wrap">
              {COD_FEE_MODES.map((m) => (
                <ToggleGroupItem key={m.id} value={m.id}>{m.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        ) : null}
        {kind === "cod_shipping" ? <p className="text-base text-muted-foreground">Ongkir dibayar penerima saat paket tiba.</p> : null}
        {kind === "non_cod" ? (
          <Field data-invalid={errors.declaredValueIdr ? true : undefined}>
            <FieldLabel htmlFor="nilai-barang">Nilai barang (opsional)</FieldLabel>
            <Input id="nilai-barang" inputMode="numeric" value={declared} onChange={(e) => setDeclared(money(e.target.value))} className="w-48 tabular-nums" placeholder="0" />
            <FieldDescription>Wajib untuk Anteraja, Pos Indonesia dan SPX (Rp1.000–Rp10.000.000).{Number(declared.replace(/\D/g, "")) >= 500_000 ? " Nilai di atas Rp500.000: tawarkan asuransi ke pengirim." : ""}</FieldDescription>
            {errors.declaredValueIdr ? <FieldError>{errors.declaredValueIdr}</FieldError> : null}
          </Field>
        ) : null}
        <CheckboxField checked={dg} onCheckedChange={setDg} align="start">
          Barang berbahaya (DG)
          <span className="block text-muted-foreground">Baterai, cairan, parfum, aerosol. Hanya SiCepat (HALU) dan iDexpress yang menerima.</span>
        </CheckboxField>
        {pos && pos.packingItems.length ? (
          <Field>
            <FieldLabel htmlFor="packing">Packing (opsional)</FieldLabel>
            <Select
              items={[{ value: "", label: "Tanpa packing" }, ...pos.packingItems.map((i) => ({ value: i.name, label: `${i.name} · ${rp(i.priceIdr)}` }))]}
              value={packing}
              onValueChange={(v) => setPacking((v as string | null) ?? "")}
            >
              <SelectTrigger id="packing" className="w-full max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="">Tanpa packing</SelectItem>
                  {pos.packingItems.map((i) => (
                    <SelectItem key={i.name} value={i.name}>
                      {i.name} · {rp(i.priceIdr)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {pos?.serviceFeeIdr && feeAllowed ? (
          <CheckboxField checked={serviceFee} onCheckedChange={setServiceFee}>
            Biaya layanan loket {rp(pos.serviceFeeIdr)}
          </CheckboxField>
        ) : null}
        <div><Button type="submit" disabled={loading}>{loading ? "Menghitung…" : "Cek Ongkir"}</Button></div>
      </Panel>

      {loading ? <LoadingState label="Menghitung ongkir semua ekspedisi" rows={4} /> : error ? <ErrorState message={error} /> : data ? (
        <Panel className="flex flex-col gap-4" aria-labelledby="pilih-ekspedisi">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="pilih-ekspedisi" className="text-lg font-semibold">2. Pilih ekspedisi</h3>
            {owner ? (
              <Button type="button" variant="outline" onClick={() => setShowMargin((v) => !v)} aria-pressed={showMargin}>
                {showMargin ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />} {showMargin ? "Sembunyikan modal" : "Lihat modal & margin"}
              </Button>
            ) : null}
          </div>
          {stale ? <p role="status" className="border-l-4 border-warn py-1 pl-3 text-base">Data paket berubah. Tekan Cek Ongkir lagi sebelum memilih ekspedisi.</p> : null}
          <ToggleGroup value={[tab]} onValueChange={(v) => v[0] && setTab(v[0] as typeof tab)} variant="outline" aria-label="Kategori layanan">
            <ToggleGroupItem value="regular">Reguler ({counts.regular})</ToggleGroupItem>
            <ToggleGroupItem value="cargo">Cargo ≥ 5 kg ({counts.cargo})</ToggleGroupItem>
          </ToggleGroup>
          {cards.length === 0 ? <p className="text-base text-muted-foreground">Tidak ada layanan pada kategori ini.</p> : (
            <ul className="flex flex-col divide-y rounded-lg border" aria-label="Daftar ekspedisi">
              {cards.map((c) => (
                <li key={c.serviceCode} className={`flex flex-col gap-2 p-4 ${c.available ? "" : "opacity-70"} ${select?.selected === c.serviceCode ? "bg-primary/5 ring-2 ring-primary ring-inset" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2 text-base font-medium">
                        {c.name}
                        {data.medals.termurah === c.serviceCode ? <Badge variant="outline">Termurah</Badge> : null}
                        {data.medals.tercepat === c.serviceCode ? <Badge variant="outline">Tercepat</Badge> : null}
                        {data.medals.cairTerbesar === c.serviceCode ? <Badge variant="outline">Cair COD terbesar</Badge> : null}
                      </span>
                      <span className="text-base text-muted-foreground">
                        {c.available ? `Estimasi ${c.eta ?? "—"} · tagih ${(c.billableWeightGram / 1000).toLocaleString("id-ID")} kg` : c.unavailableReason}
                      </span>
                      {c.available && c.dropOffOnly ? <span className="w-fit rounded-md border border-primary px-2 text-sm text-primary">Drop-off saja — antar ke agen ekspedisi</span> : null}
                      {c.available ? <CourierRules code={c.serviceCode} cod={mode !== "none"} /> : null}
                    </div>
                    {c.available ? (
                      <div className="flex flex-col items-end gap-1 text-right tabular-nums">
                        {mode === "none" ? (
                          <span className="text-lg font-semibold">{rp(c.publishShippingIdr)}</span>
                        ) : (
                          <>
                            <span className="text-base">Tagih penerima <strong className="text-lg">{rp(c.codCollectionTotalIdr)}</strong></span>
                            {mode !== "dfod" ? <span className="text-base text-muted-foreground">Cair ke pengirim {rp(c.senderCodPayableIdr)}</span> : null}
                            <span className="text-base text-muted-foreground">Ongkir {rp(c.publishShippingIdr)} + biaya COD {rp(c.codFeeIdr)}</span>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {owner && showMargin && c.available && c.providerNetShippingIdr !== undefined ? (
                    <p className="text-base text-muted-foreground tabular-nums">
                      Modal {rp(c.providerNetShippingIdr)}{typeof c.observedBps === "number" ? ` (diskon ${(c.observedBps / 100).toLocaleString("id-ID")}%)` : ""} · Estimasi laba {rp(c.estimatedProfitIdr ?? 0)}
                    </p>
                  ) : null}
                  {select && c.available && req && !stale ? (
                    <div>
                      <Button type="button" variant={select.selected === c.serviceCode ? "default" : "outline"} aria-pressed={select.selected === c.serviceCode} onClick={() => select.onSelect(req, c)}>
                        {select.selected === c.serviceCode ? "Terpilih" : "Pilih"}
                      </Button>
                    </div>
                  ) : null}
                  {onChoose && c.available && req && !stale ? (
                    <div>
                      <Button type="button" variant="outline" disabled={choosing !== null} onClick={async () => { setChoosing(c.serviceCode); try { await onChoose(req, c, { area, packingName: packing, serviceFee }) } finally { setChoosing(null) } }}>
                        {choosing === c.serviceCode ? "Memproses…" : (chooseLabel ?? "Pilih")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {footer}
        </Panel>
      ) : null}
    </div>
  )
}
