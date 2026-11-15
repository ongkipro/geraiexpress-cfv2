// `INV` slug (DEC-211, spec 06 §2): 7 chars, CSPRNG, Crockford-style alphabet without 0/O/1/I/L/U.
export const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstvwxyz" as const
export const SLUG_LENGTH = 7

const SLUG_RE = new RegExp(`^[${SLUG_ALPHABET}]{${SLUG_LENGTH}}$`)
// 30 symbols; reject bytes >= 240 (8 × 30) so every symbol is equally likely (no modulo bias).
const ACCEPT_BELOW = 240

export function generateSlug(random: (buf: Uint8Array<ArrayBuffer>) => void = (b) => void crypto.getRandomValues(b)): string {
  let out = ""
  const buf = new Uint8Array(new ArrayBuffer(16))
  while (out.length < SLUG_LENGTH) {
    random(buf)
    for (const byte of buf) {
      if (byte >= ACCEPT_BELOW) continue
      out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length]
      if (out.length === SLUG_LENGTH) break
    }
  }
  return out
}

/** Case-insensitive normalisation for lookups (`8K4M2P7` → `8k4m2p7`); `null` when not a valid slug. */
export function normalizeSlug(input: string): string | null {
  // `i` is not in the alphabet, so an `INV` prefix (with `:`, `#` or `-`) can be stripped unambiguously.
  const s = input.trim().toLowerCase().replace(/^inv\s*[:#-]?\s*/, "").replace(/^#/, "")
  return SLUG_RE.test(s) ? s : null
}

export function isSlug(s: string): boolean {
  return SLUG_RE.test(s)
}

/** Display form `INV 8K4M2P7`. */
export function displayInv(slug: string): string {
  if (!isSlug(slug)) throw new RangeError("not an INV slug")
  return `INV ${slug.toUpperCase()}`
}

/** Mengantar `destinationMark` (uppercase; matched case-insensitively on read-back). */
export function destinationMark(slug: string): string {
  if (!isSlug(slug)) throw new RangeError("not an INV slug")
  return slug.toUpperCase()
}
