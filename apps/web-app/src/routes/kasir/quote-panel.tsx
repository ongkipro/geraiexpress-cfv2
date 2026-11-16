import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { AreaPicker, type Area } from "../../components/area-picker"
import { WeightInput } from "../../components/weight-input"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Field, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { api, ApiError } from "../../lib/api"
import { ErrorState, LoadingState } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"

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
}
interface PosConfig { packingItems: Array<{ name: string; priceIdr: number }>; serviceFeeIdr: number | null; showCommission: boolean }
interface QuoteResponse { cards: QuoteCard[]; medals: { termurah: string | null; tercepat: string | null; cairTerbesar: string | null } }

/** `Rp 12.500`; negatives as `-Rp 2.500`; never `Rp -0`. */
export const rp = (n: number) => (n < 0 ? `-Rp ${(-n).toLocaleString("id-ID")}` : `Rp ${(n === 0 ? 0 : n).toLocaleString("id-ID")}`)
const COD_FEE_MODES: Array<{ id: Mode; label: string }> = [
  { id: "buyer_bears_fee", label: "Dibayar penerima" },
  { id: "sender_bears_fee", label: "Dipotong dari pengirim" },
  { id: "cod_all_in", label: "COD all-in" },
]

export function QuotePanel({ onChoose, chooseLabel, footer, initial }: { onChoose?: (req: QuoteRequest, card: QuoteCard) => Promise<void> | void; chooseLabel?: string; footer?: ReactNode; initial?: { area: Area; gram: number; codGoodsIdr: number } }) {
  const w = useWorkspace()
  const owner = isOwner(w)
  const [kind, setKind] = useState<"non_cod" | "cod_goods" | "cod_shipping">(initial?.codGoodsIdr ? "cod_goods" : "non_cod")
  const [feeMode, setFeeMode] = useState<Mode>("buyer_bears_fee")
  const [area, setArea] = useState<Area | null>(initial?.area ?? null)
  const [gram, setGram] = useState(initial?.gram ?? 1000)
  const [dims, setDims] = useState({ l: "", w: "", h: "" })
  const [goods, setGoods] = useState(initial?.codGoodsIdr ? initial.codGoodsIdr.toLocaleString("id-ID") : "")
  const [tab, setTab] = useState<"regular" | "cargo">("regular")
  const [showMargin, setShowMargin] = useState(false)
  // Owner defaults from Pengaturan › Packing & Biaya / Printer & Struk (DEC-225): packing catalogue, counter fee.
  const [pos, setPos] = useState<PosConfig | null>(null)
  const [packing, setPacking] = useState<string>("")
  const [serviceFee, setServiceFee] = useState(true)
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

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setErrors({})
    const body: QuoteRequest = { destinationAreaId: area?.id ?? "", mode, weightGram: gram }
    if (dims.l || dims.w || dims.h) Object.assign(body, { lengthCm: Number(dims.l), widthCm: Number(dims.w), heightCm: Number(dims.h) })
    if (kind === "cod_goods") body.codGoodsIdr = Number(goods.replace(/\D/g, ""))
    if (packingIdr) body.packingIdr = packingIdr
    if (serviceFeeIdr) body.serviceFeeIdr = serviceFeeIdr
    try {
      const r = await api<QuoteResponse>("/quotes", { body })
      setData(r)
      setReq(body)
      if (gram >= 5000 && mode === "none") setTab("cargo")
      else setTab("regular")
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.body.field_errors)
        setError(Object.keys(err.body.field_errors).length ? null : err.body.message)
      } else setError("Cek ongkir gagal. Coba lagi.")
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const cards = data?.cards.filter((c) => c.serviceClass === tab) ?? []
  const counts = { regular: data?.cards.filter((c) => c.serviceClass === "regular" && c.available).length ?? 0, cargo: data?.cards.filter((c) => c.serviceClass === "cargo" && c.available).length ?? 0 }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-5 rounded-lg border bg-card p-4 md:p-6" noValidate>
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
              <Input id="harga-barang" inputMode="numeric" value={goods} onChange={(e) => setGoods(e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")).toLocaleString("id-ID") : "")} className="w-48 tabular-nums" />
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
        {pos && pos.packingItems.length ? (
          <Field>
            <FieldLabel htmlFor="packing">Packing (opsional)</FieldLabel>
            <select id="packing" value={packing} onChange={(e) => setPacking(e.target.value)} className="h-11 w-full max-w-sm rounded-md border border-input bg-background px-3 text-base">
              <option value="">Tanpa packing</option>
              {pos.packingItems.map((i) => (
                <option key={i.name} value={i.name}>{i.name} · {rp(i.priceIdr)}</option>
              ))}
            </select>
          </Field>
        ) : null}
        {pos?.serviceFeeIdr && feeAllowed ? (
          <label className="flex min-h-11 items-center gap-3 text-base">
            <input type="checkbox" className="size-5" checked={serviceFee} onChange={(e) => setServiceFee(e.target.checked)} />
            Biaya layanan loket {rp(pos.serviceFeeIdr)}
          </label>
        ) : null}
        <div><Button type="submit" disabled={loading}>{loading ? "Menghitung…" : "Cek Ongkir"}</Button></div>
      </form>

      {loading ? <LoadingState label="Menghitung ongkir semua ekspedisi" rows={4} /> : error ? <ErrorState message={error} /> : data ? (
        <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="pilih-ekspedisi">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="pilih-ekspedisi" className="text-lg font-semibold">2. Pilih ekspedisi</h3>
            {owner ? (
              <Button type="button" variant="outline" onClick={() => setShowMargin((v) => !v)} aria-pressed={showMargin}>
                {showMargin ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />} {showMargin ? "Sembunyikan modal" : "Lihat modal & margin"}
              </Button>
            ) : null}
          </div>
          <ToggleGroup value={[tab]} onValueChange={(v) => v[0] && setTab(v[0] as typeof tab)} variant="outline" aria-label="Kategori layanan">
            <ToggleGroupItem value="regular">Reguler ({counts.regular})</ToggleGroupItem>
            <ToggleGroupItem value="cargo">Cargo ≥ 5 kg ({counts.cargo})</ToggleGroupItem>
          </ToggleGroup>
          {cards.length === 0 ? <p className="text-base text-muted-foreground">Tidak ada layanan pada kategori ini.</p> : (
            <ul className="flex flex-col divide-y rounded-lg border" aria-label="Daftar ekspedisi">
              {cards.map((c) => (
                <li key={c.serviceCode} className={`flex flex-col gap-2 p-4 ${c.available ? "" : "opacity-70"}`}>
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
                  {onChoose && c.available && req ? (
                    <div>
                      <Button type="button" variant="outline" disabled={choosing !== null} onClick={async () => { setChoosing(c.serviceCode); try { await onChoose(req, c) } finally { setChoosing(null) } }}>
                        {choosing === c.serviceCode ? "Memproses…" : (chooseLabel ?? "Pilih")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {footer}
        </section>
      ) : null}
    </div>
  )
}
