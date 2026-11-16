import { useNavigate } from "@tanstack/react-router"
import { api } from "../../lib/api"
import { PageTitle } from "../../shell/states"
import { QuotePanel } from "./quote-panel"

// `Cek Ongkir Cepat` (PR-09, DEC-225): no INV and no draft until the primary is pressed.
export function CekCepatPage() {
  const navigate = useNavigate()
  return (
    <div>
      <PageTitle title="Cek Ongkir Cepat" description="Bandingkan ongkir semua ekspedisi tanpa membuat kiriman." />
      <QuotePanel
        chooseLabel="Buat Kiriman dari Hasil Ini"
        onChoose={async (req, card) => {
          const r = await api<{ slug: string }>("/quotes/freeze", { body: { ...req, serviceCode: card.serviceCode } })
          await navigate({ to: "/kiriman/$slug", params: { slug: r.slug } })
        }}
      />
    </div>
  )
}
