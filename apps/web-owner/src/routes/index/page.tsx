import { Link } from "@tanstack/react-router"
import { EmptyBlock, ErrorBlock, formatDate, LoadingBlock, PageHead, Section, StatusChip } from "../../components/page"
import { useApi } from "../../lib/use-api"

// Super Admin `Ringkasan` (visual 07 §3.3): 4 KPI → alerts → 14-day volume (read-only, no PII).
interface Overview {
  kpi: { active_tenants: number; shipments_today: number; pending_applications: number; onboarding_stuck: number; tenants_in_recovery: number; discount_mismatch: number; email_failed_7d: number; health: "ok" | "attention"; partnerQuota: { minute: number; day: number } | null }
  series: Array<{ day: number; shipments: number }>
  alerts: Array<{ alert_key: string; last_sent_at: number; count: number }>
}

const nf = new Intl.NumberFormat("id-ID")
const dayLabel = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(ms)

const ALERT_LABEL = (key: string) =>
  key.startsWith("discount_selisih") ? "Diskon gerai belum sesuai di Mengantar" : key === "tenant_recovery" ? "Gerai dalam pemulihan data" : key.replace(/[._-]/g, " ")

function Kpi({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: string }) {
  const body = (
    <div className="flex h-full flex-col gap-1 rounded-lg border bg-card p-4">
      <span className="text-base text-muted-foreground">{label}</span>
      <span className="text-[28px] leading-tight font-bold tabular-nums">{value}</span>
      {hint ? <span className="text-base text-muted-foreground">{hint}</span> : null}
    </div>
  )
  return to ? <Link to={to} className="block rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">{body}</Link> : body
}

export function RingkasanPage() {
  const { data, error, loading, reload } = useApi<Overview>("/overview")
  if (loading) return <LoadingBlock label="Memuat ringkasan" />
  if (error || !data) return <ErrorBlock message={error ?? "Gagal memuat ringkasan."} onRetry={reload} />
  const k = data.kpi
  const max = Math.max(1, ...data.series.map((s) => s.shipments))
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Ringkasan" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Gerai aktif" value={nf.format(k.active_tenants)} to="/gerai?tab=direktori" />
        <Kpi label="Kiriman hari ini" value={nf.format(k.shipments_today)} hint="Semua gerai, WIB" />
        <Kpi label="Pengajuan menunggu" value={nf.format(k.pending_applications)} to="/gerai" />
        <Kpi label="Kesehatan sinkron & relay" value={k.health === "ok" ? "Baik" : "Perlu dicek"} hint={k.partnerQuota ? `Kuota Partner: ${k.partnerQuota.minute}/60 per menit` : undefined} to="/sistem" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Perlu perhatian">
          {k.tenants_in_recovery + k.onboarding_stuck + k.discount_mismatch + k.email_failed_7d + data.alerts.length === 0 ? (
            <EmptyBlock title="Semua aman" body="Tidak ada peringatan dalam 7 hari terakhir." />
          ) : (
            <ul className="flex flex-col gap-3 text-base">
              {k.tenants_in_recovery ? <li><StatusChip tone="danger">{k.tenants_in_recovery} gerai dalam pemulihan data</StatusChip></li> : null}
              {k.onboarding_stuck ? <li><StatusChip tone="warn">{k.onboarding_stuck} pendaftaran Mengantar tertunda</StatusChip></li> : null}
              {k.discount_mismatch ? <li><Link to="/tarif" search={{ tab: "permintaan" }} className="text-primary underline-offset-4 hover:underline">{k.discount_mismatch} diskon belum sesuai di Mengantar</Link></li> : null}
              {k.email_failed_7d ? <li><StatusChip tone="warn">{k.email_failed_7d} email gagal terkirim (7 hari)</StatusChip></li> : null}
              {data.alerts.map((a) => (
                <li key={a.alert_key} className="flex flex-wrap justify-between gap-2">
                  <span>{ALERT_LABEL(a.alert_key)}</span>
                  <span className="text-muted-foreground tabular-nums">{formatDate(a.last_sent_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Kiriman 14 hari terakhir">
          <ol className="flex h-40 items-end gap-1" aria-label="Grafik jumlah kiriman per hari">
            {data.series.map((s) => (
              <li key={s.day} className="flex h-full flex-1 flex-col justify-end" title={`${dayLabel(s.day)}: ${nf.format(s.shipments)} kiriman`}>
                <span className="sr-only">{`${dayLabel(s.day)}: ${nf.format(s.shipments)} kiriman`}</span>
                <span className="block rounded-t bg-primary" style={{ height: `${Math.max(2, (s.shipments / max) * 100)}%` }} aria-hidden />
              </li>
            ))}
          </ol>
          <div className="mt-2 flex justify-between text-base text-muted-foreground tabular-nums">
            <span>{dayLabel(data.series[0]!.day)}</span>
            <span>{dayLabel(data.series.at(-1)!.day)}</span>
          </div>
        </Section>
      </div>
    </div>
  )
}
