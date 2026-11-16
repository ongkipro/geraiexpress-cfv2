import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-307: open shift → take a tunai payment at checkout → live drawer total → close with a variance (reason + note).
test("Shift Loket: buka, terima tunai, tutup dengan selisih", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-shift")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Shift", password: "shift-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `s${Date.now().toString(36)}`, name: "Gerai Shift", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/kasir/shift`)
  await page.getByLabel("Modal awal laci").fill("150000")
  await page.getByRole("button", { name: "Buka Shift" }).click()
  await expect(page.getByText("Seharusnya di laci")).toBeVisible()

  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const r = ((await (await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" } })).json()) as { data: { slug: string } }).data.slug
  await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: s, recipientId: r, content: "Pakaian", prohibitedAck: true } })
  await api.post(`${APP}/api/app/shipments/${slug}/payment`, { headers: { ...h, "idempotency-key": `e2eshift${slug}` }, data: { method: "tunai", cashReceivedIdr: 20000 } })

  await page.reload()
  await expect(page.getByText("Seharusnya di laci").locator("..")).toContainText("Rp 162.500")
  await page.getByLabel("Uang tunai fisik dihitung").fill("160000")
  await expect(page.getByText("Selisih Rp 2.500 (kurang)")).toBeVisible()
  await page.getByRole("button", { name: "Tutup Shift" }).click()
  await expect(page.getByRole("alert")).toContainText("Ada selisih kas")
  await page.getByRole("radio", { name: "Salah kembalian" }).click()
  await page.getByLabel("Catatan").fill("kembalian lebih")
  await page.getByRole("button", { name: "Tutup Shift" }).click()
  await expect(page.getByRole("button", { name: "Buka Shift" })).toBeVisible()
  await expect(page.getByText("Selisih Rp 2.500 (kurang)").first()).toBeVisible()
})
