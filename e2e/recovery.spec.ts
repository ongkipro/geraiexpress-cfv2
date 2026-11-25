import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-402: low balance → INV held (Menunggu Saldo, pre-flight warning, no label) → top-up in Mengantar → owner taps
// `Sinkronkan Sekarang` → the held batch is paid automatically and the AWB appears.
test("Menunggu Saldo → isi saldo → sinkronkan → resi terbit otomatis", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-pulih")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Pulih", password: "pulih-e2e-kuat-12" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `p${Date.now().toString(36)}`, name: "Gerai Pulih", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const r = ((await (await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" } })).json()) as { data: { slug: string } }).data.slug
  await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: s, recipientId: r, content: "Pakaian", prohibitedAck: true } })
  // The mock is shared by every gerai on the dev server: the seller balance is global there, so hold, then top up.
  await api.post(`${APP}/api/app/dev/mock-invoices`, { headers: h, data: { sellerBalance: 0 } })
  expect(((await (await api.post(`${APP}/api/app/shipments/${slug}/dispatch`, { headers: h, data: {} })).json()) as { data: { state: string } }).data.state).toBe("provider_unpaid_hold")

  await page.goto(`${APP}/kiriman/${slug}`)
  await expect(page.getByText("Menunggu saldo Mengantar").first()).toBeVisible()
  await expect(page.getByText("Label belum bisa dicetak.", { exact: false })).toBeVisible()
  await api.post(`${APP}/api/app/dev/mock-invoices`, { headers: h, data: { topUp: 200_000 } })
  await page.goto(`${APP}/keuangan`)
  await page.getByRole("button", { name: "Sinkronkan Sekarang" }).click()
  await expect(page.getByText(/Sinkron selesai/)).toBeVisible({ timeout: 15_000 })
  await page.goto(`${APP}/kiriman/${slug}`)
  await expect(page.getByText(/Resi terbit/).first()).toBeVisible()
  await expect(page.getByText(/AWB JT/)).toBeVisible()
  await api.post(`${APP}/api/app/dev/mock-invoices`, { headers: h, data: { sellerBalance: 1_000_000 } })
})
