import { useCallback, useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { CircleCheckIcon, CircleDashedIcon, ListTodoIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "../../components/ui/button"
import { LinkButton } from "../../components/admin/link-button"
import { ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge, type StatusTone } from "../../components/admin/page"
import { rememberOpsStatus, type OpsIcon } from "../../components/admin/operational-status"
import { api, ApiError } from "../../lib/api"
import { useWorkspace } from "../../shell/workspace"
import { toast } from "sonner"

// `Status Operasional` (DEC-244, owner only; AdsBookCMS OperationalStatus): verdict banner with `Periksa Ulang` (a real
// live check: finance sync + domain refresh), the faults to handle first, the counter readiness checklist, and every
// signal with its state, detail, time and a direct fix or recheck.
type Tone = "healthy" | "setup" | "problem"
interface Status {
  overall: { tone: Tone; title: string; summary: string; checkedAt: number }
  icon: OpsIcon
  setupSteps: Array<{ id: string; label: string; detail: string; done: boolean; required: boolean; to: string; ctaLabel: string }>
  signals: Array<{ id: string; title: string; state: "healthy" | "degraded" | "unknown"; detail: string; lastAt: number | null; actionTo?: string; actionLabel?: string; recheck?: "finance_sync" | "domain_check" }>
}

export const opsCacheKey = (tenantId: string) => `gx:ops-status:${tenantId}:v1`
export const loadGeraiOps = async (): Promise<OpsIcon | null> => (await api<Status>("/status")).icon

const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms) + " WIB" : "—")
const BANNER: Record<Tone, { icon: typeof CircleCheckIcon; box: string; iconCls: string }> = {
  healthy: { icon: CircleCheckIcon, box: "border-emerald-200 bg-emerald-50/60", iconCls: "bg-emerald-100 text-emerald-700" },
  setup: { icon: ListTodoIcon, box: "border-amber-200 bg-amber-50/60", iconCls: "bg-amber-100 text-amber-800" },
  problem: { icon: TriangleAlertIcon, box: "border-rose-200 bg-rose-50/60", iconCls: "bg-rose-100 text-rose-700" },
}
const SIGNAL: Record<Status["signals"][number]["state"], { tone: StatusTone; label: string }> = {
  healthy: { tone: "safe", label: "Sehat" },
  degraded: { tone: "danger", label: "Perlu dicek" },
  unknown: { tone: "muted", label: "Belum ada data" },
}

