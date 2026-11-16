// Minimal vector PDF writer (no dependency): one page of an exact physical size in millimetres, filled rectangles,
// and Helvetica / Helvetica-Bold / Courier-Bold text (WinAnsi). Coordinates are mm from the top-left.
export const MM = 72 / 25.4

type Op = { kind: "rect"; x: number; y: number; w: number; h: number; white?: boolean } | { kind: "text"; x: number; y: number; size: number; font: "R" | "B" | "M"; text: string; white?: boolean; align?: "left" | "center" | "right" }

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
  /** `y` is the text baseline in mm from the top. */
  text(x: number, y: number, size: number, text: string, opts: { font?: "R" | "B" | "M"; white?: boolean; align?: "left" | "center" | "right" } = {}) {
    this.ops.push({ kind: "text", x, y, size, text, font: opts.font ?? "R", white: opts.white, align: opts.align ?? "left" })
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

/** Serialises pages into a PDF document (each page keeps its own exact MediaBox). */
export function renderPdf(pages: PdfPage[]): Uint8Array {
  const objs: string[] = []
  const add = (s: string) => objs.push(s) // object number = index + 1
  add("") // 1: catalog (filled later)
  add("") // 2: pages
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>") // 3
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>") // 4
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>") // 5
  const kids: number[] = []
  for (const p of pages) {
    const H = p.heightMm * MM
    let content = ""
    for (const op of p.ops) {
      if (op.kind === "rect") content += `${op.white ? "1 g" : "0 g"} ${n(op.x * MM)} ${n(H - (op.y + op.h) * MM)} ${n(op.w * MM)} ${n(op.h * MM)} re f\n`
      else {
        const font = op.font === "B" ? "/F2" : op.font === "M" ? "/F3" : "/F1"
        const w = textWidthMm(op.text, op.size, op.font)
        const x = op.align === "center" ? op.x - w / 2 : op.align === "right" ? op.x - w : op.x
        content += `${op.white ? "1 g" : "0 g"} BT ${font} ${n(op.size)} Tf ${n(x * MM)} ${n(H - op.y * MM)} Td ${pdfString(op.text)} Tj ET\n`
      }
    }
    add(`<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}endstream`)
    const contentRef = objs.length
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.widthMm * MM)} ${n(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentRef} 0 R >>`)
    kids.push(objs.length)
  }
  objs[0] = "<< /Type /Catalog /Pages 2 0 R >>"
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`
  // Latin-1 bytes; offsets counted in bytes.
  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(body.length)
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff
  return bytes
}
