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

  it("every route mounted on the app/owner Hono apps is in the registry with its guard (no side-door routes)", async () => {
    const { appApi } = await import("../../src/api/app")
    const { ownerApi } = await import("../../src/api/owner")
    const registered = new Set(ROUTES.map((r) => `${r.context} ${r.method} ${r.path}`))
    for (const [context, app, prefix] of [["app", appApi(), "/api/app"], ["owner", ownerApi(), "/api/owner"]] as const) {
      // Hono lists middleware mounted with `use` as method ALL; only the documented rolling-cookie/session middleware.
      const mounted = app.routes.filter((r) => r.method !== "ALL")
      expect(mounted.length).toBeGreaterThan(10)
      for (const r of mounted) {
        const path = r.path.startsWith(prefix) ? r.path.slice(prefix.length) || "/" : r.path
        expect(registered.has(`${context} ${r.method} ${path}`), `${context} ${r.method} ${r.path} is not registered`).toBe(true)
      }
    }
  })

  it("CSRF: same scheme + normalised host required; default port / trailing dot accepted", async () => {
    const { sameOriginOk } = await import("../../src/auth/csrf")
    const req = (host: string, origin: string, url = "https://app.geraiexpress.com/api/app/x") => new Request(url, { method: "POST", headers: { host, origin } })
    expect(sameOriginOk(req("app.geraiexpress.com", "https://app.geraiexpress.com"))).toBe(true)
    expect(sameOriginOk(req("app.geraiexpress.com:443", "https://app.geraiexpress.com"))).toBe(true)
    expect(sameOriginOk(req("App.GeraiExpress.com.", "https://app.geraiexpress.com"))).toBe(true)
    expect(sameOriginOk(req("app.geraiexpress.com", "http://app.geraiexpress.com"))).toBe(false)
    expect(sameOriginOk(req("app.geraiexpress.com", "https://evil.example"))).toBe(false)
    expect(sameOriginOk(req("app.geraiexpress.com", "https://app.geraiexpress.com:8443"))).toBe(false)
  })

  it("an unregistered path under /api/app or /api/owner is a 404, never a handler", async () => {
    for (const url of ["http://app.geraiexpress.localhost:8787/api/app/kiriman", "http://owner.geraiexpress.localhost:8787/api/owner/kiriman"]) {
      expect((await exports.default.fetch(url)).status).toBe(404)
    }
  })
})
