## Review

**Verdict: REQUEST_CHANGES**  
**Merge verdict: BLOCK for specification lock.**

Reviewed current files at **`487826c6b103`**, read-only. The working tree is clean. Committed-range inspection is unavailable; this review compares the current specifications directly with the round-3 inventory. `docs/review/` supplied that inventory only; neither review documents nor `prototype/` code supports findings below. No runtime tests were run.

**Abbreviations:** S01–S12 denote the correspondingly numbered files in `docs/spec/`; ADR numbers denote their files in `docs/adr/`.

### Round-3 status

| # | Round-3 finding | Status | Current evidence |
|---:|---|---|---|
| 1 | Insured Non-COD `Laba Kas` | **RESOLVED** | S01:77 defines reconciled cost as total shipping-plus-insurance debit. S02:133–138 uses `counter_due_idr − provider_reconciled_cost_idr`; `16000 − 10600 = 5400`. `TASKS.md:175–177` requires the insured regression. |
| 2 | Owner cash payouts bypass shift attribution | **RESOLVED** | S03:54–60 requires an open shift for every `tunai` payout and reversal, regardless of role; transfers do not affect the drawer. |
| 3 | Webhook tenant resolution lost after storage split | **RESOLVED** | S01:98–100 defines token-hash → D1 tenant → DO verification → Queue carrying the D1-derived tenant, plus a 24-hour rotation overlap. `ARCHITECTURE.md:75` agrees. A separate downstream event-retention gap is N1 below. |
| 4 | Impossible cross-store settings FK | **RESOLVED** | S01:84 explicitly makes the D1 tenant relationship application-enforced while retaining the DO-local tenant primary key. |
| 5 | Pending-host activation deadlock | **RESOLVED** | S11:40–42 permits the non-PII HMAC probe on pending hosts; S11:71 requires Cloudflare hostname/TLS activation and a matching probe before local activation. Other pending-host paths remain 404. |
| 6 | No staging mini-site route | **RESOLVED** | S11:29–32 routes `*-stg.gerai.cc/*` to the staging Worker and assigns custom-domain tests to a separate test zone. S07:115 names the same route and separate data namespace. |
| 7 | OTP outbox cannot reconstruct retries | **RESOLVED** | S12:38–50 specifies encrypted recipient/payload storage, recoverable OTP/link variables, cleanup on completion/failure/expiry, bounded retries and expiry suppression. Local simulated output is distinguished from production logs. |
| 8 | Commercial decisions retain obsolete margin/subsidy rules | **RESOLVED** | S02:44–47 and `DECISIONS.md:32` restrict the fallback assigned rate to commercial reference/guard use. `DECISIONS.md:11` and `PRD.md:61` retire launch subsidies. `TASKS.md:174–177` uses `P−N` and tests the `M≠N` fallback. |
| 9 | Superseded D1 ownership remains operative | **RESOLVED** | S03:23 puts recipient counters in the tenant object; S05:37 distinguishes tenant-DO credentials/NPWP from platform-D1 NPWP. ADR-0004:16 uses local SQLite uniqueness; ADR-0001:18 and ADR-0006:35–49 describe the split consistently. |
| 10 | Bulk-payment linkage/schema missing | **RESOLVED** | S01:82 adds nullable `bulk_batch_id`; S01:86–90 defines both bulk tables, atomic payment and per-INV derived idempotency keys. S03:96 points to the now-existing §2.5. |
| 11 | Infrastructure labels not reserved | **RESOLVED** | S06:19 reserves both `cname` and `fallback`, as well as the staging suffix. |
| 12 | Cross-tenant COD-risk data path missing | **RESOLVED** | S01:94 defines the HMAC-phone D1 index, tenant outbox updates and audited Super Admin lookup/detail RPC. S05:21 and ADR-0006:38–39 agree. Retry correctness needs the additional clarification in N2. |
| 13 | Automatic staging deploy violates per-action approval | **RESOLVED** | S07:103–106 and `TASKS.md:185–189` require approval of each protected staging-environment run. `docs/WORKFLOW.md:95–97` explicitly includes staging deployment approval. |
| 14 | Host/cookie task incorrectly classified R3 | **RESOLVED** | `TASKS.md:101–113` classifies TASK-102 as R4 and requires normalization tests, a weakening mutation and an archived independent R4 review. |
| 15 | ROADMAP omits current review/email gates | **RESOLVED** | `ROADMAP.md:7–8` requires current-head TASK-006 approval and includes TASK-110 deliverability proof at M1 exit, matching S12:66–77. |

