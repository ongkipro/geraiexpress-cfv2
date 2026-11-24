import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { toast } from "@shared/components/ui/sonner"
import { Button } from "@shared/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@shared/components/ui/tabs"
import { EmptyBlock, ErrorBlock, formatDate, LoadingBlock, PageHead, RecheckButton, Section, StatusChip } from "../../components/page"
import { DataTableShell } from "@shared/components/admin/data-table"
import { api, ApiError } from "../../lib/api"
import { useApi } from "../../lib/use-api"
import { Textarea } from "@shared/components/ui/textarea"
import { AnchorButton } from "@shared/components/admin/link-button"

// Super Admin `Tarif & Kurir` (TASK-207, visual 07 §3.3): per-gerai discount/cashback matrix with verification
// status, the request list for the Mengantar team, and the discount policy (platform + per courier).
type Tab = "gerai" | "permintaan" | "kebijakan"
type VState = "belum_diterapkan" | "sesuai" | "selisih"

export const STATE_LABEL: Record<VState, { label: string; tone: "warn" | "safe" | "danger" }> = {
  belum_diterapkan: { label: "Belum diterapkan", tone: "warn" },
  sesuai: { label: "Sesuai", tone: "safe" },
  selisih: { label: "Selisih", tone: "danger" },
}
export const verifyDone = (d: unknown) => {
  const r = d as { tenants: number; observed: number }
  return `Verifikasi selesai: ${r.tenants} gerai, ${r.observed} layanan teramati.`
}
export const pct = (bps: number | null | undefined) => (typeof bps === "number" ? `${(bps / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%` : "—")

export function TarifPage() {
  const { tab } = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const current: Tab = tab ?? "gerai"
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHead title="Tarif & Kurir" description="Diskon dan cashback per gerai, permintaan ke tim Mengantar, dan batas diskon." />
      <Tabs value={current} onValueChange={(v) => navigate({ to: "/tarif", search: { tab: v === "gerai" ? undefined : (v as "permintaan" | "kebijakan") } })} className="min-w-0">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList aria-label="Bagian tarif" className="w-max max-w-none">
            <TabsTrigger value="gerai">Diskon & Cashback</TabsTrigger>
            <TabsTrigger value="permintaan">Permintaan</TabsTrigger>
            <TabsTrigger value="kebijakan">Kebijakan Diskon</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {current === "gerai" ? <GeraiList /> : current === "permintaan" ? <RequestList /> : <Policy />}
    </div>
  )
}

interface GeraiSummary { id: string; name: string; slug: string; sesuai: number; belum: number; selisih: number; total: number }

function GeraiList() {
  const { data, error, loading, reload } = useApi<{ items: GeraiSummary[] }>("/tarif/gerai")
  return (
    <Section title="Gerai" aside={<RecheckButton size="sm" label="Verifikasi Ulang Diskon" busyLabel="Memverifikasi…" path="/tarif/verifikasi-ulang" onDone={reload} done={verifyDone} />}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyBlock title="Belum ada gerai aktif" body="Aturan diskon dibuat otomatis saat gerai disetujui." />
      ) : (
        <DataTableShell
          caption="Status diskon per gerai"
          rows={data.items}
          rowKey={(g) => g.id}
          columns={[
            { key: "gerai", header: "Gerai", cell: (g) => <Link to="/tarif/$tenantId" params={{ tenantId: g.id }} className="font-medium text-primary underline-offset-4 hover:underline">{g.name}</Link> },
            { key: "sesuai", header: "Sesuai", align: "right", cell: (g) => g.sesuai },
            { key: "belum", header: "Belum diterapkan", align: "right", cell: (g) => (g.belum ? <span className="text-warn">{g.belum}</span> : 0) },
            { key: "selisih", header: "Selisih", align: "right", cell: (g) => (g.selisih ? <StatusChip tone="danger">{g.selisih} selisih</StatusChip> : 0) },
            { key: "total", header: "Total layanan", align: "right", cell: (g) => g.total, wide: true },
          ]}
          mobile={(g) => (
            <div className="flex flex-col gap-2">
              <Link to="/tarif/$tenantId" params={{ tenantId: g.id }} className="font-medium text-primary">{g.name}</Link>
              <span className="flex flex-wrap gap-2 tabular-nums">
                <StatusChip tone="safe">{g.sesuai} sesuai</StatusChip>
                <StatusChip tone="warn">{g.belum} belum diterapkan</StatusChip>
                {g.selisih > 0 ? <StatusChip tone="danger">{g.selisih} selisih</StatusChip> : null}
              </span>
            </div>
          )}
        />
      )}
    </Section>
  )
}

