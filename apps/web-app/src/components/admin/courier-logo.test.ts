import { describe, expect, it } from "vitest"
import { courierInitials, courierKey } from "./courier-logo"

describe("courierKey", () => {
  it("maps every catalog service and courier code (0007, 0018) to its logo", () => {
    const codes: Record<string, string> = {
      JNE: "jne", JNECargo: "jne", SiCepat: "sicepat", SiCepatCargo: "sicepat", Sap: "sap", SapCargo: "sap", SAPCargo: "sap", SAP: "sap", SAPLite: "sap",
      iDexpress: "idexpress", iDexpressCargo: "idexpress", JT: "jt", JTEco: "jt", lion: "lion", anteraja: "anteraja", pos: "pos", spx: "spx",
    }
    for (const [code, key] of Object.entries(codes)) expect(courierKey(code), code).toBe(key)
  })

  it("maps catalog display names (customer display, cek resi)", () => {
    const names: Record<string, string> = {
      "JNE Reguler": "jne", "J&T Express": "jt", "J&T ECO": "jt", "SiCepat Reguler": "sicepat", "SAP Express": "sap", "SAP Cargo": "sap",
      "iDexpress Cargo": "idexpress", "Lion Parcel": "lion", Anteraja: "anteraja", "Pos Indonesia": "pos", "SPX Express": "spx",
    }
    for (const [name, key] of Object.entries(names)) expect(courierKey(name), name).toBe(key)
  })

  it("an unknown or empty value gets no logo (fallback monogram)", () => {
    for (const v of ["ninja", "Ninja Xpress", "", null, undefined, "<script>"]) expect(courierKey(v)).toBeNull()
    expect(courierInitials("Ninja Xpress")).toBe("NX")
    expect(courierInitials("ninja")).toBe("NI")
    expect(courierInitials("")).toBe("?")
  })
})
