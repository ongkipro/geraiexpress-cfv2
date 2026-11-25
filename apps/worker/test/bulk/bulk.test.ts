// TASK-308 Paket Massal (spec 03 §1.3, spec 01 §2.5) and Cek Resi (§1.4): CSV with good and bad rows → Siap /
// Perlu Diperbaiki with reasons (ambiguous area never guessed) → one INV per ready row → serialized dispatch →
// atomic batch payment → Riwayat Massal; Cek Resi finds own INV/AWB/HP and refuses a foreign AWB.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockFaults, mockSeller, resetMock } from "../../src/mengantar/mock"
import { checkBatch } from "../../src/bulk/service"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

const CSV = [
  "Nama Penerima,No HP,Alamat,Kecamatan/Kota,Kode Pos,Isi Paket,Berat (gram),Panjang,Lebar,Tinggi,COD (Rp),Nilai Barang (Rp),Catatan",
  "Rina Kartika,0857-1234-8821,Jl. Tebet Barat No. 14,Tebet Barat,12810,Pakaian,1000,,,,0,150000,",
  'Budi Santoso,081298765432,"Jl. Dago Asri No. 3, RT 02",Dago,40135,Buku,500,,,,,,dekat masjid',
  "Siti Aminah,081311112222,Jl. Airlangga No. 7,Airlangga,,Sepatu,,,,,,,",
  "Dewi Lestari,081333334444,Jl. Mawar No. 2,Antah Berantah,,Tas,800,,,,,,",
  "Agus Salim,081355556666,Jl. Melati No. 9,Jawa,,Kaos,700,,,,,,",
].join("\r\n")

type Row = { row_no: number; state: string; errors: string[]; candidates: Array<{ id: string; label: string }>; shipment_slug: string | null; dispatch_state: string | null; awb_number: string | null; counter_due_idr: number | null; estimated_margin_idr?: number }
type View = { batch: { id: string; state: string; ready_count: number; failed_count: number; counter_payment_status: string }; rows: Row[]; totals: { due: number; ongkir: number; estimated_margin_idr?: number } }
const view = async (cookie: string, id: string) => ((await (await appGet(`/bulk/${id}`, cookie)).json()) as { data: View }).data

async function seedBatch(t: Awaited<ReturnType<typeof checkoutGerai>>) {
  const res = await post("/bulk", t.cookie, { senderId: t.sender, csv: CSV, fileName: "paket.csv", serviceCode: "JT", codFeeMode: "none" })
  expect(res.status).toBe(201)
  const id = ((await res.json()) as { data: { id: string } }).data.id
  for (let i = 0; i < 3 && (await checkBatch(env, t.tenantId, id)).more; i++);
  return id
}

