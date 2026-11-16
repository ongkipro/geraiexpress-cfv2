// Spec 05 §4 gate 3 (route-table scan, TASK-109): every /api/app/* and /api/owner/* route is registered through the
// registry with an auth level and a projection, and no route outside the registry answers on those prefixes.
import { exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { ROUTES } from "../../src/api/registry"
import "../../src/index"
import { scanRoutes } from "../../../../scripts/ci/route-scan-lib.mjs"
import { ALLOWED_MIDDLEWARE, MOUNTED } from "../../src/api/registry"

/**
 * Side doors on a mounted Hono app. Every non-middleware entry must be a `register()` pair: the exact guard recorded for
 * that handler, mounted immediately before it on the same method and path, and listed in the registry. The only other
 * entries allowed are the API's documented global middleware (checked by identity). Returns readable problems.
 */
function sideDoors(app: { routes: Array<{ method: string; path: string; handler: unknown }> }, context: string, prefix: string, globalMiddleware: number): string[] {
  const registered = new Set(ROUTES.map((r) => `${r.context} ${r.method} ${r.path}`))
  const out: string[] = []
  const rs = app.routes
  const globals = rs.filter((r) => ALLOWED_MIDDLEWARE.has(r.handler as object))
  if (globals.length !== globalMiddleware) out.push(`expected ${globalMiddleware} global middleware, found ${globals.length}`)
  const guards = new Set<unknown>()
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]!
    if (ALLOWED_MIDDLEWARE.has(r.handler as object)) continue
    const m = MOUNTED.get(r.handler as object)
    if (m) {
      const prev = rs[i - 1]
      if (!prev || prev.handler !== m.guard || prev.method !== r.method || prev.path !== r.path) out.push(`${r.method} ${r.path} is mounted without its guard`)
      guards.add(m.guard)
      const path = r.path.startsWith(prefix) ? r.path.slice(prefix.length) || "/" : r.path
      if (!registered.has(`${context} ${r.method} ${path}`)) out.push(`${r.method} ${r.path} is not in the registry`)
      continue
    }
    // Anything else is only acceptable as the guard of the handler that follows it.
    const next = rs[i + 1]
    const owner = next ? MOUNTED.get(next.handler as object) : undefined
    if (!owner || owner.guard !== r.handler || next!.method !== r.method || next!.path !== r.path) out.push(`${r.method} ${r.path} mounted outside register()`)
  }
  return out
}

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
    expect(sideDoors(appApi(), "app", "/api/app", 1)).toEqual([])
    expect(sideDoors(ownerApi(), "owner", "/api/owner", 0)).toEqual([])
  })

  it("the side-door scan catches app.all, an extra use() and a route mounted outside register (fixture)", async () => {
    const { appApi } = await import("../../src/api/app")
    const a = appApi()
    a.all("/pintu-belakang", (c) => c.text("x"))
    expect(sideDoors(a, "app", "/api/app", 1)).toContainEqual(expect.stringContaining("ALL /api/app/pintu-belakang"))
    const b = appApi()
    b.use("/apa-saja/*", async (_c, next) => next())
    expect(sideDoors(b, "app", "/api/app", 1).length).toBeGreaterThan(0)
    const c2 = appApi()
    c2.get("/workspace", (c) => c.text("tanpa guard"))
    expect(sideDoors(c2, "app", "/api/app", 1)).toContainEqual(expect.stringContaining("GET /api/app/workspace"))
  })

  it("a registered handler mounted without its guard is caught (Sol R2 #10)", async () => {
    const { Hono } = await import("hono")
    const { register } = await import("../../src/api/registry")
    const guardOf = () => async (_c: unknown, next: () => Promise<void>) => next()
    const handler = async () => new Response("x")
    const app = new Hono().basePath("/api/app")
    // Registered properly once (recording its guard), then the same handler mounted again on its own.
    register(app, { context: "app", method: "GET", path: "/uji-guard", auth: "app_member", projection: "role" }, guardOf as never, handler)
    app.get("/uji-guard-2", handler)
    expect(sideDoors(app, "app", "/api/app", 0)).toContainEqual(expect.stringContaining("GET /api/app/uji-guard-2 is mounted without its guard"))
    ROUTES.pop()
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
