import { useId } from "react"
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
}) {
  const id = useId()
  return (
    <Field data-invalid={props.error ? true : undefined}>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Input
        id={id}
        name={props.name}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        required={props.required}
        maxLength={props.maxLength}
        aria-invalid={props.error ? true : undefined}
      />
      {props.hint && !props.error ? <FieldDescription>{props.hint}</FieldDescription> : null}
      {props.error ? <FieldError>{props.error}</FieldError> : null}
    </Field>
  )
}
