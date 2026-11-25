// Print scan check (TASK-306 "printed sample scanned"): renders every 100 mm format at the thermal head's 203 dpi
// with Ghostscript and decodes the Code 128 and QR with zxing-cpp. Runs where the tools exist (dev box: Python venv at
// $GX_SCAN_PY, default /data/tmp/gx-venv); skipped elsewhere, the geometry tests still run everywhere.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { labelsPdf, type LabelFormat } from "../src"
import { codDropship, nonCodStandard } from "./fixture"

const py = process.env.GX_SCAN_PY ?? "/data/tmp/gx-venv/bin/python"
const hasGs = (() => {
  try {
    execFileSync("gs", ["--version"])
    return true
  } catch {
    return false
  }
})()
const out = process.env.GX_SCAN_OUT ?? "/tmp/gx-print-scan"

describe.skipIf(!hasGs || !existsSync(py))("print scan (Ghostscript 203 dpi + zxing)", () => {
  mkdirSync(out, { recursive: true })
  const cases: Array<[string, typeof codDropship, Exclude<LabelFormat, "roll_58mm">]> = []
  for (const [name, d] of [["cod-dropship", codDropship], ["noncod-standard", nonCodStandard]] as const) for (const f of ["label_10x15_with_stub", "label_10x10", "label_10x15"] as const) cases.push([name, d, f])
  it.each(cases)("%s %s: barcode = AWB, every QR = tracking URL", (name, d, format) => {
    const pdf = path.join(out, `${name}-${format}.pdf`)
    const png = pdf.replace(/\.pdf$/, ".png")
    writeFileSync(pdf, labelsPdf([d], format))
    execFileSync("gs", ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pnggray", "-r203", `-sOutputFile=${png}`, pdf])
    const decoded = JSON.parse(execFileSync(py, ["-c", "import sys,json,zxingcpp;from PIL import Image;print(json.dumps([[r.format.name,r.text] for r in zxingcpp.read_barcodes(Image.open(sys.argv[1]))]))", png]).toString()) as Array<[string, string]>
    const codes = decoded.filter(([f]) => f === "Code128").map(([, t]) => t)
    expect(codes).toContain(d.awb)
    expect(codes).toContain(d.inv.toUpperCase())
    const qrs = decoded.filter(([f]) => f === "QRCode").map(([, t]) => t)
    if (format !== "label_10x10") expect(qrs.length).toBeGreaterThanOrEqual(1)
    for (const t of qrs) expect(t).toBe(`https://${d.trackingUrl}`)
  })
})
