-- TASK-301 in-app notifications (visual 07 `/notifikasi`). One row per event for the gerai; read state per user.
-- `audience` keeps owner-only items (money, discount, Mengantar balance) away from Kasir lists.
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('all','owner')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX notifications_created ON notifications(created_at);

CREATE TABLE notification_reads (
  notification_id TEXT NOT NULL REFERENCES notifications(id),
  user_id TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);
