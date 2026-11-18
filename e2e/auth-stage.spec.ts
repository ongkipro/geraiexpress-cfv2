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
  await page.getByLabel("Email untuk akun Mengantar").fill(`seller-${Date.now().toString(36)}@contoh.test`)
  await page.getByRole("button", { name: "Lanjut ke Titik Jemput" }).click()
  await expect(page.getByRole("list", { name: "Tahap pendaftaran" }).locator('[aria-current="step"]')).toHaveText("3 · Titik Jemput")
  await expect(page.getByLabel("HP PIC")).toHaveValue("081234560000")
  for (const size of SIZES) {
    await page.setViewportSize(size)
    await fits(page, `tahap 3 ${size.width}x${size.height}`)
  }
  // The area results float over the form: they never grow the page.
  await page.getByLabel("Cari kelurahan / kecamatan / kode pos").fill("coblong")
  await expect(page.getByRole("list", { name: "Hasil pencarian wilayah" })).toBeVisible()
  await fits(page, "tahap 3 with area results 390x844")
  await page.getByRole("button", { name: /Dago, Coblong/ }).click()
  await expect(page.getByRole("button", { name: "Ajukan Gerai" })).toBeDisabled()
  await page.getByRole("button", { name: "← Kembali" }).click()
  await expect(page.getByLabel("Nama gerai")).toHaveValue("Toko Uji Satu")
  expect(errors).toEqual([])
})
