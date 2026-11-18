import { useEffect, useRef, useState } from "react"
import { CheckCircle2Icon, MonitorOffIcon, PackageIcon, QrCodeIcon } from "lucide-react"
import { DISPLAY_CHANNEL } from "./display-dialog"

// `/kasir/layar-pelanggan` (TASK-701, PR-22, spec 03 §5, visual 07): the chromeless customer-facing screen. Mounted
// outside the workspace shell: no sign-in, no navigation; it sends no cookie and reads only `?gerai&kode`. It polls
// the server-built state every 2 s (paused while hidden) and takes a same-PC update from `/kasir` at once.

type Line = { kind: string; label: string; amountIdr: number }
type State =
  | { kind: "idle" }
  | { kind: "checkout"; courier: string; eta: string | null; billableWeightGram: number | null; destination: string | null; method: "qris" | "tunai" | "transfer" | "later" | null; lines: Line[]; totalIdr: number; codCollectionIdr: number | null; senderPayoutIdr: number | null }
  | { kind: "paid"; inv: string; courier: string | null; awb: string | null; paymentStatus: string; method: string | null; totalIdr: number; cashReceivedIdr: number | null; changeIdr: number | null; trackingUrl: string; trackingQrSvg: string }
interface View { state: State; updatedAt: number; outlet: { name: string; logoUrl: string | null; qrisUrl: string | null } }

const POLL_MS = 2000
const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`
const kg = (g: number) => `${g.toLocaleString("id-ID")} g · ${(g / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} kg`
const METHOD: Record<string, string> = { qris: "QRIS", tunai: "Tunai", transfer: "Transfer", later: "Bayar nanti", deposit: "Deposit" }
const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export function LayarPelangganPage() {
  const params = new URLSearchParams(window.location.search)
  const gerai = params.get("gerai") ?? ""
  const kode = params.get("kode") ?? ""
  const [view, setView] = useState<View | null>(null)
  const [ended, setEnded] = useState<string | null>(gerai && kode ? null : "Layar ini belum terhubung. Pindai QR dari layar kasir.")
  const [offline, setOffline] = useState(false)
  const endedRef = useRef(ended)
  useEffect(() => {
    endedRef.current = ended
  }, [ended])

  useEffect(() => {
    document.title = "Layar Pelanggan"
    if (!gerai || !kode) return
    let alive = true
    const url = `/api/app/customer-display/view?gerai=${encodeURIComponent(gerai)}&kode=${encodeURIComponent(kode)}`
    async function tick() {
      if (document.hidden || endedRef.current) return
      try {
        const res = await fetch(url, { credentials: "omit", cache: "no-store" })
        const j = (await res.json()) as { ok: true; data: View } | { ok: false; error: { code: string; message: string } }
        if (!alive) return
        setOffline(false)
        if (j.ok) setView(j.data)
        else if (res.status === 401 || res.status === 410) setEnded(j.error.message)
        else setOffline(true)
      } catch {
        if (alive) setOffline(true)
      }
    }
    void tick()
    const id = setInterval(() => void tick(), POLL_MS)
    const onVisible = () => !document.hidden && void tick()
    document.addEventListener("visibilitychange", onVisible)
    // Same PC: `/kasir` posts the server-built state the moment it changes (the poll stays the source of truth).
    let ch: BroadcastChannel | null = null
    try {
      ch = new BroadcastChannel(DISPLAY_CHANNEL)
      ch.onmessage = (e: MessageEvent<{ tenantSlug?: string; state?: State; updatedAt?: number }>) => {
        if (e.data?.tenantSlug === gerai && e.data.state) setView((v) => (v ? { ...v, state: e.data.state!, updatedAt: e.data.updatedAt ?? v.updatedAt } : v))
      }
    } catch {
      ch = null
    }
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
      ch?.close()
    }
  }, [gerai, kode])

  const outlet = view?.outlet
  return (
    <main className="flex min-h-svh flex-col bg-[#F6F7F9] px-4 py-4 text-slate-900 sm:px-6 sm:py-6 lg:px-10">
      <header className="mx-auto flex h-16 w-full max-w-6xl shrink-0 items-center gap-3">
        {outlet?.logoUrl ? (
          <img src={outlet.logoUrl} alt="" className="size-12 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
        ) : (
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">{(outlet?.name ?? "G").slice(0, 1).toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight">{outlet?.name ?? "GeraiExpress"}</p>
          <p className="text-xs text-slate-500">Layar pelanggan</p>
        </div>
        {offline && !ended ? <p role="status" className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">Koneksi terputus, mencoba lagi…</p> : null}
      </header>
      <section aria-live="polite" className="mx-auto mt-4 flex w-full max-w-6xl flex-1 flex-col rounded-2xl border border-slate-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8 lg:p-10">
        {ended ? <Disconnected message={ended} /> : !view ? <p className="m-auto text-base text-slate-500">Menghubungkan layar…</p> : <Stage view={view} />}
      </section>
    </main>
  )
}

function Stage({ view }: { view: View }) {
  const s = view.state
  if (s.kind === "checkout") return <Checkout s={s} qrisUrl={view.outlet.qrisUrl} />
  if (s.kind === "paid") return <Paid s={s} />
  return (
    <div className="m-auto flex max-w-xl flex-col items-center gap-4 text-center">
      <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-500"><PackageIcon className="size-8" /></span>
      <h1 className="text-2xl font-bold sm:text-3xl">Selamat datang di {view.outlet.name}</h1>
      <p className="text-base text-slate-600 sm:text-lg">Silakan serahkan paket untuk ditimbang dan dicek ongkirnya.</p>
      <p className="text-sm text-slate-500">Menunggu paket</p>
    </div>
  )
}

function Checkout({ s, qrisUrl }: { s: Extract<State, { kind: "checkout" }>; qrisUrl: string | null }) {
  const qris = s.method === "qris" && s.totalIdr > 0
  return (
    <div className={`grid content-start items-start gap-6 ${qris ? "lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-10" : ""}`}>
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-sm font-medium text-slate-500">Rincian pembayaran</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{s.courier}</h1>
          <p className="mt-1 text-sm text-slate-600 tabular-nums sm:text-base">
            {[s.billableWeightGram ? `Berat ditagih ${kg(s.billableWeightGram)}` : null, s.eta, s.destination ? `Tujuan ${s.destination}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <dl className="flex flex-col gap-2.5 text-base tabular-nums sm:text-lg">
          {s.lines.map((l) => (
            <div key={l.kind} className="flex items-baseline justify-between gap-4">
              <dt className="text-slate-600">{l.label}</dt>
              <dd className="text-right font-medium">{l.kind === "promo" ? `−${rp(l.amountIdr)}` : rp(l.amountIdr)}</dd>
            </div>
          ))}
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-dashed border-slate-300 pt-4">
            <dt className="text-base font-semibold sm:text-lg">Total Bayar</dt>
            <dd data-total className="text-[40px] leading-none font-bold tabular-nums">{rp(s.totalIdr)}</dd>
          </div>
        </dl>
        {s.totalIdr === 0 ? <p className="text-base text-slate-600">Tidak ada yang dibayar di loket.</p> : null}
        {s.codCollectionIdr !== null ? (
          <dl className="flex flex-col gap-1.5 rounded-xl bg-slate-50 px-4 py-3 text-sm tabular-nums sm:text-base">
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Ditagih kurir ke penerima (COD)</dt><dd className="font-medium">{rp(s.codCollectionIdr)}</dd></div>
            {s.senderPayoutIdr !== null ? <div className="flex justify-between gap-4"><dt className="text-slate-600">Estimasi cair ke pengirim</dt><dd className="font-medium">{rp(s.senderPayoutIdr)}</dd></div> : null}
          </dl>
        ) : null}
        {s.method && !qris && s.totalIdr > 0 ? <p className="text-base text-slate-600">Cara bayar: <span className="font-semibold text-slate-900">{METHOD[s.method]}</span></p> : null}
      </div>
      {qris ? (
        <aside aria-label="Bayar dengan QRIS" className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
          <p className="flex items-center gap-2 text-base font-semibold"><QrCodeIcon aria-hidden className="size-5" />Bayar dengan QRIS</p>
          {qrisUrl ? (
            <img src={qrisUrl} alt="QRIS gerai" className="aspect-square w-full max-w-[300px] rounded-xl border border-slate-200 bg-white object-contain p-2" />
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-base text-slate-600">Tunjukkan kode QRIS gerai di meja kasir.</p>
          )}
          <p className="text-sm text-slate-600">Total <span className="font-bold text-slate-900 tabular-nums">{rp(s.totalIdr)}</span></p>
        </aside>
      ) : null}
    </div>
  )
}

