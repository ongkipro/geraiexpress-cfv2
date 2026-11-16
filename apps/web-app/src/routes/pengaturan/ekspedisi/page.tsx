import { useEffect, useState } from "react"
import { Badge } from "../../../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Skeleton } from "../../../components/ui/skeleton"
import { Switch } from "../../../components/ui/switch"
import { FormAlert } from "../../../components/auth/auth-card"
import { api, ApiError } from "../../../lib/api"
import { ChoiceGroup } from "../../../components/admin/page"
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

export function PengaturanEkspedisiPage() {
  const [rows, setRows] = useState<CourierRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    api<{ items: CourierRow[] }>("/settings/couriers")
      .then((d) => setRows(d.items))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) window.location.assign("/masuk")
        else setError(e instanceof ApiError ? e.body.message : "Daftar ekspedisi tidak dapat dimuat.")
      })
  }, [])

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
    <main className="mx-auto flex min-h-svh w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">Ekspedisi Aktif</h2>
        <p className="text-base text-muted-foreground">Pilih ekspedisi yang tampil di kasir dan mini-site gerai. Perubahan langsung tersimpan. Diskon ongkir diatur GeraiExpress dan diterapkan tim Mengantar.</p>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}
      {!rows && !error ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat ekspedisi">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {rows ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daftar ekspedisi</CardTitle>
            <CardDescription className="text-base tabular-nums">{active} dari {rows.length} aktif</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const id = `kurir-${r.courierCode}`
                return (
                  <li key={r.courierCode} className="flex flex-col gap-3 px-4 py-3 md:px-6">
                    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                      <span className="flex flex-col gap-1">
                        <span className="text-base font-medium">{r.name}</span>
                        <span className="flex flex-wrap gap-2">
                          {r.services.map((s) => (
                            <Badge key={s.serviceCode} variant="outline" className="h-7 px-2 text-sm font-normal">
                              {s.serviceClass === "cargo" ? "Cargo" : "Reguler"}
                              {s.cod ? " · COD" : ""}
                              {s.discount ? <span className="tabular-nums">{` · diskon ${pct(s.discount.assignedBps)} (${DISCOUNT_STATE[s.discount.state]})`}</span> : null}
                            </Badge>
                          ))}
                        </span>
                      </span>
                      <Switch id={id} checked={r.enabled} disabled={pending === r.courierCode} onCheckedChange={(v) => update(r, { enabled: v })} aria-label={`Aktifkan ${r.name}`} />
                    </label>
                    {r.enabled && r.pickupOptions.length > 1 ? (
                      <ChoiceGroup
                        label={`Penjemputan ${r.name}`}
                        value={r.pickupMode}
                        onValueChange={(m) => r.pickupMode !== m && update(r, { pickupMode: m })}
                        choices={r.pickupOptions.map((m) => ({ value: m, label: MODE_LABEL[m], disabled: pending === r.courierCode }))}
                      />
                    ) : r.enabled && !r.note ? (
                      <p className="text-base text-muted-foreground">{MODE_LABEL[r.pickupMode]}</p>
                    ) : null}
                    {r.note && r.enabled ? <p className="text-base text-muted-foreground">{r.note}</p> : null}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </main>
  )
}
