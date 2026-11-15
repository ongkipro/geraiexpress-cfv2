## Review

**Verdict: REQUEST_CHANGES**  
**Merge verdict: BLOCK for specification lock.**

Read-only review of working files at `b4252161d88a`; no files edited. The diff tool reports no working-tree changes but cannot inspect committed ranges. Round-2 dispositions therefore compare current specifications directly against the archived inventory. `docs/review/` was used only to recover that inventory; neither review documents nor `prototype/` code supports findings below. No runtime tests or browser gates were executed.

**Path abbreviations:** S01–S12 refer to numbered files in `docs/spec/`; V02–V07 refer to numbered files in `docs/visual/`; ADR numbers refer to their corresponding files in `docs/adr/`.

## Round-2 findings

| # | Finding | Status | Current evidence |
|---:|---|---|---|
| 1 | Commercial estimate versus actual provider cost; subsidy precedence | **PARTIAL** | S02:34,58–59,82–84,124–127 now consistently uses provider net `N` for flows and demonstrates `M=10800`, `N=9600`. However, S02:45–47 and `DECISIONS.md:32` still assign margin-preview control to the assigned rate; subsidy authorization remains in `DECISIONS.md:11` and `PRD.md:61`. See finding 8. |
| 2 | COD fee sourced from incompatible quote passes | **RESOLVED** | S02:61,100–112 freezes the final estimate, requires matching `COD_AMOUNT`, bounds fixed-point iteration, fails unstable quotes, and records post-create drift without replay. |
| 3 | Non-COD `Laba Kas` eligibility and mixed dashboard labels | **RESOLVED** | S02:133–138 and S09:19–22 use the same payment-and-reconciliation predicate. V02:14–16 separates estimated profit and `Laba Kas`. The newly written insured Non-COD value formula has a separate defect: finding 1. |
| 4 | Undefined `V_outlet` and funding split | **RESOLVED** | S02:31,64 restricts launch promos to outlet-funded `V`, with caps before storage. S02:76–80,136–137 and S09:17 use `V`, not an undefined split. |
| 5 | Every transition incorrectly required a receipt | **RESOLVED** | S01:72 limits receipt writes to monetary mutations; S03:34–40 explicitly leaves non-monetary creation/cancellation without receipts. |
| 6 | Sender payout execution and drawer contract missing | **PARTIAL** | S03:50–61 defines eligibility, permissions, cap, partial payouts, idempotency, projection and reversal; S01:82 defines direction/void references; S03:146 supplies signed drawer arithmetic. Owner cash payouts still need an open-shift/source-of-cash constraint: finding 2. |
| 7 | Invalid settings default and missing tenant key | **RESOLVED** | S01:84 declares the tenant primary key and shortens the default below 50 characters. The literal is 39 characters, despite its “41 chars” annotation. Its newly impossible cross-store FK is finding 4. |
| 8 | Dropship receipt identity contradiction | **RESOLVED** | S03:111 requires frozen preset-resolved identity, explicitly excluding outlet identity for Dropship. V04:204–205 applies the same rule to both paper parts. |
| 9 | Inconsistent 58 mm COD charge block | **RESOLVED** | V04:117–136 replaces the complete block and separately shows Rp3,000 counter payment, Rp167,560 courier collection and Rp150,000 sender entitlement. The specimen’s content lines at V04:121–133 are each 32 columns. |
| 10 | Label exemption allowed undersized toggle targets | **RESOLVED** | `design/admin-contract.json:22` uses `labelTarget`. `design/evidence/prototype-gates.md:17–20` defines both dimensions, native-input activation, fallback to the control box, and negative-fixture/mutation evidence. This is specification/evidence verification, not an independent probe execution. |
| 11 | Contradictory gate chronology and unfinished required states | **RESOLVED** | `design/evidence/prototype-gates.md:10–25,42–46` explicitly supersedes the failed attempt and distinguishes closed-popover measurement from screenshot inspection. `TASKS.md:30–32` records the owner-approved state deferral to M3. |
| 12 | Execution queue omitted independent-review gate | **RESOLVED** | `TASKS.md:8–9` requires current-document approval; TASK-006 depends on TASK-003 (`TASKS.md:55–63`); TASK-101 depends on both (`TASKS.md:93`). |
| 13 | Shipment-filter row exceeded box width | **RESOLVED** | V06:12,17: the named filter row is now 102 display columns, matching the outer border. Its table dividers also total 102 columns. |

## Required money and quote checks

For `P=12000`, `N=9600`, `F=5560`, `K=3000`, `G=150000`, `I=NULL`, `S=V=0`:

