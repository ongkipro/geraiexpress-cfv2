// `Surat Jalan` (pickup manifest, TASK-403, spec 04 §1): A4 portrait PDF the courier signs at handover. Lists every
// scanned parcel (INV, AWB barcode-free text, recipient initials only, weight) with driver fields and signature
// boxes. Recipient names are reduced to initials: the manifest leaves the outlet with a third party.
import { PdfPage, renderPdf } from "./pdf"
import { drawBarcode } from "./label"

export interface ManifestData {
  outlet: { name: string; address: string | null; phone: string | null }
  courierName: string
  batchId: string
  handedOverAt: string // already formatted WIB, e.g. "16 Nov 2026 15.40 WIB"
  driver: { name: string | null; phone: string | null; vehicleNo: string | null }
  mode: "handed_over" | "dropped_at_branch"
  items: Array<{ inv: string; awb: string; recipientInitials: string; weightGram: number | null }>
}

const W = 210
const H = 297
const M = 15
const ROW = 7

export function initials(name: string | null): string {
  if (!name) return "—"
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => `${w[0]!.toUpperCase()}.`)
    .join(" ")
}

function header(p: PdfPage, d: ManifestData, page: number, pages: number): number {
  p.text(M, M + 6, 16, "SURAT JALAN", { font: "B" })
  p.text(W - M, M + 6, 10, `${d.courierName} · ${d.items.length} paket`, { font: "B", align: "right" })
  p.text(M, M + 12, 9, d.outlet.name)
  if (d.outlet.address) p.text(M, M + 16.5, 8, d.outlet.address.slice(0, 110))
  if (d.outlet.phone) p.text(M, M + 21, 8, `WA ${d.outlet.phone}`)
  p.text(W - M, M + 12, 8, d.handedOverAt, { align: "right" })
  p.text(W - M, M + 16.5, 8, `Manifest ${d.batchId.slice(0, 8).toUpperCase()} · hal. ${page}/${pages}`, { align: "right" })
  drawBarcode(p, d.batchId.slice(0, 8).toUpperCase(), W - M - 60, M + 18, 60, 6)
  const y = M + 30
  p.rect(M, y, W - 2 * M, 0.4)
  const cols = [M, M + 10, M + 45, M + 110, W - M - 20]
  p.text(cols[0]!, y + 5, 8, "No", { font: "B" })
  p.text(cols[1]!, y + 5, 8, "INV", { font: "B" })
  p.text(cols[2]!, y + 5, 8, "Resi", { font: "B" })
  p.text(cols[3]!, y + 5, 8, "Penerima", { font: "B" })
  p.text(W - M, y + 5, 8, "Berat", { font: "B", align: "right" })
  p.rect(M, y + 7, W - 2 * M, 0.2)
  return y + 7
}

function footer(p: PdfPage, d: ManifestData, y: number): void {
  const total = d.items.reduce((a, i) => a + (i.weightGram ?? 0), 0)
  p.text(M, y + 6, 9, `Total ${d.items.length} paket · ${(total / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`, { font: "B" })
  if (d.mode === "dropped_at_branch") {
    p.text(M, y + 12, 9, "Diantar sendiri oleh gerai ke cabang ekspedisi.")
    return
  }
  const by = y + 14
  p.text(M, by, 9, "Kurir", { font: "B" })
  p.text(M, by + 6, 9, `Nama: ${d.driver.name ?? "________________"}`)
  p.text(M, by + 11, 9, `HP: ${d.driver.phone ?? "________________"}`)
  p.text(M, by + 16, 9, `No. polisi: ${d.driver.vehicleNo ?? "________________"}`)
  const boxW = 60
  for (const [i, label] of ["Tanda tangan kurir", "Tanda tangan gerai"].entries()) {
    const x = W - M - boxW * (2 - i) - (i === 0 ? 6 : 0)
    p.rect(x, by - 3, boxW, 0.3).rect(x, by + 22, boxW, 0.3).rect(x, by - 3, 0.3, 25).rect(x + boxW - 0.3, by - 3, 0.3, 25)
    p.text(x + boxW / 2, by + 27, 8, label, { align: "center" })
  }
  p.text(M, by + 34, 7, "Dengan menandatangani, kurir menerima paket di atas dalam keadaan tersegel dan berlabel.")
}

/** One or more A4 pages: 28 rows per page; the footer goes on the last page. */
export function suratJalanPdf(d: ManifestData): Uint8Array {
  const perPage = 28
  const chunks: ManifestData["items"][] = []
  for (let i = 0; i < Math.max(1, d.items.length); i += perPage) chunks.push(d.items.slice(i, i + perPage))
  const pages = chunks.map((rows, pi) => {
    const p = new PdfPage(W, H)
    let y = header(p, d, pi + 1, chunks.length)
    rows.forEach((r, i) => {
      y += ROW
      const no = pi * perPage + i + 1
      p.text(M, y - 1.5, 9, String(no))
      p.text(M + 10, y - 1.5, 9, `INV ${r.inv.toUpperCase()}`, { font: "M" })
      p.text(M + 45, y - 1.5, 9, r.awb, { font: "M" })
      p.text(M + 110, y - 1.5, 9, r.recipientInitials)
      p.text(W - M, y - 1.5, 9, r.weightGram === null ? "—" : `${(r.weightGram / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`, { align: "right" })
      p.rect(M, y, W - 2 * M, 0.1)
    })
    if (pi === chunks.length - 1) footer(p, d, y + 2)
    return p
  })
  return renderPdf(pages)
}
