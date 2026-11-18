// TASK-701 Layar Pelanggan (PR-22, spec 03 §5): a counter member pairs a display; the display reads a server-built,
// zero-leak state without any session cookie; re-pair, unpair, expiry and the bound shift's close end the pairing;
// the token works only with its own gerai; the outlet QRIS is an owner-only upload.
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { appUser } from "../onboarding/helpers"
import { APP, appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"
import { vaultFor } from "../../src/do/gerai-vault/stub"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Pair = { pairUrl: string; token: string; pairId: string; expiresAt: number; shiftBound: boolean; qrSvg: string }
type View = {
  pairId: string
  state: Record<string, unknown> & { kind: string }
  updatedAt: number
  outlet: { name: string; logoUrl: string | null; qrisUrl: string | null }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const data = async <T>(r: Response) => ((await r.json()) as { data: T }).data
const errorOf = async (r: Response) => ((await r.json()) as { error: { code: string; message: string } }).error

async function pair(cookie: string): Promise<Pair> {
  const r = await post("/customer-display/pair", cookie, {})
  expect(r.status).toBe(201)
  return data<Pair>(r)
}
/** The paired device: no cookie at all (a phone that never signed in). */
const view = (gerai: string, kode: string, headers: Record<string, string> = {}) =>
  exports.default.fetch(`${APP}/api/app/customer-display/view?gerai=${encodeURIComponent(gerai)}&kode=${encodeURIComponent(kode)}`, { headers })
const kodeOf = (p: Pair) => new URL(p.pairUrl).searchParams.get("kode")!

async function cashier(tenantId: string, email: string) {
  const k = await appUser(email)
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(tenantId, k.id, Date.now()),
    env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(tenantId, k.id),
  ])
  return k
}

// Sol R1 F1: the counter names ids (service, area); the server supplies every display text.
const TEBET_BARAT = "5fc64714f8f44b34aa4cdd60"
const TEBET_LABEL = "Tebet Barat, Tebet, Jakarta Selatan, DKI Jakarta"
const CHECKOUT = {
  kind: "checkout",
  serviceCode: "JT",
  eta: "2 - 3 hari",
  billableWeightGram: 1000,
  destinationAreaId: TEBET_BARAT,
  destinationLabel: "Tebet Barat",
  method: "qris",
  lines: [
    { kind: "ongkir", amountIdr: 12500 },
    { kind: "packing", amountIdr: 3000 },
  ],
  totalIdr: 15500,
}

