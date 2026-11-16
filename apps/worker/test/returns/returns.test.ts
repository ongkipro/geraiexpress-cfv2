// TASK-404 Meja Retur (spec 04 §2, ADR-0005): intake → custody `rts_at_gerai` + audited true-sender reveal → hashed
// 4-digit code → handback by code (5 wrong lock) or owner ID override → `rts_returned_to_sender`; contradictions
// (provider `delivered` while the parcel is at the gerai) surface as `Status Bertentangan` without undoing custody.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { recordProviderObservation } from "../../src/do/gerai-vault/status"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

async function inReturn(t: Awaited<ReturnType<typeof checkoutGerai>>) {
  const slug = await readyInv(t)
  await post(`/shipments/${slug}/payment`, t.cookie, { method: "qris" }, `rt-${slug}`)
  const awb = ((await (await post(`/shipments/${slug}/dispatch`, t.cookie, {})).json()) as { data: { awb: string } }).data.awb
  await runInDurableObject(t.vault, (_i, st) => recordProviderObservation(st.storage.sql, { slug, eventKey: `rts-${slug}`, source: "poll", rawCategory: "RETURN", mapped: "rts_in_transit", eventAt: Date.now() + 60_000, eventAtText: null }, Date.now()))
  return { slug, awb }
}
const state = (t: Awaited<ReturnType<typeof checkoutGerai>>, slug: string) => runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ status: string; custody_stage: string; conflict: number | null }>("SELECT status, custody_stage, provider_status_conflict_at AS conflict FROM shipments WHERE slug = ?", slug).one())

describe("Meja Retur", () => {
  it("intake → reveal audited → code hashed → wrong code 400 → right code → returned to sender", async () => {
    const t = await checkoutGerai("retursatu")
    const { slug, awb } = await inReturn(t)
    const bad = await post("/returns/intake", t.cookie, { code: awb, condition: "penyok_rusak" })
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("PHOTO_REQUIRED")
    const ok = ((await (await post("/returns/intake", t.cookie, { code: awb, condition: "baik" })).json()) as { data: { slug: string; sender: { name: string; phone: string } } }).data
    expect(ok).toMatchObject({ slug, sender: { name: "Ibu Siti", phone: "081234567890" } })
    expect(await state(t, slug)).toMatchObject({ status: "rts_at_gerai", custody_stage: "rts_at_gerai" })
    expect((await post("/returns/intake", t.cookie, { code: awb, condition: "baik" })).status).toBe(409)
    const audits = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ action: string }>("SELECT action FROM audit_logs WHERE action IN ('true_sender_reveal','return.intake')").toArray().map((a) => a.action))
    expect(audits.sort()).toEqual(["return.intake", "true_sender_reveal"])
    expect(((await (await post(`/returns/${slug}/handback`, t.cookie, { code: "1234" })).json()) as { error: { code: string } }).error.code).toBe("NO_CODE")
    const code = ((await (await post(`/returns/${slug}/code`, t.cookie, {})).json()) as { data: { code: string } }).data.code
    expect(code).toMatch(/^\d{4}$/)
    const stored = await runInDurableObject(t.vault, (_i, st) => st.storage.sql.exec<{ code_hash: string }>("SELECT code_hash FROM return_intakes WHERE slug = ?", slug).one().code_hash)
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
    expect(stored).not.toContain(code)
    const wrong = code === "0000" ? "1111" : "0000"
    expect((await post(`/returns/${slug}/handback`, t.cookie, { code: wrong })).status).toBe(400)
    expect((await post(`/returns/${slug}/handback`, t.cookie, { code })).status).toBe(200)
    expect(await state(t, slug)).toMatchObject({ status: "rts_returned_to_sender", custody_stage: "rts_returned_to_sender" })
    // Code is single use.
    expect((await post(`/returns/${slug}/handback`, t.cookie, { code })).status).toBe(409)
  })

  it("five wrong codes lock; a Kasir cannot use the ID override; the owner can with a reason", async () => {
    const t = await checkoutGerai("returkunci")
    const { slug, awb } = await inReturn(t)
    await post("/returns/intake", t.cookie, { code: awb, condition: "baik" })
    const code = ((await (await post(`/returns/${slug}/code`, t.cookie, {})).json()) as { data: { code: string } }).data.code
    const wrong = code === "0000" ? "1111" : "0000"
    let last = 0
    for (let i = 0; i < 5; i++) last = (await post(`/returns/${slug}/handback`, t.cookie, { code: wrong })).status
    expect(last).toBe(429)
    expect((await post(`/returns/${slug}/handback`, t.cookie, { code })).status).toBe(429)
    const k = await appUser("kasir.retur@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    expect(((await (await post(`/returns/${slug}/handback`, k.cookie, { override: { reason: "KTP dicek" } })).json()) as { error: { code: string } }).error.code).toBe("OWNER_ONLY")
    expect((await post(`/returns/${slug}/handback`, t.cookie, { override: { reason: "x" } })).status).toBe(422)
    expect((await post(`/returns/${slug}/handback`, t.cookie, { override: { reason: "KTP pengirim dicek, sesuai nama" } })).status).toBe(200)
    expect((await state(t, slug)).custody_stage).toBe("rts_returned_to_sender")
  })

  it("custody contradictions: provider `delivered` after intake → Status Bertentangan; custody never undone; not-sent INV refused", async () => {
    const t = await checkoutGerai("returkonflik")
    const { slug, awb } = await inReturn(t)
    await post("/returns/intake", t.cookie, { code: awb, condition: "baik" })
    await runInDurableObject(t.vault, (_i, st) => recordProviderObservation(st.storage.sql, { slug, eventKey: `del-${slug}`, source: "webhook", rawCategory: "DELIVERED", mapped: "delivered", eventAt: Date.now() + 120_000, eventAtText: null }, Date.now()))
    const s = await state(t, slug)
    expect(s).toMatchObject({ status: "rts_at_gerai", custody_stage: "rts_at_gerai" })
    expect(s.conflict).not.toBeNull()
    const kendala = ((await (await appGet("/shipments?tab=kendala", t.cookie)).json()) as { data: { items: Array<{ slug: string }> } }).data.items
    expect(kendala.map((x) => x.slug)).toContain(slug)
    const desk = ((await (await appGet("/returns", t.cookie)).json()) as { data: { open: Array<{ slug: string; conflict: number }> } }).data.open
    expect(desk.find((x) => x.slug === slug)?.conflict).toBe(1)
    // A ready-for-pickup INV never left the outlet: not a return.
    const fresh = await readyInv(t)
    await post(`/shipments/${fresh}/payment`, t.cookie, { method: "qris" }, `rt2-${fresh}`)
    await post(`/shipments/${fresh}/dispatch`, t.cookie, {})
    expect(((await (await post("/returns/intake", t.cookie, { code: fresh, condition: "baik" })).json()) as { error: { code: string } }).error.code).toBe("NOT_SENT")
  })
})
