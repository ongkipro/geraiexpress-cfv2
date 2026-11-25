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
  // Roll 58 mm preview fits strictly within the paper box (zero horizontal overflow) with real SVG barcode & QR,
  // and Cetak Uji Contoh works for both Roll 58 mm (USB/system print iframe) and 10×15 PDF formats.
  await page.getByRole("radio", { name: /Roll 58 mm/ }).click()
  const rollPaper = page.locator('[aria-label="Pratinjau label 58 mm"]')
  await expect(rollPaper).toBeVisible()
  const rollMetrics = await rollPaper.evaluate((el) => {
    const imgs = [...el.querySelectorAll("img")]
    return {
      overflow: el.scrollWidth - el.clientWidth,
      barcodeOk: imgs.some((img) => img.alt.startsWith("Barcode ") && img.src.startsWith("data:image/svg+xml")),
      qrAlt: imgs.find((img) => img.alt.startsWith("QR lacak "))?.alt ?? "",
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  expect(rollMetrics.overflow).toBeLessThanOrEqual(1)
  expect(rollMetrics.docOverflow).toBeLessThanOrEqual(1)
  expect(rollMetrics.barcodeOk).toBe(true)
  expect(rollMetrics.qrAlt).toMatch(/^QR lacak https:\/\/.+\/lacak\/8k4m2p7$/)
  await page.getByRole("button", { name: "Cetak Uji Contoh" }).click()
  await expect(page.getByText(/Dialog cetak 58 mm dibuka/)).toBeVisible()
  await expect(page.locator('iframe[data-print-frame="roll58"]')).toHaveCount(1)

  await page.getByRole("radio", { name: /10×15 · Paket \+ Bukti/ }).click()
  await expect(page.getByText("100 × 150 mm")).toBeVisible()
  await page.getByRole("button", { name: "Cetak Uji Contoh" }).click()
  await expect(page.getByText(/Dialog cetak 100 × 150 mm dibuka/)).toBeVisible()
  await expect(page.getByRole("link", { name: /Buka \/ Unduh PDF Uji/ })).toBeVisible()
  await expect(page.locator('iframe[data-print-frame="label"]')).toHaveCount(1)

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
// own (wheel over it) without scrolling the page. Since DEC-243 the single-card rail fits a 1280×720 laptop, so the
// independent-scroll bound is proven on an ultra-short 1280×560 window.
test("Pengaturan: rail tetap diam saat form digulir dan bisa digulir sendiri", async ({ page, context, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "rail is desktop only (≥ 1024 px)")
  await page.setViewportSize({ width: 1280, height: 560 })
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

  // 3. Switching between Pengaturan sections (tall → short Mini-Site → Data Usaha) keeps the exact same rail DOM node
  //    mounted (no rail unmount/flicker) and shifts neither the rail nor the topbar search horizontally.
  const railNav = page.getByRole("navigation", { name: "Menu pengaturan" })
  const search = page.locator("[data-shell-search]")
  const beforeRailX = (await rail.boundingBox())!.x
  const beforeSearchX = (await search.boundingBox())!.x
  await rail.evaluate((el) => { (el as unknown as { __gxSameRail?: boolean }).__gxSameRail = true })
  await railNav.getByRole("link", { name: /Mini-Site/ }).click()
  await expect(page.getByRole("heading", { name: "Mini-Site", level: 1 })).toBeVisible()
  expect(await rail.evaluate((el) => (el as unknown as { __gxSameRail?: boolean }).__gxSameRail)).toBe(true)
  expect(Math.abs((await rail.boundingBox())!.x - beforeRailX)).toBeLessThan(1)
  expect(Math.abs((await search.boundingBox())!.x - beforeSearchX)).toBeLessThan(1)
  await railNav.getByRole("link", { name: /Data Usaha/ }).click()
  await expect(page.getByRole("heading", { name: "Data Usaha", level: 1 })).toBeVisible()
  expect(await rail.evaluate((el) => (el as unknown as { __gxSameRail?: boolean }).__gxSameRail)).toBe(true)
  expect(Math.abs((await rail.boundingBox())!.x - beforeRailX)).toBeLessThan(1)
})

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")

test("Profil Gerai: unggah logo 1:1 (max 2 MB) → logo gerai & favicon mini-site + sanitasi HP & alamat 3 baris", async ({ page, context, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "profile logo + input sanitisation checked once on desktop")
  const email = uniqueEmail("e2e-logo-profil")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Logo Profil", password: "logo-profil-kuat-1" } })
  const slug = `lp${Date.now().toString(36)}`
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug, name: "Gerai Express 88", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/pengaturan/profil`)
  await expect(page.getByRole("heading", { name: "Logo & Ikon Gerai (1:1)" })).toBeVisible()

  // Rejects > 2 MB client-side before upload.
  await page.getByLabel("Pilih logo gerai 1:1").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 16, 1) })
  await expect(page.getByText("Ukuran gambar maksimal 2 MB.")).toBeVisible()

  // Uploads valid image → normalises to 1:1 JPEG → active immediately in card, sidebar, and mini-site favicon/logo.
  await page.getByLabel("Pilih logo gerai 1:1").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1PX })
  await expect(page.getByText("Logo 1:1 sudah terpasang.")).toBeVisible()
  await expect(page.getByRole("img", { name: "Logo Gerai Express 88" })).toBeVisible()

  // Reload confirms persistence from server.
  await page.reload()
  await expect(page.getByText("Logo 1:1 sudah terpasang.")).toBeVisible()

  // Input discipline: WhatsApp strips letters while keeping digits & dashes; Alamat lengkap is a 3-row textarea.
  const wa = page.getByLabel("WhatsApp gerai")
  await wa.fill("abc0812-3456-7890xyz")
  await expect(wa).toHaveValue("0812-3456-7890")
  const street = page.getByLabel("Alamat lengkap")
  await expect(street).toHaveJSProperty("tagName", "TEXTAREA")
  await expect(street).toHaveAttribute("rows", "3")

  // Delete logo cleanly via confirmation AlertDialog.
  await page.getByRole("button", { name: "Hapus", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Ya, Hapus" }).click()
  await expect(page.getByText("Belum ada logo — memakai inisial nama gerai.")).toBeVisible()
})

test("Pengaturan › Mengantar: sinkron otomatis aktif tanpa titik peringatan, sinkron API key, dan webhook opsional bisa dibuka", async ({ page, context, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "checked once on desktop + narrow resize")
  const email = uniqueEmail("e2e-mengantar")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Mengantar", password: "mengantar-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `mg${Date.now().toString(36)}`, name: "Gerai Mengantar", connect: true } })).status()).toBe(201)

  await page.goto(`${APP}/pengaturan/mengantar`)
  await expect(page.getByRole("heading", { name: "Mengantar", level: 1 })).toBeVisible()
  await expect(page.getByText("Sinkron otomatis aktif")).toBeVisible()
  // No nagging amber dot on the Pengaturan rail when automatic polling handles updates.
  await expect(page.locator("[data-settings-rail] .bg-warn")).toHaveCount(0)
  // Webhook form is collapsed by default so normal sellers aren't forced to configure it.
  await expect(page.getByText("Menu Webhook belum muncul di Mengantar?")).toHaveCount(0)

  // Manual status poll + Partner API key sync both work inline.
  await page.getByRole("button", { name: "Periksa Status" }).click()
  await expect(page.getByText(/Tidak ada kiriman aktif|kiriman aktif diperiksa/)).toBeVisible()
  await page.getByRole("button", { name: "Sinkronkan API Key" }).click()
  await expect(page.getByText(/sudah sama dengan kunci aktif di Mengantar/)).toBeVisible()

  // Expand optional Webhook card and verify zero horizontal overflow on desktop & phone.
  await page.getByRole("button", { name: /Atur Webhook/i }).click()
  await expect(page.getByText("Menu Webhook belum muncul di Mengantar?")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
})

test("Semua halaman ruang kerja terbuka tanpa error 'Ruang kerja tidak dapat dimuat' dan pulih otomatis jika chunk usang", async ({ page, context, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "full route sweep runs once on desktop")
  const email = uniqueEmail("e2e-sweep")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Sweep", password: "sweep-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `sw${Date.now().toString(36)}`, name: "Gerai Sweep", connect: true } })).status()).toBe(201)

  const pageErrors: string[] = []
  page.on("pageerror", (e) => pageErrors.push(e.message))

  const routes = [
    "/",
    "/kasir",
    "/kasir/cek-cepat",
    "/kasir/cek-resi",
    "/kasir/multi",
    "/kasir/shift",
    "/kiriman",
    "/kiriman/cetak-massal",
    "/kiriman/massal",
    "/kontak/pengirim",
    "/kontak/penerima",
    "/keuangan",
    "/notifikasi",
    "/akun",
    "/bantuan",
    "/status",
    "/pengaturan/profil",
    "/pengaturan/mini-site",
    "/pengaturan/data-usaha",
    "/pengaturan/ekspedisi",
    "/pengaturan/printer",
    "/pengaturan/label-privasi",
    "/pengaturan/packing",
    "/pengaturan/anggota",
    "/pengaturan/mengantar",
    "/pengaturan/api-mcp",
  ]
  for (const r of routes) {
    await page.goto(`${APP}${r}`, { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Ruang kerja tidak dapat dimuat")).toHaveCount(0)
    await expect(page.getByText("Halaman ini gagal dimuat")).toHaveCount(0)
  }
  expect(pageErrors).toEqual([])
})
