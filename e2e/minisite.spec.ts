import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-501: a customer fills `Kirim dari Rumah` on the gerai mini-site, gets the INV QR; the counter opens that INV
// (prefilled quote), issues it under the same code; the public tracking page shows only initials.
test("Mini-site: QR dari rumah → kasir buka INV yang sama → lacak tanpa data pribadi", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-mini")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Mini", password: "mini-e2e-kuat-123" } })
  const tenant = `m${Date.now().toString(36)}`
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: tenant, name: "Gerai Mini", connect: true } })).status()).toBe(201)
  const site = APP.replace("app.geraiexpress", `${tenant}.geraimitra`)

  await page.goto(`${site}/kirim`)
  await expect(page.getByRole("heading", { name: "Kirim dari Rumah" })).toBeVisible()
  await page.getByLabel("Nama pengirim").fill("Ibu Siti Nisa")
  await page.getByLabel("No. WhatsApp pengirim").fill("081234567890")
  await page.getByLabel("Nama penerima").fill("Rina Kartika")
  await page.getByLabel("No. HP penerima").fill("085712348821")
  await page.getByLabel("Kecamatan penerima").fill("tebet")
  await page.getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByLabel("Alamat lengkap").fill("Jl. Tebet Barat No. 14")
  await page.getByLabel("Isi paket").fill("Pakaian")
  await page.getByRole("button", { name: "Buat Kode QR" }).click()
  await expect(page).toHaveURL(/\/kirim\/[a-z0-9]{7}$/)
  const slug = page.url().split("/").pop()!
  await expect(page.getByText(`INV ${slug.toUpperCase()}`).first()).toBeVisible()

  await page.goto(`${APP}/kasir`)
  await page.getByLabel("Pindai QR pelanggan atau ketik INV").fill(`${site}/kirim/${slug}`)
  await page.getByRole("button", { name: "Buka", exact: true }).click()
  await expect(page.getByText(`INV ${slug.toUpperCase()}`).first()).toBeVisible()
  await page.getByRole("button", { name: "Cek Ongkir" }).click()
  await page.getByRole("listitem").filter({ hasText: "J&T Express" }).getByRole("button", { name: "Pilih", exact: true }).click()
  // The QR's sender and recipient are already on the POS (DEC-237): the counter only confirms and pays.
  await expect(page.getByText("Rina Kartika").first()).toBeVisible()

  // Issue it on the POS: the QR's INV is reused (one INV for QR, receipt and tracking).
  await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
  await page.getByRole("button", { name: "Bayar nanti" }).click()
  await page.getByRole("button", { name: /Simpan & Cetak/ }).last().click()
  await expect(page.getByText("Resi terbit").first()).toBeVisible()
  await expect(page.getByText(`INV ${slug.toUpperCase()}`).first()).toBeVisible()
  await page.goto(`${site}/lacak?q=${slug.toUpperCase()}`)
  await expect(page.getByText("R*** K******")).toBeVisible()
  await expect(page.locator("body")).not.toContainText("Rina")
  await expect(page.locator("body")).not.toContainText("085712348821")
})
