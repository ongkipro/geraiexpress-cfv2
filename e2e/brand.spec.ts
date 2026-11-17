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

// One test per mode: software WebGL on CI draws a few frames per second, so each mode gets its own 120 s budget.
for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`Brand hero: ukuran layar berubah saat dijeda tetap menampilkan adegan (${reducedMotion})`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop-1280", "one viewport is enough for the resize path")
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion })
    const page = await ctx.newPage()
    await page.goto(`${APP.replace("app.", "")}/`)
    const stage = page.locator("#stageWrapper")
    if ((await stage.getAttribute("data-webgl")) === "fallback") return void (await ctx.close())
    if (reducedMotion === "no-preference") await page.locator("#togglePlayBtn").click()
    await expect(stage).toHaveAttribute("data-playing", "0")
    // Wait until the settle frames are spent and drawing has stopped.
    let frames = ""
    await expect.poll(async () => { const f = await stage.getAttribute("data-frames"); const same = f === frames; frames = f ?? ""; return same }, { intervals: [500], timeout: 20_000 }).toBe(true)
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
