import { expect, test } from "./fixtures"
import { APP } from "./helpers"

// TASK-502: brand site — nav, `Coba Simulasi Kasir` opens the demo without login, choosing a courier fills the
// receipt; `Daftar Gerai` goes to the app sign-up.
test("Brand site: simulasi kasir tanpa login, Daftar Gerai ke app", async ({ page }) => {
  const apex = APP.replace("app.", "")
  await page.goto(`${apex}/`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.getByRole("link", { name: "Coba Simulasi Kasir" }).click()
  await expect(page).toHaveURL(/\/simulasi-kasir$/)
  await page.getByLabel("Berat (gram)").fill("2500")
  await page.getByRole("button", { name: /^Pilih J&T Express/ }).click()
  await expect(page.locator("#struk")).toContainText("J&T Express · EZ")
  await expect(page.locator("#struk")).toContainText("Total Dibayar")
  await page.goto(`${apex}/`)
  await expect(page.getByRole("link", { name: "Daftar Gerai" }).first()).toHaveAttribute("href", `${APP}/daftar-akun`)
  const cookies = await page.context().cookies(apex)
  expect(cookies).toEqual([])
})

// DEC-245: the hero pause control and `prefers-reduced-motion` freeze the whole 3D scene clock (not only the step
// timeline); the home and simulator demos send no API or provider request; every courier logo loads.
test("Brand hero: Jeda membekukan animasi 3D, logo kurir termuat, tanpa panggilan API", async ({ page }) => {
  const apex = APP.replace("app.", "")
  const requests: string[] = []
  page.on("request", (r) => requests.push(new URL(r.url()).pathname))
  await page.goto(`${apex}/`)
  const stage = page.locator("#stageWrapper")
  test.skip((await stage.getAttribute("data-webgl")) === "fallback", "no WebGL in this browser")
  await expect(stage).toHaveAttribute("data-playing", "1")
  const pause = page.locator("#togglePlayBtn")
  const box = await pause.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await expect.poll(async () => Number(await stage.getAttribute("data-clock"))).toBeGreaterThan(0.2)
  await pause.click()
  await expect(pause).toHaveAttribute("aria-pressed", "true")
  await expect(stage).toHaveAttribute("data-playing", "0")
  const frozen = await stage.getAttribute("data-clock")
  await page.waitForTimeout(700)
  expect(await stage.getAttribute("data-clock")).toBe(frozen)
  await pause.click()
  await expect.poll(async () => Number(await stage.getAttribute("data-clock"))).toBeGreaterThan(Number(frozen))

  const logos = page.locator('img[src^="/couriers/"]')
  await page.locator("section.partners").scrollIntoViewIfNeeded()
  await expect.poll(() => logos.evaluateAll((els) => els.filter((i) => !((i as HTMLImageElement).naturalWidth > 0)).length)).toBe(0)
  await page.click("#h-city")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(page.locator("#h-city-val")).toContainText("Tebet")
  await page.goto(`${apex}/simulasi-kasir`)
  await page.getByRole("button", { name: /^Pilih SiCepat/ }).click()
  expect(requests.filter((p) => p.startsWith("/api/") || p.startsWith("/mcp"))).toEqual([])
})

test("Brand hero: prefers-reduced-motion menampilkan adegan diam", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" })
  const page = await ctx.newPage()
  await page.goto(`${APP.replace("app.", "")}/`)
  const stage = page.locator("#stageWrapper")
  if ((await stage.getAttribute("data-webgl")) !== "fallback") {
    await expect(stage).toHaveAttribute("data-playing", "0")
    await page.waitForTimeout(400)
    const c = await stage.getAttribute("data-clock")
    await page.waitForTimeout(700)
    expect(await stage.getAttribute("data-clock")).toBe(c)
    await expect(page.locator("#togglePlayBtn")).toHaveAttribute("aria-pressed", "true")
  }
  await ctx.close()
})

