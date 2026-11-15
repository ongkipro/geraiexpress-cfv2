## Review

**Verdict: REQUEST_CHANGES**  
**Merge verdict: BLOCK for specification lock.**

Read-only review of current files at `7fbad94`; no files edited. The available diff tool reports no working-tree changes and cannot inspect committed ranges. Therefore, this review verifies current specifications against the archived finding inventory, not the requested Git diff/stat.

`docs/review/` was used only to recover round-1 findings; neither it nor `prototype/` code supports the findings below. No runtime tests or browser gates were executed.

### Evidence key

Paths below use these abbreviations:

- **S01–S05, S08–S10:** corresponding numbered documents under `docs/spec/`.
- **V02, V04–V08:** corresponding numbered documents under `docs/visual/`.
- **R01–R03:** corresponding numbered documents under `docs/research/`.

## Round-1 finding disposition

| # | Round-1 finding | Status | Current evidence |
|---:|---|---|---|
| 1 | Sender entitlement conflated with seller settlement | **RESOLVED** | S01:67 separately defines expected/reconciled provider credit and sender payable/paid. S02:74–108 separates the flows; S09:41 reconciles provider credit only. |
| 2 | Universal profit formula and premature realization | **PARTIAL** | Per-mode accrued profit and counter-payment gating now exist, S02:113–117 and S09:17–23. Non-COD reconciliation eligibility still disagrees, and normative dashboard labels remain mixed; finding 3. |
| 3 | Schema cannot represent three COD fee modes | **RESOLVED** | Five-value canonical enum in S01:60, S02:67–70 and S08:47; all three COD Barang choices appear in V05:77. |
| 4 | DFOD arithmetic, declared value and negative all-in payout | **PARTIAL** | DFOD flow, separate `D`/`G`, service-fee rules and positive-payable all-in guard are present, S02:64–65,80,87–98. The estimate/create fee mapping remains internally inconsistent; finding 2. |
| 5 | Incomplete counter-payment transition contract | **PARTIAL** | State transitions, void authority, repayment and payment-shift attribution exist, S03:31–48; receipt fields exist, S01:72. Scan warning/block distinction is consistent, S03:29 and S04:16. Receipt-writing requirements still contradict the transition table; finding 5. |
| 6 | Assigned discounts lack Scheme-1 settlement mechanism | **RESOLVED** | DEC-226, `DECISIONS.md:32`, and S02:36–47 explicitly establish provider-enforced target/internal-estimate fallback, with no platform revenue from the gap. This agrees with ADR-0003:9–20 and S10:114–121. |
| 7 | Settings and manifest persistence incomplete | **PARTIAL** | Concrete definitions added in S01:72–74; handover requirements propagated to S04:18; settings controls appear in V08:160–161. `tenant_settings` still omits its tenant key and has an invalid default; finding 7. |
| 8 | Financial/printing API and MCP scope incomplete | **RESOLVED** | S08:47,53–55 adds fee mode, label formats, bulk limit and POS-only payment mutation. Bearer/session separation remains explicit in S05:36–38. Public MCP draft creation is acknowledged in `ARCHITECTURE.md:76`. |
| 9 | Service fee simultaneously enabled and disabled | **RESOLVED** | DEC-225 explicitly supersedes zero-at-launch; S02:92–93, V08:161 and R01:66,128 agree. The fee is separate from publish tariff. |
| 10 | Five-kilogram Cargo recommendation missing | **RESOLVED** | DEC-225, `PRD.md:52`, S01:74, V05:48 and R01:125 now use 5,000 g. Courier minimums and launch Non-COD restriction remain separate. |
| 11 | Superseded wireframe labels/actions/formats | **RESOLVED** | Named specimens updated in V02:16,48,70–71; V07:120; V06:14. Weekly chart buckets propagated to `PRD.md:76`. |
| 12 | Dropship examples expose outlet identity | **PARTIAL** | V04:63–64,168–192 now use reseller identity. S03:56 still requires outlet identity on every customer receipt; finding 8. |
| 13 | Print examples misstate payment/insurance | **PARTIAL** | Neutral Non-COD banner and unknown insurance fixed, V04:43,190,248; 100 mm COD specimen is consistent, V04:170–171. The inherited 58 mm COD variation remains inconsistent; finding 9. |
| 14 | Unverified imported item-value limit | **RESOLVED** | S02:89–91 distinguishes competitor observation from provider/service limits and defers verification to M2. |
| 15 | Double flooring loses exact provider cost | **RESOLVED** | S02:34 preserves exact net `9599`; regression required in `TASKS.md:154–157`. A separate subsidy-precedence contradiction remains; finding 1. |
| 16 | Research conclusions exceed observations | **RESOLVED** | R02:16 says 25 routes; R02:119 scopes the return-screen inference; R03:28 separates role 3 export behavior from role 12; R02:112 and R03:37 identify planned mitigations. |
| 17 | Comfort contract permits undersized controls | **PARTIAL** | Inputs now require 44 px and mobile targets fail below 44, `design/admin-contract.json:9,21`. The new label exemption is insufficiently constrained; finding 10. |
| 18 | Stale workflow metadata and document ranges | **RESOLVED** | `STATUS.md:3–16` records current ranges and pending review; `ROADMAP.md:7,10` and `ARCHITECTURE.md:105` include the expanded scope. Remaining gate/evidence inconsistencies are findings 11–12. |
| 19 | Complete phone-like examples without synthetic policy | **RESOLVED** | `AGENTS.md:41–45` establishes synthetic/redacted examples. Previously cited phones are redacted in V04:47,53,64; V05:114; V06:46,56,58. No complete Indonesian phone number or confirmed customer PII was identified in the reviewed documentation. |

