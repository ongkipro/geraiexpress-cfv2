import { Link, useParams, useRouter } from "@tanstack/react-router"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"
import { Button } from "@shared/components/ui/button"
import { ErrorBlock, formatDate, LoadingBlock, ONBOARDING_LABEL, PageHead, Section, StatusChip } from "../../components/page"
import { ReasonAction } from "../../components/reason-dialog"
import { useApi } from "../../lib/use-api"

interface Detail {
  id: string
  state: string
  business_name: string
  contact_whatsapp: string
  seller_email: string
  slug: string
  applicant_name: string
  applicant_email: string
  submitted_at: number
  decided_at: number | null
  decision_reason: string | null
  slugReady: boolean
  partnerTransport: string
  outlet: { name: string; picName: string; picPhone: string; areaLabel: string; streetAddress: string; areaId: string; latitude?: number | null; longitude?: number | null }
}

const maskPhone = (p: string) => (p.length > 4 ? `${p.slice(0, 4)}-xxxx-${p.slice(-4)}` : p)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[220px_1fr]">
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function PengajuanPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const router = useRouter()
  const { data, error, loading, reload } = useApi<Detail>(`/gerai/applications/${encodeURIComponent(id)}`)
  const onDecided = () => {
    reload()
    void router.invalidate()
  }
  if (loading) return <div className="flex flex-col gap-4"><PageHead title="Detail Pengajuan" /><LoadingBlock /></div>
  if (error || !data) return <div className="flex flex-col gap-4"><PageHead title="Detail Pengajuan" /><ErrorBlock message={error ?? "Pengajuan tidak ditemukan."} onRetry={reload} /></div>
  const decided = data.state !== "submitted"
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHead title={data.business_name}>
        <Button variant="outline" render={<Link to="/gerai" search={{ tab: "pengajuan" }} />}>
          <ArrowLeftIcon aria-hidden /> Semua Pengajuan
        </Button>
        {decided ? <StatusChip tone={data.state === "approved" ? "safe" : "danger"}>{data.state === "approved" ? "Disetujui" : "Ditolak"}</StatusChip> : <StatusChip tone="warn">Menunggu ditinjau</StatusChip>}
      </PageHead>
      <div className="grid gap-4 md:gap-5 lg:grid-cols-[3fr_2fr]">
        <Section title="Data pengajuan">
          <dl className="divide-y">
            <Row label="Pemohon">{data.applicant_name} · {data.applicant_email}</Row>
            <Row label="WhatsApp gerai"><span className="tabular-nums">{maskPhone(data.contact_whatsapp)}</span></Row>
            <Row label="Email akun Mengantar">{data.seller_email}</Row>
            <Row label="Alamat gerai"><span className="font-mono">{data.slug}.geraimitra.com</span></Row>
            <Row label="Titik jemput">
              <div className="flex flex-col gap-1.5">
                <span>{data.outlet.streetAddress}, {data.outlet.areaLabel}</span>
                {typeof data.outlet.latitude === "number" && typeof data.outlet.longitude === "number" && Number.isFinite(data.outlet.latitude) && Number.isFinite(data.outlet.longitude) && !(data.outlet.latitude === 0 && data.outlet.longitude === 0) ? (
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>Pin: {data.outlet.latitude}, {data.outlet.longitude}</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${data.outlet.latitude},${data.outlet.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Buka di Google Maps <ExternalLinkIcon aria-hidden className="size-3" />
                    </a>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Titik koordinat peta belum diisi (opsional, wajib untuk Pos Indonesia).</span>
                )}
              </div>
            </Row>
            <Row label="Penanggung jawab">{data.outlet.picName} · <span className="tabular-nums">{maskPhone(data.outlet.picPhone)}</span></Row>
            <Row label="Diajukan">{formatDate(data.submitted_at)}</Row>
            {data.decision_reason ? <Row label="Alasan keputusan">{data.decision_reason}</Row> : null}
          </dl>
        </Section>
        <Section title="Kesiapan">
          <ul className="flex flex-col gap-3">
            <li><StatusChip tone={data.slugReady ? "safe" : "danger"}>{data.slugReady ? "Alamat gerai siap" : "Alamat gerai sudah dipakai"}</StatusChip></li>
            <li><StatusChip tone="primary">Jalur Partner: {data.partnerTransport === "relay" ? "relay IPv4 statis" : "langsung (sandbox)"}</StatusChip></li>
            <li className="text-sm text-muted-foreground">Menyetujui akan membuka akun seller Mengantar atas nama gerai, mengaktifkan {data.slug}.geraimitra.com, dan mengirim email keputusan.</li>
          </ul>
          {!decided ? (
            <p className="mt-6 text-xs text-muted-foreground md:hidden">Disarankan memeriksa data di layar ≥ 768 px (tablet atau komputer) sebelum menyetujui.</p>
          ) : null}
          {/* DEC-244: the decision is available on every viewport (the note above only advises a larger screen). */}
          {!decided ? (
            <div className="mt-4 flex flex-col gap-3 md:mt-6">
              <ReasonAction label="Setujui & Buka Akun Seller Mengantar" confirmLabel="Setujui sekarang" path={`/gerai/applications/${data.id}/approve`} onDone={onDecided} hint="Memerlukan TOTP dalam 15 menit terakhir." />
              <ReasonAction label="Tolak pengajuan" confirmLabel="Tolak" variant="outline" path={`/gerai/applications/${data.id}/reject`} onDone={onDecided} hint="Alasan dikirim ke pemohon lewat email." />
            </div>
          ) : null}
        </Section>
      </div>
    </div>
  )
}

export { ONBOARDING_LABEL }
