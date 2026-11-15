# Round 6 — M0 Specification Lock

**Verdict: REQUEST_CHANGES**

## Status

| Item | Status | Evidence |
|---|---|---|
| N3 — Persist webhook ordering timestamp across restart | **RESOLVED** | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:99` persists verified `provider_timestamp` alongside the body. Line **100** requires `applyWebhook` to read it, apply transitions and mark the inbox row atomically; it also specifies reverse-order consumption after restart and history-only handling of stale events. Lines **73, 133** define the shipment watermark and terminal protection. |
| Webhook/polling ordering consistency | **PARTIAL** | The shared watermark now includes polling (`01:73`), but its timestamp units conflict with the webhook representation; see N4 below. |
| M0 specification lock | **OPEN** | One P1 remains. |

## New finding

### N4 — P1: Shared ordering watermark mixes seconds and milliseconds

**Evidence:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:13` defines stored timestamps as UTC epoch **milliseconds**. Line **73** introduces `last_provider_event_at`, including polling event dates, without overriding that convention. Line **99** explicitly stores `webhook_inbox.provider_timestamp` as integer **seconds**. Lines **100, 133** require comparison against the shipment watermark but specify no conversion.

**Failure case:** A poll stores an event at `1800000000000` milliseconds. A newer webhook carries `1800000001` seconds. The specified direct comparison classifies that newer webhook as stale, suppressing its status transition. Thus durable timestamp persistence fixes N3, but does not yet establish a consistent cross-source ordering contract.

**Smallest fix:** Keep the verified header value in seconds for signature/audit purposes; explicitly normalize it to epoch milliseconds before comparison and watermark storage. Normalize polling event dates to the same unit. Specify that both update paths use the same stale-event and terminal-state guards. Add poll→webhook and webhook→poll ordering cases alongside the reverse-order restart test.

## Polling cross-check

- `ARCHITECTURE.md:38,63` retains the **hourly `GET /order` status-polling floor**, authoritative when `webhook_state != 'active'`.
- Contrary to the task’s reference, `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:63–71` specifies financial-sync cadence, pagination and pending rescans, **not** that hourly status floor.
- `docs/spec/01-DATA-MODEL-AND-LEDGER.md:133` expressly protects against out-of-order **webhooks**; the shared polling guard should be made explicit when fixing N4.

**Merge verdict: BLOCK** pending N4.

*Scope: read-only review of current HEAD files. No committed-range diff artifact was supplied, so no claim is made that the latest commit’s complete diff was reviewed. No `docs/review/` or `prototype/` evidence was used; no tests were executed.*