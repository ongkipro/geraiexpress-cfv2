// Cloudflare Turnstile Siteverify (spec 05 §1, PR-01). Locally the documented always-pass test secret is used.
import { clientIp } from "../http/request"

// Cloudflare's documented Turnstile test secrets look like "1x" + zeros + two letters.
export const isTurnstileTestKey = (k: string) => /^[123]x0{20,}[A-Za-z]{2}$/.test(k)

export const turnstileDev = (env: Pick<Env, "GX_ENV" | "TURNSTILE_SECRET_KEY">) => env.GX_ENV === "local" && isTurnstileTestKey(env.TURNSTILE_SECRET_KEY)

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

export async function checkTurnstile(
  env: Pick<Env, "GX_ENV" | "TURNSTILE_SITE_KEY" | "TURNSTILE_SECRET_KEY">,
  token: unknown,
  req: Request,
): Promise<boolean> {
  if (turnstileDev(env)) return typeof token === "string" && token.length > 0
  if (!env.TURNSTILE_SITE_KEY) return false
  return verifyTurnstile(env.TURNSTILE_SECRET_KEY, typeof token === "string" ? token : undefined, clientIp(req))
}
