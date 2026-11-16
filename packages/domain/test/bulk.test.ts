import { describe, expect, it } from "vitest"
import { parseCsv, rowsFromCsv, templateCsv, validateRow } from "../src/bulk"

describe("CSV", () => {
  it("parses quotes, embedded commas/newlines, CRLF, BOM and ; separators", () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","line1\nline2"\r\n')).toEqual([["a", "b"], ["x, y", "line1\nline2"]])
    expect(parseCsv('a;b\n"he said ""hi""";2\n')).toEqual([["a", "b"], ['he said "hi"', "2"]])
  })
  it("template round-trips and maps headers by name in any order", () => {
    const r = rowsFromCsv(templateCsv())
    expect(r.ok && r.rows[0]).toMatchObject({ rowNo: 1, name: "Rina Kartika", phone: "0857-1234-8821", weightGram: "1000", declaredIdr: "150000" })
    const swapped = rowsFromCsv("Berat (gram),No HP,Nama Penerima,Alamat,Kecamatan/Kota\n500,081234567890,Budi,Jl. Merdeka 1,Tebet")
    expect(swapped.ok && swapped.rows[0]).toMatchObject({ name: "Budi", weightGram: "500", areaText: "Tebet" })
  })
  it("refuses missing required columns and more than 200 rows", () => {
    expect(rowsFromCsv("Nama Penerima,No HP\nA,0812")).toEqual({ ok: false, message: "Kolom wajib tidak lengkap. Gunakan template Paket Massal." })
    const many = "Nama Penerima,No HP,Alamat,Kecamatan/Kota,Berat (gram)\n" + Array.from({ length: 201 }, () => "A,081234567890,Jl. A 1,Tebet,1000").join("\n")
    expect(rowsFromCsv(many)).toEqual({ ok: false, message: "Maksimal 200 baris per unggahan." })
  })
})

describe("row validation", () => {
  const base = { rowNo: 1, name: "Rina", phone: "081234567890", street: "Jl. Dago 1", areaText: "Coblong", postalCode: "", content: "", weightGram: "1000", lengthCm: "", widthCm: "", heightCm: "", codIdr: "", declaredIdr: "", note: "" }
  it("good row normalises phone, defaults content, COD 0", () => {
    expect(validateRow(base)).toMatchObject({ ok: true, row: { phone: "081234567890", content: "Paket", codGoodsIdr: 0, weightGram: 1000, dims: null } })
    expect(validateRow({ ...base, codIdr: "Rp 150.000" })).toMatchObject({ ok: true, row: { codGoodsIdr: 150000 } })
  })
  it("bad rows list every reason in Indonesian", () => {
    expect(validateRow({ ...base, name: "", phone: "021", weightGram: "", codIdr: "5000", lengthCm: "10" })).toEqual({
      ok: false,
      errors: ["Nama penerima kosong", "No HP tidak valid", "Berat kosong", "Ukuran harus panjang, lebar, tinggi 1–300 cm", "COD di luar batas (Rp10.000–Rp5.000.000)"],
    })
  })
})
