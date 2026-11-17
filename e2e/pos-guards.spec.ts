import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// DEC-237 POS money guards (GPT-6.1 Sol review R1 #1/#2, R2-A/B/C). Network responses are intercepted so the races
// and server re-prices are deterministic: an answer to a superseded quote never restores a selection; the frozen
// card is the only amount paid; a changed sender COD payout also stops for confirmation.
async function seeded(page: Page, prefix: string) {
  const api = page.context().request
  const email = uniqueEmail(prefix)
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(page.context().request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Jaga", password: "jaga-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `g${Date.now().toString(36)}`, name: "Gerai Jaga", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti Nisa", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  await api.post(`${APP}/api/app/contacts/senders/${s}/verify-wa`, { headers: h, data: {} })
  await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })
  return api
}
async function quoteJt(page: Page, cod = false) {
  await page.goto(`${APP}/kasir`)
  if (cod) await page.getByRole("button", { name: "COD Barang" }).click()
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  if (cod) await page.getByLabel("Harga barang (COD)").fill("150000")
  await page.getByRole("button", { name: "Cek Ongkir" }).click()
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
}
async function parties(page: Page) {
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.getByLabel("Isi paket", { exact: true }).fill("Pakaian")
  await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
}
const primary = (page: Page) => page.getByRole("button", { name: /Tandai Lunas & Cetak|Simpan & Cetak/ }).last()

test("an answer to a superseded quote never restores the selection (R2-A)", async ({ page }) => {
  await seeded(page, "e2e-jaga-a")
  await quoteJt(page)
  // Hold the next /quotes answer, edit the weight while it is in flight, then release it.
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route("**/api/app/quotes", async (route) => {
    await held
    await route.continue()
  })
  await page.getByRole("button", { name: "Cek Ongkir" }).click()
  await page.getByRole("button", { name: "2 kg" }).click()
  release()
  await page.waitForTimeout(1500)
  await expect(page.getByText("Cek ongkir lalu pilih ekspedisi. Rincian biaya muncul di sini.")).toBeVisible()
  await expect(primary(page)).toHaveCount(0)
})

test("the frozen card is the only amount paid; re-selecting the old card is refused (R1 #2, R2-B)", async ({ page }) => {
  const api = await seeded(page, "e2e-jaga-b")
  await quoteJt(page)
  await parties(page)
  // The server re-prices at freeze (+Rp 2.500 on the counter due: Rp 12.500 → Rp 15.000).
  await page.route("**/api/app/quotes/freeze", async (route) => {
    const res = await route.fetch()
    const j = (await res.json()) as { data: { card: { counterDueIdr: number } } }
    j.data.card.counterDueIdr += 2500
    await route.fulfill({ response: res, json: j })
  })
  await primary(page).click()
  await expect(page.getByText(/Ongkir yang terkunci berbeda: bayar di loket Rp 15\.000/)).toBeVisible()
  await expect(page.getByText("Rp 15.000").first()).toBeVisible()
  const slug = /INV ([0-9A-Z]{7})/.exec(await page.getByText(/INV [0-9A-Z]{7} · draf/).innerText())![1]!.toLowerCase()
  // Re-select the same (pre-freeze, Rp 12.500) card: the summary must stay on the frozen Rp 15.000, and the next
  // press may only proceed with that amount on screen (the payment records the INV's frozen due).
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
  await expect(page.locator("dl > div").filter({ has: page.getByRole("term").filter({ hasText: /^Bayar di loket$/ }) }).getByRole("definition")).toHaveText("Rp 15.000")
  const d = ((await (await api.get(`${APP}/api/app/shipments/${slug}`)).json()) as { data: { shipment: { counter_payment_status: string } } }).data
  expect(d.shipment.counter_payment_status).toBe("unpaid")
})

test("a changed sender COD payout also stops for confirmation (R2-C)", async ({ page }) => {
  const api = await seeded(page, "e2e-jaga-c")
  await quoteJt(page, true)
  await parties(page)
  await page.route("**/api/app/quotes/freeze", async (route) => {
    const res = await route.fetch()
    const j = (await res.json()) as { data: { card: { senderCodPayableIdr: number } } }
    j.data.card.senderCodPayableIdr -= 1000
    await route.fulfill({ response: res, json: j })
  })
  await primary(page).click()
  await expect(page.getByText(/Ongkir yang terkunci berbeda/)).toBeVisible()
  const slug = /INV ([0-9A-Z]{7})/.exec(await page.getByText(/INV [0-9A-Z]{7} · draf/).innerText())![1]!.toLowerCase()
  const d = ((await (await api.get(`${APP}/api/app/shipments/${slug}`)).json()) as { data: { shipment: { dispatch_state: string } } }).data
  expect(d.shipment.dispatch_state).toBe("draft")
})
