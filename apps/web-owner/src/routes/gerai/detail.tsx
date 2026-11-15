import { Link, useParams } from "@tanstack/react-router"
import { ErrorBlock, formatDate, LoadingBlock, ONBOARDING_LABEL, PageHead, Section, StatusChip } from "../../components/page"
import { ReasonAction } from "../../components/reason-dialog"
import { useApi } from "../../lib/use-api"

interface GeraiDetail {
  id: string
  slug: string
  name: string
  status: "active" | "suspended"
  masking_enabled: number
  masking_daily_quota: number | null
  approved_at: number | null
  onboarding_state: string | null
  last_error_code: string | null
  connection: { onboardingState: string; webhookState: string; hasKey: boolean; keyVersion: number; environment: string } | null
  hostnames: { hostname: string; kind: string; state: string }[]
}

const WEBHOOK: Record<string, string> = { unconfigured: "Belum diatur", awaiting_seller_setup: "Menunggu pemilik mengisi secret", active: "Aktif", secret_mismatch: "Secret tidak cocok", paused: "Dijeda Mengantar" }

export function GeraiDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string }
  const { data, error, loading, reload } = useApi<GeraiDetail>(`/gerai/${encodeURIComponent(slug)}`)
  if (loading) return <LoadingBlock />
  if (error || !data) return <ErrorBlock message={error ?? "Gerai tidak ditemukan."} onRetry={reload} />
  const ob = ONBOARDING_LABEL[data.onboarding_state ?? "not_connected"] ?? ONBOARDING_LABEL.not_connected!
  const retryable = data.onboarding_state === "registration_pending" || data.onboarding_state === "registration_unknown"
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Navigasi halaman" className="text-base text-muted-foreground">
        <Link to="/gerai" search={{ tab: "direktori" }} className="text-primary underline-offset-4 hover:underline">Gerai</Link> › {data.name}
      </nav>
      <PageHead title={data.name}>{data.status === "suspended" ? <StatusChip tone="danger">Dibekukan</StatusChip> : <StatusChip tone="safe">Aktif</StatusChip>}</PageHead>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Koneksi Mengantar">
          <dl className="flex flex-col gap-3 text-base">
            <div><dt className="text-muted-foreground">Status akun seller</dt><dd><StatusChip tone={ob.tone}>{ob.label}</StatusChip></dd></div>
            <div><dt className="text-muted-foreground">Webhook</dt><dd>{WEBHOOK[data.connection?.webhookState ?? "unconfigured"]}</dd></div>
            <div><dt className="text-muted-foreground">Kunci API</dt><dd>{data.connection?.hasKey ? `Tersimpan terenkripsi · versi ${data.connection.keyVersion}` : "Belum ada"}</dd></div>
            {data.last_error_code ? <div><dt className="text-muted-foreground">Kode terakhir</dt><dd className="font-mono">{data.last_error_code}</dd></div> : null}
            <div><dt className="text-muted-foreground">Disetujui</dt><dd>{formatDate(data.approved_at)}</dd></div>
          </dl>
          {retryable ? <div className="mt-4"><ReasonAction label="Ulangi pendaftaran seller" confirmLabel="Ulangi" variant="outline" path={`/gerai/${data.slug}/onboarding/retry`} onDone={reload} hint="Status belum pasti diperiksa ulang ke Mengantar, tidak mendaftar dua kali." /></div> : null}
        </Section>
        <Section title="Kontrol">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-base">Masking label: <strong>{data.masking_enabled ? "Aktif" : "Nonaktif"}</strong> · Kuota harian: <strong className="tabular-nums">{data.masking_daily_quota ?? "Tanpa batas"}</strong></p>
              <ReasonAction label={data.masking_enabled ? "Nonaktifkan masking" : "Aktifkan masking"} confirmLabel="Simpan" variant="outline" path={`/gerai/${data.slug}/masking`} extra={{ enabled: !data.masking_enabled, dailyQuota: data.masking_daily_quota }} onDone={reload} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-base">Membekukan gerai menutup mini-site (403) dan akses ruang kerja dalam 30 detik.</p>
              <ReasonAction label={data.status === "suspended" ? "Aktifkan kembali" : "Bekukan gerai"} confirmLabel={data.status === "suspended" ? "Aktifkan" : "Bekukan"} variant={data.status === "suspended" ? "outline" : "destructive"} path={`/gerai/${data.slug}/status`} extra={{ status: data.status === "suspended" ? "active" : "suspended" }} onDone={reload} />
            </div>
          </div>
        </Section>
      </div>
      <Section title="Alamat">
        <ul className="flex flex-col gap-2">
          {data.hostnames.map((h) => (
            <li key={h.hostname} className="flex flex-wrap items-center gap-2"><span className="font-mono">{h.hostname}</span><StatusChip tone={h.state === "active" ? "safe" : "warn"}>{h.state === "active" ? "Aktif" : h.state}</StatusChip></li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
