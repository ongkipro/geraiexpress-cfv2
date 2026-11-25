// Minimal vector PDF writer (no dependency): one page of an exact physical size in millimetres, filled rectangles,
// monochrome vector paths (for courier logos), optional embedded JPEG XObjects (for gerai logos), and Helvetica /
// Helvetica-Bold / Courier-Bold text (WinAnsi). Coordinates are mm from the top-left.
import type { CourierMark, VectorPath } from "./courier-marks"

export const MM = 72 / 25.4

type Op =
  | { kind: "rect"; x: number; y: number; w: number; h: number; white?: boolean }
  | { kind: "stroke"; x: number; y: number; w: number; h: number; lw: number }
  | { kind: "text"; x: number; y: number; size: number; font: "R" | "B" | "M"; text: string; white?: boolean; align?: "left" | "center" | "right" }
  | { kind: "vector"; x: number; y: number; w: number; h: number; mark: CourierMark }
  | { kind: "image"; x: number; y: number; w: number; h: number; dataUrl?: string | null; jpeg?: Uint8Array | null }

export class PdfPage {
  readonly ops: Op[] = []
  constructor(
    readonly widthMm: number,
    readonly heightMm: number,
  ) {}
  rect(x: number, y: number, w: number, h: number, white = false) {
    this.ops.push({ kind: "rect", x, y, w, h, white })
    return this
  }
  /** Crisp 1-bit monochrome outlined rectangle (thermal-safe: pure black stroke, no halftone gray). */
  strokeRect(x: number, y: number, w: number, h: number, lw = 0.35) {
    this.ops.push({ kind: "stroke", x, y, w, h, lw })
    return this
  }
  /** `y` is the text baseline in mm from the top. */
  text(x: number, y: number, size: number, text: string, opts: { font?: "R" | "B" | "M"; white?: boolean; align?: "left" | "center" | "right" } = {}) {
    this.ops.push({ kind: "text", x, y, size, text, font: opts.font ?? "R", white: opts.white, align: opts.align ?? "left" })
    return this
  }
  /** Crisp monochrome vector mark (scaled uniformly to fit inside `w × h`, vertically centred, left-aligned at `x`). */
  vector(x: number, y: number, w: number, h: number, mark: CourierMark) {
    this.ops.push({ kind: "vector", x, y, w, h, mark })
    return this
  }
  /** Optional outlet logo image (SVG uses `dataUrl`, PDF embeds raw JPEG via `/DCTDecode` when `jpeg` is supplied). */
  image(x: number, y: number, w: number, h: number, opts: { dataUrl?: string | null; jpeg?: Uint8Array | null }) {
    this.ops.push({ kind: "image", x, y, w, h, dataUrl: opts.dataUrl, jpeg: opts.jpeg })
    return this
  }
}

// Helvetica advance widths (1/1000 em) for ASCII 32..126; used for right/centre alignment and wrapping.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584]
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]

/** Text width in mm for a font size in pt. */
export function textWidthMm(text: string, sizePt: number, font: "R" | "B" | "M" = "R"): number {
  if (font === "M") return (text.length * 600 * sizePt) / 1000 / MM
  const table = font === "B" ? HELVB : HELV
  let units = 0
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    units += c >= 32 && c <= 126 ? table[c - 32]! : 556
  }
  return (units * sizePt) / 1000 / MM
}

/** Greedy word wrap to a width in mm; at most `maxLines` lines (the last one is clamped with an ellipsis). */
export function wrapMm(text: string, widthMm: number, sizePt: number, font: "R" | "B" = "R", maxLines = 3): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ")
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (textWidthMm(next, sizePt, font) <= widthMm || !cur) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]!
  while (last.length > 1 && textWidthMm(`${last}…`, sizePt, font) > widthMm) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** PDF string literal in WinAnsi: non-Latin-1 characters become `?`; `·` and `…` are mapped. */
