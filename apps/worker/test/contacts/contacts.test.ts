// TASK-302 contacts: validation in Indonesian, WA verification reset on phone change, owner-only deposit, local risk
// badge, risk index lost-ack retry.
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { phoneHmac } from "../../src/admin/monitor"
import { d1UpsertStatement } from "../../src/do/gerai-vault/core/outbox"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { appUser } from "../onboarding/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"
import { APP, appGet, appPost, seedConnected } from "../webhooks/helpers"

const AREA = "5fc62f5df8f44b34aa4c0d8c"

async function withCashier(tenantId: string, email: string) {
  const k = await appUser(email)
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(tenantId, k.id, Date.now()),
    env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(tenantId, k.id),
  ])
  return k
}

describe("Kontak › Pengirim", () => {
  it("creates with normalised phone, validates in Indonesian, resets WA verification when the phone changes", async () => {
    const o = await seedConnected("kontaksatu")
    const bad = await appPost("/contacts/senders", o.cookie, { name: "", phone: "021-5551234", senderKind: "reseller_dropship" })
    expect(bad.status).toBe(422)
    const be = (await bad.json()) as { error: { field_errors: Record<string, string> } }
    expect(be.error.field_errors).toMatchObject({ name: "Isi nama pengirim (maks. 80 huruf).", phone: "Nomor WhatsApp tidak valid. Contoh: 0812-3456-7890.", brandName: "Toko reseller wajib punya nama toko untuk label." })
    const r = await appPost("/contacts/senders", o.cookie, { name: "Ibu Siti Nisa", phone: "+62 812-3456-7890", senderKind: "reseller_dropship", brandName: "TOKO HIJAB NISA" })
    expect(r.status).toBe(201)
    const s = ((await r.json()) as { data: { item: { id: string; true_phone: string; wa_verified_at: number | null } } }).data.item
    expect(s.true_phone).toBe("081234567890")
    const v = ((await (await appPost(`/contacts/senders/${s.id}/verify-wa`, o.cookie, {})).json()) as { data: { item: { wa_verified_at: number | null; wa_verified_by: string } } }).data.item
    expect(v.wa_verified_at).not.toBeNull()
    expect(v.wa_verified_by).toBe(o.userId)
    // Name change keeps the verification; phone change clears it.
    const n = ((await (await appPost(`/contacts/senders/${s.id}`, o.cookie, { name: "Siti Nisa" })).json()) as { data: { item: { wa_verified_at: number | null } } }).data.item
    expect(n.wa_verified_at).not.toBeNull()
    const p = ((await (await appPost(`/contacts/senders/${s.id}`, o.cookie, { phone: "0813-0000-1111" })).json()) as { data: { item: { wa_verified_at: number | null; true_phone: string } } }).data.item
    expect(p).toMatchObject({ wa_verified_at: null, true_phone: "081300001111" })
    // Search by name, brand and any phone format; filter by kind.
    for (const q of ["nisa", "HIJAB", "62813 0000 1111"]) {
      const l = ((await (await appGet(`/contacts/senders?q=${encodeURIComponent(q)}`, o.cookie)).json()) as { data: { items: unknown[] } }).data.items
      expect(l, q).toHaveLength(1)
    }
    const walk = ((await (await appGet("/contacts/senders?jenis=walk_in", o.cookie)).json()) as { data: { items: unknown[]; counts: { all: number; reseller_dropship: number } } }).data
    expect(walk.items).toHaveLength(0)
    expect(walk.counts).toMatchObject({ all: 1, reseller_dropship: 1 })
  })

  it("deposit is owner-only on the wire; a Kasir can verify WA but cannot archive", async () => {
    const o = await seedConnected("kontakdua")
    const s = ((await (await appPost("/contacts/senders", o.cookie, { name: "Pak Hendra", phone: "081211112222" })).json()) as { data: { item: { id: string; deposit_balance_idr: number } } }).data.item
    expect(s.deposit_balance_idr).toBe(0)
    const k = await withCashier(o.tenantId, "kasir.kontak@contoh.test")
    const list = await (await appGet("/contacts/senders", k.cookie)).json()
    expect(ownerOnlyKeysIn(list)).toEqual([])
    expect((await appPost(`/contacts/senders/${s.id}/verify-wa`, k.cookie, {})).status).toBe(200)
    expect((await appPost(`/contacts/senders/${s.id}/archive`, k.cookie, {})).status).toBe(403)
    expect((await appPost(`/contacts/senders/${s.id}/archive`, o.cookie, {})).status).toBe(200)
    expect(((await (await appGet("/contacts/senders", o.cookie)).json()) as { data: { items: unknown[] } }).data.items).toHaveLength(0)
  })
})

