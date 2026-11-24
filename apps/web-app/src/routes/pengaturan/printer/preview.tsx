import { useMemo, useState } from "react"
import { escposBytes, FORMAT_SIZE_MM, labelSvg, labelsPdf, rollLines, type LabelData } from "@gx/thermal-print"
import { Maximize2Icon, PrinterIcon } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "../../../components/ui/toggle-group"
import { RollPaperPreview } from "../../../print/drawer"
import { connectBluetooth, FORMAT_LABEL, printPdf, type Format } from "../../../print/print"

export type SampleKind = "non_cod" | "cod"

interface PreviewProps {
  format: Format
  remark: string
  density: "normal" | "tebal"
  outletName: string
  outletWhatsapp: string | null
  miniSiteHost: string
}

/**
 * Builds synthetic Indonesian sample label data (AGENTS.md Example Data Policy: redacted phones, synthetic people/addresses)
 * combined with the tenant's real outlet identity and live unboxing remark so the preview matches production output 1:1.
 */
function buildSampleLabel({ outletName, outletWhatsapp, miniSiteHost, remark, kind }: Omit<PreviewProps, "format" | "density"> & { kind: SampleKind }): LabelData {
  const host = miniSiteHost || "contoh.geraimitra.com"
  const common = {
    inv: "8k4m2p7",
    printedAt: "25/11 09:30",
    sortingCode: kind === "cod" ? "BDG-CBL-01" : "SUB-GUB-04",
    destinationFallback: kind === "cod" ? "COBLONG 40132" : "GUBENG 60281",
    destinationLine: kind === "cod" ? "KEC. COBLONG · KOTA BANDUNG 40132" : "KEC. GUBENG · KOTA SURABAYA 60281",
    recipient: {
      name: kind === "cod" ? "Rina Kusuma" : "Budi Santoso",
      phone: "08xx-xxxx-1234",
      street: kind === "cod" ? "Jl. Dago Asri No. 18, RT 03/RW 05" : "Jl. Dharmawangsa Contoh No. 42",
      area: kind === "cod" ? "Coblong, Kota Bandung 40132" : "Gubeng, Kota Surabaya 60281",
    },
    sender: {
      name: "Toko Contoh Maju",
      phone: "08xx-xxxx-5678",
      area: "Sukodono, Sidoarjo",
    },
    outlet: { name: outletName || "Gerai Contoh", whatsapp: outletWhatsapp },
    content: kind === "cod" ? "Kemeja Katun + Tote Bag" : "Sepatu Lari Pria Uk. 42",
    quantity: kind === "cod" ? 2 : 1,
    deliveryInstruction: kind === "cod" ? "Hubungi penerima sebelum tiba" : "Titip pos satpam jika rumah kosong",
    actualWeightGram: 1000,
    billableWeightGram: 1000,
    dims: "30×20×12 cm",
    insuranceIdr: null,
    remark: remark.trim(),
    trackingUrl: `${host}/lacak/8k4m2p7`,
    showShippingFee: true,
  }

  if (kind === "cod") {
    return {
      ...common,
      courierName: "J&T Express",
      serviceName: "EZ",
      awb: "JP9841205531",
      cod: { collectIdr: 172_000 },
      stub: {
        shippingIdr: 18_000,
        packingIdr: 2_000,
        serviceFeeIdr: 0,
        promoIdr: 0,
        totalIdr: 2_000,
        payment: { status: "paid", method: "qris", cashIdr: null, changeIdr: null },
        codGoodsIdr: 150_000,
        senderPayableIdr: 150_000,
        feeMode: "buyer_bears_fee",
        reprint: false,
      },
    }
  }

  return {
    ...common,
    courierName: "JNE",
    serviceName: "REG",
    awb: "CGK25008194210",
    cod: null,
    stub: {
      shippingIdr: 20_000,
      packingIdr: 2_000,
      serviceFeeIdr: 0,
      promoIdr: 0,
      totalIdr: 22_000,
      payment: { status: "paid", method: "tunai", cashIdr: 50_000, changeIdr: 28_000 },
      codGoodsIdr: null,
      senderPayableIdr: null,
      feeMode: "none",
      reprint: false,
    },
  }
}

function sizeBadge(format: Format): string {
  if (format === "roll_58mm") return "Roll 58 mm"
  const s = FORMAT_SIZE_MM[format]
  return `${s.w} × ${s.h} mm`
}

/**
 * Live 1:1 thermal label & receipt preview rendered directly by `@gx/thermal-print` (same vector ops as the real PDF
 * and 32-column 58 mm roll output), with Non-COD / COD toggle, full-size zoom modal, and local sample test print.
 */
