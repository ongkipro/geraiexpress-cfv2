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
  // DEC-251A: the recipient's district is the destination; the quote runs by itself.
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  if (cod) await page.getByLabel("Harga barang (COD)").fill("150000")
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
}
async function parties(page: Page) {
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
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
  await page.getByRole("main").getByRole("button", { name: "Hitung Ulang" }).click()
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

// Sol R1-1: while a press waits, the parties are locked; an edit that stales the quote supersedes the held freeze —
// its answer (even a re-priced one) never republishes the checkout; and no party, no freeze.
test("Sol R1-1: a superseded held freeze never republishes checkout; parties lock while pending; no recipient, no freeze", async ({ page }) => {
  await seeded(page, "e2e-jaga-d")
  await quoteJt(page)
  await parties(page)
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route("**/api/app/quotes/freeze", async (route) => {
    await held
    const res = await route.fetch()
    const j = (await res.json()) as { data: { card: { counterDueIdr: number } } }
    j.data.card.counterDueIdr += 2500
    await route.fulfill({ response: res, json: j })
  })
  const frozenAnswer = page.waitForResponse((r) => r.url().endsWith("/api/app/quotes/freeze"), { timeout: 30_000 })
  await primary(page).click()
  await expect(page.locator('[aria-labelledby="pihak-recipients"]').getByRole("button", { name: "Ganti" })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Penerima baru" })).toBeDisabled()
  await page.getByRole("button", { name: "2 kg" }).click()
  release()
  // The held answer has fully arrived (and been ignored) before anything else is checked or the page changes.
  await frozenAnswer
  await expect(primary(page)).toHaveCount(0)
  await expect(page.getByText(/Ongkir yang terkunci berbeda/)).toHaveCount(0)
  await expect(page.getByText(/INV [0-9A-Z]{7} · draf/)).toHaveCount(0)
  // The superseded INV is never adopted: no INV badge on section 5 (it shows whenever an INV is frozen on screen).
  await expect(page.locator('[aria-labelledby="ringkasan-judul"]').getByText(/^INV [0-9A-Z]{7}$/)).toHaveCount(0)
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toHaveAttribute("aria-checked", "false")
  await page.unroute("**/api/app/quotes/freeze")

  // No recipient (walk-in district check only): the primary asks for one and freezes nothing.
  await page.goto(`${APP}/kasir`)
  await page.getByRole("button", { name: "Cek kecamatan tujuan saja dulu" }).click()
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
  let freezes = 0
  page.on("request", (r) => r.url().endsWith("/api/app/quotes/freeze") && freezes++)
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /Ibu Siti Nisa/ }).click()
  await primary(page).click()
  await expect(page.getByText("Pilih penerima dulu.")).toBeVisible()
  expect(freezes).toBe(0)
})

// Sol R1-2: a cleared or zero weight drops the selection and cancels a pending auto-quote (10–100,000 g bounds).
test("Sol R1-2: clearing the weight drops the courier and never sends the stale grams", async ({ page }) => {
  await seeded(page, "e2e-jaga-w")
  // A fake clock makes the 500 ms debounce deterministic under any host load.
  await page.clock.install()
  await page.goto(`${APP}/kasir`)
  await page.clock.runFor(400)
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await page.clock.runFor(600)
  const radio = page.getByRole("radio", { name: /^J&T Express/ })
  await radio.click()
  const sent: number[] = []
  page.on("request", (r) => r.url().endsWith("/api/app/quotes") && r.method() === "POST" && sent.push((r.postDataJSON() as { weightGram: number }).weightGram))
  const weight = page.getByLabel("Berat paket")
  await weight.fill("")
  await expect(page.getByText("Cek ongkir lalu pilih ekspedisi. Rincian biaya muncul di sini.")).toBeVisible()
  await page.clock.runFor(1000)
  // Inside the debounce: 1500 g, 200 ms later 0 — nothing is sent, ever.
  await weight.fill("1500")
  await page.clock.runFor(200)
  await weight.fill("0")
  await page.clock.runFor(1000)
  expect(sent).toEqual([])
  // Back to the quoted 1000 g: the cached result is current again (no request), but the dropped courier stays dropped.
  await weight.fill("1000")
  await page.clock.runFor(1000)
  await expect(radio).not.toHaveAttribute("aria-disabled", "true")
  await expect(radio).toHaveAttribute("aria-checked", "false")
  expect(sent).toEqual([])
  // A new valid weight quotes once, with that weight.
  await weight.fill("1200")
  await page.clock.runFor(600)
  await expect.poll(() => sent).toEqual([1200])
})

