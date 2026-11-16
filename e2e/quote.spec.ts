import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-303: Cek Ongkir Cepat → courier cards (Non-COD and COD Barang) → "Buat Kiriman dari Hasil Ini" freezes the quote.
test("Cek Ongkir Cepat: Non-COD, COD Barang, buat kiriman dari hasil", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-kuota")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Kuota", password: "kuota-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `q${Date.now().toString(36)}`, name: "Gerai Kuota", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/kasir/cek-cepat`)
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByRole("button", { name: "Cek Ongkir" }).click()
  const list = page.getByRole("list", { name: "Daftar ekspedisi" })
  await expect(list.getByText("J&T Express")).toBeVisible()
  await expect(list.getByText("Rp 12.500")).toBeVisible()
  await expect(list.getByText("Termurah").first()).toBeVisible()

  await page.getByRole("button", { name: "COD Barang" }).click()
  await page.getByLabel("Harga barang (COD)").fill("150000")
  await page.getByRole("button", { name: "Cek Ongkir" }).click()
  await expect(list.getByText("Rp 167.500").first()).toBeVisible()

  await page.getByRole("listitem").filter({ hasText: "J&T Express" }).getByRole("button", { name: "Buat Kiriman dari Hasil Ini" }).click()
  await expect(page).toHaveURL(/\/kiriman\/[0-9a-z]{7}$/)
})
