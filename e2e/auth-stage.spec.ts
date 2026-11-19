import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { createHmac } from "node:crypto"
import { APP, lastMail, opsToken, OWNER, uniqueEmail } from "./helpers"

// DEC-250 (supersedes the DEC-248 stage): every auth route is a 100dvh split-studio — no <footer>, no page scroll, the
// form column fits without scrolling inside itself — at 1440×900, 1366×768 and 390×844. The brand mark never carries
// an arrow (`← Beranda` is a separate link); the porcelain studio panel shows from 960px and folds away below it; the
// register flow is a three-segment wizard bar `Langkah n / 3`; a `Lihat` / `Sembunyikan` password pill.
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
  await expect(page.locator("main[data-auth-main]"), what).toHaveCount(1)
}

// The studio contract on one page: a clean mark (no arrow in it), the panel only from 960px, `← Beranda` on app only.
async function studio(page: Page, what: string, app: boolean) {
  const wide = page.viewportSize()!.width >= 960
  const panel = page.locator("[data-auth-panel]")
  await expect(panel, what)[wide ? "toBeVisible" : "toBeHidden"]()
  await expect(page.locator("[data-auth-bar]"), what)[wide ? "toBeHidden" : "toBeVisible"]()
  const mark = page.locator(wide ? "[data-auth-panel] [data-auth-mark]" : "[data-auth-bar] [data-auth-mark]")
  await expect(mark, what).toBeVisible()
  await expect(mark, what).toContainText("GeraiExpress")
  expect(await mark.innerText(), what).not.toContain("←")
  const home = page.locator(wide ? "[data-auth-panel] [data-auth-home]" : "[data-auth-bar] [data-auth-home]")
  if (app) {
    await expect(home, what).toHaveText("← Beranda")
    await expect(home, what).toHaveAttribute("href", APP.replace("app.", ""))
    await expect(mark, what).toHaveAttribute("href", APP.replace("app.", ""))
  } else {
    await expect(home, what).toHaveCount(0)
    await expect(page.locator("[data-auth-switch]"), what).toHaveCount(0)
    expect(await mark.evaluate((el) => el.tagName), what).toBe("DIV")
  }
  if (wide) await expect(panel.locator("[data-auth-visual]"), what).toHaveAttribute("src", "/loket-mitra-3d.webp")
}

