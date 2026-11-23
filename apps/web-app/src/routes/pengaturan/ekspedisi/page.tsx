import { useCallback, useEffect, useState } from "react"
import { cn } from "cn"
import { Skeleton } from "../../../components/ui/skeleton"
import { Switch } from "../../../components/ui/switch"
import { api, ApiError } from "../../../lib/api"
import { ChoiceGroup, SectionCard } from "../../../components/admin/page"
import { CourierLogo } from "../../../components/admin/courier-logo"
import { ErrorState } from "../../../shell/states"
import { SettingsLayout } from "../index/shared"
import { toast } from "sonner"

// Pengaturan › Ekspedisi Aktif (TASK-206, DEC-223, visual 08 §2): one full-row switch per courier that saves at once
// with a short confirmation, plus the pickup mode where the courier offers a choice.
type PickupMode = "scheduled_pickup" | "drop_off_only"
interface CourierRow {
  courierCode: string
  name: string
  enabled: boolean
  pickupMode: PickupMode
  pickupOptions: PickupMode[]
  services: Array<{ serviceCode: string; name: string; serviceClass: "regular" | "cargo"; cod: boolean; discount: { assignedBps: number; state: "belum_diterapkan" | "sesuai" | "selisih" } | null }>
  note: string | null
}

const DISCOUNT_STATE: Record<string, string> = { belum_diterapkan: "belum diterapkan", sesuai: "sesuai", selisih: "selisih" }
const pct = (bps: number) => `${(bps / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`

const MODE_LABEL: Record<PickupMode, string> = { scheduled_pickup: "Dijemput kurir", drop_off_only: "Antar ke agen" }

/**
 * Service pill label (DEC-240): a courier can hold several regular services (J&T Express + J&T ECO, SAP Express + SAP
 * Lite), so "Reguler" alone is ambiguous. The courier's own regular service is `Reguler`; any other regular service
 * shows its catalog name without the courier prefix (`ECO`, `Lite`); cargo is `Cargo`.
 */
export function serviceLabel(r: Pick<CourierRow, "name" | "courierCode">, s: CourierRow["services"][number]): string {
  if (s.serviceClass === "cargo") return "Cargo"
  if (s.serviceCode === r.courierCode) return "Reguler"
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const short = s.name.replace(new RegExp(`^(${esc(r.name)}|${esc(r.name.split(" ")[0]!)})\\s*`, "i"), "").trim()
  return short && !/^reguler$/i.test(short) ? short : "Reguler"
}

export function PengaturanEkspedisiPage() {
  const [rows, setRows] = useState<CourierRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const load = useCallback(() => {
    api<{ items: CourierRow[] }>("/settings/couriers")
      .then((d) => {
        setError(null)
        setRows(d.items)
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) window.location.assign("/masuk")
        else setError(e instanceof ApiError ? e.body.message : "Daftar ekspedisi tidak dapat dimuat.")
      })
  }, [])
  useEffect(load, [load])

  // DEC-236: one toast system (shadcn Sonner in the shell), announced politely to screen readers.
  const show = (text: string, tone: "safe" | "danger" = "safe") => void (tone === "safe" ? toast.success(text) : toast.error(text))

  async function update(row: CourierRow, patch: { enabled?: boolean; pickupMode?: PickupMode }) {
    setPending(row.courierCode)
    try {
      const next = await api<CourierRow>(`/settings/couriers/${encodeURIComponent(row.courierCode)}`, { body: patch })
      setRows((rs) => rs?.map((r) => (r.courierCode === next.courierCode ? next : r)) ?? null)
      if (patch.enabled !== undefined) show(`${next.name} ${next.enabled ? "diaktifkan" : "dinonaktifkan"}`)
      else show(`${next.name}: ${MODE_LABEL[next.pickupMode].toLowerCase()}`)
    } catch (e) {
      show(e instanceof ApiError ? e.body.message : "Gagal menyimpan. Coba lagi.", "danger")
    } finally {
      setPending(null)
    }
  }

  const active = rows?.filter((r) => r.enabled).length ?? 0

  return (
    <SettingsLayout title="Ekspedisi Aktif" description="Pilih ekspedisi yang tampil di kasir dan mini-site gerai. Perubahan langsung tersimpan. Diskon ongkir diatur GeraiExpress dan diterapkan tim Mengantar.">
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!rows && !error ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat ekspedisi">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {rows ? (
        <SectionCard title="Daftar ekspedisi" description={<span className="tabular-nums">{active} dari {rows.length} aktif</span>} flush>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const id = `kurir-${r.courierCode}`
              return (
                <li key={r.courierCode} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center md:px-5", !r.enabled && "bg-slate-50/60")}>
                  <div className="flex min-w-0 items-start gap-3">
                    <CourierLogo code={r.courierCode} name={r.name} decorative className={cn(!r.enabled && "opacity-60")} />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className={cn("text-sm font-semibold text-slate-950", !r.enabled && "text-muted-foreground")}>{r.name}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {r.services.map((s) => (
                          <span key={s.serviceCode} className="inline-block rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs leading-5 text-slate-700">
                            <span className="font-medium">{serviceLabel(r, s)}</span>
                            {s.cod ? <span className="text-muted-foreground"> · COD</span> : null}
                            {s.discount ? <span className="text-muted-foreground tabular-nums"> · diskon {pct(s.discount.assignedBps)} ({DISCOUNT_STATE[s.discount.state]})</span> : null}
                          </span>
                        ))}
                      </span>
                      {r.note && r.enabled ? <span className="text-xs text-muted-foreground">{r.note}</span> : null}
                    </div>
                  </div>
                  {/* Phones: switch on the title row, pickup choice full width below; ≥ 640 px: one row. */}
                  <div className="order-last col-span-2 flex items-center sm:order-none sm:col-span-1 sm:justify-end">
                    {r.enabled && r.pickupOptions.length > 1 ? (
                      <ChoiceGroup
                        label={`Penjemputan ${r.name}`}
                        layout="segmented"
                        className="w-full sm:w-auto"
                        value={r.pickupMode}
                        onValueChange={(m) => r.pickupMode !== m && update(r, { pickupMode: m })}
                        choices={r.pickupOptions.map((m) => ({ value: m, label: MODE_LABEL[m], disabled: pending === r.courierCode }))}
                      />
                    ) : r.enabled ? (
                      <span className="text-xs text-muted-foreground">{MODE_LABEL[r.pickupMode]}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nonaktif</span>
                    )}
                  </div>
                  {/* The label is the ≥ 44 px hit area around the 28 px switch (phones). */}
                  <label htmlFor={id} className="-m-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center p-2 sm:pt-2">
                    <Switch id={id} checked={r.enabled} disabled={pending === r.courierCode} onCheckedChange={(v) => update(r, { enabled: v })} aria-label={`Aktifkan ${r.name}`} />
                  </label>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      ) : null}
    </SettingsLayout>
  )
}
