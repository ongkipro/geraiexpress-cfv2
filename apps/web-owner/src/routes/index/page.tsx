import { ArrowRightIcon } from "lucide-react"
import { AdminBarChart } from "@shared/components/admin/bar-chart"
import { EmptyState, ErrorState, LoadingState, MetricCard, MetricGrid, PageHeader, SectionCard, StatusBadge, type StatusTone } from "@shared/components/admin/page"
import { formatDate } from "../../components/page"
import { useApi } from "../../lib/use-api"
import { LinkButton } from "@shared/components/admin/link-button"

// Super Admin `Ringkasan` (visual 07 §3.3, DEC-236): the same MetricCard / SectionCard / bar chart as the Gerai
// dashboard — 4 KPI → 14-day volume chart → `Perlu perhatian` action rows (read-only, no PII).
interface Overview {
  kpi: { active_tenants: number; shipments_today: number; pending_applications: number; onboarding_stuck: number; tenants_in_recovery: number; discount_mismatch: number; email_failed_7d: number; health: "ok" | "attention"; partnerQuota: { minute: number; day: number } | null }
  series: Array<{ day: number; shipments: number }>
  alerts: Array<{ alert_key: string; last_sent_at: number; count: number }>
}

const nf = new Intl.NumberFormat("id-ID")
const dayLabel = (ms: number | string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(Number(ms))

// Alert keys (OBSERVABILITY.md, ops/alert-drill.ts) → Indonesian operator wording; never show the raw identifier.
const ALERT_TEXT: Record<string, string> = {
  issue_reconciliation_rate: "Banyak penerbitan resi perlu dicek ulang",
  issue_failed_streak: "Penerbitan resi gagal beruntun",
  webhook_inbox_age: "Webhook Mengantar tertahan",
  finance_sync_age: "Sinkron keuangan terlambat",
  public_api_ip_not_allowed: "Mengantar menolak IP (API Publik)",
  partner_api_ip_not_allowed: "Mengantar menolak IP (API Partner)",
  public_api_auth_spike: "Lonjakan penolakan kunci API Mengantar",
  public_api_issue_volume_spike: "Lonjakan penerbitan resi tidak wajar",
  relay_down: "Relay Partner tidak terjangkau",
  discount_overdue: "Diskon gerai belum diterapkan Mengantar",
  discount_selisih: "Diskon gerai belum sesuai di Mengantar",
  email_failure_rate: "Banyak email gagal terkirim",
  email_bounce_rate: "Banyak email terpental",
  hostname_quota: "Kuota domain sendiri hampir habis",
  hostname_probe: "Domain sendiri gerai gagal diperiksa",
  tenant_recovery: "Gerai dalam pemulihan data",
  tenant_backup_failed: "Cadangan data gerai gagal",
}

/** `drill.<key>` = alert drill (TASK-602); `<key>.<scope>` = scoped alert. */
function alertText(key: string): { label: string; drill: boolean } {
  const drill = key.startsWith("drill.")
  const base = (drill ? key.slice(6) : key).split(".")[0]!
  return { label: ALERT_TEXT[base] ?? "Peringatan sistem", drill }
}

interface Attention {
  key: string
  tone: StatusTone
  label: string
  detail?: string
  to?: string
  search?: Record<string, string>
  action?: string
}

export function RingkasanPage() {
  const { data, error, loading, reload } = useApi<Overview>("/overview")
  const header = <PageHeader title="Ringkasan" description="Semua gerai · waktu WIB" />
  if (loading) return <div>{header}<LoadingState label="Memuat ringkasan" rows={4} /></div>
  if (error || !data) return <div>{header}<ErrorState message={error ?? "Gagal memuat ringkasan."} onRetry={reload} /></div>
  const k = data.kpi
  const total14 = data.series.reduce((a, s) => a + s.shipments, 0)
  const rows: Attention[] = [
    k.tenants_in_recovery ? { key: "recovery", tone: "danger", label: `${nf.format(k.tenants_in_recovery)} gerai dalam pemulihan data`, to: "/sistem", action: "Buka Sistem" } : null,
    k.onboarding_stuck ? { key: "onboarding", tone: "warn", label: `${nf.format(k.onboarding_stuck)} pendaftaran Mengantar tertunda`, to: "/gerai", action: "Buka Gerai" } : null,
    k.discount_mismatch ? { key: "discount", tone: "warn", label: `${nf.format(k.discount_mismatch)} diskon belum sesuai di Mengantar`, to: "/tarif", search: { tab: "permintaan" }, action: "Buka Tarif" } : null,
    k.email_failed_7d ? { key: "email", tone: "warn", label: `${nf.format(k.email_failed_7d)} email gagal terkirim (7 hari)`, to: "/sistem", action: "Buka Sistem" } : null,
    ...data.alerts.map((a): Attention => {
      const t = alertText(a.alert_key)
      return { key: a.alert_key, tone: t.drill ? "muted" : "warn", label: t.drill ? `Uji alert: ${t.label}` : t.label, detail: `Terakhir ${formatDate(a.last_sent_at)}`, to: "/sistem", action: "Buka Sistem" }
    }),
  ].filter((x): x is Attention => x !== null)
  return (
    <div className="flex flex-col gap-6">
      {header}
      <MetricGrid>
        <MetricCard label="Gerai aktif" value={nf.format(k.active_tenants)} footer="Gerai yang sudah disetujui dan aktif" to="/gerai?tab=direktori" />
        <MetricCard label="Kiriman hari ini" value={nf.format(k.shipments_today)} footer="Semua gerai, sejak 00.00 WIB" />
        <MetricCard label="Pengajuan menunggu" value={nf.format(k.pending_applications)} footer={k.pending_applications ? "Perlu ditinjau Super Admin" : "Tidak ada antrean"} to="/gerai" tone={k.pending_applications ? "warn" : undefined} />
        <MetricCard
          label="Kesehatan sinkron & relay"
          value={k.health === "ok" ? "Baik" : "Perlu dicek"}
          footer={k.partnerQuota ? `Kuota Partner: ${k.partnerQuota.minute}/60 per menit` : "Relay & kuota Partner"}
          to="/sistem"
          tone={k.health === "ok" ? undefined : "warn"}
        />
      </MetricGrid>
      <div className="grid gap-6 xl:grid-cols-5">
        <SectionCard id="volume" className="xl:col-span-3" title="Kiriman 14 hari terakhir" description={`${nf.format(total14)} paket · per hari · semua gerai`}>
          <AdminBarChart
            data={data.series}
            xKey="day"
            series={[{ key: "shipments", label: "Kiriman", color: "var(--chart-1)" }]}
            xLabel={dayLabel}
            caption="Jumlah kiriman per hari, 14 hari terakhir"
          />
        </SectionCard>
        <SectionCard
          id="perhatian"
          className="xl:col-span-2"
          title="Perlu perhatian"
          description={rows.length > 6 ? `${nf.format(rows.length)} peringatan 7 hari terakhir · 6 teratas` : "Peringatan 7 hari terakhir"}
          flush
          footer={
            rows.length > 6 ? (
              <LinkButton variant="outline" to="/sistem">
                Lihat semua di Sistem & Audit <ArrowRightIcon aria-hidden data-icon="inline-end" />
              </LinkButton>
            ) : undefined
          }
        >
          {rows.length === 0 ? (
            <EmptyState title="Semua aman" body="Tidak ada peringatan dalam 7 hari terakhir." />
          ) : (
            <ul className="flex flex-col divide-y">
              {rows.slice(0, 6).map((r) => (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
                  <div className="flex min-w-0 flex-col gap-1">
                    <StatusBadge tone={r.tone} className="w-fit">{r.tone === "danger" ? "Kritis" : r.tone === "warn" ? "Perlu dicek" : "Uji"}</StatusBadge>
                    <span className="text-base">{r.label}</span>
                    {r.detail ? <span className="text-base text-muted-foreground tabular-nums">{r.detail}</span> : null}
                  </div>
                  {r.to ? (
                    <LinkButton variant="outline" size="sm" to={r.to} search={r.search as never}>
                      {r.action} <ArrowRightIcon aria-hidden data-icon="inline-end" />
                    </LinkButton>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
