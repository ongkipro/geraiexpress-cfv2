// DEC-209 source scan: Super Admin modules call only read/admin GeraiVaultDO RPCs (never shipment or money mutations).
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { scanOwnerVaultCalls } from "./route-scan-lib.mjs"

const SRC = path.resolve(import.meta.dirname, "../../apps/worker/src")
const OWNER_SIDE = ["admin", "pricing", "onboarding", "do/gerai-vault/credentials", "api/owner.ts"]

function collect(rel) {
  const p = path.join(SRC, rel)
  if (p.endsWith(".ts")) return [{ path: rel, source: readFileSync(p, "utf8") }]
  return readdirSync(p, { withFileTypes: true }).flatMap((e) => collect(path.join(rel, e.name)).filter((f) => f.path.endsWith(".ts") || !path.extname(f.path)))
}

describe("non-impersonation source scan (DEC-209)", () => {
  it("owner-side modules call only allowlisted vault RPCs", () => {
    const files = OWNER_SIDE.flatMap(collect).filter((f) => f.path.endsWith(".ts"))
    expect(files.length).toBeGreaterThan(5)
    expect(scanOwnerVaultCalls(files)).toEqual([])
  })
  it("the scan catches a direct and an aliased mutation call", () => {
    expect(scanOwnerVaultCalls([{ path: "x.ts", source: "await vaultFor(env, id).createShipment({})" }])).toHaveLength(1)
    expect(scanOwnerVaultCalls([{ path: "y.ts", source: "const vault = vaultFor(env, id)\nawait vault.cancelShipment('a')" }])).toHaveLength(1)
  })
})