// Sol R1-5: a manual `Cek Ongkir` inside the debounce sends ONE request (the timer re-checks when it fires), and rows
// are not actionable while a refresh loads.
test("Sol R1-5: one request for a manual quote during the debounce; rows locked while loading", async ({ page }) => {
  await seeded(page, "e2e-jaga-t")
  let quotes = 0
  page.on("request", (r) => r.url().endsWith("/api/app/quotes") && r.method() === "POST" && quotes++)
  let release!: () => void
  let held = new Promise<void>((r) => (release = r))
  await page.route("**/api/app/quotes", async (route) => {
    await held
    await route.continue()
  })
  await page.clock.install()
  await page.goto(`${APP}/kasir`)
  await page.getByRole("button", { name: "Cek kecamatan tujuan saja dulu" }).click()
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.clock.runFor(500)
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByRole("main").getByRole("button", { name: "Cek Ongkir" }).click()
  // The debounce timer would have fired by now: it re-checks and sends nothing more.
  await page.clock.runFor(1000)
  await expect.poll(() => quotes).toBe(1)
  await page.waitForTimeout(300)
  expect(quotes).toBe(1)
  release()
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toBeVisible()
  held = new Promise<void>((r) => (release = r))
  await page.getByRole("main").getByRole("button", { name: "Hitung Ulang" }).click()
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toHaveAttribute("aria-disabled", "true")
  await page.getByRole("radio", { name: /^J&T Express/ }).click({ force: true })
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).toHaveAttribute("aria-checked", "false")
  expect(quotes).toBe(2)
  release()
  await expect(page.getByRole("radio", { name: /^J&T Express/ })).not.toHaveAttribute("aria-disabled", "true")
  await page.unroute("**/api/app/quotes")
})

// Sol R2-1: the recipient's district changes while the freeze is held — `/parties` refuses it before any payment.
test("Sol R2-1: a recipient moved to another district during the freeze is refused at /parties, never paid", async ({ page }) => {
  const api = await seeded(page, "e2e-jaga-p")
  await quoteJt(page)
  await parties(page)
  const rid = ((await (await api.get(`${APP}/api/app/contacts/recipients?q=Rina`)).json()) as { data: { items: Array<{ id: string }> } }).data.items[0]!.id
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route("**/api/app/quotes/freeze", async (route) => {
    await held
    await route.continue()
  })
  let payments = 0
  page.on("request", (r) => /\/api\/app\/shipments\/[0-9a-z]{7}\/payment$/.test(r.url()) && payments++)
  const frozen = page.waitForResponse((r) => r.url().endsWith("/api/app/quotes/freeze"))
  await primary(page).click()
  // Another counter moves the recipient to Dago, Coblong (ORIGIN area) while this press waits.
  expect((await api.post(`${APP}/api/app/contacts/recipients/${rid}`, { headers: { origin: APP, "content-type": "application/json" }, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Dago No. 1", areaId: "5fc62f5df8f44b34aa4c0d8c", areaLabel: "Dago" } })).status()).toBe(200)
  release()
  const slug = ((await (await frozen).json()) as { data: { slug: string } }).data.slug
  await expect(page.getByText("Kecamatan penerima berbeda dengan tujuan ongkir. Cek ongkir lagi.").first()).toBeVisible()
  expect(payments).toBe(0)
  const d = ((await (await api.get(`${APP}/api/app/shipments/${slug}`)).json()) as { data: { shipment: { counter_payment_status: string; dispatch_state: string } } }).data
  expect(d.shipment).toMatchObject({ counter_payment_status: "unpaid", dispatch_state: "draft" })
  await page.unroute("**/api/app/quotes/freeze")
})

// Sol R2-2: `+ Baru` keeps the sheet (modal) open until the saved contact has loaded, then picks it.
test("Sol R2-2: a new sender is picked only after it has loaded; the sheet stays open meanwhile", async ({ page }) => {
  await seeded(page, "e2e-jaga-s")
  await page.goto(`${APP}/kasir`)
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route(/\/api\/app\/contacts\/senders\/[0-9a-z-]+$/, async (route) => {
    if (route.request().method() === "GET") await held
    await route.continue()
  })
  await page.getByRole("button", { name: "Pengirim baru" }).click()
  const sheet = page.getByRole("dialog")
  await sheet.getByLabel("Nama pengirim asli").fill("Pak Budi Santoso")
  await sheet.getByLabel("Nomor WhatsApp (untuk retur & COD)").fill("081377776666")
  await sheet.getByRole("button", { name: "Simpan" }).click()
  await page.waitForTimeout(600)
  await expect(sheet).toBeVisible()
  release()
  await expect(sheet).toBeHidden()
  await expect(page.locator('[aria-labelledby="pihak-senders"]')).toContainText("Pak Budi Santoso")
  await page.unroute(/\/api\/app\/contacts\/senders\/[0-9a-z-]+$/)
})