interface RequestRow { tenant_id: string; tenant_name: string; slug: string; service_code: string; display_name: string; assigned_bps: number; observed_bps: number | null; verification_state: VState; requested_at: number; request_sent_at: number | null }

function RequestList() {
  const { data, error, loading, reload } = useApi<{ items: RequestRow[] }>("/tarif/permintaan")
  const [reason, setReason] = useState("")
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  const open = data?.items.filter((r) => !r.request_sent_at) ?? []
  async function mark(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setMsg(null)
    try {
      const r = await api<{ marked: number }>("/tarif/permintaan/tandai", { body: { keys: open.map((x) => ({ tenantId: x.tenant_id, serviceCode: x.service_code })), reason } })
      setMsg({ tone: "safe", text: `${r.marked} aturan ditandai sudah diminta.` })
      setReason("")
      reload()
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") return window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent("/tarif?tab=permintaan")}`)
      setMsg({ tone: "danger", text: err instanceof ApiError ? err.body.message : "Gagal menandai." })
    } finally {
      setPending(false)
    }
  }
  return (
    <Section title="Belum diterapkan di Mengantar" aside={<span className="flex flex-wrap gap-2"><RecheckButton label="Verifikasi Ulang Diskon" busyLabel="Memverifikasi…" path="/tarif/verifikasi-ulang" onDone={reload} done={verifyDone} /><AnchorButton variant="outline" href="/api/owner/tarif/permintaan.csv">Unduh CSV</AnchorButton></span>}>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyBlock title="Semua diskon sudah sesuai" body="Tidak ada permintaan yang menunggu tim Mengantar." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200/85">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gerai</TableHead>
                  <TableHead>Layanan</TableHead>
                  <TableHead className="text-right">Diminta</TableHead>
                  <TableHead className="text-right">Teramati</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dikirim ke Mengantar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((r) => (
                  <TableRow key={`${r.tenant_id}:${r.service_code}`}>
                    <TableCell>{r.tenant_name}</TableCell>
                    <TableCell>{r.display_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.assigned_bps)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.observed_bps)}</TableCell>
                    <TableCell><StatusChip tone={STATE_LABEL[r.verification_state].tone}>{STATE_LABEL[r.verification_state].label}</StatusChip></TableCell>
                    <TableCell className="tabular-nums">{r.request_sent_at ? formatDate(r.request_sent_at) : "Belum"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {open.length ? (
            <form onSubmit={mark} className="flex flex-col gap-3 border-t pt-4" noValidate>
              <Field>
                <FieldLabel htmlFor="alasan-minta">Alasan (wajib, dicatat di log audit)</FieldLabel>
                <Textarea id="alasan-minta" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
                <FieldDescription>Tandai {open.length} aturan sebagai sudah dikirim ke tim Mengantar.</FieldDescription>
              </Field>
              <div>
                <Button type="submit" className="h-auto min-h-11 py-2 text-center whitespace-normal md:h-9 md:py-0" disabled={pending || reason.trim().length < 5}>{pending ? "Memproses…" : "Tandai sudah diminta ke Mengantar"}</Button>
              </div>
            </form>
          ) : null}
          {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={`border-l-4 py-1 pl-3 text-sm font-medium ${msg.tone === "danger" ? "border-danger text-danger" : "border-safe text-safe"}`}>{msg.text}</p> : null}
        </div>
      )}
    </Section>
  )
}

