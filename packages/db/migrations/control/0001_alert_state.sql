-- TASK-110: owner alert de-duplication (OBSERVABILITY.md). One row per bounded alert key.
CREATE TABLE alert_state (
  alert_key TEXT PRIMARY KEY CHECK (length(alert_key) BETWEEN 1 AND 80),
  last_sent_at INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1
);
