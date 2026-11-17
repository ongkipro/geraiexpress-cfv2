import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react"
import { useNavigate, useParams } from "@tanstack/react-router"
import { ScanLineIcon, TruckIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Field, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../../shell/states"
import { SectionCard, Panel } from "../../../components/admin/page"

// `Pickup & Manifest` (spec 04 §1, visual 07 `/kiriman/pickup/:batch`): per-courier queue → scan into the manifest
// (red banner + tone on block, amber on counter-unpaid) → driver fields + on-screen signature → Surat Jalan PDF.
interface Group { courier_code: string; ready: number; weight_gram: number; vehicle: string; open_batch: string | null; scanned: number; unpaid: number }
interface Item { slug: string; awb: string | null; recipient: string | null; weight_gram: number | null; unpaid_warning: number }
interface Batch { id: string; courier_code: string; status: string; scanned_count: number; driver_name: string | null; handed_over_at: number | null; items: Item[]; missing: Array<{ slug: string; awb: string | null; recipient: string | null }> }
type ScanRes = { result: "added" | "duplicate"; slug: string; awb: string; warning: string | null } | { result: "blocked"; code: string; message: string; slug: string | null }
const COURIER: Record<string, string> = { JT: "J&T", JNE: "JNE", SiCepat: "SiCepat", Sap: "SAP Express", iDexpress: "iDexpress", lion: "Lion Parcel", anteraja: "Anteraja", pos: "Pos Indonesia", spx: "SPX", ninja: "Ninja Xpress" }
const kg = (g: number) => `${(g / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} kg`

/** Queue shown inside the `Pickup & Manifest` tab. */
export function PickupQueue() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<{ groups: Group[] }>("/pickup").then((d) => setGroups(d.groups)).catch((e) => setError(e instanceof ApiError ? e.body.message : "Antrean pickup tidak dapat dimuat."))
  }, [])
  async function start(courier: string) {
    const r = await api<{ batch: { id: string } }>("/pickup/open", { body: { courier } })
    await navigate({ to: "/kiriman/pickup/$batch", params: { batch: r.batch.id } })
  }
  if (error) return <ErrorState message={error} />
  if (!groups) return <LoadingState label="Memuat antrean pickup" />
  if (!groups.length) return <EmptyState title="Tidak ada paket menunggu kurir" body="Paket yang resinya terbit dan belum diserahkan akan muncul di sini per ekspedisi." />
  return (
    <ul className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <Panel as="li" key={g.courier_code} className="flex flex-col gap-2 md:p-4">
          <p className="flex items-center justify-between gap-2 text-sm font-semibold md:text-base">{COURIER[g.courier_code] ?? g.courier_code}<span className="text-base md:text-sm font-normal text-muted-foreground tabular-nums">{g.ready} paket · {kg(g.weight_gram)}</span></p>
          <p className="flex items-center gap-2 text-base md:text-sm text-muted-foreground"><TruckIcon aria-hidden className="size-4" /> Kendaraan: {g.vehicle}{g.unpaid ? ` · ${g.unpaid} belum dibayar` : ""}</p>
          <div><Button onClick={() => start(g.courier_code)}><ScanLineIcon aria-hidden /> {g.open_batch ? `Lanjutkan Pindai (${g.scanned})` : "Mulai Pindai"}</Button></div>
        </Panel>
      ))}
    </ul>
  )
}

// One AudioContext for the page: browsers cap how many may exist, and the block alarm must keep working.
let audio: AudioContext | null = null
function beep(ok: boolean) {
  try {
    audio ??= new AudioContext()
    const ctx = audio
    if (ctx.state === "suspended") void ctx.resume()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = ok ? "sine" : "square"
    o.frequency.value = ok ? 880 : 220
    g.gain.value = 0.15
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + (ok ? 0.12 : 0.6))
  } catch {
    // audio unavailable: the banner still shows
  }
}