describe("Layar Pelanggan pairing and view", () => {
  it("pair → cookie-less view (idle) → checkout lines and total → paid from the tenant object → idle after 20 s; zero leak", async () => {
    const t = await checkoutGerai("layarsatu")
    const p = await pair(t.cookie)
    // The raw token is returned once, inside the pairing URL; only its SHA-256 is stored.
    expect(p.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(p.pairUrl).toBe(`${APP}/kasir/layar-pelanggan?gerai=layarsatu&kode=${p.token}`)
    expect(p.qrSvg.startsWith("<svg")).toBe(true)
    expect(p.shiftBound).toBe(false)
    expect(p.expiresAt - Date.now()).toBeGreaterThan(11.9 * 3600_000)
    await runInDurableObject(vaultFor(env, t.tenantId), (_i, s) => {
      const rows = s.storage.sql.exec<{ token_hash: string }>("SELECT token_hash FROM customer_display_sessions").toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(rows[0]!.token_hash).not.toContain(p.token)
    })

    const idle = await view("layarsatu", kodeOf(p))
    expect(idle.status).toBe(200)
    expect(idle.headers.get("set-cookie")).toBeNull()
    expect(idle.headers.get("cache-control")).toBe("no-store")
    const idleBody = await data<View>(idle)
    expect(idleBody).toMatchObject({ state: { kind: "idle" }, outlet: { name: "layarsatu", logoUrl: null, qrisUrl: null } })
    expect(await data<{ paired: boolean; pairId: string; hasQris: boolean }>(await appGet("/customer-display/status", t.cookie))).toMatchObject({ paired: true, pairId: p.pairId, hasQris: false })
    expect(p.pairId).toMatch(/^[0-9a-f-]{36}$/)
    expect(idleBody.pairId).toBe(p.pairId)

    // Checkout: unknown keys (cost, margin, phone, street) are dropped by the server-built schema.
    const pushed = await post("/customer-display/state", t.cookie, { ...CHECKOUT, providerNetShippingIdr: 777123, estimatedProfitIdr: 777124, recipientPhone: "085712348821", street: "Jl. Tebet Barat No. 14", lines: [...CHECKOUT.lines.map((l) => ({ ...l, provider_net_shipping_idr: 777125 }))] })
    expect(pushed.status).toBe(200)
    const v = await view("layarsatu", kodeOf(p))
    const raw = await v.text()
    const body = (JSON.parse(raw) as { data: View }).data
    expect(body.pairId).toBe(p.pairId)
    expect(body.state).toEqual({
      kind: "checkout",
      courier: "J&T Express",
      eta: "2-3 hari",
      billableWeightGram: 1000,
      destination: TEBET_LABEL,
      method: "qris",
      lines: [
        { kind: "ongkir", label: "Ongkos kirim", amountIdr: 12500 },
        { kind: "packing", label: "Packing", amountIdr: 3000 },
      ],
      totalIdr: 15500,
      codCollectionIdr: null,
      senderPayoutIdr: null,
    })
    expect(ownerOnlyKeysIn(body)).toEqual([])
    for (const leak of ["777123", "777124", "777125", "0857", "Tebet Barat No", "Jl."]) expect(raw).not.toContain(leak)

    // Paid: amounts, INV, AWB and change come from the tenant object, not from the request.
    const inv = await readyInv(t)
    await post(`/shipments/${inv}/payment`, t.cookie, { method: "tunai", cashReceivedIdr: 20000 }, `cd-${inv}-1`)
    await post(`/shipments/${inv}/dispatch`, t.cookie, {})
    const paid = await post("/customer-display/state", t.cookie, { kind: "paid", slug: inv, courier: "Ibu Siti 0812-3456-7890", totalIdr: 1, cashReceivedIdr: 999999 })
    expect(paid.status).toBe(200)
    const pv = await data<View>(await view("layarsatu", kodeOf(p)))
    expect(pv.state).toMatchObject({ kind: "paid", inv: inv.toUpperCase(), courier: "J&T Express", paymentStatus: "paid", method: "tunai", totalIdr: 15500, cashReceivedIdr: 20000, changeIdr: 4500, trackingUrl: `https://layarsatu.geraimitra.localhost/lacak?q=${inv.toUpperCase()}` })
    expect(typeof pv.state.awb).toBe("string")
    expect(String(pv.state.trackingQrSvg).startsWith("<svg")).toBe(true)
    expect(ownerOnlyKeysIn(pv)).toEqual([])
    expect(JSON.stringify(pv)).not.toMatch(/0812|0857|Ibu Siti|Rina|Jl\./)

    // 20 s after `paid`, the display returns to idle by itself.
    await runInDurableObject(vaultFor(env, t.tenantId), (_i, s) => {
      s.storage.sql.exec("UPDATE customer_display_sessions SET state_updated_at = state_updated_at - 21000")
    })
    expect((await data<View>(await view("layarsatu", kodeOf(p)))).state).toEqual({ kind: "idle" })

    // Unknown INV and a total that does not add up are refused.
    expect((await post("/customer-display/state", t.cookie, { kind: "paid", slug: "zzzzzzz" })).status).toBe(404)
    const bad = await post("/customer-display/state", t.cookie, { ...CHECKOUT, totalIdr: 15000 })
    expect(bad.status).toBe(422)
    expect((await errorOf(bad)).code).toBe("DISPLAY_TOTAL_MISMATCH")
    expect((await post("/customer-display/state", t.cookie, { ...CHECKOUT, lines: [{ kind: "margin", amountIdr: 15500 }] })).status).toBe(422)
    expect((await post("/customer-display/state", t.cookie, { ...CHECKOUT, lines: [{ kind: "ongkir", amountIdr: 15500.5 }], totalIdr: 15500.5 })).status).toBe(422)
  })

  it("a session cookie on the view is ignored and never rolled; the view is public but needs a valid kode", async () => {
    const t = await checkoutGerai("layarcookie")
    const p = await pair(t.cookie)
    const withCookie = await view("layarcookie", kodeOf(p), { cookie: t.cookie })
    expect(withCookie.status).toBe(200)
    expect(withCookie.headers.get("set-cookie")).toBeNull()
    const none = await view("layarcookie", "")
    expect(none.status).toBe(401)
    expect(await errorOf(none)).toMatchObject({ code: "DISPLAY_NOT_PAIRED" })
    expect((await view("layarcookie", "x".repeat(43))).status).toBe(401)
  })

  it("re-pair revokes the earlier pairing; unpair ends it; expiry ends it", async () => {
    const t = await checkoutGerai("layardua")
    const first = await pair(t.cookie)
    const second = await pair(t.cookie)
    const old = await view("layardua", kodeOf(first))
    expect(old.status).toBe(410)
    expect(await errorOf(old)).toMatchObject({ code: "DISPLAY_ENDED", message: "Layar pelanggan tidak lagi terhubung. Pasangkan ulang dari layar kasir." })
    expect((await view("layardua", kodeOf(second))).status).toBe(200)

    expect((await post("/customer-display/unpair", t.cookie, {})).status).toBe(200)
    expect((await view("layardua", kodeOf(second))).status).toBe(410)
    expect(await data<{ paired: boolean }>(await appGet("/customer-display/status", t.cookie))).toMatchObject({ paired: false })

    const third = await pair(t.cookie)
    await runInDurableObject(vaultFor(env, t.tenantId), (_i, s) => {
      s.storage.sql.exec("UPDATE customer_display_sessions SET expires_at = ? WHERE revoked_at IS NULL", Date.now() - 1)
    })
    expect((await view("layardua", kodeOf(third))).status).toBe(410)
  })

  it("closing the bound shift unpairs the display at once (PR-22)", async () => {
    const t = await checkoutGerai("layarshift")
    const k = await cashier(t.tenantId, "kasir.layar@contoh.test")
    expect((await post("/shift/open", k.cookie, { openingFloatIdr: 0 })).status).toBe(200)
    const p = await pair(k.cookie)
    expect(p.shiftBound).toBe(true)
    expect((await view("layarshift", kodeOf(p))).status).toBe(200)
    expect((await post("/shift/close", k.cookie, { countedCashIdr: 0 })).status).toBe(200)
    const after = await view("layarshift", kodeOf(p))
    expect(after.status).toBe(410)
    await runInDurableObject(vaultFor(env, t.tenantId), (_i, s) => {
      expect(s.storage.sql.exec<{ revoked_at: number | null }>("SELECT revoked_at FROM customer_display_sessions").toArray()[0]!.revoked_at).not.toBeNull()
    })
    // The owner's own pairing (no shift) is untouched by the Kasir's close.
    const o = await pair(t.cookie)
    expect((await view("layarshift", kodeOf(o))).status).toBe(200)
  })

  it("a token works only with its own gerai; a suspended gerai's display stops", async () => {
    const a = await checkoutGerai("layarsatua")
    const b = await checkoutGerai("layarsatub")
    const p = await pair(a.cookie)
    expect((await view("layarsatub", kodeOf(p))).status).toBe(401)
    expect((await view("tidakada", kodeOf(p))).status).toBe(401)
    expect((await view("layarsatua", kodeOf(p))).status).toBe(200)
    // Each member's state push reaches only their own pairing (B pushing never changes A's display).
    await pair(b.cookie)
    await post("/customer-display/state", b.cookie, CHECKOUT)
    expect((await data<View>(await view("layarsatua", kodeOf(p)))).state).toEqual({ kind: "idle" })
    await env.DB.prepare("UPDATE tenants SET status = 'suspended' WHERE id = ?").bind(a.tenantId).run()
    expect((await view("layarsatua", kodeOf(p))).status).toBe(401)
  })

  it("a Kasir whose access is revoked no longer drives a display", async () => {
    const t = await checkoutGerai("layarcabut")
    const k = await cashier(t.tenantId, "kasir.cabut@contoh.test")
    const p = await pair(k.cookie)
    expect((await view("layarcabut", kodeOf(p))).status).toBe(200)
    expect((await post(`/members/${k.id}/revoke`, t.cookie, {})).status).toBe(200)
    expect((await view("layarcabut", kodeOf(p))).status).toBe(410)
  })

  it("failed lookups are throttled per client IP", async () => {
    const t = await checkoutGerai("layarlimit")
    const p = await pair(t.cookie)
    const ip = { "cf-connecting-ip": "203.0.113.77" }
    for (let i = 0; i < 30; i++) expect((await view("layarlimit", `salah-${i}`, ip)).status).toBe(401)
    const limited = await view("layarlimit", "salah-lagi", ip)
    expect(limited.status).toBe(429)
    // Another device keeps working.
    expect((await view("layarlimit", kodeOf(p), { "cf-connecting-ip": "203.0.113.78" })).status).toBe(200)
  })
})

describe("outlet QRIS image (Pengaturan › Printer & Struk)", () => {
  const upload = (cookie: string, body: Uint8Array | string, purpose = "qris") =>
    exports.default.fetch(`${APP}/api/app/media?purpose=${purpose}`, { method: "POST", headers: { origin: APP, cookie, "content-type": "application/octet-stream" }, body })

  it("owner uploads and sets the QRIS; the paired display streams it with the pairing only; Kasir cannot change it", async () => {
    const t = await checkoutGerai("layarqris")
    const k = await cashier(t.tenantId, "kasir.qris@contoh.test")
    // Kasir: no upload, no setting.
    expect((await upload(k.cookie, PNG)).status).toBe(403)
    expect((await post("/settings/qris", k.cookie, { mediaId: null })).status).toBe(403)
    // Owner: images only, at most 2 MB.
    expect((await upload(t.cookie, new TextEncoder().encode("%PDF-1.7 bukan gambar"))).status).toBe(415)
    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    big.set(PNG)
    expect((await upload(t.cookie, big)).status).toBe(413)
    const up = await upload(t.cookie, PNG)
    expect(up.status).toBe(201)
    const { id } = await data<{ id: string }>(up)
    // A logo id is not a QRIS id.
    const logo = await data<{ id: string }>(await upload(t.cookie, PNG, "logo"))
    expect((await post("/settings/qris", t.cookie, { mediaId: logo.id })).status).toBe(422)
    const set = await post("/settings/qris", t.cookie, { mediaId: id })
    expect(set.status).toBe(200)
    expect(await data<{ hasQris: boolean; url: string }>(set)).toMatchObject({ hasQris: true })
    // Kasir reads it (read-only card on the printer page).
    expect(await data<{ hasQris: boolean }>(await appGet("/settings/qris", k.cookie))).toMatchObject({ hasQris: true })

    const p = await pair(k.cookie)
    const v = await data<View>(await view("layarqris", kodeOf(p)))
    expect(v.outlet.qrisUrl).toMatch(/^\/api\/app\/customer-display\/media\/qris\?gerai=layarqris&kode=/)
    const img = await exports.default.fetch(`${APP}${v.outlet.qrisUrl}`)
    expect(img.status).toBe(200)
    expect(img.headers.get("content-type")).toBe("image/png")
    expect(img.headers.get("set-cookie")).toBeNull()
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG)
    // No logo uploaded for the outlet → 404; a wrong kode → 401; after unpair → 410.
    expect((await exports.default.fetch(`${APP}/api/app/customer-display/media/logo?gerai=layarqris&kode=${kodeOf(p)}`)).status).toBe(404)
    expect((await exports.default.fetch(`${APP}/api/app/customer-display/media/qris?gerai=layarqris&kode=salah`)).status).toBe(401)
    await post("/customer-display/unpair", k.cookie, {})
    expect((await exports.default.fetch(`${APP}${v.outlet.qrisUrl}`)).status).toBe(410)

    // Remove.
    expect(await data<{ hasQris: boolean }>(await post("/settings/qris", t.cookie, { mediaId: null }))).toMatchObject({ hasQris: false, url: null })
  })
})

