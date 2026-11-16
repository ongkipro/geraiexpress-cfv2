import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-308: Paket Massal from a CSV with good and bad rows → fix the ambiguous area inline → Buat n Kiriman →
// resi terbit → one payment for the batch; Cek Resi finds the INV and refuses a foreign AWB.
const CSV = [
  "Nama Penerima,No HP,Alamat,Kecamatan/Kota,Kode Pos,Isi Paket,Berat (gram),Panjang,Lebar,Tinggi,COD (Rp),Nilai Barang (Rp),Catatan",
  "Rina Kartika,0857-1234-8821,Jl. Tebet Barat No. 14,Tebet Barat,12810,Pakaian,1000,,,,0,150000,",
  "Agus Salim,081355556666,Jl. Melati No. 9,Jawa,,Kaos,700,,,,,,",
].join("\r\n")

test("Paket Massal: unggah CSV, perbaiki baris, buat, bayar; Cek Resi", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-massal")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Massal", password: "massal-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `m${Date.now().toString(36)}`, name: "Gerai Massal", connect: true } })).status()).toBe(201)
  await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti Nisa", phone: "081234567890" } })

  await page.goto(`${APP}/kasir/multi`)
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  await page.getByRole("radio", { name: "J&T Express" }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: "paket.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) })
  await expect(page.getByText("paket.csv")).toBeVisible()
  await page.getByRole("button", { name: "Periksa Baris" }).click()
  await expect(page).toHaveURL(/\/kiriman\/massal\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("tab", { name: "Siap (1)" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole("tab", { name: "Perlu Diperbaiki (1)" }).click()
  await expect(page.getByText("Kecamatan lebih dari satu, pilih yang benar")).toBeVisible()
  await page.getByRole("radio", { name: /Gubeng/ }).click()
  await page.getByRole("button", { name: "Simpan & Periksa" }).click()
  await expect(page.getByRole("tab", { name: "Siap (2)" })).toBeVisible({ timeout: 20_000 })
  await page.getByLabel("Isi semua paket bukan barang terlarang").check()
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
