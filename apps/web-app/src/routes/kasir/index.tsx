import { Link, useNavigate } from "@tanstack/react-router"
import { api } from "../../lib/api"
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

export function KasirPage() {
  const navigate = useNavigate()
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
      <QuotePanel
        chooseLabel="Pilih & Lanjutkan"
        onChoose={async (req, card) => {
          const r = await api<{ slug: string }>("/quotes/freeze", { body: { ...req, serviceCode: card.serviceCode } })
          await navigate({ to: "/kiriman/$slug", params: { slug: r.slug } })
        }}
      />
    </div>
  )
}
