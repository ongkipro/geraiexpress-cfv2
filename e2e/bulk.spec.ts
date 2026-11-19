import { deflateRawSync } from "node:zlib"
import type { APIRequestContext, BrowserContext } from "@playwright/test"
import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-308: Paket Massal from a CSV with good and bad rows → fix the ambiguous area inline → Buat n Kiriman →
// resi terbit → one payment for the batch; Cek Resi finds the INV and refuses a foreign AWB.
const CSV = [
  "Nama Penerima,No HP,Alamat,Kecamatan/Kota,Kode Pos,Isi Paket,Berat (gram),Panjang,Lebar,Tinggi,COD (Rp),Nilai Barang (Rp),Catatan",
  "Rina Kartika,0857-1234-8821,Jl. Tebet Barat No. 14,Tebet Barat,12810,Pakaian,1000,,,,0,150000,",
  "Agus Salim,081355556666,Jl. Melati No. 9,Jawa,,Kaos,700,,,,,,",
].join("\r\n")

/** Signed-in gerai admin with a connected tenant and one sender (`Ibu Siti Nisa`). */
async function seedMassal(context: BrowserContext, request: APIRequestContext) {
  const email = uniqueEmail("e2e-massal")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Massal", password: "massal-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `m${Date.now().toString(36)}`, name: "Gerai Massal", connect: true } })).status()).toBe(201)
  await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti Nisa", phone: "081234567890" } })
}

