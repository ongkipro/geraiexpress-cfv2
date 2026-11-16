-- TASK-602 Public API outcome counters per tenant and minute (OBSERVABILITY.md "Is a seller key being misused?",
-- DEC-232). Written by the Worker's Mengantar Public API hook; no key, URL or body; pruned after 2 days.
CREATE TABLE public_api_events (
  tenant_id TEXT NOT NULL,
  minute INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  route TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, minute, outcome, route)
);
CREATE INDEX public_api_events_minute ON public_api_events(minute);
