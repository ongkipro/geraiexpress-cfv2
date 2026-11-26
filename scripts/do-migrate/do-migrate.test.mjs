import { describe, expect, it } from "vitest"
import { parseTenantSchemaVersion, readLocalTenantSchemaVersion, runDoMigrate, staleReason } from "./do-migrate-lib.mjs"

const okRes = (data) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } })
const errRes = (status, code, message) => new Response(JSON.stringify({ ok: false, error: { code, message } }), { status, headers: { "content-type": "application/json" } })

describe("do:migrate stale-isolate retry & version parsing", () => {
  it("reads sequential TENANT_SCHEMA_VERSION from packages/db/src/tenant.ts, ignoring comments and rejecting gaps", () => {
    const v = readLocalTenantSchemaVersion()
    expect(v).toBeGreaterThanOrEqual(26)
    expect(
      parseTenantSchemaVersion(
        "// { version: 99, name: 'comment' }\n/* { version: 1, name: 'block' } */\nexport const TENANT_MIGRATIONS = [\n  { name: 'a', version: 1, sql: 'x' },\n  { version: 2, name: 'b', sql: 'y' },\n]",
      ),
    ).toBe(2)
    expect(parseTenantSchemaVersion("export const TENANT_MIGRATIONS = [{ version: 1, name: 'a' }, { version: 3, name: 'c' }]")).toBeNull()
    expect(parseTenantSchemaVersion("")).toBeNull()
  })

  it("retries on 409 STALE_ISOLATE, targetVersion < expectVersion, and legacy FORWARD_ONLY without advancing cursor", async () => {
    const responses = [
      errRes(409, "STALE_ISOLATE", "Isolate masih di v25"),
      okRes({ targetVersion: 25, migrated: 0, alreadyCurrent: 2, report: [], nextCursor: "t-2", failed: null }),
      okRes({ migrated: 0, alreadyCurrent: 1, report: [], nextCursor: null, failed: { tenantId: "t-2", error: "FORWARD_ONLY" } }),
      okRes({ targetVersion: 26, migrated: 2, alreadyCurrent: 1, report: ["t-1: v25 → v26", "t-2: v25 → v26"], nextCursor: null, failed: null }),
    ]
    const seenCursors = []
    const waits = []
    const r = await runDoMigrate({
      origin: "https://owner.example.test",
      token: "tok",
      batch: 25,
      dryRun: false,
      expectVersion: 26,
      retryDelaysMs: [10, 20, 30, 40],
      sleep: async (ms) => {
        waits.push(ms)
      },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init.body))
        seenCursors.push(body.cursor)
        return responses.shift()
      },
    })
    expect(r).toMatchObject({ ok: true, targetVersion: 26, migrated: 2, alreadyCurrent: 1, retries: 3 })
    expect(seenCursors).toEqual([null, null, null, null])
    expect(waits).toEqual([10, 20, 30])
  })

  it("fails closed when retries are exhausted on a stale edge", async () => {
    const r = await runDoMigrate({
      origin: "https://owner.example.test",
      token: "tok",
      batch: 25,
      dryRun: false,
      expectVersion: 26,
      retryDelaysMs: [1, 2],
      sleep: async () => {},
      fetchImpl: async () => errRes(409, "STALE_ISOLATE", "still v25"),
    })
    expect(r).toMatchObject({ ok: false, code: "STALE_ISOLATE", retries: 2 })
  })

  it("never retries in dry-run mode so pre-deploy roll-forward detection reads the live targetVersion directly", async () => {
    let calls = 0
    const r = await runDoMigrate({
      origin: "https://owner.example.test",
      token: "tok",
      batch: 25,
      dryRun: true,
      expectVersion: 26,
      retryDelaysMs: [10],
      sleep: async () => {},
      fetchImpl: async (_url, init) => {
        calls++
        expect(JSON.parse(String(init.body)).expectVersion).toBeUndefined()
        return okRes({ targetVersion: 25, migrated: 0, alreadyCurrent: 4, report: [], nextCursor: null, failed: null })
      },
    })
    expect(calls).toBe(1)
    expect(r).toMatchObject({ ok: true, targetVersion: 25, pending: 0, retries: 0 })
    expect(staleReason(200, { ok: true, data: { targetVersion: 25 } }, { dryRun: true, expectVersion: 26 })).toBeNull()
  })

  it("retries when a draining pre-PR isolate omits targetVersion under expectVersion, and allows opt-out with expectVersion: null", async () => {
    const responses = [
      okRes({ migrated: 0, alreadyCurrent: 4, report: [], nextCursor: null, failed: null }),
      okRes({ targetVersion: 26, migrated: 4, alreadyCurrent: 0, report: ["t-1: v25 → v26"], nextCursor: null, failed: null }),
    ]
    const retried = await runDoMigrate({
      origin: "https://owner.example.test",
      token: "tok",
      batch: 25,
      dryRun: false,
      expectVersion: 26,
      retryDelaysMs: [1, 2],
      sleep: async () => {},
      fetchImpl: async () => responses.shift(),
    })
    expect(retried).toMatchObject({ ok: true, targetVersion: 26, migrated: 4, retries: 1 })

    const optedOut = await runDoMigrate({
      origin: "https://owner.example.test",
      token: "tok",
      batch: 25,
      dryRun: false,
      expectVersion: null,
      fetchImpl: async () => okRes({ migrated: 0, alreadyCurrent: 4, report: [], nextCursor: null, failed: null }),
    })
    expect(optedOut).toMatchObject({ ok: true, targetVersion: null, alreadyCurrent: 4, retries: 0 })
  })
})
