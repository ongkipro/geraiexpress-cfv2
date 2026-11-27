import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { Button } from "@shared/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs"
import { EmptyBlock, ErrorBlock, formatDate, LoadingBlock, PageHead, RecheckButton, ReloadButton, Section, StatusChip } from "../../components/page"
import { MetricCard, MetricGrid, SectionCard } from "@shared/components/admin/page"
import { DataTableShell } from "@shared/components/admin/data-table"
import { useApi } from "../../lib/use-api"
import { api, ApiError } from "../../lib/api"
import { Textarea } from "@shared/components/ui/textarea"

// Super Admin `Pengawasan` (visual 07 §3.3): cross-tenant read-only search and the COD risk radar (risk_review +
// recent TOTP + audited read). No action here changes a gerai's shipments (DEC-209).
type Tab = "kiriman" | "risiko"

const STATUS_LABEL: Record<string, string> = {
  none: "Baru",
  ready_for_pickup: "Menunggu dijemput",
  handed_to_courier: "Diserahkan ke kurir",
  in_transit: "Dalam perjalanan",
  undelivery_hold: "Gagal kirim, ditahan",
  rts_in_transit: "Retur dalam perjalanan",
  provider_returned: "Retur sampai",
  rts_at_gerai: "Retur di gerai",
  rts_returned_to_sender: "Retur diserahkan ke pengirim",
  delivered: "Terkirim",
  cancelled: "Dibatalkan",
  lost: "Hilang",
  reconciliation_needed: "Perlu dicocokkan",
  provider_unpaid_hold: "Menunggu saldo",
}

export function PengawasanPage() {
  const { tab } = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const current: Tab = tab ?? "kiriman"
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHead title="Pengawasan" description="Pantauan kiriman lintas gerai (hanya baca) dan radar risiko COD." />
      <Tabs value={current} onValueChange={(v) => navigate({ to: "/pengawasan", search: { tab: v === "kiriman" ? undefined : (v as "risiko") } })} className="min-w-0">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList aria-label="Bagian pengawasan" className="w-max max-w-none">
            <TabsTrigger value="kiriman">Pantauan Kiriman & Sync</TabsTrigger>
            <TabsTrigger value="risiko">Radar Risiko COD</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {current === "kiriman" ? (
        <>
          <SyncQueues />
          <ShipmentSearch />
        </>
      ) : (
        <RiskRadar />
      )}
    </div>
  )
}

interface Antrean { queues: Array<{ status: string; n: number }>; discountMismatch: number }
const nf = new Intl.NumberFormat("id-ID")

/** `Antrean Sinkronisasi` (DEC-244): the cross-tenant stuck queues from `/pengawasan/antrean`, plus the finance fan-out. */
function SyncQueues() {
  const { data, error, loading, reload } = useApi<Antrean>("/pengawasan/antrean")
  const n = (status: string) => data?.queues.find((q) => q.status === status)?.n ?? 0
  return (
    <SectionCard
      title="Antrean Sinkronisasi"
      description="Kiriman yang menunggu penyelesaian di semua gerai."
      action={
        <span className="flex flex-wrap gap-2">
          <ReloadButton size="sm" onClick={reload} />
          <RecheckButton size="sm" label="Sync Keuangan Semua Gerai" busyLabel="Menjadwalkan…" path="/pengawasan/sinkron-keuangan" onDone={reload} done={(d) => `${(d as { enqueued: number }).enqueued} gerai dijadwalkan sinkron keuangan.`} />
        </span>
      }
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : (
        <div className="@container">
          <MetricGrid>
            <MetricCard label="Perlu dicocokkan" value={nf.format(n("reconciliation_needed"))} footer="Status penerbitan belum pasti" tone={n("reconciliation_needed") ? "warn" : undefined} />
            <MetricCard label="Menunggu saldo" value={nf.format(n("provider_unpaid_hold"))} footer="Saldo Mengantar gerai kurang" tone={n("provider_unpaid_hold") ? "warn" : undefined} />
            <MetricCard label="Sedang diterbitkan" value={nf.format(n("issuing_in_flight"))} footer="Permintaan resi berjalan" />
            <MetricCard label="Diskon belum sesuai" value={nf.format(data?.discountMismatch ?? 0)} footer="Lihat Tarif › Permintaan" tone={data?.discountMismatch ? "warn" : undefined} to="/tarif?tab=permintaan" />
          </MetricGrid>
        </div>
      )}
    </SectionCard>
  )
}

interface Hit { tenant_slug: string; tenant_name: string; slug: string; awb_number: string | null; courier_code: string | null; status: string; updated_at: number }

