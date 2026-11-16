import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-304: walk-in checkout end to end (quote → INV → sender/recipient → Tunai → Tandai Lunas & Cetak → AWB),
// timed from opening /kasir to the issued AWB: the scripted path must finish in < 45 s (spec 03 Path B).
test("Checkout: kasir → INV → lunas tunai → resi terbit (< 45 s)", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-checkout")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Checkout", password: "checkout-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `c${Date.now().toString(36)}`, name: "Gerai Checkout", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti Nisa", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  await api.post(`${APP}/api/app/contacts/senders/${s}/verify-wa`, { headers: h, data: {} })
  await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })

  const started = Date.now()
  await page.goto(`${APP}/kasir`)
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByRole("button", { name: "Cek Ongkir" }).click()
  await page.getByRole("listitem").filter({ hasText: "J&T Express" }).getByRole("button", { name: "Pilih & Lanjutkan" }).click()
  await expect(page).toHaveURL(/\/kiriman\/[0-9a-z]{7}$/)
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.getByLabel("Isi paket", { exact: true }).fill("Pakaian")
  await page.getByLabel("Isi paket bukan barang terlarang atau berbahaya").check()
  await page.getByRole("button", { name: "Tunai" }).click()
  await page.getByLabel("Uang diterima").fill("20000")
  await expect(page.getByText("Kembalian Rp 7.500")).toBeVisible()
  const wide = (page.viewportSize()?.width ?? 0) >= 768
  await page.getByRole("button", { name: wide ? /Tandai Lunas & Cetak · Rp 12\.500/ : "Tandai Lunas & Cetak" }).click()
  await expect(page.getByText("Resi terbit").first()).toBeVisible()
  await expect(page.getByText(/AWB JT\d{10}/)).toBeVisible()
  await expect(page.getByText("LUNAS")).toBeVisible()
  expect(Date.now() - started).toBeLessThan(45_000)
})
