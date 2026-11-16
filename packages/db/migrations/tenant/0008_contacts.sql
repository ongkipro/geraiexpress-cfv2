-- TASK-302 contacts (spec 01 §2.2, DEC-212) and media objects (R2 keys `t/<tenant_id>/…`).
CREATE TABLE sender_contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sender_kind TEXT NOT NULL CHECK (sender_kind IN ('walk_in','reseller_dropship')),
  true_name TEXT NOT NULL,
  true_phone TEXT NOT NULL,
  wa_verified_at INTEGER,
  wa_verified_by TEXT,
  wa_verify_method TEXT CHECK (wa_verify_method IN ('operator_confirmed')),
  true_street TEXT,
  true_area_id TEXT,
  true_area_label TEXT,
  true_postal_code TEXT,
  display_brand_name TEXT CHECK (display_brand_name IS NULL OR length(display_brand_name) <= 60),
  display_brand_phone TEXT,
  hide_gerai_branding INTEGER NOT NULL DEFAULT 0 CHECK (hide_gerai_branding IN (0,1)),
  default_mask_preset TEXT,
  deposit_balance_idr INTEGER NOT NULL DEFAULT 0,
  shipments_count INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX sender_contacts_phone ON sender_contacts(true_phone);
CREATE INDEX sender_contacts_name ON sender_contacts(true_name);

CREATE TABLE recipient_contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  linked_sender_id TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  mengantar_area_id TEXT,
  province_name TEXT,
  city_name TEXT,
  district_name TEXT,
  subdistrict_name TEXT,
  postal_code TEXT,
  street_address TEXT NOT NULL,
  address_note TEXT,
  cod_delivered_count INTEGER NOT NULL DEFAULT 0,
  cod_rts_count INTEGER NOT NULL DEFAULT 0,
  risk_version INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX recipient_contacts_phone ON recipient_contacts(phone);
CREATE INDEX recipient_contacts_name ON recipient_contacts(name);

-- R2 objects owned by this gerai (logos, evidence photos, return photos, claim files, signatures).
CREATE TABLE media_objects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('logo','evidence','return_photo','claim','signature')),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  uploaded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
