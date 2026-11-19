import { expect, test } from "./fixtures"
import { APP, lastMail, uniqueEmail } from "./helpers"

// TASK-501: a customer fills `Kirim dari Rumah` on the gerai mini-site, gets the INV QR; the counter opens that INV
// (prefilled quote), issues it under the same code; the public tracking page shows only initials.
test("Mini-site: QR dari rumah → kasir buka INV yang sama → lacak tanpa data pribadi", async ({ page, context, request }) => {
  const email = uniqueEmail("e2e-mini")
  const api = context.request
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Mini", password: "mini-e2e-kuat-123" } })
  const tenant = `m${Date.now().toString(36)}`
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: tenant, name: "Gerai Mini", connect: true } })).status()).toBe(201)
  const site = APP.replace("app.geraiexpress", `${tenant}.geraimitra`)

  await page.goto(`${site}/kirim`)
  await expect(page.getByRole("heading", { name: "Kirim dari Rumah" })).toBeVisible()
  await page.getByLabel("Nama pengirim").fill("Ibu Siti Nisa")
  await page.getByLabel("No. WhatsApp pengirim").fill("081234567890")
  await page.getByLabel("Nama penerima").fill("Rina Kartika")
  await page.getByLabel("No. HP penerima").fill("085712348821")
  await page.getByLabel("Kecamatan penerima").fill("tebet")
  await page.getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByLabel("Alamat lengkap").fill("Jl. Tebet Barat No. 14")
  await page.getByLabel("Isi paket").fill("Pakaian")
  await page.getByRole("button", { name: "Buat Kode QR" }).click()
  await expect(page).toHaveURL(/\/kirim\/[a-z0-9]{7}$/)
  const slug = page.url().split("/").pop()!
  await expect(page.getByText(`INV ${slug.toUpperCase()}`).first()).toBeVisible()

  await page.goto(`${APP}/kasir`)
  await page.getByLabel("Pindai QR pelanggan atau ketik INV").fill(`${site}/kirim/${slug}`)
  await page.getByRole("button", { name: "Buka Draf", exact: true }).click()
  await expect(page.getByText(`INV ${slug.toUpperCase()}`).first()).toBeVisible()
  // DEC-251A: the claimed destination and weight quote by themselves.
  await page.getByRole("radio", { name: /^J&T Express/ }).click()
  // The QR's sender and recipient are already on the POS (DEC-237): the counter only confirms and pays.
  await expect(page.getByText("Rina Kartika").first()).toBeVisible()

  // Issue it on the POS: the QR's INV is reused (one INV for QR, receipt and tracking).
  await page.getByRole("checkbox", { name: "Isi paket bukan barang terlarang atau berbahaya" }).check()
  await page.getByRole("button", { name: "Bayar nanti" }).click()
  await page.getByRole("button", { name: /Simpan & Cetak/ }).last().click()
  await expect(page.getByText("Resi terbit").first()).toBeVisible()
  await expect(page.getByText(`INV ${slug.toUpperCase()}`).first()).toBeVisible()
  await page.goto(`${site}/lacak?q=${slug.toUpperCase()}`)
  await expect(page.getByText("R*** K******")).toBeVisible()
  await expect(page.locator("body")).not.toContainText("Rina")
  await expect(page.locator("body")).not.toContainText("085712348821")
})

// DEC-247 §2.2/§2.4: the borderless white-label mini-site — the gerai's own logo, Buka Peta, the enabled-courier
// strip, Reguler/Kargo + P×L×T quote with courier logos, the COD field without a reload, the courier logo on /lacak,
// and Indonesian constraint validation; no console/page/CSP errors and no horizontal overflow on any viewport.
const ORIGIN_AREA = "5fc62f5df8f44b34aa4c0d8c"
const DEST_AREA = "5fc64714f8f44b34aa4cdd60"