describe("Paket Massal", () => {
  it("CSV fixture: good rows Siap, bad rows Perlu Diperbaiki with Indonesian reasons; ambiguous area offers a picker", async () => {
    const t = await checkoutGerai("massalcsv")
    const id = await seedBatch(t)
    const v = await view(t.cookie, id)
    expect(v.batch).toMatchObject({ state: "ready", ready_count: 2, failed_count: 3 })
    const by = Object.fromEntries(v.rows.map((r) => [r.row_no, r]))
    expect(by[1]).toMatchObject({ state: "ready", counter_due_idr: expect.any(Number) })
    expect(by[2]!.state).toBe("ready")
    expect(by[3]).toMatchObject({ state: "needs_fix", errors: ["Berat kosong"] })
    expect(by[4]).toMatchObject({ state: "needs_fix", errors: ["Kecamatan tidak ditemukan"] })
    expect(by[5]).toMatchObject({ state: "needs_fix", errors: ["Kecamatan lebih dari satu, pilih yang benar"] })
    expect(by[5]!.candidates.length).toBeGreaterThanOrEqual(2)
    // Fix row 5 by picking an area; row 3 by adding a weight; then remove row 4.
    await post(`/bulk/${id}/rows/5`, t.cookie, { cells: { name: "Agus Salim", phone: "081355556666", street: "Jl. Melati No. 9", areaText: "Jawa", weightGram: "700" }, areaId: by[5]!.candidates[0]!.id, areaLabel: by[5]!.candidates[0]!.label })
    await post(`/bulk/${id}/rows/3`, t.cookie, { cells: { name: "Siti Aminah", phone: "081311112222", street: "Jl. Airlangga No. 7", areaText: "Airlangga", weightGram: "1200" } })
    await post(`/bulk/${id}/rows/4`, t.cookie, { remove: true })
    await checkBatch(env, t.tenantId, id)
    const v2 = await view(t.cookie, id)
    expect(v2.batch).toMatchObject({ state: "ready", ready_count: 4, failed_count: 0 })
    expect(v2.totals.due).toBe(v2.rows.reduce((a, r) => a + (r.counter_due_idr ?? 0), 0))
  })

  it("create → one INV per ready row, serialized dispatch, Kasir never sees margin, atomic batch payment", async () => {
    const t = await checkoutGerai("massalbuat")
    const id = await seedBatch(t)
    expect(((await (await post(`/bulk/${id}/create`, t.cookie, {})).json()) as { error: { code: string } }).error.code).toBe("PROHIBITED_ACK_REQUIRED")
    expect((await post(`/bulk/${id}/create`, t.cookie, { prohibitedAck: true })).status).toBe(200)
    // Second tap: no duplicate INVs.
    expect((await post(`/bulk/${id}/create`, t.cookie, { prohibitedAck: true })).status).toBe(409)
    // The queued dispatch may already have run; a second run is a no-op (each row is attempted once).
    await t.vault.bulkDispatch(t.tenantId, id, { maskingEnabled: false, dailyQuota: null })
    await t.vault.bulkDispatch(t.tenantId, id, { maskingEnabled: false, dailyQuota: null })
    expect(mockSeller.createCalls).toBe(2)
    const v = await view(t.cookie, id)
    expect(v.batch.state).toBe("done")
    const created = v.rows.filter((x) => x.shipment_slug)
    expect(created).toHaveLength(2)
    expect(new Set(created.map((x) => x.shipment_slug)).size).toBe(2)
    expect(created.every((x) => x.dispatch_state === "issued" && x.awb_number)).toBe(true)
    expect(v.totals.estimated_margin_idr).toBeGreaterThan(0)

    const k = await appUser("kasir.massal@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    const kv = await view(k.cookie, id)
    expect(ownerOnlyKeysIn(kv)).toEqual([])

    // A row paid on its own is skipped by the batch payment; too little cash refuses and writes nothing.
    const [a, b] = created.map((x) => x.shipment_slug!)
    await post(`/shipments/${a}/payment`, t.cookie, { method: "qris" }, `single-${a}`)
    const low = await post(`/bulk/${id}/pay`, t.cookie, { method: "tunai", cashReceivedIdr: 1000 }, "batchpay-low")
    expect(((await low.json()) as { error: { code: string } }).error.code).toBe("CASH_TOO_LOW")
    const receipts = await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM counter_receipts WHERE bulk_batch_id IS NOT NULL").one().n)
    expect(receipts).toBe(0)
    const ok1 = await post(`/bulk/${id}/pay`, t.cookie, { method: "qris" }, "batchpay-1")
    expect(((await ok1.json()) as { data: { paid: number } }).data.paid).toBe(1)
    const again = await post(`/bulk/${id}/pay`, t.cookie, { method: "qris" }, "batchpay-1")
    expect(((await again.json()) as { data: { replayed: boolean } }).data.replayed).toBe(true)
    const rows = await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec<{ idempotency_key: string; bulk_batch_id: string }>("SELECT idempotency_key, bulk_batch_id FROM counter_receipts WHERE bulk_batch_id IS NOT NULL").toArray())
    expect(rows).toEqual([{ idempotency_key: `batchpay-1:${b}`, bulk_batch_id: id }])
  })

  it("atomic: a receipt failure mid-batch rolls every row back", async () => {
    const t = await checkoutGerai("massalatom")
    const id = await seedBatch(t)
    await post(`/bulk/${id}/create`, t.cookie, { prohibitedAck: true })
    const slugs = (await view(t.cookie, id)).rows.filter((x) => x.shipment_slug).map((x) => x.shipment_slug!)
    // Pre-insert a receipt holding the second row's derived idempotency key with another slug → markPaid refuses it.
    await runInDurableObject(t.vault, (_i, s) =>
      s.storage.sql.exec(
        "INSERT INTO counter_receipts (id, tenant_id, shipment_slug, event, direction, amount_idr, method, actor_user_id, idempotency_key, created_at) VALUES ('x', ?, 'zzzzzzz', 'mark_paid', 'in', 1, 'qris', 'u', ?, 1)",
        t.tenantId,
        `batchpay-atom:${slugs[1]}`,
      ),
    )
    const res = await post(`/bulk/${id}/pay`, t.cookie, { method: "qris" }, "batchpay-atom")
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REUSED")
    const state = await runInDurableObject(t.vault, (_i, s) => ({
      receipts: s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM counter_receipts WHERE id != 'x'").one().n,
      paid: s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM shipments WHERE counter_payment_status = 'paid'").one().n,
      batch: s.storage.sql.exec<{ counter_payment_status: string }>("SELECT counter_payment_status FROM bulk_import_batches WHERE id = ?", id).one().counter_payment_status,
    }))
    expect(state).toEqual({ receipts: 0, paid: 0, batch: "unpaid" })
  })

  it("dispatch failure keeps the provider error, no blind retry; Batalkan yang Belum Terbit cancels only unissued INVs", async () => {
    const t = await checkoutGerai("massalgagal")
    const id = await seedBatch(t)
    mockFaults.order = "validation_error"
    await post(`/bulk/${id}/create`, t.cookie, { prohibitedAck: true })
    await t.vault.bulkDispatch(t.tenantId, id, { maskingEnabled: false, dailyQuota: null })
    await t.vault.bulkDispatch(t.tenantId, id, { maskingEnabled: false, dailyQuota: null })
    expect(mockSeller.createCalls).toBe(1)
    const v = await view(t.cookie, id)
    expect(v.batch.state).toBe("partially_failed")
    const c = await post(`/bulk/${id}/cancel-unissued`, t.cookie, {})
    expect(((await c.json()) as { data: { cancelled: number } }).data.cancelled).toBe(1)
    const after = await view(t.cookie, id)
    expect(after.rows.filter((x) => x.shipment_slug).map((x) => x.dispatch_state).sort()).toEqual(["cancelled", "issued"])
    const list = ((await (await appGet("/bulk", t.cookie)).json()) as { data: { items: Array<{ id: string; sender_name: string }> } }).data.items
    expect(list[0]).toMatchObject({ id, sender_name: "Ibu Siti" })
  })

  it("rejects more than 200 rows and a file without the template columns", async () => {
    const t = await checkoutGerai("massalbatas")
    const bad = await post("/bulk", t.cookie, { senderId: t.sender, csv: "Nama,HP\nA,1", serviceCode: "JT" })
    expect(((await bad.json()) as { error: { message: string } }).error.message).toBe("Kolom wajib tidak lengkap. Gunakan template Paket Massal.")
    const many = await post("/bulk", t.cookie, { senderId: t.sender, rows: Array.from({ length: 201 }, () => ({})), serviceCode: "JT" })
    expect(((await many.json()) as { error: { message: string } }).error.message).toBe("Maksimal 200 baris per batch.")
  })
})

