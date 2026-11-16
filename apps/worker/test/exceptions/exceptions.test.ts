// TASK-405 Kendala & Klaim (spec 04 §3): five buckets classify correctly; per-courier deadlines are frozen on the
// claim; expired windows refuse; lifecycle draft → submitted → approved → paid (also via a `typeRefund` sync);
// conflicts take an owner note; Kasir cannot record outcomes.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { mockInvoices, resetMock } from "../../src/mengantar/mock"
import { recordProviderObservation } from "../../src/do/gerai-vault/status"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Row = { slug: string; band: string | null; claim_kind: string | null; deadline_at: number | null; countdown: { label: string; expired: boolean } | null; claim: { id: string; status: string } | null; adjustment_idr: number | null }
type List = { counts: Record<string, number>; rows: Row[] }
const list = async (cookie: string, bucket: string) => ((await (await appGet(`/exceptions?bucket=${bucket}`, cookie)).json()) as { data: List }).data

async function issued(t: Awaited<ReturnType<typeof checkoutGerai>>) {
  const s = await readyInv(t)
  await post(`/shipments/${s}/payment`, t.cookie, { method: "qris" }, `ex-${s}`)
  const awb = ((await (await post(`/shipments/${s}/dispatch`, t.cookie, {})).json()) as { data: { awb: string } }).data.awb
  return { slug: s, awb }
}
const observe = (t: Awaited<ReturnType<typeof checkoutGerai>>, slug: string, mapped: "in_transit" | "undelivery_hold" | "lost" | "delivered" | "rts_in_transit", at: number) =>
  runInDurableObject(t.vault, (_i, st) => recordProviderObservation(st.storage.sql, { slug, eventKey: `${mapped}-${slug}-${at}`, source: "poll", rawCategory: mapped.toUpperCase(), mapped, eventAt: at, eventAtText: null }, Date.now()))