describe("Kontak › Penerima and the COD risk badge", () => {
  it("validates address and area; badge from own counts; risk index upsert survives a lost ack", async () => {
    const o = await seedConnected("kontaktiga")
    const bad = await appPost("/contacts/recipients", o.cookie, { name: "Rina", phone: "0857", street: "Dago" })
    expect(((await bad.json()) as { error: { field_errors: Record<string, string> } }).error.field_errors).toMatchObject({ phone: expect.any(String), street: "Alamat minimal dua kata dan tanpa tautan.", areaId: "Pilih kecamatan tujuan dari daftar." })
    const r = ((await (await appPost("/contacts/recipients", o.cookie, { name: "Rina Kartika", phone: "0857-1234-8821", street: "Jl. Dago Asri No. 14", areaId: AREA, areaLabel: "Dago, Coblong", postalCode: "40135" })).json()) as { data: { item: { id: string; risk: { badge: string } } } }).data.item
    expect(r.risk.badge).toBe("baru")
    // Two delivered and one RTS → 33 % → kuning.
    for (const o2 of ["delivered", "delivered", "rts"] as const) await o.vault.recordRecipientCodOutcome(o.tenantId, r.id, o2)
    const badge = ((await (await appGet("/contacts/risk-badge?phone=%2B6285712348821", o.cookie)).json()) as { data: { badge: { badge: string; delivered: number; rts: number; rtsBps: number } } }).data.badge
    expect(badge).toMatchObject({ badge: "kuning", delivered: 2, rts: 1, rtsBps: 3333 })
    // The object's alarm delivers the newest absolute row; then a lost-ack retry of an older and the same version
    // must leave D1 unchanged (versioned absolute upsert).
    const key = await phoneHmac(env.AUTH_SESSION_PEPPER, "6285712348821")
    await o.vault.flushOutbox(Date.now() + 60_000)
    const sel = () => env.DB.prepare("SELECT delivered_count, rts_count, version FROM recipient_risk_index WHERE phone_hmac = ? AND tenant_id = ?").bind(key, o.tenantId).first()
    expect(await sel()).toEqual({ delivered_count: 2, rts_count: 1, version: 3 })
    const row = (version: number, d: number, t: number) => ({ id: 0, topic: "recipient_risk_index" as const, entity_key: key, version, payload_json: JSON.stringify({ delivered_count: d, rts_count: t, last_event_at: 1 }), attempts: 0, next_attempt_at: 0 })
    await d1UpsertStatement(env.DB, o.tenantId, row(1, 1, 0)).run()
    await d1UpsertStatement(env.DB, o.tenantId, row(3, 99, 99)).run()
    expect(await sel()).toEqual({ delivered_count: 2, rts_count: 1, version: 3 })
    // No plain phone anywhere in D1.
    const leak = await env.DB.prepare("SELECT COUNT(*) AS n FROM recipient_risk_index WHERE phone_hmac LIKE '%8821%'").first<{ n: number }>()
    expect(leak!.n).toBe(0)
  })
})

