import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-311: Kiriman list — tabs with counts, Belum Dibayar + Tandai Lunas, search, owner CSV link.
test("Kiriman: tab Belum Dibayar, Tandai Lunas, cari", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-kiriman")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Kiriman", password: "kiriman-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `k${Date.now().toString(36)}`, name: "Gerai Kiriman", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const r = ((await (await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" } })).json()) as { data: { slug: string } }).data.slug
  await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: s, recipientId: r, content: "Pakaian", prohibitedAck: true } })
  expect((await api.post(`${APP}/api/app/shipments/${slug}/dispatch`, { headers: h, data: {} })).status()).toBe(200)

  await page.goto(`${APP}/kiriman`)
  await expect(page.getByRole("link", { name: /Belum Dibayar\s*\(1\)/ })).toBeVisible()
  await expect(page.getByRole("link", { name: "Ekspor CSV" })).toHaveAttribute("href", /\/api\/app\/shipments-export\.csv\?/)
  await page.getByRole("link", { name: /Belum Dibayar/ }).click()
  await expect(page).toHaveURL(/tab=belum-dibayar/)
  await page.getByRole("button", { name: "Tandai Lunas" }).first().click()
  await expect(page.getByText(`INV ${slug.toUpperCase()} ditandai lunas (QRIS).`)).toBeVisible()
  await expect(page.getByRole("link", { name: /Belum Dibayar\s*\(0\)/ })).toBeVisible()
  await expect(page.getByText("Belum ada kiriman di sini")).toBeVisible()

  await page.goto(`${APP}/kiriman`)
  await page.getByLabel("Cari INV, resi, nama, atau HP").fill("tidak-ada-xyz")
  await page.getByLabel("Cari INV, resi, nama, atau HP").press("Enter")
  await expect(page.getByText("Tidak ada yang cocok")).toBeVisible()
  await page.getByRole("button", { name: "Hapus Filter" }).click()
  await expect(page.getByRole("link", { name: `INV ${slug.toUpperCase()}` }).first()).toBeVisible()
})
