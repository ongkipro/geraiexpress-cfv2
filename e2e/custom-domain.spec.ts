import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-505: Pengaturan › Mini-Site › Domain Sendiri on the local Cloudflare fake — add a root domain (www twin),
// see the DNS records (CNAME to cname.<zone>, ownership TXT), Periksa Lagi, and remove with a typed confirmation.
test("Domain Sendiri: tambah, lihat record DNS, periksa lagi, hapus", async ({ page, context, request }, info) => {
  const email = uniqueEmail("e2e-domain")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Domain", password: "domain-e2e-kuat-1" } })
  const slug = `d${Date.now().toString(36)}`
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug, name: "Gerai Domain", connect: true, pro: true } })).status()).toBe(201)

  const domain = `${slug}-${info.project.name.replace(/[^a-z0-9]/g, "")}.id`
  await page.goto(`${APP}/pengaturan/mini-site`)
  await expect(page.getByRole("heading", { name: "Mini-Site", level: 2 }).last()).toBeVisible()
  await page.getByLabel("Domain").fill(domain)
  await expect(page.getByRole("radio", { name: new RegExp(`^${domain.replace(".", "\\.")} \\(www`) })).toHaveAttribute("aria-checked", "true")
  await page.getByRole("button", { name: "Tambah Domain" }).click()
  await expect(page.getByText("Domain didaftarkan. Pasang record DNS di bawah.")).toBeVisible()
  await expect(page.getByText("Menunggu DNS").first()).toBeVisible()
  await expect(page.getByText(`diarahkan ke ${domain}`)).toBeVisible()
  await expect(page.locator("code:visible", { hasText: "cname.geraimitra.localhost" }).first()).toBeVisible()
  // The queue creates the hostname at the (fake) Cloudflare; Periksa Lagi shows the ownership TXT.
  await expect(async () => {
    await page.getByRole("button", { name: "Periksa Lagi" }).click()
    await expect(page.locator("code:visible", { hasText: `_cf-custom-hostname.${domain}` }).first()).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 20_000 })
  // Evidence shots only on request (GX_EVIDENCE=1), so a gate run never rewrites tracked files.
  if (process.env.GX_EVIDENCE) await page.screenshot({ path: `docs/evidence/TASK-505/domain-e2e-${info.project.name}.png`, fullPage: true })

  await page.getByRole("button", { name: "Hapus Domain" }).click()
  await page.getByLabel(`Ketik ${domain} untuk konfirmasi`).fill("salah.id")
  await expect(page.getByRole("button", { name: "Ya, Hapus Domain" })).toBeDisabled()
  await page.getByLabel(`Ketik ${domain} untuk konfirmasi`).fill(domain)
  await page.getByRole("button", { name: "Ya, Hapus Domain" }).click()
  await expect(page.getByText("Domain dihapus. Mini-site kembali memakai alamat bawaan.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Tambah Domain" })).toBeVisible()
})
