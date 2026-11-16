// TASK-301 role projection: cashier responses never contain cost, discount, margin, cashback or balance fields.
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { ownerOnlyKeysIn, projectFor } from "../../src/dto/projection"
import { appUser } from "../onboarding/helpers"
import { appGet, seedConnected } from "../webhooks/helpers"
import { ROUTES } from "../../src/api/registry"
import "../../src/index"

describe("projectFor", () => {
  const quote = { slug: "8k4m2p7", publish_shipping_idr: 12000, provider_net_shipping_idr: 9599, assigned_bps: 2000, nested: { lines: [{ marginIdr: 2401, label: "Ongkir" }] }, synced_balance_idr: 500000, cashback_bps: 100 }
  it("owner sees everything; cashier gets a deep copy without owner-only keys", () => {
    expect(projectFor("gerai_admin", quote)).toBe(quote)
    const k = projectFor("cashier", quote)
    expect(ownerOnlyKeysIn(k)).toEqual([])
    expect(k).toEqual({ slug: "8k4m2p7", publish_shipping_idr: 12000, nested: { lines: [{ label: "Ongkir" }] } })
    expect(quote.provider_net_shipping_idr).toBe(9599) // input untouched
  })
})

describe("per-role DTOs on the wire", () => {
  it("owner workspace: Keuangan + owner hints; cashier: no Keuangan, no owner-only fields", async () => {
    const o = await seedConnected("shellpemilik")
    const ow = (await (await appGet("/workspace", o.cookie)).json()) as { data: { menus: string[]; role: string; tenant: { miniSiteHost: string } } }
    expect(ow.data.menus).toEqual(["dashboard", "buat-pengiriman", "kiriman", "kontak", "keuangan", "pengaturan"])
    expect(ow.data.tenant.miniSiteHost).toBe("shellpemilik.geraimitra.localhost")
    const k = await appUser("kasir.shell@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(o.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(o.tenantId, k.id),
    ])
    const kr = (await (await appGet("/workspace", k.cookie)).json()) as { data: { menus: string[]; role: string; hints: { mengantarWebhook: unknown } } }
    expect(kr.data.role).toBe("cashier")
    expect(kr.data.menus).toEqual(["dashboard", "buat-pengiriman", "kiriman", "kontak", "pengaturan"])
    expect(kr.data.hints.mengantarWebhook).toBeNull()
    expect(ownerOnlyKeysIn(kr.data)).toEqual([])
    // Every owner-only settings/finance route refuses a cashier.
    for (const p of ["/settings/couriers", "/settings/mengantar"]) expect((await appGet(p, k.cookie)).status).toBe(403)
  })

  it("a gerai under review has no workspace yet (the SPA shows the application status)", async () => {
    const o = await seedConnected("shellreview")
    await env.DB.prepare("UPDATE tenants SET status = 'pending_review' WHERE id = ?").bind(o.tenantId).run()
    const r = await appGet("/workspace", o.cookie)
    expect(r.status).toBe(403)
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("NO_MEMBERSHIP")
  })

  it("every app route that returns money-bearing data declares the role projection (owner-only files excepted)", () => {
    const moneyish = ROUTES.filter((r) => r.context === "app" && /settings|workspace|tarif|keuangan|kiriman|quote|shipment|shift|bulk|dashboard|print|track|members|masking|contacts/.test(r.path))
    expect(moneyish.length).toBeGreaterThan(20)
    for (const r of moneyish) {
      // A non-JSON owner-only download (CSV, template) may skip the projection only when Kasir can never reach it.
      if (r.projection !== "role") expect(r.auth === "app_owner" || r.path.endsWith("template.csv"), `${r.method} ${r.path}`).toBe(true)
      else expect(r.projection).toBe("role")
    }
  })

  it("M3 Kasir sweep: every list/detail GET a Kasir can reach carries no owner-only key", async () => {
    const { checkoutGerai, post, readyInv } = await import("../dispatch/helpers")
    const t = await checkoutGerai("sweepkasir")
    const s = await readyInv(t, { mode: "sender_bears_fee", codGoodsIdr: 150000 })
    await post(`/shipments/${s}/dispatch`, t.cookie, {})
    const k = await appUser("kasir.sweep@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(t.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(t.tenantId, k.id),
    ])
    // A reconciled COD credit and a weight adjustment (Book 2) are on the row: they must never reach a Kasir.
    const { runInDurableObject } = await import("cloudflare:test")
    await runInDurableObject(t.vault, (_i, st) => {
      st.storage.sql.exec("UPDATE shipments SET reconciled_provider_cod_credit_idr = 141000, reconciled_extra_adjustment_idr = 4000 WHERE slug = ?", s)
      st.storage.sql.exec("INSERT INTO finance_discrepancies (id, kind, invoice_id, shipment_slug, expected_idr, actual_idr, detail, created_at) VALUES ('d-sweep', 'adjustment', 'inv-sweep', ?, NULL, -4000, 'penyesuaian', 1)", s)
    })
    const paths = ["/workspace", "/dashboard", "/shipments", `/shipments/${s}`, "/shift", "/shifts", "/bulk", "/print/list?status=semua", `/track?q=${s}`, "/contacts/senders", "/contacts/recipients", "/notifications", "/masking", "/exceptions?bucket=selisih_berat", "/returns", "/pickup"]
    for (const p of paths) {
      const r = await appGet(p, k.cookie)
      expect(r.status, p).toBe(200)
      const body = await r.json()
      expect(ownerOnlyKeysIn(body), p).toEqual([])
      // Independent of the key list itself (removing a key from OWNER_ONLY_KEYS must still fail here).
      const raw = JSON.stringify(body)
      for (const k of ["reconciled_provider_cod_credit_idr", "reconciled_extra_adjustment_idr", "adjustment_idr", "provider_net_shipping_idr", "effective_gerai_cost_idr"]) expect(raw, `${p} ${k}`).not.toContain(`"${k}"`)
    }
    const det = (await (await appGet(`/shipments/${s}`, k.cookie)).json()) as { data: { shipment: { cod_credit_settled: boolean } } }
    expect(det.data.shipment.cod_credit_settled).toBe(true)
    // The same owner response does carry the money fields (the projection is doing the work).
    expect(ownerOnlyKeysIn(await (await appGet(`/shipments/${s}`, t.cookie)).json()).length).toBeGreaterThan(0)
  })
})