// DEC-245 (Sol R2 #11): resizing while paused (or with reduced motion) must repaint the static scene — `setSize` clears
// the WebGL buffer — and must not advance the frozen clock. Scene pixels are counted from a screenshot of the canvas
// with the DOM overlays hidden: the empty stage is only a light CSS gradient.
async function scenePixels(page: import("@playwright/test").Page): Promise<number> {
  await page.addStyleTag({ content: ".hdr,#spatialCallout,.stage-pill,#hudControls{visibility:hidden!important}" })
  const png = (await page.locator("#webglCanvas").screenshot()).toString("base64")
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const g = c.getContext("2d")!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! < 450) n++
    return n
  }, png)
}

// One test per mode: software WebGL on CI draws ~3 frames per second, so the 60-frame reduced-motion settle alone
// takes ~20 s; each mode gets a 180 s budget and up to 90 s for drawing to stop.
for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`Brand hero: ukuran layar berubah saat dijeda tetap menampilkan adegan (${reducedMotion})`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop-1280", "one viewport is enough for the resize path")
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion })
    const page = await ctx.newPage()
    await page.goto(`${APP.replace("app.", "")}/`)
    const stage = page.locator("#stageWrapper")
    if ((await stage.getAttribute("data-webgl")) === "fallback") return void (await ctx.close())
    if (reducedMotion === "no-preference") await page.locator("#togglePlayBtn").click()
    await expect(stage).toHaveAttribute("data-playing", "0")
    // Wait until the settle frames are spent and drawing has stopped.
    let frames = ""
    await expect.poll(async () => { const f = await stage.getAttribute("data-frames"); const same = f === frames; frames = f ?? ""; return same }, { intervals: [1000], timeout: 90_000 }).toBe(true)
    const clock = await stage.getAttribute("data-clock")
    await page.setViewportSize({ width: 900, height: 700 })
    await page.waitForTimeout(800)
    expect(await stage.getAttribute("data-clock"), reducedMotion).toBe(clock)
    expect(await scenePixels(page), reducedMotion).toBeGreaterThan(5000)
    // Sol R3 #12: off-screen, a resize must not draw; back on-screen the scene is repainted, clock still frozen.
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }))
    await page.waitForTimeout(1500)
    const offFrames = await stage.getAttribute("data-frames")
    await page.setViewportSize({ width: 1100, height: 760 })
    await page.waitForTimeout(800)
    expect(await stage.getAttribute("data-frames"), `${reducedMotion} off-screen`).toBe(offFrames)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
    await expect.poll(async () => Number(await stage.getAttribute("data-frames"))).toBeGreaterThan(Number(offFrames))
    await page.waitForTimeout(800)
    expect(await stage.getAttribute("data-clock"), reducedMotion).toBe(clock)
    expect(await scenePixels(page), `${reducedMotion} back on-screen`).toBeGreaterThan(5000)
    await ctx.close()
  })
}

// DEC-247 Borderless White-Gallery: ten pages with zero console/page/CSP errors and zero horizontal overflow on every
// viewport project; the product screenshot loads.
const BRAND_PAGES = ["/", "/fitur", "/ekspedisi", "/cara-kerja", "/biaya-dan-paket", "/simulasi-kasir", "/tanya-jawab", "/hubungi-kami", "/ketentuan", "/privasi"]
test("Brand DEC-247: sepuluh halaman tanpa error konsol/CSP dan tanpa geser horizontal", async ({ page }) => {
  const apex = APP.replace("app.", "")
  const errors: string[] = []
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} console: ${m.text()}`) })
  page.on("pageerror", (e) => errors.push(`${page.url()} pageerror: ${e.message}`))
  for (const p of BRAND_PAGES) {
    await page.goto(`${apex}${p}`)
    await page.evaluate(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP ${e.violatedDirective}`)))
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)) } })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), p).toBe(0)
    await expect(page.locator(".mnav-dim"), p).toHaveCount(1)
  }
  await page.goto(`${apex}/`)
  const shot = page.locator('img[src="/produk-kasir-loket.webp"]')
  await shot.scrollIntoViewIfNeeded()
  await expect.poll(() => shot.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(1440)
  expect(errors).toEqual([])
})

