import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-403: Pickup & Manifest — start a J&T manifest, a SiCepat parcel is blocked with the red banner, the J&T parcel
// goes in with the amber unpaid warning, driver fields + signature → handed over → Surat Jalan link.
test("Pickup: pindai, salah kurir diblokir, serah terima, Surat Jalan", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-pickup")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Pickup", password: "pickup-e2e-kuat-12" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `k${Date.now().toString(36)}`, name: "Gerai Pickup", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const r = ((await (await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const issue = async (serviceCode: string) => {
    const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode } })).json()) as { data: { slug: string } }).data.slug
    await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: s, recipientId: r, content: "Pakaian", prohibitedAck: true } })
    return ((await (await api.post(`${APP}/api/app/shipments/${slug}/dispatch`, { headers: h, data: {} })).json()) as { data: { awb: string } }).data.awb
  }
  const jt = await issue("JT")
  const sc = await issue("SiCepat")

  await page.goto(`${APP}/kiriman?tab=pickup`)
  await page.getByRole("listitem").filter({ hasText: "J&T" }).getByRole("button", { name: "Mulai Pindai" }).click()
  await expect(page.getByRole("heading", { name: "Manifest J&T" })).toBeVisible()
  const box = page.getByLabel("Pindai barcode resi atau QR INV")
  await box.fill(sc)
  await box.press("Enter")
  await expect(page.getByRole("alert")).toHaveText("SALAH KURIR! Paket ini milik SiCepat, bukan J&T.")
  await box.fill(jt)
  await box.press("Enter")
  // Issued without counter payment → added with the amber warning (never blocked, DEC-220).
  await expect(page.getByRole("status").filter({ hasText: "Belum dibayar pelanggan — tagih dulu." })).toBeVisible()
  await page.getByRole("button", { name: "Selesai & Tanda Tangan" }).click()
  await expect(page.getByText("Nama kurir 2–60 huruf.").first()).toBeVisible()
  await page.getByLabel("Nama kurir").fill("Budi Kurir")
  await page.getByLabel("No HP kurir").fill("0812-9999-0000")
  await page.getByLabel("No. polisi").fill("d 1234 abc")
  const pad = page.getByLabel("Area tanda tangan kurir")
  const b = (await pad.boundingBox())!
  await page.mouse.move(b.x + 20, b.y + 30)
  await page.mouse.down()
  await page.mouse.move(b.x + 120, b.y + 80, { steps: 8 })
  await page.mouse.move(b.x + 200, b.y + 40, { steps: 8 })
  await page.mouse.up()
  await page.getByRole("button", { name: "Selesai & Tanda Tangan" }).click()
  await expect(page.getByRole("link", { name: "Cetak Surat Jalan" })).toBeVisible()
  const href = await page.getByRole("link", { name: "Cetak Surat Jalan" }).getAttribute("href")
  const pdf = await api.get(`${APP}${href}`)
  expect(pdf.headers()["content-type"]).toBe("application/pdf")
})
