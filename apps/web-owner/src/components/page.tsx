import { useState, type ReactNode } from "react"
import { RefreshCwIcon, RotateCwIcon } from "lucide-react"
import { toast } from "@shared/components/ui/sonner"
import { Button } from "@shared/components/ui/button"
import { api, ApiError } from "../lib/api"
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge, type StatusTone } from "@shared/components/admin/page"

// Super Admin page helpers are the shared admin kit (DEC-236): same PageHeader, SectionCard, states and StatusBadge as
// Gerai Admin. These aliases keep existing call sites stable.
export const PageHead = PageHeader
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <SectionCard title={title} action={aside}>
      {children}
    </SectionCard>
  )
}
export const LoadingBlock = LoadingState
export const ErrorBlock = ErrorState
export function EmptyBlock({ title, body }: { title: string; body: string }) {
  return <EmptyState title={title} body={body} />
}
export const StatusChip = StatusBadge
export type Tone = StatusTone

export const formatDate = (ms: number | null | undefined) =>
  ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) + " WIB" : "—"

export const ONBOARDING_LABEL: Record<string, { label: string; tone: StatusTone }> = {
  not_connected: { label: "Belum terhubung", tone: "muted" },
  consent_recorded: { label: "Persetujuan tercatat", tone: "muted" },
  registration_pending: { label: "Pendaftaran tertunda", tone: "warn" },
  registration_unknown: { label: "Status pendaftaran belum pasti", tone: "warn" },
  existing_account_required: { label: "Pakai akun Mengantar sendiri", tone: "warn" },
  connected: { label: "Terhubung", tone: "safe" },
  byok_connected: { label: "Terhubung (akun sendiri)", tone: "safe" },
  provider_restricted: { label: "Dibatasi Mengantar", tone: "danger" },
}

/**
 * Console sync / recheck action (DEC-244): POST, spinner while running, toast with the server's own words, then hand
 * the answer to `onDone`. A `TOTP_RECENT_REQUIRED` answer sends the operator to re-confirm TOTP and come back here.
 */
export function RecheckButton({ label, busyLabel = "Memeriksa…", path, body, onDone, variant = "outline", size = "default", done }: { label: string; busyLabel?: string; path: string; body?: Record<string, unknown>; onDone?: (data: unknown) => void; variant?: "default" | "outline" | "ghost"; size?: "default" | "sm"; done?: (data: unknown) => string }) {
  const [pending, setPending] = useState(false)
  async function run() {
    if (pending) return
    setPending(true)
    try {
      const data = await api(path, { body: body ?? {} })
      toast.success(done ? done(data) : "Pemeriksaan ulang selesai.")
      onDone?.(data)
    } catch (e) {
      if (e instanceof ApiError && e.body.code === "TOTP_RECENT_REQUIRED") return window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      toast.error(e instanceof ApiError ? e.body.message : "Pemeriksaan ulang gagal. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  return (
    <Button type="button" variant={variant} size={size} onClick={run} disabled={pending}>
      <RefreshCwIcon aria-hidden className={pending ? "animate-spin" : undefined} /> {pending ? busyLabel : label}
    </Button>
  )
}

/** `Muat Ulang`: re-read the current view (no server-side work). */
export function ReloadButton({ onClick, size = "default" }: { onClick: () => void; size?: "default" | "sm" }) {
  return (
    <Button type="button" variant="outline" size={size} onClick={onClick}>
      <RotateCwIcon aria-hidden /> Muat Ulang
    </Button>
  )
}
