import { describe, expect, it } from "vitest"
import { deliverySeconds, evaluateDns, evaluateHeaders, INBOX_MATRIX } from "../deliverability-lib.mjs"

describe("TASK-112 deliverability helpers (spec 12 §6)", () => {
  it("DNS: SPF with an include and ~all, DMARC with a policy, DKIM present", () => {
    const ok = evaluateDns({ spf: ["v=spf1 include:_spf.mx.cloudflare.net ~all"], dmarc: ["v=DMARC1; p=none; rua=mailto:dmarc@contoh.test"], dkim: ["v=DKIM1; k=rsa; p=MIIB"] })
    expect(ok.every((c) => c.ok)).toBe(true)
    const bad = evaluateDns({ spf: [], dmarc: ["v=DMARC1"], dkim: [] })
    expect(bad.map((c) => c.ok)).toEqual([false, false, false])
  })
  it("headers: SPF + DKIM + aligned DMARC pass; delivery under 60 s", () => {
    const raw = [
      "Received: from mx.example by mx.google.com; Mon, 16 Nov 2026 09:00:20 +0700",
      "Authentication-Results: mx.google.com;",
      "       dkim=pass header.i=@mail.geraiexpress.com;",
      "       spf=pass smtp.mailfrom=mail.geraiexpress.com;",
      "       dmarc=pass (p=NONE) header.from=mail.geraiexpress.com",
      "Date: Mon, 16 Nov 2026 09:00:05 +0700",
    ].join("\n")
    expect(evaluateHeaders(raw)).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass", pass: true })
    expect(deliverySeconds(raw)).toBe(15)
    expect(evaluateHeaders(raw.replace("dmarc=pass", "dmarc=fail")).pass).toBe(false)
  })
  it("matrix: 3 providers × 2 templates × 2 sends", () => {
    expect(INBOX_MATRIX).toHaveLength(12)
  })
})
