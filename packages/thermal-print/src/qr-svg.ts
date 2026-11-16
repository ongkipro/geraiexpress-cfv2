// QR as an inline SVG (mini-site `Kirim dari Rumah` card, TASK-501): one `<path>` of unit squares, 4-module quiet
// zone, crisp at any size. Same encoder as the labels (uqr), so a printed and an on-screen INV QR are identical.
import { encode } from "uqr"

export function qrSvg(text: string, opts: { title?: string } = {}): string {
  const { data } = encode(text, { ecc: "M", border: 4 })
  const n = data.length
  let d = ""
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y]![x]) d += `M${x} ${y}h1v1h-1z`
  const title = opts.title ? `<title>${opts.title.replace(/[<&>"]/g, "")}</title>` : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img">${title}<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
