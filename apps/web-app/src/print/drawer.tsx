import { useEffect, useState } from "react"
import { PrinterIcon } from "lucide-react"
import { Button } from "../components/ui/button"
import { Field, FieldError, FieldLabel } from "../components/ui/field"
import { Input } from "../components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group"
import { api } from "../lib/api"
import { deviceDensity, FORMAT_LABEL, PAPER_HINT, fetchPrint, printBluetooth, printPdf, PrintError, type Format } from "./print"

// Print drawer (visual 04 §5): format, density, duplicate guard (`Cetak Ulang Label (sudah dicetak n×)` + reason),
// preview of the exact PDF, PDF/system print fallback when Bluetooth is unavailable or fails.
export function PrintDrawer({ slug, printCount, firstPrintedAt, onPrinted }: { slug: string; printCount: number; firstPrintedAt: number | null; onPrinted: () => void }) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>("label_10x15_with_stub")
  const [density, setDensity] = useState<"normal" | "tebal">(deviceDensity)
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    api<{ format: Format }>("/print/settings").then((s) => setFormat(s.format)).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!open || format === "roll_58mm") return
    let alive = true
    let url: string | null = null
    fetchPrint({ slugs: [slug], format, preview: true })
      .then(({ blob }) => {
        if (!alive) return
        url = URL.createObjectURL(blob)
        setPreview(url)
      })
      .catch((e) => alive && setError(e instanceof PrintError ? e.message : "Pratinjau gagal dimuat."))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, format, slug])
  const reprint = printCount > 0
  const time = firstPrintedAt ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(firstPrintedAt) : ""

  async function go(mode: "auto" | "pdf") {
    setPending(true)
    setError(null)
    try {
      const { blob } = await fetchPrint({ slugs: [slug], format, reason: reprint ? reason : undefined, density })
      if (format === "roll_58mm" && mode === "auto") {
        const sent = await printBluetooth(new Uint8Array(await blob.arrayBuffer())).catch(() => false)
        if (!sent) setError("Printer Bluetooth tidak tersedia. Gunakan Buka PDF / Cetak Sistem.")
      } else printPdf(blob)
      onPrinted()
    } catch (e) {
      setError(e instanceof PrintError ? e.message : "Gagal mencetak. Coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button size="lg" variant={reprint ? "outline" : "default"} className={reprint ? "border-warn text-warn" : ""} onClick={() => setOpen(true)}>
        <PrinterIcon aria-hidden /> {reprint ? `Cetak Ulang Label (sudah dicetak ${printCount}×${time ? ` · ${time}` : ""})` : "Cetak Label"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
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
            <p className="text-base text-muted-foreground">{PAPER_HINT[format]}. Cetak dengan skala 100% (ukuran asli).</p>
            {reprint ? (
              <Field data-invalid={error && !reason ? true : undefined}>
                <FieldLabel htmlFor="alasan-ulang">Alasan cetak ulang (dicatat)</FieldLabel>
                <Input id="alasan-ulang" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Contoh: label sobek" />
              </Field>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => go("auto")} disabled={pending || (reprint && reason.trim().length < 3)}>{pending ? "Menyiapkan…" : reprint ? "Cetak Ulang" : "Cetak"}</Button>
              <Button variant="outline" onClick={() => go("pdf")} disabled={pending || (reprint && reason.trim().length < 3)}>Buka PDF / Cetak Sistem</Button>
            </div>
            {format === "roll_58mm" ? (
              <ToggleGroup value={[density]} onValueChange={(v) => v[0] && setDensity(v[0] as "normal" | "tebal")} variant="outline" aria-label="Ketebalan tinta">
                <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
                <ToggleGroupItem value="tebal">Tebal</ToggleGroupItem>
              </ToggleGroup>
            ) : preview ? (
              <iframe title="Pratinjau label" src={preview} className="h-[55vh] w-full border-y" />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
