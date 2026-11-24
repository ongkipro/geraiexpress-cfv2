import { useParams } from "@tanstack/react-router"
import { ErrorBlock, formatDate, LoadingBlock, ONBOARDING_LABEL, PageHead, RecheckButton, Section, StatusChip } from "../../components/page"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui/table"
import { ReasonAction } from "../../components/reason-dialog"
import { useApi } from "../../lib/use-api"

interface GeraiDetail {
  id: string
  slug: string
  name: string
  status: "active" | "suspended"
  masking_enabled: number
  masking_daily_quota: number | null
  custom_domain_enabled: number
  approved_at: number | null
  onboarding_state: string | null
  last_error_code: string | null
  connection: { onboardingState: string; webhookState: string; hasKey: boolean; keyVersion: number; environment: string } | null
  hostnames: { hostname: string; kind: string; state: string }[]
}

interface SyncResult { onboardingState: string; financeSync: "queued" | "skipped"; domainsChecked: number }
const syncDone = (r: SyncResult) => `Sinkron selesai: keuangan ${r.financeSync === "queued" ? "dijadwalkan" : "dilewati (belum terhubung)"}, ${r.domainsChecked} domain diperiksa.`
const HOST_STATE: Record<string, string> = { pending: "Menunggu DNS", active: "Aktif", failed: "Gagal", moved: "DNS berubah", suspended: "Dibekukan" }
const WEBHOOK: Record<string, string> = { unconfigured: "Belum diatur", awaiting_seller_setup: "Menunggu pemilik mengisi secret", active: "Aktif", secret_mismatch: "Secret tidak cocok", paused: "Dijeda Mengantar" }

export function GeraiDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string }
  const { data, error, loading, reload } = useApi<GeraiDetail>(`/gerai/${encodeURIComponent(slug)}`)
  if (loading) return <div className="flex flex-col gap-4"><PageHead title={`Gerai ${slug}`} /><LoadingBlock /></div>
  if (error || !data) return <div className="flex flex-col gap-4"><PageHead title={`Gerai ${slug}`} /><ErrorBlock message={error ?? "Gerai tidak ditemukan."} onRetry={reload} /></div>
  const ob = ONBOARDING_LABEL[data.onboarding_state ?? "not_connected"] ?? ONBOARDING_LABEL.not_connected!
  const retryable = data.onboarding_state === "registration_pending" || data.onboarding_state === "registration_unknown"
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHead title={data.name} description={`${data.hostnames.find((h) => h.kind !== "custom")?.hostname ?? data.slug} · disetujui ${formatDate(data.approved_at)}`}>
        {data.status === "suspended" ? <StatusChip tone="danger">Dibekukan</StatusChip> : <StatusChip tone="safe">Aktif</StatusChip>}
        {/* DEC-244: operational sync only — never touches this gerai's shipments (DEC-209). */}
        <RecheckButton label="Sinkron & Periksa Ulang" busyLabel="Menyinkronkan…" path={`/gerai/${data.slug}/sinkron`} onDone={reload} done={(d) => syncDone(d as SyncResult)} />
      </PageHead>
      <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
        <Section title="Koneksi Mengantar">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <KV label="Status akun seller"><StatusChip tone={ob.tone}>{ob.label}</StatusChip></KV>
            <KV label="Webhook">{WEBHOOK[data.connection?.webhookState ?? "unconfigured"]}</KV>
            <KV label="Kunci API">{data.connection?.hasKey ? `Tersimpan terenkripsi · versi ${data.connection.keyVersion}` : "Belum ada"}</KV>
            <KV label="Lingkungan">{data.connection?.environment === "production" ? "Produksi" : data.connection ? "Sandbox" : "—"}</KV>
            {data.last_error_code ? <KV label="Kode terakhir"><span className="font-mono">{data.last_error_code}</span></KV> : null}
          </dl>
          {retryable ? <div className="mt-4 border-t border-slate-100 pt-4"><ReasonAction label="Ulangi pendaftaran seller" confirmLabel="Ulangi" variant="outline" path={`/gerai/${data.slug}/onboarding/retry`} onDone={reload} hint="Status belum pasti diperiksa ulang ke Mengantar, tidak mendaftar dua kali." /></div> : null}
        </Section>
        <Section title="Kontrol">
          <ul className="flex flex-col divide-y divide-slate-100">
            <li className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <span className="flex flex-col"><span className="text-sm font-medium">Masking label</span><span className="text-xs text-muted-foreground">{data.masking_enabled ? "Aktif" : "Nonaktif"} · kuota harian <span className="tabular-nums">{data.masking_daily_quota ?? "tanpa batas"}</span></span></span>
              <ReasonAction label={data.masking_enabled ? "Nonaktifkan masking" : "Aktifkan masking"} confirmLabel="Simpan" variant="outline" path={`/gerai/${data.slug}/masking`} extra={{ enabled: !data.masking_enabled, dailyQuota: data.masking_daily_quota }} onDone={reload} />
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex flex-col"><span className="text-sm font-medium">Domain sendiri (Pro)</span><span className="text-xs text-muted-foreground">{data.custom_domain_enabled ? "Diizinkan" : "Tidak diizinkan"}</span></span>
              <ReasonAction label={data.custom_domain_enabled ? "Cabut izin domain sendiri" : "Izinkan domain sendiri"} confirmLabel="Simpan" variant="outline" path={`/gerai/${data.slug}/custom-domain`} extra={{ enabled: !data.custom_domain_enabled }} onDone={reload} hint="Mencabut izin tidak menghapus domain yang sudah aktif; hapus lewat tab Domain Mitra." />
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <span className="flex flex-col"><span className="text-sm font-medium">{data.status === "suspended" ? "Gerai dibekukan" : "Bekukan gerai"}</span><span className="text-xs text-muted-foreground">Membekukan menutup mini-site (403) dan ruang kerja dalam 30 detik.</span></span>
              <ReasonAction label={data.status === "suspended" ? "Aktifkan kembali" : "Bekukan gerai"} confirmLabel={data.status === "suspended" ? "Aktifkan" : "Bekukan"} variant={data.status === "suspended" ? "outline" : "destructive"} path={`/gerai/${data.slug}/status`} extra={{ status: data.status === "suspended" ? "active" : "suspended" }} onDone={reload} />
            </li>
          </ul>
        </Section>
      </div>
      <Section title="Alamat">
        <div className="overflow-hidden rounded-xl border border-slate-200/85">
          <Table>
            <caption className="sr-only">Alamat gerai</caption>
            <TableHeader>
              <TableRow><TableHead>Alamat</TableHead><TableHead>Jenis</TableHead><TableHead>Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.hostnames.map((h) => (
                <TableRow key={h.hostname}>
                  <TableCell className="font-mono whitespace-normal break-all">{h.hostname}</TableCell>
                  <TableCell>{h.kind === "custom" ? "Domain sendiri" : "Bawaan"}</TableCell>
                  <TableCell><StatusChip tone={h.state === "active" ? "safe" : h.state === "pending" ? "warn" : "danger"}>{HOST_STATE[h.state] ?? h.state}</StatusChip></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  )
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}
