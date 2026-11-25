// Shared input sanitisers for numeric-only and numeric-formatted fields across web-app forms.
// Phone keeps `+`, `-`, spaces, `()`, `.` so Indonesian copy-paste (`+62 812-3456-7890`) works while stray letters are blocked.

export const sanitizePhone = (raw: string) => raw.replace(/[^\d+\s\-().]/g, "").slice(0, 20)
export const sanitizeDigits = (raw: string, max: number) => raw.replace(/\D/g, "").slice(0, max)
export const sanitizeDecimal = (raw: string) => raw.replace(/[^\d.,]/g, "").slice(0, 12)
export const sanitizeCoord = (raw: string) => raw.replace(/[^\d.,-]/g, "").slice(0, 20)
export const sanitizeNpwp = (raw: string) => raw.replace(/[^\d.\-\s]/g, "").slice(0, 24)
export const sanitizeDateDmy = (raw: string) => raw.replace(/[^\d/]/g, "").slice(0, 10)
