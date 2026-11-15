import type { ReactNode } from "react"
import { Badge } from "@shared/components/ui/badge"
import { Skeleton } from "@shared/components/ui/skeleton"

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h2 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
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

export function LoadingBlock({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={label}>
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 border-l-4 border-danger py-1 pl-3">
      <p className="text-base font-medium text-danger">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="h-11 rounded-lg border border-border px-4 text-base font-medium md:h-10">
          Coba lagi
        </button>
      ) : null}
    </div>
  )
}

export function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1 py-8 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-base text-muted-foreground">{body}</p>
    </div>
  )
}

const DOT: Record<string, string> = { safe: "bg-safe", warn: "bg-warn", danger: "bg-danger", muted: "bg-muted-foreground", primary: "bg-primary" }

/** Status = dot + text (never colour alone); neutral chip keeps accent surfaces within the contract. */
export function StatusChip({ tone, children }: { tone: keyof typeof DOT; children: ReactNode }) {
  return (
    <Badge variant="outline" className="gap-1.5 bg-card text-foreground">
      <span className={`size-2 rounded-full ${DOT[tone]}`} aria-hidden />
      {children}
    </Badge>
  )
}

export const formatDate = (ms: number | null | undefined) =>
  ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) + " WIB" : "—"

export const ONBOARDING_LABEL: Record<string, { label: string; tone: keyof typeof DOT }> = {
  not_connected: { label: "Belum terhubung", tone: "muted" },
  consent_recorded: { label: "Persetujuan tercatat", tone: "muted" },
  registration_pending: { label: "Pendaftaran tertunda", tone: "warn" },
  registration_unknown: { label: "Status pendaftaran belum pasti", tone: "warn" },
  existing_account_required: { label: "Pakai akun Mengantar sendiri", tone: "warn" },
  connected: { label: "Terhubung", tone: "safe" },
  byok_connected: { label: "Terhubung (akun sendiri)", tone: "safe" },
  provider_restricted: { label: "Dibatasi Mengantar", tone: "danger" },
}