// DEC-247: phone thumb order [Masuk] [menu ⇄ ×]; the menu opens a screen-aligned card (inert toggles, focus moves in),
// closes on Escape (focus back on the button), on an outside tap and on a menu link.
test("Brand DEC-247: menu ponsel [Masuk] [Menu] buka, Escape, klik luar, fokus", async ({ page }, info) => {
  test.skip(info.project.name === "desktop-1280", "the phone menu exists below 960 px")
  const apex = APP.replace("app.", "")
  await page.goto(`${apex}/fitur`)
  const btn = page.locator("#mnav-btn")
  const acct = page.locator(".hdr a.acct")
  const menu = page.locator("#mnav")
  await expect(page.locator(".dnav")).toBeHidden()
  await expect(acct).toHaveAttribute("href", `${APP}/masuk`)
  for (const b of [acct, btn]) {
    const box = (await b.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  expect((await acct.boundingBox())!.x).toBeLessThan((await btn.boundingBox())!.x)
  await expect(btn).toHaveAttribute("aria-expanded", "false")
  await expect(menu).toHaveAttribute("inert", "")
  await expect(menu).toBeHidden()

  await btn.click()
  await expect(btn).toHaveAttribute("aria-expanded", "true")
  await expect(btn).toHaveAttribute("aria-label", "Tutup menu navigasi")
  await expect(menu).toBeVisible()
  await expect(menu).not.toHaveAttribute("inert", "")
  await expect(page.locator("#mnav a").first()).toBeFocused()
  await expect(menu.getByRole("link", { name: /Fitur/ })).toHaveAttribute("aria-current", "page")
  await expect(menu.getByText("Sembilan kurir mitra, Reguler & Kargo")).toBeVisible()
  await expect(menu.getByRole("link", { name: "Daftar Gerai", exact: true })).toHaveAttribute("href", `${APP}/daftar-akun`)
  await expect(menu.getByRole("link", { name: "Sudah terdaftar? Masuk ke ruang kerja" })).toHaveAttribute("href", `${APP}/masuk`)
  const vw = page.viewportSize()!.width
  await expect.poll(async () => (await menu.boundingBox())!.y).toBeGreaterThan(40)
  const card = (await menu.boundingBox())!
  expect(card.x).toBeGreaterThanOrEqual(15)
  expect(card.x + card.width).toBeLessThanOrEqual(vw - 15)
  expect(card.width).toBeLessThanOrEqual(440)
  // Every row fits on one line: the hint never wraps.
  for (const hint of await menu.locator(".r-h").all()) expect((await hint.boundingBox())!.height).toBeLessThan(24)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)

  await page.keyboard.press("Escape")
  await expect(btn).toHaveAttribute("aria-expanded", "false")
  await expect(menu).toHaveAttribute("inert", "")
  await expect(menu).toBeHidden()
  await expect(btn).toBeFocused()

  await btn.click()
  await expect(menu).toBeVisible()
  await page.mouse.click(vw / 2, page.viewportSize()!.height - 12)
  await expect(btn).toHaveAttribute("aria-expanded", "false")
  await expect(menu).toBeHidden()
  await expect(page).toHaveURL(/\/fitur$/)

  await btn.click()
  await menu.getByRole("link", { name: /Biaya & Paket/ }).click()
  await expect(page).toHaveURL(/\/biaya-dan-paket$/)
  await expect(page.locator("#mnav-btn")).toHaveAttribute("aria-expanded", "false")
  await expect(page.locator("#mnav")).toBeHidden()
})

// DEC-247: desktop header at 1440 px is a 3-column grid with the nav centred and an underline (no weight change).
test("Brand DEC-247: header desktop 1440 tiga kolom, nav di tengah", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "one desktop project")
  await page.setViewportSize({ width: 1440, height: 900 })
  const apex = APP.replace("app.", "")
  await page.goto(`${apex}/ekspedisi`)
  const nav = page.locator(".dnav")
  await expect(nav).toBeVisible()
  await expect(page.locator("#mnav-btn")).toBeHidden()
  await expect(page.locator(".hdr a.acct")).toBeHidden()
  await expect(page.locator(".hdr .login-lk")).toBeVisible()
  await expect(page.locator(".hdr .hact .cta")).toHaveText("Daftar Gerai")
  await expect(nav.getByRole("link")).toHaveText(["Fitur", "Ekspedisi", "Cara Kerja", "Biaya & Paket", "Simulasi Kasir"])
  await expect(nav.getByRole("link", { name: "Ekspedisi" })).toHaveAttribute("aria-current", "page")
  const n = (await nav.boundingBox())!
  expect(Math.abs(n.x + n.width / 2 - 720)).toBeLessThan(4)
  const link = nav.getByRole("link", { name: "Fitur" })
  const before = await link.evaluate((a) => [getComputedStyle(a).fontWeight, a.getBoundingClientRect().width])
  await link.hover()
  await page.waitForTimeout(350)
  expect(await link.evaluate((a) => [getComputedStyle(a).fontWeight, a.getBoundingClientRect().width])).toEqual(before)
  expect(await link.evaluate((a) => getComputedStyle(a, "::after").transform)).not.toBe("matrix(0, 0, 0, 1, 0, 0)")
  // Same header geometry on the home (frosted over the 3D hero).
  await page.goto(`${apex}/`)
  const home = (await page.locator(".dnav").boundingBox())!
  expect(Math.round(home.x)).toBe(Math.round(n.x))
  expect(Math.round(home.y)).toBe(Math.round(n.y))
})

