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
  await expect(page.getByRole("heading", { name: "Data Usaha", level: 2 }).last()).toBeVisible()
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
  await page.getByRole("radio", { name: /10×10 · Paket saja/ }).click()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Perubahan tersimpan.")).toBeVisible()

  await page.goto(`${APP}/akun`)
  await expect(page.getByRole("heading", { name: "Akun Saya", level: 2 })).toBeVisible()
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
