import { Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { CourierLogo } from "@shared/components/admin/courier-logo"
import { DataTableShell } from "@shared/components/admin/data-table"
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from "@shared/components/admin/page"
import { Button } from "@shared/components/ui/button"
import { formatDate, ONBOARDING_LABEL, RecheckButton } from "../../components/page"
import { ReasonAction } from "../../components/reason-dialog"
import { useApi } from "../../lib/use-api"

interface DiscountRule {
  service_code: string
  courier_code?: string
  display_name: string
  courier_name: string
  service_class: "regular" | "cargo"
  assigned_bps: number
  observed_bps: number | null
  verification_state: "belum_diterapkan" | "sesuai" | "selisih"
  observed_at: number | null
}

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
  seller_id: string | null
  last_error_code: string | null
  connection: { onboardingState: string; webhookState: string; sellerId: string | null; hasKey: boolean; keyVersion: number; rotationState: "idle" | "in_flight" | "unknown"; environment: string } | null
  hostnames: { hostname: string; kind: string; state: string }[]
  discounts?: { summary: { total: number; sesuai: number; belum: number; selisih: number }; items: DiscountRule[] }
}

interface SyncResult { onboardingState: string; financeSync: "queued" | "skipped"; domainsChecked: number }
const syncDone = (r: SyncResult) => `Sinkron selesai: keuangan ${r.financeSync === "queued" ? "dijadwalkan" : "dilewati (belum terhubung)"}, ${r.domainsChecked} domain diperiksa.`
const HOST_STATE: Record<string, string> = { pending: "Menunggu DNS", active: "Aktif", failed: "Gagal", moved: "DNS berubah", suspended: "Dibekukan" }
const WEBHOOK: Record<string, string> = { unconfigured: "Belum diatur", awaiting_seller_setup: "Sinkron otomatis (webhook opsional)", active: "Aktif", secret_mismatch: "Secret tidak cocok", paused: "Dijeda Mengantar" }
const ROTATION: Record<"idle" | "in_flight" | "unknown", string> = { idle: "Normal", in_flight: "Sedang berjalan", unknown: "Perlu pemeriksaan ulang" }
const DISC_STATE: Record<DiscountRule["verification_state"], { label: string; tone: "safe" | "warn" | "danger" }> = {
  sesuai: { label: "Sesuai", tone: "safe" },
  belum_diterapkan: { label: "Belum diverifikasi", tone: "warn" },
  selisih: { label: "Selisih", tone: "danger" },
}
const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2).replace(".", ",")}%`)

export function GeraiDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string }
  const { data, error, loading, reload } = useApi<GeraiDetail>(`/gerai/${encodeURIComponent(slug)}`)
  if (loading) return <div className="flex flex-col gap-4"><PageHeader title={`Gerai ${slug}`} /><LoadingState /></div>
  if (error || !data) return <div className="flex flex-col gap-4"><PageHeader title={`Gerai ${slug}`} /><ErrorState message={error ?? "Gerai tidak ditemukan."} onRetry={reload} /></div>
  const ob = ONBOARDING_LABEL[data.onboarding_state ?? "not_connected"] ?? ONBOARDING_LABEL.not_connected!
  const retryable = data.onboarding_state === "registration_pending" || data.onboarding_state === "registration_unknown"
  const sellerId = data.connection?.sellerId ?? data.seller_id
  const rotationState = data.connection?.rotationState ?? "idle"
  const canSyncKey = data.onboarding_state === "connected" && Boolean(sellerId) && rotationState === "idle"
  const needsResolve = rotationState !== "idle"
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHeader title={data.name} description={`${data.hostnames.find((h) => h.kind !== "custom")?.hostname ?? data.slug} · disetujui ${formatDate(data.approved_at)}`}>
        <Button variant="outline" render={<Link to="/gerai" search={{ tab: "direktori" }} />}>
          <ArrowLeftIcon aria-hidden /> Direktori
        </Button>
        {data.status === "suspended" ? <StatusBadge tone="danger">Dibekukan</StatusBadge> : <StatusBadge tone="safe">Aktif</StatusBadge>}
        {/* DEC-244: operational sync only — never touches this gerai's shipments (DEC-209). */}
        <RecheckButton label="Sinkron & Periksa Ulang" busyLabel="Menyinkronkan…" path={`/gerai/${data.slug}/sinkron`} onDone={reload} done={(d) => syncDone(d as SyncResult)} />
      </PageHeader>
      <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
        <SectionCard title="Koneksi Mengantar">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <KV label="Status akun seller"><StatusBadge tone={ob.tone}>{ob.label}</StatusBadge></KV>
            <KV label="Webhook">{WEBHOOK[data.connection?.webhookState ?? "unconfigured"]}</KV>
            <KV label="Kunci API">{data.connection?.hasKey ? `Tersimpan terenkripsi · versi ${data.connection.keyVersion}` : "Belum ada"}</KV>
            <KV label="Lingkungan">{data.connection?.environment === "production" ? "Produksi" : data.connection ? "Sandbox" : "—"}</KV>
            {sellerId ? <KV label="Seller ID Mengantar"><span className="font-mono text-xs break-all">{sellerId}</span></KV> : null}
            {rotationState !== "idle" ? <KV label="Status rotasi kunci"><StatusBadge tone="warn">{ROTATION[rotationState]}</StatusBadge></KV> : null}
            {data.last_error_code ? <KV label="Kode terakhir"><span className="font-mono">{data.last_error_code}</span></KV> : null}
          </dl>
          {retryable || canSyncKey || needsResolve ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {retryable ? <ReasonAction label="Ulangi pendaftaran seller" confirmLabel="Ulangi" variant="outline" path={`/gerai/${data.slug}/onboarding/retry`} onDone={reload} hint="Status belum pasti diperiksa ulang ke Mengantar, tidak mendaftar dua kali." /> : null}
              {canSyncKey ? <ReasonAction label="Ambil Ulang API Key" confirmLabel="Ambil Ulang" variant="outline" path={`/gerai/${data.slug}/sinkron-kunci`} onDone={reload} hint="Membaca kunci aktif terbaru dari Mengantar (tanpa merotasi) bila pemilik mengganti kunci langsung di Seller Web Mengantar." /> : null}
              {needsResolve ? <ReasonAction label="Selesaikan Rotasi Tertunda" confirmLabel="Periksa Kunci" variant="outline" path={`/sistem/rotasi-kunci/${data.slug}`} extra={{ mode: "resolve" }} onDone={reload} hint="Membaca kunci aktif dari Mengantar untuk menutup rotasi yang belum selesai tanpa merotasi ulang." /> : null}
            </div>
          ) : null}
        </SectionCard>
        <SectionCard title="Kontrol">
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
        </SectionCard>
      </div>
      <SectionCard
        title="Diskon Ekspedisi Mengantar"
        description={
          data.discounts?.summary ? (
            <span className="flex flex-wrap gap-1.5 tabular-nums">
              <StatusBadge tone="safe">{data.discounts.summary.sesuai} sesuai</StatusBadge>
              {data.discounts.summary.belum ? <StatusBadge tone="warn">{data.discounts.summary.belum} belum</StatusBadge> : null}
              {data.discounts.summary.selisih ? <StatusBadge tone="danger">{data.discounts.summary.selisih} selisih</StatusBadge> : null}
            </span>
          ) : undefined
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {data.connection?.hasKey ? (
              <RecheckButton
                size="sm"
                label="Cek Diskon Live"
                busyLabel="Memeriksa…"
                path="/tarif/verifikasi-ulang"
                body={{ tenantId: data.id }}
                onDone={reload}
                done={(r) => {
                  const v = r as { observed: number }
                  return v.observed ? `${v.observed} layanan berhasil diperiksa dari Mengantar.` : "Selesai diperiksa; belum ada tarif baru dari Mengantar."
                }}
              />
            ) : null}
            {data.connection?.hasKey ? (
              <ReasonAction
                label="Tarik & Terapkan dari Mengantar"
                confirmLabel="Tarik & Terapkan"
                variant="outline"
                path={`/tarif/gerai/${data.id}/tarik-mengantar`}
                onDone={reload}
                hint="Membaca diskon aktual per ekspedisi (reguler & cargo) dari akun Mengantar gerai ini lalu menyamakan aturan tarif ke angka tersebut — termasuk nilai di luar batas default 20%–30%. Layanan tanpa estimasi aktif dilewati."
              />
            ) : null}
            <Button size="sm" variant="outline" render={<Link to="/tarif/$tenantId" params={{ tenantId: data.id }} />}>
              Kelola Tarif
            </Button>
          </div>
        }
        flush
      >
        <DataTableShell
          bare
          caption={`Diskon ekspedisi ${data.name}`}
          rows={data.discounts?.items ?? []}
          rowKey={(r) => r.service_code}
          empty={<EmptyState title="Belum ada aturan diskon" body="Klik Tarik & Terapkan dari Mengantar setelah akun Mengantar aktif." />}
          columns={[
            {
              key: "svc",
              header: "Layanan",
              cell: (r) => (
                <div className="flex items-center gap-2.5">
                  <CourierLogo code={r.courier_code ?? r.service_code} name={r.display_name} decorative />
                  <span className="font-medium">{r.display_name}</span>
                </div>
              ),
            },
            { key: "assigned", header: "Tercatat", align: "right", cell: (r) => pct(r.assigned_bps) },
            { key: "observed", header: "Aktual Mengantar", align: "right", cell: (r) => <span className="font-medium">{pct(r.observed_bps)}</span> },
            { key: "state", header: "Status", cell: (r) => <StatusBadge tone={DISC_STATE[r.verification_state].tone}>{DISC_STATE[r.verification_state].label}</StatusBadge> },
            { key: "at", header: "Diperiksa", wide: true, cell: (r) => <span className="text-muted-foreground tabular-nums">{formatDate(r.observed_at)}</span> },
          ]}
          mobile={(r) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <CourierLogo code={r.courier_code ?? r.service_code} name={r.display_name} decorative />
                  <span className="font-medium">{r.display_name}</span>
                </div>
                <StatusBadge tone={DISC_STATE[r.verification_state].tone}>{DISC_STATE[r.verification_state].label}</StatusBadge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                <span>Tercatat: <strong className="text-slate-900">{pct(r.assigned_bps)}</strong></span>
                <span>Aktual: <strong className="text-slate-900">{pct(r.observed_bps)}</strong></span>
              </div>
            </div>
          )}
        />
      </SectionCard>
      <SectionCard title="Alamat" flush>
        <DataTableShell
          bare
          caption="Alamat gerai"
          rows={data.hostnames}
          rowKey={(h) => h.hostname}
          columns={[
            { key: "host", header: "Alamat", cell: (h) => <span className="font-mono whitespace-normal break-all">{h.hostname}</span> },
            { key: "kind", header: "Jenis", cell: (h) => (h.kind === "custom" ? "Domain sendiri" : "Bawaan") },
            { key: "state", header: "Status", cell: (h) => <StatusBadge tone={h.state === "active" ? "safe" : h.state === "pending" ? "warn" : "danger"}>{HOST_STATE[h.state] ?? h.state}</StatusBadge> },
          ]}
        />
      </SectionCard>
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
