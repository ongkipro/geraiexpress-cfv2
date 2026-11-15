import { env } from "cloudflare:workers"
import { runInDurableObject } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { isSlug } from "@gx/domain/slug"
import type { GeraiVaultDO } from "../../src/do/gerai-vault"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import { allocateSlug } from "../../src/do/gerai-vault/slug"

async function provisioned(id: string) {
  const stub = vaultFor(env, id)
  expect(await stub.migrate(id)).toMatchObject({ ok: true })
  return stub
}

describe("INV slug allocator in GeraiVaultDO (TASK-108, DEC-211)", () => {
  it("10,000 slugs in one tenant → 0 duplicates, all valid", async () => {
    const stub = await provisioned("slug-bulk")
    await runInDurableObject(stub, (_i: GeraiVaultDO, s) => {
      const slugs: string[] = []
      s.storage.transactionSync(() => {
        for (let i = 0; i < 10_000; i++) slugs.push(allocateSlug(s.storage, "draft", 1))
      })
      expect(new Set(slugs).size).toBe(10_000)
      expect(slugs.every(isSlug)).toBe(true)
      expect(s.storage.sql.exec("SELECT COUNT(*) AS n FROM inv_slugs").one().n).toBe(10_000)
    })
  })

  it("the same slug may exist in two tenants; within one tenant a collision regenerates and a stuck generator fails closed", async () => {
    const a = await provisioned("slug-two-a")
    const b = await provisioned("slug-two-b")
    const fixed = () => "8k4m2p7"
    await runInDurableObject(a, (_i: GeraiVaultDO, s) => {
      expect(allocateSlug(s.storage, "draft", 1, fixed)).toBe("8k4m2p7")
    })
    await runInDurableObject(b, (_i: GeraiVaultDO, s) => {
      expect(allocateSlug(s.storage, "draft", 1, fixed)).toBe("8k4m2p7")
    })
    await runInDurableObject(a, (_i: GeraiVaultDO, s) => {
      let n = 0
      const seq = () => (n++ === 0 ? "8k4m2p7" : "9x9x9x9")
      expect(allocateSlug(s.storage, "draft", 1, seq)).toBe("9x9x9x9")
      expect(() => allocateSlug(s.storage, "draft", 1, fixed)).toThrow(/SLUG_EXHAUSTED/)
    })
  })

  it("RPC allocate + case-insensitive lookup (INV: 8K4M2P7, INV 8K4M2P7, #8k4m2p7)", async () => {
    const a = await provisioned("slug-lookup")
    const r = await a.allocateSlug("slug-lookup", "draft")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const up = r.value.toUpperCase()
    for (const q of [`INV: ${up}`, `INV ${up}`, `#${r.value}`, r.value]) {
      expect(await a.slugExists("slug-lookup", q), q).toEqual({ ok: true, value: true })
    }
    expect(await a.slugExists("slug-lookup", "2222222")).toEqual({ ok: true, value: false })
  })

  it("refuses a foreign tenant id, an unprovisioned object and an outdated schema", async () => {
    await provisioned("slug-own")
    expect(await vaultFor(env, "slug-own").slugExists("slug-other", "8k4m2p7")).toEqual({ ok: false, refused: "TENANT_MISMATCH" })
    expect(await vaultFor(env, "slug-none").allocateSlug("slug-none", "draft")).toEqual({ ok: false, refused: "TENANT_NOT_PROVISIONED" })
    const v1 = vaultFor(env, "slug-v1")
    expect(await v1.migrate("slug-v1", 1)).toMatchObject({ ok: true, to: 1 })
    expect(await v1.allocateSlug("slug-v1", "draft")).toEqual({ ok: false, refused: "TENANT_NOT_READY" })
  })
})
