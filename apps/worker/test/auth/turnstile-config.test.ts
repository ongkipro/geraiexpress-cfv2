import { env, exports } from "cloudflare:workers"
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import worker from "../../src/index"

// Final Carbon pass, M1 P0: auth pages render the real widget from `/auth/config`; without a configured widget the
// server fails closed (never "any token passes" outside local test keys).
const APP = "http://app.geraiexpress.localhost:8787"
const STG = "http://app-staging.geraiexpress.localhost:8787"
const H = { "content-type": "application/json", origin: STG, "cf-connecting-ip": "203.0.113.9", "user-agent": "Mozilla/5.0 Chrome/150" }

async function call(e: Env, path: string, init?: RequestInit) {
  const ctx = createExecutionContext()
  const res = await worker.fetch(new Request(`${STG}/api/app${path}`, init) as Request<unknown, IncomingRequestCfProperties>, e, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe("Turnstile configuration (auth pages)", () => {
  it("local test keys: no site key is published (dev token accepted)", async () => {
    const r = await exports.default.fetch(`${APP}/api/app/auth/config`)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ data: { turnstileSiteKey: null } })
  })

  it("staging with a real widget publishes the site key", async () => {
    const staging = { ...env, GX_ENV: "staging", TURNSTILE_SITE_KEY: "0x4AAAAAAA-site", TURNSTILE_SECRET_KEY: "0x4AAAAAAA-secret" } as unknown as Env
    expect(await (await call(staging, "/auth/config")).json()).toMatchObject({ data: { turnstileSiteKey: "0x4AAAAAAA-site" } })
  })

  it("staging without a widget fails closed: sign-up and login refuse any token without calling Siteverify", async () => {
    const staging = { ...env, GX_ENV: "staging", TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "0x4AAAAAAA-secret" } as unknown as Env
    const signup = await call(staging, "/auth/signup/request", { method: "POST", headers: H, body: JSON.stringify({ email: "tutup@contoh.test", turnstileToken: "anything" }) })
    expect(signup.status).toBe(400)
    expect(await signup.json()).toMatchObject({ error: { code: "TURNSTILE_FAILED" } })
    const login = await call(staging, "/auth/login", { method: "POST", headers: H, body: JSON.stringify({ email: "tutup@contoh.test", password: "x".repeat(10), turnstileToken: "anything" }) })
    expect(login.status).toBe(400)
  })
})
