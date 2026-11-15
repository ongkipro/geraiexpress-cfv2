// Same-origin JSON client for /api/app/* (spec 07 §4 envelope). Errors carry the server's Indonesian message.
export interface ApiErrorBody {
  code: string
  message: string
  field_errors: Record<string, string>
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message)
  }
}

const NETWORK_MESSAGE = "Koneksi terputus. Periksa internet lalu coba lagi."

export async function api<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/app${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? {} : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    })
  } catch {
    throw new ApiError(0, { code: "NETWORK", message: NETWORK_MESSAGE, field_errors: {} })
  }
  const json = (await res.json().catch(() => null)) as { ok: true; data: T } | { ok: false; error: ApiErrorBody } | null
  if (!json) throw new ApiError(res.status, { code: "BAD_RESPONSE", message: "Terjadi kesalahan pada sistem. Silakan coba lagi.", field_errors: {} })
  if (!json.ok) throw new ApiError(res.status, json.error)
  return json.data
}
