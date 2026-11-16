import { useState, type FormEvent } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { Button } from "@shared/components/ui/button"
import { Field, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { ErrorBlock, formatDate, LoadingBlock, PageHead, Section, StatusChip } from "../../components/page"
import { api, ApiError } from "../../lib/api"
import { useApi } from "../../lib/use-api"
import { pct, STATE_LABEL } from "./index"
import { Textarea } from "@shared/components/ui/textarea"
import { Panel } from "@shared/components/admin/page"

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
  if (loading) return <LoadingBlock />
  if (error || !data) return <ErrorBlock message={error ?? "Gerai tidak ditemukan."} onRetry={reload} />
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Navigasi halaman" className="text-base text-muted-foreground">
        <Link to="/tarif" className="text-primary underline-offset-4 hover:underline">Tarif & Kurir</Link> › {data.tenant.name}
      </nav>
      <PageHead title={data.tenant.name} />
      <Section title="Diskon & cashback per layanan">
        <p className="mb-4 text-base text-muted-foreground">Pelanggan loket selalu membayar tarif publik. Diskon berlaku setelah tim Mengantar menerapkannya (biasanya ≤ {data.applySlaMinutes} menit); status diperiksa otomatis.</p>
        <ul className="divide-y">
          {data.items.map((r) => (
            <li key={r.service_code} className="flex flex-col gap-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-base font-medium">{r.display_name}</span>
                  <span className="text-base text-muted-foreground tabular-nums">
                    Diminta {pct(r.assigned_bps)} · teramati {pct(r.observed_bps)}{r.observed_at ? ` (${formatDate(r.observed_at)})` : ""} · cashback {pct(r.cashback_bps)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip tone={STATE_LABEL[r.verification_state].tone}>{STATE_LABEL[r.verification_state].label}</StatusChip>
                  {editing !== r.service_code ? <Button variant="outline" onClick={() => setEditing(r.service_code)}>Ubah</Button> : null}
                </div>
              </div>
              {editing === r.service_code ? <RuleEditor tenantId={data.tenant.id} rule={r} onDone={() => { setEditing(null); reload() }} onCancel={() => setEditing(null)} /> : null}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function RuleEditor({ tenantId, rule, onDone, onCancel }: { tenantId: string; rule: Rule; onDone: () => void; onCancel: () => void }) {
  const [assigned, setAssigned] = useState(String(rule.assigned_bps / 100))
  const [cashback, setCashback] = useState(String(rule.cashback_bps / 100))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const toBps = (s: string) => Math.round(Number(s.replace(",", ".")) * 100)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api(`/tarif/gerai/${encodeURIComponent(tenantId)}/${encodeURIComponent(rule.service_code)}`, { body: { assignedBps: toBps(assigned), cashbackBps: toBps(cashback), reason } })
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
          <FieldLabel htmlFor={`d-${rule.service_code}`}>Diskon gerai ({pct(rule.band.minBps)}–{pct(rule.band.maxBps)})</FieldLabel>
          <div className="flex items-center gap-2"><Input id={`d-${rule.service_code}`} inputMode="decimal" value={assigned} onChange={(e) => setAssigned(e.target.value)} className="tabular-nums" /><span className="text-base text-muted-foreground">%</span></div>
        </Field>
        <Field>
          <FieldLabel htmlFor={`c-${rule.service_code}`}>Cashback</FieldLabel>
          <div className="flex items-center gap-2"><Input id={`c-${rule.service_code}`} inputMode="decimal" value={cashback} onChange={(e) => setCashback(e.target.value)} className="tabular-nums" /><span className="text-base text-muted-foreground">%</span></div>
        </Field>
      </div>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`r-${rule.service_code}`}>Alasan (wajib, dicatat di log audit)</FieldLabel>
        <Textarea id={`r-${rule.service_code}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Menyimpan…" : "Simpan Perubahan"}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Batal</Button>
      </div>
    </Panel>
  )
}
