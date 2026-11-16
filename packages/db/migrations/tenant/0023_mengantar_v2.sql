-- DEC-238 Mengantar Public API v2.0.0 parity.
-- Counter fields sent with create-order: non-COD goods value (`goodsValue`), dangerous goods, item quantity, courier note.
ALTER TABLE quote_snapshots ADD COLUMN declared_value_idr INTEGER NOT NULL DEFAULT 0 CHECK (declared_value_idr >= 0);
ALTER TABLE quote_snapshots ADD COLUMN is_dangerous_goods INTEGER NOT NULL DEFAULT 0 CHECK (is_dangerous_goods IN (0,1));
ALTER TABLE shipments ADD COLUMN item_quantity INTEGER NOT NULL DEFAULT 1 CHECK (item_quantity BETWEEN 1 AND 999);
ALTER TABLE shipments ADD COLUMN delivery_instruction TEXT CHECK (delivery_instruction IS NULL OR length(delivery_instruction) <= 120);

-- Scheduled pickup: one `POST /time` slot per (Mengantar address, date, hour), reused while it is still ahead.
CREATE TABLE pickup_time_slots (
  address_id TEXT NOT NULL,
  slot_date TEXT NOT NULL,
  slot_time TEXT NOT NULL,
  time_id TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (address_id, slot_date, slot_time)
);

-- Pos Indonesia COD eligibility refusal (403 new_seller / insufficient / blocked) seen at create-order; COD Pos is
-- hidden from quotes for 24 h after it, non-COD Pos stays available.
ALTER TABLE tenant_courier_prefs ADD COLUMN cod_blocked_at INTEGER;
ALTER TABLE tenant_courier_prefs ADD COLUMN cod_blocked_status TEXT;
ALTER TABLE tenant_courier_prefs ADD COLUMN cod_delivered_rate INTEGER;

-- Mengantar receiver score (getReceiverScoreByNumberUser), cached 24 h per phone, including 403/429 outcomes.
CREATE TABLE receiver_score_cache (
  phone TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('ok','forbidden','limited')),
  grade TEXT,
  approximate INTEGER NOT NULL DEFAULT 0 CHECK (approximate IN (0,1)),
  average_rate_x10 INTEGER,
  total INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  rts INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL
);

-- Upstream dropshipper master (POST /dropshippers): opt-in per gerai; a reseller sender keeps its Mengantar id.
ALTER TABLE tenant_settings ADD COLUMN mengantar_dropshipper_sync INTEGER NOT NULL DEFAULT 0 CHECK (mengantar_dropshipper_sync IN (0,1));
ALTER TABLE tenant_settings ADD COLUMN mengantar_dropshipper_state TEXT CHECK (mengantar_dropshipper_state IS NULL OR mengantar_dropshipper_state IN ('ok','disabled'));
ALTER TABLE sender_contacts ADD COLUMN mengantar_dropshipper_id TEXT;
ALTER TABLE sender_contacts ADD COLUMN mengantar_dropshipper_key TEXT;
