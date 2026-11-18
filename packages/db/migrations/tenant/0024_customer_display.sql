-- TASK-701 Layar Pelanggan (PR-22, spec 03 §5). The outlet's static QRIS image, and paired customer displays: only the
-- SHA-256 of the pairing token is stored; one live pairing per member; a bound shift's close revokes it.
ALTER TABLE tenant_outlets ADD COLUMN qris_media_id TEXT;

-- `media_objects.purpose` gains 'qris' (owner-only upload). SQLite cannot widen a CHECK in place: rebuild the table
-- with the same columns and a superset check (rows and ids kept; code of the previous release still writes valid rows).
CREATE TABLE media_objects_v24 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('logo','qris','evidence','return_photo','claim','signature')),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  uploaded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO media_objects_v24 (id, tenant_id, r2_key, purpose, content_type, size_bytes, uploaded_by, created_at)
  SELECT id, tenant_id, r2_key, purpose, content_type, size_bytes, uploaded_by, created_at FROM media_objects;
DROP TABLE media_objects;
ALTER TABLE media_objects_v24 RENAME TO media_objects;

CREATE TABLE customer_display_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_by_user_id TEXT NOT NULL,
  shift_id TEXT,
  state_json TEXT NOT NULL,
  state_updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX customer_display_sessions_creator ON customer_display_sessions (created_by_user_id) WHERE revoked_at IS NULL;
CREATE INDEX customer_display_sessions_shift ON customer_display_sessions (shift_id) WHERE shift_id IS NOT NULL;
