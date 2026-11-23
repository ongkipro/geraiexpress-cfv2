import { useEffect, useState } from "react"
import { DownloadIcon, PrinterIcon } from "lucide-react"
import { Button } from "../components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "../components/ui/field"
import { Input } from "../components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet"
import { Skeleton } from "../components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group"
import { api } from "../lib/api"
import { deviceDensity, setDeviceDensity, FORMAT_LABEL, PAPER_HINT, fetchPrint, connectBluetooth, printPdf, PrintError, type Format } from "./print"

// Print drawer (visual 04 §5): format, density, duplicate guard (`Cetak Ulang Label (sudah dicetak n×)` + reason),
// preview of the exact PDF, PDF/system print fallback when Bluetooth is unavailable or fails.
export function PrintDrawer({ slug, printCount, firstPrintedAt, onPrinted }: { slug: string; printCount: number; firstPrintedAt: number | null; onPrinted: () => void }) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>("label_10x15_with_stub")
  const [density, setDensity] = useState<"normal" | "tebal">(deviceDensity)
  const [reason, setReason] = useState("")
  const [previewState, setPreviewState] = useState<{ key: string; url: string | null }>({ key: "", url: null })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    api<{ format: Format }>("/print/settings").then((s) => setFormat(s.format)).catch(() => undefined)
  }, [])
  const previewKey = open && format !== "roll_58mm" ? `${slug}:${format}` : ""
  const preview = previewKey && previewState.key === previewKey ? previewState.url : null
  const previewLoading = Boolean(previewKey && previewState.key !== previewKey && !error)
  useEffect(() => {
    if (!previewKey) return
    let alive = true
    let url: string | null = null
    fetchPrint({ slugs: [slug], format, preview: true })
      .then(({ blob }) => {
        if (!alive) return
        url = URL.createObjectURL(blob)
        setError(null)
        setPreviewState({ key: previewKey, url })
      })
      .catch((e) => {
        if (!alive) return
        setPreviewState({ key: previewKey, url: null })
        setError(e instanceof PrintError ? e.message : "Pratinjau gagal dimuat.")
      })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [previewKey, format, slug])
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
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Pratinjau & Atur Cetak</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <ToggleGroup value={[format]} onValueChange={(v) => v[0] && setFormat(v[0] as Format)} variant="outline" aria-label="Format label" className="w-full flex-wrap">
              {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
                <ToggleGroupItem key={f} value={f}>{FORMAT_LABEL[f]}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-base md:text-sm text-muted-foreground">{PAPER_HINT[format]}. Cetak dengan skala 100% (ukuran asli).</p>
            {reprint ? (
              <Field data-invalid={error && !reason ? true : undefined}>
                <FieldLabel htmlFor="alasan-ulang">Alasan cetak ulang (dicatat)</FieldLabel>
                <Input id="alasan-ulang" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Contoh: label sobek" />
                <FieldDescription>Minimal 3 karakter untuk mengaktifkan tombol cetak ulang.</FieldDescription>
              </Field>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => go("auto")} disabled={pending || reasonInvalid}>{pending ? "Menyiapkan…" : format === "roll_58mm" ? (reprint ? "Cetak Ulang Bluetooth" : "Cetak Bluetooth") : reprint ? "Cetak Ulang" : "Cetak"}</Button>
              <Button variant="outline" onClick={() => go("pdf")} disabled={pending || reasonInvalid}>Buka PDF / Cetak Sistem</Button>
              {format !== "roll_58mm" ? (
                <Button variant="ghost" onClick={() => go("download")} disabled={pending || reasonInvalid}><DownloadIcon aria-hidden /> Unduh PDF</Button>
              ) : null}
            </div>
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
              >
                <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
                <ToggleGroupItem value="tebal">Tebal</ToggleGroupItem>
              </ToggleGroup>
            ) : previewLoading ? (
              <Skeleton className="h-[55vh] w-full" aria-label="Memuat pratinjau label" />
            ) : preview ? (
              <iframe title="Pratinjau label" src={preview} className="h-[55vh] w-full border-y" />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
