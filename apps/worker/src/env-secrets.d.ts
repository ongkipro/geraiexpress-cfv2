// Optional Worker secrets not listed in wrangler.jsonc `secrets.required` so local dev and CI without live Mengantar
// credentials still run in mock mode while staging and production bind them via `wrangler secret put`.
declare namespace Cloudflare {
  interface Env {
    MENGANTAR_PUBLIC_READ_KEY?: string
  }
}

interface Env {
  MENGANTAR_PUBLIC_READ_KEY?: string
}
