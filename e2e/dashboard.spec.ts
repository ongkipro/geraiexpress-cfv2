import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-309: owner dashboard with the WIB period filter (preset applies at once, URL state, custom range with
// Terapkan, 180-day limit) and the Kasir home without money.
test("Dashboard: filter periode, URL, rentang khusus", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-dasbor")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Dasbor", password: "dasbor-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `d${Date.now().toString(36)}`, name: "Gerai Dasbor", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/`)
  const trigger = page.getByRole("button", { name: /^Periode: 7 hari terakhir/ })
  await expect(trigger).toBeVisible()
  await expect(page.getByText("Estimasi Laba", { exact: true })).toBeVisible()
  await expect(page.getByText("Laba Kas", { exact: true })).toBeVisible()
  await trigger.click()
  await page.getByRole("button", { name: "30 hari terakhir" }).click()
  await expect(page).toHaveURL(/\?periode=30d$/)
  await expect(page.getByRole("button", { name: /^Periode: 30 hari terakhir/ })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole("button", { name: /^Periode: 7 hari terakhir/ })).toBeVisible()

  // Custom range typed in dd/mm/yyyy, then an over-long range is refused.
  const pad = (n: number) => String(n).padStart(2, "0")
  const wib = new Date(Date.now() + 7 * 3600_000)
  const today = `${pad(wib.getUTCDate())}/${pad(wib.getUTCMonth() + 1)}/${wib.getUTCFullYear()}`
  await page.getByRole("button", { name: /^Periode:/ }).click()
  await page.getByLabel("Dari", { exact: true }).fill(today)
  await page.getByLabel("Sampai", { exact: true }).fill(today)
  await page.getByRole("button", { name: "Terapkan" }).click()
  await expect(page).toHaveURL(/\?dari=\d{4}-\d{2}-\d{2}&sampai=\d{4}-\d{2}-\d{2}$/)
  await page.getByRole("button", { name: /^Periode:/ }).click()
  await page.getByLabel("Dari", { exact: true }).fill("01/01/2020")
  await page.getByRole("button", { name: "Terapkan" }).click()
  await expect(page.getByText("Maksimal 180 hari")).toBeVisible()
  await page.getByRole("button", { name: "Batal" }).click()

})
