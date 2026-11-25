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
  // DEC-251A: 1 · 2 · 3 first — the recipient's district becomes the destination and the quote runs by itself.
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
  // Supervisor pre-review: `Ganti` on the recipient drops its district, the rates and the chosen courier at once.
  await page.locator('[aria-labelledby="pihak-recipients"]').getByRole("button", { name: "Ganti" }).click()
  await expect(page.getByRole("radiogroup", { name: "Pilih ekspedisi" })).toHaveCount(0)
  await expect(page.locator('[aria-labelledby="pilih-ekspedisi"]')).toContainText("Belum dipilih")
  await expect(page.getByText("Cek ongkir lalu pilih ekspedisi. Rincian biaya muncul di sini.")).toBeVisible()
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toHaveAttribute("aria-checked", "true")
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
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.getByLabel("Harga barang (COD)").fill("150000")
  await page.getByRole("radio", { name: /^J&T Express/ }).click()

  await page.getByRole("button", { name: "Pengirim baru" }).click()
  const sheet = page.getByRole("dialog")
  await sheet.getByLabel("Nama pengirim asli").fill("Pak Budi Santoso")
  await sheet.getByLabel("Nomor WhatsApp (untuk retur & COD)").fill("081377776666")
  await sheet.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Pak Budi Santoso").first()).toBeVisible()
  await page.getByRole("button", { name: "Pengirim sudah menerima" }).click()
  await expect(page.getByText("WhatsApp terverifikasi di loket")).toBeVisible()

  await page.getByLabel("Isi paket", { exact: true }).fill("Pakaian")
  await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
  await page.getByRole("button", { name: /Simpan & Cetak/ }).last().click()
  await expect(page.getByText("Resi terbit").first()).toBeVisible()
  await expect(page.getByText(/AWB JT\d{10}/)).toBeVisible()
})

test("Kasir popup Tambah Penerima: tidak tutup saat klik luar, Batal menutup, cari kecamatan → kelurahan → kode pos otomatis", async ({ page, context, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "modal + 2-col sticky flow checked once on desktop")
  const email = uniqueEmail("e2e-kasir-popup")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Popup", password: "popup-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `p${Date.now().toString(36)}`, name: "Gerai Popup", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/kasir`)
  // 2-column layout: right sticky summary sits beside the left input column on desktop (x > left column's x).
  const leftBox = (await page.locator('[aria-labelledby="pihak-senders"]').boundingBox())!
  const rightBox = (await page.locator('[aria-labelledby="ringkasan-judul"]').boundingBox())!
  expect(rightBox.x).toBeGreaterThan(leftBox.x + leftBox.width - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)

  // Open Tambah Penerima popup, fill partial data, click outside backdrop → popup MUST stay open & preserve data.
  await page.getByRole("button", { name: "Penerima baru" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Nama penerima").fill("Dian Kusuma")
  await dialog.getByLabel("Nomor HP penerima").fill("085611223344")
  await page.mouse.click(8, 8)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel("Nama penerima")).toHaveValue("Dian Kusuma")

  // Explicit Batal closes the popup.
  await dialog.getByRole("button", { name: "Batal" }).click()
  await expect(dialog).toBeHidden()

  // Reopen, search Kecamatan ("sukodono") → pick Sidoarjo group (2 kelurahan) → narrow Kelurahan ("panj") → Kode pos auto-fills 61216!
  await page.getByRole("button", { name: "Penerima baru" }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Nama penerima").fill("Dian Kusuma")
  await dialog.getByLabel("Nomor HP penerima").fill("085611223344")
  await dialog.getByLabel("Kecamatan tujuan").fill("sukodono")
  await dialog.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Kec\. Sukodono.*Sidoarjo/i }).click()
  const kelInput = dialog.getByLabel("Kelurahan / Desa")
  await expect(kelInput).toBeFocused()
  await kelInput.fill("panj")
  await dialog.getByRole("list", { name: "Hasil pencarian kelurahan" }).getByRole("button", { name: /Panjunan/i }).click()
  await expect(dialog.getByLabel(/Kode pos/)).toHaveValue("61216")
  await dialog.getByLabel("Alamat lengkap").fill("Jl. Raya Panjunan No. 22 RT 02 RW 01")
  await dialog.getByRole("button", { name: "Simpan" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('[aria-labelledby="pihak-recipients"]')).toContainText("Dian Kusuma")
  await expect(page.locator('[aria-labelledby="pihak-recipients"]')).toContainText("61216")
  // Auto-quote runs for the newly added recipient's exact subdistrict.
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toBeVisible({ timeout: 20_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})