## Arithmetic and naming checks

For S02 §3.4, with `P=12000`, provider net `9600`, `F=5560`, `K=3000`, `I=NULL`, `S=V=0`:

| Mode | Counter due | Courier collection | Seller credit / debit | Sender payable | Accrued margin |
|---|---:|---:|---:|---:|---:|
| `none` | 15,000 | 0 | debit 9,600 | 0 | 5,400 |
| `buyer_bears_fee` | 3,000 | 167,560 | credit 152,400 | 150,000 | 5,400 |
| `sender_bears_fee` | 3,000 | 162,000 | credit 146,840 | 144,440 | 5,400 |
| `cod_all_in` | 3,000 | 150,000 | credit 134,840 | 132,440 | 5,400 |
| `dfod` | 3,000 | 17,560 | credit 2,400 | 0 | 5,400 |

Every supplied example recomputes correctly. Every COD credit minus sender payable equals `2400` **for this fixture, where `M` equals provider net**.

The all-in guard requires a payable of at least Rp1,000, not merely a nonnegative payable: these inputs require `G ≥ 18560`. Service fee `S` is explicitly prohibited on COD Barang modes.

No occurrences of `item_value_idr`, `cod_fee_bearer`, `estimated_cod_net_payout_idr`, `reconciled_cod_net_payout_idr` or `cod_collection_idr` were found outside the excluded review material.

The main 58 mm specimen fits within 32 columns; all six payment variants are exactly 32 characters. Short left-aligned rows are not right-padded to 32. V04’s three 100 mm boxes have consistent 64-character outer widths. A remaining wireframe-width defect is finding 13.

## New and remaining findings

### 1. P1 — Assigned estimate and actual provider cost still produce contradictory arithmetic

**Location:** `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:29,34,43–47,77,108`

With `P=12000`, provider net `9600`, and assigned discount `1000 bps`, the fallback estimate gives `M=10800`. Actual expected buyer-bears seller credit remains `152400`, not the stated `G+P−M = 151200`. Credit minus sender payable is `2400`, not `P−M = 1200`.

