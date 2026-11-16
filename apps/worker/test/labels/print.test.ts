// TASK-306 printing through the API: label only with an AWB, exact-size PDF, print_count + reprint reason (audited),
// bulk ≤ 50, 58 mm bytes/text, masking resolved from the immutable snapshot.
import { env, exports } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { hostCache } from "../../src/host/lookup"
import { mockSeller, resetMock } from "../../src/mengantar/mock"
import { APP, appGet, appPost } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

const print = (cookie: string, b: unknown) => exports.default.fetch(`${APP}/api/app/print`, { method: "POST", headers: { "content-type": "application/json", origin: APP, cookie }, body: JSON.stringify(b) })

async function issued(t: Awaited<ReturnType<typeof checkoutGerai>>) {
  const slug = await readyInv(t)
  await post(`/shipments/${slug}/payment`, t.cookie, { method: "tunai", cashReceivedIdr: 20000 }, `key-${slug}-pay`)
  expect((await post(`/shipments/${slug}/dispatch`, t.cookie, {})).status).toBe(200)
  return slug
}

describe("print API", () => {
  it("exact 100×150 mm PDF; first print recorded; reprint needs a reason and is audited", async () => {
    const t = await checkoutGerai("cetaksatu")
    const slug = await issued(t)
    const r = await print(t.cookie, { slugs: [slug], format: "label_10x15_with_stub" })
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toBe("application/pdf")
    const pdf = new TextDecoder("latin1").decode(new Uint8Array(await r.arrayBuffer()))
    expect(pdf).toMatch(/\/MediaBox \[0 0 283\.465 425\.197\]/)
    expect(pdf).toContain("LUNAS \\267 TUNAI Rp 20.000")
    const again = await print(t.cookie, { slugs: [slug], format: "label_10x15_with_stub" })
    expect(again.status).toBe(422)
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe("REPRINT_REASON_REQUIRED")
    expect((await print(t.cookie, { slugs: [slug], format: "label_10x10", reason: "label sobek" })).status).toBe(200)
    const s = await runInDurableObject(t.vault, (_i: GeraiVaultDO, st) => st.storage.sql.exec<{ print_count: number; first_printed_at: number }>("SELECT print_count, first_printed_at FROM shipments WHERE slug = ?", slug).one())
    expect(s.print_count).toBe(2)
    expect(s.first_printed_at).toBeGreaterThan(0)
    const audit = await runInDurableObject(t.vault, (_i: GeraiVaultDO, st) => st.storage.sql.exec<{ metadata_json: string }>("SELECT metadata_json FROM audit_logs WHERE action = 'label.reprint'").toArray())
    expect(JSON.parse(audit[0]!.metadata_json)).toMatchObject({ slug, reason: "label sobek" })
    // Preview never records.
    expect((await print(t.cookie, { slugs: [slug], format: "label_10x10", preview: true })).status).toBe(200)
    expect((await runInDurableObject(t.vault, (_i: GeraiVaultDO, st) => st.storage.sql.exec<{ print_count: number }>("SELECT print_count FROM shipments WHERE slug = ?", slug).one())).print_count).toBe(2)
  })

  it("no AWB → no label (draft and unpaid hold refused)", async () => {
    const t = await checkoutGerai("cetakdua")
    const draft = await readyInv(t)
    const d = await print(t.cookie, { slugs: [draft] })
    expect(d.status).toBe(409)
    expect(((await d.json()) as { error: { code: string } }).error.code).toBe("NO_AWB")
    mockSeller.balanceIdr = 0
    const hold = await readyInv(t)
    await post(`/shipments/${hold}/dispatch`, t.cookie, {})
    const h = await print(t.cookie, { slugs: [hold] })
    expect(((await h.json()) as { error: { message: string } }).error.message).toBe("Resi belum terbit (menunggu saldo Mengantar).")
  })

  it("bulk: up to 50, merged pages, unprintable ones reported; list filters Belum/Sudah Cetak", async () => {
    const t = await checkoutGerai("cetakmassal")
    const a = await issued(t)
    const b = await issued(t)
    const draft = await readyInv(t)
    const list = ((await (await appGet("/print/list?status=belum", t.cookie)).json()) as { data: { items: Array<{ slug: string }> } }).data.items
    expect(list.map((x) => x.slug).sort()).toEqual([a, b].sort())
    const r = await print(t.cookie, { slugs: [a, b, draft], format: "label_10x10" })
    expect(r.headers.get("x-refused")).toBe("1")
    const pdf = new TextDecoder("latin1").decode(new Uint8Array(await r.arrayBuffer()))
    expect((pdf.match(/\/Type \/Page /g) ?? []).length).toBe(2)
    expect(((await (await appGet("/print/list?status=sudah", t.cookie)).json()) as { data: { items: unknown[] } }).data.items).toHaveLength(2)
    // 51 distinct valid slugs → refused before any work (bulk ≤ 50).
    const alphabet = "0123456789abcdefghjkmnpqrstvwxyz"
    const fiftyOne = Array.from({ length: 51 }, (_, i) => `aaaaa${alphabet[Math.floor(i / 32)]}${alphabet[i % 32]}`)
    expect(new Set(fiftyOne).size).toBe(51)
    const tooMany = await print(t.cookie, { slugs: fiftyOne })
    expect(tooMany.status).toBe(422)
    expect(((await tooMany.json()) as { error: { code: string; message: string } }).error).toMatchObject({ code: "BULK_LIMIT", message: "Pilih 1 sampai 50 kiriman untuk dicetak." })
  })

  it("58 mm: text lines are 32 columns and the masked Dropship receipt shows the reseller, not the outlet", async () => {
    const t = await checkoutGerai("cetakroll")
    await env.DB.prepare("UPDATE tenants SET masking_enabled = 1, masking_daily_quota = 20 WHERE id = ?").bind(t.tenantId).run()
    await appPost("/settings/masking", t.cookie, { offered: true, presetsEnabled: ["dropship_toko"], defaultPreset: "dropship_toko" })
    await appPost(`/contacts/senders/${t.sender}`, t.cookie, { senderKind: "reseller_dropship", brandName: "TOKO HIJAB NISA", brandPhone: "081299990000", phone: "081234567890" })
    await appPost(`/contacts/senders/${t.sender}/verify-wa`, t.cookie, {})
    const slug = await readyInv(t)
    await appPost(`/shipments/${slug}/parties`, t.cookie, { maskPreset: "dropship_toko" })
    await post(`/shipments/${slug}/dispatch`, t.cookie, {})
    const r = await print(t.cookie, { slugs: [slug], format: "roll_58mm", as: "text", preview: true })
    const lines = ((await r.json()) as { data: { lines: string[][] } }).data.lines[0]!
    for (const l of lines) expect(l.length).toBe(32)
    const all = lines.join("\n")
    expect(all).toContain("TOKO HIJAB NISA")
    // The outlet's name and WhatsApp never print on a Dropship parcel (the tracking host is allowed, visual 04 §4:
    // the /lacak page itself shows only the reseller brand).
    const outlet = await runInDurableObject(t.vault, (_i: GeraiVaultDO, st) => st.storage.sql.exec<{ name: string; pic_phone: string }>("SELECT name, pic_phone FROM tenant_outlets WHERE is_default = 1").one())
    const withoutUrl = all.split("\n").filter((l) => !/geraimitra\.localhost|\/lacak\//.test(l)).join("\n")
    expect(withoutUrl.toUpperCase()).not.toContain(outlet.name.toUpperCase())
    expect(all).not.toContain(outlet.pic_phone)
    const bytes = await print(t.cookie, { slugs: [slug], format: "roll_58mm", preview: true })
    expect(bytes.headers.get("content-type")).toBe("application/octet-stream")
    expect([...new Uint8Array(await bytes.arrayBuffer()).slice(0, 2)]).toEqual([0x1b, 0x40])
  })
})
