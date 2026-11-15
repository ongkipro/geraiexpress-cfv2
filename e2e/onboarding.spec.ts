import { expect, test } from "./fixtures"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { APP, OWNER, lastMail, uniqueEmail } from "./helpers"

const opsToken = () => (readFileSync(".dev.vars", "utf8").match(/^OPS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2")
function totp(secretB32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  for (const c of secretB32) bits += alphabet.indexOf(c).toString(2).padStart(5, "0")
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const mac = createHmac("sha1", key).update(counter).digest()
  const off = mac[mac.length - 1]! & 15
  return String((mac.readUInt32BE(off) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}

// Approvals need ≥ 768 px (visual 07 §2); the applicant side runs at every width.
test("TASK-203 apply (account → data gerai → titik jemput → ringkasan) → Super Admin approves → seller connected", async ({ page, browser, request, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1280, "approval flow: desktop project (single bootstrap per environment)")
  const email = uniqueEmail("e2e-apply")
  const slug = `e2e${Date.now().toString(36)}`
  await page.goto(`${APP}/daftar-akun`)
  await page.getByLabel("Email").fill(email)
  await page.getByRole("button", { name: "Kirim Kode" }).click()
  await page.getByLabel("Kode verifikasi").fill((await lastMail(request, email, "signup_otp")).code!)
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await page.getByLabel("Nama lengkap").fill("Bu Rina")
  await page.getByLabel("Kata sandi").fill("pemilik-e2e-kuat-1")
  await page.getByRole("button", { name: "Buat Akun" }).click()
  await page.getByLabel("Nama gerai").fill("Toko Uji Coba")
  await page.getByLabel("Alamat gerai").fill(slug)
  await page.getByLabel("WhatsApp gerai").fill("081234560000")
  await page.getByLabel("Email untuk akun Mengantar").fill(`seller-${slug}@contoh.test`)
  await page.getByRole("button", { name: "Lanjut" }).click()
  await page.getByLabel("Cari kelurahan / kecamatan / kode pos").fill("coblong")
  await page.getByRole("button", { name: /Dago, Coblong/ }).click()
  await page.getByLabel("Alamat lengkap titik jemput").fill("Jl. Uji No. 1")
  await page.getByLabel("Nama penanggung jawab").fill("Bu Rina")
  await page.getByLabel("HP penanggung jawab").fill("081234560000")
  await page.getByRole("button", { name: "Lanjut" }).click()
  await page.getByRole("checkbox").check()
  await page.getByRole("button", { name: "Kirim Pengajuan" }).click()
  await expect(page.getByRole("heading", { name: "Status Pengajuan" })).toBeVisible()

  // Super Admin (first admin bootstrap in this fresh state, or reuse when another test bootstrapped already).
  const adminEmail = uniqueEmail("e2e-sa")
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await request.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email: adminEmail, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await request.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, adminEmail, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await request.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Admin Dua", password: "admin-e2e-kuat-2" } })
  const boot = await request.post(`${OWNER}/internal/ops/bootstrap-admin`, { headers: { authorization: `Bearer ${opsToken()}`, "content-type": "application/json" }, data: { email: adminEmail } })
  expect(boot.status()).toBe(201)
  const ctx = await browser.newContext()
  const admin = await ctx.newPage()
  await admin.goto(`${OWNER}/masuk`)
  await admin.getByLabel("Email").fill(adminEmail)
  await admin.getByLabel("Kata sandi").fill("admin-e2e-kuat-2")
  await admin.getByRole("button", { name: "Lanjut" }).click()
  const secret = (await admin.locator("span.font-mono").textContent())!.trim()
  await admin.getByLabel("Kode TOTP").fill(totp(secret))
  await admin.getByRole("button", { name: "Verifikasi" }).click()
  await admin.getByRole("link", { name: "Gerai" }).first().click()
  await admin.getByRole("link", { name: "Toko Uji Coba" }).click()
  await admin.getByRole("button", { name: "Setujui & Buka Akun Seller Mengantar" }).click()
  await admin.getByLabel("Alasan (wajib, dicatat di log audit)").fill("data lengkap dan valid")
  await admin.getByRole("button", { name: "Setujui sekarang" }).click()
  await expect(admin.getByText("Disetujui")).toBeVisible()
  await admin.goto(`${OWNER}/gerai/${slug}`)
  await expect(admin.getByText("Terhubung", { exact: true })).toBeVisible()
  await ctx.close()

  // Mini-site is live without a redeploy (PR-03).
  const site = await request.get(`http://${slug}.gerai.localhost:${new URL(APP).port}/`)
  expect(site.status()).toBe(200)
  await page.reload()
  await expect(page.getByText("Akun Mengantar")).toBeVisible()
})
