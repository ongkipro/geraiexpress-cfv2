import { MapPinIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"
import type { PosOutlet } from "../../lib/pos-config"

/**
 * `Titik Jemput` (DEC-251): the outlet's pickup point the courier comes to, read from `GET /pos-config`. The owner gets
 * a quiet `Ubah` link to Profil Gerai; a Kasir sees it read-only. Nothing renders until the config has loaded.
 */
export function PickupChip({ outlet, owner, loaded }: { outlet: PosOutlet | null | undefined; owner: boolean; loaded: boolean }) {
  if (!loaded) return null
  const where = [outlet?.streetAddress, outlet?.areaLabel].filter(Boolean).join(" · ")
  return (
    <span data-pickup-chip className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
      <MapPinIcon aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="shrink-0 font-medium text-slate-800">Titik Jemput:</span>
      <span className="min-w-0 truncate">{where || "belum diisi"}</span>
      {owner ? (
        <Link to="/pengaturan/profil" className="ml-1 inline-flex min-h-11 shrink-0 items-center font-medium text-primary underline-offset-4 hover:underline md:min-h-0">
          Ubah
        </Link>
      ) : null}
    </span>
  )
}