interface Band { defaultBps: number; minBps: number; maxBps: number }
interface PolicyData { platform: Band & { applySlaMinutes: number }; couriers: Array<{ courierCode: string; name: string; band: Band | null }> }

function Policy() {
  const { data, error, loading, reload } = useApi<PolicyData>("/tarif/kebijakan")
  if (loading) return <LoadingBlock />
  if (error || !data) return <ErrorBlock message={error ?? "Gagal memuat."} onRetry={reload} />
  return (
    <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
      <Section title="Batas platform">
        <BandForm initial={data.platform} sla={data.platform.applySlaMinutes} path="/tarif/kebijakan/platform" onDone={reload} />
      </Section>
      <Section title="Per ekspedisi">
        <ul className="divide-y">
          {data.couriers.map((c) => (
            <li key={c.courierCode} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{c.band ? `${pct(c.band.minBps)} – ${pct(c.band.maxBps)} · default ${pct(c.band.defaultBps)}` : "Ikut batas platform"}</span>
              </div>
              <details>
                <summary className="flex h-11 cursor-pointer items-center text-sm text-primary md:h-10">Ubah batas {c.name}</summary>
                <BandForm initial={c.band ?? data.platform} path={`/tarif/kebijakan/kurir/${encodeURIComponent(c.courierCode)}`} onDone={reload} />
              </details>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function BandForm({ initial, sla, path, onDone }: { initial: Band; sla?: number; path: string; onDone: () => void }) {
  const [v, setV] = useState({ min: String(initial.minBps / 100), def: String(initial.defaultBps / 100), max: String(initial.maxBps / 100), sla: sla === undefined ? "" : String(sla) })
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const toBps = (s: string) => {
    const clean = s.trim().replace(",", ".")
    return clean === "" ? NaN : Math.round(Number(clean) * 100)
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const minBps = toBps(v.min)
    const defaultBps = toBps(v.def)
    const maxBps = toBps(v.max)
    const slaNum = sla === undefined ? undefined : v.sla.trim() === "" ? NaN : Number(v.sla.trim())
    if (!Number.isFinite(minBps) || !Number.isFinite(defaultBps) || !Number.isFinite(maxBps) || (slaNum !== undefined && !Number.isFinite(slaNum))) {
      setError("Masukkan angka persentase yang valid.")
      return
    }
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      await api(path, { body: { band: { minBps, defaultBps, maxBps }, ...(slaNum === undefined ? {} : { applySlaMinutes: slaNum }), reason } })
      setReason("")
      setSaved(true)
      toast.success("Batas kebijakan tersimpan.")
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") return window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent("/tarif?tab=kebijakan")}`)
      setError(err instanceof ApiError ? err.body.message : "Gagal menyimpan.")
    } finally {
      setPending(false)
    }
  }
  const num = (label: string, key: "min" | "def" | "max" | "sla", suffix: string) => (
    <Field>
      <FieldLabel htmlFor={`${path}-${key}`}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input id={`${path}-${key}`} inputMode="decimal" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} className="tabular-nums" />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
    </Field>
  )
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        {num("Minimum", "min", "%")}
        {num("Default", "def", "%")}
        {num("Maksimum", "max", "%")}
      </div>
      {sla !== undefined ? num("Waktu penerapan Mengantar", "sla", "menit") : null}
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`${path}-reason`}>Alasan (wajib, dicatat di log audit)</FieldLabel>
        <Textarea id={`${path}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
        {error ? <FieldError>{error}</FieldError> : <FieldDescription>Perubahan batas tidak mengubah aturan gerai yang sudah ada.</FieldDescription>}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Menyimpan…" : "Simpan Perubahan"}</Button>
        {saved ? <span role="status" className="text-sm font-medium text-safe">Batas kebijakan tersimpan.</span> : null}
      </div>
    </form>
  )
}
