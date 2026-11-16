-- TASK-307 cash drawer shifts (spec 03 §4, ADR-0004 §3) and sender COD payout (spec 03 §1.2).
CREATE TABLE cashier_shifts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  cashier_user_id TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  opening_float_idr INTEGER NOT NULL CHECK (opening_float_idr >= 0),
  closed_at INTEGER,
  counted_cash_idr INTEGER CHECK (counted_cash_idr IS NULL OR counted_cash_idr >= 0),
  expected_cash_idr INTEGER,
  variance_idr INTEGER,
  variance_reason_code TEXT CHECK (variance_reason_code IS NULL OR variance_reason_code IN ('salah_kembalian','uang_palsu','lupa_catat','pengeluaran_kecil','selisih_lain')),
  variance_note TEXT,
  state TEXT NOT NULL CHECK (state IN ('open','closed'))
);
-- At most one open shift per cashier (one drawer per cashier at the counter).
CREATE UNIQUE INDEX cashier_shifts_one_open ON cashier_shifts(cashier_user_id) WHERE state = 'open';
CREATE INDEX cashier_shifts_opened ON cashier_shifts(opened_at);

ALTER TABLE shipments ADD COLUMN sender_cod_paid_idr INTEGER;
ALTER TABLE shipments ADD COLUMN reconciled_provider_cod_credit_idr INTEGER;
