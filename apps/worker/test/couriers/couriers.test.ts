// TASK-206: courier catalog + per-outlet preferences + area search cache.
import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { beforeEach, describe, expect, it } from "vitest"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { searchAreas } from "../../src/couriers/areas"
import { mergeCouriers, pickupOptions, type CatalogService } from "../../src/couriers/catalog"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { appGet, appPost, seedConnected } from "../webhooks/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

type Row = { courierCode: string; name: string; enabled: boolean; pickupMode: string; pickupOptions: string[]; services: Array<{ serviceCode: string; serviceClass: string; cod: boolean }> }
const list = async (cookie: string) => ((await (await appGet("/settings/couriers", cookie)).json()) as { data: { items: Row[] } }).data.items

describe("catalog", () => {
  it("seeded from verified rules: Ninja inactive, Anteraja pickup-only, cargo Non-COD, live rounding tolerances", async () => {
    const rows = (await env.DB.prepare("SELECT service_code, courier_code, service_class, pickup_capability, cod_supported, is_active, rounding_tolerance_gram FROM courier_service_catalog").all<Record<string, unknown>>()).results
    const by = Object.fromEntries(rows.map((r) => [r.service_code as string, r]))
    expect(by.ninja).toMatchObject({ is_active: 0 })
    expect(by.anteraja).toMatchObject({ pickup_capability: "pickup_only" })
    for (const r of rows.filter((r) => r.service_class === "cargo")) expect(r.cod_supported).toBe(0)
    expect(by.lion).toMatchObject({ rounding_tolerance_gram: 300 })
    expect(by.Sap).toMatchObject({ rounding_tolerance_gram: 299 })
    expect(by.spx).toMatchObject({ rounding_tolerance_gram: 299 })
    expect(by.JNE).toMatchObject({ rounding_tolerance_gram: 300 })
  })

  it("pickup options follow the services' capabilities", () => {
    expect(pickupOptions(["pickup_only"])).toEqual(["scheduled_pickup"])
    expect(pickupOptions(["drop_off_only"])).toEqual(["drop_off_only"])
    expect(pickupOptions(["pickup_and_drop_off", "pickup_only"])).toEqual(["scheduled_pickup", "drop_off_only"])
  })

  it("a catalog change needs no code change: a new service row appears; a deactivated courier disappears", () => {
    const base: CatalogService = { service_code: "X", courier_code: "X", courier_name: "Kurir X", display_name: "X Reguler", service_class: "regular", pickup_capability: "drop_off_only", cod_supported: 1, is_active: 1, sort_order: 1, note: null }
    const rows = mergeCouriers([base, { ...base, service_code: "XCargo", display_name: "X Cargo", service_class: "cargo", cod_supported: 0 }], [{ courier_code: "X", enabled: 0, pickup_mode: "scheduled_pickup", updated_at: 1 }])
    expect(rows).toHaveLength(1)
    // An invalid stored mode (catalog changed to drop-off only) falls back to a supported one.
    expect(rows[0]).toMatchObject({ enabled: false, pickupMode: "drop_off_only", pickupOptions: ["drop_off_only"] })
    expect(rows[0]!.services.map((s) => s.serviceCode)).toEqual(["X", "XCargo"])
  })
})

describe("Ekspedisi Aktif (instant save)", () => {
  it("defaults to all active couriers enabled; toggling persists in the tenant object with an audit row", async () => {
    const t = await seedConnected("kurir")
    const rows = await list(t.cookie)
    expect(rows.map((r) => r.courierCode)).not.toContain("ninja")
    expect(rows.every((r) => r.enabled)).toBe(true)
    expect(rows.find((r) => r.courierCode === "anteraja")).toMatchObject({ pickupMode: "scheduled_pickup", pickupOptions: ["scheduled_pickup"] })
    const off = await appPost("/settings/couriers/JT", t.cookie, { enabled: false })
    expect(off.status).toBe(200)
    expect(((await off.json()) as { data: Row }).data).toMatchObject({ courierCode: "JT", enabled: false })
    expect((await list(t.cookie)).find((r) => r.courierCode === "JT")!.enabled).toBe(false)
    const mode = await appPost("/settings/couriers/JNE", t.cookie, { pickupMode: "drop_off_only" })
    expect(((await mode.json()) as { data: Row }).data).toMatchObject({ enabled: true, pickupMode: "drop_off_only" })
    const audits = await runInDurableObject(t.vault, (_i: GeraiVaultDO, s) => s.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'courier.preference_changed'").one().n)
    expect(audits).toBe(2)
  })

  it("rejects an unsupported pickup mode, an unknown or inactive courier, and cashiers", async () => {
    const t = await seedConnected("kurir2")
    const bad = await appPost("/settings/couriers/anteraja", t.cookie, { pickupMode: "drop_off_only" })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { error: { message: string } }).error.message).toBe("Anteraja tidak mendukung pilihan penjemputan ini.")
    expect((await appPost("/settings/couriers/ninja", t.cookie, { enabled: true })).status).toBe(404)
    expect((await appPost("/settings/couriers/JNE", t.cookie, { enabled: "ya" })).status).toBe(400)
    const k = await seedConnected("kurir3", { role: "cashier" })
    expect((await appGet("/settings/couriers", k.cookie)).status).toBe(403)
    expect((await appPost("/settings/couriers/JNE", k.cookie, { enabled: false })).status).toBe(403)
  })
})

describe("area search cache (KV only caches area search)", () => {
  it("miss then hit for the same normalised keyword; short keywords skip both", async () => {
    await env.CACHE_KV.delete("area:v2:dago")
    expect((await searchAreas(env, "  DAGO ")).cache).toBe("miss")
    const hit = await searchAreas(env, "dago")
    expect(hit.cache).toBe("hit")
    expect(hit.items[0]).toMatchObject({ id: "5fc62f5df8f44b34aa4c0d8c", postalCode: "40135", district: "Coblong", subdistrict: "Dago", city: "Kota Bandung" })
    expect((await searchAreas(env, "da")).cache).toBe("skip")
  })

  it("refuses unconfigured non-mock area search with clean 503 instead of calling Mengantar with a fake key", async () => {
    await env.CACHE_KV.delete("area:v2:coblong")
    const liveEnv = { ...env, GX_ENV: "production" as const, MENGANTAR_PUBLIC_ORIGIN: "https://api-public.mengantar.com" as const, MENGANTAR_PUBLIC_READ_KEY: undefined }
    await expect(searchAreas(liveEnv, "coblong")).rejects.toMatchObject({ status: 503, code: "AREA_SEARCH_UNAVAILABLE" })
    expect(await env.CACHE_KV.get("area:v2:coblong")).toBeNull()
  })
})
