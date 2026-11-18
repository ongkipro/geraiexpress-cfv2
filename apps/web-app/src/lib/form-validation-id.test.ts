import { describe, expect, it } from "vitest"
import { indonesianValidityMessage, installIndonesianValidation, type FieldInfo, type ValidityLike } from "./form-validation-id"

const OK: ValidityLike = { valid: true, valueMissing: false, typeMismatch: false, patternMismatch: false, tooLong: false, tooShort: false, rangeUnderflow: false, rangeOverflow: false, stepMismatch: false, badInput: false }
const bad = (flag: Exclude<keyof ValidityLike, "valid">): ValidityLike => ({ ...OK, valid: false, [flag]: true })
const msg = (flag: Exclude<keyof ValidityLike, "valid">, f: Partial<FieldInfo> = {}) => indonesianValidityMessage({ kind: "text", ...f, validity: bad(flag) })

describe("indonesianValidityMessage", () => {
  it("is empty for a valid field", () => {
    expect(indonesianValidityMessage({ kind: "text", validity: OK })).toBe("")
  })

  it("valueMissing: names the field when it has a label, per control kind", () => {
    expect(msg("valueMissing")).toBe("Wajib diisi.")
    expect(msg("valueMissing", { label: "Nama gerai" })).toBe("Nama gerai wajib diisi.")
    expect(msg("valueMissing", { kind: "email", label: "Email" })).toBe("Email wajib diisi.")
    expect(msg("valueMissing", { kind: "checkbox", label: "Setuju" })).toBe("Centang kotak ini untuk melanjutkan.")
    expect(msg("valueMissing", { kind: "radio" })).toBe("Pilih salah satu opsi.")
    expect(msg("valueMissing", { kind: "radio", label: "metode bayar" })).toBe("Pilih salah satu metode bayar.")
    expect(msg("valueMissing", { kind: "select", label: "Kecamatan" })).toBe("Pilih Kecamatan terlebih dahulu.")
    expect(msg("valueMissing", { kind: "select-one" })).toBe("Pilih salah satu opsi.")
    expect(msg("valueMissing", { kind: "file" })).toBe("Pilih file terlebih dahulu.")
  })

  it("typeMismatch: email and url differ", () => {
    expect(msg("typeMismatch", { kind: "email" })).toBe("Masukkan alamat email yang valid (contoh: nama@domain.com).")
    expect(msg("typeMismatch", { kind: "url" })).toBe("Masukkan alamat URL lengkap, diawali https://.")
    expect(msg("typeMismatch", { kind: "text" })).toBe("Format isian belum sesuai.")
  })

  it("badInput: numbers and dates", () => {
    expect(msg("badInput", { kind: "number" })).toBe("Masukkan angka yang valid.")
    expect(msg("badInput", { kind: "date" })).toBe("Masukkan tanggal atau waktu yang valid.")
    expect(msg("badInput", { kind: "text" })).toBe("Isian belum valid.")
  })

  it("patternMismatch: names the field and shows the placeholder as an example", () => {
    expect(msg("patternMismatch")).toBe("Format isian belum sesuai.")
    expect(msg("patternMismatch", { label: "Alamat gerai", placeholder: "tokosaya" })).toBe("Format Alamat gerai belum sesuai (contoh: tokosaya).")
  })

  it("length bounds carry the numbers", () => {
    expect(msg("tooLong", { maxLength: 80 })).toBe("Maksimal 80 karakter.")
    expect(msg("tooShort", { minLength: 8 })).toBe("Minimal 8 karakter.")
  })

  it("range bounds: numbers formatted id-ID, dates as written", () => {
    expect(msg("rangeUnderflow", { kind: "number", min: "1000" })).toBe("Nilai minimal 1.000.")
    expect(msg("rangeOverflow", { kind: "number", max: "10000000" })).toBe("Nilai maksimal 10.000.000.")
    expect(msg("rangeUnderflow", { kind: "date", min: "2026-01-01" })).toBe("Paling awal 2026-01-01.")
    expect(msg("rangeOverflow", { kind: "date", max: "2026-12-31" })).toBe("Paling akhir 2026-12-31.")
  })

  it("step: whole numbers or multiples", () => {
    expect(msg("stepMismatch", { kind: "number" })).toBe("Masukkan bilangan bulat.")
    expect(msg("stepMismatch", { kind: "number", step: "1" })).toBe("Masukkan bilangan bulat.")
    expect(msg("stepMismatch", { kind: "number", step: "500" })).toBe("Masukkan kelipatan 500.")
  })

  it("never returns an English or empty message for an invalid field", () => {
    const flags = Object.keys(OK).filter((k) => k !== "valid") as Array<Exclude<keyof ValidityLike, "valid">>
    for (const kind of ["text", "email", "url", "number", "date", "checkbox", "radio", "select", "textarea", "file"])
      for (const flag of flags) {
        const m = msg(flag, { kind, min: "1", max: "9", minLength: 2, maxLength: 9, step: "2" })
        expect(m).not.toBe("")
        expect(m).not.toMatch(/please|field|enter|include/i)
      }
  })
})

// The installer against a fake root and field (no DOM in the unit project).
function fakeField(validity: Partial<ValidityLike>, label = "Email") {
  let custom = ""
  const base = { ...OK, ...validity }
  return {
    tagName: "INPUT",
    type: "email",
    minLength: -1,
    maxLength: -1,
    labels: [{ textContent: `${label} *` }],
    getAttribute: () => null,
    get validity() {
      const own = { ...base, customError: custom !== "" }
      return { ...own, valid: own.valid && !own.customError }
    },
    get validationMessage() {
      return custom || (base.valid ? "" : "Please fill out this field.")
    },
    setCustomValidity(m: string) {
      custom = m
    },
    fix() {
      Object.assign(base, OK)
    },
  }
}
function fakeRoot() {
  const listeners: Record<string, (e: Event) => void> = {}
  const root = { addEventListener: (type: string, fn: (e: Event) => void) => void (listeners[type] = fn) }
  const fire = (type: string, target: unknown) => {
    let prevented = false
    listeners[type]?.({ target, preventDefault: () => void (prevented = true) } as unknown as Event)
    return prevented
  }
  return { root: root as unknown as Document, fire }
}

describe("installIndonesianValidation", () => {
  it("sets the Indonesian message on invalid and clears it on input", () => {
    const { root, fire } = fakeRoot()
    installIndonesianValidation(root)
    const el = fakeField({ valid: false, valueMissing: true })
    fire("invalid", el)
    expect(el.validationMessage).toBe("Email wajib diisi.")
    el.fix()
    fire("input", el)
    expect(el.validationMessage).toBe("")
    expect(el.validity.valid).toBe(true)
  })

  it("leaves a message the page set itself", () => {
    const { root, fire } = fakeRoot()
    installIndonesianValidation(root)
    const el = fakeField({})
    el.setCustomValidity("Nomor HP harus diawali 08.")
    fire("invalid", el)
    expect(el.validationMessage).toBe("Nomor HP harus diawali 08.")
  })

  it("a stale message of its own is dropped without a bubble", () => {
    const { root, fire } = fakeRoot()
    installIndonesianValidation(root)
    const el = fakeField({ valid: false, valueMissing: true })
    fire("invalid", el)
    el.fix() // changed without an input event (programmatic)
    expect(fire("invalid", el)).toBe(true)
    expect(el.validity.valid).toBe(true)
  })
})
