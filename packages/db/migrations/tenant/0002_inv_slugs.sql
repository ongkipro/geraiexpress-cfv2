-- TASK-108: per-tenant INV slug registry (DEC-211). The slug is the (tenant_id, slug) identity of a shipment; the
-- registry guarantees uniqueness inside this object before any shipment row exists (drafts, QR pre-bookings).
CREATE TABLE inv_slugs (
  slug TEXT PRIMARY KEY CHECK (length(slug) = 7 AND slug NOT GLOB '*[^23456789abcdefghjkmnpqrstvwxyz]*'),
  purpose TEXT NOT NULL CHECK (purpose IN ('draft','minisite_qr','bulk','api')),
  created_at INTEGER NOT NULL
);
