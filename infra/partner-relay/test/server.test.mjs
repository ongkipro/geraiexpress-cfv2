// TASK-601: the HTTP entry passes an over-limit body to the handler as "too large" (413) instead of a truncated body
// (which would fail the signature as 401 and hide the real reason), and never buffers past 64 KB.
import { spawn } from "node:child_process"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const PORT = 18000 + Math.floor(Math.random() * 1000)
let child
beforeAll(async () => {
  child = spawn(process.execPath, ["infra/partner-relay/server.mjs"], { env: { ...process.env, PORT: String(PORT), RELAY_SECRET: "relay-test-value", MENGANTAR_PARTNER_ORIGIN: "https://partner.mengantar.example" }, stdio: "ignore" })
  for (let i = 0; i < 50; i++) {
    const up = await fetch(`http://127.0.0.1:${PORT}/healthz`).then((r) => r.ok, () => false)
    if (up) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error("relay did not start")
})
afterAll(() => child?.kill())

describe("relay server", () => {
  it("over-limit body → 413 relay_body_too_large; small unsigned body → 401", async () => {
    const big = await fetch(`http://127.0.0.1:${PORT}/forward`, { method: "POST", body: "x".repeat(64 * 1024 + 10) })
    expect(big.status).toBe(413)
    expect((await big.json()).code).toBe("relay_body_too_large")
    const small = await fetch(`http://127.0.0.1:${PORT}/forward`, { method: "POST", body: "{}" })
    expect(small.status).toBe(401)
  })
})
