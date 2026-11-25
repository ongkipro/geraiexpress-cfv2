import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "../../../components/ui/button"
import { Field, FieldDescription, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { api, ApiError } from "../../../lib/api"
import { courierLabel } from "../../../lib/status"
import { FORMAT_LABEL, fetchPrint, printPdf, PrintError, type Format } from "../../../print/print"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../../shell/states"
import { CheckboxField, Panel } from "../../../components/admin/page"
import { DEFAULT_PAGE_SIZE, PageNav, paginate } from "../../../components/admin/pagination"

// `Cetak Resi Massal` (visual 07, DEC-225/229): filter Belum/Sudah Cetak, select up to 50 with a live counter, one
// merged exact-size PDF; reprints require a reason.
interface Row { slug: string; awb: string; courier: string; recipient: string; print_count: number; issued_at: number }
const MAX = 50
const when = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ms)

export function CetakMassalPage() {
  const [status, setStatus] = useState<"belum" | "sudah">("belum")
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [errState, setErrState] = useState<{ status: string; msg: string } | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<Format>("label_10x15_with_stub")
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  // Only the latest request may paint: the first (Belum Cetak) list must not overwrite Sudah Cetak when it resolves late.
  const gen = useRef(0)
  const load = useCallback(() => {
    const mine = ++gen.current
    api<{ items: Row[] }>(`/print/list?status=${status}`)
      .then((d) => {
        if (mine !== gen.current) return
        setErrState(null)
        setRows(d.items)
        setSel(new Set())
        setLoadedStatus(status)
      })
      .catch((e) => {
        if (mine !== gen.current) return
        setErrState({ status, msg: e instanceof ApiError ? e.body.message : "Daftar tidak dapat dimuat." })
        setLoadedStatus(status)
      })
  }, [status])
  useEffect(() => {
    load()
    const g = gen
    return () => { g.current++ }
  }, [load])
  const error = errState?.status === status ? errState.msg : null
  const loading = loadedStatus !== status && !error
  const toggle = (slug: string) => setSel((s) => {
    const n = new Set(s)
    if (n.has(slug)) n.delete(slug)
    else if (n.size < MAX) n.add(slug)
    return n
  })
  const selectableCount = Math.min(rows?.length ?? 0, MAX)
  const allSelected = selectableCount > 0 && sel.size === selectableCount
  function toggleAll() {
    if (!rows?.length) return
    setSel(allSelected ? new Set() : new Set(rows.slice(0, MAX).map((r) => r.slug)))
  }
  const anyReprint = rows?.some((r) => sel.has(r.slug) && r.print_count > 0) ?? false
  async function go() {
    if (pending) return
    setPending(true)
    setMsg(null)
    try {
      const { blob, refused } = await fetchPrint({ slugs: [...sel], format: format === "roll_58mm" ? "label_10x15_with_stub" : format, reason: anyReprint ? reason : undefined })
      printPdf(blob)
      setMsg({ tone: "safe", text: `${sel.size - refused} label disiapkan${refused ? `, ${refused} dilewati (belum ada resi)` : ""}.` })
      load()
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof PrintError ? e.message : "Gagal mencetak." })
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="pb-24 md:pb-0">
      <PageTitle title="Cetak Resi Massal" description="Pilih sampai 50 kiriman, cetak sekaligus dalam satu PDF." />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            value={[status]}
            onValueChange={(v) => {
              if (v[0]) {
                setStatus(v[0] as "belum" | "sudah")
                setPage(1)
              }
            }}
            variant="outline"
            aria-label="Status cetak"
          >
            <ToggleGroupItem value="belum">Belum Cetak</ToggleGroupItem>
            <ToggleGroupItem value="sudah">Sudah Cetak</ToggleGroupItem>
          </ToggleGroup>
          {rows && rows.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
              {allSelected ? "Batal Pilih Semua" : `Pilih Semua (${selectableCount})`}
            </Button>
          ) : null}
        </div>
        <ToggleGroup value={[format]} onValueChange={(v) => v[0] && setFormat(v[0] as Format)} variant="outline" aria-label="Format label" className="flex-wrap">
          {(["label_10x15_with_stub", "label_10x10", "label_10x15"] as Format[]).map((f) => <ToggleGroupItem key={f} value={f}>{FORMAT_LABEL[f]}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <Panel className="p-0 md:p-0">
        {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : !rows || loading ? <div className="p-4"><LoadingState label="Memuat kiriman" /></div> : rows.length === 0 ? (
          <EmptyState title={status === "belum" ? "Semua resi sudah dicetak" : "Belum ada resi yang dicetak"} body="Kiriman dengan resi terbit akan tampil di sini." />
        ) : (() => {
          const paged = paginate(rows, page, DEFAULT_PAGE_SIZE)
          return (
            <>
              <ul className="divide-y" aria-label="Kiriman siap cetak">
                {paged.items.map((r) => (
                  <li key={r.slug} className="flex items-center justify-between gap-2 pr-3">
                    <CheckboxField className="flex-1 px-4 py-2" checked={sel.has(r.slug)} onCheckedChange={() => toggle(r.slug)} disabled={!sel.has(r.slug) && sel.size >= MAX}>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium tabular-nums">INV {r.slug.toUpperCase()} · {courierLabel(r.courier)} · {r.awb}</span>
                        <span className="text-muted-foreground tabular-nums">{r.recipient} · {when(r.issued_at)}{r.print_count ? ` · dicetak ${r.print_count}×` : ""}</span>
                      </span>
                    </CheckboxField>
                    <Link to="/kiriman/$slug" params={{ slug: r.slug }} className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline">
                      Detail
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100 px-4 py-3">
                <PageNav page={paged.page} totalPages={paged.totalPages} total={paged.total} pageSize={paged.pageSize} onPageChange={setPage} itemLabel="kiriman" />
              </div>
            </>
          )
        })()}
      </Panel>
      {anyReprint ? (
        <Field className="mt-4">
          <FieldLabel htmlFor="alasan-massal">Alasan cetak ulang (dicatat)</FieldLabel>
          <Input id="alasan-massal" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Contoh: label sobek" />
          <FieldDescription>Minimal 3 karakter untuk mengaktifkan cetak ulang.</FieldDescription>
        </Field>
      ) : null}
      {msg ? <p role="status" className={`mt-4 border-l-4 py-1 pl-3 text-base md:text-sm font-medium ${msg.tone === "safe" ? "border-safe text-safe" : "border-danger text-danger"}`}>{msg.text}</p> : null}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t bg-card p-3 md:static md:mt-4 md:border-0 md:bg-transparent md:p-0">
        <span className="text-base md:text-sm tabular-nums">{sel.size} / {MAX} dipilih</span>
        <Button size="lg" onClick={go} disabled={pending || sel.size === 0 || (anyReprint && reason.trim().length < 3)}>{pending ? "Menyiapkan…" : `Cetak (${sel.size})`}</Button>
      </div>
    </div>
  )
}
