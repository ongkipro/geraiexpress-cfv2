import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { APP, OWNER, lastMail, uniqueEmail } from "./helpers"

// DEC-239 shell + POS keyboard behaviour (GPT-6.1 Sol review R1 #1, #3, #7): the courier radio group always has a tab
// stop in the visible category and arrows move from the focused row; the ⌘K palette keeps the active option in view;
// the sidebar counter status follows a saved label format. DEC-241: sidebar taxonomy and the deferred Shift Loket.
async function seeded(page: Page, prefix: string, name = "Bu Rapi") {
  const api = page.context().request
  const email = uniqueEmail(prefix)
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(page.context().request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name, password: "rapi-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `r${Date.now().toString(36)}`, name: "Gerai Rapi", connect: true } })).status()).toBe(201)
}

/**
 * Right-zone gap to the search once layout has settled: the sidebar animates its width after a reload at a new text
 * size, so measure only when two readings 150 ms apart agree.
 */
async function searchGap(page: Page) {
  const read = () =>
    page.evaluate(() => {
      const h = document.querySelector("header")!
      const s = h.querySelector("[data-shell-search]")!.getBoundingClientRect()
      const left = h.children[0]!.getBoundingClientRect()
      const right = [...h.children[2]!.children].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
      return { x: s.left, before: s.left - left.right, after: Math.min(...right.map((r) => r.left)) - s.right }
    })
  let prev = await read()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150)
    const next = await read()
    if (next.x === prev.x && next.after === prev.after) return next
    prev = next
  }
  return prev
}