| Mode | Counter due | Courier collects | Seller credit / debit | Sender payable | Accrued margin |
|---|---:|---:|---:|---:|---:|
| `none` | 15,000 | 0 | debit 9,600 | 0 | 5,400 |
| `buyer_bears_fee` | 3,000 | 167,560 | credit 152,400 | 150,000 | 5,400 |
| `sender_bears_fee` | 3,000 | 162,000 | credit 146,840 | 144,440 | 5,400 |
| `cod_all_in` | 3,000 | 150,000 | credit 134,840 | 132,440 | 5,400 |
| `dfod` | 3,000 | 17,560 | credit 2,400 | 0 | 5,400 |

All S02 §3.4 rows recompute correctly. Every COD row satisfies `seller credit − sender payable = P − N = 2400`.

With fallback `M=10800`, `N=9600`, these flows remain unchanged; actual-cost estimated margin is `5400`, and informational `M−N` is `1200`. The all-in minimum is `G ≥ 18560`.

The fixed-point rule is coherent: for fee-inclusive modes, accept only when the returned fee equals the fee already included in that request’s collection amount. For example, `F0=5500`, `F1=5560`, `F2=5560` accepts the third COD estimate; a changing third result fails. The frozen collection must not be recomputed at dispatch. This is separate from the baseline Non-COD estimate.

## New and residual findings

### 1. P1 — Insured Non-COD `Laba Kas` subtracts insurance incorrectly

**Location:** S02:76,133–137; S01:75–76; S09:43.

Counter collection includes insurance, while the stated debit is `N+I0`. Nevertheless, realized profit is defined as `P − provider_reconciled_cost_idr − I0 + K + S − V`.

With `I=1000`, the counter receives `16000`, the provider debit is `10600`, and margin must remain `5400`. If the reconciled field holds that actual debit, the new formula returns `3400`; if it holds shipping-only `9600`, it returns `4400`.

**Fix:** define whether reconciled cost includes insurance. Use either `counter_due − reconciled_total_debit` or `P − reconciled_shipping_cost + K + S − V`. Add a non-NULL-insurance regression.

### 2. P1 — Owner cash payouts can bypass shift attribution

**Location:** S03:54–59,146; S01:82.

Only Kasir payouts explicitly require an open shift; the owner may pay “always.” Yet every cash payout must reduce a particular shift’s expected drawer cash. An owner payout outside an open shift has no defined drawer/source attribution.

**Fix:** require an open, identified drawer shift for every `tunai` payout and reversal, regardless of role. If owner-funded cash outside the drawer is supported, represent that source separately and exclude it from drawer totals.

### 3. P1 — Moving connection records into DO storage removes webhook tenant resolution

**Location:** S01:8,56; `ARCHITECTURE.md:75`; ADR-0006:35–47.

The cookie-less webhook arrives with only `webhookToken`. Its token and encrypted verification secret now live inside a tenant’s DO, but no control-plane token-to-tenant mapping or authenticated token format is specified. The receiver cannot select the object needed to verify the HMAC; the Queue consumer’s trusted tenant context is consequently undefined.

**Fix:** define an authoritative D1 lookup from opaque token/hash to tenant, or an authenticated token carrying the routing identity. Specify verification through that tenant’s DO and the trusted Queue envelope, including rotation handling.

### 4. P1 — Tenant settings requires an impossible cross-database foreign key

**Location:** S01:7–8,84; `TASKS.md:111–126`.

`tenants` lives in D1, while `tenant_settings` lives in the tenant DO. The latter still declares `tenant_id` as an SQL FK to `tenants.id`. SQLite cannot enforce a foreign key across these separate databases.

**Fix:** retain the tenant primary key but describe the D1 relationship as application-enforced, or provide a local tenant-identity row if a local FK is required. Include this distinction in the two migration tracks.

### 5. P1 — Custom-hostname activation probe cannot pass the pending-host gate

**Location:** S11:41–43,62–67.

Routing rejects every pending hostname before serving tenant content. Activation requires a successful tenant-marker probe on that same hostname **before** changing it from pending to active. No exception exists for `/.well-known/geraiexpress-tenant`; the only exceptions are the DCV paths.

**Fix:** define a narrow pending-host probe endpoint returning a non-PII verification marker after the required Cloudflare status checks. Keep ordinary pending-host requests at neutral 404 and add a lifecycle test.

### 6. P1 — Staging mini-sites have names but no route to the staging Worker

**Location:** S07:103–108,115; S11:15,29.

The zone-wide `*/*` route sends tenant-zone requests to the primary Worker. Staging requires a separate deployment and DO/D1 namespace at `<slug>-stg.gerai.cc`, but no route or dispatcher selects that deployment. Reserving the suffix in S06 prevents tenant-name collisions; it does not route requests to staging.

**Fix:** specify owner-approved exact staging hostname routes or an explicit environment dispatcher. Define staging fallback/CNAME/custom-hostname handling as well, and prove staging hosts cannot reach production bindings.

### 7. P1 — Durable OTP outbox cannot reconstruct the message it must retry

**Location:** S12:38–46; S05:28; `TASKS.md:128–141`.

