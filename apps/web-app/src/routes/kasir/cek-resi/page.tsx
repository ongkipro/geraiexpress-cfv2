import { statusLabel } from "../../../lib/status"
import { useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { SearchIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Field, FieldDescription, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { PageTitle } from "../../../shell/states"

// `/kasir/cek-resi` (spec 03 §1.4, DEC-229): one search (INV / AWB / HP penerima) → timeline per koli. An AWB not
// created by this gerai gets the courier's public tracking page instead (Mengantar only returns the seller's orders).
interface Item { slug: string; awb: string | null; courier: string; service: string; status: string; dispatchState: string; recipient: string | null; area: string | null; createdAt: number; history: Array<{ date: string; status: string | null; category: string | null }> | null; events: Array<{ source: string; raw_category: string | null; mapped_status: string | null; event_at: number }> }
type Result = { kind: "found"; items: Item[] } | { kind: "foreign"; awb: string } | { kind: "none" }
// Official public tracking pages (couriers' own sites).
const COURIER_TRACK: Array<[string, string]> = [
  ["JNE", "https://www.jne.co.id/tracking-package"],
  ["J&T", "https://jet.co.id/track"],
  ["SiCepat", "https://www.sicepat.com/checkAwb"],
]
const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(ms)

export function CekResiPage() {
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Result | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function search(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setMsg(null)
    try {
      setRes(await api<Result>(`/track?q=${encodeURIComponent(q.trim())}`))
    } catch (err) {
      setRes(null)
      setMsg(err instanceof ApiError ? err.body.message : "Pencarian gagal. Coba lagi.")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="pb-24 md:pb-0">
      <nav aria-label="Breadcrumb" className="mb-2 text-base text-muted-foreground"><Link to="/kasir" className="text-primary underline-offset-4 hover:underline">Buat Pengiriman</Link> › Cek Resi</nav>
      <PageTitle title="Cek Resi" description="Lacak kiriman gerai ini lewat nomor INV, resi, atau HP penerima." />
      <form onSubmit={search} className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4 md:p-6" role="search">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="cari-resi">Nomor INV, resi, atau HP penerima</FieldLabel>
          <Input id="cari-resi" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="INV 8K4M2P7 / JP1234567890 / 0857…" />
          {msg ? <FieldDescription className="text-danger">{msg}</FieldDescription> : null}
        </Field>
        <Button type="submit" size="lg" disabled={pending || q.trim().length < 4}><SearchIcon aria-hidden /> Cari</Button>
      </form>
      <div className="mt-6" aria-live="polite">
        {res?.kind === "none" ? <p className="text-base text-muted-foreground">Tidak ada kiriman yang cocok.</p> : null}
        {res?.kind === "foreign" ? (
          <section className="rounded-lg border bg-card p-4 md:p-6">
            <h3 className="text-lg font-semibold">Resi ini bukan kiriman gerai Anda</h3>
            <p className="mt-1 text-base text-muted-foreground">Lacak resi <span className="font-medium tabular-nums text-foreground">{res.awb}</span> di situs ekspedisinya:</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {COURIER_TRACK.map(([name, url]) => <li key={name}><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-lg border px-4 text-base font-medium">{name}</a></li>)}
            </ul>
          </section>
        ) : null}
        {res?.kind === "found" ? (
          <ol className="flex flex-col gap-4">
            {res.items.map((it, i) => (
              <li key={it.slug} className="rounded-lg border bg-card p-4 md:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">{res.items.length > 1 ? `Koli ${i + 1} · ` : ""}<Link to="/kiriman/$slug" params={{ slug: it.slug }} className="text-primary underline-offset-4 hover:underline tabular-nums">INV {it.slug.toUpperCase()}</Link></h3>
                  <p className="text-base tabular-nums">{it.courier} · {it.awb ?? "belum ada resi"}</p>
                </div>
                <p className="text-base text-muted-foreground">{it.recipient ?? "—"}{it.area ? ` · ${it.area}` : ""} · dibuat {when(it.createdAt)}</p>
                <ol className="mt-3 flex flex-col gap-2 border-l-2 pl-4">
                  {(it.history ?? []).slice().reverse().map((h, j) => (
                    <li key={`h${j}`} className="text-base"><span className="tabular-nums text-muted-foreground">{h.date}</span> · {h.status ?? h.category}</li>
                  ))}
                  {!it.history?.length && it.events.length === 0 ? <li className="text-base text-muted-foreground">Belum ada riwayat perjalanan.</li> : null}
                  {!it.history?.length ? it.events.map((e, j) => <li key={`e${j}`} className="text-base"><span className="tabular-nums text-muted-foreground">{when(e.event_at)}</span> · {statusLabel(e.mapped_status)}</li>) : null}
                </ol>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  )
}
