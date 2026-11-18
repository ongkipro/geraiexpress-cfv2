import { describe, expect, it } from "vitest"
import { safeReturnPath } from "./return-path"

const O = "https://owner.geraiexpress.com"

describe("safeReturnPath (DEC-246 Sol R1 #3)", () => {
  it("keeps same-origin console paths with their query", () => {
    expect(safeReturnPath("/akun", O)).toBe("/akun")
    expect(safeReturnPath("/sistem?tab=audit", O)).toBe("/sistem?tab=audit")
    expect(safeReturnPath("/pengawasan?tab=risiko#x", O)).toBe("/pengawasan?tab=risiko#x")
  })
  it("refuses protocol-relative, backslash, absolute and non-path values", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "\\\\evil.example", "https://evil.example/", "javascript:alert(1)", "akun", "", undefined, 42])
      expect(safeReturnPath(bad, O), String(bad)).toBeUndefined()
  })
  it("refuses tab, CR, LF and other control or whitespace characters (browsers strip them while parsing)", () => {
    for (const bad of ["/\t/evil.example", "/\r/evil.example", "/\n/evil.example", "/\u0000/evil.example", "/\u007F/x", "/ /evil.example", "/akun\u000B"])
      expect(safeReturnPath(bad, O), JSON.stringify(bad)).toBeUndefined()
    // The decoded form of `kembali=%2F%09%2Fevil.example` is exactly the tab case.
    expect(safeReturnPath(decodeURIComponent("%2F%09%2Fevil.example"), O)).toBeUndefined()
  })
})
