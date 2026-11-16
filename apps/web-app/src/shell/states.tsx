import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { Skeleton } from "../components/ui/skeleton"

// Shared page states (visual 07 §3 legend): loading skeleton, first-run empty, filtered empty, error with retry.
export function PageTitle({ title, children, description }: { title: string; children?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
        {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  )
}

export function LoadingState({ label = "Memuat…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={label}>
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
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

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="max-w-md text-base text-muted-foreground">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/** A workspace page whose feature task has not landed yet: honest notice instead of a dead link. */
export function ComingSoon({ title, body, task }: { title: string; body: string; task: string }) {
  return (
    <div>
      <PageTitle title={title} />
      <section className="rounded-lg border bg-card p-6">
        <EmptyState title="Segera hadir" body={body} action={<Link to="/" className="inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium md:h-10">Kembali ke Dashboard</Link>} />
        <p className="sr-only">{task}</p>
      </section>
    </div>
  )
}

export function Forbidden() {
  return (
    <div>
      <PageTitle title="Akses ditolak" />
      <section className="rounded-lg border bg-card p-6">
        <EmptyState title="Menu ini hanya untuk pemilik gerai" body="Minta pemilik gerai membuka menu ini atau mengubah peran akun Anda." action={<Link to="/" className="inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium md:h-10">Kembali ke Dashboard</Link>} />
      </section>
    </div>
  )
}
