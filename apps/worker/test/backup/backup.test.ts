// TASK-603 backups (ADR-0006 §7): daily export of every provisioned tenant object to R2 (fake clock: one file per
// WIB day, idempotent, retention 35 days), and a restore drill into a scratch object whose content checksum equals
// the source's; the restored object refuses foreign tenants exactly like the source.
import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { hostCache } from "../../src/host/lookup"
import { resetMock } from "../../src/mengantar/mock"
import { exportAll, restoreInto } from "../../src/cron/backup"
import { backupKey, gunzipJson, type TenantBackup } from "../../src/do/gerai-vault/backup"
import { vaultFor } from "../../src/do/gerai-vault/stub"
import { checkoutGerai, post, readyInv } from "../dispatch/helpers"

beforeEach(() => {
  resetMock()
  hostCache.clear()
})

const DAY = 86_400_000

describe("tenant backups", () => {
  it("daily export: one gzip JSON per tenant per WIB day, idempotent, 35-day retention (fake clock)", async () => {
    const a = await checkoutGerai("bkpharian")
    const slug = await readyInv(a)
    await post(`/shipments/${slug}/payment`, a.cookie, { method: "qris" }, `bkp-${slug}`)
    const t0 = Date.UTC(2026, 10, 16, 19, 0) // 02:00 WIB on 17 Nov
    const r1 = await exportAll(env, t0)
    expect(r1.failed).toEqual([])
    const k1 = backupKey(a.tenantId, "2026-11-17")
    const obj = await env.BUCKET.get(k1)
    expect(obj).not.toBeNull()
    const b = await gunzipJson<TenantBackup>(await obj!.arrayBuffer())
    expect(b).toMatchObject({ format: "gx-tenant-backup/1", tenantId: a.tenantId })
    expect(b.tables.shipments!.rows.length).toBeGreaterThanOrEqual(1)
    expect(b.tables.vault_identity!.rows[0]).toContain(a.tenantId)
    // Same day again: skipped (no second write).
    const r2 = await exportAll(env, t0 + 3600_000)
    expect(r2.skipped).toBeGreaterThanOrEqual(1)
    // 36 days later: a new file, and the 17 Nov file is pruned.
    await exportAll(env, t0 + 36 * DAY)
    expect(await env.BUCKET.head(k1)).toBeNull()
    expect(await env.BUCKET.head(backupKey(a.tenantId, "2026-12-23"))).not.toBeNull()
  })

  it("restore drill: backup → empty scratch object → identical checksum; scratch refuses other tenants", async () => {
    const a = await checkoutGerai("bkppulih")
    for (let i = 0; i < 2; i++) await readyInv(a)
    const now = Date.UTC(2026, 10, 18, 19, 0)
    await exportAll(env, now)
    const key = backupKey(a.tenantId, "2026-11-19")
    const report = await restoreInto(env, key, `drill-${a.tenantId}`)
    expect(report.sourceChecksum).toBe(report.restoredChecksum)
    expect(report.rows).toBeGreaterThan(10)
    const scratch = vaultFor(env, `drill-${a.tenantId}`)
    // The scratch object keeps the source identity (it is a copy for inspection), so the source tenant id works and
    // nothing else does.
    expect((await scratch.shipmentList(a.tenantId, { tab: "semua", q: "", fromMs: 0, toMs: Date.now() + DAY, courier: null, printed: "semua", cursor: null, limit: 50 })).ok).toBe(true)
    expect(await scratch.schemaState()).toMatchObject({ state: "ok", tenantId: a.tenantId })
    expect((await scratch.shipmentList("tenant-lain", { tab: "semua", q: "", fromMs: 0, toMs: 1, courier: null, printed: "semua", cursor: null, limit: 1 })).ok).toBe(false)
    // Restoring into a non-empty object is refused.
    await expect(restoreInto(env, key, `drill-${a.tenantId}`)).rejects.toThrow(/sudah berisi data/)
    // A real tenant id is never a restore target (only drill-* scratch objects).
    await expect(restoreInto(env, key, a.tenantId)).rejects.toThrow(/drill-/)
    // A tampered backup (checksum metadata mismatch) is refused.
    const obj = await env.BUCKET.get(key)
    await env.BUCKET.put(key, await obj!.arrayBuffer(), { customMetadata: { ...obj!.customMetadata, checksum: "0".repeat(64) } })
    await expect(restoreInto(env, key, `drill-tamper-${a.tenantId}`)).rejects.toThrow(/checksum/)
  })

  it("ops endpoints: OPS_TOKEN required; restore target must be drill-*", async () => {
    const { exports } = await import("cloudflare:workers")
    const O = "http://owner.geraiexpress.localhost:8787/internal/ops"
    expect((await exports.default.fetch(`${O}/backup-export`, { method: "POST" })).status).toBe(401)
    const bad = await exports.default.fetch(`${O}/backup-restore`, { method: "POST", headers: { authorization: "Bearer test-ops-token" }, body: JSON.stringify({ key: "t/x/backup/2026-11-19.json.gz", target: "tenant-asli" }) })
    expect(bad.status).toBe(422)
    expect((await exports.default.fetch(`${O}/backup-export`, { method: "POST", headers: { authorization: "Bearer test-ops-token" } })).status).toBe(200)
  })

  it("ops restore over HTTP: success returns equal checksums; a second restore into the same target is 409 RESTORE_REFUSED (Sol delta C-9)", async () => {
    const { exports } = await import("cloudflare:workers")
    const O = "http://owner.geraiexpress.localhost:8787/internal/ops"
    const a = await checkoutGerai("bkphttp")
    await readyInv(a)
    const now = Date.UTC(2026, 10, 20, 19, 0)
    await exportAll(env, now)
    const key = backupKey(a.tenantId, "2026-11-21")
    const call = (target: string) => exports.default.fetch(`${O}/backup-restore`, { method: "POST", headers: { authorization: "Bearer test-ops-token" }, body: JSON.stringify({ key, target }) })
    const okRes = await call(`drill-http-${a.tenantId.slice(0, 8)}`)
    expect(okRes.status).toBe(200)
    const report = ((await okRes.json()) as { data: { sourceChecksum: string; restoredChecksum: string } }).data
    expect(report.restoredChecksum).toBe(report.sourceChecksum)
    const again = await call(`drill-http-${a.tenantId.slice(0, 8)}`)
    expect(again.status).toBe(409)
    expect(((await again.json()) as { error: { code: string; message: string } }).error).toMatchObject({ code: "RESTORE_REFUSED" })
  })
})
