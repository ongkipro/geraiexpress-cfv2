import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { APP, lastMail, OWNER, uniqueEmail } from "./helpers"

// DEC-248 (owner 2026-11-19): every auth route is one white viewport — no <footer>, no page scroll, the centre fits
// without scrolling inside itself — at 1440×900, 1366×768 and 390×844; a register flow `1 · Akun — 2 · Gerai —
// 3 · Titik Jemput`; a `Lihat` / `Sembunyikan` password toggle.
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]

async function fits(page: Page, what: string) {
  await expect(page.locator("footer"), what).toHaveCount(0)
  const m = await page.evaluate(() => {
    const d = document.documentElement
    const main = document.querySelector<HTMLElement>("[data-auth-main]")!
    return { page: d.scrollHeight - innerHeight, wide: d.scrollWidth - d.clientWidth, inner: main.scrollHeight - main.clientHeight }
  })
  expect(m, what).toEqual({ page: 0, wide: 0, inner: 0 })
}

test("DEC-248: masuk (app + owner), daftar 1 · 2 · 3 — tanpa footer, tanpa scroll di 1440, 1366 dan 390", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the three viewports are set inside this test")
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))

  for (const size of SIZES) {
    await page.setViewportSize(size)
    const at = `${size.width}x${size.height}`
    await page.goto(`${APP}/masuk`)
    await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible()
    await fits(page, `app /masuk ${at}`)
    await expect(page.getByRole("link", { name: "Daftar" })).toHaveAttribute("href", "/daftar-akun")
    await expect(page.getByRole("link", { name: /kembali ke situs utama/ })).toHaveAttribute("href", APP.replace("app.", ""))
    await page.goto(`${OWNER}/masuk`)
    await expect(page.getByRole("heading", { name: "Masuk Super Admin" })).toBeVisible()
    await fits(page, `owner /masuk ${at}`)
    await expect(page.getByRole("link", { name: /situs utama/ })).toHaveCount(0)
    await page.goto(`${APP}/daftar-akun`)
    await expect(page.getByRole("list", { name: "Tahap pendaftaran" }).locator('[aria-current="step"]')).toHaveText("1 · Akun")
    await fits(page, `/daftar-akun ${at}`)
  }

  // Password toggle: a real button, pressed state, the value never changes.
  await page.goto(`${APP}/masuk`)
  const pw = page.getByLabel("Kata sandi")
  await pw.fill("rahasia-123")
  const toggle = page.getByRole("button", { name: "Lihat" })
  await expect(toggle).toHaveAttribute("aria-pressed", "false")
  await toggle.click()
  await expect(pw).toHaveAttribute("type", "text")
  await expect(page.getByRole("button", { name: "Sembunyikan" })).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Sembunyikan" }).click()
  await expect(pw).toHaveAttribute("type", "password")
  await expect(pw).toHaveValue("rahasia-123")

  // Tahap 1 sub-states (OTP: quiet `Ganti email` / `Kirim ulang`, no green alert box), then Tahap 2 and 3.
  const email = uniqueEmail("e2e-248")
  await page.setViewportSize(SIZES[1]!)
  await page.goto(`${APP}/daftar-akun`)
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Kirim Kode" }).click()
  await expect(page.getByText(`Kode dikirim ke ${email}. Berlaku 10 menit.`)).toBeVisible()
  await expect(page.getByRole("button", { name: "Ganti email" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Kirim ulang" })).toBeVisible()
  await expect(page.getByRole("status")).toHaveCount(0)
  await fits(page, "otp 1366x768")
  await page.getByLabel("Kode verifikasi").fill((await lastMail(request, email, "signup_otp")).code!)
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await page.getByLabel("Nama lengkap").fill("Bu Rina")
  await page.getByLabel("Kata sandi").fill("pemilik-e2e-kuat-1")
  await fits(page, "profile 1366x768")
  await page.getByRole("button", { name: "Buat Akun" }).click()
  await expect(page.getByRole("list", { name: "Tahap pendaftaran" }).locator('[aria-current="step"]')).toHaveText("2 · Gerai")
  await expect(page.getByText(".geraimitra.com", { exact: true })).toBeVisible()
  for (const size of SIZES) {
    await page.setViewportSize(size)
    await fits(page, `tahap 2 ${size.width}x${size.height}`)
  }
  await page.getByLabel("Nama gerai").fill("Toko Uji Satu")
  await page.getByLabel("WhatsApp gerai").fill("081234560000")
  const seller1 = `seller-${Date.now().toString(36)}@contoh.test`
  await page.getByLabel("Email untuk akun Mengantar").fill(seller1)
  await page.getByRole("button", { name: "Lanjut ke Titik Jemput" }).click()
  await expect(page.getByRole("list", { name: "Tahap pendaftaran" }).locator('[aria-current="step"]')).toHaveText("3 · Titik Jemput")
  await expect(page.getByLabel("HP PIC")).toHaveValue("081234560000")
  for (const size of SIZES) {
    await page.setViewportSize(size)
    await fits(page, `tahap 3 ${size.width}x${size.height}`)
  }
  // The area results float over the form: they never grow the page. Sol R1: a keyboard-operable combobox.
  const area = page.getByRole("combobox", { name: "Cari kelurahan / kecamatan / kode pos" })
  const list = page.getByRole("listbox", { name: "Hasil pencarian wilayah" })
  await area.fill("coblong")
  await expect(list).toBeVisible()
  await fits(page, "tahap 3 with area results 390x844")
  await area.press("Escape")
  await expect(list).toBeHidden()
  await expect(area).toBeFocused()
  await area.press("ArrowDown")
  await expect(list).toBeVisible()
  await expect(area).toHaveAttribute("aria-activedescendant", "area-opt-0")
  await expect(list.getByRole("option").first()).toHaveAttribute("aria-selected", "true")
  await area.press("Enter")
  await expect(list).toBeHidden()
  await expect(page.getByText(/^Dipilih: Dago, Coblong/)).toBeVisible()
  // Focus leaving the picker without a choice closes the overlay.
  await area.fill("coblong")
  await expect(list).toBeVisible()
  await page.keyboard.press("Tab")
  await expect(list).toBeHidden()
  await area.focus()
  await area.press("ArrowDown")
  await area.press("Enter")
  await expect(page.getByText(/^Dipilih: Dago, Coblong/)).toBeVisible()
  // Sol R1: the consent names the exact Mengantar email, and changing that email clears the consent.
  await expect(page.locator("[data-seller-email]")).toHaveText(seller1)
  await page.getByRole("checkbox").check()
  await expect(page.getByRole("button", { name: "Ajukan Gerai" })).toBeEnabled()
  await page.getByRole("button", { name: "← Kembali" }).click()
  await expect(page.getByLabel("Nama gerai")).toHaveValue("Toko Uji Satu")
  const seller2 = `seller2-${Date.now().toString(36)}@contoh.test`
  await page.getByLabel("Email untuk akun Mengantar").fill(seller2)
  // Sol R1: HP PIC follows a corrected WhatsApp gerai while untouched …
  await page.getByLabel("WhatsApp gerai").fill("081234569999")
  await page.getByRole("button", { name: "Lanjut ke Titik Jemput" }).click()
  await expect(page.locator("[data-seller-email]")).toHaveText(seller2)
  await expect(page.getByRole("checkbox")).not.toBeChecked()
  await expect(page.getByRole("button", { name: "Ajukan Gerai" })).toBeDisabled()
  await expect(page.getByLabel("HP PIC")).toHaveValue("081234569999")
  // … and keeps the applicant's own number once edited.
  await page.getByLabel("HP PIC").fill("081200000001")
  await page.getByRole("button", { name: "← Kembali" }).click()
  await page.getByLabel("WhatsApp gerai").fill("081234567777")
  await page.getByRole("button", { name: "Lanjut ke Titik Jemput" }).click()
  await expect(page.getByLabel("HP PIC")).toHaveValue("081200000001")
  // Below 3 characters the old results are dropped: an arrow key opens nothing (results exist first).
  await area.fill("coblong")
  await expect(list).toBeVisible()
  await area.fill("co")
  await area.press("ArrowDown")
  await expect(list).toBeHidden()
  await expect(area).not.toHaveAttribute("aria-activedescendant", /.+/)
  // Sol R2: results belong to the exact query. While `tebet` is still pending, the `coblong` options are gone and
  // ArrowDown + Enter picks nothing; the `tebet` results show once the request completes.
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  await page.route("**/api/app/onboarding/areas?q=tebet*", async (route) => {
    await gate
    await route.continue()
  })
  await area.fill("coblong")
  await expect(list).toBeVisible()
  await area.fill("tebet")
  await expect(list).toBeHidden()
  await area.press("ArrowDown")
  await area.press("Enter")
  await expect(page.getByText(/^Dipilih:/)).toHaveCount(0)
  release()
  await expect(list.getByRole("option", { name: /Tebet/ }).first()).toBeVisible()
  await page.unroute("**/api/app/onboarding/areas?q=tebet*")
  // Sol R2: the active option scrolls into view after the list re-renders (10 results overflow the 13rem list).
  await page.route("**/api/app/onboarding/areas?q=zona*", (route) =>
    route.fulfill({ json: { ok: true, data: { items: Array.from({ length: 10 }, (_, i) => ({ id: `zona-${i}`, label: `Zona Contoh ${i + 1}, Kota Contoh`, postalCode: null })) } } }),
  )
  await area.fill("zona")
  await expect(list.getByRole("option")).toHaveCount(10)
  await area.press("Escape")
  await expect(list).toBeHidden()
  await area.press("ArrowUp")
  await expect(area).toHaveAttribute("aria-activedescendant", "area-opt-9")
  await expect.poll(() => page.locator("#area-results").evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect(page.locator("#area-opt-9")).toBeInViewport()
  await area.press("Escape")
  await page.unroute("**/api/app/onboarding/areas?q=zona*")
  // Sol R1 (supervisor pre-review): a short viewport with the coordinates open scrolls inside the centre only;
  // Latitude, Longitude and `Ajukan Gerai` stay reachable, and the page itself never scrolls.
  await page.setViewportSize({ width: 1280, height: 560 })
  await page.getByText("Titik koordinat peta (opsional)").click()
  for (const target of [page.getByLabel("Latitude"), page.getByLabel("Longitude"), page.getByRole("button", { name: "Ajukan Gerai" })]) {
    await target.scrollIntoViewIfNeeded()
    await expect(target).toBeInViewport()
  }
  const short = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("[data-auth-main]")!
    return { page: document.documentElement.scrollHeight - innerHeight, inner: main.scrollHeight - main.clientHeight, top: main.scrollTop }
  })
  expect(short.page).toBe(0)
  expect(short.inner).toBeGreaterThan(0)
  expect(short.top).toBeGreaterThan(0)
  await expect(page.locator("footer")).toHaveCount(0)
  expect(errors).toEqual([])
})

