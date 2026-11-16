import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-404: Meja Retur — a returned parcel is received (true sender shown), `Kirim Kode Ambil` builds the WhatsApp
// message, the sender says the code and the parcel is handed back (`rts_returned_to_sender`).
test("Meja Retur: terima → Kode Ambil → serahkan", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-retur")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Retur", password: "retur-e2e-kuat-12" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `r${Date.now().toString(36)}`, name: "Gerai Retur", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const r = ((await (await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" } })).json()) as { data: { slug: string } }).data.slug
  await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: s, recipientId: r, content: "Pakaian", prohibitedAck: true } })
  const awb = ((await (await api.post(`${APP}/api/app/shipments/${slug}/dispatch`, { headers: h, data: {} })).json()) as { data: { awb: string } }).data.awb
  await api.post(`${APP}/api/app/dev/provider-status`, { headers: h, data: { slug, category: "RETURN" } })

  await page.goto(`${APP}/kiriman?tab=retur`)
  await expect(page.getByText(`${awb} · INV ${slug.toUpperCase()}`)).toBeVisible()
  await page.getByLabel("Pindai resi atau INV").fill(awb)
  await page.getByRole("button", { name: "Terima Paket Retur" }).click()
  await expect(page.getByText(`INV ${slug.toUpperCase()} diterima di gerai.`)).toBeVisible()
  await expect(page.getByText("Pengirim asli:")).toContainText("Ibu Siti")
  await page.getByRole("button", { name: "Kirim Kode Ambil" }).click()
  const link = page.getByRole("link", { name: "Buka WhatsApp" })
  await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/6281234567890\?text=/)
  const text = decodeURIComponent((await link.getAttribute("href"))!.split("text=")[1]!)
  const code = /Kode Ambil: (\d{4})/.exec(text)![1]!
  await page.getByLabel("Kode Ambil").fill(code)
  await page.getByRole("button", { name: "Serahkan ke Pengirim" }).click()
  await expect(page.getByText(`INV ${slug.toUpperCase()} sudah diserahkan ke pengirim.`)).toBeVisible()
  await expect(page.getByText("Sudah diserahkan (7 hari)")).toBeVisible()
})
