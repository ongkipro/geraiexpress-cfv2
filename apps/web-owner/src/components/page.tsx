import type { ReactNode } from "react"
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
