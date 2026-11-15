import { describe, expect, it } from "vitest"
import { emit, redact, redactString } from "../src/index"

describe("redaction (OBSERVABILITY.md, spec 10 §4.4)", () => {
  it("masks the Mengantar URL-path key", () => {
    expect(redactString("GET https://api-public.mengantar.com/api/public/sk_live_ABC123xyz/order?x=1 failed")).toBe(
      "GET https://api-public.mengantar.com/api/public/{API_KEY}/order?x=1 failed",
    )
    expect(redactString("/api/public/{API_KEY}/order")).toBe("/api/public/{API_KEY}/order")
  })
  it("masks bearer tokens, gx_live keys, phones, emails and OTPs", () => {
    const s = redactString("auth Bearer abc.def-ghi key gx_live_ABCDEF1234567890 hp 081234567890 +6281298765432 ani@toko.id kode OTP: 482915")
    expect(s).not.toMatch(/abc\.def|ABCDEF1234567890|081234567890|81298765432|ani@toko\.id|482915/)
    expect(s).toContain("08xx-xxxx-7890")
    expect(s).toContain("08xx-xxxx-5432")
  })
  it("drops values under sensitive keys entirely (cookies, tokens, raw bodies, passwords)", () => {
    const r = redact({ cookie: "__Host-ge_app=s", headers: { authorization: "x", "set-cookie": "y" }, rawBody: "{...}", password: "p", otp: "123456", ok: 1 }) as Record<string, unknown>
    expect(r).toEqual({ cookie: "[REDACTED]", headers: { authorization: "[REDACTED]", "set-cookie": "[REDACTED]" }, rawBody: "[REDACTED]", password: "[REDACTED]", otp: "[REDACTED]", ok: 1 })
  })
  it("redacts inside Error messages and nested arrays", () => {
    expect(redact([new Error("POST /api/public/realKey123/order 500")])).toEqual([{ name: "Error", message: "POST /api/public/{API_KEY}/order 500" }])
  })
})

describe("emit", () => {
  it("keeps only the event's bounded labels and redacts attributes", () => {
    const lines: string[] = []
    const rec = emit(
      "mengantar.public_api",
      { route: "/order", status: 403, outcome: "ip_not_allowed", tenant_id: "t-1" } as never,
      { url: "https://api-public.mengantar.com/api/public/KEY12345/order", tenant: "t-1" },
      { sink: (l) => lines.push(l), env: "test", now: 0 },
    )
    expect(rec.labels).toEqual({ route: "/order", status: 403, outcome: "ip_not_allowed" })
    expect(lines[0]).not.toContain("KEY12345")
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: "mengantar.public_api", env: "test", ts: "1970-01-01T00:00:00.000Z" })
  })
})

import { authFailureSpikeAlert, ipNotAllowedAlert, issueVolumeSpikeAlert, publicApiOutcome } from "../src/index"

describe("redaction bypasses (Carbon TASK-110 #2)", () => {
  it.each([
    ["https://app.geraiexpress.com/atur-sandi/abcDEF123tokentoken", "abcDEF123tokentoken"],
    ["https://app.geraiexpress.com/undangan/inv-token-xyz", "inv-token-xyz"],
    ["POST /webhooks/mengantar/whtoken987654 400", "whtoken987654"],
    ["https://x.test/cb?token=abc123&x=1", "abc123"],
    ["Kode verifikasi GeraiExpress: 482915", "482915"],
    ["TOTP: 482915", "482915"],
    ["kode ambil 4821", "4821"],
    ["cookie __Host-ge_app=s3ss10n; other=1", "s3ss10n"],
    ["Cookie: dev_ge_owner=abc; x=y", "abc"],
    ["Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijk", "eyJzdWIiOiIxIn0"],
    ["key gx_test_AB-cd_12345", "AB-cd_12345"],
    ["hp +62 812-3456-7890", "812-3456"],
    ["hp 0812 3456 7890", "0812 3456"],
    ["hp 0812-3456-7890", "0812-3456"],
  ])("%s", (input, secret) => {
    expect(redactString(input)).not.toContain(secret)
  })
  it("keeps the last four digits of formatted phones", () => {
    expect(redactString("hp 0812-3456-7890")).toContain("7890")
  })
  it("handles URL, Headers, Date, bytes and header tuples", () => {
    const h = new Headers({ cookie: "__Host-ge_app=s", "x-a": "ok" })
    expect(redact({ u: new URL("https://a.test/atur-sandi/tok123456"), h, d: new Date(0), b: new Uint8Array([1, 2]), t: [["cookie", "s=1"]], wa: "08123" })).toEqual({
      u: "https://a.test/atur-sandi/[REDACTED]",
      h: { cookie: "[REDACTED]", "x-a": "ok" },
      d: "1970-01-01T00:00:00.000Z",
      b: "[BYTES]",
      t: [["cookie", "[REDACTED]"]],
      wa: "08123",
    })
    expect(redact({ contact_whatsapp: "081234567890" })).toEqual({ contact_whatsapp: "[REDACTED]" })
  })
})

describe("Public API anomaly signals (spec 10 §4.4)", () => {
  it("maps HTTP results to bounded outcomes", () => {
    expect(publicApiOutcome(403, "IP_NOT_ALLOWED")).toBe("ip_not_allowed")
    expect(publicApiOutcome(403)).toBe("forbidden")
    expect(publicApiOutcome(401)).toBe("unauthorized")
    expect(publicApiOutcome(429)).toBe("rate_limited")
    expect(publicApiOutcome(null)).toBe("timeout")
    expect(publicApiOutcome(201)).toBe("ok")
    expect(publicApiOutcome(500)).toBe("error")
  })
  it("IP_NOT_ALLOWED alerts on the first occurrence", () => {
    expect(ipNotAllowedAlert(0, "/order")).toBeNull()
    expect(ipNotAllowedAlert(1, "/order")?.key).toBe("public_api_ip_not_allowed")
  })
  it("auth spike and volume spike respect floors and the 3× baseline", () => {
    expect(authFailureSpikeAlert("t", 4)).toBeNull()
    expect(authFailureSpikeAlert("t", 5)?.attrs).toEqual({ tenantId: "t", failures: 5 })
    expect(issueVolumeSpikeAlert("t", 19, 1)).toBeNull()
    expect(issueVolumeSpikeAlert("t", 30, 10)).toBeNull()
    expect(issueVolumeSpikeAlert("t", 31, 10)?.key).toBe("public_api_issue_volume_spike")
  })
})
