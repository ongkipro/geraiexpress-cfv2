import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-305: owner enables Dropship Toko in Label & Privasi → checkout shows the printed preview with the reseller brand
// → issued INV keeps the true sender behind `Lihat Pengirim Asli` (reason required).
test("Masking: Label & Privasi → Dropship Toko di kasir → lihat pengirim asli", async ({ page, context, request }, info) => {
  test.skip(info.project.name === "phone-390", "settings flow covered on tablet/desktop; phone covered by UI gates")
  const email = uniqueEmail("e2e-mask")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Mask", password: "mask-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `m${Date.now().toString(36)}`, name: "Gerai Mask", connect: true, masking: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti Nisa", phone: "081234567890", senderKind: "reseller_dropship", brandName: "TOKO HIJAB NISA" } })).json()) as { data: { item: { id: string } } }).data.item.id
  await api.post(`${APP}/api/app/contacts/senders/${s}/verify-wa`, { headers: h, data: {} })
  await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat" } })

  await page.goto(`${APP}/pengaturan/label-privasi`)
  await page.getByText("Aktifkan masking label").click()
  await page.getByText("Dropship Toko", { exact: true }).click()
  await page.getByRole("radio", { name: "Dropship Toko" }).click()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page.getByText("Pengaturan label tersimpan.")).toBeVisible()

  const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" } })).json()) as { data: { slug: string } }).data.slug
  await page.goto(`${APP}/kiriman/${slug}`)
  await page.getByRole("list", { name: "Pilihan pengirim" }).getByRole("button", { name: /TOKO HIJAB NISA/ }).click()
  await page.getByRole("list", { name: "Pilihan penerima" }).getByRole("button", { name: /Rina Kartika/ }).click()
  await expect(page.getByRole("radio", { name: /Dropship Toko/ })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByText("Tercetak di label:").locator("..")).toContainText("TOKO HIJAB NISA")
  await page.getByLabel("Isi paket", { exact: true }).fill("Pakaian")
  await page.getByLabel("Isi paket bukan barang terlarang atau berbahaya").check()
  await page.getByRole("button", { name: /Tandai Lunas & Cetak · Rp/ }).click()
  await expect(page.getByText("Resi terbit").first()).toBeVisible()
  await page.getByRole("button", { name: "Lihat Pengirim Asli" }).click()
  await page.getByLabel("Alasan membuka data pengirim asli (dicatat)").fill("paket retur, hubungi pengirim")
  await page.getByRole("button", { name: "Buka", exact: true }).click()
  await expect(page.getByText("Pengirim asli:")).toContainText("Ibu Siti Nisa")
})