### Correct — money and numeric checks

S02:77–85,117–127,136 recompute correctly. For `P=12000`, `N=9600`, `F=5560`, `K=3000`, `G=150000`, `S=V=0`:

| Mode | Counter / courier, `I=NULL` | Seller credit / sender payable, `I=NULL` | Counter / courier, `I=1000` | Seller credit / sender payable, `I=1000` |
|---|---:|---:|---:|---:|
| `none` | 15000 / 0 | debit 9600 / 0 | 16000 / 0 | debit 10600 / 0 |
| `buyer_bears_fee` | 3000 / 167560 | 152400 / 150000 | 3000 / 168560 | 152400 / 150000 |
| `sender_bears_fee` | 3000 / 162000 | 146840 / 144440 | 3000 / 163000 | 146840 / 144440 |
| `cod_all_in` | 3000 / 150000 | 134840 / 132440 | 3000 / 150000 | 133840 / 131440 |
| `dfod` | 3000 / 17560 | 2400 / 0 | 3000 / 18560 | 2400 / 0 |

- Every COD row preserves `seller credit − sender payable = 2400`; every accrued margin remains **5400**.
- Insured Non-COD realized profit is **`16000 − 10600 = 5400`**.
- All-in minimum `G` is **18560** uninsured and **19560** with `I=1000`.
- Fallback assigned `1000 bps` yields `M=10800`; `M−N=1200`, without changing flows or profit.
- The `9599` regression correctly produces observed `2000 bps` while preserving cost **9599**, not 9600.
- The settings default is correctly annotated **39 characters** (S01:84).
- Email retry delays total **7 minutes 30 seconds** after an immediate first attempt; the explicit expiry check also covers delayed execution (S12:45–46).

### New findings

#### N1. P1 — ID-only webhook Queue message has no specified durable event source

**Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:98–100`; `ARCHITECTURE.md:75`.

The new ingest contract verifies the raw request, then queues only:

```text
{ tenant_id, event_id, received_at }
```

The consumer must subsequently apply the event, but no durable inbox write, retained event payload or resolvable payload reference is specified. `event_id` alone supplies neither the shipment identity nor the status/body to apply. A DO restart between verification and consumption therefore leaves no specified source from which the consumer can reconstruct the acknowledged webhook.

**Concrete fix:** have `verifyWebhook` durably insert the verified event body into a tenant-local inbox keyed by event ID before acknowledging acceptance. Queue that stable inbox reference, and define idempotent application/retention. Alternatively, carry the verified payload in the trusted Queue envelope. Require a restart-between-ingest-and-consumption test and duplicate-delivery test.

#### N2. P2 — Retried risk-index increments can double-count terminal outcomes

**Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:94`; `docs/adr/ADR-0006-storage-split-d1-control-plane-do-tenant-data.md:47–49`.

The new risk model pushes **increments** through a tenant outbox. The documented outbox pattern retries until acknowledged, but the risk contract provides no event deduplication key or versioned update rule.

Reproduction at the contract level: D1 commits `delivered_count += 1`; the acknowledgement is lost; the same outbox item retries and increments again. One delivery becomes two in the Super Admin risk history.

**Concrete fix:** specify either an event ID deduplicated atomically with the D1 increment, or versioned absolute-count upserts keyed by `(phone_hmac, tenant_id)`. Require an acknowledgement-loss retry test proving counts remain unchanged.

### Final disposition

All **15 original round-3 findings are resolved**. The replacement contracts introduce one remaining **P1 specification gap** (N1) and one **P2 retry-correctness issue** (N2). No P0 found. **Re-review N1 before approving the M0 specification lock.**