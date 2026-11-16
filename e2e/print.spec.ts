import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-306: issued INV → print drawer → exact-size PDF requested and recorded → reprint needs a reason;
// Cetak Resi Massal lists the INV under Sudah Cetak afterwards.
test("Cetak: drawer, PDF, cetak ulang dengan alasan, cetak massal", async ({ page, context, request }, info) => {
  test.skip(info.project.name === "phone-390", "drawer flow on tablet/desktop; phone covered by gates")
  const email = uniqueEmail("e2e-cetak")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Cetak", password: "cetak-e2e-kuat-1" } })
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: `p${Date.now().toString(36)}`, name: "Gerai Cetak", connect: true } })).status()).toBe(201)
  const s = ((await (await api.post(`${APP}/api/app/contacts/senders`, { headers: h, data: { name: "Ibu Siti", phone: "081234567890" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const r = ((await (await api.post(`${APP}/api/app/contacts/recipients`, { headers: h, data: { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: "5fc64714f8f44b34aa4cdd60", areaLabel: "Tebet Barat, Tebet, Jakarta Selatan" } })).json()) as { data: { item: { id: string } } }).data.item.id
  const slug = ((await (await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { destinationAreaId: "5fc64714f8f44b34aa4cdd60", weightGram: 1000, mode: "none", serviceCode: "JT" } })).json()) as { data: { slug: string } }).data.slug
  await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: s, recipientId: r, content: "Pakaian", prohibitedAck: true } })
  await api.post(`${APP}/api/app/shipments/${slug}/payment`, { headers: { ...h, "idempotency-key": `e2e${slug}pay01` }, data: { method: "qris" } })
  expect((await api.post(`${APP}/api/app/shipments/${slug}/dispatch`, { headers: h, data: {} })).status()).toBe(200)

  await page.goto(`${APP}/kiriman/${slug}`)
  await page.getByRole("button", { name: "Cetak Label" }).click()
  await expect(page.getByText("Pakai kertas thermal 100×150 mm")).toBeVisible()
  await expect(page.getByTitle("Pratinjau label")).toBeVisible()
  // Headless Chrome cannot open the system print dialog; stub it so the click completes, then check the record.
  await page.evaluate(() => {
    window.print = () => undefined
    HTMLIFrameElement.prototype.focus = () => undefined
  })
  await page.getByRole("button", { name: "Buka PDF / Cetak Sistem" }).click()
  await expect.poll(async () => ((await (await api.get(`${APP}/api/app/shipments/${slug}`)).json()) as { data: { shipment: { print_count: number } } }).data.shipment.print_count).toBe(1)
  // The drawer itself switches to reprint mode (duplicate guard) right away.
  await expect(page.getByRole("button", { name: "Cetak Ulang", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Tutup" }).click()
  await expect(page.getByRole("button", { name: /Cetak Ulang Label \(sudah dicetak 1×/ })).toBeVisible()
  await page.getByRole("button", { name: /Cetak Ulang Label/ }).click()
  await page.getByLabel("Alasan cetak ulang (dicatat)").fill("label sobek")
  await expect(page.getByRole("button", { name: "Cetak Ulang", exact: true })).toBeEnabled()

  await page.goto(`${APP}/kiriman/cetak-massal`)
  await page.getByRole("button", { name: "Sudah Cetak" }).click()
  await expect(page.getByText(`INV ${slug.toUpperCase()}`)).toBeVisible()
})
