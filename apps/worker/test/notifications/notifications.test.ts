// TASK-301 notification read state is per user; owner-only items never reach a cashier.
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import { appUser } from "../onboarding/helpers"
import { appGet, appPost, seedConnected } from "../webhooks/helpers"

type List = { data: { items: Array<{ id: string; title: string; readAt: number | null; link: string | null }>; unread: number } }
const list = async (cookie: string) => ((await (await appGet("/notifications", cookie)).json()) as List).data

describe("notifications", () => {
  it("read state per user, owner-only audience, safe links, mark all", async () => {
    const o = await seedConnected("notifsatu")
    const k = await appUser("kasir.notif@contoh.test")
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tenant_members (tenant_id, user_id, role, status, created_at) VALUES (?, ?, 'cashier', 'active', ?)").bind(o.tenantId, k.id, Date.now()),
      env.DB.prepare("UPDATE sessions SET active_tenant_id = ? WHERE user_id = ?").bind(o.tenantId, k.id),
    ])
    const v = vaultFor(env, o.tenantId)
    const a = await v.addNotification(o.tenantId, { kind: "pickup_ready", audience: "all", title: "3 paket siap dijemput J&T", link: "/kiriman?tab=pickup" })
    await v.addNotification(o.tenantId, { kind: "discount_selisih", audience: "owner", title: "Diskon JNE belum sesuai", link: "https://evil.example/x" })
    const ownerList = await list(o.cookie)
    expect(ownerList.items).toHaveLength(2)
    expect(ownerList.items.find((x) => x.title.startsWith("Diskon"))!.link).toBeNull() // external link dropped
    const kasirList = await list(k.cookie)
    expect(kasirList.items.map((x) => x.title)).toEqual(["3 paket siap dijemput J&T"])
    // Owner reads one item; the cashier's state is unchanged.
    expect((await appPost("/notifications/read", o.cookie, { ids: [a.ok ? a.value : ""] })).status).toBe(200)
    expect((await list(o.cookie)).unread).toBe(1)
    expect((await list(k.cookie)).unread).toBe(1)
    // A cashier cannot mark owner-only items (they are not visible to them).
    const ownerOnly = ownerList.items.find((x) => x.title.startsWith("Diskon"))!.id
    await appPost("/notifications/read", k.cookie, { ids: [ownerOnly] })
    expect((await list(o.cookie)).items.find((x) => x.id === ownerOnly)!.readAt).toBeNull()
    await appPost("/notifications/read", k.cookie, { all: true })
    expect((await list(k.cookie)).unread).toBe(0)
    expect((await list(o.cookie)).unread).toBe(1)
    // Workspace badge mirrors the unread count.
    expect(((await (await appGet("/workspace", o.cookie)).json()) as { data: { badges: { notifications: number } } }).data.badges.notifications).toBe(1)
  })

  it("another gerai never sees these notifications", async () => {
    const a = await seedConnected("notifdua")
    const b = await seedConnected("notiftiga")
    await vaultFor(env, a.tenantId).addNotification(a.tenantId, { kind: "system", audience: "all", title: "Hanya untuk gerai A" })
    expect((await list(b.cookie)).items.map((x) => x.title)).not.toContain("Hanya untuk gerai A")
  })
})
