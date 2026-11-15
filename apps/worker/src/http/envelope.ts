// Standard JSON envelope (spec 07 §4). `message` is always user-safe Bahasa Indonesia.
export type FieldErrors = Record<string, string>

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly userMessage: string,
    readonly fieldErrors: FieldErrors = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(code)
  }
}

export function ok<T>(data: T, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json({ ok: true, data }, { status, headers: { "cache-control": "no-store", ...headers } })
}

export function fail(status: number, code: string, message: string, fieldErrors: FieldErrors = {}, headers: Record<string, string> = {}): Response {
  return Response.json(
    { ok: false, error: { code, message, field_errors: fieldErrors } },
    { status, headers: { "cache-control": "no-store", ...headers } },
  )
}

export function fromError(err: unknown): Response {
  if (err instanceof AppError) return fail(err.status, err.code, err.userMessage, err.fieldErrors, err.headers)
  return fail(500, "INTERNAL", "Terjadi kesalahan pada sistem. Silakan coba lagi sebentar lagi.")
}
