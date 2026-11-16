import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-401: Keuangan — issue an INV, Mengantar mutations appear after `Sinkronkan Sekarang`, the INV is linked, an
// unknown type lands in `Selisih Sync`, a second tap within 30 s is refused politely.
test("Keuangan: sinkronkan mutasi Mengantar, Selisih Sync", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-uang")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Uang", password: "uang-e2e-kuat-12" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `u${Date.now().toString(36)}`, name: "Gerai Uang", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const r = ((await (await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" } })).json()) as { data: { slug: string } }).data.slug
  await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: s, recipientId: r, content: "Pakaian", prohibitedAck: true } })
  expect((await api.post(`${APP}/api/app/shipments/${slug}/dispatch`, { headers: h, data: {} })).status()).toBe(200)
  expect((await api.post(`${APP}/api/app/dev/mock-invoices`, { headers: h, data: {} })).status()).toBe(201)

  await page.goto(`${APP}/keuangan`)
  await page.getByRole("button", { name: "Sinkronkan Sekarang" }).click()
  await expect(page.getByText(/Sinkron selesai: \d+ mutasi baru\./)).toBeVisible()
  await expect(page.getByText("Saldo Mengantar (sync)")).toBeVisible()
  await page.getByRole("link", { name: "Mutasi Sync" }).click()
  await expect(page.getByText(`INV ${slug.toUpperCase()}`).first()).toBeVisible()
  await page.getByRole("link", { name: /Selisih Sync/ }).click()
  await expect(page.getByText("Tipe belum dikenali")).toBeVisible()
  await page.getByRole("button", { name: "Sinkronkan Sekarang" }).click()
  await expect(page.getByText("Sinkronisasi baru saja dijalankan. Coba lagi dalam 30 detik.")).toBeVisible()
})
