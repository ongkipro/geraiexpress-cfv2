import { useCallback, useEffect, useState } from "react"
import { Button } from "../../../components/ui/button"
import { Field, FieldLabel } from "../../../components/ui/field"
import { Input } from "../../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { api, ApiError } from "../../../lib/api"
import { FORMAT_LABEL, fetchPrint, printPdf, PrintError, type Format } from "../../../print/print"
import { EmptyState, ErrorState, LoadingState, PageTitle } from "../../../shell/states"
import { CheckboxField, Panel } from "../../../components/admin/page"

// `Cetak Resi Massal` (visual 07, DEC-225/229): filter Belum/Sudah Cetak, select up to 50 with a live counter, one
// merged exact-size PDF; reprints require a reason.
interface Row { slug: string; awb: string; courier: string; recipient: string; print_count: number; issued_at: number }
const MAX = 50

export function CetakMassalPage() {
  const [status, setStatus] = useState<"belum" | "sudah">("belum")
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<Format>("label_10x15_with_stub")
  const [reason, setReason] = useState("")
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  const load = useCallback(() => {
    api<{ items: Row[] }>(`/print/list?status=${status}`)
      .then((d) => {
        setError(null)
        setRows(d.items)
        setSel(new Set())
      })
      .catch((e) => setError(e instanceof ApiError ? e.body.message : "Daftar tidak dapat dimuat."))
  }, [status])
  useEffect(load, [load])
  const toggle = (slug: string) => setSel((s) => {
    const n = new Set(s)
    if (n.has(slug)) n.delete(slug)
    else if (n.size < MAX) n.add(slug)
    return n
  })
  const anyReprint = rows?.some((r) => sel.has(r.slug) && r.print_count > 0) ?? false
  async function go() {
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
        <ToggleGroup value={[status]} onValueChange={(v) => v[0] && setStatus(v[0] as "belum" | "sudah")} variant="outline" aria-label="Status cetak">
          <ToggleGroupItem value="belum">Belum Cetak</ToggleGroupItem>
          <ToggleGroupItem value="sudah">Sudah Cetak</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup value={[format]} onValueChange={(v) => v[0] && setFormat(v[0] as Format)} variant="outline" aria-label="Format label" className="flex-wrap">
          {(["label_10x15_with_stub", "label_10x10", "label_10x15"] as Format[]).map((f) => <ToggleGroupItem key={f} value={f}>{FORMAT_LABEL[f]}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <Panel className="p-0 md:p-0">
        {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : !rows ? <div className="p-4"><LoadingState label="Memuat kiriman" /></div> : rows.length === 0 ? (
          <EmptyState title={status === "belum" ? "Semua resi sudah dicetak" : "Belum ada resi yang dicetak"} body="Kiriman dengan resi terbit akan tampil di sini." />
        ) : (
          <ul className="divide-y" aria-label="Kiriman siap cetak">
            {rows.map((r) => (
              <li key={r.slug}>
                <CheckboxField className="px-4 py-2" checked={sel.has(r.slug)} onCheckedChange={() => toggle(r.slug)} disabled={!sel.has(r.slug) && sel.size >= MAX}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium tabular-nums">INV {r.slug.toUpperCase()} · {r.courier} · {r.awb}</span>
                    <span className="text-muted-foreground">{r.recipient}{r.print_count ? ` · dicetak ${r.print_count}×` : ""}</span>
                  </span>
                </CheckboxField>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {anyReprint ? (
        <Field className="mt-4">
          <FieldLabel htmlFor="alasan-massal">Alasan cetak ulang (dicatat)</FieldLabel>
          <Input id="alasan-massal" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </Field>
      ) : null}
      {msg ? <p role="status" className={`mt-4 border-l-4 py-1 pl-3 text-base font-medium ${msg.tone === "safe" ? "border-safe text-safe" : "border-danger text-danger"}`}>{msg.text}</p> : null}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t bg-card p-3 md:static md:mt-4 md:border-0 md:bg-transparent md:p-0">
        <span className="text-base tabular-nums">{sel.size} / {MAX} dipilih</span>
        <Button size="lg" onClick={go} disabled={pending || sel.size === 0 || (anyReprint && reason.trim().length < 3)}>{pending ? "Menyiapkan…" : `Cetak (${sel.size})`}</Button>
      </div>
    </div>
  )
}
