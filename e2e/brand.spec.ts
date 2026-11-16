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