describe("Cek Resi", () => {
  it("own INV, AWB and recipient phone → timeline; foreign AWB → not this gerai", async () => {
    const t = await checkoutGerai("cekresi")
    const id = await seedBatch(t)
    await post(`/bulk/${id}/create`, t.cookie, { prohibitedAck: true })
    await t.vault.bulkDispatch(t.tenantId, id, { maskingEnabled: false, dailyQuota: null })
    const row = (await view(t.cookie, id)).rows.find((x) => x.shipment_slug)!
    const track = async (q: string) => ((await (await appGet(`/track?q=${encodeURIComponent(q)}`, t.cookie)).json()) as { data: { kind: string; items?: Array<{ slug: string; history: unknown[] | null }>; awb?: string } }).data
    const byInv = await track(`INV ${row.shipment_slug!.toUpperCase()}`)
    expect(byInv.kind).toBe("found")
    expect(byInv.items![0]!.slug).toBe(row.shipment_slug)
    expect(byInv.items![0]!.history!.length).toBeGreaterThan(0)
    expect((await track(row.awb_number!)).items![0]!.slug).toBe(row.shipment_slug)
    expect((await track("0857-1234-8821")).kind).toBe("found")
    expect(await track("JX9999999999")).toEqual({ kind: "foreign", awb: "JX9999999999" })
  })
})
