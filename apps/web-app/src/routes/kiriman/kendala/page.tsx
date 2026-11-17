import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { api, ApiError } from "../../../lib/api"
import { isOwner, useWorkspace } from "../../../shell/workspace"
import { EmptyState, ErrorState, LoadingState } from "../../../shell/states"
import { rp } from "../../kasir/quote-panel"
import { Panel } from "../../../components/admin/page"

// `Kendala & Klaim` (spec 04 §3): five sub-filters, per-courier claim countdown chips (Mengantar help 8140017),
// claim records with a ready-to-send packet, owner notes on `Status Bertentangan`.
type Bucket = "tidak_bergerak" | "gagal_antar" | "selisih_berat" | "bisa_klaim" | "bertentangan" | "perlu_tindakan"
interface Row { slug: string; awb: string | null; courier: string; status: string; recipient: string | null; last_scan_at: number | null; band: string | null; claim_kind: string | null; countdown: { label: string; tone: string; expired: boolean } | null; claim: { id: string; status: string } | null; adjustment_idr: number | null; conflict_note: string | null }
const BUCKETS: Array<{ id: Bucket; label: string }> = [
  { id: "tidak_bergerak", label: "Tidak Bergerak" },
  { id: "gagal_antar", label: "Gagal Antar" },
  { id: "selisih_berat", label: "Selisih Berat / Cordest" },
  { id: "bisa_klaim", label: "Bisa Klaim" },
  { id: "bertentangan", label: "Status Bertentangan" },
  { id: "perlu_tindakan", label: "Gagal Terbit / Diperiksa" },
]
const BAND: Record<string, string> = { "48j-4h": "48 jam–4 hari", "5-14h": "5–14 hari", "15-30h": "15–30 hari", ">30h": "> 30 hari" }
const CLAIM_STATUS: Record<string, string> = { draft: "Draf klaim", submitted: "Diajukan", approved: "Disetujui", rejected: "Ditolak", paid: "Dibayar", expired: "Kedaluwarsa" }
const TONE: Record<string, string> = { danger: "bg-danger text-white", warn: "bg-warn-bg text-foreground border border-warn", safe: "bg-safe-bg text-foreground border border-safe", muted: "bg-muted text-muted-foreground" }
const when = (ms: number | null) => (ms ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms) : "—")

export function Kendala() {
  const w = useWorkspace()
  const owner = isOwner(w)
  const [bucket, setBucket] = useState<Bucket>("tidak_bergerak")
  const [d, setD] = useState<{ counts: Record<Bucket, number>; rows: Row[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  // Only the latest bucket request may paint (a slower earlier bucket must not overwrite the one now selected).
  const gen = useRef(0)
  const load = useCallback(() => {
    const mine = ++gen.current
    api<{ counts: Record<Bucket, number>; rows: Row[] }>(`/exceptions?bucket=${bucket}`)
      .then((x) => {
        if (mine !== gen.current) return
        setError(null)
        setD(x)
      })
      .catch((e) => mine === gen.current && setError(e instanceof ApiError ? e.body.message : "Kendala tidak dapat dimuat."))
  }, [bucket])
  useEffect(load, [load])
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null)
    try {
      await fn()
      setMsg({ tone: "safe", text: ok })
      load()
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.body.message : "Gagal menyimpan." })
    }
  }
  if (error) return <ErrorState message={error} onRetry={load} />
  return (
    <div className="mb-6 flex flex-col gap-4">
      <div role="group" aria-label="Jenis kendala" className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <button key={b.id} type="button" aria-pressed={bucket === b.id} onClick={() => setBucket(b.id)} className={`h-11 rounded-full border px-4 text-base md:text-sm md:h-10 ${bucket === b.id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input"}`}>
            {b.label}{d ? <span className="ml-1 tabular-nums text-muted-foreground">({d.counts[b.id]})</span> : null}
          </button>
        ))}
      </div>
      {msg ? <p role={msg.tone === "danger" ? "alert" : "status"} className={`border-l-4 py-1 pl-3 text-base md:text-sm font-medium ${msg.tone === "danger" ? "border-danger text-danger" : "border-safe text-safe"}`}>{msg.text}</p> : null}
      {!d ? <LoadingState label="Memuat kendala" /> : d.rows.length === 0 ? (
        <EmptyState title="Tidak ada kendala" body="Kiriman di kategori ini akan muncul di sini." />
      ) : (
        <ul className="flex flex-col gap-3">
          {d.rows.map((r) => <KendalaRow key={r.slug} r={r} bucket={bucket} owner={owner} act={act} />)}
        </ul>
      )}
      <p className="text-base md:text-sm text-muted-foreground">Batas klaim mengikuti ketentuan Mengantar per ekspedisi. Batas berbasis hari kerja ditampilkan sebagai hari kalender, jadi bisa lebih cepat dari sebenarnya.</p>
    </div>
  )
}

