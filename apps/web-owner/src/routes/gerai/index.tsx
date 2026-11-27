import { useEffect, useState } from "react"
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { SearchIcon } from "lucide-react"
import { Input } from "@shared/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs"
import { EmptyState, ErrorState, LoadingState, MetricCard, MetricGrid, PageHeader, SectionCard, StatusBadge } from "@shared/components/admin/page"
import { DataTableShell } from "@shared/components/admin/data-table"
import { formatDate, ONBOARDING_LABEL, RecheckButton, ReloadButton } from "../../components/page"
import { ReasonAction } from "../../components/reason-dialog"
import { useApi } from "../../lib/use-api"

type Tab = "pengajuan" | "direktori" | "domain"
const nf = new Intl.NumberFormat("id-ID")

interface AppItem { id: string; business_name: string; slug: string; area: string | null; submitted_at: number; state: string }
interface GeraiItem { id: string; slug: string; name: string; status: string; onboarding_state: string | null; masking_enabled: number; approved_at: number | null }
interface Summary { pending: number; active: number; suspended: number; onboarding: number }

export function GeraiPage() {
  const { tab } = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const router = useRouter()
  const current: Tab = tab ?? "pengajuan"
  const [refreshTick, setRefreshTick] = useState(0)
  const summary = useApi<Summary>("/gerai/summary")
  const s = summary.data
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHeader title="Gerai" description="Pengajuan, direktori, dan domain mitra seluruh gerai.">
        <ReloadButton onClick={() => { summary.reload(); setRefreshTick((t) => t + 1); void router.invalidate() }} />
      </PageHeader>
      {/* DEC-244: platform-wide summary strip from /gerai/summary. */}
      {summary.error && !s ? <ErrorState message={summary.error} onRetry={summary.reload} /> : null}
      <div className="@container">
        <MetricGrid>
          <MetricCard label="Pengajuan baru" value={s ? nf.format(s.pending) : "—"} footer="Menunggu ditinjau" tone={s?.pending ? "warn" : undefined} to="/gerai" />
          <MetricCard label="Gerai aktif" value={s ? nf.format(s.active) : "—"} footer="Mini-site dan ruang kerja aktif" to="/gerai?tab=direktori" />
          <MetricCard label="Onboarding tertunda" value={s ? nf.format(s.onboarding) : "—"} footer="Pendaftaran seller belum pasti" tone={s?.onboarding ? "warn" : undefined} />
          <MetricCard label="Gerai dibekukan" value={s ? nf.format(s.suspended) : "—"} footer="Mini-site menjawab 403" />
        </MetricGrid>
      </div>
      <Tabs value={current} onValueChange={(v) => navigate({ to: "/gerai", search: { tab: v as Tab } })} className="min-w-0">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList aria-label="Bagian gerai" className="w-max max-w-none">
            <TabsTrigger value="pengajuan">Pengajuan Baru</TabsTrigger>
            <TabsTrigger value="direktori">Direktori Gerai</TabsTrigger>
            <TabsTrigger value="domain">Domain Mitra</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {current === "pengajuan" ? <Applications refreshTick={refreshTick} /> : current === "direktori" ? <Directory refreshTick={refreshTick} /> : <Domains refreshTick={refreshTick} />}
    </div>
  )
}

function Applications({ refreshTick }: { refreshTick: number }) {
  const { data, error, loading, reload } = useApi<{ items: AppItem[] }>("/gerai/applications")
  useEffect(() => { if (refreshTick > 0) reload() }, [refreshTick, reload])
  return (
    <SectionCard title="Menunggu ditinjau" description="Klik nama gerai untuk meninjau kelengkapan data dan menyetujui pembukaan akun seller Mengantar." flush>
      {loading ? (
        <div className="p-4 md:p-5"><LoadingState /></div>
      ) : error ? (
        <div className="p-4 md:p-5"><ErrorState message={error} onRetry={reload} /></div>
      ) : (
        <DataTableShell
          bare
          caption="Pengajuan gerai menunggu ditinjau"
          rows={data?.items ?? []}
          rowKey={(a) => a.id}
          empty={<EmptyState title="Tidak ada pengajuan baru" body="Pengajuan gerai yang masuk akan tampil di sini." />}
          columns={[
            {
              key: "name",
              header: "Gerai",
              cell: (a) => (
                <Link to="/gerai/pengajuan/$id" params={{ id: a.id }} className="font-medium text-primary underline-offset-4 hover:underline">
                  {a.business_name}
                </Link>
              ),
            },
            { key: "slug", header: "Alamat gerai", cell: (a) => <span className="font-mono text-xs">{a.slug}.geraimitra.com</span> },
            { key: "area", header: "Wilayah titik jemput", cell: (a) => a.area ?? "—" },
            { key: "submitted", header: "Diajukan", cell: (a) => <span className="text-muted-foreground tabular-nums">{formatDate(a.submitted_at)}</span> },
          ]}
          mobile={(a) => (
            <Link to="/gerai/pengajuan/$id" params={{ id: a.id }} className="flex min-h-11 flex-col justify-center gap-0.5">
              <span className="font-medium text-primary">{a.business_name}</span>
              <span className="font-mono text-xs text-muted-foreground">{a.slug}.geraimitra.com</span>
              <span className="text-xs text-muted-foreground tabular-nums">{a.area ? `${a.area} · ` : ""}{formatDate(a.submitted_at)}</span>
            </Link>
          )}
        />
      )}
    </SectionCard>
  )
}

