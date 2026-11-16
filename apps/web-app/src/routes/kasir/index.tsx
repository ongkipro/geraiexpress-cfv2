import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { QrCodeIcon } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { api, ApiError } from "../../lib/api"
import { PageTitle } from "../../shell/states"
import { QuotePanel } from "./quote-panel"

// `Buat Pengiriman` (visual 07 `/kasir`, visual 05 stages 1–2): quote, choose a courier → INV allocated with a frozen
// quote; sender, recipient, payment and print follow on `/kiriman/:slug` (TASK-304).
const TABS = [
  { to: "/kasir", label: "Paket Reguler", active: true },
  { to: "/kasir/multi", label: "Paket Massal" },
  { to: "/kasir/cek-cepat", label: "Cek Ongkir Cepat" },
  { to: "/kasir/cek-resi", label: "Cek Resi" },
  { to: "/kasir/shift", label: "Shift Loket" },
]

interface Claim { slug: string; senderId: string; recipientId: string; destination: { id: string; label: string }; weightGram: number; cod: boolean; codGoodsIdr: number; content: string }

/** `Scan QR`: a scanner types the QR URL or INV into this box; a mini-site pre-booking opens prefilled (TASK-501). */
function ScanBox({ onClaim }: { onClaim: (c: Claim) => void }) {
  const navigate = useNavigate()
  const [code, setCode] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  async function go(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const m = /([23456789abcdefghjkmnpqrstvwxyz]{7})\/?$/i.exec(code.trim().replace(/^inv\s*/i, ""))
    if (!m) return setMsg("Kode tidak dikenali. Pindai QR dari pelanggan atau ketik nomor INV.")
    const slug = m[1]!.toLowerCase()
    try {
      onClaim(await api<Claim>(`/minisite-drafts/${slug}/claim`, { body: {} }))
    } catch (err) {
      // Not a pre-booking: maybe an existing INV of this gerai.
      if (err instanceof ApiError && err.body.code === "DRAFT_NOT_FOUND") await navigate({ to: "/kiriman/$slug", params: { slug } })
      else setMsg(err instanceof ApiError ? err.body.message : "Kode tidak bisa dibuka.")
    }
  }
  return (
    <form onSubmit={go} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4" role="search">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-base font-medium">Pindai QR pelanggan atau ketik INV
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="INV 8K4M2P7" autoComplete="off" />
      </label>
      <Button type="submit" variant="outline"><QrCodeIcon aria-hidden /> Buka</Button>
      {msg ? <p role="alert" className="w-full text-base text-danger">{msg}</p> : null}
    </form>
  )
}

export function KasirPage() {
  const navigate = useNavigate()
  const [claim, setClaim] = useState<Claim | null>(null)
  return (
    <div>
      <PageTitle title="Buat Pengiriman" />
      <nav aria-label="Bagian Buat Pengiriman" className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <li key={t.to}>
              <Link to={t.to} aria-current={t.active ? "page" : undefined} className={`flex h-11 items-center rounded-md px-4 text-base md:h-10 ${t.active ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ScanBox onClaim={setClaim} />
      {claim ? (
        <p role="status" className="mb-4 border-l-4 border-primary py-1 pl-3 text-base">Kiriman dari rumah <span className="font-medium tabular-nums">INV {claim.slug.toUpperCase()}</span>: tujuan dan berat sudah terisi. Timbang ulang paket, lalu pilih ekspedisi.</p>
      ) : null}
      <QuotePanel
        key={claim?.slug ?? "baru"}
        initial={claim ? { area: { id: claim.destination.id, label: claim.destination.label, postalCode: null }, gram: claim.weightGram, codGoodsIdr: claim.codGoodsIdr } : undefined}
        chooseLabel="Pilih & Lanjutkan"
        onChoose={async (req, card) => {
          const r = await api<{ slug: string }>("/quotes/freeze", { body: { ...req, serviceCode: card.serviceCode, ...(claim ? { slug: claim.slug } : {}) } })
          if (claim) await api(`/shipments/${r.slug}/parties`, { body: { senderId: claim.senderId, recipientId: claim.recipientId, content: claim.content } })
          await navigate({ to: "/kiriman/$slug", params: { slug: r.slug } })
        }}
      />
    </div>
  )
}