export function LabelPreview({ format, remark, density, outletName, outletWhatsapp, miniSiteHost }: PreviewProps) {
  const [kind, setKind] = useState<SampleKind>("non_cod")
  const [zoomOpen, setZoomOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printNote, setPrintNote] = useState<string | null>(null)

  const sample = useMemo(
    () => buildSampleLabel({ outletName, outletWhatsapp, miniSiteHost, remark, kind }),
    [outletName, outletWhatsapp, miniSiteHost, remark, kind],
  )

  const svgUrl = useMemo(() => {
    if (format === "roll_58mm") return null
    const svg = labelSvg(sample, format)
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }, [sample, format])

  const roll = useMemo(() => (format === "roll_58mm" ? rollLines(sample) : null), [sample, format])

  async function testPrint() {
    if (printing) return
    setPrinting(true)
    setPrintNote(null)
    try {
      if (format === "roll_58mm") {
        const write = await connectBluetooth()
        if (!write) {
          setPrintNote("Printer Bluetooth 58 mm tidak terhubung. Pasangkan printer atau pilih format 10×15 untuk cetak lewat PDF.")
          return
        }
        await write(escposBytes(rollLines(sample), density))
        setPrintNote("Contoh label 58 mm terkirim ke printer Bluetooth.")
        return
      }
      const pdfBytes = labelsPdf([sample], format)
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" })
      printPdf(blob)
    } catch {
      setPrintNote("Gagal membuka dialog cetak uji. Periksa izin popup browser.")
    } finally {
      setPrinting(false)
    }
  }

  const densityClass = density === "tebal" ? "contrast-[1.22] drop-shadow-[0_0_0.25px_rgba(15,23,42,0.75)]" : ""

  const paperView =
    format === "roll_58mm" && roll ? (
      <div className="max-h-[430px] overflow-y-auto rounded-lg">
        <RollPaperPreview lines={roll} density={density} />
      </div>
    ) : svgUrl ? (
      <button
        type="button"
        onClick={() => setZoomOpen(true)}
        aria-label={`Perbesar pratinjau ${FORMAT_LABEL[format]}`}
        className="group relative mx-auto block w-full max-w-[272px] cursor-zoom-in overflow-hidden rounded-sm border border-slate-300/90 bg-white shadow-sm transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <img
          src={svgUrl}
          alt={`Pratinjau label ${FORMAT_LABEL[format]} (${kind === "cod" ? "COD" : "Non-COD"})`}
          className={`block h-auto w-full ${densityClass}`}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-slate-950/75 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Maximize2Icon className="size-3" /> Perbesar
        </span>
      </button>
    ) : null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3.5" aria-label="Pratinjau hasil cetak label">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-900">Pratinjau Cetak</span>
          <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums">
            {sizeBadge(format)}
          </span>
          {density === "tebal" ? (
            <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-medium text-white">Tebal</span>
          ) : null}
        </div>
        <ToggleGroup
          value={[kind]}
          onValueChange={(v) => {
            const next = v[0] as SampleKind | undefined
            if (next) setKind(next)
          }}
          variant="outline"
          size="sm"
          aria-label="Jenis contoh label"
        >
          <ToggleGroupItem value="non_cod" className="h-8 px-2.5 text-xs md:h-7">Non-COD</ToggleGroupItem>
          <ToggleGroupItem value="cod" className="h-8 px-2.5 text-xs md:h-7">COD</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="rounded-lg bg-slate-200/60 p-2.5">
        {paperView}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void testPrint()} disabled={printing} className="flex-1 bg-white">
          <PrinterIcon aria-hidden /> {printing ? "Menyiapkan…" : "Cetak Uji Contoh"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setZoomOpen(true)} className="shrink-0">
          <Maximize2Icon aria-hidden /> Perbesar
        </Button>
      </div>

      {printNote ? (
        <p role="status" className="text-xs text-slate-700">
          {printNote}
        </p>
      ) : null}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Data contoh memakai nama gerai &amp; catatan unboxing Anda. Cetak uji tidak membuat kiriman dan tidak memotong saldo.
      </p>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pratinjau {FORMAT_LABEL[format]}</DialogTitle>
            <DialogDescription>
              {sizeBadge(format)} · Contoh {kind === "cod" ? "COD" : "Non-COD"} · Ketebalan {density === "tebal" ? "Tebal" : "Normal"}.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
            {format === "roll_58mm" && roll ? (
              <RollPaperPreview lines={roll} density={density} />
            ) : svgUrl ? (
              <img
                src={svgUrl}
                alt={`Pratinjau penuh ${FORMAT_LABEL[format]}`}
                className={`mx-auto block h-auto w-full max-w-[400px] rounded-sm border border-slate-300 bg-white shadow-sm ${densityClass}`}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
