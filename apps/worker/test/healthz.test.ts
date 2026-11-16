import { exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

const HOSTS = [
  "geraiexpress.localhost",
  "app.geraiexpress.localhost",
  "owner.geraiexpress.localhost",
  "hooks.geraiexpress.localhost",
  "berkahjaya.geraimitra.localhost",
]

describe("GET /healthz (spec 07 §2)", () => {
  it.each(HOSTS)("answers 200 {ok:true} on %s without touching storage", async (host) => {
    const res = await exports.default.fetch(`http://${host}:8787/healthz`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
