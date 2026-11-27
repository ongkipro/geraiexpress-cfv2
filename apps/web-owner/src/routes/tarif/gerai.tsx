import { useMemo, useState, type FormEvent } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "@shared/components/ui/sonner"
import { CourierLogo } from "@shared/components/admin/courier-logo"
import { DataTableShell, type Column } from "@shared/components/admin/data-table"
import { ErrorState, LoadingState, MetricCard, MetricGrid, PageHeader, SectionCard, StatusBadge } from "@shared/components/admin/page"
import { Button } from "@shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@shared/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@shared/components/ui/field"
import { Input } from "@shared/components/ui/input"
import { Textarea } from "@shared/components/ui/textarea"
import { RecheckButton } from "../../components/page"
import { ReasonAction } from "../../components/reason-dialog"
import { api, ApiError } from "../../lib/api"
import { useApi } from "../../lib/use-api"

interface PartnerSchedule {
  masterDiscountBps: number
  extraPromoBps: number
  extraPromoNote: string | null
  platformMarginBps: number
  targetGeraiBps: number
}

interface RuleItem {
  service_code: string
  courier_code: string
  display_name: string
  service_class: "regular" | "cargo"
  assigned_bps: number
  cashback_bps: number
  verification_state: "belum_diterapkan" | "sesuai" | "selisih"
  observed_bps: number | null
  band: { defaultBps: number; minBps: number; maxBps: number }
  schedule: PartnerSchedule | null
}

interface Data {
  tenant: { id: string; name: string; slug: string; status: string }
  applySlaMinutes: number
  items: RuleItem[]
}

const bpsText = (b: number | null) => (b === null ? "—" : `${(b / 100).toFixed(b % 100 === 0 ? 0 : 2).replace(".", ",")}%`)
const STATE: Record<RuleItem["verification_state"], { label: string; tone: "safe" | "warn" | "danger" }> = {
  sesuai: { label: "Sesuai", tone: "safe" },
  belum_diterapkan: { label: "Belum diterapkan", tone: "warn" },
  selisih: { label: "Selisih", tone: "danger" },
}

