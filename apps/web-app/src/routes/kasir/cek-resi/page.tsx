import { courierLabel, statusLabel } from "../../../lib/status"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, SearchIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Field, FieldDescription, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { PageTitle } from "../../../shell/states"
import { Panel } from "../../../components/admin/page"
import { CourierLogo, type CourierKey } from "../../../components/admin/courier-logo"

// `/kasir/cek-resi` (spec 03 §1.4, DEC-229): one search (INV / AWB / HP penerima) → timeline per koli. An AWB not
// created by this gerai gets the courier's public tracking page instead (Mengantar only returns the seller's orders).
interface Item { slug: string; awb: string | null; courier: string; service: string; status: string; dispatchState: string; recipient: string | null; area: string | null; createdAt: number; history: Array<{ date: string; status: string | null; category: string | null }> | null; events: Array<{ source: string; raw_category: string | null; mapped_status: string | null; event_at: number }> }
type Result = { kind: "found"; items: Item[] } | { kind: "foreign"; awb: string } | { kind: "none" }
// The nine active Mengantar couriers' own public tracking pages (DEC-247), checked on the couriers' official sites on
// 2026-11-18. None is prefilled with the AWB: JNE and J&T gate the lookup behind a captcha and no other site documents
// a query parameter, so the operator pastes the resi there. SiCepat's tracking box is on its home page (its old
// `/checkAwb` redirects there); `sap-express.id` redirects to `sapx.id`.
const COURIER_TRACK: Array<{ key: CourierKey; name: string; url: string }> = [
  { key: "jne", name: "JNE", url: "https://www.jne.co.id/tracking-package" },
  { key: "jt", name: "J&T Express", url: "https://jet.co.id/track" },
  { key: "sicepat", name: "SiCepat", url: "https://www.sicepat.com/" },
  { key: "sap", name: "SAP Express", url: "https://www.sapx.id/id/cek-awb" },
  { key: "lion", name: "Lion Parcel", url: "https://lionparcel.com/track/stt" },
  { key: "anteraja", name: "Anteraja", url: "https://anteraja.id/id/tracking" },
  { key: "idexpress", name: "iDexpress", url: "https://idexpress.com/lacak-paket" },
  { key: "pos", name: "Pos Indonesia", url: "https://www.posindonesia.co.id/id/tracking" },
  { key: "spx", name: "SPX Express", url: "https://spx.co.id/track" },
]
const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms)

