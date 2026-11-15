// Spec 05 §4 gate 3 (route-table scan, TASK-109): every /api/app/* and /api/owner/* route is registered through the
// registry with an auth level and a projection, and no route outside the registry answers on those prefixes.
import { exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { ROUTES } from "../../src/api/registry"
import "../../src/index"
import { scanRoutes } from "../../../../scripts/ci/route-scan-lib.mjs"

describe("route-table scan (spec 05 §4 gate 3)", () => {
  it("the registry passes the scan", () => {
    expect(ROUTES.length).toBeGreaterThan(10)
    expect(scanRoutes(ROUTES)).toEqual([])
  })

  it("the scan fails on an unprotected or unprojected route (fixture)", () => {
    expect(scanRoutes([...ROUTES, { context: "app", method: "POST", path: "/kiriman", auth: "public", projection: "role" }])).toContainEqual(expect.stringContaining("public route outside the allowlist"))
    expect(scanRoutes([...ROUTES, { context: "app", method: "GET", path: "/x", auth: "app_member", projection: undefined as never }])).toContainEqual(expect.stringContaining("projection"))
    expect(scanRoutes([...ROUTES, { context: "owner", method: "GET", path: "/gerai", auth: "owner_aal1", projection: "role" }])).toContainEqual(expect.stringContaining("aal1"))
  })

  it("an unregistered path under /api/app or /api/owner is a 404, never a handler", async () => {
    for (const url of ["http://app.geraiexpress.localhost:8787/api/app/kiriman", "http://owner.geraiexpress.localhost:8787/api/owner/kiriman"]) {
      expect((await exports.default.fetch(url)).status).toBe(404)
    }
  })
})
