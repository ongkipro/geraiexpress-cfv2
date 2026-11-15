-- TASK-205 seller key rotation fence (ADR-0004 §5, spec 10 §4.3). `key_version` is bumped and `rotation_state` set to
-- `in_flight` before Partner `api-key/regenerate`; an unknown outcome stays fenced until the current key is read back.
-- The previous webhook path token keeps verifying against its own secret for 24 h (spec 01 §2.7 Rotation).
ALTER TABLE mengantar_connections ADD COLUMN rotation_state TEXT NOT NULL DEFAULT 'idle' CHECK (rotation_state IN ('idle','in_flight','unknown'));
ALTER TABLE mengantar_connections ADD COLUMN rotation_started_at INTEGER;
ALTER TABLE mengantar_connections ADD COLUMN previous_webhook_path_token TEXT;
ALTER TABLE mengantar_connections ADD COLUMN encrypted_previous_webhook_secret TEXT;
ALTER TABLE mengantar_connections ADD COLUMN previous_token_expires_at INTEGER;
