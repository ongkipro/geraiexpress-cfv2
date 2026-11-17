import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-304 + DEC-237: walk-in checkout end to end on the single-screen POS (`/kasir`: quote → courier → sender /
// recipient → Tunai → Tandai Lunas & Cetak → AWB without leaving the page), timed from opening /kasir to the issued
// AWB: the scripted path must finish in < 45 s (spec 03 Path B). The INV page then shows the same issued shipment.
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
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByRole("main").getByRole("button", { name: "Cek Ongkir" }).click()
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toHaveAttribute("aria-checked", "true")
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.getByLabel("Isi paket", { exact: true }).fill("Pakaian")
  await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
  await page.getByRole("button", { name: "Tunai" }).click()
  await page.getByLabel("Uang diterima").fill("20000")
  await expect(page.getByText("Kembalian Rp 7.500")).toBeVisible()
  // DEC-237: the POS summary column (with the amount in the primary) starts at 1024 px; below it the sticky bar.
  const wide = (page.viewportSize()?.width ?? 0) >= 1024
  await page.getByRole("button", { name: wide ? /Tandai Lunas & Cetak · Rp 12\.500/ : "Tandai Lunas & Cetak" }).click()
  await expect(page.getByText("Resi terbit").first()).toBeVisible()
  await expect(page.getByText(/AWB JT\d{10}/)).toBeVisible()
  await expect(page.getByText("LUNAS")).toBeVisible()
  expect(Date.now() - started).toBeLessThan(45_000)
  await expect(page).toHaveURL(/\/kasir$/)
  await page.getByRole("link", { name: /Buka INV [0-9A-Z]{7}/ }).click()
  await expect(page).toHaveURL(/\/kiriman\/[0-9a-z]{7}$/)
  await expect(page.getByText(/AWB JT\d{10}/)).toBeVisible()
})

// DEC-237 (Sol R1 #4): a brand-new sender is added and WhatsApp-verified on the POS, then a COD shipment is issued
// without leaving /kasir.
test("Checkout COD: pengirim baru diverifikasi di layar kasir → resi terbit", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-codpos")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu COD", password: "codpos-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `k${Date.now().toString(36)}`, name: "Gerai COD", connect: true } })).status()).toBe(201)
  await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })

  await page.goto(`${APP}/kasir`)
  await page.getByRole("button", { name: "COD Barang" }).click()
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByLabel("Harga barang (COD)").fill("150000")
  await page.getByRole("main").getByRole("button", { name: "Cek Ongkir" }).click()
  await page.getByRole("radio", { name: /^J&T Express/ }).click()

  await page.getByRole("button", { name: "Pengirim baru" }).click()
  const sheet = page.getByRole("dialog")
  await sheet.getByLabel("Nama pengirim asli").fill("Pak Budi Santoso")
  await sheet.getByLabel("Nomor WhatsApp (untuk retur & COD)").fill("081377776666")
  await sheet.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Pak Budi Santoso").first()).toBeVisible()
  await page.getByRole("button", { name: "Pengirim sudah menerima" }).click()
  await expect(page.getByText("WhatsApp terverifikasi di loket")).toBeVisible()

  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.getByLabel("Isi paket", { exact: true }).fill("Pakaian")
  await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
  await page.getByRole("button", { name: /Simpan & Cetak/ }).last().click()
  await expect(page.getByText("Resi terbit").first()).toBeVisible()
  await expect(page.getByText(/AWB JT\d{10}/)).toBeVisible()
})
