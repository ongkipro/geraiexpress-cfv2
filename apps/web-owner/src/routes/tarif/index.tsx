import { useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, DownloadIcon, SearchIcon, SlidersHorizontalIcon, SparklesIcon } from "lucide-react"
import { toast } from "@shared/components/ui/sonner"
import { CourierLogo } from "@shared/components/admin/courier-logo"
import { DataTableShell, type Column } from "@shared/components/admin/data-table"
import { EmptyState, ErrorState, LoadingState, MetricCard, MetricGrid, PageHeader, SectionCard, StatusBadge } from "@shared/components/admin/page"
import { Button } from "@shared/components/ui/button"
import { Checkbox } from "@shared/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@shared/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { Textarea } from "@shared/components/ui/textarea"
import { formatDate, RecheckButton } from "../../components/page"
import { ReasonAction } from "../../components/reason-dialog"
import { api, ApiError } from "../../lib/api"
import { useApi } from "../../lib/use-api"

type Tab = "gerai" | "permintaan" | "kebijakan"
type GeraiFilter = "semua" | "selisih" | "belum" | "sesuai"
type ReqFilter = "semua" | "belum_kirim" | "sudah_kirim"

interface GeraiRow {
  id: string
  name: string
  slug: string
  sesuai: number
  belum: number
  selisih: number
  total: number
}

interface ReqRow {
  tenant_id: string
  tenant_name: string
  slug: string
  service_code: string
  display_name: string
  courier_code: string
  assigned_bps: number
  observed_bps: number | null
  verification_state: "belum_diterapkan" | "sesuai" | "selisih"
  requested_at: number
  request_sent_at: number | null
}

interface Band {
  defaultBps: number
  minBps: number
  maxBps: number
}

interface PartnerSchedule {
  masterDiscountBps: number
  extraPromoBps: number
  extraPromoNote: string | null
  platformMarginBps: number
  targetGeraiBps: number
}

interface CourierPolicyRow {
  courierCode: string
  name: string
  band: Band | null
  schedule: PartnerSchedule | null
}

interface PolicyData {
  platform: Band & { applySlaMinutes: number }
  couriers: CourierPolicyRow[]
}

