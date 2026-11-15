# Round 5 — M0 Specification Lock

**Verdict: REQUEST_CHANGES**

## Review

### Status

| Finding | Status | Evidence |
|---|---|---|
| **N1 — P1: Queue reference lacks a durable event source** | **RESOLVED** | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:8,99–100` places `webhook_inbox` in tenant SQLite, persists verified bodies before enqueue/acknowledgement, defines atomic idempotent application, recovery re-enqueue, retention, and failure tests. `ARCHITECTURE.md:75` agrees. |
| **N2 — P2: Retried risk-index increments double-count** | **RESOLVED** | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:94` requires absolute counts, a greater-version acceptance guard, and a lost-acknowledgement retry test. `docs/adr/ADR-0006-storage-split-d1-control-plane-do-tenant-data.md:50–51,56–58` applies versioned absolute updates to all DO→D1 projections, including daily statistics. |

### Correct — consistency checks

- **Finance sync / ADR-0004:** The fixes retain tenant-local serialization and do not make webhook status changes authoritative for financial settlement. Invoice reconciliation remains separately serialized and invoice-derived (`docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:41–42,66`; `docs/adr/ADR-0004-durable-object-per-gerai-vault.md:18`).
- **Test layers:** The specified restart, duplicate-delivery, enqueue-failure and outbox-retry tests fit Worker/DO/D1 integration; cross-tenant webhook verification remains merge-blocking isolation coverage (`docs/spec/01-DATA-MODEL-AND-LEDGER.md:94,100`; `docs/spec/07-DEVELOPMENT-GUIDE-AND-WORKFLOW.md:91–92`).
- **Terminal protection:** Apply explicitly preserves terminal states (`docs/spec/01-DATA-MODEL-AND-LEDGER.md:100,133`), but the separate provider-timestamp ordering requirement has the metadata gap below.

### New finding

**N3 — P1: Durable webhook records omit the timestamp required for transition ordering.**

- **Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:99–100`, conflicting with `:133`.
- **Evidence:** Ingest receives headers, but the defined inbox persists only `event_key`, `received_at`, `raw_body`, state and processing metadata. The Queue carries only `{ tenant_id, event_key }`; application reads the stored body. Section 3 nevertheless requires transitions to compare provider **`x-timestamp`**, which is a header—not `received_at` and not recoverable from its hash.
- **Repro:** Persist two valid events with different provider timestamps, restart, then consume them in reverse order. The durable contract supplies neither timestamp to `applyWebhook`, so it cannot perform the prescribed comparison. The unconditional terminal guard can still protect terminal states, but does not supply ordering for nonterminal transitions.
- **Smallest fix:** Persist the verified provider timestamp in `webhook_inbox` during ingest and require apply to use it for §3 ordering. Add an integration test for reversed delivery after restart, covering stale nonterminal transitions and terminal non-regression.

### Merge verdict: BLOCK

N1 and N2 are resolved, but **one P1 remains**. The M0 specification lock requires the small N3 contract correction before approval.

*Scope: read-only inspection of the named files at HEAD `96dc81b8646e`; no evidence taken from `docs/review/` or `prototype/`. No committed diff artifact was available, so this verifies the current contracts rather than independently auditing the commit range. No runtime tests were run for this specification review.*