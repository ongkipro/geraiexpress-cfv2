import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-701 (PR-22, spec 03 §5): the owner uploads the outlet QRIS, pairs a Layar Pelanggan from /kasir, and a second
// browser context with NO cookies (a phone that never signed in) follows the counter live: checkout with the 40 px
// total and the QRIS card → paid (`Terima kasih`, INV, change, tracking QR) → unpaired.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")

test("Layar Pelanggan: pasangkan HP tanpa login → rincian & QRIS → terima kasih → putus", async ({ page, context, request, browser }, info) => {
  const email = uniqueEmail("e2e-layar")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Layar", password: "layar-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `l${Date.now().toString(36)}`, name: "Gerai Layar", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti Nisa", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  await api.post(`${APP}/api/app/contacts/senders/${s}/verify-wa`, { headers: h, data: {} })
  await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))

  // Owner uploads the outlet's static QRIS (Pengaturan › Printer & Struk).
  await page.goto(`${APP}/pengaturan/printer`)
  await expect(page.getByText("QRIS Loket (Layar Pelanggan)")).toBeVisible()
  // Sol R1 F7: a network failure shows Indonesian copy, never the browser's English exception text.
  await page.route("**/api/app/media?purpose=qris", (r) => r.abort("failed"))
  await page.getByLabel("Pilih gambar QRIS").setInputFiles({ name: "qris.png", mimeType: "image/png", buffer: PNG_1PX })
  await expect(page.getByText("Gagal mengunggah gambar QRIS. Periksa koneksi lalu coba lagi.")).toBeVisible()
  await expect(page.getByText(/Failed to fetch|TypeError|NetworkError/)).toHaveCount(0)
  await page.unroute("**/api/app/media?purpose=qris")
  await page.getByLabel("Pilih gambar QRIS").setInputFiles({ name: "qris.png", mimeType: "image/png", buffer: PNG_1PX })
  await expect(page.getByText("QRIS sudah terpasang.")).toBeVisible()

  // Pair from /kasir.
  await page.goto(`${APP}/kasir`)
  await page.getByRole("button", { name: /^Layar Pelanggan/ }).click()
  const dialog = page.getByRole("dialog", { name: "Layar Pelanggan" })
  await dialog.getByRole("button", { name: "Pasangkan Layar" }).click()
  await expect(dialog.getByRole("img", { name: "QR untuk memasangkan layar pelanggan" })).toBeVisible()
  const pairUrl = (await dialog.locator("code").innerText()).trim()
  expect(pairUrl).toMatch(/\/kasir\/layar-pelanggan\?gerai=l[0-9a-z]+&kode=[A-Za-z0-9_-]{43}$/)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Layar Pelanggan (terhubung)" })).toBeVisible()

  // The paired device: a fresh context with no cookies, same viewport as this project.
  const device = await browser.newContext({ viewport: info.project.use.viewport ?? { width: 1280, height: 800 } })
  const screenErrors: string[] = []
  const openScreen = async (url: string) => {
    const p = await device.newPage()
    p.on("pageerror", (e) => screenErrors.push(e.message))
    p.on("console", (m) => m.type() === "error" && screenErrors.push(m.text()))
    await p.goto(url)
    return p
  }
  let screen = await openScreen(pairUrl)
  await expect(screen.getByRole("heading", { name: "Selamat datang di Gerai Layar" })).toBeVisible()
  expect(await device.cookies()).toEqual([])

  // Counter selects a courier (QRIS is the default method): the display shows lines, the 40 px total and the QRIS.
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByRole("main").getByRole("button", { name: "Cek Ongkir" }).click()
  // Sol R1 F6: the first state write after choosing the courier fails at the network; the counter retries by itself
  // (1.5 s) and the display reaches checkout with no further input.
  let stateCalls = 0
  await page.route("**/api/app/customer-display/state", (r) => (stateCalls++ === 0 ? r.abort("failed") : r.continue()))
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
  await expect(screen.getByText("Rincian pembayaran")).toBeVisible({ timeout: 10_000 })
  expect(stateCalls).toBeGreaterThanOrEqual(2)
  await page.unroute("**/api/app/customer-display/state")
  await expect(screen.getByRole("heading", { name: /J&T Express/ })).toBeVisible()
  const total = screen.locator("[data-total]")
  await expect(total).toHaveText("Rp 12.500")
  expect(await total.evaluate((el) => getComputedStyle(el).fontSize)).toBe("40px")
  await expect(screen.getByText("Ongkos kirim")).toBeVisible()
  await expect(screen.getByRole("img", { name: "QRIS gerai" })).toBeVisible()
  await expect(screen.getByText(/Tujuan Tebet Barat/)).toBeVisible()
  // Never cost, margin, phone numbers or street on the customer screen.
  const text = await screen.locator("main").innerText()
  for (const leak of ["Modal", "laba", "0857", "0812", "Jl. Tebet", "Rina"]) expect(text).not.toContain(leak)
  expect(await screen.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)

  // Sol R1 F3: `Buat Kode Baru` on an unchanged checkout publishes it to the new pairing at once; the old one ends.
  await page.getByRole("button", { name: "Layar Pelanggan (terhubung)" }).click()
  const again = page.getByRole("dialog", { name: "Layar Pelanggan" })
  await again.getByRole("button", { name: "Buat Kode Baru" }).click()
  const nextUrl = (await again.locator("code").innerText()).trim()
  expect(nextUrl).not.toBe(pairUrl)
  await page.keyboard.press("Escape")
  await expect(screen.getByRole("heading", { name: "Layar belum terhubung" })).toBeVisible()
  await screen.close()
  screen = await openScreen(nextUrl)
  await expect(screen.getByText("Rincian pembayaran")).toBeVisible()
  await expect(screen.locator("[data-total]")).toHaveText("Rp 12.500")

  // Checkout in cash: the display thanks the customer with INV, change and the tracking QR.
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.getByLabel("Isi paket", { exact: true }).fill("Pakaian")
  await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
  await page.getByRole("button", { name: "Tunai" }).click()
  await expect(screen.getByText("Cara bayar:")).toBeVisible()
  await page.getByLabel("Uang diterima").fill("20000")
  const wide = (page.viewportSize()?.width ?? 0) >= 1024
  await page.getByRole("button", { name: wide ? /Tandai Lunas & Cetak · Rp 12\.500/ : "Tandai Lunas & Cetak" }).click()
  await expect(page.getByText("Resi terbit").first()).toBeVisible()
  await expect(screen.getByRole("heading", { name: "Terima kasih!" })).toBeVisible()
  await expect(screen.getByText(/^INV [0-9A-Z]{7}$/)).toBeVisible()
  await expect(screen.getByText("Kembalian")).toBeVisible()
  await expect(screen.getByText("Rp 7.500")).toBeVisible()
  await expect(screen.getByRole("img", { name: /QR lacak paket INV/ })).toBeVisible()

  // Unpair from the counter: the device disconnects.
  await page.getByRole("button", { name: "Layar Pelanggan (terhubung)" }).click()
  await page.getByRole("dialog", { name: "Layar Pelanggan" }).getByRole("button", { name: "Putuskan Layar" }).click()
  await expect(page.getByRole("dialog", { name: "Layar Pelanggan" }).getByRole("button", { name: "Pasangkan Layar" })).toBeVisible()
  await expect(screen.getByRole("heading", { name: "Layar belum terhubung" })).toBeVisible()
  await expect(screen.getByText("Layar pelanggan tidak lagi terhubung. Pasangkan ulang dari layar kasir.")).toBeVisible()

  // Expected: the poll that meets the ended pairing logs one 410 resource error; nothing else.
  expect(screenErrors.filter((e) => !/status of 410/.test(e))).toEqual([])
  expect(errors).toEqual([])
  await device.close()
})