// DEC-247: the asymmetric pricing — choosing a tier radio swaps the readout and its CTA.
test("Brand DEC-247: radio paket mengganti panel rincian", async ({ page }) => {
  const apex = APP.replace("app.", "")
  await page.goto(`${apex}/biaya-dan-paket`)
  const std = page.locator('.readout[data-plan="standar"]')
  const pro = page.locator('.readout[data-plan="pro"]')
  await expect(page.getByRole("radio", { name: /Mitra Gerai Standar/ })).toBeChecked()
  await expect(std).toBeVisible()
  await expect(pro).toBeHidden()
  await expect(std.getByRole("link", { name: "Daftar Gerai" })).toHaveAttribute("href", `${APP}/daftar-akun`)
  await page.locator(".tier", { hasText: "Domain Sendiri (Pro)" }).click()
  await expect(page.getByRole("radio", { name: /Domain Sendiri \(Pro\)/ })).toBeChecked()
  await expect(pro).toBeVisible()
  await expect(std).toBeHidden()
  await expect(pro).toHaveAttribute("data-active", "")
  await expect(std).not.toHaveAttribute("data-active", "")
  await expect(pro.getByRole("link", { name: "Hubungi Kemitraan" })).toHaveAttribute("href", "/hubungi-kami")
  await expect(pro).toContainText("Seluruh fasilitas Mitra Gerai Standar")
  await page.getByRole("radio", { name: /Mitra Gerai Standar/ }).check()
  await expect(std).toBeVisible()
  await expect(pro).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
})

// DEC-247 §2.4: on an en-US browser a brand form without `novalidate` gets Indonesian constraint messages, cleared on input.
test("Brand DEC-247: validasi form berbahasa Indonesia di browser en-US", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "en-US" })
  const page = await ctx.newPage()
  await page.goto(`${APP.replace("app.", "")}/hubungi-kami`)
  const msgs = await page.evaluate(() => {
    const f = document.createElement("form")
    f.innerHTML = '<label for="v-mail">Email</label><input id="v-mail" type="email" required><label for="v-n">Jumlah</label><input id="v-n" type="number" min="1" max="9"><input id="v-p" pattern="[0-9]{4}" aria-label="PIN" placeholder="1234"><button>Kirim</button>'
    document.body.append(f)
    const mail = f.querySelector<HTMLInputElement>("#v-mail")!, n = f.querySelector<HTMLInputElement>("#v-n")!, p = f.querySelector<HTMLInputElement>("#v-p")!
    const out: string[] = []
    f.reportValidity(); out.push(mail.validationMessage)
    mail.value = "salah"; mail.dispatchEvent(new Event("input", { bubbles: true })); out.push(String(mail.validity.customError))
    f.reportValidity(); out.push(mail.validationMessage)
    mail.value = "nama@toko.id"; mail.dispatchEvent(new Event("input", { bubbles: true })); out.push(String(mail.validity.valid))
    n.value = "12"; f.reportValidity(); out.push(n.validationMessage)
    n.value = "3"; n.dispatchEvent(new Event("input", { bubbles: true })); p.value = "ab"; f.reportValidity(); out.push(p.validationMessage)
    return out
  })
  expect(msgs).toEqual([
    "Kolom Email wajib diisi.",
    "false",
    "Format email belum benar (contoh: nama@domain.com).",
    "true",
    "Nilai maksimal 9.",
    "Format PIN belum sesuai (contoh: 1234).",
  ])
  // Sol R1 P2: ownership follows the setter, not the text — a page error with the very same words survives editing.
  const same = await page.evaluate(() => {
    const f = document.createElement("form")
    f.innerHTML = '<label for="v-same">Email</label><input id="v-same" type="email" required><button>Kirim</button>'
    document.body.append(f)
    const i = f.querySelector<HTMLInputElement>("#v-same")!
    f.reportValidity()
    const ours = i.validationMessage
    i.setCustomValidity(ours)
    i.value = "nama@toko.id"
    i.dispatchEvent(new Event("input", { bubbles: true }))
    i.dispatchEvent(new Event("change", { bubbles: true }))
    return [ours, i.validationMessage, String(i.validity.customError)]
  })
  expect(same).toEqual(["Kolom Email wajib diisi.", "Kolom Email wajib diisi.", "true"])
  await ctx.close()
})

