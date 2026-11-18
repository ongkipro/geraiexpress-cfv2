/**
 * Indonesian constraint-validation messages (DEC-247 §4). The browser's own bubbles ("Please fill out this field")
 * speak the browser's language; this safety net replaces them in both SPAs so no English bubble can reach an operator.
 *
 * - `indonesianValidityMessage`: pure — one ValidityState-like reason + field facts → the Indonesian message.
 * - `installIndonesianValidation`: installed once at each SPA root. On `invalid` (capture) it sets an Indonesian
 *   message with `setCustomValidity`; it never overrides a message the page set itself, and it clears its own message
 *   on input, change and the next submit click, so a fixed field never stays invalid. Forms with `noValidate` and their
 *   own field errors (most app forms) never fire `invalid` on submit, so they are untouched.
 */

export type ValidityLike = Pick<
  ValidityState,
  "valid" | "valueMissing" | "typeMismatch" | "patternMismatch" | "tooLong" | "tooShort" | "rangeUnderflow" | "rangeOverflow" | "stepMismatch" | "badInput"
>

export interface FieldInfo {
  validity: ValidityLike
  /** `select`, `textarea`, or the input type (`email`, `url`, `number`, `checkbox`, …). */
  kind: string
  label?: string
  placeholder?: string
  minLength?: number
  maxLength?: number
  min?: string
  max?: string
  step?: string
}

const DATE_KINDS = new Set(["date", "datetime-local", "month", "week", "time"])

/** `1000` → `1.000` for numeric bounds; dates and anything non-numeric stay as written. */
const bound = (kind: string, v: string | undefined) => (v !== undefined && !DATE_KINDS.has(kind) && /^-?\d+(\.\d+)?$/.test(v) ? Number(v).toLocaleString("id-ID") : (v ?? ""))

/** The Indonesian message for the first failing constraint, or "" when the field is valid. */
export function indonesianValidityMessage(f: FieldInfo): string {
  const v = f.validity
  if (v.valid) return ""
  const label = f.label?.trim()
  if (v.valueMissing) {
    if (f.kind === "checkbox") return "Centang kotak ini untuk melanjutkan."
    if (f.kind === "radio") return label ? `Pilih salah satu ${label}.` : "Pilih salah satu opsi."
    if (f.kind.startsWith("select")) return label ? `Pilih ${label} terlebih dahulu.` : "Pilih salah satu opsi."
    if (f.kind === "file") return "Pilih file terlebih dahulu."
    return label ? `${label} wajib diisi.` : "Wajib diisi."
  }
  if (v.badInput) {
    if (f.kind === "number" || f.kind === "range") return "Masukkan angka yang valid."
    if (DATE_KINDS.has(f.kind)) return "Masukkan tanggal atau waktu yang valid."
    return "Isian belum valid."
  }
  if (v.typeMismatch) {
    if (f.kind === "email") return "Masukkan alamat email yang valid (contoh: nama@domain.com)."
    if (f.kind === "url") return "Masukkan alamat URL lengkap, diawali https://."
    return "Format isian belum sesuai."
  }
  if (v.patternMismatch) {
    const example = f.placeholder?.trim()
    return `Format ${label ?? "isian"} belum sesuai${example ? ` (contoh: ${example})` : ""}.`
  }
  if (v.tooLong) return `Maksimal ${f.maxLength} karakter.`
  if (v.tooShort) return `Minimal ${f.minLength} karakter.`
  if (v.rangeUnderflow) return DATE_KINDS.has(f.kind) ? `Paling awal ${f.min}.` : `Nilai minimal ${bound(f.kind, f.min)}.`
  if (v.rangeOverflow) return DATE_KINDS.has(f.kind) ? `Paling akhir ${f.max}.` : `Nilai maksimal ${bound(f.kind, f.max)}.`
  if (v.stepMismatch) return !f.step || f.step === "1" ? "Masukkan bilangan bulat." : `Masukkan kelipatan ${bound(f.kind, f.step)}.`
  return "Isian belum valid."
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
const isField = (t: EventTarget | null): t is Field => !!t && typeof (t as Field).setCustomValidity === "function" && "validity" in t

function describe(el: Field): FieldInfo {
  const input = el as HTMLInputElement
  const label = el.getAttribute("data-validity-label") ?? el.labels?.[0]?.textContent ?? el.getAttribute("aria-label") ?? ""
  return {
    validity: el.validity,
    kind: el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : input.type || "text",
    label: label.replace(/\s+/g, " ").replace(/[*:\s]+$/, "").trim().slice(0, 60),
    placeholder: el.getAttribute("placeholder") ?? undefined,
    minLength: input.minLength,
    maxLength: input.maxLength,
    min: el.getAttribute("min") ?? undefined,
    max: el.getAttribute("max") ?? undefined,
    step: el.getAttribute("step") ?? undefined,
  }
}

/** Installs the safety net on `root` (default `document`); a second call on the same root is a no-op. */
export function installIndonesianValidation(root: Document = document) {
  const r = root as Document & { __gxValidationId?: true }
  if (r.__gxValidationId) return
  r.__gxValidationId = true
  // Ownership is decided by who called `setCustomValidity`, never by the text: once this net has touched a field, the
  // field's setter is wrapped so any other caller (even with the very same words) takes the message over.
  const ours = new WeakSet<Field>()
  const wrapped = new WeakSet<Field>()
  let self = false
  const put = (el: Field, message: string) => {
    if (!wrapped.has(el)) {
      const native = el.setCustomValidity
      el.setCustomValidity = (m: string) => {
        if (!self) ours.delete(el)
        native.call(el, m)
      }
      wrapped.add(el)
    }
    self = true
    try {
      el.setCustomValidity(message)
    } finally {
      self = false
    }
    if (message) ours.add(el)
    else ours.delete(el)
  }
  const release = (el: Field) => {
    if (ours.has(el)) put(el, "")
  }
  root.addEventListener(
    "invalid",
    (e) => {
      const el = e.target
      if (!isField(el)) return
      if (el.validity.customError && !ours.has(el)) return
      release(el)
      // Only our stale message made it invalid: no empty bubble, the next attempt passes.
      if (el.validity.valid) return e.preventDefault()
      put(el, indonesianValidityMessage(describe(el)))
    },
    true,
  )
  const onEdit = (e: Event) => isField(e.target) && release(e.target)
  root.addEventListener("input", onEdit, true)
  root.addEventListener("change", onEdit, true)
  // A submit click starts a fresh validation pass: nothing of ours may linger into it.
  root.addEventListener(
    "click",
    (e) => {
      const button = (e.target as Element | null)?.closest?.("button, input[type=submit], input[type=image]") as HTMLButtonElement | HTMLInputElement | null
      if (!button?.form || !["submit", "image"].includes(button.type)) return
      for (const el of Array.from(button.form.elements)) if (isField(el)) release(el)
    },
    true,
  )
}
