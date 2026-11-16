import { describe, expect, it } from "vitest"
import { initials, MM, suratJalanPdf, type ManifestData } from "../src"

const base: ManifestData = {
  outlet: { name: "Gerai Sinar Jaya", address: "Jl. Dago No. 1, Coblong, Kota Bandung", phone: "08xx-xxxx-7890" },
  courierName: "J&T",
  batchId: "4f9a2c1e-0000-4000-8000-000000000001",
  handedOverAt: "16 Nov 2026 15.40 WIB",
  driver: { name: "Budi Kurir", phone: "081299990000", vehicleNo: "D 1234 ABC" },
  mode: "handed_over",
  items: [
    { inv: "8k4m2p7", awb: "JT4719667079", recipientInitials: initials("Rina Kartika"), weightGram: 1000 },
    { inv: "5n7r3v4", awb: "JT8652839843", recipientInitials: initials("Budi Santoso Putra Wijaya"), weightGram: 2500 },
  ],
}
const text = (pdf: Uint8Array) => new TextDecoder("latin1").decode(pdf)

describe("Surat Jalan PDF", () => {
  it("snapshot: A4, header, rows with initials only, total weight, driver and signature boxes", () => {
    const pdf = suratJalanPdf(base)
    const t = text(pdf)
    expect([...t.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])])).toEqual([[Math.round(210 * MM * 1000) / 1000, Math.round(297 * MM * 1000) / 1000]])
    const shown = [...t.matchAll(/\((.*?)\) Tj/g)].map((m) => m[1])
    expect(shown).toEqual(
      expect.arrayContaining(["SURAT JALAN", "J&T \\267 2 paket", "INV 8K4M2P7", "JT4719667079", "R. K.", "B. S. P.", "1 kg", "2,5 kg", "Total 2 paket \\267 3,5 kg", "Nama: Budi Kurir", "No. polisi: D 1234 ABC", "Tanda tangan kurir", "Tanda tangan gerai"]),
    )
    expect(t).not.toContain("Rina")
    expect(t).not.toContain("Kartika")
  })
  it("28 rows per page; footer only on the last page; branch drop-off has no signature boxes", () => {
    const many = { ...base, items: Array.from({ length: 30 }, (_, i) => ({ inv: `abc${String(i).padStart(4, "0")}`, awb: `JT${i}`, recipientInitials: "A.", weightGram: 1000 })) }
    const t = text(suratJalanPdf(many))
    expect(t.match(/\/MediaBox/g)).toHaveLength(2)
    expect(t).toContain("hal. 2/2")
    const drop = text(suratJalanPdf({ ...base, mode: "dropped_at_branch", driver: { name: null, phone: null, vehicleNo: null } }))
    expect(drop).toContain("Diantar sendiri oleh gerai ke cabang ekspedisi.")
    expect(drop).not.toContain("Tanda tangan kurir")
  })
})