// DEC-247A (supervisor visual check): the product screenshot on the home pedestal must really load — served as
// image/webp through BRAND_ASSETS and decoded once scrolled into view (it stays `loading="lazy"` below the fold).
test("Brand DEC-247: screenshot kasir di pedestal termuat (WebP, naturalWidth > 0)", async ({ page }) => {
  const apex = APP.replace("app.", "")
  const res = await page.request.get(`${apex}/produk-kasir-loket.webp`)
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toBe("image/webp")
  await page.goto(`${apex}/`)
  const img = page.locator("figure.shot img")
  await img.scrollIntoViewIfNeeded()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 10_000 }).toBe(1440)
  expect(await img.getAttribute("alt")).toMatch(/^Layar kasir GeraiExpress/)
})

// DEC-247A home parity: the pricing radios and the FAQ rows also work on the home page.
test("Brand DEC-247: beranda memuat paket, perbandingan, FAQ dan langkah penutup", async ({ page }) => {
  const apex = APP.replace("app.", "")
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${apex}/`)
  const pricing = page.locator("[data-pricing]")
  await pricing.scrollIntoViewIfNeeded()
  const pro = pricing.locator('.readout[data-plan="pro"]')
  await expect(pro).toBeHidden()
  await pricing.locator(".tier", { hasText: "Domain Sendiri (Pro)" }).click()
  await expect(pro).toBeVisible()
  await expect(pricing.locator('.readout[data-plan="standar"]')).toBeHidden()
  // DEC-249: the comparison table lives on /biaya-dan-paket; the home links to it.
  await expect(page.locator("table.cmp")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Lihat tabel perbandingan & skema komisi →" })).toHaveAttribute("href", "/biaya-dan-paket")
  const faq = page.locator('section[aria-labelledby="faq-title"] details')
  await expect(faq).toHaveCount(5)
  const second = faq.nth(1)
  await expect(faq.first()).not.toHaveAttribute("open", "") // DEC-249: the home FAQ starts closed
  await expect(second).not.toHaveAttribute("open", "")
  await second.locator("summary").click()
  await expect(second).toHaveAttribute("open", "")
  // DEC-248: the closing callout no longer lists three steps.
  await expect(page.locator(".closing .cl-steps")).toHaveCount(0)
  await expect(page.locator(".closing .row a")).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  expect(errors).toEqual([])
})


// DEC-247B Part 5: the four simulator dropdowns are custom listboxes (no native <select>): mouse pick updates the rates
// and the receipt; keyboard ArrowDown/Enter picks; Escape closes with focus back; opening one closes another; an
// outside tap closes.
test("Brand DEC-247B: dropdown custom simulasi kasir (klik, keyboard, Escape, satu terbuka, klik luar)", async ({ page }) => {
  const apex = APP.replace("app.", "")
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${apex}/simulasi-kasir`)
  await expect(page.locator("select")).toHaveCount(0)
  const kota = page.locator("#kota-btn"), kotaList = page.locator("#kota-list")
  const firstPrice = await page.locator("#rates button").first().textContent()
  for (const id of ["kota", "cod", "pack", "bayar"]) {
    const box = (await page.locator(`#${id}-btn`).boundingBox())!
    expect(box.height, id).toBeGreaterThanOrEqual(44)
  }
  // Sol R1 P2: 16px primary option text on phones (trigger and list).
  if ((page.viewportSize()?.width ?? 0) <= 640) {
    const px = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontSize)
    expect(await px("#kota-val .opt-main")).toBe("16px")
    expect(await px("#kota-list .opt-main")).toBe("16px")
  }
  await kota.click()
  await expect(kota).toHaveAttribute("aria-expanded", "true")
  await expect(kotaList).toBeVisible()
  await kotaList.getByRole("option", { name: /Medan Kota/ }).click()
  await expect(kotaList).toBeHidden()
  await expect(kota).toBeFocused()
  await expect(page.locator("#kota-val")).toContainText("Medan Kota")
  await expect(page.locator("#kota-opt-3")).toHaveAttribute("aria-selected", "true")
  await expect(page.locator("#kota")).toHaveValue("3")
  await expect.poll(() => page.locator("#rates button").first().textContent()).not.toBe(firstPrice)
  // Keyboard on another control.
  const pack = page.locator("#pack-btn")
  await pack.focus()
  await page.keyboard.press("ArrowDown")
  await expect(page.locator("#pack-list")).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(page.locator("#pack-val")).toContainText("Bubble wrap")
  await expect(pack).toBeFocused()
  // One open at a time; Escape; outside tap.
  await page.locator("#bayar-btn").click()
  await expect(page.locator("#bayar-list")).toBeVisible()
  await page.locator("#cod-btn").click()
  await expect(page.locator("#bayar-list")).toBeHidden()
  await expect(page.locator("#cod-list")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator("#cod-list")).toBeHidden()
  await expect(page.locator("#cod-btn")).toBeFocused()
  // Focus moved without a pointer or Tab (assistive tech): opening another listbox still closes the first.
  await page.locator("#bayar-btn").click()
  await page.locator("#kota-btn").focus()
  await page.keyboard.press("ArrowDown")
  await expect(page.locator("#kota-list")).toBeVisible()
  await expect(page.locator("#bayar-list")).toBeHidden()
  await page.keyboard.press("Escape")
  await page.locator("#bayar-btn").click()
  await page.locator("#bayar-list").getByRole("option", { name: "QRIS gerai" }).click()
  await kota.click()
  await page.locator("h1").click()
  await expect(kotaList).toBeHidden()
  // The receipt reads the hidden inputs.
  await page.getByRole("button", { name: /^Pilih J&T Express/ }).click()
  await expect(page.locator("#struk")).toContainText("Medan Kota, Kota Medan")
  await expect(page.locator("#struk")).toContainText("Packing Tambahan  Rp 3.000")
  await expect(page.locator("#struk")).toContainText("Cara Bayar: QRIS gerai")
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