test("DEC-250: split-studio masuk (app + owner), daftar Langkah 1 / 3 — tanpa panah di logo, tanpa footer, tanpa scroll di 1440, 1366 dan 390", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the three viewports are set inside this test")
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  // `/daftar-akun` asks `/auth/me` once (Sol R1 session guard); only its 401 for an anonymous visitor is expected (Sol R2).
  page.on("console", (m) => m.type() === "error" && !(m.location().url.endsWith("/api/app/auth/me") && /\b401\b/.test(m.text())) && errors.push(m.text()))

  for (const size of SIZES) {
    await page.setViewportSize(size)
    const at = `${size.width}x${size.height}`
    await page.goto(`${APP}/masuk`)
    await expect(page.getByRole("heading", { name: "Masuk ke ruang kerja gerai" })).toBeVisible()
    await fits(page, `app /masuk ${at}`)
    await studio(page, `app /masuk ${at}`, true)
    const sw = page.getByRole("navigation", { name: "Masuk atau daftar gerai" })
    await expect(sw.getByRole("link", { name: "Masuk ke Loket" })).toHaveAttribute("aria-current", "page")
    await expect(sw.getByRole("link", { name: "Daftar Gerai Baru" })).toHaveAttribute("href", "/daftar-akun")
    if (size.width >= 960) await expect(page.locator("[data-auth-panel] h2")).toHaveText("Satu pintu ke meja kasir & pembukuan gerai.")
    await page.goto(`${OWNER}/masuk`)
    await expect(page.getByRole("heading", { name: "Masuk Super Admin" })).toBeVisible()
    await fits(page, `owner /masuk ${at}`)
    await studio(page, `owner /masuk ${at}`, false)
    if (size.width >= 960) await expect(page.locator("[data-auth-panel]")).toContainText("Konsol internal GeraiExpress")
    await page.goto(`${APP}/daftar-akun`)
    await expect(page.getByRole("list", { name: "Tahap pendaftaran" }).locator('[aria-current="step"]')).toHaveText("1 · Akun")
    await expect(page.locator("[data-wizard]")).toContainText("Langkah 1 / 3")
    await expect(page.getByRole("navigation", { name: "Masuk atau daftar gerai" }).getByRole("link", { name: "Daftar Gerai Baru" })).toHaveAttribute("aria-current", "page")
    await fits(page, `/daftar-akun ${at}`)
    await studio(page, `/daftar-akun ${at}`, true)
    if (size.width >= 960) await expect(page.locator("[data-auth-slug]")).toHaveText("namagerai.geraimitra.com")
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
  // The wizard bar's quiet `← Kembali` returns from the OTP to the email; a fresh code continues the flow.
  await page.locator("[data-wizard]").getByRole("button", { name: "← Kembali" }).click()
  await expect(page.getByLabel("Email")).toHaveValue(email)
  await expect(page.locator("[data-wizard]").getByRole("button")).toHaveCount(0)
  await page.getByRole("button", { name: "Kirim Kode" }).click()
  await expect(page.getByText(`Kode dikirim ke ${email}. Berlaku 10 menit.`)).toBeVisible()
  await page.getByLabel("Kode verifikasi").fill((await lastMail(request, email, "signup_otp")).code!)
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await page.getByLabel("Nama lengkap").fill("Bu Rina")
  await page.getByLabel("Kata sandi").fill("pemilik-e2e-kuat-1")
  await fits(page, "profile 1366x768")
  await page.getByRole("button", { name: "Buat Akun" }).click()
  await expect(page.getByRole("list", { name: "Tahap pendaftaran" }).locator('[aria-current="step"]')).toHaveText("2 · Gerai")
  await expect(page.locator("[data-wizard]")).toContainText("Langkah 2 / 3")
  // On `/daftar` the active `Daftar Gerai Baru` tab stays on `/daftar` (the owner account already exists).
  await expect(page.getByRole("navigation", { name: "Masuk atau daftar gerai" }).getByRole("link", { name: "Daftar Gerai Baru" })).toHaveAttribute("href", "/daftar")
  // Sol R1 (P1): /daftar → `Masuk ke Loket` → `Daftar Gerai Baru` lands back on /daftar (session without a gerai),
  // and a typed /daftar-akun does the same.
  const sw = page.getByRole("navigation", { name: "Masuk atau daftar gerai" })
  await sw.getByRole("link", { name: "Masuk ke Loket" }).click()
  await expect(page).toHaveURL(/\/masuk$/)
  await page.getByRole("navigation", { name: "Masuk atau daftar gerai" }).getByRole("link", { name: "Daftar Gerai Baru" }).click()
  await expect(page).toHaveURL(/\/daftar$/)
  await expect(page.getByRole("heading", { name: "Identitas gerai" })).toBeVisible()
  await page.goto(`${APP}/daftar-akun`)
  await expect(page).toHaveURL(/\/daftar$/)
  await expect(page.getByRole("heading", { name: "Identitas gerai" })).toBeVisible()
  await expect(page.locator("[data-wizard]").getByRole("button")).toHaveCount(0)
  // Live domain pill: the address follows the name, the studio panel mirrors it, `Ubah` opens the editor.
  const pill = page.locator("[data-domain-pill]")
  await expect(pill).toContainText("namagerai.geraimitra.com")
  await expect(page.getByLabel("Alamat gerai")).toHaveCount(0)
  await page.getByLabel("Nama gerai").fill("Gerai Berkah Jaya")
  await expect(pill).toContainText("gerai-berkah-jaya.geraimitra.com")
  await expect(pill).toContainText("✓ Otomatis")
  await expect(page.locator("[data-auth-slug]")).toHaveText("gerai-berkah-jaya.geraimitra.com")
  for (const size of SIZES) {
    await page.setViewportSize(size)
    await fits(page, `tahap 2 ${size.width}x${size.height}`)
  }
  await pill.getByRole("button", { name: "Ubah" }).click()
  await expect(pill.getByRole("button", { name: "Ubah" })).toHaveAttribute("aria-expanded", "true")
  await page.getByLabel("Alamat gerai").fill("berkah-jaya-1")
  await expect(pill).toContainText("berkah-jaya-1.geraimitra.com")
  await expect(pill).toContainText("Diubah manual")
  await fits(page, "tahap 2 with the slug editor 390x844")
  await page.setViewportSize(SIZES[1]!)
  await expect(page.locator("[data-auth-slug]")).toHaveText("berkah-jaya-1.geraimitra.com")
  await page.getByLabel("Nama gerai").fill("Toko Uji Satu")
  await expect(pill).toContainText("berkah-jaya-1.geraimitra.com")
  await page.getByLabel("WhatsApp gerai").fill("081234560000")
  const seller1 = `seller-${Date.now().toString(36)}@contoh.test`
  await page.getByLabel("Email untuk akun Mengantar").fill(seller1)
  await page.getByRole("button", { name: "Lanjut ke Titik Jemput" }).click()
  await expect(page.getByRole("list", { name: "Tahap pendaftaran" }).locator('[aria-current="step"]')).toHaveText("3 · Titik Jemput")
  await expect(page.locator("[data-wizard]")).toContainText("Langkah 3 / 3")
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
  await page.locator("[data-wizard]").getByRole("button", { name: "← Kembali" }).click()
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
  await page.locator("[data-wizard]").getByRole("button", { name: "← Kembali" }).click()
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

// DEC-250 (AUTH-MINIMALIST-STEP-UX-SPEC §1.3): with a real challenge configured the widget renders with
// `appearance: "interaction-only"`, `size: "flexible"`, `theme: "light"` — no reserved 65px box; a one-line security status
// goes from pending to verified, and only a visitor Cloudflare must challenge sees a full-width widget. Config and widget
// are stubbed (no third-party call).
test("DEC-250: Turnstile interaction-only tanpa kotak kosong, status keamanan, tantangan melebar penuh, retry", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the three viewports are set inside this test")
  await page.route("**/api/app/auth/config", (r) => r.fulfill({ json: { ok: true, data: { turnstileSiteKey: "0x4AAAAAAA-e2e-stub" } } }))
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      // interaction-only: a passing visitor gets an invisible 0px widget; `?challenge=1` asks for interaction at once
      // (a focusable button), `?challenge=late` passes first and asks on the next reset.
      body:
        'window.__tsResets=0;window.__tsRenders=0;var q=location.search;function paint(el,o,ask){el.innerHTML="";var d=document.createElement("div");d.setAttribute("data-size",o.size);d.style.width="100%";d.style.height=ask?"65px":"0px";if(ask){var b=document.createElement("button");b.type="button";b.textContent="Verifikasi manusia";d.appendChild(b)}el.appendChild(d)}window.turnstile={render:function(el,o){window.__tsRenders++;window.__tsOpts=o;window.__tsEl=el;var ask=q.indexOf("challenge=1")>=0;setTimeout(function(){paint(el,o,ask);if(!ask)o.callback("stub-token")},1200);return "w1"},reset:function(){window.__tsResets++;var late=q.indexOf("challenge=late")>=0;setTimeout(function(){paint(window.__tsEl,window.__tsOpts,late);if(!late)window.__tsOpts.callback("stub-token-2")},late?0:1200)},remove:function(){}}',
    }),
  )
  for (const path of ["/masuk", "/daftar-akun"]) {
    for (const size of SIZES) {
      await page.setViewportSize(size)
      await page.goto(`${APP}${path}`)
      const at = `${path} ${size.width}x${size.height}`
      const status = page.locator("[data-security-status]")
      const submit = page.getByRole("button", { name: path === "/masuk" ? "Masuk" : "Kirim Kode", exact: true })
      await expect(status, at).toHaveAttribute("data-state", "pending")
      await expect(status, at).toContainText("Memverifikasi koneksi aman…")
      await expect(submit, at).toBeDisabled()
      // Measure after the 220ms entrance (a transform) has settled, while the widget is still loading.
      await page.locator("[data-auth-col]").evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
      await expect(status, at).toHaveAttribute("data-state", "pending")
      const before = (await submit.boundingBox())!.y
      await expect(status, at).toHaveAttribute("data-state", "ok")
      await expect(status, at).toContainText("Koneksi terverifikasi · Proteksi Cloudflare aktif")
      await expect(submit, at).toBeEnabled()
      const opts = await page.evaluate(() => (window as unknown as { __tsOpts: Record<string, unknown> }).__tsOpts)
      expect({ appearance: opts.appearance, size: opts.size, theme: opts.theme }, at).toEqual({ appearance: "interaction-only", size: "flexible", theme: "light" })
      // No empty box and no extra gap for a passing visitor: the silent widget moves the action 0px (Sol R1).
      await expect(page.locator("[data-turnstile-slot] [data-size]"), at).toHaveCount(1)
      expect(Math.round((await page.locator("[data-turnstile-slot]").boundingBox())?.height ?? 0), at).toBe(0)
      expect((await submit.boundingBox())!.y, at).toBe(before)
      const silent = (await page.locator("[data-turnstile-slot]").boundingBox())!
      expect(Math.round((await submit.boundingBox())!.y - (silent.y + silent.height)), `${at} silent gap`).toBe(0)
      await fits(page, `${at} with widget`)
    }
  }
  // A challenged visitor: the widget takes the full card width; the page still never scrolls.
  await page.setViewportSize(SIZES[2]!)
  await page.goto(`${APP}/masuk?challenge=1`)
  const slot = page.locator("[data-turnstile-slot]")
  await expect(slot.locator("[data-size]")).toHaveAttribute("data-size", "flexible")
  const [s, f] = [(await slot.boundingBox())!, (await page.getByLabel("Email").boundingBox())!]
  expect(Math.round(s.height)).toBe(65)
  expect(Math.round(s.width)).toBe(Math.round(f.width))
  const masukBtn = (await page.getByRole("button", { name: "Masuk", exact: true }).boundingBox())!
  expect(Math.round(masukBtn.y - (s.y + s.height))).toBe(16)
  await expect(page.locator("[data-security-status]")).toHaveAttribute("data-state", "pending")
  await fits(page, "/masuk challenged 390x844")
  // /daftar-akun challenged: the full-width check sits 16px above `Kirim Kode`, the status below it, and Tab reaches the
  // challenge right after the email field (DOM order = screen order, Sol R1).
  await page.goto(`${APP}/daftar-akun?challenge=1`)
  await expect(page.getByRole("button", { name: "Verifikasi manusia" })).toBeVisible()
  const slotBox = (await page.locator("[data-turnstile-slot]").boundingBox())!
  const kirim = (await page.getByRole("button", { name: "Kirim Kode" }).boundingBox())!
  expect(Math.round(slotBox.height)).toBe(65)
  expect(Math.round(kirim.y - (slotBox.y + slotBox.height))).toBe(16)
  expect((await page.locator("[data-security-status]").boundingBox())!.y).toBeGreaterThan(kirim.y)
  await fits(page, "/daftar-akun challenged 390x844")
  await page.getByLabel("Email").focus()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "Verifikasi manusia" })).toBeFocused()
  // Email → OTP keeps the one widget (never re-rendered); when the next reset asks for interaction, the challenge sits
  // between the code and `Verifikasi`, in Tab order too.
  await page.route("**/api/app/auth/signup/request", (r) => r.fulfill({ json: { ok: true, data: { otpId: "otp-e2e-stub" } } }))
  await page.goto(`${APP}/daftar-akun?challenge=late`)
  await page.getByLabel("Email").fill(uniqueEmail("e2e-250-otp"))
  await expect(page.getByRole("button", { name: "Kirim Kode" })).toBeEnabled()
  await page.getByRole("button", { name: "Kirim Kode" }).click()
  await page.getByLabel("Kode verifikasi").fill("123456")
  await expect(page.getByRole("button", { name: "Verifikasi manusia" })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __tsRenders: number }).__tsRenders)).toBe(1)
  const otpSlot = (await page.locator("[data-turnstile-slot]").boundingBox())!
  const verif = (await page.getByRole("button", { name: "Verifikasi", exact: true }).boundingBox())!
  expect(Math.round(verif.y - (otpSlot.y + otpSlot.height))).toBe(16)
  await page.getByLabel("Kode verifikasi").focus()
  for (const next of ["Verifikasi manusia", "Verifikasi", "Ganti email"]) {
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: next, exact: true })).toBeFocused()
  }
  await expect(page.getByRole("button", { name: "Kirim ulang" })).toBeDisabled()
  await page.unroute("**/api/app/auth/signup/request")
  // Widget-enabled retry: a failed sign-in resets the widget; `Masuk` waits for the fresh token.
  await page.setViewportSize(SIZES[0]!)
  await page.goto(`${APP}/masuk`)
  const masuk = page.getByRole("button", { name: "Masuk", exact: true })
  await expect(masuk).toBeEnabled()
  await page.getByLabel("Email").fill(uniqueEmail("e2e-250-retry"))
  await page.getByLabel("Kata sandi").fill("salah-sekali-9")
  await masuk.click()
  await expect(page.getByRole("alert")).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __tsResets: number }).__tsResets)).toBe(1)
  await expect(masuk).toBeDisabled()
  await expect(page.locator("[data-security-status]")).toHaveAttribute("data-state", "pending")
  await expect(masuk).toBeEnabled()
  await expect(page.locator("[data-security-status]")).toHaveAttribute("data-state", "ok")
  await fits(page, "/masuk after a failed attempt with widget")
})

