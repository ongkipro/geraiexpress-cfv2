import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { handleDevPreview } from "../../src/ops/dev-preview"

describe("dev preview login (local only)", () => {
  it("is a 404 outside GX_ENV=local and without the ops token", async () => {
    const req = (q: string) => new Request(`http://owner.geraiexpress.localhost:8787/internal/dev/preview?${q}`)
    expect((await handleDevPreview(req("token=test-ops-token&as=x@y.z"), { ...env, GX_ENV: "staging" } as unknown as Env, "owner")).status).toBe(404)
    expect((await handleDevPreview(req("token=wrong&as=x@y.z"), env, "owner")).status).toBe(404)
  })
})
