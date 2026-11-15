import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { auditDirs, scanText } from "./bundle-audit-lib.mjs"

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "gx-audit-"))
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true })
    writeFileSync(join(dir, name), body)
  }
  return dir
}

describe("bundle audit (DEC-210)", () => {
  it("passes a clean bundle", () => {
    const dir = fixture({ "app/assets/a.js": "console.log('halo')", "app/index.html": "<html></html>" })
    expect(auditDirs([{ dir, client: true }]).problems).toEqual([])
  })
  it("fails on an emitted .map file", () => {
    const dir = fixture({ "app/assets/a.js": "x", "app/assets/a.js.map": "{}" })
    expect(auditDirs([{ dir, client: true }]).problems.join()).toMatch(/source map file/)
  })
  it("fails on a sourceMappingURL comment in JS and CSS, and on an upper-case .MAP file", () => {
    expect(scanText("x\n//# sourceMappingURL=a.js.map", { client: true })).toContain("sourcemap-comment")
    expect(scanText("a{}\n/*# sourceMappingURL=a.css.map */", { client: true })).toContain("sourcemap-comment")
    const dir = fixture({ "app/assets/a.JS.MAP": "{}" })
    expect(auditDirs([{ dir, client: true }]).problems.join()).toMatch(/source map file/)
  })
  it("fails on an injected key-shaped literal", () => {
    const fake = "ghp_" + "A".repeat(36)
    expect(scanText(`const t="${fake}"`, { client: false })).toContain("github-token")
    expect(scanText(`k="gx_live_${"b".repeat(32)}"`, { client: false })).toContain("gx-live-key")
  })
  it("fails when a SECRET/PARTNER/PRIVATE-like name reaches a client bundle but not the worker bundle", () => {
    for (const n of ["MENGANTAR_PARTNER_SECRET", "MENGANTAR_PARTNER_ID", "PARTNER_RELAY_URL", "WEBHOOK_SECRET", "PRIVATE_KEY", "AUTH_SESSION_PEPPER", "KEK_SECRET", "CF_SAAS_API_TOKEN"]) {
      expect(scanText(`env.${n}`, { client: true }), n).toContain(`name:${n}`)
    }
    expect(scanText("env.MENGANTAR_PARTNER_SECRET", { client: false })).toEqual([])
  })
  it("fails on a literal Mengantar seller key in a URL path but not on the {API_KEY} template", () => {
    expect(scanText('fetch("https://api-public.mengantar.com/api/public/abcDEF123456/order")', { client: false })).toContain("mengantar-url-key")
    expect(scanText("https://api-public.mengantar.com/api/public/{API_KEY}/order", { client: false })).toEqual([])
    expect(scanText("`https://api-public.mengantar.com/api/public/${key}/order`", { client: false })).toEqual([])
  })
})
