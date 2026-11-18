import { useId, useState } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field"
import { Input } from "../ui/input"

export function TextField(props: {
  label: string
  name: string
  type?: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  inputMode?: "text" | "email" | "numeric" | "decimal"
  error?: string
  hint?: string
  required?: boolean
  maxLength?: number
  /** Fixed text inside the input frame on the right (`.geraimitra.com`). */
  suffix?: string
  /** A one-time code: monospace, spaced and centred. */
  otp?: boolean
}) {
  const id = useId()
  const isPassword = props.type === "password"
  // DEC-248: a password field carries an inline `Lihat` / `Sembunyikan` text toggle.
  const [shown, setShown] = useState(false)
  const input = (
    <Input
      id={id}
      name={props.name}
      type={isPassword && shown ? "text" : (props.type ?? "text")}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      autoComplete={props.autoComplete}
      inputMode={props.inputMode}
      required={props.required}
      maxLength={props.maxLength}
      aria-invalid={props.error ? true : undefined}
      aria-describedby={props.suffix ? `${id}-suffix` : undefined}
      className={isPassword ? "pr-28" : props.suffix ? "pr-36" : props.otp ? "text-center font-mono text-lg tracking-[0.25em] md:text-lg" : undefined}
    />
  )
  return (
    <Field data-invalid={props.error ? true : undefined}>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      {isPassword || props.suffix ? (
        <div className="relative">
          {input}
          {isPassword ? (
            <button
              type="button"
              aria-pressed={shown}
              aria-controls={id}
              onClick={() => setShown((v) => !v)}
              className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-end rounded-r-lg px-3 text-sm font-medium text-[#64748B] hover:text-[#0F172A] focus-visible:outline-2 focus-visible:outline-ring"
            >
              {shown ? "Sembunyikan" : "Lihat"}
            </button>
          ) : (
            <span id={`${id}-suffix`} className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base text-[#64748B] md:text-sm">
              {props.suffix}
            </span>
          )}
        </div>
      ) : (
        input
      )}
      {props.hint && !props.error ? <FieldDescription>{props.hint}</FieldDescription> : null}
      {props.error ? <FieldError>{props.error}</FieldError> : null}
    </Field>
  )
}