function pdfString(s: string): string {
  const mapped = s.replace(/·/g, "\xb7").replace(/…/g, "\x85").replace(/[–—]/g, "-").replace(/×/g, "\xd7").replace(/✂/g, "")
  let out = ""
  for (const ch of mapped) {
    const c = ch.charCodeAt(0)
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`
    else if (c < 32 || c > 255) out += "?"
    else if (c > 126) out += `\\${c.toString(8).padStart(3, "0")}`
    else out += ch
  }
  return `(${out})`
}

const n = (v: number) => (Math.round(v * 1000) / 1000).toString()

/** Reads JPEG pixel dimensions and channel count from SOF0/SOF2 headers; null if not a valid JPEG. */
export function jpegInfo(bytes: Uint8Array): { width: number; height: number; components: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]!
    if (marker === 0xd9 || marker === 0xda) break
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!
    if (len < 2 || i + 2 + len > bytes.length) break
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb)) {
      const height = (bytes[i + 5]! << 8) | bytes[i + 6]!
      const width = (bytes[i + 7]! << 8) | bytes[i + 8]!
      const components = bytes[i + 9]!
      if (width > 0 && height > 0 && (components === 1 || components === 3)) return { width, height, components }
      return null
    }
    i += 2 + len
  }
  return null
}

/** Converts normalized absolute `M/L/C/Z` path data into PDF path operators. */
function pathToPdfOps(p: VectorPath): string {
  const re = /([MLCZ])|([-+]?(?:\d+\.?\d*|\.\d+))/g
  const toks: Array<string | number> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(p.d))) toks.push(m[1] ?? Number(m[2]))
  let out = p.white ? "1 g\n" : "0 g\n"
  let i = 0
  while (i < toks.length) {
    const cmd = toks[i++]
    if (cmd === "M") {
      out += `${toks[i++]} ${toks[i++]} m\n`
    } else if (cmd === "L") {
      out += `${toks[i++]} ${toks[i++]} l\n`
    } else if (cmd === "C") {
      out += `${toks[i++]} ${toks[i++]} ${toks[i++]} ${toks[i++]} ${toks[i++]} ${toks[i++]} c\n`
    } else if (cmd === "Z") {
      out += "h\n"
    }
  }
  out += p.evenOdd ? "f*\n" : "f\n"
  return out
}

function fitMark(x: number, y: number, w: number, h: number, mark: CourierMark) {
  const s = Math.min(w / mark.w, h / mark.h)
  const rw = mark.w * s
  const rh = mark.h * s
  return { s, tx: x, ty: y + (h - rh) / 2, rw, rh }
}

const encLatin1 = (s: string): Uint8Array => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff
  return b
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

/** Serialises pages into a PDF document (each page keeps its own exact MediaBox). */
export function renderPdf(pages: PdfPage[]): Uint8Array {
  const objs: Uint8Array[] = []
  const addText = (s: string) => {
    objs.push(encLatin1(s))
    return objs.length
  }
  const addRaw = (chunks: Uint8Array[]) => {
    objs.push(concatBytes(chunks))
    return objs.length
  }
  addText("") // 1: catalog
  addText("") // 2: pages
  addText("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>") // 3
  addText("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>") // 4
  addText("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>") // 5

  const kids: number[] = []
  for (const p of pages) {
    const H = p.heightMm * MM
    let content = ""
    const xobjs: Array<{ name: string; ref: number }> = []
    for (const op of p.ops) {
      if (op.kind === "rect") {
        content += `${op.white ? "1 g" : "0 g"} ${n(op.x * MM)} ${n(H - (op.y + op.h) * MM)} ${n(op.w * MM)} ${n(op.h * MM)} re f\n`
      } else if (op.kind === "stroke") {
        content += `0 G ${n(op.lw * MM)} w ${n(op.x * MM)} ${n(H - (op.y + op.h) * MM)} ${n(op.w * MM)} ${n(op.h * MM)} re S\n`
      } else if (op.kind === "vector") {
        const f = fitMark(op.x, op.y, op.w, op.h, op.mark)
        const sPt = f.s * MM
        content += `q ${n(sPt)} 0 0 ${n(-sPt)} ${n(f.tx * MM)} ${n(H - f.ty * MM)} cm\n`
        for (const path of op.mark.paths) content += pathToPdfOps(path)
        content += "Q\n"
      } else if (op.kind === "image") {
        if (!op.jpeg) continue
        const info = jpegInfo(op.jpeg)
        if (!info) continue
        const ref = addRaw([
          encLatin1(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${info.components === 1 ? "/DeviceGray" : "/DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${op.jpeg.length} >>\nstream\n`),
          op.jpeg,
          encLatin1("\nendstream"),
        ])
        const name = `/Im${xobjs.length + 1}`
        xobjs.push({ name, ref })
        const s = Math.min(op.w / info.width, op.h / info.height)
        const rw = info.width * s
        const rh = info.height * s
        const ix = op.x + (op.w - rw) / 2
        const iy = op.y + (op.h - rh) / 2
        content += `q ${n(rw * MM)} 0 0 ${n(rh * MM)} ${n(ix * MM)} ${n(H - (iy + rh) * MM)} cm ${name} Do Q\n`
      } else {
        const font = op.font === "B" ? "/F2" : op.font === "M" ? "/F3" : "/F1"
        const w = textWidthMm(op.text, op.size, op.font)
        const x = op.align === "center" ? op.x - w / 2 : op.align === "right" ? op.x - w : op.x
        content += `${op.white ? "1 g" : "0 g"} BT ${font} ${n(op.size)} Tf ${n(x * MM)} ${n(H - op.y * MM)} Td ${pdfString(op.text)} Tj ET\n`
      }
    }
    const contentBytes = encLatin1(content)
    const contentRef = addRaw([encLatin1(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, encLatin1("endstream")])
    const xobjRes = xobjs.length ? ` /XObject << ${xobjs.map((x) => `${x.name} ${x.ref} 0 R`).join(" ")} >>` : ""
    const pageRef = addText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.widthMm * MM)} ${n(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xobjRes} >> /Contents ${contentRef} 0 R >>`,
    )
    kids.push(pageRef)
  }
  objs[0] = encLatin1("<< /Type /Catalog /Pages 2 0 R >>")
  objs[1] = encLatin1(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`)

  const chunks: Uint8Array[] = [encLatin1("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")]
  let offset = chunks[0]!.length
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(offset)
    const head = encLatin1(`${i + 1} 0 obj\n`)
    const tail = encLatin1("\nendobj\n")
    chunks.push(head, o, tail)
    offset += head.length + o.length + tail.length
  })
  const xrefOffset = offset
  let trailer = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) trailer += `${String(o).padStart(10, "0")} 00000 n \n`
  trailer += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  chunks.push(encLatin1(trailer))
  return concatBytes(chunks)
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** Exact vector SVG preview of a PdfPage in millimetre coordinates (single source of truth with renderPdf). */
export function renderSvg(p: PdfPage): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(p.widthMm)} ${n(p.heightMm)}" width="${n(p.widthMm)}mm" height="${n(p.heightMm)}mm">`,
    `<rect x="0" y="0" width="${n(p.widthMm)}" height="${n(p.heightMm)}" fill="#ffffff"/>`,
  ]
  for (const op of p.ops) {
    if (op.kind === "rect") {
      parts.push(`<rect x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" fill="${op.white ? "#ffffff" : "#000000"}" shape-rendering="crispEdges"/>`)
    } else if (op.kind === "stroke") {
      parts.push(`<rect x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" fill="none" stroke="#000000" stroke-width="${n(op.lw)}" shape-rendering="crispEdges"/>`)
    } else if (op.kind === "vector") {
      const f = fitMark(op.x, op.y, op.w, op.h, op.mark)
      parts.push(`<g transform="translate(${n(f.tx)} ${n(f.ty)}) scale(${n(f.s)})">`)
      for (const path of op.mark.paths) {
        parts.push(`<path d="${path.d}" fill="${path.white ? "#ffffff" : "#000000"}"${path.evenOdd ? ' fill-rule="evenodd"' : ""}/>`)
      }
      parts.push("</g>")
    } else if (op.kind === "image") {
      if (!op.dataUrl) continue
      parts.push(`<image x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" href="${escXml(op.dataUrl)}" preserveAspectRatio="xMidYMid meet" style="filter:grayscale(1) contrast(1.4)"/>`)
    } else {
      const family = op.font === "M" ? "'Courier New',Courier,monospace" : "Helvetica,Arial,sans-serif"
      const weight = op.font === "R" ? "" : ' font-weight="700"'
      const anchor = op.align === "center" ? ' text-anchor="middle"' : op.align === "right" ? ' text-anchor="end"' : ""
      parts.push(`<text x="${n(op.x)}" y="${n(op.y)}" font-family="${family}" font-size="${n(op.size / MM)}"${weight}${anchor} fill="${op.white ? "#ffffff" : "#000000"}">${escXml(op.text)}</text>`)
    }
  }
  parts.push("</svg>")
  return parts.join("")
}