describe("Kendala & Klaim", () => {
  it("classifies: stuck bands, failed delivery, weight adjustment, claimable (lost), conflict", async () => {
    const t = await checkoutGerai("kendalasatu")
    const now = Date.now()
    const stuck = await issued(t)
    // Last scan six days ago (an older observation never overrides a newer key, so set the projection directly).
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("UPDATE shipments SET status = 'in_transit', provider_status = 'in_transit', last_provider_event_at = ? WHERE slug = ?", now - 6 * 86_400_000, stuck.slug))
    const failed = await issued(t)
    await observe(t, failed.slug, "undelivery_hold", now + 60_000)
    const lost = await issued(t)
    await observe(t, lost.slug, "lost", now + 60_000)
    const adj = await issued(t)
    mockInvoices.push({ _id: "adj1", type: "typePayment", status: "statusCleared", amount: -3_000, balanceAmount: 1, createdAt: new Date().toISOString(), description: "Biaya penyesuaian berat", cnote_no: adj.awb })
    await t.vault.financeSync(t.tenantId, "cron")
    const counts = (await list(t.cookie, "tidak_bergerak")).counts
    expect(counts).toEqual({ tidak_bergerak: 1, gagal_antar: 1, selisih_berat: 1, bisa_klaim: 1, bertentangan: 0, perlu_tindakan: 0 })
    expect((await list(t.cookie, "tidak_bergerak")).rows[0]).toMatchObject({ slug: stuck.slug, band: "5-14h" })
    expect((await list(t.cookie, "gagal_antar")).rows.map((r) => r.slug)).toEqual([failed.slug])
    expect((await list(t.cookie, "selisih_berat")).rows[0]).toMatchObject({ slug: adj.slug, adjustment_idr: 3_000 })
    const claimable = (await list(t.cookie, "bisa_klaim")).rows[0]!
    // J&T lost: 3×24 h from the lost status.
    expect(claimable).toMatchObject({ slug: lost.slug, claim_kind: "hilang", countdown: { label: "sisa 3 hari", expired: false } })
    expect(claimable.deadline_at! - (now + 60_000)).toBeLessThanOrEqual(72 * 3600_000)
  })

  it("claim lifecycle with a frozen deadline; Kasir may submit but not record outcomes; refund sync marks paid", async () => {
    const t = await checkoutGerai("kendalaklaim")
    const lost = await issued(t)
    await observe(t, lost.slug, "lost", Date.now())
    expect(((await (await post(`/shipments/${lost.slug}/claim`, t.cookie, { kind: "x" })).json()) as { error: { code: string } }).error.code).toBe("INVALID_KIND")
    const c = ((await (await post(`/shipments/${lost.slug}/claim`, t.cookie, { kind: "hilang", note: "Status hilang di J&T" })).json()) as { data: { id: string; deadline_at: number } }).data
    expect(c.deadline_at).toBeGreaterThan(Date.now())
    const again = ((await (await post(`/shipments/${lost.slug}/claim`, t.cookie, { kind: "hilang" })).json()) as { data: { id: string } }).data
    expect(again.id).toBe(c.id)
    const k = await appUser("kasir.klaim@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    expect((await post(`/claims/${c.id}/status`, k.cookie, { status: "submitted" })).status).toBe(200)
    expect(((await (await post(`/claims/${c.id}/status`, k.cookie, { status: "approved" })).json()) as { error: { code: string } }).error.code).toBe("OWNER_ONLY")
    expect((await post(`/claims/${c.id}/status`, t.cookie, { status: "paid" })).status).toBe(409)
    expect((await post(`/claims/${c.id}/status`, t.cookie, { status: "approved" })).status).toBe(200)
    const packet = ((await (await appGet(`/claims/${c.id}/packet`, t.cookie)).json()) as { data: { awb_number: string; kind: string; evidence: string[] } }).data
    expect(packet).toMatchObject({ awb_number: lost.awb, kind: "hilang", evidence: [] })
    mockInvoices.push({ _id: "ref1", type: "typeRefund", status: "statusCleared", amount: 50_000, balanceAmount: 50_000, createdAt: new Date().toISOString(), description: `Claim approved for damaged or lost order ${lost.awb}` })
    await t.vault.financeSync(t.tenantId, "manual")
    const st = await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec<{ status: string; paid_invoice_id: string }>("SELECT status, paid_invoice_id FROM shipment_claims WHERE id = ?", c.id).one())
    expect(st).toEqual({ status: "paid", paid_invoice_id: "ref1" })
  })

  it("expired window refuses a claim; drafts past their deadline expire in the sweep; conflict note is owner-only", { timeout: 30_000 }, async () => {
    const t = await checkoutGerai("kendalabatas")
    const lost = await issued(t)
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("UPDATE shipments SET status = 'lost', provider_status = 'lost', last_provider_event_at = ? WHERE slug = ?", Date.now() - 4 * 86_400_000, lost.slug))
    await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec("INSERT INTO shipment_events (event_key, slug, source, raw_category, mapped_status, event_at, recorded_at) VALUES (?, ?, 'poll', 'LOST', 'lost', ?, ?)", `old-lost-${lost.slug}`, lost.slug, Date.now() - 4 * 86_400_000, Date.now()))
    expect(((await (await post(`/shipments/${lost.slug}/claim`, t.cookie, { kind: "hilang" })).json()) as { error: { code: string } }).error.code).toBe("CLAIM_EXPIRED")
    const late = await issued(t)
    await observe(t, late.slug, "lost", Date.now())
    const c = ((await (await post(`/shipments/${late.slug}/claim`, t.cookie, { kind: "hilang" })).json()) as { data: { id: string } }).data
    await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec("UPDATE shipment_claims SET deadline_at = ? WHERE id = ?", Date.now() - 1, c.id))
    await t.vault.pollStatus(t.tenantId, Date.now())
    const st = await runInDurableObject(t.vault, (_i, s) => s.storage.sql.exec<{ status: string }>("SELECT status FROM shipment_claims WHERE id = ?", c.id).one().status)
    expect(st).toBe("expired")
    // Conflict: handback recorded, then provider says delivered.
    const x = await issued(t)
    await observe(t, x.slug, "rts_in_transit", Date.now() + 60_000)
    await post("/returns/intake", t.cookie, { code: x.awb, condition: "baik" })
    await observe(t, x.slug, "delivered", Date.now() + 120_000)
    expect((await list(t.cookie, "bertentangan")).rows.map((r) => r.slug)).toEqual([x.slug])
    expect((await post(`/shipments/${x.slug}/conflict-note`, t.cookie, { note: "ok" })).status).toBe(422)
    expect((await post(`/shipments/${x.slug}/conflict-note`, t.cookie, { note: "Kurir J&T konfirmasi paket ada di gerai", resolve: true })).status).toBe(200)
    expect((await list(t.cookie, "bertentangan")).counts.bertentangan).toBe(0)
  })

  it("the Kendala tab badge equals what the buckets show (a failed issue appears under Gagal Terbit)", async () => {
    const { mockFaults } = await import("../../src/mengantar/mock")
    const t = await checkoutGerai("kendalabadge")
    const slug = await readyInv(t)
    mockFaults.order = "validation_error"
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    const list = (await (await appGet("/shipments?tab=kendala", t.cookie)).json()) as { data: { counts: Record<string, number> } }
    const ex = (await (await appGet("/exceptions?bucket=perlu_tindakan", t.cookie)).json()) as { data: { counts: Record<string, number>; rows: Array<{ slug: string }> } }
    expect(ex.data.rows.map((r) => r.slug)).toEqual([slug])
    const sum = Object.values(ex.data.counts).reduce((a, b) => a + b, 0)
    expect(list.data.counts.kendala).toBe(sum)
  })
})
