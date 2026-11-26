import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

test.describe("TASK-105 accounts", () => {
  test("sign up with email OTP, log out, log in, reset password", async ({ page, request }) => {
    const email = uniqueEmail("e2e-owner")
    await page.goto(`${APP}/daftar-akun`)
    await expect(page.getByRole("heading", { name: "Buat akun pemilik" })).toBeVisible()
    await page.getByLabel("Email").fill(email)
    await page.getByRole("button", { name: "Kirim Kode" }).click()
    await expect(page.getByText("Kode dikirim ke")).toBeVisible()
    const { code } = await lastMail(request, email, "signup_otp")
    await page.getByLabel("Kode verifikasi").fill(code)
    await page.getByRole("button", { name: "Verifikasi" }).click()
    await page.getByLabel("Nama lengkap").fill("Ani Lestari")
    await page.getByLabel("Kata sandi").fill("sandi-e2e-kuat-1")
    await page.getByRole("button", { name: "Buat Akun" }).click()
    // The account step continues into the outlet application (TASK-203).
    // DEC-250 wizard bar (`Langkah 2 / 3`); the step names stay in the list for assistive technology.
    await expect(page.getByRole("list", { name: "Tahap pendaftaran" }).locator('[aria-current="step"]')).toHaveText("2 · Gerai")
    // No gerai yet → the workspace sends the applicant to the application status page.
    await page.goto(`${APP}/`)
    await expect(page).toHaveURL(/\/daftar\/status$/)
    await expect(page.getByRole("heading", { name: "Status Pengajuan" })).toBeVisible()

    await page.getByRole("button", { name: "Keluar" }).click()
    await expect(page).toHaveURL(/\/masuk$/)
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Kata sandi").fill("salah-sekali-9")
    await page.getByRole("button", { name: "Masuk" }).click()
    await expect(page.getByRole("alert")).toHaveText("Email atau kata sandi salah.")
    await page.getByLabel("Kata sandi").fill("sandi-e2e-kuat-1")
    await page.getByRole("button", { name: "Masuk" }).click()
    await expect(page.getByRole("heading", { name: "Status Pengajuan" })).toBeVisible()

    await page.getByRole("button", { name: "Keluar" }).click()
    await page.getByRole("link", { name: "Lupa kata sandi?" }).click()
    await expect(page.getByRole("heading", { name: "Atur Ulang Kata Sandi" })).toBeVisible()
    await page.getByLabel("Email").fill(email)
    await page.getByRole("button", { name: "Kirim Tautan" }).click()
    await expect(page.getByText("Jika email terdaftar")).toBeVisible()
    const { link } = await lastMail(request, email, "password_reset")
    await page.goto(link)
    await page.getByLabel("Kata sandi baru", { exact: true }).fill("sandi-baru-e2e-2")
    await page.getByLabel("Ulangi kata sandi baru").fill("sandi-baru-e2e-2")
    await page.getByRole("button", { name: "Simpan" }).click()
    await expect(page.getByText("Kata sandi sudah diganti")).toBeVisible()
    // The reset link is single use.
    await page.goto(link)
    await page.getByLabel("Kata sandi baru", { exact: true }).fill("sandi-baru-e2e-3")
    await page.getByLabel("Ulangi kata sandi baru").fill("sandi-baru-e2e-3")
    await page.getByRole("button", { name: "Simpan" }).click()
    await expect(page.getByRole("alert")).toContainText("tidak berlaku atau sudah dipakai")
  })

  test("invitation acceptance creates a Kasir account once", async ({ page, request, context }) => {
    // Owner signs up through the API and gets a tenant by the local seed endpoint-free path: drive the UI only for the invitee.
    const ownerEmail = uniqueEmail("e2e-inviter")
    const api = context.request
    const origin = { origin: APP, "content-type": "application/json" }
    const r1 = await api.post(`${APP}/api/app/auth/signup/request`, { headers: origin, data: { email: ownerEmail, turnstileToken: "ok" } })
    const { otpId } = ((await r1.json()) as { data: { otpId: string } }).data
    const { code } = await lastMail(request, ownerEmail, "signup_otp")
    const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: origin, data: { otpId, code } })).json()) as { data: { ticket: string } }).data
    expect((await api.post(`${APP}/api/app/auth/signup/complete`, { headers: origin, data: { ticket, name: "Pak Budi", password: "pemilik-kuat-12" } })).status()).toBe(201)
    const seed = await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: origin, data: { slug: `e2e${Date.now().toString(36)}`, name: "Toko E2E" } })
    expect(seed.status()).toBe(201)
    const kasirEmail = uniqueEmail("e2e-kasir")
    expect((await api.post(`${APP}/api/app/members/invitations`, { headers: origin, data: { email: kasirEmail } })).status()).toBe(201)
    const { link } = await lastMail(request, kasirEmail, "kasir_invite")
    await context.clearCookies()
    await page.goto(link)
    await expect(page.getByRole("heading", { name: "Gabung sebagai Kasir" })).toBeVisible()
    await expect(page.getByText("Toko E2E")).toBeVisible()
    await page.getByLabel("Nama lengkap").fill("Sari Kasir")
    await page.getByLabel("Buat kata sandi").fill("kasir-e2e-kuat-1")
    await page.getByRole("button", { name: "Buat Akun" }).click()
    // The Kasir lands in the workspace: Kasir home, no Keuangan menu.
    await expect(page.getByRole("heading", { name: "Tugas Loket Hari Ini" })).toBeVisible()
    if ((page.viewportSize()?.width ?? 0) >= 768) await expect(page.locator("[data-slot=sidebar]").getByText("Toko E2E", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Keuangan" })).toHaveCount(0)
    await context.clearCookies()
    await page.goto(link)
    await expect(page.getByRole("alert")).toContainText("Undangan tidak berlaku")
  })
})
