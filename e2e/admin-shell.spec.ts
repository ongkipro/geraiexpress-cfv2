import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// DEC-239 shell + POS keyboard behaviour (GPT-6.1 Sol review R1 #1, #3, #7): the courier radio group always has a tab
// stop in the visible category and arrows move from the focused row; the ⌘K palette keeps the active option in view;
// the sidebar counter status follows a saved label format. DEC-241: sidebar taxonomy and the deferred Shift Loket.
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
  await page.getByRole("main").getByRole("button", { name: "Cek Ongkir" }).click()
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

test("⌘K keeps the keyboard-active option visible; saving the label format updates the sidebar status", async ({ page }, info) => {
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
  // DEC-241: Shift Loket is deferred — not a command.
  await box.fill("shift")
  await expect(page.getByRole("option")).toHaveCount(0)
  await page.keyboard.press("Escape")

  // DEC-241: the sidebar status shows the label format (no shift row) and follows a saved change.
  const status = page.locator("[data-slot=sidebar-footer]")
  await expect(status.getByText("Shift")).toHaveCount(0)
  await expect(status.getByText("10×15 · Paket + Bukti")).toBeVisible()
  await page.goto(`${APP}/pengaturan/printer`)
  await page.getByRole("radio", { name: /10×10 · Paket saja/ }).click()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Perubahan tersimpan.")).toBeVisible()
  await expect(status.getByText("10×10 · Paket saja")).toBeVisible()
})

// DEC-241: the sidebar taxonomy — each job a menu, its screens a sub-tree; tab-backed entries highlight on their tab.
test("sidebar: Buat Pengiriman, Cek Ongkir & Resi, and Kiriman sub-tree follow the URL", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop sidebar")
  await seeded(page, "e2e-rapi-c")
  const nav = page.getByRole("navigation", { name: "Menu utama" })
  await page.goto(`${APP}/kasir/cek-resi`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(nav.getByRole("link", { name: "Cek Resi" })).toHaveAttribute("aria-current", "page")
  await expect(nav.getByRole("link", { name: "Kiriman Satuan" })).toBeHidden()
  await expect(page.getByRole("navigation", { name: "Lokasi halaman" })).toContainText("Cek Ongkir & Resi")
  await expect(nav.getByRole("link", { name: "Shift Loket" })).toHaveCount(0)

  await page.goto(`${APP}/kiriman`)
  await expect(nav.getByRole("link", { name: "Daftar Kiriman" })).toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("main").getByRole("link", { name: /Meja Retur|Pickup/ })).toHaveCount(0)
  await nav.getByRole("link", { name: "Meja Retur" }).click()
  await expect(page).toHaveURL(/\/kiriman\?tab=retur$/)
  await expect(page.getByRole("heading", { name: "Meja Retur", level: 1 })).toBeVisible()
  await expect(nav.getByRole("link", { name: "Meja Retur" })).toHaveAttribute("aria-current", "page")
  await expect(nav.getByRole("link", { name: "Daftar Kiriman" })).not.toHaveAttribute("aria-current", "page")
  await page.goto(`${APP}/kiriman?tab=belum-dibayar`)
  await expect(nav.getByRole("link", { name: "Daftar Kiriman" })).toHaveAttribute("aria-current", "page")

  // DEC-240: desktop /pengaturan opens the first section; the rail marks it; J&T ECO is not a second "Reguler" pill.
  await page.goto(`${APP}/pengaturan`)
  await expect(page).toHaveURL(/\/pengaturan\/profil$/)
  await expect(page.getByRole("navigation", { name: "Menu pengaturan" }).getByRole("link", { name: /Profil Gerai/ })).toHaveAttribute("aria-current", "page")
  await page.goto(`${APP}/pengaturan/ekspedisi`)
  const jt = page.getByRole("listitem").filter({ has: page.getByRole("switch", { name: "Aktifkan J&T Express" }) })
  await expect(jt.getByText("ECO", { exact: true })).toBeVisible()
  await expect(jt.getByText("Reguler", { exact: true })).toHaveCount(1)
})

// Sol R1 (DEC-240) #1: a failed destructive action shows its error inside the still-open dialog;
// #2: /pengaturan follows the window across the 1024 px breakpoint (directory below, first section above).
test("Pengaturan: error cabut kunci tampil di dialog; /pengaturan ikut lebar layar", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop flows")
  await seeded(page, "e2e-rapi-d")
  const api = page.context().request
  const h = { origin: APP, "content-type": "application/json" }
  expect((await api.post(`${APP}/api/app/api-keys`, { headers: h, data: { name: "Kunci Uji", scopes: ["rates:read"], dailyIssueCapIdr: null } })).status()).toBe(201)
  await page.goto(`${APP}/pengaturan/api-mcp`)
  await page.route("**/api/app/api-keys/*/revoke", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "TENANT_NOT_READY", message: "Data gerai sedang diperbarui. Coba lagi sebentar lagi.", field_errors: {} } }) }))
  await page.getByRole("button", { name: "Cabut", exact: true }).click()
  const dialog = page.getByRole("alertdialog")
  await dialog.getByRole("button", { name: "Ya, Cabut Kunci" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Data gerai sedang diperbarui. Coba lagi sebentar lagi.")
  await page.unroute("**/api/app/api-keys/*/revoke")
  await dialog.getByRole("button", { name: "Batal" }).click()

  await page.setViewportSize({ width: 900, height: 800 })
  await page.goto(`${APP}/pengaturan`)
  await expect(page.getByRole("heading", { name: "Pengaturan", level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/pengaturan$/)
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page).toHaveURL(/\/pengaturan\/profil$/)
})