/** A local Super Admin (bootstrap allows more than one on GX_ENV=local) for the console preview login. */
async function seededAdmin(page: Page) {
  const api = page.context().request
  const email = uniqueEmail("e2e-rapi-sa")
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(page.context().request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Admin Konsol Contoh Panjang", password: "rapi-sa-kuat-1" } })
  const ops = (await import("node:fs")).readFileSync(".dev.vars", "utf8").match(/^OPS_TOKEN=(.*)$/m)![1]!.trim().replace(/^(["'])(.*)\1$/, "$2")
  expect((await api.post(`${OWNER}/internal/ops/bootstrap-admin`, { headers: { authorization: `Bearer ${ops}`, "content-type": "application/json" }, data: { email } })).status()).toBe(201)
  return email
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
  // DEC-243: the counter trees are open on every page, but only the current section is marked.
  await expect(nav.getByRole("link", { name: "Kiriman Satuan" })).toBeVisible()
  await expect(nav.getByRole("link", { name: "Kiriman Satuan" })).not.toHaveAttribute("aria-current", "page")
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

// DEC-243: the topbar search sits at the same x on every page (3-column grid header), the breadcrumb is valid HTML
// (no <li> inside an <li>), both counter trees are open on load, and the settings rail is one card that fits without
// scrolling on a 1440×900 screen.
test("DEC-243: search tidak bergeser, breadcrumb valid, pohon kasir terbuka, rail tanpa gulir", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop header")
  await page.setViewportSize({ width: 1440, height: 900 })
  await seeded(page, "e2e-rapi-e")
  const search = page.locator("[data-shell-search]")
  const xs: number[] = []
  for (const to of ["/", "/pengaturan/ekspedisi", "/kiriman?tab=retur", "/kasir/cek-resi"]) {
    await page.goto(`${APP}${to}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const box = (await search.boundingBox())!
    xs.push(box.x)
    expect(await page.locator("[data-slot=breadcrumb-item] li").count()).toBe(0)
  }
  expect(new Set(xs).size).toBe(1)

  const nav = page.getByRole("navigation", { name: "Menu utama" })
  await page.goto(`${APP}/keuangan`)
  for (const name of ["Kiriman Satuan", "Paket Massal", "Cek Ongkir", "Cek Resi"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible()

  // The rail must fit a common 1366×768 laptop without scrolling (the duplicate summary card is gone).
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto(`${APP}/pengaturan/printer`)
  const rail = page.locator("[data-settings-rail]")
  await expect(rail.getByRole("link", { name: /API & MCP/ })).toBeVisible()
  expect(await rail.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
  await expect(rail.getByText("Mengantar terhubung")).toHaveCount(0)
})

// Sol R1 (DEC-243) #1: no topbar control may run into the search bar at narrow desktop widths (expanded sidebar,
// long owner name); #2: the phone period sheet keeps 44 px month-navigation targets.
test("DEC-243: utilitas topbar tidak menimpa pencarian; navigasi bulan di HP ≥ 44 px", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop + phone viewports set in the test")
  await seeded(page, "e2e-rapi-f", "Ibu Kartika Sekar Ayuningtyas Wulandari")
  for (const width of [1024, 1100, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(`${APP}/pengaturan/ekspedisi`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const gap = await searchGap(page)
    expect(gap.before, `left zone overlaps search at ${width}px`).toBeGreaterThanOrEqual(0)
    expect(gap.after, `right zone overlaps search at ${width}px`).toBeGreaterThanOrEqual(0)
  }

  // Sol R2: the same holds with Ukuran Teks enlarged (root rem 18 / 20 px), long name included.
  for (const size of ["besar", "sangat-besar"]) {
    await page.evaluate((v) => localStorage.setItem("gx-text-size", v), size)
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`${APP}/pengaturan/ekspedisi`)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      const { after } = await searchGap(page)
      expect(after, `right zone overlaps search at ${width}px, text ${size}`).toBeGreaterThanOrEqual(0)
    }
  }
  await page.evaluate(() => localStorage.removeItem("gx-text-size"))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${APP}/`)
  await page.getByRole("button", { name: /^Periode:/ }).click()
  for (const name of [/bulan sebelumnya/i, /bulan berikutnya/i]) {
    const box = (await page.getByRole("dialog").getByRole("button", { name }).boundingBox())!
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
  }

  // The Super Admin console (environment + TOTP pills on the right) under the same rule, via the local preview login
  // (last: seeding the admin signs this browser context in as that user on app.).
  const ops = (await import("node:fs")).readFileSync(".dev.vars", "utf8").match(/^OPS_TOKEN=(.*)$/m)![1]!.trim().replace(/^(["'])(.*)\1$/, "$2")
  const admin = await seededAdmin(page)
  // Normal and both enlarged text sizes (Sol R3: the console's environment badge at 125 % / 1024 px).
  for (const size of [null, "besar", "sangat-besar"]) {
    for (const width of [1024, 1280, 1536]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`${OWNER}/internal/dev/preview?token=${ops}&as=${encodeURIComponent(admin)}&to=%2Fgerai`)
      await page.evaluate((v) => (v ? localStorage.setItem("gx-text-size", v) : localStorage.removeItem("gx-text-size")), size)
      await page.reload()
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      const { after } = await searchGap(page)
      expect(after, `console right zone overlaps search at ${width}px, text ${size ?? "normal"}`).toBeGreaterThanOrEqual(0)
    }
  }
})

// DEC-244: account menu public page link (owner + Kasir), owner-only operational status icon → /status → Periksa Ulang,
// the packing Select opens below its trigger with prices on the right, and the Super Admin recheck actions.
test("DEC-244: Halaman Publik Gerai, status operasional, packing select", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop flows")
  await seeded(page, "e2e-rapi-g")
  await page.goto(`${APP}/`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.getByRole("button", { name: "Menu akun" }).click()
  const pub = page.getByRole("menuitem", { name: /Halaman Publik Gerai/ })
  await expect(pub).toHaveAttribute("target", "_blank")
  await expect(pub).toHaveAttribute("href", /^https:\/\/r[a-z0-9]+\.geraimitra\.localhost/)
  await page.keyboard.press("Escape")

  const icon = page.getByRole("link", { name: /^Status operasional/ })
  await expect(icon).toHaveAttribute("data-status-tone", /setup|problem|healthy/)
  await icon.click()
  await expect(page).toHaveURL(/\/status$/)
  await expect(page.getByRole("heading", { name: "Status Operasional", level: 1 })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Kesiapan Loket" })).toBeVisible()
  const rechecked = page.waitForResponse((r) => r.url().endsWith("/api/app/status/recheck") && r.request().method() === "POST", { timeout: 30_000 })
  await page.getByRole("button", { name: "Periksa Ulang" }).first().click()
  expect((await rechecked).status()).toBe(200)
  await expect(page.getByText("Pemeriksaan ulang selesai.")).toBeVisible({ timeout: 10_000 })

  // Packing catalogue so the POS shows the select (a fresh gerai has none).
  const papi = page.context().request
  expect((await papi.post(`${APP}/api/app/settings/packing`, { headers: { origin: APP, "content-type": "application/json" }, data: { items: [{ id: null, name: "Bubble wrap", priceIdr: 3000, active: true }], serviceFeeEnabled: false, serviceFeeIdr: null } })).status()).toBe(200)
  await page.goto(`${APP}/kasir`)
  const trigger = page.locator("#packing")
  await trigger.evaluate((e) => window.scrollBy(0, e.getBoundingClientRect().top - 200))
  // Sol R1 #3: the idle trigger keeps the ≥ 3:1 input border token (not a pale slate-200).
  await page.mouse.move(0, 0)
  expect(await trigger.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(await page.evaluate(() => { const i = document.createElement("input"); i.className = "border border-input"; document.body.append(i); const c = getComputedStyle(i).borderTopColor; i.remove(); return c }))
  await trigger.click()
  const t = (await trigger.boundingBox())!
  // The popup zooms in (data-open:zoom-in-95): measure once its box has settled.
  const content = page.locator("[data-slot=select-content]")
  await expect(content).toHaveAttribute("data-open", "")
  await expect.poll(async () => { const a = (await content.boundingBox())!.y; await page.waitForTimeout(80); return Math.abs((await content.boundingBox())!.y - a) }).toBeLessThan(0.1)
  const popup = (await content.boundingBox())!
  // A dropdown below the field (alignItemWithTrigger=false), not a list laid over the trigger.
  expect(popup.y).toBeGreaterThanOrEqual(t.y + t.height)
  await expect(page.getByRole("option", { name: /Bubble wrap\s*\+Rp\s?3\.000/ })).toBeVisible()
  await page.keyboard.press("Escape")

  // Kasir: same public page link, no status icon, /status refused by the API.
  const k = await context.browser()!.newContext()
  const kp = await k.newPage()
  const api = page.context().request
  const h = { origin: APP, "content-type": "application/json" }
  const kasir = uniqueEmail("e2e-rapi-k")
  expect((await api.post(`${APP}/api/app/members/invitations`, { headers: h, data: { email: kasir } })).status()).toBe(201)
  const { link } = await lastMail(page.context().request, kasir, "kasir_invite")
  await kp.goto(link!)
  await kp.getByLabel("Nama lengkap").fill("Kasir Rapi")
  await kp.getByLabel("Buat kata sandi").fill("kasir-rapi-kuat-1")
  await kp.getByRole("button", { name: "Buat Akun" }).click()
  await expect(kp.getByRole("heading", { name: "Tugas Loket Hari Ini" })).toBeVisible()
  await expect(kp.getByRole("link", { name: /^Status operasional/ })).toHaveCount(0)
  await kp.getByRole("button", { name: "Menu akun" }).click()
  await expect(kp.getByRole("menuitem", { name: /Halaman Publik Gerai/ })).toHaveAttribute("target", "_blank")
  expect((await kp.request.get(`${APP}/api/app/status`)).status()).toBe(403)
  await k.close()
})

test("DEC-244: Super Admin periksa ulang, verifikasi diskon, antrean sinkronisasi", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop console")
  await seeded(page, "e2e-rapi-h")
  const ops = (await import("node:fs")).readFileSync(".dev.vars", "utf8").match(/^OPS_TOKEN=(.*)$/m)![1]!.trim().replace(/^(["'])(.*)\1$/, "$2")
  const admin = await seededAdmin(page)
  const go = (to: string) => page.goto(`${OWNER}/internal/dev/preview?token=${ops}&as=${encodeURIComponent(admin)}&to=${encodeURIComponent(to)}`)
  await go("/sistem")
  await expect(page.getByRole("link", { name: /^Status operasional/ })).toBeVisible()
  // The recheck runs real operator checks (relay, alerts, email retries, quota): wait for its answer, not a toast race.
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/owner/sistem/kesehatan/periksa") && r.request().method() === "POST", { timeout: 30_000 })
  await page.getByRole("button", { name: "Periksa Ulang Semua Sinyal" }).click()
  expect((await answered).status()).toBe(200)
  await expect(page.getByRole("button", { name: "Periksa Ulang Semua Sinyal" })).toBeEnabled()
  await go("/tarif")
  const verified = page.waitForResponse((r) => r.url().endsWith("/api/owner/tarif/verifikasi-ulang") && r.request().method() === "POST", { timeout: 30_000 })
  await page.getByRole("button", { name: "Verifikasi Ulang Diskon" }).click()
  expect((await verified).status()).toBe(200)
  await expect(page.getByText(/^Verifikasi selesai: \d+ gerai/)).toBeVisible({ timeout: 10_000 })
  // Sol R1 #2: on a phone the visible discount editor owns its labels (no duplicate ids with the hidden table).
  const tenant = await page.evaluate(async () => (await (await fetch("/api/owner/tarif/gerai")).json()) as { data: { items: Array<{ id: string }> } })
  await page.setViewportSize({ width: 390, height: 844 })
  await go(`/tarif/${tenant.data.items[0]!.id}`)
  await page.getByRole("button", { name: "Ubah" }).first().click()
  const label = page.getByText("Alasan (wajib, dicatat di log audit)").filter({ visible: true })
  await label.click()
  await expect(page.locator("textarea:focus")).toBeVisible()
  expect(await page.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map((e) => e.id); return ids.length - new Set(ids).size })).toBe(0)
  await page.setViewportSize({ width: 1280, height: 800 })

  await go("/pengawasan")
  await expect(page.getByRole("heading", { name: "Antrean Sinkronisasi" })).toBeVisible()
  await expect(page.getByText("Perlu dicocokkan")).toBeVisible()
  await page.getByRole("button", { name: "Menu akun" }).click()
  await expect(page.getByRole("menuitem", { name: /Situs Utama GeraiExpress/ })).toHaveAttribute("target", "_blank")
})