export function StatusPage() {
  const w = useWorkspace()
  const [s, setS] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const adopt = useCallback(
    (x: Status) => {
      setError(null)
      setS(x)
      rememberOpsStatus(opsCacheKey(w.tenant.id), x.icon)
    },
    [w.tenant.id],
  )
  const load = useCallback(() => {
    api<Status>("/status")
      .then(adopt)
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Status operasional tidak dapat dimuat."))
  }, [adopt])
  useEffect(load, [load])
  async function recheck() {
    setChecking(true)
    try {
      adopt(await api<Status>("/status/recheck", { body: {} }))
      toast.success("Pemeriksaan ulang selesai.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.message : "Pemeriksaan ulang gagal. Coba lagi.")
    } finally {
      setChecking(false)
    }
  }
  const header = (
    <PageHeader title="Status Operasional" description="Kesiapan loket dan kesehatan koneksi gerai Anda.">
      <Button onClick={recheck} disabled={checking || !s}>
        <RefreshCwIcon aria-hidden className={checking ? "animate-spin" : undefined} /> {checking ? "Memeriksa…" : "Periksa Ulang"}
      </Button>
    </PageHeader>
  )
  if (error) return <div>{header}<ErrorState message={error} onRetry={load} /></div>
  if (!s) return <div>{header}<LoadingState label="Memeriksa status gerai" rows={4} /></div>
  const b = BANNER[s.overall.tone]
  const BannerIcon = b.icon
  const faults = s.signals.filter((x) => x.state === "degraded")
  const done = s.setupSteps.filter((x) => x.done).length
  return (
    <div className="flex max-w-5xl flex-col gap-4 md:gap-5">
      {header}
      <section aria-labelledby="status-verdict" className={cn("flex items-start gap-3 rounded-xl border p-4 md:p-5", b.box)}>
        <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full", b.iconCls)}><BannerIcon className="size-5" /></span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="status-verdict" className="text-base font-semibold text-slate-950">{s.overall.title}</h2>
          <p className="text-sm text-slate-700">{s.overall.summary}</p>
          <p className="text-xs text-muted-foreground">Diperiksa {when(s.overall.checkedAt)}</p>
        </div>
      </section>

      {faults.length ? (
        <SectionCard title="Perlu Ditangani" description="Mulai dari sini." flush>
          <ul className="divide-y divide-slate-100">
            {faults.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
                <span className="flex min-w-0 items-start gap-2.5">
                  <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-rose-600" />
                  <span className="flex min-w-0 flex-col"><span className="text-sm font-medium text-slate-950">{f.title}</span><span className="text-xs text-muted-foreground">{f.detail}</span></span>
                </span>
                <span className="flex shrink-0 gap-2 pl-6 sm:pl-0">
                  {f.recheck ? <Button variant="outline" size="sm" onClick={recheck} disabled={checking}>{f.recheck === "finance_sync" ? "Sinkronkan Saldo" : "Periksa Domain"}</Button> : null}
                  {f.actionTo && f.actionLabel ? <LinkButton size="sm" to={f.actionTo.split("?")[0]!} search={Object.fromEntries(new URLSearchParams(f.actionTo.split("?")[1] ?? "")) as never}>{f.actionLabel}</LinkButton> : null}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Kesiapan Loket" description="Langkah persiapan gerai." action={<StatusBadge tone={done === s.setupSteps.length ? "safe" : "warn"} className="tabular-nums">{done}/{s.setupSteps.length} siap</StatusBadge>} flush>
        <ul className="divide-y divide-slate-100">
          {s.setupSteps.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
              {x.done ? <CircleCheckIcon aria-hidden className="size-5 shrink-0 text-emerald-600" /> : <CircleDashedIcon aria-hidden className={cn("size-5 shrink-0", x.required ? "text-amber-600" : "text-slate-400")} />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-slate-950">{x.label}{x.required ? null : <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opsional)</span>}</span>
                <span className="text-xs text-muted-foreground">{x.detail}</span>
              </span>
              <span className="sr-only">{x.done ? "Selesai" : "Belum selesai"}</span>
              {x.done ? null : <LinkButton variant="outline" size="sm" to={x.to}>{x.ctaLabel}</LinkButton>}
            </li>
          ))}
        </ul>
      </SectionCard>

      <section aria-labelledby="semua-sinyal" className="flex flex-col gap-3">
        <h2 id="semua-sinyal" className="text-sm font-semibold text-slate-950 md:text-base">Semua Sinyal Sistem</h2>
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {s.signals.map((x) => (
            <article key={x.id} aria-labelledby={`sig-${x.id}`} className="flex flex-col gap-3 rounded-xl border border-slate-200/85 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 id={`sig-${x.id}`} className="text-sm font-semibold text-slate-950">{x.title}</h3>
                <StatusBadge tone={SIGNAL[x.state].tone}>{SIGNAL[x.state].label}</StatusBadge>
              </div>
              <p className="text-sm text-slate-700">{x.detail}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <span className="text-xs text-muted-foreground">Terakhir: {when(x.lastAt)}</span>
                <span className="flex gap-2">
                  {x.recheck ? <Button variant="ghost" size="sm" onClick={recheck} disabled={checking}><RefreshCwIcon aria-hidden /> Periksa</Button> : null}
                  {x.actionTo && x.actionLabel ? <Link to={x.actionTo.split("?")[0]!} search={Object.fromEntries(new URLSearchParams(x.actionTo.split("?")[1] ?? "")) as never} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-8">{x.actionLabel}</Link> : null}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