describe("Sol R1 regressions (TASK-701)", () => {
  it("F1: PII in the allowed fields never reaches the stored or public state; display text is server-resolved", async () => {
    const t = await checkoutGerai("layarpii")
    const p = await pair(t.cookie)
    await runInDurableObject(vaultFor(env, t.tenantId), (_i, s) => {
      s.storage.sql.exec("INSERT INTO packing_items (id, name, price_idr, is_active, sort_order, updated_at) VALUES ('pk1', 'Bubble Wrap', 3000, 1, 0, 0)")
    })
    const PII = { street: "Jl. Melati Raya No. 17 RT 03", phone: "0812-3456-7890", sender: "Ibu Siti Nisa" }
    const res = await post("/customer-display/state", t.cookie, {
      ...CHECKOUT,
      courier: `${PII.sender} ${PII.phone}`,
      eta: PII.phone,
      destination: PII.street,
      destinationLabel: `Tebet Barat, ${PII.street}`,
      lines: [
        { kind: "ongkir", amountIdr: 12500 },
        { kind: "packing", amountIdr: 3000, name: `${PII.sender} ${PII.phone}` },
      ],
    })
    expect(res.status).toBe(200)
    const pub = await (await view("layarpii", kodeOf(p))).text()
    let stored = ""
    await runInDurableObject(vaultFor(env, t.tenantId), (_i, s) => {
      stored = s.storage.sql.exec<{ state_json: string }>("SELECT state_json FROM customer_display_sessions WHERE revoked_at IS NULL").toArray()[0]!.state_json
    })
    for (const raw of [stored, pub]) for (const leak of [PII.street, "Melati", PII.phone, "0812", PII.sender, "Siti"]) expect(raw, leak).not.toContain(leak)
    expect(JSON.parse(stored)).toMatchObject({ courier: "J&T Express", eta: null, destination: TEBET_LABEL, lines: [{ label: "Ongkos kirim" }, { label: "Packing" }] })
    // A packing name from the gerai's own catalogue is shown; anything else falls back to the fixed label.
    await post("/customer-display/state", t.cookie, { ...CHECKOUT, lines: [{ kind: "ongkir", amountIdr: 12500 }, { kind: "packing", amountIdr: 3000, name: "Bubble Wrap" }] })
    expect((await data<View>(await view("layarpii", kodeOf(p)))).state).toMatchObject({ lines: [{ label: "Ongkos kirim" }, { label: "Packing (Bubble Wrap)" }] })
    // An area id that the hint does not resolve to → no destination at all (never the free text).
    await post("/customer-display/state", t.cookie, { ...CHECKOUT, destinationAreaId: "0123456789abcdef01234567", destinationLabel: PII.street })
    expect((await data<View>(await view("layarpii", kodeOf(p)))).state).toMatchObject({ destination: null })
    // Unknown, inactive or missing service → 422; the stored state is untouched.
    for (const serviceCode of ["XX", "", undefined, "JT'--"]) {
      const r = await post("/customer-display/state", t.cookie, { ...CHECKOUT, serviceCode, courier: "J&T Express" })
      expect(r.status, String(serviceCode)).toBe(422)
    }
    expect((await data<View>(await view("layarpii", kodeOf(p)))).state).toMatchObject({ destination: null })
  })

  it("F4: inherited or non-string line kinds are refused and the stored state stays as it was", async () => {
    const t = await checkoutGerai("layarproto")
    const p = await pair(t.cookie)
    expect((await post("/customer-display/state", t.cookie, CHECKOUT)).status).toBe(200)
    const before = (await data<View>(await view("layarproto", kodeOf(p)))).state
    for (const kind of ["__proto__", "constructor", "toString", "hasOwnProperty", 1, null, ["ongkir"], { ongkir: 1 }]) {
      const r = await post("/customer-display/state", t.cookie, { ...CHECKOUT, lines: [{ kind, amountIdr: 12500 }], totalIdr: 12500 })
      expect(r.status, JSON.stringify(kind)).toBe(422)
      expect((await errorOf(r)).code).toBe("DISPLAY_INVALID")
    }
    expect((await data<View>(await view("layarproto", kodeOf(p)))).state).toEqual(before)
  })

  it("F2: pair, status and view agree on a non-secret pairId; a re-pair gets a new one", async () => {
    const t = await checkoutGerai("layarpairid")
    const a = await pair(t.cookie)
    const b = await pair(t.cookie)
    expect(a.pairId).not.toBe(b.pairId)
    expect((await data<{ pairId: string }>(await appGet("/customer-display/status", t.cookie))).pairId).toBe(b.pairId)
    expect((await data<View>(await view("layarpairid", kodeOf(b)))).pairId).toBe(b.pairId)
    expect(b.pairId).not.toContain(b.token)
  })
})

