import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-405: Kendala & Klaim — a lost J&T parcel shows under `Bisa Klaim` with a countdown chip; `Ajukan Klaim` opens a
// draft; marking it submitted moves the claim on.
test("Kendala & Klaim: paket hilang → hitung mundur → ajukan klaim", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-kendala")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Kendala", password: "kendala-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `n${Date.now().toString(36)}`, name: "Gerai Kendala", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const r = ((await (await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" } })).json()) as { data: { slug: string } }).data.slug
  await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: s, recipientId: r, content: "Pakaian", prohibitedAck: true } })
  await api.post(`${APP}/api/app/shipments/${slug}/dispatch`, { headers: h, data: {} })
  await api.post(`${APP}/api/app/dev/provider-status`, { headers: h, data: { slug, category: "LOST" } })

  await page.goto(`${APP}/kiriman?tab=kendala`)
  await page.getByRole("button", { name: /^Bisa Klaim/ }).click()
  await expect(page.getByText(/^Bisa Klaim — sisa \d+ hari$/)).toBeVisible()
  await page.getByRole("button", { name: "Ajukan Klaim" }).click()
  await expect(page.getByText("Draf klaim dibuat. Kirim paket klaim ke Live Chat Mengantar.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Paket klaim" })).toBeVisible()
  await page.getByRole("button", { name: "Tandai Sudah Diajukan" }).click()
  await expect(page.getByText("Klaim hilang: Diajukan")).toBeVisible()
})
