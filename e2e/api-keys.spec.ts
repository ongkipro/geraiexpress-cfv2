import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-503: Pengaturan › API & MCP — create a key (shown once), call /api/v1 with it, revoke with a confirm, the key
// stops working immediately.
test("API & MCP: kunci sekali tampil, dipakai, lalu dicabut", async ({ page, context, request }, info) => {
  const email = uniqueEmail("e2e-api")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Api", password: "api-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `a${Date.now().toString(36)}`, name: "Gerai Api", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/pengaturan/api-mcp`)
  await expect(page.getByRole("heading", { name: "API & MCP", level: 2 }).last()).toBeVisible()
  await page.getByLabel("Nama kunci").fill("Toko Shopify Nisa")
  await page.getByRole("checkbox", { name: /Terbitkan resi/ }).check()
  await page.getByRole("button", { name: "Buat Kunci" }).click()
  await expect(page.getByText(/Batas harian Rp10\.000/)).toBeVisible()
  await page.getByLabel(/Batas nilai kiriman per hari/).fill("500000")
  await page.getByRole("button", { name: "Buat Kunci" }).click()
  const tokenEl = page.getByLabel("Kunci API baru")
  await expect(tokenEl).toHaveText(/^gx_live_/)
  const token = (await tokenEl.textContent())!
  await page.screenshot({ path: `docs/evidence/TASK-503/api-mcp-${info.project.name}.png`, fullPage: true })

  const ok = await request.get(`${APP}/api/v1/areas?q=tebet`, { headers: { authorization: `Bearer ${token}` } })
  expect(ok.status()).toBe(200)
  await page.getByRole("button", { name: "Sudah Saya Simpan" }).click()
  await page.reload()
  await expect(page.locator("body")).not.toContainText(token)

  await page.getByRole("button", { name: "Cabut", exact: true }).click()
  await expect(page.getByText("Cabut kunci Toko Shopify Nisa?")).toBeVisible()
  await page.getByRole("button", { name: "Ya, Cabut Kunci" }).click()
  await expect(page.getByText(/dicabut\. Integrasi yang memakainya langsung berhenti/)).toBeVisible()
  expect((await request.get(`${APP}/api/v1/areas?q=tebet`, { headers: { authorization: `Bearer ${token}` } })).status()).toBe(401)
})
