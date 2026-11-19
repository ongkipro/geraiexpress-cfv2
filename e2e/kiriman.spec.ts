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
  await expect(page.getByRole("link", { name: /^Belum Dibayar\s*1$/ })).toBeVisible()
  await expect(page.getByRole("link", { name: "Ekspor CSV" })).toHaveAttribute("href", /\/api\/app\/shipments-export\.csv\?/)
  await page.getByRole("link", { name: /Belum Dibayar/ }).click()
  await expect(page).toHaveURL(/tab=belum-dibayar/)
  await page.getByRole("button", { name: "Tandai Lunas" }).first().click()
  await expect(page.getByText(`INV ${slug.toUpperCase()} ditandai lunas (QRIS).`)).toBeVisible()
  await expect(page.getByRole("link", { name: /^Belum Dibayar\s*0$/ })).toBeVisible()
  await expect(page.getByText("Belum ada kiriman di sini")).toBeVisible()

  await page.goto(`${APP}/kiriman`)
  await page.getByLabel("Cari INV, resi, nama, atau HP").fill("tidak-ada-xyz")
  await page.getByLabel("Cari INV, resi, nama, atau HP").press("Enter")
  await expect(page.getByText("Tidak ada yang cocok")).toBeVisible()
  await page.getByRole("button", { name: "Hapus Filter" }).click()
  await expect(page.getByRole("link", { name: `INV ${slug.toUpperCase()}` }).first()).toBeVisible()

  // DEC-251C: `Pergerakan` → `Macet ≥ 3 hari` lands in the URL and the request; a just-issued INV is not stuck.
  const listed = page.waitForRequest((r) => r.url().includes("/api/app/shipments?") && r.url().includes("macet=3"))
  await page.getByRole("combobox", { name: "Pergerakan paket" }).click()
  await page.getByRole("option", { name: "Macet ≥ 3 hari" }).click()
  await listed
  await expect(page).toHaveURL(/macet=3/)
  await expect(page.getByText("Tidak ada yang cocok")).toBeVisible()
  await page.getByRole("button", { name: "Hapus Filter" }).click()
  await expect(page).not.toHaveURL(/macet=/)
  await expect(page.getByRole("link", { name: `INV ${slug.toUpperCase()}` }).first()).toBeVisible()

  // Sol R1-9: a `Muat Lebih Banyak` page that answers after the `macet` filter changed is dropped, never appended.
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  let sample: Record<string, unknown> | null = null
  await page.route("**/api/app/shipments?*", async (route) => {
    const url = route.request().url()
    if (url.includes("cursor=")) {
      await held
      return route.fulfill({ json: { ok: true, data: { items: [{ ...sample, slug: "zzzzzzz", awb_number: null }], nextCursor: null, counts: {} } } })
    }
    const res = await route.fetch()
    const j = (await res.json()) as { data: { items: Array<Record<string, unknown>>; nextCursor: string | null } }
    sample ??= j.data.items[0] ?? null
    if (!url.includes("macet=")) j.data.nextCursor = "1:abcdefg"
    return route.fulfill({ response: res, json: j })
  })
  await page.goto(`${APP}/kiriman`)
  await page.getByRole("button", { name: "Muat Lebih Banyak" }).click()
  await page.getByRole("combobox", { name: "Pergerakan paket" }).click()
  await page.getByRole("option", { name: "Macet ≥ 3 hari" }).click()
  await expect(page.getByText("Tidak ada yang cocok")).toBeVisible()
  release()
  await page.waitForTimeout(800)
  await expect(page.getByRole("link", { name: "INV ZZZZZZZ" })).toHaveCount(0)
  await expect(page.getByText("Tidak ada yang cocok")).toBeVisible()
  await page.unroute("**/api/app/shipments?*")
})