Separately, `allow_subsidy=true`, assigned `2500 bps`, observed `2000 bps` gives cost `9000` under the table but `9600` under the unconditional `assigned >= observed` precedence rule.

**Concrete fix:** name provider net separately from commercial estimate throughout the flow table; qualify the spread identity with `M = provider_net_shipping_idr`. Define the subsidy branch explicitly instead of allowing the precedence paragraph to override it.

### 2. P1 — The canonical COD fee comes from two different quote passes

**Location:** `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:60,97–98`

`F` is defined as the **pass-2** estimate fee, but dispatch mapping obtains `F` in pass 1 and uses it to construct pass-2/create-order collection. The passes use different collection amounts, particularly for all-in and buyer-bears modes. The contract does not say what happens if the second estimate returns a different integer fee.

**Concrete fix:** specify exact per-mode estimate inputs, which response supplies the frozen fee, and the reconciliation/re-quote rule when pass-2 fee or debit differs. Create-order must use the validated final quote, not an ambiguously first- or second-pass `F`.

### 3. P1 — Non-COD `Laba Kas` has inconsistent reconciliation prerequisites

**Location:** `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:115–117`; `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:19–21`; `docs/visual/02-WIREFRAMES-COUNTER-AND-ADMIN.md:14–16`

S02 permits paid Non-COD margin to count as `Laba Kas` without provider reconciliation. S09 requires recomputation using `provider_reconciled_cost_idr`, which remains `NULL` until synchronization. These yield different eligibility/results before synchronization.

The normative dashboard still combines `Sync … + Est` beneath `LABA BERSIH GERAI`, contrary to the newly separated labels.

**Concrete fix:** give both specs one eligibility predicate requiring the applicable reconciled provider amount. Propagate separate `Estimasi Laba` and `Laba Kas` labels into the dashboard instead of summing them under an unqualified profit KPI.

### 4. P2 — Profit formulas reference an undefined funding component

**Location:** `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:63,74–80`; `docs/spec/01-DATA-MODEL-AND-LEDGER.md:60,67`; `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:17`

`V` supports outlet- or platform-funded promos, but every new margin formula uses undefined `V_outlet`. Neither the symbol table nor persisted quote/shipment fields records that split. `promo_discount_idr` alone cannot distinguish an outlet expense from a platform-funded receivable.

**Concrete fix:** define and persist the funding split and associated settlement treatment, or explicitly restrict launch promos to outlet-funded discounts and use `V` consistently. Also state that the applied discount is capped before storing the per-mode counter due.

### 5. P2 — “Every transition writes a receipt” contradicts the payment state machine

**Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:64,72`; `docs/spec/03-COUNTER-POS-PRINTING-AND-SHIFT.md:35–40`

S01 requires a receipt for every transition. S03 explicitly creates no receipt for initial payment states or unpaid/not-required cancellation, and the receipt event enum cannot represent those events.

**Concrete fix:** change the requirement to “every monetary payment/payout mutation appends a receipt,” leaving creation/cancellation in the shipment audit/event stream; alternatively add the missing receipt event types.

### 6. P1 — Newly introduced sender payouts lack an execution and drawer contract

**Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:67,72`; `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:82–86`; `docs/spec/03-COUNTER-POS-PRINTING-AND-SHIFT.md:31–48,92–93`

The schema introduces `sender_cod_payout` and `sender_cod_paid_idr`, but specifies no payout permissions, eligibility, amount cap, partial/repeated-payment behavior, reversal, or projection update. The shift contract lists payment inflows and voids but does not specify the cash-out sign/treatment of this new event.

**Concrete fix:** add a short POS-only payout contract: authorized roles, payable/remaining-amount validation, idempotency, atomic receipt/ledger/projection updates, and payout-shift attribution. Explicitly subtract cash payouts when calculating expected drawer cash.

### 7. P2 — New tenant settings have an invalid default and no declared tenant key

