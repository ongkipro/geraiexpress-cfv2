import { useEffect, useRef, useState } from "react"
import { Badge } from "../../../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Skeleton } from "../../../components/ui/skeleton"
import { Switch } from "../../../components/ui/switch"
import { FormAlert } from "../../../components/auth/auth-card"
import { api, ApiError } from "../../../lib/api"

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
  const [toast, setToast] = useState<{ text: string; tone: "safe" | "danger" } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api<{ items: CourierRow[] }>("/settings/couriers")
      .then((d) => setRows(d.items))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) window.location.assign("/masuk")
        else setError(e instanceof ApiError ? e.body.message : "Daftar ekspedisi tidak dapat dimuat.")
      })
  }, [])

  function show(text: string, tone: "safe" | "danger" = "safe") {
    setToast({ text, tone })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 3000)
  }

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
      <nav aria-label="Breadcrumb" className="text-base text-muted-foreground">
        <span>Pengaturan</span> <span aria-hidden>›</span> <span className="text-foreground">Ekspedisi Aktif</span>
      </nav>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-semibold">Ekspedisi Aktif</h1>
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
                      <div role="radiogroup" aria-label={`Penjemputan ${r.name}`} className="flex flex-wrap gap-2">
                        {r.pickupOptions.map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={r.pickupMode === m}
                            disabled={pending === r.courierCode}
                            onClick={() => r.pickupMode !== m && update(r, { pickupMode: m })}
                            className={`h-11 rounded-lg border px-4 text-base ${r.pickupMode === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-input text-foreground"}`}
                          >
                            {MODE_LABEL[m]}
                          </button>
                        ))}
                      </div>
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

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast ? (
          <p role="status" className={`pointer-events-auto rounded-lg border bg-card px-4 py-3 text-base font-medium shadow-sm ${toast.tone === "safe" ? "border-safe text-safe" : "border-danger text-danger"}`}>
            {toast.text}
          </p>
        ) : null}
      </div>
    </main>
  )
}
