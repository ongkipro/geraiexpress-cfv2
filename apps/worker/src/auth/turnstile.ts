// Cloudflare Turnstile Siteverify (spec 05 §1, PR-01). Locally the documented always-pass test secret is used.
export async function verifyTurnstile(secret: string, token: string | undefined, ip: string | null, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!token || token.length > 2048) return false
  const body = new FormData()
  body.append("secret", secret)
  body.append("response", token)
  if (ip) body.append("remoteip", ip)
  try {
    const res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5_000) })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
