// TASK-403 pickup manifest (spec 04 §1): scan guard — wrong courier, cancelled and unpaid-hold block; counter-unpaid
// warns; duplicates and other batches handled; driver fields required; handover records custody `handed_to_courier`;
// Surat Jalan PDF served with initials only.
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockSeller, resetMock } from "../../src/mengantar/mock"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Scan = { data: { scan: { result: string; code?: string; message?: string; warning?: string | null }; batch: { scanned_count: number; missing: unknown[] } } }
async function issue(t: Awaited<ReturnType<typeof checkoutGerai>>, opts: { pay?: boolean; service?: string } = {}) {
  const s = await readyInv(t, opts.service ? { serviceCode: opts.service } : {})
  if (opts.pay !== false) await post(`/shipments/${s}/payment`, t.cookie, { method: "qris" }, `pk-${s}`)
  const r = ((await (await post(`/shipments/${s}/dispatch`, t.cookie, {})).json()) as { data: { awb: string | null } }).data
  return { slug: s, awb: r.awb }
}

describe("pickup manifest", () => {
  it("scan guard: JT batch accepts JT, blocks SiCepat/cancelled/no-AWB, warns on counter-unpaid, dedupes", async () => {
    const t = await checkoutGerai("pickupscan")
    const jt = await issue(t)
    const jtUnpaid = await issue(t, { pay: false })
    const sc = await issue(t, { service: "SiCepat" })
    const cancelled = await issue(t, { pay: false })
    await post(`/shipments/${cancelled.slug}/cancel`, t.cookie, { reason: "salah alamat" })
    mockSeller.balanceIdr = 0
    const held = await issue(t)
    mockSeller.balanceIdr = 1_000_000
    const q = ((await (await appGet("/pickup", t.cookie)).json()) as { data: { groups: Array<{ courier_code: string; ready: number; unpaid: number }> } }).data.groups
    expect(q.find((g) => g.courier_code === "JT")).toMatchObject({ ready: 2, unpaid: 1 })
    const open = ((await (await post("/pickup/open", t.cookie, { courier: "JT" })).json()) as { data: { batch: { id: string } } }).data.batch.id
    expect(((await (await post("/pickup/open", t.cookie, { courier: "JT" })).json()) as { data: { batch: { id: string } } }).data.batch.id).toBe(open)
    const scan = async (code: string) => ((await (await post(`/pickup/${open}/scan`, t.cookie, { code })).json()) as Scan).data
    expect((await scan(jt.awb!)).scan).toMatchObject({ result: "added", warning: null })
    expect((await scan(jt.awb!)).scan.result).toBe("duplicate")
    expect((await scan(`INV ${jtUnpaid.slug.toUpperCase()}`)).scan).toMatchObject({ result: "added", warning: "Belum dibayar pelanggan — tagih dulu." })
    expect((await scan(sc.awb!)).scan).toMatchObject({ result: "blocked", code: "WRONG_COURIER", message: "SALAH KURIR! Paket ini milik SiCepat, bukan J&T." })
    expect((await scan(cancelled.slug)).scan).toMatchObject({ result: "blocked", code: "CANCELLED" })
    expect((await scan(held.slug)).scan).toMatchObject({ result: "blocked", code: "NO_AWB" })
    expect((await scan("JX0000000000")).scan).toMatchObject({ result: "blocked", code: "NOT_FOUND" })
    const v = await scan(jt.awb!)
    expect(v.batch.scanned_count).toBe(2)
  })

  it("handover: driver fields required in Indonesian; custody handed_to_courier; no second manifest; Surat Jalan PDF", async () => {
    const t = await checkoutGerai("pickuphand")
    const a = await issue(t)
    const open = ((await (await post("/pickup/open", t.cookie, { courier: "JT" })).json()) as { data: { batch: { id: string } } }).data.batch.id
    expect(((await (await post(`/pickup/${open}/handover`, t.cookie, { driverName: "Budi" })).json()) as { error: { code: string } }).error.code).toBe("EMPTY_BATCH")
    await post(`/pickup/${open}/scan`, t.cookie, { code: a.awb })
    const bad = await post(`/pickup/${open}/handover`, t.cookie, { driverName: "B", driverPhone: "021", vehicleNo: "??" })
    expect(((await bad.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors).toEqual({
      driverName: "Nama kurir 2–60 huruf.",
      driverPhone: "Nomor HP kurir tidak valid.",
      vehicleNo: "Nomor polisi tidak valid (contoh: D 1234 ABC).",
      signature: "Minta tanda tangan kurir atau foto Surat Jalan yang sudah ditandatangani.",
    })
    // Upload a signature PNG through the media route.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const { exports } = await import("cloudflare:workers")
    const { APP } = await import("../webhooks/helpers")
    const up = await exports.default.fetch(`${APP}/api/app/media?purpose=signature`, { method: "POST", headers: { origin: APP, cookie: t.cookie, "content-type": "image/png" }, body: png })
    expect(up.status).toBe(201)
    const sig = ((await up.json()) as { data: { id: string } }).data.id
    const ok = await post(`/pickup/${open}/handover`, t.cookie, { driverName: "Budi Kurir", driverPhone: "0812-9999-0000", vehicleNo: "d 1234 abc", signatureId: sig })
    expect(ok.status).toBe(200)
    const s = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ custody_stage: string; status: string; pickup_batch_id: string }>("SELECT custody_stage, status, pickup_batch_id FROM shipments WHERE slug = ?", a.slug).one())
    expect(s).toEqual({ custody_stage: "handed_to_courier", status: "handed_to_courier", pickup_batch_id: open })
    const b = ((await (await appGet(`/pickup/${open}`, t.cookie)).json()) as { data: { batch: { status: string; driver_vehicle_no: string; driver_phone: string } } }).data.batch
    expect(b).toMatchObject({ status: "handed_over", driver_vehicle_no: "D 1234 ABC", driver_phone: "081299990000" })
    // Closed: scanning again refused; a fresh batch can be opened; the handed INV is blocked there.
    expect((await post(`/pickup/${open}/scan`, t.cookie, { code: a.awb })).status).toBe(409)
    const next = ((await (await post("/pickup/open", t.cookie, { courier: "JT" })).json()) as { data: { batch: { id: string } } }).data.batch.id
    expect(next).not.toBe(open)
    expect(((await (await post(`/pickup/${next}/scan`, t.cookie, { code: a.awb })).json()) as Scan).data.scan).toMatchObject({ result: "blocked", code: "ALREADY_HANDED" })
    const pdf = await appGet(`/pickup/${open}/surat-jalan.pdf`, t.cookie)
    expect(pdf.headers.get("content-type")).toBe("application/pdf")
    const text = new TextDecoder("latin1").decode(await pdf.arrayBuffer())
    expect(text).toContain("SURAT JALAN")
    expect(text).toContain("Nama: Budi Kurir")
    expect(text).not.toContain("Rina")
  })

  it("branch drop-off needs no driver fields and still records custody", async () => {
    const t = await checkoutGerai("pickupcabang")
    const a = await issue(t)
    const open = ((await (await post("/pickup/open", t.cookie, { courier: "JT" })).json()) as { data: { batch: { id: string } } }).data.batch.id
    await post(`/pickup/${open}/scan`, t.cookie, { code: a.slug })
    expect((await post(`/pickup/${open}/handover`, t.cookie, { mode: "dropped_at_branch" })).status).toBe(200)
    const s = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ custody_stage: string }>("SELECT custody_stage FROM shipments WHERE slug = ?", a.slug).one().custody_stage)
    expect(s).toBe("handed_to_courier")
  })

  it("an INV cancelled after scanning leaves the open manifest; a changed one blocks handover", async () => {
    const t = await checkoutGerai("pickupbatal")
    const a = await issue(t, { pay: false })
    const b = await issue(t)
    const open = ((await (await post("/pickup/open", t.cookie, { courier: "JT" })).json()) as { data: { batch: { id: string } } }).data.batch.id
    await post(`/pickup/${open}/scan`, t.cookie, { code: a.slug })
    await post(`/pickup/${open}/scan`, t.cookie, { code: b.slug })
    expect((await post(`/shipments/${a.slug}/cancel`, t.cookie, { reason: "batal kirim" })).status).toBe(200)
    const items = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ slug: string }>("SELECT slug FROM pickup_batch_items WHERE batch_id = ?", open).toArray().map((r) => r.slug))
    expect(items).toEqual([b.slug])
    // A scanned INV whose state changed underneath (e.g. a provider status) blocks the manifest.
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("UPDATE shipments SET status = 'in_transit' WHERE slug = ?", b.slug))
    const h = await post(`/pickup/${open}/handover`, t.cookie, { mode: "dropped_at_branch" })
    expect(h.status).toBe(409)
    expect(((await h.json()) as { error: { code: string } }).error.code).toBe("ITEM_NOT_READY")
  })
})
