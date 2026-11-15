// Turnstile widget token. Production loads the Cloudflare script on the auth pages (CSP allows challenges.cloudflare.com);
// local development uses the documented always-pass test key, so a placeholder token is enough.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA"

export function devTurnstileToken(): string {
  return "XXXX.DUMMY.TOKEN.XXXX"
}