describe("media", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  it("uploads into t/<tenant>/…, refuses non-images and Kasir logos, serves only with a valid signature", async () => {
    const o = await seedConnected("mediasatu")
    const up = await exports.default.fetch(`${APP}/api/app/media?purpose=evidence`, { method: "POST", headers: { origin: APP, cookie: o.cookie, "content-type": "application/octet-stream" }, body: png })
    expect(up.status).toBe(201)
    const { id, url } = ((await up.json()) as { data: { id: string; url: string } }).data
    const k = await runInDurableObject(o.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ r2_key: string }>("SELECT r2_key FROM media_objects WHERE id = ?", id).one().r2_key)
    expect(k).toMatch(new RegExp(`^t/${o.tenantId}/evidence/[0-9a-f-]{36}\\.png$`))
    const get = await exports.default.fetch(`${APP}${url}`, { headers: { cookie: o.cookie } })
    expect(get.status).toBe(200)
    expect(get.headers.get("content-type")).toBe("image/png")
    expect((await exports.default.fetch(`${APP}${url.replace(/sig=[0-9a-f]+/, "sig=" + "0".repeat(64))}`, { headers: { cookie: o.cookie } })).status).toBe(403)
    const txt = await exports.default.fetch(`${APP}/api/app/media?purpose=evidence`, { method: "POST", headers: { origin: APP, cookie: o.cookie }, body: "hello, I am not a picture" })
    expect(txt.status).toBe(415)
    const kas = await withCashier(o.tenantId, "kasir.media@contoh.test")
    expect((await exports.default.fetch(`${APP}/api/app/media?purpose=logo`, { method: "POST", headers: { origin: APP, cookie: kas.cookie }, body: png })).status).toBe(403)
  })
})

describe("Contact shipment history, live counts, pagination & INV Mengantar sync", () => {
  it("computes live shipments_count, returns paginated contact history with checkpoints, and syncs live Mengantar status on INV", async () => {
    const t = await checkoutGerai("kontakriwayat")
    const slug = await readyInv(t)
    await post(`/shipments/${slug}/payment`, t.cookie, { method: "tunai", cashReceivedIdr: 20000 }, `pay-${slug}`)
    expect((await post(`/shipments/${slug}/dispatch`, t.cookie, {})).status).toBe(200)

    // Live shipments_count on both sender and recipient lists with 20/page pagination metadata.
    const sendersRes = ((await (await appGet("/contacts/senders?page=1&limit=20", t.cookie)).json()) as {
      data: { items: Array<{ id: string; shipments_count: number }>; page: number; pageSize: number; total: number; totalPages: number }
    }).data
    expect(sendersRes).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 })
    expect(sendersRes.items[0]!.shipments_count).toBe(1)

    const recipientsRes = ((await (await appGet("/contacts/recipients?page=1&limit=20", t.cookie)).json()) as {
      data: { items: Array<{ id: string; shipments_count: number }>; page: number; pageSize: number; total: number; totalPages: number }
    }).data
    expect(recipientsRes).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 })
    expect(recipientsRes.items[0]!.shipments_count).toBe(1)

    // Sync live status from Mengantar on INV (`POST /shipments/:slug/sync`) → persists checkpoints into shipment_events.
    const syncRes = await appPost(`/shipments/${slug}/sync`, t.cookie, {})
    expect(syncRes.status).toBe(200)
    const syncData = ((await syncRes.json()) as { data: { synced: boolean; status: string } }).data
    expect(syncData.synced).toBe(true)

    // Contact history returns the actual shipment with summary counters & latest checkpoint.
    const sHist = ((await (await appGet(`/contacts/senders/${t.sender}/shipments?page=1&limit=20`, t.cookie)).json()) as {
      data: { items: Array<{ slug: string; counterparty_id: string | null }>; summary: { total: number }; page: number; pageSize: number; total: number }
    }).data
    expect(sHist).toMatchObject({ page: 1, pageSize: 20, total: 1 })
    expect(sHist.summary.total).toBe(1)
    expect(sHist.items[0]!.slug).toBe(slug)
    expect(sHist.items[0]!.counterparty_id).toBe(t.recipient)

    const rHist = ((await (await appGet(`/contacts/recipients/${t.recipient}/shipments?page=1&limit=20`, t.cookie)).json()) as {
      data: { items: Array<{ slug: string; counterparty_id: string | null }>; summary: { total: number } }
    }).data
    expect(rHist.summary.total).toBe(1)
    expect(rHist.items[0]!.slug).toBe(slug)
    expect(rHist.items[0]!.counterparty_id).toBe(t.sender)

    // Numbered pagination on /shipments returns page/pageSize/total/totalPages.
    const listRes = ((await (await appGet("/shipments?page=1&limit=20", t.cookie)).json()) as {
      data: { items: Array<{ slug: string }>; page: number; pageSize: number; total: number; totalPages: number }
    }).data
    expect(listRes).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 })
    expect(listRes.items[0]!.slug).toBe(slug)
  })
})