// Sol R1: owner `/totp` (after the password step, aal1) gets the same studio check at the three viewports.
function totpCode(secretB32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  for (const ch of secretB32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0")
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const mac = createHmac("sha1", key).update(msg).digest()
  const off = mac[mac.length - 1]! & 0xf
  return String((mac.readUInt32BE(off) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}

test("DEC-250: owner /totp split-studio tanpa scroll di 1440, 1366 dan 390", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the three viewports are set inside this test")
  const email = uniqueEmail("e2e-250-totp")
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await request.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await request.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await request.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Admin TOTP", password: "admin-e2e-kuat-250" } })
  expect((await request.post(`${OWNER}/internal/ops/bootstrap-admin`, { headers: { authorization: `Bearer ${opsToken()}`, "content-type": "application/json" }, data: { email } })).status()).toBe(201)
  await page.goto(`${OWNER}/masuk`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill("admin-e2e-kuat-250")
  await page.getByRole("button", { name: "Lanjut" }).click()
  await expect(page.getByRole("heading", { name: "Aktifkan TOTP" })).toBeVisible()
  // Sol R2: measure the fully rendered enrolment screen (QR + fallback key arrive asynchronously).
  await expect(page.getByRole("img", { name: "Kode QR pendaftaran TOTP" })).toBeVisible()
  await expect(page.locator("span.font-mono")).toBeVisible()
  for (const size of SIZES) {
    await page.setViewportSize(size)
    await fits(page, `owner /totp enrol ${size.width}x${size.height}`)
    await studio(page, `owner /totp enrol ${size.width}x${size.height}`, false)
  }
  // The code step after enrolment (recovery codes) keeps the studio too.
  const secret = (await page.locator("span.font-mono").textContent())!.trim()
  await page.getByLabel("Kode TOTP").fill(totpCode(secret))
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await expect(page.getByRole("button", { name: "Saya Sudah Menyimpan, Lanjut ke Konsol" })).toBeVisible()
  await studio(page, "owner /totp recovery codes 390x844", false)
})
