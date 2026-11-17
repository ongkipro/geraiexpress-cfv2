import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// DEC-239 shell + POS keyboard behaviour (GPT-6.1 Sol review R1 #1, #3, #7): the courier radio group always has a tab
// stop in the visible category and arrows move from the focused row; the ⌘K palette keeps the active option in view;
// the sidebar counter status follows a shift being opened.
async function seeded(page: Page, prefix: string) {
  const api = page.context().request
  const email = uniqueEmail(prefix)
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(page.context().request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Rapi", password: "rapi-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `r${Date.now().toString(36)}`, name: "Gerai Rapi", connect: true } })).status()).toBe(201)
}

test("courier rows: one tab stop per category, arrows move from the focused row", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "keyboard flow checked once on desktop")
  await seeded(page, "e2e-rapi-a")
  await page.goto(`${APP}/kasir`)
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("list", { name: "Hasil pencarian wilayah" }).getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByRole("button", { name: "5 kg" }).click()
  await page.getByRole("button", { name: "Cek Ongkir" }).click()
  const group = page.getByRole("radiogroup", { name: "Pilih ekspedisi" })
  // 5 kg Non-COD opens on Cargo: pick the first cargo row, then switch to Reguler — a row there must be tabbable.
  await group.getByRole("radio").first().click()
  await page.getByRole("button", { name: /^Reguler/ }).click()
  expect(await group.locator('[role=radio][tabindex="0"]').count()).toBe(1)
  const enabled = group.locator('[role=radio]:not([aria-disabled="true"])')
  // The selection lives in Cargo; focus enters Reguler on its first row, and ArrowDown moves to the SECOND row.
  await group.locator('[role=radio][tabindex="0"]').focus()
  await page.keyboard.press("ArrowDown")
  await expect(enabled.nth(1)).toHaveAttribute("aria-checked", "true")
  await expect(enabled.nth(1)).toBeFocused()
  // ArrowUp twice wraps from the first row to the LAST available row (not the penultimate one).
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("ArrowUp")
  await expect(enabled.last()).toHaveAttribute("aria-checked", "true")
  await expect(enabled.last()).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await expect(enabled.first()).toHaveAttribute("aria-checked", "true")
})

test("⌘K keeps the keyboard-active option visible; opening a shift updates the sidebar status", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop shell")
  await seeded(page, "e2e-rapi-b")
  await page.goto(`${APP}/`)
  // The shortcut listener mounts with the shell; wait for the routed page before pressing it.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.keyboard.press("Control+k")
  const box = page.getByRole("combobox", { name: "Cari menu atau tugas" })
  await expect(box).toBeFocused()
  for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowDown")
  const active = page.locator('[role=option][aria-selected="true"]')
  await expect(active).toBeInViewport()
  await page.keyboard.press("Escape")

  await page.goto(`${APP}/kasir/shift`)
  const status = page.locator("[data-slot=sidebar-footer]")
  await expect(status.getByText("Belum dibuka")).toBeVisible()
  await page.getByLabel("Modal awal laci").fill("100000")
  await page.getByRole("button", { name: "Buka Shift" }).click()
  await expect(page.getByText("Seharusnya di laci")).toBeVisible()
  await expect(status.getByText("Buka", { exact: true })).toBeVisible()
})