function Directory({ refreshTick }: { refreshTick: number }) {
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  const { data, error, loading, refreshing, reload } = useApi<{ items: GeraiItem[] }>(`/gerai?q=${encodeURIComponent(debouncedQ)}`, { keepPrevious: true })
  useEffect(() => { if (refreshTick > 0) reload() }, [refreshTick, reload])
  return (
    <SectionCard
      title="Semua gerai"
      action={
        <div className="relative w-full sm:w-64">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Cari gerai" placeholder="Cari nama atau slug gerai…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      }
      flush
    >
      {loading ? (
        <div className="p-4 md:p-5"><LoadingState /></div>
      ) : error ? (
        <div className="p-4 md:p-5"><ErrorState message={error} onRetry={reload} /></div>
      ) : (
        <div className={refreshing ? "opacity-60 transition-opacity" : ""}>
          <DataTableShell
            bare
            caption="Semua gerai"
            rows={data?.items ?? []}
            rowKey={(g) => g.id}
            empty={<EmptyState title={debouncedQ ? "Tidak ada gerai yang cocok" : "Belum ada gerai aktif"} body={debouncedQ ? "Ubah kata kunci pencarian." : "Gerai yang disetujui akan tampil di sini."} />}
            columns={[
              {
                key: "gerai",
                header: "Gerai",
                cell: (g) => (
                  <div className="flex min-w-0 flex-col">
                    <Link to="/gerai/$slug" params={{ slug: g.slug }} className="font-medium text-primary underline-offset-4 hover:underline">
                      {g.name}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">{g.slug}.geraimitra.com</span>
                  </div>
                ),
              },
              { key: "status", header: "Status", cell: (g) => (g.status === "suspended" ? <StatusBadge tone="danger">Dibekukan</StatusBadge> : <StatusBadge tone="safe">Aktif</StatusBadge>) },
              {
                key: "mengantar",
                header: "Mengantar",
                cell: (g) => {
                  const ob = ONBOARDING_LABEL[g.onboarding_state ?? "not_connected"] ?? ONBOARDING_LABEL.not_connected!
                  return <StatusBadge tone={ob.tone}>{ob.label}</StatusBadge>
                },
              },
              { key: "masking", header: "Masking", cell: (g) => (g.masking_enabled ? "Aktif" : "Nonaktif") },
            ]}
            mobile={(g) => {
              const ob = ONBOARDING_LABEL[g.onboarding_state ?? "not_connected"] ?? ONBOARDING_LABEL.not_connected!
              return (
                <div className="flex flex-col gap-2">
                  <div>
                    <Link to="/gerai/$slug" params={{ slug: g.slug }} className="font-medium text-primary">{g.name}</Link>
                    <div className="font-mono text-xs text-muted-foreground">{g.slug}.geraimitra.com</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.status === "suspended" ? <StatusBadge tone="danger">Dibekukan</StatusBadge> : <StatusBadge tone="safe">Aktif</StatusBadge>}
                    <StatusBadge tone={ob.tone}>{ob.label}</StatusBadge>
                    <StatusBadge tone="muted">Masking: {g.masking_enabled ? "Aktif" : "Nonaktif"}</StatusBadge>
                  </div>
                </div>
              )
            }}
          />
        </div>
      )}
    </SectionCard>
  )
}

interface DomainItem { hostname: string; role: string; state: string; cf_status: string | null; cf_ssl_status: string | null; created_at: number; last_checked_at: number | null; probe_ok_at: number | null; probe_failures: number; slug: string; name: string }
const DOMAIN_STATE: Record<string, { label: string; tone: "safe" | "warn" | "danger" }> = { pending: { label: "Menunggu DNS", tone: "warn" }, active: { label: "Aktif", tone: "safe" }, failed: { label: "Gagal", tone: "danger" }, moved: { label: "DNS berubah", tone: "danger" }, suspended: { label: "Dibekukan", tone: "danger" } }

