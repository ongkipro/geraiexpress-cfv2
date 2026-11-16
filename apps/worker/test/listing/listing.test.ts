// TASK-311 Kiriman list (DEC-213/220): two-tenant isolation, Kasir projection (no cost columns, CSV 403), payment-state
// tab + `Tandai Lunas` row action, search, keyset pages, CSV snapshot with the formula-injection guard.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { ownerOnlyKeysIn } from "../../src/dto/projection"
import { appUser } from "../onboarding/helpers"
import { appGet } from "../webhooks/helpers"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Row = { slug: string; counter_payment_status: string; awb_number: string | null; effective_gerai_cost_idr?: number; estimated_margin_idr?: number; recipient: string }
type List = { items: Row[]; nextCursor: string | null; counts: Record<string, number> }
const list = async (cookie: string, qs = "") => ((await (await appGet(`/shipments${qs}`, cookie)).json()) as { data: List }).data

async function issued(t: Awaited<ReturnType<typeof checkoutGerai>>, paid: boolean) {
  const s = await readyInv(t)
  if (paid) await post(`/shipments/${s}/payment`, t.cookie, { method: "qris" }, `l-${s}`)
  expect((await post(`/shipments/${s}/dispatch`, t.cookie, {})).status).toBe(200)
  return s
}

describe("Kiriman list", () => {
  it("two tenants never see each other's INVs, even by exact INV or AWB search", async () => {
    const a = await checkoutGerai("listaa")
    const b = await checkoutGerai("listbb")
    const sa = await issued(a, true)
    const sb = await issued(b, true)
    const la = await list(a.cookie)
    expect(la.items.map((r) => r.slug)).toEqual([sa])
    const awbB = (await list(b.cookie)).items[0]!.awb_number!
    expect((await list(a.cookie, `?q=${sb}`)).items).toHaveLength(0)
    expect((await list(a.cookie, `?q=${awbB}`)).items).toHaveLength(0)
    expect((await list(b.cookie, `?q=INV%20${sb.toUpperCase()}`)).items.map((r) => r.slug)).toEqual([sb])
  })

  it("Belum Dibayar tab + Tandai Lunas row action moves the INV out of the tab; counts follow", async () => {
    const t = await checkoutGerai("listbayar")
    const paid = await issued(t, true)
    const unpaid = await issued(t, false)
    const draft = await readyInv(t)
    void draft
    const all = await list(t.cookie)
    expect(all.items.map((r) => r.slug).sort()).toEqual([paid, unpaid].sort())
    expect(all.counts).toMatchObject({ semua: 2, "belum-dibayar": 1, pickup: 2 })
    expect((await list(t.cookie, "?tab=belum-dibayar")).items.map((r) => r.slug)).toEqual([unpaid])
    expect((await post(`/shipments/${unpaid}/payment`, t.cookie, { method: "tunai", cashReceivedIdr: 20000 }, `row-${unpaid}`)).status).toBe(200)
    const after = await list(t.cookie, "?tab=belum-dibayar")
    expect(after.items).toHaveLength(0)
    expect(after.counts["belum-dibayar"]).toBe(0)
  })

  it("Kasir: no cost or margin keys in rows; CSV export 403", async () => {
    const t = await checkoutGerai("listkasir")
    await issued(t, true)
    const k = await appUser("kasir.list@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    const kl = await list(k.cookie)
    expect(kl.items).toHaveLength(1)
    expect(ownerOnlyKeysIn(kl)).toEqual([])
    expect(kl.items[0]).not.toHaveProperty("estimated_margin_idr")
    expect((await list(t.cookie)).items[0]).toHaveProperty("estimated_margin_idr")
    expect((await appGet("/shipments-export.csv", k.cookie)).status).toBe(403)
  })

  it("search by recipient name/phone, keyset pagination, and the owner CSV snapshot", async () => {
    const t = await checkoutGerai("listcsv")
    const slugs = [await issued(t, true), await issued(t, true), await issued(t, false)]
    expect((await list(t.cookie, "?q=rina")).items).toHaveLength(3)
    expect((await list(t.cookie, "?q=0857-1234-8821")).items).toHaveLength(3)
    expect((await list(t.cookie, "?q=tidakada")).items).toHaveLength(0)
    const p1 = await list(t.cookie, "?limit=2")
    expect(p1.items).toHaveLength(2)
    const p2 = await list(t.cookie, `?limit=2&cursor=${encodeURIComponent(p1.nextCursor!)}`)
    expect(p2.items).toHaveLength(1)
    expect(p2.nextCursor).toBeNull()
    expect(new Set([...p1.items, ...p2.items].map((r) => r.slug))).toEqual(new Set(slugs))

    // Fix times and a hostile recipient name for a stable snapshot.
    await runInDurableObject(t.vault, (_i, s) => {
      s.storage.sql.exec("UPDATE shipments SET created_at = ? WHERE slug = ?", Date.UTC(2026, 10, 14, 3, 0), slugs[0]!)
      s.storage.sql.exec("UPDATE recipient_contacts SET name = '=HYPERLINK(\"x\")'")
    })
    const res2 = await appGet(`/shipments-export.csv?dari=2026-11-14&sampai=2026-11-14&q=${slugs[0]}`, t.cookie)
    expect(res2.status).toBe(200)
    expect(res2.headers.get("content-type")).toContain("text/csv")
    const csv = (await res2.text()).replace(/^\uFEFF/, "")
    const lines = csv.trim().split("\r\n")
    expect(lines[0]).toBe("INV,Dibuat (WIB),Kurir,Layanan,Resi,Pengirim,Penerima,Kecamatan,Mode COD,Tagihan Loket,Total COD,Pembayaran,Cara Bayar,Status,Biaya Gerai,Estimasi Laba")
    const cells = lines[1]!.split(",")
    expect(cells[0]).toBe(`INV ${slugs[0]!.toUpperCase()}`)
    expect(cells[1]).toBe("2026-11-14 10:00")
    expect(cells[2]).toBe("JT")
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(cells.slice(-5, -2)).toEqual(["paid", "qris", "ready_for_pickup"])
    expect(Number(cells.at(-1))).toBeGreaterThan(0)
  })
})