function ShipmentSearch() {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<Hit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function search(e: FormEvent) {
    e.preventDefault()
    if (pending || q.trim().length < 4) return
    setPending(true)
    setError(null)
    try {
      setItems((await api<{ items: Hit[] }>(`/pengawasan/kiriman?q=${encodeURIComponent(q.trim())}`)).items)
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Pencarian gagal.")
    } finally {
      setPending(false)
    }
  }
  return (
    <Section title="Cari kiriman di semua gerai">
      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <Field className="flex-1">
          <FieldLabel htmlFor="cari-kiriman">INV atau nomor resi</FieldLabel>
          <Input id="cari-kiriman" value={q} onChange={(e) => setQ(e.target.value)} placeholder="INV 8K4M2P7 atau JNE0001" autoComplete="off" />
        </Field>
        <Button type="submit" disabled={pending || q.trim().length < 4}>{pending ? "Mencari…" : "Cari"}</Button>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      {items === null ? null : items.length === 0 ? (
        <EmptyBlock title="Tidak ditemukan" body="Periksa kembali INV atau nomor resi." />
      ) : (
        <div className="mt-4">
          <DataTableShell
            caption="Hasil pencarian kiriman"
            rows={items}
            rowKey={(h) => `${h.tenant_slug}:${h.slug}`}
            columns={[
              { key: "inv", header: "INV", cell: (h) => <span className="font-medium tabular-nums">INV {h.slug.toUpperCase()}</span> },
              { key: "gerai", header: "Gerai", cell: (h) => <Link to="/gerai/$slug" params={{ slug: h.tenant_slug }} className="text-primary underline-offset-4 hover:underline">{h.tenant_name}</Link> },
              { key: "resi", header: "Kurir & resi", cell: (h) => <span className="tabular-nums">{h.courier_code ?? "—"} · {h.awb_number ?? "belum ada resi"}</span> },
              { key: "status", header: "Status", cell: (h) => <StatusChip tone="muted">{STATUS_LABEL[h.status] ?? h.status}</StatusChip> },
              { key: "update", header: "Diperbarui", cell: (h) => <span className="text-muted-foreground tabular-nums">{formatDate(h.updated_at)}</span>, wide: true },
            ]}
          />
        </div>
      )}
    </Section>
  )
}

interface RiskResult { items: Array<{ tenant_id?: string; tenant_slug?: string; tenant_name: string; delivered_count: number; rts_count: number; last_event_at: number }>; total: { delivered: number; rts: number; rtsBps: number | null } }

function RiskRadar() {
  const [phone, setPhone] = useState("")
  const [reason, setReason] = useState("")
  const [result, setResult] = useState<RiskResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      setResult(await api<RiskResult>("/pengawasan/risiko", { body: { phone, reason } }))
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") return window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent("/pengawasan?tab=risiko")}`)
      setError(err instanceof ApiError ? (err.body.field_errors.phone ?? err.body.message) : "Pencarian gagal.")
    } finally {
      setPending(false)
    }
  }
  return (
    <Section title="Radar Risiko COD">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <p className="text-sm text-muted-foreground">Nomor diubah menjadi kode acak di server; setiap pencarian dicatat di log audit beserta alasannya.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="hp-risiko">Nomor HP penerima</FieldLabel>
            <Input id="hp-risiko" inputMode="tel" placeholder="08xx-xxxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          </Field>
          <Field>
            <FieldLabel htmlFor="alasan-risiko">Alasan (wajib)</FieldLabel>
            <Textarea id="alasan-risiko" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
            <FieldDescription>Misalnya: laporan gerai tentang penerima COD.</FieldDescription>
          </Field>
        </div>
        {error ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-sm font-medium text-danger">{error}</p> : null}
        <div><Button type="submit" disabled={pending || phone.trim().length < 8 || reason.trim().length < 5}>{pending ? "Mencari…" : "Cari riwayat"}</Button></div>
      </form>
      {result ? (
        result.items.length === 0 ? (
          <div className="mt-4">
            <EmptyBlock title="Belum ada riwayat" body="Nomor ini belum pernah menerima kiriman COD di jaringan." />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4 border-t border-slate-100 pt-4">
            <div className="grid gap-3 sm:grid-cols-3 md:gap-4">
              <MetricCard label="Total terkirim" value={nf.format(result.total.delivered)} />
              <MetricCard label="Total retur (RTS)" value={nf.format(result.total.rts)} tone={result.total.rts > 0 ? "warn" : undefined} />
              <MetricCard
                label="Rasio retur"
                value={result.total.rtsBps !== null ? `${(result.total.rtsBps / 100).toLocaleString("id-ID")}%` : "—"}
                tone={result.total.rtsBps !== null && result.total.rtsBps > 0 ? "warn" : undefined}
              />
            </div>
            <DataTableShell
              caption="Riwayat penerima COD lintas gerai"
              rows={result.items}
              rowKey={(r) => r.tenant_id ?? r.tenant_slug ?? r.tenant_name}
              columns={[
                {
                  key: "gerai",
                  header: "Gerai",
                  cell: (r) =>
                    r.tenant_slug ? (
                      <Link to="/gerai/$slug" params={{ slug: r.tenant_slug }} className="font-medium text-primary underline-offset-4 hover:underline">
                        {r.tenant_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.tenant_name}</span>
                    ),
                },
                { key: "delivered", header: "Terkirim", align: "right", cell: (r) => nf.format(r.delivered_count) },
                { key: "rts", header: "Retur", align: "right", cell: (r) => (r.rts_count > 0 ? <StatusChip tone="danger">{nf.format(r.rts_count)}</StatusChip> : "0") },
                { key: "last", header: "Kejadian terakhir", wide: true, cell: (r) => <span className="text-muted-foreground tabular-nums">{formatDate(r.last_event_at)}</span> },
              ]}
            />
          </div>
        )
      ) : null}
    </Section>
  )
}