// `Gerai › Domain Mitra` (spec 11 §7): every custom hostname, Cloudflare status, last probe, `Hapus` (TOTP + reason).
function Domains({ refreshTick }: { refreshTick: number }) {
  const { data, error, loading, reload } = useApi<{ items: DomainItem[]; quota: { used: number; allocated: number; checked_at: number } | null }>("/domains")
  useEffect(() => { if (refreshTick > 0) reload() }, [refreshTick, reload])
  const quota = data?.quota ? `Kuota Cloudflare ${data.quota.used}/${data.quota.allocated} · dicek ${formatDate(data.quota.checked_at)}` : "Kuota belum dicek"
  const done = (d: unknown) => `Pemeriksaan selesai: ${(d as { checked?: number }).checked ?? 0} domain diperiksa.`
  return (
    <SectionCard
      title="Domain Mitra"
      description={quota}
      action={<RecheckButton size="sm" label="Periksa Semua Domain" path="/domains/periksa" onDone={reload} done={done} />}
      flush
    >
      {loading ? (
        <div className="p-4 md:p-5"><LoadingState /></div>
      ) : error ? (
        <div className="p-4 md:p-5"><ErrorState message={error} onRetry={reload} /></div>
      ) : (
        <DataTableShell
          bare
          caption="Domain Mitra"
          rows={data?.items ?? []}
          rowKey={(d) => d.hostname}
          empty={<EmptyState title="Belum ada domain sendiri" body="Setiap gerai aktif memakai alamat <slug>.geraimitra.com. Domain sendiri gerai Pro tampil di sini." />}
          columns={[
            {
              key: "host",
              header: "Domain",
              cell: (d) => (
                <div>
                  <span className="font-mono break-all">{d.hostname}</span>
                  {d.role === "redirect" ? <div className="text-xs text-muted-foreground">www → domain utama</div> : null}
                </div>
              ),
            },
            {
              key: "gerai",
              header: "Gerai",
              cell: (d) => <Link to="/gerai/$slug" params={{ slug: d.slug }} className="text-primary underline-offset-4 hover:underline">{d.name}</Link>,
            },
            {
              key: "status",
              header: "Status",
              cell: (d) => {
                const st = DOMAIN_STATE[d.state] ?? { label: d.state, tone: "warn" as const }
                return <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
              },
            },
            {
              key: "cf",
              header: "Cloudflare / SSL",
              wide: true,
              cell: (d) => <span className="text-muted-foreground">{d.cf_status ?? "—"} / {d.cf_ssl_status ?? "—"}</span>,
            },
            {
              key: "probe",
              header: "Probe terakhir",
              wide: true,
              cell: (d) => <span className="text-muted-foreground tabular-nums">{formatDate(d.probe_ok_at)}{d.probe_failures ? ` · gagal ${d.probe_failures}×` : ""}</span>,
            },
            {
              key: "act",
              header: <span className="sr-only">Aksi</span>,
              align: "right",
              cell: (d) => (
                <span className="inline-flex gap-2">
                  <RecheckButton size="sm" variant="ghost" label="Periksa Ulang" path="/domains/periksa" body={{ hostname: d.hostname }} onDone={reload} done={done} />
                  <ReasonAction label="Hapus" confirmLabel="Hapus domain" variant="destructive" path={`/domains/${encodeURIComponent(d.hostname)}/delete`} onDone={reload} hint="Menghapus custom hostname di Cloudflare (berhenti ditagih). Mini-site gerai kembali ke alamat bawaan." />
                </span>
              ),
            },
          ]}
          mobile={(d) => {
            const st = DOMAIN_STATE[d.state] ?? { label: d.state, tone: "warn" as const }
            return (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono break-all">{d.hostname}</span><StatusBadge tone={st.tone}>{st.label}</StatusBadge></div>
                <p className="text-xs text-muted-foreground"><Link to="/gerai/$slug" params={{ slug: d.slug }} className="text-primary">{d.name}</Link> · Cloudflare {d.cf_status ?? "—"} / SSL {d.cf_ssl_status ?? "—"}</p>
                <div className="flex flex-wrap gap-2">
                  <RecheckButton size="sm" label="Periksa Ulang" path="/domains/periksa" body={{ hostname: d.hostname }} onDone={reload} done={done} />
                  <ReasonAction label="Hapus" confirmLabel="Hapus domain" variant="destructive" path={`/domains/${encodeURIComponent(d.hostname)}/delete`} onDone={reload} hint="Menghapus custom hostname di Cloudflare (berhenti ditagih). Mini-site gerai kembali ke alamat bawaan." />
                </div>
              </div>
            )
          }}
        />
      )}
    </SectionCard>
  )
}
