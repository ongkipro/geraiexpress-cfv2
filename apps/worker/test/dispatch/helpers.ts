// Fixtures for checkout/dispatch tests: a connected gerai with an outlet, 20 % rules, a verified sender, a recipient
// in the destination area, and a frozen quote for one INV.
import { env, exports } from "cloudflare:workers"
import { expect } from "vitest"
import { partnerClient } from "../../src/mengantar/factory"
import { APP, appPost, seedConnected } from "../webhooks/helpers"

export const ORIGIN = "5fc62f5df8f44b34aa4c0d8c"
export const DEST = "5fc64714f8f44b34aa4cdd60"

export async function checkoutGerai(slug: string) {
  const t = await seedConnected(slug)
  // A real (mock) seller so POST /order works with this gerai's key.
  const reg = await partnerClient(env).register({ name: slug, email: `${slug}@seller.test`, phone: "081200000000", externalUserId: t.tenantId })
  if (reg.kind !== "ok" || !reg.data.apiKey) throw new Error("mock register failed")
  await t.vault.recordOnboarding(t.tenantId, { environment: "sandbox", state: "connected", sellerId: reg.data.sellerId, externalUserId: t.tenantId, apiKey: reg.data.apiKey })
  await t.vault.upsertDefaultOutlet(t.tenantId, { name: slug, areaId: ORIGIN, picPhone: "081200000000", street: "Jl. Dago No. 1" })
  await env.DB.prepare(
    `INSERT INTO tenant_discount_rules (tenant_id, service_code, courier_code, service_class, assigned_bps, effective_from, requested_at, updated_at)
     SELECT ?1, service_code, courier_code, service_class, 2000, 1, 1, 1 FROM courier_service_catalog WHERE is_active = 1`,
  ).bind(t.tenantId).run()
  const sender = ((await (await appPost("/contacts/senders", t.cookie, { name: "Ibu Siti", phone: "081234567890" })).json()) as { data: { item: { id: string } } }).data.item.id
  await appPost(`/contacts/senders/${sender}/verify-wa`, t.cookie, {})
  const recipient = ((await (await appPost("/contacts/recipients", t.cookie, { name: "Rina Kartika", phone: "085712348821", street: "Jl. Tebet Barat No. 14", areaId: DEST, areaLabel: "Tebet Barat" })).json()) as { data: { item: { id: string } } }).data.item.id
  return { ...t, sender, recipient }
}

/** Freezes a quote and fills parties; returns the INV slug ready to dispatch. */
export async function readyInv(t: Awaited<ReturnType<typeof checkoutGerai>>, quote: Record<string, unknown> = {}) {
  const f = await appPost("/quotes/freeze", t.cookie, { destinationAreaId: DEST, weightGram: 1000, mode: "none", serviceCode: "JT", packingIdr: 3000, ...quote })
  expect(f.status).toBe(201)
  const slug = ((await f.json()) as { data: { slug: string } }).data.slug
  const p = await appPost(`/shipments/${slug}/parties`, t.cookie, { senderId: t.sender, recipientId: t.recipient, content: "Pakaian", prohibitedAck: true })
  expect(p.status).toBe(200)
  return slug
}

export const post = (path: string, cookie: string, b: unknown, key?: string) =>
  exports.default.fetch(`${APP}/api/app${path}`, { method: "POST", headers: { "content-type": "application/json", origin: APP, cookie, ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(b) })