**Location:** `docs/spec/01-DATA-MODEL-AND-LEDGER.md:74`

The default remark, `Rekam video saat membuka paket untuk klaim kerusakan`, is **52 characters**, exceeding its own 50-character limit. The table also omits `tenant_id` despite being defined as one row per tenant.

**Concrete fix:** shorten the default to at most 50 characters and explicitly define `tenant_id` as the tenant-scoped primary/foreign key.

### 8. P1 — Receipt identity rules still contradict Dropship masking

**Location:** `docs/spec/03-COUNTER-POS-PRINTING-AND-SHIFT.md:56`; `docs/visual/04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md:191–192`

S03 requires frozen **outlet name and WhatsApp** on the customer receipt without a preset exception. V04 explicitly forbids outlet identity on both Dropship parts, including the 58 mm receipt.

**Concrete fix:** make S03 require the frozen **preset-resolved presentation identity**: reseller brand/contact for Dropship, outlet identity only where allowed.

### 9. P1 — The 58 mm COD variation retains incompatible Non-COD charges

**Location:** `docs/visual/04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md:75–82,110–123`

The variation replaces the Non-COD banner and “cash lines,” but leaves the base receipt’s Rp24,000 shipping, Rp3,000 packing and Rp27,000 total. Its inserted COD block instead uses shipping-plus-COD-fee Rp17,560 and collection Rp167,560—the `P=12000` fixture. It also fails to specify the separate Rp3,000 counter payment.

**Concrete fix:** replace the complete receipt charge/payment block, not merely cash lines, or show one complete COD specimen using the S02 fixture and preserving the counter-paid/unpaid line.

### 10. P2 — Label-based touch-target exemption is a loophole as written

**Location:** `design/admin-contract.json:21–22`; `design/evidence/prototype-gates.md:12–15`

Any switch/checkbox beneath any `label` is exempted from the control’s `minSide` check. The replacement checks only label **height**, not width or actual activation association. A tall narrow label, or a label wrapping a non-labelable ARIA widget without forwarding activation, can pass.

**Concrete fix:** check the effective label target’s minimum width **and** height, and require verified association/activation. Keep the control check when the label is not an effective activation target. A genuinely clickable 60 px row is valid; DOM ancestry alone does not prove that.

### 11. P2 — Gate evidence contains conflicting results and unfinished required states

**Location:** `design/evidence/prototype-gates.md:8,10–16,33–40`; `TASKS.md:19,28–34,46–51`

The evidence first records a successful TASK-005 rerun, then ends with an unqualified “could not run / NOT CHECKED” section for the same palette change and an instruction to rerun. It also explicitly says loading/empty/error states were not built, although TASK-001’s visual contract requires them.

**Concrete fix:** mark the failed attempt as superseded with clear chronology. Complete the required states or record an explicit owner-approved deferral and adjust TASK-001’s completion scope. Keep closed-popover geometry evidence distinct from open-state screenshot inspection.

### 12. P2 — Execution queue omits the pending review gate

**Location:** `STATUS.md:4,24–25`; `TASKS.md:8–9,76–77`; `ROADMAP.md:7`

STATUS and ROADMAP require round-2 approval before M1. TASKS’ gate and TASK-101 dependency require only owner sign-off, which is already recorded. The execution queue therefore lacks a still-pending prerequisite required by the workflow authority.

**Concrete fix:** add independent-review approval to the TASKS gate and TASK-101 prerequisites. Owner sign-off may remain recorded; it must not substitute for the pending review gate.

### 13. P3 — One modified shipment-filter row still exceeds its box width

**Location:** `docs/visual/06-REMAINING-MENUS-WIREFRAMES.md:12,17`

The outer box is 102 columns wide. The filter row is 103 columns wide—101 characters between its borders—and contains no wide emoji that would explain the discrepancy.

**Concrete fix:** remove one interior character/space or shorten the print-filter label, then check every border and divider using display-column width rather than raw string length.