const bpsText = (b: number | null | undefined) => (b === null || b === undefined ? "—" : `${(b / 100).toFixed(b % 100 === 0 ? 0 : 2).replace(".", ",")}%`)
const toBps = (s: string) => {
  const t = s.trim().replace(",", ".")
  if (t === "") return Number.NaN
  return Math.round(Number(t) * 100)
}
const toPctInput = (bps: number) => String(bps / 100)
const totpRedirect = () => window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent(window.location.pathname + window.location.search)}`)

const META: Record<Tab, { title: string; description: string }> = {
  gerai: {
    title: "Diskon & Cashback",
    description: "Pantau penerapan diskon per gerai. Pelanggan selalu membayar tarif normal Mengantar; selisih diskon dipantau terhadap estimasi live.",
  },
  permintaan: {
    title: "Permintaan ke Mengantar",
    description: "Daftar aturan diskon gerai yang menunggu diterapkan tim Mengantar. Ekspor CSV atau salin ringkasan untuk dikirim ke CS Partner.",
  },
  kebijakan: {
    title: "Kebijakan Diskon",
    description: "Kelola tarif master partner Mengantar, margin platform 5%, dan batas diskon per ekspedisi.",
  },
}

const FILTER_TABS: Array<{ id: GeraiFilter; label: string }> = [
  { id: "semua", label: "Semua" },
  { id: "selisih", label: "Ada selisih" },
  { id: "belum", label: "Menunggu" },
  { id: "sesuai", label: "Semua sesuai" },
]

export function TarifPage() {
  const { tab: raw } = useSearch({ strict: false }) as { tab?: string }
  const tab: Tab = raw === "permintaan" || raw === "kebijakan" ? raw : "gerai"
  const navigate = useNavigate()
  const [reloadTick, setReloadTick] = useState(0)
  const meta = META[tab]
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHeader title={meta.title} description={meta.description}>
        {tab === "gerai" ? (
          <>
            <RecheckButton
              label="Verifikasi Ulang Diskon"
              busyLabel="Memverifikasi…"
              path="/tarif/verifikasi-ulang"
              onDone={() => setReloadTick((k) => k + 1)}
              done={(d) => {
                const r = d as { tenants: number; observed: number }
                return `Verifikasi selesai: ${r.tenants} gerai diperiksa, ${r.observed} layanan teramati.`
              }}
            />
            <Button variant="outline" onClick={() => void navigate({ to: "/tarif", search: { tab: "kebijakan" } })}>
              <SlidersHorizontalIcon aria-hidden /> Kebijakan &amp; Master
            </Button>
          </>
        ) : null}
        {tab === "permintaan" ? (
          <Button variant="outline" render={<a href="/api/owner/tarif/permintaan.csv" />}>
            <DownloadIcon aria-hidden /> Unduh CSV
          </Button>
        ) : null}
        {tab === "kebijakan" ? (
          <Button variant="outline" onClick={() => void navigate({ to: "/tarif", search: {} })}>
            Lihat Daftar Gerai
          </Button>
        ) : null}
      </PageHeader>
      {tab === "gerai" ? <GeraiList key={reloadTick} /> : tab === "permintaan" ? <RequestList /> : <Policy />}
    </div>
  )
}

function GeraiList() {
  const { data, error, loading, reload } = useApi<{ items: GeraiRow[] }>("/tarif/gerai")
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<GeraiFilter>("semua")

  const items = useMemo(() => data?.items ?? [], [data])
  const totals = useMemo(() => {
    let sesuai = 0
    let belum = 0
    let selisih = 0
    for (const g of items) {
      sesuai += g.sesuai
      belum += g.belum
      selisih += g.selisih
    }
    return { gerai: items.length, sesuai, belum, selisih }
  }, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((g) => {
      if (filter === "selisih" && g.selisih === 0) return false
      if (filter === "belum" && g.belum === 0) return false
      if (filter === "sesuai" && (g.total === 0 || g.sesuai !== g.total)) return false
      if (!needle) return true
      return g.name.toLowerCase().includes(needle) || g.slug.toLowerCase().includes(needle)
    })
  }, [items, q, filter])

  if (loading) return <LoadingState />
  if (error || !data) return <ErrorState message={error ?? "Gagal memuat daftar gerai."} onRetry={reload} />

  const cols: Array<Column<GeraiRow>> = [
    {
      key: "name",
      header: "Gerai",
      cell: (g) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-slate-950">{g.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{g.slug}.geraimitra.com</span>
        </div>
      ),
    },
    {
      key: "sesuai",
      header: "Sesuai",
      align: "right",
      cell: (g) => <StatusBadge tone="safe">{g.sesuai}</StatusBadge>,
    },
    {
      key: "belum",
      header: "Belum diterapkan",
      align: "right",
      cell: (g) => (g.belum > 0 ? <StatusBadge tone="warn">{g.belum}</StatusBadge> : <span className="text-muted-foreground">0</span>),
    },
    {
      key: "selisih",
      header: "Selisih",
      align: "right",
      cell: (g) => (g.selisih > 0 ? <StatusBadge tone="danger">{g.selisih}</StatusBadge> : <span className="text-muted-foreground">0</span>),
    },
    {
      key: "total",
      header: "Total layanan",
      align: "right",
      wide: true,
      cell: (g) => <span className="tabular-nums text-muted-foreground">{g.total}</span>,
    },
    {
      key: "act",
      header: "Aksi",
      align: "right",
      cell: (g) => (
        <Button size="sm" variant="outline" render={<Link to="/tarif/$tenantId" params={{ tenantId: g.id }} />}>
          Atur Diskon
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="@container">
        <MetricGrid>
          <MetricCard label="Gerai aktif" value={totals.gerai} />
          <MetricCard label="Layanan sesuai" value={totals.sesuai} />
          <MetricCard label="Menunggu Mengantar" value={totals.belum} tone={totals.belum > 0 ? "warn" : undefined} />
          <MetricCard label="Ada selisih" value={totals.selisih} tone={totals.selisih > 0 ? "warn" : undefined} />
        </MetricGrid>
      </div>

      <SectionCard title="Ringkasan Diskon per Gerai" description="Klik Atur Diskon untuk melihat perbandingan Master Mengantar, Margin Platform, dan Diskon Gerai per layanan." flush>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="relative w-full md:max-w-xs">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau slug gerai…" className="pl-9" aria-label="Cari gerai" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter status diskon">
            {FILTER_TABS.map((f) => (
              <Button key={f.id} type="button" size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>
        <DataTableShell
          bare
          caption="Diskon per gerai"
          columns={cols}
          rows={filtered}
          rowKey={(g) => g.id}
          empty={<EmptyState title={items.length === 0 ? "Belum ada gerai" : "Tidak ada gerai cocok"} body={items.length === 0 ? "Aturan diskon dibuat otomatis saat pengajuan gerai disetujui." : "Ubah kata kunci atau filter status di atas."} />}
          mobile={(g) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-950">{g.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{g.slug}.geraimitra.com</div>
                </div>
                <Button size="sm" variant="outline" render={<Link to="/tarif/$tenantId" params={{ tenantId: g.id }} />}>
                  Atur
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs tabular-nums">
                <StatusBadge tone="safe">{g.sesuai} sesuai</StatusBadge>
                {g.belum > 0 ? <StatusBadge tone="warn">{g.belum} belum</StatusBadge> : null}
                {g.selisih > 0 ? <StatusBadge tone="danger">{g.selisih} selisih</StatusBadge> : null}
              </div>
            </div>
          )}
        />
      </SectionCard>
    </div>
  )
}

function RequestList() {
  const { data, error, loading, reload } = useApi<{ items: ReqRow[] }>("/tarif/permintaan")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<ReqFilter>("semua")
  const [copied, setCopied] = useState(false)

  const items = useMemo(() => data?.items ?? [], [data])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((r) => {
      if (filter === "belum_kirim" && r.request_sent_at) return false
      if (filter === "sudah_kirim" && !r.request_sent_at) return false
      if (!needle) return true
      return r.tenant_name.toLowerCase().includes(needle) || r.display_name.toLowerCase().includes(needle) || r.slug.toLowerCase().includes(needle)
    })
  }, [items, q, filter])

  if (loading) return <LoadingState />
  if (error || !data) return <ErrorState message={error ?? "Gagal memuat daftar permintaan."} onRetry={reload} />

  const keyOf = (r: ReqRow) => `${r.tenant_id}|${r.service_code}`
  const toggle = (k: string) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const unsentFiltered = filtered.filter((r) => !r.request_sent_at)
  const allChecked = unsentFiltered.length > 0 && unsentFiltered.every((r) => selected.has(keyOf(r)))
  const toggleAll = () => {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(unsentFiltered.map(keyOf)))
  }

  const keys = [...selected].map((k) => {
    const [tenantId, serviceCode] = k.split("|")
    return { tenantId, serviceCode }
  })

  async function copySummary() {
    const target = selected.size > 0 ? items.filter((r) => selected.has(keyOf(r))) : filtered
    if (target.length === 0) return
    const lines = [
      "Permintaan Penyesuaian Diskon Seller Partner GeraiExpress (ongkirich):",
      ...target.map((r, i) => `${i + 1}. ${r.tenant_name} (${r.slug}) — ${r.display_name}: target ${bpsText(r.assigned_bps)} (teramati: ${bpsText(r.observed_bps)})`),
    ]
    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      setCopied(true)
      toast.success(`${target.length} baris ringkasan disalin untuk dikirim ke tim Mengantar.`)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error("Gagal menyalin otomatis. Gunakan tombol Unduh CSV.")
    }
  }

  const unsentCount = items.filter((r) => !r.request_sent_at).length
  const selisihCount = items.filter((r) => r.verification_state === "selisih").length

  const cols: Array<Column<ReqRow>> = [
    {
      key: "pick",
      header: <Checkbox aria-label="Pilih semua yang belum dikirim" checked={allChecked} onCheckedChange={toggleAll} disabled={unsentFiltered.length === 0} />,
      cell: (r) => (
        <Checkbox
          aria-label={`Pilih ${r.tenant_name} ${r.display_name}`}
          checked={selected.has(keyOf(r))}
          onCheckedChange={() => toggle(keyOf(r))}
          disabled={Boolean(r.request_sent_at)}
        />
      ),
      className: "w-10",
    },
    {
      key: "tenant",
      header: "Gerai",
      cell: (r) => (
        <Link to="/tarif/$tenantId" params={{ tenantId: r.tenant_id }} className="font-medium text-primary hover:underline">
          {r.tenant_name}
        </Link>
      ),
    },
    {
      key: "service",
      header: "Layanan",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <CourierLogo code={r.courier_code} name={r.display_name} decorative />
          <span className="font-medium">{r.display_name}</span>
        </div>
      ),
    },
    { key: "assigned", header: "Diminta", align: "right", cell: (r) => <span className="font-medium">{bpsText(r.assigned_bps)}</span> },
    { key: "observed", header: "Teramati", align: "right", cell: (r) => bpsText(r.observed_bps) },
    {
      key: "state",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={r.verification_state === "selisih" ? "danger" : "warn"}>
            {r.verification_state === "selisih" ? "Selisih" : "Belum diterapkan"}
          </StatusBadge>
          {r.request_sent_at ? <StatusBadge tone="muted">Sudah diminta</StatusBadge> : null}
        </div>
      ),
    },
    {
      key: "requested_at",
      header: "Diminta sejak",
      wide: true,
      cell: (r) => <span className="text-muted-foreground tabular-nums">{formatDate(r.requested_at)}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="grid gap-3 sm:grid-cols-3 md:gap-4">
        <MetricCard label="Total antrean" value={items.length} />
        <MetricCard label="Belum dikirim ke Mengantar" value={unsentCount} tone={unsentCount > 0 ? "warn" : undefined} />
        <MetricCard label="Melewati SLA (Selisih)" value={selisihCount} tone={selisihCount > 0 ? "warn" : undefined} />
      </div>

      <SectionCard
        title="Antrean Permintaan ke Tim Mengantar"
        description="Pilih baris yang sudah dikirim ke CS Partner Mengantar lalu tandai agar tidak terkirim ganda."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void copySummary()} disabled={filtered.length === 0}>
              {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
              {copied ? "Tersalin" : selected.size > 0 ? `Salin ${selected.size} Terpilih` : "Salin Ringkasan CS"}
            </Button>
            {keys.length > 0 ? (
              <ReasonAction
                label={`Tandai Sudah Diminta (${keys.length})`}
                confirmLabel="Tandai sekarang"
                path="/tarif/permintaan/tandai"
                extra={{ keys }}
                onDone={() => {
                  setSelected(new Set())
                  reload()
                }}
              />
            ) : null}
          </div>
        }
        flush
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="relative w-full md:max-w-xs">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari gerai atau ekspedisi…" className="pl-9" aria-label="Cari permintaan" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter kirim permintaan">
            {(
              [
                ["semua", "Semua"],
                ["belum_kirim", "Belum dikirim"],
                ["sudah_kirim", "Sudah dikirim"],
              ] as Array<[ReqFilter, string]>
            ).map(([id, label]) => (
              <Button key={id} type="button" size="sm" variant={filter === id ? "default" : "outline"} onClick={() => setFilter(id)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
        <DataTableShell
          bare
          caption="Daftar permintaan penerapan diskon ke Mengantar"
          columns={cols}
          rows={filtered}
          rowKey={keyOf}
          empty={<EmptyState title="Tidak ada permintaan tertunda" body="Semua aturan diskon gerai sudah sesuai dengan diskon aktif di Mengantar." />}
          mobile={(r) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  aria-label={`Pilih ${r.tenant_name} ${r.display_name}`}
                  checked={selected.has(keyOf(r))}
                  onCheckedChange={() => toggle(keyOf(r))}
                  disabled={Boolean(r.request_sent_at)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/tarif/$tenantId" params={{ tenantId: r.tenant_id }} className="font-medium text-primary hover:underline">
                      {r.tenant_name}
                    </Link>
                    <StatusBadge tone={r.verification_state === "selisih" ? "danger" : "warn"}>
                      {r.verification_state === "selisih" ? "Selisih" : "Belum diterapkan"}
                    </StatusBadge>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <CourierLogo code={r.courier_code} name={r.display_name} decorative />
                    <span className="text-sm">{r.display_name}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    <span>Diminta: <strong className="text-slate-900">{bpsText(r.assigned_bps)}</strong></span>
                    <span>Teramati: {bpsText(r.observed_bps)}</span>
                    {r.request_sent_at ? <span>Sudah diminta</span> : null}
                  </div>
                </div>
              </div>
            </div>
          )}
        />
      </SectionCard>
    </div>
  )
}

function Policy() {
  const { data, error, loading, reload } = useApi<PolicyData>("/tarif/kebijakan")
  const [editBandCourier, setEditBandCourier] = useState<CourierPolicyRow | null>(null)
  const [editMasterCourier, setEditMasterCourier] = useState<CourierPolicyRow | null>(null)

  if (loading) return <LoadingState />
  if (error || !data) return <ErrorState message={error ?? "Gagal memuat kebijakan diskon."} onRetry={reload} />

  const cols: Array<Column<CourierPolicyRow>> = [
    {
      key: "courier",
      header: "Ekspedisi",
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <CourierLogo code={c.courierCode} name={c.name} decorative />
          <div className="min-w-0">
            <div className="font-medium text-slate-950">{c.name}</div>
            {c.schedule?.extraPromoNote ? <div className="text-xs text-muted-foreground">{c.schedule.extraPromoNote}</div> : null}
          </div>
        </div>
      ),
    },
    {
      key: "master",
      header: "Master",
      align: "right",
      cell: (c) =>
        c.schedule ? (
          <span className="whitespace-nowrap font-medium text-slate-950">
            {bpsText(c.schedule.masterDiscountBps)}
            {c.schedule.extraPromoBps > 0 ? <span className="ml-1 text-xs font-medium text-primary">+{bpsText(c.schedule.extraPromoBps)}*</span> : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      cell: (c) => (c.schedule ? <StatusBadge tone="primary">{bpsText(c.schedule.platformMarginBps)}</StatusBadge> : "—"),
    },
    {
      key: "target",
      header: "Target Gerai",
      align: "right",
      cell: (c) => (c.schedule ? <span className="font-semibold text-emerald-700">{bpsText(c.schedule.targetGeraiBps)}</span> : "—"),
    },
    {
      key: "band",
      header: "Batas Aktif",
      cell: (c) => {
        const eff = c.band ?? data.platform
        return (
          <div className="flex flex-col items-start gap-1 tabular-nums">
            <span className="whitespace-nowrap text-sm font-medium">{bpsText(eff.minBps)} / {bpsText(eff.defaultBps)} / {bpsText(eff.maxBps)}</span>
            <StatusBadge tone={c.band ? "safe" : "muted"}>{c.band ? "Khusus kurir" : "Default platform"}</StatusBadge>
          </div>
        )
      },
    },
    {
      key: "act",
      header: "Aksi",
      align: "right",
      cell: (c) => (
        <div className="flex justify-end gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditBandCourier(c)}>
            Batas
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditMasterCourier(c)}>
            Master
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <SectionCard
        title="Matriks Master Partner Mengantar & Batas per Ekspedisi"
        description="Tarif master dari Mengantar dikurangi Margin Platform (5%) menghasilkan Target Diskon Gerai. Mengubah batas tidak otomatis menimpa aturan gerai yang sudah berjalan."
        action={
          <ReasonAction
            label="Terapkan Batas Standar Partner"
            confirmLabel="Terapkan ke Semua Ekspedisi"
            variant="outline"
            path="/tarif/kebijakan/terapkan-standar"
            onDone={reload}
            hint="Mengisi batas khusus per ekspedisi sesuai jadwal Master Mengantar & Margin Platform (termasuk Pos Indonesia 10%–15% dan promo ekstra SPX/J&T hingga 35%). Aturan gerai lama tidak otomatis berubah."
          />
        }
        flush
      >
        <DataTableShell
          bare
          caption="Jadwal diskon master partner dan batas per ekspedisi"
          columns={cols}
          rows={data.couriers}
          rowKey={(c) => c.courierCode}
          mobile={(c) => {
            const eff = c.band ?? data.platform
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <CourierLogo code={c.courierCode} name={c.name} decorative />
                    <span className="font-medium text-slate-950">{c.name}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditBandCourier(c)}>Batas</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditMasterCourier(c)}>Master</Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs tabular-nums">
                  <div>
                    <div className="text-muted-foreground">Master</div>
                    <div className="font-medium">{c.schedule ? `${bpsText(c.schedule.masterDiscountBps)}${c.schedule.extraPromoBps ? ` +${bpsText(c.schedule.extraPromoBps)}*` : ""}` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Margin</div>
                    <div className="font-medium text-primary">{c.schedule ? bpsText(c.schedule.platformMarginBps) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Target Gerai</div>
                    <div className="font-semibold text-emerald-700">{c.schedule ? bpsText(c.schedule.targetGeraiBps) : "—"}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                  <span className="text-muted-foreground">Batas aktif: <strong className="text-slate-900">{bpsText(eff.minBps)} / {bpsText(eff.defaultBps)} / {bpsText(eff.maxBps)}</strong></span>
                  <StatusBadge tone={c.band ? "safe" : "muted"}>{c.band ? "Khusus kurir" : "Default platform"}</StatusBadge>
                </div>
              </div>
            )
          }}
        />
      </SectionCard>

      <SectionCard title="Kebijakan Default Platform" description="Berlaku untuk ekspedisi yang belum memiliki batas khusus kurir serta batas waktu verifikasi penerapan Mengantar (SLA).">
        <PlatformBandForm platform={data.platform} onSaved={reload} />
      </SectionCard>

      {editBandCourier ? (
        <CourierBandDialog
          courier={editBandCourier}
          platform={data.platform}
          onClose={() => setEditBandCourier(null)}
          onSaved={() => {
            setEditBandCourier(null)
            reload()
          }}
        />
      ) : null}

      {editMasterCourier ? (
        <MasterScheduleDialog
          courier={editMasterCourier}
          onClose={() => setEditMasterCourier(null)}
          onSaved={() => {
            setEditMasterCourier(null)
            reload()
          }}
        />
      ) : null}
    </div>
  )
}

function PlatformBandForm({ platform, onSaved }: { platform: Band & { applySlaMinutes: number }; onSaved: () => void }) {
  const [min, setMin] = useState(toPctInput(platform.minBps))
  const [def, setDef] = useState(toPctInput(platform.defaultBps))
  const [max, setMax] = useState(toPctInput(platform.maxBps))
  const [sla, setSla] = useState(String(platform.applySlaMinutes))
  const [reason, setReason] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const minBps = toBps(min)
    const defaultBps = toBps(def)
    const maxBps = toBps(max)
    const applySlaMinutes = sla.trim() === "" ? Number.NaN : Number(sla)
    if (!Number.isFinite(minBps) || !Number.isFinite(defaultBps) || !Number.isFinite(maxBps) || !Number.isInteger(applySlaMinutes)) {
      setErr("Isi semua kolom persentase dan SLA dengan angka yang valid.")
      return
    }
    setPending(true)
    setErr(null)
    try {
      await api("/tarif/kebijakan/platform", {
        body: { band: { minBps, defaultBps, maxBps }, applySlaMinutes, reason },
      })
      setReason("")
      toast.success("Kebijakan default platform tersimpan.")
      onSaved()
    } catch (e2) {
      if (e2 instanceof ApiError && e2.body.code === "TOTP_RECENT_REQUIRED") return totpRedirect()
      setErr(e2 instanceof ApiError ? e2.body.message : "Gagal menyimpan kebijakan.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="pol-min">Minimum (%)</FieldLabel>
          <Input id="pol-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} className="tabular-nums" />
        </Field>
        <Field>
          <FieldLabel htmlFor="pol-def">Default gerai baru (%)</FieldLabel>
          <Input id="pol-def" inputMode="decimal" value={def} onChange={(e) => setDef(e.target.value)} className="tabular-nums" />
        </Field>
        <Field>
          <FieldLabel htmlFor="pol-max">Maksimum (%)</FieldLabel>
          <Input id="pol-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className="tabular-nums" />
        </Field>
        <Field>
          <FieldLabel htmlFor="pol-sla">SLA Mengantar (menit)</FieldLabel>
          <Input id="pol-sla" inputMode="numeric" value={sla} onChange={(e) => setSla(e.target.value)} className="tabular-nums" />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field className="flex-1">
          <FieldLabel htmlFor="pol-reason">Alasan perubahan (wajib, dicatat di log audit)</FieldLabel>
          <Textarea id="pol-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Contoh: Penyesuaian SLA penerapan tim Mengantar" />
        </Field>
        <Button type="submit" disabled={pending || reason.trim().length < 5}>
          {pending ? "Menyimpan…" : "Simpan Default Platform"}
        </Button>
      </div>
      {err ? <FieldError>{err}</FieldError> : null}
    </form>
  )
}

function CourierBandDialog({ courier, platform, onClose, onSaved }: { courier: CourierPolicyRow; platform: Band; onClose: () => void; onSaved: () => void }) {
  const cur = courier.band ?? platform
  const [min, setMin] = useState(toPctInput(cur.minBps))
  const [def, setDef] = useState(toPctInput(cur.defaultBps))
  const [max, setMax] = useState(toPctInput(cur.maxBps))
  const [reason, setReason] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function fillFromMaster() {
    if (!courier.schedule) return
    const target = courier.schedule.targetGeraiBps
    const minBps = Math.min(platform.minBps, target)
    const maxBps = Math.min(10_000, Math.max(target, courier.schedule.masterDiscountBps + courier.schedule.extraPromoBps))
    setMin(toPctInput(minBps))
    setDef(toPctInput(target))
    setMax(toPctInput(maxBps))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const minBps = toBps(min)
    const defaultBps = toBps(def)
    const maxBps = toBps(max)
    if (!Number.isFinite(minBps) || !Number.isFinite(defaultBps) || !Number.isFinite(maxBps)) {
      setErr("Isi kolom minimum, default, dan maksimum dengan angka persentase yang valid.")
      return
    }
    setPending(true)
    setErr(null)
    try {
      await api(`/tarif/kebijakan/kurir/${courier.courierCode}`, {
        body: { band: { minBps, defaultBps, maxBps }, reason },
      })
      toast.success(`Batas diskon ${courier.name} diperbarui.`)
      onSaved()
    } catch (e2) {
      if (e2 instanceof ApiError && e2.body.code === "TOTP_RECENT_REQUIRED") return totpRedirect()
      setErr(e2 instanceof ApiError ? e2.body.message : "Gagal menyimpan batas kurir.")
    } finally {
      setPending(false)
    }
  }

  async function resetToPlatform() {
    setPending(true)
    setErr(null)
    try {
      await api(`/tarif/kebijakan/kurir/${courier.courierCode}`, { body: { band: null, reason } })
      toast.success(`${courier.name} dikembalikan ke batas default platform.`)
      onSaved()
    } catch (e2) {
      if (e2 instanceof ApiError && e2.body.code === "TOTP_RECENT_REQUIRED") return totpRedirect()
      setErr(e2 instanceof ApiError ? e2.body.message : "Gagal mereset batas kurir.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Batas Diskon — {courier.name}</DialogTitle>
          <DialogDescription>
            {courier.schedule
              ? `Master Mengantar ${bpsText(courier.schedule.masterDiscountBps)}${courier.schedule.extraPromoBps ? ` + ${bpsText(courier.schedule.extraPromoBps)}*` : ""} · Margin Platform ${bpsText(courier.schedule.platformMarginBps)} · Target Gerai ${bpsText(courier.schedule.targetGeraiBps)}.`
              : "Batas minimum, default, dan maksimum yang diizinkan untuk ekspedisi ini."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          {courier.schedule ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Isi otomatis dari jadwal Master Partner?</span>
              <Button type="button" size="sm" variant="outline" onClick={fillFromMaster}>
                <SparklesIcon aria-hidden /> Pakai Target Master
              </Button>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="cb-min">Minimum (%)</FieldLabel>
              <Input id="cb-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} className="tabular-nums" />
            </Field>
            <Field>
              <FieldLabel htmlFor="cb-def">Default (%)</FieldLabel>
              <Input id="cb-def" inputMode="decimal" value={def} onChange={(e) => setDef(e.target.value)} className="tabular-nums" />
            </Field>
            <Field>
              <FieldLabel htmlFor="cb-max">Maksimum (%)</FieldLabel>
              <Input id="cb-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className="tabular-nums" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="cb-reason">Alasan perubahan (wajib, dicatat di log audit)</FieldLabel>
            <Textarea id="cb-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
          </Field>
          {err ? <FieldError>{err}</FieldError> : null}
          <DialogFooter className="flex-wrap justify-between gap-2 sm:justify-between">
            {courier.band ? (
              <Button type="button" variant="ghost" disabled={pending || reason.trim().length < 5} onClick={() => void resetToPlatform()}>
                Reset ke Default Platform
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Batal</Button>
              <Button type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Menyimpan…" : "Simpan Batas"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MasterScheduleDialog({ courier, onClose, onSaved }: { courier: CourierPolicyRow; onClose: () => void; onSaved: () => void }) {
  const s = courier.schedule
  const [master, setMaster] = useState(toPctInput(s?.masterDiscountBps ?? 3000))
  const [extra, setExtra] = useState(toPctInput(s?.extraPromoBps ?? 0))
  const [margin, setMargin] = useState(toPctInput(s?.platformMarginBps ?? 500))
  const [note, setNote] = useState(s?.extraPromoNote ?? "")
  const [reason, setReason] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const masterBps = toBps(master)
  const marginBps = toBps(margin)
  const validPreview = Number.isFinite(masterBps) && Number.isFinite(marginBps) && masterBps >= marginBps
  const targetPreview = validPreview ? masterBps - marginBps : null

  async function save(e: FormEvent) {
    e.preventDefault()
    const masterDiscountBps = toBps(master)
    const extraPromoBps = extra.trim() === "" ? 0 : toBps(extra)
    const platformMarginBps = toBps(margin)
    if (!Number.isFinite(masterDiscountBps) || !Number.isFinite(extraPromoBps) || !Number.isFinite(platformMarginBps)) {
      setErr("Isi kolom master, promo ekstra, dan margin dengan angka persentase yang valid.")
      return
    }
    setPending(true)
    setErr(null)
    try {
      await api(`/tarif/kebijakan/master/${courier.courierCode}`, {
        body: {
          masterDiscountBps,
          extraPromoBps,
          platformMarginBps,
          extraPromoNote: note.trim() || null,
          reason,
        },
      })
      toast.success(`Jadwal master ${courier.name} tersimpan.`)
      onSaved()
    } catch (e2) {
      if (e2 instanceof ApiError && e2.body.code === "TOTP_RECENT_REQUIRED") return totpRedirect()
      setErr(e2 instanceof ApiError ? e2.body.message : "Gagal menyimpan jadwal master.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Jadwal Master Partner — {courier.name}</DialogTitle>
          <DialogDescription>Referensi tarif resmi dari Mengantar (partner ongkirich) dan porsi margin platform GeraiExpress.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="ms-master">Master (%)</FieldLabel>
              <Input id="ms-master" inputMode="decimal" value={master} onChange={(e) => setMaster(e.target.value)} className="tabular-nums" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ms-extra">Promo ekstra (%)</FieldLabel>
              <Input id="ms-extra" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} className="tabular-nums" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ms-margin">Margin platform (%)</FieldLabel>
              <Input id="ms-margin" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} className="tabular-nums" />
            </Field>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs tabular-nums">
            Target Diskon Gerai: <strong className="text-emerald-700">{targetPreview !== null ? bpsText(targetPreview) : "—"}</strong>
            {Number.isFinite(toBps(extra)) && toBps(extra) > 0 ? <span className="text-muted-foreground"> (+ {bpsText(toBps(extra))}* promo ekstra)</span> : null}
          </div>
          <Field>
            <FieldLabel htmlFor="ms-note">Catatan promo (opsional)</FieldLabel>
            <Input id="ms-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Contoh: Promo ekstra berlaku mengikuti ketentuan Mengantar" />
            <FieldDescription>Ditampilkan di bawah nama ekspedisi pada tabel kebijakan.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ms-reason">Alasan perubahan (wajib, dicatat di log audit)</FieldLabel>
            <Textarea id="ms-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
          </Field>
          {err ? <FieldError>{err}</FieldError> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Batal</Button>
            <Button type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Menyimpan…" : "Simpan Master"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