The outbox retains only an OTP hash reference, and plaintext OTP persistence is forbidden. A sender recovering after a crash cannot reconstruct the OTP required in the subject/body. No recoverable encrypted payload or deterministic regeneration contract is defined. The final retry can also occur after the ten-minute OTP lifetime.

**Fix:** retain a short-lived encrypted OTP/message payload alongside the verification hash, delete it on completion/expiry, and suppress expired retries. Keep plaintext out of logs; explicitly distinguish local simulated-message output from production logging.

### 8. P2 — Pricing corrections have not propagated to the controlling commercial contracts

**Location:** S02:29,34,45–47,124–127; `DECISIONS.md:11,32`; `PRD.md:61`; `TASKS.md:168–171`.

The fallback now displays `Estimasi Laba` using `N`, but DEC-226 and S02 §2.1 still say the assigned rate controls margin preview. DEC-205/PR-11 retain a subsidy authorization exception while S02 forbids launch subsidies. TASK-107 also retains the unqualified `P−M` identity rather than canonical `P−N`.

**Fix:** align the decision, requirement and test contract: distinguish any commercial-reference preview from actual-cost estimated profit, explicitly retire the launch subsidy exception, and qualify `P−M` with `M=N`.

### 9. P2 — Superseded D1 ownership remains in operative instructions

**Location:** S03:23; S05:37; ADR-0004:16; ADR-0001:18.

Recipient counters are still called local D1 data; seller keys/webhook secrets and tenant NPWP are still instructed to persist in D1; slug collision handling still names a D1 constraint. These conflict with S01 §0. ADR-0001’s decision body also retains the unsplit storage description despite its amendment header.

**Fix:** update these owning statements to tenant-DO storage/RPC and local SQLite uniqueness. Distinguish platform NPWP, which remains in D1, from tenant NPWP. Do not rely solely on ADR-0006’s blanket supersession sentence.

### 10. P2 — Bulk-payment linkage is required but absent from the canonical schema

**Location:** S03:88–97; S01:8,82.

Batch payment requires a `counter_receipts` row per INV sharing `bulk_batch_id`, but that column is absent from the receipt definition. S01 also points to nonexistent §2.5 for bulk tables; their definitions exist only in S03.

**Fix:** add the nullable bulk-batch linkage to the canonical receipt schema and put the bulk table definitions in S01, or correct the ownership/reference explicitly. State atomic batch-payment behavior and derived per-INV idempotency keys.

### 11. P2 — Newly allocated infrastructure labels are not reserved

**Location:** S11:15,20,27–29; S06:20.

The infrastructure allocates `cname.gerai.cc` and `fallback.gerai.cc`, but the slug denylist includes neither `cname` nor `fallback`. Both satisfy the normal tenant-slug syntax.

**Fix:** reserve both labels and test that approval/onboarding cannot allocate them as tenant mini-sites.

### 12. P2 — Cross-tenant COD-risk monitoring lost its defined data path

**Location:** S05:21; S01:8,64; ADR-0006:38–39,53–54; V07:155.

Recipient phone delivery/RTS history is now isolated in tenant objects. The D1 shipment index contains only shipment identity/status, and the specified pushed read model is daily tenant counters. Neither defines how Super Admin’s cross-tenant phone-risk history is located.

**Fix:** specify an audited cross-tenant risk lookup/read model, including its privacy-safe lookup key and how matching tenant detail is read through authorized RPC. Do not silently restore a shared D1 contact table.

### 13. P2 — Automatic staging deploy conflicts with approval per action

**Location:** `docs/WORKFLOW.md:95–100`; S07:103–106; `TASKS.md:174–185`.

WORKFLOW requires approval per `wrangler deploy`, without limiting that rule to production. S07 deploys staging automatically on `main`; TASK-108 requires approval only for its first resource setup/run.

**Fix:** either approval-protect every staging deployment or explicitly record an owner-approved standing authorization for staging, retaining per-action production approval.

### 14. P2 — Host/cookie task is assigned the wrong workflow risk class

**Location:** `docs/WORKFLOW.md:29–31`; `TASKS.md:99–109`.

The workflow classifies host routing and cookies as R4 security boundaries; TASK-102, whose subject is precisely host classification and host-locked cookies, is R3.

**Fix:** classify TASK-102 as R4 and apply the R4 verification requirements to its acceptance contract.

### 15. P2 — ROADMAP exit gates omit newly mandatory scope

**Location:** `ROADMAP.md:7–8`; `TASKS.md:8–9,55–63,199–210`; S12:59–71.

The M0 review gate still names only Sol’s DEC-220..226 additions rather than the current-document review covering DEC-227..229. More materially, M1’s exit gate omits the email deliverability gate that S12 explicitly requires at M1 exit and TASK-110 makes mandatory before production signup.

**Fix:** point M0 to current-head TASK-006 approval, and add TASK-110’s deliverability proof to M1’s exit gate. README’s ADR/spec/decision index ranges otherwise match the current files.