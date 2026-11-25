import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { FileTextIcon, ScanLineIcon, TruckIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Field, FieldError, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { sanitizePhone } from "../../../lib/input"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../../shell/states"
import { ItemList, Panel, SectionCard, StatusBadge } from "../../../components/admin/page"
import { DEFAULT_PAGE_SIZE, PageNav, paginate } from "../../../components/admin/pagination"

// `Pickup & Manifest` (spec 04 §1, visual 07 `/kiriman/pickup/:batch`): per-courier queue → scan into the manifest
// (red banner + tone on block, amber on counter-unpaid) → driver fields + on-screen signature → Surat Jalan PDF.
interface Group { courier_code: string; ready: number; weight_gram: number; vehicle: string; open_batch: string | null; scanned: number; unpaid: number }
interface Item { slug: string; awb: string | null; recipient: string | null; weight_gram: number | null; unpaid_warning: number }
interface Batch { id: string; courier_code: string; status: string; scanned_count: number; driver_name: string | null; handed_over_at: number | null; items: Item[]; missing: Array<{ slug: string; awb: string | null; recipient: string | null }> }
type ScanRes = { result: "added" | "duplicate"; slug: string; awb: string; warning: string | null } | { result: "blocked"; code: string; message: string; slug: string | null }
const COURIER: Record<string, string> = { JT: "J&T", JNE: "JNE", SiCepat: "SiCepat", Sap: "SAP Express", iDexpress: "iDexpress", lion: "Lion Parcel", anteraja: "Anteraja", pos: "Pos Indonesia", spx: "SPX", ninja: "Ninja Xpress" }
const kg = (g: number) => `${(g / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} kg`

interface HistoryBatch { id: string; courier_code: string; status: string; scanned_count: number; driver_name: string | null; created_at: number; handed_over_at: number | null }
const whenPickup = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)

