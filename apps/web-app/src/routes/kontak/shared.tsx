import type { ReactNode } from "react"
import { Badge } from "../../components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog"

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

/**
 * Centered contact form popup that never auto-closes on outside clicks so counter operators do not lose half-typed
 * addresses by tapping the page behind it. Closes only via explicit `Batal`, the top-right `X`, `Escape`, or save.
 */
export function ContactDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next, details) => {
        if (!next && (details?.reason === "outside-press" || details?.reason === "focus-out")) {
          details.cancel()
          return
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-slate-200/80 px-6 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
