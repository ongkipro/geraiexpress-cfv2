import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "../../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { api, ApiError } from "../../lib/api"
import { ErrorState, LoadingState, PageTitle } from "../../shell/states"
import { isOwner, useWorkspace } from "../../shell/workspace"
import { rp } from "./quote-panel"

// `/kasir/shift` (visual 07, spec 03 §4): opening float → live totals → closing count → variance with reason code.
interface Totals { tunaiIn: number; tunaiOut: number; voidTunai: number; codPayoutTunai: number; qris: number; transfer: number; deposit: number; expectedCash: number }
interface Shift { id: string; cashier_user_id: string; opened_at: number; opening_float_idr: number; closed_at: number | null; counted_cash_idr: number | null; variance_idr: number | null; variance_reason_code: string | null; state: string; totals?: Totals }
interface View { shift: Shift | null; totals: Totals | null; shifts: Shift[] }
const REASONS: Array<[string, string]> = [["salah_kembalian", "Salah kembalian"], ["uang_palsu", "Uang palsu"], ["lupa_catat", "Lupa dicatat"], ["pengeluaran_kecil", "Pengeluaran kecil"], ["selisih_lain", "Selisih lain"]]
const digits = (s: string) => Number(s.replace(/\D/g, "") || "0")
const fmtIn = (s: string) => (s.replace(/\D/g, "") ? Number(s.replace(/\D/g, "")).toLocaleString("id-ID") : "")
const time = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms) : "—")

export function ShiftPage() {
  const w = useWorkspace()
  const [v, setV] = useState<View | null>(null)
  const [history, setHistory] = useState<Shift[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    Promise.all([api<View>("/shift"), api<View>("/shifts")])
      .then(([cur, list]) => {
        setError(null)
        setV(cur)
        setHistory(list.shifts.filter((s) => s.state === "closed").slice(0, 10))
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Shift tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  if (error) return <div><PageTitle title="Shift Loket" /><ErrorState message={error} onRetry={load} /></div>
  if (!v) return <LoadingState label="Memuat shift" />
  return (
    <div className="pb-24 md:pb-0">
      <nav aria-label="Breadcrumb" className="mb-2 text-base text-muted-foreground"><Link to="/kasir" className="text-primary underline-offset-4 hover:underline">Buat Pengiriman</Link> › Shift Loket</nav>
      <PageTitle title="Shift Loket" description={v.shift ? `Dibuka ${time(v.shift.opened_at)}` : "Buka shift sebelum menerima uang tunai."} />
      {v.shift && v.totals ? <OpenShift shift={v.shift} totals={v.totals} onClosed={load} /> : <OpenForm onOpened={load} />}
      <section className="mt-6 rounded-lg border bg-card p-4 md:p-6" aria-labelledby="riwayat">
        <h3 id="riwayat" className="mb-3 text-lg font-semibold">{isOwner(w) ? "Riwayat shift semua kasir" : "Riwayat shift Anda"}</h3>
        {history.length === 0 ? <p className="text-base text-muted-foreground">Belum ada shift yang ditutup.</p> : (
          <ul className="divide-y">
            {history.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2 text-base tabular-nums">
                <span>{time(s.opened_at)} → {time(s.closed_at)}</span>
                <span className={s.variance_idr ? "font-medium text-danger" : "text-muted-foreground"}>{s.variance_idr ? `Selisih ${rp(Math.abs(s.variance_idr))} (${s.variance_idr > 0 ? "lebih" : "kurang"})` : "Pas"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function OpenForm({ onOpened }: { onOpened: () => void }) {
  const [float, setFloat] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api("/shift/open", { body: { openingFloatIdr: digits(float) } })
      onOpened()
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Gagal membuka shift.")
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6" noValidate>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="modal">Modal awal laci</FieldLabel>
        <Input id="modal" inputMode="numeric" value={float} onChange={(e) => setFloat(fmtIn(e.target.value))} placeholder="150.000" className="w-48 tabular-nums" />
        {error ? <FieldError>{error}</FieldError> : <FieldDescription>Uang tunai di laci saat shift dimulai.</FieldDescription>}
      </Field>
      <div><Button type="submit" size="lg" disabled={pending}>{pending ? "Membuka…" : "Buka Shift"}</Button></div>
    </form>
  )
}

function OpenShift({ shift, totals, onClosed }: { shift: Shift; totals: Totals; onClosed: () => void }) {
  const [counted, setCounted] = useState("")
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const variance = counted ? digits(counted) - totals.expectedCash : null
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api("/shift/close", { body: { countedCashIdr: digits(counted), reasonCode: reason || undefined, note: note || undefined } })
      onClosed()
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Gagal menutup shift.")
    } finally {
      setPending(false)
    }
  }
  const row = (label: string, value: number, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? "border-t pt-2 text-lg font-semibold" : ""}`}><dt className={strong ? "" : "text-muted-foreground"}>{label}</dt><dd>{rp(value)}</dd></div>
  )
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg border bg-card p-4 md:p-6" aria-labelledby="laci">
        <h3 id="laci" className="mb-3 text-lg font-semibold">Isi laci (langsung)</h3>
        <dl className="flex flex-col gap-2 text-base tabular-nums">
          {row("Modal awal", shift.opening_float_idr)}
          {row("Tunai masuk", totals.tunaiIn)}
          {row("Void tunai", -totals.voidTunai || 0)}
          {row("Pencairan COD tunai", -totals.codPayoutTunai || 0)}
          {row("Seharusnya di laci", totals.expectedCash, true)}
          <div className="flex justify-between gap-3 pt-2"><dt className="text-muted-foreground">QRIS tercatat</dt><dd>{rp(totals.qris)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Transfer tercatat</dt><dd>{rp(totals.transfer)}</dd></div>
        </dl>
      </section>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6" noValidate>
        <h3 className="text-lg font-semibold">Tutup shift</h3>
        <Field>
          <FieldLabel htmlFor="hitung">Uang tunai fisik dihitung</FieldLabel>
          <Input id="hitung" inputMode="numeric" value={counted} onChange={(e) => setCounted(fmtIn(e.target.value))} className="w-48 tabular-nums" />
          {variance !== null ? <FieldDescription className={variance === 0 ? "text-safe" : "text-danger"}>{variance === 0 ? "Pas, tidak ada selisih." : `Selisih ${rp(Math.abs(variance))} (${variance > 0 ? "lebih" : "kurang"})`}</FieldDescription> : null}
        </Field>
        {variance !== null && variance !== 0 ? (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-base font-medium">Alasan selisih</legend>
              <div role="radiogroup" aria-label="Alasan selisih" className="flex flex-wrap gap-2">
                {REASONS.map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={reason === id} onClick={() => setReason(id)} className={`h-11 rounded-lg border px-4 text-base ${reason === id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input"}`}>{label}</button>
                ))}
              </div>
            </fieldset>
            <Field>
              <FieldLabel htmlFor="catatan">Catatan</FieldLabel>
              <Input id="catatan" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            </Field>
          </>
        ) : null}
        {error ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base font-medium text-danger">{error}</p> : null}
        <div><Button type="submit" size="lg" disabled={pending || !counted}>{pending ? "Menutup…" : "Tutup Shift"}</Button></div>
      </form>
    </div>
  )
}