export function TarifGeraiPage() {
  const { tenantId } = useParams({ strict: false }) as { tenantId: string }
  const { data, error, loading, reload } = useApi<Data>(`/tarif/gerai/${encodeURIComponent(tenantId)}`)
  const [editing, setEditing] = useState<RuleItem | null>(null)

  const summary = useMemo(() => {
    const items = data?.items ?? []
    let sesuai = 0
    let belum = 0
    let selisih = 0
    for (const r of items) {
      if (r.verification_state === "sesuai") sesuai++
      else if (r.verification_state === "selisih") selisih++
      else belum++
    }
    return { total: items.length, sesuai, belum, selisih }
  }, [data])

  if (loading) return <div className="flex flex-col gap-4"><PageHeader title="Tarif Gerai" /><LoadingState /></div>
  if (error || !data) return <div className="flex flex-col gap-4"><PageHeader title="Tarif Gerai" /><ErrorState message={error ?? "Gerai tidak ditemukan."} onRetry={reload} /></div>

  const cols: Array<Column<RuleItem>> = [
    {
      key: "svc",
      header: "Layanan",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <CourierLogo code={r.courier_code} name={r.display_name} decorative />
          <div className="min-w-0">
            <div className="font-medium text-slate-950">{r.display_name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">Batas {bpsText(r.band.minBps)}–{bpsText(r.band.maxBps)}</div>
          </div>
        </div>
      ),
    },
    {
      key: "master",
      header: "Master Mengantar",
      align: "right",
      wide: true,
      cell: (r) =>
        r.schedule ? (
          <span className="text-muted-foreground">
            {bpsText(r.schedule.masterDiscountBps)}
            {r.schedule.extraPromoBps > 0 ? <span className="ml-1 text-xs text-primary">+{bpsText(r.schedule.extraPromoBps)}*</span> : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "assigned",
      header: "Diskon Gerai",
      align: "right",
      cell: (r) => <span className="font-semibold text-slate-950">{bpsText(r.assigned_bps)}</span>,
    },
    {
      key: "margin",
      header: "Est. Margin",
      align: "right",
      cell: (r) => {
        if (!r.schedule) return "—"
        const spread = r.schedule.masterDiscountBps - r.assigned_bps
        const tone = spread < 0 ? "danger" : spread < r.schedule.platformMarginBps ? "warn" : "safe"
        return <StatusBadge tone={tone}>{bpsText(spread)}</StatusBadge>
      },
    },
    {
      key: "observed",
      header: "Teramati",
      align: "right",
      cell: (r) => bpsText(r.observed_bps),
    },
    {
      key: "cashback",
      header: "Cashback",
      align: "right",
      wide: true,
      cell: (r) => <span className="text-muted-foreground">{bpsText(r.cashback_bps)}</span>,
    },
    {
      key: "state",
      header: "Status",
      cell: (r) => <StatusBadge tone={STATE[r.verification_state].tone}>{STATE[r.verification_state].label}</StatusBadge>,
    },
    {
      key: "act",
      header: "Aksi",
      align: "right",
      cell: (r) => (
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(r)}>
          Ubah
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHeader
        title={`Diskon · ${data.tenant.name}`}
        description={`${data.tenant.slug}.geraimitra.com · SLA verifikasi Mengantar ${data.applySlaMinutes} menit. Cashback saat ini bersifat konfigurasi tampilan saja.`}
      >
        <Button variant="outline" render={<Link to="/tarif" search={{}} />}>
          <ArrowLeftIcon aria-hidden /> Semua Gerai
        </Button>
        <RecheckButton
          label="Verifikasi Ulang"
          busyLabel="Memverifikasi…"
          path="/tarif/verifikasi-ulang"
          body={{ tenantId: data.tenant.id }}
          onDone={reload}
          done={(d) => {
            const r = d as { observed: number }
            return r.observed ? `Verifikasi selesai: ${r.observed} layanan teramati dari Mengantar.` : "Verifikasi selesai: belum ada estimasi tarif baru dari Mengantar."
          }}
        />
        <ReasonAction
          label="Terapkan Target Kebijakan"
          confirmLabel="Terapkan ke Gerai Ini"
          variant="outline"
          path={`/tarif/gerai/${data.tenant.id}/terapkan-standar`}
          onDone={reload}
          hint="Menyamakan diskon semua layanan gerai ini ke nilai default kebijakan aktif per ekspedisi. Layanan yang berubah statusnya menjadi Belum diterapkan untuk diajukan ke tim Mengantar."
        />
        <ReasonAction
          label="Tarik dari Mengantar"
          confirmLabel="Tarik & Terapkan"
          variant="outline"
          path={`/tarif/gerai/${data.tenant.id}/tarik-mengantar`}
          onDone={reload}
          hint="Membaca diskon aktual per ekspedisi dari akun Mengantar gerai ini lalu menyamakan aturan tarif ke angka tersebut sebagai Sesuai."
        />
      </PageHeader>

      <div className="@container">
        <MetricGrid>
          <MetricCard label="Total layanan" value={summary.total} />
          <MetricCard label="Sesuai Mengantar" value={summary.sesuai} />
          <MetricCard label="Belum diterapkan" value={summary.belum} tone={summary.belum > 0 ? "warn" : undefined} />
          <MetricCard label="Selisih" value={summary.selisih} tone={summary.selisih > 0 ? "warn" : undefined} />
        </MetricGrid>
      </div>

      <SectionCard
        title="Matriks Diskon per Layanan"
        description="Estimasi Margin dihitung dari Master Mengantar dikurangi Diskon Gerai (belum termasuk promo ekstra bersyarat SPX/J&T EZ)."
        flush
      >
        <DataTableShell
          bare
          caption={`Aturan diskon ${data.tenant.name}`}
          columns={cols}
          rows={data.items}
          rowKey={(r) => r.service_code}
          mobile={(r) => {
            const spread = r.schedule ? r.schedule.masterDiscountBps - r.assigned_bps : null
            const spreadTone = spread === null ? "muted" : spread < 0 ? "danger" : spread < (r.schedule?.platformMarginBps ?? 500) ? "warn" : "safe"
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CourierLogo code={r.courier_code} name={r.display_name} decorative />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-950">{r.display_name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">Batas {bpsText(r.band.minBps)}–{bpsText(r.band.maxBps)}</div>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(r)}>
                    Ubah
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs tabular-nums">
                  <div>
                    <div className="text-muted-foreground">Diskon Gerai</div>
                    <div className="font-semibold text-slate-950">{bpsText(r.assigned_bps)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Est. Margin</div>
                    <div className="mt-0.5">{spread !== null ? <StatusBadge tone={spreadTone}>{bpsText(spread)}</StatusBadge> : "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Teramati</div>
                    <div className="font-medium">{bpsText(r.observed_bps)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <StatusBadge tone={STATE[r.verification_state].tone}>{STATE[r.verification_state].label}</StatusBadge>
                  {r.schedule ? <span className="text-muted-foreground tabular-nums">Master {bpsText(r.schedule.masterDiscountBps)}</span> : null}
                </div>
              </div>
            )
          }}
        />
      </SectionCard>

      {editing ? (
        <EditRuleDialog
          tenantId={data.tenant.id}
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      ) : null}
    </div>
  )
}

function EditRuleDialog({ tenantId, rule, onClose, onSaved }: { tenantId: string; rule: RuleItem; onClose: () => void; onSaved: () => void }) {
  const [disc, setDisc] = useState(String(rule.assigned_bps / 100))
  const [cb, setCb] = useState(String(rule.cashback_bps / 100))
  const [reason, setReason] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const parseBps = (s: string) => {
    const t = s.trim().replace(",", ".")
    return t === "" ? Number.NaN : Math.round(Number(t) * 100)
  }
  const parsedDiscBps = parseBps(disc)
  const marginPreview = rule.schedule && Number.isFinite(parsedDiscBps) ? rule.schedule.masterDiscountBps - parsedDiscBps : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    const assignedBps = parseBps(disc)
    const cashbackBps = cb.trim() === "" ? 0 : parseBps(cb)
    if (!Number.isFinite(assignedBps) || !Number.isFinite(cashbackBps)) {
      setErr("Isi diskon gerai dan cashback dengan angka persentase yang valid.")
      return
    }
    setPending(true)
    setErr(null)
    try {
      await api(`/tarif/gerai/${tenantId}/${rule.service_code}`, {
        body: {
          assignedBps,
          cashbackBps,
          reason,
        },
      })
      toast.success(`Aturan ${rule.display_name} tersimpan.`)
      onSaved()
    } catch (e2) {
      if (e2 instanceof ApiError && e2.body.code === "TOTP_RECENT_REQUIRED") {
        window.location.assign(`/totp?mode=required&kembali=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      setErr(e2 instanceof ApiError ? e2.body.message : "Gagal menyimpan aturan.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah Diskon — {rule.display_name}</DialogTitle>
          <DialogDescription>
            Batas aktif: {bpsText(rule.band.minBps)}–{bpsText(rule.band.maxBps)}. Mengubah diskon mereset status ke Belum diterapkan sampai tim Mengantar menerapkannya.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="rule-disc">Diskon gerai (%)</FieldLabel>
              <Input id="rule-disc" inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value)} className="tabular-nums" />
              <FieldDescription>Rentang {bpsText(rule.band.minBps)}–{bpsText(rule.band.maxBps)}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="rule-cb">Cashback (%)</FieldLabel>
              <Input id="rule-cb" inputMode="decimal" value={cb} onChange={(e) => setCb(e.target.value)} className="tabular-nums" />
              <FieldDescription>Konfigurasi tampilan saja</FieldDescription>
            </Field>
          </div>
          {rule.schedule ? (
            <div className={`rounded-lg border px-3 py-2 text-xs tabular-nums ${marginPreview !== null && marginPreview < 0 ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              Master Mengantar <strong>{bpsText(rule.schedule.masterDiscountBps)}</strong> − Diskon Gerai <strong>{Number.isFinite(parsedDiscBps) ? bpsText(parsedDiscBps) : "—"}</strong> = Est. Margin Platform{" "}
              <strong className={marginPreview !== null && marginPreview < 0 ? "text-rose-700" : "text-emerald-700"}>
                {marginPreview !== null ? bpsText(marginPreview) : "—"}
              </strong>
            </div>
          ) : null}
          <Field>
            <FieldLabel htmlFor="rule-reason">Alasan (wajib, dicatat di log audit)</FieldLabel>
            <Textarea id="rule-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Contoh: Penyesuaian diskon sesuai tier volume gerai" />
          </Field>
          {err ? <FieldError>{err}</FieldError> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Batal</Button>
            <Button type="submit" disabled={pending || reason.trim().length < 5}>{pending ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