// DEC-251: a minimal real `.xlsx` (stored ZIP entries except the deflated sheet) whose phone cell is the NUMBER Excel
// keeps after dropping the leading 0.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (b: Buffer) => {
  let c = 0xffffffff
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function zip(files: Array<{ name: string; text: string; deflate?: boolean }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name)
    const raw = Buffer.from(f.text)
    const data = f.deflate ? deflateRawSync(raw) : raw
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(f.deflate ? 8 : 0, 8)
    local.writeUInt32LE(crc32(raw), 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(f.deflate ? 8 : 0, 10)
    central.writeUInt32LE(crc32(raw), 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += 30 + name.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const str = (ref: string, t: string) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`
const XLSX = zip([
  { name: "[Content_Types].xml", text: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
  { name: "xl/workbook.xml", text: `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="Kiriman" sheetId="1" r:id="rId1"/></sheets></workbook>` },
  { name: "xl/_rels/workbook.xml.rels", text: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
  {
    name: "xl/worksheets/sheet1.xml",
    deflate: true,
    text:
      `<?xml version="1.0"?><worksheet ${NS}><sheetData>` +
      `<row r="1">${str("A1", "Nama Penerima")}${str("B1", "No HP")}${str("C1", "Alamat")}${str("D1", "Kecamatan/Kota")}${str("E1", "Berat (gram)")}</row>` +
      `<row r="2">${str("A2", "Rina Kartika")}<c r="B2"><v>85712348821</v></c>${str("C2", "Jl. Melati No. 9")}${str("D2", "Jawa")}<c r="E2"><v>700</v></c></row>` +
      `</sheetData></worksheet>`,
  },
])

test("Paket Massal: unggah CSV, perbaiki baris, buat, bayar; Cek Resi", async ({ page, context, request }) => {
  await seedMassal(context, request)
  await page.goto(`${APP}/kasir/multi`)
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  await page.getByRole("radio", { name: "J&T Express" }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: "paket.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) })
  await expect(page.getByText("paket.csv")).toBeVisible()
  await page.getByRole("button", { name: "Periksa Baris" }).click()
  await expect(page).toHaveURL(/\/kiriman\/massal\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  await expect(page.getByRole("tab", { name: "Siap (1)" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole("tab", { name: "Perlu Diperbaiki (1)" }).click()
  await expect(page.getByText("Kecamatan lebih dari satu, pilih yang benar")).toBeVisible()
  await page.getByRole("radio", { name: /Gubeng/ }).click()
  await page.getByRole("button", { name: "Simpan & Periksa" }).click()
  await expect(page.getByRole("tab", { name: "Siap (2)" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole("checkbox", { name: /Isi semua paket bukan barang terlarang/ }).check()
  await page.getByRole("button", { name: "Buat 2 Kiriman" }).click()
  await expect(page.getByText("2 resi terbit")).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: /^Tandai Lunas/ }).click()
  await expect(page.getByText("Batch sudah lunas")).toBeVisible()
  const inv = (await page.getByRole("link", { name: /^INV / }).first().textContent())!.trim()

  await page.goto(`${APP}/kasir/cek-resi`)
  await page.getByLabel("Nomor INV, resi, atau HP penerima").fill(inv)
  await page.getByRole("button", { name: "Cari", exact: true }).click()
  await expect(page.getByRole("link", { name: inv })).toBeVisible()
  await page.getByLabel("Nomor INV, resi, atau HP penerima").fill("JX9999999999")
  await page.getByRole("button", { name: "Cari", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Resi ini bukan kiriman gerai Anda" })).toBeVisible()
  await expect(page.getByRole("link", { name: "J&T" })).toHaveAttribute("href", "https://jet.co.id/track")
})

test("Paket Massal: kargo hanya Non-COD; unggah .xlsx mengembalikan 0 di No HP", async ({ page, context, request }) => {
  await seedMassal(context, request)
  await page.goto(`${APP}/kasir/multi`)
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  const group = page.getByRole("radiogroup", { name: "Ekspedisi untuk semua baris" })
  await group.getByRole("radio", { name: "J&T Express" }).click()
  await page.getByRole("button", { name: "COD, fee ditanggung pembeli" }).click()
  await expect(page.getByRole("button", { name: "COD, fee ditanggung pembeli" })).toHaveAttribute("aria-pressed", "true")

  // Cargo card → COD locked to Tanpa COD with the reason shown.
  await page.getByRole("button", { name: "Cargo ≥ 5 kg (Non-COD)" }).click()
  const cargo = group.getByRole("radio").first()
  await expect(cargo).toContainText("Cargo")
  await cargo.click()
  await expect(cargo).toHaveAttribute("aria-checked", "true")
  await expect(page.getByRole("button", { name: "Tanpa COD" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "COD, fee ditanggung pembeli" })).toBeDisabled()
  await expect(page.getByText("Kargo hanya Non-COD.")).toBeVisible()

  await page.getByRole("button", { name: "Reguler", exact: true }).click()
  await group.getByRole("radio", { name: "J&T Express" }).click()
  await expect(page.getByRole("button", { name: "COD, fee ditanggung pembeli" })).toBeEnabled()
  await page.locator('input[type="file"]').setInputFiles({ name: "kiriman.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX })
  await expect(page.getByText("kiriman.xlsx")).toBeVisible()
  const sent = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/app/bulk")
  await page.getByRole("button", { name: "Periksa Baris" }).click()
  const body = (await sent).postDataJSON() as { csv: string; serviceCode: string; codFeeMode: string }
  expect(body.csv).toBe("Nama Penerima,No HP,Alamat,Kecamatan/Kota,Berat (gram)\r\nRina Kartika,085712348821,Jl. Melati No. 9,Jawa,700")
  expect(body.codFeeMode).toBe("none")
  await expect(page).toHaveURL(/\/kiriman\/massal\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  await page.getByRole("tab", { name: "Perlu Diperbaiki (1)" }).click()
  await expect(page.getByText("Kecamatan lebih dari satu, pilih yang benar")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel("No HP")).toHaveValue("085712348821")
})

// Sol R1-4 / R1-7: a replacement upload wins over a slower earlier one, a rejected replacement drops the old file,
// and an empty Cargo tab keeps no hidden Reguler choice (Non-COD forced, `Periksa Baris` off).
test("Paket Massal: berkas pengganti selalu menang; tab Cargo kosong tanpa pilihan tersembunyi", async ({ page, context, request }) => {
  await seedMassal(context, request)
  // `lambat.xlsx` takes 1.5 s to read, so it is still in flight when the next file is picked.
  await page.addInitScript(() => {
    const orig = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = function (this: File) {
      const p = orig.call(this)
      return this.name === "lambat.xlsx" ? p.then((b) => new Promise<ArrayBuffer>((r) => setTimeout(() => r(b), 1500))) : p
    }
  })
  // Every cargo courier switched off for this gerai: the Cargo tab is empty.
  await page.route("**/api/app/bulk/services", async (route) => {
    const res = await route.fetch()
    const j = (await res.json()) as { data: { items: Array<{ cargo: boolean }> } }
    j.data.items = j.data.items.filter((i) => !i.cargo)
    await route.fulfill({ response: res, json: j })
  })
  await page.goto(`${APP}/kasir/multi`)
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  const group = page.getByRole("radiogroup", { name: "Ekspedisi untuk semua baris" })
  await group.getByRole("radio", { name: "J&T Express" }).click()
  await page.getByRole("button", { name: "COD, fee ditanggung pembeli" }).click()
  await page.getByRole("button", { name: "Cargo ≥ 5 kg (Non-COD)" }).click()
  await expect(group.getByRole("radio")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Tanpa COD" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "COD, fee ditanggung pembeli" })).toBeDisabled()
  await expect(page.getByText("Kargo hanya Non-COD.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Periksa Baris" })).toBeDisabled()
  await page.getByRole("button", { name: "Reguler", exact: true }).click()
  await group.getByRole("radio", { name: "J&T Express" }).click()
  await expect(page.getByRole("button", { name: "Periksa Baris" })).toBeEnabled()

  const input = page.locator('input[type="file"]')
  await input.setInputFiles({ name: "lambat.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX })
  await expect(page.getByRole("button", { name: "Membaca berkas…" })).toBeDisabled()
  const csv = "Nama Penerima,No HP,Alamat,Kecamatan/Kota,Berat (gram)\r\nDewi Lestari,081311112222,Jl. Dago No. 9,Coblong,500"
  await input.setInputFiles({ name: "cepat.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
  await expect(page.getByText("cepat.csv")).toBeVisible()
  await page.waitForTimeout(1800)
  await expect(page.getByText("cepat.csv")).toBeVisible()
  await expect(page.getByText("lambat.xlsx")).toHaveCount(0)

  // A rejected replacement drops the previous file: nothing of `cepat.csv` is sent anymore.
  await input.setInputFiles({ name: "catatan.txt", mimeType: "text/plain", buffer: Buffer.from("halo") })
  await expect(page.getByText("Pilih berkas Excel .xlsx atau .csv.")).toBeVisible()
  await expect(page.getByText("cepat.csv")).toHaveCount(0)
  const sent = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/app/bulk")
  await page.getByRole("button", { name: "Periksa Baris" }).click()
  expect(((await sent).postDataJSON() as { csv?: string }).csv).toBeUndefined()
})

// Sol R2-3 / R2-4: a rejected file picked while another is still being read ends `Membaca berkas…`; services that
// load after the Cargo tab was opened default to a cargo service (never a hidden Reguler one).
test("Paket Massal: berkas ditolak saat yang lain masih dibaca; layanan terlambat mengikuti tab Cargo", async ({ page, context, request }) => {
  await seedMassal(context, request)
  await page.addInitScript(() => {
    const orig = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = function (this: File) {
      const p = orig.call(this)
      return this.name === "lambat.xlsx" ? p.then((b) => new Promise<ArrayBuffer>((r) => setTimeout(() => r(b), 1500))) : p
    }
  })
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route("**/api/app/bulk/services", async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`${APP}/kasir/multi`)
  await page.getByRole("button", { name: "Cargo ≥ 5 kg (Non-COD)" }).click()
  release()
  const group = page.getByRole("radiogroup", { name: "Ekspedisi untuk semua baris" })
  await expect(group.locator('[role=radio][aria-checked="true"]')).toContainText("Cargo")
  await expect(page.getByRole("button", { name: "Tanpa COD" })).toHaveAttribute("aria-pressed", "true")

  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({ name: "lambat.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX })
  await expect(page.getByRole("button", { name: "Membaca berkas…" })).toBeVisible()
  await input.setInputFiles({ name: "catatan.txt", mimeType: "text/plain", buffer: Buffer.from("halo") })
  await expect(page.getByText("Pilih berkas Excel .xlsx atau .csv.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Membaca berkas…" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Periksa Baris" })).toBeEnabled()
  // The slow read finishing later publishes nothing.
  await page.waitForTimeout(1800)
  await expect(page.getByText("lambat.xlsx")).toHaveCount(0)
})

