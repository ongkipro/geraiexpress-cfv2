// PBKDF2-SHA256, 100,000 iterations, 16-byte random salt, plus server pepper (spec 05 §2.1). Format:
// "pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>". The iteration count is stored so it can be raised later.
const te = new TextEncoder()
export const PBKDF2_ITERATIONS = 100_000
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

async function derive(password: string, pepper: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", te.encode(`${password}\u0000${pepper}`), "PBKDF2", false, ["deriveBits"])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256))
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, pepper, salt, PBKDF2_ITERATIONS)
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64u(salt)}$${b64u(hash)}`
}

export async function verifyPassword(password: string, pepper: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, hash] = stored.split("$")
  if (alg !== "pbkdf2-sha256" || !iter || !salt || !hash) return false
  const iterations = Number(iter)
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false
  const actual = await derive(password, pepper, unb64u(salt), iterations)
  const expected = unb64u(hash)
  return actual.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(actual, expected)
}

/** Indonesian validation message or null. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Kata sandi minimal ${PASSWORD_MIN} karakter.`
  if (password.length > PASSWORD_MAX) return `Kata sandi maksimal ${PASSWORD_MAX} karakter.`
  if (email && password.toLowerCase().includes(email.split("@")[0]!.toLowerCase()) && email.split("@")[0]!.length >= 4) {
    return "Kata sandi jangan memuat alamat email Anda."
  }
  if (/^(.)\1+$/.test(password) || /^(12345678|password|katasandi|qwertyui)/i.test(password)) return "Kata sandi terlalu mudah ditebak."
  return null
}

/** A precomputed hash used to keep login timing constant for unknown emails. */
export const DUMMY_HASH = "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
