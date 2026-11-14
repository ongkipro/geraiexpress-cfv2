import { Badge } from "@/components/ui/badge"
import { statusLabel, type Status } from "@/data"

const dot: Record<Status, string> = {
  siap: "bg-primary",
  "menunggu-saldo": "bg-warn",
  "dalam-kirim": "bg-muted-foreground",
  terkirim: "bg-safe",
  retur: "bg-danger",
}

// Status = shape (dot) + text + colour, never colour alone. Neutral chip, colour only on the dot
// (keeps the screen within the contract's 5 accent surfaces).
export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant="outline" className="gap-1.5 bg-card text-foreground">
      <span className={`size-2 rounded-full ${dot[status]}`} aria-hidden />
      {statusLabel[status]}
    </Badge>
  )
}

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

// Counter payment is recorded, not processed: the INV is either paid (with the method the cashier
// recorded) or unpaid. Text carries the meaning; the dot is a second cue.
export function PaidBadge({ paid }: { paid: null | string }) {
  return (
    <Badge variant="outline" className="gap-1.5 bg-card text-foreground">
      <span className={`size-2 rounded-full ${paid ? "bg-safe" : "bg-warn"}`} aria-hidden />
      {paid ? `Lunas · ${paid}` : "Belum dibayar"}
    </Badge>
  )
}