// DEC-247B Part 1: /cara-kerja jump strip and pipeline (pulse only while on screen; still under reduced motion);
// /tanya-jawab pill index; the phone footer puts its two link columns side by side.
test("Brand DEC-247B: halaman dalam (lompat langkah, pipeline, indeks FAQ, footer 2 kolom)", async ({ page, browser }, info) => {
  const apex = APP.replace("app.", "")
  await page.goto(`${apex}/cara-kerja`)
  await page.locator('.jump a[href="#langkah-4"]').click()
  await expect(page).toHaveURL(/#langkah-4$/)
  await expect(page.locator("#langkah-4-title")).toBeInViewport()
  const pipe = page.locator("[data-pipeline]")
  await pipe.scrollIntoViewIfNeeded()
  await expect(pipe).toHaveClass(/is-playing/)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(pipe).not.toHaveClass(/is-playing/)
  const still = await browser.newContext({ reducedMotion: "reduce", viewport: page.viewportSize()! })
  const sp = await still.newPage()
  await sp.goto(`${apex}/cara-kerja`)
  await sp.locator("[data-pipeline]").scrollIntoViewIfNeeded()
  await sp.waitForTimeout(400)
  await expect(sp.locator("[data-pipeline]")).not.toHaveClass(/is-playing/)
  await expect(sp.locator(".pulse")).toBeHidden()
  expect(await sp.locator(".node").first().evaluate((n) => getComputedStyle(n).backgroundColor)).toBe("rgb(11, 79, 227)")
  await still.close()

  await page.goto(`${apex}/tanya-jawab`)
  await page.locator('.faq-index a[href="#perangkat-cetak"]').click()
  await expect(page.locator("#perangkat-cetak-title")).toBeInViewport()

  const cols = await page.locator("footer .fcol").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
  if (info.project.name !== "desktop-1280") expect(cols[0]).toBe(cols[1])
  const links = await page.locator("#peta-situs a").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  for (const h of links) expect(h).toBeGreaterThanOrEqual(24)
  for (const p of ["/fitur", "/cara-kerja", "/tanya-jawab", "/hubungi-kami", "/ekspedisi", "/simulasi-kasir"]) {
    await page.goto(`${apex}${p}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), p).toBeLessThanOrEqual(0)
    await expect(page.locator(".phead .eyebrow"), p).toBeVisible()
  }
})

// DEC-249: the slim home (<= 6,300px at 1440) keeps the 3D hero, runs the courier marquee (paused on hover, a static
// wrap under reduced motion) and shows Raka's counter with motion only on screen; /fitur opens with the moved showcase.
test("Brand DEC-249: beranda ramping, marquee kurir, Raka, dan /fitur diperkaya", async ({ page, browser }, info) => {
  const apex = APP.replace("app.", "")
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  await page.goto(`${apex}/`)
  await expect(page.locator("#stageWrapper canvas#webglCanvas")).toHaveCount(1)
  if (info.project.name === "desktop-1280") {
    await page.setViewportSize({ width: 1440, height: 900 })
    // ≤ 6,300 px (supervisor pre-review: the compact pricing keeps its feature list; was ≤ 6,200 without it).
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(6300)
  }
  const track = page.locator(".mq-track")
  await page.locator("section.partners").scrollIntoViewIfNeeded()
  expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe("gx-mq")
  await page.locator(".marquee").hover()
  expect(await track.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused")
  await expect(page.locator('.mq-list[aria-hidden="true"] img[alt=""]')).toHaveCount(9)
  const raka = page.locator("[data-raka]")
  await raka.scrollIntoViewIfNeeded()
  await expect(raka).toHaveClass(/is-playing/)
  const render = page.getByRole("img", { name: /^Ilustrasi 3D Raka, mitra loket GeraiExpress/ })
  await expect(render).toBeVisible()
  await expect.poll(() => render.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(1040)
  await expect(page.locator(".raka-stage .rk-pill")).toHaveCount(2)
  await expect(page.locator('section[aria-labelledby="toko-title"] .chips li')).toHaveCount(8)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  // Reduced motion: the marquee is a static wrap of nine logos (no duplicate track), Raka stays still.
  const still = await browser.newContext({ reducedMotion: "reduce", viewport: page.viewportSize()! })
  const sp = await still.newPage()
  await sp.goto(`${apex}/`)
  expect(await sp.locator(".mq-track").evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
  await expect(sp.locator('.mq-list[aria-hidden="true"]')).toBeHidden()
  await sp.locator("[data-raka]").scrollIntoViewIfNeeded()
  await sp.waitForTimeout(300)
  await expect(sp.locator("[data-raka]")).not.toHaveClass(/is-playing/)
  await still.close()
  // /fitur: the showcase and the proof band sit between the page head and the six pillars.
  await page.goto(`${apex}/fitur`)
  const order = await page.evaluate(() => ["satu-layar-title", "bukti-title", "kasir-title"].map((id) => document.getElementById(id)!.getBoundingClientRect().top + scrollY))
  expect(order[0]).toBeLessThan(order[1]!)
  expect(order[1]).toBeLessThan(order[2]!)
  expect(errors).toEqual([])
})
