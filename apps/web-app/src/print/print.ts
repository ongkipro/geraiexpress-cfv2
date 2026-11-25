// Print client (TASK-306, DEC-224): PC-first = open the exact-size PDF in the browser's print dialog (the OS driver
// prints at 100 % on the 100 mm thermal printer). 58 mm = ESC/POS bytes sent over Web Bluetooth when available,
// otherwise a 58 mm `@page` HTML print document (for USB 58 mm thermal printers) or the PDF path.
import { code128Modules, qrSvg, totalModules } from "@gx/thermal-print"

export type Format = "label_10x15_with_stub" | "label_10x10" | "label_10x15" | "roll_58mm"
export const FORMAT_LABEL: Record<Format, string> = { label_10x15_with_stub: "10×15 · Paket + Bukti", label_10x10: "10×10 · Paket saja", label_10x15: "10×15 · Paket saja", roll_58mm: "Roll 58 mm" }
export const FORMAT_SUB: Record<Format, string> = {
  label_10x15_with_stub: "Stiker paket + sobekan bukti kirim",
  label_10x10: "Stiker paket ringkas, hemat kertas",
  label_10x15: "Stiker paket lega tanpa bukti kirim",
  roll_58mm: "Label + struk 58 mm (USB / Bluetooth)",
}
export const PAPER_HINT: Record<Format, string> = { label_10x15_with_stub: "Pakai kertas thermal 100×150 mm", label_10x10: "Pakai kertas thermal 100×100 mm", label_10x15: "Pakai kertas thermal 100×150 mm", roll_58mm: "Pakai roll thermal 58 mm" }

export type RollPreviewLine = { text: string; bold?: boolean; invert?: boolean } | { barcode: string } | { qr: string } | { cut: true }

export async function fetchRollPreview(slug: string): Promise<RollPreviewLine[]> {
  const res = await fetch("/api/app/print", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slugs: [slug], format: "roll_58mm", preview: true, as: "text" }),
  })
  const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: { styled?: RollPreviewLine[][] }; error?: { code?: string; message?: string } } | null
  if (!res.ok || !j?.ok) throw new PrintError(j?.error?.code ?? "PRINT_FAILED", j?.error?.message ?? "Pratinjau 58 mm gagal dimuat.")
  return j.data?.styled?.[0] ?? []
}

/** This device's print density (device-local per spec 01 §2.4; Kasir may change it). */
export function deviceDensity(): "normal" | "tebal" {
  try {
    return localStorage.getItem("gx-print-density") === "tebal" ? "tebal" : "normal"
  } catch {
    return "normal"
  }
}
export function setDeviceDensity(d: "normal" | "tebal"): void {
  try {
    localStorage.setItem("gx-print-density", d)
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

export class PrintError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function fetchPrint(body: { slugs: string[]; format: Format; reason?: string; preview?: boolean; density?: "normal" | "tebal"; as?: "svg" }): Promise<{ blob: Blob; refused: number }> {
  const res = await fetch("/api/app/print", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null
    throw new PrintError(j?.error?.code ?? "PRINT_FAILED", j?.error?.message ?? "Gagal menyiapkan label.")
  }
  return { blob: await res.blob(), refused: Number(res.headers.get("x-refused") ?? "0") }
}

/** Renders a real, scannable Code 128 SVG with 10-module quiet zones on both sides (for 58 mm preview & USB print). */
export function code128Svg(text: string): string {
  try {
    const mods = code128Modules(text)
    const quiet = 10
    const total = totalModules(mods) + quiet * 2
    let x = quiet
    let d = ""
    mods.forEach((m, i) => {
      if (i % 2 === 0) d += `M${x} 0h${m}v44h-${m}z`
      x += m
    })
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 44" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ${text.replace(/["<>]/g, "")}"><rect width="${total}" height="44" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
  } catch {
    return ""
  }
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Opens an offscreen real-sized iframe for the exact-mm PDF and triggers the system print dialog (fallback: new tab). */
export function printPdf(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const frame = document.createElement("iframe")
  frame.style.position = "fixed"
  frame.style.left = "-9999px"
  frame.style.top = "0"
  frame.style.width = "210mm"
  frame.style.height = "297mm"
  frame.style.border = "0"
  frame.style.opacity = "0"
  frame.style.pointerEvents = "none"
  frame.src = url
  frame.onload = () => {
    // Allow Chrome PDFium / browser viewer to finish initial layout before invoking print().
    setTimeout(() => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        const tab = window.open(url, "_blank")
        if (tab) tab.opener = null
      }
    }, 350)
    setTimeout(() => {
      frame.remove()
      URL.revokeObjectURL(url)
    }, 120_000)
  }
  document.body.appendChild(frame)
}

