import { Link, useParams } from "@tanstack/react-router"
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
  outlet: { name: string; picName: string; picPhone: string; areaLabel: string; streetAddress: string; areaId: string }
}

const maskPhone = (p: string) => (p.length > 4 ? `${p.slice(0, 4)}-xxxx-${p.slice(-4)}` : p)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[220px_1fr]">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  )
}

export function PengajuanPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const { data, error, loading, reload } = useApi<Detail>(`/gerai/applications/${encodeURIComponent(id)}`)
  if (loading) return <LoadingBlock />
  if (error || !data) return <ErrorBlock message={error ?? "Pengajuan tidak ditemukan."} onRetry={reload} />
  const decided = data.state !== "submitted"
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Navigasi halaman" className="text-base text-muted-foreground">
        <Link to="/gerai" search={{ tab: "pengajuan" }} className="text-primary underline-offset-4 hover:underline">Gerai</Link> › Pengajuan › {data.business_name}
      </nav>
      <PageHead title={data.business_name}>
        {decided ? <StatusChip tone={data.state === "approved" ? "safe" : "danger"}>{data.state === "approved" ? "Disetujui" : "Ditolak"}</StatusChip> : <StatusChip tone="warn">Menunggu ditinjau</StatusChip>}
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section title="Data pengajuan">
          <dl className="divide-y">
            <Row label="Pemohon">{data.applicant_name} · {data.applicant_email}</Row>
            <Row label="WhatsApp gerai"><span className="tabular-nums">{maskPhone(data.contact_whatsapp)}</span></Row>
            <Row label="Email akun Mengantar">{data.seller_email}</Row>
            <Row label="Alamat gerai"><span className="font-mono">{data.slug}.geraimitra.com</span></Row>
            <Row label="Titik jemput">{data.outlet.streetAddress}, {data.outlet.areaLabel}</Row>
            <Row label="Penanggung jawab">{data.outlet.picName} · <span className="tabular-nums">{maskPhone(data.outlet.picPhone)}</span></Row>
            <Row label="Diajukan">{formatDate(data.submitted_at)}</Row>
            {data.decision_reason ? <Row label="Alasan keputusan">{data.decision_reason}</Row> : null}
          </dl>
        </Section>
        <Section title="Kesiapan">
          <ul className="flex flex-col gap-3">
            <li><StatusChip tone={data.slugReady ? "safe" : "danger"}>{data.slugReady ? "Alamat gerai siap" : "Alamat gerai sudah dipakai"}</StatusChip></li>
            <li><StatusChip tone="primary">Jalur Partner: {data.partnerTransport === "relay" ? "relay IPv4 statis" : "langsung (sandbox)"}</StatusChip></li>
            <li className="text-base text-muted-foreground">Menyetujui akan membuka akun seller Mengantar atas nama gerai, mengaktifkan {data.slug}.geraimitra.com, dan mengirim email keputusan.</li>
          </ul>
          {!decided ? (
            <p className="mt-6 text-base text-muted-foreground md:hidden">Persetujuan sebaiknya dilakukan di layar ≥ 768 px (tablet atau komputer) agar data bisa diperiksa utuh.</p>
          ) : null}
          {!decided ? (
            <div className="mt-6 hidden flex-col gap-3 md:flex">
              <ReasonAction label="Setujui & Buka Akun Seller Mengantar" confirmLabel="Setujui sekarang" path={`/gerai/applications/${data.id}/approve`} onDone={reload} hint="Memerlukan TOTP dalam 15 menit terakhir." />
              <ReasonAction label="Tolak pengajuan" confirmLabel="Tolak" variant="outline" path={`/gerai/applications/${data.id}/reject`} onDone={reload} hint="Alasan dikirim ke pemohon lewat email." />
            </div>
          ) : null}
        </Section>
      </div>
    </div>
  )
}

export { ONBOARDING_LABEL }
