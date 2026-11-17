import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-303 + DEC-237: Cek Ongkir Cepat → courier cards (Non-COD and COD Barang) → "Buat Kiriman dari Tarif Ini"
// prefills Kiriman Satuan with the same request and service.
test("Cek Ongkir Cepat: Non-COD, COD Barang, buat kiriman dari hasil", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-kuota")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Kuota", password: "kuota-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `q${Date.now().toString(36)}`, name: "Gerai Kuota", connect: true } })).status()).toBe(201)

  // Service fee on (Sol delta B-4): offered for Non-COD, never sent for COD Barang.
  expect((await api.post(`${APP}/api/app/settings/packing`, { headers: h, data: { items: [{ name: "Plastik", priceIdr: 1000, active: true }], serviceFeeEnabled: true, serviceFeeIdr: 2000 } })).status()).toBe(200)

  await page.goto(`${APP}/kasir/cek-cepat`)
  await expect(page.getByText("Biaya layanan loket Rp 2.000")).toBeVisible()
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByRole("main").getByRole("button", { name: "Cek Ongkir" }).click()
  const list = page.getByRole("list", { name: "Daftar ekspedisi" })
  await expect(list.getByText("J&T Express")).toBeVisible()
  await expect(list.getByText("Rp 12.500")).toBeVisible()
  await expect(list.getByText("Termurah").first()).toBeVisible()

  // Non-COD handoff keeps packing and the counter-fee choice (Sol R1 #6): pick packing, turn the fee off.
  await page.getByLabel("Packing (opsional)").click()
  await page.getByRole("option", { name: /Plastik/ }).click()
  await page.getByRole("checkbox", { name: /Biaya layanan loket/ }).uncheck()
  await page.getByRole("main").getByRole("button", { name: "Cek Ongkir" }).click()
  await page.getByRole("listitem").filter({ hasText: "J&T Express" }).getByRole("button", { name: "Buat Kiriman dari Tarif Ini" }).click()
  await expect(page).toHaveURL(/\/kasir\?.*packing=Plastik/)
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByRole("checkbox", { name: /Biaya layanan loket/ })).not.toBeChecked()
  // Plastik Rp 1.000 + J&T Rp 12.500, no counter fee.
  await expect(page.getByText("Rp 13.500").first()).toBeVisible()
  // Editing the form drops the selection until the next quote (Sol R1 #1).
  await page.getByRole("button", { name: "2 kg" }).click()
  await expect(page.getByText("Data paket berubah. Tekan Cek Ongkir lagi sebelum memilih ekspedisi.")).toBeVisible()
  await expect(page.getByText("Cek ongkir lalu pilih ekspedisi. Rincian biaya muncul di sini.")).toBeVisible()
  await page.goto(`${APP}/kasir/cek-cepat`)
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()

  await page.getByRole("button", { name: "COD Barang" }).click()
  await expect(page.getByText("Biaya layanan loket Rp 2.000")).toHaveCount(0)
  await page.getByLabel("Harga barang (COD)").fill("150000")
  await page.getByRole("main").getByRole("button", { name: "Cek Ongkir" }).click()
  await expect(list.getByText("Rp 167.500").first()).toBeVisible()

  // DEC-237: the result prefills Kiriman Satuan (no INV until the POS primary); the chosen service stays selected.
  await page.getByRole("listitem").filter({ hasText: "J&T Express" }).getByRole("button", { name: "Buat Kiriman dari Tarif Ini" }).click()
  await expect(page).toHaveURL(/\/kasir\?/)
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByLabel("Harga barang (COD)")).toHaveValue("150.000")
})
