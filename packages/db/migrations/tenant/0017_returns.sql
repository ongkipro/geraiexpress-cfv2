-- TASK-404 Meja Retur (spec 04 §2, ADR-0005, DEC-206): intake of an arriving RTS parcel, true-sender reveal (audited),
-- 4-digit `Kode Ambil` stored only as a salted hash, verified handback (code, or owner ID check with a reason).
CREATE TABLE return_intakes (
  slug TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('baik','penyok_rusak','terbuka')),
  photo_r2_key TEXT,
  note TEXT,
  intake_by TEXT NOT NULL,
  intake_at INTEGER NOT NULL,
  code_hash TEXT,
  code_salt TEXT,
  code_issued_at INTEGER,
  code_attempts INTEGER NOT NULL DEFAULT 0,
  code_locked_until INTEGER,
  storage_deadline_at INTEGER NOT NULL,
  handback_at INTEGER,
  handback_by TEXT,
  handback_method TEXT CHECK (handback_method IS NULL OR handback_method IN ('code','id_override')),
  handback_reason TEXT,
  claim_offered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX return_intakes_open ON return_intakes(handback_at, intake_at);
