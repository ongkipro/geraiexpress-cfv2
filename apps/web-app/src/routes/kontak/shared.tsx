import { Badge } from "../../components/ui/badge"

export type RiskBadge = "baru" | "hijau" | "kuning" | "merah"
export const RISK: Record<RiskBadge, { dot: string; label: string }> = {
  baru: { dot: "bg-muted-foreground", label: "Riwayat baru" },
  hijau: { dot: "bg-safe", label: "Aman" },
  kuning: { dot: "bg-warn", label: "Waspada" },
  merah: { dot: "bg-danger", label: "Risiko tinggi" },
}

/** Status = dot + text, never colour alone. */
export function RiskChip({ badge, delivered, rts, rtsBps }: { badge: RiskBadge; delivered: number; rts: number; rtsBps: number | null }) {
  return (
    <Badge variant="outline" className="gap-1.5 border-slate-200 bg-white text-slate-700">
      <span className={`size-1.5 rounded-full ${RISK[badge].dot}`} aria-hidden />
      <span className="tabular-nums">
        {RISK[badge].label}
        {badge === "baru" ? "" : ` · ${delivered} sukses / ${rts} retur (${Math.round((rtsBps ?? 0) / 100)}%)`}
      </span>
    </Badge>
  )
}

export const rupiah = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