export function CekResiPage() {
  const qs = useRouterState({ select: (s) => { const v = (s.location.search as { q?: unknown }).q; return typeof v === "string" ? v : "" } })
  const initialQ = qs.trim()
  const [prevInitialQ, setPrevInitialQ] = useState(initialQ)
  const [q, setQ] = useState(initialQ)
  const [res, setRes] = useState<Result | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [loadedInitialQ, setLoadedInitialQ] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const gen = useRef(0)

  if (prevInitialQ !== initialQ) {
    setPrevInitialQ(initialQ)
    setQ(initialQ)
  }

  const runSearch = useCallback(async (term: string, fromUrl = false) => {
    const clean = term.trim()
    if (clean.length < 4) return
    const mine = ++gen.current
    setPending(true)
    setMsg(null)
    setRes(null)
    try {
      const r = await api<Result>(`/track?q=${encodeURIComponent(clean)}`)
      if (mine !== gen.current) return
      setRes(r)
      if (fromUrl) setLoadedInitialQ(clean)
    } catch (err) {
      if (mine !== gen.current) return
      setRes(null)
      setMsg(err instanceof ApiError ? err.body.message : "Pencarian gagal. Coba lagi.")
      if (fromUrl) setLoadedInitialQ(clean)
    } finally {
      if (mine === gen.current) setPending(false)
    }
  }, [])

  useEffect(() => {
    if (initialQ.length < 4) return
    const mine = ++gen.current
    api<Result>(`/track?q=${encodeURIComponent(initialQ)}`)
      .then((r) => {
        if (mine !== gen.current) return
        setMsg(null)
        setRes(r)
        setLoadedInitialQ(initialQ)
      })
      .catch((err) => {
        if (mine !== gen.current) return
        setRes(null)
        setMsg(err instanceof ApiError ? err.body.message : "Pencarian gagal. Coba lagi.")
        setLoadedInitialQ(initialQ)
      })
    const g = gen
    return () => { g.current++ }
  }, [initialQ])

  const busy = pending || (initialQ.length >= 4 && loadedInitialQ !== initialQ)

  function copyAwb(awb: string) {
    navigator.clipboard?.writeText(awb).then(
      () => {
        setCopied(awb)
        setTimeout(() => setCopied((c) => (c === awb ? null : c)), 2000)
      },
      () => undefined,
    )
  }

  async function search(e: FormEvent) {
    e.preventDefault()
    if (pending) return
    await runSearch(q)
  }
  return (
    <div className="pb-24 md:pb-0">
      <PageTitle title="Cek Resi" description="Lacak kiriman gerai ini lewat nomor INV, resi, atau HP penerima." />
      <Panel as="form" onSubmit={search} className="flex flex-wrap items-end gap-2" role="search">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="cari-resi">Nomor INV, resi, atau HP penerima</FieldLabel>
          <Input id="cari-resi" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="INV 8K4M2P7 / JP1234567890 / 0857…" />
          {msg ? <FieldDescription className="text-danger">{msg}</FieldDescription> : null}
        </Field>
        <Button type="submit" size="lg" disabled={busy || q.trim().length < 4}><SearchIcon aria-hidden /> {busy ? "Mencari…" : "Cari"}</Button>
      </Panel>
      <div className="mt-6" aria-live="polite">
        {busy ? <p className="text-base md:text-sm text-muted-foreground">Sedang melacak kiriman…</p> : null}
        {res?.kind === "none" ? <p className="text-base md:text-sm text-muted-foreground">Tidak ada kiriman yang cocok.</p> : null}
        {res?.kind === "foreign" ? (
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold md:text-base">Resi ini bukan kiriman gerai Anda</h2>
              <Button type="button" variant="outline" size="sm" onClick={() => copyAwb(res.awb)}>
                {copied === res.awb ? <><CheckIcon aria-hidden /> Tersalin</> : <><CopyIcon aria-hidden /> Salin Resi</>}
              </Button>
            </div>
            <p className="mt-1 text-base md:text-sm text-muted-foreground">Salin resi <span className="font-medium tabular-nums text-foreground">{res.awb}</span> lalu tempel di situs ekspedisinya:</p>
            <ul className="mt-3 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 lg:grid-cols-3">
              {COURIER_TRACK.map((c) => (
                <li key={c.key}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white pr-3 pl-1.5 text-base font-medium transition-colors outline-none hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm">
                    <CourierLogo code={c.key} name={c.name} decorative className="border-0" />
                    <span className="min-w-0 truncate">{c.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        {res?.kind === "found" ? (
          <ol className="flex flex-col gap-4">
            {res.items.map((it, i) => (
              <Panel as="li" key={it.slug}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold md:text-base">{res.items.length > 1 ? `Koli ${i + 1} · ` : ""}<Link to="/kiriman/$slug" params={{ slug: it.slug }} className="text-primary underline-offset-4 hover:underline tabular-nums">INV {it.slug.toUpperCase()}</Link></h2>
                  <div className="flex flex-wrap items-center gap-2 text-base md:text-sm tabular-nums">
                    <CourierLogo code={it.courier} name={courierLabel(it.courier)} decorative />
                    <span>{courierLabel(it.courier)} · {it.awb ?? "belum ada resi"}</span>
                    {it.awb ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => copyAwb(it.awb!)}>
                        {copied === it.awb ? <><CheckIcon aria-hidden /> Tersalin</> : <><CopyIcon aria-hidden /> Salin</>}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-base md:text-sm text-muted-foreground">{it.recipient ?? "—"}{it.area ? ` · ${it.area}` : ""} · dibuat {when(it.createdAt)}</p>
                <ol className="mt-3 flex flex-col gap-2 border-l-2 pl-4">
                  {(it.history ?? []).slice().reverse().map((h, j) => (
                    <li key={`h${j}`} className="text-base md:text-sm"><span className="tabular-nums text-muted-foreground">{h.date}</span> · {h.status ?? h.category}</li>
                  ))}
                  {!it.history?.length && it.events.length === 0 ? <li className="text-base md:text-sm text-muted-foreground">Belum ada riwayat perjalanan.</li> : null}
                  {!it.history?.length ? it.events.map((e, j) => <li key={`e${j}`} className="text-base md:text-sm"><span className="tabular-nums text-muted-foreground">{when(e.event_at)}</span> · {statusLabel(e.mapped_status)}</li>) : null}
                </ol>
              </Panel>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  )
}