/** Prints an exact-mm vector SVG label via same-origin HTML `@page` print iframe (reliable across all browsers & USB thermal drivers). */
export function printSvgHtml(svg: string, sizeMm: { w: number; h: number }, title = "Cetak Uji Label"): void {
  const doc = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
@page{size:${sizeMm.w}mm ${sizeMm.h}mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:${sizeMm.w}mm;height:${sizeMm.h}mm;background:#fff;overflow:hidden}
svg{display:block;width:${sizeMm.w}mm;height:${sizeMm.h}mm}
</style></head><body>${svg}</body></html>`
  const frame = document.createElement("iframe")
  frame.dataset.printFrame = "label"
  frame.style.position = "fixed"
  frame.style.left = "-9999px"
  frame.style.top = "0"
  frame.style.width = `${sizeMm.w}mm`
  frame.style.height = `${sizeMm.h}mm`
  frame.style.border = "0"
  frame.style.opacity = "0"
  frame.style.pointerEvents = "none"
  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } finally {
        setTimeout(() => frame.remove(), 60_000)
      }
    }, 100)
  }
  frame.srcdoc = doc
  document.body.appendChild(frame)
}

/** Prints a 58 mm thermal roll receipt via the browser print dialog (`@page { size: 58mm auto; margin: 0 }`) for USB printers. */
export function printRollHtml(lines: RollPreviewLine[], density: "normal" | "tebal"): void {
  const rows = lines
    .map((line) => {
      if ("cut" in line) return `<div class="cut">--- Potong kertas di sini ---</div>`
      if ("barcode" in line) return `<div class="bar">${code128Svg(line.barcode)}</div>`
      if ("qr" in line) return `<div class="qr">${qrSvg(line.qr, { title: "QR Lacak" })}<div class="qrcap">Scan untuk lacak paket</div></div>`
      if (line.text.includes("Potong Disini")) return `<div class="cut">--- Potong di sini ---</div>`
      const cls = [line.invert ? "inv" : "", line.bold ? "b" : ""].filter(Boolean).join(" ")
      return `<div class="ln${cls ? ` ${cls}` : ""}">${escHtml(line.text) || "&nbsp;"}</div>`
    })
    .join("")
  const doc = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Cetak Uji Roll 58 mm</title><style>
@page{size:58mm auto;margin:0}
*{box-sizing:border-box}
body{margin:0;padding:2mm 1.5mm;width:58mm;background:#fff;color:#000;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:8.2pt;line-height:1.32;${density === "tebal" ? "font-weight:600;" : ""}}
.ln{white-space:pre;overflow:hidden;letter-spacing:-0.01em}
.b{font-weight:700}
.inv{background:#000;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0.4mm 0}
.bar{margin:1.5mm 0;text-align:center}.bar svg{width:92%;height:11mm;display:block;margin:0 auto}
.qr{margin:2mm 0;text-align:center}.qr svg{width:24mm;height:24mm;display:block;margin:0 auto}
.qrcap{font-size:7pt;margin-top:0.8mm}
.cut{margin:2.5mm 0;padding:1mm 0;border-top:1px dashed #000;border-bottom:1px dashed #000;text-align:center;font-size:7pt}
</style></head><body>${rows}</body></html>`
  const frame = document.createElement("iframe")
  frame.dataset.printFrame = "roll58"
  frame.style.position = "fixed"
  frame.style.left = "-9999px"
  frame.style.top = "0"
  frame.style.width = "58mm"
  frame.style.height = "260mm"
  frame.style.border = "0"
  frame.style.opacity = "0"
  frame.style.pointerEvents = "none"
  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } finally {
        setTimeout(() => frame.remove(), 60_000)
      }
    }, 150)
  }
  frame.srcdoc = doc
  document.body.appendChild(frame)
}

type BtCharacteristic = { writeValueWithoutResponse?: (b: BufferSource) => Promise<void>; writeValue: (b: BufferSource) => Promise<void> }
/** Connects a paired BLE printer (common 58 mm service UUID); null when unsupported or the user cancels. */
export async function connectBluetooth(): Promise<((bytes: Uint8Array) => Promise<void>) | null> {
  const bt = (navigator as unknown as { bluetooth?: { requestDevice: (o: unknown) => Promise<{ gatt?: { connect: () => Promise<{ getPrimaryService: (u: string) => Promise<{ getCharacteristic: (u: string) => Promise<BtCharacteristic> }> }> } }> } }).bluetooth
  if (!bt) return null
  const SERVICE = "000018f0-0000-1000-8000-00805f9b34fb"
  const CHAR = "00002af1-0000-1000-8000-00805f9b34fb"
  try {
    const device = await bt.requestDevice({ filters: [{ services: [SERVICE] }] })
    const server = await device.gatt!.connect()
    const ch = await (await server.getPrimaryService(SERVICE)).getCharacteristic(CHAR)
    return async (bytes) => {
      for (let i = 0; i < bytes.length; i += 180) {
        const chunk = bytes.slice(i, i + 180)
        await (ch.writeValueWithoutResponse ? ch.writeValueWithoutResponse(chunk) : ch.writeValue(chunk))
      }
    }
  } catch {
    return null
  }
}
