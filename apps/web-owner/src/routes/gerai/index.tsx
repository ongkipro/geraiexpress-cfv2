import { useEffect, useState } from "react"
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { Input } from "@shared/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs"
import { EmptyBlock, ErrorBlock, formatDate, LoadingBlock, ONBOARDING_LABEL, PageHead, RecheckButton, ReloadButton, Section, StatusChip } from "../../components/page"
import { MetricCard, MetricGrid } from "@shared/components/admin/page"
import { DataTableShell } from "@shared/components/admin/data-table"
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
      <PageHead title="Gerai" description="Pengajuan, direktori, dan domain mitra seluruh gerai.">
        <ReloadButton onClick={() => { summary.reload(); setRefreshTick((t) => t + 1); void router.invalidate() }} />
      </PageHead>
      {/* DEC-244: platform-wide summary strip from /gerai/summary. */}
      {summary.error && !s ? <ErrorBlock message={summary.error} onRetry={summary.reload} /> : null}
      <MetricGrid>
        <MetricCard label="Pengajuan baru" value={s ? nf.format(s.pending) : "—"} footer="Menunggu ditinjau" tone={s?.pending ? "warn" : undefined} to="/gerai" />
        <MetricCard label="Gerai aktif" value={s ? nf.format(s.active) : "—"} footer="Mini-site dan ruang kerja aktif" to="/gerai?tab=direktori" />
        <MetricCard label="Onboarding tertunda" value={s ? nf.format(s.onboarding) : "—"} footer="Pendaftaran seller belum pasti" tone={s?.onboarding ? "warn" : undefined} />
        <MetricCard label="Gerai dibekukan" value={s ? nf.format(s.suspended) : "—"} footer="Mini-site menjawab 403" />
      </MetricGrid>
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
    <Section title="Menunggu ditinjau">
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyBlock title="Tidak ada pengajuan baru" body="Pengajuan gerai yang masuk akan tampil di sini." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200/85 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gerai</TableHead>
                  <TableHead>Alamat gerai</TableHead>
                  <TableHead>Wilayah titik jemput</TableHead>
                  <TableHead>Diajukan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link to="/gerai/pengajuan/$id" params={{ id: a.id }} className="font-medium text-primary underline-offset-4 hover:underline">
                        {a.business_name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">{a.slug}</TableCell>
                    <TableCell>{a.area ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(a.submitted_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col divide-y md:hidden">
            {data.items.map((a) => (
              <li key={a.id} className="py-3">
                <Link to="/gerai/pengajuan/$id" params={{ id: a.id }} className="flex min-h-11 flex-col justify-center">
                  <span className="font-medium text-primary">{a.business_name}</span>
                  <span className="text-sm text-muted-foreground">{a.slug} · {formatDate(a.submitted_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
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
    <Section title="Semua gerai" aside={<Input aria-label="Cari gerai" placeholder="Cari nama atau alamat gerai" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyBlock title={debouncedQ ? "Tidak ada gerai yang cocok" : "Belum ada gerai aktif"} body={debouncedQ ? "Ubah kata kunci pencarian." : "Gerai yang disetujui akan tampil di sini."} />
      ) : (
        <div className={refreshing ? "opacity-60 transition-opacity" : ""}>
          <DataTableShell
            caption="Semua gerai"
            rows={data.items}
            rowKey={(g) => g.id}
            columns={[
              {
                key: "gerai",
                header: "Gerai",
                cell: (g) => (
                  <>
                    <Link to="/gerai/$slug" params={{ slug: g.slug }} className="font-medium text-primary underline-offset-4 hover:underline">
                      {g.name}
                    </Link>
                    <div className="text-sm text-muted-foreground">{g.slug}</div>
                  </>
                ),
              },
              { key: "status", header: "Status", cell: (g) => (g.status === "suspended" ? <StatusChip tone="danger">Dibekukan</StatusChip> : <StatusChip tone="safe">Aktif</StatusChip>) },
              {
                key: "mengantar",
                header: "Mengantar",
                cell: (g) => {
                  const ob = ONBOARDING_LABEL[g.onboarding_state ?? "not_connected"] ?? ONBOARDING_LABEL.not_connected!
                  return <StatusChip tone={ob.tone}>{ob.label}</StatusChip>
                },
              },
              { key: "masking", header: "Masking", cell: (g) => (g.masking_enabled ? "Aktif" : "Nonaktif") },
            ]}
            mobile={(g) => {
              const ob = ONBOARDING_LABEL[g.onboarding_state ?? "not_connected"] ?? ONBOARDING_LABEL.not_connected!
              return (
                <div className="flex flex-col gap-2">
                  <Link to="/gerai/$slug" params={{ slug: g.slug }} className="font-medium text-primary">{g.name}</Link>
                  <span className="font-mono text-xs text-muted-foreground">{g.slug}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {g.status === "suspended" ? <StatusChip tone="danger">Dibekukan</StatusChip> : <StatusChip tone="safe">Aktif</StatusChip>}
                    <StatusChip tone={ob.tone}>{ob.label}</StatusChip>
                    <StatusChip tone="muted">Masking: {g.masking_enabled ? "Aktif" : "Nonaktif"}</StatusChip>
                  </span>
                </div>
              )
            }}
          />
        </div>
      )}
    </Section>
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
    <Section title="Domain Mitra" aside={<span className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground tabular-nums">{quota}</span><RecheckButton size="sm" label="Periksa Semua Domain" path="/domains/periksa" onDone={reload} done={done} /></span>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyBlock title="Belum ada domain sendiri" body="Setiap gerai aktif memakai alamat <slug>.geraimitra.com. Domain sendiri gerai Pro tampil di sini." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200/85 md:block">
            <Table>
              <caption className="sr-only">Domain Mitra</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Gerai</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Cloudflare / SSL</TableHead>
                  <TableHead className="hidden lg:table-cell">Probe terakhir</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Aksi</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((d) => {
                  const st = DOMAIN_STATE[d.state] ?? { label: d.state, tone: "warn" as const }
                  return (
                    <TableRow key={d.hostname}>
                      <TableCell className="whitespace-normal"><span className="font-mono break-all">{d.hostname}</span>{d.role === "redirect" ? <div className="text-xs text-muted-foreground">www → domain utama</div> : null}</TableCell>
                      <TableCell><Link to="/gerai/$slug" params={{ slug: d.slug }} className="text-primary underline-offset-4 hover:underline">{d.name}</Link></TableCell>
                      <TableCell><StatusChip tone={st.tone}>{st.label}</StatusChip></TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{d.cf_status ?? "—"} / {d.cf_ssl_status ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">{formatDate(d.probe_ok_at)}{d.probe_failures ? ` · gagal ${d.probe_failures}×` : ""}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex gap-2">
                          <RecheckButton size="sm" variant="ghost" label="Periksa Ulang" path="/domains/periksa" body={{ hostname: d.hostname }} onDone={reload} done={done} />
                          <ReasonAction label="Hapus" confirmLabel="Hapus domain" variant="destructive" path={`/domains/${encodeURIComponent(d.hostname)}/delete`} onDone={reload} hint="Menghapus custom hostname di Cloudflare (berhenti ditagih). Mini-site gerai kembali ke alamat bawaan." />
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col divide-y md:hidden">
            {data.items.map((d) => {
              const st = DOMAIN_STATE[d.state] ?? { label: d.state, tone: "warn" as const }
              return (
                <li key={d.hostname} className="flex flex-col gap-2 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono break-all">{d.hostname}</span><StatusChip tone={st.tone}>{st.label}</StatusChip></div>
                  <p className="text-xs text-muted-foreground"><Link to="/gerai/$slug" params={{ slug: d.slug }} className="text-primary">{d.name}</Link> · Cloudflare {d.cf_status ?? "—"} / SSL {d.cf_ssl_status ?? "—"}</p>
                  <div className="flex flex-wrap gap-2">
                    <RecheckButton size="sm" label="Periksa Ulang" path="/domains/periksa" body={{ hostname: d.hostname }} onDone={reload} done={done} />
                    <ReasonAction label="Hapus" confirmLabel="Hapus domain" variant="destructive" path={`/domains/${encodeURIComponent(d.hostname)}/delete`} onDone={reload} hint="Menghapus custom hostname di Cloudflare (berhenti ditagih). Mini-site gerai kembali ke alamat bawaan." />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Section>
  )
}