// Sol R1 (P2): with a real challenge configured the slot is reserved (65px, `size: "flexible"`), so the widget never
// shifts the form, and the pages still fit every viewport. Config and widget are stubbed (no third-party call).
test("DEC-248: slot Turnstile 65px dipesan saat widget nyata dikonfigurasi, tetap tanpa scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the three viewports are set inside this test")
  await page.route("**/api/app/auth/config", (r) => r.fulfill({ json: { ok: true, data: { turnstileSiteKey: "0x4AAAAAAA-e2e-stub" } } }))
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body:
        'window.__tsResets=0;window.turnstile={render:function(el,o){window.__tsCb=o.callback;var d=document.createElement("div");d.style.height="65px";d.setAttribute("data-size",o.size);setTimeout(function(){el.appendChild(d);o.callback("stub-token")},300);return "w1"},reset:function(){window.__tsResets++;setTimeout(function(){window.__tsCb("stub-token-2")},300)},remove:function(){}}',
    }),
  )
  for (const path of ["/masuk", "/daftar-akun"]) {
    for (const size of SIZES) {
      await page.setViewportSize(size)
      await page.goto(`${APP}${path}`)
      const slot = page.locator("[data-turnstile-slot]")
      const submit = page.getByRole("button", { name: path === "/masuk" ? "Masuk" : "Kirim Kode", exact: true })
      // Reserved while the widget is still loading (the stub renders after 300 ms) …
      await expect(slot).toBeVisible()
      await expect(slot.locator("[data-size]")).toHaveCount(0)
      expect(Math.round((await slot.boundingBox())!.height), `${path} slot`).toBeGreaterThanOrEqual(65)
      const before = (await submit.boundingBox())!.y
      // … so the widget arriving moves nothing.
      await expect(slot.locator("[data-size]")).toHaveAttribute("data-size", "flexible")
      await expect(submit).toBeEnabled()
      expect((await submit.boundingBox())!.y, `${path} shift`).toBe(before)
      await fits(page, `${path} with widget ${size.width}x${size.height}`)
    }
  }
  // Widget-enabled retry (Sol R1): a failed sign-in resets the widget; `Masuk` waits for the fresh token.
  await page.setViewportSize(SIZES[0]!)
  await page.goto(`${APP}/masuk`)
  const masuk = page.getByRole("button", { name: "Masuk", exact: true })
  await expect(masuk).toBeEnabled()
  await page.getByLabel("Email").fill(uniqueEmail("e2e-248-retry"))
  await page.getByLabel("Kata sandi").fill("salah-sekali-9")
  await masuk.click()
  await expect(page.getByRole("alert")).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __tsResets: number }).__tsResets)).toBe(1)
  await expect(masuk).toBeDisabled()
  await expect(masuk).toBeEnabled()
  await fits(page, "/masuk after a failed attempt with widget")
})
