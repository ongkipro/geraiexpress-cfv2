import { Fragment, useId, useState, type FormEvent } from "react"
import { useParams } from "@tanstack/react-router"
import { Button } from "@shared/components/ui/button"
import { Field, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { ErrorBlock, formatDate, LoadingBlock, PageHead, RecheckButton, StatusChip } from "../../components/page"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui/table"
import { api, ApiError } from "../../lib/api"
import { useApi } from "../../lib/use-api"
import { pct, STATE_LABEL, verifyDone } from "./index"
import { Textarea } from "@shared/components/ui/textarea"
import { Panel, SectionCard } from "@shared/components/admin/page"

// One gerai's matrix: requested vs observed discount per service, status, and an editor (TOTP + reason).
interface Rule {
  service_code: string
  display_name: string
  courier_name: string
  service_class: "regular" | "cargo"
  assigned_bps: number
  cashback_bps: number
  observed_bps: number | null
  observed_at: number | null
  verification_state: "belum_diterapkan" | "sesuai" | "selisih"
  requested_at: number
  band: { minBps: number; maxBps: number; defaultBps: number }
}
interface Data { tenant: { id: string; name: string; slug: string }; applySlaMinutes: number; items: Rule[] }

export function TarifGeraiPage() {
  const { tenantId } = useParams({ strict: false }) as { tenantId: string }
  const { data, error, loading, reload } = useApi<Data>(`/tarif/gerai/${encodeURIComponent(tenantId)}`)
  const [editing, setEditing] = useState<string | null>(null)
  if (loading) return <div className="flex flex-col gap-4"><PageHead title="Tarif Gerai" /><LoadingBlock /></div>
  if (error || !data) return <div className="flex flex-col gap-4"><PageHead title="Tarif Gerai" /><ErrorBlock message={error ?? "Gerai tidak ditemukan."} onRetry={reload} /></div>
  const counts = { sesuai: data.items.filter((r) => r.verification_state === "sesuai").length, belum: data.items.filter((r) => r.verification_state === "belum_diterapkan").length, selisih: data.items.filter((r) => r.verification_state === "selisih").length }
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHead title={data.tenant.name} description={`${data.tenant.slug}.geraimitra.com · diskon berlaku ≤ ${data.applySlaMinutes} menit setelah diterapkan tim Mengantar`}>
        <RecheckButton label="Verifikasi Ulang Diskon" busyLabel="Memverifikasi…" path="/tarif/verifikasi-ulang" body={{ tenantId: data.tenant.id }} onDone={reload} done={verifyDone} />
      </PageHead>
      <SectionCard
        title="Diskon & cashback per layanan"
        description="Pelanggan loket selalu membayar tarif publik; status diperiksa otomatis tiap 5 menit."
        action={<span className="flex flex-wrap gap-1.5 tabular-nums"><StatusChip tone="safe">{counts.sesuai} sesuai</StatusChip>{counts.belum ? <StatusChip tone="warn">{counts.belum} belum</StatusChip> : null}{counts.selisih ? <StatusChip tone="danger">{counts.selisih} selisih</StatusChip> : null}</span>}
        flush
      >
        <div className="hidden md:block">
          <Table>
            <caption className="sr-only">Diskon per layanan {data.tenant.name}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Layanan</TableHead>
                <TableHead className="text-right">Diminta</TableHead>
                <TableHead className="text-right">Teramati</TableHead>
                <TableHead className="text-right">Cashback</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Diperiksa</TableHead>
                <TableHead className="pr-5 text-right"><span className="sr-only">Aksi</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((r) => (
                <Fragment key={r.service_code}>
                  <TableRow className="hover:bg-slate-50/80">
                    <TableCell className="pl-5 font-medium">{r.display_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.assigned_bps)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.observed_bps)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.cashback_bps)}</TableCell>
                    <TableCell><StatusChip tone={STATE_LABEL[r.verification_state].tone}>{STATE_LABEL[r.verification_state].label}</StatusChip></TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">{formatDate(r.observed_at)}</TableCell>
                    <TableCell className="pr-5 text-right">{editing !== r.service_code ? <Button variant="outline" size="sm" onClick={() => setEditing(r.service_code)}>Ubah</Button> : null}</TableCell>
                  </TableRow>
                  {editing === r.service_code ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="px-5 py-3 whitespace-normal">
                        <RuleEditor tenantId={data.tenant.id} rule={r} onDone={() => { setEditing(null); reload() }} onCancel={() => setEditing(null)} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="flex flex-col divide-y divide-slate-100 md:hidden">
          {data.items.map((r) => (
            <li key={r.service_code} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{r.display_name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">Diminta {pct(r.assigned_bps)} · teramati {pct(r.observed_bps)} · cashback {pct(r.cashback_bps)}</span>
                </span>
                <StatusChip tone={STATE_LABEL[r.verification_state].tone}>{STATE_LABEL[r.verification_state].label}</StatusChip>
              </div>
              {editing === r.service_code ? <RuleEditor tenantId={data.tenant.id} rule={r} onDone={() => { setEditing(null); reload() }} onCancel={() => setEditing(null)} /> : <div><Button variant="outline" size="sm" onClick={() => setEditing(r.service_code)}>Ubah</Button></div>}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

function RuleEditor({ tenantId, rule, onDone, onCancel }: { tenantId: string; rule: Rule; onDone: () => void; onCancel: () => void }) {
  // Unique per instance: the desktop table and the phone list each mount an editor (Sol R1 DEC-244 #2).
  const uid = useId()
  const [assigned, setAssigned] = useState(String(rule.assigned_bps / 100))
  const [cashback, setCashback] = useState(String(rule.cashback_bps / 100))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const toBps = (s: string) => {
    const clean = s.trim().replace(",", ".")
    return clean === "" ? NaN : Math.round(Number(clean) * 100)
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    const assignedBps = toBps(assigned)
    const cashbackBps = toBps(cashback)
    if (!Number.isFinite(assignedBps) || !Number.isFinite(cashbackBps)) {
      setError("Masukkan angka persentase yang valid.")
      return
    }
    setPending(true)
    setError(null)
    try {
      await api(`/tarif/gerai/${encodeURIComponent(tenantId)}/${encodeURIComponent(rule.service_code)}`, { body: { assignedBps, cashbackBps, reason } })
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "TOTP_RECENT_REQUIRED") return window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent(window.location.pathname)}`)
      setError(err instanceof ApiError ? err.body.message : "Gagal menyimpan.")
    } finally {
      setPending(false)
    }
  }
  return (
    <Panel as="form" onSubmit={submit} className="flex flex-col gap-3 md:p-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`d-${uid}`}>Diskon gerai ({pct(rule.band.minBps)}–{pct(rule.band.maxBps)})</FieldLabel>
          <div className="flex items-center gap-2"><Input id={`d-${uid}`} inputMode="decimal" value={assigned} onChange={(e) => setAssigned(e.target.value)} className="tabular-nums" /><span className="text-sm text-muted-foreground">%</span></div>
        </Field>
        <Field>
          <FieldLabel htmlFor={`c-${uid}`}>Cashback</FieldLabel>
          <div className="flex items-center gap-2"><Input id={`c-${uid}`} inputMode="decimal" value={cashback} onChange={(e) => setCashback(e.target.value)} className="tabular-nums" /><span className="text-sm text-muted-foreground">%</span></div>
        </Field>
      </div>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`r-${uid}`}>Alasan (wajib, dicatat di log audit)</FieldLabel>
        <Textarea id={`r-${uid}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Menyimpan…" : "Simpan Perubahan"}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Batal</Button>
      </div>
    </Panel>
  )
}