test("Mini-site DEC-247: logo, peta, ekspedisi aktif, kargo + volume, COD tanpa muat ulang, lacak berlogo, validasi Indonesia", async ({ page, context, request }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const loaded = (sel: string) => expect.poll(() => page.locator(sel).first().evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0))).toBeGreaterThan(0)

  const api = context.request
  const email = uniqueEmail("e2e-mini2")
  const h = { origin: APP, "content-type": "application/json" }
  const { otpId } = ((await (await api.post(`${APP}/api/app/auth/signup/request`, { headers: h, data: { email, turnstileToken: "ok" } })).json()) as { data: { otpId: string } }).data
  const { ticket } = ((await (await api.post(`${APP}/api/app/auth/signup/verify`, { headers: h, data: { otpId, code: (await lastMail(request, email, "signup_otp")).code } })).json()) as { data: { ticket: string } }).data
  await api.post(`${APP}/api/app/auth/signup/complete`, { headers: h, data: { ticket, name: "Bu Berkah", password: "berkah-e2e-kuat-1" } })
  const tenant = `b${Date.now().toString(36)}`
  expect((await api.post(`${APP}/api/app/dev/seed-tenant`, { headers: h, data: { slug: tenant, name: "Gerai Berkah Jaya", connect: true } })).status()).toBe(201)
  const site = APP.replace("app.geraiexpress", `${tenant}.geraimitra`)

  // A synthetic PNG logo (rendered here), the outlet profile with a pin, and SPX switched off for this gerai.
  await page.setContent(`<div id="l" style="width:160px;height:160px;display:grid;place-items:center;background:#FDF2E9;color:#C2410C;font:800 64px system-ui">BJ</div>`)
  const png = await page.locator("#l").screenshot()
  const up = await api.post(`${APP}/api/app/media?purpose=logo`, { headers: { origin: APP, "content-type": "application/octet-stream" }, data: png })
  expect(up.status()).toBe(201)
  const logoMediaId = ((await up.json()) as { data: { id: string } }).data.id
  const profile = { name: "Gerai Berkah Jaya", areaId: ORIGIN_AREA, areaLabel: "Dago, Coblong, Kota Bandung", street: "Jl. Merdeka No. 45", whatsapp: "081234560045", openingHours: "setiap hari 08.00–21.00", logoMediaId, latitude: "-6.8915", longitude: "107.6107" }
  expect((await api.post(`${APP}/api/app/settings/profile`, { headers: h, data: profile })).status()).toBe(200)
  expect((await api.post(`${APP}/api/app/settings/couriers/spx`, { headers: h, data: { enabled: false } })).status()).toBe(200)

  // Home: the gerai's own logo, Buka Peta at the pin, the strip of its enabled couriers.
  await page.goto(`${site}/`)
  await expect(page.getByRole("heading", { level: 1, name: "Gerai Berkah Jaya" })).toBeVisible()
  await expect(page.getByAltText("Logo Gerai Berkah Jaya")).toBeVisible()
  await loaded("img.mark")
  await expect(page.getByRole("link", { name: "Buka Peta" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=-6.8915,107.6107")
  await expect(page.locator("#lokasi")).toContainText("Buka setiap hari 08.00–21.00")
  await expect(page.locator("header .brand small")).toHaveText("Coblong, Kota Bandung")
  // Owner 2026-11-18 (DEC-247B): no WhatsApp in the header; WA beside Buka Peta in the Lokasi card, and as the last,
  // secondary row of the phone menu. Desktop shows [Kirim Paket], phones [Menu].
  await expect(page.locator('header a[href*="wa.me"]')).toHaveCount(0)
  await expect(page.locator("header")).not.toContainText("WhatsApp")
  const visitWa = page.locator('#lokasi a[href^="https://wa.me/"]')
  await expect(visitWa).toHaveText("Chat WhatsApp Gerai")
  await expect(page.locator("#lokasi .acts a").first()).toHaveText("Buka Peta")
  await expect(page.locator("footer")).toContainText("Didukung jaringan resmi GeraiExpress")
  const wide = (page.viewportSize()?.width ?? 0) >= 960
  const menuBtn = page.getByRole("button", { name: "Buka menu" })
  if (wide) {
    await expect(page.locator("header").getByRole("link", { name: "Kirim Paket" })).toBeVisible()
    await expect(menuBtn).toBeHidden()
    await expect(page.locator("header nav.tabs")).toBeVisible()
  } else {
    await expect(page.locator("header").getByRole("link", { name: "Kirim Paket" })).toBeHidden()
    const menu = page.locator("#mnav")
    await expect(menu).toBeHidden()
    await menuBtn.click()
    await expect(menu).toBeVisible()
    await expect(page.getByRole("button", { name: "Tutup menu" })).toHaveAttribute("aria-expanded", "true")
    await expect(menu.getByRole("link", { name: /^Lacak Paket/ })).toBeVisible()
    const last = menu.locator("a").last()
    await expect(last).toHaveClass("mwa")
    await expect(last).toHaveAttribute("href", "https://wa.me/6281234560045")
    await expect(last).toBeVisible()
    expect(await overflow()).toBe(0)
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    // Sol R1 P2: the trigger is exposed as a button, so Space opens and closes it too (no page scroll).
    await expect(menuBtn).toBeFocused()
    const y = await page.evaluate(() => scrollY)
    await page.keyboard.press(" ")
    await expect(menu).toBeVisible()
    await expect(page.getByRole("button", { name: "Tutup menu" })).toHaveAttribute("aria-expanded", "true")
    await page.getByRole("button", { name: "Tutup menu" }).focus()
    await page.keyboard.press(" ")
    await expect(menu).toBeHidden()
    expect(await page.evaluate(() => scrollY)).toBe(y)
  }
  expect(await page.locator('link[rel="icon"]').getAttribute("href")).toMatch(/^data:image\/svg\+xml,.*%3EG%3C%2Ftext%3E/)
  const strip = page.locator("ul.strip img")
  await expect(strip).toHaveCount(8)
  await expect(page.locator('ul.strip img[src="/couriers/spx.svg"]')).toHaveCount(0)
  await strip.last().scrollIntoViewIfNeeded()
  for (const src of await strip.evaluateAll((els) => els.map((i) => (i as HTMLImageElement).getAttribute("src")))) await loaded(`ul.strip img[src="${src}"]`)
  expect(await overflow()).toBe(0)

  // DEC-250: no raw <select> left on the public mini-site; `Satuan` is a gram | kg pill toggle (gram by default).
  await expect(page.locator("select")).toHaveCount(0)
  await expect(page.getByRole("group", { name: "Satuan" }).getByRole("radio", { name: "gram", exact: true })).toBeChecked()
  // Sol R1: forced colors keep a persistent selected indicator (system colors), not just author colors.
  await page.emulateMedia({ forcedColors: "active" })
  const picked = await page.locator(".seg.unit label:has(input:checked)").evaluate((el) => { const c = getComputedStyle(el); return [c.outlineStyle, c.outlineWidth] })
  expect(picked).toEqual(["solid", "3px"])
  const other = await page.locator(".seg.unit label:not(:has(input:checked))").evaluate((el) => getComputedStyle(el).outlineWidth)
  expect(other).toBe("1px")
  // Sol R2: Tab into the checked radio shows a distinct outer focus ring; Tab out keeps the selection indicator.
  const pickedLabel = page.locator(".seg.unit label:has(input:checked)")
  const ring = () => pickedLabel.evaluate((el) => { const c = getComputedStyle(el); return [c.outlineStyle, c.outlineWidth, c.outlineOffset, c.backgroundColor] })
  const idle = await ring()
  await page.getByLabel("Berat paket").focus()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("radio", { name: "gram", exact: true })).toBeFocused()
  const focused = await ring()
  expect(focused.slice(0, 3)).toEqual(["solid", "2px", "3px"])
  expect(focused[3]).toBe(idle[3])
  await page.keyboard.press("Tab")
  await expect(page.getByRole("radio", { name: "gram", exact: true })).not.toBeFocused()
  expect(await ring()).toEqual(idle)
  await page.emulateMedia({ forcedColors: "none" })
  // Cek Ongkir: Kargo with P×L×T (≥ 5 kg), then Reguler billed by volume — courier logos on every row.
  await page.getByLabel("Kecamatan tujuan").fill("tebet")
  await page.getByRole("button", { name: /Tebet Barat/ }).click()
  await page.getByLabel("Berat paket").fill("6")
  await page.getByRole("radio", { name: "kg", exact: true }).check()
  await page.getByLabel("Panjang (cm)").fill("40")
  await page.getByLabel("Lebar (cm)").fill("30")
  await page.getByLabel("Tinggi (cm)").fill("20")
  await page.getByLabel("Kargo (mulai 5 kg, Non-COD)").check()
  await page.getByRole("button", { name: "Hitung Ongkir" }).click()
  await expect(page.getByRole("heading", { name: /^Ongkir Kargo ke Tebet Barat/ })).toBeVisible()
  await expect(page.locator(".rates li").first()).toContainText("Cargo")
  await loaded(".rates .clogo img")
  expect(await overflow()).toBe(0)
  await page.getByLabel("Reguler").check()
  await page.getByLabel("Berat paket").fill("1")
  await page.getByLabel("Panjang (cm)").fill("50")
  await page.getByLabel("Lebar (cm)").fill("40")
  await page.getByLabel("Tinggi (cm)").fill("30")
  await page.getByRole("button", { name: "Hitung Ongkir" }).click()
  await expect(page.getByRole("heading", { name: /^Ongkir Reguler ke Tebet Barat/ })).toBeVisible()
  await expect(page.getByText(/dihitung \d+ kg/).first()).toBeVisible()
  // J&T Express and J&T ECO both carry the J&T logo.
  await expect(page.locator('.rates img[src="/couriers/jt.svg"]').first()).toBeVisible()
  expect(await overflow()).toBe(0)
  // DEC-251D: `Isi Alamat dari Rumah` carries the district and the weight into the pre-booking form.
  const actual = await page.locator("#weight").inputValue()
  await page.getByRole("link", { name: "Isi Alamat dari Rumah" }).click()
  await expect(page).toHaveURL(/\/kirim\?destId=[0-9a-f]{24}&destLabel=.+&weight=\d+$/)
  await expect(page.locator("#recipientText")).toHaveValue(/Tebet Barat/)
  await expect(page.locator("#recipientId")).toHaveValue(/^[0-9a-f]{24}$/)
  expect(await page.locator("#weight").inputValue()).toBe(String(Math.round(Number(actual.replace(",", ".")) * 1000)))
  expect(await overflow()).toBe(0)

  // Indonesian constraint validation on Cek Ongkir: an empty Kecamatan never shows the browser's English bubble.
  await page.goto(`${site}/`)
  await page.getByRole("button", { name: "Hitung Ongkir" }).click()
  expect(await page.locator("#destText").evaluate((i: HTMLInputElement) => i.validationMessage)).toBe("Kolom Kecamatan tujuan wajib diisi.")
  await page.getByLabel("Berat paket").fill("satu")
  expect(await page.locator("#weight").evaluate((i: HTMLInputElement) => (i.reportValidity(), i.validationMessage))).toBe("Isi berat dengan angka, contoh 1000 atau 1,5.")
  await expect(page).toHaveURL(`${site}/`)

  // Kirim dari Rumah: empty submit → Indonesian message on the first field; too short → Indonesian minimum.
  await page.goto(`${site}/kirim`)
  await page.getByRole("button", { name: "Buat Kode QR" }).click()
  expect(await page.locator("#senderName").evaluate((i: HTMLInputElement) => i.validationMessage)).toBe("Kolom Nama pengirim wajib diisi.")
  await page.getByLabel("Isi paket").fill("ab")
  expect(await page.locator("#content").evaluate((i: HTMLInputElement) => (i.reportValidity(), i.validationMessage))).toBe("Minimal 3 karakter.")
  await expect(page).toHaveURL(`${site}/kirim`)

  // /kirim: COD reveals the goods price at once, without a reload; Non-COD hides it again.
  await page.goto(`${site}/kirim`)
  const cod = page.getByLabel("Harga barang COD (Rp)")
  await expect(cod).toBeHidden()
  await page.evaluate(() => ((window as unknown as { __same: number }).__same = 1))
  await page.getByLabel("COD (bayar di tempat)").check()
  await expect(cod).toBeVisible()
  await cod.fill("150000")
  expect(await page.evaluate(() => (window as unknown as { __same?: number }).__same)).toBe(1)
  await page.getByLabel("Non-COD").check()
  await expect(cod).toBeHidden()
  expect(await overflow()).toBe(0)

  // /lacak: an empty required search never shows the browser's English bubble.
  await page.goto(`${site}/lacak`)
  await page.getByRole("button", { name: "Lacak", exact: true }).click()
  expect(await page.locator("#q").evaluate((i: HTMLInputElement) => i.validationMessage)).toBe("Kolom Nomor INV atau resi wajib diisi.")
  await expect(page).toHaveURL(`${site}/lacak`)
  await page.locator("#q").fill("X")
  expect(await page.locator("#q").evaluate((i: HTMLInputElement) => i.validationMessage)).toBe("")
  // Sol R1 P2: ownership follows the setter — the page's own error with the net's exact words survives typing.
  expect(
    await page.locator("#q").evaluate((i: HTMLInputElement) => {
      i.value = ""
      i.form!.reportValidity()
      const ours = i.validationMessage
      i.setCustomValidity(ours)
      i.value = "INV1234"
      i.dispatchEvent(new Event("input", { bubbles: true }))
      const kept = i.validationMessage
      i.setCustomValidity("")
      return [ours, kept]
    }),
  ).toEqual(["Kolom Nomor INV atau resi wajib diisi.", "Kolom Nomor INV atau resi wajib diisi."])

  // An issued J&T INV (QR draft → counter API): /lacak shows the courier logo beside the privacy-safe stepper.
  const draft = await request.post(`${site}/kirim`, { form: { cod: "0", senderName: "Ibu Siti Nisa", senderPhone: "081234567890", recipientName: "Rina Kartika", recipientPhone: "085799998821", recipientId: DEST_AREA, recipientLabel: "Tebet Barat, Tebet, Jakarta Selatan, DKI Jakarta", recipientStreet: "Jl. Tebet Barat No. 14", content: "Pakaian", weight: "1000", "cf-turnstile-response": "dev-token" }, maxRedirects: 0 })
  expect(draft.status()).toBe(303)
  const slug = draft.headers().location!.split("/").pop()!
  const claim = ((await (await api.post(`${APP}/api/app/minisite-drafts/${slug}/claim`, { headers: h, data: {} })).json()) as { data: { senderId: string; recipientId: string } }).data
  expect((await api.post(`${APP}/api/app/quotes/freeze`, { headers: h, data: { slug, destinationAreaId: DEST_AREA, weightGram: 1000, mode: "none", serviceCode: "JT" } })).status()).toBe(201)
  await api.post(`${APP}/api/app/contacts/senders/${claim.senderId}/verify-wa`, { headers: h, data: {} })
  expect((await api.post(`${APP}/api/app/shipments/${slug}/parties`, { headers: h, data: { senderId: claim.senderId, recipientId: claim.recipientId, content: "Pakaian", prohibitedAck: true } })).status()).toBe(200)
  expect((await api.post(`${APP}/api/app/shipments/${slug}/dispatch`, { headers: h, data: {} })).ok()).toBe(true)
  await page.goto(`${site}/lacak?q=${slug.toUpperCase()}`)
  await expect(page.locator(".trk")).toContainText("J&T Express")
  await expect(page.locator('.trk img[src="/couriers/jt.svg"]')).toBeVisible()
  await loaded(".trk img")
  await expect(page.getByRole("list", { name: "Tahap pengiriman" })).toBeVisible()
  await expect(page.locator("body")).not.toContainText("Rina")
  // The Lokasi card's WA asks about this INV; still nothing in the header.
  await expect(page.locator('#lokasi a[href^="https://wa.me/"]')).toHaveAttribute("href", /text=Halo%20Gerai%20Berkah%20Jaya/)
  await expect(page.locator('header a[href*="wa.me"]')).toHaveCount(0)
  expect(await overflow()).toBe(0)
  expect(errors).toEqual([])
})
