import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-310: settings sub-menu, Save bar only when dirty, NPWP masked after save, Akun Saya sessions list.
test("Pengaturan dan Akun Saya", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-atur")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Atur", password: "atur-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `s${Date.now().toString(36)}`, name: "Gerai Atur", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/pengaturan/data-usaha`)
  await expect(page.getByRole("heading", { name: "Data Usaha", level: 1 }).last()).toBeVisible()
  await expect(page.getByText("Ada perubahan belum disimpan")).toHaveCount(0)
  await page.getByLabel("Nama resmi").fill("UD Atur Jaya")
  await page.getByLabel("NPWP", { exact: true }).fill("01.234.567.8-901.234")
  await expect(page.getByText("Ada perubahan belum disimpan")).toBeVisible()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Perubahan tersimpan.")).toBeVisible()
  await expect(page.getByText("Tersimpan: •••••••••••1234")).toBeVisible()
  await expect(page.getByText("Ada perubahan belum disimpan")).toHaveCount(0)
  await expect(page.locator("body")).not.toContainText("012345678901234")

  await page.goto(`${APP}/pengaturan/printer`)
  await page.getByRole("radio", { name: /10×10 · Paket saja/ }).click()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Perubahan tersimpan.")).toBeVisible()

  await page.goto(`${APP}/akun`)
  await expect(page.getByRole("heading", { name: "Akun Saya", level: 1 })).toBeVisible()
  await expect(page.getByText("· perangkat ini")).toBeVisible()
  await page.getByLabel("Kata sandi saat ini").first().fill("salah-sekali-1")
  await page.getByLabel("Kata sandi baru").fill("sandi-baru-kuat-9")
  await page.getByRole("button", { name: "Ganti Kata Sandi" }).click()
  await expect(page.getByText("Kata sandi saat ini salah.").first()).toBeVisible()

  await page.goto(`${APP}/bantuan`)
  await page.getByLabel("Cari panduan").fill("printer")
  await expect(page.getByText("Printer thermal 100 mm di PC")).toBeVisible()
  await expect(page.getByText("Paket retur")).toHaveCount(0)
})

// DEC-242: the Pengaturan rail is a secondary sidebar — scrolling the form never moves it, and the rail scrolls on its
// own (wheel over it) without scrolling the page, on a short 1280×720 laptop screen.
test("Pengaturan: rail tetap diam saat form digulir dan bisa digulir sendiri", async ({ page, context, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "rail is desktop only (≥ 1024 px)")
  await page.setViewportSize({ width: 1280, height: 720 })
  const email = uniqueEmail("e2e-rail")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Rail", password: "rail-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `r${Date.now().toString(36)}`, name: "Gerai Rail", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/pengaturan/label-privasi`)
  await expect(page.getByRole("heading", { name: "Label & Privasi", level: 1 })).toBeVisible()
  // The h1 renders during loading; the page is only scrollable once the form is in.
  await expect(page.getByRole("switch", { name: "Aktifkan masking label" })).toBeVisible()
  const rail = page.locator("[data-settings-rail]")
  await expect(rail).toBeVisible()
  expect(await rail.evaluate((el) => { const s = getComputedStyle(el); return [s.position, s.overflowY, s.overscrollBehaviorY] })).toEqual(["sticky", "auto", "contain"])

  // 1. The form scrolls; the rail stays where it is (pinned under the topbar).
  // Wheel scrolling may animate: read positions only once the page has stopped moving.
  const settled = async () => {
    let prev = -1
    for (let i = 0; i < 40; i++) {
      const top = await page.evaluate(() => document.scrollingElement!.scrollTop)
      if (top === prev) return top
      prev = top
      await page.waitForTimeout(50)
    }
    return prev
  }
  await page.mouse.move(900, 500)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(0)
  const first = await settled()
  const pinnedY = (await rail.boundingBox())!.y
  await page.mouse.wheel(0, 300)
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(first)
  await settled()
  expect(Math.abs((await rail.boundingBox())!.y - pinnedY)).toBeLessThan(1)
  expect(pinnedY).toBeGreaterThanOrEqual(64)

  // 2. The rail is taller than this screen and scrolls by itself; the page does not move with it.
  expect(await rail.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  const pageTop = await settled()
  const box = (await rail.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => rail.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  expect(await settled()).toBe(pageTop)
  await expect(page.getByRole("navigation", { name: "Menu pengaturan" }).getByRole("link", { name: /API & MCP/ })).toBeInViewport()
})
