-- Contact shipment history indexes + rich courier checkpoint descriptions from Mengantar history.
ALTER TABLE shipment_events ADD COLUMN status_text TEXT;

CREATE INDEX IF NOT EXISTS shipments_sender_created ON shipments (sender_contact_id, created_at DESC) WHERE sender_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipments_recipient_created ON shipments (recipient_contact_id, created_at DESC) WHERE recipient_contact_id IS NOT NULL;
