import { useEffect, useState } from "react"
import { CheckIcon, DownloadIcon, PrinterIcon, QrCodeIcon, ScissorsIcon } from "lucide-react"
import { Button } from "../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../components/ui/field"
import { Input } from "../components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../components/ui/sheet"
import { Skeleton } from "../components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group"
import { api } from "../lib/api"
import {
  connectBluetooth,
  deviceDensity,
  fetchPrint,
  fetchRollPreview,
  FORMAT_LABEL,
  FORMAT_SUB,
  PAPER_HINT,
  PrintError,
  printPdf,
  setDeviceDensity,
  type Format,
  type RollPreviewLine,
} from "./print"

// Print drawer (visual 04 §5): 2x2 paper format cards, live true-paper preview for both 100 mm PDFs and 58 mm rolls,
// thermal density toggle, duplicate-print guard (`Cetak Ulang Label (sudah dicetak n×)` + reason), and instant PDF fallback.
const FORMATS: Format[] = ["label_10x15_with_stub", "label_10x10", "label_10x15", "roll_58mm"]

function RollPaperPreview({ lines, density }: { lines: RollPreviewLine[]; density: "normal" | "tebal" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100/90 p-4">
      <div
        aria-label="Pratinjau label 58 mm"
        className={`mx-auto max-w-[292px] rounded-sm border border-slate-200 bg-white px-3 py-3.5 font-mono text-[11px] leading-[1.35] text-slate-950 shadow-sm ${density === "tebal" ? "font-semibold" : ""}`}
      >
        {lines.map((line, i) => {
          if ("cut" in line) {
            return (
              <div key={i} className="my-2 flex items-center gap-1.5 border-t border-dashed border-slate-400 pt-1 text-[10px] text-slate-500">
                <ScissorsIcon className="size-3 shrink-0" aria-hidden />
                <span>Potong kertas di sini</span>
              </div>
            )
          }
          if ("barcode" in line) {
            return (
              <div key={i} className="my-1.5 flex flex-col items-center py-1" aria-label={`Barcode ${line.barcode}`}>
                <div
                  className="h-9 w-4/5"
                  style={{
                    backgroundImage: "repeating-linear-gradient(90deg, #0f172a 0 2px, transparent 2px 3px, #0f172a 3px 4px, transparent 4px 6px, #0f172a 6px 9px, transparent 9px 11px)",
                  }}
                />
              </div>
            )
          }
          if ("qr" in line) {
            return (
              <div key={i} className="my-2 flex flex-col items-center gap-0.5 text-[10px] text-slate-600">
                <div className="grid size-14 place-items-center rounded border border-slate-900 bg-white">
                  <QrCodeIcon className="size-10 text-slate-950" aria-hidden />
                </div>
                <span>QR Lacak</span>
              </div>
            )
          }
          const isCutMarker = line.text.includes("Potong Disini")
          if (isCutMarker) {
            return (
              <div key={i} className="my-2 flex items-center gap-1.5 border-y border-dashed border-slate-400 py-1 text-[10px] font-medium text-slate-600">
                <ScissorsIcon className="size-3 shrink-0" aria-hidden />
                <span className="mx-auto">Potong di sini — pisahkan bukti kirim</span>
              </div>
            )
          }
          return (
            <div
              key={i}
              className={`whitespace-pre ${line.invert ? "my-0.5 bg-slate-950 px-0.5 text-white" : ""} ${line.bold ? "font-bold" : ""}`}
            >
              {line.text || "\u00a0"}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PrintDrawer({ slug, printCount, firstPrintedAt, onPrinted }: { slug: string; printCount: number; firstPrintedAt: number | null; onPrinted: () => void }) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>("label_10x15_with_stub")
  const [density, setDensity] = useState<"normal" | "tebal">(deviceDensity)
  const [reason, setReason] = useState("")
  const [pdfPreview, setPdfPreview] = useState<{ key: string; url: string | null }>({ key: "", url: null })
  const [rollPreview, setRollPreview] = useState<{ key: string; lines: RollPreviewLine[] }>({ key: "", lines: [] })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    api<{ format: Format }>("/print/settings").then((s) => setFormat(s.format)).catch(() => undefined)
  }, [])

  const pdfKey = open && format !== "roll_58mm" ? `${slug}:${format}` : ""
  const rollKey = open && format === "roll_58mm" ? `${slug}:roll_58mm` : ""
  const previewUrl = pdfKey && pdfPreview.key === pdfKey ? pdfPreview.url : null
  const rollLines = rollKey && rollPreview.key === rollKey ? rollPreview.lines : null
  const previewLoading = Boolean((pdfKey && pdfPreview.key !== pdfKey && !error) || (rollKey && rollPreview.key !== rollKey && !error))

  useEffect(() => {
    if (!pdfKey) return
    let alive = true
    fetchPrint({ slugs: [slug], format, preview: true, as: "svg" })
      .then(async ({ blob }) => {
        const svg = await blob.text()
        if (!alive) return
        setError(null)
        setPdfPreview({ key: pdfKey, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` })
      })
      .catch((e) => {
        if (!alive) return
        setPdfPreview({ key: pdfKey, url: null })
        setError(e instanceof PrintError ? e.message : "Pratinjau gagal dimuat.")
      })
    return () => {
      alive = false
    }
  }, [pdfKey, format, slug])

  useEffect(() => {
    if (!rollKey) return
    let alive = true
    fetchRollPreview(slug)
      .then((lines) => {
        if (!alive) return
        setError(null)
        setRollPreview({ key: rollKey, lines })
      })
      .catch((e) => {
        if (!alive) return
        setRollPreview({ key: rollKey, lines: [] })
        setError(e instanceof PrintError ? e.message : "Pratinjau 58 mm gagal dimuat.")
      })
    return () => {
      alive = false
    }
  }, [rollKey, slug])

  const reprint = printCount > 0
  const time = firstPrintedAt ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(firstPrintedAt) : ""

  async function go(mode: "auto" | "pdf" | "download") {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      if (format === "roll_58mm" && mode === "auto") {
        // Connect first: the print is recorded (print_count) only when the printer is really there.
        const write = await connectBluetooth()
        if (!write) {
          setError("Printer Bluetooth tidak tersedia. Gunakan Buka PDF / Cetak Sistem.")
          return
        }
        const { blob } = await fetchPrint({ slugs: [slug], format, reason: reprint ? reason : undefined, density })
        await write(new Uint8Array(await blob.arrayBuffer()))
      } else {
        // 58 mm bytes are not a PDF: the system-print fallback uses the 10×15 label PDF.
        const pdfFormat = format === "roll_58mm" ? "label_10x15_with_stub" : format
        const { blob } = await fetchPrint({ slugs: [slug], format: pdfFormat, reason: reprint ? reason : undefined, density })
        if (mode === "download") {
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = `label-${slug}.pdf`
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 10_000)
        } else if (mode === "pdf") {
          const url = URL.createObjectURL(blob)
          const tab = window.open(url, "_blank")
          if (tab) tab.opener = null
          else printPdf(blob)
          setTimeout(() => URL.revokeObjectURL(url), 60_000)
        } else {
          printPdf(blob)
        }
      }
      onPrinted()
    } catch (e) {
      setError(e instanceof PrintError ? e.message : "Gagal mencetak. Coba lagi.")
    } finally {
      setPending(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setError(null)
      setReason("")
    }
  }

  const reasonInvalid = reprint && reason.trim().length < 3
  return (
    <>
      <Button size="lg" variant={reprint ? "outline" : "default"} className={reprint ? "border-warn text-warn" : ""} onClick={() => setOpen(true)}>
        <PrinterIcon aria-hidden /> {reprint ? `Cetak Ulang Label (sudah dicetak ${printCount}×${time ? ` · ${time}` : ""})` : "Cetak Label"}
      </Button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-[92vw] data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Pratinjau & Atur Cetak</SheetTitle>
            <SheetDescription>Pilih ukuran kertas thermal yang terpasang di printer loket.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <div role="radiogroup" aria-label="Format label" className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => {
                const active = format === f
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFormat(f)}
                    className={`flex min-h-11 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${active ? "border-primary bg-accent/60 text-slate-950 ring-1 ring-primary/30" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    <span className="flex w-full items-start justify-between gap-1.5 text-sm font-semibold leading-snug">
                      <span>{FORMAT_LABEL[f]}</span>
                      {active ? <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden /> : null}
                    </span>
                    <span className="text-xs leading-snug text-muted-foreground">{FORMAT_SUB[f]}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <span>
                <strong className="font-semibold text-slate-950">{PAPER_HINT[format]}</strong>
                {format !== "roll_58mm" ? " · Skala 100% (ukuran asli) · Tanpa margin" : " · Printer thermal Bluetooth"}
              </span>
              {format === "roll_58mm" ? (
                <ToggleGroup
                  value={[density]}
                  onValueChange={(v) => {
                    const d = v[0] as "normal" | "tebal" | undefined
                    if (!d) return
                    setDensity(d)
                    setDeviceDensity(d)
                  }}
                  variant="outline"
                  aria-label="Ketebalan tinta"
                  className="bg-white"
                >
                  <ToggleGroupItem value="normal" className="h-8 px-2.5 text-xs">Normal</ToggleGroupItem>
                  <ToggleGroupItem value="tebal" className="h-8 px-2.5 text-xs">Tebal</ToggleGroupItem>
                </ToggleGroup>
              ) : null}
            </div>

            {reprint ? (
              <Field data-invalid={error && !reason ? true : undefined}>
                <FieldLabel htmlFor="alasan-ulang">Alasan cetak ulang (dicatat)</FieldLabel>
                <Input id="alasan-ulang" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Contoh: label sobek atau kertas macet" />
                <FieldDescription>Minimal 3 karakter untuk mengaktifkan tombol cetak ulang.</FieldDescription>
              </Field>
            ) : null}

            {error ? <FieldError>{error}</FieldError> : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => go("auto")} disabled={pending || reasonInvalid}>
                <PrinterIcon aria-hidden /> {pending ? "Menyiapkan…" : format === "roll_58mm" ? (reprint ? "Cetak Ulang Bluetooth" : "Cetak Bluetooth") : reprint ? "Cetak Ulang" : "Cetak"}
              </Button>
              <Button variant="outline" onClick={() => go("pdf")} disabled={pending || reasonInvalid}>Buka PDF / Cetak Sistem</Button>
              {format !== "roll_58mm" ? (
                <Button variant="ghost" onClick={() => go("download")} disabled={pending || reasonInvalid}><DownloadIcon aria-hidden /> Unduh PDF</Button>
              ) : null}
            </div>

            {previewLoading ? (
              <Skeleton className="h-[54vh] w-full rounded-xl" aria-label="Memuat pratinjau label" />
            ) : format === "roll_58mm" && rollLines && rollLines.length > 0 ? (
              <RollPaperPreview lines={rollLines} density={density} />
            ) : previewUrl ? (
              <div className="rounded-xl border border-slate-200 bg-slate-100/90 p-3">
                <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>Pratinjau ukuran asli ({format === "label_10x10" ? "100 × 100 mm" : "100 × 150 mm"})</span>
                  <span>203 dpi · monokrom</span>
                </div>
                <img
                  title="Pratinjau label"
                  alt={`Pratinjau ${FORMAT_LABEL[format]}`}
                  src={previewUrl}
                  className="mx-auto block w-full max-w-[356px] rounded-sm bg-white shadow-sm ring-1 ring-slate-300/80"
                />
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
