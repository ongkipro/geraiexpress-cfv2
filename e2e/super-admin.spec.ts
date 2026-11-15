import { expect, test } from "./fixtures"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { APP, OWNER, lastMail, uniqueEmail } from "./helpers"

// Bootstrap happens once per environment, so this flow runs in the desktop project (approvals and admin access need
// ≥ 768 px, visual 07 §2); the owner screens' 390 px rendering is covered by the UI gates.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "single bootstrap per environment: desktop project only")

// RFC 6238 code from a base32 secret (test-side authenticator).
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

const opsToken = () => (readFileSync(".dev.vars", "utf8").match(/^OPS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2")

test("TASK-106 Super Admin: password → enrol TOTP (QR once) → console; wrong code refused", async ({ page, request }) => {
  const email = uniqueEmail("e2e-admin")
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await request.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { code } = await lastMail(request, email, "signup_otp")
  const { ticket } = ((await (await request.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code } })).json()) as { data: { ticket: string } }).data
  await request.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Admin Satu", password: "admin-e2e-kuat-1" } })
  const boot = await request.post(`${OWNER}/internal/ops/bootstrap-admin`, { headers: { authorization: `Bearer ${opsToken()}`, "content-type": "application/json" }, data: { email } })
  // First-admin bootstrap succeeds once per fresh local state (whichever desktop spec runs first).
  expect(boot.status()).toBe(201)

  await page.goto(`${OWNER}/masuk`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill("admin-e2e-kuat-1")
  await page.getByRole("button", { name: "Lanjut" }).click()
  await expect(page.getByRole("heading", { name: "Aktifkan TOTP" })).toBeVisible()
  await expect(page.getByRole("img", { name: "Kode QR pendaftaran TOTP" })).toBeVisible()
  const secret = (await page.locator("span.font-mono").textContent())!.trim()
  await page.getByLabel("Kode TOTP").fill("000000")
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await expect(page.getByRole("alert")).toHaveText("Kode TOTP salah atau sudah dipakai.")
  await page.getByLabel("Kode TOTP").fill(totp(secret))
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await expect(page.getByRole("heading", { name: "Ringkasan" }).first()).toBeVisible()
  // The app cookie never opens the owner console and vice versa.
  const r = await page.request.get(`${APP}/api/app/auth/me`)
  expect(r.status()).toBe(401)
})
