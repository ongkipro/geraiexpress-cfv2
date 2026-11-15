import { useState } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { Input } from "@shared/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs"
import { EmptyBlock, ErrorBlock, formatDate, LoadingBlock, ONBOARDING_LABEL, PageHead, Section, StatusChip } from "../../components/page"
import { useApi } from "../../lib/use-api"

type Tab = "pengajuan" | "direktori" | "domain"

interface AppItem { id: string; business_name: string; slug: string; area: string | null; submitted_at: number; state: string }
interface GeraiItem { id: string; slug: string; name: string; status: string; onboarding_state: string | null; masking_enabled: number; approved_at: number | null }

export function GeraiPage() {
  const { tab } = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const current: Tab = tab ?? "pengajuan"
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Gerai" />
      <Tabs value={current} onValueChange={(v) => navigate({ to: "/gerai", search: { tab: v as Tab } })}>
        <TabsList aria-label="Bagian gerai">
          <TabsTrigger value="pengajuan">Pengajuan Baru</TabsTrigger>
          <TabsTrigger value="direktori">Direktori Gerai</TabsTrigger>
          <TabsTrigger value="domain">Domain Mitra</TabsTrigger>
        </TabsList>
      </Tabs>
      {current === "pengajuan" ? <Applications /> : current === "direktori" ? <Directory /> : <Domains />}
    </div>
  )
}

function Applications() {
  const { data, error, loading, reload } = useApi<{ items: AppItem[] }>("/gerai/applications")
  return (
    <Section title="Menunggu ditinjau">
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyBlock title="Tidak ada pengajuan baru" body="Pengajuan gerai yang masuk akan tampil di sini." />
      ) : (
        <>
          <div className="hidden md:block">
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
                  <span className="text-base text-muted-foreground">{a.slug} · {formatDate(a.submitted_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

function Directory() {
  const [q, setQ] = useState("")
  const { data, error, loading, reload } = useApi<{ items: GeraiItem[] }>(`/gerai?q=${encodeURIComponent(q)}`)
  return (
    <Section title="Semua gerai" aside={<Input aria-label="Cari gerai" placeholder="Cari nama atau alamat gerai" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyBlock title={q ? "Tidak ada gerai yang cocok" : "Belum ada gerai aktif"} body={q ? "Ubah kata kunci pencarian." : "Gerai yang disetujui akan tampil di sini."} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gerai</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mengantar</TableHead>
                <TableHead>Masking</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((g) => {
                const ob = ONBOARDING_LABEL[g.onboarding_state ?? "not_connected"] ?? ONBOARDING_LABEL.not_connected!
                return (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link to="/gerai/$slug" params={{ slug: g.slug }} className="font-medium text-primary underline-offset-4 hover:underline">
                        {g.name}
                      </Link>
                      <div className="text-sm text-muted-foreground">{g.slug}</div>
                    </TableCell>
                    <TableCell>{g.status === "suspended" ? <StatusChip tone="danger">Dibekukan</StatusChip> : <StatusChip tone="safe">Aktif</StatusChip>}</TableCell>
                    <TableCell><StatusChip tone={ob.tone}>{ob.label}</StatusChip></TableCell>
                    <TableCell>{g.masking_enabled ? "Aktif" : "Nonaktif"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  )
}

function Domains() {
  return (
    <Section title="Domain Mitra">
      <EmptyBlock title="Belum ada domain sendiri" body="Setiap gerai aktif memakai alamat <slug>.gerai.cc. Domain sendiri (Pro) tampil di sini setelah fitur Domain Sendiri aktif." />
    </Section>
  )
}