function Paid({ s }: { s: Extract<State, { kind: "paid" }> }) {
  const lunas = s.paymentStatus === "paid"
  return (
    <div className="grid flex-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="flex items-center gap-2 text-base font-semibold text-emerald-700"><CheckCircle2Icon aria-hidden className="size-6" />{lunas ? "Lunas" : s.paymentStatus === "unpaid" ? "Belum dibayar" : "Tercatat"}{lunas && s.method ? ` · ${METHOD[s.method] ?? s.method}` : ""}</p>
        <h1 className="text-[40px] leading-none font-bold">Terima kasih!</h1>
        <dl className="flex flex-col gap-2 text-base tabular-nums sm:text-lg">
          <div className="flex justify-between gap-4"><dt className="text-slate-600">Nomor kiriman</dt><dd className="font-semibold">INV {s.inv}</dd></div>
          {s.courier ? <div className="flex justify-between gap-4"><dt className="text-slate-600">Ekspedisi</dt><dd className="text-right font-medium">{s.courier}</dd></div> : null}
          {s.awb ? <div className="flex justify-between gap-4"><dt className="text-slate-600">No. resi</dt><dd className="font-mono font-medium break-all">{s.awb}</dd></div> : null}
          <div className="flex justify-between gap-4"><dt className="text-slate-600">Total</dt><dd className="font-semibold">{rp(s.totalIdr)}</dd></div>
          {s.cashReceivedIdr !== null ? <div className="flex justify-between gap-4"><dt className="text-slate-600">Tunai diterima</dt><dd className="font-medium">{rp(s.cashReceivedIdr)}</dd></div> : null}
          {s.changeIdr !== null ? <div className="flex justify-between gap-4"><dt className="text-slate-600">Kembalian</dt><dd className="font-semibold">{rp(s.changeIdr)}</dd></div> : null}
        </dl>
      </div>
      <figure className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
        <img src={svgSrc(s.trackingQrSvg)} alt={`QR lacak paket INV ${s.inv}`} className="aspect-square w-full max-w-[240px] rounded-lg bg-white" />
        <figcaption className="text-sm font-medium text-slate-700">QR Lacak Paket — pindai dengan kamera HP</figcaption>
      </figure>
    </div>
  )
}

function Disconnected({ message }: { message: string }) {
  return (
    <div className="m-auto flex max-w-lg flex-col items-center gap-3 text-center">
      <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-500"><MonitorOffIcon className="size-8" /></span>
      <h1 className="text-2xl font-bold">Layar belum terhubung</h1>
      <p className="text-base text-slate-600">{message}</p>
      <p className="text-sm text-slate-500">Di layar kasir, buka <span className="font-medium text-slate-700">Layar Pelanggan</span> lalu pindai QR-nya.</p>
    </div>
  )
}
