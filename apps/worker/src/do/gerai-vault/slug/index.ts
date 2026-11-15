// INV slug allocation inside the tenant object (TASK-108, DEC-211, ADR-0004 §2): CSPRNG slug, uniqueness enforced by
// the object's own SQLite PRIMARY KEY, regenerate on conflict. Synchronous so callers can allocate inside their own
// `transactionSync` together with the draft/shipment row.
import { generateSlug } from "@gx/domain/slug"

export type SlugPurpose = "draft" | "minisite_qr" | "bulk" | "api"
const MAX_ATTEMPTS = 8 // 30^7 ≈ 2.2e10 per tenant: eight consecutive collisions mean a broken generator, not bad luck.

export function allocateSlug(storage: DurableObjectStorage, purpose: SlugPurpose, now: number, gen: () => string = generateSlug): string {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const slug = gen()
    const inserted = storage.sql.exec("INSERT INTO inv_slugs (slug, purpose, created_at) VALUES (?, ?, ?) ON CONFLICT(slug) DO NOTHING RETURNING slug", slug, purpose, now).toArray()
    if (inserted.length === 1) return slug
  }
  throw new Error("SLUG_EXHAUSTED")
}

export function slugTaken(storage: DurableObjectStorage, slug: string): boolean {
  return storage.sql.exec("SELECT 1 FROM inv_slugs WHERE slug = ?", slug).toArray().length > 0
}