export function ManifestPage() {
  const { batch } = useParams({ strict: false }) as { batch: string }
  const [b, setB] = useState<Batch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [last, setLast] = useState<ScanRes | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const load = useCallback(() => {
    api<{ batch: Batch }>(`/pickup/${batch}`)
      .then((d) => {
        setError(null)
        setB(d.batch)
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Manifest tidak dapat dimuat."))
  }, [batch])
  useEffect(load, [load])
  async function scan(e: FormEvent) {
    e.preventDefault()
    const c = code.trim()
    if (!c) return
    setCode("")
    try {
      const r = await api<{ scan: ScanRes; batch: Batch }>(`/pickup/${batch}/scan`, { body: { code: c } })
      setLast(r.scan)
      setB(r.batch)
      beep(r.scan.result !== "blocked")
    } catch (err) {
      setLast({ result: "blocked", code: "ERROR", message: err instanceof ApiError ? err.body.message : "Gagal memindai.", slug: null })
      beep(false)
    }
    input.current?.focus()
  }
  if (error) return <div><PageTitle title="Manifest" /><ErrorState message={error} onRetry={load} /></div>
  if (!b) return <LoadingState label="Memuat manifest" />
  const name = COURIER[b.courier_code] ?? b.courier_code
  const open = b.status === "open"
  return (
    <div className="min-w-0 pb-24 md:pb-0">
      <PageTitle title={`Manifest ${name}`} description={open ? `${b.scanned_count} paket dipindai` : `Diserahkan · ${b.scanned_count} paket`}>
        {!open ? <a href={`/api/app/pickup/${b.id}/surat-jalan.pdf`} target="_blank" rel="noopener" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground md:h-10">Cetak Surat Jalan</a> : null}
      </PageTitle>
      {open ? (
        <Panel as="form" onSubmit={scan} className="mb-4 flex flex-wrap items-end gap-2 md:p-4">
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor="scan">Pindai barcode resi atau QR INV</FieldLabel>
            <Input id="scan" ref={input} autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Arahkan pemindai ke barcode" />
          </Field>
          <Button type="submit" size="lg">Tambah</Button>
        </Panel>
      ) : null}
      {last ? (
        last.result === "blocked" ? (
          <p role="alert" className="mb-4 rounded-lg bg-danger px-4 py-3 text-base md:text-sm font-bold text-white">{last.message}</p>
        ) : last.warning ? (
          <p role="status" className="mb-4 rounded-lg border-l-4 border-warn bg-warn-bg px-4 py-3 text-base md:text-sm font-medium">INV {last.slug.toUpperCase()} masuk manifest. {last.warning}</p>
        ) : (
          <p role="status" className="mb-4 rounded-lg border-l-4 border-safe bg-safe-bg px-4 py-3 text-base md:text-sm font-medium">{last.result === "duplicate" ? "Sudah ada di manifest" : "Masuk manifest"}: {last.awb}</p>
        )
      ) : null}
      <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
        <SectionCard id="dipindai" title={<>Dipindai ({b.items.length})</>}>
          {b.items.length === 0 ? <p className="text-base md:text-sm text-muted-foreground">Belum ada paket.</p> : (
            <ul className="divide-y">
              {b.items.map((i) => (
                <li key={i.slug} className="flex flex-wrap items-center justify-between gap-2 py-2 text-base md:text-sm">
                  <span className="tabular-nums"><span className="font-medium">{i.awb}</span> · INV {i.slug.toUpperCase()}{i.unpaid_warning ? <span className="font-medium text-warn"> · belum dibayar</span> : null}</span>
                  {open ? <Button variant="ghost" onClick={async () => { const r = await api<{ batch: Batch }>(`/pickup/${b.id}/unscan`, { body: { slug: i.slug } }); setB(r.batch) }}>Keluarkan</Button> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        {open ? (
          <SectionCard id="belum" title={<>Belum dipindai ({b.missing.length})</>}>
            {b.missing.length === 0 ? <p className="text-base md:text-sm text-muted-foreground">Semua paket {name} sudah dipindai.</p> : (
              <ul className="divide-y">
                {b.missing.map((i) => <li key={i.slug} className="py-2 text-base md:text-sm tabular-nums">{i.awb} · INV {i.slug.toUpperCase()}</li>)}
              </ul>
            )}
          </SectionCard>
        ) : null}
      </div>
      {open && b.items.length ? <Handover batchId={b.id} onDone={load} /> : null}
    </div>
  )
}

function Handover({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [plate, setPlate] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [signed, setSigned] = useState(false)
  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) * e.currentTarget.width) / r.width, ((e.clientY - r.top) * e.currentTarget.height) / r.height] as const
  }
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true
    const c = e.currentTarget.getContext("2d")!
    c.lineWidth = 3
    c.lineCap = "round"
    c.beginPath()
    c.moveTo(...pos(e))
  }
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const c = e.currentTarget.getContext("2d")!
    c.lineTo(...pos(e))
    c.stroke()
    setSigned(true)
  }
  const clear = () => {
    const c = canvas.current
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height)
    setSigned(false)
  }
  async function submit(mode: "handed_over" | "dropped_at_branch") {
    setPending(true)
    setFields({})
    setMsg(null)
    try {
      let signatureId: string | null = null
      if (mode === "handed_over" && signed && canvas.current) {
        const blob = await new Promise<Blob | null>((res) => canvas.current!.toBlob(res, "image/png"))
        if (blob) {
          const up = await fetch("/api/app/media?purpose=signature", { method: "POST", credentials: "same-origin", headers: { "content-type": "image/png" }, body: blob })
          const j = (await up.json().catch(() => null)) as { ok: boolean; data?: { id: string }; error?: { message: string } } | null
          if (!j?.ok) throw new ApiError(up.status, { code: "SIGNATURE_UPLOAD_FAILED", message: "Tanda tangan gagal diunggah. Periksa koneksi lalu coba lagi.", field_errors: {} })
          signatureId = j.data!.id
        }
      }
      await api(`/pickup/${batchId}/handover`, { body: { mode, driverName: name, driverPhone: phone, vehicleNo: plate, signatureId } })
      onDone()
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.body.field_errors ?? {})
        setMsg(e.body.message)
      } else setMsg("Gagal menyimpan serah terima.")
    } finally {
      setPending(false)
    }
  }
  return (
    <SectionCard id="serah" className="mt-6" title="Serah terima ke kurir">
      <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field data-invalid={fields.driverName ? true : undefined}><FieldLabel htmlFor="drv-name">Nama kurir</FieldLabel><Input id="drv-name" value={name} onChange={(e) => setName(e.target.value)} />{fields.driverName ? <FieldError>{fields.driverName}</FieldError> : null}</Field>
        <Field data-invalid={fields.driverPhone ? true : undefined}><FieldLabel htmlFor="drv-phone">No HP kurir</FieldLabel><Input id="drv-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />{fields.driverPhone ? <FieldError>{fields.driverPhone}</FieldError> : null}</Field>
        <Field data-invalid={fields.vehicleNo ? true : undefined}><FieldLabel htmlFor="drv-plate">No. polisi</FieldLabel><Input id="drv-plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="D 1234 ABC" />{fields.vehicleNo ? <FieldError>{fields.vehicleNo}</FieldError> : null}</Field>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-base md:text-sm font-medium">Tanda tangan kurir</p>
        <canvas ref={canvas} width={600} height={200} aria-label="Area tanda tangan kurir" className="h-40 w-full max-w-xl touch-none rounded-lg border border-input bg-white" onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} onPointerLeave={() => (drawing.current = false)} />
        {fields.signature ? <FieldError>{fields.signature}</FieldError> : null}
        <div><Button variant="ghost" onClick={clear}>Hapus tanda tangan</Button></div>
      </div>
      {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base md:text-sm font-medium text-danger">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={pending} onClick={() => submit("handed_over")}>Selesai & Tanda Tangan</Button>
        <Button variant="outline" disabled={pending} onClick={() => submit("dropped_at_branch")}>Diantar Mandiri ke Cabang</Button>
      </div>
    </div>
    </SectionCard>
  )
}
