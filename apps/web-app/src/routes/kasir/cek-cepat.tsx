import { useNavigate } from "@tanstack/react-router"
import { PageTitle } from "../../shell/states"
import { QuotePanel } from "./quote-panel"

// `Cek Ongkir Cepat` (PR-09, DEC-225, DEC-237): a standalone tariff calculator — no INV and no draft. `Buat Kiriman
// dari Tarif Ini` opens `Kiriman Satuan` prefilled with this request and the chosen service.
export function CekCepatPage() {
  const navigate = useNavigate()
  return (
    <div>
      <PageTitle title="Cek Ongkir Cepat" description="Bandingkan ongkir semua ekspedisi tanpa membuat kiriman." />
      <QuotePanel
        chooseLabel="Buat Kiriman dari Tarif Ini"
        onChoose={async (req, card, form) => {
          // The same request travels to Kiriman Satuan, including packing and the counter-fee choice.
          const search: Record<string, string> = { tujuan: req.destinationAreaId, wilayah: form.area?.label ?? "", berat: String(req.weightGram), mode: req.mode, layanan: card.serviceCode, biaya: form.serviceFee ? "1" : "0" }
          if (form.packingName) search.packing = form.packingName
          if (req.codGoodsIdr) search.cod = String(req.codGoodsIdr)
          if (req.declaredValueIdr) search.nilai = String(req.declaredValueIdr)
          if (req.dangerousGoods) search.dg = "1"
          if (req.lengthCm && req.widthCm && req.heightCm) search.dim = `${req.lengthCm}x${req.widthCm}x${req.heightCm}`
          await navigate({ to: "/kasir", search: search as never })
        }}
      />
    </div>
  )
}