function KendalaRow({ r, bucket, owner, act }: { r: Row; bucket: Bucket; owner: boolean; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [note, setNote] = useState(r.conflict_note ?? "")
  return (
    <Panel as="li" className="flex flex-col gap-2 md:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="font-medium text-primary underline-offset-4 hover:underline tabular-nums">INV {r.slug.toUpperCase()}</Link>
        <span className="text-base md:text-sm text-muted-foreground tabular-nums">{r.courier} · {r.awb ?? "—"} · {r.recipient ?? "—"}</span>
      </div>
      <p className="text-base md:text-sm">
        Scan terakhir {when(r.last_scan_at)}{r.band ? ` · tidak bergerak ${BAND[r.band]}` : ""}
        {r.adjustment_idr ? <span className="font-medium"> · penyesuaian Mengantar {rp(r.adjustment_idr)}</span> : null}
      </p>
      {r.claim_kind ? (
        <div className="flex flex-wrap items-center gap-2">
          {r.countdown ? <span className={`inline-flex h-8 items-center rounded-full px-3 text-base md:text-sm font-medium ${TONE[r.countdown.tone]}`}>{r.countdown.expired ? "Kedaluwarsa" : `Bisa Klaim — ${r.countdown.label}`}</span> : null}
          {r.claim ? (
            <>
              <span className="text-base md:text-sm">Klaim {r.claim_kind}: {CLAIM_STATUS[r.claim.status] ?? r.claim.status}</span>
              <a href={`/api/app/claims/${r.claim.id}/packet`} target="_blank" rel="noopener" className="text-base md:text-sm text-primary underline-offset-4 hover:underline">Paket klaim</a>
              {r.claim.status === "draft" ? <Button variant="outline" onClick={() => act(() => api(`/claims/${r.claim!.id}/status`, { body: { status: "submitted" } }), "Klaim ditandai sudah diajukan ke Mengantar.")}>Tandai Sudah Diajukan</Button> : null}
              {owner && r.claim.status === "submitted" ? (
                <>
                  <Button variant="outline" onClick={() => act(() => api(`/claims/${r.claim!.id}/status`, { body: { status: "approved" } }), "Klaim disetujui.")}>Disetujui</Button>
                  <Button variant="ghost" onClick={() => act(() => api(`/claims/${r.claim!.id}/status`, { body: { status: "rejected" } }), "Klaim ditolak.")}>Ditolak</Button>
                </>
              ) : null}
            </>
          ) : !r.countdown?.expired ? (
            <Button onClick={() => act(() => api(`/shipments/${r.slug}/claim`, { body: { kind: r.claim_kind } }), "Draf klaim dibuat. Kirim paket klaim ke Live Chat Mengantar.")}>Ajukan Klaim</Button>
          ) : null}
        </div>
      ) : null}
      {bucket === "bertentangan" && owner ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-base md:text-sm">Catatan pengecekan<Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
          <Button variant="outline" onClick={() => act(() => api(`/shipments/${r.slug}/conflict-note`, { body: { note, resolve: true } }), "Catatan disimpan dan kendala ditutup.")}>Simpan & Tutup</Button>
        </div>
      ) : null}
    </Panel>
  )
}
