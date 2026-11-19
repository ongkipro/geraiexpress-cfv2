import type { Locator, Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { APP, OWNER, lastMail, uniqueEmail } from "./helpers"

// DEC-247 §2.3–2.4: the official courier logos across the gerai workspace and the Indonesian validation safety net.

async function seeded(page: Page, prefix: string) {
  const api = page.context().request
  const email = uniqueEmail(prefix)
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(page.context().request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Logo", password: "logo-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `l${Date.now().toString(36)}`, name: "Gerai Logo", connect: true } })).status()).toBe(201)
}

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  return errors
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Every logo tile in `scope` is a known courier whose SVG really loaded (lazy images are scrolled in first). */
async function expectLoadedLogos(scope: Locator, expected: Record<string, string>) {
  for (const [text, key] of Object.entries(expected)) {
    const tile = scope.locator(`[data-courier-logo="${key}"]`).first()
    await tile.scrollIntoViewIfNeeded()
    const img = tile.locator("img")
    await expect(img, text).toHaveAttribute("src", new RegExp(`/assets/${key}-[\\w-]+\\.svg$`))
    await expect(img).toHaveAttribute("alt", "")
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0)), { message: `${text} logo loads` }).toBeGreaterThan(0)
  }
}

test("kasir: courier rows carry their official logos; radio names unchanged", async ({ page }) => {
  const errors = watchErrors(page)
  await seeded(page, "e2e-logo-k")
  await page.goto(`${APP}/kasir`)
  // DEC-251A: a walk-in price check picks the district in card 2 (`Cek kecamatan tujuan saja dulu`); the quote runs itself.
  await page.getByRole("button", { name: "Cek kecamatan tujuan saja dulu" }).click()
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  const group = page.getByRole("radiogroup", { name: "Pilih ekspedisi" })
  // The logo is decorative: accessible names still start with the service name.
  await expect(group.getByRole("radio", { name: /^J&T Express/ })).toBeVisible({ timeout: 20_000 })
  const rows = group.getByRole("radio")
  const n = await rows.count()
  expect(n).toBeGreaterThan(3)
  // One fixed-size logo per row and never the fallback for a catalog courier.
  await expect(group.locator("[data-courier-logo]")).toHaveCount(n)
  await expect(group.locator('[data-courier-logo="fallback"]')).toHaveCount(0)
  for (const box of await group.locator("[data-courier-logo]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => `${r.width}x${r.height}`))) expect(box).toBe("64x32")
  await expectLoadedLogos(group, { "J&T Express": "jt", JNE: "jne", SiCepat: "sicepat" })
  expect(await group.getByRole("radio", { name: /^J&T Express/ }).locator('[data-courier-logo="jt"]').count()).toBe(1)
  // Tall marks (Pos, SAP, iDexpress) fit inside the tile instead of being clipped by it.
  const clipped = await group.locator("[data-courier-logo] img").evaluateAll((imgs) =>
    imgs.filter((i) => { const r = i.getBoundingClientRect(), t = i.parentElement!.getBoundingClientRect(); return r.top < t.top || r.bottom > t.bottom || r.left < t.left || r.right > t.right }).map((i) => i.parentElement!.dataset.courierLogo))
  expect(clipped).toEqual([])
  expect(await overflow(page)).toBe(0)

  // Cek Ongkir Cepat: the same rows as a list, one logo each.
  await page.goto(`${APP}/kasir/cek-cepat`)
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  const list = page.getByRole("list", { name: "Daftar ekspedisi" })
  await expect(list.locator("#kurir-JT")).toContainText("J&T Express", { timeout: 20_000 })
  await expect(list.locator("[data-courier-logo]")).toHaveCount(await list.getByRole("listitem").count())
  await expect(list.locator('[data-courier-logo="fallback"]')).toHaveCount(0)
  await expectLoadedLogos(list, { "J&T Express": "jt", "Pos Indonesia": "pos" })
  expect(await overflow(page)).toBe(0)
  expect(errors).toEqual([])
})

test("cek resi: a foreign AWB lists all nine couriers with logos and official tracking pages", async ({ page }) => {
  const errors = watchErrors(page)
  await seeded(page, "e2e-logo-r")
  await page.goto(`${APP}/kasir/cek-resi`)
  await page.getByLabel("Nomor INV, resi, atau HP penerima").fill("JX9999999999")
  await page.getByRole("button", { name: "Cari", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Resi ini bukan kiriman gerai Anda" })).toBeVisible()
  const list = page.getByRole("list").filter({ has: page.getByRole("link", { name: "JNE" }) })
  const expected: Array<[string, string, string]> = [
    ["JNE", "jne", "https://www.jne.co.id/tracking-package"],
    ["J&T Express", "jt", "https://jet.co.id/track"],
    ["SiCepat", "sicepat", "https://www.sicepat.com/"],
    ["SAP Express", "sap", "https://www.sapx.id/id/cek-awb"],
    ["Lion Parcel", "lion", "https://lionparcel.com/track/stt"],
    ["Anteraja", "anteraja", "https://anteraja.id/id/tracking"],
    ["iDexpress", "idexpress", "https://idexpress.com/lacak-paket"],
    ["Pos Indonesia", "pos", "https://www.posindonesia.co.id/id/tracking"],
    ["SPX Express", "spx", "https://spx.co.id/track"],
  ]
  await expect(list.getByRole("link")).toHaveCount(9)
  for (const [name, key, url] of expected) {
    const link = list.getByRole("link", { name, exact: true })
    await expect(link).toHaveAttribute("href", url)
    await expect(link).toHaveAttribute("target", "_blank")
    await expect(link.locator(`[data-courier-logo="${key}"]`)).toHaveCount(1)
  }
  await expectLoadedLogos(list, Object.fromEntries(expected.map(([n, k]) => [n, k])))
  expect(await overflow(page)).toBe(0)
  expect(errors).toEqual([])
})

test("pengaturan ekspedisi: every courier row shows its logo", async ({ page }) => {
  const errors = watchErrors(page)
  await seeded(page, "e2e-logo-e")
  await page.goto(`${APP}/pengaturan/ekspedisi`)
  const rows = page.locator("li").filter({ has: page.getByRole("switch") })
  await expect(rows.first()).toBeVisible()
  const n = await rows.count()
  expect(n).toBeGreaterThanOrEqual(9)
  await expect(rows.locator("[data-courier-logo]")).toHaveCount(n)
  await expect(rows.locator('[data-courier-logo="fallback"]')).toHaveCount(0)
  await expectLoadedLogos(page.locator("main"), { "J&T Express": "jt", "Pos Indonesia": "pos", "SPX Express": "spx", Anteraja: "anteraja", "SAP Express": "sap", "Lion Parcel": "lion", iDexpress: "idexpress" })
  expect(await overflow(page)).toBe(0)
  expect(errors).toEqual([])
})

/** A plain form without `noValidate`, added to the live page: the safety net must speak Indonesian on it. */
async function probeValidation(page: Page) {
  await page.evaluate(() => {
    const f = document.createElement("form")
    f.id = "probe"
    f.innerHTML = '<label for="probe-name">Nama penerima</label><input id="probe-name" required><label for="probe-mail">Email</label><input id="probe-mail" type="email"><input id="probe-min" type="number" min="1000"><button id="probe-go">Kirim</button>'
    f.addEventListener("submit", (e) => e.preventDefault())
    document.body.prepend(f)
  })
  const name = page.locator("#probe-name")
  await page.locator("#probe-go").click()
  await expect.poll(() => name.evaluate((i: HTMLInputElement) => i.validationMessage)).toBe("Nama penerima wajib diisi.")
  // Fixing the field clears the message at once.
  await name.fill("Budi")
  expect(await name.evaluate((i: HTMLInputElement) => [i.validationMessage, i.validity.valid])).toEqual(["", true])
  await page.locator("#probe-mail").fill("bukan-email")
  await page.locator("#probe-go").click()
  await expect.poll(() => page.locator("#probe-mail").evaluate((i: HTMLInputElement) => i.validationMessage)).toBe("Masukkan alamat email yang valid (contoh: nama@domain.com).")
  await page.locator("#probe-mail").fill("budi@contoh.test")
  await page.locator("#probe-min").fill("5")
  await page.locator("#probe-go").click()
  await expect.poll(() => page.locator("#probe-min").evaluate((i: HTMLInputElement) => i.validationMessage)).toBe("Nilai minimal 1.000.")
  // A page's own message is never replaced.
  const own = await page.locator("#probe-min").evaluate((i: HTMLInputElement) => {
    i.setCustomValidity("Pesan halaman sendiri.")
    i.form!.reportValidity()
    return i.validationMessage
  })
  expect(own).toBe("Pesan halaman sendiri.")
  await page.evaluate(() => document.getElementById("probe")?.remove())
}

test("validasi bahasa Indonesia: app and owner roots install the safety net", async ({ page }) => {
  const errors = watchErrors(page)
  await seeded(page, "e2e-logo-v")
  await page.goto(`${APP}/kasir/cek-resi`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await probeValidation(page)
  expect(errors).toEqual([])
  await page.goto(`${OWNER}/masuk`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await probeValidation(page)
})
