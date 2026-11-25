import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-302: add a reseller sender, confirm WhatsApp at the counter, then a recipient with area search.
test("Kontak: tambah pengirim reseller, verifikasi WA, tambah penerima", async ({ page, context, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "one viewport is enough for the flow; gates cover 390/768")
  const email = uniqueEmail("e2e-kontak")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Kontak", password: "kontak-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `k${Date.now().toString(36)}`, name: "Gerai Kontak" } })).status()).toBe(201)

  await page.goto(`${APP}/kontak/pengirim`)
  await expect(page.getByText("Belum ada pengirim")).toBeVisible()
  await page.getByRole("button", { name: "Tambah Pengirim" }).first().click()
  await page.getByRole("button", { name: "Toko Reseller / Dropship" }).click()
  await page.getByLabel("Nama pengirim asli").fill("Ibu Siti Nisa")
  await page.getByLabel("Nomor WhatsApp (untuk retur & COD)").fill("0812 3456 7890")
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Toko reseller wajib punya nama toko untuk label.").first()).toBeVisible()
  await page.getByLabel("Nama toko tercetak di label").fill("TOKO HIJAB NISA")
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByRole("cell", { name: /TOKO HIJAB NISA/ })).toBeVisible()
  await page.getByRole("button", { name: "Ubah" }).click()
  await expect(page.getByRole("link", { name: "Kirim pesan uji" })).toHaveAttribute("href", /wa\.me\/6281234567890/)
  await page.getByRole("button", { name: "Pengirim sudah menerima" }).click()
  await expect(page.getByText("WhatsApp terverifikasi di loket")).toBeVisible()
  await page.keyboard.press("Escape")

  await page.goto(`${APP}/kontak/penerima`)
  await page.getByRole("button", { name: "Tambah Penerima" }).first().click()
  await page.getByLabel("Nama penerima").fill("Rina Kartika")
  await page.getByLabel("Nomor HP penerima").fill("+62 857-1234-8821")
  await page.getByLabel("Kecamatan tujuan").fill("dago")
  await page.getByRole("button", { name: /Dago, Coblong/ }).click()
  await page.getByLabel("Alamat lengkap").fill("Jl. Dago Asri No. 14")
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByRole("cell", { name: /085712348821/ })).toBeVisible()
  await expect(page.getByText("Riwayat baru").first()).toBeVisible()

  // Open recipient detail (full unmasked phone visible) → 1-click Buat Kiriman prefills recipient in Kasir.
  await page.getByRole("link", { name: "Rina Kartika" }).first().click()
  await expect(page).toHaveURL(/\/kontak\/penerima\/.+/)
  await expect(page.getByText("No. HP: 085712348821")).toBeVisible()
  await page.getByRole("link", { name: "Buat Kiriman" }).click()
  await expect(page).toHaveURL(/\/kasir\?penerima=/)
  await expect(page.getByText("Rina Kartika", { exact: true })).toBeVisible()
  await expect(page.getByText(/085712348821 · Dago, Coblong/)).toBeVisible()
})