/** Queue + past manifest history shown inside the `Pickup & Manifest` tab. */
export function PickupQueue() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [history, setHistory] = useState<HistoryBatch[]>([])
  const [histPage, setHistPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  const [actErr, setActErr] = useState<string | null>(null)
  const load = useCallback(() => {
    Promise.all([
      api<{ groups: Group[] }>("/pickup"),
      api<{ items: HistoryBatch[] }>("/pickup/history").catch(() => ({ items: [] })),
    ])
      .then(([d, h]) => {
        setError(null)
        setGroups(d.groups)
        setHistory(h.items ?? [])
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Antrean pickup tidak dapat dimuat."))
  }, [])
  useEffect(load, [load])
  async function start(courier: string) {
    if (starting) return
    setStarting(courier)
    setActErr(null)
    try {
      const r = await api<{ batch: { id: string } }>("/pickup/open", { body: { courier } })
      await navigate({ to: "/kiriman/pickup/$batch", params: { batch: r.batch.id } })
    } catch (e) {
      setActErr(e instanceof ApiError ? e.body.message : "Gagal membuka manifest pickup.")
    } finally {
      setStarting(null)
    }
  }
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!groups) return <LoadingState label="Memuat antrean pickup" />
  const pagedHist = paginate(history, histPage, DEFAULT_PAGE_SIZE)
  return (
    <div className="mb-6 flex flex-col gap-6">
      {actErr ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base md:text-sm font-medium text-danger">{actErr}</p> : null}
      {!groups.length ? (
        <EmptyState title="Tidak ada paket menunggu kurir" body="Paket yang resinya terbit dan belum diserahkan akan muncul di sini per ekspedisi." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Panel as="li" key={g.courier_code} className="flex flex-col gap-2 md:p-4">
              <p className="flex items-center justify-between gap-2 text-sm font-semibold md:text-base">{COURIER[g.courier_code] ?? g.courier_code}<span className="text-base md:text-sm font-normal text-muted-foreground tabular-nums">{g.ready} paket · {kg(g.weight_gram)}</span></p>
              <p className="flex items-center gap-2 text-base md:text-sm text-muted-foreground"><TruckIcon aria-hidden className="size-4" /> Kendaraan: {g.vehicle}{g.unpaid ? ` · ${g.unpaid} belum dibayar` : ""}</p>
              <div><Button disabled={starting !== null} onClick={() => start(g.courier_code)}><ScanLineIcon aria-hidden /> {starting === g.courier_code ? "Membuka…" : g.open_batch ? `Lanjutkan Pindai (${g.scanned})` : "Mulai Pindai"}</Button></div>
            </Panel>
          ))}
        </ul>
      )}
      {history.length > 0 ? (
        <section aria-labelledby="riwayat-manifest" className="flex flex-col gap-3">
          <h2 id="riwayat-manifest" className="text-sm font-semibold md:text-base">Riwayat Surat Jalan &amp; Serah Terima ({history.length})</h2>
          <ItemList>
            {pagedHist.items.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/kiriman/pickup/$batch" params={{ batch: h.id }} className="font-semibold text-primary underline-offset-4 hover:underline">
                      Manifest {COURIER[h.courier_code] ?? h.courier_code}
                    </Link>
                    <StatusBadge tone={h.status === "open" ? "warn" : "safe"}>
                      {h.status === "open" ? "Sedang dipindai" : h.status === "dropped_at_branch" ? "Diantar ke cabang" : "Diserahkan ke kurir"}
                    </StatusBadge>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {h.scanned_count} paket{h.driver_name ? ` · Kurir: ${h.driver_name}` : ""} · {whenPickup(h.handed_over_at ?? h.created_at)} WIB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/kiriman/pickup/$batch" params={{ batch: h.id }} className="text-xs font-medium text-primary hover:underline">
                    Detail
                  </Link>
                  {h.status !== "open" ? (
                    <a
                      href={`/api/app/pickup/${h.id}/surat-jalan.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      <FileTextIcon aria-hidden className="size-3.5" /> Surat Jalan PDF
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ItemList>
          <PageNav page={pagedHist.page} totalPages={pagedHist.totalPages} total={pagedHist.total} pageSize={pagedHist.pageSize} onPageChange={setHistPage} itemLabel="manifest" />
        </section>
      ) : null}
    </div>
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
  const [loadedBatch, setLoadedBatch] = useState<string | null>(null)
  const [errState, setErrState] = useState<{ batch: string; msg: string } | null>(null)
  const [code, setCode] = useState("")
  const [last, setLast] = useState<ScanRes | null>(null)
  const [scanning, setScanning] = useState(false)
  const [unscanning, setUnscanning] = useState<string | null>(null)
  const loadGen = useRef(0)
  const scanGen = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const load = useCallback(() => {
    const mine = ++loadGen.current
    api<{ batch: Batch }>(`/pickup/${batch}`)
      .then((d) => {
        if (mine !== loadGen.current) return
        setErrState(null)
        setB(d.batch)
        setLoadedBatch(batch)
      })
      .catch((e) => {
        if (mine !== loadGen.current) return
        setErrState({ batch, msg: e instanceof ApiError ? e.body.message : "Manifest tidak dapat dimuat." })
        setLoadedBatch(batch)
      })
  }, [batch])
  useEffect(() => {
    load()
    const g = loadGen
    return () => { g.current++ }
  }, [load])
  async function scan(e: FormEvent) {
    e.preventDefault()
    const c = code.trim()
    if (!c || scanning) return
    setCode("")
    setScanning(true)
    const mine = ++scanGen.current
    try {
      const r = await api<{ scan: ScanRes; batch: Batch }>(`/pickup/${batch}/scan`, { body: { code: c } })
      if (mine === scanGen.current) {
        setLast(r.scan)
        setB(r.batch)
      }
      beep(r.scan.result !== "blocked")
    } catch (err) {
      if (mine === scanGen.current) setLast({ result: "blocked", code: "ERROR", message: err instanceof ApiError ? err.body.message : "Gagal memindai.", slug: null })
      beep(false)
    } finally {
      if (mine === scanGen.current) setScanning(false)
    }
    input.current?.focus()
  }
  async function unscan(slug: string) {
    if (unscanning) return
    setUnscanning(slug)
    try {
      const r = await api<{ batch: Batch }>(`/pickup/${batch}/unscan`, { body: { slug } })
      setB(r.batch)
    } catch (err) {
      setLast({ result: "blocked", code: "ERROR", message: err instanceof ApiError ? err.body.message : "Gagal mengeluarkan paket dari manifest.", slug })
    } finally {
      setUnscanning(null)
    }
  }
  const error = errState?.batch === batch ? errState.msg : null
  if (error) return <div><PageTitle title="Manifest" /><ErrorState message={error} onRetry={load} /></div>
  if (!b || loadedBatch !== batch) return <div><PageTitle title="Manifest" /><LoadingState label="Memuat manifest" /></div>
  const name = COURIER[b.courier_code] ?? b.courier_code
  const open = b.status === "open"
  const handedTime = b.handed_over_at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(b.handed_over_at) : null
  return (
    <div className="min-w-0 pb-24 md:pb-0">
      <PageTitle
        title={`Manifest ${name}`}
        description={open ? `${b.scanned_count} paket dipindai` : `Diserahkan · ${b.scanned_count} paket${b.driver_name ? ` · Kurir: ${b.driver_name}` : ""}${handedTime ? ` · ${handedTime} WIB` : ""}`}
      >
        {!open ? <a href={`/api/app/pickup/${b.id}/surat-jalan.pdf`} target="_blank" rel="noopener" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base md:text-sm font-medium text-primary-foreground md:h-9">Cetak Surat Jalan</a> : null}
      </PageTitle>
      {open ? (
        <Panel as="form" onSubmit={scan} className="mb-4 flex flex-wrap items-end gap-2 md:p-4">
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor="scan">Pindai barcode resi atau QR INV</FieldLabel>
            <Input id="scan" ref={input} autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Arahkan pemindai ke barcode" />
          </Field>
          <Button type="submit" size="lg" disabled={scanning || !code.trim()}>{scanning ? "Memindai…" : "Tambah"}</Button>
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
                  <span className="tabular-nums">
                    <span className="font-medium">{i.awb}</span> · INV {i.slug.toUpperCase()}
                    {i.recipient ? <span className="text-muted-foreground"> · {i.recipient}</span> : null}
                    {i.weight_gram ? <span className="text-muted-foreground"> · {kg(i.weight_gram)}</span> : null}
                    {i.unpaid_warning ? <span className="font-medium text-warn"> · belum dibayar</span> : null}
                  </span>
                  {open ? <Button variant="ghost" disabled={unscanning === i.slug} onClick={() => unscan(i.slug)}>{unscanning === i.slug ? "Mengeluarkan…" : "Keluarkan"}</Button> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        {open ? (
          <SectionCard id="belum" title={<>Belum dipindai ({b.missing.length})</>}>
            {b.missing.length === 0 ? <p className="text-base md:text-sm text-muted-foreground">Semua paket {name} sudah dipindai.</p> : (
              <ul className="divide-y">
                {b.missing.map((i) => <li key={i.slug} className="py-2 text-base md:text-sm tabular-nums">{i.awb} · INV {i.slug.toUpperCase()}{i.recipient ? <span className="text-muted-foreground"> · {i.recipient}</span> : null}</li>)}
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
    e.currentTarget.setPointerCapture?.(e.pointerId)
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
        <Field data-invalid={fields.driverName ? true : undefined}><FieldLabel htmlFor="drv-name">Nama kurir</FieldLabel><Input id="drv-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />{fields.driverName ? <FieldError>{fields.driverName}</FieldError> : null}</Field>
        <Field data-invalid={fields.driverPhone ? true : undefined}><FieldLabel htmlFor="drv-phone">No HP kurir</FieldLabel><Input id="drv-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={(e) => setPhone(sanitizePhone(e.target.value))} />{fields.driverPhone ? <FieldError>{fields.driverPhone}</FieldError> : null}</Field>
        <Field data-invalid={fields.vehicleNo ? true : undefined}><FieldLabel htmlFor="drv-plate">No. polisi</FieldLabel><Input id="drv-plate" maxLength={12} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="D 1234 ABC" />{fields.vehicleNo ? <FieldError>{fields.vehicleNo}</FieldError> : null}</Field>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-base md:text-sm font-medium">Tanda tangan kurir</p>
        <canvas ref={canvas} width={600} height={200} aria-label="Area tanda tangan kurir" className="h-40 w-full max-w-xl touch-none rounded-lg border border-input bg-white" onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} onPointerCancel={() => (drawing.current = false)} />
        {fields.signature ? <FieldError>{fields.signature}</FieldError> : null}
        <div><Button variant="ghost" onClick={clear}>Hapus tanda tangan</Button></div>
      </div>
      {msg ? <p role="alert" className="border-l-4 border-danger py-1 pl-3 text-base md:text-sm font-medium text-danger">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={pending} onClick={() => submit("handed_over")}>{pending ? "Menyimpan…" : "Selesai & Tanda Tangan"}</Button>
        <Button variant="outline" disabled={pending} onClick={() => submit("dropped_at_branch")}>{pending ? "Menyimpan…" : "Diantar Mandiri ke Cabang"}</Button>
      </div>
    </div>
    </SectionCard>
  )
}
